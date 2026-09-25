"""Calculateur (cahier des charges, section 4, et règles de mise de la section 9).

Fonctions pures, sans base ni réseau : tous les modules s'appuient dessus.
"""

from dataclasses import dataclass
from math import floor, log1p, sqrt

# Paires (ou triplets) d'issues qui couvrent 100 % des résultats d'un match (section 4).
COMPLEMENTAIRES: list[tuple[str, ...]] = [
    ("1", "X2"),
    ("2", "1X"),
    ("X", "12"),
    ("1", "X", "2"),
    ("plus", "moins"),  # même ligne de total
    ("AH-0.5_dom", "AH+0.5_ext"),
]


def _verifier_cote(cote: float) -> None:
    if cote <= 1:
        raise ValueError(f"cote invalide : {cote} (doit être > 1)")


def _verifier_proba(p: float) -> None:
    if not 0 < p < 1:
        raise ValueError(f"probabilité invalide : {p} (doit être entre 0 et 1)")


def proba_implicite(cote: float) -> float:
    """p = 1 / cote"""
    _verifier_cote(cote)
    return 1 / cote


def marge(cotes: list[float]) -> float:
    """Marge du bookmaker sur un marché complet : somme(1 / cotes) − 1."""
    if len(cotes) < 2:
        raise ValueError("un marché complet a au moins deux issues")
    return sum(proba_implicite(c) for c in cotes) - 1


def probas_justes(cotes: list[float], methode: str = "proportionnelle") -> list[float]:
    """Retire la marge pour estimer les probabilités « justes » selon le bookmaker.

    - proportionnelle : chaque probabilité implicite divisée par leur somme.
    - puissance : cherche k tel que somme((1/cote)^k) = 1 ; corrige mieux le biais
      favori / outsider (les bookmakers chargent davantage les outsiders).
    """
    implicites = [proba_implicite(c) for c in cotes]
    if methode == "proportionnelle":
        total = sum(implicites)
        return [p / total for p in implicites]
    if methode == "puissance":
        bas, haut = 1.0, 10.0
        if sum(implicites) < 1:  # marché sans marge (surebet) : k < 1
            bas, haut = 0.01, 1.0
        for _ in range(100):
            k = (bas + haut) / 2
            if sum(p**k for p in implicites) > 1:
                bas = k
            else:
                haut = k
        return [p**k for p in implicites]
    raise ValueError(f"méthode inconnue : {methode}")


def esperance(proba: float, cote: float) -> float:
    """EV = p × cote − 1 (gain moyen par dollar misé)."""
    _verifier_proba(proba)
    _verifier_cote(cote)
    return proba * cote - 1


def kelly(proba: float, cote: float) -> float:
    """Fraction de Kelly complète f* = (p × cote − 1) / (cote − 1), jamais négative."""
    return max(0.0, esperance(proba, cote) / (cote - 1))


def kelly_general(issues: list[tuple[float, float]], plafond: float = 0.99) -> float:
    """Fraction de Kelly pour un pari à plusieurs issues (handicaps asiatiques, remboursements).

    `issues` : couples (probabilité, gain net par dollar misé), ex. [(0.5, 1.05), (0.1, 0), (0.4, -1)].
    Maximise E[log(1 + f × gain)] par section dorée (la fonction est concave).
    """
    issues = [(p, g) for p, g in issues if p > 0]
    if not issues or sum(p * g for p, g in issues) <= 0:
        return 0.0
    pire = min(g for _, g in issues)
    haut = plafond if pire >= 0 else min(plafond, 0.999 / -pire)

    def croissance(f: float) -> float:
        return sum(p * log1p(f * g) for p, g in issues)

    nombre_or = (sqrt(5) - 1) / 2
    a, b = 0.0, haut
    c, d = b - nombre_or * (b - a), a + nombre_or * (b - a)
    for _ in range(80):
        if croissance(c) > croissance(d):
            b, d = d, c
            c = b - nombre_or * (b - a)
        else:
            a, c = c, d
            d = a + nombre_or * (b - a)
    return max(0.0, (a + b) / 2)


def arrondi_naturel(montant: float) -> float:
    """Arrondi vers le bas à un montant qui a l'air humain (section 9).

    < 5 $ : au 0,10 $ ; < 20 $ : au 0,50 $ ; au-delà : au dollar.
    """
    if montant <= 0:
        return 0.0
    pas = 0.1 if montant < 5 else 0.5 if montant < 20 else 1.0
    return round(floor(montant / pas + 1e-9) * pas, 2)


@dataclass(frozen=True)
class Mise:
    montant: float
    kelly_complet: float
    plafonnee: bool


def mise_conseillee(
    capital: float,
    proba: float,
    cote: float,
    fraction: float = 0.25,
    plafond_pct: float = 0.03,
) -> Mise:
    """mise = capital × f* × fraction, plafonnée à plafond_pct du capital, arrondie."""
    if capital <= 0:
        return Mise(0.0, 0.0, False)
    f = kelly(proba, cote)
    brute = capital * f * fraction
    plafond = capital * plafond_pct
    return Mise(arrondi_naturel(min(brute, plafond)), f, brute > plafond)


@dataclass(frozen=True)
class Value:
    proba_modele: float
    proba_cote: float
    esperance: float
    est_value: bool
    suspecte: bool  # trop belle : risque d'annulation pour erreur manifeste


def analyser_value(
    proba_modele: float, cote: float, valeur_min: float = 0.03, seuil_suspect: float = 0.10
) -> Value:
    ev = esperance(proba_modele, cote)
    return Value(
        proba_modele=proba_modele,
        proba_cote=proba_implicite(cote),
        esperance=ev,
        est_value=ev >= valeur_min,
        suspecte=ev > seuil_suspect,
    )


@dataclass(frozen=True)
class Surebet:
    somme_inverses: float
    profit: float  # en fraction de la mise totale ; négatif si pas de surebet
    mises: list[float]
    retour: float
    est_surebet: bool
    suspect: bool


def surebet(cotes: list[float], total: float = 100.0, seuil_suspect: float = 0.10) -> Surebet:
    """Couverture de toutes les issues : mise_i = total × (1/cote_i) / somme.

    Chaque issue rapporte alors le même montant : total / somme.
    Les cotes doivent former une combinaison complémentaire (voir COMPLEMENTAIRES).
    """
    if len(cotes) < 2:
        raise ValueError("un surebet couvre au moins deux issues")
    inverses = [proba_implicite(c) for c in cotes]
    somme = sum(inverses)
    mises = [round(total * i / somme, 2) for i in inverses]
    profit = 1 / somme - 1
    return Surebet(
        somme_inverses=somme,
        profit=profit,
        mises=mises,
        retour=round(total / somme, 2),
        est_surebet=somme < 1,
        suspect=profit > seuil_suspect,
    )
