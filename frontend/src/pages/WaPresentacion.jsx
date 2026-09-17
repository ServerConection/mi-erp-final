/**
 * WaPresentacion.jsx — Presentación institucional del asesor (WABOT)
 *
 * Cada asesor configura un texto libre y una imagen (credencial). Cuando se
 * crea una conversación NUEVA a partir de un ID de negociación de Bitrix, el
 * sistema envía automáticamente esa imagen y luego ese texto al cliente.
 *
 * ADMINISTRADOR puede ver y editar la presentación de cualquier usuario;
 * el resto solo administra la propia.
 */
import { useState, useEffect, useCallback, useMemo } from "react";

const API = `${import.meta.env.VITE_API_URL}/api/wa`;
const ORIGIN = import.meta.env.VITE_API_URL;
const authH = (json = true) => {
  const h = { Authorization: `Bearer ${localStorage.getItem("token")}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
};
const mediaSrc = (url) => (!url ? url : /^https?:\/\//.test(url) ? url : `${ORIGIN}${url}`);

function getPerfil() {
  try { return (JSON.parse(localStorage.getItem("userProfile") || "{}").perfil || "").toUpperCase(); }
  catch { return ""; }
}

export default function WaPresentacion() {
  const isAdmin = useMemo(() => getPerfil() === "ADMINISTRADOR", []);

  const [usuarios, setUsuarios]   = useState([]);   // solo admin
  const [targetId, setTargetId]   = useState(null); // null = "la mía"
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const [text, setText]           = useState("");
  const [mediaUrl, setMediaUrl]   = useState("");
  const [mediaType, setMediaType] = useState("");
  const [mediaName, setMediaName] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [msg, setMsg]             = useState(null); // { ok, text }

  const applyRecord = (rec) => {
    setText(rec?.message_text || "");
    setMediaUrl(rec?.media_url || "");
    setMediaType(rec?.media_type || "");
    setMediaName(rec?.media_filename || "");
    setUpdatedAt(rec?.updated_at || null);
  };

  const loadMine = useCallback(async () => {
    const r = await fetch(`${API}/presentation`, { headers: authH(false) });
    const d = await r.json();
    if (d.success) applyRecord(d.data);
  }, []);

  const loadForUser = useCallback(async (userId) => {
    const list = usuarios.find((u) => u.user_id === userId);
    applyRecord(list || null);
  }, [usuarios]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (isAdmin) {
          const r = await fetch(`${API}/presentations`, { headers: authH(false) });
          const d = await r.json();
          if (d.success) setUsuarios(Array.isArray(d.data) ? d.data : []);
        }
        await loadMine();
      } catch (e) {
        console.error("[WaPresentacion] Error cargando:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSelectUser = async (val) => {
    setMsg(null);
    if (!val) { setTargetId(null); await loadMine(); return; }
    const id = Number(val);
    setTargetId(id);
    await loadForUser(id);
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Adjunta una imagen (jpg, png, gif o webp)"); return; }
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
      if (!dUp.success || !dUp.data) { alert(dUp.error || "No se pudo subir la imagen"); return; }
      setMediaUrl(dUp.data.url);
      setMediaType("image");
      setMediaName(dUp.data.originalname);
    } catch (e) {
      console.error("[WaPresentacion] Error subiendo imagen:", e);
      alert("Error subiendo la imagen");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!text.trim() && !mediaUrl) { alert("Escribe un texto o adjunta una imagen antes de guardar"); return; }
    setSaving(true);
    setMsg(null);
    try {
      const url = targetId ? `${API}/presentations/${targetId}` : `${API}/presentation`;
      const r = await fetch(url, {
        method: "PUT",
        headers: authH(),
        body: JSON.stringify({
          message_text: text.trim() || null,
          media_url: mediaUrl || null,
          media_type: mediaType || null,
          media_filename: mediaName || null,
        }),
      });
      const d = await r.json();
      if (!d.success) { setMsg({ ok: false, text: d.error || "No se pudo guardar" }); return; }
      applyRecord(d.data);
      setMsg({ ok: true, text: "Presentación guardada." });
      // Refresca la fila del usuario en la tabla de admin, si aplica.
      if (isAdmin) {
        setUsuarios((prev) => prev.map((u) => (u.user_id === (targetId || u.user_id) ? { ...u, ...d.data } : u)));
      }
    } catch (e) {
      console.error("[WaPresentacion] Error guardando:", e);
      setMsg({ ok: false, text: "Error de conexión al guardar" });
    } finally {
      setSaving(false);
    }
  };

  const quitarImagen = () => { setMediaUrl(""); setMediaType(""); setMediaName(""); };

  if (loading) return <div className="p-6 text-slate-500">Cargando…</div>;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-800 mb-1">Presentación</h1>
      <p className="text-sm text-slate-500 mb-5">
        Esta imagen y este texto se envían automáticamente al cliente, en ese orden,
        la primera vez que se abre una conversación de WhatsApp desde un ID de
        negociación de Bitrix.
      </p>

      {isAdmin && (
        <div className="mb-5">
          <label className="block text-sm font-medium text-slate-600 mb-1">Ver / editar la presentación de</label>
          <select
            className="w-full md:w-80 border border-slate-300 rounded-lg px-3 py-2 text-sm"
            value={targetId || ""}
            onChange={(e) => onSelectUser(e.target.value)}
          >
            <option value="">Mi presentación</option>
            {usuarios.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.usuario} — {[u.nombres, u.apellidos].filter(Boolean).join(" ") || u.perfil}
                {u.media_url || u.message_text ? "" : "  (sin configurar)"}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Imagen (credencial)</label>
          {mediaUrl ? (
            <div className="flex items-start gap-3">
              <img src={mediaSrc(mediaUrl)} alt="Presentación" className="w-32 h-32 object-cover rounded-lg border border-slate-200" />
              <div className="flex flex-col gap-2">
                <span className="text-xs text-slate-500 break-all">{mediaName}</span>
                <label className="text-sm text-blue-600 cursor-pointer hover:underline">
                  Cambiar imagen
                  <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={uploading} />
                </label>
                <button type="button" onClick={quitarImagen} className="text-sm text-red-600 hover:underline text-left">
                  Quitar imagen
                </button>
              </div>
            </div>
          ) : (
            <label className={`inline-flex items-center gap-2 border border-dashed border-slate-300 rounded-lg px-4 py-3 text-sm cursor-pointer hover:bg-slate-50 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
              {uploading ? "⏳ Subiendo…" : "📎 Adjuntar imagen"}
              <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={uploading} />
            </label>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Texto de la presentación</label>
          <textarea
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[120px]"
            placeholder="Escribe aquí el mensaje de presentación (texto libre)…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>

        {updatedAt && (
          <p className="text-xs text-slate-400">Última actualización: {new Date(updatedAt).toLocaleString("es-EC")}</p>
        )}

        {msg && (
          <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>
        )}

        <div>
          <button
            type="button"
            onClick={save}
            disabled={saving || uploading}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
