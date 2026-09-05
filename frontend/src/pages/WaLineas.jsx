/**
 * WaLineas.jsx — Gestión de líneas WhatsApp en el ERP
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { io } from "socket.io-client";

const API = `${import.meta.env.VITE_API_URL}/api/wa`;

// Permisos: solo ADMINISTRADOR elimina líneas.
// Crear líneas SIN límite: ADMINISTRADOR y perfiles gerenciales (SUPERVISOR,
// GERENCIA, ANALISTA) — ajuste 2026-08-13 a pedido de gerencia.
// El resto (ASESOR) puede crear su línea solo si aún no tiene ninguna.
const PERFILES_GERENCIALES = ["SUPERVISOR", "GERENCIA", "ANALISTA"];
const USER_PROFILE = (() => {
  try { return JSON.parse(localStorage.getItem("userProfile") || "{}"); }
  catch { return {}; }
})();
const IS_ADMIN = (USER_PROFILE.perfil || "").toUpperCase() === "ADMINISTRADOR";
const IS_SUPERVISOR = PERFILES_GERENCIALES.includes((USER_PROFILE.perfil || "").toUpperCase());
const USER_ID  = USER_PROFILE.id || null;
const authH = (json = true) => {
  const h = { Authorization: `Bearer ${localStorage.getItem("token")}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
};

const STATUS_COLORS = {
  connected:    "bg-green-100 text-green-700 border-green-200",
  disconnected: "bg-slate-100 text-slate-500 border-slate-200",
  connecting:   "bg-yellow-100 text-yellow-700 border-yellow-200",
  qr_ready:     "bg-blue-100 text-blue-700 border-blue-200",
  error:        "bg-red-100 text-red-600 border-red-200",
};
const STATUS_LABEL = {
  connected:    "Conectado",
  disconnected: "Desconectado",
  connecting:   "Conectando…",
  qr_ready:     "Esperando QR",
  error:        "Error",
};

let _socket = null;
const getSocket = () => {
  if (!_socket) {
    _socket = io(import.meta.env.VITE_API_URL, {
      auth: { token: localStorage.getItem("token") },
      transports: ["websocket", "polling"],
    });
  }
  return _socket;
};

export default function WaLineas() {
  const [lines, setLines]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [qrModal, setQrModal]   = useState(null); // { lineId, qr }
  const [newName, setNewName]   = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const qrPollRef = useRef(null);
  const qrSocketRef = useRef(null);
  const stopQrPoll = () => {
    if (qrPollRef.current) {
      clearInterval(qrPollRef.current);
      qrPollRef.current = null;
    }
    if (qrSocketRef.current) {
      const socket = getSocket();
      socket.off(qrSocketRef.current.event, qrSocketRef.current.handler);
      qrSocketRef.current = null;
    }
  };

  // Admin y perfiles gerenciales siempre pueden crear (sin límite).
  // El asesor solo si no tiene ninguna línea propia (si se le eliminó la
  // suya, el formulario vuelve a aparecer automáticamente).
  const misLineas = USER_ID ? lines.filter(l => l.created_by === USER_ID).length : lines.length;
  const canCreate = IS_ADMIN || IS_SUPERVISOR || misLineas === 0;

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/lines`, { headers: authH(false) });
      const d = await r.json();
      setLines(Array.isArray(d?.data) ? d.data : []);
      if (d && d.success === false) setError(d.error || "Error cargando líneas");
    } catch { setError("Error cargando líneas"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket();
    socket.on("line:status", ({ lineId, status }) => {
      setLines(prev => prev.map(l => l.id === lineId ? { ...l, status } : l));
      if (status === "connected") {
        setQrModal(current => current?.lineId === lineId ? null : current);
      }
    });
    return () => { socket.off("line:status"); socket.off("line:qr"); stopQrPoll(); };
  }, []);

  const create = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const r = await fetch(`${API}/lines`, {
        method: "POST",
        headers: authH(),
        body: JSON.stringify({ name: newName.trim() }),
      });
      const d = await r.json();
      if (d.success) { setNewName(""); load(); }
      else setError(d.error || "No se pudo crear la línea");
    } catch { setError("No se pudo crear la línea"); }
    finally { setSaving(false); }
  };

  const connect = async (id) => {
    setError("");
    // Abrir inmediatamente: el endpoint puede tardar mientras Baileys inicia.
    // Además, se escucha solo el evento de la línea que el usuario solicitó.
    setQrModal({ lineId: id, qr: null });
    startQrPoll(id);
    try {
      const r = await fetch(`${API}/lines/${id}/connect`, { method: "POST", headers: authH(false) });
      const d = await r.json();
      if (!d.success) {
        stopQrPoll();
        setQrModal(null);
        setError(d.error || "No se pudo conectar la línea");
      }
    } catch {
      stopQrPoll();
      setQrModal(null);
      setError("No se pudo conectar la línea");
    }
  };

  const pollQr = async (id) => {
    try {
      const rq = await fetch(`${API}/lines/${id}/qr`, { headers: authH(false) });
      if (!rq.ok) return;
      const dq = await rq.json();
      if (dq.success && dq.qr) setQrModal({ lineId: id, qr: dq.qr });
    } catch { /* el intervalo vuelve a intentar */ }
  };

  // Socket para respuesta instantánea + HTTP como respaldo si el evento se
  // emitió antes de que el navegador terminara de suscribirse.
  const startQrPoll = (id) => {
    stopQrPoll();
    const socket = getSocket();
    const event = `line:qr:${id}`;
    const handler = ({ qr }) => {
      if (qr) setQrModal({ lineId: id, qr });
    };
    socket.on(event, handler);
    qrSocketRef.current = { event, handler };
    void pollQr(id);
    qrPollRef.current = setInterval(() => { void pollQr(id); }, 2000);
  };

  const disconnect = async (id) => {
    if (!confirm("¿Desconectar esta línea?")) return;
    setError("");
    try {
      const r = await fetch(`${API}/lines/${id}/disconnect`, { method: "POST", headers: authH(false) });
      const d = await r.json();
      if (d.success) setLines(prev => prev.map(l => l.id === id ? { ...l, status: "disconnected" } : l));
      else setError(d.error || "No se pudo desconectar la línea");
    } catch { setError("No se pudo desconectar la línea"); }
  };

  const remove = async (id) => {
    if (!confirm(
      "¿Dar de baja esta línea?\n\n" +
      "• Se desvincula el número de WhatsApp (habrá que escanear un QR nuevo).\n" +
      "• El historial de chats NO se borra: seguirá visible en el Inbox.\n" +
      "• Quedarás libre para vincular otro número."
    )) return;
    setError("");
    try {
      const r = await fetch(`${API}/lines/${id}`, { method: "DELETE", headers: authH(false) });
      const d = await r.json();
      if (d.success) setLines(prev => prev.filter(l => l.id !== id));
      else setError(d.error || "No se pudo eliminar la línea");
    } catch { setError("No se pudo eliminar la línea"); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          📱 Líneas WhatsApp
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Cada línea es un número de WhatsApp conectado. Escanea el QR desde tu teléfono.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-3 py-2 mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-600 ml-3">✕</button>
        </div>
      )}

      {/* Agregar línea — admin sin límite; asesor solo si aún no tiene línea propia */}
      {canCreate && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 flex gap-3">
          <input
            type="text"
            placeholder="Nombre de la línea (ej. Ventas Principal)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && create()}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
          />
          <button
            onClick={create}
            disabled={saving || !newName.trim()}
            className="bg-green-600 hover:bg-green-500 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? "Creando…" : "+ Agregar"}
          </button>
        </div>
      )}

      {/* Lista de líneas */}
      {lines.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-5xl mb-3">📱</div>
          <div className="font-medium text-slate-500">No hay líneas aún</div>
          <div className="text-sm mt-1">Crea una línea para empezar</div>
        </div>
      ) : (
        <div className="space-y-3">
          {lines.map(line => (
            <div key={line.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
              <div className="flex-1">
                <div className="font-semibold text-slate-800">{line.name}</div>
                {line.phone_number && (
                  <div className="text-xs text-slate-500 mt-0.5">+{line.phone_number}</div>
                )}
              </div>

              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full">
                👤 {line.owner_username || "—"}
              </span>

              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLORS[line.status] || STATUS_COLORS.disconnected}`}>
                {STATUS_LABEL[line.status] || line.status}
              </span>

              <div className="flex gap-2">
                {line.status === "connected" ? (
                  <button onClick={() => disconnect(line.id)}
                    className="text-xs border border-slate-200 hover:border-red-300 hover:text-red-500 px-3 py-1.5 rounded-lg transition-colors">
                    Desconectar
                  </button>
                ) : (
                  <button onClick={() => connect(line.id)}
                    className="text-xs bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors">
                    Conectar QR
                  </button>
                )}
                <button onClick={() => remove(line.id)}
                  title="Dar de baja la línea (se conserva el historial de chats)"
                  className="text-xs text-slate-400 hover:text-red-400 px-2 py-1.5 rounded-lg transition-colors">
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal QR */}
      {qrModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
            <h3 className="font-bold text-slate-800 mb-1">Escanea el QR</h3>
            <p className="text-xs text-slate-500 mb-4">
              Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo
            </p>
            {qrModal.qr ? (
              <img src={qrModal.qr} alt="QR WhatsApp" className="mx-auto rounded-xl border" />
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin mb-3" />
                <div className="text-sm">Generando QR…</div>
              </div>
            )}
            <button onClick={() => { setQrModal(null); stopQrPoll(); }}
              className="mt-4 text-sm text-slate-500 hover:text-slate-700">
              Cerrar
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
