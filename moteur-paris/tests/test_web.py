import json

import pytest
from fastapi.testclient import TestClient

from moteur.journal import lire_etat
from moteur.service import Service
from moteur.taches import surcharges
from moteur.web.app import creer_app
from moteur.web.securite import hacher, verifier


@pytest.fixture
def service(reglages_test, sessions, scenario):
    svc = Service(reglages_test, sessions, horloge=lambda: scenario["maintenant"], reseau=False)
    svc.hist, svc.fixtures = scenario["hist"], scenario["fixtures"]
    svc.analyser(scenario["maintenant"])
    return svc


@pytest.fixture
def client(service):
    return TestClient(creer_app(service))


@pytest.fixture
def connecte(client):
    client.post("/connexion", data={"mdp": "motdepasse1", "confirmation": "motdepasse1"})
    return client


def test_hachage():
    h = hacher("secret123")
    assert verifier("secret123", h) and not verifier("autre", h) and not verifier("x", "corrompu")


def test_premiere_visite_puis_connexion(client):
    r = client.get("/", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/connexion"
    assert "Première visite" in client.get("/connexion").text
    r = client.post("/connexion", data={"mdp": "court", "confirmation": "court"})
    assert "trop court" in r.text
    r = client.post("/connexion", data={"mdp": "motdepasse1", "confirmation": "different1"})
    assert "différents" in r.text
    r = client.post("/connexion", data={"mdp": "motdepasse1", "confirmation": "motdepasse1"})
    assert "Tableau de bord" in r.text
    client.post("/deconnexion")
    assert "Entrer" in client.get("/").text
    assert "incorrect" in client.post("/connexion", data={"mdp": "mauvais"}).text
    assert "Tableau de bord" in client.post("/connexion", data={"mdp": "motdepasse1"}).text


@pytest.mark.parametrize("chemin,attendu", [
    ("/", "Paris recommandés"), ("/journal", "Paris (100 derniers)"), ("/fiche", "Fiche de match"),
    ("/outils", "Surebet"), ("/donnees", "Historique téléchargé"), ("/reglages", "Token du bot"),
    ("/bilan", "Bilan hebdomadaire"),
])
def test_pages(connecte, chemin, attendu):
    r = connecte.get(chemin)
    assert r.status_code == 200 and attendu in r.text


def test_fiche_web(connecte, service):
    m = service.matchs[0]
    r = connecte.get("/fiche", params={"dom": m.dom, "ext": m.ext})
    assert "Prix juste" in r.text and "Plus de 2,5 buts" in r.text
    assert "introuvables" in connecte.get("/fiche", params={"dom": "X", "ext": "Y"}).text


def test_reglages_depuis_l_interface(connecte, sessions):
    r = connecte.post("/reglages/mises", data={
        "capital_initial": "150", "seuil_arret": "90", "mise_max_pct": "2,5", "fraction_kelly": "25",
        "exposition_jour_pct": "15", "exposition_match_pct": "5", "valeur_min": "4", "seuil_suspect": "10",
        "seuil_desaccord": "10", "jours_simulation_min": "14"})
    assert "Réglages enregistrés" in r.text
    with sessions() as s:
        s_ = surcharges(s)
    assert s_["capital_initial"] == 150 and s_["mise_max_pct"] == pytest.approx(0.025) and s_["valeur_min"] == 0.04
    # une valeur incohérente est refusée et rien n'est enregistré
    r = connecte.post("/reglages/mises", data={
        "capital_initial": "50", "seuil_arret": "90", "mise_max_pct": "2", "fraction_kelly": "25",
        "exposition_jour_pct": "15", "exposition_match_pct": "5", "valeur_min": "3", "seuil_suspect": "10",
        "seuil_desaccord": "10", "jours_simulation_min": "14"})
    assert "seuil_arret" in r.text
    with sessions() as s:
        assert surcharges(s)["capital_initial"] == 150
    assert "illisible" in connecte.post("/reglages/calendrier", data={
        "fuseau": "UTC", "heure_donnees": "six", "heure_rapport": "9", "intervalle_analyse_h": "4"}).text


def test_secrets_et_telegram(connecte, sessions, service):
    r = connecte.post("/reglages/telegram", data={"telegram_token": "123456:ABCDEFGH"})
    assert "Réglages enregistrés" in r.text
    page = connecte.get("/reglages").text
    assert "123456:ABCDEFGH" not in page and "…EFGH" in page  # jamais réaffiché en clair
    assert f"<strong>{service.code_liaison()}</strong>" in page
    connecte.post("/reglages/cotes", data={"odds_api_key": "", "bookmaker_cible": "onexbet",
                                           "bookmaker_reference": "pinnacle", "odds_api_credits_jour": "20",
                                           "odds_api_regions": "eu", "odds_api_marches": "h2h,totals"})
    with sessions() as s:
        s_ = surcharges(s)
    assert s_["telegram_token"] == "123456:ABCDEFGH" and "odds_api_key" not in s_  # vide = inchangé
    connecte.post("/reglages/telegram", data={"effacer_telegram_token": "on"})
    with sessions() as s:
        assert surcharges(s)["telegram_token"] == ""


def test_championnats_et_alias(connecte, sessions, reglages_test):
    assert "au moins un" in connecte.post("/reglages/ligues", data={}).text
    connecte.post("/reglages/ligues", data={"ligue_E1": "on", "ligue_D2": "on"})
    with sessions() as s:
        assert surcharges(s)["ligues"] == "E1,D2"
    connecte.post("/reglages-alias", data={"alias": "Les Paons = Leeds\n\nMan Utd = Man United"})
    contenu = json.loads((reglages_test.dossier / "alias_equipes.json").read_text())
    assert contenu == {"Les Paons": "Leeds", "Man Utd": "Man United"}
    assert "sans « = »" in connecte.post("/reglages-alias", data={"alias": "n'importe quoi"}).text


def test_boutons_d_action(connecte, sessions):
    r = connecte.post("/action/historique", data={"retour_vers": "/donnees"})
    assert "demandé" in r.text and "en attente" in r.text
    with sessions() as s:
        assert lire_etat(s, "demandes") == ["historique"]
    assert "Action inconnue" in connecte.post("/action/pirater").text


def test_signal_cote_et_mode(connecte, sessions, service):
    from moteur.journal import recommandations_ouvertes

    with sessions() as s:
        recos = recommandations_ouvertes(s, service.horloge()) + recommandations_ouvertes(s, service.horloge(), False)
    if recos:
        r = connecte.post(f"/signal/{recos[0].id}/cote", data={"cote_vue": "1,01"})
        assert "Ne pas jouer" in r.text
        r = connecte.post(f"/signal/{recos[0].id}/pari", data={"cote_prise": "2,5"})
        assert "simulation" in r.text.lower()
    assert "illisible" in connecte.post("/signal/1/cote", data={"cote_vue": "abc"}).text
    assert "refusé" in connecte.post("/mode", data={"nouveau": "reel"}).text


def test_resultat_manuel_et_mdp(connecte, sessions):
    assert "Score attendu" in connecte.post("/match/1/resultat", data={"score": "deux"}).text
    r = connecte.post("/reglages-mdp", data={"actuel": "faux", "nouveau": "nouveau123", "confirmation": "nouveau123"})
    assert "incorrect" in r.text
    r = connecte.post("/reglages-mdp", data={"actuel": "motdepasse1", "nouveau": "nouveau123",
                                              "confirmation": "nouveau123"})
    assert "Entrer" in r.text  # déconnecté : il faut se reconnecter


def test_outils(connecte):
    r = connecte.post("/outils", data={"outil": "surebet", "cotes": "5,00 1,30", "montant": "50"})
    assert "Retour garanti : 51,59 $" in r.text
    r = connecte.post("/outils", data={"outil": "value", "proba": "52", "cote_saisie": "2,05", "montant": "100"})
    assert "Mise conseillée : 1,50 $" in r.text
    r = connecte.post("/outils", data={"outil": "gratuit", "proba": "30", "cote_saisie": "3,4", "montant": "10"})
    assert "7,20 $" in r.text
    assert "Saisie incorrecte" in connecte.post("/outils", data={"outil": "value", "proba": "x", "cote_saisie": "2"}).text


def test_sante_sans_connexion(client):
    assert client.get("/sante").json() == {"ok": True}
