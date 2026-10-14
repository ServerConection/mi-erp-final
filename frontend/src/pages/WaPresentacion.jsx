import { useCallback, useEffect, useMemo, useState } from "react";

const API = `${import.meta.env.VITE_API_URL}/api/wa`;
const ORIGIN = import.meta.env.VITE_API_URL;
const authH = (json = true) => {
  const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
};
const mediaSrc = (url) => (!url || /^https?:\/\//.test(url) ? url : `${ORIGIN}${url}`);
const emptyVariant = (number) => ({
  name: `Presentación ${number}`, message_text: "", media_url: "",
  media_type: "", media_filename: "", is_active: true,
});

function getPerfil() {
  try { return (JSON.parse(localStorage.getItem("userProfile") || "{}").perfil || "").toUpperCase(); }
  catch { return ""; }
}

export default function WaPresentacion() {
  const isAdmin = useMemo(() => getPerfil() === "ADMINISTRADOR", []);
  const [usuarios, setUsuarios] = useState([]);
  const [targetId, setTargetId] = useState(null);
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [msg, setMsg] = useState(null);

  const loadVariants = useCallback(async (userId = null) => {
    const url = userId ? `${API}/presentations/${userId}` : `${API}/presentation`;
    const response = await fetch(url, { headers: authH(false) });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.error || "No se pudo cargar la presentación");
    setVariants(Array.isArray(payload.data?.variants) ? payload.data.variants : []);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (isAdmin) {
          const response = await fetch(`${API}/presentations`, { headers: authH(false) });
          const payload = await response.json();
          if (payload.success) setUsuarios(Array.isArray(payload.data) ? payload.data : []);
        }
        await loadVariants();
      } catch (error) {
        setMsg({ ok: false, text: error.message });
      } finally { setLoading(false); }
    })();
  }, [isAdmin, loadVariants]);

  const selectUser = async (value) => {
    const id = value ? Number(value) : null;
    setTargetId(id); setMsg(null); setLoading(true);
    try { await loadVariants(id); }
    catch (error) { setMsg({ ok: false, text: error.message }); }
    finally { setLoading(false); }
  };

  const update = (index, field, value) => setVariants(prev => prev.map((v, i) => i === index ? { ...v, [field]: value } : v));
  const add = () => setVariants(prev => [...prev, emptyVariant(prev.length + 1)]);
  const remove = (index) => setVariants(prev => prev.filter((_, i) => i !== index));
  const move = (index, delta) => setVariants(prev => {
    const next = [...prev]; const other = index + delta;
    if (other < 0 || other >= next.length) return prev;
    [next[index], next[other]] = [next[other], next[index]];
    return next;
  });

  const upload = async (index, event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("Adjunta una imagen (jpg, png, gif o webp)");
    setUploading(index);
    try {
      const body = new FormData(); body.append("file", file);
      const response = await fetch(`${API}/upload`, { method: "POST", headers: authH(false), body });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "No se pudo subir la imagen");
      setVariants(prev => prev.map((v, i) => i === index ? {
        ...v, media_url: payload.data.url, media_type: "image", media_filename: payload.data.originalname,
      } : v));
    } catch (error) { alert(error.message); }
    finally { setUploading(null); }
  };

  const save = async () => {
    const incomplete = variants.findIndex(v => !v.message_text?.trim() && !v.media_url);
    if (incomplete >= 0) return alert(`La variante ${incomplete + 1} debe tener texto o imagen`);
    setSaving(true); setMsg(null);
    try {
      const response = await fetch(targetId ? `${API}/presentations/${targetId}` : `${API}/presentation`, {
        method: "PUT", headers: authH(), body: JSON.stringify({ variants }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "No se pudo guardar");
      setVariants(payload.data.variants || []);
      setMsg({ ok: true, text: "Variantes guardadas. La rotación comenzará por la primera activa." });
      if (isAdmin && targetId) setUsuarios(prev => prev.map(u => u.user_id === targetId
        ? { ...u, variant_count: payload.data.variants.length, active_variant_count: payload.data.variants.filter(v => v.is_active).length } : u));
    } catch (error) { setMsg({ ok: false, text: error.message }); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-6 text-slate-500">Cargando…</div>;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-800 mb-1">Presentación</h1>
      <p className="text-sm text-slate-500 mb-5">
        Las variantes activas se alternan automáticamente en orden cuando se abre una conversación nueva desde Bitrix.
        En cada variante se envía primero la imagen y luego el texto.
      </p>

      {isAdmin && <div className="mb-5">
        <label className="block text-sm font-medium text-slate-600 mb-1">Ver / editar la presentación de</label>
        <select className="w-full md:w-96 border border-slate-300 rounded-lg px-3 py-2 text-sm" value={targetId || ""} onChange={e => selectUser(e.target.value)}>
          <option value="">Mi presentación</option>
          {usuarios.map(u => <option key={u.user_id} value={u.user_id}>
            {u.usuario} — {[u.nombres, u.apellidos].filter(Boolean).join(" ") || u.perfil} ({u.active_variant_count || 0} activas)
          </option>)}
        </select>
      </div>}

      <div className="space-y-4">
        {variants.length === 0 && <div className="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-500">
          No hay presentaciones configuradas. Agrega la primera variante para activar el envío automático.
        </div>}
        {variants.map((variant, index) => <div key={variant.id || `new-${index}`} className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input value={variant.name || ""} onChange={e => update(index, "name", e.target.value)}
              className="font-semibold text-slate-800 border-b border-transparent hover:border-slate-300 focus:border-green-500 focus:outline-none px-1 py-1 flex-1 min-w-48" />
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={variant.is_active !== false} onChange={e => update(index, "is_active", e.target.checked)} /> Activa
            </label>
            <button onClick={() => move(index, -1)} disabled={index === 0} className="px-2 py-1 text-slate-500 disabled:opacity-30" title="Subir">↑</button>
            <button onClick={() => move(index, 1)} disabled={index === variants.length - 1} className="px-2 py-1 text-slate-500 disabled:opacity-30" title="Bajar">↓</button>
            <button onClick={() => remove(index)} className="text-xs text-red-600 px-2 py-1">Eliminar</button>
          </div>
          <div className="grid md:grid-cols-[180px_1fr] gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-2">IMAGEN</label>
              {variant.media_url ? <div>
                <img src={mediaSrc(variant.media_url)} alt={variant.name} className="w-36 h-36 object-cover rounded-lg border border-slate-200" />
                <button onClick={() => setVariants(prev => prev.map((v, i) => i === index ? { ...v, media_url: "", media_type: "", media_filename: "" } : v))}
                  className="text-xs text-red-600 mt-2 block">Quitar imagen</button>
              </div> : <label className={`inline-flex border border-dashed border-slate-300 rounded-lg px-3 py-3 text-xs cursor-pointer ${uploading === index ? "opacity-50" : ""}`}>
                {uploading === index ? "Subiendo…" : "Adjuntar imagen"}
                <input type="file" accept="image/*" className="hidden" onChange={e => upload(index, e)} disabled={uploading !== null} />
              </label>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-2">TEXTO</label>
              <textarea rows={6} value={variant.message_text || ""} onChange={e => update(index, "message_text", e.target.value)}
                placeholder="Escribe el mensaje de esta variante…" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-y" />
            </div>
          </div>
        </div>)}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-5">
        <button onClick={add} disabled={variants.length >= 20} className="border border-green-600 text-green-700 hover:bg-green-50 disabled:opacity-40 px-4 py-2 rounded-lg text-sm font-medium">+ Agregar variante</button>
        <button onClick={save} disabled={saving || uploading !== null} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium">
          {saving ? "Guardando…" : "Guardar variantes"}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
