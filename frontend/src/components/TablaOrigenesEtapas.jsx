import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { agruparOrigenesEtapas, diasPeriodo } from '../utils/origenesEtapas';
const numero = value => value.toLocaleString('es-EC');
const porcentaje = (cantidad, total) => `${total ? (cantidad / total * 100).toFixed(1) : '0.0'}%`;
export default function TablaOrigenesEtapas({ filas = [], periodo, loading }) {
  const [abiertos, setAbiertos] = useState(new Set());
  const grupos = useMemo(() => agruparOrigenesEtapas(filas), [filas]);
  const dias = useMemo(() => diasPeriodo(periodo?.desde, periodo?.hasta), [periodo?.desde, periodo?.hasta]);
  const total = grupos.reduce((sum, g) => sum + g.total, 0);
  const todosAbiertos = grupos.length > 0 && grupos.every(g => abiertos.has(g.nombre));
  const alternar = nombre => setAbiertos(prev => {
    const next = new Set(prev); if (next.has(nombre)) next.delete(nombre); else next.add(nombre); return next;
  });
  return <section aria-label="Distribución de leads por origen y etapa" aria-busy={loading} className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-5 py-4 border-b border-slate-200">
      <div><h3 className="text-xs font-black text-slate-800 uppercase tracking-wide">Leads por origen y etapa</h3><p className="text-xs text-slate-500 mt-1">{grupos.length} orígenes · {numero(total)} leads · Por fecha de creación</p></div>
      <button type="button" disabled={!grupos.length || loading} onClick={() => setAbiertos(todosAbiertos ? new Set() : new Set(grupos.map(g => g.nombre)))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40">{todosAbiertos ? 'Contraer todos' : 'Desplegar todos'}</button>
    </div>
    <p className="px-5 py-3 text-xs text-slate-500">Despliega un origen para ver sus etapas. El % del origen se calcula sobre el total filtrado; el % de cada etapa, sobre el total de su origen. Venta Subida se distribuye por creación del lead.</p>
    {loading ? <p role="status" className="px-5 py-8 text-sm text-slate-500">Actualizando distribución…</p> : filas === undefined || !periodo ? <p role="status" className="px-5 py-8 text-sm text-slate-500">La distribución por origen todavía no está disponible.</p> : !grupos.length ? <p className="px-5 py-8 text-sm text-slate-500">No hay leads para los filtros seleccionados.</p> : <div className="overflow-auto max-h-[650px]" tabIndex={0} role="region" aria-label="Tabla por origen, con desplazamiento horizontal para consultar los días">
      <table className="w-full border-collapse text-xs whitespace-nowrap">
        <thead className="sticky top-0 z-20 bg-slate-100 text-slate-600"><tr>
          <th scope="col" className="sticky left-0 z-30 bg-slate-100 text-left px-5 py-3 min-w-60">Origen / etapa</th>
          <th scope="col" className="px-4 py-3 text-center">Total</th><th scope="col" className="px-4 py-3 text-center">%</th>
          {dias.map(dia => <th scope="col" key={dia} className="px-4 py-3 text-center" title={dia}>{dia.slice(8)}/{dia.slice(5, 7)}</th>)}
        </tr></thead>
        <tbody>
          <tr className="bg-slate-800 text-white font-bold"><th scope="row" className="sticky left-0 bg-slate-800 px-5 py-3 text-left">TOTAL FILTRADO</th><td className="text-center px-4 py-3">{numero(total)}</td><td className="text-center px-4 py-3">{porcentaje(total, total)}</td>{dias.map(d => <td key={d} className="text-center px-4 py-3 tabular-nums">{numero(grupos.reduce((sum, g) => sum + (g.dias[d] || 0), 0))}</td>)}</tr>
          {grupos.map(g => <Fragment key={g.nombre}>
            <tr className="bg-blue-50 text-slate-800 border-b border-slate-200 font-semibold">
              <th scope="row" className="sticky left-0 bg-blue-50 px-5 py-3 text-left"><button type="button" aria-expanded={abiertos.has(g.nombre)} onClick={() => alternar(g.nombre)} className="flex items-center gap-2 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{abiertos.has(g.nombre) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<span>{g.nombre}</span><span className="text-[10px] text-slate-500 font-normal">{g.etapas.length} etapas</span></button></th>
              <td className="text-center px-4 py-3">{numero(g.total)}</td><td className="text-center px-4 py-3">{porcentaje(g.total, total)}</td>{dias.map(d => <td key={d} className="text-center px-4 py-3 tabular-nums">{numero(g.dias[d] || 0)}</td>)}
            </tr>
            {abiertos.has(g.nombre) && g.etapas.map(e => <tr key={e.nombre} className="border-b border-slate-100 text-slate-600">
              <th scope="row" className="sticky left-0 bg-white pl-12 pr-5 py-3 text-left font-medium">{e.nombre}</th><td className="text-center px-4 py-3 tabular-nums">{numero(e.total)}</td><td className="text-center px-4 py-3">{porcentaje(e.total, g.total)}</td>{dias.map(d => <td key={d} className={`text-center px-4 py-3 tabular-nums ${e.dias[d] ? '' : 'text-slate-300'}`}>{numero(e.dias[d] || 0)}</td>)}
            </tr>)}
          </Fragment>)}
        </tbody>
      </table>
    </div>}
  </section>;
}
