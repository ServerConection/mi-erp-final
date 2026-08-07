/**
 * TABLA KPI COMERCIAL — NOVONET
 *
 * Estructura definida por gerencia (Excel dato.xlsx): cada indicador con su
 * Pto (meta) y su Real. Se usa dos veces: nivel Supervisor y nivel Asesor
 * (este último agrupado por supervisor).
 *
 * Consume: GET /api/kpi-comercial?fechaDesde=&fechaHasta=
 *
 * Semáforo:
 *   verde  = cumple o supera la meta
 *   ámbar  = entre 80% y 100% de la meta
 *   rojo   = por debajo del 80%
 * En Descarte % es al revés (menos es mejor).
 */

import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

// ── Definición de columnas ───────────────────────────────────────────────────
// tipo: 'num' entero | 'pct' porcentaje | 'calc' solo real (sin meta)
// invertido: true → menos es mejor (Descarte)
const COLUMNAS = [
  { grupo: 'N Leads Total',        campo: 'leads_total',       meta: 'meta_leads_total',       tipo: 'num' },
  { grupo: 'N Leads Gestion.',     campo: 'leads_gestion',     meta: 'meta_leads_gestion',     tipo: 'num' },
  { grupo: '% Gest. vs Totales',   campo: 'pct_gestion_vs_total', meta: null,                  tipo: 'calc' },
  { grupo: 'Efect. vs Leads Tot.', campo: 'pct_efect_vs_leads',   meta: 'meta_pct_efect_leads',   tipo: 'pct' },
  { grupo: 'Efect. vs Gestion.',   campo: 'pct_efect_vs_gestion', meta: 'meta_pct_efect_gestion', tipo: 'pct' },
  { grupo: 'Descarte %',           campo: 'pct_descarte',      meta: 'meta_pct_descarte',      tipo: 'pct', invertido: true },
  { grupo: 'Ingresos CRM',         campo: 'ingresos_crm',      meta: null,                     tipo: 'calc' },
  { grupo: 'Ingresos Tot. Jot',    campo: 'ingresos_jot',      meta: 'meta_ingresos_jot',      tipo: 'num' },
  { grupo: 'Activa Mes',           campo: 'activa_mes',        meta: null,                     tipo: 'calc' },
  { grupo: 'Activas Back.',        campo: 'activas_backlog',   meta: null,                     tipo: 'calc' },
  { grupo: 'Activas Totales',      campo: 'activas_totales',   meta: 'meta_activas_totales',   tipo: 'num' },
  { grupo: 'Tasa Activación',      campo: 'pct_tasa_activacion', meta: 'meta_pct_tasa_activacion', tipo: 'pct' },
  { grupo: 'Tarjeta %',            campo: 'pct_tarjeta',       meta: 'meta_pct_tarjeta',       tipo: 'pct' },
  { grupo: '% 3ra Edad',           campo: 'pct_tercera_edad',  meta: 'meta_pct_tercera_edad',  tipo: 'pct' },
  { grupo: '% Planes 150/200',     campo: 'pct_planes_150_200', meta: 'meta_pct_planes',       tipo: 'pct' },
  { grupo: 'Por Regularizar',      campo: 'por_regularizar',   meta: null,                     tipo: 'calc' },
];

const n = (v) => Number(v || 0);

// Las metas de porcentaje vienen 0-1 desde la BD; los reales vienen 0-100
const metaMostrada = (col, fila) => {
  if (!col.meta) return null;
  const v = n(fila[col.meta]);
  return col.tipo === 'pct' ? v * 100 : v;
};

const fmt = (col, v) => {
  if (v === null || v === undefined) return '—';
  return col.tipo === 'pct' || col.tipo === 'calc' && String(col.campo).startsWith('pct')
    ? `${Number(v).toFixed(1)}%`
    : Math.round(Number(v)).toLocaleString('es-EC');
};

