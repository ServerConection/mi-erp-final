/**
 * Bandeja personal. Pantalla de entrada del módulo.
 * Agrupa por urgencia: vencidas / hoy / esta semana / más adelante / cerradas.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Inbox, CheckCircle2, AlertTriangle, Clock, CalendarDays, Plus } from 'lucide-react';
import { useMisTareas, tareasApi } from '../../hooks/useTareas';
import { ErrorBox, SkeletonKpis, SkeletonTareas, Vacio } from './ui';
import './tareas.css';
import TareaCard from './TareaCard';

const GRUPOS = [
  { id: 'vencidas', titulo: 'Vencidas',      icono: AlertTriangle, color: 'text-rose-600',    abierto: true  },
  { id: 'hoy',      titulo: 'Vence hoy',     icono: Clock,         color: 'text-amber-600',   abierto: true  },
  { id: 'semana',   titulo: 'Esta semana',   icono: CalendarDays,  color: 'text-blue-600',    abierto: true  },
  { id: 'despues',  titulo: 'Más adelante',  icono: Inbox,         color: 'text-slate-500',   abierto: true  },
  { id: 'cerradas', titulo: 'Cerradas',      icono: CheckCircle2,  color: 'text-emerald-600', abierto: false },
];

export default function MisTareas({ yoId, onAbrirTarea, onNuevaTarea, refrescarToken }) {
  const [rol, setRol] = useState('responsable');
  const { datos, cargando, error, recargar } = useMisTareas(rol);
  const [colapsados, setColapsados] = useState(
    () => Object.fromEntries(GRUPOS.filter(g => !g.abierto).map(g => [g.id, true]))
  );

  async function cambiarEstado(id, estado) {
    try {
      await tareasApi.cambiarEstado(id, estado);
      await recargar();
      refrescarToken?.();
    } catch (e) {
      alert(e.message);
    }
  }

  if (cargando && !datos) {
    return (
      <div className="space-y-5">
        <SkeletonKpis />
        <SkeletonTareas />
      </div>
    );
  }
  if (error) return <ErrorBox error={error} onReintentar={recargar} />;

  const c = datos?.contadores || {};
  const sinNada = (c.total || 0) === 0;

  return (
    <div className="space-y-5">

      {/* ── Contadores ────────────────────────────────────────────────────── */}
      <div className="tk-stagger grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Vencidas" valor={c.vencidas} tono="rose"    icono={AlertTriangle} />
        <Kpi label="Vence hoy" valor={c.hoy}     tono="amber"   icono={Clock} />
        <Kpi label="Esta semana" valor={c.semana} tono="blue"   icono={CalendarDays} />
        <Kpi label="Abiertas" valor={c.abiertas} tono="slate"   icono={Inbox} />
      </div>

      {/* ── Selector de rol ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {[
            { id: 'responsable', label: 'Asignadas a mí' },
            { id: 'solicitante', label: 'Que yo pedí' },
          ].map(o => (
            <button key={o.id} onClick={() => setRol(o.id)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition
                ${rol === o.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Grupos ────────────────────────────────────────────────────────── */}
      {sinNada ? (
        <Vacio
          titulo={rol === 'responsable' ? 'No tienes tareas asignadas' : 'No has pedido nada todavía'}
          texto={rol === 'responsable'
            ? 'Cuando alguien te asigne una tarea o un acuerdo, aparecerá aquí.'
            : 'Crea una tarea y asígnala a quien corresponda para hacerle seguimiento.'}
          accion={
            <button onClick={onNuevaTarea}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:from-blue-700 hover:to-violet-700">
              <Plus size={16} /> Crear la primera
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {GRUPOS.map(g => {
            const items = datos?.grupos?.[g.id] || [];
            if (items.length === 0) return null;
            const cerrado = colapsados[g.id];

            return (
              <section key={g.id}>
                <button
                  onClick={() => setColapsados(p => ({ ...p, [g.id]: !p[g.id] }))}
                  className="flex items-center gap-2 mb-2.5 group"
                >
                  {cerrado ? <ChevronRight size={16} className="text-slate-400" />
                           : <ChevronDown size={16} className="text-slate-400" />}
                  <g.icono size={15} className={g.color} />
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600 group-hover:text-slate-800">
                    {g.titulo}
                  </h2>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                    {items.length}
                  </span>
                </button>

                {!cerrado && (
                  <div className="tk-stagger space-y-2">
                    {items.map(t => (
                      <TareaCard key={t.id} tarea={t} yoId={yoId}
                        onAbrir={onAbrirTarea} onCambiarEstado={cambiarEstado} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

const TONOS = {
  rose:  { caja: 'border-rose-200 bg-rose-50/70',   texto: 'text-rose-700',   pill: 'from-rose-500 to-red-500 shadow-rose-100'      },
  amber: { caja: 'border-amber-200 bg-amber-50/70', texto: 'text-amber-700',  pill: 'from-amber-500 to-orange-500 shadow-amber-100' },
  blue:  { caja: 'border-blue-200 bg-blue-50/70',   texto: 'text-blue-700',   pill: 'from-blue-500 to-violet-500 shadow-blue-100'   },
  slate: { caja: 'border-slate-200 bg-white',       texto: 'text-slate-700',  pill: 'from-slate-500 to-slate-600 shadow-slate-100'  },
};

function Kpi({ label, valor, tono, icono: Icono }) {
  const t = TONOS[tono] || TONOS.slate;
  const cero = !valor;
  return (
    <div className={`tk-card rounded-2xl border p-4 shadow-sm ${cero ? 'border-slate-200 bg-white' : t.caja}`}>
      <div className="flex items-center gap-3">
        <div className={`rounded-xl p-2.5 text-white shadow-md ${cero ? 'bg-slate-300' : `bg-gradient-to-br ${t.pill}`}`}>
          <Icono size={16} />
        </div>
        <div className="min-w-0">
          <p className={`text-2xl font-bold leading-none tabular-nums ${cero ? 'text-slate-300' : t.texto}`}>{valor ?? 0}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
