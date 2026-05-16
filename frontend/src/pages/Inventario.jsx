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
// PLANO — layout real del call center (46 puestos)
// ═══════════════════════════════════════════════════════════════

const SUPS_SET = new Set([10, 22, 27]); // puestos de supervisión

// Colores por tipo de celda
const C_ASESOR  = { bg: "#E1F5EE", border: "#5DCAA5", color: "#085041", lbColor: "#1D9E75" };
const C_SUP     = { bg: "#E6F1FB", border: "#85B7EB", color: "#042C53", lbColor: "#378ADD" };
const C_SEL     = { bg: "#dbeafe", border: "#3b82f6", color: "#1e40af", lbColor: "#3b82f6" };
const C_EMPTY   = { bg: "#f1f5f9", border: "#e2e8f0", color: "#b0b8c1" };
const C_VACANT  = { bg: "#f8fafc", border: "#e2e8f0", color: "#b0b8c1", lbColor: "#b0b8c1" };

function PuestoCell({ num, equipo, selected, onSelect }) {
  const isSup    = SUPS_SET.has(num);
  const asignado = equipo?.asesor && equipo.asesor !== "Sin asignar";
  const isSel    = selected === num;

  const c = isSel ? C_SEL : isSup ? C_SUP : asignado ? C_ASESOR : C_VACANT;

  return (
    <div
      onClick={() => onSelect(isSel ? null : num)}
      style={{
        width: 52, height: 46, borderRadius: 7, flexShrink: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 500,
        cursor: "pointer",
        background: c.bg,
        border: `1.5px solid ${c.border}`,
        color: c.color,
        outline: isSel ? "2px solid #378ADD" : "none",
        outlineOffset: isSel ? 2 : 0,
        userSelect: "none",
        transition: "transform .1s",
      }}
      onMouseEnter={e => e.currentTarget.style.transform = "scale(1.1)"}
      onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
    >
      <span>{num}</span>
      <span style={{ fontSize: 9, fontWeight: 400, marginTop: 1, color: c.lbColor }}>
        {isSup ? "SUP" : asignado ? equipo.asesor.split(" ")[0].substring(0, 6) : "PC"}
      </span>
    </div>
  );
}

function XCell() {
  return (
    <div style={{
      width: 52, height: 46, borderRadius: 7, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 18, color: "#cbd5e1",
      background: C_EMPTY.bg, border: `1.5px solid ${C_EMPTY.border}`,
    }}>×</div>
  );
}

function SpCell({ label, cls }) {
  const s = {
    COORD: { bg: "#FAEEDA", border: "#EF9F27", color: "#633806" },
    ANA:   { bg: "#FBEAF0", border: "#ED93B1", color: "#72243E" },
    GER:   { bg: "#EEEDFE", border: "#AFA9EC", color: "#3C3489" },
  }[cls] || { bg: "#f1f5f9", border: "#e2e8f0", color: "#64748b" };
  return (
    <div style={{
      height: 46, borderRadius: 7, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "0 10px", whiteSpace: "nowrap",
      background: s.bg, border: `1.5px solid ${s.border}`, color: s.color,
      fontSize: 10, fontWeight: 500,
    }}>
      {label}
    </div>
  );
}

function R({ children }) {
  return <div style={{ display: "flex", gap: 6, alignItems: "center" }}>{children}</div>;
}

