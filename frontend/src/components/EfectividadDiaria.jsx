// ─────────────────────────────────────────────────────────────────────────────
// EFECTIVIDAD DIARIA — componente compartido NOVONET / VELSA
// ─────────────────────────────────────────────────────────────────────────────
// Una tabla por AGENCIA de publicidad. Filas fijas (el embudo pedido por
// gerencia) y una columna por DÍA, todo por FECHA DE CREACIÓN del lead:
//
//     TOTAL LEADS   → 100 % de la validación
//     GESTIONABLE   → meta 50 % de los leads totales
//     INGRESOS CRM  → venta subida; meta 30 % de la meta de gestionables
//     FALTANTE      → ventas que faltan para llegar a esa meta
//
// El cálculo NO vive acá: viene resuelto del backend
// (backend/src/controllers/efectividadDiaria.controller.js) para que la
// pantalla, el Excel y cualquier consumidor futuro usen la misma aritmética.
// Este componente solo pinta y exporta.
//
// Se usa igual en las dos empresas; lo único que cambia es `empresa` (define
// el endpoint) y la paleta de acento.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';

const FILAS = [
  { key: 'total_leads',  label: 'TOTAL LEADS',  meta: null, base: null },
  { key: 'gestionables', label: 'GESTIONABLE',  meta: 50,   base: 'pct_gestionables' },
  { key: 'ingresos_crm', label: 'INGRESOS CRM', meta: 30,   base: 'pct_ingresos' },
  { key: 'faltante',     label: 'FALTANTE',     meta: null, base: 'pct_faltante' },
];

const TEMAS = {
  novonet: { barra: '#1A3A6E', barraOscura: '#0f2550', chip: 'text-blue-300',  grad: 'linear-gradient(135deg,#1A3A6E,#1e3a8a)' },
  velsa:   { barra: '#9A3412', barraOscura: '#7c2d12', chip: 'text-orange-200', grad: 'linear-gradient(135deg,#9A3412,#c2410c)' },
};

