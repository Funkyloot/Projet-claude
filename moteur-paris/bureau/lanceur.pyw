"""Lanceur du Moteur de paris (Windows et Linux).

Double-clic : démarre le service en arrière-plan s'il ne tourne pas, puis ouvre l'interface
dans une fenêtre d'application. Options : --service (démarre sans ouvrir de fenêtre, utilisé
au démarrage de Windows), --arreter (arrête le service).
"""

import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

BASE = Path(__file__).resolve().parent
DONNEES = BASE / "data"
PID = DONNEES / "moteur.pid"
PORT = int(os.environ.get("MOTEUR_PORT_WEB", "8080"))
URL = f"http://localhost:{PORT}"
WINDOWS = os.name == "nt"
SANS_FENETRE = 0x08000000 | 0x00000200 if WINDOWS else 0  # CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP


def message(texte: str) -> None:
    if WINDOWS:
        import ctypes

        ctypes.windll.user32.MessageBoxW(0, texte, "Moteur de paris", 0x40)
    else:
        print(texte)


def repond() -> bool:
    try:
        urllib.request.urlopen(f"{URL}/sante", timeout=2)
        return True
    except OSError:
        return False


def python_sans_console() -> str:
    exe = Path(sys.executable)
    if WINDOWS and exe.name.lower() == "python.exe" and (exe.parent / "pythonw.exe").exists():
        return str(exe.parent / "pythonw.exe")
    return str(exe)


def demarrer() -> None:
    DONNEES.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ,
               MOTEUR_DATABASE_URL="sqlite:///" + (DONNEES / "moteur.db").as_posix(),
               MOTEUR_DOSSIER_DONNEES=str(DONNEES))
    journal = open(DONNEES / "moteur.log", "ab")
    processus = subprocess.Popen(
        [python_sans_console(), "-m", "moteur", "veille"], cwd=BASE, env=env,
        stdin=subprocess.DEVNULL, stdout=journal, stderr=subprocess.STDOUT,
        creationflags=SANS_FENETRE, start_new_session=not WINDOWS,
    )
    PID.write_text(str(processus.pid))


def attendre(secondes: int) -> bool:
    for _ in range(secondes):
        if repond():
            return True
        time.sleep(1)
    return repond()


def arreter() -> None:
    if not PID.exists():
        return
    try:
        pid = int(PID.read_text().strip())
    except ValueError:
        pid = None
    if pid:
        if WINDOWS:
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True,
                           creationflags=0x08000000)
        else:
            try:
                os.kill(pid, signal.SIGTERM)
                for _ in range(10):
                    time.sleep(1)
                    os.kill(pid, 0)
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
    PID.unlink(missing_ok=True)


def navigateur() -> str | None:
    if WINDOWS:
        dossiers = [os.environ.get(v, "") for v in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA")]
        for relatif in (r"Microsoft\Edge\Application\msedge.exe", r"Google\Chrome\Application\chrome.exe",
                        r"BraveSoftware\Brave-Browser\Application\brave.exe"):
            for d in dossiers:
                if d and Path(d, relatif).exists():
                    return str(Path(d, relatif))
        return None
    for nom in ("google-chrome", "chromium", "chromium-browser", "brave-browser", "microsoft-edge"):
        if shutil.which(nom):
            return shutil.which(nom)
    return None


def ouvrir() -> None:
    exe = navigateur()
    if exe:
        subprocess.Popen([exe, f"--app={URL}", "--window-size=1200,850"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        webbrowser.open(URL)


def main() -> None:
    if "--arreter-silencieux" in sys.argv:
        arreter()
        return
    if "--arreter" in sys.argv:
        arreter()
        message("Moteur de paris arrêté. Il redémarrera au prochain démarrage du PC ou au prochain double-clic.")
        return
    if not repond():
        demarrer()
        if not attendre(90):
            message(f"Le moteur ne démarre pas. Détails dans :\n{DONNEES / 'moteur.log'}")
            return
    if "--service" not in sys.argv:
        ouvrir()


if __name__ == "__main__":
    main()
