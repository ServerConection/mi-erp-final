import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from "recharts";

const API = import.meta.env.VITE_API_URL;

// ── Paleta de colores por supervisor ────────────────────────────────────────
const PALETTE = [
  "#6366f1","#22d3ee","#f59e0b","#10b981","#f43f5e",
  "#a78bfa","#34d399","#fb923c","#38bdf8","#e879f9",
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const fmt = (n) => Number(n || 0).toLocaleString();
const pct = (n) => `${Number(n || 0).toFixed(1)}%`;

// ── Tooltip personalizado ────────────────────────────────────────────────────
const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-950 border border-slate-700 rounded-xl p-3 shadow-2xl text-[10px] min-w-[160px]">
      <p className="font-black text-white mb-2 uppercase tracking-widest border-b border-slate-700 pb-1 truncate">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex justify-between gap-4 mb-1">
          <span className="text-slate-400">{p.name}</span>
          <span className="font-black" style={{ color: p.color }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

// ── KPI mini card ────────────────────────────────────────────────────────────
const KpiCard = ({ label, value, color = "border-l-violet-500", sub }) => (
  <div className={`bg-slate-900/60 border border-slate-800 border-l-4 ${color} rounded-xl p-4 flex flex-col gap-1`}>
    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
    <span className="text-2xl font-black text-white">{value}</span>
    {sub && <span className="text-[9px] text-slate-500">{sub}</span>}
  </div>
);

// ── Tabla de totales por supervisor ─────────────────────────────────────────
const TablaTotales = ({ data, colorMap }) => (
  <div className="overflow-x-auto rounded-xl border border-slate-800">
    <table className="w-full text-[10px]">
      <thead>
        <tr className="bg-slate-900 text-slate-400 uppercase tracking-widest">
          {["Supervisor","Leads","Gestionables","Ingresos JOT","Activas","Tasa Inst.","3ra Edad","Tarjeta","Por Regular."].map(h => (
            <th key={h} className="px-3 py-3 text-left font-black whitespace-nowrap">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((r, i) => (
          <tr key={i} className="border-t border-slate-800 hover:bg-slate-800/40 transition-colors">
            <td className="px-3 py-2.5 font-black text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colorMap[r.supervisor] }} />
              {r.supervisor}
            </td>
            <td className="px-3 py-2.5 text-slate-300">{fmt(r.leads_totales)}</td>
            <td className="px-3 py-2.5 text-violet-400 font-bold">{fmt(r.gestionables)}</td>
            <td className="px-3 py-2.5 text-emerald-400 font-bold">{fmt(r.ingresos_jot)}</td>
            <td className="px-3 py-2.5 text-cyan-400 font-bold">{fmt(r.activas)}</td>
            <td className="px-3 py-2.5 text-amber-400 font-bold">{pct(r.tasa_instalacion)}</td>
            <td className="px-3 py-2.5 text-pink-400">{fmt(r.activas_tercera_edad)}</td>
            <td className="px-3 py-2.5 text-blue-400">{fmt(r.pagos_tarjeta)}</td>
            <td className="px-3 py-2.5 text-orange-400">{fmt(r.por_regularizar)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ── Tabla semanal pivot ──────────────────────────────────────────────────────
const TablaSemanaPivot = ({ supervisores, semanasDetalle, semanas, metrica, colorMap }) => {
  const LABELS = {
    leads_totales: "Leads", gestionables: "Gestion.", ingresos_jot: "JOT", activas: "Activas",
  };
  // Pivot: supervisor → semana → valor
  const pivot = {};
  semanasDetalle.forEach(r => {
    if (!pivot[r.supervisor]) pivot[r.supervisor] = {};
    pivot[r.supervisor][r.num_semana] = r[metrica] || 0;
  });
  const sups = supervisores.map(s => s.supervisor);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="bg-slate-900 text-slate-400 uppercase tracking-widest">
            <th className="px-3 py-3 text-left font-black">Supervisor</th>
            {semanas.map(s => (
              <th key={s.numSemana} className="px-3 py-3 text-center font-black whitespace-nowrap">{s.label}</th>
            ))}
            <th className="px-3 py-3 text-right font-black text-white">Total</th>
          </tr>
        </thead>
        <tbody>
          {sups.map((sup, i) => {
            const total = semanas.reduce((a, s) => a + (pivot[sup]?.[s.numSemana] || 0), 0);
            return (
              <tr key={i} className="border-t border-slate-800 hover:bg-slate-800/40 transition-colors">
                <td className="px-3 py-2.5 font-black text-white flex items-center gap-2 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colorMap[sup] }} />
                  {sup}
                </td>
                {semanas.map(s => {
                  const v = pivot[sup]?.[s.numSemana] || 0;
                  const maxVal = Math.max(...sups.map(ss => pivot[ss]?.[s.numSemana] || 0), 1);
                  const pctBar = Math.round((v / maxVal) * 100);
                  return (
                    <td key={s.numSemana} className="px-3 py-2.5 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-black text-white">{fmt(v)}</span>
                        <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pctBar}%`, background: colorMap[sup] }} />
                        </div>
                      </div>
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-right font-black" style={{ color: colorMap[sup] }}>{fmt(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
export default function ComparativaSupervisores() {
  const hoy       = new Date();
  const [mes,   setMes]   = useState(hoy.getMonth() + 1);
  const [anio,  setAnio]  = useState(hoy.getFullYear());
  const [supFilt, setSupFilt] = useState("");
  const [loading, setLoading] = useState(false);
  const [data,    setData]    = useState(null);
  const [tab,     setTab]     = useState("RESUMEN");
  const [metrica, setMetrica] = useState("ingresos_jot");

  const fetchData = async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ mes, anio });
      if (supFilt) p.set("supervisor", supFilt);
      const r = await fetch(`${API}/api/comparativa-indicadores/supervisores?${p}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const json = await r.json();
      if (json.success) setData(json);
    } catch (e) {
      console.error("Error Comparativa:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Mapa color por supervisor
  const colorMap = useMemo(() => {
    const m = {};
    (data?.supervisoresComparativa || []).forEach((r, i) => {
      m[r.supervisor] = PALETTE[i % PALETTE.length];
    });
    return m;
  }, [data]);

  // Datos para gráfico de barras agrupadas por semana (líneas por supervisor)
  const dataSemanal = useMemo(() => {
    if (!data) return [];
    return (data.semanas || []).map(s => {
      const row = { semana: s.label };
      (data.supervisoresComparativa || []).forEach(sup => {
        const d = data.semanasDetalle.find(
          r => r.supervisor === sup.supervisor && r.num_semana === s.numSemana
        );
        row[sup.supervisor] = d ? d[metrica] : 0;
      });
      return row;
    });
  }, [data, metrica]);

  const sups = data?.supervisoresComparativa || [];
  const res  = data?.resumen || {};
  const semanas = data?.semanas || [];
  const semanasDetalle = data?.semanasDetalle || [];

  const TABS    = ["RESUMEN","POR SEMANA","DETALLE"];
  const METRICAS = [
    { key: "leads_totales",  label: "Leads Totales",  color: "text-slate-300" },
    { key: "gestionables",   label: "Gestionables",   color: "text-violet-400" },
    { key: "ingresos_jot",   label: "Ingresos JOT",   color: "text-emerald-400" },
    { key: "activas",        label: "Activas",         color: "text-cyan-400" },
  ];

  const selectCls = "bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-[10px] font-bold text-white outline-none uppercase";

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-6">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-black uppercase tracking-widest text-white">
            📈 Comparativa Supervisores
          </h1>
          <p className="text-[10px] text-slate-500 mt-1 uppercase">
            Análisis semanal · Leads · Gestionables · Ingresos JOT · Activas
          </p>
        </div>
        {/* Filtros */}
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-slate-500 uppercase font-black">Mes</span>
            <select className={selectCls} value={mes} onChange={e => setMes(Number(e.target.value))}>
              {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-slate-500 uppercase font-black">Año</span>
            <select className={selectCls} value={anio} onChange={e => setAnio(Number(e.target.value))}>
              {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-slate-500 uppercase font-black">Supervisor</span>
            <select className={selectCls} value={supFilt} onChange={e => setSupFilt(e.target.value)}>
              <option value="">TODOS</option>
              {sups.map((s, i) => <option key={i} value={s.supervisor}>{s.supervisor}</option>)}
            </select>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all active:scale-95"
          >
            {loading ? "CARGANDO..." : "APLICAR"}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <KpiCard label="Supervisores"  value={res.total_supervisores || 0} color="border-l-indigo-500" />
        <KpiCard label="Leads Totales" value={fmt(res.total_leads)}        color="border-l-slate-500" />
        <KpiCard label="Gestionables"  value={fmt(res.total_gestionables)} color="border-l-violet-500" />
        <KpiCard label="Ingresos JOT"  value={fmt(res.total_ingresos_jot)} color="border-l-emerald-500" />
        <KpiCard
          label="Activas"
          value={fmt(res.total_activas)}
          color="border-l-cyan-500"
          sub={res.total_ingresos_jot > 0
            ? `${((res.total_activas / res.total_ingresos_jot) * 100).toFixed(1)}% tasa inst.`
            : ""}
        />
      </div>

      {/* TABS */}
      <div className="flex gap-1 mb-4 bg-slate-900 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
              tab === t ? "bg-indigo-600 text-white shadow" : "text-slate-500 hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── TAB: RESUMEN ─────────────────────────────────────────────────── */}
      {tab === "RESUMEN" && (
        <div className="flex flex-col gap-6">
          {/* Gráfico barras comparativo */}
          {["leads_totales","gestionables","ingresos_jot","activas"].map(m => {
            const META_LABELS = {
              leads_totales: "Leads Totales", gestionables: "Gestionables",
              ingresos_jot: "Ingresos JOT", activas: "Activas",
            };
            return (
              <div key={m} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                  {META_LABELS[m]} por Supervisor — {MESES[mes-1]} {anio}
                </h2>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sups} margin={{ top: 5, right: 10, left: 0, bottom: 40 }} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis
                        dataKey="supervisor"
                        tick={{ fill: "#64748b", fontSize: 9, fontWeight: 700 }}
                        angle={-35} textAnchor="end" interval={0}
                        axisLine={false} tickLine={false}
                      />
                      <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={32} />
                      <Tooltip content={<DarkTooltip />} />
                      <Bar dataKey={m} name={META_LABELS[m]} radius={[4,4,0,0]}>
                        {sups.map((r, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}

          {/* Tabla resumen */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
              Resumen Completo por Supervisor
            </h2>
            <TablaTotales data={sups} colorMap={colorMap} />
          </div>
        </div>
      )}

      {/* ── TAB: POR SEMANA ──────────────────────────────────────────────── */}
      {tab === "POR SEMANA" && (
        <div className="flex flex-col gap-6">
          {/* Selector de métrica */}
          <div className="flex gap-2 flex-wrap">
            {METRICAS.map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setMetrica(key)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase border transition-all ${
                  metrica === key
                    ? "border-indigo-500 bg-indigo-600/20 text-white"
                    : "border-slate-700 text-slate-500 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Gráfico de líneas semanal */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
              {METRICAS.find(m => m.key === metrica)?.label} — Evolución Semanal
            </h2>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dataSemanal} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="semana"
                    tick={{ fill: "#64748b", fontSize: 9, fontWeight: 700 }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip content={<DarkTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 9, paddingTop: 16 }}
                    formatter={(v) => <span style={{ color: colorMap[v], fontWeight: 700, textTransform: "uppercase" }}>{v}</span>}
                  />
                  {sups.map((s) => (
                    <Line
                      key={s.supervisor}
                      type="monotone"
                      dataKey={s.supervisor}
                      stroke={colorMap[s.supervisor]}
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: colorMap[s.supervisor], strokeWidth: 0 }}
                      activeDot={{ r: 6 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Barras apiladas por semana */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
              {METRICAS.find(m => m.key === metrica)?.label} — Comparativa por Semana
            </h2>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dataSemanal} margin={{ top: 10, right: 20, left: 0, bottom: 0 }} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="semana" tick={{ fill: "#64748b", fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip content={<DarkTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 9, paddingTop: 12 }}
                    formatter={(v) => <span style={{ color: colorMap[v], fontWeight: 700, textTransform: "uppercase" }}>{v}</span>}
                  />
                  {sups.map((s) => (
                    <Bar
                      key={s.supervisor}
                      dataKey={s.supervisor}
                      fill={colorMap[s.supervisor]}
                      radius={[3,3,0,0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: DETALLE ─────────────────────────────────────────────────── */}
      {tab === "DETALLE" && (
        <div className="flex flex-col gap-6">
          {/* Selector de métrica */}
          <div className="flex gap-2 flex-wrap">
            {METRICAS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setMetrica(key)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase border transition-all ${
                  metrica === key
                    ? "border-indigo-500 bg-indigo-600/20 text-white"
                    : "border-slate-700 text-slate-500 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
              {METRICAS.find(m => m.key === metrica)?.label} — Desglose Semanal por Supervisor
            </h2>
            {semanas.length > 0
              ? <TablaSemanaPivot
                  supervisores={sups}
                  semanasDetalle={semanasDetalle}
                  semanas={semanas}
                  metrica={metrica}
                  colorMap={colorMap}
                />
              : <p className="text-slate-500 text-[10px] text-center py-8">Sin datos para el período seleccionado</p>
            }
          </div>

          {/* Tabla de totales completa */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
              Totales del Mes por Supervisor
            </h2>
            <TablaTotales data={sups} colorMap={colorMap} />
          </div>
        </div>
      )}

      {/* Sin datos */}
      {!loading && sups.length === 0 && (
        <div className="text-center py-20 text-slate-600">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-[11px] font-black uppercase">Sin datos para {MESES[mes-1]} {anio}</p>
          <p className="text-[10px] mt-1">Verifica que existan registros en ese período</p>
        </div>
      )}
    </div>
  );
}
