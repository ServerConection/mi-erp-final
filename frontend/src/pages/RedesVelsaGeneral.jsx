import { useMemo, useState } from "react";

const colors = { primary: "#1e3a8a", green: "#059669", sky: "#0ea5e9", red: "#ef4444", violet: "#7c3aed", muted: "#64748b", border: "#dbe4f0" };
const num = (v) => Number(v || 0);
const pct = (a, b) => b ? `${(100 * num(a) / num(b)).toFixed(1)}%` : "0.0%";
const money = (v) => `$${num(v).toFixed(2)}`;
const shortDate = (v) => { const [y, m, d] = String(v || "").slice(0, 10).split("-"); return y ? `${d}/${m}` : "—"; };

function Frame({ title, subtitle, extra, children, accent = colors.primary }) {
  return <section className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: colors.border }}>
    <div className="px-5 py-4 border-b flex items-center justify-between gap-3" style={{ borderColor: colors.border }}>
      <div className="flex items-center gap-3"><span className="w-1 h-8 rounded-full" style={{ background: accent }} /><div>
        <h2 className="text-[11px] font-black uppercase tracking-widest" style={{ color: accent }}>{title}</h2>
        {subtitle && <p className="text-[11px]" style={{ color: colors.muted }}>{subtitle}</p>}
      </div></div>{extra}
    </div>{children}
  </section>;
}

function Toggle({ value, onChange, options }) {
  return <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: colors.border }}>{options.map(([id, label]) =>
    <button key={id} onClick={() => onChange(id)} className="px-3 py-1.5 text-[11px] font-black uppercase" style={value === id ? { background: colors.primary, color: "#fff" } : { color: colors.muted }}>{label}</button>
  )}</div>;
}

function AgencyCard({ row, total }) {
  const [open, setOpen] = useState(false);
  const share = total ? Math.min(100, num(row.n_leads) / total * 100) : 0;
  const stats = [["Leads", row.n_leads, colors.primary], ["Negoc.", row.gestionables, colors.green], ["V.Subida", row.venta_subida, colors.sky], ["ATC", row.atc, colors.red]];
  return <div className="rounded-2xl border p-4" style={{ borderColor: `${colors.primary}30`, background: `linear-gradient(135deg,${colors.primary}10,#fff)` }}>
    <button className="w-full flex items-center justify-between text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
      <span className="font-black text-sm" style={{ color: colors.primary }}>{row.canal_publicidad} <span className="text-[11px] rounded-full px-2 py-1" style={{ background: `${colors.primary}12` }}>{share.toFixed(0)}% del total</span></span>
      <span className="rounded-full px-2 py-1" style={{ background: `${colors.primary}12` }}>{open ? "▲" : "▼"}</span>
    </button>
    <p className="text-[11px] mt-1" style={{ color: colors.muted }}>Participación leads <b className="float-right">{num(row.n_leads)} leads</b></p>
    <div className="h-1.5 bg-white rounded-full mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${share}%`, background: colors.primary }} /></div>
    <div className="grid grid-cols-4 gap-1 mt-3">{stats.map(([label, value, color]) => <div key={label} className="text-center border-b pb-1" style={{ borderColor: color }}><b className="text-[11px]" style={{ color }}>{num(value)}</b><div className="text-[10px] uppercase" style={{ color: colors.muted }}>{label}</div></div>)}</div>
    <p className="text-[11px] mt-3" style={{ color: colors.muted }}>Efectividad: <b style={{ color: colors.green }}>{pct(row.venta_subida, row.gestionables)}</b> | ATC: <b style={{ color: colors.red }}>{pct(row.atc, row.n_leads)}</b> | Inv: <b style={{ color: colors.violet }}>{money(row.inversion)}</b> | CPL: <b style={{ color: colors.violet }}>{row.cpl == null ? "—" : money(row.cpl)}</b></p>
    {open && <div className="text-[11px] border-t mt-3 pt-3" style={{ borderColor: colors.border, color: colors.muted }}>Descartados: <b>{num(row.descartados)}</b> · Costo por venta: <b>{row.costo_venta == null ? "—" : money(row.costo_venta)}</b></div>}
  </div>;
}

