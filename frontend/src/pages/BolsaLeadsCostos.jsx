import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { puedeAccederBolsaLeads } from '../utils/accesoGestionables';

/**
 * COSTOS BOLSA LEADS — reporte gerencial del piloto.
 * Cuánto le costó la pauta a cada empresa (NOVONET, VELSA, SEMILLERO) según los
 * leads que les repartió la Bolsa, y qué tan eficiente fue (ventas, CPA, conversión).
 * El costo se asigna por día: CPL del día × leads que recibió cada empresa ese día.
 */
const API = import.meta.env.VITE_API_URL || 'http://localhost:3050';
const EMP = {
  novonet: { label: 'NOVONET', color: '#2563eb', suave: 'border-blue-200 bg-blue-50 text-blue-800' },
  velsa: { label: 'VELSA', color: '#c026d3', suave: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800' },
  semillero: { label: 'SEMILLERO', color: '#059669', suave: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
};
const LISTA = ['novonet', 'velsa', 'semillero'];
const PROBLEMA = ['SIN ORIGEN', 'SIN AGENCIA'];
const usd = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const num = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('es-EC'));
const pct = (n) => (n === null || n === undefined ? '—' : `${n}%`);

async function api(path) {
  const res = await fetch(`${API}/api/bolsa-leads${path}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || 'No se pudo cargar el reporte');
  return json;
}

function descargarCsv(nombre, filas) {
  if (!filas.length) return;
  const cols = Object.keys(filas[0]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...filas.map((f) => cols.map((c) => esc(f[c])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  URL.revokeObjectURL(url);
}

const Kpi = ({ titulo, valor, sub }) => (
  <div className="rounded-xl border bg-white p-3 shadow-sm">
    <div className="text-xs text-slate-500">{titulo}</div>
    <div className="text-2xl font-bold text-slate-800">{valor}</div>
    {sub && <div className="text-xs text-slate-400">{sub}</div>}
  </div>
);

export default function BolsaLeadsCostos() {
  const permitido = puedeAccederBolsaLeads();
  const [desde, setDesde] = useState(''), [hasta, setHasta] = useState('');
  const [data, setData] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [tab, setTab] = useState('origen');
  const [filtroEmp, setFiltroEmp] = useState('todas'), [soloVenta, setSoloVenta] = useState(false), [pagina, setPagina] = useState(0);
  const [filtroAgencia, setFiltroAgencia] = useState('todas');   // 'todas' | 'revisar' | nombre de agencia

  const cargar = useCallback(async (d = desde, h = hasta) => {
    setBusy(true); setError('');
    try {
      const qs = new URLSearchParams();
      if (d) qs.set('desde', d);
      if (h) qs.set('hasta', h);
      const r = await api(`/costos?${qs}`);
      setData(r); setDesde(r.desde); setHasta(r.hasta); setPagina(0);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }, [desde, hasta]);
  useEffect(() => { if (permitido) cargar('', ''); }, [permitido]); // eslint-disable-line react-hooks/exhaustive-deps

  const detalle = useMemo(() => (data?.detalle || [])
    .filter((d) => (filtroEmp === 'todas' || d.empresa === filtroEmp) && (!soloVenta || d.ventas > 0)
      && (filtroAgencia === 'todas' || (filtroAgencia === 'revisar' ? PROBLEMA.includes(d.agencia)
        : filtroAgencia.startsWith('s|') ? d.subagencia === filtroAgencia.slice(2) : d.agencia === filtroAgencia))),
  [data, filtroEmp, soloVenta, filtroAgencia]);
  // Leads sin origen o con un origen que no está en el catálogo de Redes
  const revisar = useMemo(() => {
    const filas = (data?.porAgencia || []).filter((a) => PROBLEMA.includes(a.agencia));
    const origenes = (data?.porOrigen || []).filter((o) => o.agencia === 'SIN AGENCIA');
    return { filas, origenes, total: filas.reduce((n, a) => n + a.total, 0) };
  }, [data]);
  const verLeads = (agencia, empresa = 'todas') => { setTab('lead'); setFiltroAgencia(agencia); setFiltroEmp(empresa); setSoloVenta(false); setPagina(0); };
  const POR_PAGINA = 100;

  if (!permitido) return <div className="p-8 text-slate-600">Solo administración y gerencia pueden ver este reporte.</div>;

  const t = data?.totales;
  const mejor = data?.ranking?.find((x) => x.cpa !== null);
  const peor = data?.ranking && [...data.ranking].reverse().find((x) => x.cpa !== null && x.empresa !== mejor?.empresa);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs text-slate-400"><Link to="/bolsa-leads" className="hover:underline">Bolsa Leads</Link> / Costos</div>
          <h1 className="text-2xl font-bold text-slate-800">Costos del piloto Bolsa Leads</h1>
          <p className="text-sm text-slate-500">Cuánto costó la pauta a cada empresa según los leads que recibió, y qué tan eficiente fue.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1">Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1">Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border px-2 py-1.5" /></label>
          <button type="button" disabled={busy} onClick={() => cargar()} className="rounded-lg bg-slate-800 px-4 py-2 font-medium text-white disabled:opacity-40">{busy ? 'Cargando…' : 'Ver'}</button>
          <button type="button" disabled={!data?.detalle?.length} onClick={() => descargarCsv(`bolsa_leads_costos_${desde}_${hasta}.csv`, data.detalle.map((d) => ({
            id_bitrix: d.deal, empresa: EMP[d.empresa]?.label || d.empresa, fecha: d.fecha, agencia: d.agencia || '', subagencia: d.subagencia || '', origen: d.origen || '',
            costo_usd: d.costo, ventas: d.ventas, activas: d.activas,
          })))} className="rounded-lg border px-3 py-2 hover:bg-slate-50 disabled:opacity-40">Descargar detalle</button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      {data?.avisos?.map((a) => <div key={a} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{a}</div>)}

      {t && (
        <>
          {/* Veredicto */}
          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <h2 className="mb-1 font-semibold text-slate-700">Resumen para gerencia</h2>
            {t.leads === 0 ? (
              <p className="text-sm text-slate-500">La Bolsa no repartió leads en este rango.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                <li>Del {data.desde} al {data.hasta} la pauta costó <b>{usd(t.inversion)}</b> y la Bolsa repartió <b>{num(t.leads)} leads</b>: costo por lead de <b>{usd(t.cpl)}</b>.</li>
                <li>Esos leads generaron <b>{num(t.ventas)} ventas</b> ({num(t.activas)} activas): costo por venta de <b>{usd(t.cpa)}</b>; {pct(t.conversion)} de los leads tuvo venta.</li>
                {mejor && <li>La más eficiente fue <b>{EMP[mejor.empresa].label}</b>, con <b>{usd(mejor.cpa)}</b> por venta y {pct(mejor.conversion)} de conversión.</li>}
                {peor && <li>La menos eficiente fue <b>{EMP[peor.empresa].label}</b>, con <b>{usd(peor.cpa)}</b> por venta.</li>}
                {data.porEmpresa.filter((x) => x.leads > 0 && !x.ventas).map((x) => (
                  <li key={x.empresa}><b>{EMP[x.empresa].label}</b> recibió {num(x.leads)} leads ({usd(x.costo)}) y todavía no tiene ventas.</li>
                ))}
                {t.inversion_sin_asignar > 0 && <li>{usd(t.inversion_sin_asignar)} de inversión fueron de días en que la Bolsa no repartió leads (no se asignan a ninguna empresa).</li>}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-400">Las ventas de los leads más recientes pueden seguir entrando en los próximos días: revisa de nuevo para ver el resultado final.</p>
          </section>

          {/* Totales */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi titulo="Inversión" valor={usd(t.inversion)} sub={`${t.dias_con_leads} días con leads`} />
            <Kpi titulo="Leads repartidos" valor={num(t.leads)} sub={`CPL ${usd(t.cpl)}`} />
            <Kpi titulo="Ventas ingresadas" valor={num(t.ventas)} sub={`${num(t.activas)} activas`} />
            <Kpi titulo="Costo por venta" valor={usd(t.cpa)} sub={`por activa ${usd(t.cpa_activa)}`} />
            <Kpi titulo="Conversión" valor={pct(t.conversion)} sub="leads con al menos 1 venta" />
          </div>

          {/* Por empresa */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {data.porEmpresa.map((x) => (
              <section key={x.empresa} className={`rounded-2xl border p-4 ${EMP[x.empresa].suave}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">{EMP[x.empresa].label}</h3>
                  {data.ranking.find((r) => r.empresa === x.empresa && x.cpa !== null) && (
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold">#{data.ranking.find((r) => r.empresa === x.empresa).puesto} en eficiencia</span>
                  )}
                </div>
                <div className="mt-2 text-3xl font-bold">{usd(x.costo)}</div>
                <div className="text-xs opacity-80">{pct(x.pct_costo)} de la inversión asignada</div>
                <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
                  <dt className="opacity-70">Leads</dt><dd className="text-right font-semibold">{num(x.leads)} ({pct(x.pct_leads)})</dd>
                  <dt className="opacity-70">Costo por lead</dt><dd className="text-right font-semibold">{usd(x.cpl)}</dd>
                  <dt className="opacity-70">Ventas / activas</dt><dd className="text-right font-semibold">{num(x.ventas)} / {num(x.activas)}</dd>
                  <dt className="opacity-70">Costo por venta</dt><dd className="text-right font-semibold">{usd(x.cpa)}</dd>
                  <dt className="opacity-70">Costo por activa</dt><dd className="text-right font-semibold">{usd(x.cpa_activa)}</dd>
                  <dt className="opacity-70">Conversión</dt><dd className="text-right font-semibold">{pct(x.conversion)}</dd>
                </dl>
              </section>
            ))}
          </div>

          {/* Por agencia: inversión, leads y costo por empresa (con sub-agencias) */}
          {data.porAgencia?.length > 0 && (
            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="mb-1 font-semibold text-slate-700">Por agencia: cuánto costó y a quién le llegó</h2>
              <p className="mb-3 text-xs text-slate-400">
                Inversión de cada agencia ÷ sus leads = costo por lead (CPL). Cada empresa paga ese CPL por cada lead de esa agencia que recibió.
                Las sub-agencias (VELSA 1, VELSA 2, ARTS GOOGLE…) usan el CPL de su agencia, porque la inversión llega por agencia.
                En cada empresa: leads · costo · ventas.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500">
                    <th className="py-1">Agencia</th><th>Inversión</th><th>Leads</th><th>CPL</th>
                    {LISTA.map((e) => <th key={e}>{EMP[e].label}</th>)}<th>Ventas</th><th>Costo por venta</th>
                  </tr></thead>
                  <tbody>{data.porAgencia.map((a) => {
                    const subs = (data.porSubagencia || []).filter((x) => x.agencia === a.agencia && x.subagencia !== a.agencia);
                    const celda = (x, e) => (
                      <td key={e} className="whitespace-nowrap">
                        {num(x[e])} · <span className="text-slate-500">{usd(x[`costo_${e}`])}</span> · <span className="text-emerald-700">{num(x[`ventas_${e}`])}</span>
                      </td>
                    );
                    return [
                      <tr key={a.agencia} className={`border-t ${PROBLEMA.includes(a.agencia) ? 'bg-amber-50' : 'bg-slate-50'}`}>
                        <td className="py-1.5 font-bold">{a.agencia}</td>
                        <td className="font-semibold">{usd(a.inversion)}</td>
                        <td className="font-semibold">{num(a.total)}</td>
                        <td>{usd(a.cpl)}</td>
                        {LISTA.map((e) => celda(a, e))}
                        <td className="font-semibold">{num(a.ventas)}</td>
                        <td className="font-semibold">{usd(a.cpa)}</td>
                      </tr>,
                      ...subs.map((x) => (
                        <tr key={`${a.agencia}|${x.subagencia}`} className="border-t text-slate-600">
                          <td className="py-1 pl-5">↳ {x.subagencia}</td>
                          <td className="text-xs text-slate-400">—</td>
                          <td>{num(x.total)}</td>
                          <td>{usd(x.cpl)}</td>
                          {LISTA.map((e) => celda(x, e))}
                          <td>{num(x.ventas)}</td>
                          <td>{usd(x.cpa)}</td>
                        </tr>
                      )),
                    ];
                  })}</tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-400">Una agencia con inversión y 0 leads invirtió en el rango, pero sus leads no pasaron por la Bolsa (o no tienen origen). Las filas SIN ORIGEN / SIN AGENCIA no tienen costo porque no se sabe de qué pauta vienen.</p>
            </section>
          )}

          {/* Leads por revisar */}
          {revisar.total > 0 && (
            <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-amber-900">⚠ {num(revisar.total)} leads por revisar ({t.leads ? `${Math.round((revisar.total * 1000) / t.leads) / 10}%` : '—'} del total)</h2>
                <button type="button" onClick={() => verLeads('revisar')} className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-100">Ver todos los leads</button>
              </div>
              <ul className="mb-3 list-disc pl-5 text-xs text-amber-900">
                <li><b>SIN ORIGEN</b>: Bitrix no mandó el origen del lead al ERP. Revisa el lead en Bitrix: no tiene "Origen" o no pasó por el webhook.</li>
                <li><b>SIN AGENCIA</b>: el lead tiene origen, pero ese origen no está en el catálogo de Redes. Agrégalo en Redes (NOVONET o VELSA) con su agencia y se corrige solo.</li>
              </ul>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-amber-800"><th className="py-1">Motivo</th>{LISTA.map((e) => <th key={e}>{EMP[e].label}</th>)}<th>Total</th></tr></thead>
                  <tbody>{revisar.filas.map((a) => (
                    <tr key={a.agencia} className="border-t border-amber-200">
                      <td className="py-1.5 font-semibold">{a.agencia}</td>
                      {LISTA.map((e) => (
                        <td key={e}>{a[e] ? <button type="button" onClick={() => verLeads(a.agencia, e)} className="underline">{num(a[e])}</button> : '0'}</td>
                      ))}
                      <td className="font-semibold">{num(a.total)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {revisar.origenes.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 text-xs font-semibold text-amber-900">Orígenes que faltan en el catálogo de Redes:</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-amber-800"><th className="py-1">Origen</th>{LISTA.map((e) => <th key={e}>{EMP[e].label}</th>)}<th>Total</th></tr></thead>
                      <tbody>{revisar.origenes.map((o) => (
                        <tr key={o.origen} className="border-t border-amber-200">
                          <td className="py-1.5 font-mono text-xs">{o.origen}</td>
                          {LISTA.map((e) => <td key={e}>{num(o[e])}</td>)}
                          <td className="font-semibold">{num(o.total)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Gráfico */}
          {data.porDia.length > 0 && (
            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="mb-3 font-semibold text-slate-700">Costo asignado por día</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.porDia}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="fecha" tick={{ fontSize: 11 }} tickFormatter={(f) => f.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip formatter={(v) => usd(v)} />
                    <Legend />
                    {LISTA.map((e) => <Bar key={e} dataKey={`costo_${e}`} name={EMP[e].label} stackId="c" fill={EMP[e].color} />)}
                    <Bar dataKey="sin_asignar" name="Sin asignar" stackId="c" fill="#cbd5e1" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* Detalle */}
          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap gap-1">
              {[['origen', 'Por origen'], ['dia', 'Por día'], ['fuente', 'Inversión por agencia'], ['lead', 'Por lead']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setTab(k)}
                  className={`rounded-full border px-3 py-1 text-sm ${tab === k ? 'border-slate-800 bg-slate-800 text-white' : 'text-slate-600'}`}>{l}</button>
              ))}
            </div>

            {tab === 'dia' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500">
                    <th className="py-1">Fecha</th><th>Inversión</th><th>Leads</th><th>CPL</th>
                    {LISTA.map((e) => <th key={e}>{EMP[e].label}</th>)}<th>Sin asignar</th>
                  </tr></thead>
                  <tbody>{data.porDia.map((d) => (
                    <tr key={d.fecha} className="border-t">
                      <td className="py-1.5 whitespace-nowrap">{d.fecha}</td><td>{usd(d.inversion)}</td><td>{num(d.leads)}</td><td>{usd(d.cpl)}</td>
                      {LISTA.map((e) => <td key={e} className="whitespace-nowrap">{num(d[e])} · {usd(d[`costo_${e}`])}</td>)}
                      <td>{d.sin_asignar ? usd(d.sin_asignar) : '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}

            {tab === 'origen' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500"><th className="py-1">Agencia</th><th>Sub-agencia</th><th>Origen (campaña)</th>{LISTA.map((e) => <th key={e}>{EMP[e].label}</th>)}<th>Total</th><th>Ventas</th></tr></thead>
                  <tbody>{(data.porOrigen || []).map((o) => (
                    <tr key={`${o.agencia}|${o.subagencia}|${o.origen}`} className="border-t">
                      <td className="py-1.5 text-xs font-semibold text-slate-500">{o.agencia}</td><td className="text-xs">{o.subagencia}</td><td>{o.origen}</td>
                      {LISTA.map((e) => <td key={e}>{num(o[e])}</td>)}
                      <td className="font-semibold">{num(o.total)}</td><td>{num(o.ventas)}</td>
                    </tr>
                  ))}
                  {!data.porOrigen?.length && <tr><td colSpan={8} className="py-6 text-center text-slate-400">Sin leads</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'fuente' && (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-500"><th className="py-1">Agencia / origen</th><th>Inversión</th><th>% del total</th></tr></thead>
                <tbody>{data.porFuente.map((f) => (
                  <tr key={f.fuente} className="border-t"><td className="py-1.5">{f.fuente}</td><td>{usd(f.monto)}</td><td>{t.inversion ? `${Math.round((f.monto * 1000) / t.inversion) / 10}%` : '—'}</td></tr>
                ))}
                {!data.porFuente.length && <tr><td colSpan={3} className="py-6 text-center text-slate-400">Sin inversión registrada en el rango</td></tr>}
                </tbody>
              </table>
            )}

            {tab === 'lead' && (
              <>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                  {['todas', ...LISTA].map((e) => (
                    <button key={e} type="button" onClick={() => { setFiltroEmp(e); setPagina(0); }}
                      className={`rounded-full border px-3 py-1 text-xs ${filtroEmp === e ? 'border-slate-800 bg-slate-800 text-white' : 'text-slate-600'}`}>{e === 'todas' ? 'Todas' : EMP[e].label}</button>
                  ))}
                  <select value={filtroAgencia} onChange={(e) => { setFiltroAgencia(e.target.value); setPagina(0); }} className="rounded-lg border px-2 py-1 text-xs">
                    <option value="todas">Todas las agencias</option>
                    <option value="revisar">⚠ Sin origen / sin agencia</option>
                    {(data.porAgencia || []).filter((a) => a.total > 0).map((a) => <option key={a.agencia} value={a.agencia}>{a.agencia}</option>)}
                    {(data.porSubagencia || []).filter((x) => x.subagencia !== x.agencia).map((x) => <option key={`s|${x.subagencia}`} value={`s|${x.subagencia}`}>↳ {x.subagencia}</option>)}
                  </select>
                  <label className="ml-2 flex items-center gap-1 text-xs text-slate-600">
                    <input type="checkbox" checked={soloVenta} onChange={(e) => { setSoloVenta(e.target.checked); setPagina(0); }} /> Solo con venta
                  </label>
                  <span className="ml-auto text-xs text-slate-400">{num(detalle.length)} leads</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-slate-500"><th className="py-1">ID Bitrix</th><th>Empresa</th><th>Fecha</th><th>Agencia</th><th>Origen</th><th>Costo</th><th>Ventas</th><th>Activas</th></tr></thead>
                    <tbody>{detalle.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA).map((d) => (
                      <tr key={d.deal} className="border-t">
                        <td className="py-1.5 font-mono">{d.deal}</td><td>{EMP[d.empresa]?.label || d.empresa}</td><td>{d.fecha}</td>
                        <td className="text-xs">{d.subagencia && d.subagencia !== d.agencia ? `${d.agencia} · ${d.subagencia}` : (d.agencia || '—')}</td><td className="text-xs">{d.origen || '—'}</td>
                        <td>{usd(d.costo)}</td><td>{d.ventas || '—'}</td><td>{d.activas || '—'}</td>
                      </tr>
                    ))}
                    {!detalle.length && <tr><td colSpan={8} className="py-6 text-center text-slate-400">Sin leads</td></tr>}
                    </tbody>
                  </table>
                </div>
                {detalle.length > POR_PAGINA && (
                  <div className="mt-2 flex items-center justify-end gap-2 text-sm">
                    <button type="button" disabled={!pagina} onClick={() => setPagina(pagina - 1)} className="rounded border px-2 py-1 disabled:opacity-40">Anterior</button>
                    <span>{pagina + 1} / {Math.ceil(detalle.length / POR_PAGINA)}</span>
                    <button type="button" disabled={(pagina + 1) * POR_PAGINA >= detalle.length} onClick={() => setPagina(pagina + 1)} className="rounded border px-2 py-1 disabled:opacity-40">Siguiente</button>
                  </div>
                )}
              </>
            )}
          </section>

          <p className="text-xs text-slate-400">
            Cómo se calcula: cada día, la inversión de todas las agencias (ARTS, Vidika, Velsa) se divide entre los leads que repartió la Bolsa ese día;
            cada empresa paga ese costo por cada lead que recibió. Ventas = registros de envios_ventas (no borradores) con el ID de Bitrix del lead.
          </p>
        </>
      )}
    </div>
  );
}
