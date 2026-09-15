import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Radar, RadarChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "./ChartFrame";
import { cabecerasSesion } from "../utils/sesion";

const C = { blue: "#1e3a8a", green: "#059669", sky: "#0ea5e9", red: "#ef4444", violet: "#7c3aed", orange: "#f59e0b", muted: "#64748b", border: "#e2e8f0" };
const n = v => Number(v || 0);
const usd = v => `$${n(v).toFixed(2)}`;
const percent = (a, b) => b ? (100 * n(a) / n(b)) : 0;
const palette = [C.green, C.sky, C.blue, C.orange, C.violet, C.red];

function Score(r) {
  const leads = n(r.n_leads), neg = n(r.gestionables), sales = n(r.venta_subida), atc = n(r.atc), jot = n(r.ingreso_jot);
  if (!leads) return 0;
  return Math.round(25 * Math.min(1, neg / leads) + 35 * Math.min(1, neg ? (sales / neg) / .2 : 0) + 25 * (1 - Math.min(1, atc / leads)) + 15 * Math.min(1, (jot / leads) / .15));
}

function Kpi({ title, value, sub, color, icon }) {
  return <div className="rounded-2xl border px-4 py-4" style={{ borderColor: `${color}30`, background: `linear-gradient(135deg,${color}0f,#fff)` }}><div className="text-xl mb-2">{icon}</div><p className="text-[11px] font-black uppercase tracking-widest" style={{ color }}>{title}</p><b className="text-xl" style={{ color }}>{value}</b><p className="text-[11px]" style={{ color: C.muted }}>{sub}</p></div>;
}

