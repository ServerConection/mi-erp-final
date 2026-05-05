import { useEffect, useState, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LabelList,
  ReferenceLine,
} from "recharts";

const API = import.meta.env.VITE_API_URL;

// ── Paleta VELSA — pasteles púrpura/rosa/violeta ──────────────────────────────
const P = {
  purple: "#a78bfa",
  pink:   "#f472b6",
  blue:   "#60a5fa",
  green:  "#34d399",
  amber:  "#fbbf24",
  red:    "#f87171",
  teal:   "#2dd4bf",
  orange: "#fb923c",
  slate:  "#94a3b8",
  purpleSoft: "#ede9fe",
  pinkSoft:   "#fce7f3",
  blueSoft:   "#dbeafe",
  greenSoft:  "#d1fae5",
};

const PASTEL = [P.purple, P.pink, P.blue, P.green, P.amber, P.teal, P.orange, P.red];

const COLORES_STATUS = {
  "ACTIVO":                  P.green,
  "PREPLANIFICADO":          P.purple,
  "PRESERVICIO":             P.blue,
  "REPLANIFICADO":           P.amber,
  "FACTIBLE":                P.teal,
  "ASIGNADO":                P.orange,
  "RECHAZADO":               P.red,
  "DESISTE DEL SERVICIO":    P.pink,
  "FUERA DE COBERTURA":      P.slate,
  "SIN DATO":                P.slate,
};

const COLORES_REG = {
  "REGULARIZADO":            P.green,
  "POR REGULARIZAR":         P.amber,
  "NO REQUIERE REGULARIZAR": P.purple,
  "SIN DATO":                P.slate,
};

const gc = (map, key, i) => map[key] || PASTEL[i % PASTEL.length];

// ── Componentes UI ─────────────────────────────────────────────────────────────
const KpiCard = ({ label, value, sub, color, bg, icon }) => (
  <div className={`rounded-2xl p-5 border flex flex-col gap-1 shadow-sm ${bg || "bg-white border-slate-200"}`}>
    <div className="flex items-center gap-2 mb-1">
      {icon && <span className="text-lg">{icon}</span>}
      <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{label}</span>
    </div>
    <span className={`text-3xl font-black ${color || "text-purple-500"}`}>{value ?? "—"}</span>
    {sub && <span className="text-[11px] text-slate-400 mt-0.5">{sub}</span>}
  </div>
);

const Card = ({ title, icon, children, className = "" }) => (
  <div className={`bg-white rounded-2xl p-5 border border-slate-200 shadow-sm ${className}`}>
    <div className="flex items-center gap-2 mb-4">
      <span className="text-xl">{icon}</span>
      <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider">{title}</h2>
    </div>
    {children}
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-lg text-[11px] min-w-[130px]">
      {label && <p className="font-bold text-slate-700 mb-1 border-b pb-1">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex justify-between gap-3 mt-0.5">
          <span style={{ color: p.color || p.fill }} className="font-medium">{p.name}</span>
          <span className="font-bold text-slate-800">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

const ScatterTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-white border border-purple-200 rounded-xl p-3 shadow-lg text-[11px] min-w-[160px]">
      <p className="font-black text-purple-700 mb-1 border-b pb-1">{d.asesor}</p>
      <div className="flex justify-between gap-3"><span className="text-slate-500">Total ventas</span><span className="font-bold">{d.x}</span></div>
      <div className="flex justify-between gap-3"><span className="text-slate-500">% Activos</span><span className="font-bold text-green-600">{d.y}%</span></div>
      <div className="flex justify-between gap-3"><span className="text-slate-500">Activos</span><span className="font-bold">{d.activos}</span></div>
    </div>
  );
};

