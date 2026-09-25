"""Chasseur J : valeur exacte des promotions (cahier des charges, section 8).

La probabilité vient de la fiche du match (`moteur fiche`) : prix juste = 1 / probabilité.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class ValeurPromo:
    esperance: float  # gain moyen en dollars
    taux: float  # esperance / montant de la promo ou de la mise


def pari_gratuit(proba: float, cote: float, montant: float) -> ValeurPromo:
    """Pari gratuit dont la mise n'est pas rendue : on ne touche que le gain net.

    Valeur = montant × p × (cote − 1). Plus la cote est haute, plus le pari gratuit vaut
    cher en moyenne, à probabilité juste égale : on le place sur une cote élevée et juste.
    """
    ev = montant * proba * (cote - 1)
    return ValeurPromo(ev, ev / montant if montant else 0.0)


def cashback(proba: float, cote: float, mise: float, taux_rembourse: float) -> ValeurPromo:
    """Pari remboursé à `taux_rembourse` (ex. 0,5) en cas de perte."""
    ev = mise * (proba * (cote - 1) - (1 - proba) * (1 - taux_rembourse))
    return ValeurPromo(ev, ev / mise if mise else 0.0)


def cote_boostee(proba: float, cote: float, mise: float) -> ValeurPromo:
    ev = mise * (proba * cote - 1)
    return ValeurPromo(ev, ev / mise if mise else 0.0)


def meilleur_pari_gratuit(options: list[tuple[str, float, float]], montant: float) -> tuple[str, ValeurPromo] | None:
    """Parmi (libellé, probabilité, cote), le placement qui rapporte le plus en moyenne."""
    if not options:
        return None
    libelle, p, c = max(options, key=lambda o: o[1] * (o[2] - 1))
    return libelle, pari_gratuit(p, c, montant)
