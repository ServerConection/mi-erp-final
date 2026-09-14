import { useState } from "react";
import { localDate } from "../utils/waCreationDate";

export default function WaCreationDateFilter({ value, onChange }) {
  const [draft, setDraft] = useState(value);
  const invalid = Boolean(draft.desde && draft.hasta && draft.desde > draft.hasta);
  const pending = draft.desde !== value.desde || draft.hasta !== value.hasta;
  const apply = (range) => { setDraft(range); onChange(range); };
  const quickDay = (offset) => {
    const day = new Date();
    day.setDate(day.getDate() + offset);
    const fecha = localDate(day);
    apply({ desde: fecha, hasta: fecha });
  };
  const buttonClass = "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-600 hover:border-green-400";

  return (
    <div className="mb-4">
      <fieldset className="flex flex-wrap items-end gap-2">
        <legend className="text-sm font-medium text-slate-600 mb-2">Fecha de creación</legend>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Desde
          <input type="date" value={draft.desde} max={draft.hasta || undefined}
            onChange={e => setDraft(d => ({ ...d, desde: e.target.value }))} className={buttonClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Hasta
          <input type="date" value={draft.hasta} min={draft.desde || undefined}
            onChange={e => setDraft(d => ({ ...d, hasta: e.target.value }))} className={buttonClass} />
        </label>
        <button type="button" disabled={invalid} onClick={() => apply({ ...draft })}
          className="rounded-lg px-4 py-2 text-sm bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">Consultar</button>
        <button type="button" onClick={() => quickDay(0)} className={buttonClass}>Hoy</button>
        <button type="button" onClick={() => quickDay(-1)} className={buttonClass}>Ayer</button>
        <button type="button" onClick={() => apply({ desde: "", hasta: "" })} className={buttonClass}>Todas las fechas</button>
      </fieldset>
      {invalid && <p role="alert" className="text-sm text-red-600 mt-2">Desde no puede ser posterior a Hasta.</p>}
      {pending && !invalid && <p className="text-xs text-slate-500 mt-2">Pulsa «Consultar» para aplicar las fechas seleccionadas.</p>}
    </div>
  );
}
