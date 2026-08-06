/**
 * Panel lateral con el detalle completo de una tarea:
 * datos, subtareas, comentarios e historial de auditoría.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  X, Send, Loader2, GitBranch, Plus, Calendar, User, Building2,
  History, MessageSquare, CheckCircle2, RotateCcw,
} from 'lucide-react';
import { tareasApi } from '../../hooks/useTareas';
import {
  Drawer, Cargando, ErrorBox, EstadoBadge, PrioridadBadge, TipoBadge,
  AreaChip, VencimientoBadge, Avatar, fmtFecha, fmtFechaHora, tiempoRelativo,
  ESTADO_UI, EmpresaBadge,
} from './ui';

const ETIQUETA_ACCION = {
  CREACION:      'creó la tarea',
  CAMBIO_ESTADO: 'cambió el estado',
  REASIGNACION:  'reasignó el responsable',
  CAMBIO_FECHA:  'cambió una fecha',
  EDICION:       'editó',
  COMENTARIO:    'comentó',
  CANCELACION:   'canceló la tarea',
  REAPERTURA:    'reabrió la tarea',
};

const ETIQUETA_CAMPO = {
  titulo: 'el título', descripcion: 'la descripción', prioridad: 'la prioridad',
  tipo: 'el tipo', progreso: 'el progreso', fecha_limite: 'la fecha límite',
  fecha_inicio: 'la fecha de inicio', estado: 'el estado',
  responsable_id: 'el responsable', areas_involucradas: 'las áreas involucradas',
  proyecto_id: 'el proyecto',
};

export default function TareaDetallePanel({ tareaId, catalogos, onCerrar, onCambio }) {
  const [d, setD]             = useState(null);
  const [cargando, setCarg]   = useState(true);
  const [error, setError]     = useState(null);
  const [tab, setTab]         = useState('comentarios');
  const [comentario, setCom]  = useState('');
  const [enviando, setEnv]    = useState(false);
  const [accionEnCurso, setAcc] = useState(null);

  const cargar = useCallback(() => {
    setCarg(true);
    return tareasApi.detalle(tareaId)
      .then(r => { setD(r); setError(null); })
      .catch(setError)
      .finally(() => setCarg(false));
  }, [tareaId]);

  useEffect(() => { cargar(); }, [cargar]);

  async function cambiarEstado(estado) {
    setAcc(estado);
    try {
      await tareasApi.cambiarEstado(tareaId, estado);
      await cargar();
      onCambio?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setAcc(null);
    }
  }

  async function comentar(e) {
    e.preventDefault();
    if (!comentario.trim()) return;
    setEnv(true);
    try {
      await tareasApi.comentar(tareaId, comentario);
      setCom('');
      await cargar();
      onCambio?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setEnv(false);
    }
  }

  async function toggleSubtarea(sub) {
    const nuevo = sub.estado === 'COMPLETADA' ? 'EN_PROCESO' : 'COMPLETADA';
    try {
      if (nuevo === 'COMPLETADA' && sub.estado === 'PENDIENTE') {
        await tareasApi.cambiarEstado(sub.id, 'EN_PROCESO');
        await tareasApi.cambiarEstado(sub.id, 'EN_REVISION');
      } else if (nuevo === 'COMPLETADA' && sub.estado === 'EN_PROCESO') {
        await tareasApi.cambiarEstado(sub.id, 'EN_REVISION');
      }
      await tareasApi.cambiarEstado(sub.id, nuevo);
      await cargar();
      onCambio?.();
    } catch (e) {
      alert(e.message);
    }
  }

  const t = d?.tarea;
  const p = d?.permisos;

  return (
    <Drawer open onClose={onCerrar}>
      {cargando && !d ? <Cargando /> : error ? (
        <div><Cabecera onCerrar={onCerrar} /><ErrorBox error={error} onReintentar={cargar} /></div>
      ) : (
        <>
          {/* ── Cabecera ───────────────────────────────────────────────────── */}
          <div className="px-6 py-4 border-b border-slate-100 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <TipoBadge tipo={t.tipo} />
                <EmpresaBadge empresa={t.empresa} />
                <span className="text-xs font-mono text-slate-400">{t.codigo}</span>
                <EstadoBadge estado={t.estado} />
                <PrioridadBadge prioridad={t.prioridad} />
                <VencimientoBadge tarea={t} />
              </div>
              <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50">
                <X size={20} />
              </button>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mt-2.5 leading-snug">{t.titulo}</h2>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* ── Acciones principales ─────────────────────────────────────── */}
            {p.transiciones.length > 0 && (
              <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-2">
                {p.transiciones.map(tr => {
                  const principal =
                    (t.estado === 'EN_PROCESO'  && tr.estado === 'EN_REVISION') ||
                    (t.estado === 'EN_REVISION' && tr.estado === 'COMPLETADA')  ||
                    (t.estado === 'PENDIENTE'   && tr.estado === 'EN_PROCESO');
                  const texto =
                    t.estado === 'EN_PROCESO'  && tr.estado === 'EN_REVISION' ? 'Enviar a revisión' :
                    t.estado === 'EN_REVISION' && tr.estado === 'COMPLETADA'  ? 'Aprobar y completar' :
                    t.estado === 'EN_REVISION' && tr.estado === 'EN_PROCESO'  ? 'Devolver para corregir' :
                    t.estado === 'PENDIENTE'   && tr.estado === 'EN_PROCESO'  ? 'Iniciar' :
                    t.estado === 'COMPLETADA'  && tr.estado === 'EN_PROCESO'  ? 'Reabrir' :
                    tr.etiqueta;

                  return (
                    <button key={tr.estado} onClick={() => cambiarEstado(tr.estado)}
                      disabled={!!accionEnCurso}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50
                        ${principal
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                      {accionEnCurso === tr.estado
                        ? <Loader2 size={14} className="animate-spin" />
                        : tr.estado === 'COMPLETADA' ? <CheckCircle2 size={14} />
                        : tr.estado === 'EN_PROCESO' && t.estado === 'COMPLETADA' ? <RotateCcw size={14} />
                        : null}
                      {texto}
                    </button>
                  );
                })}
              </div>
            )}

            {t.estado === 'EN_REVISION' && !p.roles.includes('SOLICITANTE') && !p.roles.includes('ADMIN') && (
              <div className="mx-6 mt-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                Esperando que <strong>{t.solicitante_nombre}</strong> revise y apruebe.
              </div>
            )}

            {/* ── Ficha ────────────────────────────────────────────────────── */}
            <div className="px-6 py-4 space-y-4">
              {t.descripcion && (
                <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{t.descripcion}</p>
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                <Dato icono={User} label="Responsable">
                  <div className="flex items-center gap-2">
                    <Avatar nombre={t.responsable_nombre} size={24} />
                    <span>{t.responsable_nombre}</span>
                  </div>
                </Dato>
                <Dato icono={User} label="Solicitante">
                  <div className="flex items-center gap-2">
                    <Avatar nombre={t.solicitante_nombre} size={24} />
                    <span>{t.solicitante_nombre}</span>
                  </div>
                </Dato>
                <Dato icono={Calendar} label="Se pide desde">{fmtFecha(t.fecha_solicitud)}</Dato>
                <Dato icono={Calendar} label="Debe entregar hasta">
                  <span className={t.esta_vencida ? 'text-rose-600 font-semibold' : ''}>
                    {fmtFecha(t.fecha_limite)}
                  </span>
                </Dato>
                {t.fecha_completada && (
                  <Dato icono={CheckCircle2} label="Completada el">
                    {fmtFecha(t.fecha_completada)}
                    {t.entregada_a_tiempo === true  && <span className="ml-1.5 text-emerald-600 text-xs font-semibold">a tiempo</span>}
                    {t.entregada_a_tiempo === false && <span className="ml-1.5 text-rose-600 text-xs font-semibold">con retraso</span>}
                  </Dato>
                )}
                {t.proyecto_nombre && (
                  <Dato icono={Building2} label="Proyecto">{t.proyecto_nombre}</Dato>
                )}
              </div>

              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Áreas</p>
                <div className="flex flex-wrap gap-1.5">
                  {t.area_responsable_nombre && (
                    <AreaChip nombre={t.area_responsable_nombre} color={t.area_responsable_color} />
                  )}
                  {(t.areas_involucradas || []).map(a => (
                    <AreaChip key={a.id} nombre={a.nombre} color={a.color} />
                  ))}
                </div>
              </div>
            </div>

            {/* ── Subtareas ────────────────────────────────────────────────── */}
            {d.subtareas.length > 0 && (
              <div className="px-6 pb-4">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <GitBranch size={12} />
                  Subtareas ({d.subtareas.length - t.subtareas_abiertas}/{d.subtareas.length})
                </p>
                <div className="space-y-1.5">
                  {d.subtareas.map(s => (
                    <div key={s.id}
                      className="flex items-center gap-2.5 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
                      <button onClick={() => toggleSubtarea(s)}
                        className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition
                          ${s.estado === 'COMPLETADA'
                            ? 'bg-emerald-500 border-emerald-500'
                            : 'border-slate-300 hover:border-blue-400'}`}>
                        {s.estado === 'COMPLETADA' && <CheckCircle2 size={11} className="text-white" />}
                      </button>
                      <span className={`text-sm flex-1 min-w-0 truncate ${
                        s.estado === 'COMPLETADA' ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                        {s.titulo}
                      </span>
                      <span className="text-xs text-slate-400 shrink-0">{s.responsable_nombre}</span>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ESTADO_UI[s.estado]?.punto}`} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Pestañas ─────────────────────────────────────────────────── */}
            <div className="border-t border-slate-100">
              <div className="flex gap-1 px-6 pt-3">
                {[
                  { id: 'comentarios', label: `Comentarios (${d.comentarios.length})`, icono: MessageSquare },
                  { id: 'historial',   label: `Historial (${d.historial.length})`,     icono: History },
                ].map(x => (
                  <button key={x.id} onClick={() => setTab(x.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition
                      ${tab === x.id
                        ? 'border-blue-600 text-blue-700'
                        : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                    <x.icono size={14} />
                    {x.label}
                  </button>
                ))}
              </div>

              <div className="px-6 py-4">
                {tab === 'comentarios' ? (
                  d.comentarios.length === 0 ? (
                    <p className="text-sm text-slate-400 py-4 text-center">Todavía no hay comentarios.</p>
                  ) : (
                    <div className="space-y-3">
                      {d.comentarios.map(c => (
                        <div key={c.id} className="flex gap-2.5">
                          <Avatar nombre={c.usuario_nombre} size={30} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm font-semibold text-slate-700">{c.usuario_nombre}</span>
                              <span className="text-xs text-slate-400">{tiempoRelativo(c.created_at)}</span>
                              {c.editado_at && <span className="text-xs text-slate-300">(editado)</span>}
                            </div>
                            <p className="text-sm text-slate-600 whitespace-pre-wrap mt-0.5">{c.comentario}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="space-y-2.5">
                    {d.historial.map(h => (
                      <div key={h.id} className="flex gap-2.5 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-slate-600">
                            <strong className="text-slate-700">{h.usuario_nombre || 'Sistema'}</strong>{' '}
                            {ETIQUETA_ACCION[h.accion] || h.accion}
                            {h.campo && ETIQUETA_CAMPO[h.campo] ? ` ${ETIQUETA_CAMPO[h.campo]}` : ''}
                            {h.valor_anterior && h.valor_nuevo && (
                              <>: <span className="text-slate-400 line-through">{corta(h.valor_anterior)}</span>
                                {' → '}
                                <span className="font-medium text-slate-700">{corta(h.valor_nuevo)}</span></>
                            )}
                            {!h.valor_anterior && h.valor_nuevo && (
                              <>: <span className="font-medium text-slate-700">{corta(h.valor_nuevo)}</span></>
                            )}
                          </p>
                          <p className="text-xs text-slate-400">{fmtFechaHora(h.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Caja de comentario ─────────────────────────────────────────── */}
          <form onSubmit={comentar} className="px-6 py-3 border-t border-slate-100 shrink-0 flex gap-2">
            <input
              value={comentario}
              onChange={e => setCom(e.target.value)}
              placeholder="Escribe un comentario…"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
            <button type="submit" disabled={enviando || !comentario.trim()}
              className="rounded-lg bg-blue-600 text-white px-3.5 py-2 hover:bg-blue-700 disabled:opacity-40">
              {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
        </>
      )}
    </Drawer>
  );
}

function Cabecera({ onCerrar }) {
  return (
    <div className="px-6 py-4 border-b border-slate-100 flex justify-end">
      <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
    </div>
  );
}

function Dato({ icono: Icono, label, children }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
        <Icono size={11} /> {label}
      </p>
      <div className="text-sm text-slate-700">{children}</div>
    </div>
  );
}

function corta(v) {
  const s = String(v);
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}
