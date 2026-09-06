/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MÓDULO DE TAREAS Y ACUERDOS
 * ═══════════════════════════════════════════════════════════════════════════════
 * Contenedor con tres pestañas: Mis Tareas · Lista · Dashboard.
 * El detalle y el formulario son overlays, así que no hay rutas anidadas.
 */

import { useState, useCallback } from 'react';
import { ClipboardList, ListFilter, BarChart3, Bell, CheckCheck, Plus } from 'lucide-react';
import { useCatalogos, useNotificacionesTareas } from '../../hooks/useTareas';
import { Cargando, ErrorBox, tiempoRelativo } from './ui';
import MisTareas from './MisTareas';
import TareasLista from './TareasLista';
import TareasDashboard from './TareasDashboard';
import TareaFormModal from './TareaFormModal';
import TareaDetallePanel from './TareaDetallePanel';
import './tareas.css';

export default function Tareas() {
  const { catalogos, cargando, error } = useCatalogos();
  const [tab, setTab]             = useState('mis-tareas');
  const [tareaAbierta, setAbierta] = useState(null);
  const [formAbierto, setForm]     = useState(false);
  const [version, setVersion]      = useState(0);   // fuerza recarga de las listas
  const [panelNotis, setPanelNotis] = useState(false);

  const noti = useNotificacionesTareas();

  const refrescar = useCallback(() => {
    setVersion(v => v + 1);
    noti.recargar();
  }, [noti]);

  if (cargando) return <div className="p-6"><Cargando texto="Abriendo el módulo…" /></div>;
  if (error)    return <ErrorBox error={error} />;

  const yo = catalogos.yo;
  const puedeVerDashboard = yo.es_jefatura || yo.es_admin;

  const TABS = [
    { id: 'mis-tareas', label: 'Mis Tareas', icono: ClipboardList },
    { id: 'lista',      label: 'Lista',      icono: ListFilter },
    ...(puedeVerDashboard ? [{ id: 'dashboard', label: 'Dashboard', icono: BarChart3 }] : []),
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">

      {/* ── Encabezado ────────────────────────────────────────────────────── */}
      <div className="tk-hero border-b border-slate-200">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 p-3 text-white shadow-lg shadow-blue-200">
                <ClipboardList className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-800 sm:text-2xl">
                  Tareas y Acuerdos
                </h1>
                <p className="text-sm text-slate-500">
                  {[yo.area_nombre, yo.cargo_nombre, yo.empresa].filter(Boolean).join(' · ') || 'Seguimiento de compromisos'}
                </p>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-3">
              {/* Pestañas con indicador deslizante */}
              <div className="relative flex rounded-xl bg-white/70 p-1 ring-1 ring-slate-200 backdrop-blur">
                <span
                  className="absolute inset-y-1 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 shadow-md shadow-blue-200 transition-all duration-300"
                  style={{
                    width: `calc((100% - 0.5rem) / ${TABS.length})`,
                    left: `calc(0.25rem + ${Math.max(0, TABS.findIndex(t => t.id === tab))} * (100% - 0.5rem) / ${TABS.length})`,
                  }}
                />
                {TABS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`relative z-10 inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      tab === t.id ? 'text-white' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <t.icono size={15} /> {t.label}
                  </button>
                ))}
              </div>

              {/* Campanita */}
              <div className="relative">
                <button
                  onClick={() => setPanelNotis(v => !v)}
                  className="relative rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition hover:bg-slate-50"
                  title="Notificaciones"
                >
                  <Bell size={18} className="text-slate-600" />
                  {noti.noLeidas > 0 && (
                    <span className="tk-badge-pulse absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                      {noti.noLeidas > 99 ? '99+' : noti.noLeidas}
                    </span>
                  )}
                </button>

                {panelNotis && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setPanelNotis(false)} />
                    <div className="tk-pop absolute right-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                      <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-blue-50/70 to-violet-50/50 px-4 py-3">
                        <span className="text-sm font-bold text-slate-700">Notificaciones</span>
                        {noti.noLeidas > 0 && (
                          <button
                            onClick={noti.marcarTodas}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 transition hover:text-blue-800"
                          >
                            <CheckCheck size={13} /> Marcar todas
                          </button>
                        )}
                      </div>
                      <div className="tk-scroll max-h-96 overflow-y-auto">
                        {noti.items.length === 0 ? (
                          <p className="px-4 py-10 text-center text-sm text-slate-400">Sin notificaciones.</p>
                        ) : noti.items.map(n => (
                          <button
                            key={n.id}
                            onClick={() => {
                              noti.marcarLeida(n.id);
                              setAbierta(n.tarea_id);
                              setPanelNotis(false);
                            }}
                            className={`w-full border-b border-slate-50 px-4 py-2.5 text-left transition hover:bg-slate-50 ${!n.leida ? 'bg-blue-50/40' : ''}`}
                          >
                            <div className="flex gap-2">
                              {!n.leida && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />}
                              <div className={!n.leida ? '' : 'pl-3.5'}>
                                <p className="text-sm leading-snug text-slate-700">{n.mensaje}</p>
                                <p className="mt-0.5 text-xs text-slate-400">{tiempoRelativo(n.created_at)}</p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Nueva tarea */}
              <button
                onClick={() => setForm(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:from-blue-700 hover:to-violet-700"
              >
                <Plus size={16} /> Nueva tarea
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      {/* ── Contenido ─────────────────────────────────────────────────────── */}
      <div key={`${tab}-${version}`}>
        {tab === 'mis-tareas' && (
          <MisTareas
            yoId={yo.id}
            onAbrirTarea={setAbierta}
            onNuevaTarea={() => setForm(true)}
            refrescarToken={refrescar}
          />
        )}
        {tab === 'lista' && (
          <TareasLista
            catalogos={catalogos}
            onAbrirTarea={setAbierta}
            onNuevaTarea={() => setForm(true)}
          />
        )}
        {tab === 'dashboard' && puedeVerDashboard && (
          <TareasDashboard onAbrirTarea={setAbierta} />
        )}
      </div>

      </div>

      {/* ── Overlays ──────────────────────────────────────────────────────── */}
      {formAbierto && (
        <TareaFormModal
          catalogos={catalogos}
          onCerrar={() => setForm(false)}
          onCreada={(t) => { setForm(false); refrescar(); setAbierta(t.id); }}
        />
      )}

      {tareaAbierta && (
        <TareaDetallePanel
          tareaId={tareaAbierta}
          catalogos={catalogos}
          onCerrar={() => { setAbierta(null); refrescar(); }}
          onCambio={refrescar}
        />
      )}
    </div>
  );
}
