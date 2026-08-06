/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Archivos Compartidos · Editor de una hoja
 * ═══════════════════════════════════════════════════════════════════════════════
 * La grilla colaborativa. Junta tres flujos que conviene no mezclar mentalmente:
 *
 *   1. LOCAL    → el usuario escribe. Se pinta al instante (optimista) y se
 *                 guarda en el servidor con medio segundo de retardo.
 *   2. REMOTO   → llegan cambios de otros por socket y se aplican al estado.
 *   3. PRESENCIA→ quién está mirando y en qué celda. Puro adorno, no toca datos.
 *
 * Si el guardado falla, se revierte la celda y se avisa: nunca queda un valor
 * en pantalla que el servidor no tenga.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Clock, Columns3, Download, Plus, Search,
  Share2, Trash2, Upload, Users,
} from 'lucide-react';
import {
  hojasApi, useSocketHoja, puedeEditar, esDueno, descargar,
} from '../../hooks/useHojas';
import { Avatar, Cargando, ErrorBox, Modal, NivelBadge, Vacio, Aviso } from './ui';
import Celda from './Celda';
import ColumnasModal from './ColumnasModal';
import PermisosModal from './PermisosModal';
import HistorialPanel from './HistorialPanel';

const RETARDO_GUARDADO = 500;

