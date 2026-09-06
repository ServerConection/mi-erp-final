/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Evaluaciones · Entorno de prueba (responder)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Una pregunta a la vez, como Typeform/Kahoot: barra de progreso, navegador de
 * preguntas, atajos de teclado, cronómetro en anillo, pantalla de revisión antes
 * de enviar y resultado animado.
 *
 * No cambia el contrato con el backend: sigue enviando TODAS las respuestas
 * juntas en POST /:id/responder, igual que la versión anterior.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, Clock, Keyboard,
  ListChecks, Mail, Send, Trophy, X,
} from 'lucide-react';
import { evaluacionesApi } from '../../hooks/useEvaluaciones';
import {
  AnilloNota, Cargando, Chip, Confeti, ErrorBox, EstadoBadge, Modal,
} from './ui';
import './evaluaciones.css';

const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F'];
const dosDigitos = (n) => String(n).padStart(2, '0');
const formatoReloj = (segundos) => `${dosDigitos(Math.floor(segundos / 60))}:${dosDigitos(segundos % 60)}`;
const claveBorrador = (id) => `eva:borrador:${id}`;

export default function TomarEvaluacion({ evaluacionId, onVolver }) {
  const [datos, setDatos]                 = useState(null);
  const [cargando, setCargando]           = useState(true);
  const [error, setError]                 = useState(null);
  const [yaRespondida, setYaRespondida]   = useState(null);
  const [respuestas, setRespuestas]       = useState({});
  const [indice, setIndice]               = useState(0);
  const [direccion, setDireccion]         = useState('adelante');
  const [enviando, setEnviando]           = useState(false);
  const [resultado, setResultado]         = useState(null);
  const [segundosRestantes, setSegundos]  = useState(null);
  const [modoRevision, setModoRevision]   = useState(false);
  const [confirmar, setConfirmar]         = useState(false);
  const [mostrarAtajos, setMostrarAtajos] = useState(false);
  const [porTiempo, setPorTiempo]         = useState(false);

  const enviarRef       = useRef(null);
  const autoEnviadoRef  = useRef(false);

  // ── Carga ───────────────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    setYaRespondida(null);
    try {
      const r = await evaluacionesApi.detalleParaTomar(evaluacionId);
      setDatos(r.data);
      // Recupera un borrador si el asesor recargó la página por accidente
      try {
        const guardado = localStorage.getItem(claveBorrador(evaluacionId));
        if (guardado) setRespuestas(JSON.parse(guardado));
      } catch { /* almacenamiento no disponible: se sigue sin borrador */ }
    } catch (e) {
      if (e.status === 409 && e.resultado) setYaRespondida(e.resultado);
      else setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [evaluacionId]);

  useEffect(() => { cargar(); }, [cargar]);

  const preguntas   = datos?.preguntas || [];
  const total       = preguntas.length;
  const contestadas = useMemo(
    () => preguntas.filter(p => respuestas[p.id] !== undefined).length,
    [preguntas, respuestas],
  );
  const progreso   = total ? Math.round((contestadas / total) * 100) : 0;
  const pregunta   = preguntas[indice];
  const esUltima   = indice === total - 1;

  // ── Selección de respuesta ──────────────────────────────────────────────────
  const elegir = useCallback((preguntaId, opcionIndex) => {
    setRespuestas(prev => {
      const siguiente = { ...prev, [preguntaId]: opcionIndex };
      try { localStorage.setItem(claveBorrador(evaluacionId), JSON.stringify(siguiente)); } catch { /* ignorar */ }
      return siguiente;
    });
  }, [evaluacionId]);

  const ir = useCallback((nuevo) => {
    if (nuevo < 0 || nuevo >= total) return;
    setDireccion(nuevo > indice ? 'adelante' : 'atras');
    setIndice(nuevo);
  }, [indice, total]);

  // ── Envío ───────────────────────────────────────────────────────────────────
  const enviar = useCallback(async (forzado = false) => {
    if (!datos) return;
    if (!forzado) {
      const faltantes = datos.preguntas.filter(p => respuestas[p.id] === undefined);
      if (faltantes.length > 0) {
        setModoRevision(true);
        setConfirmar(false);
        setError(`Te falta responder ${faltantes.length} pregunta${faltantes.length > 1 ? 's' : ''}`);
        return;
      }
    }
    setEnviando(true);
    setError(null);
    try {
      const cuerpo = datos.preguntas
        .filter(p => respuestas[p.id] !== undefined)
        .map(p => ({ preguntaId: p.id, opcionElegida: respuestas[p.id] }));
      const r = await evaluacionesApi.responder(evaluacionId, cuerpo);
      try { localStorage.removeItem(claveBorrador(evaluacionId)); } catch { /* ignorar */ }
      setResultado(r.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
      setConfirmar(false);
    }
  }, [datos, respuestas, evaluacionId]);

  useEffect(() => { enviarRef.current = enviar; }, [enviar]);

  // ── Cronómetro ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!datos?.tiempoLimiteMin || !datos?.iniciadaEn) return undefined;
    const fin = new Date(datos.iniciadaEn).getTime() + datos.tiempoLimiteMin * 60 * 1000;

    const tick = () => {
      const restante = Math.max(0, Math.round((fin - Date.now()) / 1000));
      setSegundos(restante);
      if (restante === 0 && !autoEnviadoRef.current) {
        autoEnviadoRef.current = true;
        setPorTiempo(true);
        enviarRef.current?.(true);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [datos]);

  // ── Atajos de teclado ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!pregunta || modoRevision || resultado || yaRespondida) return undefined;

    const alPulsar = (e) => {
      if (e.target.matches?.('input, textarea, select')) return;

      const num = Number(e.key);
      if (Number.isInteger(num) && num >= 1 && num <= pregunta.opciones.length) {
        elegir(pregunta.id, num - 1);
        return;
      }
      const letra = LETRAS.indexOf(e.key.toUpperCase());
      if (letra >= 0 && letra < pregunta.opciones.length) {
        elegir(pregunta.id, letra);
        return;
      }
      if (e.key === 'ArrowRight') { esUltima ? setModoRevision(true) : ir(indice + 1); }
      if (e.key === 'ArrowLeft')  { ir(indice - 1); }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (respuestas[pregunta.id] === undefined) return;
        esUltima ? setModoRevision(true) : ir(indice + 1);
      }
      if (e.key === '?') setMostrarAtajos(v => !v);
    };

    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [pregunta, indice, esUltima, respuestas, modoRevision, resultado, yaRespondida, elegir, ir]);

  // ════════════════════════════════════════════════════════════════════════════
  // PANTALLAS
  // ════════════════════════════════════════════════════════════════════════════

  if (cargando) {
    return (
      <div className="p-6">
        <BotonVolver onVolver={onVolver} />
        <Cargando texto="Preparando tu evaluación…" />
      </div>
    );
  }

  if (yaRespondida) {
    return (
      <PantallaResultado
        nota={yaRespondida.nota}
        aprobado={yaRespondida.aprobado}
        titulo="Ya respondiste esta evaluación"
        onVolver={onVolver}
      />
    );
  }

  if (resultado) {
    return (
      <PantallaResultado
        nota={resultado.nota}
        aprobado={resultado.aprobado}
        correctas={resultado.correctas}
        total={resultado.total}
        correoEnviado={resultado.correoEnviado}
        porTiempo={porTiempo}
        onVolver={onVolver}
      />
    );
  }

  if (error && !datos) {
    return (
      <div className="p-6">
        <BotonVolver onVolver={onVolver} />
        <ErrorBox error={error} onReintentar={cargar} />
      </div>
    );
  }

  if (!datos) return null;

  // ── Cabecera fija (progreso + cronómetro) ───────────────────────────────────
  const urgencia = segundosRestantes == null ? null
    : segundosRestantes <= 30 ? 'critica'
    : segundosRestantes <= 120 ? 'alta'
    : 'normal';

  const cabecera = (
    <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 sm:px-6">
        <button
          onClick={onVolver}
          className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          title="Salir de la evaluación"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{datos.titulo}</p>
          <div className="mt-1.5 flex items-center gap-2.5">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="eva-bar h-1.5 rounded-full" style={{ width: `${progreso}%` }} />
            </div>
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400">
              {contestadas}/{total}
            </span>
          </div>
        </div>

        {segundosRestantes != null && (
          <div
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-semibold tabular-nums transition-colors ${
              urgencia === 'critica' ? 'eva-glow border-rose-300 bg-rose-50 text-rose-700'
              : urgencia === 'alta'  ? 'border-amber-300 bg-amber-50 text-amber-700'
              : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}
            title="Tiempo restante"
          >
            <Clock className="h-4 w-4" /> {formatoReloj(segundosRestantes)}
          </div>
        )}

        <button
          onClick={() => setMostrarAtajos(true)}
          className="hidden shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 sm:block"
          title="Atajos de teclado (?)"
        >
          <Keyboard className="h-5 w-5" />
        </button>
      </div>
    </div>
  );

  // ── Revisión antes de enviar ────────────────────────────────────────────────
  if (modoRevision) {
    const sinResponder = preguntas.filter(p => respuestas[p.id] === undefined);
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
        {cabecera}
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <div className="eva-fade-up">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 p-2.5 text-white shadow-lg shadow-indigo-200">
                <ListChecks className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Revisa antes de enviar</h2>
                <p className="text-xs text-slate-500">
                  Toca cualquier pregunta para volver a ella. Solo tienes 1 intento.
                </p>
              </div>
            </div>

            {sinResponder.length > 0 && (
              <div className="eva-fade-up mb-5 flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <ClipboardList className="h-4 w-4 shrink-0" />
                Te faltan <strong>{sinResponder.length}</strong> pregunta{sinResponder.length > 1 ? 's' : ''} por responder.
              </div>
            )}

            <div className="eva-stagger mb-6 space-y-2">
              {preguntas.map((p, i) => {
                const elegida = respuestas[p.id];
                const respondida = elegida !== undefined;
                return (
                  <button
                    key={p.id}
                    onClick={() => { setModoRevision(false); ir(i); }}
                    className={`eva-card flex w-full items-center gap-3 rounded-xl border bg-white px-4 py-3 text-left ${
                      respondida ? 'border-slate-200 hover:border-indigo-300' : 'border-amber-200 bg-amber-50/40 hover:border-amber-400'
                    }`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                      respondida ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-700">{p.texto}</span>
                      <span className={`block truncate text-xs ${respondida ? 'text-slate-400' : 'text-amber-600'}`}>
                        {respondida ? `${LETRAS[elegida]}. ${p.opciones[elegida]}` : 'Sin responder'}
                      </span>
                    </span>
                    {respondida
                      ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      : <span className="shrink-0 text-[11px] font-semibold text-amber-600">Ir</span>}
                  </button>
                );
              })}
            </div>

            {error && <div className="mb-4"><ErrorBox error={error} /></div>}

            <div className="flex flex-col gap-2.5 sm:flex-row">
              <button
                onClick={() => setModoRevision(false)}
                className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Seguir respondiendo
              </button>
              <button
                onClick={() => setConfirmar(true)}
                disabled={enviando}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:from-indigo-700 hover:to-violet-700 disabled:opacity-40"
              >
                <Send className="h-4 w-4" /> {enviando ? 'Enviando…' : 'Enviar mis respuestas'}
              </button>
            </div>
          </div>
        </div>

        <ModalConfirmar
          abierto={confirmar}
          onCerrar={() => setConfirmar(false)}
          onConfirmar={() => enviar()}
          enviando={enviando}
          sinResponder={sinResponder.length}
          total={total}
        />
      </div>
    );
  }

  // ── Pregunta actual ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      {cabecera}

      <div className="mx-auto max-w-3xl px-4 pb-40 pt-8 sm:px-6">
        <div key={pregunta.id} className={direccion === 'adelante' ? 'eva-in-right' : 'eva-in-left'}>
          <div className="mb-3 flex items-center gap-2">
            <Chip tono="indigo">Pregunta {indice + 1} de {total}</Chip>
            {datos.moduloTema && <Chip tono="cyan">{datos.moduloTema}</Chip>}
            <Chip tono="slate">Mínimo {datos.notaMinima}%</Chip>
          </div>

          <h1 className="mb-5 text-xl font-semibold leading-snug text-slate-800 sm:text-2xl">
            {pregunta.texto}
          </h1>

          {pregunta.imagen && (
            <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <img src={pregunta.imagen} alt={`Apoyo visual de la pregunta ${indice + 1}`} className="max-h-80 w-full object-contain" />
            </div>
          )}

          <div className="space-y-2.5">
            {pregunta.opciones.map((o, j) => {
              const activa = respuestas[pregunta.id] === j;
              return (
                <button
                  key={j}
                  onClick={() => elegir(pregunta.id, j)}
                  className={`eva-opcion ${activa ? 'eva-opcion-activa' : ''} flex w-full items-center gap-3.5 rounded-2xl border-2 px-4 py-3.5 text-left ${
                    activa
                      ? 'border-indigo-500 bg-indigo-50/70 shadow-md shadow-indigo-100'
                      : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/30'
                  }`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-colors ${
                    activa ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {LETRAS[j]}
                  </span>
                  <span className={`flex-1 text-sm ${activa ? 'font-medium text-indigo-900' : 'text-slate-700'}`}>{o}</span>
                  {activa && <CheckCircle2 className="eva-pop h-5 w-5 shrink-0 text-indigo-600" />}
                </button>
              );
            })}
          </div>

          <p className="mt-4 hidden text-[11px] text-slate-400 sm:block">
            Atajos: <kbd className="rounded border border-slate-200 bg-white px-1">1</kbd>–
            <kbd className="rounded border border-slate-200 bg-white px-1">{pregunta.opciones.length}</kbd> para elegir ·
            <kbd className="mx-1 rounded border border-slate-200 bg-white px-1">Enter</kbd> para avanzar
          </p>
        </div>

        {error && <div className="mt-5"><ErrorBox error={error} /></div>}
      </div>

      {/* ── Pie fijo: navegador de preguntas + botones ─────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/90 backdrop-blur sm:pl-[var(--sidebar-w,0px)]">
        <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
          <div className="eva-scroll mb-3 flex gap-1.5 overflow-x-auto pb-1">
            {preguntas.map((p, i) => {
              const respondida = respuestas[p.id] !== undefined;
              const actual = i === indice;
              return (
                <button
                  key={p.id}
                  onClick={() => ir(i)}
                  title={`Pregunta ${i + 1}${respondida ? ' · respondida' : ''}`}
                  className={`h-7 w-7 shrink-0 rounded-lg text-[11px] font-bold transition ${
                    actual      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 ring-2 ring-indigo-200'
                    : respondida ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                    : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2.5">
            <button
              onClick={() => ir(indice - 1)}
              disabled={indice === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
            >
              <ArrowLeft className="h-4 w-4" /> Anterior
            </button>

            {esUltima ? (
              <button
                onClick={() => setModoRevision(true)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:from-indigo-700 hover:to-violet-700"
              >
                <ListChecks className="h-4 w-4" /> Revisar y enviar
              </button>
            ) : (
              <button
                onClick={() => ir(indice + 1)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-900"
              >
                Siguiente <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <ModalAtajos abierto={mostrarAtajos} onCerrar={() => setMostrarAtajos(false)} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTES
// ══════════════════════════════════════════════════════════════════════════════

function BotonVolver({ onVolver }) {
  return (
    <button
      onClick={onVolver}
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-800"
    >
      <ArrowLeft className="h-4 w-4" /> Volver
    </button>
  );
}

function PantallaResultado({ nota, aprobado, correctas, total, correoEnviado, porTiempo, titulo, onVolver }) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-50 px-4 py-10">
      <Confeti activo={!!aprobado} />
      <div className="eva-pop w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/60">
        {porTiempo && (
          <p className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
            <Clock className="h-3.5 w-3.5" /> Se envió sola porque se acabó el tiempo
          </p>
        )}

        {titulo && <p className="mb-4 text-sm text-slate-500">{titulo}</p>}

        <div className="mb-5 flex justify-center">
          <AnilloNota valor={nota} aprobado={aprobado} />
        </div>

        <div className="mb-4 flex justify-center">
          <EstadoBadge aprobado={aprobado} tamano="lg" />
        </div>

        {correctas != null && total != null && (
          <p className="mb-1 text-sm text-slate-500">
            <strong className="text-slate-700">{correctas}</strong> de {total} respuestas correctas
          </p>
        )}

        {aprobado && (
          <p className="mb-1 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
            <Trophy className="h-4 w-4" /> ¡Buen trabajo!
          </p>
        )}

        {correoEnviado != null && (
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <Mail className="h-3.5 w-3.5" />
            {correoEnviado
              ? (aprobado ? 'Te enviamos tu certificado por correo' : 'Te enviamos el resultado por correo')
              : 'No pudimos enviarte el correo — avisa a sistemas'}
          </p>
        )}

        <button
          onClick={onVolver}
          className="mt-7 w-full rounded-xl bg-slate-800 py-3 text-sm font-semibold text-white transition hover:bg-slate-900"
        >
          Volver a mis evaluaciones
        </button>
      </div>
    </div>
  );
}

function ModalConfirmar({ abierto, onCerrar, onConfirmar, enviando, sinResponder, total }) {
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="¿Enviar la evaluación?" ancho="max-w-md">
      <p className="text-sm text-slate-600">
        Solo tienes <strong>1 intento</strong>. Una vez enviada no podrás cambiar tus respuestas.
      </p>
      {sinResponder > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          Vas a enviar con <strong>{sinResponder}</strong> de {total} preguntas sin responder — contarán como incorrectas.
        </p>
      )}
      <div className="mt-5 flex gap-2.5">
        <button
          onClick={onCerrar}
          className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirmar}
          disabled={enviando}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-2.5 text-sm font-semibold text-white transition hover:from-indigo-700 hover:to-violet-700 disabled:opacity-40"
        >
          <Send className="h-4 w-4" /> {enviando ? 'Enviando…' : 'Sí, enviar'}
        </button>
      </div>
    </Modal>
  );
}

function ModalAtajos({ abierto, onCerrar }) {
  const filas = [
    ['1 … 6  /  A … F', 'Elegir esa opción'],
    ['Enter  ·  →',     'Siguiente pregunta'],
    ['←',               'Pregunta anterior'],
    ['?',               'Abrir o cerrar esta ayuda'],
    ['Esc',             'Cerrar ventanas'],
  ];
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Atajos de teclado" ancho="max-w-sm">
      <div className="space-y-2">
        {filas.map(([tecla, que]) => (
          <div key={tecla} className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2">
            <kbd className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">{tecla}</kbd>
            <span className="text-xs text-slate-500">{que}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
