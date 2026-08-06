/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MÓDULO ARCHIVOS COMPARTIDOS
 * ═══════════════════════════════════════════════════════════════════════════════
 * Dos vistas, sin rutas anidadas: la lista de archivos y el editor de uno.
 * Se alterna con estado local porque el editor es una pantalla completa que no
 * necesita URL propia ni historial de navegación.
 */

import { useCallback, useEffect, useState } from 'react';
import { Archive, FileSpreadsheet, Plus, Search, Users } from 'lucide-react';
import { hojasApi } from '../../hooks/useHojas';
import { Aviso, Cargando, ErrorBox, NivelBadge, Vacio, tiempoRelativo } from './ui';
import HojaEditor from './HojaEditor';
import NuevaHojaModal from './NuevaHojaModal';

export default function ArchivosCompartidos() {
  const [hojas, setHojas]       = useState([]);
  const [puedeCrear, setPuede]  = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState(null);
  const [abierta, setAbierta]   = useState(null);   // id de la hoja en el editor
  const [nueva, setNueva]       = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [aviso, setAviso]       = useState(null);

  const notificar = (mensaje, tipo = 'info') => setAviso({ mensaje, tipo });

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await hojasApi.listar();
      setHojas(r.data);
      setPuede(r.puedeCrear);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Al volver del editor se recarga: pudieron cambiar filas, nombre o accesos.
  const volver = useCallback(() => { setAbierta(null); cargar(); }, [cargar]);

  if (abierta) {
    return (
      <div className="h-[calc(100vh-4rem)]">
        <HojaEditor hojaId={abierta} onVolver={volver} />
      </div>
    );
  }

  const q = busqueda.trim().toLowerCase();
  const visibles = q
    ? hojas.filter(h => h.nombre.toLowerCase().includes(q) || (h.descripcion || '').toLowerCase().includes(q))
    : hojas;

  const mios      = visibles.filter(h => h.esMio);
  const compartidos = visibles.filter(h => !h.esMio);

  return (
    <div className="p-4 sm:p-6">
      {/* Cabecera */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-blue-50 p-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Archivos compartidos</h1>
            <p className="text-xs text-slate-500">Planillas que varias personas editan a la vez</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar archivo…"
              className="w-48 rounded-md border border-slate-200 py-2 pl-8 pr-3 text-sm outline-none focus:border-blue-400"
            />
          </div>

          {puedeCrear && (
            <button
              onClick={() => setNueva(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" /> Nuevo archivo
            </button>
          )}
        </div>
      </div>

      {cargando ? <Cargando texto="Cargando tus archivos…" /> : error ? (
        <ErrorBox error={error} onReintentar={cargar} />
      ) : visibles.length === 0 ? (
        <Vacio
          titulo={q ? 'Ningún archivo coincide' : 'Todavía no tienes archivos compartidos'}
          texto={q ? 'Prueba con otro término.' : puedeCrear
            ? 'Crea uno y comparte el acceso con tu equipo: todos podrán escribir al mismo tiempo.'
            : 'Cuando un supervisor te comparta un archivo, aparecerá aquí.'}
          accion={!q && puedeCrear && (
            <button onClick={() => setNueva(true)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Crear el primero
            </button>
          )}
        />
      ) : (
        <div className="space-y-6">
          {mios.length > 0 && (
            <Seccion titulo="Creados por mí" hojas={mios} onAbrir={setAbierta} />
          )}
          {compartidos.length > 0 && (
            <Seccion titulo="Compartidos conmigo" hojas={compartidos} onAbrir={setAbierta} />
          )}
        </div>
      )}

      <NuevaHojaModal
        abierto={nueva}
        onCerrar={() => setNueva(false)}
        onCreada={(hoja) => { setNueva(false); cargar(); setAbierta(hoja.id); }}
        onError={(m) => notificar(m, 'error')}
      />

      <Aviso mensaje={aviso?.mensaje} tipo={aviso?.tipo} onCerrar={() => setAviso(null)} />
    </div>
  );
}

function Seccion({ titulo, hojas, onAbrir }) {
  return (
    <section>
      <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{titulo}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {hojas.map(h => <Tarjeta key={h.id} hoja={h} onAbrir={onAbrir} />)}
      </div>
    </section>
  );
}

function Tarjeta({ hoja, onAbrir }) {
  return (
    <button
      onClick={() => onAbrir(hoja.id)}
      className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:shadow-md"
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: hoja.color }} />

      <div className="mb-1.5 flex items-start gap-2">
        <h3 className="min-w-0 flex-1 truncate font-medium text-slate-800 group-hover:text-blue-700">
          {hoja.nombre}
        </h3>
        {!hoja.activo && <Archive className="w-4 h-4 shrink-0 text-slate-300" title="Archivada" />}
      </div>

      <p className="mb-3 line-clamp-2 h-8 text-xs text-slate-500">
        {hoja.descripcion || 'Sin descripción'}
      </p>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <NivelBadge nivel={hoja.nivel} />
        <span>{hoja.totalFilas} filas</span>
        <span>·</span>
        <span>{hoja.totalColumnas} columnas</span>
        {hoja.totalCompartidos > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <Users className="w-3 h-3" /> {hoja.totalCompartidos}
          </span>
        )}
      </div>

      <p className="mt-2 text-[11px] text-slate-400">
        {hoja.esMio ? 'Tuyo' : `De ${hoja.creador}`} · {tiempoRelativo(hoja.updatedAt)}
      </p>
    </button>
  );
}
