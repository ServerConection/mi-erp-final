// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  RedesVelsa.jsx — Monitoreo Redes VELSA                                  ║
// ║  Sin catálogo de canal/inversión: agrupa directamente por                ║
// ║  canal_publicidad (origen_venta/origen crudo de Bitrix/GHL/JotForm).     ║
// ║  Fuente: mv_monitoreo_redes_velsa                                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝
import { useEffect, useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList} from "recharts";
import TabReporteData from "./TabReporteData";
import RedesVelsaGeneral from "./RedesVelsaGeneral";
import RedesVelsaGraphs from "./RedesVelsaGraphs";
import RedesVelsaAsesores from "./RedesVelsaAsesores";
import RedesVelsaComparativo from "./RedesVelsaComparativo";
import RedesVelsaMetas from "./RedesVelsaMetas";
import RedesVelsaPautas from "./RedesVelsaPautas";
import { forzarSyncInversion } from "../utils/redesSync";
import { ValorBarraH } from "../utils/etiquetaBarra";

const C = {
  primary: "#1e3a8a", sky: "#0ea5e9", success: "#059669",
  warning: "#f59e0b", danger: "#ef4444", violet: "#7c3aed",
  cyan: "#06b6d4", slate: "#334155", muted: "#64748b",
  light: "#f8fafc", border: "#e2e8f0",
};

const PIE_COLORS = ["#1e3a8a", "#0ea5e9", "#059669", "#f59e0b", "#ef4444", "#7c3aed", "#06b6d4", "#f97316", "#94a3b8", "#10b981"];

const n      = (v) => Number(v || 0);
const fmtPct = (v) => `${n(v).toFixed(1)}%`;
const fmtNum = (v) => n(v).toLocaleString("es-EC");
const getFechaHoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });
const formatFecha = (f) => { if (!f) return "—"; const [, m, d] = String(f).split("T")[0].split("-"); return `${d}/${m}`; };

const API    = import.meta.env.VITE_API_URL;
const apiUrl = (r, p) => `${API}/api/redes-velsa/${r}?${p}`;

