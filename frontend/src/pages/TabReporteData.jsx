// TabReporteData.jsx
// Importar en Redes.jsx:  import TabReporteData from './TabReporteData';
// Usar en Redes.jsx:      {tab === "reporte" && <TabReporteData />}
// Agregar en TABS:        { id: "reporte", label: "Reporte Data", icon: "📑" }

import { useEffect, useState, useCallback } from "react";
import * as XLSX from "xlsx";

// ── Paleta (misma que Redes.jsx) ─────────────────────────────────────────────
const C = {
  primary: "#1e40af", success: "#059669", warning: "#d97706",
  danger:  "#dc2626", violet:  "#7c3aed", cyan:    "#0891b2",
  slate:   "#475569", muted:   "#64748b",
};
const CANAL_COLORS = [C.primary, C.success, C.warning, C.violet, C.cyan, C.danger];
const API = import.meta.env.VITE_API_URL;

const n  = (v) => Number(v  || 0);
const p2 = (v) => n(v).toFixed(2);
const p1 = (v) => n(v).toFixed(1);
const pct = (num, den) => den > 0 ? ((n(num) / n(den)) * 100).toFixed(1) : "—";
const usd = (v) => v !== null && v !== undefined && !isNaN(v) ? `$${n(v).toFixed(2)}` : "—";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// ── Átomos UI ────────────────────────────────────────────────────────────────
function Block({ title, accent = C.primary, children, id }) {
  return (
    <div id={id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
        <div className="w-1 h-7 rounded-full" style={{ background: accent }} />
        <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: accent }}>{title}</span>
      </div>
      <div className="overflow-auto">{children}</div>
    </div>
  );
}

