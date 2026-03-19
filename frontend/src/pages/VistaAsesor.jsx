import { useEffect, useState, useMemo } from "react";
import * as XLSX from "xlsx";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const getFechaHoyEcuador = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });

const getPrimerDiaMes = () => {
  const d = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Guayaquil" })
  );
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const pct = (v, meta) =>
  Math.min(Math.round((Number(v || 0) / meta) * 100), 100);

const initials = (n) =>
  (n || "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

// ─────────────────────────────────────────────────────────────────────────────
// METAS
// ─────────────────────────────────────────────────────────────────────────────
const METAS = {
  gestionables: 200,
  ingresos_crm: 80,
  ingresos_jot: 65,
  activas:       60,
};

// ─────────────────────────────────────────────────────────────────────────────
// PILL COLOR
// ─────────────────────────────────────────────────────────────────────────────
const PILL_CONFIG = {
  ACTIVO:       { bg: "#dcfce7", color: "#166534", border: "#86efac" },
  PRESERVICIO:  { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd" },
  RECHAZADO:    { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5" },
  ASIGNADO:     { bg: "#fef9c3", color: "#854d0e", border: "#fde047" },
  "SIN ESTADO": { bg: "#f8fafc", color: "#94a3b8", border: "#e2e8f0" },
};
const pillStyle = (e) => PILL_CONFIG[e] || PILL_CONFIG["SIN ESTADO"];

// ─────────────────────────────────────────────────────────────────────────────
// MODAL DETALLE CLIENTE
// ─────────────────────────────────────────────────────────────────────────────
function ClienteModal({ cliente, onClose }) {
  if (!cliente) return null;

  // Campos con etiquetas legibles
  const LABELS = {
    FECHACREACION_JOT:    "Fecha registro",
    ID_CRM:               "ID CRM",
    ESTADO_NETLIFE:       "Estado Netlife",
    FECHA_ACTIVACION:     "Fecha activación",
    NOVEDADES_ATC:        "Novedades ATC",
    ESTADO_REGULARIZACION:"Estado regularización",
    MOTIVO_REGULARIZAR:   "Motivo regularización",
    FORMA_PAGO:           "Forma de pago",
    LOGIN:                "Login Netlife",
    ASESOR:               "Asesor",
    SUPERVISOR_ASIGNADO:  "Supervisor",
  };

  const estadoStyle = pillStyle(cliente.ESTADO_NETLIFE || "SIN ESTADO");

  return (
    // Overlay — faux viewport para evitar fixed
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 20,
          border: "1px solid #e2e8f0",
          width: "100%", maxWidth: 520,
          maxHeight: "85vh", overflowY: "auto",
          boxShadow: "0 24px 60px rgba(0,0,0,.15)",
          animation: "modalIn .18s ease-out",
        }}
      >
        {/* Header modal */}
        <div style={{
          padding: "18px 20px 14px",
          borderBottom: "1px solid #f1f5f9",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          position: "sticky", top: 0, background: "#fff", zIndex: 1,
          borderRadius: "20px 20px 0 0",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: "50%",
              background: "#e0f2fe", border: "2px solid #0ea5e9",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 800, color: "#0284c7", flexShrink: 0,
            }}>
              {initials(cliente.ASESOR || "?")}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a",
                textTransform: "uppercase", letterSpacing: ".02em" }}>
                {cliente.ASESOR || "—"}
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                {cliente.SUPERVISOR_ASIGNADO || "Sin supervisor"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Badge estado */}
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
              textTransform: "uppercase", letterSpacing: ".05em",
              background: estadoStyle.bg, color: estadoStyle.color,
              border: `1px solid ${estadoStyle.border}`,
            }}>
              {cliente.ESTADO_NETLIFE || "SIN ESTADO"}
            </span>
            <button
              onClick={onClose}
              style={{
                width: 30, height: 30, borderRadius: "50%",
                background: "#f8fafc", border: "1px solid #e2e8f0",
                cursor: "pointer", fontSize: 14, color: "#64748b",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, transition: "background .15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#fee2e2"}
              onMouseLeave={(e) => e.currentTarget.style.background = "#f8fafc"}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Cuerpo — grid de campos */}
        <div style={{ padding: "16px 20px 20px" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
          }}>
            {Object.entries(LABELS).map(([key, label]) => {
              const val = cliente[key];
              if (!val && val !== 0) return null;
              return (
                <div
                  key={key}
                  style={{
                    background: "#f8fafc", borderRadius: 10,
                    border: "1px solid #f1f5f9", padding: "10px 12px",
                    // campos largos ocupan las 2 columnas
                    gridColumn: ["NOVEDADES_ATC","MOTIVO_REGULARIZAR"].includes(key) ? "1 / -1" : "auto",
                  }}
                >
                  <div style={{
                    fontSize: 9, fontWeight: 700, color: "#94a3b8",
                    textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4,
                  }}>
                    {label}
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: "#0f172a",
                    wordBreak: "break-word", lineHeight: 1.3,
                  }}>
                    {String(val)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Campos extra no mapeados */}
          {Object.entries(cliente)
            .filter(([k]) => !Object.keys(LABELS).includes(k))
            .filter(([, v]) => v !== null && v !== undefined && v !== "")
            .length > 0 && (
            <div style={{ marginTop: 12, borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8",
                textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>
                Datos adicionales
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {Object.entries(cliente)
                  .filter(([k]) => !Object.keys(LABELS).includes(k))
                  .filter(([, v]) => v !== null && v !== undefined && v !== "")
                  .map(([k, v]) => (
                    <div key={k} style={{
                      background: "#f8fafc", borderRadius: 8,
                      border: "1px solid #f1f5f9", padding: "8px 10px",
                    }}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: "#cbd5e1",
                        textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>
                        {k}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#475569",
                        wordBreak: "break-word" }}>
                        {String(v)}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px", borderTop: "1px solid #f1f5f9",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "#f8fafc", borderRadius: "0 0 20px 20px",
        }}>
          <span style={{ fontSize: 9, color: "#cbd5e1", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: ".1em" }}>
            ID CRM: {cliente.ID_CRM || "—"}
          </span>
          <button
            onClick={onClose}
            style={{
              background: "#0ea5e9", color: "#fff", border: "none",
              borderRadius: 8, padding: "7px 18px", fontSize: 10,
              fontWeight: 800, cursor: "pointer", textTransform: "uppercase",
              letterSpacing: ".06em", transition: "background .15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "#0284c7"}
            onMouseLeave={(e) => e.currentTarget.style.background = "#0ea5e9"}
          >
            Cerrar
          </button>
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(.96) translateY(8px); }
          to   { opacity: 1; transform: scale(1)  translateY(0);    }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RANK BADGE
// ─────────────────────────────────────────────────────────────────────────────
function RankBadge({ pos }) {
  const configs = [
    { bg: "#fef9c3", color: "#a16207", border: "#fde047", icon: "🥇" },
    { bg: "#f1f5f9", color: "#475569", border: "#cbd5e1", icon: "🥈" },
    { bg: "#fef3c7", color: "#92400e", border: "#fcd34d", icon: "🥉" },
  ];
  const c = configs[pos] || { bg: "#f8fafc", color: "#94a3b8", border: "#e2e8f0", icon: "" };
  return (
    <span style={{
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      borderRadius: 20, padding: "3px 10px", fontWeight: 800, fontSize: 11,
      whiteSpace: "nowrap",
    }}>
      {c.icon ? `${c.icon} #${pos + 1}` : `#${pos + 1}`}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BARRA DE PROGRESO
// ─────────────────────────────────────────────────────────────────────────────
function BarProgress({ label, value, meta, color }) {
  const p      = pct(value, meta);
  const cumple = p >= 97;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8",
          textTransform: "uppercase", letterSpacing: ".06em" }}>
          {label}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1" }}>
          <span style={{ color: cumple ? "#16a34a" : "#0f172a", fontWeight: 900 }}>{value}</span>
          {" / "}{meta}
        </span>
      </div>
      <div style={{ height: 5, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${p}%`, background: color,
          borderRadius: 3, transition: "width .7s cubic-bezier(.4,0,.2,1)",
        }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TARJETA ASESOR — ancho fijo para scroll horizontal (1 por fila)
// ─────────────────────────────────────────────────────────────────────────────
function AsesorCard({ row, rank }) {
  const etapas = row.etapasJot || [];
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 14,
        overflow: "hidden",
        width: "100%",
        transition: "transform .15s, box-shadow .15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 6px 24px #0ea5e918";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "";
      }}
    >
      {/* HEADER */}
      <div style={{
        padding: "12px 16px 10px", display: "flex",
        justifyContent: "space-between", alignItems: "center",
        borderBottom: "1px solid #f1f5f9",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
            background: "#e0f2fe", border: "2px solid #0ea5e9",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 800, color: "#0284c7",
          }}>
            {initials(row.nombre_grupo)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 800, color: "#0f172a", textTransform: "uppercase",
              letterSpacing: ".02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {row.nombre_grupo}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
              {row.supervisor || "Sin supervisor"}
            </div>
          </div>
        </div>
        <RankBadge pos={rank} />
      </div>

      {/* MÉTRICAS: Leads · CRM · Jot · Regularización */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 1, background: "#f1f5f9" }}>
        {[
          { label: "Leads Gest.", val: row.gestionables,    color: "#0ea5e9" },
          { label: "Ingr. CRM",   val: row.ventas_crm,       color: "#8b5cf6" },
          { label: "Ingr. Jot",   val: row.ingresos_reales,  color: "#10b981" },
          { label: "Regulariz.",  val: row.regularizacion,   color: "#f97316" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: "#fff", padding: "12px 14px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8",
              textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 3 }}>
              {label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1 }}>
              {Number(val || 0)}
            </div>
          </div>
        ))}
      </div>

      {/* BARRAS + ETAPAS en fila horizontal para aprovechar el ancho */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, padding: "12px 16px 14px" }}>
        {/* Barras */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <BarProgress label="Leads"   value={Number(row.gestionables || 0)}   meta={METAS.gestionables} color="#0ea5e9" />
          <BarProgress label="CRM"     value={Number(row.ventas_crm || 0)}      meta={METAS.ingresos_crm} color="#8b5cf6" />
          <BarProgress label="Jotform" value={Number(row.ingresos_reales || 0)} meta={METAS.ingresos_jot} color="#10b981" />
          <BarProgress label="Activas" value={Number(row.real_mes || 0)}         meta={METAS.activas}      color="#f59e0b" />
          <div style={{ fontSize: 10, color: "#94a3b8", paddingTop: 2 }}>
            Mes <strong style={{ color: "#f59e0b" }}>{Number(row.real_mes || 0)}</strong>
            {" · "}BL <strong style={{ color: "#60a5fa" }}>{Number(row.backlog || 0)}</strong>
            {" · "}Tot <strong style={{ color: "#0f172a" }}>{Number(row.real_mes || 0) + Number(row.backlog || 0)}</strong>
            {" · "}Reg <strong style={{ color: "#f97316" }}>{Number(row.regularizacion || 0)}</strong>
          </div>
        </div>

        {/* Etapas Jotform a la derecha */}
        {etapas.length > 0 && (
          <div style={{
            display: "flex", flexDirection: "column", gap: 4,
            justifyContent: "flex-start", paddingTop: 2, minWidth: 140,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8",
              textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>
              Etapas Jot
            </div>
            {etapas.map(({ estado, total }) => {
              const s = pillStyle(estado);
              return (
                <span key={estado} style={{
                  fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 20,
                  textTransform: "uppercase", letterSpacing: ".04em",
                  background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                  whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5,
                }}>
                  {estado}
                  <span style={{ fontWeight: 900, fontSize: 11 }}>{total}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STRIP CARD
// ─────────────────────────────────────────────────────────────────────────────
function StripCard({ label, value, color, meta }) {
  const p = meta ? pct(value, meta) : null;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8",
        textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1 }}>
        {value.toLocaleString()}
      </div>
      {p !== null && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between",
            fontSize: 9, color: "#94a3b8", marginBottom: 4 }}>
            <span>META</span><span>{p}%</span>
          </div>
          <div style={{ height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${p}%`, background: color,
              borderRadius: 2, transition: "width .7s" }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function VistaAsesor() {
  const [loading, setLoading]               = useState(false);
  const [asesores, setAsesores]             = useState([]);
  const [estadosNetlife, setEstadosNetlife] = useState([]);
  const [dataJotform, setDataJotform]       = useState([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);

  const [filtros, setFiltros] = useState({
    fechaDesde:           getPrimerDiaMes(),
    fechaHasta:           getFechaHoyEcuador(),
    asesor:               "",
    supervisor:           "",
    estadoNetlife:        "",
    estadoRegularizacion: "",
    etapaCRM:             "",
    etapaJotform:         "",
  });

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = async (overrideFiltros) => {
    setLoading(true);
    try {
      const f = overrideFiltros || filtros;
      const params = new URLSearchParams(
        Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ""))
      );
      const res    = await fetch(`${import.meta.env.VITE_API_URL}/api/indicadores/dashboard?${params}`);
      const result = await res.json();
      if (result.success) {
        setAsesores(result.asesores || []);
        setEstadosNetlife(result.estadosNetlife || []);
        setDataJotform(result.dataNetlife || []);
      }
    } catch (e) {
      console.error("Error VistaAsesor:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // ── Enriquecer asesores ───────────────────────────────────────────────────
  const asesoresEnriquecidos = useMemo(() => {
    const lista = filtros.asesor
      ? asesores.filter(
          (a) => a.nombre_grupo?.toUpperCase() === filtros.asesor.toUpperCase()
        )
      : asesores;

    return [...lista]
      .sort((a, b) => Number(b.ingresos_reales || 0) - Number(a.ingresos_reales || 0))
      .map((a) => {
        const registros = dataJotform.filter(
          (r) => (r.ASESOR || "").toUpperCase() === (a.nombre_grupo || "").toUpperCase()
        );
        const conteo = {};
        registros.forEach((r) => {
          const est = r.ESTADO_NETLIFE || "SIN ESTADO";
          conteo[est] = (conteo[est] || 0) + 1;
        });
        const etapasJot = Object.entries(conteo)
          .map(([estado, total]) => ({ estado, total }))
          .sort((a, b) => b.total - a.total);
        return { ...a, etapasJot };
      });
  }, [asesores, dataJotform, filtros.asesor]);

  // ── Totales ───────────────────────────────────────────────────────────────
  const totales = useMemo(() => {
    const base = asesoresEnriquecidos;
    return {
      gestionables:   base.reduce((a, r) => a + Number(r.gestionables || 0), 0),
      ingresos_crm:   base.reduce((a, r) => a + Number(r.ventas_crm || 0), 0),
      ingresos_jot:   base.reduce((a, r) => a + Number(r.ingresos_reales || 0), 0),
      activas_mes:    base.reduce((a, r) => a + Number(r.real_mes || 0), 0),
      activas_tot:    base.reduce((a, r) => a + Number(r.real_mes || 0) + Number(r.backlog || 0), 0),
      regularizacion: base.reduce((a, r) => a + Number(r.regularizacion || 0), 0),
    };
  }, [asesoresEnriquecidos]);

  // ── Dropdown ──────────────────────────────────────────────────────────────
  const nombresAsesores = useMemo(
    () => [...asesores].sort((a, b) => (a.nombre_grupo > b.nombre_grupo ? 1 : -1)),
    [asesores]
  );

  // ── Exportar Excel ────────────────────────────────────────────────────────
  const exportarExcel = () => {
    if (!dataJotform.length) return;
    const ws = XLSX.utils.json_to_sheet(dataJotform);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Jotform");
    XLSX.writeFile(wb, `Jotform_${filtros.fechaDesde}_${filtros.fechaHasta}.xlsx`);
  };

  const inputCls =
    "bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[10px] font-bold text-slate-800 outline-none focus:border-sky-400 focus:bg-white transition-colors uppercase";
  const labelCls =
    "text-[9px] font-black text-slate-400 uppercase tracking-widest";

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-5 animate-in fade-in duration-500">

      {/* ── MODAL CLIENTE ── */}
      <ClienteModal
        cliente={clienteSeleccionado}
        onClose={() => setClienteSeleccionado(null)}
      />

      {/* ── HEADER ── */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="bg-sky-500 text-white px-2 py-1 rounded text-[11px] font-black uppercase tracking-wider">
            ASESORES
          </span>
          <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
            Mi tablero de ventas
          </h1>
        </div>
        <button
          onClick={exportarExcel}
          className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
        >
          ⬇ Exportar Jotform Excel
        </button>
      </div>

      {/* ── FILTROS ── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 items-end">
          <div className="lg:col-span-2 flex flex-col gap-2">
            <label className={labelCls}>Período</label>
            <div className="flex bg-slate-50 border border-slate-200 rounded-xl p-1.5 focus-within:border-sky-400 transition-colors">
              <input type="date" className="bg-transparent text-slate-800 text-center text-[11px] font-bold outline-none w-full"
                value={filtros.fechaDesde} onChange={(e) => setFiltros({ ...filtros, fechaDesde: e.target.value })} />
              <span className="text-slate-300 px-1 self-center font-black">–</span>
              <input type="date" className="bg-transparent text-slate-800 text-center text-[11px] font-bold outline-none w-full"
                value={filtros.fechaHasta} onChange={(e) => setFiltros({ ...filtros, fechaHasta: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className={labelCls}>Asesor</label>
            <select className={inputCls} value={filtros.asesor}
              onChange={(e) => setFiltros({ ...filtros, asesor: e.target.value })}>
              <option value="">Todos los asesores</option>
              {nombresAsesores.map((a) => (
                <option key={a.nombre_grupo} value={a.nombre_grupo}>{a.nombre_grupo}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className={labelCls}>Supervisor</label>
            <input type="text" placeholder="Buscar..." className={inputCls}
              value={filtros.supervisor} onChange={(e) => setFiltros({ ...filtros, supervisor: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <label className={labelCls}>Estado Netlife</label>
            <select className={inputCls} value={filtros.estadoNetlife}
              onChange={(e) => setFiltros({ ...filtros, estadoNetlife: e.target.value })}>
              <option value="">Todos</option>
              <option value="ACTIVO">ACTIVO</option>
              <option value="RECHAZADO">RECHAZADO</option>
              <option value="PRESERVICIO">PRESERVICIO</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className={labelCls}>Regularización</label>
            <select className={inputCls} value={filtros.estadoRegularizacion}
              onChange={(e) => setFiltros({ ...filtros, estadoRegularizacion: e.target.value })}>
              <option value="">Todos</option>
              <option value="POR REGULARIZAR">POR REGULARIZAR</option>
              <option value="REGULARIZADO">REGULARIZADO</option>
            </select>
          </div>
          <button onClick={() => fetchData()}
            className="bg-sky-500 hover:bg-sky-400 text-white h-[42px] rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md shadow-sky-200 transition-all active:scale-95">
            {loading ? "CARGANDO..." : "APLICAR"}
          </button>
        </div>
      </div>

      {/* ── STRIP TOTALES ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StripCard label="Leads gestionables" value={totales.gestionables}  color="#0ea5e9" meta={METAS.gestionables * (asesoresEnriquecidos.length || 1)} />
        <StripCard label="Ingresos CRM"       value={totales.ingresos_crm}   color="#8b5cf6" meta={METAS.ingresos_crm * (asesoresEnriquecidos.length || 1)} />
        <StripCard label="Ingresos Jotform"   value={totales.ingresos_jot}   color="#10b981" meta={METAS.ingresos_jot * (asesoresEnriquecidos.length || 1)} />
        <StripCard label="Activas mes"        value={totales.activas_mes}    color="#f59e0b" meta={METAS.activas * (asesoresEnriquecidos.length || 1)} />
        <StripCard label="Activas + backlog"  value={totales.activas_tot}    color="#64748b" />
        <StripCard label="Regularización"     value={totales.regularizacion} color="#f97316" />
      </div>

      {/* ── ETAPAS JOTFORM ── */}
      {estadosNetlife.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 flex-wrap">
            <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
            Etapas Jotform — click para filtrar
            {filtros.etapaJotform && (
              <button
                onClick={() => { const f = { ...filtros, etapaJotform: "" }; setFiltros(f); fetchData(f); }}
                className="ml-2 bg-sky-50 text-sky-600 hover:bg-red-50 hover:text-red-500 border border-sky-200 px-2 py-0.5 rounded-full font-black transition-colors text-[8px]"
              >
                ✕ {filtros.etapaJotform}
              </button>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {estadosNetlife.map(({ estado, total }) => {
              const s      = pillStyle(estado);
              const activo = filtros.etapaJotform === estado;
              return (
                <button key={estado}
                  onClick={() => { const nuevo = activo ? "" : estado; const f = { ...filtros, etapaJotform: nuevo }; setFiltros(f); fetchData(f); }}
                  style={{ background: activo ? s.color + "22" : s.bg, color: s.color,
                    border: `1px solid ${activo ? s.color : s.border}`, outline: activo ? `2px solid ${s.color}33` : "none" }}
                  className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all hover:scale-105 active:scale-95 flex items-center gap-2">
                  <span>{estado}</span>
                  <span className="font-black text-sm">{total}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── RANKING ASESORES — SCROLL HORIZONTAL, 1 POR FILA ── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse inline-block" />
            Ranking asesores
            <span className="text-slate-300 font-normal text-[10px] normal-case tracking-normal">
              ({asesoresEnriquecidos.length} {asesoresEnriquecidos.length === 1 ? "asesor" : "asesores"})
            </span>
          </p>
          {loading && (
            <span className="text-[9px] font-black text-sky-400 uppercase tracking-widest animate-pulse">ACTUALIZANDO...</span>
          )}
        </div>

        {asesoresEnriquecidos.length === 0 ? (
          <div className="text-center py-20 text-slate-300 text-[12px] font-black uppercase tracking-widest">
            SIN DATOS PARA EL PERÍODO SELECCIONADO
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {asesoresEnriquecidos.map((a, i) => (
              <AsesorCard key={a.nombre_grupo} row={a} rank={i} />
            ))}
          </div>
        )}
      </div>

      {/* ── TABLA JOTFORM — click en fila abre modal cliente ── */}
      {dataJotform.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 flex justify-between items-center border-b border-slate-100">
            <div>
              <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                Detalle base Jotform
                <span className="text-slate-300 font-normal normal-case tracking-normal text-[9px]">
                  — click en una fila para ver el detalle del cliente
                </span>
              </p>
              <p className="text-[8px] text-slate-400 mt-0.5 uppercase">
                Mostrando {Math.min(dataJotform.length, 50)} de {dataJotform.length} registros
              </p>
            </div>
            <button onClick={exportarExcel}
              className="text-[9px] bg-emerald-50 hover:bg-emerald-100 px-4 py-1.5 rounded-full font-black border border-emerald-200 text-emerald-700 uppercase tracking-wider transition-all">
              ⬇ Excel
            </button>
          </div>
          <div className="overflow-auto max-h-64">
            <table className="text-[9px] w-full border-collapse font-mono">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 text-slate-400 font-black text-[8px] uppercase border-b border-slate-100">
                  {Object.keys(dataJotform[0] || {}).map((h) => (
                    <th key={h} className="px-3 py-2 text-left border-r border-slate-100 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataJotform.slice(0, 50).map((row, i) => (
                  <tr
                    key={i}
                    onClick={() => setClienteSeleccionado(row)}
                    className="border-b border-slate-50 hover:bg-sky-50 transition-colors cursor-pointer group"
                    title="Click para ver detalle del cliente"
                  >
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="px-3 py-1.5 border-r border-slate-50 truncate max-w-[140px] text-slate-600 group-hover:text-slate-900">
                        {v ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}