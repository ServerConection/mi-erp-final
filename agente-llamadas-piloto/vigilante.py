# VIGILANTE — mantiene vivo AgenteLlamadas.exe (piloto).
# Corre oculto desde el arranque de Windows. Si el asesor cierra el agente
# (Administrador de tareas, etc.), lo vuelve a abrir en < 20 s. No requiere admin.
import os, sys, time, ctypes, subprocess
from pathlib import Path

CARPETA = Path(os.environ.get("LOCALAPPDATA", ".")) / "AgenteLlamadas"
EXE = CARPETA / "AgenteLlamadas.exe"
LOG = CARPETA / "vigilante.log"
CREATE_NO_WINDOW = 0x08000000

def log(msg):
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}\n")
    except Exception:
        pass

def corriendo():
    # ¿Hay algún AgenteLlamadas.exe vivo? (tasklist no requiere admin)
    try:
        out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq AgenteLlamadas.exe"],
                             capture_output=True, text=True, creationflags=CREATE_NO_WINDOW)
        return "AgenteLlamadas.exe" in out.stdout
    except Exception:
        return False

def main():
    # Un solo vigilante a la vez (mutex global por usuario).
    mutex = ctypes.windll.kernel32.CreateMutexW(None, False, "Local\\AgenteLlamadasVigilante")
    if ctypes.windll.kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
        sys.exit(0)
    log("vigilante iniciado")
    while True:
        try:
            if EXE.exists() and not corriendo():
                subprocess.Popen([str(EXE)], cwd=str(CARPETA), creationflags=CREATE_NO_WINDOW)
                log("agente reiniciado")
        except Exception as e:
            log(f"error: {type(e).__name__}: {e}")
        time.sleep(15)

if __name__ == "__main__":
    main()
