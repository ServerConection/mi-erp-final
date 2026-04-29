// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  TabReporteData.jsx                                                      ║
// ║  Filtro por CANAL de publicidad (no por origen individual)               ║
// ║  Al seleccionar canal se muestran sus líneas en panel lateral            ║
// ║  La inversión se asigna UNA VEZ por canal (no se multiplica por líneas)  ║
// ╚══════════════════════════════════════════════════════════════════════════╝
import { useEffect, useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

const C = {
  primary:  "#2563eb",
  sky:      "#38bdf8",
  success:  "#16a34a",
  warning:  "#d97706",
  danger:   "#dc2626",
  violet:   "#7c3aed",
  cyan:     "#0891b2",
  slate:    "#475569",
  muted:    "#94a3b8",
  light:    "#f8fafc",
  border:   "#e2e8f0",
  bgPage:   "#f1f5f9",
  bgHeader: "#eff6ff",
};

// ── Identidad visual por grupo ────────────────────────────────────────────────
const CANAL_CFG = {
  "ARTS":              { color: "#2563eb", bg: "#eff6ff",  icon: "🎨", label: "ARTS" },
  "ARTS FACEBOOK":     { color: "#1877f2", bg: "#eff6ff",  icon: "📘", label: "ARTS FB" },
  "ARTS GOOGLE":       { color: "#dc2626", bg: "#fef2f2",  icon: "🔍", label: "ARTS GG" },
  "REMARKETING":       { color: "#7c3aed", bg: "#f5f3ff",  icon: "🔁", label: "REMARKETING" },
  "VIDIKA GOOGLE":     { color: "#16a34a", bg: "#f0fdf4",  icon: "📺", label: "VIDIKA GG" },
  "POR RECOMENDACIÓN": { color: "#d97706", bg: "#fffbeb",  icon: "🤝", label: "RECOMEND." },
};
const getCfg = (canal) => CANAL_CFG[canal] || { color: C.muted, bg: "#f8fafc", icon: "•", label: canal };

const API   = import.meta.env.VITE_API_URL;
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────────────────────
const n   = (v) => Number(v || 0);
const usd = (v) => (v !== null && v !== undefined && !isNaN(n(v)) && n(v) !== 0) ? `$${n(v).toFixed(2)}` : "—";
const pf  = (v) => (v !== null && v !== undefined && !isNaN(n(v))) ? `${n(v).toFixed(1)}%` : "—";

function fmtCantPct(cant, pct) {
  if (cant === undefined || cant === null) return "—";
  const c = n(cant);
  if (c === 0) return "—";
  if (pct !== null && pct !== undefined && !isNaN(n(pct))) return `${c} (${n(pct).toFixed(1)}%)`;
  return String(c);
}

function byDiaMap(rows, diaKey, valueKey) {
  const map = {};
  rows.forEach((r) => { map[Number(r[diaKey])] = n(r[valueKey]); });
  return map;
}
function totalFromMap(map) {
  return Object.values(map).reduce((a, b) => a + n(b), 0);
}
function divDiaMap(numMap, denMap) {
  const map = {};
  Object.keys({ ...numMap, ...denMap }).forEach((d) => {
    map[d] = n(denMap[d]) > 0 ? n(numMap[d]) / n(denMap[d]) : null;
  });
  return map;
}
function pctDiaMap(numMap, denMap) {
  const map = {};
  Object.keys({ ...numMap, ...denMap }).forEach((d) => {
    map[d] = n(denMap[d]) > 0 ? (n(numMap[d]) / n(denMap[d])) * 100 : null;
  });
  return map;
}
function addMaps(...maps) {
  const result = {};
  maps.forEach((m) => Object.keys(m || {}).forEach((k) => { result[k] = n(result[k]) + n(m[k]); }));
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI ATOMS
// ─────────────────────────────────────────────────────────────────────────────
function Block({ title, accent = C.primary, children, id }) {
  return (
    <div id={id} className="bg-white rounded-xl border shadow-sm overflow-hidden mb-5" style={{ borderColor: C.border }}>
      <div className="px-5 py-3 border-b flex items-center gap-3" style={{ background: C.bgHeader, borderColor: C.border }}>
        <div className="w-1 h-5 rounded-full" style={{ background: accent }} />
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: accent }}>{title}</span>
      </div>
      <div className="overflow-auto">{children}</div>
    </div>
  );
}

