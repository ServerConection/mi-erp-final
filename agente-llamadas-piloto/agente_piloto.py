# AGENTE LLAMADAS PC — PILOTO (producción) — corre en la PC del asesor piloto.
# - El ERP (Inbox WABOT) le manda: conversation_id + token de sesión del asesor.
# - El agente pide el número al backend con ese token + la CLAVE DE ESTA PC
#   (/api/piloto-llamadas/agente/numero/:id). El número nunca vuelve al navegador
#   ni se escribe en el log.
# - Mantiene WhatsApp Desktop fuera de pantalla, fuera de la barra de tareas y sin notificaciones.
# Config: %LOCALAPPDATA%\AgenteLlamadas\config.json  (la clave se cifra con DPAPI al primer arranque)
import os, re, sys, time, json, base64, threading, ctypes, urllib.request, urllib.error, winreg
from ctypes import wintypes
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer

import win32gui, win32con, win32process, win32crypt
import comtypes, comtypes.client
from comtypes import GUID, IUnknown, COMMETHOD, HRESULT
from pywinauto import Desktop

VERSION = "piloto-1"
CARPETA = Path(os.environ.get("LOCALAPPDATA", ".")) / "AgenteLlamadas"
CONFIG = CARPETA / "config.json"
LOG = CARPETA / "agente.log"
PUERTO = 5005
FUERA = -10000
AUMID_WHATSAPP = "5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App"
RE_COLGAR = r"(?i).*(colgar|finalizar|terminar|cortar|end call|hang up|leave).*"
ID_VALIDO = re.compile(r"^[A-Za-z0-9-]{1,64}$")
TOKEN_VALIDO = re.compile(r"^[A-Za-z0-9._-]{20,4096}$")

# ───────────────────────── Log (sin números ni datos de clientes) ─────────────────────────
_log_lock = threading.Lock()
def log(msg):
    try:
        with _log_lock:
            CARPETA.mkdir(parents=True, exist_ok=True)
            if LOG.exists() and LOG.stat().st_size > 1_000_000:
                LOG.replace(CARPETA / "agente.old.log")
            with open(LOG, "a", encoding="utf-8") as f:
                f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}\n")
    except Exception:
        pass

# ───────────────────────── Configuración ─────────────────────────
def cargar_config():
    cfg = json.loads(CONFIG.read_text(encoding="utf-8-sig"))
    # Primer arranque: cifra la clave con DPAPI y la quita del archivo en texto plano.
    if cfg.get("clave"):
        blob = win32crypt.CryptProtectData(cfg.pop("clave").encode(), "AgenteLlamadas", None, None, None, 0)
        cfg["clave_protegida"] = base64.b64encode(blob).decode()
        CONFIG.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    _d, clave = win32crypt.CryptUnprotectData(base64.b64decode(cfg["clave_protegida"]), None, None, None, 0)
    return {
        "backend": cfg["backend"].rstrip("/"),
        "origenes": tuple(cfg.get("origenes") or []),
        "clave": clave.decode(),
    }

CFG = None

# ───────────────────────── Backend ─────────────────────────
def obtener_numero(conv_id, token):
    req = urllib.request.Request(
        f"{CFG['backend']}/api/piloto-llamadas/agente/numero/{conv_id}",
        headers={"Authorization": f"Bearer {token}", "X-Device-Key": CFG["clave"]},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode()).get("error", "")
        except Exception:
            msg = ""
        raise RuntimeError(f"Servidor {e.code}: {msg or 'sin detalle'}")
    numero = str(data.get("numero", ""))
    if not numero.isdigit():
        raise RuntimeError("El servidor no devolvió un número válido")
    return numero

# ───────────────────────── Procesos de WhatsApp ─────────────────────────
_k32 = ctypes.windll.kernel32
_k32.CreateToolhelp32Snapshot.restype = wintypes.HANDLE

