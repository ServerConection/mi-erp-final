import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";
import { cabecerasSesion } from "../utils/sesion";

const C = { blue: "#1e3a8a", green: "#059669", sky: "#0ea5e9", violet: "#7c3aed", red: "#ef4444", muted: "#64748b", border: "#dbe4f0" };
const n = v => Number(v || 0);
const usd = v => `$${n(v).toLocaleString("es-EC", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
const pct = (a, b) => b ? `${(100 * n(a) / n(b)).toFixed(1)}%` : "—";
const base = import.meta.env.VITE_API_URL;
const url = (path, params) => `${base}/api/redes-velsa/${path}?${params}`;
const query = (filtro, canalesSel) => { const p = new URLSearchParams({ fechaDesde: filtro.desde, fechaHasta: filtro.hasta }); if (canalesSel.length) p.set("canales", canalesSel.join(",")); return p.toString(); };

function Panel({ title, sub, children }) {
  return <section className="bg-white border rounded-2xl shadow-sm overflow-hidden" style={{ borderColor: C.border }}>
    <div className="px-5 py-4 border-b" style={{ borderColor: C.border }}><h2 className="text-[11px] font-black uppercase tracking-widest" style={{ color: C.blue }}>{title}</h2>{sub && <p className="text-[11px]" style={{ color: C.muted }}>{sub}</p>}</div>
    <div className="p-5">{children}</div>
  </section>;
}

function Stat({ label, value, color = C.blue, sub }) {
  return <div className="rounded-2xl border p-4" style={{ background: `${color}0b`, borderColor: `${color}30` }}><p className="text-[11px] font-black uppercase" style={{ color }}>{label}</p><b className="text-xl" style={{ color }}>{value}</b>{sub && <p className="text-[11px]" style={{ color: C.muted }}>{sub}</p>}</div>;
}

function RankingTable({ rows, columns }) {
  return <div className="overflow-auto"><table className="w-full text-xs whitespace-nowrap"><thead><tr>{columns.map(c => <th key={c.label} className="px-3 py-2 border-b text-left uppercase" style={{ color: C.muted, borderColor: C.border }}>{c.label}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={`${i}-${r.agencia || r.asesor || r.fecha}`} className="hover:bg-slate-50">{columns.map(c => <td key={c.label} className="px-3 py-2 border-b" style={{ borderColor: C.border, color: c.color || C.blue }}>{c.format ? c.format(r) : r[c.key]}</td>)}</tr>)}</tbody></table></div>;
}

function AdvisorView({ filtro, canalesSel, porCanal }) {
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(url("asesores-vs-pauta", query(filtro, canalesSel)), { headers: cabecerasSesion(), signal: controller.signal })
      .then(r => r.json()).then(d => { if (!d.success) throw new Error(d.message); setRows(d.asesores || []); })
      .catch(e => { if (e.name !== "AbortError") setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filtro, canalesSel]);
  const byAgency = useMemo(() => Object.fromEntries(porCanal.map(r => [r.canal_publicidad, r])), [porCanal]);
  const display = rows.map(r => { const a = byAgency[r.agencia] || {}; const leads = n(r.n_leads), agencyLeads = n(a.n_leads); const assignedSpend = agencyLeads ? n(a.inversion) * leads / agencyLeads : 0; return { ...r, n_leads: leads, gestionables: n(r.gestionables), venta_subida: n(r.venta_subida), atc: n(r.atc), assignedSpend }; });
  if (loading) return <p>Cargando asesores…</p>; if (error) return <p className="text-red-600">{error}</p>;
  return <div className="space-y-6">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Stat label="Asesores" value={new Set(rows.map(r => r.asesor)).size} /><Stat label="Leads asignados" value={display.reduce((s, r) => s + r.n_leads, 0)} /><Stat label="Ventas subidas" value={display.reduce((s, r) => s + r.venta_subida, 0)} color={C.green} /><Stat label="Inversión" value={usd(porCanal.reduce((s, r) => s + n(r.inversion), 0))} color={C.violet} /></div>
    <Panel title="Asesores vs pauta" sub="La inversión por asesor se reparte proporcionalmente a sus leads dentro de la agencia; el gasto real se registra por agencia."><RankingTable rows={display} columns={[
      { label: "Asesor", key: "asesor" }, { label: "Agencia", key: "agencia" }, { label: "Leads", key: "n_leads" }, { label: "Negoc.", key: "gestionables" }, { label: "ATC", key: "atc", color: C.red }, { label: "Ventas", key: "venta_subida", color: C.green },
      { label: "Efectividad", format: r => pct(r.venta_subida, r.gestionables) }, { label: "Pauta atribuida", format: r => usd(r.assignedSpend) }, { label: "Costo por venta", format: r => r.venta_subida ? usd(r.assignedSpend / r.venta_subida) : "—" },
    ]} /></Panel>
    <Panel title="Ranking de ventas por asesor"><ResponsiveContainer width="100%" height={350}><BarChart data={display.slice(0, 15)} margin={{ bottom: 65 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="asesor" fontSize={10} angle={-45} textAnchor="end" interval={0} /><YAxis fontSize={11} /><Tooltip /><Legend /><Bar dataKey="n_leads" name="Leads" fill={C.blue} /><Bar dataKey="venta_subida" name="Ventas" fill={C.green} /></BarChart></ResponsiveContainer></Panel>
  </div>;
}

function MetasView({ filtro, canalesSel, refresh }) {
  const [rows, setRows] = useState([]), [mes, setMes] = useState(""), [error, setError] = useState(""), [saving, setSaving] = useState("");
  useEffect(() => { const controller = new AbortController(); fetch(url("metas", query(filtro, canalesSel)), { headers: cabecerasSesion(), signal: controller.signal }).then(r => r.json()).then(d => { if (!d.success) throw new Error(d.message); setRows(d.agencias || []); setMes(d.mes); }).catch(e => { if (e.name !== "AbortError") setError(e.message); }); return () => controller.abort(); }, [filtro, canalesSel, refresh]);
  const change = (agency, key, value) => setRows(old => old.map(r => r.agencia === agency ? { ...r, [key]: value } : r));
  const save = async r => { setSaving(r.agencia); setError(""); try { const response = await fetch(url("metas", ""), { method: "POST", headers: { "Content-Type": "application/json", ...cabecerasSesion() }, body: JSON.stringify({ mes, agencia: r.agencia, meta_leads: n(r.meta_leads), meta_ventas: n(r.meta_ventas), meta_inversion: n(r.meta_inversion) }) }); const data = await response.json(); if (!data.success) throw new Error(data.message); } catch (e) { setError(e.message); } finally { setSaving(""); } };
  return <div className="space-y-6">
    {error && <p className="text-red-600">{error}</p>}
    <Panel title="Metas vs logros" sub={`Objetivos mensuales editables de VELSA · ${mes || filtro.desde.slice(0, 7)} · logros del período aplicado`}>
      <div className="overflow-auto"><table className="w-full text-xs whitespace-nowrap"><thead><tr>{["Agencia", "Leads", "Meta leads", "Cumplimiento", "Ventas", "Meta ventas", "Cumplimiento", "Inversión", "Meta inversión", "Guardar"].map((h, i) => <th key={`${h}-${i}`} className="p-2 border-b text-left" style={{ borderColor: C.border }}>{h}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.agencia}>
        <td className="p-2 border-b font-bold">{r.agencia}</td><td className="p-2 border-b">{n(r.n_leads)}</td><td className="p-2 border-b"><input aria-label={`Meta leads ${r.agencia}`} type="number" min="0" className="border rounded px-2 py-1 w-20" value={r.meta_leads} onChange={e => change(r.agencia, "meta_leads", e.target.value)} /></td><td className="p-2 border-b" style={{ color: C.green }}>{pct(r.n_leads, r.meta_leads)}</td>
        <td className="p-2 border-b">{n(r.venta_subida)}</td><td className="p-2 border-b"><input aria-label={`Meta ventas ${r.agencia}`} type="number" min="0" className="border rounded px-2 py-1 w-20" value={r.meta_ventas} onChange={e => change(r.agencia, "meta_ventas", e.target.value)} /></td><td className="p-2 border-b" style={{ color: C.green }}>{pct(r.venta_subida, r.meta_ventas)}</td>
        <td className="p-2 border-b">{usd(r.inversion)}</td><td className="p-2 border-b"><input aria-label={`Meta inversión ${r.agencia}`} type="number" min="0" step="0.01" className="border rounded px-2 py-1 w-24" value={r.meta_inversion} onChange={e => change(r.agencia, "meta_inversion", e.target.value)} /></td><td className="p-2 border-b"><button disabled={saving === r.agencia} className="bg-blue-900 text-white px-3 py-1 rounded disabled:opacity-50" onClick={() => save(r)}>{saving === r.agencia ? "Guardando" : "Guardar"}</button></td>
      </tr>)}</tbody></table></div>
    </Panel>
    <Panel title="Logros por agencia"><ResponsiveContainer width="100%" height={330}><BarChart data={rows} margin={{ bottom: 30 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="agencia" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend /><Bar dataKey="n_leads" name="Leads" fill={C.blue} /><Bar dataKey="meta_leads" name="Meta leads" fill={C.sky} /><Bar dataKey="venta_subida" name="Ventas" fill={C.green} /><Bar dataKey="meta_ventas" name="Meta ventas" fill={C.violet} /></BarChart></ResponsiveContainer></Panel>
  </div>;
}

function previousRange(filtro) { const start = new Date(`${filtro.desde}T12:00:00Z`), end = new Date(`${filtro.hasta}T12:00:00Z`), days = Math.round((end - start) / 86400000) + 1; const oldEnd = new Date(start.getTime() - 86400000), oldStart = new Date(oldEnd.getTime() - (days - 1) * 86400000); return { desde: oldStart.toISOString().slice(0, 10), hasta: oldEnd.toISOString().slice(0, 10) }; }
function ComparativoView({ filtro, canalesSel, totales, tendencia }) {
  const prev = useMemo(() => previousRange(filtro), [filtro]);
  const [old, setOld] = useState(null), [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); fetch(url("monitoreo", query(prev, canalesSel)), { headers: cabecerasSesion(), signal: controller.signal }).then(r => r.json()).then(d => { if (!d.success) throw new Error(d.message); setOld(d.totales); }).catch(e => { if (e.name !== "AbortError") setError(e.message); }); return () => controller.abort(); }, [prev, canalesSel]);
  const metrics = [["Leads", "n_leads"], ["Negociables", "gestionables"], ["ATC", "atc"], ["Ventas", "venta_subida"], ["Descartados", "descartados"], ["Inversión", "inversion_total"]];
  const chart = metrics.map(([nombre, key]) => ({ nombre, anterior: n(old?.[key]), actual: n(totales?.[key]) }));
  return <div className="space-y-6">{error && <p className="text-red-600">{error}</p>}
    <Panel title="Comparativo de períodos" sub={`${prev.desde} → ${prev.hasta} frente a ${filtro.desde} → ${filtro.hasta} · igual cantidad de días`}><RankingTable rows={chart} columns={[{ label: "Métrica", key: "nombre" }, { label: "Anterior", format: r => r.nombre === "Inversión" ? usd(r.anterior) : r.anterior }, { label: "Actual", format: r => r.nombre === "Inversión" ? usd(r.actual) : r.actual }, { label: "Cambio", format: r => r.anterior ? `${((r.actual - r.anterior) / r.anterior * 100).toFixed(1)}%` : "—" }]} /></Panel>
    <Panel title="Anterior vs actual"><ResponsiveContainer width="100%" height={320}><BarChart data={chart.filter(r => r.nombre !== "Inversión")}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="nombre" /><YAxis /><Tooltip /><Legend /><Bar dataKey="anterior" fill={C.sky} /><Bar dataKey="actual" fill={C.blue} /></BarChart></ResponsiveContainer></Panel>
    <Panel title="Tendencia del período actual"><ResponsiveContainer width="100%" height={300}><LineChart data={tendencia}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="fecha" fontSize={10} /><YAxis /><Tooltip /><Legend /><Line dataKey="n_leads" name="Leads" stroke={C.blue} /><Line dataKey="venta_subida" name="Ventas" stroke={C.green} /></LineChart></ResponsiveContainer></Panel>
  </div>;
}

function PautasView({ porCanal, tendencia, diario }) {
  const analysis = porCanal.map(r => ({ ...r, leads: n(r.n_leads), ventas: n(r.venta_subida), inversion: n(r.inversion), cpl: r.cpl == null ? null : n(r.cpl), cpa: r.costo_venta == null ? null : n(r.costo_venta) })).sort((a, b) => b.inversion - a.inversion);
  const invested = analysis.reduce((s, r) => s + r.inversion, 0), leads = analysis.reduce((s, r) => s + r.leads, 0), ventas = analysis.reduce((s, r) => s + r.ventas, 0);
  return <div className="space-y-6">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Stat label="Inversión" value={usd(invested)} color={C.violet} /><Stat label="CPL global" value={leads ? usd(invested / leads) : "—"} /><Stat label="Costo por venta" value={ventas ? usd(invested / ventas) : "—"} color={C.green} /><Stat label="Ventas" value={ventas} color={C.green} /></div>
    <Panel title="Análisis de pauta por agencia" sub="Inversión, costo por lead y costo por venta calculados sobre el período aplicado"><RankingTable rows={analysis} columns={[{ label: "Agencia", key: "canal_publicidad" }, { label: "Inversión", format: r => usd(r.inversion), color: C.violet }, { label: "Participación", format: r => pct(r.inversion, invested) }, { label: "Leads", key: "leads" }, { label: "Ventas", key: "ventas", color: C.green }, { label: "CPL", format: r => r.cpl == null ? "—" : usd(r.cpl) }, { label: "Costo por venta", format: r => r.cpa == null ? "—" : usd(r.cpa) }, { label: "Efectividad", format: r => pct(r.ventas, r.gestionables) }]} /></Panel>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5"><Panel title="Inversión vs resultados"><ResponsiveContainer width="100%" height={330}><BarChart data={analysis} margin={{ bottom: 35 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="canal_publicidad" fontSize={10} angle={-30} textAnchor="end" interval={0} /><YAxis /><Tooltip /><Legend /><Bar dataKey="inversion" name="Inversión" fill={C.violet} /><Bar dataKey="leads" name="Leads" fill={C.blue} /><Bar dataKey="ventas" name="Ventas" fill={C.green} /></BarChart></ResponsiveContainer></Panel>
      <Panel title="Pauta diaria"><ResponsiveContainer width="100%" height={330}><LineChart data={tendencia}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="fecha" fontSize={10} /><YAxis /><Tooltip /><Legend /><Line dataKey="inversion" name="Inversión" stroke={C.violet} /><Line dataKey="n_leads" name="Leads" stroke={C.blue} /><Line dataKey="venta_subida" name="Ventas" stroke={C.green} /></LineChart></ResponsiveContainer></Panel></div>
    <Panel title="Detalle por canal y día"><RankingTable rows={diario} columns={[{ label: "Fecha", format: r => String(r.fecha).slice(0, 10) }, { label: "Agencia", key: "canal_publicidad" }, { label: "Leads", key: "n_leads" }, { label: "Ventas", key: "venta_subida" }, { label: "Inversión", format: r => usd(r.inversion) }, { label: "CPL", format: r => r.cpl == null ? "—" : usd(r.cpl) }]} /></Panel>
  </div>;
}

export default function RedesVelsaAnalytics({ mode, filtro, canalesSel, porCanal, totales, tendencia, diario, refreshTick }) {
  if (mode === "asesorvpauta") return <AdvisorView filtro={filtro} canalesSel={canalesSel} porCanal={porCanal} />;
  if (mode === "metas") return <MetasView filtro={filtro} canalesSel={canalesSel} refresh={refreshTick} />;
  if (mode === "comparativo") return <ComparativoView filtro={filtro} canalesSel={canalesSel} totales={totales} tendencia={tendencia} />;
  return <PautasView porCanal={porCanal} tendencia={tendencia} diario={diario} />;
}
