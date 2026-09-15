import { useEffect, useMemo, useState } from "react";
import { cabecerasSesion } from "../utils/sesion";

const C = { blue: "#1e3a8a", green: "#059669", red: "#ef4444", violet: "#7c3aed", gray: "#64748b" };
const n = v => Number(v || 0);
const definitions = [
  ["leads_totales", "Leads totales", "count"], ["pct_sac", "% SAC / ATC", "pct"],
  ["pct_calidad", "% Calidad", "pct"], ["pct_ventas", "% Ventas CRM", "pct"],
  ["pct_ventas_jot", "% Ventas JOT", "pct"], ["presupuesto", "Presupuesto $", "usd"],
  ["ctr", "CTR %", "pct"], ["cpl", "CPL $", "usd"], ["cpl_gest", "CPL Gest $", "usd"],
  ["cpa", "CPA Bitrix $", "usd"], ["cpa_jot", "CPA JOT $", "usd"],
];
const lowerBetter = new Set(["pct_sac", "cpl", "cpl_gest", "cpa", "cpa_jot"]);
const format = (v, type) => v == null ? "—" : type === "usd" ? `$${n(v).toFixed(2)}` : type === "pct" ? `${n(v).toFixed(1)}%` : n(v).toLocaleString("es-EC");

function GoalRow({ label, target, actual, type, inverse }) {
  const set = target !== "" && Number.isFinite(Number(target)), reached = set && actual != null;
  const good = reached && (inverse ? n(actual) <= n(target) : n(actual) >= n(target));
  const differential = reached ? n(actual) - n(target) : null;
  const progress = reached && n(target) ? Math.min(100, inverse ? n(actual) ? n(target) / n(actual) * 100 : 100 : n(actual) / n(target) * 100) : null;
  return <tr className="border-b border-slate-100 text-[12px]"><td className="p-3 font-bold text-slate-700">{label}</td><td className="p-3 text-center">{set ? format(target, type) : "—"}</td><td className="p-3 text-center font-bold" style={{ color: reached ? good ? C.green : C.red : C.gray }}>{format(actual, type)}</td><td className="p-3 text-center" style={{ color: good ? C.green : C.red }}>{differential == null ? "—" : `${differential > 0 ? "+" : ""}${format(differential, type)}`}</td><td className="p-3 min-w-28">{progress == null ? "—" : <div className="flex items-center gap-2"><div className="h-2 flex-1 rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ width: `${progress}%`, background: good ? C.green : C.red }} /></div><span>{Math.round(progress)}%</span></div>}</td></tr>;
}

export default function RedesVelsaMetas({ filtro, canalesSel, porCanal }) {
  const [localSel, setLocalSel] = useState(canalesSel), [targets, setTargets] = useState({}), [calculated, setCalculated] = useState(false);
  const [saved, setSaved] = useState([]), [jot, setJot] = useState([]), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const month = filtro.desde.slice(0, 7);
  useEffect(() => {
    const raw = localStorage.getItem(`velsa-redes-metas-global:${month}`);
    try { Promise.resolve().then(() => setTargets(raw ? JSON.parse(raw) : {})); } catch { Promise.resolve().then(() => setTargets({})); }
  }, [month]);
  useEffect(() => {
    const controller = new AbortController(), q = new URLSearchParams({ fechaDesde: filtro.desde, fechaHasta: filtro.hasta });
    Promise.all([fetch(`${import.meta.env.VITE_API_URL}/api/redes-velsa/metas?${q}`, { headers: cabecerasSesion(), signal: controller.signal }).then(r => r.json()),
      fetch(`${import.meta.env.VITE_API_URL}/api/redes-velsa/graficos?${q}`, { headers: cabecerasSesion(), signal: controller.signal }).then(r => r.json())])
      .then(([m, g]) => { if (m.success) setSaved(m.agencias || []); if (g.success) setJot(g.jotPorAgenciaDia || []); })
      .catch(e => { if (e.name !== "AbortError") setMessage(e.message); });
    return () => controller.abort();
  }, [filtro]);
  const jotMap = useMemo(() => jot.reduce((map, r) => { map[r.agencia] = n(map[r.agencia]) + n(r.ingreso_jot); return map; }, {}), [jot]);
  const agencies = porCanal.filter(r => !localSel.length || localSel.includes(r.canal_publicidad));
  const goal = (agency, key) => { const row = saved.find(r => r.agencia === agency), canal = porCanal.find(r => r.canal_publicidad === agency); if (key === "leads_totales" && n(row?.meta_leads)) return row.meta_leads; if (key === "pct_ventas" && n(row?.meta_ventas) && n(canal?.gestionables)) return 100 * n(row.meta_ventas) / n(canal.gestionables); if (key === "presupuesto" && n(row?.meta_inversion)) return row.meta_inversion; return targets[key] ?? ""; };
  const actual = (r, key) => {
    const leads = n(r.n_leads), neg = n(r.gestionables), sales = n(r.venta_subida), atc = n(r.atc), spend = n(r.inversion), jotCount = n(jotMap[r.canal_publicidad]);
    const values = { leads_totales: leads, pct_sac: leads ? atc / leads * 100 : 0, pct_calidad: leads ? neg / leads * 100 : 0,
      pct_ventas: neg ? sales / neg * 100 : 0, pct_ventas_jot: leads ? jotCount / leads * 100 : 0,
      presupuesto: spend, ctr: null, cpl: leads && spend ? spend / leads : null,
      cpl_gest: neg && spend ? spend / neg : null, cpa: sales && spend ? spend / sales : null,
      cpa_jot: jotCount && spend ? spend / jotCount : null };
    return values[key];
  };
  const change = (key, v) => { const next = { ...targets, [key]: v }; setTargets(next); localStorage.setItem(`velsa-redes-metas-global:${month}`, JSON.stringify(next)); };
  const persist = async r => {
    setBusy(true); setMessage("");
    try {
      const body = { mes: `${month}-01`, agencia: r.canal_publicidad, meta_leads: Math.round(n(goal(r.canal_publicidad, "leads_totales"))),
        meta_ventas: targets.pct_ventas === "" || targets.pct_ventas == null ? Math.round(n(saved.find(x => x.agencia === r.canal_publicidad)?.meta_ventas)) : Math.round(n(targets.pct_ventas) * n(r.gestionables) / 100), meta_inversion: n(goal(r.canal_publicidad, "presupuesto")) };
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/redes-velsa/metas`, { method: "POST", headers: { "Content-Type": "application/json", ...cabecerasSesion() }, body: JSON.stringify(body) });
      const data = await response.json(); if (!data.success) throw new Error(data.message);
      setSaved(old => [...old.filter(x => x.agencia !== r.canal_publicidad), { ...r, ...body }]); setMessage(`Metas de ${r.canal_publicidad} guardadas.`);
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  };
  return <div className="space-y-6">
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs font-black uppercase text-blue-900">📅 Período: {filtro.desde} → {filtro.hasta}</div>
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"><div className="p-5 border-b"><h2 className="text-xs font-black uppercase text-blue-900 mb-3">Agencia</h2><div className="flex flex-wrap gap-2"><button onClick={() => setLocalSel([])} className={`rounded-full border px-3 py-1 text-xs font-black ${localSel.length ? "" : "bg-blue-900 text-white"}`}>Todos</button>{porCanal.map(r => <button key={r.canal_publicidad} onClick={() => setLocalSel(old => old.includes(r.canal_publicidad) ? old.filter(x => x !== r.canal_publicidad) : [...old, r.canal_publicidad])} className={`rounded-full border px-3 py-1 text-xs font-black ${localSel.includes(r.canal_publicidad) ? "bg-blue-900 text-white" : ""}`}>{r.canal_publicidad}</button>)}</div></div><div className="p-4 flex justify-end"><button onClick={() => setCalculated(true)} className="bg-blue-900 text-white rounded-lg px-5 py-2 text-xs font-black uppercase">Calcular logros</button></div></div>
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"><div className="p-5 border-b"><h2 className="text-xs font-black uppercase tracking-widest" style={{ color: C.violet }}>Objetivos / Metas</h2><p className="text-xs text-slate-500">Modifica los valores y presiona Calcular Logros. Los objetivos generales se guardan en este navegador; leads y presupuesto por agencia se pueden guardar en Velsa.</p></div><div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">{definitions.map(([key, label, type]) => <label key={key} className="text-[11px] font-black uppercase text-slate-600">{label}<input type="number" min="0" step={type === "count" ? "1" : ".01"} value={targets[key] ?? ""} onChange={e => change(key, e.target.value)} className="block w-full border border-slate-200 rounded-xl p-2 mt-1 text-xs" placeholder={type === "pct" ? "0 %" : type === "usd" ? "$0.00" : "0"} /></label>)}</div></div>
    {message && <p className="text-xs rounded-lg bg-blue-50 p-3 text-blue-900">{message}</p>}
    {calculated ? agencies.map(r => <div key={r.canal_publicidad} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"><div className="p-4 border-b flex justify-between items-center gap-3"><div><h3 className="font-black uppercase text-blue-900 text-sm">{r.canal_publicidad}</h3><p className="text-xs text-slate-500">{n(r.n_leads)} leads · ${n(r.inversion).toFixed(2)} inversión · {n(jotMap[r.canal_publicidad])} ingresos JOT</p></div><button onClick={() => persist(r)} disabled={busy} className="bg-blue-900 text-white px-3 py-2 rounded-lg text-[11px] font-black disabled:opacity-50">Guardar leads y presupuesto</button></div><div className="overflow-auto"><table className="w-full whitespace-nowrap"><thead><tr className="text-[11px] uppercase text-slate-500">{["Indicador", "Objetivo", "Logro", "Diferencial", "Progreso"].map(h => <th key={h} className="p-3 text-left border-b">{h}</th>)}</tr></thead><tbody>{definitions.map(([key, label, type]) => <GoalRow key={key} label={label} type={type} target={goal(r.canal_publicidad, key)} actual={actual(r, key)} inverse={lowerBetter.has(key)} />)}</tbody></table></div></div>) : <p className="text-center py-16 text-slate-500 font-bold">Selecciona agencias y calcula los logros</p>}
  </div>;
}
