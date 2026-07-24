/**
 * WaInbox.jsx — Bandeja de conversaciones WhatsApp en el ERP
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { io } from "socket.io-client";
import { exportChatPDF } from "./WaRespaldos";

const ORIGIN = import.meta.env.VITE_API_URL;
const API = `${ORIGIN}/api/wa`;
// media_url relativo (/wa-uploads/...) → anteponer origen para mostrarlo
const mediaSrc = (url) => (!url ? url : /^https?:\/\//.test(url) ? url : `${ORIGIN}${url}`);
const isImage = (msg) => msg.type === "image" || /\.(jpe?g|png|gif|webp)$/i.test(msg.media_url || "");

// Empresa del usuario (para construir el enlace correcto a Bitrix)
const USER_PROFILE = (() => {
  try { return JSON.parse(localStorage.getItem("userProfile") || "{}"); }
  catch { return {}; }
})();
const USER_EMPRESA = (USER_PROFILE.empresa || "").toUpperCase();
const USER_PERFIL  = (USER_PROFILE.perfil || "").toUpperCase();
const CAN_PICK_LINE = USER_PERFIL === "ADMINISTRADOR" || USER_PERFIL === "SUPERVISOR";
const BITRIX_DEAL_BASE = {
  VELSA:   "https://aclopecuador.bitrix24.es/crm/deal/details",
  NOVONET: "https://novonet.bitrix24.es/crm/deal/details",
};
const bitrixDealUrl = (dealId) => {
  const base = BITRIX_DEAL_BASE[USER_EMPRESA];
  return base ? `${base}/${dealId}/` : null;
};
const authH = (json = true) => {
  const h = { Authorization: `Bearer ${localStorage.getItem("token")}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
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

const STATUS_BADGE = {
  active:         "bg-green-100 text-green-700",
  human:          "bg-blue-100 text-blue-700",
  human_takeover: "bg-blue-100 text-blue-700",
  closed:         "bg-slate-100 text-slate-400",
  bot:            "bg-purple-100 text-purple-600",
};
const STATUS_LABEL = { active: "Activa", human: "Humano", human_takeover: "Humano", closed: "Cerrada", bot: "Bot" };

const timeAgo = (ts) => {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return new Date(ts).toLocaleDateString("es-GT", { day: "numeric", month: "short" });
};

export default function WaInbox() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [selected, setSelected]           = useState(null);
  const [messages, setMessages]           = useState([]);
  const [newMsg, setNewMsg]               = useState("");
  const [sending, setSending]             = useState(false);
  const [uploading, setUploading]         = useState(false);
  const [filter, setFilter]               = useState("all"); // all|active|human_takeover|closed
  const [search, setSearch]               = useState("");
  const messagesEndRef = useRef(null);
  const selectedRef = useRef(null);          // evita closure viejo en el socket
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // Bitrix: modal nueva conversación e ingreso de ID
  const [bitrixModal, setBitrixModal] = useState(null); // "new" | "add"
  const [bitrixId, setBitrixId]       = useState("");
  const [bitrixBusy, setBitrixBusy]   = useState(false);
  const [newMode, setNewMode]         = useState("phone"); // "phone" | "bitrix" (en modal nueva)
  const [newPhone, setNewPhone]       = useState("");
  const [newLineId, setNewLineId]     = useState("");
  const [lines, setLines]             = useState([]);      // TODAS las líneas visibles (admin/supervisor)
  const [lineFilter, setLineFilter]   = useState("");      // filtro por línea/usuario en la lista

  const connectedLines = lines.filter(l => (l.rt_status || l.status) === "connected");

  // Cargar líneas visibles (para filtrar por usuario y elegir línea de envío)
  useEffect(() => {
    if (!CAN_PICK_LINE) return;
    (async () => {
      try {
        const r = await fetch(`${API}/lines`, { headers: authH(false) });
        const d = await r.json();
        setLines(Array.isArray(d?.data) ? d.data : []);
      } catch { /* ignore */ }
    })();
  }, []);

  const asArray = (d) => (Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : []);

  const loadConvs = useCallback(async (lineId = "") => {
    try {
      const qs = lineId ? `?line_id=${encodeURIComponent(lineId)}` : "";
      const r = await fetch(`${API}/conversations${qs}`, { headers: authH(false) });
      const d = await r.json();
      setConversations(asArray(d));
    } catch (e) {
      console.error("[WaInbox] Error cargando:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Recargar al cambiar el filtro de línea/usuario
  useEffect(() => { loadConvs(lineFilter); }, [lineFilter, loadConvs]);

  const loadMessages = useCallback(async (convId) => {
    try {
      const r = await fetch(`${API}/conversations/${convId}/messages`, { headers: authH(false) });
      const d = await r.json();
      setMessages(asArray(d));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) {
      console.error("[WaInbox] Error cargando mensajes:", e);
    }
  }, []);

  useEffect(() => {
    // La carga inicial la hace el efecto del filtro (lineFilter). Aquí solo el socket.
    const socket = getSocket();
    socket.on("conversation:new", (conv) => {
      setConversations(prev => [conv, ...prev.filter(c => c.id !== conv.id)]);
    });
    socket.on("message:new", (msg) => {
      setConversations(prev => {
        const exists = prev.some(c => c.id === msg.conversation_id);
        if (!exists && msg.conversation_id) loadConvs(); // conversación nueva → recargar lista
        return prev.map(c =>
          c.id === msg.conversation_id
            ? { ...c, last_msg_at: msg.timestamp, last_message: msg.content || msg.text,
                unread_count: (c.unread_count || 0) + (msg.direction === "in" && selectedRef.current?.id !== c.id ? 1 : 0) }
            : c
        );
      });
      if (selectedRef.current?.id === msg.conversation_id) {
        setMessages(prev => [...prev, { ...msg, content: msg.content || msg.text }]);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    });
    return () => { socket.off("conversation:new"); socket.off("message:new"); };
  }, []);

  useEffect(() => {
    if (selected) loadMessages(selected.id);
  }, [selected]);

  const selectConv = (conv) => {
    setSelected(conv);
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
  };

  const send = async () => {
    if (!newMsg.trim() || !selected || sending) return;
    setSending(true);
    const text = newMsg.trim();
    setNewMsg("");
    try {
      const r = await fetch(`${API}/conversations/${selected.id}/send`, {
        method: "POST", headers: authH(),
        body: JSON.stringify({ text }),   // el backend espera "text"
      });
      const d = await r.json();
      if (!d.success) alert(d.error || "No se pudo enviar");
      loadMessages(selected.id);          // refresca para ver el mensaje enviado
    } finally { setSending(false); }
  };

  // Enviar imagen/PDF: sube el archivo y lo manda por WhatsApp
  const sendFile = async (file) => {
    if (!file || !selected || uploading) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const rUp = await fetch(`${API}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: fd,
      });
      const dUp = await rUp.json();
      if (!dUp.success || !dUp.data) { alert(dUp.error || "No se pudo subir el archivo"); return; }

      const r = await fetch(`${API}/conversations/${selected.id}/send`, {
        method: "POST", headers: authH(),
        body: JSON.stringify({
          text: newMsg.trim(),   // el texto escrito va como caption (opcional)
          media_url: dUp.data.url,
          media_type: dUp.data.mimetype?.startsWith("image/") ? "image" : "document",
          media_filename: dUp.data.originalname,
        }),
      });
      const d = await r.json();
      if (!d.success) alert(d.error || "No se pudo enviar");
      setNewMsg("");
      loadMessages(selected.id);
    } catch (e) {
      console.error("[WaInbox] Error enviando archivo:", e);
      alert("Error enviando el archivo");
    } finally { setUploading(false); }
  };

  const takeOver = async () => {
    await fetch(`${API}/conversations/${selected.id}/takeover`, { method: "POST", headers: authH(false) });
    setSelected(s => ({ ...s, status: "human_takeover" }));
    setConversations(prev => prev.map(c => c.id === selected.id ? { ...c, status: "human_takeover" } : c));
  };

  const returnToBot = async () => {
    await fetch(`${API}/conversations/${selected.id}/return-to-bot`, { method: "POST", headers: authH(false) });
    setSelected(s => ({ ...s, status: "active" }));
    setConversations(prev => prev.map(c => c.id === selected.id ? { ...c, status: "active" } : c));
  };

  // Iniciar conversación: por número directo o por ID de negociación
  const startConversation = async () => {
    if (bitrixBusy) return;
    const body = {};
    if (newMode === "phone") {
      if (!newPhone.trim()) return;
      body.phone = newPhone.trim();
      if (bitrixId.trim()) body.bitrix_id = bitrixId.trim(); // opcional
    } else {
      if (!bitrixId.trim()) return;
      body.bitrix_id = bitrixId.trim();
    }
    if (CAN_PICK_LINE && newLineId) body.line_id = newLineId;

    setBitrixBusy(true);
    try {
      const r = await fetch(`${API}/bitrix/start`, {
        method: "POST", headers: authH(),
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!d.success) { alert(d.error || "No se pudo iniciar la conversación"); return; }
      setConversations(prev => [d.data, ...prev.filter(c => c.id !== d.data.id)]);
      setSelected(d.data);
      setBitrixModal(null); setBitrixId(""); setNewPhone("");
    } catch (e) {
      alert("Error al iniciar la conversación");
    } finally { setBitrixBusy(false); }
  };

  // Asociar un ID Bitrix a la conversación abierta
  const addBitrixId = async () => {
    const id = bitrixId.trim();
    if (!id || !selected || bitrixBusy) return;
    setBitrixBusy(true);
    try {
      const r = await fetch(`${API}/conversations/${selected.id}/bitrix`, {
        method: "PUT", headers: authH(),
        body: JSON.stringify({ bitrix_id: id }),
      });
      const d = await r.json();
      if (!d.success) { alert(d.error || "No se pudo guardar"); return; }
      setSelected(s => ({ ...s, bitrix_deal_id: id }));
      setConversations(prev => prev.map(c => c.id === selected.id ? { ...c, bitrix_deal_id: id } : c));
      setBitrixModal(null); setBitrixId("");
    } finally { setBitrixBusy(false); }
  };

  const filtered = conversations.filter(c => {
    if (filter !== "all" && c.status !== filter) return false;
    if (search && !(c.wa_number || "").includes(search) && !(c.contact_name || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-120px)] gap-0 -mx-6 -mb-6">
      {/* Lista de conversaciones */}
      <div className={`flex flex-col border-r border-slate-200 bg-white ${selected ? "hidden md:flex" : "flex"} w-full md:w-80 flex-shrink-0`}>
        <div className="p-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-slate-800">💬 Inbox</h2>
            <button onClick={() => { setBitrixId(""); setBitrixModal("new"); }}
              title="Iniciar conversación con un ID de negociación de Bitrix"
              className="text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg font-medium transition-colors">
              + Nueva
            </button>
          </div>
          <input type="text" placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-green-400 mb-2" />

          {/* Filtro por usuario/línea (admin y supervisor) */}
          {CAN_PICK_LINE && lines.length > 0 && (
            <select value={lineFilter} onChange={e => setLineFilter(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-green-400 mb-2 bg-white">
              <option value="">👥 Todos los asesores / líneas</option>
              {lines.map(l => (
                <option key={l.id} value={l.id}>
                  {l.owner_username ? `${l.owner_username} — ` : ""}{l.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-1">
            {[
              { key: "all",            label: "Todos" },
              { key: "active",         label: "Activos" },
              { key: "human_takeover", label: "Humano" },
              { key: "closed",         label: "Cerrados" },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`flex-1 text-xs py-1 rounded-lg font-medium transition-colors ${
                  filter === f.key ? "bg-green-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <div className="text-3xl mb-2">💬</div>
              <div className="text-sm">No hay conversaciones</div>
            </div>
          ) : filtered.map(conv => (
            <button key={conv.id} onClick={() => selectConv(conv)}
              className={`w-full text-left p-3 border-b border-slate-100 hover:bg-slate-50 transition-colors flex gap-3 items-start ${
                selected?.id === conv.id ? "bg-green-50 border-l-2 border-l-green-500" : ""
              }`}
            >
              <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm flex-shrink-0">
                {(conv.contact_name || conv.wa_number || "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-semibold text-slate-800 truncate">
                    {conv.contact_name || `+${conv.wa_number}`}
                  </span>
                  <span className="text-xs text-slate-400 flex-shrink-0">{timeAgo(conv.last_msg_at)}</span>
                </div>
                {conv.last_message && (
                  <div className="text-xs text-slate-400 truncate mt-0.5">
                    {conv.last_direction === "out" ? "Tú: " : ""}{conv.last_message}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[conv.status] || STATUS_BADGE.active}`}>
                    {STATUS_LABEL[conv.status] || conv.status}
                  </span>
                  {conv.line_name && (
                    <span className="text-xs text-slate-400 truncate">📱 {conv.line_name}</span>
                  )}
                  {conv.unread_count > 0 && (
                    <span className="ml-auto bg-green-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold flex-shrink-0">
                      {conv.unread_count > 9 ? "9+" : conv.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Panel de chat */}
      {selected ? (
        <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
          {/* Header */}
          <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
            <button onClick={() => setSelected(null)} className="md:hidden text-slate-400 mr-1">←</button>
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm flex-shrink-0">
              {(selected.contact_name || selected.wa_number || "?").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-800 text-sm truncate">
                {selected.contact_name || `+${selected.wa_number}`}
              </div>
              <div className="text-xs text-slate-500">+{selected.wa_number}</div>
            </div>
            <div className="flex gap-2">
              {selected.bitrix_deal_id ? (
                <a href={bitrixDealUrl(selected.bitrix_deal_id) || "#"} target="_blank" rel="noopener noreferrer"
                  onClick={e => { if (!bitrixDealUrl(selected.bitrix_deal_id)) { e.preventDefault(); alert("Tu empresa no tiene enlace de Bitrix configurado."); } }}
                  title={`Abrir negociación ${selected.bitrix_deal_id} en Bitrix`}
                  className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors">
                  🔗 Bitrix #{selected.bitrix_deal_id}
                </a>
              ) : (
                <button onClick={() => { setBitrixId(""); setBitrixModal("add"); }}
                  title="Asociar un ID de negociación de Bitrix a esta conversación"
                  className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors">
                  + ID Bitrix
                </button>
              )}
              <button onClick={() => exportChatPDF({
                  wa_number: selected.wa_number,
                  contact_name: selected.contact_name,
                  line_name: selected.line_name,
                  messages,
                })}
                title="Exportar conversación a PDF"
                className="text-xs bg-slate-50 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                📄 PDF
              </button>
              {!["human", "human_takeover"].includes(selected.status) ? (
                <button onClick={takeOver}
                  className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">
                  👤 Tomar control
                </button>
              ) : (
                <button onClick={returnToBot}
                  className="text-xs bg-purple-50 border border-purple-200 text-purple-700 px-3 py-1.5 rounded-lg hover:bg-purple-100 transition-colors">
                  🤖 Regresar a bot
                </button>
              )}
            </div>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {messages.length === 0 && (
              <div className="text-center py-12 text-slate-400 text-sm">Sin mensajes aún</div>
            )}
            {messages.map((msg, i) => (
              <div key={msg.id || i} className={`flex ${msg.direction === "out" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  msg.direction === "out"
                    ? "bg-green-600 text-white rounded-br-sm"
                    : "bg-white text-slate-800 border border-slate-200 rounded-bl-sm shadow-sm"
                }`}>
                  {msg.media_url && isImage(msg) ? (
                    <a href={mediaSrc(msg.media_url)} target="_blank" rel="noopener noreferrer">
                      <img src={mediaSrc(msg.media_url)} alt="imagen"
                        className="rounded-lg max-h-48 mb-1 border border-black/10" />
                    </a>
                  ) : msg.media_url && msg.type === "audio" ? (
                    <audio controls src={mediaSrc(msg.media_url)} className="max-w-full mb-1" />
                  ) : msg.media_url ? (
                    <a href={mediaSrc(msg.media_url)} target="_blank" rel="noopener noreferrer"
                      className={`text-xs underline ${msg.direction === "out" ? "text-green-100" : "text-blue-500"}`}>
                      📎 Ver archivo
                    </a>
                  ) : null}
                  {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}
                  <div className={`text-xs mt-0.5 ${msg.direction === "out" ? "text-green-100" : "text-slate-400"}`}>
                    {new Date(msg.timestamp).toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" })}
                    {msg.direction === "out" && (
                      <span className="ml-1">
                        {msg.status === "read" ? "✓✓" : msg.status === "delivered" ? "✓✓" : "✓"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="bg-white border-t border-slate-200 p-3 flex gap-2 items-center">
            <label className={`cursor-pointer text-xl px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-colors ${uploading ? "opacity-40 pointer-events-none" : ""}`}
              title="Enviar imagen o PDF">
              {uploading ? "⏳" : "📎"}
              <input
                type="file" accept="image/*,.pdf"
                className="hidden"
                disabled={uploading}
                onChange={e => { sendFile(e.target.files?.[0]); e.target.value = ""; }}
              />
            </label>
            <input
              type="text"
              placeholder="Escribe un mensaje…"
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-green-400"
            />
            <button onClick={send} disabled={sending || !newMsg.trim()}
              className="bg-green-600 hover:bg-green-500 disabled:bg-slate-300 text-white px-4 py-2 rounded-xl transition-colors text-sm font-medium">
              {sending ? "…" : "Enviar"}
            </button>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-slate-50">
          <div className="text-center text-slate-400">
            <div className="text-6xl mb-3">💬</div>
            <div className="font-medium text-slate-500">Selecciona una conversación</div>
            <div className="text-sm mt-1">para ver los mensajes</div>
          </div>
        </div>
      )}

      {/* Modal: asociar ID Bitrix a conversación existente */}
      {bitrixModal === "add" && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Asociar ID Bitrix</h3>
              <p className="text-xs text-slate-500 mt-1">
                Vincula el ID de negociación a la conversación con +{selected?.wa_number}.
              </p>
            </div>
            <div className="p-5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">ID de negociación (Bitrix)</label>
              <input
                type="text" inputMode="numeric" autoFocus placeholder="Ej. 56124"
                value={bitrixId} onChange={e => setBitrixId(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addBitrixId()}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
              />
            </div>
            <div className="p-4 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => { setBitrixModal(null); setBitrixId(""); }}
                className="text-sm text-slate-500 px-4 py-2 hover:text-slate-700">Cancelar</button>
              <button onClick={addBitrixId} disabled={bitrixBusy || !bitrixId.trim()}
                className="bg-green-600 hover:bg-green-500 disabled:bg-slate-300 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                {bitrixBusy ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: nueva conversación (por número o por ID Bitrix) */}
      {bitrixModal === "new" && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Nueva conversación</h3>
              <p className="text-xs text-slate-500 mt-1">Inicia un chat por número directo o por ID de negociación.</p>
            </div>
            <div className="p-5 space-y-4">
              {/* Selector de modo */}
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                {[{ k: "phone", l: "📱 Por número" }, { k: "bitrix", l: "🔗 Por ID Bitrix" }].map(t => (
                  <button key={t.k} onClick={() => setNewMode(t.k)}
                    className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                      newMode === t.k ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>
                    {t.l}
                  </button>
                ))}
              </div>

              {newMode === "phone" ? (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Número de teléfono</label>
                    <input type="text" inputMode="tel" autoFocus placeholder="Ej. 0987654321 o 593987654321"
                      value={newPhone} onChange={e => setNewPhone(e.target.value)}
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">ID de negociación (opcional)</label>
                    <input type="text" inputMode="numeric" placeholder="Ej. 56124 — puedes dejarlo vacío"
                      value={bitrixId} onChange={e => setBitrixId(e.target.value)}
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
                  </div>
                </>
              ) : (
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">ID de negociación (Bitrix)</label>
                  <input type="text" inputMode="numeric" autoFocus placeholder="Ej. 56124"
                    value={bitrixId} onChange={e => setBitrixId(e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
                  <p className="text-xs text-slate-400 mt-1">Traeremos el teléfono desde Bitrix ({USER_EMPRESA || "—"}).</p>
                </div>
              )}

              {/* Selector de línea (solo admin/supervisor) */}
              {CAN_PICK_LINE && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Responder desde la línea</label>
                  <select value={newLineId} onChange={e => setNewLineId(e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400">
                    <option value="">Automática (primera conectada)</option>
                    {connectedLines.map(l => <option key={l.id} value={l.id}>{l.name}{l.owner_username ? ` · ${l.owner_username}` : ""}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => { setBitrixModal(null); setBitrixId(""); setNewPhone(""); }}
                className="text-sm text-slate-500 px-4 py-2 hover:text-slate-700">Cancelar</button>
              <button onClick={startConversation}
                disabled={bitrixBusy || (newMode === "phone" ? !newPhone.trim() : !bitrixId.trim())}
                className="bg-green-600 hover:bg-green-500 disabled:bg-slate-300 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                {bitrixBusy ? "Iniciando…" : "Iniciar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