const hoyLocal = () => new Date().toLocaleDateString('en-CA');
const primerDiaMes = () => `${hoyLocal().slice(0, 7)}-01`;
const fmtDia = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}/${y}`;
};

/** Texto de una celda tal como lo pidió gerencia: 50 (45%/50%) */
const textoCelda = (celda, fila) => {
  if (!celda) return '—';
  const valor = celda[fila.key] ?? 0;
  if (fila.base === null) return `${valor}`;
  const real = celda[fila.base] ?? 0;
  return fila.meta === null
    ? `${valor} (${real}%)`
    : `${valor} (${real}%/${fila.meta}%)`;
};

/** Semáforo: verde si cumple la meta, ámbar cerca, rojo si no. */
const colorCelda = (celda, fila) => {
  if (!celda || celda.total_leads === 0) return 'text-slate-300';
  if (fila.key === 'total_leads')  return 'text-slate-800';
  if (fila.key === 'faltante')     return celda.faltante === 0 ? 'text-emerald-600' : 'text-red-600 font-black';
  const cumple = fila.key === 'gestionables' ? celda.cumple_gestionables : celda.cumple_ingresos;
  if (cumple >= 100) return 'text-emerald-600 font-black';
  if (cumple >= 80)  return 'text-amber-600';
  return 'text-red-600';
};

/**
 * Una tabla = una agencia. Vive fuera del componente padre a propósito: si se
 * declara dentro del render, React la trata como un tipo nuevo en cada pintado
 * y remonta toda la tabla (scroll horizontal perdido en cada consulta).
 */
function TablaAgencia({ bloque, fechas, tema, destacado = false }) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${destacado ? 'border-slate-800 ring-1 ring-slate-800/20' : 'border-slate-200'}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr style={{ background: destacado ? '#0F172A' : tema.barra }} className="text-white">
              <th className="text-left px-3 py-2 font-black uppercase tracking-wider sticky left-0 z-10"
                  style={{ background: destacado ? '#0F172A' : tema.barra, minWidth: 150 }}>
                {bloque.agencia}
              </th>
              {fechas.map(f => (
                <th key={f} className="px-3 py-2 font-black tabular-nums whitespace-nowrap">{fmtDia(f)}</th>
              ))}
              <th className="px-3 py-2 font-black uppercase bg-black/25 whitespace-nowrap">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {FILAS.map((fila, i) => (
              <tr key={fila.key} className={i % 2 ? 'bg-slate-50/60' : 'bg-white'}>
                <td className="px-3 py-1.5 font-black uppercase text-slate-600 border-r border-slate-200 sticky left-0 z-10"
                    style={{ background: i % 2 ? '#f8fafc' : '#ffffff' }}>
                  {fila.label}
                </td>
                {fechas.map(f => (
                  <td key={f} className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap border-r border-slate-100 ${colorCelda(bloque.dias[f], fila)}`}>
                    {textoCelda(bloque.dias[f], fila)}
                  </td>
                ))}
                <td className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap bg-slate-100 font-black ${colorCelda(bloque.total, fila)}`}>
                  {textoCelda(bloque.total, fila)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function EfectividadDiaria({ empresa = 'novonet' }) {
  const tema = TEMAS[empresa] || TEMAS.novonet;
  const apiBase = empresa === 'velsa'
    ? `${import.meta.env.VITE_API_URL}/api/indicadores-velsa`
    : `${import.meta.env.VITE_API_URL}/api/indicadores`;

  const [fechaDesde, setFechaDesde] = useState(primerDiaMes());
  const [fechaHasta, setFechaHasta] = useState(hoyLocal());
  const [agenciaSel, setAgenciaSel] = useState('');   // '' = todas
  const [agencias,   setAgencias]   = useState([]);
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  // Catálogo de agencias para el dropdown (no bloquea la pantalla si falla).
  useEffect(() => {
    let vivo = true;
    fetch(`${apiBase}/efectividad-diaria/agencias`)
      .then(r => r.json())
      .then(j => { if (vivo && j.success) setAgencias(j.agencias || []); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [apiBase]);

  const consultar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ fechaDesde, fechaHasta });
      if (agenciaSel) params.set('agencia', agenciaSel);
      const res = await fetch(`${apiBase}/efectividad-diaria?${params.toString()}`);
      const json = await res.json();
      if (json.success) setData(json);
      else { setData(null); setError(json.error || 'Error al consultar'); }
    } catch (e) {
      setData(null); setError(e.message);
    } finally { setLoading(false); }
  }, [apiBase, fechaDesde, fechaHasta, agenciaSel]);

  // Primera carga automática: el mes en curso. El lint marca el setState dentro
  // del efecto — acá es intencional: es la carga inicial de datos remotos, el
  // mismo patrón que usan las otras pestañas de Indicadores.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { consultar(); }, []);

  const descargarExcel = () => {
    if (!data) return;
    const aoa = [];
    const bloques = [...data.agencias, data.consolidado];
    for (const bloque of bloques) {
      aoa.push([bloque.agencia, ...data.fechas.map(fmtDia), 'TOTAL']);
      for (const fila of FILAS) {
        aoa.push([
          fila.label,
          ...data.fechas.map(f => textoCelda(bloque.dias[f], fila)),
          textoCelda(bloque.total, fila),
        ]);
      }
      aoa.push([]);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 18 }, ...data.fechas.map(() => ({ wch: 16 })), { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Efectividad Diaria');
    XLSX.writeFile(wb, `Efectividad_Diaria_${empresa.toUpperCase()}_${fechaDesde}_${fechaHasta}.xlsx`);
  };

  return (
    <div className="animate-in slide-in-from-right-5 duration-500 space-y-5">
      {/* Encabezado */}
      <div className="text-white p-5 rounded-2xl flex justify-between items-center shadow-xl border-b-4"
           style={{ background: tema.barra, borderBottomColor: tema.barraOscura }}>
        <div>
          <h2 className="text-lg font-black italic tracking-tighter flex items-center gap-2 uppercase">
            🎯 EFECTIVIDAD DIARIA — {empresa.toUpperCase()}
          </h2>
          <p className={`text-[9px] font-bold tracking-[0.2em] uppercase mt-1 ${tema.chip}`}>
            Por agencia · fecha de creación del lead en Bitrix · Meta: 50 % gestionable / 30 % venta subida
          </p>
        </div>
        {data && (
          <div className="text-right">
            <div className="text-2xl font-black leading-none">{data.consolidado.total.total_leads.toLocaleString()}</div>
            <div className="text-[9px] font-bold uppercase tracking-widest opacity-70">leads del período</div>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Desde (creación CRM)</label>
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-slate-800" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Hasta (creación CRM)</label>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-slate-800" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Agencia</label>
            <select value={agenciaSel} onChange={e => setAgenciaSel(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-slate-800 min-w-[200px]">
              <option value="">TODAS LAS AGENCIAS</option>
              {agencias.map(a => (
                <option key={a.agencia} value={a.agencia}>{a.agencia} ({a.n_leads})</option>
              ))}
            </select>
          </div>
          <button onClick={consultar} disabled={loading}
            className="h-[42px] px-6 rounded-xl text-[10px] font-black uppercase text-white shadow transition-all active:scale-95 disabled:opacity-60"
            style={{ background: tema.grad }}>
            {loading ? '⏳ Consultando...' : '🔍 Consultar'}
          </button>
          {data && (
            <button onClick={descargarExcel}
              className="h-[42px] px-6 rounded-xl text-[10px] font-black uppercase text-white bg-emerald-600 hover:bg-emerald-700 shadow transition-all active:scale-95">
              ⬇️ Descargar Excel
            </button>
          )}
        </div>
        {error && <p className="mt-3 text-[10px] font-bold text-red-600 bg-red-50 px-4 py-2 rounded-lg">⚠️ {error}</p>}
        <p className="mt-3 text-[9px] text-slate-400 font-semibold leading-relaxed">
          Lectura de cada celda: <b>valor (% real / % meta)</b>. GESTIONABLE se mide sobre TOTAL LEADS;
          INGRESOS CRM y FALTANTE se miden sobre GESTIONABLE. La meta de venta subida es el 30 % de la
          meta de gestionables (50 % de los leads), redondeada hacia abajo.
        </p>
      </div>

      {/* Tablas */}
      {loading && !data && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-sm font-black text-slate-400">
          ⏳ Cargando efectividad diaria...
        </div>
      )}
      {data && data.agencias.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-sm font-black text-slate-400">
          No hay leads en el período seleccionado.
        </div>
      )}
      {data && data.agencias.length > 0 && (
        <div className="space-y-6">
          {data.agencias.map(bloque => (
            <TablaAgencia key={bloque.agencia} bloque={bloque} fechas={data.fechas} tema={tema} />
          ))}
          {data.agencias.length > 1 && (
            <TablaAgencia bloque={data.consolidado} fechas={data.fechas} tema={tema} destacado />
          )}
        </div>
      )}
    </div>
  );
}
