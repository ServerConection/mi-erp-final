import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, LineChart, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "./ChartFrame";
import { cabecerasSesion } from "../utils/sesion";

const C = { blue: "#1e3a8a", sky: "#0ea5e9", green: "#059669", red: "#ef4444", violet: "#7c3aed", orange: "#f59e0b", cyan: "#06b6d4", muted: "#64748b", border: "#e2e8f0" };
const palette = [C.blue, C.green, C.sky, C.orange, C.violet, C.cyan, C.red, "#94a3b8"];
const n = v => Number(v || 0);
const dateLabel = v => { const [, m, d] = String(v || "").slice(0, 10).split("-"); return d ? `${d}/${m}` : "—"; };
const grid = <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />;
const tooltip = <Tooltip />;

function Heatmap({ rows }) {
  const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const byCell = new Map(rows.map(r => [`${r.hora}|${r.dia_semana}`, n(r.n_leads)]));
  const hours = [...new Set(rows.map(r => n(r.hora)))].sort((a, b) => a - b);
  const max = Math.max(1, ...rows.map(r => n(r.n_leads)));
  return <section className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: C.border }}>
    <div className="px-5 py-4 border-b flex items-center gap-3" style={{ borderColor: C.border }}><span className="w-1 h-7 rounded-full" style={{ background: C.blue }} /><h3 className="text-[12px] font-black uppercase tracking-widest" style={{ color: C.blue }}>Mapa de calor — leads × hora × día de semana</h3></div>
    <div className="p-5 overflow-auto"><div className="inline-grid gap-1.5" style={{ gridTemplateColumns: "42px repeat(7,48px)" }}><span />{days.map(d => <b key={d} className="text-center text-[11px]" style={{ color: C.muted }}>{d}</b>)}{hours.map(h => <div key={h} className="contents"><b className="text-[11px] self-center" style={{ color: C.muted }}>{String(h).padStart(2, "0")}h</b>{days.map((d, i) => { const v = byCell.get(`${h}|${i + 1}`) || 0, strength = v / max; return <div key={`${h}-${d}`} title={`${d} ${h}:00 · ${v} leads`} className="h-8 w-12 rounded-lg grid place-items-center text-[11px] font-black" style={{ background: v ? strength > .75 ? C.blue : strength > .5 ? C.sky : strength > .25 ? "#93c5fd" : "#dbeafe" : "#f1f5f9", color: strength > .5 ? "#fff" : C.blue }}>{v || ""}</div>; })}</div>)}</div></div>
  </section>;
}

