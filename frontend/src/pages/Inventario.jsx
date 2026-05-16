/**
 * Inventario.jsx — Módulo de gestión de equipos
 * Tabla: public.equipos
 * Solo ADMINISTRADOR
 */
import { useState, useEffect, useCallback, useRef } from "react";

const API     = `${import.meta.env.VITE_API_URL}/api/inventario`;
const IMG_URL = `${import.meta.env.VITE_API_URL}/uploads/`;

function authH(json = true) {
  const h = { Authorization: `Bearer ${localStorage.getItem("token")}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

// ── Campos de series del equipo ───────────────────────────────────────────────
const SERIES_FIELDS = [
  { key: "seriepc",       label: "Serie PC",       icon: "🖥️",  placeholder: "MXL35015C1" },
  { key: "seriepantalla", label: "Serie Pantalla",  icon: "🖥",  placeholder: "CBGG077201224" },
  { key: "serieteclado",  label: "Serie Teclado",   icon: "⌨️",  placeholder: "SN / código" },
  { key: "mouse",         label: "Mouse",            icon: "🖱️",  placeholder: "SN / código" },
  { key: "headset",       label: "Headset",          icon: "🎧",  placeholder: "C3220 / SN" },
];

// ── Componente imagen con fallback ────────────────────────────────────────────
function EquipoImg({ src, alt, size = 48 }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div style={{ width: size, height: size }}
        className="rounded-xl bg-slate-100 flex items-center justify-center text-xl text-slate-400">
        🖥️
      </div>
    );
  }
  return (
    <img
      src={`${IMG_URL}${src}`}
      alt={alt}
      onError={() => setErr(true)}
      style={{ width: size, height: size, objectFit: "cover" }}
      className="rounded-xl border border-slate-200"
    />
  );
}

// ── Modal genérico ────────────────────────────────────────────────────────────
function Modal({ title, wide, onClose, children }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-lg"} max-h-[92vh] flex flex-col`}
        style={{ animation: "fadeUp .2s ease" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">✕</button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

// ── Modal de imagen grande ────────────────────────────────────────────────────
function ImgModal({ src, onClose }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)", cursor: "zoom-out" }}>
      <img src={`${IMG_URL}${src}`} alt="Equipo"
        className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
        style={{ maxHeight: "85vh" }}
        onClick={e => e.stopPropagation()} />
      <button onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 text-white font-bold hover:bg-white/30 transition flex items-center justify-center">
        ✕
      </button>
    </div>
  );
}

// ── Formulario de equipo ──────────────────────────────────────────────────────
const EMPTY = {
  codigo: "", seriepc: "", seriepantalla: "", serieteclado: "",
  mouse: "", headset: "", asesor: "", observacion: "",
  firma: "", archivo: "", correos: "", opcion: ""
};

function FormEquipo({ inicial, onSave, onClose }) {
  const [form, setForm] = useState({ ...EMPTY, ...inicial });
  const [imgFile, setImgFile] = useState(null);
  const [preview, setPreview] = useState(inicial?.imagen ? `${IMG_URL}${inicial.imagen}` : null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    setImgFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.codigo.trim()) return setErr("El código es requerido");
    setSaving(true); setErr("");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ""));
      if (imgFile) fd.append("imagen", imgFile);

      const isEdit = !!inicial?.id;
      const res = await fetch(
        isEdit ? `${API}/equipos/${inicial.id}` : `${API}/equipos`,
        { method: isEdit ? "PUT" : "POST", headers: authH(false), body: fd }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSave(data.data);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  const Input = ({ label, field, placeholder, ...p }) => (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <input value={form[field] ?? ""} onChange={e => set(field, e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        {...p} />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Imagen */}
      <div className="flex items-center gap-4">
        <div onClick={() => fileRef.current?.click()}
          className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 hover:border-indigo-400 flex items-center justify-center cursor-pointer overflow-hidden transition shrink-0">
          {preview
            ? <img src={preview} alt="preview" className="w-full h-full object-cover" />
            : <span className="text-3xl">📷</span>}
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-1">Foto del equipo</p>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
            {preview ? "Cambiar foto" : "Subir foto"}
          </button>
          {imgFile && <p className="text-[10px] text-slate-400 mt-1">{imgFile.name}</p>}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>
      </div>

      {/* Código y asesor */}
      <div className="grid grid-cols-2 gap-3">
        <Input label="Código *"  field="codigo"  placeholder="NV-PC-001" />
        <Input label="Asesor"    field="asesor"   placeholder="Nombre del asesor" />
      </div>

      {/* Series */}
      <div className="bg-slate-50 rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Series de componentes</p>
        <div className="grid grid-cols-2 gap-3">
          {SERIES_FIELDS.map(f => (
            <Input key={f.key} label={`${f.icon} ${f.label}`} field={f.key} placeholder={f.placeholder} />
          ))}
        </div>
      </div>

      {/* Observación */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Observación</label>
        <textarea value={form.observacion ?? ""} onChange={e => set("observacion", e.target.value)}
          rows={2} placeholder="Estado, novedades, observaciones…"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
      </div>

      {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">❌ {err}</p>}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onClose}
          className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-semibold hover:bg-slate-50 transition">
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition disabled:opacity-50">
          {saving ? "Guardando…" : inicial?.id ? "Actualizar equipo" : "Registrar equipo"}
        </button>
      </div>
    </form>
  );
}

// ── Detalle completo de un equipo ─────────────────────────────────────────────
function DetalleEquipo({ equipo, onClose, onEdit, onImgClick }) {
  return (
    <div className="space-y-5">
      {/* Foto + código */}
      <div className="flex items-center gap-5">
        {equipo.imagen ? (
          <img src={`${IMG_URL}${equipo.imagen}`} alt="equipo"
            onClick={() => onImgClick(equipo.imagen)}
            className="w-24 h-24 rounded-xl object-cover border border-slate-200 cursor-zoom-in hover:opacity-90 transition" />
        ) : (
          <div className="w-24 h-24 rounded-xl bg-slate-100 flex items-center justify-center text-4xl">🖥️</div>
        )}
        <div>
          <p className="text-2xl font-black text-slate-800">{equipo.codigo}</p>
          <p className="text-slate-500 mt-0.5">
            {equipo.asesor && equipo.asesor !== "Sin asignar"
              ? <span className="text-indigo-600 font-semibold">👤 {equipo.asesor}</span>
              : <span className="text-slate-400">Sin asignar</span>}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Registro: {new Date(equipo.fecharegistro).toLocaleDateString("es-EC")}
          </p>
        </div>
      </div>

      {/* Series */}
      <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 gap-3">
        {SERIES_FIELDS.map(f => (
          <div key={f.key}>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{f.icon} {f.label}</p>
            <p className="text-sm font-semibold text-slate-700 mt-0.5">{equipo[f.key] || <span className="text-slate-300">—</span>}</p>
          </div>
        ))}
      </div>

      {/* Observación */}
      {equipo.observacion && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs font-bold text-amber-700 mb-1">📝 Observación</p>
          <p className="text-sm text-amber-800">{equipo.observacion}</p>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button onClick={onClose}
          className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-semibold hover:bg-slate-50 transition">
          Cerrar
        </button>
        <button onClick={onEdit}
          className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition">
          ✏️ Editar
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// Componente principal
// ════════════════════════════════════════════════════════════════════════════════
export default function Inventario() {
  const [equipos,   setEquipos]   = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [tab,       setTab]       = useState("equipos"); // equipos | dashboard
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");

  // Filtros
  const [buscar,  setBuscar]  = useState("");
  const [filtAsesor, setFiltAsesor] = useState("");

  // Modales
  const [modal,   setModal]   = useState(null); // null | {type, data}
  const [imgZoom, setImgZoom] = useState(null); // ruta de imagen

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchDashboard = useCallback(async () => {
    try {
      const r = await fetch(`${API}/dashboard`, { headers: authH() });
      const d = await r.json();
      if (d.ok) setDashboard(d);
    } catch {}
  }, []);

  const fetchEquipos = useCallback(async () => {
    setLoading(true); setError("");
    try {
      let url = `${API}/equipos?`;
      if (buscar)     url += `buscar=${encodeURIComponent(buscar)}&`;
      if (filtAsesor) url += `asesor=${encodeURIComponent(filtAsesor)}&`;
      const r = await fetch(url, { headers: authH() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setEquipos(d.data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [buscar, filtAsesor]);

  useEffect(() => { fetchEquipos(); fetchDashboard(); }, []);
  useEffect(() => { fetchEquipos(); }, [buscar, filtAsesor]);

  // ── Delete ───────────────────────────────────────────────────────────────
  async function handleDelete(id, codigo) {
    if (!confirm(`¿Eliminar equipo ${codigo}?`)) return;
    try {
      const r = await fetch(`${API}/equipos/${id}`, { method: "DELETE", headers: authH() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setEquipos(prev => prev.filter(e => e.id !== id));
      setModal(null);
      fetchDashboard();
    } catch (e) { alert(e.message); }
  }

  // ── Guardar (create/update) ───────────────────────────────────────────────
  function handleSaved(saved) {
    setEquipos(prev => {
      const idx = prev.findIndex(e => e.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
    fetchDashboard();
    setModal(null);
  }

  // ── Asesores únicos para filtro ───────────────────────────────────────────
  const asesores = [...new Set(equipos.map(e => e.asesor).filter(a => a && a !== "Sin asignar"))].sort();

  const kpis = dashboard ? [
    { label: "Total equipos",  val: dashboard.resumen?.total      ?? 0, icon: "📦", color: "#6366f1" },
    { label: "Asignados",      val: dashboard.resumen?.asignados   ?? 0, icon: "👤", color: "#10b981" },
    { label: "Sin asignar",    val: dashboard.resumen?.sin_asignar ?? 0, icon: "📭", color: "#f59e0b" },
    { label: "Con foto",       val: dashboard.resumen?.con_imagen  ?? 0, icon: "📷", color: "#3b82f6" },
  ] : [];

  return (
    <div className="animate-fade-in-up pb-12">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">🖥️ Inventario de Equipos</h1>
          <p className="text-slate-500 mt-1">Registro y control de equipos asignados a asesores</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-black uppercase tracking-widest">
            🔒 Admin
          </span>
          <button onClick={() => setModal({ type: "form", data: null })}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition shadow-sm">
            + Nuevo equipo
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1 w-fit">
        {[["equipos", "📦 Equipos"], ["dashboard", "📊 Resumen"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === k ? "bg-white shadow text-indigo-700" : "text-slate-500 hover:text-slate-700"
            }`}>
            {l}
          </button>
        ))}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">❌ {error}</div>}

      {/* ── DASHBOARD ── */}
      {tab === "dashboard" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map(k => (
              <div key={k.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5"
                style={{ borderTop: `3px solid ${k.color}` }}>
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{k.label}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-2xl">{k.icon}</span>
                  <span className="text-3xl font-black text-slate-800">{k.val}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Top asesores */}
          {!!dashboard?.porAsesor?.length && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-700">👤 Equipos por asesor</h3>
              </div>
              <div className="p-5 space-y-3">
                {dashboard.porAsesor.map(a => {
                  const pct = Math.round((a.total / (dashboard.resumen?.total || 1)) * 100);
                  return (
                    <div key={a.asesor}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-semibold text-slate-700">{a.asesor}</span>
                        <span className="text-slate-400">{a.total} equipo{a.total !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div style={{ width: `${pct}%`, background: "#6366f1" }} className="h-full rounded-full transition-all" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── LISTA DE EQUIPOS ── */}
      {tab === "equipos" && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap gap-3">
            <input value={buscar} onChange={e => setBuscar(e.target.value)}
              placeholder="🔍 Buscar código, serie, asesor…"
              className="flex-1 min-w-[200px] max-w-sm px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            <select value={filtAsesor} onChange={e => setFiltAsesor(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="">Todos los asesores</option>
              {asesores.map(a => <option key={a}>{a}</option>)}
            </select>
            <span className="px-3 py-2 text-sm text-slate-500 font-medium self-center">
              {equipos.length} equipo{equipos.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Tabla */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-400">
                <div className="w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                Cargando equipos…
              </div>
            ) : !equipos.length ? (
              <div className="p-12 text-center text-slate-400">
                <div className="text-5xl mb-3">🖥️</div>
                <p className="font-medium text-slate-500">Sin equipos registrados</p>
                <button onClick={() => setModal({ type: "form", data: null })}
                  className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition">
                  + Registrar primer equipo
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {["Foto","Código","Serie PC","Pantalla","Teclado","Mouse","Headset","Asesor","Observación","Acciones"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {equipos.map(eq => (
                      <tr key={eq.id} className="border-t border-slate-50 hover:bg-slate-50/60 transition-colors">
                        {/* Foto */}
                        <td className="px-4 py-3">
                          <EquipoImg src={eq.imagen} alt={eq.codigo} size={44}
                            onClick={eq.imagen ? () => setImgZoom(eq.imagen) : undefined} />
                        </td>
                        {/* Código */}
                        <td className="px-4 py-3">
                          <p className="font-black text-slate-800 text-base">{eq.codigo}</p>
                          <p className="text-[10px] text-slate-400">#{eq.id}</p>
                        </td>
                        {/* Series */}
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{eq.seriepc       || <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{eq.seriepantalla || <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{eq.serieteclado  || <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{eq.mouse         || <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{eq.headset       || <span className="text-slate-300">—</span>}</td>
                        {/* Asesor */}
                        <td className="px-4 py-3">
                          {eq.asesor && eq.asesor !== "Sin asignar"
                            ? <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold">{eq.asesor}</span>
                            : <span className="text-slate-300 text-xs">Sin asignar</span>}
                        </td>
                        {/* Observación */}
                        <td className="px-4 py-3 text-xs text-slate-500 max-w-[160px] truncate"
                          title={eq.observacion || ""}>
                          {eq.observacion || <span className="text-slate-300">—</span>}
                        </td>
                        {/* Acciones */}
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            <button title="Ver detalle"
                              onClick={() => setModal({ type: "detalle", data: eq })}
                              className="px-2.5 py-1.5 bg-slate-50 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-100 transition">
                              👁
                            </button>
                            <button title="Editar"
                              onClick={() => setModal({ type: "form", data: eq })}
                              className="px-2.5 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition">
                              ✏️
                            </button>
                            <button title="Eliminar"
                              onClick={() => handleDelete(eq.id, eq.codigo)}
                              className="px-2.5 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition">
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL FORMULARIO ── */}
      {modal?.type === "form" && (
        <Modal title={modal.data ? `Editar ${modal.data.codigo}` : "Registrar nuevo equipo"}
          wide onClose={() => setModal(null)}>
          <FormEquipo inicial={modal.data} onClose={() => setModal(null)} onSave={handleSaved} />
        </Modal>
      )}

      {/* ── MODAL DETALLE ── */}
      {modal?.type === "detalle" && (
        <Modal title={`Detalle — ${modal.data.codigo}`} onClose={() => setModal(null)}>
          <DetalleEquipo
            equipo={modal.data}
            onClose={() => setModal(null)}
            onImgClick={setImgZoom}
            onEdit={() => setModal({ type: "form", data: modal.data })}
          />
        </Modal>
      )}

      {/* ── ZOOM IMAGEN ── */}
      {imgZoom && <ImgModal src={imgZoom} onClose={() => setImgZoom(null)} />}
    </div>
  );
}
