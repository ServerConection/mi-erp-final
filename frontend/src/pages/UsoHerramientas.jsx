import { useEffect, useMemo, useState } from 'react';
import {
  Activity, CalendarDays, CheckCircle2, ChevronDown, Download, MapPin,
  MessageCircle, RefreshCw, Search, ShieldAlert, Users, XCircle,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
const inicioMes = () => `${hoy().slice(0, 8)}01`;
const token = () => localStorage.getItem('token');
const perfil = () => {
  try { return JSON.parse(localStorage.getItem('userProfile') || '{}'); } catch { return {}; }
};
const num = (v) => Number(v || 0).toLocaleString('es-EC');
const pct = (a, b) => b ? Math.round((a / b) * 100) : 0;
const POR_PAGINA = 20;
const fechaCorta = (v) => new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short' })
  .format(new Date(`${v}T12:00:00`));

function Kpi({ icon: Icon, label, value, detail, tone = 'blue' }) {
  const tonos = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-100', emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100', rose: 'bg-rose-50 text-rose-700 ring-rose-100',
  };
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className={`mb-3 inline-flex rounded-xl p-2.5 ring-1 ${tonos[tone]}`}><Icon size={18} /></div>
    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-3xl font-black tracking-tight text-slate-900">{value}</p>
    <p className="mt-1 text-xs text-slate-500">{detail}</p>
  </div>;
}

function Empty({ children }) {
  return <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">{children}</div>;
}