export default function RedesVelsaGraphs({ filtro, canalesSel, tendencia, porCanal, totales, hora, atc, refreshTick }) {
  const [extra, setExtra] = useState(null), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ fechaDesde: filtro.desde, fechaHasta: filtro.hasta });
    if (canalesSel.length) params.set("canales", canalesSel.join(","));
    fetch(`${import.meta.env.VITE_API_URL}/api/redes-velsa/graficos?${params}`, { headers: cabecerasSesion(), signal: controller.signal })
      .then(r => r.json()).then(d => { if (!d.success) throw new Error(d.message); setExtra(d); setError(""); })
      .catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [filtro, canalesSel, refreshTick]);

  const agencyNames = useMemo(() => [...new Set((extra?.jotPorAgenciaDia || []).map(r => r.agencia))], [extra]);
  const days = useMemo(() => {
    const byDate = new Map();
    for (const r of tendencia || []) { const fecha = String(r.fecha).slice(0, 10); byDate.set(fecha, { fecha: dateLabel(fecha), rawFecha: fecha, Leads: n(r.n_leads), "V. Subida": n(r.venta_subida), "Inv.$": n(r.inversion), CPL: n(r.cpl), "ATC %": r.n_leads ? n(r.atc) / n(r.n_leads) * 100 : 0, "CRM %": r.gestionables ? n(r.venta_subida) / n(r.gestionables) * 100 : 0 }); }
    for (const r of extra?.jotPorAgenciaDia || []) { const fecha = String(r.fecha).slice(0, 10); if (!byDate.has(fecha)) byDate.set(fecha, { fecha: dateLabel(fecha), rawFecha: fecha, Leads: 0, "V. Subida": 0, "Inv.$": 0, CPL: 0, "ATC %": 0, "CRM %": 0 }); const day = byDate.get(fecha); day[`JOT ${r.agencia}`] = (day[`JOT ${r.agencia}`] || 0) + n(r.ingreso_jot); day.JOT = (day.JOT || 0) + n(r.ingreso_jot); }
    return [...byDate.values()].sort((a, b) => a.rawFecha.localeCompare(b.rawFecha)).map(r => ({ ...r, "JOT %": r.Leads ? n(r.JOT) / r.Leads * 100 : 0 }));
  }, [tendencia, extra]);
  const agencies = porCanal.map((r, i) => ({ name: r.canal_publicidad, fill: palette[i % palette.length], Leads: n(r.n_leads), Negociables: n(r.gestionables), "V. Subida": n(r.venta_subida), Inversion: n(r.inversion) }));
  const donutsLeads = agencies.filter(r => r.Leads > 0).map(r => ({ name: r.name, value: r.Leads, fill: r.fill }));
  const donutsInv = agencies.filter(r => r.Inversion > 0).map(r => ({ name: r.name, value: r.Inversion, fill: r.fill }));
  const hours = (hora?.porHora || []).map(r => ({ hora: `${String(r.hora).padStart(2, "0")}h`, Leads: n(r.n_leads), ATC: n(r.atc) }));
  const cycle = (extra?.ciclo || []).map(r => ({ bucket: r.bucket === "5+" ? "+5d" : `${r.bucket}d`, cantidad: n(r.cantidad) }));
  const motives = (atc?.data || []).slice(0, 8).map(r => ({ motivo: String(r.motivo || "").slice(0, 20), cantidad: n(r.cantidad) }));
  const funnel = [{ step: "Leads", count: n(totales?.n_leads) }, { step: "Negociables", count: n(totales?.gestionables) }, { step: "V. Subida", count: n(totales?.venta_subida) }, { step: "Ing. JOT", count: n(extra?.jotTotales?.ingreso_jot) }, { step: "Activos", count: n(extra?.jotTotales?.activos) }];
  if (error) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</p>;
  return <div className="space-y-6">
    <ChartCard title="Leads & venta subida (total) · ingresos JOT por campaña" subtitle="Barras consolidadas y líneas JOT por agencia · datos de VELSA" height={320}>
      <ComposedChart data={days} margin={{ top: 24, right: 25, bottom: 5, left: 5 }}>{grid}<XAxis dataKey="fecha" fontSize={11} /><YAxis yAxisId="count" fontSize={11} /><YAxis yAxisId="jot" orientation="right" fontSize={11} />{tooltip}<Legend /><Bar yAxisId="count" dataKey="Leads" fill="#c7d2e8"><LabelList dataKey="Leads" position="top" fontSize={10} /></Bar><Bar yAxisId="count" dataKey="V. Subida" fill="#9bd3c3"><LabelList dataKey="V. Subida" position="top" fontSize={10} /></Bar>{agencyNames.map((a, i) => <Line key={a} yAxisId="jot" dataKey={`JOT ${a}`} name={`JOT ${a}`} stroke={palette[i % palette.length]} strokeWidth={2} />)}</ComposedChart>
    </ChartCard>
    <ChartCard title="Gestionables & venta subida por canal" accent={C.green} height={260}>
      <BarChart data={agencies}>{grid}<XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} />{tooltip}<Legend /><Bar dataKey="Leads" fill="#afbddc"><LabelList dataKey="Leads" position="top" fontSize={10} /></Bar><Bar dataKey="Negociables" fill={C.sky}><LabelList dataKey="Negociables" position="top" fontSize={10} /></Bar><Bar dataKey="V. Subida" fill={C.green}><LabelList dataKey="V. Subida" position="top" fontSize={10} /></Bar></BarChart>
    </ChartCard>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ChartCard title="Leads por canal" height={230}><PieChart><Pie data={donutsLeads} cx="45%" cy="50%" innerRadius={55} outerRadius={86} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>{donutsLeads.map((r, i) => <Cell key={i} fill={r.fill} />)}</Pie>{tooltip}<Legend /></PieChart></ChartCard>
      <ChartCard title="Inversión por canal" accent={C.violet} height={230}><PieChart><Pie data={donutsInv} cx="45%" cy="50%" innerRadius={55} outerRadius={86} dataKey="value" label={({ name, value }) => `${name}: $${Number(value).toFixed(0)}`}>{donutsInv.map((r, i) => <Cell key={i} fill={r.fill} />)}</Pie>{tooltip}<Legend /></PieChart></ChartCard>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ChartCard title="% Efectividad (JOT / CRM) vs % ATC" subtitle="JOT: ingresos / leads; CRM: ventas / gestionables" accent={C.orange} height={260}><LineChart data={days}>{grid}<XAxis dataKey="fecha" fontSize={11} /><YAxis domain={[0, 100]} unit="%" fontSize={11} />{tooltip}<Legend /><Line dataKey="ATC %" stroke={C.red} strokeWidth={2} /><Line dataKey="CRM %" stroke={C.blue} strokeWidth={2} /><Line dataKey="JOT %" stroke={C.green} strokeWidth={2} /></LineChart></ChartCard>
      <ChartCard title="Inversión & CPL diario" accent={C.violet} height={260}><ComposedChart data={days}>{grid}<XAxis dataKey="fecha" fontSize={11} /><YAxis yAxisId="inv" fontSize={11} /><YAxis yAxisId="cpl" orientation="right" fontSize={11} />{tooltip}<Legend /><Bar yAxisId="inv" dataKey="Inv.$" fill={C.violet}><LabelList dataKey="Inv.$" position="top" fontSize={10} /></Bar><Line yAxisId="cpl" dataKey="CPL" stroke={C.orange} strokeWidth={2} /></ComposedChart></ChartCard>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ChartCard title="Leads por hora del día" accent={C.cyan} height={250}><BarChart data={hours}>{grid}<XAxis dataKey="hora" fontSize={11} /><YAxis fontSize={11} />{tooltip}<Bar dataKey="Leads" fill={C.blue}><LabelList dataKey="Leads" position="top" fontSize={10} /></Bar></BarChart></ChartCard>
      <ChartCard title="Soporte ATC por hora" accent={C.red} height={250}><BarChart data={hours}>{grid}<XAxis dataKey="hora" fontSize={11} /><YAxis fontSize={11} />{tooltip}<Bar dataKey="ATC" fill={C.red}><LabelList dataKey="ATC" position="top" fontSize={10} /></Bar></BarChart></ChartCard>
    </div>
    <Heatmap rows={extra?.heatmap || []} />
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <ChartCard title="Embudo de conversión" accent={C.green} height={250}><BarChart data={funnel} layout="vertical" margin={{ right: 35, left: 10 }}>{grid}<XAxis type="number" fontSize={11} /><YAxis type="category" dataKey="step" width={92} fontSize={11} />{tooltip}<Bar dataKey="count" name="Total"><LabelList dataKey="count" position="right" fontSize={10} />{funnel.map((_, i) => <Cell key={i} fill={palette[i]} />)}</Bar></BarChart></ChartCard>
      <ChartCard title="Ciclo de venta" accent={C.orange} height={250}><BarChart data={cycle}>{grid}<XAxis dataKey="bucket" fontSize={11} /><YAxis fontSize={11} />{tooltip}<Bar dataKey="cantidad" name="Ventas" fill={C.orange}><LabelList dataKey="cantidad" position="top" fontSize={10} /></Bar></BarChart></ChartCard>
      <ChartCard title="Ranking motivos ATC" accent={C.red} height={250}><BarChart data={motives} layout="vertical" margin={{ left: 30, right: 25 }}>{grid}<XAxis type="number" fontSize={11} /><YAxis type="category" dataKey="motivo" width={110} fontSize={10} />{tooltip}<Bar dataKey="cantidad" name="Leads" fill={C.red}><LabelList dataKey="cantidad" position="right" fontSize={10} /></Bar></BarChart></ChartCard>
    </div>
  </div>;
}
