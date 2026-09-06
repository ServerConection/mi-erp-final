/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Evaluaciones · Modal "Nueva evaluación"
 * ═══════════════════════════════════════════════════════════════════════════════
 * Builder de opción múltiple: datos generales + preguntas con 2-6 opciones y un
 * radio para marcar la correcta. La validación y el payload son los mismos de
 * siempre; lo que cambió es la presentación.
 */

import { useMemo, useState } from 'react';
import {
  CheckCircle2, Clock, FileQuestion, ImagePlus, Plus, Sparkles, Trash2, X,
} from 'lucide-react';
import { evaluacionesApi } from '../../hooks/useEvaluaciones';
import { Chip, Modal } from './ui';
import './evaluaciones.css';

const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F'];
const MAX_IMAGEN_BYTES = 2 * 1024 * 1024;
const MAX_IMAGENES_TOTAL_BYTES = 6 * 1024 * 1024;
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const preguntaVacia = () => ({ texto: '', imagen: null, opciones: ['', ''], correcta: 0 });

const claseInput =
  'w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition ' +
  'focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50';

export default function CrearEvaluacionModal({ abierto, onCerrar, onCreada, onError }) {
  const [titulo, setTitulo]                   = useState('');
  const [moduloTema, setModuloTema]           = useState('');
  const [empresa, setEmpresa]                 = useState('');
  const [notaMinima, setNotaMinima]           = useState(70);
  const [tieneLimite, setTieneLimite]         = useState(false);
  const [tiempoLimiteMin, setTiempoLimiteMin] = useState(20);
  const [preguntas, setPreguntas]             = useState([preguntaVacia()]);
  const [guardando, setGuardando]             = useState(false);

  const reset = () => {
    setTitulo(''); setModuloTema(''); setEmpresa(''); setNotaMinima(70);
    setTieneLimite(false); setTiempoLimiteMin(20);
    setPreguntas([preguntaVacia()]);
  };

  const cerrar = () => { reset(); onCerrar(); };

  // ── Manipulación de preguntas / opciones (sin cambios de lógica) ────────────
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
  const quitarPregunta  = (i) => setPreguntas(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);

  const seleccionarImagen = (i, archivo) => {
    if (!archivo) return;
    if (!TIPOS_IMAGEN.includes(archivo.type)) return onError?.('La imagen debe ser JPG, PNG, WebP o GIF');
    if (archivo.size > MAX_IMAGEN_BYTES) return onError?.('La imagen no puede superar 2 MB');

    const lector = new FileReader();
    lector.onload  = () => actualizarPregunta(i, { imagen: lector.result });
    lector.onerror = () => onError?.('No se pudo leer la imagen');
    lector.readAsDataURL(archivo);
  };

  // ── Progreso de armado: da sensación de avance mientras se construye ───────
  const listas = useMemo(
    () => preguntas.filter(p => p.texto.trim().length >= 3 && p.opciones.every(o => o.trim() !== '')).length,
    [preguntas],
  );
  const progreso = preguntas.length ? Math.round((listas / preguntas.length) * 100) : 0;

  // ── Guardar ────────────────────────────────────────────────────────────────
  const guardar = async () => {
    if (titulo.trim().length < 3) return onError?.('El título debe tener al menos 3 caracteres');
    if (tieneLimite && (!Number(tiempoLimiteMin) || tiempoLimiteMin < 1 || tiempoLimiteMin > 180)) {
      return onError?.('El tiempo límite debe estar entre 1 y 180 minutos');
    }
    for (let i = 0; i < preguntas.length; i++) {
      const p = preguntas[i];
      if (p.texto.trim().length < 3) return onError?.(`La pregunta ${i + 1} necesita un enunciado`);
      if (p.opciones.some(o => o.trim() === '')) return onError?.(`La pregunta ${i + 1} tiene una opción vacía`);
    }
    const totalImagenes = preguntas.reduce((total, p) => {
      const base64 = p.imagen?.split(',')[1] || '';
      return total + Math.floor(base64.length * 3 / 4);
    }, 0);
    if (totalImagenes > MAX_IMAGENES_TOTAL_BYTES) return onError?.('Las imágenes no pueden superar 6 MB en total');

    setGuardando(true);
    try {
      const r = await evaluacionesApi.crear({
        titulo: titulo.trim(),
        moduloTema: moduloTema.trim() || undefined,
        empresa: empresa || undefined,
        notaMinima: Number(notaMinima),
        tiempoLimiteMin: tieneLimite ? Number(tiempoLimiteMin) : null,
        preguntas: preguntas.map(p => ({
          texto: p.texto.trim(),
          imagen: p.imagen || undefined,
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

  const pie = (
    <div className="flex items-center gap-3">
      <div className="hidden flex-1 sm:block">
        <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
          <span>{listas} de {preguntas.length} preguntas completas</span>
          <span className="font-semibold text-slate-600">{progreso}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div className="eva-bar h-1.5 rounded-full" style={{ width: `${progreso}%` }} />
        </div>
      </div>
      <button
        onClick={guardar}
        disabled={guardando}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:from-indigo-700 hover:to-violet-700 disabled:opacity-40"
      >
        <Sparkles className="h-4 w-4" /> {guardando ? 'Creando…' : 'Crear evaluación'}
      </button>
    </div>
  );

  return (
    <Modal
      abierto={abierto}
      onCerrar={cerrar}
      titulo="Nueva evaluación"
      subtitulo="Opción múltiple · 1 intento por persona · se califica sola"
      ancho="max-w-3xl"
      pie={pie}
    >
      <div className="space-y-5">
        {/* ── Datos generales ─────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Datos generales
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-slate-500">Título</label>
              <input
                value={titulo} onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej: Evaluación módulo Nueva Venta"
                className={claseInput}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">Módulo / tema (opcional)</label>
              <input
                value={moduloTema} onChange={(e) => setModuloTema(e.target.value)}
                placeholder="Ej: Cobertura"
                className={claseInput}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">Empresa</label>
              <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className={claseInput}>
                <option value="">Ambas (Novonet y Velsa)</option>
                <option value="NOVONET">Solo Novonet</option>
                <option value="VELSA">Solo Velsa</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Nota mínima para aprobar</span>
                <span className="rounded-lg bg-indigo-50 px-2 py-0.5 text-sm font-bold text-indigo-700">{notaMinima}%</span>
              </label>
              <input
                type="range" min={1} max={100} value={notaMinima}
                onChange={(e) => setNotaMinima(e.target.value)}
                className="w-full accent-indigo-600"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox" checked={tieneLimite}
                  onChange={(e) => setTieneLimite(e.target.checked)}
                  className="h-4 w-4 accent-indigo-600"
                />
                <Clock className="h-4 w-4 text-slate-400" /> Poner límite de tiempo
              </label>
              {tieneLimite && (
                <div className="eva-fade-up mt-2 flex items-center gap-2">
                  <input
                    type="number" min={1} max={180} value={tiempoLimiteMin}
                    onChange={(e) => setTiempoLimiteMin(e.target.value)}
                    className={`w-24 ${claseInput}`}
                  />
                  <span className="text-xs text-slate-500">minutos — se envía sola al llegar a 0</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Preguntas ───────────────────────────────────────────────────── */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Preguntas
              <Chip tono="indigo" icono={FileQuestion}>{preguntas.length}</Chip>
            </h4>
            <button
              onClick={agregarPregunta}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar pregunta
            </button>
          </div>

          <div className="space-y-3">
            {preguntas.map((p, i) => {
              const completa = p.texto.trim().length >= 3 && p.opciones.every(o => o.trim() !== '');
              return (
                <div
                  key={i}
                  className={`eva-fade-up rounded-2xl border bg-white p-4 transition ${
                    completa ? 'border-emerald-200' : 'border-slate-200'
                  }`}
                >
                  <div className="mb-3 flex items-start gap-2.5">
                    <span className={`mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
                      completa ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {completa ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <input
                      value={p.texto} onChange={(e) => actualizarPregunta(i, { texto: e.target.value })}
                      placeholder={`Pregunta ${i + 1}…`}
                      className={`flex-1 ${claseInput}`}
                    />
                    {preguntas.length > 1 && (
                      <button
                        onClick={() => quitarPregunta(i)}
                        className="mt-1.5 shrink-0 rounded-lg p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                        title="Quitar pregunta"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Imagen de apoyo */}
                  <div className="mb-3 ml-9">
                    {p.imagen ? (
                      <div className="eva-pop relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        <img src={p.imagen} alt={`Imagen de la pregunta ${i + 1}`} className="max-h-56 w-full object-contain" />
                        <button
                          type="button" onClick={() => actualizarPregunta(i, { imagen: null })}
                          className="absolute right-2 top-2 rounded-full bg-slate-900/70 p-1 text-white transition hover:bg-rose-600"
                          title="Quitar imagen"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-500 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600">
                        <ImagePlus className="h-4 w-4" /> Agregar imagen
                        <span className="text-[10px] text-slate-400">(JPG, PNG, WebP o GIF · máx. 2 MB)</span>
                        <input
                          type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only"
                          onChange={(e) => { seleccionarImagen(i, e.target.files?.[0]); e.target.value = ''; }}
                        />
                      </label>
                    )}
                  </div>

                  {/* Opciones */}
                  <div className="space-y-1.5">
                    {p.opciones.map((o, j) => {
                      const esCorrecta = p.correcta === j;
                      return (
                        <div
                          key={j}
                          className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 transition ${
                            esCorrecta ? 'border-emerald-300 bg-emerald-50/60' : 'border-transparent'
                          }`}
                        >
                          <label className="flex cursor-pointer items-center gap-2" title="Marcar como respuesta correcta">
                            <input
                              type="radio" name={`correcta-${i}`} checked={esCorrecta}
                              onChange={() => actualizarPregunta(i, { correcta: j })}
                              className="h-4 w-4 accent-emerald-600"
                            />
                            <span className={`flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold ${
                              esCorrecta ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {LETRAS[j]}
                            </span>
                          </label>
                          <input
                            value={o} onChange={(e) => actualizarOpcion(i, j, e.target.value)}
                            placeholder={`Opción ${LETRAS[j]}`}
                            className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none transition focus:border-indigo-400"
                          />
                          {p.opciones.length > 2 && (
                            <button
                              onClick={() => quitarOpcion(i, j)}
                              className="shrink-0 rounded-lg p-1 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                              title="Quitar opción"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {p.opciones.length < 6 && (
                      <button
                        onClick={() => agregarOpcion(i)}
                        className="ml-1 mt-1 text-xs font-medium text-indigo-600 transition hover:text-indigo-800"
                      >
                        + Agregar opción
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </Modal>
  );
}
