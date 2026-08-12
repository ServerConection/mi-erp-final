/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Evaluaciones · Panel de resultados (solo creador/admin)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Download, Mail, MailWarning } from 'lucide-react';
import { descargar, evaluacionesApi } from '../../hooks/useEvaluaciones';
import { Cargando, ErrorBox, EstadoBadge, Vacio, fechaCorta } from './ui';

export default function ResultadosPanel({ evaluacionId, onVolver }) {
  const [datos, setDatos]       = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState(null);
  const [exportando, setExportando] = useState(false);

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

  return (
    <div className="p-4 sm:p-6">
      <button onClick={onVolver} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Volver
      </button>

      {cargando ? <Cargando texto="Cargando resultados…" /> : error ? (
        <ErrorBox error={error} onReintentar={cargar} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-800">{datos.evaluacion.titulo}</h1>
              <p className="text-xs text-slate-500">
                {datos.evaluacion.totalPreguntas} preguntas · nota mínima {datos.evaluacion.notaMinima}% · {datos.intentos.length} respondieron
              </p>
            </div>
            <button
              onClick={exportar}
              disabled={exportando || datos.intentos.length === 0}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" /> {exportando ? 'Generando…' : 'Exportar a Excel'}
            </button>
          </div>

          {datos.intentos.length === 0 ? (
            <Vacio titulo="Todavía nadie la ha respondido" />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5">Nombre</th>
                    <th className="px-4 py-2.5">Empresa</th>
                    <th className="px-4 py-2.5">Nota</th>
                    <th className="px-4 py-2.5">Correctas</th>
                    <th className="px-4 py-2.5">Resultado</th>
                    <th className="px-4 py-2.5">Correo</th>
                    <th className="px-4 py-2.5">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.intentos.map(i => (
                    <tr key={i.id} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{i.nombre}</td>
                      <td className="px-4 py-2.5 text-slate-500">{i.empresa}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-700">{i.nota}%</td>
                      <td className="px-4 py-2.5 text-slate-500">{i.correctas}/{i.totalPreguntas}</td>
                      <td className="px-4 py-2.5"><EstadoBadge aprobado={i.aprobado} /></td>
                      <td className="px-4 py-2.5">
                        {i.correoEnviado
                          ? <Mail className="h-4 w-4 text-emerald-500" titleAccess="Enviado" />
                          : <MailWarning className="h-4 w-4 text-amber-500" titleAccess="No se pudo enviar" />}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{fechaCorta(i.respondidaEn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
