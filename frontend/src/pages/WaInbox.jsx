/**
 * WaInbox.jsx — Bandeja de conversaciones WhatsApp en el ERP
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { io } from "socket.io-client";

const ORIGIN = import.meta.env.VITE_API_URL;
const API = `${ORIGIN}/api/wa`;
// media_url relativo (/wa-uploads/...) → anteponer origen para mostrarlo
const mediaSrc = (url) => (!url ? url : /^https?:\/\//.test(url) ? url : `${ORIGIN}${url}`);
const isImage = (msg) => msg.type === "image" || /\.(jpe?g|png|gif|webp)$/i.test(msg.media_url || "");
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

  const asArray = (d) => (Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : []);

  const loadConvs = useCallback(async () => {
    try {
      const r = await fetch(`${API}/conversations`, { headers: authH(false) });
      const d = await r.json();
      setConversations(asArray(d));
    } catch (e) {
      console.error("[WaInbox] Error cargando:", e);
    } finally {
      setLoading(false);
    }
  }, []);

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
    loadConvs();
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
          <h2 className="font-bold text-slate-800 mb-2">💬 Inbox</h2>
          <input type="text" placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-green-400 mb-2" />
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
    </div>
  );
}
