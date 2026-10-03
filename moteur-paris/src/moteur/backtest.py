"""Backtest chronologique et tournoi de modèles (cahier des charges, section 7).

Pour chaque championnat :
1. le modèle est réajusté chaque semaine avec les seuls matchs déjà joués (walk-forward) ;
2. les 2 dernières saisons forment le coffre-fort : elles ne servent jamais à choisir les réglages ;
3. les réglages (ξ, poids du modèle face à Pinnacle) sont choisis sur la log-loss, jamais sur le
   profit, ce qui évite de « trouver » par hasard une variante gagnante ;
4. une famille de marchés (1X2, plus/moins, handicap) n'est validée que si elle gagne à la fois
   sur la période de développement et dans le coffre-fort, avec une CLV positive quand on la connaît.
"""

import json
import logging
import math
import os
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from .calcul import arrondi_naturel
from .donnees.football_data import LIGUES
from .journal import cote_cloture_juste
from .marches import Selection, fraction_gagnee, gain_perte, kelly_wl
from .modeles.grille import grille_depuis_cotes
from .modeles.ligue import ParamsLigue, ajuster_ligue

log = logging.getLogger(__name__)

SUFFIXES = ("1", "x", "2", "plus", "moins", "ah1", "ah2")
FAMILLE_SUFFIXE = {"1": "1x2", "x": "1x2", "2": "1x2", "plus": "total", "moins": "total", "ah1": "ah", "ah2": "ah"}
GRILLE_XI = (0.001, 0.0019, 0.004)
GRILLE_POIDS = (0.0, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0)
GRILLE_BUTS = (1.0,)  # part des buts face aux tirs cadrés (1 = buts seuls)
SAISONS_COFFRE = 2
SAISONS_CHAUFFE = 2
PARIS_MIN_COFFRE = 30  # par championnat
PARIS_MIN_GLOBAL = 50  # tous championnats réunis, par famille de marchés


def _selection(suffixe: str, ah_ligne) -> Selection | None:
    fixes = {"1": Selection("1x2", "1"), "x": Selection("1x2", "X"), "2": Selection("1x2", "2"),
             "plus": Selection("total", "plus", 2.5), "moins": Selection("total", "moins", 2.5)}
    if suffixe in fixes:
        return fixes[suffixe]
    if ah_ligne is None or pd.isna(ah_ligne) or abs(ah_ligne * 4 - round(ah_ligne * 4)) > 1e-9:
        return None
    return Selection("ah", "1", float(ah_ligne)) if suffixe == "ah1" else Selection("ah", "2", -float(ah_ligne))


def _cote(ligne: pd.Series, col: str) -> float | None:
    v = ligne.get(col)
    return float(v) if v is not None and pd.notna(v) and float(v) > 1 else None


def preparer_ligue(df: pd.DataFrame) -> pd.DataFrame:
    """Colonnes indépendantes du modèle : référence, règlement, prix, clôture. Calculé une fois."""
    lignes = []
    for idx, l in df.iterrows():
        ref_1x2 = [_cote(l, f"ref_{s}") for s in ("1", "x", "2")]
        ref_tot = [_cote(l, "ref_plus"), _cote(l, "ref_moins")]
        source = "pinnacle"
        if not all(ref_1x2):
            ref_1x2 = [_cote(l, f"moy_{s}") for s in ("1", "x", "2")]
            ref_tot = [_cote(l, "moy_plus"), _cote(l, "moy_moins")]
            source = "moyenne"
        g_ref = grille_depuis_cotes(tuple(ref_1x2) if all(ref_1x2) else None,
                                    tuple(ref_tot) if all(ref_tot) else None)
        sortie = {"idx": idx, "ref_source": source if g_ref is not None else None}
        for s in SUFFIXES:
            sel = _selection(s, l.get("ah_ligne"))
            if sel is None:
                continue
            if g_ref is not None:
                sortie[f"Wr_{s}"], sortie[f"Lr_{s}"] = gain_perte(g_ref, sel)
            sortie[f"g_{s}"] = fraction_gagnee(sel, int(l["bd"]), int(l["be"]))
            sortie[f"cc_{s}"] = cote_cloture_juste(l, sel)
            for prix in ("moy", "max", "b365"):
                sortie[f"{prix}_{s}"] = _cote(l, f"{prix}_{s}")
        lignes.append(sortie)
    prep = pd.DataFrame(lignes).set_index("idx") if lignes else pd.DataFrame()
    return df[["date", "saison", "dom", "ext", "bd", "be"]].join(prep, how="inner")


