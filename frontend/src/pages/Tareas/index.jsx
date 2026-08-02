/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MÓDULO DE TAREAS Y ACUERDOS
 * ═══════════════════════════════════════════════════════════════════════════════
 * Contenedor con tres pestañas: Mis Tareas · Lista · Dashboard.
 * El detalle y el formulario son overlays, así que no hay rutas anidadas.
 */

import { useState, useCallback } from 'react';
import { ClipboardList, ListFilter, BarChart3, Bell } from 'lucide-react';
import { useCatalogos, useNotificacionesTareas } from '../../hooks/useTareas';
import { Cargando, ErrorBox, tiempoRelativo } from './ui';
import MisTareas from './MisTareas';
import TareasLista from './TareasLista';
import TareasDashboard from './TareasDashboard';
import TareaFormModal from './TareaFormModal';
import TareaDetallePanel from './TareaDetallePanel';

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
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">

      {/* ── Encabezado ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Tareas y Acuerdos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {yo.area_nombre} · {yo.cargo_nombre}
          </p>
        </div>

        {/* Campanita */}
        <div className="relative">
          <button onClick={() => setPanelNotis(v => !v)}
            className="relative rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50">
            <Bell size={18} className="text-slate-600" />
            {noti.noLeidas > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-rose-500
                               text-white text-[10px] font-bold flex items-center justify-center px-1">
                {noti.noLeidas > 99 ? '99+' : noti.noLeidas}
              </span>
            )}
          </button>

          {panelNotis && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setPanelNotis(false)} />
              <div className="absolute right-0 top-full mt-2 z-40 w-80 rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
                  <span className="text-sm font-bold text-slate-700">Notificaciones</span>
                  {noti.noLeidas > 0 && (
                    <button onClick={noti.marcarTodas}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                      Marcar todas
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {noti.items.length === 0 ? (
                    <p className="px-4 py-8 text-sm text-slate-400 text-center">Sin notificaciones.</p>
                  ) : noti.items.map(n => (
                    <button key={n.id}
                      onClick={() => {
                        noti.marcarLeida(n.id);
                        setAbierta(n.tarea_id);
                        setPanelNotis(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 border-b border-slate-50 hover:bg-slate-50
                        ${!n.leida ? 'bg-blue-50/40' : ''}`}>
                      <div className="flex gap-2">
                        {!n.leida && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
                        <div className={!n.leida ? '' : 'pl-3.5'}>
                          <p className="text-sm text-slate-700 leading-snug">{n.mensaje}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{tiempoRelativo(n.created_at)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Pestañas ──────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-slate-200 mb-5">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition
              ${tab === t.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <t.icono size={15} />
            {t.label}
          </button>
        ))}
      </div>

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
