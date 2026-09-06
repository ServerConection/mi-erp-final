/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Evaluaciones · Panel de resultados (solo creador / admin)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Indicadores arriba, distribución de notas, buscador, filtro por resultado y
 * tabla ordenable. Mismos endpoints que la versión anterior.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowUpDown, Award, Download, Mail, MailWarning, Search,
  TrendingUp, Users,
} from 'lucide-react';
import { descargar, evaluacionesApi } from '../../hooks/useEvaluaciones';
import {
  BarraProgreso, Chip, ErrorBox, EstadoBadge, SkeletonFilas, Vacio, fechaCorta, iniciales,
} from './ui';
import './evaluaciones.css';

const COLUMNAS = [
  { id: 'nombre',       etiqueta: 'Asesor' },
  { id: 'empresa',      etiqueta: 'Empresa' },
  { id: 'nota',         etiqueta: 'Nota' },
  { id: 'correctas',    etiqueta: 'Correctas' },
  { id: 'aprobado',     etiqueta: 'Resultado' },
  { id: 'correoEnviado',etiqueta: 'Correo' },
  { id: 'respondidaEn', etiqueta: 'Fecha' },
];

export default function ResultadosPanel({ evaluacionId, onVolver }) {
  const [datos, setDatos]           = useState(null);
  const [cargando, setCargando]     = useState(true);
  const [error, setError]           = useState(null);
  const [exportando, setExportando] = useState(false);
  const [busqueda, setBusqueda]     = useState('');
  const [filtro, setFiltro]         = useState('todos'); // todos | aprobados | reprobados
  const [orden, setOrden]           = useState({ campo: 'nota', dir: 'desc' });

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await evaluacionesApi.resultados(evaluacionId);
      setDatos(r.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [evaluacionId]);

  useEffect(() => { cargar(); }, [cargar]);

  const exportar = async () => {
    setExportando(true);
    try {
      const blob = await evaluacionesApi.exportar(evaluacionId);
      descargar(blob, `${datos.evaluacion.titulo}.xlsx`);
    } catch {
      setError('No se pudo generar el Excel');
    } finally {
      setExportando(false);
    }
  };

  const intentos = datos?.intentos || [];

  const stats = useMemo(() => {
    if (intentos.length === 0) return { total: 0, aprobados: 0, tasa: 0, promedio: 0, mejor: 0 };
    const aprobados = intentos.filter(i => i.aprobado).length;
    return {
      total: intentos.length,
      aprobados,
      tasa: Math.round((aprobados / intentos.length) * 100),
      promedio: Math.round(intentos.reduce((s, i) => s + i.nota, 0) / intentos.length),
      mejor: Math.max(...intentos.map(i => i.nota)),
    };
  }, [intentos]);

  /** Distribución en tramos de 20 puntos, para ver de un vistazo dónde está el equipo. */
  const distribucion = useMemo(() => {
    const tramos = [
      { rango: '0-20',   min: 0,  max: 20,  color: 'bg-rose-400' },
      { rango: '21-40',  min: 21, max: 40,  color: 'bg-orange-400' },
      { rango: '41-60',  min: 41, max: 60,  color: 'bg-amber-400' },
      { rango: '61-80',  min: 61, max: 80,  color: 'bg-lime-400' },
      { rango: '81-100', min: 81, max: 100, color: 'bg-emerald-500' },
    ];
    const max = Math.max(1, ...tramos.map(t => intentos.filter(i => i.nota >= t.min && i.nota <= t.max).length));
    return tramos.map(t => {
      const cantidad = intentos.filter(i => i.nota >= t.min && i.nota <= t.max).length;
      return { ...t, cantidad, alto: Math.round((cantidad / max) * 100) };
    });
  }, [intentos]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtrados = intentos.filter(i => {
      if (filtro === 'aprobados' && !i.aprobado) return false;
      if (filtro === 'reprobados' && i.aprobado) return false;
      if (!q) return true;
      return `${i.nombre} ${i.empresa || ''}`.toLowerCase().includes(q);
    });
    const { campo, dir } = orden;
    const signo = dir === 'asc' ? 1 : -1;
    return [...filtrados].sort((a, b) => {
      const va = a[campo], vb = b[campo];
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * signo;
      return String(va ?? '').localeCompare(String(vb ?? ''), 'es') * signo;
    });
  }, [intentos, busqueda, filtro, orden]);

  const ordenarPor = (campo) =>
    setOrden(prev => ({ campo, dir: prev.campo === campo && prev.dir === 'desc' ? 'asc' : 'desc' }));

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="eva-hero border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
          <button
            onClick={onVolver}
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" /> Volver
          </button>

          {datos && (
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-800">{datos.evaluacion.titulo}</h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Chip tono="slate">{datos.evaluacion.totalPreguntas} preguntas</Chip>
                  <Chip tono="violet">Mínimo {datos.evaluacion.notaMinima}%</Chip>
                  <Chip tono="indigo">{intentos.length} respondieron</Chip>
                </div>
              </div>

              <button
                onClick={exportar}
                disabled={exportando || intentos.length === 0}
                className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
              >
                <Download className="h-4 w-4" /> {exportando ? 'Generando…' : 'Exportar a Excel'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {cargando ? (
          <SkeletonFilas cantidad={8} />
        ) : error ? (
          <ErrorBox error={error} onReintentar={cargar} />
        ) : intentos.length === 0 ? (
          <Vacio titulo="Todavía nadie la ha respondido" texto="Cuando el equipo empiece a responder verás aquí sus notas." />
        ) : (
          <div className="space-y-6">
            {/* ── Indicadores ─────────────────────────────────────────────── */}
            <div className="eva-stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
              <TarjetaDato icono={Users}      etiqueta="Respondieron"    valor={stats.total} />
              <TarjetaDato icono={Award}      etiqueta="Aprobados"       valor={`${stats.aprobados} (${stats.tasa}%)`} tono="emerald" />
              <TarjetaDato icono={TrendingUp} etiqueta="Nota promedio"   valor={`${stats.promedio}%`} tono="indigo" />
              <TarjetaDato icono={Award}      etiqueta="Mejor nota"      valor={`${stats.mejor}%`} tono="amber" />
            </div>

            {/* ── Distribución ────────────────────────────────────────────── */}
            <div className="eva-fade-up rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Distribución de notas
              </h3>
              <div className="flex h-32 items-end gap-3">
                {distribucion.map(t => (
                  <div key={t.rango} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="text-xs font-semibold tabular-nums text-slate-600">{t.cantidad}</span>
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className={`w-full rounded-t-lg ${t.color} transition-all duration-700`}
                        style={{ height: `${Math.max(t.cantidad ? 6 : 2, t.alto)}%` }}
                        title={`${t.cantidad} persona(s) entre ${t.rango}%`}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400">{t.rango}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Filtros ─────────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar asesor…"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                />
              </div>

              <div className="flex rounded-xl bg-white p-1 ring-1 ring-slate-200">
                {[
                  { id: 'todos',      etiqueta: 'Todos' },
                  { id: 'aprobados',  etiqueta: 'Aprobados' },
                  { id: 'reprobados', etiqueta: 'Reprobados' },
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setFiltro(f.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      filtro === f.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {f.etiqueta}
                  </button>
                ))}
              </div>

              <span className="text-xs text-slate-400">{visibles.length} de {intentos.length}</span>
            </div>

            {/* ── Tabla ───────────────────────────────────────────────────── */}
            <div className="eva-scroll overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {COLUMNAS.map(c => (
                      <th key={c.id} className="whitespace-nowrap px-4 py-3">
                        <button
                          onClick={() => ordenarPor(c.id)}
                          className={`inline-flex items-center gap-1 transition hover:text-slate-700 ${
                            orden.campo === c.id ? 'text-indigo-600' : ''
                          }`}
                        >
                          {c.etiqueta}
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(i => (
                    <tr key={i.id} className="border-t border-slate-50 transition-colors hover:bg-indigo-50/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-[11px] font-bold text-white">
                            {iniciales(i.nombre)}
                          </span>
                          <span className="font-medium text-slate-800">{i.nombre}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{i.empresa}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-10 font-semibold tabular-nums text-slate-700">{i.nota}%</span>
                          <div className="hidden w-20 lg:block"><BarraProgreso valor={i.nota} alto="h-1.5" /></div>
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-500">{i.correctas}/{i.totalPreguntas}</td>
                      <td className="px-4 py-3"><EstadoBadge aprobado={i.aprobado} /></td>
                      <td className="px-4 py-3">
                        {i.correoEnviado
                          ? <Mail className="h-4 w-4 text-emerald-500" titleAccess="Enviado" />
                          : <MailWarning className="h-4 w-4 text-amber-500" titleAccess="No se pudo enviar" />}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">{fechaCorta(i.respondidaEn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {visibles.length === 0 && (
                <div className="px-4 py-10 text-center text-sm text-slate-400">
                  Ningún asesor coincide con el filtro.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════

function TarjetaDato({ icono: Icono, etiqueta, valor, tono = 'slate' }) {
  const tonos = {
    slate:   'from-slate-500 to-slate-600 shadow-slate-100',
    indigo:  'from-indigo-500 to-violet-500 shadow-indigo-100',
    emerald: 'from-emerald-500 to-teal-500 shadow-emerald-100',
    amber:   'from-amber-500 to-orange-500 shadow-amber-100',
  };
  return (
    <div className="eva-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`rounded-xl bg-gradient-to-br ${tonos[tono]} p-2.5 text-white shadow-md`}>
          <Icono className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xl font-bold leading-none tabular-nums text-slate-800">{valor}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{etiqueta}</p>
        </div>
      </div>
    </div>
  );
}
