/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MÓDULO EVALUACIONES
 * ═══════════════════════════════════════════════════════════════════════════════
 * Dos pestañas: "Mis evaluaciones" (cualquier usuario responde las suyas) y
 * "Gestionar" (solo quien puede crear: ADMINISTRADOR/GERENCIA/ANALISTA/SUPERVISOR).
 * Igual que Archivos Compartidos: sin rutas anidadas, se alterna con estado local.
 */

import { useCallback, useEffect, useState } from 'react';
import { GraduationCap, Plus, Users } from 'lucide-react';
import { evaluacionesApi } from '../../hooks/useEvaluaciones';
import { Aviso, Cargando, ErrorBox, EstadoBadge, Vacio, fechaCorta } from './ui';
import CrearEvaluacionModal from './CrearEvaluacionModal';
import TomarEvaluacion from './TomarEvaluacion';
import ResultadosPanel from './ResultadosPanel';

export default function Evaluaciones() {
  const [tab, setTab] = useState('mias'); // 'mias' | 'gestionar'
  const [tomando, setTomando]     = useState(null); // id de evaluación que se está respondiendo
  const [viendoResultados, setViendoResultados] = useState(null); // id de evaluación
  const [aviso, setAviso] = useState(null);

  const notificar = (mensaje, tipo = 'info') => setAviso({ mensaje, tipo });

  if (tomando) {
    return <div className="min-h-[calc(100vh-4rem)] bg-slate-50"><TomarEvaluacion evaluacionId={tomando} onVolver={() => setTomando(null)} /></div>;
  }
  if (viendoResultados) {
    return <ResultadosPanel evaluacionId={viendoResultados} onVolver={() => setViendoResultados(null)} />;
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-blue-50 p-2">
            <GraduationCap className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Evaluaciones</h1>
            <p className="text-xs text-slate-500">Capacitación y evaluación por módulo del ERP</p>
          </div>
        </div>

        <div className="ml-auto flex rounded-lg bg-slate-100 p-1 text-sm">
          <button
            onClick={() => setTab('mias')}
            className={`rounded-md px-3.5 py-1.5 font-medium transition ${tab === 'mias' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}
          >
            Mis evaluaciones
          </button>
          <button
            onClick={() => setTab('gestionar')}
            className={`rounded-md px-3.5 py-1.5 font-medium transition ${tab === 'gestionar' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}
          >
            Gestionar
          </button>
        </div>
      </div>

      {tab === 'mias'
        ? <TabMias onTomar={setTomando} />
        : <TabGestionar onVerResultados={setViendoResultados} notificar={notificar} />}

      <Aviso mensaje={aviso?.mensaje} tipo={aviso?.tipo} onCerrar={() => setAviso(null)} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Mis evaluaciones
// ══════════════════════════════════════════════════════════════════════════════

function TabMias({ onTomar }) {
  const [lista, setLista]       = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await evaluacionesApi.mias();
      setLista(r.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) return <Cargando texto="Cargando tus evaluaciones…" />;
  if (error) return <ErrorBox error={error} onReintentar={cargar} />;
  if (lista.length === 0) return <Vacio titulo="No tienes evaluaciones pendientes" texto="Cuando te asignen una, aparecerá aquí." />;

  const pendientes = lista.filter(e => !e.yaRespondida);
  const completadas = lista.filter(e => e.yaRespondida);

  return (
    <div className="space-y-6">
      {pendientes.length > 0 && (
        <Seccion titulo="Pendientes">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendientes.map(e => (
              <button
                key={e.id}
                onClick={() => onTomar(e.id)}
                className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:shadow-md"
              >
                <h3 className="mb-1 font-medium text-slate-800">{e.titulo}</h3>
                <p className="mb-2 text-xs text-slate-500">{e.moduloTema || 'General'}</p>
                <p className="text-xs text-slate-400">{e.totalPreguntas} preguntas · nota mínima {e.notaMinima}%</p>
              </button>
            ))}
          </div>
        </Seccion>
      )}

      {completadas.length > 0 && (
        <Seccion titulo="Completadas">
          <div className="space-y-2">
            {completadas.map(e => (
              <div key={e.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{e.titulo}</p>
                  <p className="text-xs text-slate-400">{fechaCorta(e.respondidaEn)}</p>
                </div>
                <span className="text-sm font-semibold text-slate-600">{e.miNota}%</span>
                <EstadoBadge aprobado={e.miAprobado} />
              </div>
            ))}
          </div>
        </Seccion>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Gestionar
// ══════════════════════════════════════════════════════════════════════════════

function TabGestionar({ onVerResultados, notificar }) {
  const [lista, setLista]       = useState([]);
  const [puedeCrear, setPuede]  = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState(null);
  const [modalNueva, setModalNueva] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await evaluacionesApi.listar();
      setLista(r.data);
      setPuede(r.puedeCrear);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) return <Cargando texto="Cargando…" />;
  if (error) return <ErrorBox error={error} onReintentar={cargar} />;

  if (!puedeCrear) {
    return <Vacio titulo="No tienes permiso para gestionar evaluaciones" texto="Pide a un supervisor, analista, gerencia o administrador que cree una." />;
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setModalNueva(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Nueva evaluación
        </button>
      </div>

      {lista.length === 0 ? (
        <Vacio
          titulo="Todavía no creaste ninguna evaluación"
          accion={
            <button onClick={() => setModalNueva(true)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Crear la primera
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map(e => (
            <button
              key={e.id}
              onClick={() => onVerResultados(e.id)}
              className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:shadow-md"
            >
              <div className="mb-1 flex items-start gap-2">
                <h3 className="min-w-0 flex-1 truncate font-medium text-slate-800">{e.titulo}</h3>
                {!e.activa && <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-400">Archivada</span>}
              </div>
              <p className="mb-3 text-xs text-slate-500">{e.moduloTema || 'General'} · {e.empresa || 'Ambas empresas'}</p>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span>{e.totalPreguntas} preguntas</span>
                <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {e.totalIntentos} respondieron</span>
                {e.totalIntentos > 0 && <span>{e.totalAprobados} aprobados</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      <CrearEvaluacionModal
        abierto={modalNueva}
        onCerrar={() => setModalNueva(false)}
        onCreada={() => { notificar('Evaluación creada', 'ok'); cargar(); }}
        onError={(m) => notificar(m, 'error')}
      />
    </div>
  );
}

function Seccion({ titulo, children }) {
  return (
    <section>
      <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{titulo}</h2>
      {children}
    </section>
  );
}
