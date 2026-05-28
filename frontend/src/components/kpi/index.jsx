/**
 * ─────────────────────────────────────────────────────────────────────────────
 * KPI COMPONENTS — Shared between Novonet & Velsa
 * ─────────────────────────────────────────────────────────────────────────────
 * Componentes visuales unificados. Sin lógica de datos: solo presentación.
 *
 * Exports:
 *   StripCard     — tarjeta de métrica con barra de progreso
 *   KpiCard180    — tarjeta KPI grande con indicador de avance
 *   KpiMini       — tarjeta KPI compacta para grids
 *   BarProgress   — barra de progreso horizontal (usada dentro de AsesorCard)
 *   PctKpiCard    — tarjeta de porcentaje con semáforo (nueva, Velsa VistaAsesor)
 *
 * Cada componente acepta un prop `variant`:
 *   "slate"  → Novonet (colores slate-xxx)
 *   "stone"  → Velsa   (colores stone-xxx)
 *   Si se omite, por defecto "slate".
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Keyframes inyectados una sola vez ─────────────────────────────────────────
const STYLES_ID = "__kpi_styles__";
if (typeof document !== "undefined" && !document.getElementById(STYLES_ID)) {
  const style = document.createElement("style");
  style.id = STYLES_ID;
  style.textContent = `
    @keyframes kpiFadeUp {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0);    }
    }
    @keyframes kpiBarGrow {
      from { width: 0%; }
    }
    @keyframes kpiPulse {
      0%   { opacity: 1; }
      50%  { opacity: .55; }
      100% { opacity: 1; }
    }
    .kpi-card {
      animation: kpiFadeUp .38s cubic-bezier(.4,0,.2,1) both;
    }
    .kpi-card:hover {
      transform: translateY(-3px) !important;
      box-shadow: 0 8px 28px rgba(0,0,0,.09) !important;
    }
    .kpi-bar-fill {
      animation: kpiBarGrow .75s cubic-bezier(.4,0,.2,1) both;
      transition: width .7s cubic-bezier(.4,0,.2,1);
    }
  `;
  document.head.appendChild(style);
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const clamp = (v, min = 0, max = 100) => Math.min(Math.max(v, min), max);

const pct = (value, meta) =>
  meta > 0 ? clamp(Math.round((Number(value || 0) / meta) * 100)) : 0;

/** Semáforo centralizado — mismo criterio para Novonet y Velsa */
export function semaforo(real, metaOk, metaWarn, invertido = false) {
  const n = Number(real || 0);
  if (invertido) {
    if (n <= metaOk)   return { color: "#16a34a", label: "OK" };
    if (n <= metaWarn) return { color: "#d97706", label: "Atención" };
    return               { color: "#dc2626", label: "Alerta" };
  }
  if (n >= metaOk)   return { color: "#16a34a", label: "OK" };
  if (n >= metaWarn) return { color: "#d97706", label: "Atención" };
  return               { color: "#dc2626", label: "Alerta" };
}

/** Tema neutral: slate (Novonet) | stone (Velsa) */
const NEUTRAL = {
  slate: {
    bg:      "#fff",
    border:  "#e2e8f0",
    label:   "#94a3b8",
    subtext: "#cbd5e1",
    track:   "#f1f5f9",
    text:    "#0f172a",
  },
  stone: {
    bg:      "#fff",
    border:  "#e7e5e4",
    label:   "#a8a29e",
    subtext: "#d6d3d1",
    track:   "#f5f5f4",
    text:    "#1c1917",
  },
};

