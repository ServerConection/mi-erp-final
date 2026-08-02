/**
 * Vista de lista: tabla densa con filtros y exportación a Excel.
 */

import { useState } from 'react';
import { Search, Download, X, Loader2, ChevronLeft, ChevronRight, FileSpreadsheet } from 'lucide-react';
import { useListaTareas, descargarExcel } from '../../hooks/useTareas';
import {
  Cargando, ErrorBox, Vacio, EstadoBadge, PrioridadBadge, TipoBadge,
  AreaChip, Avatar, fmtFechaCorta,
} from './ui';

const FILTROS_INICIALES = {
  q: '', estado: '', prioridad: '', tipo: '', area_id: '',
  responsable_id: '', proyecto_id: '', desde: '', hasta: '',
  vencidas: '', solo_principales: '1',
  orden_por: 'fecha_limite', orden_dir: 'ASC', page: 1, limit: 50,
};

const selectCls =
  'rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700 bg-white ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-400';

export default function TareasLista({ catalogos, onAbrirTarea, onNuevaTarea }) {
  const [f, setF] = useState(FILTROS_INICIALES);
  const [descargando, setDescargando] = useState(false);
  const { tareas, paginacion, cargando, error, recargar } = useListaTareas(f);

  const set = (k, v) => setF(prev => ({ ...prev, [k]: v, page: k === 'page' ? v : 1 }));

  const hayFiltros = Object.entries(f).some(([k, v]) =>
    !['orden_por', 'orden_dir', 'page', 'limit', 'solo_principales'].includes(k) && v !== '');

  async function exportar() {
    setDescargando(true);
    try { await descargarExcel(f); }
    catch (e) { alert(e.message); }
    finally { setDescargando(false); }
  }

  function ordenarPor(campo) {
    setF(prev => ({
      ...prev,
      orden_por: campo,
      orden_dir: prev.orden_por === campo && prev.orden_dir === 'ASC' ? 'DESC' : 'ASC',
      page: 1,
    }));
  }

  return (
    <div className="space-y-4">

      {/* ── Barra de filtros ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={f.q} onChange={e => set('q', e.target.value)}
              placeholder="Buscar por título, descripción o código…"
              className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-1.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-400"
            />
          </div>

          <button onClick={exportar} disabled={descargando || tareas.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            {descargando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Excel
          </button>

          <button onClick={onNuevaTarea}
            className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">
            + Nueva
          </button>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <select className={selectCls} value={f.estado} onChange={e => set('estado', e.target.value)}>
            <option value="">Todos los estados</option>
            {(catalogos?.estados || []).map(e => <option key={e.valor} value={e.valor}>{e.etiqueta}</option>)}
          </select>

          <select className={selectCls} value={f.tipo} onChange={e => set('tipo', e.target.value)}>
            <option value="">Todos los tipos</option>
            {(catalogos?.tipos || []).map(t => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
          </select>

          <select className={selectCls} value={f.prioridad} onChange={e => set('prioridad', e.target.value)}>
            <option value="">Toda prioridad</option>
            {(catalogos?.prioridades || []).map(p => <option key={p.valor} value={p.valor}>{p.etiqueta}</option>)}
          </select>

          <select className={selectCls} value={f.area_id} onChange={e => set('area_id', e.target.value)}>
            <option value="">Todas las áreas</option>
            {(catalogos?.areas || []).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>

          <select className={selectCls} value={f.responsable_id} onChange={e => set('responsable_id', e.target.value)}>
            <option value="">Todos los responsables</option>
            {(catalogos?.usuarios || []).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>

          <div className="flex items-center gap-1 text-sm text-slate-500">
            <input type="date" className={selectCls} value={f.desde} onChange={e => set('desde', e.target.value)} />
            <span>a</span>
            <input type="date" className={selectCls} value={f.hasta} onChange={e => set('hasta', e.target.value)} />
          </div>

          <label className="inline-flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={f.vencidas === '1'}
              onChange={e => set('vencidas', e.target.checked ? '1' : '')}
              className="rounded border-slate-300 text-rose-600 focus:ring-rose-400" />
            Solo vencidas
          </label>

          <label className="inline-flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={f.solo_principales === '1'}
              onChange={e => set('solo_principales', e.target.checked ? '1' : '')}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-400" />
            Ocultar subtareas
          </label>

          {hayFiltros && (
            <button onClick={() => setF(FILTROS_INICIALES)}
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
              <X size={13} /> Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ── Tabla ─────────────────────────────────────────────────────────── */}
      {error ? <ErrorBox error={error} onReintentar={recargar} />
      : cargando && tareas.length === 0 ? <Cargando />
      : tareas.length === 0 ? (
        <Vacio titulo="Sin resultados"
               texto="Ninguna tarea coincide con los filtros aplicados."
               icono={FileSpreadsheet} />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Th onClick={() => ordenarPor('titulo')} activo={f.orden_por === 'titulo'} dir={f.orden_dir}>Tarea</Th>
                  <Th onClick={() => ordenarPor('estado')} activo={f.orden_por === 'estado'} dir={f.orden_dir}>Estado</Th>
                  <Th onClick={() => ordenarPor('prioridad')} activo={f.orden_por === 'prioridad'} dir={f.orden_dir}>Prioridad</Th>
                  <Th>Responsable</Th>
                  <Th>Área</Th>
                  <Th>Solicitante</Th>
                  <Th onClick={() => ordenarPor('fecha_limite')} activo={f.orden_por === 'fecha_limite'} dir={f.orden_dir}>Límite</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tareas.map(t => (
                  <tr key={t.id} onClick={() => onAbrirTarea(t.id)}
                    className={`cursor-pointer hover:bg-slate-50 transition ${t.esta_vencida ? 'bg-rose-50/40' : ''}`}>
                    <td className="px-3 py-2.5 max-w-md">
                      <div className="flex items-center gap-2 mb-0.5">
                        <TipoBadge tipo={t.tipo} />
                        <span className="text-[10px] font-mono text-slate-400">{t.codigo}</span>
                        {t.es_subtarea && <span className="text-[10px] text-slate-400">↳ subtarea</span>}
                      </div>
                      <p className="font-medium text-slate-800 truncate">{t.titulo}</p>
                    </td>
                    <td className="px-3 py-2.5"><EstadoBadge estado={t.estado} /></td>
                    <td className="px-3 py-2.5"><PrioridadBadge prioridad={t.prioridad} /></td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Avatar nombre={t.responsable_nombre} size={22} />
                        <span className="text-slate-700 truncate max-w-[140px]">{t.responsable_nombre}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {t.area_responsable_nombre &&
                        <AreaChip nombre={t.area_responsable_nombre} color={t.area_responsable_color} />}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 truncate max-w-[140px]">{t.solicitante_nombre}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={t.esta_vencida ? 'text-rose-600 font-semibold' : 'text-slate-600'}>
                        {fmtFechaCorta(t.fecha_limite)}
                      </span>
                      {t.esta_vencida && (
                        <span className="block text-[10px] text-rose-500">
                          {t.dias_retraso}d tarde
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Paginación ──────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 text-sm text-slate-500">
            <span>
              {paginacion.total} tarea{paginacion.total === 1 ? '' : 's'}
              {paginacion.paginas > 1 && ` · página ${paginacion.page} de ${paginacion.paginas}`}
            </span>
            {paginacion.paginas > 1 && (
              <div className="flex gap-1">
                <button disabled={f.page <= 1} onClick={() => set('page', f.page - 1)}
                  className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-40">
                  <ChevronLeft size={15} />
                </button>
                <button disabled={f.page >= paginacion.paginas} onClick={() => set('page', f.page + 1)}
                  className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-40">
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, onClick, activo, dir }) {
  return (
    <th className={`px-3 py-2 ${onClick ? 'cursor-pointer select-none hover:text-slate-700' : ''}`}
        onClick={onClick}>
      <span className="inline-flex items-center gap-1">
        {children}
        {activo && <span className="text-slate-400">{dir === 'ASC' ? '↑' : '↓'}</span>}
      </span>
    </th>
  );
}
