import { useEffect, useState, useMemo } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList,
} from "recharts";

const API = import.meta.env.VITE_API_URL;

// ── Paletas ───────────────────────────────────────────────────────────────────
const COLORES_CALIDAD = {
  "APROBADO":      "#10b981",
  "EN CURSO":      "#a78bfa",
  "NO INGRESADO":  "#f59e0b",
  "RECHAZADO":     "#ef4444",
  "SIN DATO":      "#64748b",
  "NO INGRSADO":   "#f59e0b",
};
const COLORES_ESTADO = {
  "REGULARIZADO":              "#10b981",
  "POR REGULARIZAR":           "#f59e0b",
  "NO REQUIERE REGULARIZAR":   "#a78bfa",
  "SIN DATO":                  "#64748b",
};
const COLORES_PIE = ["#a78bfa","#10b981","#f59e0b","#ef4444","#3b82f6","#06b6d4","#f97316","#64748b"];

const getColor = (mapa, key, idx = 0) => mapa[key] || COLORES_PIE[idx % COLORES_PIE.length];

// ── UI helpers ────────────────────────────────────────────────────────────────
const KpiCard = ({ label, value, sub, color = "text-purple-400" }) => (
  <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 flex flex-col gap-1 shadow">
    <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">{label}</span>
    <span className={`text-3xl font-black ${color}`}>{value ?? "—"}</span>
    {sub && <span className="text-[11px] text-slate-500">{sub}</span>}
  </div>
);

const SectionTitle = ({ icon, title }) => (
  <div className="flex items-center gap-2 mb-3">
    <span className="text-xl">{icon}</span>
    <h2 className="text-base font-black text-slate-100 uppercase tracking-widest">{title}</h2>
  </div>
);

const TooltipCustom = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl text-[11px] min-w-[140px]">
      <p className="font-black text-white mb-1 border-b border-slate-700 pb-1">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex justify-between gap-3">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-bold text-white">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ── Página principal ──────────────────────────────────────────────────────────
