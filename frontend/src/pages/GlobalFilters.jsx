// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  GlobalFilters.jsx — Filtros globales compartidos entre todos los tabs   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

export const CANALES_CFG = {
  "ARTS":              { color: "#1e3a8a", bg: "#dbeafe", icon: "🎨", label: "ARTS" },
  "ARTS FACEBOOK":     { color: "#1877f2", bg: "#eff6ff", icon: "📘", label: "ARTS FB" },
  "ARTS GOOGLE":       { color: "#ea4335", bg: "#fee2e2", icon: "🔍", label: "ARTS GG" },
  "REMARKETING":       { color: "#7c3aed", bg: "#ede9fe", icon: "🔁", label: "REMARKETING" },
  "VIDIKA GOOGLE":     { color: "#059669", bg: "#d1fae5", icon: "📺", label: "VIDIKA GG" },
  "POR RECOMENDACIÓN": { color: "#f59e0b", bg: "#fef3c7", icon: "🤝", label: "RECOMEND." },
};

export const getCanalCfg = (c) => CANALES_CFG[c] || { color: "#64748b", bg: "#f8fafc", icon: "•", label: c };

export function CanalSelector({ canalesSel, onChange, compact = false }) {
  const toggle = (canal) => {
    const next = canalesSel.includes(canal)
      ? canalesSel.filter(c => c !== canal)
      : [...canalesSel, canal];
    onChange(next);
  };
  const selAll = () => onChange([]);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
      <button onClick={selAll} style={{
        padding: compact ? "3px 10px" : "4px 12px", borderRadius: "9999px", fontSize: "8px",
        fontWeight: 900, textTransform: "uppercase", border: "1px solid",
        borderColor: canalesSel.length === 0 ? "#1e3a8a" : "#e2e8f0",
        background: canalesSel.length === 0 ? "#1e3a8a" : "#fff",
        color: canalesSel.length === 0 ? "#fff" : "#64748b", cursor: "pointer",
      }}>Todos</button>
      {Object.entries(CANALES_CFG).map(([canal, cfg]) => {
        const sel = canalesSel.includes(canal);
        return (
          <button key={canal} onClick={() => toggle(canal)} style={{
            padding: compact ? "3px 10px" : "4px 12px", borderRadius: "9999px", fontSize: "8px",
            fontWeight: 900, textTransform: "uppercase",
            border: `1px solid ${sel ? cfg.color : cfg.color + "50"}`,
            background: sel ? cfg.color : cfg.bg,
            color: sel ? "#fff" : cfg.color, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: "4px",
          }}>
            <span>{cfg.icon}</span><span>{cfg.label}</span>
          </button>
        );
      })}
      {canalesSel.length > 0 && (
        <span style={{ fontSize: "8px", color: "#64748b" }}>
          {canalesSel.length} canal{canalesSel.length > 1 ? "es" : ""}
          {" · "}
          <span onClick={selAll} style={{ color: "#ef4444", cursor: "pointer", textDecoration: "underline" }}>limpiar</span>
        </span>
      )}
    </div>
  );
}

export function buildFiltroParams({ desde, hasta, canalesSel = [] }) {
  const p = new URLSearchParams({ fechaDesde: desde, fechaHasta: hasta });
  if (canalesSel.length > 0) p.set("canales", canalesSel.join(","));
  return p.toString();
}