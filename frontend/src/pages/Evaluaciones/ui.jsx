/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Evaluaciones · Componentes visuales compartidos
 * ═══════════════════════════════════════════════════════════════════════════════
 * Piezas reutilizables del módulo: estados de carga, avisos, badges, anillo de
 * nota, barra de progreso, confeti y el modal. Las animaciones viven en
 * `evaluaciones.css` (clases con prefijo `eva-`).
 */

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, GraduationCap, Info, Loader2, RotateCw, X, XCircle,
} from 'lucide-react';
import './evaluaciones.css';

// ══════════════════════════════════════════════════════════════════════════════
// CARGA
// ══════════════════════════════════════════════════════════════════════════════

/** Spinner simple, para bloques pequeños. */
export function Cargando({ texto = 'Cargando…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-500 eva-fade-in">
      <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
      <span className="text-sm">{texto}</span>
    </div>
  );
}

/**
 * Esqueleto de tarjetas: se siente mucho más rápido que un spinner porque el
 * asesor ya ve la forma de lo que va a llegar.
 */
export function SkeletonTarjetas({ cantidad = 6 }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: cantidad }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="eva-skeleton mb-3 h-4 w-2/3 rounded" />
          <div className="eva-skeleton mb-4 h-3 w-1/3 rounded" />
          <div className="eva-skeleton mb-2 h-3 w-full rounded" />
          <div className="eva-skeleton h-3 w-4/5 rounded" />
        </div>
      ))}
    </div>
  );
}

