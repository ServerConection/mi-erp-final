import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { getNodeDef } from "./nodeDefs";

const handleDot = (color) => ({
  width: 10,
  height: 10,
  background: "#fff",
  border: `2px solid ${color}`,
  borderRadius: 999,
});

/**
 * Nodo visual único para todos los tipos de bot. El tipo real vive en
 * data.flowType (no en node.type de ReactFlow) para no tener que registrar
 * un componente distinto por cada tipo.
 */
function CanvasNode({ id, data, selected }) {
  const def = getNodeDef(data.flowType);
  const nodeData = data.nodeData || {};
  const summary = def.summary ? def.summary(nodeData) : "";
  const isStart = def.type === "startNode";

  return (
    <div
      style={{
        minWidth: 200,
        maxWidth: 240,
        borderRadius: 14,
        border: `2px solid ${selected ? def.color : "#e2e8f0"}`,
        boxShadow: selected ? `0 0 0 3px ${def.color}22` : "0 1px 3px rgba(0,0,0,0.08)",
        background: "#fff",
        overflow: "hidden",
        fontFamily: "inherit",
      }}
    >
      {def.hasInput && (
        <Handle type="target" position={Position.Top} style={handleDot(def.color)} />
      )}

      <div
        style={{
          background: def.color,
          color: "#fff",
          padding: "6px 10px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <span>{def.icon}</span>
        <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {def.label}
        </span>
        {!isStart && (
          <button
            onClick={(e) => { e.stopPropagation(); data.onDelete?.(id); }}
            title="Eliminar nodo"
            style={{ background: "transparent", border: "none", color: "#ffffffcc", cursor: "pointer", fontSize: 12, padding: "0 2px" }}
          >
            ✕
          </button>
        )}
      </div>

      <div style={{ padding: "8px 10px", fontSize: 11.5, color: "#475569", lineHeight: 1.4, minHeight: 28 }}>
        {summary ? (summary.length > 80 ? summary.slice(0, 80) + "…" : summary) : <span style={{ color: "#cbd5e1" }}>(sin configurar)</span>}
      </div>

      {/* Salida simple (un único next) */}
      {def.hasOutput === true && (
        <Handle type="source" position={Position.Bottom} id="default" style={handleDot(def.color)} />
      )}

      {/* Salidas por opción (pollNode) */}
      {def.hasOutput === "options" && (
        <div style={{ borderTop: "1px dashed #e2e8f0" }}>
          {(nodeData.options || []).map((opt, idx) => (
            <div key={idx} style={{ position: "relative", padding: "4px 10px 4px 10px", fontSize: 10.5, color: "#334155", borderBottom: "1px dashed #f1f5f9" }}>
              {idx + 1}. {(typeof opt === "object" ? opt.label : opt) || `Opción ${idx + 1}`}
              <Handle
                type="source"
                position={Position.Right}
                id={`opt-${idx}`}
                style={{ ...handleDot(def.color), top: "50%" }}
              />
            </div>
          ))}
          <div style={{ position: "relative", padding: "4px 10px", fontSize: 9.5, color: "#94a3b8" }}>
            otras / sin coincidencia
            <Handle type="source" position={Position.Bottom} id="default" style={handleDot("#94a3b8")} />
          </div>
        </div>
      )}

      {/* Salidas por condición (conditionNode) */}
      {def.hasOutput === "conditions" && (
        <div style={{ borderTop: "1px dashed #e2e8f0" }}>
          {(nodeData.conditions || []).map((cond, idx) => (
            <div key={idx} style={{ position: "relative", padding: "4px 10px", fontSize: 10.5, color: "#334155", borderBottom: "1px dashed #f1f5f9" }}>
              {idx + 1}. {cond.operator || "equals"} "{cond.value || ""}"
              <Handle
                type="source"
                position={Position.Right}
                id={`cond-${idx}`}
                style={{ ...handleDot(def.color), top: "50%" }}
              />
            </div>
          ))}
          <div style={{ position: "relative", padding: "4px 10px", fontSize: 9.5, color: "#94a3b8" }}>
            si ninguna aplica
            <Handle type="source" position={Position.Bottom} id="default" style={handleDot("#94a3b8")} />
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(CanvasNode);
