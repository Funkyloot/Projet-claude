"""Données synthétiques réalistes pour les tests : un championnat simulé avec des cotes."""

import numpy as np
import pandas as pd

from moteur.marches import Selection, gain_perte
from moteur.modeles.grille import grille_dc, probas_1x2, proba_plus


def _cotes(probas, marge, bruit, rng):
    p = np.asarray(probas) * (1 + marge)
    p = p * np.exp(rng.normal(0, bruit, len(p)))
    return np.round(1 / p, 2)


def championnat(ligue="E1", saisons=(2019, 2020, 2021, 2022, 2023), n_equipes=12, graine=0) -> pd.DataFrame:
    rng = np.random.default_rng(graine)
    att = rng.normal(0, 0.3, n_equipes)
    dfn = rng.normal(0, 0.25, n_equipes)
    equipes = [f"Club {chr(65 + i)}" for i in range(n_equipes)]
    lignes = []
    for annee in saisons:
        jour = pd.Timestamp(f"{annee}-08-10 14:00", tz="UTC")
        paires = [(i, j) for i in range(n_equipes) for j in range(n_equipes) if i != j]
        rng.shuffle(paires)
        for k, (i, j) in enumerate(paires):
            date = jour + pd.Timedelta(days=7 * (k // (n_equipes // 2)))
            lh = float(np.exp(0.15 + 0.25 + att[i] + dfn[j]))
            la = float(np.exp(0.15 + att[j] + dfn[i]))
            g = grille_dc(lh, la, -0.05)
            p1, px, p2 = probas_1x2(g)
            pp = proba_plus(g)
            ah = -0.5 if p1 > p2 else 0.5
            w1, l1 = gain_perte(g, Selection("ah", "1", ah))
            ligne = {
                "ligue": ligue, "saison": annee, "date": date, "dom": equipes[i], "ext": equipes[j],
                "bd": rng.poisson(lh), "be": rng.poisson(la), "ah_ligne": ah, "ahc_ligne": ah,
            }
            for prefixe, marge, bruit in (("ref", 0.025, 0.01), ("refc", 0.02, 0.005),
                                          ("moy", 0.06, 0.03), ("max", 0.01, 0.03), ("b365", 0.06, 0.04)):
                c = _cotes([p1, px, p2], marge, bruit, rng)
                ligne |= {f"{prefixe}_1": c[0], f"{prefixe}_x": c[1], f"{prefixe}_2": c[2]}
                t = _cotes([pp, 1 - pp], marge, bruit, rng)
                ligne |= {f"{prefixe}_plus": t[0], f"{prefixe}_moins": t[1]}
                a = _cotes([w1 / (w1 + l1), l1 / (w1 + l1)], marge, bruit, rng)
                ligne |= {f"{prefixe}_ah1": a[0], f"{prefixe}_ah2": a[1]}
            lignes.append(ligne)
    return pd.DataFrame(lignes)
