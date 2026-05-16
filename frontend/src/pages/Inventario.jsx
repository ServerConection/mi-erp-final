/**
 * Inventario.jsx — Equipos + Plano de piso
 * Tabla: public.equipos   |   Solo ADMINISTRADOR
 */
import { useState, useEffect, useCallback, useRef } from "react";

const API     = `${import.meta.env.VITE_API_URL}/api/inventario`;
const IMG_URL = `${import.meta.env.VITE_API_URL}/uploads/`;

function authH(json = true) {
  const h = { Authorization: `Bearer ${localStorage.getItem("token")}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

const SERIES_FIELDS = [
  { key: "seriepc",       label: "Serie PC",      icon: "🖥️" },
  { key: "seriepantalla", label: "Pantalla",       icon: "🖥" },
  { key: "serieteclado",  label: "Teclado",        icon: "⌨️" },
  { key: "mouse",         label: "Mouse",           icon: "🖱️" },
  { key: "headset",       label: "Headset",         icon: "🎧" },
];

// ═══════════════════════════════════════════════════════════════
// Helpers UI
// ═══════════════════════════════════════════════════════════════
function EquipoImg({ src, size = 48, onClick }) {
  const [err, setErr] = useState(false);
  if (!src || err)
    return (
      <div onClick={onClick} style={{ width: size, height: size }}
        className="rounded-xl bg-slate-100 flex items-center justify-center text-xl text-slate-400 shrink-0">
        🖥️
      </div>
    );
  return (
    <img src={`${IMG_URL}${src}`} onError={() => setErr(true)} onClick={onClick}
      style={{ width: size, height: size, objectFit: "cover" }}
      className="rounded-xl border border-slate-200 shrink-0 cursor-zoom-in hover:opacity-90 transition" />
  );
}

function Modal({ title, wide, onClose, children }) {
  useEffect(() => {
    const h = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,.55)", backdropFilter: "blur(4px)" }}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-lg"} max-h-[92vh] flex flex-col`}
        style={{ animation: "fadeUp .18s ease" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

function ImgZoom({ src, onClose }) {
  useEffect(() => {
    const h = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,.82)", backdropFilter: "blur(6px)", cursor: "zoom-out" }}>
      <img src={`${IMG_URL}${src}`} className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain"
        onClick={e => e.stopPropagation()} />
      <button onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 text-white font-bold flex items-center justify-center hover:bg-white/30 transition">✕</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Formulario equipo
// ═══════════════════════════════════════════════════════════════
const EMPTY_EQ = {
  codigo:"",seriepc:"",seriepantalla:"",serieteclado:"",
  mouse:"",headset:"",asesor:"",observacion:"",
  firma:"",archivo:"",correos:"",opcion:""
};

function FormEquipo({ inicial, onSave, onClose }) {
  const [form, setForm]     = useState({ ...EMPTY_EQ, ...inicial });
  const [imgFile, setImgFile] = useState(null);
  const [preview, setPreview] = useState(inicial?.imagen ? `${IMG_URL}${inicial.imagen}` : null);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState("");
  const fileRef               = useRef(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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
      const res = await fetch(isEdit ? `${API}/equipos/${inicial.id}` : `${API}/equipos`,
        { method: isEdit ? "PUT" : "POST", headers: authH(false), body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSave(data.data);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  const Inp = ({ label, field, ph, ...p }) => (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <input value={form[field] ?? ""} onChange={e => set(field, e.target.value)} placeholder={ph}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" {...p} />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Imagen */}
      <div className="flex items-center gap-4">
        <div onClick={() => fileRef.current?.click()}
          className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 hover:border-indigo-400 flex items-center justify-center cursor-pointer overflow-hidden transition shrink-0">
          {preview ? <img src={preview} className="w-full h-full object-cover" /> : <span className="text-3xl">📷</span>}
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-1">Foto del equipo</p>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
            {preview ? "Cambiar foto" : "Subir foto"}
          </button>
          {imgFile && <p className="text-[10px] text-slate-400 mt-1">{imgFile.name}</p>}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Inp label="Código *" field="codigo" ph="NV-PC-001" />
        <Inp label="Asesor"   field="asesor"  ph="Nombre del asesor" />
      </div>

      <div className="bg-slate-50 rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Series de componentes</p>
        <div className="grid grid-cols-2 gap-3">
          {SERIES_FIELDS.map(f => (
            <Inp key={f.key} label={`${f.icon} ${f.label}`} field={f.key} ph="SN / código" />
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Observación</label>
        <textarea value={form.observacion ?? ""} onChange={e => set("observacion", e.target.value)}
          rows={2} placeholder="Estado, novedades…"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400" />
      </div>

      {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">❌ {err}</p>}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onClose}
          className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-semibold hover:bg-slate-50 transition">Cancelar</button>
        <button type="submit" disabled={saving}
          className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition disabled:opacity-50">
          {saving ? "Guardando…" : inicial?.id ? "Actualizar" : "Registrar"}
        </button>
      </div>
    </form>
  );
}

// ═══════════════════════════════════════════════════════════════
// PLANO — mapa visual de puestos
// ═══════════════════════════════════════════════════════════════

/**
 * Layout del piso: cada elemento puede ser:
 *   número  → puesto clickeable
 *   null    → espacio vacío
 *   "GAP"   → separación vertical entre bloques
 *   "LABEL" → etiqueta especial (coordinadora, etc.)
 * Ajusta este array para reflejar el layout físico real.
 * Los números corresponden al orden (id) de los equipos.
 */
const FLOOR_LAYOUT = [
  // Fila superior
  [1, 2, 3, 4],
  // Fila inferior
  [5, 6, 7, 8],
];

function PuestoCell({ puesto, equipo, selected, onClick }) {
  const asignado = equipo && equipo.asesor && equipo.asesor !== "Sin asignar";

  const bg      = selected  ? "#6366f1"
                : asignado  ? "#eef2ff"
                :             "#f8fafc";
  const border  = selected  ? "#6366f1"
                : asignado  ? "#a5b4fc"
                :             "#e2e8f0";
  const textCol = selected  ? "#fff"
                : asignado  ? "#3730a3"
                :             "#94a3b8";
  const dotCol  = asignado  ? "#10b981" : "#cbd5e1";

  return (
    <div onClick={onClick}
      style={{
        background: bg,
        border: `2px solid ${border}`,
        color: textCol,
        width: 80,
        height: 72,
        borderRadius: 12,
        cursor: "pointer",
        transition: "all .15s",
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        boxShadow: selected ? "0 0 0 3px #a5b4fc" : "0 1px 3px rgba(0,0,0,.06)",
        position: "relative",
      }}
      className="hover:scale-105 active:scale-95">
      {/* Punto de estado */}
      <div style={{
        position: "absolute", top: 7, right: 7,
        width: 8, height: 8, borderRadius: "50%",
        background: dotCol
      }} />
      {/* Número de puesto */}
      <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{puesto}</span>
      {/* Código o estado */}
      <span style={{ fontSize: 9, fontWeight: 600, opacity: .8, letterSpacing: .5 }}>
        {equipo?.codigo || "VACÍO"}
      </span>
      {/* Asesor (truncado) */}
      {asignado && (
        <span style={{
          fontSize: 8, fontWeight: 500, opacity: .75,
          maxWidth: 68, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          textAlign: "center"
        }}>
          {equipo.asesor.split(" ")[0]}
        </span>
      )}
    </div>
  );
}

function PanelDetalle({ equipo, puesto, onClose, onEdit, onImgZoom }) {
  if (!equipo) return (
    <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-3 py-12">
      <span className="text-6xl">🖥️</span>
      <p className="text-sm font-semibold text-slate-400">Selecciona un puesto</p>
      <p className="text-xs text-slate-300">Haz clic en cualquier estación del mapa</p>
    </div>
  );

  const asignado = equipo.asesor && equipo.asesor !== "Sin asignar";

  return (
    <div className="h-full flex flex-col" style={{ animation: "fadeUp .18s ease" }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl font-black text-slate-800">Puesto {puesto}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
              asignado ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-400"
            }`}>
              {asignado ? "Asignado" : "Vacío"}
            </span>
          </div>
          <p className="text-sm font-bold text-indigo-600">{equipo.codigo}</p>
        </div>
        <button onClick={onClose}
          className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 font-bold flex items-center justify-center transition text-sm">
          ✕
        </button>
      </div>

      {/* Foto */}
      <div className="mb-5 flex justify-center">
        {equipo.imagen ? (
          <img src={`${IMG_URL}${equipo.imagen}`}
            onClick={() => onImgZoom(equipo.imagen)}
            className="w-full max-h-44 object-cover rounded-xl border border-slate-200 cursor-zoom-in hover:opacity-90 transition" />
        ) : (
          <div className="w-full h-28 rounded-xl bg-slate-100 flex items-center justify-center text-5xl">🖥️</div>
        )}
      </div>

      {/* Asesor */}
      <div className="mb-4 px-4 py-3 rounded-xl"
        style={{ background: asignado ? "#eef2ff" : "#f8fafc", border: "1px solid", borderColor: asignado ? "#c7d2fe" : "#e2e8f0" }}>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Asesor asignado</p>
        <p className={`text-base font-bold ${asignado ? "text-indigo-700" : "text-slate-400"}`}>
          {asignado ? equipo.asesor : "Sin asignar"}
        </p>
      </div>

      {/* Series */}
      <div className="space-y-2 flex-1 overflow-y-auto">
        {SERIES_FIELDS.map(f => (
          <div key={f.key} className="flex items-center justify-between py-2 border-b border-slate-50">
            <span className="text-xs text-slate-500 flex items-center gap-1.5">
              <span>{f.icon}</span> {f.label}
            </span>
            <span className={`text-xs font-semibold font-mono ${equipo[f.key] ? "text-slate-700" : "text-slate-300"}`}>
              {equipo[f.key] || "—"}
            </span>
          </div>
        ))}

        {equipo.observacion && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-1">📝 Observación</p>
            <p className="text-xs text-amber-800">{equipo.observacion}</p>
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="mt-5 pt-4 border-t border-slate-100">
        <button onClick={onEdit}
          className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition text-sm">
          ✏️ Editar equipo
        </button>
        <p className="text-center text-[10px] text-slate-300 mt-2">
          Registro: {new Date(equipo.fecharegistro).toLocaleDateString("es-EC")}
        </p>
      </div>
    </div>
  );
}

function PlanoTab({ equipos, onEditEquipo, onRefresh }) {
  const [selected, setSelected] = useState(null); // número de puesto (1-based)
  const [imgZoom, setImgZoom]   = useState(null);

  // Mapear puestos → equipos (orden por id ASC = orden natural de la tabla)
  const equiposPorPuesto = {};
  [...equipos].sort((a, b) => a.id - b.id).forEach((eq, i) => {
    equiposPorPuesto[i + 1] = eq;
  });

  const totalPuestos = FLOOR_LAYOUT.flat().filter(Boolean).length;
  const asignados    = Object.values(equiposPorPuesto).filter(e => e?.asesor && e.asesor !== "Sin asignar").length;

  const selectedEquipo = selected ? equiposPorPuesto[selected] : null;

  return (
    <div className="flex gap-6 h-full" style={{ minHeight: 520 }}>
      {/* ── Mapa de piso ── */}
      <div className="flex-1 min-w-0">
        {/* Leyenda */}
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-3 h-3 rounded-full bg-green-400" />
            <span>Asignado ({asignados})</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-3 h-3 rounded-full bg-slate-300" />
            <span>Vacío ({totalPuestos - asignados})</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-3 h-3 rounded-full bg-indigo-500" />
            <span>Seleccionado</span>
          </div>
          <span className="ml-auto text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full font-semibold">
            {totalPuestos} puestos · {equipos.length} equipos registrados
          </span>
        </div>

        {/* Plano */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 overflow-x-auto">
          {/* Indicador de norte/frente */}
          <div className="flex items-center gap-2 mb-6">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-widest px-3">↑ Frente</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <div className="flex flex-col gap-8 items-start">
            {FLOOR_LAYOUT.map((fila, fi) => (
              <div key={fi}>
                {/* Etiqueta de fila */}
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                  Fila {fi + 1}
                </p>
                <div className="flex gap-4 flex-wrap">
                  {fila.map((puesto, ci) =>
                    puesto === null ? (
                      <div key={ci} style={{ width: 80, height: 72 }} />
                    ) : (
                      <PuestoCell
                        key={puesto}
                        puesto={puesto}
                        equipo={equiposPorPuesto[puesto]}
                        selected={selected === puesto}
                        onClick={() => setSelected(selected === puesto ? null : puesto)}
                      />
                    )
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-6">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-widest px-3">↓ Entrada</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
        </div>

        {/* Mini stats de puestos */}
        <div className="mt-4 grid grid-cols-4 gap-3">
          {Object.entries(equiposPorPuesto).slice(0, 8).map(([puesto, eq]) => {
            const ok = eq?.asesor && eq.asesor !== "Sin asignar";
            return (
              <div key={puesto} onClick={() => setSelected(Number(puesto))}
                className={`rounded-xl p-3 cursor-pointer transition border ${
                  selected === Number(puesto)
                    ? "border-indigo-400 bg-indigo-50"
                    : "border-slate-200 bg-white hover:border-indigo-200"
                }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black text-slate-600">P{puesto}</span>
                  <div className={`w-2 h-2 rounded-full ${ok ? "bg-green-400" : "bg-slate-300"}`} />
                </div>
                <p className="text-[10px] text-slate-500 font-mono truncate">{eq?.codigo || "—"}</p>
                <p className="text-[10px] text-slate-400 truncate">{ok ? eq.asesor.split(" ")[0] : "Vacío"}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Panel de detalle lateral ── */}
      <div className="w-72 shrink-0">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 h-full">
          <PanelDetalle
            puesto={selected}
            equipo={selectedEquipo}
            onClose={() => setSelected(null)}
            onImgZoom={setImgZoom}
            onEdit={() => onEditEquipo(selectedEquipo)}
          />
        </div>
      </div>

      {imgZoom && <ImgZoom src={imgZoom} onClose={() => setImgZoom(null)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default function Inventario() {
  const [equipos,   setEquipos]   = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [tab,       setTab]       = useState("equipos");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");

  const [buscar,     setBuscar]     = useState("");
  const [filtAsesor, setFiltAsesor] = useState("");

  const [modal,   setModal]   = useState(null);
  const [imgZoom, setImgZoom] = useState(null);

  // ── Fetch ──────────────────────────────────────────────────────
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

  // ── Delete ─────────────────────────────────────────────────────
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

  function handleSaved(saved) {
    setEquipos(prev => {
      const idx = prev.findIndex(e => e.id === saved.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n; }
      return [saved, ...prev];
    });
    fetchDashboard();
    setModal(null);
  }

  const asesores = [...new Set(equipos.map(e => e.asesor).filter(a => a && a !== "Sin asignar"))].sort();

  const kpis = dashboard ? [
    { label: "Total equipos", val: dashboard.resumen?.total      ?? 0, icon: "📦", color: "#6366f1" },
    { label: "Asignados",     val: dashboard.resumen?.asignados  ?? 0, icon: "👤", color: "#10b981" },
    { label: "Sin asignar",   val: dashboard.resumen?.sin_asignar?? 0, icon: "📭", color: "#f59e0b" },
    { label: "Con foto",      val: dashboard.resumen?.con_imagen ?? 0, icon: "📷", color: "#3b82f6" },
  ] : [];

  const TABS = [
    { key: "planos",    label: "🗺️ Plano" },
    { key: "equipos",   label: "📦 Equipos" },
    { key: "dashboard", label: "📊 Resumen" },
  ];

  return (
    <div className="animate-fade-in-up pb-12">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">🖥️ Inventario de Equipos</h1>
          <p className="text-slate-500 mt-1">Control de equipos, plano de piso y asignación por asesor</p>
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
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setError(""); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t.key ? "bg-white shadow text-indigo-700" : "text-slate-500 hover:text-slate-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">❌ {error}</div>}

      {/* ── PLANO ── */}
      {tab === "planos" && (
        <PlanoTab
          equipos={equipos}
          onEditEquipo={eq => setModal({ type: "form", data: eq })}
          onRefresh={fetchEquipos}
        />
      )}

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

      {/* ── EQUIPOS ── */}
      {tab === "equipos" && (
        <div className="space-y-4">
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
                      {["#","Foto","Código","Serie PC","Pantalla","Teclado","Mouse","Headset","Asesor","Observación",""].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {equipos.map((eq, idx) => (
                      <tr key={eq.id} className="border-t border-slate-50 hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-black flex items-center justify-center">
                            {idx + 1}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <EquipoImg src={eq.imagen} size={44} onClick={eq.imagen ? () => setImgZoom(eq.imagen) : undefined} />
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-black text-slate-800">{eq.codigo}</p>
                          <p className="text-[10px] text-slate-400">#{eq.id}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{eq.seriepc       || <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{eq.seriepantalla || <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{eq.serieteclado  || <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{eq.mouse         || <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{eq.headset       || <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3">
                          {eq.asesor && eq.asesor !== "Sin asignar"
                            ? <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold">{eq.asesor}</span>
                            : <span className="text-slate-300 text-xs">Sin asignar</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 max-w-[140px] truncate" title={eq.observacion || ""}>
                          {eq.observacion || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            <button title="Editar" onClick={() => setModal({ type: "form", data: eq })}
                              className="px-2.5 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition">✏️</button>
                            <button title="Eliminar" onClick={() => handleDelete(eq.id, eq.codigo)}
                              className="px-2.5 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition">🗑</button>
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
        <Modal title={modal.data ? `Editar ${modal.data.codigo}` : "Registrar nuevo equipo"} wide onClose={() => setModal(null)}>
          <FormEquipo inicial={modal.data} onClose={() => setModal(null)} onSave={handleSaved} />
        </Modal>
      )}

      {imgZoom && <ImgZoom src={imgZoom} onClose={() => setImgZoom(null)} />}
    </div>
  );
}
