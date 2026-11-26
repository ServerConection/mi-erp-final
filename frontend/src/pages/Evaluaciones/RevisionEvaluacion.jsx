import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, CircleX, Loader2 } from 'lucide-react';
import { evaluacionesApi } from '../../hooks/useEvaluaciones';
import { ErrorBox, EstadoBadge } from './ui';

const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export default function RevisionEvaluacion({ evaluacionId, onVolver }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try { setDatos((await evaluacionesApi.revisionPropia(evaluacionId)).data); }
    catch (e) { setError(e.message); }
    finally { setCargando(false); }
  }, [evaluacionId]);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) return <div className="grid min-h-[calc(100vh-4rem)] place-items-center bg-slate-50"><div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Loader2 className="h-5 w-5 animate-spin"/>Cargando revisión…</div></div>;
  if (error) return <div className="mx-auto max-w-4xl p-6"><button onClick={onVolver} className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-600"><ArrowLeft size={16}/>Volver</button><ErrorBox error={error} onReintentar={cargar}/></div>;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <button onClick={onVolver} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Volver"><ArrowLeft size={19}/></button>
          <div className="min-w-0 flex-1"><p className="truncate font-bold text-slate-900">Revisión · {datos.evaluacion.titulo}</p><p className="text-xs text-slate-500">{datos.resultado.correctas} de {datos.resultado.total} respuestas correctas</p></div>
          <span className="text-lg font-black tabular-nums text-slate-900">{datos.resultado.nota}%</span>
          <EstadoBadge aprobado={datos.resultado.aprobado}/>
        </div>
      </div>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-6">
        {datos.preguntas.map((p) => (
          <article key={p.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${p.esCorrecta ? 'border-emerald-200' : 'border-rose-200'}`}>
            <div className="mb-4 flex items-start gap-3">
              {p.esCorrecta ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"/> : <CircleX className="mt-0.5 h-5 w-5 shrink-0 text-rose-600"/>}
              <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Pregunta {p.numero}</p><h2 className="font-semibold leading-snug text-slate-900">{p.texto}</h2></div>
            </div>
            {p.imagen && <img src={p.imagen} alt={`Imagen de la pregunta ${p.numero}`} className="mb-4 max-h-72 w-full rounded-xl border border-slate-200 object-contain"/>}
            <div className="space-y-2">
              {p.opciones.map((opcion, indice) => {
                const correcta = indice === p.opcionCorrecta;
                const elegida = indice === p.opcionElegida;
                const clase = correcta ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : elegida ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-slate-200 bg-slate-50 text-slate-600';
                return <div key={indice} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${clase}`}><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold ${correcta ? 'bg-emerald-600 text-white' : elegida ? 'bg-rose-600 text-white' : 'bg-white text-slate-500'}`}>{LETRAS[indice] || indice + 1}</span><span className="flex-1">{opcion}</span>{correcta && <span className="text-xs font-bold text-emerald-700">Respuesta correcta</span>}{elegida && !correcta && <span className="text-xs font-bold text-rose-700">Tu respuesta</span>}</div>;
              })}
              {p.opcionElegida == null && <p className="text-xs font-semibold text-rose-600">No respondiste esta pregunta.</p>}
            </div>
          </article>
        ))}
      </main>
    </div>
  );
}
