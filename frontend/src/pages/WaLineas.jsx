/**
 * WaLineas.jsx — Gestión de líneas WhatsApp en el ERP
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { getSocketCompartido } from "../utils/socketCompartido";
import { estadoEfectivoLinea } from "../utils/waLineStatus";

const API = `${import.meta.env.VITE_API_URL}/api/wa`;
// Conector WABOT-BITRIX: un portal por empresa (VELSA tiene el suyo).
const BITRIX_API = {
  NOVONET: `${import.meta.env.VITE_API_URL}/api/bitrix-connector`,
  VELSA:   `${import.meta.env.VITE_API_URL}/api/bitrix-connector-velsa`,
};
const normalizarEmpresa = (valor) => String(valor || "").trim().toUpperCase();
const portalDeLinea = (line) => {
  const empresa = normalizarEmpresa(
    line.owner_empresa || line.empresa || line.line_empresa
  );
  return empresa === "VELSA" ? "VELSA" : "NOVONET";
};

// /lines/dashboard ya agrupa cada línea por la empresa de su propietario. Se
// usa como respaldo porque algunas versiones antiguas de /lines no incluían
// owner_empresa y el frontend terminaba poniendo todo en NOVONET.
const empresasDesdeDashboard = (data) => {
  const porLinea = new Map();
  for (const grupo of Array.isArray(data) ? data : []) {
    const empresa = normalizarEmpresa(grupo?.empresa);
    for (const asesor of Array.isArray(grupo?.asesores) ? grupo.asesores : []) {
      for (const linea of Array.isArray(asesor?.lineas) ? asesor.lineas : []) {
        if (linea?.id && empresa) porLinea.set(String(linea.id), empresa);
      }
    }
  }
  return porLinea;
};

// Permisos: solo ADMINISTRADOR elimina líneas.
// Crear líneas SIN límite: ADMINISTRADOR y perfiles gerenciales (SUPERVISOR,
// GERENCIA, ANALISTA) — ajuste 2026-08-13 a pedido de gerencia.
// El resto (ASESOR) puede crear su línea solo si aún no tiene ninguna.
const PERFILES_GERENCIALES = ["SUPERVISOR", "GERENCIA", "GERENTE", "ANALISTA"];
const USER_PROFILE = (() => {
  try { return JSON.parse(localStorage.getItem("userProfile") || "{}"); }
  catch { return {}; }
})();
const IS_ADMIN = (USER_PROFILE.perfil || "").toUpperCase() === "ADMINISTRADOR";
const PERFIL_USUARIO = (USER_PROFILE.perfil || "").trim().toUpperCase();
const IS_SUPERVISOR = PERFILES_GERENCIALES.includes(PERFIL_USUARIO) || /^GEREN(?:CIA|TE)[ _-]/.test(PERFIL_USUARIO);
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

// La API entrega el estado persistido en BD (`status`) y el estado vivo de
// Baileys (`rt_status`). Para la interfaz manda siempre el estado vivo; de lo
// contrario, al recargar puede mostrarse "Desconectado" aunque el socket de
// WhatsApp continúe conectado.
const normalizarLinea = (line) => ({
  ...line,
  status: estadoEfectivoLinea(line),
});

// Delegado al socket unico de la app (ver utils/socketCompartido.js):
// antes cada modulo abria el suyo y el backend veia 7 conexiones por usuario.
const getSocket = () => getSocketCompartido();

export default function WaLineas() {
  const [lines, setLines]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [qrModal, setQrModal]   = useState(null); // { lineId, qr }
  const [newName, setNewName]   = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [proxyPool, setProxyPool] = useState(null); // { credenciales, total, en_uso, quemados, libres }
  const [resetting, setResetting] = useState(false);
  // Canales abiertos de Bitrix por portal: { NOVONET: [{ID, LINE_NAME}], VELSA: [...] }
  const [canales, setCanales] = useState({ NOVONET: [], VELSA: [] });
  const [asignando, setAsignando] = useState(null); // lineId en curso
  const puedeAsignarCanal = IS_ADMIN || IS_SUPERVISOR;

  useEffect(() => {
    if (!puedeAsignarCanal) return;
    Object.entries(BITRIX_API).forEach(async ([portal, base]) => {
      try {
        const r = await fetch(`${base}/canales`, { headers: authH(false) });
        const d = await r.json();
        if (d.success) setCanales(prev => ({ ...prev, [portal]: Array.isArray(d.canales) ? d.canales : [] }));
      } catch { /* portal sin conector instalado: sin canales */ }
    });
  }, [puedeAsignarCanal]);

  const asignarCanal = async (line, openLineId) => {
    setAsignando(line.id);
    setError("");
    try {
      const r = await fetch(`${BITRIX_API[portalDeLinea(line)]}/asignar-linea`, {
        method: "POST",
        headers: authH(),
        body: JSON.stringify({ line_id: line.id, open_line_id: openLineId ? Number(openLineId) : null }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.message || "No se pudo conectar el canal abierto");
      setLines(prev => prev.map(l => (l.id === line.id ? { ...l, open_line_id: d.open_line_id } : l)));
    } catch (e) {
      setError(e.message);
    } finally {
      setAsignando(null);
    }
  };
  const qrPollRef = useRef(null);
  const stopQrPoll = () => { if (qrPollRef.current) { clearInterval(qrPollRef.current); qrPollRef.current = null; } };

  // Admin y perfiles gerenciales siempre pueden crear (sin límite).
  // El asesor solo si no tiene ninguna línea propia (si se le eliminó la
  // suya, el formulario vuelve a aparecer automáticamente).
  const misLineas = USER_ID ? lines.filter(l => l.created_by === USER_ID).length : lines.length;
  const canCreate = IS_ADMIN || IS_SUPERVISOR || misLineas === 0;

  const load = useCallback(async () => {
    try {
      const [r, rd] = await Promise.all([
        fetch(`${API}/lines`, { headers: authH(false) }),
        fetch(`${API}/lines/dashboard`, { headers: authH(false) }).catch(() => null),
      ]);
      const d = await r.json();
      const dd = rd?.ok ? await rd.json().catch(() => null) : null;
      const empresaPorLinea = empresasDesdeDashboard(dd?.data);
      setLines(Array.isArray(d?.data) ? d.data.map(line => normalizarLinea({
        ...line,
        owner_empresa: normalizarEmpresa(line.owner_empresa)
          || empresaPorLinea.get(String(line.id))
          || null,
      })) : []);
      setProxyPool(d?.meta?.proxyPool ?? null);
      if (d && d.success === false) setError(d.error || "Error cargando líneas");
    } catch { setError("Error cargando líneas"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket();
    socket.on("line:status", ({ lineId, status }) => {
      // Los parámetros de Express llegan como texto y los IDs de PostgreSQL
      // suelen llegar como número. Compararlos de forma estricta impedía que
      // varios eventos actualizasen la fila correspondiente.
      setLines(prev => prev.map(l => String(l.id) === String(lineId) ? { ...l, status, rt_status: status } : l));
      if (status !== "qr_ready") {
        setQrModal(actual => String(actual?.lineId ?? "") === String(lineId) ? null : actual);
      }
    });

    // El socket puede perder un evento durante una suspensión del navegador o
    // un despliegue. Reconciliar con el backend evita estados visuales viejos.
    const refreshTimer = setInterval(load, 15000);
    const refreshOnFocus = () => load();
    const refreshOnVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnVisible);
    // No abrir QR por eventos automáticos de otras líneas. El modal solo se
    // abre desde connect(id), después de que el usuario pulsa "Conectar QR".
    // El polling HTTP de esa línea concreta actualiza luego la imagen.
    return () => {
      socket.off("line:status");
      socket.off("line:qr");
      clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnVisible);
      stopQrPoll();
    };
  }, [load]);

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
    try {
      const r = await fetch(`${API}/lines/${id}/connect`, { method: "POST", headers: authH(false) });
      const d = await r.json();
      if (!d.success) { setError(d.error || "No se pudo conectar la línea"); return; }
      // Feedback inmediato + obtener el QR por HTTP (confiable, no depende del socket)
      setQrModal({ lineId: id, qr: null });   // muestra "Generando QR…"
      startQrPoll(id);
    } catch { setError("No se pudo conectar la línea"); }
  };

  // Pide el QR por HTTP cada 2s hasta que aparezca (Baileys lo regenera solo).
  // Si la línea se conecta, cierra el modal. Máximo ~2 min.
  const startQrPoll = (id) => {
    stopQrPoll();
    let tries = 0;
    qrPollRef.current = setInterval(async () => {
      tries++;
      try {
        const rl = await fetch(`${API}/lines`, { headers: authH(false) });
        const dl = await rl.json();
        const encontrada = (Array.isArray(dl?.data) ? dl.data : []).find(l => String(l.id) === String(id));
        const line = encontrada ? normalizarLinea(encontrada) : null;
        if (line) setLines(prev => prev.map(l => String(l.id) === String(id) ? { ...l, ...line } : l));
        const st = line?.rt_status || line?.status;
        if (st === "connected") { stopQrPoll(); setQrModal(null); load(); return; }
        // El backend tiene un watchdog: si el socket se cuelga, lo cierra y la
        // línea vuelve a 'disconnected'/'error'. No tiene sentido seguir pidiendo QR.
        if ((st === "disconnected" || st === "error") && tries > 3) {
          stopQrPoll(); setQrModal(null);
          setError("No se pudo generar el QR (WhatsApp no respondió). Revisa el proxy de la línea y reintenta.");
          load(); return;
        }

        const rq = await fetch(`${API}/lines/${id}/qr`, { headers: authH(false) });
        if (rq.ok) {
          const dq = await rq.json();
          if (dq.success && dq.qr) setQrModal({ lineId: id, qr: dq.qr });
        }
      } catch { /* reintenta en el siguiente ciclo */ }
      if (tries > 60) { stopQrPoll(); setError("El QR no se generó a tiempo. Reintenta en un momento."); setQrModal(null); }
    }, 2000);
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

  const resetAll = async () => {
    if (!confirm(
      "¿Desconectar TODAS las líneas?\n\n" +
      "• Se cierra la sesión de cada número (logout).\n" +
      "• Todos los asesores tendrán que volver a escanear el QR.\n" +
      "• Úsalo solo si las líneas están colgadas en \"Conectando…\" o el QR no aparece."
    )) return;
    setError(""); setResetting(true);
    try {
      const r = await fetch(`${API}/lines/reset-all`, { method: "POST", headers: authH(false) });
      const d = await r.json();
      if (d.success) { setQrModal(null); stopQrPoll(); load(); }
      else setError(d.error || "No se pudo reiniciar las líneas");
    } catch { setError("No se pudo reiniciar las líneas"); }
    finally { setResetting(false); }
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

  const lineasPorEmpresa = {
    NOVONET: lines.filter(line => portalDeLinea(line) === "NOVONET"),
    VELSA: lines.filter(line => portalDeLinea(line) === "VELSA"),
  };

  const renderLinea = (line) => (
    <div key={line.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-slate-800 break-words">{line.name}</div>
          {line.phone_number && <div className="text-xs text-slate-500 mt-0.5">+{line.phone_number}</div>}
        </div>
        <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLORS[line.status] || STATUS_COLORS.disconnected}`}>
          {STATUS_LABEL[line.status] || line.status}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full">
          👤 {line.owner_username || "—"}
        </span>
        {puedeAsignarCanal && (
          <select
            value={line.open_line_id || ""}
            disabled={asignando === line.id}
            onChange={e => asignarCanal(line, e.target.value)}
            title={`Canal abierto de Bitrix ${portalDeLinea(line)} al que entrega esta línea`}
            className={`min-w-0 flex-1 text-xs border rounded-lg px-2 py-1.5 ${line.open_line_id ? "border-green-300 text-green-700 bg-green-50" : "border-slate-200 text-slate-500"}`}
          >
            <option value="">Sin canal abierto</option>
            {(canales[portalDeLinea(line)] || []).map(c => (
              <option key={c.ID} value={c.ID}>🔗 {c.LINE_NAME || `Canal ${c.ID}`}</option>
            ))}
            {line.open_line_id && !(canales[portalDeLinea(line)] || []).some(c => String(c.ID) === String(line.open_line_id)) && (
              <option value={line.open_line_id}>🔗 Canal {line.open_line_id}</option>
            )}
          </select>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
        {line.status === "connected" ? (
          <button onClick={() => disconnect(line.id)} className="text-xs border border-slate-200 hover:border-red-300 hover:text-red-500 px-3 py-1.5 rounded-lg transition-colors">
            Desconectar
          </button>
        ) : (
          <button onClick={() => connect(line.id)} className="text-xs bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors">
            Conectar QR
          </button>
        )}
        <button onClick={() => remove(line.id)} title="Dar de baja la línea (se conserva el historial de chats)" className="text-xs text-slate-400 hover:text-red-400 px-2 py-1.5 rounded-lg transition-colors">
          🗑️
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            📱 Líneas WhatsApp
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Cada línea es un número de WhatsApp conectado. Escanea el QR desde tu teléfono.
          </p>
        </div>
        {IS_ADMIN && (
          <button
            onClick={resetAll}
            disabled={resetting}
            title="Cierra sesión en todas las líneas. Úsalo si están colgadas."
            className="shrink-0 text-xs border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            {resetting ? "Desconectando…" : "Desconectar todas"}
          </button>
        )}
      </div>

      {/* Aviso del pool de proxies (IPs) */}
      {proxyPool && proxyPool.credenciales === false && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-3 py-2 mb-4">
          ⚠️ No hay credenciales de proxy configuradas (<code>PROXY_USER</code> / <code>PROXY_PASS</code>).
          Las líneas se conectarán por la IP del servidor.
        </div>
      )}
      {proxyPool && proxyPool.credenciales !== false && proxyPool.libres === 0 && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-3 py-2 mb-4">
          🛑 <b>Pool de proxies agotado.</b> No quedan IPs libres
          ({proxyPool.en_uso} en uso, {proxyPool.quemados} retiradas de {proxyPool.total}).
          Las líneas nuevas no podrán conectar hasta liberar o ampliar IPs.
        </div>
      )}
      {proxyPool && proxyPool.credenciales !== false && proxyPool.libres > 0 && proxyPool.libres <= 5 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-3 py-2 mb-4">
          ⚠️ Quedan solo <b>{proxyPool.libres}</b> IP(s) libres en el pool de proxies
          ({proxyPool.en_uso}/{proxyPool.total} en uso). Considera ampliar el plan.
        </div>
      )}

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {[
            { empresa: "NOVONET", color: "blue" },
            { empresa: "VELSA", color: "violet" },
          ].map(({ empresa, color }) => (
            <section key={empresa} className="min-w-0">
              <div className={`mb-3 flex items-center justify-between rounded-xl border px-4 py-3 ${color === "blue" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-violet-200 bg-violet-50 text-violet-800"}`}>
                <h2 className="text-sm font-black tracking-wide">{empresa}</h2>
                <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold">
                  {lineasPorEmpresa[empresa].length} línea(s)
                </span>
              </div>
              <div className="space-y-3">
                {lineasPorEmpresa[empresa].length > 0
                  ? lineasPorEmpresa[empresa].map(renderLinea)
                  : <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">No hay líneas de {empresa}</div>}
              </div>
            </section>
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