class PROCESSENTRY32W(ctypes.Structure):
    _fields_ = [
        ("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD),
        ("th32ProcessID", wintypes.DWORD), ("th32DefaultHeapID", ctypes.c_size_t),
        ("th32ModuleID", wintypes.DWORD), ("cntThreads", wintypes.DWORD),
        ("th32ParentProcessID", wintypes.DWORD), ("pcPriClassBase", ctypes.c_long),
        ("dwFlags", wintypes.DWORD), ("szExeFile", ctypes.c_wchar * 260),
    ]

def mapa_procesos():
    mapa = {}
    snap = _k32.CreateToolhelp32Snapshot(0x2, 0)
    if not snap or snap == wintypes.HANDLE(-1).value:
        return mapa
    e = PROCESSENTRY32W()
    e.dwSize = ctypes.sizeof(PROCESSENTRY32W)
    ok = _k32.Process32FirstW(snap, ctypes.byref(e))
    while ok:
        mapa[e.th32ProcessID] = (e.th32ParentProcessID, e.szExeFile.lower())
        ok = _k32.Process32NextW(snap, ctypes.byref(e))
    _k32.CloseHandle(snap)
    return mapa

_es_wa = {}
def es_whatsapp(pid):
    if pid in _es_wa:
        return _es_wa[pid]
    mapa, actual, r = mapa_procesos(), pid, False
    for _ in range(6):
        if actual not in mapa:
            break
        padre, exe = mapa[actual]
        if exe.startswith("whatsapp"):
            r = True
            break
        actual = padre
    _es_wa[pid] = r
    return r

def ventanas_whatsapp():
    hs = []
    def cb(h, _):
        if win32gui.IsWindowVisible(h):
            _t, pid = win32process.GetWindowThreadProcessId(h)
            if es_whatsapp(pid):
                hs.append(h)
        return True
    win32gui.EnumWindows(cb, None)
    return hs

# ───────────────────────── Ocultar ─────────────────────────
class ITaskbarList(IUnknown):
    _iid_ = GUID("{56FDF342-FD6D-11d0-958A-006097C9A090}")
    _methods_ = [
        COMMETHOD([], HRESULT, "HrInit"),
        COMMETHOD([], HRESULT, "AddTab", (["in"], wintypes.HWND, "hwnd")),
        COMMETHOD([], HRESULT, "DeleteTab", (["in"], wintypes.HWND, "hwnd")),
        COMMETHOD([], HRESULT, "ActivateTab", (["in"], wintypes.HWND, "hwnd")),
        COMMETHOD([], HRESULT, "SetActiveAlt", (["in"], wintypes.HWND, "hwnd")),
    ]

def nueva_taskbar():
    tb = comtypes.client.CreateObject(
        GUID("{56FDF344-FD6D-11d0-958A-006097C9A090}"), interface=ITaskbarList)
    tb.HrInit()
    return tb

def mover(h, x, y):
    if win32gui.IsIconic(h):
        flags, _s, minpos, maxpos, (l, t, r, b) = win32gui.GetWindowPlacement(h)
        win32gui.SetWindowPlacement(
            h, (flags, win32con.SW_SHOWNOACTIVATE, minpos, maxpos, (x, y, x + (r - l), y + (b - t))))
    else:
        win32gui.SetWindowPos(h, 0, x, y, 0, 0,
            win32con.SWP_NOSIZE | win32con.SWP_NOZORDER | win32con.SWP_NOACTIVATE)

def esconder(h, tb):
    l, _t, _r, _b = win32gui.GetWindowRect(h)
    if l > FUERA // 2 or win32gui.IsIconic(h):
        mover(h, FUERA, FUERA)
    tb.DeleteTab(h)

LOCK = threading.Lock()

def vigilante():
    comtypes.CoInitialize()
    tb = nueva_taskbar()
    while True:
        for h in ventanas_whatsapp():
            try:
                esconder(h, tb)
            except Exception:
                pass
        time.sleep(0.02)

def silenciar_notificaciones():
    try:
        ruta = rf"Software\Microsoft\Windows\CurrentVersion\Notifications\Settings\{AUMID_WHATSAPP}"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, ruta) as k:
            winreg.SetValueEx(k, "Enabled", 0, winreg.REG_DWORD, 0)
    except Exception as e:
        log(f"aviso notificaciones: {type(e).__name__}")

