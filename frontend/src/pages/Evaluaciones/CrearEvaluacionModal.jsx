/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Evaluaciones · Modal "Nueva evaluación"
 * ═══════════════════════════════════════════════════════════════════════════════
 * Formulario de opción múltiple: título + tema + empresa + nota mínima, y un
 * builder de preguntas donde cada una tiene 2-6 opciones y se marca cuál es
 * la correcta con un radio button.
 */

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { evaluacionesApi } from '../../hooks/useEvaluaciones';
import { Modal } from './ui';

const preguntaVacia = () => ({ texto: '', opciones: ['', ''], correcta: 0 });

export default function CrearEvaluacionModal({ abierto, onCerrar, onCreada, onError }) {
  const [titulo, setTitulo]         = useState('');
  const [moduloTema, setModuloTema] = useState('');
  const [empresa, setEmpresa]       = useState('');
  const [notaMinima, setNotaMinima] = useState(70);
  const [preguntas, setPreguntas]   = useState([preguntaVacia()]);
  const [guardando, setGuardando]   = useState(false);

  const reset = () => {
    setTitulo(''); setModuloTema(''); setEmpresa(''); setNotaMinima(70);
    setPreguntas([preguntaVacia()]);
  };

  const cerrar = () => { reset(); onCerrar(); };

  const actualizarPregunta = (i, cambios) =>
    setPreguntas(prev => prev.map((p, idx) => idx === i ? { ...p, ...cambios } : p));

  const actualizarOpcion = (i, j, valor) =>
    setPreguntas(prev => prev.map((p, idx) => idx === i
      ? { ...p, opciones: p.opciones.map((o, k) => k === j ? valor : o) }
      : p));

  const agregarOpcion = (i) =>
    setPreguntas(prev => prev.map((p, idx) => idx === i && p.opciones.length < 6
      ? { ...p, opciones: [...p.opciones, ''] }
      : p));

  const quitarOpcion = (i, j) =>
    setPreguntas(prev => prev.map((p, idx) => {
      if (idx !== i || p.opciones.length <= 2) return p;
      const opciones = p.opciones.filter((_, k) => k !== j);
      const correcta = p.correcta === j ? 0 : p.correcta > j ? p.correcta - 1 : p.correcta;
      return { ...p, opciones, correcta };
    }));

  const agregarPregunta = () => setPreguntas(prev => [...prev, preguntaVacia()]);
  const quitarPregunta = (i) => setPreguntas(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);

  const guardar = async () => {
    if (titulo.trim().length < 3) return onError?.('El título debe tener al menos 3 caracteres');
    for (let i = 0; i < preguntas.length; i++) {
      const p = preguntas[i];
      if (p.texto.trim().length < 3) return onError?.(`La pregunta ${i + 1} necesita un enunciado`);
      if (p.opciones.some(o => o.trim() === '')) return onError?.(`La pregunta ${i + 1} tiene una opción vacía`);
    }

    setGuardando(true);
    try {
      const r = await evaluacionesApi.crear({
        titulo: titulo.trim(),
        moduloTema: moduloTema.trim() || undefined,
        empresa: empresa || undefined,
        notaMinima: Number(notaMinima),
        preguntas: preguntas.map(p => ({
          texto: p.texto.trim(),
          opciones: p.opciones.map(o => o.trim()),
          correcta: p.correcta,
        })),
      });
      onCreada(r.data);
      cerrar();
    } catch (e) {
      onError?.(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal abierto={abierto} onCerrar={cerrar} titulo="Nueva evaluación">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">Título</label>
            <input
              value={titulo} onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej: Evaluación módulo Nueva Venta"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Módulo / tema (opcional)</label>
            <input
              value={moduloTema} onChange={(e) => setModuloTema(e.target.value)}
              placeholder="Ej: Cobertura"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Empresa</label>
            <select
              value={empresa} onChange={(e) => setEmpresa(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
            >
              <option value="">Ambas (Novonet y Velsa)</option>
              <option value="NOVONET">Solo Novonet</option>
              <option value="VELSA">Solo Velsa</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Nota mínima para aprobar: <span className="font-semibold text-slate-700">{notaMinima}%</span>
            </label>
            <input
              type="range" min={1} max={100} value={notaMinima}
              onChange={(e) => setNotaMinima(e.target.value)}
              className="w-full"
            />
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-700">Preguntas ({preguntas.length})</h4>
            <button onClick={agregarPregunta} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
              <Plus className="h-3.5 w-3.5" /> Agregar pregunta
            </button>
          </div>

          <div className="space-y-4">
            {preguntas.map((p, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3.5">
                <div className="mb-2 flex items-start gap-2">
                  <span className="mt-2 shrink-0 text-xs font-semibold text-slate-400">#{i + 1}</span>
                  <input
                    value={p.texto} onChange={(e) => actualizarPregunta(i, { texto: e.target.value })}
                    placeholder="Escribe la pregunta…"
                    className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                  />
                  {preguntas.length > 1 && (
                    <button onClick={() => quitarPregunta(i)} className="mt-1.5 shrink-0 rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="ml-6 space-y-1.5">
                  {p.opciones.map((o, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <input
                        type="radio" name={`correcta-${i}`} checked={p.correcta === j}
                        onChange={() => actualizarPregunta(i, { correcta: j })}
                        title="Marcar como respuesta correcta"
                      />
                      <input
                        value={o} onChange={(e) => actualizarOpcion(i, j, e.target.value)}
                        placeholder={`Opción ${j + 1}`}
                        className="flex-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
                      />
                      {p.opciones.length > 2 && (
                        <button onClick={() => quitarOpcion(i, j)} className="shrink-0 rounded-md p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {p.opciones.length < 6 && (
                    <button onClick={() => agregarOpcion(i)} className="mt-1 text-xs font-medium text-blue-600 hover:underline">
                      + Agregar opción
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={guardar}
          disabled={guardando}
          className="w-full rounded-md bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {guardando ? 'Creando…' : 'Crear evaluación'}
        </button>
      </div>
    </Modal>
  );
}