function KpiCard({ label, value, color, icon, sub }) {
  return (
    <div style={{
      background: `linear-gradient(135deg,${color}10,${color}04)`, border: `1px solid ${color}25`, borderRadius: 16,
      padding: "12px 16px", flex: 1, minWidth: 150, display: "flex", alignItems: "center", gap: 12,
      boxShadow: `0 4px 16px ${color}10`,
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: `${color}18`, display: "grid", placeItems: "center", fontSize: 18, flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.65 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 900, color, lineHeight: 1.2 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: C.muted }}>{sub}</div>}
      </div>
    </div>
  );
}

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const fmtUsd = (v) => v === null || v === undefined ? "—" : `$${n(v).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function InversionForm({ canalesDisponibles, onGuardado }) {
  const hoy = getFechaHoy();
  const [fecha, setFecha] = useState(hoy);
  const [canal, setCanal] = useState("");
  const [monto, setMonto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState(null);

  const guardar = () => {
    if (!fecha || !canal || monto === "") {
      setMsg({ tipo: "error", texto: "Completa fecha, origen y monto" });
      return;
    }
    setGuardando(true);
    setMsg(null);
    fetch(apiUrl("inversion", ""), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ fecha, canal_publicidad: canal, monto_usd: Number(monto) }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setMsg({ tipo: "ok", texto: "Inversión guardada" });
          setMonto("");
          onGuardado?.();
        } else {
          setMsg({ tipo: "error", texto: d.message || "Error al guardar" });
        }
      })
      .catch((e) => setMsg({ tipo: "error", texto: e.message }))
      .finally(() => setGuardando(false));
  };

  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: C.slate, marginTop: 0 }}>💰 Cargar inversión / pauta diaria</h3>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label style={{ display: "block", fontSize: 11, color: C.muted, marginBottom: 4 }}>Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
                 style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 13 }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: C.muted, marginBottom: 4 }}>Agencia</label>
          <select value={canal} onChange={(e) => setCanal(e.target.value)}
                  style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 13, minWidth: 220 }}>
            <option value="">— Selecciona —</option>
            {canalesDisponibles.map((c) => (
              <option key={c.canal_publicidad} value={c.canal_publicidad}>{c.canal_publicidad}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: C.muted, marginBottom: 4 }}>Monto USD</label>
          <input type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)}
                 placeholder="0.00"
                 style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 13, width: 120 }} />
        </div>
        <button onClick={guardar} disabled={guardando}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: guardando ? "default" : "pointer", opacity: guardando ? 0.6 : 1 }}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        {msg && (
          <span style={{ fontSize: 12, fontWeight: 600, color: msg.tipo === "ok" ? C.success : C.danger }}>{msg.texto}</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
        Se guarda una sola línea por fecha y agencia. Si ya existe, se actualiza el monto.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tabs nuevos: Ciudad, Hora, ATC (motivos) y Reporte mensual.
// Replican el módulo de NOVONET pero sin catálogo de canal y siendo honestos
// con las limitaciones reales de los datos de VELSA (ver aviso en TabAtc).
// ─────────────────────────────────────────────────────────────────────────

function TabSwitcher({ tab, setTab }) {
  const tabs = [
    { id: "resumen", label: "📊 Monitoreo General" },
    { id: "graficos", label: "📈 Gráficos Gerencia" },
    { id: "asesorvpauta", label: "⚡ Asesores vs Pauta" },
    { id: "metas", label: "🎯 Metas vs Logros" },
    { id: "comparativo", label: "🔀 Comparativo" },
    { id: "pautas", label: "🔬 Análisis Pautas" },
    { id: "ciudad", label: "🌎 Ciudad" },
    { id: "hora", label: "🕐 Hora" },
    { id: "atc", label: "🎧 Motivos ATC" },
    { id: "reporte", label: "🗂️ Reporte mensual" },
    { id: "reporte-data", label: "📑 Reporte Data" },
    { id: "agencias", label: "🏢 Agencias" },
    { id: "proximamente", label: "🚀 Próximamente" },
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 28, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 16, padding: 5, boxShadow: "0 2px 5px #1e3a8a0c" }}>
      {tabs.map((t) => (
        <button key={t.id} onClick={() => setTab(t.id)}
          style={{
            border: "none", background: tab === t.id ? C.primary : "transparent",
            color: tab === t.id ? "#fff" : C.slate,
            borderRadius: 12, padding: "10px 16px", fontSize: 12, fontWeight: 900, textTransform: "uppercase", cursor: "pointer",
          }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

function TabCiudad({ fechaDesde, fechaHasta, canalesSel }) {
  const [data, setData] = useState({ porCiudad: [], porCiudadDia: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    queueMicrotask(() => { setLoading(true); setError(null); });
    const params = new URLSearchParams({ fechaDesde, fechaHasta });
    if (canalesSel.length) params.set("canales", canalesSel.join(","));
    fetch(apiUrl("monitoreo-ciudad", params.toString()), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d); else setError(d.message); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fechaDesde, fechaHasta, canalesSel]);

  const top15 = useMemo(() => data.porCiudad.slice(0, 15), [data.porCiudad]);

  return (
    <>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "8px 12px" }}>
        ℹ️ La ciudad/provincia solo está disponible para los leads que llegaron a registrarse en JotForm (~18% del total histórico). El resto no tiene ciudad registrada y no se incluye aquí.
      </div>
      {loading && <div style={{ color: C.muted, marginBottom: 12 }}>Cargando…</div>}
      {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: C.danger, borderRadius: 8, padding: 12, marginBottom: 16 }}>{error}</div>}

      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.slate, marginTop: 0 }}>Top 15 ciudades por leads</h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={top15} layout="vertical" margin={{ left: 80 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis type="number" fontSize={11} />
            <YAxis type="category" dataKey="ciudad" fontSize={11} width={110} />
            <Tooltip />
            <Legend />
            <Bar dataKey="n_leads" name="Leads" fill={C.primary} >
              <LabelList dataKey="n_leads" content={ValorBarraH} />
            </Bar>
            <Bar dataKey="venta_subida" name="Venta Subida" fill={C.success} >
              <LabelList dataKey="venta_subida" content={ValorBarraH} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, overflowX: "auto" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.slate, marginTop: 0 }}>Detalle por ciudad</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}`, textAlign: "left" }}>
              <th style={{ padding: "8px 6px" }}>Provincia</th>
              <th style={{ padding: "8px 6px" }}>Ciudad</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Leads</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>ATC</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Venta Subida</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>% Venta Subida</th>
            </tr>
          </thead>
          <tbody>
            {data.porCiudad.map((row, i) => (
              <tr key={`${row.provincia}-${row.ciudad}-${i}`} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "8px 6px" }}>{row.provincia}</td>
                <td style={{ padding: "8px 6px", fontWeight: 600 }}>{row.ciudad}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row.n_leads)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row.atc)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: C.success, fontWeight: 700 }}>{fmtNum(row.venta_subida)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtPct(row.gestionables > 0 ? (row.venta_subida / row.gestionables) * 100 : 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TabHora({ fechaDesde, fechaHasta, canalesSel }) {
  const [data, setData] = useState({ porHora: [], porHoraDia: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    queueMicrotask(() => { setLoading(true); setError(null); });
    const params = new URLSearchParams({ fechaDesde, fechaHasta });
    if (canalesSel.length) params.set("canales", canalesSel.join(","));
    fetch(apiUrl("monitoreo-hora", params.toString()), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d); else setError(d.message); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fechaDesde, fechaHasta, canalesSel]);

  const horasFmt = useMemo(
    () => data.porHora.map((r) => ({ ...r, horaLabel: `${String(r.hora).padStart(2, "0")}:00` })),
    [data.porHora]
  );

  return (
    <>
      {loading && <div style={{ color: C.muted, marginBottom: 12 }}>Cargando…</div>}
      {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: C.danger, borderRadius: 8, padding: 12, marginBottom: 16 }}>{error}</div>}

      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.slate, marginTop: 0 }}>Leads por hora del día (hora de creación del lead)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={horasFmt}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="horaLabel" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip />
            <Legend />
            <Bar dataKey="n_leads" name="Leads" fill={C.primary} >
              <LabelList dataKey="n_leads" content={ValorBarraH} />
            </Bar>
            <Bar dataKey="atc" name="ATC" fill={C.sky} >
              <LabelList dataKey="atc" content={ValorBarraH} />
            </Bar>
            <Bar dataKey="venta_subida" name="Venta Subida" fill={C.success} >
              <LabelList dataKey="venta_subida" content={ValorBarraH} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, overflowX: "auto" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.slate, marginTop: 0 }}>Detalle por hora</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}`, textAlign: "left" }}>
              <th style={{ padding: "8px 6px" }}>Hora</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Leads</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>ATC</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Venta Subida</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>% Venta Subida</th>
            </tr>
          </thead>
          <tbody>
            {horasFmt.map((row) => (
              <tr key={row.hora} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "8px 6px", fontWeight: 600 }}>{row.horaLabel}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row.n_leads)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row.atc)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: C.success, fontWeight: 700 }}>{fmtNum(row.venta_subida)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtPct(row.gestionables > 0 ? (row.venta_subida / row.gestionables) * 100 : 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TabAtc({ fechaDesde, fechaHasta, canalesSel }) {
  const [data, setData] = useState([]);
  const [aviso, setAviso] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    queueMicrotask(() => { setLoading(true); setError(null); });
    const params = new URLSearchParams({ fechaDesde, fechaHasta });
    if (canalesSel.length) params.set("canales", canalesSel.join(","));
    fetch(apiUrl("monitoreo-atc", params.toString()), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => { if (d.success) { setData(d.data || []); setAviso(d.aviso || ""); } else setError(d.message); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fechaDesde, fechaHasta, canalesSel]);

  return (
    <>
      {aviso && <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 12px" }}>ℹ️ {aviso}</div>}
      {loading && <div style={{ color: C.muted, marginBottom: 12 }}>Cargando…</div>}
      {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: C.danger, borderRadius: 8, padding: 12, marginBottom: 16 }}>{error}</div>}

      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.slate, marginTop: 0 }}>Motivos ATC y etapas CRM</h3>
        <ResponsiveContainer width="100%" height={Math.max(260, data.length * 32)}>
          <BarChart data={data} layout="vertical" margin={{ left: 140 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis type="number" fontSize={11} />
            <YAxis type="category" dataKey="motivo" fontSize={11} width={160} />
            <Tooltip />
            <Bar dataKey="cantidad" name="Leads" fill={C.warning} >
              <LabelList dataKey="cantidad" content={ValorBarraH} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, overflowX: "auto" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.slate, marginTop: 0 }}>Detalle</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}`, textAlign: "left" }}>
              <th style={{ padding: "8px 6px" }}>Motivo ATC / etapa CRM</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Leads</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.motivo} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "8px 6px", fontWeight: 600 }}>{row.motivo}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row.cantidad)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TabReporte({ fechaDesde, fechaHasta, canalesSel }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    queueMicrotask(() => { setLoading(true); setError(null); });
    const params = new URLSearchParams({ fechaDesde, fechaHasta });
    if (canalesSel.length) params.set("canales", canalesSel.join(","));
    fetch(apiUrl("reporte", params.toString()), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d); else setError(d.message); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fechaDesde, fechaHasta, canalesSel]);

  const inversionFmt = useMemo(
    () => (data?.inversion || []).map((r) => ({ ...r, fechaLabel: formatFecha(r.fecha) })),
    [data]
  );
  const cicloFmt = useMemo(() => (data?.ciclo || []).map((r) => ({ ...r, label: r.bucket === "5+" ? "+5 días" : `${r.bucket} día(s)` })), [data]);

  if (loading) return <div style={{ color: C.muted }}>Cargando reporte…</div>;
  if (error) return <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: C.danger, borderRadius: 8, padding: 12 }}>{error}</div>;
  if (!data) return null;

  const totInversion = inversionFmt.reduce((a, r) => a + n(r.inversion), 0);
  const totLeads = inversionFmt.reduce((a, r) => a + n(r.n_leads), 0);
  const totVentas = inversionFmt.reduce((a, r) => a + n(r.venta_subida), 0);

  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <KpiCard label="Inversión del período" value={fmtUsd(totInversion)} color={C.cyan} icon="💰" />
        <KpiCard label="Leads del período" value={fmtNum(totLeads)} color={C.primary} icon="📥" />
        <KpiCard label="Ventas del período" value={fmtNum(totVentas)} color={C.success} icon="✅" />
        <KpiCard label="CPL del período" value={fmtUsd(totLeads > 0 ? totInversion / totLeads : null)} color={C.cyan} icon="🎯" />
        <KpiCard label="Costo x Venta del período" value={fmtUsd(totVentas > 0 ? totInversion / totVentas : null)} color={C.cyan} icon="🏷️" />
      </div>

      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.slate, marginTop: 0 }}>Inversión y CPL diario</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={inversionFmt}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="fechaLabel" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip />
            <Legend />
            <Bar dataKey="inversion" name="Inversión USD" fill={C.cyan} >
              <LabelList dataKey="inversion" content={ValorBarraH} />
            </Bar>
            <Bar dataKey="n_leads" name="Leads" fill={C.primary} >
              <LabelList dataKey="n_leads" content={ValorBarraH} />
            </Bar>
            <Bar dataKey="venta_subida" name="Venta Subida" fill={C.success} >
              <LabelList dataKey="venta_subida" content={ValorBarraH} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ flex: 1, minWidth: 280, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: C.slate, marginTop: 0 }}>Forma de pago (ventas)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={data.pago} dataKey="cantidad" nameKey="forma_pago" outerRadius={85} label={({ forma_pago }) => forma_pago}>
                {data.pago.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={{ flex: 1, minWidth: 280, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: C.slate, marginTop: 0 }}>Ciclo de venta (días desde creación hasta activación)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={cicloFmt}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Bar dataKey="cantidad" name="Ventas" fill={C.violet} >
                <LabelList dataKey="cantidad" content={ValorBarraH} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ flex: 1, minWidth: 320, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, overflowX: "auto" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: C.slate, marginTop: 0 }}>Top ciudades</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}`, textAlign: "left" }}>
                <th style={{ padding: "6px" }}>Ciudad</th>
                <th style={{ padding: "6px", textAlign: "right" }}>Leads</th>
                <th style={{ padding: "6px", textAlign: "right" }}>Ventas</th>
              </tr>
            </thead>
            <tbody>
              {data.ciudad.map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "6px" }}>{row.ciudad}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{fmtNum(row.n_leads)}</td>
                  <td style={{ padding: "6px", textAlign: "right", color: C.success, fontWeight: 700 }}>{fmtNum(row.venta_subida)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ flex: 1, minWidth: 320, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, overflowX: "auto" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: C.slate, marginTop: 0 }}>Leads por hora</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}`, textAlign: "left" }}>
                <th style={{ padding: "6px" }}>Hora</th>
                <th style={{ padding: "6px", textAlign: "right" }}>Leads</th>
                <th style={{ padding: "6px", textAlign: "right" }}>Ventas</th>
              </tr>
            </thead>
            <tbody>
              {data.hora.map((row) => (
                <tr key={row.hora} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "6px" }}>{String(row.hora).padStart(2, "0")}:00</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{fmtNum(row.n_leads)}</td>
                  <td style={{ padding: "6px", textAlign: "right", color: C.success, fontWeight: 700 }}>{fmtNum(row.venta_subida)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tab Agencias: cataloga los orígenes reales bajo una agencia (ARTS, VIDIKA,
// etc.) igual que ya hace NOVONET, pero editable acá en vez de hardcodeado.
// Arriba: lista de orígenes con su agencia asignada (o "sin asignar") y un
// selector para asignar/reasignar. Abajo: totales ya agrupados por agencia.
// ─────────────────────────────────────────────────────────────────────────
function TabAgencias({ fechaDesde, fechaHasta, canalesSel, refreshTick, onCambio }) {
  const [origenes, setOrigenes] = useState([]);
  const [resumen, setResumen] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [guardandoOrigen, setGuardandoOrigen] = useState(null);
  const [borradores, setBorradores] = useState({});

  const cargarOrigenes = () => {
    const params = new URLSearchParams({ fechaDesde, fechaHasta });
    fetch(apiUrl("agencias", params.toString()), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => { if (d.success) setOrigenes(d.origenes || []); else setError(d.message); })
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    queueMicrotask(() => { setLoading(true); setError(null); });
    cargarOrigenes();
    const params = new URLSearchParams({ fechaDesde, fechaHasta });
    if (canalesSel.length) params.set("canales", canalesSel.join(","));
    fetch(apiUrl("resumen-agencias", params.toString()), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => { if (d.success) setResumen(d.porAgencia || []); else setError(d.message); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaDesde, fechaHasta, canalesSel, refreshTick]);

  const agenciasExistentes = useMemo(
    () => [...new Set(origenes.map((o) => o.agencia).filter(Boolean))].sort(),
    [origenes]
  );

  const asignar = (origen, agencia) => {
    setGuardandoOrigen(origen);
    fetch(apiUrl("agencias", ""), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ origen, agencia }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          cargarOrigenes();
          onCambio?.();
        } else {
          setError(d.message || "Error al asignar agencia");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setGuardandoOrigen(null));
  };

  return (
    <>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "8px 12px" }}>
        ℹ️ Selecciona la agencia de cada origen real (tal como llega de Bitrix/GHL/JotForm). Puedes escribir el nombre de una
        agencia nueva o reutilizar una ya creada — varios orígenes pueden compartir la misma agencia. Se guarda al instante.
      </div>
      {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: C.danger, borderRadius: 8, padding: 12, marginBottom: 16 }}>{error}</div>}
      {loading && <div style={{ color: C.muted, marginBottom: 12 }}>Cargando…</div>}

      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20, overflowX: "auto" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.slate, marginTop: 0 }}>Orígenes y su agencia asignada</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}`, textAlign: "left" }}>
              <th style={{ padding: "8px 6px" }}>Origen</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Leads</th>
              <th style={{ padding: "8px 6px" }}>Agencia asignada</th>
              <th style={{ padding: "8px 6px" }}>Asignar / cambiar</th>
            </tr>
          </thead>
          <tbody>
            {origenes.map((o) => (
              <tr key={o.origen} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "8px 6px", fontWeight: 600 }}>{o.origen}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(o.n_leads)}</td>
                <td style={{ padding: "8px 6px" }}>
                  {o.agencia
                    ? <span style={{ background: "#dbeafe", color: C.primary, borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>{o.agencia}</span>
                    : <span style={{ color: C.muted }}>— sin asignar —</span>}
                </td>
                <td style={{ padding: "8px 6px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <select
                      value={borradores[o.origen] ?? ""}
                      onChange={(e) => setBorradores((prev) => ({ ...prev, [o.origen]: e.target.value }))}
                      style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 6px", fontSize: 12, minWidth: 140 }}>
                      <option value="">— nueva / escribir —</option>
                      {agenciasExistentes.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <input type="text" placeholder="Nombre agencia" defaultValue=""
                      onChange={(e) => setBorradores((prev) => ({ ...prev, [o.origen]: e.target.value }))}
                      value={borradores[o.origen] ?? ""}
                      style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 6px", fontSize: 12, width: 120 }} />
                    <button
                      disabled={guardandoOrigen === o.origen || !(borradores[o.origen] ?? "").trim()}
                      onClick={() => asignar(o.origen, (borradores[o.origen] || "").trim())}
                      style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {guardandoOrigen === o.origen ? "…" : "Asignar"}
                    </button>
                    {o.agencia && (
                      <button
                        disabled={guardandoOrigen === o.origen}
                        onClick={() => asignar(o.origen, "")}
                        title="Quitar agencia asignada"
                        style={{ background: "transparent", color: C.danger, border: `1px solid ${C.danger}`, borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer" }}>
                        ✕
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {origenes.length === 0 && !loading && (
              <tr><td colSpan={4} style={{ padding: 12, color: C.muted, textAlign: "center" }}>No hay orígenes en este rango de fechas.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, overflowX: "auto" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.slate, marginTop: 0 }}>Resumen por agencia</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}`, textAlign: "left" }}>
              <th style={{ padding: "8px 6px" }}>Agencia</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Leads</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Gestionables</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>ATC</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Venta Subida</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Descartados</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>% Venta Subida</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Inversión</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>CPL</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Costo x Venta</th>
            </tr>
          </thead>
          <tbody>
            {resumen.map((row) => (
              <tr key={row.agencia} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "8px 6px", fontWeight: 700 }}>
                  {row.agencia === "SIN AGENCIA ASIGNADA"
                    ? <span style={{ color: C.muted, fontWeight: 600 }}>{row.agencia}</span>
                    : row.agencia}
                </td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row.n_leads)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row.gestionables)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row.atc)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: C.success, fontWeight: 700 }}>{fmtNum(row.venta_subida)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: C.danger }}>{fmtNum(row.descartados)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtPct(row.pct_venta_subida)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtUsd(row.inversion)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: C.cyan, fontWeight: 700 }}>{fmtUsd(row.cpl)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: C.cyan }}>{fmtUsd(row.costo_venta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function RedesVelsa() {
  const hoy = getFechaHoy();
  const [fechaDesde, setFechaDesde] = useState(hoy);
  const [fechaHasta, setFechaHasta] = useState(hoy);
  const [filtro, setFiltro] = useState({ desde: hoy, hasta: hoy });
  const [canalesDisponibles, setCanalesDisponibles] = useState([]);
  const [canalesSel, setCanalesSel] = useState([]);
  const [totales, setTotales] = useState(null);
  const [porCanal, setPorCanal] = useState([]);
  const [tendencia, setTendencia] = useState([]);
  const [diario, setDiario] = useState([]);
  const [ciudadGeneral, setCiudadGeneral] = useState(null);
  const [horaGeneral, setHoraGeneral] = useState(null);
  const [atcGeneral, setAtcGeneral] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [tab, setTab] = useState("resumen");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const sincronizarInversion = async () => {
    setSyncing(true); setSyncMsg("");
    try {
      const result = await forzarSyncInversion({ apiBase: API, token: localStorage.getItem("token"), from: filtro.desde, to: filtro.hasta, empresa: "velsa" });
      setSyncMsg(result.message || "Inversión actualizada");
      setRefreshTick(t => t + 1);
    } catch (e) { setSyncMsg(e.message); }
    finally { setSyncing(false); }
  };

  useEffect(() => {
    fetch(apiUrl("canales", `fechaDesde=${filtro.desde}&fechaHasta=${filtro.hasta}`), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => { if (d.success) setCanalesDisponibles(d.canales || []); })
      .catch(() => {});
  }, [filtro.desde, filtro.hasta, refreshTick]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) { setLoading(true); setError(null); } });
    const params = new URLSearchParams({ fechaDesde: filtro.desde, fechaHasta: filtro.hasta });
    if (canalesSel.length) params.set("canales", canalesSel.join(","));

    Promise.all([
      fetch(apiUrl("monitoreo", params.toString()), { headers: authHeaders(), signal: controller.signal }).then((r) => r.json()),
      fetch(apiUrl("tendencia", params.toString()), { headers: authHeaders(), signal: controller.signal }).then((r) => r.json()),
      fetch(apiUrl("monitoreo-ciudad", params.toString()), { headers: authHeaders(), signal: controller.signal }).then((r) => r.json()),
      fetch(apiUrl("monitoreo-hora", params.toString()), { headers: authHeaders(), signal: controller.signal }).then((r) => r.json()),
      fetch(apiUrl("monitoreo-atc", params.toString()), { headers: authHeaders(), signal: controller.signal }).then((r) => r.json()),
      fetch(apiUrl("inversion", params.toString()), { headers: authHeaders(), signal: controller.signal }).then((r) => r.json()),
    ])
      .then(([m, t, c, h, a, inv]) => {
        if (controller.signal.aborted) return;
        if (m.success) {
          setTotales(m.totales); setPorCanal(m.porCanal || []);
          const invMap = new Map();
          for (const r of inv.data || []) {
            const agency = String(r.canal_publicidad || "").toUpperCase().replace(/^__WINTRACKER_(ARTS|VIDIKA|VELSA)__$/, "$1");
            const key = `${String(r.fecha).slice(0, 10)}|${agency}`;
            invMap.set(key, (invMap.get(key) || 0) + Number(r.monto_usd || 0));
          }
          setDiario((m.data || []).map((r) => {
            const inversion = invMap.get(`${String(r.fecha).slice(0, 10)}|${r.canal_publicidad}`) || 0;
            return { ...r, inversion, cpl: Number(r.n_leads) && inversion ? inversion / Number(r.n_leads) : null };
          }));
        }
        else setError(m.message || "Error al cargar monitoreo");
        if (t.success) setTendencia(t.data || []);
        if (c.success) setCiudadGeneral(c);
        if (h.success) setHoraGeneral(h);
        if (a.success) setAtcGeneral(a);
      })
      .catch((e) => { if (e.name !== "AbortError") setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filtro, canalesSel, refreshTick]);

  const toggleCanal = (c) => {
    setCanalesSel((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  };

  return (
    <div className="min-h-screen p-5 md:p-7 erp-page-bg">
      <div className="flex flex-wrap items-start justify-between gap-5 mb-7">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black shadow-sm" style={{ background: `linear-gradient(135deg,${C.primary},#1e40af)` }}>V</div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: "#0f172a" }}>Monitoreo Redes VELSA</h1>
          <span className="text-[11px] font-black px-2.5 py-1 rounded-full uppercase" style={{ background: `${C.success}15`, color: C.success }}>● Live</span>
        </div>
        <div className="bg-white border rounded-2xl shadow-sm px-5 py-3 flex flex-wrap items-end gap-3" style={{ borderColor: C.border }}>
          {[["Desde", fechaDesde, setFechaDesde], ["Hasta", fechaHasta, setFechaHasta]].map(([label, value, setter]) => (
            <div key={label} className="flex flex-col gap-1">
              <label className="text-[11px] font-black uppercase tracking-widest" style={{ color: C.muted }}>{label}</label>
              <input type="date" value={value} onChange={(e) => setter(e.target.value)} className="border rounded-xl px-3 py-2 text-[11px] font-bold bg-white [color-scheme:light]" style={{ borderColor: C.border }} />
            </div>
          ))}
          <button onClick={() => setFiltro({ desde: fechaDesde, hasta: fechaHasta })} disabled={!fechaDesde || !fechaHasta || fechaDesde > fechaHasta}
            className="px-6 py-2 rounded-xl text-[12px] font-black uppercase text-white shadow-sm disabled:opacity-50" style={{ background: `linear-gradient(135deg,${C.primary},#1e40af)` }}>Aplicar</button>
          <button onClick={sincronizarInversion} disabled={syncing} className="px-4 py-2 rounded-xl text-[12px] font-black uppercase text-white disabled:opacity-50" style={{ background: `linear-gradient(135deg,${C.violet},#5b21b6)` }}>{syncing ? "Consultando…" : "↻ Forzar inversión"}</button>
          <span className="text-[11px] font-medium uppercase" style={{ color: C.muted }}>Período activo: <b>{filtro.desde} → {filtro.hasta}</b></span>
          {syncMsg && <span className="text-[11px] font-bold" style={{ color: C.muted }}>{syncMsg}</span>}
        </div>
      </div>

      {/* Filtro de agencias */}
      <div className="bg-white rounded-2xl border shadow-sm px-5 py-3 mb-5 flex flex-wrap items-center gap-3" style={{ borderColor: C.border }}>
        <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: C.primary }}>▏ Agencia</span>
        {canalesDisponibles.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {canalesDisponibles.map((c) => {
            const activo = canalesSel.includes(c.canal_publicidad);
            return (
              <button key={c.canal_publicidad} onClick={() => toggleCanal(c.canal_publicidad)}
                style={{
                  border: `1px solid ${activo ? C.primary : C.border}`,
                  background: activo ? C.primary : "#fff",
                  color: activo ? "#fff" : C.slate,
                  borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>
                {c.canal_publicidad} ({fmtNum(c.n_leads)})
              </button>
            );
          })}
          {canalesSel.length > 0 && (
            <button onClick={() => setCanalesSel([])}
              style={{ border: "none", background: "transparent", color: C.danger, fontSize: 12, cursor: "pointer" }}>
              ✕ Limpiar filtro
            </button>
          )}
        </div>)}
      </div>

      <TabSwitcher tab={tab} setTab={setTab} />

      {tab === "agencias" && (
        <><InversionForm canalesDisponibles={canalesDisponibles} onGuardado={() => setRefreshTick((t) => t + 1)} />
        <TabAgencias
          fechaDesde={filtro.desde}
          fechaHasta={filtro.hasta}
          canalesSel={canalesSel}
          refreshTick={refreshTick}
          onCambio={() => setRefreshTick((t) => t + 1)}
        /></>
      )}
      {tab === "ciudad" && <TabCiudad fechaDesde={filtro.desde} fechaHasta={filtro.hasta} canalesSel={canalesSel} />}
      {tab === "hora" && <TabHora fechaDesde={filtro.desde} fechaHasta={filtro.hasta} canalesSel={canalesSel} />}
      {tab === "atc" && <TabAtc fechaDesde={filtro.desde} fechaHasta={filtro.hasta} canalesSel={canalesSel} />}
      {tab === "reporte" && <TabReporte fechaDesde={filtro.desde} fechaHasta={filtro.hasta} canalesSel={canalesSel} />}

      {/* Exactamente la misma pantalla que Redes NOVONET, apuntada al endpoint
          de Velsa: los dos devuelven el mismo contrato. Trae su propio
          selector de año/mes, por eso no recibe el rango de fechas de arriba. */}
      {tab === "reporte-data" && (
        <TabReporteData ruta="/api/redes-velsa/reporte-data" empresa="velsa" />
      )}

      {tab === "metas" && <RedesVelsaMetas filtro={filtro} canalesSel={canalesSel} porCanal={porCanal} />}
      {tab === "pautas" && <RedesVelsaPautas filtro={filtro} canalesSel={canalesSel} porCanal={porCanal} tendencia={tendencia} />}

      {tab === "asesorvpauta" && <RedesVelsaAsesores filtro={filtro} canalesSel={canalesSel} porCanal={porCanal} />}
      {tab === "comparativo" && <RedesVelsaComparativo filtro={filtro} canalesSel={canalesSel} />}

      {tab === "proximamente" && <div className="text-center py-28 text-slate-500"><div className="text-5xl mb-4">🚀</div><b>Próximamente</b></div>}

      {tab === "graficos" && <RedesVelsaGraphs filtro={filtro} canalesSel={canalesSel} tendencia={tendencia} porCanal={porCanal} totales={totales} hora={horaGeneral} atc={atcGeneral} refreshTick={refreshTick} />}

      {tab === "resumen" && <><>{error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 mb-4">{error}</div>}</><RedesVelsaGeneral totales={totales} porCanal={porCanal} diario={diario} ciudad={ciudadGeneral} hora={horaGeneral} atc={atcGeneral} loading={loading} /></>}

    </div>
  );
}
