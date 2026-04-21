import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, LabelList,
} from "recharts";

const API = import.meta.env.VITE_API_URL;

// ── Paleta ejecutiva ─────────────────────────────────────────────────────────
const PALETTE = [
  "#818cf8", "#34d399", "#fbbf24", "#f87171",
  "#38bdf8", "#a78bfa", "#fb923c", "#4ade80",
];

const fmt   = (n) => Number(n || 0).toLocaleString();
const pctFn = (n) => `${Number(n || 0).toFixed(1)}%`;
const hoy   = new Date();
const mesHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;

// ── Tooltip oscuro ───────────────────────────────────────────────────────────
const DarkTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f172a] border border-slate-700 rounded-2xl px-4 py-3 shadow-2xl min-w-[170px]">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 pb-2 border-b border-slate-800">
        {label}
      </p>
      {payload.map((p, i) => (
        <div key={i} className="flex justify-between items-center gap-6 mb-1">
          <span className="text-[9px] text-slate-400 font-semibold uppercase">{p.name}</span>
          <span className="text-[10px] font-black" style={{ color: p.color || p.fill }}>
            {fmt(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── KPI Card ─────────────────────────────────────────────────────────────────
const KPI = ({ icon, label, value, sub, accent }) => (
  <div className="relative overflow-hidden bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-2">
    <div className="absolute top-0 left-0 w-full h-0.5 rounded-t-2xl" style={{ background: accent }} />
    <div className="flex items-center gap-2">
      <span className="text-lg">{icon}</span>
      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
    </div>
    <span className="text-3xl font-black text-white leading-none">{value}</span>
    {sub && <span className="text-[9px] font-semibold" style={{ color: accent }}>{sub}</span>}
  </div>
);

// ── Barra horizontal de ranking ──────────────────────────────────────────────
const RankBar = ({ data, metrica, label, color }) => {
  const max = Math.max(...data.map(r => r[metrica] || 0), 1);
  return (
    <div className="flex flex-col gap-2">
      {data.map((r, i) => {
        const val = r[metrica] || 0;
        const pct = (val / max) * 100;
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="text-[9px] font-black text-slate-400 w-28 truncate uppercase">{r.supervisor}</span>
            <div className="flex-1 h-5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full flex items-center pl-2 transition-all duration-700"
                style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }}
              >
                {pct > 25 && (
                  <span className="text-[8px] font-black text-white">{fmt(val)}</span>
                )}
              </div>
            </div>
            {pct <= 25 && (
              <span className="text-[9px] font-black text-white w-8 text-right">{fmt(val)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
export default function ComparativaSupervisores() {
  const [mesVal,  setMesVal]  = useState(mesHoy);   // formato "YYYY-MM"
  const [loading, setLoading] = useState(false);
  const [data,    setData]    = useState(null);
  const [tabSem,  setTabSem]  = useState("ingresos_jot");

  // Derivar mes y año del input type="month"
  const [anio, mes] = mesVal.split("-").map(Number);

  const fetchData = async (m = mes, a = anio) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ mes: m, anio: a });
      const r = await fetch(
        `${API}/api/comparativa-indicadores/supervisores?${params}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      const json = await r.json();
      if (json.success) setData(json);
    } catch (e) {
      console.error("Comparativa error:", e);
    } finally {
      setLoading(false);
    }
  };

  // Carga automática al montar
  useEffect(() => { fetchData(); }, []);

  // Al cambiar el mes, recarga automáticamente
  const handleMesChange = (e) => {
    const val = e.target.value;
    setMesVal(val);
    const [a, m] = val.split("-").map(Number);
    fetchData(m, a);
  };

  // Mapa colores
  const colorMap = useMemo(() => {
    const m = {};
    (data?.supervisoresComparativa || []).forEach((r, i) => {
      m[r.supervisor] = PALETTE[i % PALETTE.length];
    });
    return m;
  }, [data]);

  const sups     = data?.supervisoresComparativa || [];
  const res      = data?.resumen || {};
  const semanas  = data?.semanas  || [];
  const detalle  = data?.semanasDetalle || [];

  // Datos para gráfico lineal semanal (una línea por supervisor)
  const dataSemanal = useMemo(() => {
    if (!semanas.length) return [];
    return semanas.map(s => {
      const row = { semana: `S${s.numSemana}`, label: s.label };
      sups.forEach(sup => {
        const d = detalle.find(
          r => r.supervisor === sup.supervisor && r.num_semana === s.numSemana
        );
        row[sup.supervisor] = d ? d[tabSem] : 0;
      });
      return row;
    });
  }, [semanas, detalle, sups, tabSem]);

  // Datos para gráfico de comparativa total (un grupo por supervisor)
  const dataComparativa = sups.map(r => ({
    supervisor: r.supervisor.length > 12 ? r.supervisor.slice(0, 12) + "…" : r.supervisor,
    supervisorFull: r.supervisor,
    "Leads":        r.leads_totales,
    "Gestionables": r.gestionables,
    "Ing. JOT":     r.ingresos_jot,
    "Activas":      r.activas,
  }));

  const TABS_SEM = [
    { key: "leads_totales", label: "Leads",      color: "#94a3b8" },
    { key: "gestionables",  label: "Gestionables", color: "#818cf8" },
    { key: "ingresos_jot",  label: "Ing. JOT",   color: "#34d399" },
    { key: "activas",       label: "Activas",     color: "#38bdf8" },
  ];

  // Nombre del mes en español
  const MESES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const mesNombre = MESES_ES[(mes || 1) - 1];

  return (
    <div className="min-h-screen bg-slate-950 p-5 md:p-7">

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">
            Gerencia · Análisis de Rendimiento
          </p>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">
            Comparativa de Supervisores
          </h1>
          <p className="text-[10px] text-slate-500 mt-1">
            Leads · Gestionables · Ingresos JOT · Activas — desglose semanal
          </p>
        </div>

        {/* Filtro único: mes */}
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Período</span>
            <input
              type="month"
              value={mesVal}
              onChange={handleMesChange}
              className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-[11px] font-bold text-white outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          {loading && (
            <div className="pb-2.5 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-[9px] text-slate-500 uppercase font-black">Cargando…</span>
            </div>
          )}
        </div>
      </div>

      {/* ── SIN DATOS ───────────────────────────────────────────────────── */}
      {!loading && sups.length === 0 && (
        <div className="text-center py-24 text-slate-700">
          <p className="text-5xl mb-4">📭</p>
          <p className="text-sm font-black uppercase text-slate-500">
            Sin datos para {mesNombre} {anio}
          </p>
          <p className="text-[10px] text-slate-600 mt-2">
            Verifica que existan registros en ese período
          </p>
        </div>
      )}

      {sups.length > 0 && (
        <>
          {/* ── KPIs ──────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <KPI icon="📋" label="Leads Totales"  value={fmt(res.total_leads)}
                 accent="#94a3b8" sub={`${mesNombre} ${anio}`} />
            <KPI icon="🎯" label="Gestionables"   value={fmt(res.total_gestionables)}
                 accent="#818cf8"
                 sub={res.total_leads > 0
                   ? `${((res.total_gestionables/res.total_leads)*100).toFixed(1)}% del total`
                   : ""} />
            <KPI icon="📥" label="Ingresos JOT"   value={fmt(res.total_ingresos_jot)}
                 accent="#34d399" />
            <KPI icon="✅" label="Activas"         value={fmt(res.total_activas)}
                 accent="#38bdf8"
                 sub={res.total_ingresos_jot > 0
                   ? `${((res.total_activas/res.total_ingresos_jot)*100).toFixed(1)}% tasa instalación`
                   : ""} />
          </div>

          {/* ── SECCIÓN 1: Rankings horizontales ──────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {[
              { metrica: "leads_totales",  label: "Leads Totales",  color: "#94a3b8" },
              { metrica: "gestionables",   label: "Gestionables",   color: "#818cf8" },
              { metrica: "ingresos_jot",   label: "Ingresos JOT",   color: "#34d399" },
              { metrica: "activas",        label: "Activas",        color: "#38bdf8" },
            ].map(({ metrica, label, color }) => (
              <div key={metrica} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    {label} por Supervisor
                  </span>
                </div>
                <RankBar data={[...sups].sort((a,b) => b[metrica]-a[metrica])} metrica={metrica} />
              </div>
            ))}
          </div>

          {/* ── SECCIÓN 2: Gráfico agrupado comparativo ───────────────────── */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-6">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
              Comparativa General — {mesNombre} {anio}
            </p>
            <p className="text-[8px] text-slate-600 mb-5">
              Leads · Gestionables · Ingresos JOT · Activas por supervisor
            </p>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dataComparativa} margin={{ top: 5, right: 10, left: 0, bottom: 30 }} barCategoryGap="20%" barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="supervisor"
                    tick={{ fill: "#64748b", fontSize: 9, fontWeight: 700 }}
                    angle={-30} textAnchor="end" interval={0}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip content={<DarkTip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 9, paddingTop: 12 }}
                    formatter={v => <span style={{ color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>{v}</span>}
                  />
                  <Bar dataKey="Leads"        fill="#475569" radius={[3,3,0,0]} />
                  <Bar dataKey="Gestionables" fill="#818cf8" radius={[3,3,0,0]} />
                  <Bar dataKey="Ing. JOT"     fill="#34d399" radius={[3,3,0,0]} />
                  <Bar dataKey="Activas"      fill="#38bdf8" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── SECCIÓN 3: Evolución semanal ──────────────────────────────── */}
          {semanas.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                    Evolución Semanal por Supervisor
                  </p>
                  <p className="text-[8px] text-slate-600">
                    Sem 1 = día 1 → primer domingo del mes
                  </p>
                </div>
                {/* Selector de métrica inline */}
                <div className="flex gap-1 bg-slate-800 rounded-xl p-1">
                  {TABS_SEM.map(t => (
                    <button
                      key={t.key}
                      onClick={() => setTabSem(t.key)}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${
                        tabSem === t.key
                          ? "bg-slate-950 text-white shadow"
                          : "text-slate-500 hover:text-white"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dataSemanal} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="semana"
                      tick={{ fill: "#64748b", fontSize: 9, fontWeight: 700 }}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={30} />
                    <Tooltip content={<DarkTip />} />
                    <Legend
                      wrapperStyle={{ fontSize: 9, paddingTop: 12 }}
                      formatter={v => (
                        <span style={{ color: colorMap[v], fontWeight: 700, textTransform: "uppercase", fontSize: 9 }}>{v}</span>
                      )}
                    />
                    {sups.map((s, i) => (
                      <Line
                        key={s.supervisor}
                        type="monotone"
                        dataKey={s.supervisor}
                        stroke={colorMap[s.supervisor]}
                        strokeWidth={2.5}
                        dot={{ r: 5, fill: colorMap[s.supervisor], strokeWidth: 0 }}
                        activeDot={{ r: 7, strokeWidth: 0 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── SECCIÓN 4: Tabla pivot semanal ────────────────────────────── */}
          {semanas.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-6">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-5">
                Detalle Semanal — {TABS_SEM.find(t => t.key === tabSem)?.label}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="pb-3 text-left text-[9px] font-black text-slate-500 uppercase tracking-widest pr-6">
                        Supervisor
                      </th>
                      {semanas.map(s => (
                        <th key={s.numSemana} className="pb-3 text-center text-[9px] font-black text-slate-500 uppercase tracking-widest px-3 whitespace-nowrap">
                          {s.label}
                        </th>
                      ))}
                      <th className="pb-3 text-right text-[9px] font-black text-white uppercase tracking-widest pl-6">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sups.map((sup, i) => {
                      const total = semanas.reduce((acc, s) => {
                        const d = detalle.find(r => r.supervisor === sup.supervisor && r.num_semana === s.numSemana);
                        return acc + (d ? d[tabSem] : 0);
                      }, 0);
                      const maxTotal = Math.max(...sups.map(ss =>
                        semanas.reduce((acc, s) => {
                          const d = detalle.find(r => r.supervisor === ss.supervisor && r.num_semana === s.numSemana);
                          return acc + (d ? d[tabSem] : 0);
                        }, 0)
                      ), 1);

                      return (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 pr-6">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colorMap[sup.supervisor] }} />
                              <span className="font-black text-white text-[10px] uppercase">{sup.supervisor}</span>
                            </div>
                          </td>
                          {semanas.map(s => {
                            const d = detalle.find(r => r.supervisor === sup.supervisor && r.num_semana === s.numSemana);
                            const val = d ? d[tabSem] : 0;
                            const maxSem = Math.max(
                              ...sups.map(ss => {
                                const dd = detalle.find(r => r.supervisor === ss.supervisor && r.num_semana === s.numSemana);
                                return dd ? dd[tabSem] : 0;
                              }), 1
                            );
                            const isMax = val === maxSem && val > 0;
                            return (
                              <td key={s.numSemana} className="py-3 px-3 text-center">
                                <span className={`font-black text-[11px] ${isMax ? "text-white" : "text-slate-400"}`}>
                                  {fmt(val)}
                                </span>
                                {isMax && val > 0 && (
                                  <div className="text-[7px] text-indigo-400 font-black uppercase mt-0.5">TOP</div>
                                )}
                              </td>
                            );
                          })}
                          <td className="py-3 pl-6 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="font-black text-[12px] text-white">{fmt(total)}</span>
                              <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${(total / maxTotal) * 100}%`,
                                    background: colorMap[sup.supervisor]
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── SECCIÓN 5: Tabla de tasa de instalación ───────────────────── */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-5">
              Indicadores de Calidad — {mesNombre} {anio}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-slate-800">
                    {["Supervisor","Leads","Gestion.","Ing. JOT","Activas","Tasa Inst.","3ra Edad","Tarjeta","Por Regular."].map(h => (
                      <th key={h} className="pb-3 text-left text-[9px] font-black text-slate-500 uppercase tracking-widest pr-4 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sups.map((r, i) => (
                    <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: colorMap[r.supervisor] }} />
                          <span className="font-black text-white uppercase">{r.supervisor}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-slate-400 font-bold">{fmt(r.leads_totales)}</td>
                      <td className="py-3 pr-4 font-bold" style={{ color: "#818cf8" }}>{fmt(r.gestionables)}</td>
                      <td className="py-3 pr-4 font-bold" style={{ color: "#34d399" }}>{fmt(r.ingresos_jot)}</td>
                      <td className="py-3 pr-4 font-bold" style={{ color: "#38bdf8" }}>{fmt(r.activas)}</td>
                      <td className="py-3 pr-4">
                        <span className={`font-black px-2 py-0.5 rounded-lg text-[9px] ${
                          r.tasa_instalacion >= 80 ? "bg-emerald-900/50 text-emerald-400"
                          : r.tasa_instalacion >= 60 ? "bg-amber-900/50 text-amber-400"
                          : "bg-red-900/50 text-red-400"
                        }`}>
                          {pctFn(r.tasa_instalacion)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-pink-400 font-bold">{fmt(r.activas_tercera_edad)}</td>
                      <td className="py-3 pr-4 text-blue-400 font-bold">{fmt(r.pagos_tarjeta)}</td>
                      <td className="py-3 text-orange-400 font-bold">{fmt(r.por_regularizar)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
