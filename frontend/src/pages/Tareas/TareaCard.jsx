/**
 * Tarjeta de tarea para la bandeja "Mis Tareas".
 * Permite cambiar el estado sin abrir el detalle.
 */

import { useState } from 'react';
import { MessageSquare, GitBranch, ChevronDown, Calendar } from 'lucide-react';
import {
  EstadoBadge, PrioridadBadge, TipoBadge, AreaChip, VencimientoBadge,
  Avatar, fmtFechaCorta, ESTADO_UI,
} from './ui';

const TRANSICIONES_RAPIDAS = {
  PENDIENTE:   [{ a: 'EN_PROCESO',  texto: 'Iniciar' }],
  EN_PROCESO:  [{ a: 'EN_REVISION', texto: 'Enviar a revisión' }],
  EN_REVISION: [
    { a: 'COMPLETADA', texto: 'Aprobar y completar' },
    { a: 'EN_PROCESO', texto: 'Devolver para corregir' },
  ],
  COMPLETADA:  [{ a: 'EN_PROCESO', texto: 'Reabrir' }],
  CANCELADA:   [{ a: 'PENDIENTE',  texto: 'Reactivar' }],
};

export default function TareaCard({ tarea, onAbrir, onCambiarEstado, yoId }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const soyResponsable = tarea.responsable_id === yoId;
  const soySolicitante = tarea.solicitante_id === yoId;

  // Solo ofrecemos los atajos que este usuario realmente puede ejecutar.
  const opciones = (TRANSICIONES_RAPIDAS[tarea.estado] || []).filter(o => {
    if (tarea.estado === 'EN_REVISION') return soySolicitante;
    if (tarea.estado === 'COMPLETADA')  return soySolicitante;
    if (o.a === 'EN_REVISION')          return soyResponsable;
    return soyResponsable || soySolicitante;
  });

  async function ejecutar(estado) {
    setMenuAbierto(false);
    setOcupado(true);
    try { await onCambiarEstado(tarea.id, estado); }
    finally { setOcupado(false); }
  }

  const cerrada = ['COMPLETADA', 'CANCELADA'].includes(tarea.estado);

  return (
    <div
      className={`group relative rounded-xl border bg-white p-4 transition-all hover:shadow-md
        ${tarea.esta_vencida ? 'border-rose-200' : 'border-slate-200'}
        ${cerrada ? 'opacity-70' : ''}`}
    >
      {/* Franja de prioridad */}
      {tarea.prioridad === 'URGENTE' && !cerrada && (
        <span className="absolute left-0 top-4 bottom-4 w-1 rounded-r bg-rose-500" />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onAbrir(tarea.id)}>
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <TipoBadge tipo={tarea.tipo} />
            <span className="text-[11px] font-mono text-slate-400">{tarea.codigo}</span>
            <PrioridadBadge prioridad={tarea.prioridad} />
            <VencimientoBadge tarea={tarea} />
          </div>

          <h3 className={`font-semibold text-slate-800 leading-snug ${cerrada ? 'line-through text-slate-500' : ''}`}>
            {tarea.titulo}
          </h3>

          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Calendar size={12} />
              {fmtFechaCorta(tarea.fecha_limite)}
            </span>

            {soyResponsable ? (
              <span>Pidió: <strong className="text-slate-600">{tarea.solicitante_nombre}</strong></span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Avatar nombre={tarea.responsable_nombre} size={18} />
                {tarea.responsable_nombre}
              </span>
            )}

            {tarea.total_subtareas > 0 && (
              <span className="inline-flex items-center gap-1">
                <GitBranch size={12} />
                {tarea.total_subtareas - tarea.subtareas_abiertas}/{tarea.total_subtareas}
              </span>
            )}

            {tarea.total_comentarios > 0 && (
              <span className="inline-flex items-center gap-1">
                <MessageSquare size={12} />
                {tarea.total_comentarios}
              </span>
            )}
          </div>

          {(tarea.areas_involucradas?.length > 0 || tarea.area_responsable_nombre) && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {tarea.area_responsable_nombre && (
                <AreaChip nombre={tarea.area_responsable_nombre} color={tarea.area_responsable_color} />
              )}
              {(tarea.areas_involucradas || []).map(a => (
                <AreaChip key={a.id} nombre={a.nombre} color={a.color} />
              ))}
            </div>
          )}
        </div>

        {/* Cambio de estado rápido */}
        <div className="relative shrink-0">
          <button
            onClick={() => opciones.length > 0 && setMenuAbierto(v => !v)}
            disabled={ocupado || opciones.length === 0}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition
              ${ESTADO_UI[tarea.estado]?.clase}
              ${opciones.length > 0 ? 'hover:brightness-95 cursor-pointer' : 'cursor-default'}
              ${ocupado ? 'opacity-50' : ''}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${ESTADO_UI[tarea.estado]?.punto}`} />
            {ESTADO_UI[tarea.estado]?.label}
            {opciones.length > 0 && <ChevronDown size={13} />}
          </button>

          {menuAbierto && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuAbierto(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 w-52 rounded-xl border border-slate-200 bg-white shadow-lg py-1">
                {opciones.map(o => (
                  <button
                    key={o.a}
                    onClick={() => ejecutar(o.a)}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${ESTADO_UI[o.a]?.punto}`} />
                    {o.texto}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {tarea.progreso > 0 && tarea.progreso < 100 && (
        <div className="mt-3 h-1 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${tarea.progreso}%` }} />
        </div>
      )}
    </div>
  );
}