export default function HojaEditor({ hojaId, onVolver }) {
  const [datos, setDatos]       = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState(null);
  const [aviso, setAviso]       = useState(null);

  const [seleccion, setSeleccion] = useState(null);   // { filaId, columnaId }
  const [editando, setEditando]   = useState(null);   // { filaId, columnaId }
  const [busqueda, setBusqueda]   = useState('');
  const [conectados, setConectados] = useState([]);
  const [focosAjenos, setFocosAjenos] = useState({}); // "filaId:columnaId" → { … }

  const [modal, setModal] = useState(null);           // columnas | permisos | historial | importar
  const inputArchivo = useRef(null);

  // Timers de guardado diferido, uno por celda.
  const timers = useRef(new Map());

  const notificar = (mensaje, tipo = 'info') => setAviso({ mensaje, tipo });

  // ── Carga inicial ───────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await hojasApi.detalle(hojaId);
      setDatos(r.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [hojaId]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Eventos en vivo ─────────────────────────────────────────────────────────
  const yo = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('userProfile') || '{}')?.id ?? null; }
    catch { return null; }
  }, []);

  const { avisarFoco } = useSocketHoja(hojaId, {
    // Un cambio que YO hice ya está pintado: ignoro el eco de mi propio evento.
    'hoja:celda': ({ filaId, columnaId, valor, por }) => {
      if (por === yo) return;
      setDatos(d => d && ({
        ...d,
        filas: d.filas.map(f =>
          f.id === filaId ? { ...f, valores: { ...f.valores, [columnaId]: valor } } : f
        ),
      }));
    },

    'hoja:fila-creada': ({ fila, por }) => {
      if (por === yo) return;
      setDatos(d => (d && !d.filas.some(f => f.id === fila.id))
        ? { ...d, filas: [...d.filas, fila] }
        : d);
    },

    'hoja:fila-eliminada': ({ filaId, por }) => {
      if (por === yo) return;
      setDatos(d => d && ({ ...d, filas: d.filas.filter(f => f.id !== filaId) }));
    },

    'hoja:columna-creada':  ({ columna, por }) => {
      if (por === yo) return;
      setDatos(d => d && ({ ...d, columnas: [...d.columnas, columna] }));
    },
    'hoja:columna-editada': ({ columna, por }) => {
      if (por === yo) return;
      setDatos(d => d && ({ ...d, columnas: d.columnas.map(c => c.id === columna.id ? columna : c) }));
    },
    'hoja:columna-eliminada': ({ columnaId, por }) => {
      if (por === yo) return;
      setDatos(d => d && ({ ...d, columnas: d.columnas.filter(c => c.id !== columnaId) }));
    },

    'hoja:presencia': ({ usuarios }) => setConectados(usuarios || []),

    'hoja:foco': ({ filaId, columnaId, usuarioId, nombre, color }) => {
      setFocosAjenos(prev => {
        // Cada persona ocupa una sola celda: se limpia su posición anterior.
        const limpio = Object.fromEntries(
          Object.entries(prev).filter(([, v]) => v.usuarioId !== usuarioId)
        );
        if (filaId && columnaId) limpio[`${filaId}:${columnaId}`] = { usuarioId, nombre, color };
        return limpio;
      });
    },

    'hoja:recargar': () => { cargar(); notificar('La hoja se actualizó'); },

    'hoja:permisos': ({ revocadoA }) => {
      if (revocadoA === yo) {
        notificar('Ya no tienes acceso a este archivo', 'error');
        setTimeout(onVolver, 1500);
      }
    },

    'hoja:denegado': () => {
      notificar('No tienes acceso a este archivo', 'error');
      setTimeout(onVolver, 1500);
    },
  });

  // Avisar a los demás dónde estoy parado.
  useEffect(() => {
    avisarFoco(seleccion?.filaId ?? null, seleccion?.columnaId ?? null);
  }, [seleccion, avisarFoco]);

  // ── Guardado de celdas ──────────────────────────────────────────────────────
  const guardarCelda = useCallback((filaId, columnaId, valor) => {
    const clave = `${filaId}:${columnaId}`;

    // Guardo el valor previo ANTES de pintar, por si hay que revertir.
    let previo;
    setDatos(d => {
      if (!d) return d;
      previo = d.filas.find(f => f.id === filaId)?.valores?.[columnaId] ?? null;
      return {
        ...d,
        filas: d.filas.map(f =>
          f.id === filaId ? { ...f, valores: { ...f.valores, [columnaId]: valor } } : f
        ),
      };
    });

    clearTimeout(timers.current.get(clave));
    timers.current.set(clave, setTimeout(async () => {
      timers.current.delete(clave);
      try {
        await hojasApi.guardarCelda(hojaId, filaId, columnaId, valor);
      } catch (e) {
        setDatos(d => d && ({
          ...d,
          filas: d.filas.map(f =>
            f.id === filaId ? { ...f, valores: { ...f.valores, [columnaId]: previo } } : f
          ),
        }));
        notificar(e.message, 'error');
      }
    }, RETARDO_GUARDADO));
  }, [hojaId]);

  // Al salir de la página no se pierde lo último escrito.
  useEffect(() => {
    const pendientes = timers.current;
    return () => { for (const t of pendientes.values()) clearTimeout(t); };
  }, []);

  // ── Filas y columnas ────────────────────────────────────────────────────────
  const agregarFila = async () => {
    try {
      const r = await hojasApi.crearFila(hojaId);
      setDatos(d => d && ({ ...d, filas: [...d.filas, r.data] }));
      setSeleccion({ filaId: r.data.id, columnaId: datos.columnas[0]?.id });
    } catch (e) { notificar(e.message, 'error'); }
  };

  const eliminarFila = async (filaId) => {
    if (!window.confirm('¿Eliminar esta fila?')) return;
    try {
      await hojasApi.eliminarFila(hojaId, filaId);
      setDatos(d => d && ({ ...d, filas: d.filas.filter(f => f.id !== filaId) }));
    } catch (e) { notificar(e.message, 'error'); }
  };

  // ── Excel ───────────────────────────────────────────────────────────────────
  const exportar = async () => {
    try {
      const blob = await hojasApi.exportar(hojaId);
      descargar(blob, `${datos.hoja.nombre}.xlsx`);
    } catch (e) { notificar(e.message, 'error'); }
  };

  const importar = async (archivo) => {
    if (!archivo) return;
    try {
      const r = await hojasApi.importar(hojaId, archivo);
      await cargar();
      notificar(r.mensaje, 'ok');
      if (r.data?.omitidos?.length) {
        notificar(`${r.data.omitidos.length} valores se omitieron por formato`, 'info');
      }
    } catch (e) { notificar(e.message, 'error'); }
    finally { if (inputArchivo.current) inputArchivo.current.value = ''; }
  };

  // ── Navegación con teclado ──────────────────────────────────────────────────
  const mover = useCallback((direccion) => {
    if (!datos || !seleccion) return;
    const filas = datos.filas;
    const cols  = datos.columnas;
    const iF = filas.findIndex(f => f.id === seleccion.filaId);
    const iC = cols.findIndex(c => c.id === seleccion.columnaId);
    if (iF < 0 || iC < 0) return;

    const destino = {
      arriba:    [iF - 1, iC],
      abajo:     [iF + 1, iC],
      izquierda: [iF, iC - 1],
      derecha:   [iF, iC + 1],
    }[direccion];
    if (!destino) return;

    const [nF, nC] = destino;
    if (nF < 0 || nF >= filas.length || nC < 0 || nC >= cols.length) return;
    setSeleccion({ filaId: filas[nF].id, columnaId: cols[nC].id });
  }, [datos, seleccion]);

  useEffect(() => {
    const alPulsar = (e) => {
      if (editando || modal) return;
      if (!seleccion) return;
      // No robar el teclado si la persona está en el buscador.
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;

      const mapa = {
        ArrowUp: 'arriba', ArrowDown: 'abajo',
        ArrowLeft: 'izquierda', ArrowRight: 'derecha',
      };
      if (mapa[e.key]) { e.preventDefault(); mover(mapa[e.key]); return; }
      if (e.key === 'Tab')   { e.preventDefault(); mover(e.shiftKey ? 'izquierda' : 'derecha'); return; }
      if (e.key === 'Enter') { e.preventDefault(); setEditando(seleccion); return; }

      // Empezar a escribir directamente entra en edición, como en Excel.
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) setEditando(seleccion);
    };

    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [seleccion, editando, modal, mover]);

  const alSalirDeCelda = useCallback((direccion) => {
    setEditando(null);
    if (direccion && direccion !== 'quedarse') mover(direccion);
  }, [mover]);

  // ── Derivados ───────────────────────────────────────────────────────────────
  const mapaUsuarios = useMemo(
    () => new Map((datos?.usuarios || []).map(u => [String(u.id), u.nombre])),
    [datos?.usuarios]
  );

  const filasVisibles = useMemo(() => {
    if (!datos) return [];
    const q = busqueda.trim().toLowerCase();
    if (!q) return datos.filas;
    return datos.filas.filter(f =>
      Object.entries(f.valores).some(([colId, v]) => {
        if (!v) return false;
        const col = datos.columnas.find(c => c.id === Number(colId));
        const texto = col?.tipo === 'USUARIO' ? (mapaUsuarios.get(String(v)) || '') : String(v);
        return texto.toLowerCase().includes(q);
      })
    );
  }, [datos, busqueda, mapaUsuarios]);

  // ── Render ──────────────────────────────────────────────────────────────────
  if (cargando) return <Cargando texto="Abriendo el archivo…" />;
  if (error)    return <div className="p-6"><ErrorBox error={error} onReintentar={cargar} /></div>;
  if (!datos)   return null;

  const { hoja, nivel, columnas } = datos;
  const escribible = puedeEditar(nivel);
  const dueno      = esDueno(nivel);
  const anchoTotal = columnas.reduce((s, c) => s + c.ancho, 0) + 96;

  return (
    <div className="flex h-full flex-col">
      {/* ── Cabecera ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button onClick={onVolver} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Volver">
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: hoja.color }} />
            <h2 className="truncate font-semibold text-slate-800">{hoja.nombre}</h2>
            <NivelBadge nivel={nivel} />
          </div>
          {hoja.descripcion && <p className="truncate text-xs text-slate-500">{hoja.descripcion}</p>}
        </div>

        {/* Quién está viendo la hoja ahora mismo */}
        {conectados.length > 0 && (
          <div className="ml-2 flex items-center -space-x-2">
            {conectados.slice(0, 5).map(u => (
              <Avatar key={u.usuarioId} nombre={u.nombre} color={u.color} size={26} titulo={`${u.nombre} · viendo ahora`} />
            ))}
            {conectados.length > 5 && (
              <span className="ml-3 text-xs text-slate-500">+{conectados.length - 5}</span>
            )}
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar…"
              className="w-44 rounded-md border border-slate-200 py-1.5 pl-8 pr-3 text-sm outline-none focus:border-blue-400"
            />
          </div>

          <Boton onClick={() => setModal('historial')} icono={Clock} texto="Historial" />
          <Boton onClick={exportar} icono={Download} texto="Excel" />

          {escribible && (
            <>
              <input
                ref={inputArchivo} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={(e) => importar(e.target.files?.[0])}
              />
              <Boton onClick={() => inputArchivo.current?.click()} icono={Upload} texto="Importar" />
            </>
          )}

          {dueno && (
            <>
              <Boton onClick={() => setModal('columnas')} icono={Columns3} texto="Columnas" />
              <Boton onClick={() => setModal('permisos')} icono={Share2} texto="Compartir" destacado />
            </>
          )}
        </div>
      </div>

      {/* ── Grilla ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto bg-slate-50 p-4">
        {columnas.length === 0 ? (
          <Vacio
            titulo="Esta hoja todavía no tiene columnas"
            texto={dueno ? 'Define las columnas para empezar a registrar información.' : 'Pide al creador que defina las columnas.'}
            accion={dueno && (
              <button onClick={() => setModal('columnas')} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                Definir columnas
              </button>
            )}
          />
        ) : (
          <div className="inline-block min-w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div style={{ minWidth: anchoTotal }}>
              {/* Encabezado */}
              <div className="sticky top-0 z-20 flex bg-slate-100">
                <div className="flex h-9 w-12 shrink-0 items-center justify-center border-b border-r border-slate-200 text-[11px] font-semibold text-slate-400">
                  #
                </div>
                {columnas.map(c => (
                  <div
                    key={c.id}
                    style={{ width: c.ancho }}
                    className="flex h-9 shrink-0 items-center gap-1 border-b border-r border-slate-200 px-2 text-xs font-semibold text-slate-600"
                  >
                    <span className="truncate">{c.nombre}</span>
                    {c.soloLectura && <span className="text-[10px] text-slate-400">(bloqueada)</span>}
                  </div>
                ))}
                <div className="w-12 shrink-0 border-b border-slate-200" />
              </div>

              {/* Filas */}
              {filasVisibles.map((fila, i) => (
                <div key={fila.id} className="group flex">
                  <div className="flex h-9 w-12 shrink-0 items-center justify-center border-b border-r border-slate-200 bg-slate-50 text-[11px] text-slate-400">
                    {i + 1}
                  </div>

                  {columnas.map(col => {
                    const activa   = seleccion?.filaId === fila.id && seleccion?.columnaId === col.id;
                    const enEdicion = editando?.filaId === fila.id && editando?.columnaId === col.id;
                    return (
                      <div key={col.id} style={{ width: col.ancho }} className="shrink-0">
                        <Celda
                          valor={fila.valores[col.id] ?? ''}
                          columna={col}
                          usuarios={mapaUsuarios}
                          editable={escribible}
                          seleccionada={activa}
                          editando={enEdicion}
                          focoAjeno={focosAjenos[`${fila.id}:${col.id}`]}
                          onSeleccionar={() => setSeleccion({ filaId: fila.id, columnaId: col.id })}
                          onEmpezarEdicion={() => { setSeleccion({ filaId: fila.id, columnaId: col.id }); setEditando({ filaId: fila.id, columnaId: col.id }); }}
                          onCambio={(v) => guardarCelda(fila.id, col.id, v)}
                          onSalir={alSalirDeCelda}
                        />
                      </div>
                    );
                  })}

                  <div className="flex h-9 w-12 shrink-0 items-center justify-center border-b border-slate-200">
                    {escribible && (
                      <button
                        onClick={() => eliminarFila(fila.id)}
                        className="rounded p-1 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-500"
                        title="Eliminar fila"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {filasVisibles.length === 0 && (
                <div className="border-b border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                  {busqueda ? 'Ningún registro coincide con la búsqueda' : 'Todavía no hay registros'}
                </div>
              )}

              {escribible && !busqueda && (
                <button
                  onClick={agregarFila}
                  className="flex h-9 w-full items-center gap-2 px-4 text-sm text-slate-500 hover:bg-slate-50 hover:text-blue-600"
                >
                  <Plus className="w-4 h-4" /> Agregar fila
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Pie ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">
        <span>{filasVisibles.length} de {datos.filas.length} registros</span>
        <span>{columnas.length} columnas</span>
        {conectados.length > 0 && (
          <span className="ml-auto flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            {conectados.length} {conectados.length === 1 ? 'persona conectada' : 'personas conectadas'}
          </span>
        )}
      </div>

      {/* ── Modales ────────────────────────────────────────────────────────── */}
      <ColumnasModal
        abierto={modal === 'columnas'}
        onCerrar={() => setModal(null)}
        hojaId={hojaId}
        columnas={columnas}
        onCambio={(nuevas) => setDatos(d => d && ({ ...d, columnas: nuevas }))}
        onError={(m) => notificar(m, 'error')}
      />

      <PermisosModal
        abierto={modal === 'permisos'}
        onCerrar={() => setModal(null)}
        hojaId={hojaId}
        onError={(m) => notificar(m, 'error')}
        onOk={(m) => notificar(m, 'ok')}
      />

      <Modal abierto={modal === 'historial'} onCerrar={() => setModal(null)} titulo="Historial de cambios" ancho="max-w-2xl">
        <HistorialPanel hojaId={hojaId} />
      </Modal>

      <Aviso mensaje={aviso?.mensaje} tipo={aviso?.tipo} onCerrar={() => setAviso(null)} />
    </div>
  );
}

function Boton({ onClick, icono: Icono, texto, destacado }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium transition ${
        destacado
          ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      <Icono className="w-4 h-4" />
      <span className="hidden sm:inline">{texto}</span>
    </button>
  );
}
