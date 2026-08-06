/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Módulo de Tareas · Componentes visuales compartidos
 * ═══════════════════════════════════════════════════════════════════════════════
 * Badges, modal, estados vacíos y helpers de fecha. Sin lógica de negocio.
 */

import { useEffect } from 'react';
import { AlertTriangle, Inbox, Loader2, X } from 'lucide-react';

// ── Diccionarios visuales ─────────────────────────────────────────────────────

export const ESTADO_UI = {
  PENDIENTE:   { label: 'Pendiente',   clase: 'bg-slate-100 text-slate-700 border-slate-200',       punto: 'bg-slate-400'   },
  EN_PROCESO:  { label: 'En proceso',  clase: 'bg-blue-50 text-blue-700 border-blue-200',           punto: 'bg-blue-500'    },
  EN_REVISION: { label: 'En revisión', clase: 'bg-amber-50 text-amber-700 border-amber-200',        punto: 'bg-amber-500'   },
  COMPLETADA:  { label: 'Completada',  clase: 'bg-emerald-50 text-emerald-700 border-emerald-200',  punto: 'bg-emerald-500' },
  CANCELADA:   { label: 'Cancelada',   clase: 'bg-slate-50 text-slate-400 border-slate-200',        punto: 'bg-slate-300'   },
};

export const PRIORIDAD_UI = {
  BAJA:    { label: 'Baja',    clase: 'bg-slate-50 text-slate-600 border-slate-200'    },
  MEDIA:   { label: 'Media',   clase: 'bg-sky-50 text-sky-700 border-sky-200'          },
  ALTA:    { label: 'Alta',    clase: 'bg-orange-50 text-orange-700 border-orange-200' },
  URGENTE: { label: 'Urgente', clase: 'bg-rose-50 text-rose-700 border-rose-200'       },
};

export const TIPO_UI = {
  TAREA:     { label: 'Tarea',     clase: 'bg-slate-100 text-slate-600'   },
  ACUERDO:   { label: 'Acuerdo',   clase: 'bg-violet-100 text-violet-700' },
  SOLICITUD: { label: 'Solicitud', clase: 'bg-cyan-100 text-cyan-700'     },
};

// ── Badges ────────────────────────────────────────────────────────────────────

export function EstadoBadge({ estado, size = 'sm' }) {
  const ui = ESTADO_UI[estado] || ESTADO_UI.PENDIENTE;
  const p  = size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${p} ${ui.clase}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ui.punto}`} />
      {ui.label}
    </span>
  );
}

export function PrioridadBadge({ prioridad }) {
  const ui = PRIORIDAD_UI[prioridad] || PRIORIDAD_UI.MEDIA;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${ui.clase}`}>
      {ui.label}
    </span>
  );
}

export function TipoBadge({ tipo }) {
  const ui = TIPO_UI[tipo] || TIPO_UI.TAREA;
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ui.clase}`}>
      {ui.label}
    </span>
  );
}

/** NOVONET azul, VELSA naranja — misma identidad visual que el resto del ERP. */
export const EMPRESA_UI = {
  NOVONET: { label: 'NOVONET', clase: 'bg-blue-50 text-blue-700 border-blue-200'       },
  VELSA:   { label: 'VELSA',   clase: 'bg-orange-50 text-orange-700 border-orange-200' },
};

export function EmpresaBadge({ empresa }) {
  const ui = EMPRESA_UI[String(empresa || '').toUpperCase()];
  if (!ui) return null;
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide border ${ui.clase}`}>
      {ui.label}
    </span>
  );
}

export function AreaChip({ nombre, color = '#6B7280' }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: color + '18', color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {nombre}
    </span>
  );
}

/** Muestra "3 días tarde" o "vence en 2 días". Nada si está cerrada. */
export function VencimientoBadge({ tarea }) {
  if (['COMPLETADA', 'CANCELADA'].includes(tarea.estado)) return null;

  if (tarea.esta_vencida) {
    const d = tarea.dias_retraso;
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-xs font-semibold text-rose-700">
        <AlertTriangle size={11} />
        {d === 1 ? '1 día tarde' : `${d} días tarde`}
      </span>
    );
  }

  const r = tarea.dias_restantes;
  if (r === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-700">
        Vence hoy
      </span>
    );
  }
  if (r > 0 && r <= 3) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-100 px-2 py-0.5 text-xs text-amber-700">
        {r === 1 ? 'Vence mañana' : `Vence en ${r} días`}
      </span>
    );
  }
  return null;
}