const colorSemaforo = (col, real, meta) => {
  if (meta === null || meta === 0) return 'text-slate-700';
  const ratio = n(real) / n(meta);
  if (col.invertido) {
    if (ratio <= 1)   return 'text-emerald-600';
    if (ratio <= 1.2) return 'text-amber-600';
    return 'text-rose-600';
  }
  if (ratio >= 1)   return 'text-emerald-600';
  if (ratio >= 0.8) return 'text-amber-600';
  return 'text-rose-600';
};

// ─────────────────────────────────────────────────────────────────────────────
export default function TablaKpiComercial({ titulo, filas = [], total = null, agrupado = false }) {
  const [abiertos, setAbiertos] = useState({});

  const grupos = useMemo(() => {
    if (!agrupado) return null;
    const m = {};
    for (const f of filas) {
      const k = f.supervisor || 'SIN ASIGNAR';
      (m[k] = m[k] || []).push(f);
    }
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filas, agrupado]);

  const exportarExcel = () => {
    const plano = (f) => {
      const o = { NOMBRE: f.nombre || f.asesor_display || '' };
      if (agrupado) o.SUPERVISOR = f.supervisor || '';
      for (const c of COLUMNAS) {
        const m = metaMostrada(c, f);
        if (m !== null) o[`${c.grupo} (Pto)`] = Number(m.toFixed(2));
        o[`${c.grupo} (Real)`] = Number(n(f[c.campo]).toFixed(2));
      }
      return o;
    };
    const datos = [...(total ? [plano({ ...total, nombre: 'TOTAL NOVONET' })] : []), ...filas.map(plano)];
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, titulo.slice(0, 30));
    XLSX.writeFile(wb, `${titulo.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const celdas = (f, destacado = false) => COLUMNAS.flatMap((c) => {
    const real = n(f[c.campo]);
    const meta = metaMostrada(c, f);
    const base = `text-center px-2 py-1.5 whitespace-nowrap tabular-nums ${destacado ? 'font-black' : 'font-semibold'}`;
    const out = [];
    if (meta !== null) {
      out.push(
        <td key={`${c.campo}-pto`} className={`${base} text-slate-400 bg-slate-50/60 border-r border-slate-100`}>
          {fmt(c, meta)}
        </td>
      );
    }
    out.push(
      <td key={`${c.campo}-real`} className={`${base} ${colorSemaforo(c, real, meta)} border-r border-slate-200`}>
        {fmt(c, real)}
      </td>
    );
    return out;
  });

  const filaTotal = total && (
    <tr className="bg-slate-800 text-white border-b-2 border-slate-900">
      <td className="px-3 py-2 sticky left-0 bg-slate-800 z-20 font-black text-[9px] whitespace-nowrap">
        TOTAL NOVONET
      </td>
      {COLUMNAS.flatMap((c) => {
        const real = n(total[c.campo]);
        const meta = metaMostrada(c, total);
        const out = [];
        if (meta !== null) out.push(<td key={`t-${c.campo}-p`} className="text-center px-2 py-2 text-slate-400 font-bold tabular-nums">{fmt(c, meta)}</td>);
        out.push(<td key={`t-${c.campo}-r`} className="text-center px-2 py-2 font-black tabular-nums border-r border-slate-700">{fmt(c, real)}</td>);
        return out;
      })}
    </tr>
  );

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
        <h3 className="text-[11px] font-black uppercase tracking-wide text-slate-700">
          <span className="text-blue-500 mr-2">●</span>{titulo}
          <span className="ml-2 text-slate-400 font-bold normal-case">({filas.length} registros)</span>
        </h3>
        <button
          onClick={exportarExcel}
          className="bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-black uppercase px-4 py-2 rounded-lg shadow transition-all active:scale-95"
        >
          ⬇ Excel
        </button>
      </div>

      <div className="overflow-x-auto max-h-[600px]">
        <table className="w-full text-[9px] border-collapse">
          <thead className="sticky top-0 z-30">
            {/* Fila 1: nombre del indicador */}
            <tr className="bg-slate-100 text-slate-700 font-black uppercase">
              <th rowSpan={2} className="px-3 py-2 text-left sticky left-0 bg-slate-100 z-40 border-r border-slate-300 min-w-[170px]">
                Entidad
              </th>
              {COLUMNAS.map((c) => (
                <th key={c.grupo} colSpan={c.meta ? 2 : 1}
                    className="px-2 py-2 text-center border-r border-slate-300 border-b border-slate-200">
                  {c.grupo}
                </th>
              ))}
            </tr>
            {/* Fila 2: Pto / Real */}
            <tr className="bg-slate-50 text-slate-500 font-bold uppercase">
              {COLUMNAS.flatMap((c) => {
                const out = [];
                if (c.meta) out.push(<th key={`${c.campo}-hp`} className="px-2 py-1 text-center border-r border-slate-100">Pto</th>);
                out.push(<th key={`${c.campo}-hr`} className="px-2 py-1 text-center border-r border-slate-300">Real</th>);
                return out;
              })}
            </tr>
          </thead>

          <tbody>
            {filaTotal}

            {!agrupado && filas.map((f, i) => (
              <tr key={f.nombre || i} className={`border-b border-slate-100 ${i % 2 ? 'bg-slate-50/40' : 'bg-white'} hover:bg-blue-50/50`}>
                <td className={`px-3 py-1.5 font-black text-slate-700 sticky left-0 z-10 border-r border-slate-200 whitespace-nowrap ${i % 2 ? 'bg-slate-50' : 'bg-white'}`}>
                  {f.nombre}
                </td>
                {celdas(f)}
              </tr>
            ))}

            {agrupado && grupos.map(([sup, hijos]) => {
              const abierto = abiertos[sup] !== false; // abierto por defecto
              return [
                <tr key={`g-${sup}`}
                    onClick={() => setAbiertos(p => ({ ...p, [sup]: !abierto }))}
                    className="bg-blue-900 text-white cursor-pointer hover:bg-blue-800 border-b border-blue-700">
                  <td className="px-3 py-1.5 font-black sticky left-0 bg-blue-900 z-10 whitespace-nowrap">
                    {abierto ? '▾' : '▸'} {sup}
                    <span className="ml-2 font-bold text-blue-200">({hijos.length})</span>
                  </td>
                  <td colSpan={COLUMNAS.reduce((s, c) => s + (c.meta ? 2 : 1), 0)}
                      className="px-3 py-1.5 text-blue-200 font-bold">
                    Leads: {hijos.reduce((s, h) => s + n(h.leads_total), 0).toLocaleString('es-EC')}
                    {'  ·  '}Gestionables: {hijos.reduce((s, h) => s + n(h.leads_gestion), 0).toLocaleString('es-EC')}
                    {'  ·  '}Ingresos CRM: {hijos.reduce((s, h) => s + n(h.ingresos_crm), 0).toLocaleString('es-EC')}
                  </td>
                </tr>,
                ...(abierto ? hijos.map((f, i) => (
                  <tr key={`${sup}-${f.nombre || i}`} className={`border-b border-slate-100 ${i % 2 ? 'bg-slate-50/40' : 'bg-white'} hover:bg-blue-50/50`}>
                    <td className={`px-3 py-1.5 pl-7 font-bold text-slate-600 sticky left-0 z-10 border-r border-slate-200 whitespace-nowrap ${i % 2 ? 'bg-slate-50' : 'bg-white'}`}>
                      ↳ {f.nombre}
                    </td>
                    {celdas(f)}
                  </tr>
                )) : []),
              ];
            })}

            {!filas.length && (
              <tr><td colSpan={99} className="text-center py-8 text-slate-400 font-bold">Sin datos en el rango seleccionado</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
