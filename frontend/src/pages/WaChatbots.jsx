/**
 * WaChatbots.jsx — Gestión de chatbots (flujos) WhatsApp en el ERP
 */
import { useState, useEffect, useCallback } from "react";

const API = `${import.meta.env.VITE_API_URL}/api/wa`;
const authH = (json = true) => {
  const h = { Authorization: `Bearer ${localStorage.getItem("token")}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
};

const NODE_TYPES = [
  { type: "message",  label: "Enviar mensaje",      icon: "💬" },
  { type: "input",    label: "Esperar respuesta",    icon: "⌨️" },
  { type: "menu",     label: "Menú de opciones",     icon: "📋" },
  { type: "condition",label: "Condición",            icon: "🔀" },
  { type: "transfer", label: "Transferir a humano",  icon: "👤" },
  { type: "end",      label: "Fin del flujo",        icon: "🏁" },
  { type: "delay",    label: "Esperar (delay)",       icon: "⏱️" },
  { type: "media",    label: "Enviar multimedia",    icon: "📎" },
];

const emptyFlow = { nodes: [], edges: [] };

export default function WaChatbots() {
  const [bots, setBots]       = useState([]);
  const [lines, setLines]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null); // "new" | "edit"
  const [editing, setEditing] = useState(null); // bot being edited
  const [form, setForm]       = useState({ name: "", description: "" });
  const [flowJson, setFlowJson] = useState(JSON.stringify(emptyFlow, null, 2));
  const [flowError, setFlowError] = useState("");
  const [saving, setSaving]   = useState(false);
  const [tab, setTab]         = useState("list"); // "list" | "editor"

  const asArray = (d) => (Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : []);

  const load = useCallback(async () => {
    try {
      const [rB, rL] = await Promise.all([
        fetch(`${API}/bots`,  { headers: authH(false) }),
        fetch(`${API}/lines`, { headers: authH(false) }),
      ]);
      const [dB, dL] = await Promise.all([rB.json(), rL.json()]);
      setBots(asArray(dB));
      setLines(asArray(dL));
    } catch (e) {
      console.error("[WaChatbots] Error cargando:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", description: "" });
    setFlowJson(JSON.stringify(emptyFlow, null, 2));
    setFlowError("");
    setModal("new");
    setTab("list");
  };

  const openEdit = (bot) => {
    setEditing(bot);
    setForm({ name: bot.name, description: bot.description || "" });
    setFlowJson(JSON.stringify(bot.flow_json || emptyFlow, null, 2));
    setFlowError("");
    setModal("edit");
    setTab("list");
  };

  const validateFlow = (json) => {
    try { JSON.parse(json); setFlowError(""); return true; }
    catch (e) { setFlowError(e.message); return false; }
  };

  const save = async () => {
    if (!form.name?.trim()) return;
    if (!validateFlow(flowJson)) return;
    setSaving(true);
    try {
      const payload = { ...form, flow_json: JSON.parse(flowJson) };
      const r = editing
        ? await fetch(`${API}/bots/${editing.id}`, { method: "PUT",  headers: authH(), body: JSON.stringify(payload) })
        : await fetch(`${API}/bots`,               { method: "POST", headers: authH(), body: JSON.stringify(payload) });
      const d = await r.json();
      if (d.success) { setModal(null); load(); }
    } finally { setSaving(false); }
  };

  const toggleActive = async (bot) => {
    await fetch(`${API}/bots/${bot.id}`, {
      method: "PUT", headers: authH(),
      body: JSON.stringify({ ...bot, is_active: !bot.is_active }),
    });
    load();
  };

  const remove = async (id) => {
    if (!confirm("¿Eliminar este chatbot?")) return;
    await fetch(`${API}/bots/${id}`, { method: "DELETE", headers: authH(false) });
    setBots(prev => prev.filter(b => b.id !== id));
  };

  const assignLine = async (lineId, botId) => {
    await fetch(`${API}/lines/${lineId}`, {
      method: "PUT", headers: authH(),
      body: JSON.stringify({ bot_id: botId || null }),
    });
    load();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">🤖 Chatbots</h1>
          <p className="text-sm text-slate-500 mt-0.5">Flujos de respuesta automática</p>
        </div>
        <button onClick={openNew}
          className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Nuevo bot
        </button>
      </div>

      {/* Asignación de bots a líneas */}
      {lines.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Bot activo por línea</p>
          <div className="space-y-2">
            {lines.map(line => (
              <div key={line.id} className="flex items-center gap-3">
                <div className="flex-1 text-sm font-medium text-slate-700 truncate">
                  📱 {line.name}
                  <span className="ml-2 text-xs text-slate-400">{line.phone_number ? `+${line.phone_number}` : line.status}</span>
                </div>
                <select
                  value={line.bot_id || ""}
                  onChange={e => assignLine(line.id, e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-green-400"
                >
                  <option value="">Sin bot</option>
                  {bots.filter(b => b.is_active).map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de bots */}
      {bots.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-5xl mb-3">🤖</div>
          <div className="font-medium text-slate-500">No hay chatbots</div>
          <div className="text-sm mt-1">Crea un bot para automatizar respuestas</div>
        </div>
      ) : (
        <div className="space-y-3">
          {bots.map(bot => {
            const nodeCount  = bot.flow_json?.nodes?.length || 0;
            const usedInLine = lines.find(l => l.bot_id === bot.id);
            return (
              <div key={bot.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${bot.is_active ? "bg-green-100" : "bg-slate-100"}`}>
                    🤖
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800">{bot.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${bot.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                        {bot.is_active ? "Activo" : "Inactivo"}
                      </span>
                      {usedInLine && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                          📱 {usedInLine.name}
                        </span>
                      )}
                    </div>
                    {bot.description && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{bot.description}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">{nodeCount} nodo{nodeCount !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => openEdit(bot)}
                      className="text-xs border border-slate-200 hover:border-blue-300 hover:text-blue-500 px-3 py-1.5 rounded-lg transition-colors">
                      ✏️ Editar
                    </button>
                    <button onClick={() => toggleActive(bot)}
                      className={`text-xs px-3 py-1.5 rounded-lg transition-colors border ${
                        bot.is_active
                          ? "border-slate-200 text-slate-500 hover:border-red-200 hover:text-red-500"
                          : "border-green-200 text-green-600 hover:bg-green-50"
                      }`}>
                      {bot.is_active ? "Desactivar" : "Activar"}
                    </button>
                    <button onClick={() => remove(bot.id)}
                      className="text-xs text-slate-300 hover:text-red-400 px-2 py-1.5 rounded-lg transition-colors">
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal crear/editar bot */}
      {(modal === "new" || modal === "edit") && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">
                {modal === "new" ? "Nuevo chatbot" : `Editar: ${editing?.name}`}
              </h3>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-3 border-b border-slate-100">
              {[{ key: "list", label: "ℹ️ Datos" }, { key: "editor", label: "🔧 Flujo JSON" }].map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    tab === t.key ? "bg-slate-100 text-slate-800" : "text-slate-500 hover:text-slate-700"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {tab === "list" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre del bot</label>
                    <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Bienvenida ventas"
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Descripción (opcional)</label>
                    <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-green-400" />
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Tipos de nodo disponibles</p>
                    <div className="grid grid-cols-2 gap-2">
                      {NODE_TYPES.map(nt => (
                        <div key={nt.type} className="flex items-center gap-2 text-sm text-slate-600">
                          <span>{nt.icon}</span>
                          <span className="truncate">{nt.label}</span>
                          <span className="text-xs text-slate-400 font-mono ml-auto">{nt.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700">
                    <p className="font-semibold mb-1">💡 Estructura de flujo</p>
                    <p>Ve a la pestaña "Flujo JSON" para definir los nodos y conexiones del bot. Cada nodo tiene: <code>id</code>, <code>type</code>, <code>data</code>, y opcionalmente <code>next</code>.</p>
                  </div>
                </div>
              )}

              {tab === "editor" && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Flow JSON</label>
                  <textarea
                    rows={18}
                    value={flowJson}
                    onChange={e => { setFlowJson(e.target.value); validateFlow(e.target.value); }}
                    spellCheck={false}
                    className={`mt-1 w-full border rounded-xl px-3 py-2 text-xs font-mono resize-none focus:outline-none ${
                      flowError ? "border-red-300 focus:border-red-400" : "border-slate-200 focus:border-green-400"
                    }`}
                  />
                  {flowError && (
                    <p className="text-xs text-red-500 mt-1">❌ JSON inválido: {flowError}</p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => {
                        const example = {
                          nodes: [
                            { id: "start", type: "message", data: { text: "¡Hola {{nombre}}! ¿En qué puedo ayudarte?" }, next: "menu1" },
                            { id: "menu1", type: "menu", data: { text: "Elige una opción:", options: [
                              { label: "1. Información", value: "1", next: "info" },
                              { label: "2. Soporte",     value: "2", next: "soporte" },
                              { label: "3. Hablar con un agente", value: "3", next: "transfer" },
                            ]}, default: "menu1" },
                            { id: "info",     type: "message",  data: { text: "Aquí está nuestra información..." }, next: "end" },
                            { id: "soporte",  type: "message",  data: { text: "Nuestro soporte está disponible de 8am-6pm." }, next: "end" },
                            { id: "transfer", type: "transfer", data: { message: "Conectando con un agente…" } },
                            { id: "end",      type: "end",      data: { text: "¡Gracias por contactarnos!" } },
                          ],
                          edges: [],
                        };
                        setFlowJson(JSON.stringify(example, null, 2));
                        setFlowError("");
                      }}
                      className="text-xs border border-slate-200 text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      📋 Cargar ejemplo
                    </button>
                    <button
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(flowJson);
                          setFlowJson(JSON.stringify(parsed, null, 2));
                          setFlowError("");
                        } catch (e) {
                          setFlowError(e.message);
                        }
                      }}
                      className="text-xs border border-slate-200 text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      ✨ Formatear
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => setModal(null)} className="text-sm text-slate-500 px-4 py-2 hover:text-slate-700">Cancelar</button>
              <button onClick={save} disabled={saving || !form.name?.trim() || !!flowError}
                className="bg-green-600 hover:bg-green-500 disabled:bg-slate-300 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                {saving ? "Guardando…" : (modal === "new" ? "Crear bot" : "Guardar cambios")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
