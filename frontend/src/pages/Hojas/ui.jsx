/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Archivos Compartidos · Componentes visuales compartidos
 * ═══════════════════════════════════════════════════════════════════════════════
 * Badges, modal, estados de carga y helpers de formato. Sin lógica de negocio.
 */

import { useEffect } from 'react';
import { AlertTriangle, FileSpreadsheet, Loader2, X } from 'lucide-react';

// ── Diccionarios visuales ─────────────────────────────────────────────────────

export const NIVEL_UI = {
  ADMIN:  { label: 'Administrador', clase: 'bg-violet-50 text-violet-700 border-violet-200' },
  DUENO:  { label: 'Creador',       clase: 'bg-blue-50 text-blue-700 border-blue-200' },
  EDITOR: { label: 'Puede editar',  clase: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  LECTOR: { label: 'Solo lectura',  clase: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export const TIPO_UI = {
  TEXTO:   { label: 'Texto',       ayuda: 'Escribir libremente' },
  LISTA:   { label: 'Lista',       ayuda: 'Elegir de un desplegable' },
  FECHA:   { label: 'Fecha',       ayuda: 'Selector de calendario' },
  USUARIO: { label: 'Usuario',     ayuda: 'Elegir un usuario del ERP' },
};

export const COLORES_HOJA = [
  '#2563EB', '#059669', '#D97706', '#DB2777', '#7C3AED', '#0891B2', '#DC2626', '#475569',
];

// ── Badges ────────────────────────────────────────────────────────────────────

export function NivelBadge({ nivel }) {
  const ui = NIVEL_UI[nivel] || NIVEL_UI.LECTOR;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${ui.clase}`}>
      {ui.label}
    </span>
  );
}

export function TipoBadge({ tipo }) {
  const ui = TIPO_UI[tipo] || TIPO_UI.TEXTO;
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-600">
      {ui.label}
    </span>
  );
}

/** Avatar circular con las iniciales, del color asignado a esa persona. */
export function Avatar({ nombre, color = '#64748B', size = 28, titulo }) {
  const iniciales = String(nombre || '?')
    .split(' ').filter(Boolean).slice(0, 2)
    .map(p => p[0]).join('').toUpperCase();

  return (
    <span
      title={titulo || nombre}
      className="inline-flex items-center justify-center rounded-full font-semibold text-white ring-2 ring-white"
      style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.4 }}
    >
      {iniciales}
    </span>
  );
}

// ── Estados ───────────────────────────────────────────────────────────────────

export function Cargando({ texto = 'Cargando…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-sm">{texto}</span>
    </div>
  );
}

export function ErrorBox({ error, onReintentar }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-medium">Algo salió mal</p>
        <p className="mt-0.5 text-rose-700">{error}</p>
      </div>
      {onReintentar && (
        <button onClick={onReintentar} className="rounded-md border border-rose-300 px-3 py-1 font-medium hover:bg-rose-100">
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Vacio({ titulo, texto, accion }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="rounded-full bg-slate-100 p-4">
        <FileSpreadsheet className="w-7 h-7 text-slate-400" />
      </div>
      <p className="font-medium text-slate-700">{titulo}</p>
      {texto && <p className="max-w-md text-sm text-slate-500">{texto}</p>}
      {accion}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function Modal({ abierto, onCerrar, titulo, children, ancho = 'max-w-lg' }) {
  // Escape cierra: es lo que espera cualquiera que use un modal.
  useEffect(() => {
    if (!abierto) return undefined;
    const alPulsar = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onCerrar} />
      <div className={`relative w-full ${ancho} max-h-[85vh] overflow-hidden rounded-xl bg-white shadow-2xl flex flex-col`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h3 className="font-semibold text-slate-800">{titulo}</h3>
          <button onClick={onCerrar} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ── Aviso flotante ────────────────────────────────────────────────────────────

export function Aviso({ mensaje, tipo = 'info', onCerrar }) {
  useEffect(() => {
    if (!mensaje) return undefined;
    const t = setTimeout(onCerrar, 4000);
    return () => clearTimeout(t);
  }, [mensaje, onCerrar]);

  if (!mensaje) return null;

  const clases = {
    info:  'bg-slate-800 text-white',
    ok:    'bg-emerald-600 text-white',
    error: 'bg-rose-600 text-white',
  }[tipo];

  return (
    <div className={`fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm shadow-lg ${clases}`}>
      {mensaje}
    </div>
  );
}

// ── Formato ───────────────────────────────────────────────────────────────────

export function fechaCorta(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function tiempoRelativo(iso) {
  if (!iso) return '';
  const segundos = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (segundos < 60)    return 'hace un momento';
  if (segundos < 3600)  return `hace ${Math.floor(segundos / 60)} min`;
  if (segundos < 86400) return `hace ${Math.floor(segundos / 3600)} h`;
  if (segundos < 604800) return `hace ${Math.floor(segundos / 86400)} d`;
  return fechaCorta(iso);
}