function FloorPlan({ equiposPorPuesto, selected, onSelect }) {
  const P = (n) => (
    <PuestoCell key={n} num={n} equipo={equiposPorPuesto[n]} selected={selected} onSelect={onSelect} />
  );
  return (
    <div style={{ overflowX: "auto" }}>
      {/* FILA TOP: x 14 15 16 17 x 18 19 x 20 x */}
      <R>{[null,14,15,16,17,null,18,19,null,20,null].map((v,i) =>
        v === null ? <XCell key={i}/> : P(v)
      )}</R>

      <div style={{ height: 10 }} />

      {/* BLOQUE MEDIO */}
      <div style={{ display: "flex", gap: 0, alignItems: "flex-start" }}>
        {/* Bloque A */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <R>{[13,12,11,10].map(P)}</R>
          <R>{[6,7,8,9].map(P)}</R>
        </div>

        <div style={{ width: 58, flexShrink: 0 }} />

        {/* Bloque B */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <R>{[28,27,26,25,24,23,22,21].map(P)}</R>
          <R>{[29,30,31,32,33,34,35,36].map(P)}</R>
        </div>

        <div style={{ width: 20, flexShrink: 0 }} />

        {/* Gerencia */}
        <SpCell label="Gerencia" cls="GER" />
      </div>

      <div style={{ height: 10 }} />

      {/* BLOQUE C + Analista/Consulta */}
      <div style={{ display: "flex", gap: 0, alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <R><XCell/><XCell/>{P(5)}{P(4)}<SpCell label="Coordinadora" cls="COORD"/></R>
          <R>{P(1)}<XCell/>{P(2)}{P(3)}</R>
        </div>

        <div style={{ width: 58, flexShrink: 0 }} />

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <SpCell label="Analista" cls="ANA" />
          <SpCell label="Consulta" cls="ANA" />
        </div>
      </div>

      <div style={{ height: 10 }} />

      {/* BLOQUE E + Bloque D (alineados abajo) */}
      <div style={{ display: "flex", gap: 0, alignItems: "flex-end" }}>
        {/* Bloque E */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ height: 46 }} />
          {P(46)}{P(45)}{P(44)}
          <R>{[43,42,41].map(P)}</R>
        </div>

        <div style={{ width: 58, flexShrink: 0 }} />

        {/* Bloque D */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {P(37)}{P(38)}{P(39)}{P(40)}<XCell/>
        </div>
      </div>
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

  const isSup    = SUPS_SET.has(puesto);
  const asignado = equipo.asesor && equipo.asesor !== "Sin asignar";

  return (
    <div className="h-full flex flex-col" style={{ animation: "fadeUp .18s ease" }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl font-black text-slate-800">Puesto {puesto}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
              isSup ? "bg-blue-100 text-blue-700" :
              asignado ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
            }`}>
              {isSup ? "Supervisor" : asignado ? "Asesor" : "Vacío"}
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
      <div className="mb-4 flex justify-center">
        {equipo.imagen ? (
          <img src={`${IMG_URL}${equipo.imagen}`}
            onClick={() => onImgZoom(equipo.imagen)}
            className="w-full max-h-36 object-cover rounded-xl border border-slate-200 cursor-zoom-in hover:opacity-90 transition" />
        ) : (
          <div className="w-full h-24 rounded-xl bg-slate-100 flex items-center justify-center text-4xl">🖥️</div>
        )}
      </div>

      {/* Asesor */}
      <div className="mb-3 px-3 py-2.5 rounded-xl"
        style={{ background: asignado ? "#eef2ff" : "#f8fafc", border: "1px solid", borderColor: asignado ? "#c7d2fe" : "#e2e8f0" }}>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Asesor asignado</p>
        <p className={`text-sm font-bold ${asignado ? "text-indigo-700" : "text-slate-400"}`}>
          {asignado ? equipo.asesor : "Sin asignar"}
        </p>
      </div>

      {/* Series */}
      <div className="space-y-1.5 flex-1 overflow-y-auto">
        {SERIES_FIELDS.map(f => (
          <div key={f.key} className="flex items-center justify-between py-1.5 border-b border-slate-50">
            <span className="text-xs text-slate-500 flex items-center gap-1">{f.icon} {f.label}</span>
            <span className={`text-xs font-semibold font-mono ${equipo[f.key] ? "text-slate-700" : "text-slate-300"}`}>
              {equipo[f.key] || "—"}
            </span>
          </div>
        ))}
        {equipo.observacion && (
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-0.5">📝 Observación</p>
            <p className="text-xs text-amber-800">{equipo.observacion}</p>
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        <button onClick={onEdit}
          className="w-full py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition text-sm">
          ✏️ Editar equipo
        </button>
        <p className="text-center text-[10px] text-slate-300 mt-1.5">
          Registro: {new Date(equipo.fecharegistro).toLocaleDateString("es-EC")}
        </p>
      </div>
    </div>
  );
}

function PlanoTab({ equipos, onEditEquipo }) {
  const [selected, setSelected] = useState(null);
  const [imgZoom,  setImgZoom]  = useState(null);

  // Puesto N → Nº equipo ordenado por id ASC
  const equiposPorPuesto = {};
  [...equipos].sort((a, b) => a.id - b.id).forEach((eq, i) => {
    equiposPorPuesto[i + 1] = eq;
  });

  const totalPuestos = 46;
  const asignados = Object.values(equiposPorPuesto)
    .filter(e => e?.asesor && e.asesor !== "Sin asignar").length;
  const selectedEquipo = selected ? equiposPorPuesto[selected] : null;

  return (
    <div className="flex gap-5" style={{ minHeight: 520 }}>
      {/* ── Plano ── */}
      <div className="flex-1 min-w-0">
        {/* Leyenda */}
        <div className="flex items-center gap-3 mb-4 flex-wrap bg-white rounded-xl border border-slate-200 px-4 py-2.5 shadow-sm w-fit">
          {[
            { dot: "#1D9E75", label: `Asesor (${asignados})` },
            { dot: "#378ADD", label: "Supervisor" },
            { dot: "#EF9F27", label: "Especial" },
            { dot: "#b0b8c1", label: `Vacío (${totalPuestos - asignados})` },
          ].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#64748b" }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: l.dot }} />
              {l.label}
            </div>
          ))}
        </div>

        {/* Plano de piso */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-widest mb-4 text-center">
            Call Center — Inventario de Puestos
          </div>
          <FloorPlan
            equiposPorPuesto={equiposPorPuesto}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
      </div>

      {/* ── Panel detalle ── */}
      <div className="w-64 shrink-0">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sticky top-4" style={{ minHeight: 400 }}>
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
          {/* KPI Cards */}
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

          {/* Plano de piso en dashboard */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-700">🗺️ Plano de piso</h3>
              <button onClick={() => setTab("planos")}
                className="text-xs text-indigo-600 font-semibold hover:underline">
                Ver pantalla completa →
              </button>
            </div>
            <div className="p-6">
              <PlanoTab
                equipos={equipos}
                onEditEquipo={eq => setModal({ type: "form", data: eq })}
                onRefresh={fetchEquipos}
              />
            </div>
          </div>

          {/* Equipos por asesor */}
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