export default function RedesVelsaAsesores({ filtro, canalesSel, porCanal }) {
  const [rows, setRows] = useState([]), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [advisor, setAdvisor] = useState(""), [view, setView] = useState("campana");
  useEffect(() => {
    const controller = new AbortController(); const p = new URLSearchParams({ fechaDesde: filtro.desde, fechaHasta: filtro.hasta });
    if (canalesSel.length) p.set("canales", canalesSel.join(","));
    fetch(`${import.meta.env.VITE_API_URL}/api/redes-velsa/asesores-vs-pauta?${p}`, { headers: cabecerasSesion(), signal: controller.signal })
      .then(r => r.json()).then(d => { if (!d.success) throw new Error(d.message); setRows(d.asesores || []); setError(""); setLoading(false); })
      .catch(e => { if (e.name !== "AbortError") { setError(e.message); setLoading(false); } });
    return () => controller.abort();
  }, [filtro, canalesSel]);

  const agencyMap = useMemo(() => Object.fromEntries(porCanal.map(a => [a.canal_publicidad, a])), [porCanal]);
  const data = useMemo(() => rows.map(r => {
    const agency = agencyMap[r.agencia] || {}, leads = n(r.n_leads), spend = n(agency.n_leads) ? n(agency.inversion) * leads / n(agency.n_leads) : 0;
    const sales = n(r.venta_subida), jot = n(r.ingreso_jot), neg = n(r.gestionables);
    return { ...r, n_leads: leads, gestionables: neg, venta_subida: sales, ingreso_jot: jot, activos: n(r.activos), atc: n(r.atc), spend,
      score: Score(r), effect: percent(sales, neg), atcPct: percent(r.atc, leads), cpl: leads ? spend / leads : 0,
      cpa: jot ? spend / jot : 0, saleCost: sales ? spend / sales : 0 };
  }), [rows, agencyMap]);
  const selected = advisor ? data.filter(r => r.asesor === advisor) : data;
  const names = [...new Set(data.map(r => r.asesor))].sort();
  const totalLeads = selected.reduce((s, r) => s + r.n_leads, 0), totalJot = selected.reduce((s, r) => s + r.ingreso_jot, 0);
  const totalAtc = selected.reduce((s, r) => s + r.atc, 0), totalSpend = selected.reduce((s, r) => s + r.spend, 0);
  const avgScore = selected.length ? Math.round(selected.reduce((s, r) => s + r.score, 0) / selected.length) : 0;
  const winner = [...selected].sort((a, b) => b.score - a.score)[0];
  const campaigns = [...new Set(selected.map(r => r.agencia))];
  const grouped = campaigns.map(a => {
    const all = selected.filter(r => r.agencia === a);
    return { agencia: a, advisors: all.length, leads: all.reduce((s, r) => s + r.n_leads, 0), jot: all.reduce((s, r) => s + r.ingreso_jot, 0), sales: all.reduce((s, r) => s + r.venta_subida, 0), spend: all.reduce((s, r) => s + r.spend, 0), avgScore: all.length ? Math.round(all.reduce((s, r) => s + r.score, 0) / all.length) : 0 };
  });
  const views = [["campana", "Por campaña"], ["costo", "Costo vs efect."], ["invjot", "Inv. vs JOT"], ["total", "Costo total"], ["scorecpl", "Score vs CPL"], ["ranking", "Ranking"], ["radar", "Radar"], ["calor", "Mapa calor"]];
  if (loading && !rows.length) return <p className="py-20 text-center">Cargando asesores…</p>;
  if (error) return <p className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">{error}</p>;
  return <div className="space-y-6">
    <div className="rounded-3xl px-7 py-6 text-white flex flex-wrap justify-between items-center gap-4 shadow-xl" style={{ background: `linear-gradient(115deg,#172238,${C.blue},#30338a)` }}><div><h2 className="text-[14px] font-black uppercase tracking-widest">⚡ Asesores vs campaña <span className="text-[11px] bg-white/15 rounded-full px-3 py-1 ml-2">{names.length} asesores · {campaigns.length} canales</span></h2><p className="text-[11px] text-slate-300 mt-2">Conversión, JOT, costo atribuido y score operativo por asesor.</p><p className="text-[11px] text-slate-400 mt-1">La inversión se atribuye proporcionalmente a los leads de cada agencia.</p></div>{winner && <div className="rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-[11px]"><span>🏆 Mejor score</span><div className="font-black text-emerald-300">{winner.asesor} — {winner.score} pts</div></div>}</div>
    <div className="bg-white border rounded-2xl p-4" style={{ borderColor: C.border }}><label className="text-[11px] font-black uppercase mr-3" style={{ color: C.muted }}>Asesor:</label><select value={advisor} onChange={e => setAdvisor(e.target.value)} className="border rounded-xl px-3 py-2 text-xs min-w-56" style={{ borderColor: C.border }}><option value="">Todos los asesores</option>{names.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3"><Kpi title="Total leads" value={totalLeads} sub={`${names.length} asesores activos`} color={C.blue} icon="👥" /><Kpi title="JOT logrados" value={totalJot} sub={`${percent(totalJot, totalLeads).toFixed(1)}% efectividad`} color={C.green} icon="✅" /><Kpi title="% ATC promedio" value={`${percent(totalAtc, totalLeads).toFixed(1)}%`} sub={`${totalAtc} leads ATC`} color={C.red} icon="⚠️" /><Kpi title="Score promedio" value={avgScore} sub="0–100" color={C.orange} icon="⭐" /><Kpi title="Inversión pauta" value={usd(totalSpend)} sub={`${campaigns.length} canales`} color={C.violet} icon="💰" /><Kpi title="CPA promedio" value={totalJot ? usd(totalSpend / totalJot) : "—"} sub="Gasto atribuido / JOT" color={C.orange} icon="🧮" /></div>
    <div className="bg-white rounded-2xl border p-1 flex flex-wrap gap-1 w-fit" style={{ borderColor: C.border }}>{views.map(([id, label]) => <button key={id} onClick={() => setView(id)} className="px-4 py-2 text-[11px] font-black uppercase rounded-xl" style={view === id ? { background: C.blue, color: "#fff" } : { color: C.muted }}>{label}</button>)}</div>
    {view === "campana" && <div className="space-y-5">{grouped.map((g, i) => { const advisors = selected.filter(r => r.agencia === g.agencia).sort((a, b) => b.score - a.score); return <div key={g.agencia} className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: C.border }}><div className="p-5 flex flex-wrap justify-between gap-3" style={{ background: `${palette[i % palette.length]}12` }}><div><b className="text-sm" style={{ color: palette[i % palette.length] }}>{g.agencia}</b><p className="text-[11px]" style={{ color: C.muted }}>{g.advisors} asesores · {g.leads} leads · {g.jot} JOT</p></div><div className="text-[11px]">CPL canal <b>{g.leads ? usd(g.spend / g.leads) : "—"}</b> · Inversión <b>{usd(g.spend)}</b> · Score medio <b>{g.avgScore}</b></div></div><div className="p-5"><ChartCard title={`Score de asesores · ${g.agencia}`} accent={palette[i % palette.length]} height={Math.max(220, advisors.length * 26)}><BarChart data={advisors} layout="vertical" margin={{ left: 65, right: 35 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" domain={[0, 100]} /><YAxis type="category" dataKey="asesor" width={150} fontSize={10} /><Tooltip /><Bar dataKey="score" name="Score" fill={palette[i % palette.length]}><LabelList dataKey="score" position="right" fontSize={10} /></Bar></BarChart></ChartCard></div></div>; })}</div>}
    {view === "costo" && <ChartCard title="Costo atribuido vs efectividad CRM" subtitle="Cada punto representa un asesor dentro de una agencia" height={360}><ScatterChart><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" dataKey="saleCost" name="Costo por venta" unit="$" /><YAxis type="number" dataKey="effect" name="Efectividad" unit="%" /><Tooltip cursor={{ strokeDasharray: "3 3" }} /><Scatter name="Asesores" data={selected} fill={C.green} /></ScatterChart></ChartCard>}
    {view === "invjot" && <ChartCard title="Inversión atribuida vs ingresos JOT" height={350}><BarChart data={selected.slice(0, 25)} margin={{ bottom: 70 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="asesor" angle={-45} textAnchor="end" interval={0} fontSize={10} /><YAxis /><Tooltip /><Legend /><Bar dataKey="spend" name="Inversión" fill={C.violet} /><Bar dataKey="ingreso_jot" name="JOT" fill={C.green} /></BarChart></ChartCard>}
    {view === "total" && <ChartCard title="Costo atribuido por asesor" height={350}><BarChart data={selected.slice(0, 25)} margin={{ bottom: 70 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="asesor" angle={-45} textAnchor="end" interval={0} fontSize={10} /><YAxis /><Tooltip /><Legend /><Bar dataKey="spend" name="Gasto atribuido" fill={C.violet} /><Bar dataKey="cpa" name="Costo por JOT" fill={C.orange} /></BarChart></ChartCard>}
    {view === "scorecpl" && <ChartCard title="Score vs CPL atribuido" height={360}><ScatterChart><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" dataKey="cpl" name="CPL" unit="$" /><YAxis type="number" dataKey="score" name="Score" domain={[0, 100]} /><Tooltip cursor={{ strokeDasharray: "3 3" }} /><Scatter name="Asesores" data={selected} fill={C.blue} /></ScatterChart></ChartCard>}
    {view === "ranking" && <div className="bg-white border rounded-2xl p-5 overflow-auto" style={{ borderColor: C.border }}><h3 className="text-xs font-black uppercase mb-4" style={{ color: C.blue }}>Ranking de asesores</h3><table className="w-full text-xs whitespace-nowrap"><thead><tr>{["#", "Asesor", "Agencia", "Leads", "Negoc.", "Ventas", "JOT", "ATC", "Score", "CPL", "CPA JOT"].map(h => <th key={h} className="p-2 border-b text-left">{h}</th>)}</tr></thead><tbody>{[...selected].sort((a, b) => b.score - a.score).map((r, i) => <tr key={`${r.asesor}-${r.agencia}`}><td className="p-2 border-b">{i + 1}</td><td className="p-2 border-b font-bold">{r.asesor}</td><td className="p-2 border-b">{r.agencia}</td><td className="p-2 border-b">{r.n_leads}</td><td className="p-2 border-b">{r.gestionables}</td><td className="p-2 border-b">{r.venta_subida}</td><td className="p-2 border-b">{r.ingreso_jot}</td><td className="p-2 border-b">{r.atc}</td><td className="p-2 border-b font-bold text-blue-900">{r.score}</td><td className="p-2 border-b">{usd(r.cpl)}</td><td className="p-2 border-b">{r.ingreso_jot ? usd(r.cpa) : "—"}</td></tr>)}</tbody></table></div>}
    {view === "radar" && <ChartCard title="Radar de rendimiento" subtitle="Promedios normalizados de los asesores seleccionados" height={380}><RadarChart data={[{ axis: "Calidad", value: selected.length ? selected.reduce((s, r) => s + percent(r.gestionables, r.n_leads), 0) / selected.length : 0 }, { axis: "Ventas", value: selected.length ? selected.reduce((s, r) => s + Math.min(100, r.effect * 5), 0) / selected.length : 0 }, { axis: "JOT", value: selected.length ? selected.reduce((s, r) => s + Math.min(100, percent(r.ingreso_jot, r.n_leads) * 6.67), 0) / selected.length : 0 }, { axis: "ATC inverso", value: selected.length ? selected.reduce((s, r) => s + (100 - r.atcPct), 0) / selected.length : 0 }, { axis: "Score", value: avgScore }]}><PolarGrid /><PolarAngleAxis dataKey="axis" /><PolarRadiusAxis domain={[0, 100]} /><Radar name="Rendimiento" dataKey="value" stroke={C.blue} fill={C.sky} fillOpacity={.5} /><Tooltip /></RadarChart></ChartCard>}
    {view === "calor" && <div className="bg-white border rounded-2xl p-5 overflow-auto" style={{ borderColor: C.border }}><h3 className="text-xs font-black uppercase mb-4" style={{ color: C.blue }}>Mapa de calor — score por asesor y campaña</h3><div className="inline-grid gap-1.5" style={{ gridTemplateColumns: `170px repeat(${Math.max(1, campaigns.length)},80px)` }}><span />{campaigns.map(a => <b key={a} className="text-[11px] text-center">{a}</b>)}{names.map(a => <div key={a} className="contents"><span className="text-[11px] truncate" title={a}>{a}</span>{campaigns.map(c => { const r = selected.find(x => x.asesor === a && x.agencia === c); return <div key={`${a}-${c}`} className="h-8 rounded-lg grid place-items-center text-[11px] font-black" style={{ background: r ? r.score > 70 ? C.green : r.score > 45 ? C.sky : "#dbeafe" : "#f1f5f9", color: r?.score > 45 ? "white" : C.blue }}>{r?.score || ""}</div>; })}</div>)}</div></div>}
  </div>;
}
