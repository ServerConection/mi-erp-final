import { useEffect, useMemo, useState } from 'react';

// Billetera Digital — SIMULACIÓN (vista administración: ve a todos los asesores).
// Saldo disponible = comisión de activas regularizadas; Por liberar = activas por regularizar.
// Fuente: GET /api/comisiones (mismo cálculo del módulo Comisiones, tramo "menor a 35").
const API = import.meta.env.VITE_API_URL;
const dinero = (v) => Number(v || 0).toLocaleString('es-EC', { style: 'currency', currency: 'USD' });
const mesActual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const rangoMes = (mes) => {
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  const hoy = new Date();
  const esActual = hoy.getFullYear() === y && hoy.getMonth() + 1 === m;
  const fin = esActual ? hoy.getDate() : ultimo;
  return { desde: `${mes}-01`, hasta: `${mes}-${String(fin).padStart(2, '0')}` };
};
const iniciales = (n) => String(n || '?').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, ' ').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
const NOMBRE_MES = (mes) => { const [y, m] = mes.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' }); };

function Kpi({ etiqueta, valor, ayuda, tono }) {
  const tonos = { verde: 'text-emerald-600', ambar: 'text-amber-600', azul: 'text-indigo-700', gris: 'text-slate-800' };
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{etiqueta}</div>
    <div className={`mt-1 text-2xl font-black ${tonos[tono] || tonos.gris}`}>{valor}</div>
    {ayuda && <div className="mt-0.5 text-[11px] text-slate-500">{ayuda}</div>}
  </div>;
}

function TarjetaBilletera({ a, empresa }) {
  const pct = a.valor_total > 0 ? Math.round((a.valor_disponible / a.valor_total) * 100) : 0;
  return <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-violet-700 to-fuchsia-600 p-6 text-white shadow-xl">
    <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
    <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-white/5" />
    <div className="relative flex items-start justify-between">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">Billetera {empresa}</div>
        <div className="mt-1 text-lg font-black leading-tight">{a.usuario}</div>
      </div>
      <div className="flex h-9 w-12 items-center justify-center rounded-md bg-gradient-to-br from-amber-200 to-amber-400 shadow-inner"><div className="h-5 w-8 rounded-sm border border-amber-600/40" /></div>
    </div>
    <div className="relative mt-7">
      <div className="text-xs font-semibold text-white/70">Saldo disponible</div>
      <div className="text-4xl font-black tracking-tight">{dinero(a.valor_disponible)}</div>
      <div className="mt-1 text-xs text-white/80">+ {dinero(a.valor_total - a.valor_disponible)} por liberar</div>
    </div>
    <div className="relative mt-5">
      <div className="h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-emerald-300 transition-all" style={{ width: `${pct}%` }} /></div>
      <div className="mt-1 flex justify-between text-[11px] text-white/75"><span>{pct}% liberado</span><span>Proyectado {dinero(a.valor_total)}</span></div>
    </div>
    <div className="relative mt-5 flex items-end justify-between font-mono text-sm tracking-widest text-white/85">
      <span>•••• •••• •••• {String(a.codigo_asesor || '').slice(-4).padStart(4, '0')}</span>
      <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-white/60">Simulación</span>
    </div>
  </div>;
}

function Movimientos({ a, mes }) {
  const filas = [
    { icono: '✅', titulo: 'Comisión de ventas regularizadas', detalle: `${a.activas_regularizadas} activas regularizadas`, monto: a.valor_disponible, estado: 'Disponible', tono: 'text-emerald-600 bg-emerald-50' },
    { icono: '⏳', titulo: 'Comisión retenida por regularizar', detalle: `${a.activas_por_regularizar} activas pendientes de regularización`, monto: a.valor_total - a.valor_disponible, estado: 'Por liberar', tono: 'text-amber-700 bg-amber-50' },
  ];
  if (a.sin_valor > 0) filas.push({ icono: '⚠️', titulo: 'Ventas sin valor en catálogo', detalle: `${a.sin_valor} activas con plan no encontrado`, monto: null, estado: 'Revisar', tono: 'text-red-600 bg-red-50' });
  return <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-center justify-between border-b px-5 py-3"><h3 className="text-sm font-black text-slate-800">Movimientos · {NOMBRE_MES(mes)}</h3><span className="text-[11px] text-slate-400">Calculado con tramo menor a 35</span></div>
    <ul className="divide-y">
      {filas.map((f) => <li key={f.titulo} className="flex items-center gap-4 px-5 py-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg">{f.icono}</div>
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-slate-800">{f.titulo}</div><div className="text-xs text-slate-500">{f.detalle}</div></div>
        <div className="text-right"><div className="text-sm font-black text-slate-800">{f.monto === null ? '—' : dinero(f.monto)}</div><span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${f.tono}`}>{f.estado}</span></div>
      </li>)}
    </ul>
  </div>;
}

export default function BilleteraDigital() {
  const [empresa, setEmpresa] = useState('NOVONET');
  const [mes, setMes] = useState(mesActual());
  const [data, setData] = useState({ filas: [], totales: {} });
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [buscar, setBuscar] = useState('');
  const [sel, setSel] = useState(null);

  useEffect(() => {
    const ctrl = new AbortController(); setLoading(true); setError('');
    const r = rangoMes(mes);
    const qs = new URLSearchParams({ empresa, telcosDesde: r.desde, telcosHasta: r.hasta });
    fetch(`${API}/api/comisiones?${qs}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, signal: ctrl.signal })
      .then(async (res) => { const b = await res.json().catch(() => ({})); if (!res.ok) throw new Error(b.error || `HTTP ${res.status}`); return b; })
      .then((b) => { setData(b.data || { filas: [], totales: {} }); setSel(null); })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [empresa, mes]);

  const asesores = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return [...(data.filas || [])]
      .filter((a) => !q || `${a.usuario} ${a.codigo_asesor}`.toLowerCase().includes(q))
      .sort((x, y) => (y.valor_disponible - x.valor_disponible) || (y.valor_total - x.valor_total));
  }, [data, buscar]);
  const activo = asesores.find((a) => a.usuario === sel) || asesores[0] || null;
  const t = data.totales || {};
  const conSaldo = (data.filas || []).filter((a) => a.valor_disponible > 0).length;

  return <div className="min-h-full bg-slate-50 p-4 md:p-7"><div className="mx-auto max-w-7xl space-y-5">
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-violet-600">Administración</p>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900">Billetera Digital <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-bold text-violet-700">Simulación</span></h1>
        <p className="mt-1 text-sm text-slate-500">Saldo de comisiones de cada asesor. Disponible = ventas regularizadas; por liberar = activas pendientes de regularización.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border bg-white p-1 shadow-sm">{['NOVONET', 'VELSA'].map((x) => <button key={x} onClick={() => setEmpresa(x)} className={`rounded-lg px-4 py-1.5 text-sm font-bold ${empresa === x ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{x}</button>)}</div>
        <input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} className="rounded-xl border bg-white px-3 py-1.5 text-sm shadow-sm" aria-label="Mes" />
      </div>
    </header>

    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi etiqueta="Saldo disponible" valor={dinero(t.valor_disponible)} ayuda="Listo para pagar" tono="verde" />
      <Kpi etiqueta="Por liberar" valor={dinero((t.valor_total || 0) - (t.valor_disponible || 0))} ayuda="Espera regularización" tono="ambar" />
      <Kpi etiqueta="Comisión proyectada" valor={dinero(t.valor_total)} ayuda={`${t.activas_totales || 0} activas en el mes`} tono="azul" />
      <Kpi etiqueta="Asesores con saldo" valor={`${conSaldo} / ${(data.filas || []).length}`} ayuda={data.mes_catalogo ? `Catálogo ${data.mes_catalogo}` : 'Sin catálogo cargado'} />
    </div>

    <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]">
      <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b p-3"><input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar asesor o código…" className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
        <ul className="max-h-[560px] divide-y overflow-y-auto">
          {loading ? <li className="p-10 text-center text-sm text-slate-500">Cargando billeteras…</li>
            : !asesores.length ? <li className="p-10 text-center text-sm text-slate-500">Sin asesores con activas en este mes.</li>
            : asesores.map((a) => {
              const on = activo?.usuario === a.usuario;
              const pct = a.valor_total > 0 ? Math.round((a.valor_disponible / a.valor_total) * 100) : 0;
              return <li key={a.usuario}><button onClick={() => setSel(a.usuario)} className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${on ? 'bg-violet-50' : 'hover:bg-slate-50'}`}>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black ${on ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{iniciales(a.usuario)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold text-slate-800">{a.usuario}</span><span className="text-sm font-black text-emerald-600">{dinero(a.valor_disponible)}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                  <div className="mt-0.5 flex justify-between text-[10px] text-slate-400"><span>Cód. {a.codigo_asesor}</span><span>de {dinero(a.valor_total)}</span></div>
                </div>
              </button></li>;
            })}
        </ul>
      </aside>

      <section className="space-y-5">
        {!activo ? <div className="rounded-2xl border border-dashed bg-white p-16 text-center text-sm text-slate-500">Selecciona un asesor para ver su billetera.</div> : <>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_1fr]">
            <TarjetaBilletera a={activo} empresa={empresa} />
            <div className="grid grid-cols-2 gap-3">
              <Kpi etiqueta="Activas totales" valor={activo.activas_totales} tono="azul" />
              <Kpi etiqueta="Regularizadas" valor={activo.activas_regularizadas} tono="verde" />
              <Kpi etiqueta="Por regularizar" valor={activo.activas_por_regularizar} tono="ambar" />
              <Kpi etiqueta="Último ingreso" valor={activo.ultima_fecha_ingreso_telcos ? new Date(activo.ultima_fecha_ingreso_telcos).toLocaleDateString('es-EC', { timeZone: 'UTC' }) : '—'} />
              <button disabled title="Disponible en la versión para asesores" className="col-span-2 cursor-not-allowed rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/50 py-3 text-sm font-bold text-violet-400">💸 Solicitar retiro · próximamente</button>
            </div>
          </div>
          <Movimientos a={activo} mes={mes} />
        </>}
      </section>
    </div>
    <p className="text-center text-[11px] text-slate-400">Simulación sin movimientos de dinero reales. Fase 2: chargeback y egresos.</p>
  </div></div>;
}