export default function ResumenVelsa() {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });
  const primerDia = hoy.substring(0, 8) + "01";

  const [desde, setDesde] = useState(primerDia);
  const [hasta, setHasta] = useState(hoy);
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API}/api/analista/velsa?desde=${desde}&hasta=${hasta}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Error en la respuesta");
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const kpis = useMemo(() => {
    if (!data) return {};
    const aprobadas = data.calidadVenta?.find(c => c.name === "APROBADO")?.value || 0;
    const rechazadas = data.calidadVenta?.find(c => c.name === "RECHAZADO")?.value || 0;
    const regularizados = data.estadoRegularizacion?.find(c => c.name === "REGULARIZADO")?.value || 0;
    const pctAprobacion = data.total > 0 ? ((aprobadas / data.total) * 100).toFixed(1) : "0.0";
    const pctRegularizados = data.total > 0 ? ((regularizados / data.total) * 100).toFixed(1) : "0.0";
    return { aprobadas, rechazadas, regularizados, pctAprobacion, pctRegularizados };
  }, [data]);

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            🟣 Resumen VELSA
          </h1>
          <p className="text-slate-400 text-sm mt-1">Análisis de calidad de ventas — Jotform Netlife</p>
        </div>
        {/* Filtro de fechas */}
        <div className="flex items-center gap-2 bg-slate-800 rounded-2xl p-3 border border-slate-700">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-slate-500 uppercase font-bold">Desde</span>
            <input
              type="date" value={desde}
              onChange={e => setDesde(e.target.value)}
              className="bg-slate-700 text-white text-sm rounded-lg px-3 py-1.5 border border-slate-600 focus:outline-none focus:border-purple-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-slate-500 uppercase font-bold">Hasta</span>
            <input
              type="date" value={hasta}
              onChange={e => setHasta(e.target.value)}
              className="bg-slate-700 text-white text-sm rounded-lg px-3 py-1.5 border border-slate-600 focus:outline-none focus:border-purple-500"
            />
          </div>
          <button
            onClick={fetchData}
            className="mt-4 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors"
          >
            Aplicar
          </button>
        </div>
      </div>

      {/* Estado */}
      {loading && (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <span className="ml-3 text-slate-400 text-sm">Cargando datos…</span>
        </div>
      )}
      {error && (
        <div className="bg-red-900/40 border border-red-700 rounded-2xl p-4 text-red-300 text-sm">
          ⚠️ {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KpiCard label="Total Ventas" value={data.total} color="text-white" />
            <KpiCard label="Aprobadas" value={kpis.aprobadas} color="text-emerald-400"
              sub={`${kpis.pctAprobacion}% del total`} />
            <KpiCard label="Rechazadas" value={kpis.rechazadas} color="text-red-400" />
            <KpiCard label="Regularizados" value={kpis.regularizados} color="text-purple-400"
              sub={`${kpis.pctRegularizados}% del total`} />
            <KpiCard label="Asesores activos" value={data.asesores?.length || 0} color="text-blue-400" />
          </div>

          {/* Tendencia diaria */}
          <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
            <SectionTitle icon="📈" title="Tendencia diaria" />
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.tendencia} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="fecha" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <Tooltip content={<TooltipCustom />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                <Line type="monotone" dataKey="total" name="Ingresos JOT" stroke="#a78bfa" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="aprobadas" name="Aprobadas" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Calidad venta + Estado regularización */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
              <SectionTitle icon="✅" title="Calidad de Venta" />
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={data.calidadVenta}
                    dataKey="value" nameKey="name"
                    cx="50%" cy="50%" outerRadius={90}
                    label={({ name, percent }) => `${name.length > 14 ? name.substring(0, 13) + "…" : name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {data.calidadVenta.map((entry, i) => (
                      <Cell key={i} fill={getColor(COLORES_CALIDAD, entry.name, i)} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
              <SectionTitle icon="📋" title="Estado de Regularización" />
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={data.estadoRegularizacion}
                    dataKey="value" nameKey="name"
                    cx="50%" cy="50%" outerRadius={90}
                    label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                  >
                    {data.estadoRegularizacion.map((entry, i) => (
                      <Cell key={i} fill={getColor(COLORES_ESTADO, entry.name, i)} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Auditoría de documentos */}
          <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
            <SectionTitle icon="🔍" title="Auditoría de Documentos" />
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.auditoria} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={180}
                  tick={{ fill: "#94a3b8", fontSize: 9 }}
                  tickFormatter={v => v.length > 22 ? v.substring(0, 21) + "…" : v}
                />
                <Tooltip content={<TooltipCustom />} />
                <Bar dataKey="value" name="Registros" radius={[0, 6, 6, 0]}>
                  {data.auditoria.map((_, i) => (
                    <Cell key={i} fill={COLORES_PIE[i % COLORES_PIE.length]} />
                  ))}
                  <LabelList dataKey="value" position="right" style={{ fill: "#94a3b8", fontSize: 10 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Planes + Formas de pago */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
              <SectionTitle icon="📦" title="Distribución de Planes" />
              {data.planes.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-10">Sin datos de planes en este período</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.planes} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }}
                      tickFormatter={v => v.replace("Plan ", "")} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <Tooltip content={<TooltipCustom />} />
                    <Bar dataKey="value" name="Ventas" radius={[6, 6, 0, 0]}>
                      {data.planes.map((_, i) => (
                        <Cell key={i} fill={COLORES_PIE[i % COLORES_PIE.length]} />
                      ))}
                      <LabelList dataKey="value" position="top" style={{ fill: "#94a3b8", fontSize: 10 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
              <SectionTitle icon="💳" title="Formas de Pago" />
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={data.formasPago}
                    dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                    label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                  >
                    {data.formasPago.map((_, i) => (
                      <Cell key={i} fill={COLORES_PIE[i % COLORES_PIE.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top asesores */}
          <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
            <SectionTitle icon="🏆" title="Top Asesores" />
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.asesores} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="asesor" tick={{ fill: "#94a3b8", fontSize: 9, angle: -35, textAnchor: "end" }}
                  tickFormatter={v => v.length > 15 ? v.substring(0, 14) + "…" : v}
                  interval={0}
                />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <Tooltip content={<TooltipCustom />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                <Bar dataKey="total" name="Total" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                <Bar dataKey="aprobadas" name="Aprobadas" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rechazadas" name="Rechazadas" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Por supervisor */}
          {data.supervisores?.length > 0 && (
            <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
              <SectionTitle icon="👥" title="Rendimiento por Supervisor" />
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.supervisores} margin={{ top: 5, right: 20, left: 0, bottom: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="supervisor" tick={{ fill: "#94a3b8", fontSize: 9, angle: -30, textAnchor: "end" }}
                    tickFormatter={v => v.length > 16 ? v.substring(0, 15) + "…" : v}
                    interval={0}
                  />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <Tooltip content={<TooltipCustom />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                  <Bar dataKey="total" name="Total" fill="#a78bfa" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="total" position="top" style={{ fill: "#94a3b8", fontSize: 9 }} />
                  </Bar>
                  <Bar dataKey="aprobadas" name="Aprobadas" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
