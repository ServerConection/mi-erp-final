/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Archivos Compartidos · Historial de cambios
 * ═══════════════════════════════════════════════════════════════════════════════
 * Quién cambió qué y cuándo. Lo puede ver cualquiera con acceso al archivo:
 * en una hoja compartida saber quién escribió cada dato es parte del dato.
 */

import { useEffect, useState } from 'react';
import { hojasApi } from '../../hooks/useHojas';
import { Cargando, ErrorBox, tiempoRelativo } from './ui';

const ACCION_UI = {
  CELDA_EDITADA:     { texto: 'editó',       clase: 'bg-blue-50 text-blue-700' },
  FILA_CREADA:       { texto: 'agregó fila', clase: 'bg-emerald-50 text-emerald-700' },
  FILA_ELIMINADA:    { texto: 'borró fila',  clase: 'bg-rose-50 text-rose-700' },
  COLUMNA_CREADA:    { texto: 'creó columna',    clase: 'bg-violet-50 text-violet-700' },
  COLUMNA_EDITADA:   { texto: 'cambió columna',  clase: 'bg-violet-50 text-violet-700' },
  COLUMNA_ELIMINADA: { texto: 'borró columna',   clase: 'bg-rose-50 text-rose-700' },
  HOJA_CREADA:       { texto: 'creó el archivo', clase: 'bg-slate-100 text-slate-700' },
  HOJA_EDITADA:      { texto: 'renombró',        clase: 'bg-slate-100 text-slate-700' },
  PERMISO_OTORGADO:  { texto: 'dio acceso',      clase: 'bg-amber-50 text-amber-700' },
  PERMISO_REVOCADO:  { texto: 'quitó acceso',    clase: 'bg-amber-50 text-amber-700' },
  IMPORTACION:       { texto: 'importó',         clase: 'bg-cyan-50 text-cyan-700' },
};

export default function HistorialPanel({ hojaId }) {
  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState(null);

  useEffect(() => {
    let vivo = true;

    (async () => {
      setCargando(true);
      try {
        const r = await hojasApi.historial(hojaId);
        if (vivo) setRegistros(r.data);
      } catch (e) {
        if (vivo) setError(e.message);
      } finally {
        if (vivo) setCargando(false);
      }
    })();

    return () => { vivo = false; };
  }, [hojaId]);

  if (cargando) return <Cargando texto="Cargando historial…" />;
  if (error)    return <ErrorBox error={error} />;
  if (registros.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">Todavía no hay movimientos.</p>;
  }

  return (
    <div className="space-y-1">
      {registros.map(r => {
        const ui = ACCION_UI[r.accion] || { texto: r.accion, clase: 'bg-slate-100 text-slate-600' };
        return (
          <div key={r.id} className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-slate-50">
            <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ui.clase}`}>
              {ui.texto}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-700">
                <span className="font-medium">{r.usuario}</span>
                {r.columna && <span className="text-slate-500"> · {r.columna}</span>}
              </p>

              {r.accion === 'CELDA_EDITADA' && (
                <p className="truncate text-xs text-slate-500">
                  <span className="text-slate-400 line-through">{r.valorAnterior || '(vacío)'}</span>
                  {' → '}
                  <span className="text-slate-700">{r.valorNuevo || '(vacío)'}</span>
                </p>
              )}

              {r.accion !== 'CELDA_EDITADA' && r.valorNuevo && (
                <p className="truncate text-xs text-slate-500">{r.valorNuevo}</p>
              )}
            </div>

            <span className="shrink-0 text-[11px] text-slate-400">{tiempoRelativo(r.fecha)}</span>
          </div>
        );
      })}
    </div>
  );
}
