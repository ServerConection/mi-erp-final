// Selección de líneas de envío y regla de responsable para Campañas Masivas.
// - Supervisores / gerencia / administración: varias líneas (envío en ronda).
// - Asesores: solo su propia línea (el backend también lo valida).
import { useMemo, useState } from "react";

const PERFILES_MULTILINEA = ["ADMINISTRADOR", "SUPERVISOR", "GERENCIA", "GERENTE", "ANALISTA", "ATC"];

export const puedeElegirVariasLineas = () => {
  try {
    const u = JSON.parse(localStorage.getItem("userProfile") || "{}");
    const perfil = String(u.perfil || "").toUpperCase();
    return PERFILES_MULTILINEA.includes(perfil) || /^GEREN(CIA|TE)[ _-]/.test(perfil);
  } catch { return false; }
};

export const MODOS_RESPONSABLE = [
  { id: "libre", titulo: "Ronda normal", detalle: "Una línea tras otra y vuelve a empezar." },
  { id: "evitar", titulo: "No entregar al mismo responsable", detalle: "Cada lead lo contacta un asesor distinto al suyo." },
  { id: "mismo", titulo: "Enviar desde el mismo responsable", detalle: "Cada lead sale desde la línea de su propio asesor." },
];

export const etiquetaModo = (id) => MODOS_RESPONSABLE.find(m => m.id === id)?.titulo || "Ronda normal";

export default function SelectorLineasCampana({ lines, lineIds, onLineIds, modo, onModo }) {
  const multi = useMemo(() => puedeElegirVariasLineas(), []);
  const [buscar, setBuscar] = useState("");
  const seleccion = new Set((lineIds || []).map(String));
  const filtradas = lines.filter(l =>
    `${l.name} ${l.owner_username || ""}`.toLowerCase().includes(buscar.trim().toLowerCase()));

  const alternar = (id) => {
    const k = String(id);
    if (!multi) return onLineIds([k]);
    onLineIds(seleccion.has(k) ? [...seleccion].filter(x => x !== k) : [...seleccion, k]);
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {multi ? "Líneas de envío (en ronda)" : "Línea de envío"}
          </label>
          {multi && lines.length > 0 && (
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={() => onLineIds(lines.map(l => String(l.id)))} className="text-blue-600 hover:underline">Todas</button>
              <button type="button" onClick={() => onLineIds([])} className="text-slate-500 hover:underline">Ninguna</button>
            </div>
          )}
        </div>
        {multi && lines.length > 6 && (
          <input type="text" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar asesor o línea…"
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-green-400" />
        )}
        <div className="mt-1 max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
          {filtradas.length === 0 && <div className="p-3 text-xs text-slate-400 text-center">No hay líneas conectadas.</div>}
          {filtradas.map(l => (
            <label key={l.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
              <input type={multi ? "checkbox" : "radio"} name="linea-campana" checked={seleccion.has(String(l.id))}
                onChange={() => alternar(l.id)} className="accent-green-600" />
              <span className="truncate text-slate-800">{l.name}</span>
              {l.owner_username && <span className="ml-auto text-xs text-slate-400">{l.owner_username}</span>}
            </label>
          ))}
        </div>
        {multi && seleccion.size > 1 && (
          <p className="text-xs text-slate-500 mt-1">
            {seleccion.size} líneas: envía un mensaje desde cada una y repite la ronda, con los mismos tiempos y lotes de la campaña.
          </p>
        )}
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Responsable del lead</label>
        <div className="mt-1 grid gap-2">
          {MODOS_RESPONSABLE.map(m => (
            <button type="button" key={m.id} onClick={() => onModo(m.id)}
              className={`text-left border rounded-lg px-3 py-2 transition-colors ${modo === m.id
                ? "border-green-500 bg-green-50" : "border-slate-200 hover:border-slate-300"}`}>
              <div className="text-sm font-medium text-slate-800">{m.titulo}</div>
              <div className="text-xs text-slate-500">{m.detalle}</div>
            </button>
          ))}
        </div>
        {modo !== "libre" && (
          <p className="text-xs text-amber-700 mt-1">
            Usa el responsable de Bitrix de cada contacto. Si no se puede cumplir la regla, el contacto se salta y queda marcado.
          </p>
        )}
      </div>
    </div>
  );
}
