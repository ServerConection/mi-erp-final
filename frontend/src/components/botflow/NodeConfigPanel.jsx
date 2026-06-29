import { useEffect, useState } from "react";
import { getNodeDef, OPERATORS } from "./nodeDefs";

const inputCls = "mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400";
const labelCls = "text-xs font-semibold text-slate-500 uppercase tracking-wide";

function JsonField({ value, onChange, placeholder }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [err, setErr] = useState("");

  useEffect(() => { setText(JSON.stringify(value ?? {}, null, 2)); }, [value]);

  return (
    <div>
      <textarea
        rows={4}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          try {
            const parsed = text.trim() ? JSON.parse(text) : {};
            setErr("");
            onChange(parsed);
          } catch (e) {
            setErr("JSON inválido: " + e.message);
          }
        }}
        spellCheck={false}
        className={`${inputCls} font-mono text-xs resize-none ${err ? "border-red-300" : ""}`}
      />
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
    </div>
  );
}

function Field({ field, value, onChange }) {
  const v = value ?? "";
  switch (field.type) {
    case "textarea":
      return (
        <textarea rows={3} value={v} placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} resize-none`} />
      );
    case "number":
      return (
        <input type="number" value={v} placeholder={field.placeholder}
          onChange={(e) => onChange(Number(e.target.value))}
          className={inputCls} />
      );
    case "select":
      return (
        <select value={v} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          {(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );
    case "json":
      return <JsonField value={value} placeholder={field.placeholder} onChange={onChange} />;
    default:
      return (
        <input type="text" value={v} placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls} />
      );
  }
}

function targetLabel(allNodes, id) {
  if (!id) return null;
  const n = allNodes.find((x) => x.id === id);
  return n ? n.label : id;
}

export default function NodeConfigPanel({ node, allNodes, onClose, onUpdateField, onOptionsChange, onConditionsChange }) {
  if (!node) return null;
  const def = getNodeDef(node.data.flowType);
  const nodeData = node.data.nodeData || {};

  return (
    <div className="w-[300px] border-l border-slate-200 bg-white flex flex-col h-full">
      <div className="p-3 border-b border-slate-100 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <span>{def.icon}</span> {def.label}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">{def.description}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {def.fields.length === 0 && (
          <p className="text-xs text-slate-400 italic">Este nodo no requiere configuración.</p>
        )}

        {def.fields.map((field) => {
          if (field.type === "options") {
            const options = nodeData.options || [];
            return (
              <div key={field.key}>
                <label className={labelCls}>{field.label}</label>
                <div className="mt-1 space-y-2">
                  {options.map((opt, idx) => {
                    const optObj = typeof opt === "object" && opt !== null ? opt : { label: opt };
                    return (
                      <div key={idx} className="border border-slate-200 rounded-lg p-2 space-y-1.5">
                        <div className="flex gap-1.5">
                          <input
                            type="text" value={optObj.label || ""} placeholder={`Opción ${idx + 1}`}
                            onChange={(e) => {
                              const next = [...options];
                              next[idx] = { ...optObj, label: e.target.value };
                              onOptionsChange(next);
                            }}
                            className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
                          />
                          <button
                            onClick={() => onOptionsChange(options.filter((_, i) => i !== idx))}
                            className="text-slate-300 hover:text-red-400 text-xs px-1"
                          >🗑️</button>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Destino: {optObj.nextNodeId
                            ? <span className="text-slate-600 font-medium">{targetLabel(allNodes, optObj.nextNodeId)}</span>
                            : <span className="italic">arrastra una conexión desde ① en el lienzo →</span>}
                        </p>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => onOptionsChange([...options, { label: `Opción ${options.length + 1}` }])}
                    className="text-xs border border-dashed border-slate-300 text-slate-500 hover:text-blue-500 hover:border-blue-300 rounded-lg w-full py-1.5"
                  >+ Agregar opción</button>
                </div>
              </div>
            );
          }

          if (field.type === "conditions") {
            const conditions = nodeData.conditions || [];
            return (
              <div key={field.key}>
                <label className={labelCls}>{field.label}</label>
                <div className="mt-1 space-y-2">
                  {conditions.map((cond, idx) => (
                    <div key={idx} className="border border-slate-200 rounded-lg p-2 space-y-1.5">
                      <div className="flex gap-1.5">
                        <select
                          value={cond.operator || "equals"}
                          onChange={(e) => {
                            const next = [...conditions];
                            next[idx] = { ...cond, operator: e.target.value };
                            onConditionsChange(next);
                          }}
                          className="border border-slate-200 rounded px-1.5 py-1 text-[11px] focus:outline-none focus:border-blue-400"
                        >
                          {OPERATORS.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
                        </select>
                        <input
                          type="text" value={cond.value || ""} placeholder="valor a comparar"
                          onChange={(e) => {
                            const next = [...conditions];
                            next[idx] = { ...cond, value: e.target.value };
                            onConditionsChange(next);
                          }}
                          className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
                        />
                        <button
                          onClick={() => onConditionsChange(conditions.filter((_, i) => i !== idx))}
                          className="text-slate-300 hover:text-red-400 text-xs px-1"
                        >🗑️</button>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Destino: {cond.nextNodeId
                          ? <span className="text-slate-600 font-medium">{targetLabel(allNodes, cond.nextNodeId)}</span>
                          : <span className="italic">arrastra una conexión desde ① en el lienzo →</span>}
                      </p>
                    </div>
                  ))}
                  <button
                    onClick={() => onConditionsChange([...conditions, { operator: "contains", value: "" }])}
                    className="text-xs border border-dashed border-slate-300 text-slate-500 hover:text-blue-500 hover:border-blue-300 rounded-lg w-full py-1.5"
                  >+ Agregar regla</button>
                </div>
              </div>
            );
          }

          return (
            <div key={field.key}>
              <label className={labelCls}>{field.label}</label>
              <Field field={field} value={nodeData[field.key]} onChange={(val) => onUpdateField(field.key, val)} />
            </div>
          );
        })}

        <div className="bg-slate-50 rounded-lg p-2 text-[10px] text-slate-400 font-mono">id: {node.id}</div>
      </div>
    </div>
  );
}
