/**
 * WaCampanas.jsx — Gestión de campañas masivas WhatsApp en el ERP
 */
import { useState, useEffect, useCallback } from "react";

const ORIGIN = import.meta.env.VITE_API_URL;
const API = `${ORIGIN}/api/wa`;
// media_url se guarda relativo (/wa-uploads/...) → para mostrarlo hay que anteponer el origen
const mediaSrc = (url) => (!url ? url : /^https?:\/\//.test(url) ? url : `${ORIGIN}${url}`);
const authH = (json = true) => {
  const h = { Authorization: `Bearer ${localStorage.getItem("token")}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
};

const STATUS_BADGE = {
  draft:     "bg-slate-100 text-slate-500",
  scheduled: "bg-purple-100 text-purple-600",
  running:   "bg-blue-100 text-blue-600",
  paused:    "bg-yellow-100 text-yellow-600",
  finished:  "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-500",
  failed:    "bg-red-100 text-red-600",
};
const STATUS_LABEL = {
  draft:     "Borrador", scheduled: "Programada", running: "Enviando",
  paused:    "Pausada",  finished:  "Finalizada", cancelled: "Cancelada", failed: "Error",
};

const emptyForm = {
  name: "", line_id: "", list_id: "",
  min_delay_secs: 8, max_delay_secs: 20,
  batch_size: 50, batch_pause_secs: 120,
};

export default function WaCampanas() {
  const [campaigns, setCampaigns]   = useState([]);
  const [lines, setLines]           = useState([]);
  const [lists, setLists]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(null); // "new" | campaign_id
  const [form, setForm]             = useState(emptyForm);
  const [variants, setVariants]     = useState([{ label: "Variante 1", message_text: "" }]);
  const [saving, setSaving]         = useState(false);
  const [detail, setDetail]         = useState(null); // campaign con variantes
  const [search, setSearch]         = useState("");
  const [uploadingIdx, setUploadingIdx] = useState(null); // índice de variante subiendo imagen

  // Normaliza la respuesta de la API: SIEMPRE devuelve un array
  const asArray = (d) => (Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : []);

  const load = useCallback(async () => {
    try {
      const [rC, rL, rLists] = await Promise.all([
        fetch(`${API}/campaigns`, { headers: authH(false) }),
        fetch(`${API}/lines`,    { headers: authH(false) }),
        fetch(`${API}/lists`,    { headers: authH(false) }),
      ]);
      const [dC, dL, dLists] = await Promise.all([rC.json(), rL.json(), rLists.json()]);
      setCampaigns(asArray(dC));
      setLines(asArray(dL).filter(l => l.status === "connected"));
      setLists(asArray(dLists));
    } catch (e) {
      console.error("[WaCampanas] Error cargando:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setForm(emptyForm);
    setVariants([{ label: "Variante 1", message_text: "" }]);
    setModal("new");
  };

  // Sube una imagen/archivo para una variante y guarda su media_url
  const uploadImage = async (file, idx) => {
    if (!file) return;
    setUploadingIdx(idx);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${API}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, // sin Content-Type: lo pone el browser con boundary
        body: fd,
      });
      const d = await r.json();
      if (d.success && d.data) {
        setVariants(vs => vs.map((x, j) => j === idx ? {
          ...x,
          media_url: d.data.url,
          media_type: d.data.mimetype?.startsWith("image/") ? "image" : "document",
          media_filename: d.data.originalname,
        } : x));
      } else {
        alert(d.error || "No se pudo subir la imagen");
      }
    } catch (e) {
      console.error("[WaCampanas] Error subiendo imagen:", e);
      alert("Error subiendo la imagen");
    } finally {
      setUploadingIdx(null);
    }
  };

  const removeImage = (idx) => {
    setVariants(vs => vs.map((x, j) => j === idx ? { ...x, media_url: null, media_type: null, media_filename: null } : x));
  };

  const save = async () => {
    if (!form.name || !form.line_id || !form.list_id) return;
    if (variants.some(v => !v.message_text?.trim() && !v.media_url)) return;
    setSaving(true);
    try {
      const first = variants[0] || {};
      const r = await fetch(`${API}/campaigns`, {
        method: "POST", headers: authH(),
        body: JSON.stringify({
          ...form,
          body: first.message_text || "",
          media_url: first.media_url || null,
          media_type: first.media_type || null,
          media_filename: first.media_filename || null,
        }),
      });
      const d = await r.json();
      if (d.success && d.data) {
        const campId = d.data.id;
        // guardar variantes
        await Promise.all(variants.map((v, i) =>
          fetch(`${API}/campaigns/${campId}/messages`, {
            method: "POST", headers: authH(),
            body: JSON.stringify({ ...v, sort_order: i }),
          })
        ));
        setModal(null);
        load();
      }
    } finally { setSaving(false); }
  };

  const action = async (id, act) => {
    const map = {
      start: "start", pause: "pause", resume: "resume",
      cancel: "cancel", "retry-failed": "retry-failed",
    };
    await fetch(`${API}/campaigns/${id}/${map[act]}`, { method: "POST", headers: authH(false) });
    load();
  };

  const openDetail = async (camp) => {
    const r = await fetch(`${API}/campaigns/${camp.id}/messages`, { headers: authH(false) });
    const d = await r.json();
    setDetail({ ...camp, messages: Array.isArray(d?.data) ? d.data : [] });
  };

  const filtered = (Array.isArray(campaigns) ? campaigns : []).filter(c =>
    (c.name || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">📣 Campañas Masivas</h1>
          <p className="text-sm text-slate-500 mt-0.5">Envíos masivos con variantes de mensaje y throttling</p>
        </div>
        <button onClick={openNew}
          className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Nueva campaña
        </button>
      </div>

      {/* Buscador */}
      <input
        type="text" placeholder="Buscar campaña…"
        value={search} onChange={e => setSearch(e.target.value)}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-green-400"
      />

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-5xl mb-3">📣</div>
          <div className="font-medium text-slate-500">No hay campañas</div>
          <div className="text-sm mt-1">Crea una para empezar</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(camp => (
            <div key={camp.id} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800 truncate">{camp.name}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[camp.status] || STATUS_BADGE.draft}`}>
                      {STATUS_LABEL[camp.status] || camp.status}
                    </span>
                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                      👤 {camp.owner_username || "—"}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-slate-500">
                    <span>📤 {camp.sent_count}/{camp.total_recipients}</span>
                    <span>✅ {camp.delivered_count} entregados</span>
                    {camp.failed_count > 0 && <span className="text-red-400">❌ {camp.failed_count} fallidos</span>}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => openDetail(camp)}
                    className="text-xs border border-slate-200 hover:border-blue-300 hover:text-blue-500 px-3 py-1.5 rounded-lg transition-colors">
                    Ver
                  </button>
                  {camp.status === "draft" && (
                    <button onClick={() => action(camp.id, "start")}
                      className="text-xs bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors">
                      ▶ Iniciar
                    </button>
                  )}
                  {camp.status === "running" && (
                    <button onClick={() => action(camp.id, "pause")}
                      className="text-xs bg-yellow-50 border border-yellow-200 text-yellow-700 px-3 py-1.5 rounded-lg transition-colors">
                      ⏸ Pausar
                    </button>
                  )}
                  {camp.status === "paused" && (
                    <button onClick={() => action(camp.id, "resume")}
                      className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg transition-colors">
                      ▶ Reanudar
                    </button>
                  )}
                  {["draft","paused"].includes(camp.status) && (
                    <button onClick={() => action(camp.id, "cancel")}
                      className="text-xs text-slate-400 hover:text-red-400 px-2 py-1.5 rounded-lg transition-colors">
                      ✕
                    </button>
                  )}
                  {camp.status === "failed" && (
                    <button onClick={() => action(camp.id, "retry-failed")}
                      className="text-xs border border-orange-200 text-orange-600 px-3 py-1.5 rounded-lg transition-colors">
                      🔄 Reintentar
                    </button>
                  )}
                </div>
              </div>

              {/* Barra progreso */}
              {camp.total_recipients > 0 && (
                <div className="mt-3 bg-slate-100 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full bg-green-500 transition-all"
                    style={{ width: `${Math.round((camp.sent_count / camp.total_recipients) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal nueva campaña */}
      {modal === "new" && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Nueva campaña</h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Promo Junio 2025"
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Línea</label>
                  <select value={form.line_id} onChange={e => setForm(f => ({ ...f, line_id: e.target.value }))}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400">
                    <option value="">Seleccionar…</option>
                    {lines.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Lista</label>
                  <select value={form.list_id} onChange={e => setForm(f => ({ ...f, list_id: e.target.value }))}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400">
                    <option value="">Seleccionar…</option>
                    {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Delay mín (seg)</label>
                  <input type="number" value={form.min_delay_secs} onChange={e => setForm(f => ({ ...f, min_delay_secs: +e.target.value }))}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Delay máx (seg)</label>
                  <input type="number" value={form.max_delay_secs} onChange={e => setForm(f => ({ ...f, max_delay_secs: +e.target.value }))}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Lote (mensajes)</label>
                  <input type="number" value={form.batch_size} onChange={e => setForm(f => ({ ...f, batch_size: +e.target.value }))}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pausa lote (seg)</label>
                  <input type="number" value={form.batch_pause_secs} onChange={e => setForm(f => ({ ...f, batch_pause_secs: +e.target.value }))}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
                </div>
              </div>

              {/* Variantes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Variantes de mensaje ({variants.length})
                  </label>
                  <button onClick={() => setVariants(v => [...v, { label: `Variante ${v.length + 1}`, message_text: "" }])}
                    className="text-xs text-green-600 hover:text-green-500 font-medium">
                    + Añadir variante
                  </button>
                </div>
                <div className="space-y-3">
                  {variants.map((v, i) => (
                    <div key={i} className="border border-slate-200 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="text" value={v.label} placeholder={`Variante ${i + 1}`}
                          onChange={e => setVariants(vs => vs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                          className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-green-400"
                        />
                        {variants.length > 1 && (
                          <button onClick={() => setVariants(vs => vs.filter((_, j) => j !== i))}
                            className="text-slate-300 hover:text-red-400 text-sm">✕</button>
                        )}
                      </div>
                      <textarea
                        rows={3}
                        placeholder={`Hola {{nombre}}, tenemos una promo para ti…`}
                        value={v.message_text}
                        onChange={e => setVariants(vs => vs.map((x, j) => j === i ? { ...x, message_text: e.target.value } : x))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-green-400"
                      />
                      <p className="text-xs text-slate-400 mt-1">Variables: {`{{nombre}}, {{variable}}`}</p>

                      {/* Adjuntar imagen */}
                      <div className="mt-2">
                        {v.media_url ? (
                          <div className="flex items-center gap-2">
                            {v.media_type === "image" ? (
                              <img src={mediaSrc(v.media_url)} alt={v.media_filename || "adjunto"}
                                className="w-14 h-14 object-cover rounded-lg border border-slate-200" />
                            ) : (
                              <div className="w-14 h-14 flex items-center justify-center bg-slate-50 border border-slate-200 rounded-lg text-xl">📎</div>
                            )}
                            <span className="text-xs text-slate-500 truncate max-w-[140px]">{v.media_filename}</span>
                            <button onClick={() => removeImage(i)}
                              className="text-xs text-slate-300 hover:text-red-400">✕ quitar</button>
                          </div>
                        ) : (
                          <label className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-500 font-medium cursor-pointer">
                            {uploadingIdx === i ? "Subiendo…" : "📎 Adjuntar imagen"}
                            <input
                              type="file" accept="image/*,.pdf"
                              className="hidden"
                              disabled={uploadingIdx === i}
                              onChange={e => { uploadImage(e.target.files?.[0], i); e.target.value = ""; }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => setModal(null)}
                className="text-sm text-slate-500 px-4 py-2 hover:text-slate-700">
                Cancelar
              </button>
              <button onClick={save} disabled={saving || !form.name || !form.line_id || !form.list_id}
                className="bg-green-600 hover:bg-green-500 disabled:bg-slate-300 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                {saving ? "Guardando…" : "Crear campaña"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle */}
      {detail && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">{detail.name}</h3>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: "Enviados",    val: detail.sent_count,       color: "text-blue-600" },
                  { label: "Entregados",  val: detail.delivered_count,  color: "text-green-600" },
                  { label: "Fallidos",    val: detail.failed_count,     color: "text-red-500" },
                ].map(({ label, val, color }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3">
                    <div className={`text-2xl font-bold ${color}`}>{val}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Variantes</p>
                <div className="space-y-2">
                  {detail.messages.map((m, i) => (
                    <div key={m.id} className="bg-slate-50 rounded-xl p-3">
                      <div className="text-xs font-semibold text-slate-500 mb-1">{m.label || `Variante ${i+1}`}</div>
                      {m.message_text && <div className="text-sm text-slate-700 whitespace-pre-wrap">{m.message_text}</div>}
                      {m.media_url && (
                        m.media_type === "image" ? (
                          <img src={mediaSrc(m.media_url)} alt={m.media_filename || "adjunto"}
                            className="mt-2 max-h-40 rounded-lg border border-slate-200" />
                        ) : (
                          <a href={mediaSrc(m.media_url)} target="_blank" rel="noopener noreferrer"
                            className="mt-2 inline-block text-xs text-blue-500 underline">📎 {m.media_filename || "Ver adjunto"}</a>
                        )
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
