"""Mot de passe de l'interface et sessions de connexion."""

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from ..journal import ecrire_etat, lire_etat

ITERATIONS = 200_000
DUREE_SESSION = timedelta(days=30)
COOKIE = "moteur_session"
LONGUEUR_MIN = 8


def hacher(mdp: str) -> str:
    sel = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", mdp.encode(), bytes.fromhex(sel), ITERATIONS).hex()
    return f"pbkdf2${ITERATIONS}${sel}${h}"


def verifier(mdp: str, stocke: str) -> bool:
    try:
        _, iterations, sel, h = stocke.split("$")
        calcule = hashlib.pbkdf2_hmac("sha256", mdp.encode(), bytes.fromhex(sel), int(iterations)).hex()
    except ValueError:
        return False
    return hmac.compare_digest(calcule, h)


def mdp_defini(s: Session) -> bool:
    return lire_etat(s, "web:mdp") is not None


def definir_mdp(s: Session, mdp: str) -> None:
    if len(mdp) < LONGUEUR_MIN:
        raise ValueError(f"au moins {LONGUEUR_MIN} caractères")
    ecrire_etat(s, "web:mdp", hacher(mdp))
    ecrire_etat(s, "web:sessions", {})  # changer le mot de passe déconnecte tout le monde


def mdp_correct(s: Session, mdp: str) -> bool:
    stocke = lire_etat(s, "web:mdp")
    return stocke is not None and verifier(mdp, stocke)


def _empreinte(jeton: str) -> str:
    return hashlib.sha256(jeton.encode()).hexdigest()


def ouvrir_session(s: Session) -> str:
    maintenant = datetime.now(timezone.utc)
    sessions = {k: v for k, v in lire_etat(s, "web:sessions", {}).items()
                if datetime.fromisoformat(v) > maintenant}
    jeton = secrets.token_urlsafe(32)
    sessions[_empreinte(jeton)] = (maintenant + DUREE_SESSION).isoformat()
    ecrire_etat(s, "web:sessions", sessions)
    return jeton


def session_valide(s: Session, jeton: str | None) -> bool:
    if not jeton:
        return False
    fin = lire_etat(s, "web:sessions", {}).get(_empreinte(jeton))
    return fin is not None and datetime.fromisoformat(fin) > datetime.now(timezone.utc)


def fermer_session(s: Session, jeton: str | None) -> None:
    if jeton:
        sessions = lire_etat(s, "web:sessions", {})
        sessions.pop(_empreinte(jeton), None)
        ecrire_etat(s, "web:sessions", sessions)