function MetricTable({ rows }) {
  const [sort, setSort] = useState("canal");
  const columns = [["fecha", "Fecha"], ["canal_publicidad", "Canal"], ["n_leads", "Leads"], ["gestionables", "Negoc."], ["atc", "ATC"], ["fuera_cobertura", "F.Cob."], ["innegociable", "Inneg."], ["venta_subida", "V.Sub."], ["descarte", "Desc."], ["inversion", "Inv.$"], ["cpl", "CPL"], ["pct_atc", "% ATC"], ["pct_venta", "% Vta."]];
  const sorted = useMemo(() => [...rows].sort((a, b) => sort === "canal" ? String(a.canal_publicidad).localeCompare(String(b.canal_publicidad)) || String(a.fecha).localeCompare(String(b.fecha)) : String(a.fecha).localeCompare(String(b.fecha)) || String(a.canal_publicidad).localeCompare(String(b.canal_publicidad))), [rows, sort]);
  return <Frame title="Métricas por canal y día" subtitle="Origen, embudo e inversión agrupados por fecha" extra={<div className="flex items-center gap-2"><span className="text-[11px] font-black">{rows.length} registros</span><Toggle value={sort} onChange={setSort} options={[["canal", "Por canal"], ["dia", "Por día"]]} /></div>}>
    <div className="overflow-auto max-h-96"><table className="w-full text-[11px] font-mono whitespace-nowrap border-collapse"><thead className="sticky top-0 bg-slate-50"><tr>{columns.map(([key, label]) => <th key={key} className="px-3 py-2 border-b border-r text-center uppercase" style={{ borderColor: colors.border, color: colors.muted }}>{label}</th>)}</tr></thead><tbody>{sorted.map((r, i) => <tr key={`${r.fecha}-${r.canal_publicidad}-${i}`} className="hover:bg-slate-50">{columns.map(([key]) => <td key={key} className="px-3 py-2 border-b border-r text-center" style={{ borderColor: colors.border, color: key === "inversion" || key === "cpl" ? colors.violet : key === "venta_subida" ? colors.green : colors.primary }}>{key === "fecha" ? shortDate(r.fecha) : key === "inversion" || key === "cpl" ? (r[key] == null ? "—" : money(r[key])) : key === "pct_atc" ? pct(r.atc, r.n_leads) : key === "pct_venta" ? pct(r.venta_subida, r.gestionables) : key === "canal_publicidad" ? r[key] : num(r[key])}</td>)}</tr>)}</tbody></table></div>
  </Frame>;
}