/** Esqueleto de filas, para tablas. */
export function SkeletonFilas({ cantidad = 6 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: cantidad }).map((_, i) => (
        <div key={i} className="eva-skeleton h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ERROR / VACÍO
// ══════════════════════════════════════════════════════════════════════════════

export function ErrorBox({ error, onReintentar }) {
  if (!error) return null;
  return (
    <div className="eva-fade-up flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-800">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="flex-1">
        <p className="font-semibold">Algo salió mal</p>
        <p className="mt-0.5 text-rose-700">{error}</p>
      </div>
      {onReintentar && (
        <button
          onClick={onReintentar}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 bg-white/70 px-3 py-1.5 font-medium transition hover:bg-white"
        >
          <RotateCw className="h-3.5 w-3.5" /> Reintentar
        </button>
      )}
    </div>
  );
}

export function Vacio({ titulo, texto, accion, icono: Icono = GraduationCap }) {
  return (
    <div className="eva-fade-up flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <div className="eva-float rounded-2xl bg-gradient-to-br from-indigo-50 to-cyan-50 p-5 ring-1 ring-indigo-100">
        <Icono className="h-8 w-8 text-indigo-400" />
      </div>
      <p className="text-base font-semibold text-slate-700">{titulo}</p>
      {texto && <p className="max-w-md text-sm text-slate-500">{texto}</p>}
      {accion}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════════════════════════════════════════

export function Modal({ abierto, onCerrar, titulo, subtitulo, children, ancho = 'max-w-2xl', pie }) {
  useEffect(() => {
    if (!abierto) return undefined;
    const alPulsar = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', alPulsar);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', alPulsar);
      document.body.style.overflow = '';
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="eva-fade-in absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onCerrar} />
      <div className={`eva-pop relative flex w-full ${ancho} max-h-[88vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50/60 to-cyan-50/40 px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-slate-800">{titulo}</h3>
            {subtitulo && <p className="mt-0.5 text-xs text-slate-500">{subtitulo}</p>}
          </div>
          <button
            onClick={onCerrar}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-slate-700"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="eva-scroll flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {pie && <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3">{pie}</div>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// AVISOS (toast)
// ══════════════════════════════════════════════════════════════════════════════

export function Aviso({ mensaje, tipo = 'info', onCerrar }) {
  useEffect(() => {
    if (!mensaje) return undefined;
    const t = setTimeout(onCerrar, 4000);
    return () => clearTimeout(t);
  }, [mensaje, onCerrar]);

  if (!mensaje) return null;

  const estilo = {
    info:  { clases: 'bg-slate-800 text-white',    Icono: Info },
    ok:    { clases: 'bg-emerald-600 text-white',  Icono: CheckCircle2 },
    error: { clases: 'bg-rose-600 text-white',     Icono: XCircle },
  }[tipo] || { clases: 'bg-slate-800 text-white', Icono: Info };

  const { clases, Icono } = estilo;

  return (
    <div
      role="status"
      className={`eva-pop fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-2.5 text-sm shadow-xl ${clases}`}
    >
      <Icono className="h-4 w-4 shrink-0" />
      {mensaje}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BADGES / CHIPS
// ══════════════════════════════════════════════════════════════════════════════

export function EstadoBadge({ aprobado, tamano = 'md' }) {
  const pad = tamano === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  return aprobado ? (
    <span className={`inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 font-medium text-emerald-700 ${pad}`}>
      <CheckCircle2 className="h-3.5 w-3.5" /> Aprobado
    </span>
  ) : (
    <span className={`inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 font-medium text-rose-700 ${pad}`}>
      <XCircle className="h-3.5 w-3.5" /> Reprobado
    </span>
  );
}

export function Chip({ children, tono = 'slate', icono: Icono }) {
  const tonos = {
    slate:   'bg-slate-100 text-slate-600 ring-slate-200',
    indigo:  'bg-indigo-50 text-indigo-700 ring-indigo-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber:   'bg-amber-50 text-amber-700 ring-amber-200',
    rose:    'bg-rose-50 text-rose-700 ring-rose-200',
    cyan:    'bg-cyan-50 text-cyan-700 ring-cyan-200',
    violet:  'bg-violet-50 text-violet-700 ring-violet-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${tonos[tono] || tonos.slate}`}>
      {Icono && <Icono className="h-3 w-3" />}
      {children}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PROGRESO
// ══════════════════════════════════════════════════════════════════════════════

/** Barra horizontal con degradado. `valor` de 0 a 100. */
export function BarraProgreso({ valor, alto = 'h-2' }) {
  const pct = Math.max(0, Math.min(100, Number(valor) || 0));
  return (
    <div className={`w-full overflow-hidden rounded-full bg-slate-100 ${alto}`}>
      <div className={`eva-bar ${alto} rounded-full`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Anillo de nota. Se dibuja solo al montar y el número sube contando, que es
 * el detalle que hace que se sienta "de app" y no de formulario.
 */
export function AnilloNota({ valor, aprobado, tamano = 168, grosor = 12 }) {
  const pct = Math.max(0, Math.min(100, Number(valor) || 0));
  const r = (tamano - grosor) / 2;
  const circunferencia = 2 * Math.PI * r;
  const offset = circunferencia * (1 - pct / 100);
  const mostrado = useContador(pct, 1000);
  const color = aprobado ? '#10b981' : '#f43f5e';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: tamano, height: tamano }}>
      <svg width={tamano} height={tamano} className="-rotate-90">
        <circle cx={tamano / 2} cy={tamano / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={grosor} />
        <circle
          cx={tamano / 2} cy={tamano / 2} r={r}
          fill="none" stroke={color} strokeWidth={grosor} strokeLinecap="round"
          className="eva-ring-progress"
          style={{ '--eva-ring-full': circunferencia, '--eva-ring-offset': offset }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums text-slate-800">{mostrado}%</span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">tu nota</span>
      </div>
    </div>
  );
}

/** Sube un número desde 0 hasta `destino` en `duracionMs`. */
export function useContador(destino, duracionMs = 900) {
  const [valor, setValor] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducido) { setValor(destino); return undefined; }

    const inicio = performance.now();
    const paso = (ahora) => {
      const t = Math.min(1, (ahora - inicio) / duracionMs);
      const suave = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValor(Math.round(destino * suave));
      if (t < 1) rafRef.current = requestAnimationFrame(paso);
    };
    rafRef.current = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(rafRef.current);
  }, [destino, duracionMs]);

  return valor;
}

// ══════════════════════════════════════════════════════════════════════════════
// CONFETI (solo al aprobar)
// ══════════════════════════════════════════════════════════════════════════════

const COLORES_CONFETI = ['#4f46e5', '#7c3aed', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e'];

export function Confeti({ activo, piezas = 90 }) {
  const [trozos, setTrozos] = useState([]);

  // Se generan en un efecto (no durante el render) porque usan Math.random.
  useEffect(() => {
    if (!activo) { setTrozos([]); return; }
    setTrozos(Array.from({ length: piezas }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      color: COLORES_CONFETI[i % COLORES_CONFETI.length],
      delay: `${Math.random() * 1.2}s`,
      dur: `${2.4 + Math.random() * 1.8}s`,
      drift: `${(Math.random() - 0.5) * 260}px`,
      spin: `${540 + Math.random() * 720}deg`,
      ancho: 6 + Math.random() * 6,
      alto: 10 + Math.random() * 8,
    })));
  }, [activo, piezas]);

  if (!activo || trozos.length === 0) return null;

  return (
    <div className="eva-confetti-capa" aria-hidden="true">
      {trozos.map(t => (
        <span
          key={t.id}
          className="eva-confetti-pieza"
          style={{
            left: t.left,
            width: t.ancho,
            height: t.alto,
            background: t.color,
            '--eva-delay': t.delay,
            '--eva-dur': t.dur,
            '--eva-drift': t.drift,
            '--eva-spin': t.spin,
          }}
        />
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILIDADES
// ══════════════════════════════════════════════════════════════════════════════

export function fechaCorta(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fechaLarga(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-EC', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Iniciales para el avatar de la tabla de resultados. */
export function iniciales(nombre = '') {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase())
    .join('') || '?';
}
