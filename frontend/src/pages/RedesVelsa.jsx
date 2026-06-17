// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  RedesVelsa.jsx — Monitoreo Redes VELSA                                  ║
// ║  Sin catálogo de canal/inversión: agrupa directamente por                ║
// ║  canal_publicidad (origen_venta/origen crudo de Bitrix/GHL/JotForm).     ║
// ║  Fuente: mv_monitoreo_redes_velsa                                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝
import { useEffect, useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

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

function KpiCard({ label, value, color, icon }) {
  return (
    <div style={{
      background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12,
      padding: "14px 16px", flex: 1, minWidth: 140,
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: C.slate, marginTop: 4 }}>
        {value}
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
          <label style={{ display: "block", fontSize: 11, color: C.muted, marginBottom: 4 }}>Origen (canal_publicidad)</label>
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
        Se guarda una sola línea por (fecha + origen): si ya existe, se actualiza el monto. No hay catálogo de orígenes —
        elige el valor crudo tal como llega de Bitrix/GHL/JotForm.
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
    { id: "resumen", label: "📊 Resumen" },
    { id: "ciudad", label: "🌎 Ciudad" },
    { id: "hora", label: "🕐 Hora" },
    { id: "atc", label: "🎧 Motivos ATC" },
    { id: "reporte", label: "🗂️ Reporte mensual" },
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16, borderBottom: `2px solid ${C.border}`, paddingBottom: 10 }}>
      {tabs.map((t) => (
        <button key={t.id} onClick={() => setTab(t.id)}
          style={{
            border: "none", background: tab === t.id ? C.primary : "transparent",
            color: tab === t.id ? "#fff" : C.slate,
            borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
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
    setLoading(true);
    setError(null);
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
            <Bar dataKey="n_leads" name="Leads" fill={C.primary} />
            <Bar dataKey="venta_subida" name="Venta Subida" fill={C.success} />
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
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtPct(row.n_leads > 0 ? (row.venta_subida / row.n_leads) * 100 : 0)}</td>
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
    setLoading(true);
    setError(null);
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
            <Bar dataKey="n_leads" name="Leads" fill={C.primary} />
            <Bar dataKey="atc" name="ATC" fill={C.sky} />
            <Bar dataKey="venta_subida" name="Venta Subida" fill={C.success} />
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
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtPct(row.n_leads > 0 ? (row.venta_subida / row.n_leads) * 100 : 0)}</td>
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
    setLoading(true);
    setError(null);
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
      <div style={{ fontSize: 12, color: "#92400e", marginBottom: 12, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 12px" }}>
        ⚠️ <b>Diferencia importante con NOVONET:</b> {aviso || "VELSA no tiene un campo de motivo ATC detallado (texto libre) como NOVONET. Este desglose usa la etapa del CRM de cada lead como aproximación."}
      </div>
      {loading && <div style={{ color: C.muted, marginBottom: 12 }}>Cargando…</div>}
      {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: C.danger, borderRadius: 8, padding: 12, marginBottom: 16 }}>{error}</div>}

      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.slate, marginTop: 0 }}>Leads por etapa del CRM (no-venta)</h3>
        <ResponsiveContainer width="100%" height={Math.max(260, data.length * 32)}>
          <BarChart data={data} layout="vertical" margin={{ left: 140 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis type="number" fontSize={11} />
            <YAxis type="category" dataKey="motivo" fontSize={11} width={160} />
            <Tooltip />
            <Bar dataKey="cantidad" name="Leads" fill={C.warning} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, overflowX: "auto" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.slate, marginTop: 0 }}>Detalle</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}`, textAlign: "left" }}>
              <th style={{ padding: "8px 6px" }}>Etapa CRM (aprox. a "motivo")</th>
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
    setLoading(true);
    setError(null);
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
            <Bar dataKey="inversion" name="Inversión USD" fill={C.cyan} />
            <Bar dataKey="n_leads" name="Leads" fill={C.primary} />
            <Bar dataKey="venta_subida" name="Venta Subida" fill={C.success} />
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
              <Bar dataKey="cantidad" name="Ventas" fill={C.violet} />
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

export default function RedesVelsa() {
  const hoy = getFechaHoy();
  const [fechaDesde, setFechaDesde] = useState(hoy);
  const [fechaHasta, setFechaHasta] = useState(hoy);
  const [canalesDisponibles, setCanalesDisponibles] = useState([]);
  const [canalesSel, setCanalesSel] = useState([]);
  const [totales, setTotales] = useState(null);
  const [porCanal, setPorCanal] = useState([]);
  const [tendencia, setTendencia] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [tab, setTab] = useState("resumen");

  useEffect(() => {
    fetch(apiUrl("canales", `fechaDesde=${fechaDesde}&fechaHasta=${fechaHasta}`))
      .then((r) => r.json())
      .then((d) => { if (d.success) setCanalesDisponibles(d.canales || []); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaDesde, fechaHasta]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ fechaDesde, fechaHasta });
    if (canalesSel.length) params.set("canales", canalesSel.join(","));

    Promise.all([
      fetch(apiUrl("monitoreo", params.toString()), { headers: authHeaders() }).then((r) => r.json()),
      fetch(apiUrl("tendencia", params.toString()), { headers: authHeaders() }).then((r) => r.json()),
    ])
      .then(([m, t]) => {
        if (m.success) { setTotales(m.totales); setPorCanal(m.porCanal || []); }
        else setError(m.message || "Error al cargar monitoreo");
        if (t.success) setTendencia(t.data || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fechaDesde, fechaHasta, canalesSel, refreshTick]);

  const tendenciaFmt = useMemo(
    () => tendencia.map((r) => ({ ...r, fechaLabel: formatFecha(r.fecha) })),
    [tendencia]
  );

  const toggleCanal = (c) => {
    setCanalesSel((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  };

  return (
    <div style={{ padding: 20, background: C.light, minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.slate, margin: 0 }}>
          🚩 Redes VELSA — Monitoreo de Orígenes
        </h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)}
                 style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 13 }} />
          <span style={{ color: C.muted, fontSize: 13 }}>a</span>
          <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)}
                 style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 13 }} />
        </div>
      </div>

      <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "8px 12px" }}>
        ℹ️ Este módulo agrupa por <b>origen real</b> de cada lead (Bitrix / GHL / JotForm), sin catálogo de campañas —
        cada origen de Velsa es distinto y se muestra tal cual llega.
      </div>

      {/* Filtro de canales */}
      {canalesDisponibles.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
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
        </div>
      )}

      <InversionForm canalesDisponibles={canalesDisponibles} onGuardado={() => setRefreshTick((t) => t + 1)} />

      <TabSwitcher tab={tab} setTab={setTab} />

      {tab === "ciudad" && <TabCiudad fechaDesde={fechaDesde} fechaHasta={fechaHasta} canalesSel={canalesSel} />}
      {tab === "hora" && <TabHora fechaDesde={fechaDesde} fechaHasta={fechaHasta} canalesSel={canalesSel} />}
      {tab === "atc" && <TabAtc fechaDesde={fechaDesde} fechaHasta={fechaHasta} canalesSel={canalesSel} />}
      {tab === "reporte" && <TabReporte fechaDesde={fechaDesde} fechaHasta={fechaHasta} canalesSel={canalesSel} />}

      {tab === "resumen" && (
      <>
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: C.danger, borderRadius: 8, padding: 12, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading && <div style={{ color: C.muted, marginBottom: 12 }}>Cargando…</div>}

      {totales && (
        <>
          {/* KPIs */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <KpiCard label="Leads" value={fmtNum(totales.n_leads)} color={C.primary} icon="📥" />
            <KpiCard label="ATC" value={fmtNum(totales.atc)} color={C.sky} icon="🎧" />
            <KpiCard label="Venta Subida" value={fmtNum(totales.venta_subida)} color={C.success} icon="✅" />
            <KpiCard label="% Venta Subida" value={fmtPct(totales.pct_venta_subida)} color={C.success} icon="📈" />
            <KpiCard label="Descartados" value={fmtNum(totales.descartados)} color={C.danger} icon="🗑️" />
            <KpiCard label="% Descartado" value={fmtPct(totales.pct_descartado)} color={C.danger} icon="📉" />
            <KpiCard label="Activos (JotForm)" value={fmtNum(totales.activos_jotform)} color={C.violet} icon="🟢" />
            <KpiCard label="Rechazados (JotForm)" value={fmtNum(totales.rechazado_jotform)} color={C.warning} icon="🔶" />
            <KpiCard label="Inversión Total" value={fmtUsd(totales.inversion_total)} color={C.cyan} icon="💰" />
            <KpiCard label="CPL Promedio" value={fmtUsd(totales.cpl_promedio)} color={C.cyan} icon="🎯" />
            <KpiCard label="Costo x Venta" value={fmtUsd(totales.costo_venta_promedio)} color={C.cyan} icon="🏷️" />
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
            {/* Tendencia diaria */}
            <div style={{ flex: 2, minWidth: 380, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: C.slate, marginTop: 0 }}>Tendencia diaria</h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={tendenciaFmt}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="fechaLabel" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="n_leads" name="Leads" stroke={C.primary} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="atc" name="ATC" stroke={C.sky} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="venta_subida" name="Venta Subida" stroke={C.success} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="descartados" name="Descartados" stroke={C.danger} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Distribución por canal */}
            <div style={{ flex: 1, minWidth: 280, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: C.slate, marginTop: 0 }}>Distribución por origen</h3>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={porCanal} dataKey="n_leads" nameKey="canal_publicidad" outerRadius={90} label={({ canal_publicidad }) => canal_publicidad}>
                    {porCanal.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabla por canal */}
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, overflowX: "auto" }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: C.slate, marginTop: 0 }}>Detalle por origen</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.border}`, textAlign: "left" }}>
                  <th style={{ padding: "8px 6px" }}>Origen</th>
                  <th style={{ padding: "8px 6px", textAlign: "right" }}>Leads</th>
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
                {porCanal.map((row) => (
                  <tr key={row.canal_publicidad} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "8px 6px", fontWeight: 600 }}>{row.canal_publicidad}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row.n_leads)}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(row.atc)}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", color: C.success, fontWeight: 700 }}>{fmtNum(row.venta_subida)}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", color: C.danger }}>{fmtNum(row.descartados)}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right" }}>
                      {fmtPct(row.n_leads > 0 ? (row.venta_subida / row.n_leads) * 100 : 0)}
                    </td>
                    <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtUsd(row.inversion)}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", color: C.cyan, fontWeight: 700 }}>{fmtUsd(row.cpl)}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", color: C.cyan }}>{fmtUsd(row.costo_venta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      </>
      )}
    </div>
  );
}
