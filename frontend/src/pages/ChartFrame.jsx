// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ChartFrame.jsx — Marco compartido de gráficas del módulo REDES          ║
// ║                                                                          ║
// ║  Antes, "ampliar gráfica" solo existía dentro de Redes.jsx: las 18       ║
// ║  gráficas de las pestañas (Comparativo, Análisis de Pautas, Asesores vs  ║
// ║  Pauta) se veían en 220–400px y no había forma de agrandarlas. Aquí      ║
// ║  vive una sola vez el modal y el botón, y lo usan todas.                 ║
// ║                                                                          ║
// ║  Dos formas de usarlo:                                                   ║
// ║    <ChartCard title="…">…</ChartCard>   → tarjeta completa con cabecera  ║
// ║    <Expandible title="…">…</Expandible> → solo el botón ⤢, para gráficas ║
// ║                                           que YA están dentro de una     ║
// ║                                           tarjeta con su propio título.  ║
// ║                                                                          ║
// ║  En ambos casos `children` es el gráfico de Recharts (ComposedChart,     ║
// ║  BarChart, PieChart…), NO el ResponsiveContainer: el contenedor lo pone  ║
// ║  este archivo, y así puede volver a dibujarlo a 520px dentro del modal.  ║
// ╚══════════════════════════════════════════════════════════════════════════╝
import { useEffect, useState } from "react";
import { ResponsiveContainer } from "recharts";

const CF = {
  primary: "#1e3a8a",
  border:  "#e2e8f0",
  muted:   "#64748b",
};

export function ChartModal({ title, onClose, children }) {
  // Escape cierra el modal y el scroll del fondo se bloquea mientras está
  // abierto (si no, la rueda del mouse mueve la página de atrás).
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", h);
      document.body.style.overflow = overflowPrevio;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.72)" }}
      onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: CF.border }}>
          <span className="text-sm font-black uppercase tracking-wide" style={{ color: CF.primary }}>{title}</span>
          <button onClick={onClose} aria-label="Cerrar"
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-100 font-black text-base"
            style={{ color: CF.muted }}>✕</button>
        </div>
        <div className="p-6 overflow-auto" style={{ maxHeight: "calc(92vh - 74px)" }}>
          <ResponsiveContainer width="100%" height={520}>{children}</ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/** Botón ⤢ flotante sobre una gráfica que ya vive dentro de su propia tarjeta. */
export function Expandible({ title = "Gráfica", height = 280, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen(true)}
          title="Ampliar gráfica"
          aria-label={`Ampliar ${title}`}
          className="absolute top-0 right-0 z-10 text-[11px] font-bold px-2.5 py-1 rounded-lg border bg-white/90 backdrop-blur-sm hover:bg-white hover:shadow-md transition-all"
          style={{ borderColor: CF.border, color: CF.muted }}>⤢</button>
        <ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer>
      </div>
      {open && <ChartModal title={title} onClose={() => setOpen(false)}>{children}</ChartModal>}
    </>
  );
}

/** Tarjeta completa: cabecera con título, subtítulo, barra de acento y ⤢. */
export function ChartCard({ title, subtitle, accent = CF.primary, height = 230, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: CF.border }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: CF.border }}>
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 rounded-full" style={{ background: accent }} />
            <div>
              <div className="text-[12px] font-black uppercase tracking-widest" style={{ color: accent }}>{title}</div>
              {subtitle && <div className="text-[11px] font-medium mt-0.5" style={{ color: CF.muted }}>{subtitle}</div>}
            </div>
          </div>
          <button onClick={() => setOpen(true)}
            title="Ampliar gráfica"
            aria-label={`Ampliar ${title}`}
            className="text-[11px] font-black uppercase px-3 py-1.5 rounded-lg border hover:shadow-sm transition-all"
            style={{ borderColor: CF.border, color: CF.muted }}>⤢ Ampliar</button>
        </div>
        <div className="p-5"><ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer></div>
      </div>
      {open && <ChartModal title={title} onClose={() => setOpen(false)}>{children}</ChartModal>}
    </>
  );
}
