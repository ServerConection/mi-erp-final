// Tema compartido para gráficas (Recharts) y componentes visuales del ERP.
// Importar desde cualquier página para mantener consistencia visual:
//   import { CHART_COLORS, ChartTooltip, axisStyle, gridStyle } from "../theme/chartTheme";

export const CHART_COLORS = {
  primary: "#2563eb",
  primaryDark: "#1d4ed8",
  secondary: "#8b5cf6",
  success: "#10b981",
  successDark: "#059669",
  warning: "#f59e0b",
  warningDark: "#d97706",
  danger: "#ef4444",
  dangerDark: "#dc2626",
  teal: "#0d9488",
  rose: "#e11d48",
  slate: "#64748b",
  slateLight: "#94a3b8",
  navy: "#1A3A6E",
};

// Paletas de empresa — usar para mantener identidad visual NOVONET vs VELSA
export const COMPANY_THEME = {
  NOVONET: {
    name: "NOVONET",
    primary: "#2563eb",
    dark: "#1d4ed8",
    light: "#3b82f6",
    tint: "#eff6ff",
    gradient: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
    soft: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
  },
  VELSA: {
    name: "VELSA",
    primary: "#ea580c",
    dark: "#c2410c",
    light: "#f97316",
    tint: "#fff7ed",
    gradient: "linear-gradient(135deg, #ea580c 0%, #c2410c 100%)",
    soft: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)",
  },
};

// Secuencia categórica para series múltiples (barras, líneas, pies)
export const SERIES_PALETTE = [
  "#2563eb", // azul
  "#f97316", // naranja
  "#10b981", // verde
  "#8b5cf6", // violeta
  "#f59e0b", // ámbar
  "#0d9488", // teal
  "#e11d48", // rosa
  "#64748b", // slate
];

// Estilos consistentes para ejes Recharts
export const axisStyle = {
  fontSize: 12,
  fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif",
  fill: "#64748b",
};

export const gridStyle = {
  stroke: "#e2e8f0",
  strokeDasharray: "3 3",
  vertical: false,
};

export const tooltipContentStyle = {
  background: "rgba(15, 23, 42, 0.92)",
  backdropFilter: "blur(8px)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  boxShadow: "0 12px 32px rgba(15,23,42,0.28)",
  color: "#f8fafc",
  fontSize: 13,
  padding: "10px 14px",
};

export const tooltipLabelStyle = {
  color: "#cbd5e1",
  fontWeight: 600,
  marginBottom: 4,
};

export const tooltipItemStyle = {
  color: "#f8fafc",
};

// Helper: degradado SVG reutilizable para <Bar fill="url(#id)">
// Uso: <defs><BarGradientDefs id="gradAzul" color="#2563eb" /></defs>
export function gradientDefStops(color) {
  return [
    { offset: "0%", stopColor: color, stopOpacity: 0.95 },
    { offset: "100%", stopColor: color, stopOpacity: 0.55 },
  ];
}

// Formateo consistente de números grandes en ejes/tooltips
export function formatCompactNumber(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `${n}`;
}

// Clases Tailwind reutilizables para "chrome" de tarjetas/cards
export const CARD_BASE =
  "bg-white rounded-2xl border border-slate-200/70 shadow-card transition-shadow duration-200 hover:shadow-card-hover";

export const SECTION_TITLE =
  "text-[13px] font-semibold uppercase tracking-wide text-slate-500";

export const BADGE_BASE =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold";
