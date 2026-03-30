// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  GlobalFilters.jsx — Filtros globales compartidos entre todos los tabs   ║
// ║  Canal de publicidad + Supervisor                                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

export const CANALES_CFG = {
  "ARTS":              { color: "#1e3a8a", bg: "#dbeafe", icon: "🎨", label: "ARTS" },
  "ARTS FACEBOOK":     { color: "#1877f2", bg: "#eff6ff", icon: "📘", label: "ARTS FB" },
  "ARTS GOOGLE":       { color: "#ea4335", bg: "#fee2e2", icon: "🔍", label: "ARTS GG" },
  "REMARKETING":       { color: "#7c3aed", bg: "#ede9fe", icon: "🔁", label: "REMARKETING" },
  "VIDIKA GOOGLE":     { color: "#059669", bg: "#d1fae5", icon: "📺", label: "VIDIKA GG" },
  "POR RECOMENDACIÓN": { color: "#f59e0b", bg: "#fef3c7", icon: "🤝", label: "RECOMEND." },
};

export const TODOS_CANALES = Object.keys(CANALES_CFG);
export const getCanalCfg = (c) => CANALES_CFG[c] || { color: "#64748b", bg: "#f8fafc", icon: "•", label: c };

// ── Componente selector de canales ───────────────────────────────────────────
export function CanalSelector({ canalesSel, onChange, canalesDisp = TODOS_CANALES, compact = false }) {
  const toggle = (canal) => {
    const next = canalesSel.includes(canal)
      ? canalesSel.filter(c => c !== canal)
      : [...canalesSel, canal];
    onChange(next);
  };
  const selAll = () => onChange([]);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        onClick={selAll}
        style={{
          padding: compact ? "3px 10px" : "4px 12px",
          borderRadius: "9999px",
          fontSize: "8px",
          fontWeight: 900,
          textTransform: "uppercase",
          border: "1px solid",
          borderColor: canalesSel.length === 0 ? "#1e3a8a" : "#e2e8f0",
          background: canalesSel.length === 0 ? "#1e3a8a" : "#fff",
          color: canalesSel.length === 0 ? "#fff" : "#64748b",
          cursor: "pointer",
          transition: "all 0.15s",
        }}
      >
        Todos
      </button>
      {canalesDisp.map(canal => {
        const cfg = getCanalCfg(canal);
        const sel = canalesSel.includes(canal);
        return (
          <button
            key={canal}
            onClick={() => toggle(canal)}
            style={{
              padding: compact ? "3px 10px" : "4px 12px",
              borderRadius: "9999px",
              fontSize: "8px",
              fontWeight: 900,
              textTransform: "uppercase",
              border: `1px solid ${sel ? cfg.color : cfg.color + "50"}`,
              background: sel ? cfg.color : cfg.bg,
              color: sel ? "#fff" : cfg.color,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              transition: "all 0.15s",
            }}
          >
            <span>{cfg.icon}</span>
            <span>{cfg.label}</span>
          </button>
        );
      })}
      {canalesSel.length > 0 && (
        <span style={{ fontSize: "8px", color: "#64748b", fontWeight: 500 }}>
          {canalesSel.length} canal{canalesSel.length > 1 ? "es" : ""}
          {" · "}
          <span
            onClick={selAll}
            style={{ color: "#ef4444", cursor: "pointer", textDecoration: "underline" }}
          >
            limpiar
          </span>
        </span>
      )}
    </div>
  );
}

// ── Selector de supervisor ───────────────────────────────────────────────────
export function SupervisorSelector({ supervisores, supervisorSel, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span style={{ fontSize: "8px", fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>
        Supervisor:
      </span>
      <button
        onClick={() => onChange("")}
        style={{
          padding: "3px 10px",
          borderRadius: "9999px",
          fontSize: "8px",
          fontWeight: 900,
          border: "1px solid",
          borderColor: !supervisorSel ? "#1e3a8a" : "#e2e8f0",
          background: !supervisorSel ? "#1e3a8a" : "#fff",
          color: !supervisorSel ? "#fff" : "#64748b",
          cursor: "pointer",
        }}
      >
        Todos
      </button>
      {(supervisores || []).map(sup => (
        <button
          key={sup}
          onClick={() => onChange(supervisorSel === sup ? "" : sup)}
          style={{
            padding: "3px 10px",
            borderRadius: "9999px",
            fontSize: "8px",
            fontWeight: 900,
            border: "1px solid",
            borderColor: supervisorSel === sup ? "#0ea5e9" : "#e2e8f0",
            background: supervisorSel === sup ? "#0ea5e9" : "#f0f9ff",
            color: supervisorSel === sup ? "#fff" : "#0ea5e9",
            cursor: "pointer",
          }}
        >
          {sup}
        </button>
      ))}
    </div>
  );
}

// ── Badge de canal ────────────────────────────────────────────────────────────
export function CanalBadge({ canal, size = "sm" }) {
  const cfg = getCanalCfg(canal);
  return (
    <span
      style={{
        padding: size === "sm" ? "2px 8px" : "3px 12px",
        fontSize: size === "sm" ? "8px" : "9px",
        fontWeight: 900,
        textTransform: "uppercase",
        borderRadius: "9999px",
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.color}30`,
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
      }}
    >
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ── Hook para construir params de query con filtros globales ──────────────────
export function buildFiltroParams({ desde, hasta, canalesSel = [], supervisor = "" }) {
  const p = new URLSearchParams({ fechaDesde: desde, fechaHasta: hasta });
  if (canalesSel.length > 0) p.set("canales", canalesSel.join(","));
  if (supervisor) p.set("supervisor", supervisor);
  return p.toString();
}