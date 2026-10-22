/**
 * MultiSelectBuscable.jsx — selector múltiple con buscador.
 * Usado en "Crear base desde Bitrix" (WABOT) y "Cargar base" (Automarcador).
 * value: array de ids (string). Vacío = "Todos".
 */
import { useState, useEffect, useMemo, useRef } from "react";

const normalizar = (v = "") => String(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export default function MultiSelectBuscable({ options = [], value = [], onChange, disabled, placeholder = "Buscar…", todosLabel = "Todos" }) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const seleccion = useMemo(() => new Set(value.map(String)), [value]);

  const filtradas = useMemo(() => {
    const n = normalizar(query);
    return n ? options.filter(o => normalizar(o.name).includes(n)) : options;
  }, [options, query]);

  useEffect(() => {
    const cerrar = e => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, []);

  const toggle = id => {
    const k = String(id);
    const next = new Set(seleccion);
    next.has(k) ? next.delete(k) : next.add(k);
    onChange([...next]);
  };
  const marcarVisibles = () => onChange([...new Set([...seleccion, ...filtradas.map(o => String(o.id))])]);

  const nombres = options.filter(o => seleccion.has(String(o.id))).map(o => o.name);
  const resumen = nombres.length === 0 ? todosLabel
    : nombres.length <= 2 ? nombres.join(", ") : `${nombres.length} seleccionados`;

  return (
    <div ref={rootRef} className="relative mt-1">
      <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between border rounded-lg bg-white px-3 py-2 text-sm text-left ${open ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200"} ${disabled ? "opacity-60" : ""}`}>
        <span className={`truncate ${nombres.length ? "text-slate-700 font-semibold" : "text-slate-400"}`}>{resumen}</span>
        <span className="text-xs text-slate-400 ml-2">▾</span>
      </button>
      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder}
              className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm outline-none focus:border-blue-400" />
            <div className="flex gap-3 mt-2 text-xs">
              <button type="button" onClick={marcarVisibles} className="text-blue-700 hover:underline">Marcar {query ? "visibles" : "todos"}</button>
              <button type="button" onClick={() => onChange([])} className="text-slate-500 hover:underline">Limpiar</button>
              <span className="ml-auto text-slate-400">{seleccion.size} sel.</span>
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtradas.map(o => (
              <label key={o.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={seleccion.has(String(o.id))} onChange={() => toggle(o.id)} />
                <span className="truncate">{o.name}</span>
              </label>
            ))}
            {!filtradas.length && <div className="px-3 py-4 text-center text-sm text-slate-500">Sin resultados para “{query}”</div>}
          </div>
        </div>
      )}
    </div>
  );
}