function Paginacion({ pagina, total, onChange }) {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const inicio = total ? (pagina - 1) * POR_PAGINA + 1 : 0;
  const fin = Math.min(pagina * POR_PAGINA, total);
  return <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
    <p className="text-xs font-semibold text-slate-500">Mostrando {inicio}–{fin} de {total} registros</p>
    <div className="flex items-center gap-2">
      <button disabled={pagina <= 1} onClick={() => onChange(pagina - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Anterior</button>
      <span className="min-w-20 text-center text-xs font-bold text-slate-600">{pagina} de {paginas}</span>
      <button disabled={pagina >= paginas} onClick={() => onChange(pagina + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Siguiente</button>
    </div>
  </div>;
}

function exportarCsv(nombre, filas) {
  if (!filas.length) return;
  const headers = Object.keys(filas[0]);
  const csv = [headers, ...filas.map((f) => headers.map((h) => f[h] ?? ''))]
    .map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  a.download = nombre; a.click(); URL.revokeObjectURL(a.href);
}

export default function UsoHerramientas() {
  const user = perfil();
  const esAdmin = String(user.perfil || '').toUpperCase() === 'ADMINISTRADOR';
  const [tab, setTab] = useState('uso');
  const [filtros, setFiltros] = useState({ desde: inicioMes(), hasta: hoy(), empresa: esAdmin ? '' : String(user.empresa || '').toUpperCase() });
  const [busqueda, setBusqueda] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paginaUso, setPaginaUso] = useState(1);
  const [paginaCobertura, setPaginaCobertura] = useState(1);

  const cargar = async () => {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams(filtros);
      const r = await fetch(`${API}/api/wa/uso/reporte?${qs}`, { headers: { Authorization: `Bearer ${token()}` } });
      const body = await r.json();
      if (!r.ok || !body.success) throw new Error(body.error || 'No se pudo cargar el reporte');
      setData(body.data); setPaginaUso(1); setPaginaCobertura(1);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { cargar(); }, []); // carga inicial; aplicar evita consultas por cada tecla

  const q = busqueda.trim().toLowerCase();
  const uso = useMemo(() => (data?.uso?.wabot || []).filter((f) => !q || `${f.usuario} ${f.empresa} ${f.fecha}`.toLowerCase().includes(q)), [data, q]);
  const cobertura = useMemo(() => (data?.cobertura || []).filter((f) => !q || `${f.usuario} ${f.empresa} ${f.fecha}`.toLowerCase().includes(q)), [data, q]);
  const usoPagina = uso.slice((paginaUso - 1) * POR_PAGINA, paginaUso * POR_PAGINA);
  const coberturaPagina = cobertura.slice((paginaCobertura - 1) * POR_PAGINA, paginaCobertura * POR_PAGINA);
  const totalUso = uso.reduce((s, f) => s + Number(f.usos), 0);
  const totalChats = uso.reduce((s, f) => s + Number(f.conversaciones), 0);
  const usuariosActivos = new Set(uso.map((f) => `${f.empresa}|${f.usuario}`)).size;
  const tot = data?.totales || { gestionables: 0, consultados: 0, no_consultados: 0 };

  return <div className="min-h-full bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-blue-800 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold ring-1 ring-white/15"><Activity size={14} /> Analítica operativa</div>
            <h1 className="text-2xl font-black tracking-tight sm:text-4xl">Uso y cobertura</h1>
            <p className="mt-2 max-w-2xl text-sm text-blue-100">Comprueba quién utiliza Wabot y si cada lead que continúa gestionable fue consultado en Cobertura.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <label className="text-xs font-semibold text-blue-100">Desde<input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} className="mt-1 block w-full rounded-xl border-0 bg-white px-3 py-2 text-sm text-slate-800" /></label>
            <label className="text-xs font-semibold text-blue-100">Hasta<input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} className="mt-1 block w-full rounded-xl border-0 bg-white px-3 py-2 text-sm text-slate-800" /></label>
            {esAdmin && <label className="text-xs font-semibold text-blue-100">Empresa<select value={filtros.empresa} onChange={(e) => setFiltros({ ...filtros, empresa: e.target.value })} className="mt-1 block w-full rounded-xl border-0 bg-white px-3 py-2 text-sm text-slate-800"><option value="">Todas</option><option>NOVONET</option><option>VELSA</option></select></label>}
            <button onClick={cargar} disabled={loading} className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Aplicar</button>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 gap-1">
          <button onClick={() => setTab('uso')} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${tab === 'uso' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}><MessageCircle size={16} className="mr-2 inline" />Uso de herramientas</button>
          <button onClick={() => setTab('cobertura')} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${tab === 'cobertura' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}><MapPin size={16} className="mr-2 inline" />Cobertura</button>
        </div>
        <div className="relative"><Search className="absolute left-3 top-2.5 text-slate-400" size={17} /><input value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPaginaUso(1); setPaginaCobertura(1); }} placeholder="Buscar usuario, fecha o empresa" className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 sm:w-80" /></div>
      </div>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700"><ShieldAlert className="mr-2 inline" size={18} />{error}</div>}

      {tab === 'uso' ? <>
        <section className="grid gap-3 sm:grid-cols-3"><Kpi icon={Activity} label="Mensajes salientes" value={num(totalUso)} detail="Sin campañas, notas ni sistema" /><Kpi icon={MessageCircle} label="Chats activos" value={num(totalChats)} detail="Con cualquier actividad en el día" tone="emerald" /><Kpi icon={Users} label="Usuarios activos" value={num(usuariosActivos)} detail="Personas con actividad" tone="amber" /></section>
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 p-4"><div><h2 className="font-black text-slate-900">Actividad diaria en Wabot</h2><p className="text-xs text-slate-500">Mensajes salientes de la línea y chats con actividad entrante o saliente.</p></div><button onClick={() => exportarCsv(`uso-wabot-${filtros.desde}-${filtros.hasta}.csv`, uso)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Descargar CSV"><Download size={18} /></button></div>
          {loading ? <Empty><RefreshCw className="mb-2 animate-spin" />Cargando actividad…</Empty> : uso.length ? <><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Usuario</th><th className="px-4 py-3">Empresa</th><th className="px-4 py-3 text-right">Mensajes</th><th className="px-4 py-3 text-right">Chats activos</th></tr></thead><tbody className="divide-y divide-slate-100">{usoPagina.map((f, i) => <tr key={`${f.fecha}-${f.usuario_id}-${i}`} className="hover:bg-blue-50/40"><td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">{fechaCorta(f.fecha)}</td><td className="px-4 py-3 font-semibold text-slate-900">{f.usuario}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{f.empresa}</span></td><td className="px-4 py-3 text-right text-lg font-black text-blue-700">{num(f.usos)}</td><td className="px-4 py-3 text-right font-bold text-slate-600">{num(f.conversaciones)}</td></tr>)}</tbody></table></div><Paginacion pagina={paginaUso} total={uso.length} onChange={setPaginaUso} /></> : <Empty>No hay actividad de Wabot en el período seleccionado.</Empty>}
        </section>
      </> : <>
        {data?.cobertura_desde && data.cobertura_desde > filtros.desde && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><CalendarDays className="mr-2 inline" size={18} /><b>Período comparable desde {fechaCorta(data.cobertura_desde)}.</b> El historial de consultas no existía antes; esos días se excluyen para no marcar falsos incumplimientos.</div>}
        <section className="grid gap-3 sm:grid-cols-4"><Kpi icon={CalendarDays} label="Gestionables" value={num(tot.gestionables)} detail="Según etapa actual del CRM" /><Kpi icon={CheckCircle2} label="Consultados" value={num(tot.consultados)} detail={`${pct(tot.consultados, tot.gestionables)}% de cumplimiento`} tone="emerald" /><Kpi icon={XCircle} label="Sin consultar" value={num(tot.no_consultados)} detail="Requieren seguimiento" tone="rose" /><Kpi icon={MapPin} label="Adopción" value={`${pct(tot.consultados, tot.gestionables)}%`} detail="Gestionables con consulta" tone="amber" /></section>
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 p-4"><div><h2 className="font-black text-slate-900">Cobertura por usuario y día</h2><p className="text-xs text-slate-500">Cruce exacto por ID de negociación.</p></div><button onClick={() => exportarCsv(`cobertura-uso-${filtros.desde}-${filtros.hasta}.csv`, cobertura.map(({ detalle_no_consultados, ...f }) => ({ ...f, ids_no_consultados: detalle_no_consultados.join(' | ') })))} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Descargar CSV"><Download size={18} /></button></div>
          {loading ? <Empty><RefreshCw className="mb-2 animate-spin" />Cruzando gestionables…</Empty> : cobertura.length ? <><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Fecha / usuario</th><th className="px-4 py-3 text-right">Gestionables</th><th className="px-4 py-3 text-right">Consultados</th><th className="px-4 py-3 text-right">Sin consultar</th><th className="min-w-40 px-4 py-3">Cumplimiento</th><th className="px-4 py-3">IDs pendientes</th></tr></thead><tbody className="divide-y divide-slate-100">{coberturaPagina.map((f, i) => { const p = pct(f.consultados, f.gestionables); return <tr key={`${f.fecha}-${f.empresa}-${f.usuario}-${i}`} className={f.no_consultados ? 'bg-rose-50/25' : 'hover:bg-emerald-50/30'}><td className="px-4 py-3"><div className="font-bold text-slate-900">{f.usuario}</div><div className="text-xs text-slate-500">{fechaCorta(f.fecha)} · {f.empresa}</div></td><td className="px-4 py-3 text-right font-bold">{f.gestionables}</td><td className="px-4 py-3 text-right font-black text-emerald-700">{f.consultados}</td><td className="px-4 py-3 text-right font-black text-rose-700">{f.no_consultados}</td><td className="px-4 py-3"><div className="mb-1 flex justify-between text-xs font-bold"><span>{p}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${p === 100 ? 'bg-emerald-500' : p >= 50 ? 'bg-amber-400' : 'bg-rose-500'}`} style={{ width: `${p}%` }} /></div></td><td className="max-w-xs px-4 py-3">{f.detalle_no_consultados.length ? <details><summary className="cursor-pointer font-bold text-rose-700">Ver {f.detalle_no_consultados.length} <ChevronDown className="inline" size={14} /></summary><p className="mt-2 break-words text-xs text-slate-600">{f.detalle_no_consultados.join(', ')}</p></details> : <span className="text-xs font-bold text-emerald-700">Completo</span>}</td></tr>; })}</tbody></table></div><Paginacion pagina={paginaCobertura} total={cobertura.length} onChange={setPaginaCobertura} /></> : <Empty>No hay gestionables asignados en el período seleccionado.</Empty>}
        </section>
      </>}
    </div>
  </div>;
}