function TablaHorizontal({ filas, dias, accent = C.primary }) {
  if (!filas || filas.length === 0) return <p className="p-4 text-[9px] italic" style={{ color: C.muted }}>Sin datos</p>;
  return (
    <table className="text-[8px] font-mono border-collapse w-full whitespace-nowrap">
      <thead className="sticky top-0 z-10 border-b-2" style={{ background: C.bgHeader, borderColor: C.border }}>
        <tr>
          <th className="px-3 py-2 text-left font-black border-r min-w-[260px] sticky left-0"
            style={{ background: C.bgHeader, color: C.slate, borderColor: C.border }}>MÉTRICA</th>
          {dias.map((d) => (
            <th key={d.dia} className="px-2 py-2 text-center font-black border-r min-w-[52px]"
              style={{ color: accent, borderColor: C.border }}>
              {d.dia}<br /><span className="font-medium" style={{ color: C.muted }}>{d.nombre}</span>
            </th>
          ))}
          <th className="px-3 py-2 text-center font-black border-l min-w-[72px]" style={{ color: accent, borderColor: C.border }}>TOTAL</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((fila, fi) => (
          <tr key={fi} className={`border-b transition-colors ${fila.separador ? "" : "hover:bg-blue-50/30"}`}
            style={{ borderColor: C.border, background: fila.separador ? "#f8fafc" : "white" }}>
            <td className="px-3 py-1.5 font-black text-[8px] border-r sticky left-0"
              style={{ background: fila.separador ? "#f8fafc" : "white", color: fila.separador ? C.muted : C.slate, borderColor: C.border }}>
              {fila.label}
            </td>
            {dias.map((d) => {
              const val = fila.byDia?.[Number(d.dia)];
              const pct = fila.pctDia?.[Number(d.dia)];
              let display = "";
              if (!fila.separador) {
                if (fila.fmt)          display = fila.fmt(val);
                else if (fila.showPct) display = fmtCantPct(val, pct);
                else display = (val !== undefined && val !== null && n(val) !== 0) ? String(n(val)) : "—";
              }
              return (
                <td key={d.dia} className="px-2 py-1.5 text-center border-r" style={{ color: fila.color || C.muted, borderColor: C.border }}>
                  {display}
                </td>
              );
            })}
            <td className="px-3 py-1.5 text-center font-black border-l" style={{ color: fila.color || C.muted, borderColor: C.border }}>
              {fila.separador ? "" :
                fila.fmt ? fila.fmt(fila.total) :
                fila.showPct ? fmtCantPct(fila.total, fila.totalPct) :
                fila.total !== null && fila.total !== undefined
                  ? String(n(fila.total) % 1 !== 0 ? n(fila.total).toFixed(2) : n(fila.total))
                  : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOQUE 1 — Inversión & Costos
// ─────────────────────────────────────────────────────────────────────────────
function buildInversionFilas(d, dias) {
  if (!d.inversion || d.inversion.length === 0) return [];
  const g = (key) => byDiaMap(d.inversion, "dia", key);

  const inv          = g("inversion_usd");
  const leads        = g("n_leads");
  // FIX COSTO INGRESO BITRIX: se usa venta_subida (leads con etapa VENTA SUBIDA
  // en Bitrix) como denominador en lugar de ingreso_bitrix que siempre era 0
  // por el JOIN roto entre filas JOT y Bitrix en mestra_bitrix.
  const ventaSubida  = g("venta_subida");
  const jotMes       = g("ingreso_jot");
  const activosMes   = g("activos_mes");
  const backlog      = g("activo_backlog");
  const negoc        = g("negociables");
  const preplaneados = g("preplaneados");
  const asignados    = g("asignados");
  const preservicio  = g("preservicio");

  const actPlanAsig        = addMaps(activosMes,  preplaneados, asignados);
  const actPlanAsigPre     = addMaps(activosMes,  preplaneados, asignados, preservicio);
  const actBackPlanAsigPre = addMaps(backlog,      preplaneados, asignados, preservicio);

  const tInv         = totalFromMap(inv);
  const tLeads       = totalFromMap(leads);
  const tVentaSubida = totalFromMap(ventaSubida);
  const tJot         = totalFromMap(jotMes);
  const tAct         = totalFromMap(activosMes);
  const tBack        = totalFromMap(backlog);
  const tNegoc       = totalFromMap(negoc);
  const tAPA         = totalFromMap(actPlanAsig);
  const tAPAPre      = totalFromMap(actPlanAsigPre);
  const tABAll       = totalFromMap(actBackPlanAsigPre);

  return [
    { label: "INVERSIÓN DIARIA",                                                          byDia: inv,                           total: tInv,                                            fmt: usd, color: C.violet  },
    { label: "CPL  (inv ÷ leads totales Bitrix)",                                         byDia: divDiaMap(inv, leads),         total: tLeads       > 0 ? tInv / tLeads       : null,   fmt: usd, color: C.primary },
    { label: "COSTO INGRESO BITRIX  (inv ÷ ventas subidas Bitrix)",                       byDia: divDiaMap(inv, ventaSubida),   total: tVentaSubida > 0 ? tInv / tVentaSubida : null,   fmt: usd, color: C.cyan    },
    { label: "COSTO INGRESO JOT  (inv ÷ ingresos JOT mismo mes)",                        byDia: divDiaMap(inv, jotMes),        total: tJot         > 0 ? tInv / tJot         : null,   fmt: usd, color: C.cyan    },
    { label: "COSTO ACTIVA  (inv ÷ activos mes con fecha activación)",                    byDia: divDiaMap(inv, activosMes),    total: tAct         > 0 ? tInv / tAct         : null,   fmt: usd, color: C.success },
    { label: "COSTO ACTIVA + BACKLOG  (inv ÷ activos cualquier fecha)",                   byDia: divDiaMap(inv, backlog),       total: tBack        > 0 ? tInv / tBack        : null,   fmt: usd, color: C.success },
    { label: "COSTO ACT+PLAN+ASIG  (inv ÷ activos+preplaneados+asignados)",               byDia: divDiaMap(inv, actPlanAsig),   total: tAPA         > 0 ? tInv / tAPA         : null,   fmt: usd, color: C.warning },
    { label: "COSTO ACT+PLAN+ASIG+PRE  (inv ÷ activos+plan+asig+preservicio)",            byDia: divDiaMap(inv, actPlanAsigPre), total: tAPAPre     > 0 ? tInv / tAPAPre     : null,   fmt: usd, color: C.warning },
    { label: "COSTO POR NEGOCIABLE  (inv ÷ negociables)",                                 byDia: divDiaMap(inv, negoc),         total: tNegoc       > 0 ? tInv / tNegoc       : null,   fmt: usd, color: C.slate   },
    { label: "COSTO BACK+PLAN+ASIG+PRE  (inv ÷ backlog+plan+asig+pre)",                   byDia: divDiaMap(inv, actBackPlanAsigPre), total: tABAll  > 0 ? tInv / tABAll       : null,   fmt: usd, color: C.slate   },
  ];
}

// BLOQUE 2: Leads + Etapas Bitrix
function buildEtapasFilas(d, dias) {
  if (!d.etapas) return [];
  const g = (key) => byDiaMap(d.etapas, "dia", key);

  const leads = g("total_leads");
  const atc   = g("atc_soporte");
  const fc    = g("fuera_cobertura");
  const zp    = g("zonas_peligrosas");
  const inn   = g("innegociable");
  const vs    = g("venta_subida");

  const negocMap = {};
  dias.forEach(({ dia }) => {
    negocMap[Number(dia)] = Math.max(0, n(leads[Number(dia)]) - n(atc[Number(dia)]) - n(fc[Number(dia)]) - n(zp[Number(dia)]) - n(inn[Number(dia)]));
  });

  const tL   = totalFromMap(leads), tA  = totalFromMap(atc);
  const tFC  = totalFromMap(fc),    tZP = totalFromMap(zp);
  const tI   = totalFromMap(inn);
  const tNeg = Math.max(0, tL - tA - tFC - tZP - tI);
  const tVS  = totalFromMap(vs);

  const etapasExtra = [
    "seguimiento","gestion_diaria","doc_pendientes","volver_llamar",
    "mantiene_proveedor","otro_proveedor","no_volver_contactar",
    "no_interesa_costo","desiste_compra","cliente_discapacidad",
    "oportunidades","duplicado","contrato_netlife",
  ];

  return [
    { label: "N LEADS",              byDia: leads,    total: tL,   color: C.primary },
    { label: "ATC / SOPORTE",        byDia: atc,      total: tA,   pctDia: pctDiaMap(atc, leads),      totalPct: tL > 0 ? (tA  / tL) * 100 : null, showPct: true, color: C.danger  },
    { label: "FUERA COBERTURA",      byDia: fc,       total: tFC,  pctDia: pctDiaMap(fc, leads),       totalPct: tL > 0 ? (tFC / tL) * 100 : null, showPct: true },
    { label: "ZONAS PELIGROSAS",     byDia: zp,       total: tZP,  pctDia: pctDiaMap(zp, leads),       totalPct: tL > 0 ? (tZP / tL) * 100 : null, showPct: true },
    { label: "INNEGOCIABLE",         byDia: inn,      total: tI,   pctDia: pctDiaMap(inn, leads),      totalPct: tL > 0 ? (tI  / tL) * 100 : null, showPct: true, color: C.warning },
    { label: "NEGOCIABLES",          byDia: negocMap, total: tNeg, pctDia: pctDiaMap(negocMap, leads), totalPct: tL > 0 ? (tNeg / tL) * 100 : null, showPct: true, color: C.success },
    { label: "VENTA SUBIDA",         byDia: vs,       total: tVS,  pctDia: pctDiaMap(vs, leads),       totalPct: tL > 0 ? (tVS / tL) * 100 : null, showPct: true, color: C.primary },
    { label: "% EFECTIVIDAD TOTAL",  byDia: pctDiaMap(vs, leads),    total: tL   > 0 ? (tVS / tL)   * 100 : null, fmt: pf, color: C.cyan   },
    { label: "% EFECT. NEGOCIABLES", byDia: pctDiaMap(vs, negocMap), total: tNeg > 0 ? (tVS / tNeg) * 100 : null, fmt: pf, color: C.violet },
    { label: "── ETAPAS DETALLE ──", separador: true, byDia: {}, total: null },
    ...etapasExtra.map((k) => {
      const m = g(k), t = totalFromMap(m);
      return { label: k.replace(/_/g, " ").toUpperCase(), byDia: m, total: t, pctDia: pctDiaMap(m, leads), totalPct: tL > 0 ? (t / tL) * 100 : null, showPct: true, color: C.muted };
    }),
  ];
}

// BLOQUE 3: Estatus ventas JOT
function buildJotFilas(d, dias) {
  if (!d.status_jot) return [];
  const g = (k) => byDiaMap(d.status_jot, "dia", k);

  const jot  = g("ingreso_jot");
  const bit  = g("ingreso_bitrix");
  const act  = g("activos");
  const bk   = g("activo_backlog");
  const tvj  = g("total_ventas_jot");
  const dsj  = g("desiste_servicio_jot");
  const reg  = g("regularizados");
  const preg = g("por_regularizar");

  const tJot = totalFromMap(jot), tAct = totalFromMap(act), tBk = totalFromMap(bk);

  return [
    { label: "INGRESO EN BITRIX",    byDia: bit,              total: totalFromMap(bit),  color: C.primary },
    { label: "INGRESO EN JOT",       byDia: jot,              total: tJot,               color: C.success },
    { label: "ACTIVO + BACKLOG",     byDia: addMaps(act, bk), total: tAct + tBk,
      pctDia: pctDiaMap(addMaps(act, bk), jot), totalPct: tJot > 0 ? ((tAct + tBk) / tJot) * 100 : null, showPct: true },
    { label: "ACTIVO (MISMO MES)",   byDia: act,              total: tAct,
      pctDia: pctDiaMap(act, jot), totalPct: tJot > 0 ? (tAct / tJot) * 100 : null, showPct: true, color: C.success },
    { label: "TOTAL VENTAS JOT",     byDia: tvj,              total: totalFromMap(tvj)  },
    { label: "DESISTE SERVICIO JOT", byDia: dsj,              total: totalFromMap(dsj),  color: C.danger  },
    { label: "REGULARIZADOS",        byDia: reg,              total: totalFromMap(reg),  color: C.cyan    },
    { label: "POR REGULARIZAR",      byDia: preg,             total: totalFromMap(preg), color: C.warning },
  ];
}

// BLOQUE 4: Forma de pago
function buildPagoFilas(d, dias) {
  if (!d.pago) return [];
  const g = (k) => byDiaMap(d.pago, "dia", k);

  const pc  = g("pago_cuenta"),        pe  = g("pago_efectivo"),        pt  = g("pago_tarjeta");
  const pca = g("pago_cuenta_activa"), pea = g("pago_efectivo_activa"), pta = g("pago_tarjeta_activa");

  const totIngMap = Object.fromEntries(dias.map(({ dia }) => [Number(dia), n(pc[Number(dia)]) + n(pe[Number(dia)]) + n(pt[Number(dia)])]));
  const totActMap = Object.fromEntries(dias.map(({ dia }) => [Number(dia), n(pca[Number(dia)]) + n(pea[Number(dia)]) + n(pta[Number(dia)])]));

  const tPC = totalFromMap(pc), tPE = totalFromMap(pe), tPT = totalFromMap(pt);
  const tPCA = totalFromMap(pca), tPEA = totalFromMap(pea), tPTA = totalFromMap(pta);
  const tI = tPC + tPE + tPT, tA = tPCA + tPEA + tPTA;

  return [
    { label: "── INGRESOS JOT ──", separador: true, byDia: {}, total: null },
    { label: "CUENTA",   byDia: pc,  total: tPC,  pctDia: pctDiaMap(pc,  totIngMap), totalPct: tI > 0 ? (tPC  / tI) * 100 : null, showPct: true, color: C.cyan    },
    { label: "EFECTIVO", byDia: pe,  total: tPE,  pctDia: pctDiaMap(pe,  totIngMap), totalPct: tI > 0 ? (tPE  / tI) * 100 : null, showPct: true, color: C.success },
    { label: "TARJETA",  byDia: pt,  total: tPT,  pctDia: pctDiaMap(pt,  totIngMap), totalPct: tI > 0 ? (tPT  / tI) * 100 : null, showPct: true, color: C.primary },
    { label: "── ACTIVAS ──",       separador: true, byDia: {}, total: null },
    { label: "CUENTA",   byDia: pca, total: tPCA, pctDia: pctDiaMap(pca, totActMap), totalPct: tA > 0 ? (tPCA / tA) * 100 : null, showPct: true, color: C.cyan    },
    { label: "EFECTIVO", byDia: pea, total: tPEA, pctDia: pctDiaMap(pea, totActMap), totalPct: tA > 0 ? (tPEA / tA) * 100 : null, showPct: true, color: C.success },
    { label: "TARJETA",  byDia: pta, total: tPTA, pctDia: pctDiaMap(pta, totActMap), totalPct: tA > 0 ? (tPTA / tA) * 100 : null, showPct: true, color: C.primary },
  ];
}

// BLOQUE 5: Ciclo de venta
function buildCicloFilas(d, dias) {
  if (!d.ciclo || d.ciclo.length === 0) return [];
  const g = (k) => byDiaMap(d.ciclo, "dia", k);

  const keys   = ["ciclo_0","ciclo_1","ciclo_2","ciclo_3","ciclo_4","ciclo_mas5"];
  const labels = ["0 DÍAS","1 DÍA","2 DÍAS","3 DÍAS","4 DÍAS","MÁS DE 5 DÍAS"];
  const colors = [C.success, C.cyan, C.primary, C.warning, C.danger, C.violet];
  const maps   = keys.map((k) => g(k));
  const tots   = maps.map((m) => totalFromMap(m));
  const totTotal = tots.reduce((a, b) => a + b, 0);

  const totalDiaMap = Object.fromEntries(
    dias.map(({ dia }) => [Number(dia), keys.reduce((s, _k, i) => s + n(maps[i][Number(dia)]), 0)])
  );

  return [
    ...labels.map((lbl, i) => ({
      label: lbl, byDia: maps[i], total: tots[i],
      pctDia: pctDiaMap(maps[i], totalDiaMap),
      totalPct: totTotal > 0 ? (tots[i] / totTotal) * 100 : null,
      showPct: true, color: colors[i],
    })),
    { label: "TOTAL", byDia: totalDiaMap, total: totTotal, color: C.primary },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function TabReporteData({ filtro }) {
  const hoy = new Date();

  const [anio,         setAnio]         = useState(hoy.getFullYear());
  const [mes,          setMes]          = useState(hoy.getMonth() + 1);
  const [canalesSel,   setCanalesSel]   = useState([]);
  const [canalesDisp,  setCanalesDisp]  = useState([]);
  const [canalDetalle, setCanalDetalle] = useState(null);
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(false);

  const dataLoaded = useRef(false);

  useEffect(() => {
    setCanalesSel([]);
    setData(null);
    dataLoaded.current = false;
    setCanalDetalle(null);

    fetch(`${API}/api/redes/reporte-data?anio=${anio}&mes=${mes}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.canales_disponibles) {
          setCanalesDisp(d.canales_disponibles.map((c) => c.canal));
        }
      })
      .catch(() => {});
  }, [anio, mes]);

  const cargarDatos = useCallback((canalesSel_, anio_, mes_) => {
    setLoading(true);
    const params = new URLSearchParams({ anio: anio_, mes: mes_ });
    if (canalesSel_.length > 0) params.set("canales", canalesSel_.join(","));

    fetch(`${API}/api/redes/reporte-data?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setData(d);
          dataLoaded.current = true;
          if (d.canales_disponibles) {
            setCanalesDisp(d.canales_disponibles.map((c) => c.canal));
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCargar = () => cargarDatos(canalesSel, anio, mes);

  const toggleCanal = (canal) => {
    setCanalesSel((prev) => {
      const next = prev.includes(canal) ? prev.filter((c) => c !== canal) : [...prev, canal];
      if (dataLoaded.current) {
        setTimeout(() => cargarDatos(next, anio, mes), 0);
      }
      return next;
    });
  };

  const limpiarCanales = () => {
    setCanalesSel([]);
    if (dataLoaded.current) {
      setTimeout(() => cargarDatos([], anio, mes), 0);
    }
  };

  const handleExport = () => {
    if (!data) return;
    const wb   = XLSX.utils.book_new();
    const dias = data.meta.dias;

    const addSheet = (nombre, filas) => {
      const header = ["MÉTRICA", ...dias.map((d) => `${d.dia}/${d.nombre}`), "TOTAL"];
      const rows = filas.map((f) => {
        const row = [f.label];
        dias.forEach((d) => {
          if (f.separador) { row.push(""); return; }
          const val = f.byDia?.[Number(d.dia)];
          const pct = f.pctDia?.[Number(d.dia)];
          if (f.fmt)          { row.push(f.fmt(val)); return; }
          if (f.showPct)      { row.push(fmtCantPct(val, pct)); return; }
          row.push(val !== undefined && n(val) !== 0 ? n(val) : "");
        });
        if (f.separador)    row.push("");
        else if (f.fmt)     row.push(f.fmt(f.total));
        else if (f.showPct) row.push(fmtCantPct(f.total, f.totalPct));
        else                row.push(f.total !== null && f.total !== undefined ? n(f.total) : "");
        return row;
      });
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      ws["!cols"] = [{ wch: 42 }, ...dias.map(() => ({ wch: 12 })), { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 31));
    };

    if (data.inversion?.length)  addSheet("Inversión-Costos", buildInversionFilas(data, dias));
    if (data.etapas?.length)     addSheet("Leads-Etapas",     buildEtapasFilas(data, dias));
    if (data.status_jot?.length) addSheet("Estatus JOT",      buildJotFilas(data, dias));
    if (data.pago?.length)       addSheet("Forma de Pago",    buildPagoFilas(data, dias));
    if (data.ciclo?.length)      addSheet("Ciclo Venta",      buildCicloFilas(data, dias));

    if (data.hora?.length) {
      const totalH = data.hora.reduce((s, r) => s + n(r.n_leads), 0);
      const ws = XLSX.utils.json_to_sheet(data.hora.map((h) => ({
        HORA:    `${String(h.hora).padStart(2, "0")}:00`,
        LEADS:   `${n(h.n_leads)} (${totalH > 0 ? ((n(h.n_leads) / totalH) * 100).toFixed(1) : 0}%)`,
        ATC:     n(h.atc),
        "% ATC": `${n(h.pct_atc).toFixed(1)}%`,
      })));
      XLSX.utils.book_append_sheet(wb, ws, "Leads por Hora");
    }
    if (data.atc_totales?.length) {
      const totalAtc = data.atc_totales.reduce((s, r) => s + n(r.cantidad), 0);
      const ws = XLSX.utils.json_to_sheet(data.atc_totales.map((r) => ({
        MOTIVO:   r.motivo_atc,
        CANTIDAD: n(r.cantidad),
        "%":      totalAtc > 0 ? `${((n(r.cantidad) / totalAtc) * 100).toFixed(1)}%` : "0%",
      })));
      XLSX.utils.book_append_sheet(wb, ws, "Motivos ATC");
    }
    if (data.ciudad?.length) {
      const totalC = data.ciudad.reduce((s, r) => s + n(r.total_leads), 0);
      const ws = XLSX.utils.json_to_sheet(data.ciudad.map((r) => ({
        CIUDAD:         r.ciudad,
        PROVINCIA:      r.provincia,
        LEADS:          `${n(r.total_leads)} (${totalC > 0 ? ((n(r.total_leads) / totalC) * 100).toFixed(1) : 0}%)`,
        ACTIVOS:        n(r.activos),
        "INGRESOS JOT": n(r.ingresos_jot),
        "% ACTIVOS":    `${n(r.pct_activos).toFixed(1)}%`,
      })));
      XLSX.utils.book_append_sheet(wb, ws, "Ciudad");
    }

    XLSX.writeFile(wb, `ReporteData_${MESES[mes - 1]}_${anio}.xlsx`);
  };

  // ─── Reporte Visual Gerencial — Call Center Analytics Dashboard ────────────
  const generarReporteVisual = () => {
    if (!data) return;
    const mesNombre  = MESES[data.meta.mes - 1];
    const anioR      = data.meta.anio;
    const dias       = data.meta.dias;
    const fechaGen   = new Date().toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' });
    const horaGen    = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });

    const totInv     = (data.inversion  || []).reduce((s, r) => s + n(r.inversion_usd),  0);
    const totLeads   = (data.etapas     || []).reduce((s, r) => s + n(r.total_leads),     0);
    const totVS      = (data.etapas     || []).reduce((s, r) => s + n(r.venta_subida),    0);
    const totJot     = (data.status_jot || []).reduce((s, r) => s + n(r.ingreso_jot),     0);
    const totActivos = (data.status_jot || []).reduce((s, r) => s + n(r.activos),         0);
    const efect      = totLeads > 0 ? ((totVS / totLeads) * 100).toFixed(1) + '%' : '—';
    const cplStr     = totLeads > 0 ? '$' + (totInv / totLeads).toFixed(2) : '—';
    const canalesStr = canalesSel.length > 0 ? canalesSel.map(c => getCfg(c).label).join(' · ') : 'Todos los canales';

    // ── Insights reutilizados en página 3
    const horaData   = data.hora || [];
    const totalLH    = horaData.reduce((s, r) => s + n(r.n_leads), 0);
    const horaMaxL   = horaData.reduce((mx, h) => n(h.n_leads) > n(mx?.n_leads || 0) ? h : mx, null);
    const horaMaxAtc = horaData.reduce((mx, h) => n(h.pct_atc) > n(mx?.pct_atc || 0) ? h : mx, null);
    const horaMinAtc = [...horaData].filter(h => n(h.n_leads) > 0).sort((a, b) => n(a.pct_atc) - n(b.pct_atc))[0] || null;
    const horasBuenas = horaData.filter(h => n(h.n_leads) >= (totalLH / Math.max(horaData.length, 1)) * 0.8 && n(h.pct_atc) < 30);
    const ciudadTop  = [...(data.ciudad || [])].sort((a, b) => n(b.pct_activos) - n(a.pct_activos))[0] || null;
    const motAtcTop  = [...(data.atc_totales || [])].sort((a, b) => n(b.cantidad) - n(a.cantidad))[0] || null;
    const motAtc2    = [...(data.atc_totales || [])].sort((a, b) => n(b.cantidad) - n(a.cantidad))[1] || null;
    const fmtHora    = (h) => `${String(h).padStart(2,'0')}:00`;

    // ── Embudo de conversión
    const totATC  = (data.etapas || []).reduce((s,r) => s + n(r.atc_soporte), 0);
    const totFC   = (data.etapas || []).reduce((s,r) => s + n(r.fuera_cobertura), 0);
    const totZP   = (data.etapas || []).reduce((s,r) => s + n(r.zonas_peligrosas), 0);
    const totINN  = (data.etapas || []).reduce((s,r) => s + n(r.innegociable), 0);
    const totNeg  = Math.max(0, totLeads - totATC - totFC - totZP - totINN);
    const pOf = (a, b) => b > 0 ? (a / b * 100).toFixed(0) : '0';
    const funnelSteps = [
      { label:'LEADS TOTALES',  val:totLeads,   pct:'100',                   color:'#1A3A6E' },
      { label:'NEGOCIABLES',    val:totNeg,     pct:pOf(totNeg,totLeads),    color:'#2563eb' },
      { label:'VENTAS SUBIDAS', val:totVS,      pct:pOf(totVS,totLeads),     color:'#0891b2' },
      { label:'INGRESOS JOT',   val:totJot,     pct:pOf(totJot,totLeads),    color:'#059669' },
      { label:'ACTIVOS MES',    val:totActivos, pct:pOf(totActivos,totLeads), color:'#16a34a' },
    ];

    // ── Forma de pago
    const totPC   = (data.pago||[]).reduce((s,r)=>s+n(r.pago_cuenta),0);
    const totPE   = (data.pago||[]).reduce((s,r)=>s+n(r.pago_efectivo),0);
    const totPT   = (data.pago||[]).reduce((s,r)=>s+n(r.pago_tarjeta),0);
    const totPago = totPC + totPE + totPT;
    const pca = (a,b) => b>0 ? (a/b*100).toFixed(1) : '0.0';

    // ── Ciclo de venta
    const cicloKeys   = ['ciclo_0','ciclo_1','ciclo_2','ciclo_3','ciclo_4','ciclo_mas5'];
    const cicloLabels = ['0 días','1 día','2 días','3 días','4 días','+5 días'];
    const cicloColors = ['#16a34a','#0891b2','#2563eb','#d97706','#dc2626','#7c3aed'];
    const cicloVals   = cicloKeys.map(k=>(data.ciclo||[]).reduce((s,r)=>s+n(r[k]),0));
    const totCiclo    = cicloVals.reduce((a,b)=>a+b,0);
    const maxCiclo    = Math.max(...cicloVals, 1);

    // ── Top ciudades / ATC
    const topCiudades = [...(data.ciudad||[])].sort((a,b)=>n(b.total_leads)-n(a.total_leads)).slice(0,8);
    const maxCiudad   = topCiudades[0] ? n(topCiudades[0].total_leads) : 1;
    const totLCity    = (data.ciudad||[]).reduce((s,r)=>s+n(r.total_leads),0);
    const topAtc      = [...(data.atc_totales||[])].sort((a,b)=>n(b.cantidad)-n(a.cantidad)).slice(0,8);
    const maxAtc      = topAtc[0] ? n(topAtc[0].cantidad) : 1;
    const totAtcT     = (data.atc_totales||[]).reduce((s,r)=>s+n(r.cantidad),0);
    const maxHL       = Math.max(...horaData.map(h=>n(h.n_leads)), 1);

    // ── HTML helpers
    const bar = (label, val, maxVal, color, extra='') =>
      `<div style="display:flex;align-items:center;gap:6px;margin:3px 0;">` +
      `<div style="width:160px;font-size:5.8pt;text-align:right;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${label}">${label}</div>` +
      `<div style="flex:1;background:#e2e8f0;border-radius:3px;height:13px;overflow:hidden;"><div style="width:${maxVal>0?Math.max(2,Math.round(val/maxVal*100)):2}%;height:100%;background:${color};border-radius:3px;print-color-adjust:exact;-webkit-print-color-adjust:exact;"></div></div>` +
      `<div style="width:72px;font-size:5.8pt;color:#1A3A6E;font-weight:700">${extra||val}</div></div>`;

    const buildTableHTML = (filas, dias_) => {
      if (!filas || filas.length === 0) return '<p style="color:#94a3b8;padding:8px;font-size:7pt">Sin datos</p>';
      const headers = dias_.map(d => `<th>${d.dia}<br/><span>${(d.nombre || '').substring(0,3)}</span></th>`).join('');
      const rows = filas.map(f => {
        if (f.separador) return `<tr><td colspan="${dias_.length + 2}" class="sep-row">${f.label}</td></tr>`;
        const cells = dias_.map(d => {
          const val = f.byDia?.[Number(d.dia)];
          const pct = f.pctDia?.[Number(d.dia)];
          let display = '';
          if (f.fmt) display = f.fmt(val) || '—';
          else if (f.showPct) display = fmtCantPct(val, pct) || '—';
          else display = (val !== undefined && val !== null && n(val) !== 0) ? String(n(val)) : '—';
          return `<td>${display}</td>`;
        }).join('');
        const totVal = f.fmt ? f.fmt(f.total) :
                       f.showPct ? fmtCantPct(f.total, f.totalPct) :
                       (f.total !== null && f.total !== undefined ? String(n(f.total) % 1 !== 0 ? n(f.total).toFixed(2) : n(f.total)) : '—');
        return `<tr><td class="tdn" style="color:${f.color || '#475569'}">${f.label}</td>${cells}<td class="tot">${totVal}</td></tr>`;
      }).join('');
      return `<table><thead><tr><th style="text-align:left;min-width:200px">MÉTRICA</th>${headers}<th>TOTAL</th></tr></thead><tbody>${rows}</tbody></table>`;
    };

    const kpis = [
      { l: 'Leads Totales',    v: totLeads,                     c: '#2563eb', bg: '#eff6ff' },
      { l: 'Ingresos JOT',     v: totJot,                       c: '#16a34a', bg: '#f0fdf4' },
      { l: 'Activos',          v: totActivos,                   c: '#059669', bg: '#ecfdf5' },
      { l: 'Efectividad',      v: efect,                        c: '#0284c7', bg: '#f0f9ff' },
      { l: 'Inversión Total',  v: '$' + totInv.toFixed(2),      c: '#7c3aed', bg: '#f5f3ff' },
      { l: 'CPL',              v: cplStr,                       c: '#0891b2', bg: '#ecfeff' },
    ];

    // ── Embudo HTML (centrado, proporcional)
    const funnelHTML = funnelSteps.map((s,i) => {
      const w = Math.max(45, Number(s.pct));
      return `<div style="margin-bottom:5px;">` +
        `<div style="display:flex;align-items:stretch;height:28px;">` +
        `<div style="width:${(100-w)/2}%;"></div>` +
        `<div style="width:${w}%;background:${s.color};border-radius:5px;display:flex;justify-content:space-between;align-items:center;padding:0 10px;print-color-adjust:exact;-webkit-print-color-adjust:exact;">` +
        `<span style="font-size:6pt;font-weight:700;color:#fff">${s.label}</span>` +
        `<span style="font-size:11pt;font-weight:900;color:#fff">${s.val}</span>` +
        `<span style="font-size:6pt;background:rgba(255,255,255,0.25);padding:1px 6px;border-radius:3px;color:#fff">${s.pct}%</span>` +
        `</div><div style="width:${(100-w)/2}%;"></div></div>` +
        (i < funnelSteps.length-1 ? `<div style="text-align:center;font-size:8pt;color:#94a3b8;line-height:1.2">▼</div>` : '') +
        `</div>`;
    }).join('');

    const pagoHTML = totPago > 0
      ? bar('Cuenta Bancaria', totPC, totPago, '#0891b2', `${totPC} (${pca(totPC,totPago)}%)`) +
        bar('Efectivo',        totPE, totPago, '#16a34a', `${totPE} (${pca(totPE,totPago)}%)`) +
        bar('Tarjeta',         totPT, totPago, '#7c3aed', `${totPT} (${pca(totPT,totPago)}%)`) +
        `<div style="margin-top:6px;padding-top:5px;border-top:1px solid #dbe8f8;font-size:5.8pt;color:#64748b;text-align:right">Total JOT: <strong style="color:#1A3A6E">${totPago}</strong></div>`
      : '<p style="font-size:6pt;color:#94a3b8">Sin datos de pago</p>';

    const cicloHTML = cicloVals.map((v,i) =>
      `<div style="display:flex;align-items:center;gap:6px;margin:4px 0;">` +
      `<div style="width:52px;font-size:5.8pt;color:#475569;text-align:right;font-weight:700">${cicloLabels[i]}</div>` +
      `<div style="flex:1;background:#e2e8f0;border-radius:3px;height:14px;overflow:hidden;"><div style="width:${Math.round(v/maxCiclo*100)}%;height:100%;background:${cicloColors[i]};border-radius:3px;print-color-adjust:exact;-webkit-print-color-adjust:exact;"></div></div>` +
      `<div style="width:85px;font-size:5.8pt;color:#1A3A6E;font-weight:700">${v} (${pca(v,totCiclo)}%)</div></div>`
    ).join('');

    const ciudadesHTML = topCiudades.length > 0
      ? topCiudades.map(c => bar(c.ciudad, n(c.total_leads), maxCiudad, '#1A3A6E', `${n(c.total_leads)} (${pca(n(c.total_leads),totLCity)}%)`)).join('')
      : '<p style="font-size:6pt;color:#94a3b8">Sin datos</p>';

    const atcHTML = topAtc.length > 0
      ? topAtc.map(r => bar(r.motivo_atc||'Sin motivo', n(r.cantidad), maxAtc, '#dc2626', `${n(r.cantidad)} (${pca(n(r.cantidad),totAtcT)}%)`)).join('')
      : '<p style="font-size:6pt;color:#94a3b8">Sin datos</p>';

    const heatmapHTML = Array.from({length:24}, (_,h) => {
      const row = horaData.find(r=>Number(r.hora)===h)||{n_leads:0,atc:0,pct_atc:0};
      const leads = n(row.n_leads); const pctAtc = n(row.pct_atc);
      const intensity = maxHL>0 ? leads/maxHL : 0;
      let bg='#f0f6ff', fg='#1A3A6E';
      if(intensity>0.7){bg='#1A3A6E';fg='#fff';}
      else if(intensity>0.4){bg='#378ADD';fg='#fff';}
      else if(intensity>0.2){bg='#93c5fd';fg='#1A3A6E';}
      else if(intensity>0.05){bg='#dbeafe';fg='#1A3A6E';}
      let badge='';
      if(pctAtc>40) badge=`<div style="font-size:4pt;background:#dc2626;color:#fff;border-radius:2px;padding:0 2px;margin-top:1px;print-color-adjust:exact;-webkit-print-color-adjust:exact;">ATC!</div>`;
      else if(pctAtc>20) badge=`<div style="font-size:4pt;background:#f59e0b;color:#fff;border-radius:2px;padding:0 2px;margin-top:1px;print-color-adjust:exact;-webkit-print-color-adjust:exact;">atc</div>`;
      return `<div style="background:${bg};border-radius:4px;padding:4px 2px;text-align:center;print-color-adjust:exact;-webkit-print-color-adjust:exact;">` +
        `<div style="font-size:5pt;color:${fg};font-weight:700">${String(h).padStart(2,'0')}h</div>` +
        `<div style="font-size:8pt;color:${fg};font-weight:900;line-height:1.1">${leads||'—'}</div>${badge}</div>`;
    }).join('');

    const CSS = `
@page{size:A4 landscape;margin:0mm 12mm 10mm;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:7.5pt;color:#0f172a;background:#fff;}
.pg{page-break-before:always;}
.tb{height:6px;background:linear-gradient(90deg,#1A3A6E 0%,#378ADD 65%,#70bdf5 100%);print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1A3A6E;padding:8px 0 8px;margin-bottom:10px;}
.hdr-logo{display:flex;align-items:center;gap:9px;}
.hdr-badge{background:#1A3A6E;color:#fff;font-size:10pt;font-weight:900;padding:4px 10px;border-radius:5px;letter-spacing:1px;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.hdr h1{font-size:12pt;font-weight:900;color:#1A3A6E;margin:0;}
.hdr p{font-size:7pt;color:#64748b;margin-top:2px;}
.hdr-r{text-align:right;font-size:7pt;color:#64748b;line-height:1.7;}
.hdr-r .periodo{font-size:10pt;font-weight:900;color:#1A3A6E;}
.kgrid{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;margin-bottom:10px;}
.kcard{border-radius:7px;padding:8px 6px;border-width:1px;border-style:solid;text-align:center;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.kcard .lbl{font-size:5.5pt;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:3px;}
.kcard .val{font-size:17pt;font-weight:900;line-height:1.1;}
.sec{font-size:7pt;font-weight:900;text-transform:uppercase;letter-spacing:.9px;color:#1A3A6E;border-left:3px solid #378ADD;padding:4px 8px;margin:8px 0 5px;background:#eef4fc;border-radius:0 4px 4px 0;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;}
.box{border:1px solid #dbe8f8;border-radius:6px;padding:10px;background:#fafcff;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.ftr{margin-top:10px;padding-top:6px;border-top:2px solid #1A3A6E;font-size:6pt;color:#64748b;display:flex;justify-content:space-between;align-items:center;}
.ftr-logo{font-weight:900;color:#1A3A6E;letter-spacing:.5px;font-size:7pt;}
table{width:100%;border-collapse:collapse;margin-bottom:8px;font-size:6pt;}
th{background:#1A3A6E;color:#fff;font-size:5.5pt;font-weight:700;padding:4px 3px;text-align:center;text-transform:uppercase;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
th span{font-weight:400;font-size:5pt;display:block;color:#a8c8f0;}
td{padding:3px;border-bottom:1px solid #dbe8f8;text-align:center;color:#475569;}
tr:nth-child(even) td{background:#f0f6ff;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.tdn{text-align:left!important;font-weight:700;padding-left:6px!important;min-width:180px;}
.tot{font-weight:900;color:#1A3A6E!important;border-left:1px solid #c4d9f0;}
.sep-row{background:#eef4fc!important;font-weight:900;font-size:5.5pt;color:#1A3A6E;padding:4px 6px;text-align:left;print-color-adjust:exact;-webkit-print-color-adjust:exact;}`;

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Reporte Visual — ${mesNombre} ${anioR}</title>
<style>${CSS}</style></head><body>

<!-- ══ PÁGINA 1: KPIs + EMBUDO + PAGO + CICLO ══ -->
<div class="tb"></div>
<div class="hdr">
  <div class="hdr-logo">
    <span class="hdr-badge">NOVO ERP</span>
    <div><h1>REPORTE VISUAL — REDES DIGITALES</h1><p>Análisis de Canales de Publicidad &nbsp;·&nbsp; ${canalesStr}</p></div>
  </div>
  <div class="hdr-r"><div class="periodo">${mesNombre.toUpperCase()} ${anioR}</div><div>Generado: ${fechaGen} &nbsp;·&nbsp; ${horaGen} &nbsp;·&nbsp; ${dias.length} días</div></div>
</div>
<div class="kgrid">${kpis.map(k=>`<div class="kcard" style="background:${k.bg};border-color:${k.c}40"><div class="lbl">${k.l}</div><div class="val" style="color:${k.c}">${k.v}</div></div>`).join('')}</div>
<div class="g2" style="grid-template-columns:1.3fr 1fr;align-items:start;">
  <div>
    <div class="sec">🎯 Embudo de Conversión — Leads a Activos</div>
    <div class="box">${funnelHTML}</div>
  </div>
  <div>
    <div class="sec">💳 Distribución Forma de Pago</div>
    <div class="box" style="margin-bottom:8px">${pagoHTML}</div>
    <div class="sec">⏱️ Ciclo de Venta (días para activar)</div>
    <div class="box">${cicloHTML}</div>
  </div>
</div>
<div class="ftr"><span class="ftr-logo">▌ NOVO ERP · NETLIFE VELSA</span><span>Reporte Visual — Redes Digitales · Confidencial · Uso Gerencial</span><span>Pág. 1 / 3</span></div>

<!-- ══ PÁGINA 2: CIUDADES + ATC + HEATMAP HORARIO ══ -->
<div class="pg"></div>
<div class="tb"></div>
<div class="hdr">
  <div class="hdr-logo">
    <span class="hdr-badge">NOVO ERP</span>
    <div><h1>DISTRIBUCIÓN GEOGRÁFICA &amp; ANÁLISIS CALL CENTER</h1><p>${mesNombre.toUpperCase()} ${anioR} &nbsp;·&nbsp; ${canalesStr}</p></div>
  </div>
  <div class="hdr-r"><div class="periodo">CALIDAD DE LEADS</div><div>Generado: ${horaGen}</div></div>
</div>
<div class="g2" style="align-items:start;margin-bottom:10px;">
  <div>
    <div class="sec">🗺️ Top 8 Ciudades — Volumen de Leads</div>
    <div class="box">${ciudadesHTML}</div>
  </div>
  <div>
    <div class="sec">📞 Top 8 Motivos ATC / Soporte</div>
    <div class="box">${atcHTML}</div>
  </div>
</div>
<div class="sec">🕐 Heatmap — Distribución de Leads por Hora del Día</div>
<div class="box">
  <div style="display:flex;gap:10px;margin-bottom:6px;align-items:center;flex-wrap:wrap;font-size:5.5pt;color:#64748b">
    <div style="display:flex;align-items:center;gap:3px"><div style="width:10px;height:10px;background:#1A3A6E;border-radius:2px;print-color-adjust:exact;-webkit-print-color-adjust:exact;"></div>Alto (&gt;70%)</div>
    <div style="display:flex;align-items:center;gap:3px"><div style="width:10px;height:10px;background:#378ADD;border-radius:2px;print-color-adjust:exact;-webkit-print-color-adjust:exact;"></div>Medio-Alto</div>
    <div style="display:flex;align-items:center;gap:3px"><div style="width:10px;height:10px;background:#93c5fd;border-radius:2px;print-color-adjust:exact;-webkit-print-color-adjust:exact;"></div>Medio</div>
    <div style="display:flex;align-items:center;gap:3px"><div style="width:10px;height:10px;background:#dbeafe;border-radius:2px;print-color-adjust:exact;-webkit-print-color-adjust:exact;"></div>Bajo</div>
    <div style="margin-left:auto;display:flex;align-items:center;gap:6px">
      <span style="background:#f59e0b;color:#fff;padding:1px 5px;border-radius:2px;font-weight:700;print-color-adjust:exact;-webkit-print-color-adjust:exact;">atc</span>ATC 20-40%
      &nbsp;<span style="background:#dc2626;color:#fff;padding:1px 5px;border-radius:2px;font-weight:700;print-color-adjust:exact;-webkit-print-color-adjust:exact;">ATC!</span>ATC &gt;40%
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(24,1fr);gap:3px;">${heatmapHTML}</div>
</div>
<div class="ftr"><span class="ftr-logo">▌ NOVO ERP · NETLIFE VELSA</span><span>Reporte Visual — Redes Digitales · Confidencial · Generado: ${fechaGen}</span><span>Pág. 2 / 3</span></div>

<!-- ══ PÁGINA 3 — ANÁLISIS HORARIO & RECOMENDACIONES ESTRATÉGICAS ══ -->
<div class="pg"></div>
<div class="tb"></div>
<div class="hdr">
  <div class="hdr-logo">
    <span class="hdr-badge">NOVO ERP</span>
    <div><h1>ANÁLISIS HORARIO &amp; RECOMENDACIONES</h1><p>${mesNombre.toUpperCase()} ${anioR} &nbsp;·&nbsp; ${canalesStr}</p></div>
  </div>
  <div class="hdr-r"><div class="periodo">Para Toma de Decisiones</div><div>Generado: ${fechaGen} &nbsp;·&nbsp; ${horaGen}</div></div>
</div>

<div class="sec">⏰ Distribución de Leads &amp; ATC por Hora del Día</div>
${horaData.length > 0 ? `
<table>
  <thead><tr>
    <th>Hora</th>
    <th>Leads</th>
    <th>% del Total</th>
    <th>ATC</th>
    <th>% ATC</th>
    <th>Diagnóstico</th>
  </tr></thead>
  <tbody>${horaData.map((h, i) => {
    const pct = totalLH > 0 ? ((n(h.n_leads) / totalLH) * 100).toFixed(1) : '0.0';
    const pctAtc = n(h.pct_atc);
    const esPico = horaMaxL && h.hora === horaMaxL.hora;
    const esAtcAlto = pctAtc > 40;
    const esVentana = n(h.n_leads) >= (totalLH / Math.max(horaData.length,1)) * 0.8 && pctAtc < 30;
    const diag = esPico ? '🏆 Pico de captación' : esAtcAlto ? '🔴 ATC elevado' : esVentana ? '✅ Ventana óptima' : pctAtc < 20 ? '🟢 Baja presión ATC' : '';
    const bg = esPico ? 'background:#f0fdf4;' : esAtcAlto ? 'background:#fef2f2;' : esVentana ? 'background:#eff6ff;' : i % 2 === 1 ? 'background:#f0f6ff;' : '';
    return `<tr style="${bg}">
      <td style="font-weight:900;color:#1A3A6E">${fmtHora(h.hora)}</td>
      <td style="font-weight:700;color:#2563eb">${n(h.n_leads)}</td>
      <td style="color:#64748b">${pct}%</td>
      <td style="color:#dc2626">${n(h.atc)}</td>
      <td style="font-weight:700;color:${pctAtc > 40 ? '#dc2626' : pctAtc > 20 ? '#d97706' : '#059669'}">${pctAtc.toFixed(1)}%</td>
      <td style="text-align:left;padding-left:6px;color:#334155;font-size:6pt">${diag}</td>
    </tr>`;
  }).join('')}</tbody>
</table>` : '<p style="color:#94a3b8;padding:8px;font-size:7pt">Sin datos de hora para el período.</p>'}

<div class="sec">💡 Recomendaciones Estratégicas — ${mesNombre.toUpperCase()} ${anioR}</div>
<table style="margin-bottom:0">
  <thead><tr>
    <th style="text-align:left;min-width:180px">Insight</th>
    <th style="text-align:left">Hallazgo</th>
    <th style="text-align:left">Acción Recomendada</th>
  </tr></thead>
  <tbody>
    ${horaMaxL ? `<tr>
      <td class="tdn" style="color:#2563eb">🏆 Hora pico de leads</td>
      <td style="text-align:left;padding-left:4px">La hora <b>${fmtHora(horaMaxL.hora)}</b> concentra <b>${n(horaMaxL.n_leads)}</b> leads (${totalLH > 0 ? ((n(horaMaxL.n_leads)/totalLH)*100).toFixed(1) : 0}% del total diario)</td>
      <td style="text-align:left;padding-left:4px;color:#334155">Asignar máximo de asesores disponibles en esta franja. Priorizar contacto inmediato en los primeros 5 min.</td>
    </tr>` : ''}
    ${horaMaxAtc ? `<tr style="background:#fef2f2">
      <td class="tdn" style="color:#dc2626">🔴 Hora crítica de ATC</td>
      <td style="text-align:left;padding-left:4px">La hora <b>${fmtHora(horaMaxAtc.hora)}</b> registra <b>${n(horaMaxAtc.pct_atc).toFixed(1)}%</b> de leads ATC (${n(horaMaxAtc.atc)} casos)</td>
      <td style="text-align:left;padding-left:4px;color:#334155">Reforzar equipo de soporte en esta franja. Analizar origen: ¿leads de baja calidad, zona sin cobertura o falla de contactabilidad?</td>
    </tr>` : ''}
    ${horaMinAtc ? `<tr>
      <td class="tdn" style="color:#059669">✅ Ventana menor ATC</td>
      <td style="text-align:left;padding-left:4px">La hora <b>${fmtHora(horaMinAtc.hora)}</b> es la franja con menor ATC: <b>${n(horaMinAtc.pct_atc).toFixed(1)}%</b> (${n(horaMinAtc.n_leads)} leads)</td>
      <td style="text-align:left;padding-left:4px;color:#334155">Aprovechar esta franja para gestionar leads más calificados. Ideal para seguimientos y cierres.</td>
    </tr>` : ''}
    ${horasBuenas.length > 0 ? `<tr style="background:#f0fdf4">
      <td class="tdn" style="color:#059669">🎯 Franjas óptimas de cierre</td>
      <td style="text-align:left;padding-left:4px">Horas con volumen alto Y ATC &lt;30%: <b>${horasBuenas.map(h => fmtHora(h.hora)).join(', ')}</b></td>
      <td style="text-align:left;padding-left:4px;color:#334155">Concentrar las llamadas de cierre en estas franjas. Mayor probabilidad de conversión efectiva.</td>
    </tr>` : ''}
    ${ciudadTop ? `<tr>
      <td class="tdn" style="color:#7c3aed">🏙️ Ciudad más efectiva</td>
      <td style="text-align:left;padding-left:4px"><b>${ciudadTop.ciudad}</b> lidera con <b>${n(ciudadTop.pct_activos).toFixed(1)}%</b> de activación (${n(ciudadTop.activos)} activos / ${n(ciudadTop.total_leads)} leads)</td>
      <td style="text-align:left;padding-left:4px;color:#334155">Analizar el perfil de lead de ${ciudadTop.ciudad} y replicar la segmentación en ciudades con menor efectividad.</td>
    </tr>` : ''}
    ${motAtcTop ? `<tr style="background:#fef2f2">
      <td class="tdn" style="color:#dc2626">📞 Principal motivo ATC</td>
      <td style="text-align:left;padding-left:4px"><b>${motAtcTop.motivo_atc}</b> con <b>${n(motAtcTop.cantidad)}</b> casos${motAtc2 ? ` · 2do: ${motAtc2.motivo_atc} (${n(motAtc2.cantidad)})` : ''}</td>
      <td style="text-align:left;padding-left:4px;color:#334155">Escalar a coordinación. Si es operativo: equipo técnico. Si es comercial: revisar calidad del lead.</td>
    </tr>` : ''}
  </tbody>
</table>

<div class="ftr"><span class="ftr-logo">▌ NOVO ERP · NETLIFE VELSA</span><span>Análisis Horario &amp; Recomendaciones — Confidencial · Uso Gerencial</span><span>Pág. 3 / 3 · ${fechaGen}</span></div>
<script>window.onload=()=>setTimeout(()=>window.print(),400);</script>
</body></html>`;

    const w = window.open('', '_blank', 'width=1200,height=820');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const dias = data?.meta?.dias || [];

  return (
    <div className="space-y-4" style={{ background: C.bgPage }}>

      {/* PANEL DE FILTROS */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: C.border }}>

        {/* Fila 1: Título + Mes/Año + Botones */}
        <div className="px-5 py-3 flex flex-wrap items-center gap-3 border-b" style={{ background: C.bgHeader, borderColor: C.border }}>
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 rounded-full" style={{ background: C.primary }} />
            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.primary }}>Reporte Data</span>
          </div>

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}
              className="border rounded-lg px-2.5 py-1.5 text-[10px] font-semibold outline-none bg-white cursor-pointer"
              style={{ borderColor: C.border, color: C.slate }}>
              {[2024, 2025, 2026, 2027].map((y) => <option key={y}>{y}</option>)}
            </select>

            <select value={mes} onChange={(e) => setMes(Number(e.target.value))}
              className="border rounded-lg px-2.5 py-1.5 text-[10px] font-semibold outline-none bg-white cursor-pointer"
              style={{ borderColor: C.border, color: C.slate }}>
              {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>

            <button onClick={handleCargar}
              disabled={loading}
              className="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase text-white transition-all active:scale-95 disabled:opacity-60"
              style={{ background: C.primary }}>
              {loading ? "Cargando..." : "Generar"}
            </button>

            {data && (
              <button onClick={handleExport}
                className="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase text-white transition-all active:scale-95 flex items-center gap-1.5"
                style={{ background: C.success }}>
                ↓ Excel
              </button>
            )}
            {data && (
              <button onClick={generarReporteVisual}
                className="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase text-white transition-all active:scale-95 flex items-center gap-1.5"
                style={{ background: "#1A3A6E" }}>
                📊 Ver Reporte
              </button>
            )}
          </div>
        </div>

        {/* Fila 2: Chips de canal + panel lateral de líneas */}
        {canalesDisp.length > 0 && (
          <div className="flex items-stretch">
            <div className="flex-1 px-5 py-3 flex flex-wrap items-center gap-2">
              <span className="text-[8px] font-black uppercase tracking-widest flex-shrink-0" style={{ color: C.muted }}>
                Canal de Publicidad:
              </span>

              {/* Chip "Todos" */}
              <button
                onClick={limpiarCanales}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[8px] font-black uppercase border transition-all"
                style={canalesSel.length === 0
                  ? { background: C.primary, color: "#fff", borderColor: C.primary }
                  : { background: "#fff",    color: C.muted, borderColor: C.border }
                }>
                Todos
              </button>

              {canalesDisp.map((canal) => {
                const cfg      = getCfg(canal);
                const sel      = canalesSel.includes(canal);
                const isDetail = canalDetalle === canal;
                return (
                  <div key={canal} className="inline-flex items-center gap-0.5">
                    <button onClick={() => toggleCanal(canal)}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-l-full text-[8px] font-black uppercase border transition-all hover:shadow-sm"
                      style={sel
                        ? { background: cfg.color, color: "#fff",    borderColor: cfg.color }
                        : { background: cfg.bg,    color: cfg.color, borderColor: `${cfg.color}40` }
                      }>
                      <span>{cfg.icon}</span><span>{cfg.label}</span>
                    </button>
                    <button onClick={() => setCanalDetalle(isDetail ? null : canal)}
                      className="inline-flex items-center justify-center w-5 h-[26px] rounded-r-full text-[9px] font-black border-l-0 border transition-all"
                      style={isDetail
                        ? { background: cfg.color,         color: "#fff", borderColor: cfg.color }
                        : sel
                          ? { background: `${cfg.color}cc`, color: "#fff", borderColor: `${cfg.color}cc` }
                          : { background: cfg.bg,           color: cfg.color, borderColor: `${cfg.color}40` }
                      }
                      title={`Ver líneas de ${cfg.label}`}>
                      {isDetail ? "▴" : "▾"}
                    </button>
                  </div>
                );
              })}

              {canalesSel.length > 0 && (
                <span className="text-[8px] font-medium ml-1" style={{ color: C.muted }}>
                  {canalesSel.length} canal{canalesSel.length !== 1 ? "es" : ""}
                  {" · "}
                  <button onClick={limpiarCanales} className="underline hover:no-underline" style={{ color: C.danger }}>
                    limpiar
                  </button>
                </span>
              )}

              {loading && dataLoaded.current && (
                <span className="text-[8px] font-medium ml-2 flex items-center gap-1" style={{ color: C.muted }}>
                  <span className="inline-block w-2 h-2 border border-current rounded-full animate-spin border-t-transparent" />
                  Actualizando...
                </span>
              )}
            </div>

            {canalDetalle && (
              <div className="border-l flex-shrink-0 px-4 py-3 min-w-[220px] max-w-[280px]"
                style={{ borderColor: C.border, background: `${getCfg(canalDetalle).bg}` }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[8px] font-black uppercase" style={{ color: getCfg(canalDetalle).color }}>
                    {getCfg(canalDetalle).icon} {getCfg(canalDetalle).label} — Líneas
                  </span>
                  <button onClick={() => setCanalDetalle(null)} className="text-[9px] font-bold hover:opacity-70"
                    style={{ color: getCfg(canalDetalle).color }}>✕</button>
                </div>
                <div className="space-y-1">
                  {(data?.canales_disponibles?.find(c => c.canal === canalDetalle)?.lineas
                    || []).map((linea) => (
                    <div key={linea} className="text-[8px] px-2 py-1 rounded-md font-medium"
                      style={{ background: "#ffffff80", color: C.slate }}>{linea}</div>
                  ))}
                </div>
                <p className="text-[7px] mt-2" style={{ color: C.muted }}>
                  La inversión del canal se asigna una sola vez (no por línea).
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {loading && !dataLoaded.current && (
        <div className="text-center py-16 text-sm font-medium" style={{ color: C.muted }}>Generando reporte...</div>
      )}

      {data && (
        <div style={{ opacity: loading ? 0.6 : 1, transition: "opacity 0.2s" }}>
          <div className="bg-white rounded-xl border shadow-sm px-6 py-4 flex items-center justify-between flex-wrap gap-3 mb-4"
            style={{ borderColor: C.border }}>
            <div>
              <div className="text-lg font-black" style={{ color: C.slate }}>
                Reporte Data — {MESES[data.meta.mes - 1]} {data.meta.anio}
              </div>
              <div className="text-[9px] font-medium uppercase tracking-widest mt-0.5" style={{ color: C.muted }}>
                NETLIFE VELSA · {canalesSel.length > 0 ? canalesSel.map((c) => getCfg(c).label).join(" · ") : "Todos los canales"}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {canalesSel.map((c) => {
                const cfg = getCfg(c);
                return (
                  <span key={c} className="text-[8px] font-black px-2.5 py-1 rounded-full inline-flex items-center gap-1"
                    style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}30` }}>
                    {cfg.icon} {cfg.label}
                  </span>
                );
              })}
              <span className="text-[9px] font-black px-3 py-1 rounded-full" style={{ background: `${C.primary}12`, color: C.primary }}>
                {data.meta.dias.length} días
              </span>
            </div>
          </div>

          <Block title="Inversión & Costos de Adquisición" accent={C.violet} id="bloque-inversion">
            <TablaHorizontal filas={buildInversionFilas(data, dias)} dias={dias} accent={C.violet} />
          </Block>

          <Block title="Leads por Canal + Etapas Bitrix" accent={C.primary} id="bloque-etapas">
            <TablaHorizontal filas={buildEtapasFilas(data, dias)} dias={dias} accent={C.primary} />
          </Block>

          <Block title="Estatus Ventas JOT" accent={C.success} id="bloque-jot">
            <TablaHorizontal filas={buildJotFilas(data, dias)} dias={dias} accent={C.success} />
          </Block>

          <Block title="Forma de Pago" accent={C.cyan} id="bloque-pago">
            <TablaHorizontal filas={buildPagoFilas(data, dias)} dias={dias} accent={C.cyan} />
          </Block>

          <Block title="Ciclo de Venta" accent={C.warning} id="bloque-ciclo">
            <TablaHorizontal filas={buildCicloFilas(data, dias)} dias={dias} accent={C.warning} />
          </Block>
        </div>
      )}
    </div>
  );
}
