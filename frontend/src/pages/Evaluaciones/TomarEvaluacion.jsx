/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Evaluaciones · Pantalla para responder
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Mail } from 'lucide-react';
import { evaluacionesApi } from '../../hooks/useEvaluaciones';
import { Cargando, ErrorBox, EstadoBadge } from './ui';

export default function TomarEvaluacion({ evaluacionId, onVolver }) {
  const [datos, setDatos]         = useState(null);
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState(null);
  const [yaRespondida, setYaRespondida] = useState(null); // { nota, aprobado } si ya la tomó
  const [respuestas, setRespuestas]     = useState({});   // { preguntaId: opcionIndex }
  const [enviando, setEnviando]   = useState(false);
  const [resultado, setResultado] = useState(null);        // resultado recién obtenido

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    setYaRespondida(null);
    try {
      const r = await evaluacionesApi.detalleParaTomar(evaluacionId);
      setDatos(r.data);
    } catch (e) {
      if (e.status === 409 && e.resultado) {
        setYaRespondida(e.resultado);
      } else {
        setError(e.message);
      }
    } finally {
      setCargando(false);
    }
  }, [evaluacionId]);

  useEffect(() => { cargar(); }, [cargar]);

  const elegir = (preguntaId, opcionIndex) =>
    setRespuestas(prev => ({ ...prev, [preguntaId]: opcionIndex }));

  const enviar = async () => {
    const faltantes = datos.preguntas.filter(p => respuestas[p.id] === undefined);
    if (faltantes.length > 0) {
      setError(`Te falta responder ${faltantes.length} pregunta${faltantes.length > 1 ? 's' : ''}`);
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const cuerpo = datos.preguntas.map(p => ({ preguntaId: p.id, opcionElegida: respuestas[p.id] }));
      const r = await evaluacionesApi.responder(evaluacionId, cuerpo);
      setResultado(r.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const encabezado = (
    <button onClick={onVolver} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
      <ArrowLeft className="h-4 w-4" /> Volver
    </button>
  );

  if (cargando) return <div className="p-6">{encabezado}<Cargando texto="Cargando evaluación…" /></div>;

  if (yaRespondida) {
    return (
      <div className="mx-auto max-w-lg p-6">
        {encabezado}
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="mb-3 text-sm text-slate-500">Ya respondiste esta evaluación</p>
          <p className="mb-2 text-4xl font-bold text-slate-800">{yaRespondida.nota}%</p>
          <EstadoBadge aprobado={yaRespondida.aprobado} />
        </div>
      </div>
    );
  }

  if (resultado) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className={`rounded-xl border p-8 text-center ${resultado.aprobado ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
          <div className="mb-3 text-4xl">{resultado.aprobado ? '🏆' : '📋'}</div>
          <p className="mb-1 text-4xl font-bold text-slate-800">{resultado.nota}%</p>
          <p className="mb-4 text-sm text-slate-500">{resultado.correctas} de {resultado.total} correctas</p>
          <EstadoBadge aprobado={resultado.aprobado} />
          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <Mail className="h-3.5 w-3.5" />
            {resultado.correoEnviado
              ? (resultado.aprobado ? 'Te enviamos tu certificado por correo' : 'Te enviamos el resultado por correo')
              : 'No pudimos enviarte el correo — avisa a sistemas'}
          </p>
          <button onClick={onVolver} className="mt-6 rounded-md bg-slate-800 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Volver
          </button>
        </div>
      </div>
    );
  }

  if (error && !datos) return <div className="p-6">{encabezado}<ErrorBox error={error} onReintentar={cargar} /></div>;
  if (!datos) return null;

  return (
    <div className="mx-auto max-w-2xl p-6 pb-28">
      {encabezado}
      <h1 className="mb-1 text-lg font-semibold text-slate-800">{datos.titulo}</h1>
      {datos.moduloTema && <p className="mb-1 text-sm text-slate-500">{datos.moduloTema}</p>}
      <p className="mb-6 text-xs text-slate-400">Nota mínima para aprobar: {datos.notaMinima}% · Solo tienes 1 intento</p>

      <div className="space-y-5">
        {datos.preguntas.map((p, i) => (
          <div key={p.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-medium text-slate-800">{i + 1}. {p.texto}</p>
            <div className="space-y-1.5">
              {p.opciones.map((o, j) => (
                <label key={j} className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition ${
                  respuestas[p.id] === j ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                }`}>
                  <input type="radio" name={p.id} checked={respuestas[p.id] === j} onChange={() => elegir(p.id, j)} />
                  {o}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {error && <div className="mt-4"><ErrorBox error={error} /></div>}

      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white p-4 sm:pl-[calc(theme(spacing.4)+var(--sidebar-w,0px))]">
        <div className="mx-auto max-w-2xl">
          <button
            onClick={enviar}
            disabled={enviando}
            className="w-full rounded-md bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {enviando ? 'Enviando…' : 'Enviar respuestas'}
          </button>
        </div>
      </div>
    </div>
  );
}