// ── Estructura ────────────────────────────────────────────────────────────────

export function Modal({ title, subtitle, wide, onClose, children, footer }) {
  useEffect(() => {
    const h = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} max-h-[92vh] flex flex-col`}
        style={{ animation: 'tareasFadeUp .18s ease' }}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-slate-100 shrink-0">{footer}</div>}
      </div>
      <style>{`@keyframes tareasFadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

/** Panel lateral deslizante para el detalle. */
export function Drawer({ open, onClose, children, width = 'max-w-2xl' }) {
  useEffect(() => {
    if (!open) return;
    const h = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(15,23,42,.45)' }}
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`bg-white h-full w-full ${width} shadow-2xl flex flex-col`}
           style={{ animation: 'tareasSlideIn .2s ease' }}>
        {children}
      </div>
      <style>{`@keyframes tareasSlideIn{from{transform:translateX(40px);opacity:.6}to{transform:translateX(0);opacity:1}}`}</style>
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <Loader2 size={28} className="animate-spin mb-3" />
      <p className="text-sm">{texto}</p>
    </div>
  );
}

export function Vacio({ titulo, texto, icono: Icono = Inbox, accion }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
        <Icono size={26} className="text-slate-300" />
      </div>
      <p className="font-semibold text-slate-700">{titulo}</p>
      {texto && <p className="text-sm text-slate-400 mt-1 max-w-sm">{texto}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}

export function ErrorBox({ error, onReintentar }) {
  const sinAcceso = error?.codigo === 'SIN_ACCESO_TAREAS';
  return (
    <div className="m-6 rounded-xl border border-rose-200 bg-rose-50 p-5">
      <div className="flex gap-3">
        <AlertTriangle size={20} className="text-rose-500 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-rose-800">
            {sinAcceso ? 'Sin acceso al módulo' : 'No se pudo cargar'}
          </p>
          <p className="text-sm text-rose-700 mt-1">{error?.message || 'Error desconocido'}</p>
          {onReintentar && !sinAcceso && (
            <button onClick={onReintentar}
              className="mt-3 text-sm font-medium text-rose-700 underline hover:text-rose-900">
              Reintentar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helpers de fecha ──────────────────────────────────────────────────────────

export function fmtFecha(f) {
  if (!f) return '—';
  const d = new Date(f.length === 10 ? f + 'T12:00:00' : f);
  if (Number.isNaN(d.getTime())) return String(f);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtFechaCorta(f) {
  if (!f) return '—';
  const d = new Date(f.length === 10 ? f + 'T12:00:00' : f);
  if (Number.isNaN(d.getTime())) return String(f);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
}

export function fmtFechaHora(f) {
  if (!f) return '—';
  const d = new Date(f);
  if (Number.isNaN(d.getTime())) return String(f);
  return d.toLocaleString('es-EC', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** "hace 3 horas", "ayer", "hace 2 días" */
export function tiempoRelativo(f) {
  if (!f) return '';
  const d = new Date(f);
  const seg = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seg < 60)     return 'hace un momento';
  if (seg < 3600)   return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400)  return `hace ${Math.floor(seg / 3600)} h`;
  if (seg < 172800) return 'ayer';
  if (seg < 2592000) return `hace ${Math.floor(seg / 86400)} días`;
  return fmtFecha(f);
}

export function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export function iniciales(nombre) {
  if (!nombre) return '?';
  return nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

/** Avatar circular con iniciales y color estable derivado del nombre. */
export function Avatar({ nombre, size = 32 }) {
  const colores = ['#2563eb', '#7c3aed', '#059669', '#ea580c', '#0891b2', '#db2777', '#d97706'];
  let h = 0;
  for (const ch of String(nombre || '')) h = (h * 31 + ch.charCodeAt(0)) % 997;
  const bg = colores[h % colores.length];
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, backgroundColor: bg, fontSize: size * 0.38 }}
      title={nombre}
    >
      {iniciales(nombre)}
    </div>
  );
}