/** Paleta de colores unificada Novonet + Velsa */
const COLOR_PALETTE = {
  // Novonet
  indigo:  { accent: "#4f46e5", accentBg: "#eef2ff", accentText: "#4338ca", gradFrom: "#4f46e5", gradTo: "#818cf8", icon: "📥" },
  teal:    { accent: "#0d9488", accentBg: "#f0fdfa", accentText: "#0f766e", gradFrom: "#0d9488", gradTo: "#2dd4bf", icon: "✅" },
  sky:     { accent: "#0284c7", accentBg: "#f0f9ff", accentText: "#0369a1", gradFrom: "#0284c7", gradTo: "#38bdf8", icon: "🎯" },
  rose:    { accent: "#e11d48", accentBg: "#fff1f2", accentText: "#be123c", gradFrom: "#e11d48", gradTo: "#fb7185", icon: "👴" },
  violet:  { accent: "#7c3aed", accentBg: "#f5f3ff", accentText: "#6d28d9", gradFrom: "#7c3aed", gradTo: "#a78bfa", icon: "⚡" },
  // Velsa
  orange:  { accent: "#ea580c", accentBg: "#fff7ed", accentText: "#c2410c", gradFrom: "#ea580c", gradTo: "#fb923c", icon: "📥" },
  amber:   { accent: "#d97706", accentBg: "#fffbeb", accentText: "#b45309", gradFrom: "#d97706", gradTo: "#fbbf24", icon: "✅" },
  red:     { accent: "#dc2626", accentBg: "#fef2f2", accentText: "#b91c1c", gradFrom: "#dc2626", gradTo: "#f87171", icon: "⚠️" },
  yellow:  { accent: "#ca8a04", accentBg: "#fefce8", accentText: "#a16207", gradFrom: "#ca8a04", gradTo: "#facc15", icon: "🎯" },
  // Shared
  emerald: { accent: "#059669", accentBg: "#f0fdf4", accentText: "#047857", gradFrom: "#059669", gradTo: "#34d399", icon: "✅" },
  purple:  { accent: "#9333ea", accentBg: "#fdf4ff", accentText: "#7e22ce", gradFrom: "#9333ea", gradTo: "#c084fc", icon: "⚡" },
};

/** Convierte border-l-xxx-600 → color hex  */
const COLOR_MAP_MINI = {
  "border-l-blue-600":    { from: "#2563eb", to: "#60a5fa" },
  "border-l-indigo-600":  { from: "#4f46e5", to: "#818cf8" },
  "border-l-orange-600":  { from: "#ea580c", to: "#fb923c" },
  "border-l-amber-500":   { from: "#d97706", to: "#fbbf24" },
  "border-l-emerald-600": { from: "#059669", to: "#34d399" },
  "border-l-emerald-500": { from: "#10b981", to: "#34d399" },
  "border-l-rose-500":    { from: "#e11d48", to: "#fb7185" },
  "border-l-violet-600":  { from: "#7c3aed", to: "#a78bfa" },
  "border-l-purple-500":  { from: "#a855f7", to: "#c084fc" },
  "border-l-slate-600":   { from: "#475569", to: "#94a3b8" },
  "border-l-stone-600":   { from: "#57534e", to: "#a8a29e" },
  "border-l-teal-600":    { from: "#0d9488", to: "#2dd4bf" },
  "border-l-cyan-500":    { from: "#06b6d4", to: "#67e8f9" },
  "border-l-orange-400":  { from: "#fb923c", to: "#fdba74" },
  "border-l-red-500":     { from: "#ef4444", to: "#fca5a5" },
  "border-l-orange-700":  { from: "#c2410c", to: "#ea580c" },
};


// ─────────────────────────────────────────────────────────────────────────────
// STRIP CARD
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {string}  label
 * @param {number}  value
 * @param {string}  color          — hex del acento
 * @param {number}  [meta]         — si se pasa, muestra barra de progreso
 * @param {boolean} [isPct=false]  — si true, muestra value como porcentaje
 * @param {boolean} [invertSemaforo=false]
 * @param {number}  [index=0]      — para animación escalonada
 * @param {"slate"|"stone"} [variant="slate"]
 */
