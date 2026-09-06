/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MÓDULO EVALUACIONES · Portada
 * ═══════════════════════════════════════════════════════════════════════════════
 * Dos pestañas: "Mis evaluaciones" (cualquier usuario responde las suyas) y
 * "Gestionar" (solo ADMINISTRADOR / GERENCIA / ANALISTA / SUPERVISOR).
 * Sin rutas anidadas: se alterna con estado local, igual que Archivos Compartidos.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, ArchiveRestore, Award, BarChart3, CheckCircle2, Clock, FileQuestion,
  GraduationCap, Hourglass, Plus, Search, Sparkles, Trash2, TrendingUp, Users,
} from 'lucide-react';
import { evaluacionesApi } from '../../hooks/useEvaluaciones';
import {
  Aviso, BarraProgreso, Chip, ErrorBox, EstadoBadge, Modal, SkeletonTarjetas, Vacio, fechaCorta,
} from './ui';
import CrearEvaluacionModal from './CrearEvaluacionModal';
import TomarEvaluacion from './TomarEvaluacion';
import ResultadosPanel from './ResultadosPanel';
import './evaluaciones.css';

export default function Evaluaciones() {
  const [tab, setTab]                           = useState('mias');
  const [tomando, setTomando]                   = useState(null);
  const [viendoResultados, setViendoResultados] = useState(null);
  const [aviso, setAviso]                       = useState(null);

  const notificar = (mensaje, tipo = 'info') => setAviso({ mensaje, tipo });

  if (tomando) {
    return <TomarEvaluacion evaluacionId={tomando} onVolver={() => setTomando(null)} />;
  }
  if (viendoResultados) {
    return <ResultadosPanel evaluacionId={viendoResultados} onVolver={() => setViendoResultados(null)} />;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      {/* ── Encabezado ──────────────────────────────────────────────────────── */}
      <div className="eva-hero border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 p-3 text-white shadow-lg shadow-indigo-200">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-800 sm:text-2xl">
                  Evaluaciones
                </h1>
                <p className="text-sm text-slate-500">
                  Capacitación y certificación por módulo del ERP
                </p>
              </div>
            </div>

            <div className="ml-auto">
              <Pestanas
                valor={tab}
                onCambiar={setTab}
                opciones={[
                  { id: 'mias',     etiqueta: 'Mis evaluaciones', icono: Sparkles },
                  { id: 'gestionar', etiqueta: 'Gestionar',       icono: BarChart3 },
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {tab === 'mias'
          ? <TabMias onTomar={setTomando} />
          : <TabGestionar onVerResultados={setViendoResultados} notificar={notificar} />}
      </div>

      <Aviso mensaje={aviso?.mensaje} tipo={aviso?.tipo} onCerrar={() => setAviso(null)} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PESTAÑAS con indicador deslizante
// ══════════════════════════════════════════════════════════════════════════════

function Pestanas({ valor, onCambiar, opciones }) {
  const activo = Math.max(0, opciones.findIndex(o => o.id === valor));
  return (
    <div className="relative flex rounded-xl bg-white/70 p-1 ring-1 ring-slate-200 backdrop-blur">
      <span
        className="absolute inset-y-1 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 shadow-md shadow-indigo-200 transition-all duration-300"
        style={{ width: `calc((100% - 0.5rem) / ${opciones.length})`, left: `calc(0.25rem + ${activo} * (100% - 0.5rem) / ${opciones.length})` }}
      />
      {opciones.map(o => (
        <button
          key={o.id}
          onClick={() => onCambiar(o.id)}
          className={`relative z-10 inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            valor === o.id ? 'text-white' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <o.icono className="h-4 w-4" /> {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TARJETA DE INDICADOR
// ══════════════════════════════════════════════════════════════════════════════

function Indicador({ icono: Icono, etiqueta, valor, sufijo = '', tono = 'indigo' }) {
  const tonos = {
    indigo:  'from-indigo-500 to-violet-500 shadow-indigo-100',
    emerald: 'from-emerald-500 to-teal-500 shadow-emerald-100',
    amber:   'from-amber-500 to-orange-500 shadow-amber-100',
    cyan:    'from-cyan-500 to-sky-500 shadow-cyan-100',
  };
  return (
    <div className="eva-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`rounded-xl bg-gradient-to-br ${tonos[tono]} p-2.5 text-white shadow-md`}>
          <Icono className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-none tabular-nums text-slate-800">
            {valor}<span className="text-base font-semibold text-slate-400">{sufijo}</span>
          </p>
          <p className="mt-1 truncate text-xs text-slate-500">{etiqueta}</p>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BUSCADOR
// ══════════════════════════════════════════════════════════════════════════════

function Buscador({ valor, onCambiar, placeholder = 'Buscar por título o módulo…' }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
      />
    </div>
  );
}

const coincide = (e, q) => {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return `${e.titulo} ${e.moduloTema || ''} ${e.empresa || ''}`.toLowerCase().includes(t);
};

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Mis evaluaciones
// ══════════════════════════════════════════════════════════════════════════════

function TabMias({ onTomar }) {
  const [lista, setLista]       = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState(null);
  const [busqueda, setBusqueda] = useState('');

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

  const stats = useMemo(() => {
    const hechas = lista.filter(e => e.yaRespondida);
    const promedio = hechas.length
      ? Math.round(hechas.reduce((s, e) => s + (e.miNota || 0), 0) / hechas.length)
      : 0;
    return {
      pendientes: lista.filter(e => !e.yaRespondida).length,
      completadas: hechas.length,
      aprobadas: hechas.filter(e => e.miAprobado).length,
      promedio,
    };
  }, [lista]);

  const filtrada    = useMemo(() => lista.filter(e => coincide(e, busqueda)), [lista, busqueda]);
  const pendientes  = filtrada.filter(e => !e.yaRespondida);
  const completadas = filtrada.filter(e => e.yaRespondida);

  if (cargando) return <SkeletonTarjetas />;
  if (error) return <ErrorBox error={error} onReintentar={cargar} />;
  if (lista.length === 0) {
    return (
      <Vacio
        titulo="No tienes evaluaciones pendientes"
        texto="Cuando tu supervisor te asigne una, aparecerá aquí lista para responder."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="eva-stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador icono={Hourglass}    etiqueta="Por responder"   valor={stats.pendientes}  tono="amber" />
        <Indicador icono={CheckCircle2} etiqueta="Completadas"     valor={stats.completadas} tono="indigo" />
        <Indicador icono={Award}        etiqueta="Aprobadas"       valor={stats.aprobadas}   tono="emerald" />
        <Indicador icono={TrendingUp}   etiqueta="Tu promedio"     valor={stats.promedio} sufijo="%" tono="cyan" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Buscador valor={busqueda} onCambiar={setBusqueda} />
        {busqueda && (
          <span className="text-xs text-slate-400">
            {filtrada.length} resultado{filtrada.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {pendientes.length > 0 && (
        <Seccion titulo="Pendientes" contador={pendientes.length} tono="amber">
          <div className="eva-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {pendientes.map(e => (
              <button
                key={e.id}
                onClick={() => onTomar(e.id)}
                className="eva-card eva-card-ring group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 p-2 ring-1 ring-indigo-100">
                    <FileQuestion className="h-4 w-4 text-indigo-500" />
                  </div>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                    Pendiente
                  </span>
                </div>

                <h3 className="mb-1 line-clamp-2 font-semibold text-slate-800 group-hover:text-indigo-700">
                  {e.titulo}
                </h3>
                <p className="mb-3 text-xs text-slate-500">{e.moduloTema || 'General'}</p>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip tono="slate" icono={FileQuestion}>{e.totalPreguntas} preguntas</Chip>
                  <Chip tono="violet">Mínimo {e.notaMinima}%</Chip>
                  {e.tiempoLimiteMin != null && (
                    <Chip tono="rose" icono={Clock}>{e.tiempoLimiteMin} min</Chip>
                  )}
                </div>

                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600">
                  Comenzar
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </span>
              </button>
            ))}
          </div>
        </Seccion>
      )}

      {completadas.length > 0 && (
        <Seccion titulo="Completadas" contador={completadas.length} tono="emerald">
          <div className="eva-stagger space-y-2">
            {completadas.map(e => (
              <div
                key={e.id}
                className="eva-card flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className={`rounded-lg p-2 ${e.miAprobado ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>
                  {e.miAprobado ? <Award className="h-4 w-4" /> : <FileQuestion className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{e.titulo}</p>
                  <p className="text-xs text-slate-400">
                    {e.moduloTema || 'General'} · {fechaCorta(e.respondidaEn)}
                  </p>
                </div>
                <div className="hidden w-32 sm:block">
                  <BarraProgreso valor={e.miNota} alto="h-1.5" />
                </div>
                <span className="w-12 text-right text-sm font-bold tabular-nums text-slate-700">{e.miNota}%</span>
                <EstadoBadge aprobado={e.miAprobado} />
              </div>
            ))}
          </div>
        </Seccion>
      )}

      {filtrada.length === 0 && (
        <Vacio icono={Search} titulo="Sin resultados" texto={`Nada coincide con "${busqueda}".`} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Gestionar
// ══════════════════════════════════════════════════════════════════════════════

function TabGestionar({ onVerResultados, notificar }) {
  const [lista, setLista]           = useState([]);
  const [puedeCrear, setPuede]      = useState(false);
  const [cargando, setCargando]     = useState(true);
  const [error, setError]           = useState(null);
  const [modalNueva, setModalNueva] = useState(false);
  const [busqueda, setBusqueda]     = useState('');
  const [esAdmin, setEsAdmin]       = useState(false);
  const [porEliminar, setPorEliminar] = useState(null); // evaluación pendiente de confirmar
  const [ocupado, setOcupado]       = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await evaluacionesApi.listar();
      setLista(r.data);
      setPuede(r.puedeCrear);
      setEsAdmin(r.esAdministrador === true);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const stats = useMemo(() => {
    const intentos  = lista.reduce((s, e) => s + (e.totalIntentos || 0), 0);
    const aprobados = lista.reduce((s, e) => s + (e.totalAprobados || 0), 0);
    return {
      evaluaciones: lista.length,
      activas: lista.filter(e => e.activa).length,
      intentos,
      tasa: intentos ? Math.round((aprobados / intentos) * 100) : 0,
    };
  }, [lista]);

  const filtrada = useMemo(() => lista.filter(e => coincide(e, busqueda)), [lista, busqueda]);

  const alternarArchivo = async (e) => {
    setOcupado(true);
    try {
      await evaluacionesApi.archivar(e.id, !e.activa);
      notificar(e.activa ? 'Evaluación archivada' : 'Evaluación reactivada', 'ok');
      cargar();
    } catch (err) {
      notificar(err.message, 'error');
    } finally {
      setOcupado(false);
    }
  };

  const eliminar = async () => {
    setOcupado(true);
    try {
      const r = await evaluacionesApi.eliminar(porEliminar.id);
      const n = r.data?.intentosBorrados || 0;
      notificar(n > 0 ? `Evaluación eliminada junto con ${n} respuesta(s)` : 'Evaluación eliminada', 'ok');
      setPorEliminar(null);
      cargar();
    } catch (err) {
      notificar(err.message, 'error');
    } finally {
      setOcupado(false);
    }
  };

  if (cargando) return <SkeletonTarjetas />;
  if (error) return <ErrorBox error={error} onReintentar={cargar} />;

  if (!puedeCrear) {
    return (
      <Vacio
        titulo="No tienes permiso para gestionar evaluaciones"
        texto="Pide a un supervisor, analista, gerencia o administrador que cree una."
      />
    );
  }

  const botonNueva = (
    <button
      onClick={() => setModalNueva(true)}
      className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:from-indigo-700 hover:to-violet-700"
    >
      <Plus className="h-4 w-4" /> Nueva evaluación
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="eva-stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador icono={GraduationCap} etiqueta="Evaluaciones"    valor={stats.evaluaciones} tono="indigo" />
        <Indicador icono={Sparkles}      etiqueta="Activas"         valor={stats.activas}      tono="cyan" />
        <Indicador icono={Users}         etiqueta="Respuestas"      valor={stats.intentos}     tono="amber" />
        <Indicador icono={Award}         etiqueta="Tasa aprobación" valor={stats.tasa} sufijo="%" tono="emerald" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Buscador valor={busqueda} onCambiar={setBusqueda} />
        <div className="ml-auto">{botonNueva}</div>
      </div>

      {lista.length === 0 ? (
        <Vacio
          titulo="Todavía no creaste ninguna evaluación"
          texto="Arma una prueba de opción múltiple en un par de minutos y compártela con tu equipo."
          accion={botonNueva}
        />
      ) : filtrada.length === 0 ? (
        <Vacio icono={Search} titulo="Sin resultados" texto={`Nada coincide con "${busqueda}".`} />
      ) : (
        <div className="eva-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtrada.map(e => {
            const tasa = e.totalIntentos ? Math.round((e.totalAprobados / e.totalIntentos) * 100) : 0;
            return (
              <div
                key={e.id}
                onClick={() => onVerResultados(e.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => { if (ev.key === 'Enter') onVerResultados(e.id); }}
                className="eva-card eva-card-ring group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm"
              >
                {/* Acciones — no deben disparar el click de la tarjeta */}
                <div className="absolute right-3 top-3 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    onClick={(ev) => { ev.stopPropagation(); alternarArchivo(e); }}
                    disabled={ocupado}
                    title={e.activa ? 'Archivar (deja de mostrarse a los asesores)' : 'Reactivar'}
                    className="rounded-lg bg-white/90 p-1.5 text-slate-400 ring-1 ring-slate-200 transition hover:text-slate-700 disabled:opacity-40"
                  >
                    {e.activa ? <Archive className="h-3.5 w-3.5" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
                  </button>
                  {esAdmin && (
                    <button
                      onClick={(ev) => { ev.stopPropagation(); setPorEliminar(e); }}
                      disabled={ocupado}
                      title="Eliminar definitivamente"
                      className="rounded-lg bg-white/90 p-1.5 text-slate-400 ring-1 ring-slate-200 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="mb-2 flex items-start gap-2 pr-16">
                  <h3 className="min-w-0 flex-1 line-clamp-2 font-semibold text-slate-800 group-hover:text-indigo-700">
                    {e.titulo}
                  </h3>
                  {!e.activa && (
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-400">
                      Archivada
                    </span>
                  )}
                </div>

                <p className="mb-3 text-xs text-slate-500">
                  {e.moduloTema || 'General'} · {e.empresa || 'Ambas empresas'}
                </p>

                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  <Chip tono="slate" icono={FileQuestion}>{e.totalPreguntas} preguntas</Chip>
                  <Chip tono="indigo" icono={Users}>{e.totalIntentos} respondieron</Chip>
                </div>

                {e.totalIntentos > 0 && (
                  <>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                      <span>Aprobación</span>
                      <span className="font-semibold text-slate-600">{tasa}%</span>
                    </div>
                    <BarraProgreso valor={tasa} alto="h-1.5" />
                  </>
                )}

                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600">
                  Ver resultados
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <ModalEliminar
        evaluacion={porEliminar}
        ocupado={ocupado}
        onCerrar={() => setPorEliminar(null)}
        onConfirmar={eliminar}
      />

      <CrearEvaluacionModal
        abierto={modalNueva}
        onCerrar={() => setModalNueva(false)}
        onCreada={() => { notificar('Evaluación creada', 'ok'); cargar(); }}
        onError={(m) => notificar(m, 'error')}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CONFIRMACIÓN DE BORRADO (solo administrador)
// ══════════════════════════════════════════════════════════════════════════════

function ModalEliminar({ evaluacion, ocupado, onCerrar, onConfirmar }) {
  const [texto, setTexto] = useState('');

  // Se limpia cada vez que se abre para otra evaluación
  useEffect(() => { setTexto(''); }, [evaluacion?.id]);

  if (!evaluacion) return null;
  const confirmado = texto.trim().toUpperCase() === 'ELIMINAR';

  return (
    <Modal abierto onCerrar={onCerrar} titulo="Eliminar evaluación" ancho="max-w-md">
      <p className="text-sm text-slate-600">
        Vas a borrar <strong className="text-slate-800">{evaluacion.titulo}</strong> de forma permanente.
      </p>

      {evaluacion.totalIntentos > 0 && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
          También se borrarán las <strong>{evaluacion.totalIntentos}</strong> respuesta(s) de los asesores
          y sus notas. Esto no se puede deshacer.
        </p>
      )}

      <p className="mt-3 text-xs text-slate-500">
        Si solo quieres que deje de aparecerles a los asesores, cierra esto y usa <strong>Archivar</strong>:
        conserva el historial.
      </p>

      <label className="mt-4 block text-xs font-medium text-slate-500">
        Escribe <span className="font-bold text-rose-600">ELIMINAR</span> para confirmar
      </label>
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="ELIMINAR"
        className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-rose-400 focus:ring-4 focus:ring-rose-50"
      />

      <div className="mt-5 flex gap-2.5">
        <button
          onClick={onCerrar}
          className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirmar}
          disabled={!confirmado || ocupado}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" /> {ocupado ? 'Eliminando…' : 'Eliminar'}
        </button>
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════

function Seccion({ titulo, contador, tono = 'slate', children }) {
  const tonos = {
    amber:   'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    slate:   'bg-slate-100 text-slate-600',
  };
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {titulo}
        {contador != null && (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tonos[tono]}`}>{contador}</span>
        )}
      </h2>
      {children}
    </section>
  );
}