// ── Página principal ─────────────────────────────────────────────────────────
export default function ResumenVelsa() {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });
  const primerDia = hoy.substring(0, 8) + "01";

  const [desde, setDesde] = useState(primerDia);
  const [hasta, setHasta] = useState(hoy);
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/api/analista/velsa?desde=${desde}&hasta=${hasta}`,
        { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Error en respuesta");
      setData(json);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const kpis = useMemo(() => {
    if (!data) return {};
    const activos = data.calidadVenta?.find(c => c.name === "ACTIVO")?.value || 0;
    const regularizados = data.estadoRegularizacion?.find(c => c.name === "REGULARIZADO")?.value || 0;
    const porRegularizar = data.estadoRegularizacion?.find(c => c.name === "POR REGULARIZAR")?.value || 0;
    const pctActivos = data.total > 0 ? ((activos / data.total) * 100).toFixed(1) : "0.0";
    const pctReg = data.total > 0 ? ((regularizados / data.total) * 100).toFixed(1) : "0.0";
    return { activos, regularizados, porRegularizar, pctActivos, pctReg };
  }, [data]);

  const scatterData = useMemo(() => {
    if (!data?.asesores) return { points: [], medX: 0, medY: 0 };
    const points = data.asesores.map(a => ({ ...a, x: a.total, y: a.pctActivo }));
    const medX = points.length ? Math.round(points.reduce((s, p) => s + p.x, 0) / points.length) : 0;
    const medY = points.length ? parseFloat((points.reduce((s, p) => s + p.y, 0) / points.length).toFixed(1)) : 0;
    return { points, medX, medY };
  }, [data]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-xl">🟣</div>
            <div>
              <h1 className="text-2xl font-black text-slate-800">Resumen VELSA</h1>
              <p className="text-slate-500 text-sm">Análisis de calidad de ventas · Jotform Netlife</p>
            </div>
          </div>
        </div>
        <div className="flex items-end gap-2 bg-white rounded-2xl p-3 border border-slate-200 shadow-sm">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-slate-400 uppercase font-bold">Desde</span>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="text-sm rounded-lg px-3 py-1.5 border border-slate-200 focus:outline-none focus:border-purple-400 bg-slate-50" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-slate-400 uppercase font-bold">Hasta</span>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              className="text-sm rounded-lg px-3 py-1.5 border border-slate-200 focus:outline-none focus:border-purple-400 bg-slate-50" />
          </div>
          <button onClick={fetchData}
            className="bg-purple-500 hover:bg-purple-400 text-white text-sm font-bold px-5 py-2 rounded-xl transition-colors shadow-sm">
            Aplicar
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-purple-400 border-t-transparent rounded-full animate-spin" />
          <span className="ml-3 text-slate-500 text-sm">Cargando…</span>
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-600 text-sm">⚠️ {error}</div>}

      {data && !loading && (<>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard icon="📋" label="Total Ventas"    value={data.total}           color="text-slate-800" />
          <KpiCard icon="✅" label="Activos"         value={kpis.activos}         color="text-green-500"
            sub={`${kpis.pctActivos}% del total`} bg="bg-green-50 border-green-200" />
          <KpiCard icon="📁" label="Regularizados"   value={kpis.regularizados}   color="text-purple-500"
            sub={`${kpis.pctReg}% del total`} bg="bg-purple-50 border-purple-200" />
          <KpiCard icon="⏳" label="Por Regularizar" value={kpis.porRegularizar}   color="text-amber-500"
            bg="bg-amber-50 border-amber-200" />
          <KpiCard icon="👤" label="Asesores"        value={data.asesores?.length || 0} color="text-pink-500"
            bg="bg-pink-50 border-pink-200" />
        </div>

        {/* ── Área tendencia diaria ── */}
        <Card icon="📈" title="Tendencia Diaria — Ingresos Jotform">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.tendencia} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gTotalV" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={P.purple} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={P.purple} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gActivosV" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={P.green} stopOpacity={0.30} />
                  <stop offset="95%" stopColor={P.green} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="fecha" tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
              <Area type="monotone" dataKey="total"   name="Total JOT"  stroke={P.purple} fill="url(#gTotalV)"   strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="activos" name="Activos"    stroke={P.green}  fill="url(#gActivosV)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* ── Estatus + Regularización ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          <Card icon="🏷️" title="Estado Venta Netlife">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={data.calidadVenta} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={95} innerRadius={45}
                  paddingAngle={3}
                  label={({ percent }) => percent > 0.04 ? `${(percent*100).toFixed(0)}%` : ""}>
                  {data.calidadVenta.map((e, i) => (
                    <Cell key={i} fill={gc(COLORES_STATUS, e.name, i)} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10, color: "#64748b" }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card icon="📋" title="Estado de Regularización">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={data.estadoRegularizacion} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={95} innerRadius={45}
                  paddingAngle={3}
                  label={({ percent }) => percent > 0.04 ? `${(percent*100).toFixed(0)}%` : ""}>
                  {data.estadoRegularizacion.map((e, i) => (
                    <Cell key={i} fill={gc(COLORES_REG, e.name, i)} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10, color: "#64748b" }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* ── SCATTER PLOT — Matriz de Rendimiento ── */}
        <Card icon="🎯" title="Matriz de Rendimiento — Volumen vs. % Activos por Asesor">
          <p className="text-xs text-slate-400 mb-3">
            Cuadrante superior-derecho = alto volumen + alta efectividad
            · Líneas = promedios del grupo
          </p>
          <div className="grid grid-cols-2 gap-1 text-[9px] text-slate-400 mb-2 text-center">
            <div className="bg-amber-50 rounded-lg py-1 border border-amber-100">⬆️⬅️ Alta efectividad, bajo volumen</div>
            <div className="bg-green-50 rounded-lg py-1 border border-green-100">⬆️➡️ Top performers</div>
            <div className="bg-red-50 rounded-lg py-1 border border-red-100">⬇️⬅️ Bajo volumen y efectividad</div>
            <div className="bg-purple-50 rounded-lg py-1 border border-purple-100">⬇️➡️ Alto volumen, mejorar calidad</div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="x" name="Total ventas" type="number"
                label={{ value: "Total ventas", position: "insideBottom", offset: -5, fill: "#94a3b8", fontSize: 10 }}
                tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <YAxis dataKey="y" name="% Activos" type="number"
                label={{ value: "% Activos", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 10 }}
                tick={{ fill: "#94a3b8", fontSize: 10 }} domain={[0, 100]} />
              <ZAxis range={[60, 300]} />
              <Tooltip content={<ScatterTooltip />} />
              <ReferenceLine x={scatterData.medX} stroke={P.slate} strokeDasharray="4 3"
                label={{ value: `Prom ${scatterData.medX}`, fill: "#94a3b8", fontSize: 9, position: "top" }} />
              <ReferenceLine y={scatterData.medY} stroke={P.slate} strokeDasharray="4 3"
                label={{ value: `Prom ${scatterData.medY}%`, fill: "#94a3b8", fontSize: 9, position: "right" }} />
              <Scatter name="Asesores" data={scatterData.points}
                fill={P.purple} fillOpacity={0.75} stroke={P.purple} strokeWidth={1} />
            </ScatterChart>
          </ResponsiveContainer>
        </Card>

        {/* ── Planes + Formas de pago ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          <Card icon="📦" title="Distribución de Planes">
            {data.planes.length === 0
              ? <p className="text-slate-400 text-sm text-center py-8">Sin datos en este período</p>
              : <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.planes} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" name="Ventas" radius={[8, 8, 0, 0]}>
                      {data.planes.map((_, i) => <Cell key={i} fill={PASTEL[i]} />)}
                      <LabelList dataKey="value" position="top" style={{ fill: "#64748b", fontSize: 10 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
            }
          </Card>

          <Card icon="💳" title="Formas de Pago">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data.formasPago} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={4}
                  label={({ percent }) => percent > 0.05 ? `${(percent*100).toFixed(0)}%` : ""}>
                  {data.formasPago.map((_, i) => <Cell key={i} fill={PASTEL[i % PASTEL.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10, color: "#64748b" }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* ── Ranking asesores horizontal ── */}
        <Card icon="🏆" title="Ranking de Asesores — Top 15 por Volumen">
          <ResponsiveContainer width="100%" height={Math.max(250, data.asesores.length * 26)}>
            <BarChart data={data.asesores} layout="vertical"
              margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <YAxis type="category" dataKey="asesor" width={90}
                tick={{ fill: "#64748b", fontSize: 9 }}
                tickFormatter={v => v.length > 12 ? v.substring(0, 11) + "…" : v} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10, color: "#64748b" }} />
              <Bar dataKey="total"   name="Total"   fill={P.purple} radius={[0, 4, 4, 0]}>
                <LabelList dataKey="total" position="right" style={{ fill: "#64748b", fontSize: 9 }} />
              </Bar>
              <Bar dataKey="activos" name="Activos" fill={P.green}  radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* ── Provincias ── */}
        {data.provincias?.length > 0 && (
          <Card icon="🗺️" title="Distribución por Provincia">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.provincias} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }}
                  tickFormatter={v => v.length > 10 ? v.substring(0, 9) + "…" : v} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Ventas" radius={[6, 6, 0, 0]}>
                  {data.provincias.map((_, i) => <Cell key={i} fill={PASTEL[i % PASTEL.length]} />)}
                  <LabelList dataKey="value" position="top" style={{ fill: "#64748b", fontSize: 9 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

      </>)}
    </div>
  );
}
