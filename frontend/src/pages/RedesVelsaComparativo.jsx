import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "./ChartFrame";
import { cabecerasSesion } from "../utils/sesion";

const BLUE = "#1e3a8a", PALE = "#aab8d7", GREEN = "#059669", RED = "#ef4444";
const n = v => Number(v || 0);
const day = d => d.toISOString().slice(0, 10);
const range = (year, month, from, to) => ({ desde: day(new Date(Date.UTC(year, month, from))), hasta: day(new Date(Date.UTC(year, month, to))) });
const fields = [
  ["n_leads", "👥 Leads", false], ["efectividad", "✅ Efectividad %", false], ["pct_atc", "📞 % ATC", true],
  ["venta_subida", "📈 Ventas subidas", false], ["cpl_promedio", "💸 CPL $", true], ["inversion_total", "💰 Inversión $", true],
];
const value = (t, key) => key === "efectividad" ? (n(t.gestionables) ? 100 * n(t.venta_subida) / n(t.gestionables) : 0) : n(t[key]);
const show = (v, key) => key.includes("inversion") || key.includes("cpl") ? `$${n(v).toFixed(2)}` : key.includes("pct") || key === "efectividad" ? `${n(v).toFixed(1)}%` : n(v).toLocaleString("es-EC");

export default function RedesVelsaComparativo({ filtro, canalesSel }) {
  const [mode, setMode] = useState("weeks"), [metric, setMetric] = useState("n_leads"), [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const anchor = filtro.hasta.slice(0, 7);
  const periods = useMemo(() => {
    const [year, month] = anchor.split("-").map(Number);
    if (mode === "weeks") {
      const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
      return [[1, 5], [6, 12], [13, 19], [20, 26], [27, days]].map(([a, b], i) => ({ ...range(year, month - 1, a, b), label: `Sem ${i + 1}`, sub: `${a}/${month} – ${b}/${month}` }));
    }
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(Date.UTC(year, month - 1 - (5 - i), 1));
      return { ...range(d.getUTCFullYear(), d.getUTCMonth(), 1, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()), label: d.toLocaleDateString("es-EC", { month: "short", year: "numeric", timeZone: "UTC" }), sub: day(d).slice(0, 7) };
    });
  }, [anchor, mode]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(periods.map(async p => {
      const query = new URLSearchParams({ fechaDesde: p.desde, fechaHasta: p.hasta });
      if (canalesSel.length) query.set("canales", canalesSel.join(","));
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/redes-velsa/monitoreo?${query}`, { headers: cabecerasSesion(), signal: controller.signal });
      const body = await response.json(); if (!response.ok || !body.success) throw new Error(body.message || "No se pudo cargar el comparativo");
      return { ...p, ...body.totales };
    })).then(data => { if (!controller.signal.aborted) { setRows(data); setLoading(false); } })
      .catch(e => { if (e.name !== "AbortError") { setError(e.message); setLoading(false); } });
    return () => controller.abort();
  }, [periods, canalesSel]);

  const currentIndex = mode === "weeks" ? periods.findIndex(p => filtro.hasta >= p.desde && filtro.hasta <= p.hasta) : periods.length - 1;
  const current = rows[currentIndex], previous = rows[currentIndex - 1];
  const selected = fields.find(f => f[0] === metric);
  const radar = fields.map(([key, label, inverse]) => {
    const values = rows.map(r => value(r, key)), top = Math.max(...values, 1);
    const normalized = v => inverse ? Math.max(0, 100 - v / top * 100) : v / top * 100;
    return { axis: label.replace(/^[^\w%]+/u, ""), actual: normalized(value(current || {}, key)), anterior: normalized(value(previous || {}, key)) };
  });
  return <div className="space-y-5">
    <div className="rounded-2xl border border-blue-200 bg-blue-50 px-6 py-5 flex flex-wrap justify-between gap-3"><div><h2 className="font-black text-blue-950 uppercase text-sm">📊 Comparativo inteligente <span className="ml-2 text-[11px] bg-blue-100 rounded-full px-2 py-1">{anchor}</span></h2><p className="text-xs text-slate-600 mt-1">Semanas del mismo mes e histórico mensual de VELSA; cifras del CRM e inversión registrada.</p></div><span className="text-[11px] text-slate-600">ATC y CPL: menor valor indica mejor resultado</span></div>
    <div className="inline-flex p-1 border rounded-xl bg-white gap-1"><button onClick={() => { setLoading(true); setError(""); setMode("weeks"); }} className={`px-4 py-2 text-xs font-black rounded-lg ${mode === "weeks" ? "bg-blue-900 text-white" : "text-slate-600"}`}>▦ Semanas del mes</button><button onClick={() => { setLoading(true); setError(""); setMode("months"); }} className={`px-4 py-2 text-xs font-black rounded-lg ${mode === "months" ? "bg-blue-900 text-white" : "text-slate-600"}`}>▦ Histórico meses</button></div>
    {error && <p className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-700">{error}</p>}
    {loading ? <p className="py-16 text-center text-slate-500">Cargando períodos…</p> : <>
      <p className="text-[11px] font-black uppercase tracking-widest text-blue-950">{current?.label} ({current?.sub}) vs período anterior ({previous?.sub || "sin período"})</p>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">{fields.map(([key, label, inverse]) => { const now = value(current || {}, key), old = value(previous || {}, key), change = old ? (now - old) / old * 100 : null; const good = change !== null && (inverse ? change < 0 : change > 0); return <div key={key} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm"><div className="flex justify-between text-[11px] font-black uppercase text-slate-600"><span>{label}</span>{change !== null && <span className={good ? "text-emerald-600" : "text-red-500"}>{change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%</span>}</div><b className="text-lg text-blue-950">{show(now, key)}</b><p className="text-[11px] text-slate-500">Anterior: {previous ? show(old, key) : "—"}</p></div>; })}</div>
      <div className="flex flex-wrap gap-1">{fields.map(([key, label]) => <button key={key} onClick={() => setMetric(key)} className={`px-2 py-1 text-[10px] font-black rounded-full border ${metric === key ? "bg-blue-900 text-white" : "bg-white text-slate-600"}`}>{label}</button>)}</div>
      <ChartCard title={`Comparativo por ${mode === "weeks" ? "semana" : "mes"}`} subtitle="Selecciona una métrica para comparar todos los períodos" height={330}><BarChart data={rows.map((r, i) => ({ ...r, chartValue: value(r, metric), current: i === currentIndex }))}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis /><Tooltip formatter={v => show(v, metric)} /><Bar dataKey="chartValue" name={selected?.[1]} radius={[5, 5, 0, 0]}>{rows.map((_, i) => <Cell key={i} fill={i === currentIndex ? BLUE : PALE} />)}</Bar></BarChart></ChartCard>
      <div className="grid lg:grid-cols-2 gap-5"><ChartCard title="Radar multidimensional" subtitle="Valores normalizados; ATC y CPL invertidos" height={330}><RadarChart data={radar}><PolarGrid /><PolarAngleAxis dataKey="axis" fontSize={10} /><PolarRadiusAxis domain={[0, 100]} /><Radar name="Actual" dataKey="actual" stroke={BLUE} fill={BLUE} fillOpacity={.25} /><Radar name="Anterior" dataKey="anterior" stroke={GREEN} fill={GREEN} fillOpacity={.15} /><Tooltip /></RadarChart></ChartCard><div className="bg-white border border-slate-200 rounded-2xl overflow-auto"><h3 className="p-4 border-b text-xs font-black uppercase text-blue-950">Tabla comparativa de períodos</h3><table className="w-full text-xs whitespace-nowrap"><thead><tr>{["Período", ...fields.map(f => f[1])].map(h => <th key={h} className="p-2 border-b text-left">{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={r.sub} className={i === currentIndex ? "bg-blue-50" : ""}><td className="p-2 border-b font-bold">{r.label} · {r.sub}</td>{fields.map(([key]) => <td key={key} className="p-2 border-b">{show(value(r, key), key)}</td>)}</tr>)}</tbody></table></div></div>
    </>}
  </div>;
}
