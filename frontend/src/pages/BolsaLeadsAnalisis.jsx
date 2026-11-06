import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { puedeAccederBolsaLeads } from '../utils/accesoGestionables';

/**
 * ANÁLISIS DEL PILOTO BOLSA LEADS — detalle profundo para gerencia:
 * embudo por empresa, desempeño por asesor, por hora y día, y antes vs piloto.
 */
const API = import.meta.env.VITE_API_URL || 'http://localhost:3050';
const EMP = {
  novonet: { label: 'NOVONET', color: '#2563eb', suave: 'border-blue-200 bg-blue-50 text-blue-800' },
  velsa: { label: 'VELSA', color: '#c026d3', suave: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800' },
  semillero: { label: 'SEMILLERO', color: '#059669', suave: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
};
const LISTA = ['novonet', 'velsa', 'semillero'];
const usd = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const num = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('es-EC'));
const pct = (n) => (n === null || n === undefined ? '—' : `${n}%`);
// Horas → texto corto: 25 min · 3.5 h · 2.1 días
const tiempo = (h) => (h === null || h === undefined ? '—' : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} días`);
const PASOS = [
  ['leads', 'Leads recibidos', null],
  ['gestionables', 'Gestionables', 'pct_gestionables'],
  ['venta_subida', 'Venta subida', 'pct_venta_subida'],
  ['ingresos', 'Con venta ingresada', 'pct_ingresos'],
  ['activas', 'Con venta activa', 'pct_activas'],
];

async function api(path) {
  const res = await fetch(`${API}/api/bolsa-leads${path}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || 'No se pudo cargar el análisis');
  return json;
}
function descargarCsv(nombre, filas) {
  if (!filas.length) return;
  const cols = Object.keys(filas[0]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...filas.map((f) => cols.map((c) => esc(f[c])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = nombre; a.click(); URL.revokeObjectURL(url);
}

// Cambio % con color: "mejor" depende de si conviene que suba o que baje
const Cambio = ({ valor, mejorSiBaja }) => {
  if (valor === null || valor === undefined) return <span className="text-slate-400">—</span>;
  const bueno = mejorSiBaja ? valor < 0 : valor > 0;
  const color = valor === 0 ? 'text-slate-500' : bueno ? 'text-emerald-600' : 'text-red-600';
  return <span className={`font-semibold ${color}`}>{valor > 0 ? '▲' : valor < 0 ? '▼' : '='} {Math.abs(valor)}%</span>;
};

function Embudo({ e, d }) {
  const max = d.leads || 1;
  return (
    <div className={`rounded-xl border p-3 ${EMP[e].suave}`}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-bold">{EMP[e].label}</h3>
        <span className="text-xs opacity-80">{usd(d.costo)} · {num(d.ventas)} ventas</span>
      </div>
      {PASOS.map(([k, label, kp]) => (
        <div key={k} className="mb-1.5">
          <div className="flex justify-between text-xs"><span>{label}</span><span className="font-semibold">{num(d[k])}{kp ? ` · ${pct(d[kp])}` : ''}</span></div>
          <div className="h-2.5 rounded bg-white/70"><div className="h-2.5 rounded" style={{ width: `${Math.max(2, (d[k] / max) * 100)}%`, background: EMP[e].color }} /></div>
        </div>
      ))}
    </div>
  );
}

export default function BolsaLeadsAnalisis() {
  const permitido = puedeAccederBolsaLeads();
  const [desde, setDesde] = useState(''), [hasta, setHasta] = useState('');
  const [data, setData] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [tab, setTab] = useState('embudo');
  const [empAsesor, setEmpAsesor] = useState('novonet'), [orden, setOrden] = useState('leads');

  const cargar = useCallback(async (d = desde, h = hasta, forzar = false) => {
    setBusy(true); setError('');
    try {
      const qs = new URLSearchParams();
      if (d) qs.set('desde', d);
      if (h) qs.set('hasta', h);
      if (forzar) qs.set('forzar', '1');
      const r = await api(`/analisis?${qs}`);
      setData(r); setDesde(r.desde); setHasta(r.hasta);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }, [desde, hasta]);
  useEffect(() => { if (permitido) cargar('', ''); }, [permitido]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hallazgos automáticos para gerencia
  const hallazgos = useMemo(() => {
    if (!data?.embudo) return [];
    const out = [];
    const emp = data.embudo.porEmpresa.filter((x) => x.leads > 0);
    const mejor = [...emp].sort((a, b) => (b.pct_ingresos ?? -1) - (a.pct_ingresos ?? -1))[0];
    if (mejor) out.push(`${EMP[mejor.empresa].label} convierte mejor: ${pct(mejor.pct_ingresos)} de sus leads tiene venta ingresada.`);
    for (const x of emp) {
      const caidaGest = 100 - (x.pct_gestionables ?? 100);
      if (caidaGest >= 30) out.push(`${EMP[x.empresa].label}: ${caidaGest.toFixed(1)}% de sus leads no son gestionables (ATC, fuera de cobertura, duplicado…). Revisa la calidad de la pauta que le llega.`);
    }
    const horas = (data.tiempo?.porHora || []).filter((h) => h.leads >= 10);
    const hMejor = [...horas].sort((a, b) => (b.conversion ?? -1) - (a.conversion ?? -1))[0];
    const hPeor = [...horas].sort((a, b) => (a.conversion ?? 999) - (b.conversion ?? 999))[0];
    if (hMejor && hPeor && hMejor.hora !== hPeor.hora) out.push(`Mejor hora: ${hMejor.etiqueta} (${pct(hMejor.conversion)} con venta). Peor hora: ${hPeor.etiqueta} (${pct(hPeor.conversion)}).`);
    const t = data.tiempo;
    if (t?.viaCola?.leads) out.push(`${num(t.viaCola.leads)} leads se entregaron desde la espera nocturna: convierten ${pct(t.viaCola.conversion)} vs ${pct(t.directos.conversion)} de los entregados al momento.`);
    const cedidos = (t?.saltos || []).filter((s) => s.cedidos > 0);
    for (const s of cedidos) out.push(`${EMP[s.empresa].label} cedió ${num(s.cedidos)} leads por no tener asesores conectados.`);
    for (const x of data.tiempos?.porEmpresa || []) {
      if (x.leads && x.primera_gestion.mediana !== null) out.push(`${EMP[x.empresa].label}: primera gestión en ${tiempo(x.primera_gestion.mediana)} (mediana); ${pct(x.venta_subida.en_plazo)} de las ventas subidas llegaron dentro del plazo de ${x.plazo_venta_subida_h} h.`);
    }
    const c = data.comparacion;
    if (c?.cambios?.cpa !== null && c?.cambios?.cpa !== undefined) {
      out.push(`Costo por venta: ${usd(c.antes.cpa)} antes → ${usd(c.piloto.cpa)} en el piloto (${c.cambios.cpa > 0 ? 'subió' : 'bajó'} ${Math.abs(c.cambios.cpa)}%).`);
    }
    return out;
  }, [data]);

  const asesores = useMemo(() => {
    const lista = data?.asesores?.find((x) => x.empresa === empAsesor)?.asesores || [];
    const val = (a) => (orden === 'cpa' ? (a.cpa ?? Infinity) : -(a[orden] ?? -1));
    return [...lista].sort((a, b) => val(a) - val(b));
  }, [data, empAsesor, orden]);

  if (!permitido) return <div className="p-8 text-slate-600">Solo administración y gerencia pueden ver este análisis.</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs text-slate-400"><Link to="/bolsa-leads" className="hover:underline">Bolsa Leads</Link> / <Link to="/bolsa-leads/costos" className="hover:underline">Costos</Link> / Análisis</div>
          <h1 className="text-2xl font-bold text-slate-800">Análisis del piloto Bolsa Leads</h1>
          <p className="text-sm text-slate-500">Embudo, asesores, horarios y comparación con los días antes de la Bolsa.</p>
          {data?.generado && (
            <p className="text-xs text-slate-400">
              Datos de Bitrix de las {new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit' }).format(new Date(data.generado))} · se actualizan solos cada 10 min
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1">Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1">Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border px-2 py-1.5" /></label>
          <button type="button" disabled={busy} onClick={() => cargar()} className="rounded-lg bg-slate-800 px-4 py-2 font-medium text-white disabled:opacity-40">{busy ? 'Analizando…' : 'Ver'}</button>
          <button type="button" disabled={busy} onClick={() => cargar(desde, hasta, true)} className="rounded-lg border px-3 py-2 hover:bg-slate-50 disabled:opacity-40" title="Vuelve a leer las etapas y responsables en Bitrix">Actualizar de Bitrix</button>
        </div>
      </div>

      {busy && !data && <div className="rounded-lg border bg-white px-4 py-3 text-sm text-slate-500">Leyendo etapas y responsables en Bitrix… puede tardar unos segundos.</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      {data?.avisos?.map((a) => <div key={a} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{a}</div>)}

      {data?.embudo && (
        <>
          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <h2 className="mb-1 font-semibold text-slate-700">Hallazgos del {data.desde} al {data.hasta}</h2>
            {hallazgos.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{hallazgos.map((h) => <li key={h}>{h}</li>)}</ul>
            ) : <p className="text-sm text-slate-500">Todavía no hay datos suficientes.</p>}
            <p className="mt-2 text-xs text-slate-400">Las ventas de los leads más recientes pueden seguir entrando: los porcentajes mejoran con los días.</p>
          </section>

          <div className="flex flex-wrap gap-1">
            {[['embudo', 'Embudo por empresa'], ['tiempos', 'Tiempos y etapas'], ['asesor', 'Por asesor'], ['tiempo', 'Hora y día'], ['antes', 'Antes vs piloto']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={`rounded-full border px-4 py-1.5 text-sm ${tab === k ? 'border-slate-800 bg-slate-800 text-white' : 'bg-white text-slate-600'}`}>{l}</button>
            ))}
          </div>

          {tab === 'embudo' && (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {data.embudo.porEmpresa.map((x) => <Embudo key={x.empresa} e={x.empresa} d={x} />)}
              </div>
              <section className="rounded-2xl border bg-white p-4 shadow-sm">
                <h2 className="mb-3 font-semibold text-slate-700">Embudo por empresa y agencia</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-slate-500"><th className="py-1">Empresa</th><th>Agencia</th>{PASOS.map(([k, l]) => <th key={k}>{l}</th>)}<th>Costo</th></tr></thead>
                    <tbody>{data.embudo.porEmpresaAgencia.map((x) => (
                      <tr key={`${x.empresa}|${x.agencia}`} className="border-t">
                        <td className="py-1.5 font-semibold">{EMP[x.empresa].label}</td><td>{x.agencia}</td>
                        {PASOS.map(([k, , kp]) => <td key={k}>{num(x[k])}{kp ? <span className="text-xs text-slate-400"> {pct(x[kp])}</span> : ''}</td>)}
                        <td>{usd(x.costo)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </section>
              <section className="rounded-2xl border bg-white p-4 shadow-sm">
                <h2 className="mb-1 font-semibold text-slate-700">¿Dónde están hoy los leads? (etapa actual en Bitrix)</h2>
                <p className="mb-3 text-xs text-slate-400">En rojo, las etapas que no son gestionables.</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {data.embudo.etapas.map((x) => (
                    <div key={x.empresa}>
                      <h3 className="mb-1 text-sm font-bold">{EMP[x.empresa].label}</h3>
                      <table className="w-full text-xs">
                        <tbody>{x.etapas.slice(0, 12).map((e) => (
                          <tr key={e.etapa} className="border-t">
                            <td className={`py-1 ${e.gestionable ? '' : 'text-red-600'}`}>{e.etapa}</td>
                            <td className="text-right">{num(e.leads)}</td><td className="w-14 text-right text-slate-400">{pct(e.pct)}</td>
                          </tr>
                        ))}
                        {!x.etapas.length && <tr><td className="py-2 text-slate-400">Sin leads</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {tab === 'tiempos' && (data.tiempos ? (
            <>
              <section className="rounded-2xl border bg-white p-4 shadow-sm">
                <h2 className="mb-1 font-semibold text-slate-700">Tiempos de operación (desde que la Bolsa entrega el lead)</h2>
                <p className="mb-3 text-xs text-slate-400">
                  Mediana = el tiempo del lead "del medio" (no lo distorsionan los casos extremos). P75 = 3 de cada 4 leads lo hicieron en ese tiempo o menos.
                  Se mide con el historial de etapas de Bitrix; la venta ingresada, con la fecha de registro de la venta.
                </p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {data.tiempos.porEmpresa.map((x) => (
                    <div key={x.empresa} className={`rounded-xl border p-3 ${EMP[x.empresa].suave}`}>
                      <h3 className="mb-2 font-bold">{EMP[x.empresa].label} <span className="text-xs font-normal opacity-70">· {num(x.leads)} leads</span></h3>
                      <dl className="space-y-2 text-sm">
                        <div>
                          <dt className="text-xs opacity-70">Primera gestión (primer cambio de etapa)</dt>
                          <dd><b>{tiempo(x.primera_gestion.mediana)}</b> mediana · P75 {tiempo(x.primera_gestion.p75)} · {pct(x.primera_gestion.en_1h)} en menos de 1 h</dd>
                          <dd className="text-xs opacity-80">{num(x.sin_gestion)} leads todavía sin ningún cambio de etapa</dd>
                        </div>
                        <div>
                          <dt className="text-xs opacity-70">Hasta venta subida ({num(x.venta_subida.n)} leads)</dt>
                          <dd><b>{tiempo(x.venta_subida.mediana)}</b> mediana · P75 {tiempo(x.venta_subida.p75)}</dd>
                          {x.plazo_venta_subida_h !== null && <dd className="text-xs opacity-80">{pct(x.venta_subida.en_plazo)} dentro del plazo de {x.plazo_venta_subida_h} h</dd>}
                        </div>
                        <div>
                          <dt className="text-xs opacity-70">Hasta venta ingresada ({num(x.venta_ingresada.n)} leads)</dt>
                          <dd><b>{tiempo(x.venta_ingresada.mediana)}</b> mediana · P75 {tiempo(x.venta_ingresada.p75)} · {pct(x.venta_ingresada.en_24h)} en menos de 24 h</dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-2xl border bg-white p-4 shadow-sm">
                <h2 className="mb-1 font-semibold text-slate-700">Tiempo en cada etapa</h2>
                <p className="mb-3 text-xs text-slate-400">Cuánto se queda un lead en la etapa hasta pasar a la siguiente. "Siguen ahí" = leads que hoy están en esa etapa (y cuánto llevan). En rojo, etapas no gestionables.</p>
                <div className="space-y-4">
                  {data.tiempos.etapas.map((x) => (
                    <div key={x.empresa}>
                      <h3 className="mb-1 text-sm font-bold">{EMP[x.empresa].label}</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="text-left text-slate-500"><th className="py-1">Etapa</th><th>Pasaron</th><th>Tiempo en la etapa (mediana)</th><th>Promedio</th><th>P75</th><th>Siguen ahí</th><th>Llevan (mediana)</th></tr></thead>
                          <tbody>{x.etapas.map((e) => (
                            <tr key={e.etapa} className="border-t">
                              <td className={`py-1.5 ${e.gestionable ? '' : 'text-red-600'}`}>{e.etapa}</td>
                              <td>{num(e.pasaron)}</td><td className="font-semibold">{tiempo(e.mediana)}</td><td>{tiempo(e.promedio)}</td><td>{tiempo(e.p75)}</td>
                              <td>{num(e.siguen_ahi)}</td><td>{tiempo(e.espera_actual_mediana)}</td>
                            </tr>
                          ))}
                          {!x.etapas.length && <tr><td colSpan={7} className="py-3 text-center text-slate-400">Sin historial</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : <div className="rounded-lg border bg-white px-4 py-3 text-sm text-slate-500">No se pudieron calcular los tiempos (historial de Bitrix no disponible).</div>)}

          {tab === 'asesor' && (
            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {LISTA.map((e) => (
                  <button key={e} type="button" onClick={() => setEmpAsesor(e)}
                    className={`rounded-full border px-3 py-1 text-sm ${empAsesor === e ? 'border-slate-800 bg-slate-800 text-white' : 'text-slate-600'}`}>{EMP[e].label}</button>
                ))}
                <label className="ml-2 text-xs text-slate-500">Ordenar por{' '}
                  <select value={orden} onChange={(e) => setOrden(e.target.value)} className="rounded border px-2 py-1">
                    <option value="leads">Leads</option><option value="ventas">Ventas</option><option value="conversion">Conversión</option><option value="cpa">Costo por venta</option>
                  </select>
                </label>
                <button type="button" disabled={!asesores.length} onClick={() => descargarCsv(`bolsa_asesores_${empAsesor}_${desde}_${hasta}.csv`, asesores.map((a) => ({
                  asesor: a.asesor, leads: a.leads, gestionables: a.gestionables, venta_subida: a.venta_subida, con_venta: a.ingresos,
                  ventas: a.ventas, activas: a.activas, conversion_pct: a.conversion, costo_usd: a.costo, costo_por_venta: a.cpa,
                })))} className="ml-auto rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40">Descargar</button>
              </div>
              <p className="mb-2 text-xs text-slate-400">Responsable actual del lead en Bitrix. Costo = costo de los leads que recibió (CPL del día).</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500"><th className="py-1">Asesor</th><th>Leads</th><th>Gestionables</th><th>Venta subida</th><th>Con venta</th><th>Ventas</th><th>Activas</th><th>Conversión</th><th>Costo</th><th>Costo/venta</th></tr></thead>
                  <tbody>{asesores.map((a) => (
                    <tr key={a.asesor} className="border-t">
                      <td className="py-1.5">{a.asesor}</td><td>{num(a.leads)}</td><td>{num(a.gestionables)}</td><td>{num(a.venta_subida)}</td>
                      <td>{num(a.ingresos)}</td><td>{num(a.ventas)}</td><td>{num(a.activas)}</td><td>{pct(a.conversion)}</td><td>{usd(a.costo)}</td><td>{usd(a.cpa)}</td>
                    </tr>
                  ))}
                  {!asesores.length && <tr><td colSpan={10} className="py-6 text-center text-slate-400">Sin leads</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {tab === 'tiempo' && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-xl border bg-white p-3 shadow-sm"><div className="text-xs text-slate-500">Esperaron fuera de horario</div><div className="text-2xl font-bold">{num(data.tiempo.enEspera)}</div><div className="text-xs text-slate-400">llegaron de 22:16 a 07:59</div></div>
                <div className="rounded-xl border bg-white p-3 shadow-sm"><div className="text-xs text-slate-500">Entregados desde la espera</div><div className="text-2xl font-bold">{num(data.tiempo.viaCola.leads)}</div><div className="text-xs text-slate-400">conversión {pct(data.tiempo.viaCola.conversion)}</div></div>
                <div className="rounded-xl border bg-white p-3 shadow-sm"><div className="text-xs text-slate-500">Entregados al momento</div><div className="text-2xl font-bold">{num(data.tiempo.directos.leads)}</div><div className="text-xs text-slate-400">conversión {pct(data.tiempo.directos.conversion)}</div></div>
                <div className="rounded-xl border bg-white p-3 shadow-sm"><div className="text-xs text-slate-500">Pasados a otra empresa</div><div className="text-2xl font-bold">{num(data.tiempo.saltos.reduce((s, x) => s + x.cedidos, 0))}</div><div className="text-xs text-slate-400">por no tener asesores conectados</div></div>
              </div>
              <section className="rounded-2xl border bg-white p-4 shadow-sm">
                <h2 className="mb-3 font-semibold text-slate-700">Leads por hora de entrega</h2>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.tiempo.porHora}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
                      <Tooltip /><Legend />
                      {LISTA.map((e) => <Bar key={e} dataKey={e} name={EMP[e].label} stackId="h" fill={EMP[e].color} />)}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-slate-500"><th className="py-1">Hora</th><th>Leads</th>{LISTA.map((e) => <th key={e}>{EMP[e].label}</th>)}<th>Gestionables</th><th>Ventas</th><th>Conversión</th><th>Costo/venta</th></tr></thead>
                    <tbody>{data.tiempo.porHora.map((h) => (
                      <tr key={h.hora} className="border-t">
                        <td className="py-1.5">{h.etiqueta}</td><td>{num(h.leads)}</td>{LISTA.map((e) => <td key={e}>{num(h[e])}</td>)}
                        <td>{pct(h.pct_gestionables)}</td><td>{num(h.ventas)}</td><td>{pct(h.conversion)}</td><td>{h.ventas ? usd(h.costo / h.ventas) : '—'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </section>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <section className="rounded-2xl border bg-white p-4 shadow-sm">
                  <h2 className="mb-3 font-semibold text-slate-700">Por día de la semana</h2>
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-slate-500"><th className="py-1">Día</th><th>Leads</th><th>Ventas</th><th>Conversión</th><th>Costo/venta</th></tr></thead>
                    <tbody>{data.tiempo.porDia.map((d) => (
                      <tr key={d.dow} className="border-t"><td className="py-1.5">{d.etiqueta}</td><td>{num(d.leads)}</td><td>{num(d.ventas)}</td><td>{pct(d.conversion)}</td><td>{d.ventas ? usd(d.costo / d.ventas) : '—'}</td></tr>
                    ))}</tbody>
                  </table>
                </section>
                <section className="rounded-2xl border bg-white p-4 shadow-sm">
                  <h2 className="mb-1 font-semibold text-slate-700">Leads pasados por falta de conectados</h2>
                  <p className="mb-3 text-xs text-slate-400">Cedidos: la empresa no tenía asesores conectados y su lead se fue a otra. Recibidos: le llegaron de otra.</p>
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-slate-500"><th className="py-1">Empresa</th><th>Cedidos</th><th>Recibidos</th><th>Ventas de recibidos</th></tr></thead>
                    <tbody>{data.tiempo.saltos.map((s) => (
                      <tr key={s.empresa} className="border-t"><td className="py-1.5 font-semibold">{EMP[s.empresa].label}</td><td>{num(s.cedidos)}</td><td>{num(s.recibidos)}</td><td>{num(s.ventas_recibidos)}</td></tr>
                    ))}</tbody>
                  </table>
                </section>
              </div>
            </>
          )}

          {tab === 'antes' && (data.comparacion ? (() => {
            const { antes, piloto, cambios } = data.comparacion;
            const filas = [
              ['Inversión por día', usd(antes.inversion_dia), usd(piloto.inversion_dia), cambios.inversion_dia, true],
              ['Leads por día', num(antes.leads_dia), num(piloto.leads_dia), cambios.leads_dia, false],
              ['Ventas por día', num(antes.ventas_dia), num(piloto.ventas_dia), cambios.ventas_dia, false],
              ['Costo por lead (CPL)', usd(antes.cpl), usd(piloto.cpl), cambios.cpl, true],
              ['Costo por venta', usd(antes.cpa), usd(piloto.cpa), cambios.cpa, true],
              ['Ventas por cada 100 leads', num(antes.ventas_por_100_leads), num(piloto.ventas_por_100_leads), cambios.ventas_por_100_leads, false],
            ];
            return (
              <>
                <section className="rounded-2xl border bg-white p-4 shadow-sm">
                  <h2 className="mb-1 font-semibold text-slate-700">Antes vs piloto</h2>
                  <p className="mb-3 text-xs text-slate-400">
                    Antes: {antes.desde} al {antes.hasta} ({antes.dias} días). Piloto: {piloto.desde} al {piloto.hasta} ({piloto.dias} días).
                    Mismo cálculo en los dos: toda la inversión, los leads creados en el pipeline de cada empresa y todas las ventas ingresadas esos días.
                  </p>
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-slate-500"><th className="py-1">Indicador</th><th>Antes</th><th>Piloto</th><th>Cambio</th></tr></thead>
                    <tbody>{filas.map(([l, a, p, c, baja]) => (
                      <tr key={l} className="border-t"><td className="py-1.5">{l}</td><td>{a}</td><td className="font-semibold">{p}</td><td><Cambio valor={c} mejorSiBaja={baja} /></td></tr>
                    ))}</tbody>
                  </table>
                </section>
                <section className="rounded-2xl border bg-white p-4 shadow-sm">
                  <h2 className="mb-3 font-semibold text-slate-700">Por empresa</h2>
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-slate-500"><th className="py-1">Empresa</th><th>Leads antes</th><th>Leads piloto</th><th>Ventas antes</th><th>Ventas piloto</th><th>Ventas / 100 leads antes</th><th>Ventas / 100 leads piloto</th></tr></thead>
                    <tbody>{LISTA.map((e) => {
                      const a = antes.porEmpresa.find((x) => x.empresa === e), p = piloto.porEmpresa.find((x) => x.empresa === e);
                      return (
                        <tr key={e} className="border-t">
                          <td className="py-1.5 font-semibold">{EMP[e].label}</td><td>{num(a.leads)}</td><td>{num(p.leads)}</td>
                          <td>{num(a.ventas)}</td><td>{num(p.ventas)}</td><td>{num(a.ventas_por_100_leads)}</td><td className="font-semibold">{num(p.ventas_por_100_leads)}</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                  <p className="mt-2 text-xs text-slate-400">Si el piloto tiene pocos días, la comparación es referencial: conviene revisarla con al menos 2 semanas de datos.</p>
                </section>
              </>
            );
          })() : <div className="rounded-lg border bg-white px-4 py-3 text-sm text-slate-500">No se pudo armar la comparación.</div>)}
        </>
      )}
    </div>
  );
}