// Tabla con filas = métricas, columnas = días 1..31 + TOTAL
function TablaHorizontal({ filas, dias, accent = C.primary }) {
  if (!filas || filas.length === 0)
    return <p className="p-4 text-[9px] text-slate-400 italic">Sin datos</p>;

  return (
    <table className="text-[8px] font-mono border-collapse w-full whitespace-nowrap">
      <thead className="sticky top-0 z-10 bg-slate-50 border-b-2 border-slate-200">
        <tr>
          <th className="px-3 py-2 text-left font-black text-slate-600 border-r border-slate-200 min-w-[160px] sticky left-0 bg-slate-50">
            MÉTRICA
          </th>
          {dias.map(d => (
            <th key={d.dia} className="px-2 py-2 text-center font-black border-r border-slate-100 min-w-[38px]"
              style={{ color: accent }}>
              {d.dia}<br /><span className="font-medium text-slate-400">{d.nombre}</span>
            </th>
          ))}
          <th className="px-3 py-2 text-center font-black border-l border-slate-300 min-w-[60px]"
            style={{ color: accent }}>TOTAL</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((fila, fi) => (
          <tr key={fi} className={`border-b border-slate-100 hover:bg-slate-50 ${fila.separador ? "bg-slate-100" : ""}`}>
            <td className={`px-3 py-1.5 font-black text-[8px] border-r border-slate-200 sticky left-0 ${fila.separador ? "bg-slate-100 text-slate-500" : "bg-white text-slate-700"}`}>
              {fila.label}
            </td>
            {dias.map(d => {
              const val = fila.byDia?.[d.dia];
              const display = fila.fmt ? fila.fmt(val) : (val !== undefined && val !== null ? String(n(val)) : "—");
              return (
                <td key={d.dia} className="px-2 py-1.5 text-center border-r border-slate-100"
                  style={{ color: fila.color || C.slate }}>
                  {display}
                </td>
              );
            })}
            <td className="px-3 py-1.5 text-center font-black border-l border-slate-200"
              style={{ color: fila.color || C.slate }}>
              {fila.total !== undefined && fila.total !== null
                ? (fila.fmt ? fila.fmt(fila.total) : String(n(fila.total)))
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Helpers para construir byDia ──────────────────────────────────────────────
function byDiaMap(rows, diaKey, valueKey) {
  const map = {};
  rows.forEach(r => { map[r[diaKey]] = n(r[valueKey]); });
  return map;
}

function totalFromMap(map) {
  return Object.values(map).reduce((a, b) => a + b, 0);
}

function pctDiaMap(numMap, denMap) {
  const map = {};
  Object.keys(numMap).forEach(d => {
    map[d] = denMap[d] > 0 ? (numMap[d] / denMap[d]) * 100 : null;
  });
  return map;
}

function divDiaMap(numMap, denMap) {
  const map = {};
  Object.keys(numMap).forEach(d => {
    map[d] = denMap[d] > 0 ? numMap[d] / denMap[d] : null;
  });
  return map;
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
export default function TabReporteData() {
  const hoy   = new Date();
  const [anio, setAnio]         = useState(hoy.getFullYear());
  const [mes,  setMes]          = useState(hoy.getMonth() + 1);
  const [origenes, setOrigenes] = useState([]);
  const [origenesDisp, setOrigenesDisp] = useState([]);
  const [data,    setData]      = useState(null);
  const [loading, setLoading]   = useState(false);

  const toggleOrigen = (o) =>
    setOrigenes(prev => prev.includes(o) ? prev.filter(x => x !== o) : [...prev, o]);

  // Cargar orígenes disponibles al montar o cambiar mes/año
  useEffect(() => {
    const desde = `${anio}-${String(mes).padStart(2,'0')}-01`;
    const hasta = `${anio}-${String(mes).padStart(2,'0')}-31`;
    fetch(`${API}/api/redes/reporte-data?anio=${anio}&mes=${mes}`)
      .then(r => r.json())
      .then(d => { if (d.success) setOrigenesDisp(d.origenes_disponibles || []); })
      .catch(() => {});
  }, [anio, mes]);

  const handleCargar = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ anio, mes, origenes: origenes.join(',') });
    fetch(`${API}/api/redes/reporte-data?${params}`)
      .then(r => r.json())
      .then(d => { if (d.success) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [anio, mes, origenes]);

  // ── Exportar a Excel ────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    const dias = data.meta.dias;

    const addSheet = (nombre, filas) => {
      const header = ['MÉTRICA', ...dias.map(d => `${d.dia}/${d.nombre}`), 'TOTAL'];
      const rows   = filas.map(f => {
        const row = [f.label];
        dias.forEach(d => {
          const val = f.byDia?.[d.dia];
          row.push(f.fmt ? f.fmt(val) : (val !== undefined ? n(val) : ''));
        });
        row.push(f.total !== undefined ? (f.fmt ? f.fmt(f.total) : n(f.total)) : '');
        return row;
      });
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      ws['!cols'] = [{ wch: 28 }, ...dias.map(() => ({ wch: 8 })), { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 31));
    };

    if (data.inversion?.length)  addSheet('Inversión-Costos',   buildInversionFilas(data, dias));
    if (data.etapas?.length)     addSheet('Leads-Etapas',        buildEtapasFilas(data, dias));
    if (data.status_jot?.length) addSheet('Estatus JOT',         buildJotFilas(data, dias));
    if (data.pago?.length)       addSheet('Forma de Pago',       buildPagoFilas(data, dias));
    if (data.ciclo?.length)      addSheet('Ciclo Venta',         buildCicloFilas(data, dias));
    if (data.hora?.length)       addSheet('Leads por Hora',      buildHoraFilas(data));
    if (data.atc_totales?.length) addSheet('Motivos ATC',        buildAtcFilas(data));
    if (data.ciudad?.length)     addSheet('Ciudad',              buildCiudadFilas(data));

    XLSX.writeFile(wb, `ReporteData_${MESES[mes-1]}_${anio}.xlsx`);
  };

  // ── Builders de filas ──────────────────────────────────────────────────────
  const buildInversionFilas = (d, dias) => {
    if (!d.inversion) return [];
    const get = (key) => byDiaMap(d.inversion, 'dia', key);
    const inv = get('inversion_usd'), leads = get('n_leads');
    const jot = get('ingreso_jot'), bitrix = get('ingreso_bitrix');
    const activos = get('activos'), backlog = get('activo_backlog');
    const negoc = get('negociables');

    // CPL = inv / leads
    const cplMap  = divDiaMap(inv, leads);
    const cibMap  = divDiaMap(inv, bitrix);
    const cijMap  = divDiaMap(inv, jot);
    const caMap   = divDiaMap(inv, activos);
    const cabMap  = divDiaMap(inv, { ...backlog, ...Object.fromEntries(Object.keys(activos).map(k => [k, n(activos[k]) + n(backlog[k])])) });
    const cnMap   = divDiaMap(inv, negoc);

    const totInv = totalFromMap(inv);
    const totLeads = totalFromMap(leads), totJot = totalFromMap(jot);
    const totBitrix = totalFromMap(bitrix), totActivos = totalFromMap(activos);
    const totBacklog = totalFromMap(backlog), totNegoc = totalFromMap(negoc);

    return [
      { label: 'INVERSIÓN DIARIA', byDia: inv, total: totInv, fmt: usd, color: C.violet },
      { label: 'CPL', byDia: cplMap, total: totLeads > 0 ? totInv/totLeads : null, fmt: usd, color: C.primary },
      { label: 'COSTO INGRESO (BITRIX)', byDia: cibMap, total: totBitrix > 0 ? totInv/totBitrix : null, fmt: usd },
      { label: 'COSTO INGRESO (JOT)',    byDia: cijMap, total: totJot    > 0 ? totInv/totJot    : null, fmt: usd },
      { label: 'COSTO ACTIVA',           byDia: caMap,  total: totActivos > 0 ? totInv/totActivos : null, fmt: usd },
      { label: 'COSTO ACTIVA + BACKLOG', byDia: cabMap, total: (totActivos+totBacklog) > 0 ? totInv/(totActivos+totBacklog) : null, fmt: usd },
      { label: 'COSTO POR NEGOCIABLE',   byDia: cnMap,  total: totNegoc > 0 ? totInv/totNegoc : null, fmt: usd },
    ];
  };

  const buildEtapasFilas = (d, dias) => {
    if (!d.etapas) return [];
    const g = (key) => byDiaMap(d.etapas, 'dia', key);
    const leads = g('total_leads'), atc = g('atc_soporte');
    const fc = g('fuera_cobertura'), zp = g('zonas_peligrosas'), inn = g('innegociable');
    const negocMap = {};
    dias.forEach(({ dia }) => {
      negocMap[dia] = n(leads[dia]) - n(atc[dia]) - n(fc[dia]) - n(zp[dia]) - n(inn[dia]);
    });
    const pctAtc   = pctDiaMap(atc, leads);
    const pctNegoc = pctDiaMap(negocMap, leads);
    const vs = g('venta_subida');
    const efTotal  = pctDiaMap(vs, leads);
    const efNegoc  = pctDiaMap(vs, negocMap);

    const tL = totalFromMap(leads), tA = totalFromMap(atc);
    const tFC = totalFromMap(fc), tZP = totalFromMap(zp), tI = totalFromMap(inn);
    const tNeg = tL - tA - tFC - tZP - tI;
    const tVS = totalFromMap(vs);

    const etapas = [
      'seguimiento','gestion_diaria','doc_pendientes','volver_llamar',
      'mantiene_proveedor','otro_proveedor','no_volver_contactar',
      'no_interesa_costo','desiste_compra','cliente_discapacidad',
      'oportunidades','duplicado','contrato_netlife',
    ];

    const extra = etapas.map(k => {
      const m = g(k);
      return { label: k.replace(/_/g,' ').toUpperCase(), byDia: m, total: totalFromMap(m), color: C.muted };
    });

    return [
      { label: 'N LEADS',         byDia: leads,    total: tL,    color: C.primary },
      { label: 'ATC/SOPORTE',     byDia: atc,      total: tA,    color: C.danger },
      { label: 'FUERA COBERTURA', byDia: fc,       total: tFC },
      { label: 'ZONAS PELIGROSAS',byDia: zp,       total: tZP },
      { label: 'INNEGOCIABLE',    byDia: inn,       total: tI,   color: C.warning },
      { label: 'NEGOCIABLES',     byDia: negocMap,  total: tNeg, color: C.success },
      { label: 'VENTA SUBIDA',    byDia: vs,        total: tVS,  color: C.primary },
      { label: '% ATC',           byDia: pctAtc,    total: tL > 0 ? (tA/tL)*100 : null, fmt: v => v !== null ? `${n(v).toFixed(1)}%` : '—', color: C.danger },
      { label: '% NEGOCIABLE',    byDia: pctNegoc,  total: tL > 0 ? (tNeg/tL)*100 : null, fmt: v => v !== null ? `${n(v).toFixed(1)}%` : '—', color: C.success },
      { label: '% EFECTIVIDAD TOTAL', byDia: efTotal, total: tL > 0 ? (tVS/tL)*100 : null, fmt: v => v !== null ? `${n(v).toFixed(1)}%` : '—', color: C.cyan },
      { label: '% EFECT NEGOCIABLES', byDia: efNegoc, total: tNeg > 0 ? (tVS/tNeg)*100 : null, fmt: v => v !== null ? `${n(v).toFixed(1)}%` : '—', color: C.violet },
      { label: '── ETAPAS BITRIX ──', separador: true, byDia: {}, total: null },
      ...extra,
    ];
  };

  const buildJotFilas = (d, dias) => {
    if (!d.status_jot) return [];
    const g = (k) => byDiaMap(d.status_jot, 'dia', k);
    const jot = g('ingreso_jot'), bitrix = g('ingreso_bitrix');
    const act = g('activos'), bk = g('activo_backlog');
    const tvj = g('total_ventas_jot'), dsj = g('desiste_servicio_jot');
    const reg = g('regularizados'), preg = g('por_regularizar');
    return [
      { label: 'INGRESO EN BITRIX',    byDia: bitrix, total: totalFromMap(bitrix), color: C.primary },
      { label: 'INGRESO EN JOT',       byDia: jot,    total: totalFromMap(jot),    color: C.success },
      { label: 'ACTIVO + BACKLOG',     byDia: Object.fromEntries(dias.map(({dia}) => [dia, n(act[dia])+n(bk[dia])])), total: totalFromMap(act)+totalFromMap(bk) },
      { label: 'ACTIVO',               byDia: act,    total: totalFromMap(act),    color: C.success },
      { label: 'TOTAL VENTAS JOT',     byDia: tvj,    total: totalFromMap(tvj) },
      { label: 'DESISTE SERVICIO JOT', byDia: dsj,    total: totalFromMap(dsj),    color: C.danger },
      { label: 'REGULARIZADOS',        byDia: reg,    total: totalFromMap(reg),    color: C.cyan },
      { label: 'POR REGULARIZAR',      byDia: preg,   total: totalFromMap(preg),   color: C.warning },
    ];
  };

  const buildPagoFilas = (d, dias) => {
    if (!d.pago) return [];
    const g = (k) => byDiaMap(d.pago, 'dia', k);
    const pc = g('pago_cuenta'), pe = g('pago_efectivo'), pt = g('pago_tarjeta');
    const pca = g('pago_cuenta_activa'), pea = g('pago_efectivo_activa'), pta = g('pago_tarjeta_activa');
    const totIng = (dia) => n(pc[dia]) + n(pe[dia]) + n(pt[dia]);
    const totAct = (dia) => n(pca[dia]) + n(pea[dia]) + n(pta[dia]);
    const pctMap = (m, totFn) => Object.fromEntries(dias.map(({dia}) => [dia, totFn(dia) > 0 ? (n(m[dia])/totFn(dia))*100 : null]));

    const tPC = totalFromMap(pc), tPE = totalFromMap(pe), tPT = totalFromMap(pt);
    const tPCA = totalFromMap(pca), tPEA = totalFromMap(pea), tPTA = totalFromMap(pta);
    const tIngTotal = tPC + tPE + tPT, tActTotal = tPCA + tPEA + tPTA;
    const pf = v => v !== null ? `${n(v).toFixed(1)}%` : '—';

    return [
      { label: '── INGRESOS JOT ──', separador: true, byDia: {}, total: null },
      { label: 'CUENTA',    byDia: pc, total: tPC, color: C.cyan },
      { label: 'EFECTIVO',  byDia: pe, total: tPE, color: C.success },
      { label: 'TARJETA',   byDia: pt, total: tPT, color: C.primary },
      { label: '% CUENTA',  byDia: pctMap(pc, totIng), total: tIngTotal > 0 ? (tPC/tIngTotal)*100 : null, fmt: pf },
      { label: '% EFECTIVO',byDia: pctMap(pe, totIng), total: tIngTotal > 0 ? (tPE/tIngTotal)*100 : null, fmt: pf },
      { label: '% TARJETA', byDia: pctMap(pt, totIng), total: tIngTotal > 0 ? (tPT/tIngTotal)*100 : null, fmt: pf },
      { label: '── ACTIVAS ──', separador: true, byDia: {}, total: null },
      { label: 'CUENTA',    byDia: pca, total: tPCA, color: C.cyan },
      { label: 'EFECTIVO',  byDia: pea, total: tPEA, color: C.success },
      { label: 'TARJETA',   byDia: pta, total: tPTA, color: C.primary },
      { label: '% CUENTA',  byDia: pctMap(pca, totAct), total: tActTotal > 0 ? (tPCA/tActTotal)*100 : null, fmt: pf },
      { label: '% EFECTIVO',byDia: pctMap(pea, totAct), total: tActTotal > 0 ? (tPEA/tActTotal)*100 : null, fmt: pf },
      { label: '% TARJETA', byDia: pctMap(pta, totAct), total: tActTotal > 0 ? (tPTA/tActTotal)*100 : null, fmt: pf },
    ];
  };

  const buildCicloFilas = (d, dias) => {
    if (!d.ciclo) return [];
    const g = (k) => byDiaMap(d.ciclo, 'dia', k);
    const keys = ['ciclo_0','ciclo_1','ciclo_2','ciclo_3','ciclo_4','ciclo_mas5'];
    const labels = ['0 DÍAS','1 DÍA','2 DÍAS','3 DÍAS','4 DÍAS','MÁS DE 5 DÍAS'];
    const colors = [C.success, C.cyan, C.primary, C.warning, C.danger, C.violet];
    const maps = keys.map(k => g(k));
    const totales = maps.map(m => totalFromMap(m));
    const totTotal = totales.reduce((a,b) => a+b, 0);
    const totalMap = Object.fromEntries(dias.map(({dia}) => [dia, keys.reduce((s,k,i) => s + n(maps[i][dia]), 0)]));

    return [
      ...labels.map((lbl, i) => ({ label: lbl, byDia: maps[i], total: totales[i], color: colors[i] })),
      { label: 'TOTAL', byDia: totalMap, total: totTotal, color: C.primary },
      ...labels.map((lbl, i) => ({
        label: `% ${lbl}`,
        byDia: pctDiaMap(maps[i], totalMap),
        total: totTotal > 0 ? (totales[i]/totTotal)*100 : null,
        fmt: v => v !== null ? `${n(v).toFixed(1)}%` : '—',
      })),
    ];
  };

  const buildHoraFilas = (d) => {
    if (!d.hora) return [];
    return d.hora.map(h => ({
      hora: h.hora, n_leads: n(h.n_leads), atc: n(h.atc), pct_atc: n(h.pct_atc),
    }));
  };

  const buildAtcFilas = (d) => {
    if (!d.atc_totales) return [];
    const total = d.atc_totales.reduce((s,r) => s + n(r.cantidad), 0);
    return d.atc_totales.map(r => ({
      motivo: r.motivo_atc, cantidad: n(r.cantidad),
      pct: total > 0 ? ((n(r.cantidad)/total)*100).toFixed(1) : '0',
    }));
  };

  const buildCiudadFilas = (d) => d.ciudad || [];

  // ─────────────────────────────────────────────────────────────────────────
  const dias = data?.meta?.dias || [];

  return (
    <div className="space-y-4">

      {/* ── FILTROS ──────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1 h-7 rounded-full" style={{ background: C.primary }} />
          <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: C.primary }}>
            Filtros — Reporte Data
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          {/* Año */}
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Año</label>
            <select value={anio} onChange={e => setAnio(Number(e.target.value))}
              className="border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-700 outline-none focus:border-blue-400 bg-white">
              {[2024,2025,2026,2027].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          {/* Mes */}
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Mes</label>
            <select value={mes} onChange={e => setMes(Number(e.target.value))}
              className="border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-700 outline-none focus:border-blue-400 bg-white">
              {MESES.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
          {/* Botones */}
          <button onClick={handleCargar}
            className="px-6 py-2 rounded-xl text-[10px] font-black uppercase text-white transition-all active:scale-95 shadow-sm"
            style={{ background: C.primary }}>
            {loading ? "Cargando..." : "Cargar Reporte"}
          </button>
          {data && (
            <button onClick={handleExport}
              className="px-6 py-2 rounded-xl text-[10px] font-black uppercase text-white transition-all active:scale-95 shadow-sm flex items-center gap-2"
              style={{ background: C.success }}>
              ⬇ Exportar Excel
            </button>
          )}
        </div>

        {/* Orígenes */}
        {origenesDisp.length > 0 && (
          <div className="mt-4">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">
              Filtrar por Origen (sin selección = todos)
            </div>
            <div className="flex flex-wrap gap-2">
              {origenesDisp.map((o, idx) => {
                const sel = origenes.includes(o);
                const col = CANAL_COLORS[idx % CANAL_COLORS.length];
                return (
                  <button key={o} onClick={() => toggleOrigen(o)}
                    className="px-3 py-1 rounded-full text-[9px] font-black uppercase border transition-all"
                    style={sel
                      ? { background: col, color: '#fff', borderColor: col }
                      : { background: '#fff', color: C.muted, borderColor: '#e2e8f0' }}>
                    {o}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="text-center py-16 text-slate-400 text-sm font-medium">Generando reporte...</div>
      )}

      {!loading && data && (
        <>
          {/* Título del reporte */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-3 flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-lg font-black text-slate-800">
                Reporte Data — {MESES[data.meta.mes - 1]} {data.meta.anio}
              </div>
              <div className="text-[9px] text-slate-400 font-medium uppercase tracking-widest mt-0.5">
                NETLIFE VELSA · {origenes.length > 0 ? origenes.join(' · ') : 'Todos los orígenes'}
              </div>
            </div>
            <span className="text-[9px] font-black px-3 py-1 rounded-full"
              style={{ background: `${C.primary}12`, color: C.primary }}>
              {data.meta.dias.length} días
            </span>
          </div>

          {/* ── BLOQUE 1: INVERSIÓN Y COSTOS ─────────────────────────────────── */}
          <Block title="Inversión & Costos" accent={C.violet} id="bloque-inversion">
            <TablaHorizontal
              filas={buildInversionFilas(data, dias)}
              dias={dias}
              accent={C.violet}
            />
          </Block>

          {/* ── BLOQUE 2: LEADS POR ORIGEN + ETAPAS BITRIX ───────────────────── */}
          <Block title="Leads por Origen + Etapas Bitrix" accent={C.primary} id="bloque-etapas">
            <TablaHorizontal
              filas={buildEtapasFilas(data, dias)}
              dias={dias}
              accent={C.primary}
            />
          </Block>

          {/* ── BLOQUE 3: ESTATUS VENTAS JOT ─────────────────────────────────── */}
          <Block title="Estatus Ventas JOT" accent={C.success} id="bloque-jot">
            <TablaHorizontal
              filas={buildJotFilas(data, dias)}
              dias={dias}
              accent={C.success}
            />
          </Block>

          {/* ── BLOQUE 4: FORMA DE PAGO ───────────────────────────────────────── */}
          <Block title="Forma de Pago" accent={C.cyan} id="bloque-pago">
            <TablaHorizontal
              filas={buildPagoFilas(data, dias)}
              dias={dias}
              accent={C.cyan}
            />
          </Block>

          {/* ── BLOQUE 5: CICLO DE VENTA ──────────────────────────────────────── */}
          <Block title="Ciclo de Venta" accent={C.warning} id="bloque-ciclo">
            <TablaHorizontal
              filas={buildCicloFilas(data, dias)}
              dias={dias}
              accent={C.warning}
            />
          </Block>

          {/* ── BLOQUE 6: LEADS POR HORA ──────────────────────────────────────── */}
          <Block title="Leads por Hora del Día" accent={C.cyan} id="bloque-hora">
            <table className="text-[8px] font-mono border-collapse w-full whitespace-nowrap">
              <thead className="sticky top-0 bg-slate-50 border-b-2 border-slate-200">
                <tr>
                  {['HORA','LEADS','ATC','% ATC'].map(h => (
                    <th key={h} className="px-4 py-2 text-center font-black border-r border-slate-100 last:border-r-0"
                      style={{ color: C.cyan }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {buildHoraFilas(data).map((h, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-1.5 text-center font-black border-r border-slate-100" style={{ color: C.violet }}>
                      {String(h.hora).padStart(2,'0')}:00
                    </td>
                    <td className="px-4 py-1.5 text-center border-r border-slate-100">{h.n_leads}</td>
                    <td className="px-4 py-1.5 text-center border-r border-slate-100" style={{ color: C.danger }}>{h.atc}</td>
                    <td className="px-4 py-1.5 text-center font-black"
                      style={{ color: h.pct_atc > 40 ? C.danger : h.pct_atc > 20 ? C.warning : C.success }}>
                      {h.pct_atc}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Block>

          {/* ── BLOQUE 7: MOTIVOS ATC ─────────────────────────────────────────── */}
          <Block title="Motivos ATC" accent={C.danger} id="bloque-atc">
            <div className="p-4 space-y-2.5">
              {buildAtcFilas(data).map((r, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="text-[9px] font-bold text-slate-600 w-52 truncate">{r.motivo}</div>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${r.pct}%`, background: C.danger }} />
                  </div>
                  <div className="text-[9px] font-black w-10 text-right" style={{ color: C.danger }}>{r.cantidad}</div>
                  <div className="text-[9px] text-slate-400 w-10 text-right">{r.pct}%</div>
                </div>
              ))}
            </div>
          </Block>

          {/* ── BLOQUE 8: ACTIVOS E INGRESOS POR CIUDAD ──────────────────────── */}
          <Block title="Activos e Ingresos por Ciudad" accent={C.primary} id="bloque-ciudad">
            <table className="text-[8px] font-mono border-collapse w-full whitespace-nowrap">
              <thead className="sticky top-0 bg-slate-50 border-b-2 border-slate-200">
                <tr>
                  {['CIUDAD','PROVINCIA','LEADS','ACTIVOS','INGRESOS JOT','% ACTIVOS'].map(h => (
                    <th key={h} className="px-4 py-2 text-center font-black border-r border-slate-100 last:border-r-0"
                      style={{ color: C.primary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {buildCiudadFilas(data).map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-1.5 font-black border-r border-slate-100" style={{ color: C.cyan }}>{r.ciudad}</td>
                    <td className="px-4 py-1.5 text-slate-500 border-r border-slate-100">{r.provincia}</td>
                    <td className="px-4 py-1.5 text-center border-r border-slate-100">{r.total_leads}</td>
                    <td className="px-4 py-1.5 text-center font-black border-r border-slate-100" style={{ color: C.success }}>{r.activos}</td>
                    <td className="px-4 py-1.5 text-center border-r border-slate-100">{r.ingresos_jot}</td>
                    <td className="px-4 py-1.5 text-center font-black"
                      style={{ color: n(r.pct_activos) >= 10 ? C.success : n(r.pct_activos) >= 5 ? C.warning : C.danger }}>
                      {r.pct_activos}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Block>

        </>
      )}

      {!loading && !data && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="text-5xl">📑</div>
          <div className="text-sm font-black text-slate-600">Selecciona mes, año y presiona "Cargar Reporte"</div>
          <div className="text-xs text-slate-400 text-center max-w-sm leading-relaxed">
            Puedes filtrar por origen o dejar vacío para ver el consolidado de todas las campañas.
          </div>
        </div>
      )}
    </div>
  );
}