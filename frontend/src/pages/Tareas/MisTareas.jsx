/**
 * Bandeja personal. Pantalla de entrada del módulo.
 * Agrupa por urgencia: vencidas / hoy / esta semana / más adelante / cerradas.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Inbox, CheckCircle2, AlertTriangle, Clock, CalendarDays } from 'lucide-react';
import { useMisTareas, tareasApi } from '../../hooks/useTareas';
import { Cargando, ErrorBox, Vacio } from './ui';
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

  if (cargando && !datos) return <Cargando texto="Cargando tus tareas…" />;
  if (error) return <ErrorBox error={error} onReintentar={recargar} />;

  const c = datos?.contadores || {};
  const sinNada = (c.total || 0) === 0;

  return (
    <div className="space-y-5">

      {/* ── Contadores ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Vencidas" valor={c.vencidas} tono="rose"    icono={AlertTriangle} />
        <Kpi label="Vence hoy" valor={c.hoy}     tono="amber"   icono={Clock} />
        <Kpi label="Esta semana" valor={c.semana} tono="blue"   icono={CalendarDays} />
        <Kpi label="Abiertas" valor={c.abiertas} tono="slate"   icono={Inbox} />
      </div>

      {/* ── Selector de rol ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {[
            { id: 'responsable', label: 'Asignadas a mí' },
            { id: 'solicitante', label: 'Que yo pedí' },
          ].map(o => (
            <button key={o.id} onClick={() => setRol(o.id)}
              className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition
                ${rol === o.id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {o.label}
            </button>
          ))}
        </div>

        <button onClick={onNuevaTarea}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          + Nueva tarea
        </button>
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
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Crear la primera
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
                  <div className="space-y-2">
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
  rose:  { caja: 'border-rose-200 bg-rose-50',       texto: 'text-rose-700',    icono: 'text-rose-400'    },
  amber: { caja: 'border-amber-200 bg-amber-50',     texto: 'text-amber-700',   icono: 'text-amber-400'   },
  blue:  { caja: 'border-blue-200 bg-blue-50',       texto: 'text-blue-700',    icono: 'text-blue-400'    },
  slate: { caja: 'border-slate-200 bg-white',        texto: 'text-slate-700',   icono: 'text-slate-300'   },
};

function Kpi({ label, valor, tono, icono: Icono }) {
  const t = TONOS[tono] || TONOS.slate;
  const cero = !valor;
  return (
    <div className={`rounded-xl border p-3.5 ${cero ? 'border-slate-200 bg-white' : t.caja}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <Icono size={15} className={cero ? 'text-slate-300' : t.icono} />
      </div>
      <p className={`text-2xl font-bold mt-1 ${cero ? 'text-slate-300' : t.texto}`}>{valor ?? 0}</p>
    </div>
  );
}