export default function RedesVelsaGeneral({ totales, porCanal, diario, ciudad, atc, hora, loading }) {
  const [agencyView, setAgencyView] = useState("detalle");
  const [cityView, setCityView] = useState("resumen");
  const [hourView, setHourView] = useState("resumen");
  const total = num(totales?.n_leads);
  if (loading && !totales) return <div className="text-center py-20">Cargando monitoreo…</div>;
  if (!totales) return <div className="text-center py-20 text-slate-500">Sin datos para el período</div>;
  return <div className="space-y-6">
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      {[["Leads totales", total, "👥", colors.primary, `${num(totales?.gestionables)} gestionables`], ["Negociables", num(totales?.gestionables), "🤝", colors.green, pct(totales?.gestionables, total)], ["Venta subida", num(totales?.venta_subida), "📋", colors.sky, "Bitrix"], ["Efectividad", pct(totales?.venta_subida, totales?.gestionables), "✅", colors.green, "venta / negociables"], ["Descartados", num(totales?.descartados), "📦", colors.red, pct(totales?.descartados, total)], ["Inversión", money(totales?.inversion_total), "💰", colors.violet, `CPL ${totales?.cpl_promedio == null ? "—" : money(totales.cpl_promedio)}`], ["% ATC / SAC", pct(totales?.atc, total), "📞", colors.red, `${num(totales?.atc)} leads ATC`]].map(([label, value, icon, color, sub]) =>
        <div key={label} className="rounded-2xl border px-4 py-3 flex items-center gap-3" style={{ borderColor: `${color}25`, background: `linear-gradient(135deg,${color}10,${color}04)` }}><span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}18` }}>{icon}</span><div><p className="text-[11px] font-black uppercase" style={{ color }}>{label}</p><b className="text-xl" style={{ color }}>{value}</b><p className="text-[11px]" style={{ color: colors.muted }}>{sub}</p></div></div>
      )}
    </div>
    <Frame title="Canales de publicidad" subtitle="Orígenes, embudo y métricas por agencia" extra={<div className="flex items-center gap-2"><b className="text-[11px]">{porCanal.length} canales</b><Toggle value={agencyView} onChange={setAgencyView} options={[["detalle", "Detalle"], ["tabla", "Tabla"]]} /></div>}>
      {agencyView === "detalle" ? <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{porCanal.map(r => <AgencyCard key={r.canal_publicidad} row={r} total={total} />)}</div> : <div className="overflow-auto p-4"><table className="w-full text-xs"><thead><tr>{["Agencia", "Leads", "Negoc.", "ATC", "V.Sub.", "Desc.", "Inv.$", "CPL"].map(x => <th key={x} className="p-2 border-b text-left">{x}</th>)}</tr></thead><tbody>{porCanal.map(r => <tr key={r.canal_publicidad}><td className="p-2 border-b font-bold">{r.canal_publicidad}</td>{["n_leads", "gestionables", "atc", "venta_subida", "descartados", "inversion", "cpl"].map(k => <td key={k} className="p-2 border-b">{k === "inversion" || k === "cpl" ? r[k] == null ? "—" : money(r[k]) : num(r[k])}</td>)}</tr>)}</tbody></table></div>}
    </Frame>
    <MetricTable rows={diario} />
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Frame title="Por ciudad" accent={colors.sky} extra={<Toggle value={cityView} onChange={setCityView} options={[["resumen", "Resumen"], ["detalle", "Detalle"]]} />}><div className="overflow-auto max-h-72"><table className="w-full text-xs"><thead><tr>{["Ciudad", "Provincia", "Leads", "ATC", "V.Sub."].map(h => <th key={h} className="p-2 text-left border-b">{h}</th>)}</tr></thead><tbody>{(cityView === "detalle" ? ciudad?.porCiudadDia : ciudad?.porCiudad)?.map((r, i) => <tr key={i}><td className="p-2 border-b font-bold">{r.ciudad}</td><td className="p-2 border-b">{r.provincia}</td><td className="p-2 border-b">{num(r.n_leads)}</td><td className="p-2 border-b">{num(r.atc)}</td><td className="p-2 border-b">{num(r.venta_subida)}</td></tr>)}</tbody></table></div></Frame>
      <Frame title="Motivos ATC — análisis por etapa" accent={colors.red}><div className="overflow-auto max-h-72"><table className="w-full text-xs"><thead><tr><th className="p-2 text-left border-b">Etapa CRM</th><th className="p-2 text-right border-b">Leads</th></tr></thead><tbody>{(atc?.data || []).map(r => <tr key={r.motivo}><td className="p-2 border-b">{r.motivo}</td><td className="p-2 border-b text-right font-bold">{num(r.cantidad)}</td></tr>)}</tbody></table></div></Frame>
    </div>
    <Frame title="Leads por hora" accent={colors.violet} extra={<Toggle value={hourView} onChange={setHourView} options={[["resumen", "Resumen"], ["detalle", "Detalle"]]} />}><div className="overflow-auto max-h-64"><table className="w-full text-xs"><thead><tr>{["Hora", "Leads", "ATC", "Venta subida"].map(h => <th key={h} className="p-2 text-left border-b">{h}</th>)}</tr></thead><tbody>{(hourView === "detalle" ? hora?.porHoraDia : hora?.porHora)?.map((r, i) => <tr key={i}><td className="p-2 border-b font-bold">{String(r.hora).padStart(2, "0")}:00</td><td className="p-2 border-b">{num(r.n_leads)}</td><td className="p-2 border-b">{num(r.atc)}</td><td className="p-2 border-b">{num(r.venta_subida)}</td></tr>)}</tbody></table></div></Frame>
  </div>;
}