def predictions_modele(df: pd.DataFrame, df_sup: pd.DataFrame | None, params: ParamsLigue) -> pd.DataFrame:
    """Probabilités du modèle pour chaque match, réajusté chaque semaine avec le passé seulement."""
    saisons = sorted(df["saison"].dropna().unique())
    if len(saisons) <= SAISONS_CHAUFFE:
        return pd.DataFrame()
    debut = df.loc[df["saison"] == saisons[SAISONS_CHAUFFE], "date"].min()
    a_predire = df[df["date"] >= debut]
    semaine = ((a_predire["date"] - debut).dt.days // 7).rename("semaine")
    modele = None
    lignes = []
    for _, groupe in a_predire.groupby(semaine):
        t0 = groupe["date"].min().normalize()
        equipes = set(groupe["dom"]) | set(groupe["ext"])
        nouveau = ajuster_ligue(df, t0, params, equipes, df_sup, depart=modele)
        modele = nouveau or modele
        if modele is None:
            continue
        for idx, l in groupe.iterrows():
            g = modele.grille(l["dom"], l["ext"])
            sortie = {"idx": idx}
            for s in SUFFIXES:
                sel = _selection(s, l.get("ah_ligne"))
                if sel is not None:
                    sortie[f"Wm_{s}"], sortie[f"Lm_{s}"] = gain_perte(g, sel)
            lignes.append(sortie)
    return pd.DataFrame(lignes).set_index("idx") if lignes else pd.DataFrame()


def _melange(j: pd.DataFrame, s: str, w: float) -> tuple[pd.Series, pd.Series, pd.Series]:
    """(W, L, référence disponible) du mélange modèle/référence pour la sélection s."""
    wm, lm = j[f"Wm_{s}"], j[f"Lm_{s}"]
    if f"Wr_{s}" not in j:
        return wm, lm, pd.Series(False, index=j.index)
    wr, lr = j[f"Wr_{s}"], j[f"Lr_{s}"]
    a_ref = wr.notna()
    return (w * wm + (1 - w) * wr).where(a_ref, wm), (w * lm + (1 - w) * lr).where(a_ref, lm), a_ref


def log_loss(j: pd.DataFrame, w: float) -> float:
    """Log-loss moyenne 1X2 + plus/moins 2,5 sur les matchs qui ont une référence."""
    total, n = 0.0, 0
    for groupe in (("1", "x", "2"), ("plus", "moins")):
        colonnes = [f"Wm_{s}" for s in groupe] + [f"Wr_{s}" for s in groupe]
        if not all(c in j for c in colonnes):
            continue
        sous = j.dropna(subset=colonnes)
        if sous.empty:
            continue
        p_issue = sum(
            (w * sous[f"Wm_{s}"] + (1 - w) * sous[f"Wr_{s}"]) * (sous[f"g_{s}"] > 0) for s in groupe
        )
        total += float(-np.log(np.clip(p_issue, 1e-6, 1)).sum())
        n += len(sous)
    return total / n if n else math.inf


def paris_simules(
    j: pd.DataFrame, w: float, valeur_min: float, seuil_suspect: float, seuil_desaccord: float, prix: str
) -> pd.DataFrame:
    """Tous les paris que la stratégie aurait pris, avec leur résultat à 1 unité."""
    morceaux = []
    for s in SUFFIXES:
        if f"Wm_{s}" not in j or f"{prix}_{s}" not in j:
            continue
        W, L, a_ref = _melange(j, s, w)
        cote = j[f"{prix}_{s}"]
        ev = W * (cote - 1) - L
        vmin = np.where(a_ref, valeur_min, 2 * valeur_min)
        garde = cote.notna() & W.notna() & (ev >= vmin) & (ev <= seuil_suspect)
        if f"Wr_{s}" in j:
            p_m = j[f"Wm_{s}"] / (j[f"Wm_{s}"] + j[f"Lm_{s}"])
            p_r = j[f"Wr_{s}"] / (j[f"Wr_{s}"] + j[f"Lr_{s}"])
            garde &= ~a_ref | ((p_m - p_r).abs() <= seuil_desaccord)
        sel = j[garde]
        if sel.empty:
            continue
        g = sel[f"g_{s}"]
        c = cote[garde]
        morceaux.append(pd.DataFrame({
            "date": sel["date"], "saison": sel["saison"], "suffixe": s, "famille": FAMILLE_SUFFIXE[s],
            "cote": c, "ev": ev[garde], "W": W[garde], "L": L[garde],
            "profit": np.where(g > 0, g * (c - 1), g),
            "clv": c / sel[f"cc_{s}"] - 1 if f"cc_{s}" in sel else np.nan,
        }))
    if not morceaux:
        return pd.DataFrame(columns=["date", "saison", "suffixe", "famille", "cote", "ev", "W", "L", "profit", "clv"])
    return pd.concat(morceaux).sort_values("date", kind="stable")


def simuler_capital(paris: pd.DataFrame, depart: float = 100.0, fraction: float = 0.25, plafond: float = 0.03) -> dict:
    """Capital de départ misé avec les règles réelles (Kelly fractionné, plafond par pari)."""
    cap, plus_haut, pire_baisse = depart, depart, 0.0
    trajectoire = []
    for p in paris.itertuples(index=False):
        mise = arrondi_naturel(min(cap * kelly_wl(p.W, p.L, p.cote) * fraction, cap * plafond))
        cap += mise * p.profit
        plus_haut = max(plus_haut, cap)
        pire_baisse = max(pire_baisse, 1 - cap / plus_haut)
        trajectoire.append((p.date, cap))
    pire_mois = None
    if trajectoire:
        serie = pd.Series([c for _, c in trajectoire], index=pd.DatetimeIndex([d for d, _ in trajectoire]))
        serie = serie.groupby(level=0).last()
        # capital 30 jours plus tôt (ou capital de départ) pour chaque date
        pos = serie.index.searchsorted(serie.index - pd.Timedelta(days=30), side="right") - 1
        base = np.where(pos >= 0, serie.to_numpy()[np.clip(pos, 0, None)], depart)
        pire_mois = round(float((serie.to_numpy() / base - 1).min()), 4)
    return {"capital_final": round(cap, 2), "pire_baisse": round(pire_baisse, 4), "pire_mois": pire_mois}


def resume_paris(paris: pd.DataFrame) -> dict:
    n = len(paris)
    if not n:
        return {"n": 0, "roi": None, "clv": None, "t": None}
    roi = float(paris["profit"].mean())
    ecart = float(paris["profit"].std(ddof=1)) if n > 1 else 0.0
    clv = paris["clv"].dropna()
    return {
        "n": n, "roi": round(roi, 4),
        "clv": round(float(clv.mean()), 4) if len(clv) else None,
        "t": round(roi / (ecart / math.sqrt(n)), 2) if ecart > 0 else None,
    }


@dataclass
class ResultatLigue:
    ligue: str
    params: ParamsLigue | None = None
    log_loss: dict = field(default_factory=dict)
    dev: dict = field(default_factory=dict)
    coffre: dict = field(default_factory=dict)
    capital_coffre: dict = field(default_factory=dict)
    marches_valides: list[str] = field(default_factory=list)
    erreur: str | None = None
    paris_dev: pd.DataFrame | None = field(default=None, repr=False)
    paris_coffre: pd.DataFrame | None = field(default=None, repr=False)

    def en_dict(self) -> dict:
        d = {"ligue": self.ligue, "log_loss": self.log_loss, "dev": self.dev, "coffre": self.coffre,
             "capital_coffre": self.capital_coffre, "marches_valides": self.marches_valides, "erreur": self.erreur}
        if self.params:
            d.update(self.params.en_dict())
        return d


@dataclass(frozen=True)
class OptionsBacktest:
    valeur_min: float = 0.03
    seuil_suspect: float = 0.10
    seuil_desaccord: float = 0.10
    prix: str = "moy"
    grille_xi: tuple[float, ...] = GRILLE_XI
    grille_buts: tuple[float, ...] = GRILLE_BUTS
    reg: float = 2.0
    fenetre_jours: int = 730
    capital: float = 100.0
    fraction_kelly: float = 0.25
    mise_max_pct: float = 0.03


def tournoi_ligue(ligue: str, df: pd.DataFrame, df_sup: pd.DataFrame | None, o: OptionsBacktest) -> ResultatLigue:
    res = ResultatLigue(ligue)
    df = df[df["bd"].notna() & df["be"].notna()].sort_values("date", kind="stable")
    saisons = sorted(df["saison"].dropna().unique())
    if len(saisons) < SAISONS_CHAUFFE + SAISONS_COFFRE + 1:
        res.erreur = f"{len(saisons)} saison(s) : pas assez d'historique"
        return res
    prep = preparer_ligue(df)
    coffre = set(saisons[-SAISONS_COFFRE:])
    meilleur = None
    for xi in o.grille_xi:
        for alpha in o.grille_buts:
            params = ParamsLigue(xi=xi, reg=o.reg, fenetre_jours=o.fenetre_jours, poids_buts=alpha)
            pred = predictions_modele(df, df_sup, params)
            if pred.empty:
                continue
            j = prep.join(pred, how="inner")
            dev = j[~j["saison"].isin(coffre)]
            for w in GRILLE_POIDS:
                ll = log_loss(dev, w)
                if meilleur is None or ll < meilleur[0]:
                    meilleur = (ll, xi, alpha, w, j)
    if meilleur is None:
        res.erreur = "aucune prédiction possible"
        return res
    ll, xi, alpha, w, j = meilleur
    res.params = ParamsLigue(xi=xi, reg=o.reg, fenetre_jours=o.fenetre_jours, poids_modele=w, poids_buts=alpha)
    dev, cof = j[~j["saison"].isin(coffre)], j[j["saison"].isin(coffre)]
    res.log_loss = {
        "melange": round(ll, 5),
        "modele_seul": round(log_loss(dev, 1.0), 5),
        "reference_seule": round(log_loss(dev, 0.0), 5),
        "coffre_melange": round(log_loss(cof, w), 5),
    }
    p_dev = paris_simules(dev, w, o.valeur_min, o.seuil_suspect, o.seuil_desaccord, o.prix)
    p_cof = paris_simules(cof, w, o.valeur_min, o.seuil_suspect, o.seuil_desaccord, o.prix)
    for famille in ("1x2", "total", "ah"):
        rd = resume_paris(p_dev[p_dev["famille"] == famille])
        rc = resume_paris(p_cof[p_cof["famille"] == famille])
        res.dev[famille], res.coffre[famille] = rd, rc
        if famille_valide(rd, rc, PARIS_MIN_COFFRE):
            res.marches_valides.append(famille)
    res.paris_dev, res.paris_coffre = p_dev, p_cof
    valides = p_cof[p_cof["famille"].isin(res.marches_valides)]
    res.capital_coffre = simuler_capital(valides, o.capital, o.fraction_kelly, o.mise_max_pct)
    return res


def famille_valide(dev: dict, coffre: dict, n_min: int) -> bool:
    """Même règle partout : assez de paris, gagnant en développement ET dans le coffre-fort, CLV ≥ 0."""
    clv_ok = coffre["clv"] is None or coffre["clv"] >= 0
    return coffre["n"] >= n_min and (coffre["roi"] or 0) > 0 and (dev["roi"] or 0) > 0 and clv_ok


def validation_globale(resultats: list[ResultatLigue], o: OptionsBacktest) -> dict:
    """Championnat par championnat, les paris sont trop rares pour conclure (souvent moins de 10
    dans le coffre-fort). On juge donc aussi chaque famille de marchés sur tous les championnats
    réunis ; une famille validée ainsi l'est pour tous les championnats testés."""
    ok = [r for r in resultats if r.paris_coffre is not None]
    if not ok:
        return {}
    dev = pd.concat([r.paris_dev for r in ok]).sort_values("date", kind="stable")
    cof = pd.concat([r.paris_coffre for r in ok]).sort_values("date", kind="stable")
    bilan = {"familles": {}, "valides": []}
    for famille in ("1x2", "total", "ah"):
        rd, rc = resume_paris(dev[dev["famille"] == famille]), resume_paris(cof[cof["famille"] == famille])
        bilan["familles"][famille] = {"dev": rd, "coffre": rc}
        if famille_valide(rd, rc, PARIS_MIN_GLOBAL):
            bilan["valides"].append(famille)
    for r in ok:
        r.marches_valides = sorted(set(r.marches_valides) | set(bilan["valides"]))
        valides = r.paris_coffre[r.paris_coffre["famille"].isin(r.marches_valides)]
        r.capital_coffre = simuler_capital(valides, o.capital, o.fraction_kelly, o.mise_max_pct)
    bilan["capital_coffre"] = simuler_capital(cof[cof["famille"].isin(bilan["valides"])], o.capital,
                                              o.fraction_kelly, o.mise_max_pct)
    return bilan


def _tache(args) -> ResultatLigue:
    ligue, df, df_sup, o = args
    try:
        return tournoi_ligue(ligue, df, df_sup, o)
    except Exception as e:  # une ligue en erreur ne doit pas bloquer les autres
        log.exception("Backtest %s", ligue)
        return ResultatLigue(ligue, erreur=str(e))


def lancer(
    hist: pd.DataFrame,
    ligues: list[str],
    o: OptionsBacktest,
    travailleurs: int | None = None,
    progression=None,
) -> list[ResultatLigue]:
    """Un tournoi par championnat. `progression(fait, total, ligue)` est appelée après chacun.

    Sous Windows, les processus parallèles du backtest plantaient (BrokenProcessPool) : on y
    calcule un championnat après l'autre. Ailleurs, en parallèle, avec repli séquentiel si besoin.
    """
    taches = []
    for ligue in ligues:
        sup = LIGUES.get(ligue, ("", None))[1]
        taches.append((ligue, hist[hist["ligue"] == ligue], hist[hist["ligue"] == sup] if sup else None, o))
    if travailleurs is None:
        # Toujours au moins un cœur libre pour que l'ordinateur reste utilisable
        travailleurs = 1 if os.name == "nt" else max(1, (os.cpu_count() or 2) - 1)
    resultats: dict[str, ResultatLigue] = {}

    def noter(res: ResultatLigue) -> None:
        resultats[res.ligue] = res
        if progression:
            progression(len(resultats), len(taches), res.ligue)

    if travailleurs > 1 and len(taches) > 1:
        try:
            with ProcessPoolExecutor(max_workers=travailleurs) as pool:
                for res in pool.map(_tache, taches):
                    noter(res)
        except BrokenProcessPool:
            log.warning("Calcul parallèle impossible : on continue un championnat après l'autre.")
    for t in taches:
        if t[0] not in resultats:
            noter(_tache(t))
    return [resultats[t[0]] for t in taches]


def _pct(x) -> str:
    return "—" if x is None else f"{x:+.1%}".replace(".", ",")


def rapport_markdown(resultats: list[ResultatLigue], o: OptionsBacktest, quand: datetime,
                     bilan_global: dict | None = None) -> str:
    lignes = [
        f"# Backtest du {quand:%d/%m/%Y %H:%M} UTC",
        "",
        f"Prix utilisés : `{o.prix}` · value minimale {o.valeur_min:.0%} · coffre-fort : "
        f"{SAISONS_COFFRE} dernières saisons · capital simulé {o.capital:.0f} $.",
        "",
        "| Ligue | xi | Part buts / tirs | Poids modèle | Log-loss mélange / réf. / modèle | Coffre 1X2 | Coffre +/- | Coffre AH | Capital coffre | Validé |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in resultats:
        nom = LIGUES.get(r.ligue, (r.ligue,))[0]
        if r.erreur or r.params is None:
            lignes.append(f"| {nom} | | | | {r.erreur or ''} | | | | | |")
            continue

        def cel(f):
            c = r.coffre.get(f, {})
            return f"{c.get('n', 0)} paris, ROI {_pct(c.get('roi'))}, CLV {_pct(c.get('clv'))}"

        ll = r.log_loss
        lignes.append(
            f"| {nom} | {r.params.xi} | {r.params.poids_buts:.0%} / {1 - r.params.poids_buts:.0%} | {r.params.poids_modele} | "
            f"{ll['melange']:.4f} / {ll['reference_seule']:.4f} / {ll['modele_seul']:.4f} | "
            f"{cel('1x2')} | {cel('total')} | {cel('ah')} | "
            f"{r.capital_coffre.get('capital_final', '—')} $ | {', '.join(r.marches_valides) or 'rien'} |"
        )
    if bilan_global:
        lignes += ["", "## Tous championnats réunis", "",
                   "| Marché | Développement | Coffre-fort | Validé |", "|---|---|---|---|"]
        noms = {"1x2": "1X2 / double chance", "total": "Plus / moins de buts", "ah": "Handicap asiatique"}
        for famille, v in bilan_global["familles"].items():
            d, c = v["dev"], v["coffre"]
            lignes.append(f"| {noms[famille]} | {d['n']} paris, ROI {_pct(d['roi'])} | "
                          f"{c['n']} paris, ROI {_pct(c['roi'])}, CLV {_pct(c['clv'])} | "
                          f"{'oui' if famille in bilan_global['valides'] else 'non'} |")
        cap = bilan_global.get("capital_coffre", {})
        lignes.append("")
        if bilan_global["valides"]:
            lignes.append(f"Capital simulé sur le coffre-fort avec les marchés validés : {o.capital:.0f} $ → "
                          f"{cap.get('capital_final')} $ (pire baisse {_pct(-(cap.get('pire_baisse') or 0))}).")
        else:
            lignes.append(f"Aucune famille ne remplit les critères (au moins {PARIS_MIN_GLOBAL} paris dans le "
                          "coffre-fort, gagnante en développement et dans le coffre-fort, CLV positive). "
                          "Le moteur reste en observation : c'est la protection qui joue.")
    lignes += [
        "",
        "Lecture : une log-loss plus basse = des probabilités plus justes. Si « réf. » est la plus basse,",
        "le marché sharp est meilleur que notre modèle et le poids du modèle est mis à 0 : on ne parie alors",
        "que quand un bookmaker paie plus que le prix juste de la référence (Pinnacle, puis Betfair Exchange).",
    ]
    return "\n".join(lignes)


def ecrire_parametres(resultats: list[ResultatLigue], dossier: Path, quand: datetime) -> Path:
    chemin = Path(dossier) / "parametres.json"
    if chemin.exists():
        chemin.replace(chemin.with_suffix(".precedent.json"))
    contenu = {"genere_le": quand.isoformat(),
               "ligues": {r.ligue: r.en_dict() for r in resultats if r.params is not None}}
    chemin.write_text(json.dumps(contenu, indent=2, ensure_ascii=False), encoding="utf-8")
    return chemin


def executer(hist: pd.DataFrame, ligues: list[str], o: OptionsBacktest, dossier: Path, activer: bool,
             travailleurs: int | None = None, progression=None) -> tuple[list[ResultatLigue], Path]:
    quand = datetime.now(timezone.utc)
    resultats = lancer(hist, ligues, o, travailleurs, progression)
    bilan_global = validation_globale(resultats, o)
    sortie = Path(dossier) / "backtest"
    sortie.mkdir(parents=True, exist_ok=True)
    md = sortie / f"backtest-{quand:%Y%m%d-%H%M}.md"
    md.write_text(rapport_markdown(resultats, o, quand, bilan_global), encoding="utf-8")
    (sortie / f"backtest-{quand:%Y%m%d-%H%M}.json").write_text(
        json.dumps([r.en_dict() for r in resultats], indent=2, ensure_ascii=False), encoding="utf-8")
    if activer:
        ecrire_parametres(resultats, dossier, quand)
    return resultats, md