# ───────────────────────── Acciones ─────────────────────────
def regex_numero(numero):
    return ".*" + r"\D*".join(re.escape(d) for d in numero[-9:]) + ".*"

def buscar_en_whatsapp(**criterios):
    for h in ventanas_whatsapp():
        try:
            el = Desktop(backend="uia").window(handle=h).child_window(found_index=0, **criterios)
            if el.exists(timeout=0):
                return el
        except Exception:
            pass
    return None

def llamar(numero):
    with LOCK:
        tb = nueva_taskbar()
        for h in ventanas_whatsapp():
            esconder(h, tb)
        os.startfile(f"whatsapp://send?phone={numero}")
        time.sleep(2)
        fin = time.time() + 6
        while time.time() < fin:  # confirma que se abrió el chat correcto
            if buscar_en_whatsapp(title_re=regex_numero(numero)):
                break
            time.sleep(0.3)
        fin = time.time() + 10
        while time.time() < fin:
            btn = buscar_en_whatsapp(title="Llamada", control_type="Button")
            if btn:
                btn.invoke()
                return
            time.sleep(0.3)
        raise RuntimeError("No se encontró el botón Llamada en WhatsApp Desktop")

def colgar():
    with LOCK:
        btn = buscar_en_whatsapp(title_re=RE_COLGAR, control_type="Button")
        if not btn:
            raise RuntimeError("No se encontró el botón para colgar")
        btn.invoke()

# ───────────────────────── Servidor HTTP ─────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # sin consola: nada de logs por stderr

    def origen_ok(self):
        origen = self.headers.get("Origin", "")
        return (not origen) or origen in CFG["origenes"]

    def cors(self):
        origen = self.headers.get("Origin", "")
        if origen in CFG["origenes"]:
            self.send_header("Access-Control-Allow-Origin", origen)
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def responder(self, codigo, data):
        self.send_response(codigo)
        self.cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_OPTIONS(self):
        self.send_response(204 if self.origen_ok() else 403)
        self.cors()
        self.end_headers()

    def do_POST(self):
        if not self.origen_ok():
            return self.responder(403, {"ok": False, "error": "origen no permitido"})
        try:
            if self.path == "/colgar":
                colgar()
                log("colgar ok")
                return self.responder(200, {"ok": True})
            if self.path != "/llamar":
                return self.responder(404, {"ok": False})
            largo = int(self.headers.get("Content-Length", 0))
            datos = json.loads(self.rfile.read(min(largo, 20000)) or b"{}")
            conv_id = str(datos.get("conversation_id", "")).strip()
            token = str(datos.get("token", "")).strip()
            if not ID_VALIDO.match(conv_id) or not TOKEN_VALIDO.match(token):
                return self.responder(400, {"ok": False, "error": "Datos inválidos"})
            llamar(obtener_numero(conv_id, token))
            log(f"llamada ok conv={conv_id}")
            self.responder(200, {"ok": True})
        except Exception as e:
            log(f"error {self.path}: {type(e).__name__}: {e}")
            self.responder(500, {"ok": False, "error": str(e)})

class Servidor(HTTPServer):
    allow_reuse_address = False

def main():
    global CFG
    try:
        CFG = cargar_config()
    except Exception as e:
        log(f"config inválida: {type(e).__name__}")
        sys.exit(1)
    try:
        srv = Servidor(("127.0.0.1", PUERTO), Handler)
    except OSError:
        log("ya hay un agente corriendo en el puerto 5005; salgo")
        sys.exit(0)
    silenciar_notificaciones()
    threading.Thread(target=vigilante, daemon=True).start()
    log(f"agente {VERSION} iniciado")
    srv.serve_forever()

if __name__ == "__main__":
    main()
