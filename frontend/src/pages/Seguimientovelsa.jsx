import { useEffect, useState, useMemo, useRef, useCallback } from "react";


// ─────────────────────────────────────────────────────────────────────────────
// SONIDO — tono de notificación suave generado con Web Audio API
// ─────────────────────────────────────────────────────────────────────────────
const playChime = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notas = [
      { freq: 523.25, t: 0,    dur: 0.18 },  // C5
      { freq: 659.25, t: 0.12, dur: 0.18 },  // E5
      { freq: 783.99, t: 0.24, dur: 0.28 },  // G5
    ];
    notas.forEach(({ freq, t, dur }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + t);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + dur);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + dur + 0.05);
    });
  } catch (_) {}
};

// CSS keyframes inyectados una vez
const ANIM_STYLE = `
  @keyframes rowFlash {
    0%   { background: #dcfce7; box-shadow: inset 3px 0 0 #10b981; }
    40%  { background: #bbf7d0; box-shadow: inset 3px 0 0 #059669; }
    100% { background: transparent; box-shadow: none; }
  }
  @keyframes badgePop {
    0%   { transform: scale(0.5); opacity: 0; }
    60%  { transform: scale(1.15); }
    100% { transform: scale(1);   opacity: 1; }
  }
  @keyframes splashIn {
    0%   { opacity: 0; transform: scale(.85) translateY(20px); }
    100% { opacity: 1; transform: scale(1)   translateY(0); }
  }
  @keyframes splashOut {
    0%   { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(.92) translateY(-16px); }
  }
  @keyframes nameReveal {
    0%   { opacity: 0; letter-spacing: .5em; }
    100% { opacity: 1; letter-spacing: .04em; }
  }
  @keyframes confettiFall {
    0%   { transform: translateY(-10px) rotate(0deg);   opacity: 1; }
    100% { transform: translateY(320px) rotate(720deg); opacity: 0; }
  }
  @keyframes crownBounce {
    0%,100% { transform: translateY(0)   rotate(-6deg); }
    50%      { transform: translateY(-8px) rotate(6deg); }
  }
  @keyframes pulse {
    0%,100% { opacity: 1; }
    50%      { opacity: .55; }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const getFechaHoyEcuador = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });

const getPrimerDiaMes = () => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Guayaquil" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const initials = (n = "") =>
  n.split(" ").slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();

// ─────────────────────────────────────────────────────────────────────────────
// PALETA POR SUPERVISOR — colores de acento para tema claro
// ─────────────────────────────────────────────────────────────────────────────
const SUP_PALETTE = [
  { accent: "#f97316", light: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
  { accent: "#eab308", light: "#fefce8", text: "#a16207", border: "#fef08a" },
  { accent: "#ef4444", light: "#fee2e2", text: "#991b1b", border: "#fecaca" },
  { accent: "#f59e0b", light: "#fffbeb", text: "#92400e", border: "#fde68a" },
  { accent: "#fb923c", light: "#fff7ed", text: "#9a3412", border: "#fdba74" },
  { accent: "#dc2626", light: "#fef2f2", text: "#991b1b", border: "#fca5a5" },
  { accent: "#d97706", light: "#fffbeb", text: "#78350f", border: "#fcd34d" },
];
const supColor = (i) => SUP_PALETTE[i % SUP_PALETTE.length];

// Colores de posición: oro, plata, bronce
const RANK_COLORS = [
  { bg: "#fef9c3", border: "#fde047", text: "#a16207", dot: "#eab308" },
  { bg: "#f1f5f9", border: "#cbd5e1", text: "#475569", dot: "#94a3b8" },
  { bg: "#fef3c7", border: "#fcd34d", text: "#92400e", dot: "#d97706" },
];
const rankColor = (i) => RANK_COLORS[i] || { bg: "#f8fafc", border: "#e2e8f0", text: "#94a3b8", dot: "#cbd5e1" };

// ─────────────────────────────────────────────────────────────────────────────
// FILA DE ASESOR
// ─────────────────────────────────────────────────────────────────────────────
function AsesorRow({ asesor, rank, pct, maxJot, accentColor, isNew }) {
  const rc   = rankColor(rank);
  const jot  = Number(asesor.ingresos_reales || 0);
  const act  = Number(asesor.real_mes || 0) + Number(asesor.backlog || 0);
  const barW = maxJot > 0 ? Math.round((jot / maxJot) * 100) : 0;

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px",
        borderBottom: "1px solid #f1f5f9",
        transition: isNew ? "none" : "background .12s",
        cursor: "default",
        animation: isNew ? "rowFlash 2.4s ease-out forwards" : "none",
        position: "relative",
      }}
      onMouseEnter={e => { if (!isNew) e.currentTarget.style.background = "#f8fafc"; }}
      onMouseLeave={e => { if (!isNew) e.currentTarget.style.background = "transparent"; }}
    >
      {isNew && (
        <span style={{
          position: "absolute", top: 6, right: 10,
          background: "#10b981", color: "#fff",
          fontSize: 8, fontWeight: 900, padding: "2px 7px",
          borderRadius: 20, letterSpacing: ".08em",
          textTransform: "uppercase",
          animation: "badgePop .4s ease-out forwards",
          zIndex: 1,
        }}>
          ↑ NUEVO
        </span>
      )}
      {/* Posición */}
      <div style={{
        width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
        background: rc.bg, border: `1px solid ${rc.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 900, color: rc.text,
      }}>
        {rank + 1}
      </div>

      {/* Avatar */}
      <div style={{
        width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
        background: accentColor + "18",
        border: `1.5px solid ${accentColor}40`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 800, color: accentColor,
      }}>
        {initials(asesor.nombre_grupo)}
      </div>

      {/* Nombre + barra */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: "#0f172a",
          textTransform: "uppercase", letterSpacing: ".01em",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          marginBottom: 5,
        }}>
          {asesor.nombre_grupo}
        </div>
        <div style={{ height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${barW}%`,
            background: accentColor,
            borderRadius: 2,
            transition: "width 1s cubic-bezier(.4,0,.2,1)",
          }} />
        </div>
      </div>

      {/* Ingresos Jot */}
      <div style={{ textAlign: "center", minWidth: 52, flexShrink: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: accentColor, lineHeight: 1 }}>
          {jot}
        </div>
        <div style={{ fontSize: 8, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginTop: 2 }}>
          Jot
        </div>
      </div>

      {/* Divisor */}
      <div style={{ width: 1, height: 28, background: "#e2e8f0", flexShrink: 0 }} />

      {/* Activas totales */}
      <div style={{ textAlign: "center", minWidth: 48, flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", lineHeight: 1 }}>
          {act}
        </div>
        <div style={{ fontSize: 8, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginTop: 2 }}>
          Activas
        </div>
      </div>

      {/* Divisor */}
      <div style={{ width: 1, height: 28, background: "#e2e8f0", flexShrink: 0 }} />

      {/* % del grupo */}
      <div style={{ textAlign: "center", minWidth: 40, flexShrink: 0 }}>
        <div style={{
          display: "inline-block",
          background: accentColor + "12",
          border: `1px solid ${accentColor}30`,
          borderRadius: 6,
          padding: "2px 6px",
          fontSize: 11, fontWeight: 800, color: accentColor,
          lineHeight: 1.4,
        }}>
          {pct}%
        </div>
        <div style={{ fontSize: 8, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginTop: 3 }}>
          del grupo
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD DE SUPERVISOR
// ─────────────────────────────────────────────────────────────────────────────
function SupervisorCard({ supervisor, asesores, idx, newNames }) {
  const cfg    = supColor(idx);
  const sorted = [...asesores].sort((a, b) => Number(b.ingresos_reales || 0) - Number(a.ingresos_reales || 0));
  const maxJot = Math.max(...sorted.map(a => Number(a.ingresos_reales || 0)), 1);
  const totJot = sorted.reduce((a, r) => a + Number(r.ingresos_reales || 0), 0);
  const totAct = sorted.reduce((a, r) => a + Number(r.real_mes || 0) + Number(r.backlog || 0), 0);

  return (
    <div style={{
      background: "#ffffff",
      border: `1px solid #e2e8f0`,
      borderTop: `3px solid ${cfg.accent}`,
      borderRadius: 14,
      overflow: "hidden",
      boxShadow: "0 1px 8px rgba(0,0,0,.06)",
    }}>
      {/* Header supervisor */}
      <div style={{
        padding: "14px 16px 12px",
        borderBottom: "1px solid #f1f5f9",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "#fafafa",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: cfg.light,
            border: `1px solid ${cfg.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 800, color: cfg.accent,
          }}>
            {initials(supervisor)}
          </div>
          <div>
            <div style={{
              fontSize: 13, fontWeight: 800, color: "#0f172a",
              textTransform: "uppercase", letterSpacing: ".02em", lineHeight: 1.1,
            }}>
              {supervisor}
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginTop: 2 }}>
              {sorted.length} asesor{sorted.length !== 1 ? "es" : ""}
            </div>
          </div>
        </div>

        {/* Totales del supervisor */}
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: cfg.accent, lineHeight: 1 }}>{totJot}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginTop: 1 }}>Jotform</div>
          </div>
          <div style={{ width: 1, height: 28, background: "#e2e8f0" }} />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#334155", lineHeight: 1 }}>{totAct}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginTop: 1 }}>Activas</div>
          </div>
        </div>
      </div>

      {/* Cabecera de columnas */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "5px 16px",
        background: "#f8fafc",
        borderBottom: "1px solid #f1f5f9",
      }}>
        <div style={{ width: 26, flexShrink: 0 }} />
        <div style={{ width: 30, flexShrink: 0 }} />
        <div style={{ flex: 1 }} />
        <div style={{ minWidth: 52, textAlign: "center", fontSize: 8, fontWeight: 800, color: "#cbd5e1", textTransform: "uppercase" }}>Jot</div>
        <div style={{ width: 1 }} />
        <div style={{ minWidth: 48, textAlign: "center", fontSize: 8, fontWeight: 800, color: "#cbd5e1", textTransform: "uppercase" }}>Activas</div>
        <div style={{ width: 1 }} />
        <div style={{ minWidth: 40, textAlign: "center", fontSize: 8, fontWeight: 800, color: "#cbd5e1", textTransform: "uppercase" }}>% Grupo</div>
      </div>

      {/* Filas */}
      <div>
        {sorted.map((asesor, i) => {
          const pct = totJot > 0
            ? Math.round((Number(asesor.ingresos_reales || 0) / totJot) * 100)
            : 0;
          return (
            <AsesorRow
              key={asesor.nombre_grupo}
              asesor={asesor}
              rank={i}
              pct={pct}
              maxJot={maxJot}
              accentColor={cfg.accent}
              isNew={newNames.has(asesor.nombre_grupo)}
            />
          );
        })}
        {sorted.length === 0 && (
          <div style={{ padding: "24px 16px", textAlign: "center",
            fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".1em" }}>
            Sin datos
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RANKING GENERAL
// ─────────────────────────────────────────────────────────────────────────────
function RankingGeneral({ asesores, supColorMap, newNames }) {
  const sorted = [...asesores].sort((a, b) => Number(b.ingresos_reales || 0) - Number(a.ingresos_reales || 0));
  const maxJot = Math.max(...sorted.map(a => Number(a.ingresos_reales || 0)), 1);
  const totJot = sorted.reduce((a, r) => a + Number(r.ingresos_reales || 0), 0);
  const totAct = sorted.reduce((a, r) => a + Number(r.real_mes || 0) + Number(r.backlog || 0), 0);

  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e2e8f0",
      borderTop: "3px solid #ea580c",
      borderRadius: 14,
      overflow: "hidden",
      boxShadow: "0 1px 8px rgba(0,0,0,.06)",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px",
        borderBottom: "1px solid #f1f5f9",
        background: "#fffbf5",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: "#fff7ed", border: "1px solid #fed7aa",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>
            🏆
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a",
              textTransform: "uppercase", letterSpacing: ".03em" }}>
              Ranking general
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginTop: 2 }}>
              Todos los asesores · sin distinción de supervisor
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", lineHeight: 1 }}>{totJot}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginTop: 1 }}>Total Jot</div>
          </div>
          <div style={{ width: 1, height: 32, background: "#e2e8f0" }} />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#475569", lineHeight: 1 }}>{totAct}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginTop: 1 }}>Total Activas</div>
          </div>
        </div>
      </div>

      {/* Cabecera de columnas */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "5px 16px", background: "#f8fafc", borderBottom: "1px solid #f1f5f9",
      }}>
        <div style={{ width: 26, flexShrink: 0 }} />
        <div style={{ width: 30, flexShrink: 0 }} />
        <div style={{ flex: 1 }} />
        <div style={{ minWidth: 52, textAlign: "center", fontSize: 8, fontWeight: 800, color: "#cbd5e1", textTransform: "uppercase" }}>Jot</div>
        <div style={{ width: 1 }} />
        <div style={{ minWidth: 48, textAlign: "center", fontSize: 8, fontWeight: 800, color: "#cbd5e1", textTransform: "uppercase" }}>Activas</div>
        <div style={{ width: 1 }} />
        <div style={{ minWidth: 40, textAlign: "center", fontSize: 8, fontWeight: 800, color: "#cbd5e1", textTransform: "uppercase" }}>% Total</div>
      </div>

      {/* 1 columna — 15 primeros visibles, scroll para el resto */}
      <div style={{ maxHeight: 15 * 57, overflowY: "auto",
        scrollbarWidth: "thin", scrollbarColor: "#e2e8f0 transparent" }}>
        {sorted.map((asesor, i) => {
          const pct    = totJot > 0 ? Math.round((Number(asesor.ingresos_reales || 0) / totJot) * 100) : 0;
          const supIdx = supColorMap[asesor.supervisor] ?? 0;
          const accent = supColor(supIdx).accent;
          return (
            <AsesorRow
              key={asesor.nombre_grupo}
              asesor={asesor}
              rank={i}
              pct={pct}
              maxJot={maxJot}
              accentColor={accent}
              isNew={newNames.has(asesor.nombre_grupo)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// CONFETI — piezas aleatorias
// ─────────────────────────────────────────────────────────────────────────────
const CONFETTI_COLORS = ["#f97316","#fbbf24","#ef4444","#f59e0b","#fb923c","#fde68a","#dc2626"];
const CONFETTI_PIECES = Array.from({ length: 48 }, (_, i) => ({
  id: i,
  color:  CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  left:   `${Math.round(Math.random() * 100)}%`,
  width:  `${6 + Math.round(Math.random() * 8)}px`,
  height: `${10 + Math.round(Math.random() * 10)}px`,
  delay:  `${(Math.random() * 0.6).toFixed(2)}s`,
  dur:    `${(1.8 + Math.random() * 1.4).toFixed(2)}s`,
  rotate: `${Math.round(Math.random() * 360)}deg`,
  shape:  i % 3 === 0 ? "50%" : i % 3 === 1 ? "0%" : "2px",
}));

function LiderSplash({ lider, show }) {
  if (!lider) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,.55)",
      backdropFilter: "blur(6px)",
      animation: show ? "splashIn .4s ease-out forwards" : "splashOut .5s ease-in forwards",
      pointerEvents: show ? "auto" : "none",
    }}
    onClick={() => {}}
    >
      {/* Confeti */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        {CONFETTI_PIECES.map(p => (
          <div key={p.id} style={{
            position: "absolute",
            top: "-20px",
            left: p.left,
            width: p.width,
            height: p.height,
            background: p.color,
            borderRadius: p.shape,
            transform: `rotate(${p.rotate})`,
            animation: `confettiFall ${p.dur} ${p.delay} ease-in forwards`,
            opacity: 0,
          }} />
        ))}
      </div>

      {/* Card central */}
      <div style={{
        background: "#fff",
        borderRadius: 24,
        padding: "40px 52px",
        textAlign: "center",
        boxShadow: "0 32px 80px rgba(0,0,0,.35)",
        border: `3px solid ${lider.accent}`,
        maxWidth: 480, width: "90%",
        position: "relative",
      }}>
        {/* Corona animada */}
        <div style={{
          fontSize: 52, lineHeight: 1, marginBottom: 8,
          animation: "crownBounce 1.2s ease-in-out infinite",
          display: "inline-block",
        }}>
          👑
        </div>

        {/* Etiqueta */}
        <div style={{
          fontSize: 10, fontWeight: 900, letterSpacing: ".22em",
          textTransform: "uppercase", color: "#94a3b8", marginBottom: 10,
          animation: "pulse 2s ease-in-out infinite",
        }}>
          LÍDER DEL PERÍODO
        </div>

        {/* Nombre */}
        <div style={{
          fontSize: 34, fontWeight: 900, color: "#0f172a",
          textTransform: "uppercase", lineHeight: 1.1,
          animation: "nameReveal .6s ease-out forwards",
          letterSpacing: ".04em",
          marginBottom: 20,
        }}>
          {lider.nombre}
        </div>

        {/* Métricas */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 24,
          borderTop: "1px solid #f1f5f9", paddingTop: 18,
        }}>
          <div>
            <div style={{ fontSize: 36, fontWeight: 900, color: lider.accent, lineHeight: 1 }}>
              {lider.jot}
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8",
              textTransform: "uppercase", letterSpacing: ".12em", marginTop: 4 }}>
              Ingresos Jot
            </div>
          </div>
          <div style={{ width: 1, background: "#f1f5f9" }} />
          <div>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#334155", lineHeight: 1 }}>
              {lider.activas}
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8",
              textTransform: "uppercase", letterSpacing: ".12em", marginTop: 4 }}>
              Activas totales
            </div>
          </div>
        </div>

        {/* Barra de tiempo */}
        <div style={{ marginTop: 20, height: 3, background: "#f1f5f9",
          borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%", background: lider.accent,
            borderRadius: 2,
            animation: "splashOut 7s linear forwards",
            width: "100%",
          }} />
        </div>
        <div style={{ fontSize: 8, color: "#cbd5e1", marginTop: 6,
          fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase" }}>
          Cerrando en 7 s · click para cerrar
        </div>
      </div>
    </div>
  );
}

export default function Seguimientovelsa() {
  const [loading, setLoading]     = useState(false);
  const [asesores, setAsesores]   = useState([]);
  const [ultimaAct, setUltimaAct] = useState(null);
  const [newNames, setNewNames]   = useState(new Set());
  const [lider, setLider]         = useState(null);      // { nombre, jot, activas, accentColor }
  const [showLider, setShowLider] = useState(false);
  const prevJotMap                = useRef({});
  const liderTimer                = useRef(null);
  const styleInjected             = useRef(false);

  const [filtros, setFiltros] = useState({
    fechaDesde: getPrimerDiaMes(),
    fechaHasta: getFechaHoyEcuador(),
  });

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = async (f) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ fechaDesde: f.fechaDesde, fechaHasta: f.fechaHasta });
      const res    = await fetch(`${import.meta.env.VITE_API_URL}/api/indicadores-velsa/dashboard?${params}`);
      const result = await res.json();
      if (result.success) {
        // Mapear supervisor desde dataNetlife (campo SUPERVISOR_ASIGNADO)
        const netMap = {};
        (result.dataNetlife || []).forEach(r => {
          if (r.ASESOR && r.SUPERVISOR_ASIGNADO)
            netMap[r.ASESOR.toUpperCase()] = r.SUPERVISOR_ASIGNADO;
        });
        const enriched = (result.asesores || []).map(a => ({
          ...a,
          supervisor: netMap[a.nombre_grupo?.toUpperCase()] || "SIN SUPERVISOR",
        }));
        // Detectar asesores con ingresos Jot nuevos respecto al ciclo anterior
        const changed = new Set();
        enriched.forEach(a => {
          const prev = prevJotMap.current[a.nombre_grupo] ?? -1;
          const curr = Number(a.ingresos_reales || 0);
          if (prev !== -1 && curr > prev) changed.add(a.nombre_grupo);
        });
        // Actualizar mapa previo
        enriched.forEach(a => {
          prevJotMap.current[a.nombre_grupo] = Number(a.ingresos_reales || 0);
        });
        if (changed.size > 0) {
          playChime();
          setNewNames(changed);
          setTimeout(() => setNewNames(new Set()), 4000);
        }
        // ── Splash de líder en CADA actualización ──────────────────────────
        const sorted = [...enriched].sort((a, b) =>
          Number(b.ingresos_reales || 0) - Number(a.ingresos_reales || 0)
        );
        if (sorted.length > 0) {
          const top     = sorted[0];
          const supIdx  = Object.keys(
            enriched.reduce((m, a) => { m[a.supervisor] = true; return m; }, {})
          ).indexOf(top.supervisor);
          const accent  = ["#f97316","#eab308","#ef4444","#f59e0b","#fb923c","#dc2626","#d97706"][
            Math.max(0, supIdx) % 7
          ];
          if (liderTimer.current) clearTimeout(liderTimer.current);
          setLider({
            nombre:  top.nombre_grupo,
            jot:     Number(top.ingresos_reales || 0),
            activas: Number(top.real_mes || 0) + Number(top.backlog || 0),
            accent,
          });
          setShowLider(true);
          playChime();
          liderTimer.current = setTimeout(() => setShowLider(false), 7000);
        }
        setAsesores(enriched);
        setUltimaAct(new Date());
      }
    } catch (e) {
      console.error("Error Seguimiento:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!styleInjected.current) {
      const el = document.createElement("style");
      el.textContent = ANIM_STYLE;
      document.head.appendChild(el);
      styleInjected.current = true;
    }
    fetchData(filtros);
  }, []);

  // Auto-refresh cada 15 min
  useEffect(() => {
    const iv = setInterval(() => fetchData(filtros), 15 * 60 * 1000);
    return () => clearInterval(iv);
  }, [filtros]);

  const updateFiltro = (campo, valor) => {
    const f = { ...filtros, [campo]: valor };
    setFiltros(f);
    fetchData(f);
  };

  // ── Agrupación por supervisor ordenada por total Jot desc ─────────────────
  const grupos = useMemo(() => {
    const map = {};
    asesores.forEach(a => {
      const sup = a.supervisor || "SIN SUPERVISOR";
      if (!map[sup]) map[sup] = [];
      map[sup].push(a);
    });
    return Object.entries(map).sort(([, a], [, b]) => {
      const ta = a.reduce((s, r) => s + Number(r.ingresos_reales || 0), 0);
      const tb = b.reduce((s, r) => s + Number(r.ingresos_reales || 0), 0);
      return tb - ta;
    });
  }, [asesores]);

  // Mapa supervisor → índice para color consistente
  const supColorMap = useMemo(() => {
    const m = {};
    grupos.forEach(([sup], i) => { m[sup] = i; });
    return m;
  }, [grupos]);

  // Totales globales
  const totales = useMemo(() => ({
    jot: asesores.reduce((a, r) => a + Number(r.ingresos_reales || 0), 0),
    act: asesores.reduce((a, r) => a + Number(r.real_mes || 0) + Number(r.backlog || 0), 0),
  }), [asesores]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      background: "#f1f5f9",
      color: "#0f172a",
      padding: "24px 20px",
      fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
    }}>

      {/* ── SPLASH LÍDER ── */}
      {lider && (
        <LiderSplash
          lider={lider}
          show={showLider}
        />
      )}

      {/* ── HEADER ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", flexWrap: "wrap", gap: 16,
          marginBottom: 16,
        }}>
          {/* Título */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{
                background: "#ea580c", color: "#fff",
                padding: "3px 10px", borderRadius: 5,
                fontSize: 10, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase",
              }}>
                VELSA
              </span>
              <h1 style={{
                fontSize: 22, fontWeight: 900, color: "#0f172a", margin: 0,
                textTransform: "uppercase", letterSpacing: "-.01em",
              }}>
                Ranking de ventas
              </h1>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: "#64748b", fontWeight: 500 }}>
              Ingresos Jotform y activas totales por asesor · Velsa · agrupado por supervisor
              {ultimaAct && (
                <span style={{ marginLeft: 10, color: "#94a3b8" }}>
                  · Actualizado {ultimaAct.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </p>
          </div>

          {/* KPI strip */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              { label: "Total Jotform",   val: totales.jot,      color: "#f97316" },
              { label: "Total activas",   val: totales.act,      color: "#eab308" },
              { label: "Supervisores",    val: grupos.length,    color: "#ef4444" },
              { label: "Asesores",        val: asesores.length,  color: "#fb923c" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "#fff", border: "1px solid #e2e8f0",
                borderRadius: 10, padding: "10px 16px", minWidth: 90,
                boxShadow: "0 1px 4px rgba(0,0,0,.04)",
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8",
                  textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 4 }}>
                  {label}
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color, lineHeight: 1 }}>
                  {val}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Filtros */}
        <div style={{
          display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
          background: "#fff", border: "1px solid #e2e8f0",
          borderRadius: 10, padding: "10px 16px",
          boxShadow: "0 1px 4px rgba(0,0,0,.04)",
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8",
            textTransform: "uppercase", letterSpacing: ".1em" }}>
            Período
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="date"
              style={{
                background: "#f8fafc", border: "1px solid #e2e8f0",
                borderRadius: 7, padding: "6px 10px",
                fontSize: 11, fontWeight: 700, color: "#0f172a",
                outline: "none",
              }}
              value={filtros.fechaDesde}
              onChange={e => updateFiltro("fechaDesde", e.target.value)}
            />
            <span style={{ color: "#94a3b8", fontWeight: 700 }}>–</span>
            <input type="date"
              style={{
                background: "#f8fafc", border: "1px solid #e2e8f0",
                borderRadius: 7, padding: "6px 10px",
                fontSize: 11, fontWeight: 700, color: "#0f172a",
                outline: "none",
              }}
              value={filtros.fechaHasta}
              onChange={e => updateFiltro("fechaHasta", e.target.value)}
            />
          </div>
          <button
            onClick={() => fetchData(filtros)}
            style={{
              background: loading ? "#f1f5f9" : "#ea580c",
              color: loading ? "#94a3b8" : "#fff",
              border: "none", borderRadius: 7, padding: "7px 16px",
              fontSize: 10, fontWeight: 800, cursor: loading ? "default" : "pointer",
              textTransform: "uppercase", letterSpacing: ".08em",
              transition: "all .2s",
            }}
          >
            {loading ? "Cargando..." : "↻ Actualizar"}
          </button>
          <span style={{ fontSize: 9, color: "#cbd5e1", fontWeight: 600 }}>
            Auto-refresh cada 15 min
          </span>
        </div>
      </div>

      {/* ── LOADING STATE ── */}
      {loading && asesores.length === 0 && (
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: ".15em" }}>
            Cargando datos...
          </div>
        </div>
      )}

      {/* ── RANKING GENERAL — PRIMERO ── */}
      {asesores.length > 0 && (
        <>
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8",
              textTransform: "uppercase", letterSpacing: ".14em" }}>
              Ranking general
            </span>
          </div>
          <div style={{ marginBottom: 32 }}>
            <RankingGeneral asesores={asesores} supColorMap={supColorMap} newNames={newNames} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
            <span style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8",
              textTransform: "uppercase", letterSpacing: ".18em", whiteSpace: "nowrap" }}>
              Por supervisor — {grupos.length} grupos
            </span>
            <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 16,
            marginBottom: 32,
          }}>
            {grupos.map(([sup, ases], idx) => (
              <SupervisorCard key={sup} supervisor={sup} asesores={ases} idx={idx} newNames={newNames} />
            ))}
          </div>
        </>
      )}

      {/* ── VACÍO ── */}
      {!loading && asesores.length === 0 && (
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: ".15em" }}>
            Sin datos para el período seleccionado
          </div>
        </div>
      )}

      {/* Pie */}
      <div style={{
        marginTop: 40, paddingTop: 16, borderTop: "1px solid #e2e8f0",
        textAlign: "center", fontSize: 9, color: "#cbd5e1", fontWeight: 600,
        textTransform: "uppercase", letterSpacing: ".12em",
      }}>
        Seguimiento de ventas · Velsa · Datos en tiempo real
      </div>
    </div>
  );
}