export function StripCard({
  label,
  value,
  color,
  meta,
  isPct         = false,
  invertSemaforo = false,
  index         = 0,
  variant       = "slate",
}) {
  const n   = Number(value || 0);
  const N   = NEUTRAL[variant] || NEUTRAL.slate;
  const p   = meta && !isPct ? pct(n, meta) : null;

  let accentColor = color;
  if (isPct && meta != null) {
    const s = semaforo(n, meta, meta * (invertSemaforo ? 1.5 : 0.5), invertSemaforo);
    accentColor = s.color;
  }

  return (
    <div
      className="kpi-card"
      style={{
        background:    N.bg,
        border:        `1px solid ${N.border}`,
        borderRadius:  14,
        padding:       "14px 16px",
        transition:    "transform .18s cubic-bezier(.4,0,.2,1), box-shadow .18s cubic-bezier(.4,0,.2,1)",
        animationDelay: `${index * 55}ms`,
        borderTop:     `3px solid ${accentColor}`,
      }}
    >
      {/* Label */}
      <div style={{
        fontSize: 10, fontWeight: 700, color: N.label,
        textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4,
      }}>
        {label}
      </div>

      {/* Valor */}
      <div style={{ fontSize: 28, fontWeight: 900, color: accentColor, lineHeight: 1 }}>
        {isPct ? `${n.toFixed(1)}%` : n.toLocaleString()}
      </div>

      {/* Barra de progreso */}
      {p !== null && (
        <div style={{ marginTop: 8 }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 9, color: N.label, marginBottom: 4,
          }}>
            <span>META</span>
            <span style={{ fontWeight: 700 }}>{p}%</span>
          </div>
          <div style={{ height: 4, background: N.track, borderRadius: 3, overflow: "hidden" }}>
            <div
              className="kpi-bar-fill"
              style={{
                height: "100%",
                width: `${p}%`,
                background: `linear-gradient(90deg, ${accentColor}, ${accentColor}cc)`,
                borderRadius: 3,
              }}
            />
          </div>
        </div>
      )}

      {/* Hint meta porcentaje */}
      {isPct && meta != null && (
        <div style={{ fontSize: 9, color: N.label, marginTop: 6 }}>
          meta {invertSemaforo ? "<" : "≥"} {meta}%
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// KPI CARD 180 (tarjeta grande con barra de avance)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {string}  label
 * @param {number}  meta
 * @param {number}  real
 * @param {"porcentaje"|"numero"} tipo
 * @param {string}  color       — nombre de color del palette
 * @param {boolean} [invertido=false]
 * @param {number}  [index=0]
 * @param {"slate"|"stone"} [variant="slate"]
 */
export function KpiCard180({
  label,
  meta,
  real,
  tipo,
  color,
  invertido = false,
  index     = 0,
  variant   = "slate",
}) {
  const N      = NEUTRAL[variant] || NEUTRAL.slate;
  const p      = meta > 0 ? clamp(Math.round((real / meta) * 100)) : 0;
  const cumple = invertido ? real <= meta : real >= meta;
  const c      = COLOR_PALETTE[color] || COLOR_PALETTE.indigo;

  return (
    <div
      className="kpi-card"
      style={{
        background:    N.bg,
        borderRadius:  16,
        border:        `1px solid ${N.border}`,
        borderTop:     `3px solid ${c.accent}`,
        overflow:      "hidden",
        display:       "flex",
        flexDirection: "column",
        transition:    "transform .18s cubic-bezier(.4,0,.2,1), box-shadow .18s cubic-bezier(.4,0,.2,1)",
        animationDelay: `${index * 60}ms`,
      }}
    >
      {/* Header */}
      <div style={{ padding: "14px 16px 8px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          fontSize: 10, fontWeight: 900, letterSpacing: ".08em",
          textTransform: "uppercase", flex: 1, lineHeight: 1.3,
          color: c.accentText,
        }}>{label}</span>
        <span style={{
          fontSize: 16, width: 34, height: 34,
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 10, background: c.accentBg, flexShrink: 0,
        }}>{c.icon}</span>
      </div>

      {/* Real / Meta */}
      <div style={{ padding: "0 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <p style={{ fontSize: 8, fontWeight: 700, color: N.label, marginBottom: 2, textTransform: "uppercase" }}>REAL</p>
          <p style={{ fontSize: 30, fontWeight: 900, color: N.text, lineHeight: 1 }}>
            {tipo === "porcentaje" ? `${real}%` : Number(real).toLocaleString()}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 8, fontWeight: 700, color: N.label, marginBottom: 2, textTransform: "uppercase" }}>META</p>
          <p style={{ fontSize: 15, fontWeight: 900, color: N.subtext, lineHeight: 1 }}>
            {tipo === "porcentaje" ? `${meta}%` : Number(meta).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Barra */}
      <div style={{ padding: "0 16px 8px" }}>
        <div style={{
          height: 7, background: N.track, borderRadius: 4,
          overflow: "hidden", boxShadow: "inset 0 1px 3px rgba(0,0,0,.05)",
        }}>
          <div
            className="kpi-bar-fill"
            style={{
              height: "100%",
              width: `${p}%`,
              borderRadius: 4,
              background: cumple
                ? `linear-gradient(90deg, ${c.gradFrom}, ${c.gradTo})`
                : "linear-gradient(90deg, #94a3b8, #cbd5e1)",
            }}
          />
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: "8px 16px",
        background: c.accentBg,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderRadius: "0 0 13px 13px",
        marginTop: "auto",
      }}>
        <span style={{ fontSize: 8, fontWeight: 900, color: N.label, textTransform: "uppercase", letterSpacing: ".06em" }}>
          AVANCE
        </span>
        <span style={{ fontSize: 9, fontWeight: 900, color: cumple ? c.accent : "#94a3b8", display: "flex", alignItems: "center", gap: 4 }}>
          {cumple ? "✓" : "○"} {p.toFixed(1)}% de meta
        </span>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// KPI MINI
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {string}  label
 * @param {string}  [value]   — valor simple sin meta
 * @param {string}  [meta]    — meta (activa barra y comparación)
 * @param {string}  [real]    — real cuando se pasa meta
 * @param {string}  color     — clase border-l-xxx-xxx
 * @param {number}  [index=0]
 * @param {"slate"|"stone"} [variant="slate"]
 */
export function KpiMini({ label, value, meta, real, color, index = 0, variant = "slate" }) {
  const N       = NEUTRAL[variant] || NEUTRAL.slate;
  const metaNum = meta !== undefined ? parseFloat(String(meta).replace("%", "")) : null;
  const realNum = real !== undefined ? parseFloat(String(real).replace("%", "")) : null;
  const p       = metaNum > 0 && realNum !== null ? clamp(Math.round((realNum / metaNum) * 100)) : 0;
  const cumple  = metaNum !== null && realNum !== null && p >= 97;
  const c       = COLOR_MAP_MINI[color] || COLOR_MAP_MINI["border-l-blue-600"];

  const barGrad = cumple
    ? `linear-gradient(90deg, ${c.from}, ${c.to})`
    : "linear-gradient(90deg, #fbbf24, #f97316)";

  return (
    <div
      className="kpi-card"
      style={{
        background:    N.bg,
        borderRadius:  12,
        overflow:      "hidden",
        display:       "flex",
        flexDirection: "column",
        borderTop:     `3px solid ${c.from}`,
        border:        `1px solid ${N.border}`,
        transition:    "transform .18s cubic-bezier(.4,0,.2,1), box-shadow .18s cubic-bezier(.4,0,.2,1)",
        animationDelay: `${index * 45}ms`,
      }}
    >
      <div style={{ padding: "10px 12px 4px", flex: 1 }}>
        <span style={{
          fontSize: 8, fontWeight: 900, color: N.label,
          letterSpacing: ".1em", textTransform: "uppercase",
          display: "block", marginBottom: 8, lineHeight: 1.3,
        }}>{label}</span>

        {meta !== undefined ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 4 }}>
            <div>
              <div style={{ fontSize: 7, fontWeight: 700, color: N.subtext, textTransform: "uppercase", letterSpacing: ".06em" }}>REAL</div>
              <div style={{ fontSize: 16, fontWeight: 900, lineHeight: 1.1, color: cumple ? c.from : "#f59e0b" }}>{real}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 7, fontWeight: 700, color: N.subtext, textTransform: "uppercase", letterSpacing: ".06em" }}>META</div>
              <div style={{ fontSize: 12, fontWeight: 900, color: N.label, lineHeight: 1.1 }}>{meta}</div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.1, color: c.from, marginTop: 2 }}>{value}</div>
        )}
      </div>

      {meta !== undefined && (
        <div style={{ padding: "4px 12px 10px" }}>
          <div style={{ height: 4, background: N.track, borderRadius: 2, overflow: "hidden" }}>
            <div
              className="kpi-bar-fill"
              style={{ height: "100%", width: `${p}%`, background: barGrad, borderRadius: 2 }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <span style={{ fontSize: 7, color: N.subtext, fontWeight: 700, letterSpacing: ".04em" }}>
              {p}% de meta
            </span>
            <span style={{ fontSize: 8, fontWeight: 900, color: cumple ? c.from : "#f59e0b" }}>
              {cumple ? "✓ OK" : "↑ Falta"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// BAR PROGRESS (usada dentro de AsesorCard)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {string} label
 * @param {number} value
 * @param {number} meta
 * @param {string} color  — hex
 */
export function BarProgress({ label, value, meta, color }) {
  const p      = pct(value, meta);
  const cumple = p >= 97;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: "#94a3b8",
          textTransform: "uppercase", letterSpacing: ".06em",
        }}>{label}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1" }}>
          <span style={{ color: cumple ? "#16a34a" : "#0f172a", fontWeight: 900 }}>{value}</span>
          {" / "}{meta}
        </span>
      </div>
      <div style={{ height: 5, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
        <div
          className="kpi-bar-fill"
          style={{
            height: "100%",
            width: `${p}%`,
            background: cumple
              ? `linear-gradient(90deg, ${color}, ${color}bb)`
              : color,
            borderRadius: 3,
          }}
        />
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// PCT KPI CARD — nueva, para las 4 tarjetas % en VistaAsesorVelsa/Novonet
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {string} label           — "% Descarte"
 * @param {number|string} value    — valor numérico del porcentaje
 * @param {string} hint            — "≤25% óptimo"
 * @param {number} okThreshold     — umbral verde
 * @param {number} warnThreshold   — umbral amarillo
 * @param {boolean} [invert=false] — true si menor es mejor (descarte)
 * @param {number}  [index=0]
 * @param {"slate"|"stone"} [variant="slate"]
 */
export function PctKpiCard({
  label,
  value,
  hint,
  okThreshold,
  warnThreshold,
  invert  = false,
  index   = 0,
  variant = "slate",
}) {
  const n  = Number(value || 0);
  const s  = semaforo(n, okThreshold, warnThreshold, invert);
  const BG = {
    "#16a34a": variant === "stone" ? "#f0fdf4" : "#f0fdf4",
    "#d97706": "#fffbeb",
    "#dc2626": "#fef2f2",
  };
  const bg = BG[s.color] || "#f8fafc";

  return (
    <div
      className="kpi-card"
      style={{
        borderRadius:  16,
        border:        `1px solid ${s.color}33`,
        background:    bg,
        padding:       "16px 18px",
        display:       "flex",
        flexDirection: "column",
        gap:           6,
        transition:    "transform .18s cubic-bezier(.4,0,.2,1), box-shadow .18s cubic-bezier(.4,0,.2,1)",
        animationDelay: `${index * 55}ms`,
      }}
    >
      <span style={{
        fontSize: 9, fontWeight: 900, textTransform: "uppercase",
        letterSpacing: ".1em", color: "#94a3b8",
      }}>{label}</span>

      <span style={{ fontSize: 32, fontWeight: 900, lineHeight: 1, color: s.color }}>
        {n.toFixed(1)}%
      </span>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600 }}>
          promedio · {hint}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 800, color: s.color,
          background: `${s.color}18`, padding: "2px 8px",
          borderRadius: 20,
        }}>{s.label}</span>
      </div>
    </div>
  );
}
