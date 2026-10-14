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
const NOMBRE_MES = (mes) => { const [y, m] = mes.split('-').map(Number); const t = new Date(y, m - 1, 1).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };

function Kpi({ etiqueta, valor, ayuda, tono }) {
  const tonos = { verde: 'text-emerald-600', ambar: 'text-amber-600', azul: 'text-indigo-700', gris: 'text-slate-800' };
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{etiqueta}</div>
    <div className={`mt-1 text-2xl font-black ${tonos[tono] || tonos.gris}`}>{valor}</div>
    {ayuda && <div className="mt-0.5 text-[11px] text-slate-500">{ayuda}</div>}
  </div>;
}

const GRADIENTES = ['from-indigo-600 to-sky-500', 'from-fuchsia-600 to-rose-500', 'from-emerald-600 to-teal-500', 'from-amber-500 to-orange-600', 'from-violet-600 to-purple-500', 'from-cyan-600 to-blue-600'];

// Celular con la billetera del asesor: lo mismo que verá él en su app.
function CelularBilletera({ a, i }) {
  const enCamino = Math.max(0, (a.valor_total || 0) - (a.valor_disponible || 0));
  const pct = a.valor_total > 0 ? Math.round((a.valor_disponible / a.valor_total) * 100) : 0;
  return <div className="mx-auto w-full max-w-[340px] rounded-[2.75rem] border-[11px] border-slate-900 bg-slate-50 shadow-2xl">
    <div className="mx-auto mt-2 h-5 w-24 rounded-full bg-slate-900" />
    <div className="p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0"><p className="text-[11px] text-slate-400">Hola 👋</p><p className="truncate font-black text-slate-800">{a.usuario}</p></div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 font-black text-slate-700">{iniciales(a.usuario)}</div>
      </div>
      <div className={`mt-4 rounded-3xl bg-gradient-to-br ${GRADIENTES[i % GRADIENTES.length]} p-5 text-white shadow-lg`}>
        <p className="text-xs font-semibold text-white/80">Valor total del mes</p>
        <p className="text-[2.6rem] font-black leading-none tracking-tight">{dinero(a.valor_total)}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/20 px-3 py-2"><p className="text-[10px] font-semibold text-white/80">Disponible</p><p className="text-lg font-black">{dinero(a.valor_disponible)}</p></div>
          <div className="rounded-2xl bg-black/10 px-3 py-2"><p className="text-[10px] font-semibold text-white/80">En camino</p><p className="text-lg font-black">{dinero(enCamino)}</p></div>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-white/30"><div className="h-1.5 rounded-full bg-white transition-all" style={{ width: `${pct}%` }} /></div>
        <p className="mt-1 text-right text-[10px] text-white/80">{pct}% liberado</p>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] font-bold text-slate-600">
        <div title="Próximamente" className="cursor-not-allowed rounded-2xl bg-white py-3 opacity-60 shadow-sm">💸<br />Retirar</div>
        <div className="rounded-2xl bg-white py-3 shadow-sm">📊<br />{a.activas_totales} ventas</div>
        <div className="rounded-2xl bg-white py-3 shadow-sm">🏷️<br />Cód. {a.codigo_asesor}</div>
      </div>
      <p className="mt-4 text-xs font-black text-slate-700">Movimientos</p>
      <div className="mt-2 space-y-2 text-xs">
        <div className="flex justify-between rounded-xl bg-white p-2.5 shadow-sm"><span>✅ {a.activas_regularizadas} regularizadas</span><b className="text-emerald-600">+{dinero(a.valor_disponible)}</b></div>
        <div className="flex justify-between rounded-xl bg-white p-2.5 shadow-sm"><span>⏳ {a.activas_por_regularizar} por regularizar</span><b className="text-amber-600">{dinero(enCamino)}</b></div>
        {a.sin_valor > 0 && <div className="flex justify-between rounded-xl bg-red-50 p-2.5 shadow-sm"><span>⚠️ {a.sin_valor} sin valor en catálogo</span><b className="text-red-600">Revisar</b></div>}
      </div>
    </div>
  </div>;
}

export default function BilleteraDigital() {
  const [empresa, setEmpresa] = useState('NOVONET');
  const [mes, setMes] = useState(mesActual());
  const [data, setData] = useState({ filas: [], totales: {} });
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [buscar, setBuscar] = useState('');

  useEffect(() => {
    const ctrl = new AbortController(); setLoading(true); setError('');
    const r = rangoMes(mes);
    const qs = new URLSearchParams({ empresa, telcosDesde: r.desde, telcosHasta: r.hasta });
    fetch(`${API}/api/comisiones?${qs}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, signal: ctrl.signal })
      .then(async (res) => { const b = await res.json().catch(() => ({})); if (!res.ok) throw new Error(b.error || `HTTP ${res.status}`); return b; })
      .then((b) => setData(b.data || { filas: [], totales: {} }))
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [empresa, mes]);

  const asesores = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return [...(data.filas || [])]
      .filter((a) => !q || `${a.usuario} ${a.codigo_asesor}`.toLowerCase().includes(q))
      .sort((x, y) => (y.valor_total - x.valor_total) || (y.valor_disponible - x.valor_disponible));
  }, [data, buscar]);
  const t = data.totales || {};
  const conSaldo = (data.filas || []).filter((a) => a.valor_disponible > 0).length;

  return <div className="min-h-full bg-gradient-to-br from-sky-50 via-white to-indigo-50 p-4 md:p-7"><div className="mx-auto max-w-7xl space-y-5">
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

    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <p className="text-sm text-slate-500">Cada celular es lo que verá el asesor en su app · {NOMBRE_MES(mes)}. Ordenados por valor total.</p>
      <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar asesor o código…" className="w-full rounded-xl border bg-white px-3 py-2 text-sm shadow-sm md:w-72" />
    </div>
    {loading ? <div className="rounded-2xl border bg-white p-16 text-center text-sm text-slate-500">Cargando billeteras…</div>
      : !asesores.length ? <div className="rounded-2xl border border-dashed bg-white p-16 text-center text-sm text-slate-500">Sin asesores con activas en este mes.</div>
      : <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">{asesores.map((a, i) => <CelularBilletera key={a.usuario} a={a} i={i} />)}</div>}
    <p className="text-center text-[11px] text-slate-400">Simulación sin movimientos de dinero reales. Fase 2: chargeback y egresos.</p>
  </div></div>;
}
