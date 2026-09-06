/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AUDITORÍA GENERAL — Archivos Compartidos
 * ═══════════════════════════════════════════════════════════════════════════════
 * La bitácora de cada archivo ya existía, pero solo dentro del archivo. Para
 * responder "qué se movió esta semana" o "qué tocó tal persona" había que
 * entrar archivo por archivo. Esta pantalla cruza todos de una vez.
 *
 * Solo aparecen los archivos que este usuario ya podía abrir: el backend
 * aplica los mismos permisos que en el resto del módulo.
 */

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Download, History, X } from 'lucide-react';
import { hojasApi, descargar } from '../../hooks/useHojas';
import { Cargando, ErrorBox, Vacio } from './ui';

const SIN_FILTROS = { desde: '', hasta: '', usuarioId: '', accion: '' };
const POR_PAGINA = 100;

const fechaHora = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
};

// Un color por familia de acción: de un vistazo se distingue una descarga de
// un borrado sin tener que leer cada fila.
const COLOR_ACCION = (accion) => {
  if (accion === 'EXPORTACION')                       return 'bg-amber-50 text-amber-700 border-amber-200';
  if (accion.includes('ELIMINADA') || accion === 'HOJA_ARCHIVADA' || accion === 'PERMISO_REVOCADO')
    return 'bg-red-50 text-red-600 border-red-200';
  if (accion.includes('CREADA') || accion === 'IMPORTACION' || accion === 'PERMISO_OTORGADO')
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
};

export default function AuditoriaPanel({ onVolver }) {
  const [filtros, setFiltros]   = useState(SIN_FILTROS);
  const [registros, setRegistros] = useState([]);
  const [acciones, setAcciones] = useState([]);
  const [creadores, setCreadores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState(null);
  const [hayMas, setHayMas]     = useState(false);
  const [bajando, setBajando]   = useState(false);

  const cargar = useCallback(async (offset = 0) => {
    if (offset === 0) setCargando(true);
    setError(null);
    try {
      const r = await hojasApi.auditoria({ ...filtros, limite: POR_PAGINA, offset });
      setRegistros(prev => (offset === 0 ? r.data : [...prev, ...r.data]));
      setAcciones(r.acciones || []);
      setHayMas(!!r.hayMas);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  useEffect(() => { cargar(0); }, [cargar]);

  useEffect(() => {
    hojasApi.filtros().then(r => setCreadores(r.creadores || [])).catch(() => {});
  }, []);

  const cambiar = (campo, valor) => setFiltros(f => ({ ...f, [campo]: valor }));
  const activos = Object.values(filtros).filter(Boolean).length;

  const bajarCsv = async () => {
    setBajando(true);
    try {
      const blob = await hojasApi.auditoriaCsv(filtros);
      descargar(blob, `auditoria-archivos-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBajando(false);
    }
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button
          onClick={onVolver}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:border-slate-300"
        >
          <ArrowLeft className="w-4 h-4" /> Archivos
        </button>

        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-violet-50 p-2">
            <History className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Auditoría de archivos</h1>
            <p className="text-xs text-slate-500">Quién hizo qué y cuándo, en todos tus archivos</p>
          </div>
        </div>

        <button
          onClick={bajarCsv}
          disabled={bajando || registros.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:border-slate-300 disabled:opacity-50"
        >
          <Download className="w-4 h-4" /> {bajando ? 'Preparando…' : 'Descargar'}
        </button>
      </div>

      {/* Filtros */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <Campo etiqueta="Desde">
            <input type="date" value={filtros.desde} onChange={(e) => cambiar('desde', e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400" />
          </Campo>
          <Campo etiqueta="Hasta">
            <input type="date" value={filtros.hasta} onChange={(e) => cambiar('hasta', e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400" />
          </Campo>
          <Campo etiqueta="Persona">
            <select value={filtros.usuarioId} onChange={(e) => cambiar('usuarioId', e.target.value)}
              className="w-44 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400">
              <option value="">Cualquiera</option>
              {creadores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Acción">
            <select value={filtros.accion} onChange={(e) => cambiar('accion', e.target.value)}
              className="w-52 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400">
              <option value="">Todas</option>
              {acciones.map(a => <option key={a.valor} value={a.valor}>{a.texto}</option>)}
            </select>
          </Campo>
          {activos > 0 && (
            <button onClick={() => setFiltros(SIN_FILTROS)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-slate-500 hover:text-slate-700">
              <X className="w-3.5 h-3.5" /> Limpiar
            </button>
          )}
        </div>
      </div>

      {cargando ? <Cargando texto="Cargando la bitácora…" />
        : error ? <ErrorBox error={error} onReintentar={() => cargar(0)} />
        : registros.length === 0 ? (
          <Vacio
            titulo="Sin movimientos"
            texto={activos > 0 ? 'Ningún movimiento coincide con estos filtros.' : 'Todavía no hay actividad registrada.'}
          />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2 font-medium">Cuándo</th>
                    <th className="px-3 py-2 font-medium">Quién</th>
                    <th className="px-3 py-2 font-medium">Qué hizo</th>
                    <th className="px-3 py-2 font-medium">Archivo</th>
                    <th className="px-3 py-2 font-medium">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map(r => (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{fechaHora(r.fecha)}</td>
                      <td className="px-3 py-2 text-slate-700">{r.usuario}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${COLOR_ACCION(r.accion)}`}>
                          {r.accionTexto}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {r.archivo}
                        {r.empresa && <span className="ml-1 text-[11px] text-slate-400">({r.empresa})</span>}
                      </td>
                      <td className="max-w-xs px-3 py-2 text-xs text-slate-500">
                        <Detalle registro={r} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hayMas && (
              <div className="mt-3 text-center">
                <button
                  onClick={() => cargar(registros.length)}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-slate-300"
                >
                  Ver más
                </button>
              </div>
            )}
            <p className="mt-2 text-center text-[11px] text-slate-400">{registros.length} movimiento(s)</p>
          </>
        )}
    </div>
  );
}

/** El "antes → después" solo tiene sentido cuando hubo un cambio de valor. */
function Detalle({ registro }) {
  const { columna, valorAnterior, valorNuevo } = registro;
  if (registro.accion === 'CELDA_EDITADA') {
    return (
      <span className="block truncate" title={`${valorAnterior || '(vacío)'} → ${valorNuevo || '(vacío)'}`}>
        {columna && <span className="text-slate-400">{columna}: </span>}
        <span className="line-through decoration-slate-300">{valorAnterior || '(vacío)'}</span>
        {' → '}
        <span className="text-slate-700">{valorNuevo || '(vacío)'}</span>
      </span>
    );
  }
  const texto = valorNuevo || valorAnterior || '';
  return <span className="block truncate" title={texto}>{texto || '—'}</span>;
}

function Campo({ etiqueta, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{etiqueta}</span>
      {children}
    </label>
  );
}
