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

  // ─── Reporte Visual Gerencial ───────────────────────────────────────────────
  const generarReporteVisual = () => {
    if (!data) return;
    const mesNombre = MESES[data.meta.mes - 1];
    const anioR     = data.meta.anio;
    const dias      = data.meta.dias;
    const fechaGen  = new Date().toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' });
    const horaGen   = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });

    const totInv     = (data.inversion  || []).reduce((s, r) => s + n(r.inversion_usd),  0);
    const totLeads   = (data.etapas     || []).reduce((s, r) => s + n(r.total_leads),     0);
    const totVS      = (data.etapas     || []).reduce((s, r) => s + n(r.venta_subida),    0);
    const totJot     = (data.status_jot || []).reduce((s, r) => s + n(r.ingreso_jot),     0);
    const totActivos = (data.status_jot || []).reduce((s, r) => s + n(r.activos),         0);
    const efect      = totLeads > 0 ? ((totVS / totLeads) * 100).toFixed(1) + '%' : '—';
    const cplStr     = totLeads > 0 ? '$' + (totInv / totLeads).toFixed(2) : '—';
    const canalesStr = canalesSel.length > 0 ? canalesSel.map(c => getCfg(c).label).join(' · ') : 'Todos los canales';

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

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Reporte Data Redes — ${mesNombre} ${anioR}</title>
<style>
@page{size:A4 landscape;margin:0mm 12mm 10mm;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:7.5pt;color:#0f172a;background:#fff;}
.pgbreak{page-break-before:always;}
.topbar{height:6px;background:linear-gradient(90deg,#1A3A6E 0%,#378ADD 65%,#70bdf5 100%);print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1A3A6E;padding:8px 0 8px;margin-bottom:10px;}
.hdr-logo{display:flex;align-items:center;gap:9px;}
.hdr-badge{background:#1A3A6E;color:#fff;font-size:10pt;font-weight:900;padding:4px 10px;border-radius:5px;letter-spacing:1px;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.hdr h1{font-size:12pt;font-weight:900;color:#1A3A6E;letter-spacing:-0.3px;margin:0;}
.hdr p{font-size:7pt;color:#64748b;margin-top:2px;}
.hdr-r{text-align:right;font-size:7pt;color:#64748b;line-height:1.7;}
.hdr-r .periodo{font-size:10pt;font-weight:900;color:#1A3A6E;}
.kgrid{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;margin-bottom:11px;}
.kcard{border-radius:7px;padding:8px 6px;border-width:1px;border-style:solid;text-align:center;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.kcard .lbl{font-size:5.5pt;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:3px;letter-spacing:.3px;}
.kcard .val{font-size:17pt;font-weight:900;line-height:1.1;}
.sec{font-size:7pt;font-weight:900;text-transform:uppercase;letter-spacing:.9px;color:#1A3A6E;border-left:3px solid #378ADD;padding:4px 8px;margin:10px 0 4px;background:#eef4fc;border-radius:0 4px 4px 0;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
table{width:100%;border-collapse:collapse;margin-bottom:9px;font-size:6.5pt;}
th{background:#1A3A6E;color:#fff;font-size:6pt;font-weight:700;padding:5px 3px;text-align:center;text-transform:uppercase;letter-spacing:.2px;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
th span{font-weight:400;font-size:5pt;display:block;color:#a8c8f0;}
td{padding:3.5px 3px;border-bottom:1px solid #dbe8f8;text-align:center;color:#475569;}
tr:nth-child(even) td{background:#f0f6ff;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.tdn{text-align:left!important;font-weight:700;padding-left:6px!important;font-size:6.5pt;min-width:200px;}
.tot{font-weight:900;color:#1A3A6E!important;border-left:1px solid #c4d9f0;}
.sep-row{background:#eef4fc!important;font-weight:900;font-size:5.5pt;color:#1A3A6E;padding:4px 6px;letter-spacing:.5px;text-align:left;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.ftr{margin-top:12px;padding-top:6px;border-top:2px solid #1A3A6E;font-size:6pt;color:#64748b;display:flex;justify-content:space-between;align-items:center;}
.ftr-logo{font-weight:900;color:#1A3A6E;letter-spacing:.5px;font-size:7pt;}
</style></head><body>
<div class="topbar"></div>
<div class="hdr">
  <div class="hdr-logo">
    <span class="hdr-badge">NOVO ERP</span>
    <div><h1>REPORTE DATA — REDES DIGITALES</h1><p>Análisis de Canales de Publicidad &nbsp;·&nbsp; ${canalesStr}</p></div>
  </div>
  <div class="hdr-r"><div class="periodo">${mesNombre.toUpperCase()} ${anioR}</div><div>Generado: ${fechaGen} &nbsp;·&nbsp; ${horaGen} &nbsp;·&nbsp; ${dias.length} días analizados</div></div>
</div>
<div class="kgrid">${kpis.map(k => `<div class="kcard" style="background:${k.bg};border-color:${k.c}40"><div class="lbl">${k.l}</div><div class="val" style="color:${k.c}">${k.v}</div></div>`).join('')}</div>
<div class="sec">💰 Inversión &amp; Costos de Adquisición</div>
${buildTableHTML(buildInversionFilas(data, dias), dias)}
<div class="sec">📊 Leads por Canal + Etapas Bitrix</div>
${buildTableHTML(buildEtapasFilas(data, dias), dias)}
<div class="ftr"><span class="ftr-logo">▌ NOVO ERP · NETLIFE VELSA</span><span>Reporte Data — Redes Digitales · Confidencial · Uso Gerencial</span><span>Página 1 / 2</span></div>
<div class="pgbreak"></div>
<div class="topbar"></div>
<div class="hdr">
  <div class="hdr-logo">
    <span class="hdr-badge">NOVO ERP</span>
    <div><h1>REPORTE DATA — CONTINUACIÓN</h1><p>${mesNombre.toUpperCase()} ${anioR} &nbsp;·&nbsp; ${canalesStr}</p></div>
  </div>
  <div class="hdr-r"><div class="periodo">ESTATUS &amp; MÉTRICAS DE CIERRE</div><div>Generado: ${horaGen}</div></div>
</div>
<div class="sec">📋 Estatus Ventas JOT</div>
${buildTableHTML(buildJotFilas(data, dias), dias)}
<div class="sec">💳 Forma de Pago</div>
${buildTableHTML(buildPagoFilas(data, dias), dias)}
<div class="sec">⏱️ Ciclo de Venta</div>
${buildTableHTML(buildCicloFilas(data, dias), dias)}
<div class="ftr"><span class="ftr-logo">▌ NOVO ERP · NETLIFE VELSA</span><span>Reporte Data — Redes Digitales · Confidencial · Generado: ${fechaGen}</span><span>Página 2 / 2</span></div>
<script>window.onload=()=>setTimeout(()=>window.print(),400);</script>
</body></html>`;

    const w = window.open('', '_blank', 'width=1100,height=760');
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

          <Block title="Leads por Hora del Día" accent={C.cyan} id="bloque-hora">
            <table className="text-[8px] font-mono border-collapse w-full whitespace-nowrap">
              <thead className="sticky top-0 border-b-2" style={{ background: C.bgHeader, borderColor: C.border }}>
                <tr>
                  {["HORA","LEADS (%)","ATC","% ATC"].map((h) => (
                    <th key={h} className="px-4 py-2 text-center font-black border-r last:border-r-0"
                      style={{ color: C.cyan, borderColor: C.border }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const totalH = (data.hora || []).reduce((s, r) => s + n(r.n_leads), 0);
                  return (data.hora || []).map((h, i) => {
                    const pct = totalH > 0 ? ((n(h.n_leads) / totalH) * 100).toFixed(1) : "0";
                    return (
                      <tr key={i} className="border-b hover:bg-blue-50/20" style={{ borderColor: C.border }}>
                        <td className="px-4 py-1.5 text-center font-black border-r" style={{ color: C.violet, borderColor: C.border }}>
                          {String(h.hora).padStart(2, "0")}:00
                        </td>
                        <td className="px-4 py-1.5 text-center border-r" style={{ color: C.primary, borderColor: C.border }}>
                          {n(h.n_leads)} <span style={{ color: C.muted }}>({pct}%)</span>
                        </td>
                        <td className="px-4 py-1.5 text-center border-r" style={{ color: C.danger, borderColor: C.border }}>
                          {n(h.atc)}
                        </td>
                        <td className="px-4 py-1.5 text-center font-black"
                          style={{ color: n(h.pct_atc) > 40 ? C.danger : n(h.pct_atc) > 20 ? C.warning : C.success }}>
                          {n(h.pct_atc).toFixed(1)}%
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </Block>

          <Block title="Motivos ATC" accent={C.danger} id="bloque-atc">
            <div className="p-5 space-y-3">
              {(() => {
                const total = (data.atc_totales || []).reduce((s, r) => s + n(r.cantidad), 0);
                return (data.atc_totales || []).map((r, i) => {
                  const pct = total > 0 ? ((n(r.cantidad) / total) * 100).toFixed(1) : "0";
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="text-[9px] font-semibold w-52 truncate" style={{ color: C.slate }}>{r.motivo_atc}</div>
                      <div className="flex-1 rounded-full h-1.5 overflow-hidden" style={{ background: `${C.danger}15` }}>
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: C.danger }} />
                      </div>
                      <div className="text-[9px] font-black w-10 text-right" style={{ color: C.danger }}>{n(r.cantidad)}</div>
                      <div className="text-[9px] w-10 text-right" style={{ color: C.muted }}>{pct}%</div>
                    </div>
                  );
                });
              })()}
            </div>
          </Block>

          <Block title="Activos e Ingresos por Ciudad" accent={C.primary} id="bloque-ciudad">
            <table className="text-[8px] font-mono border-collapse w-full whitespace-nowrap">
              <thead className="sticky top-0 border-b-2" style={{ background: C.bgHeader, borderColor: C.border }}>
                <tr>
                  {["CIUDAD","PROVINCIA","LEADS (%)","ACTIVOS","INGRESOS JOT","% ACTIVOS"].map((h) => (
                    <th key={h} className="px-4 py-2 text-center font-black border-r last:border-r-0"
                      style={{ color: C.primary, borderColor: C.border }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const totalC = (data.ciudad || []).reduce((s, r) => s + n(r.total_leads), 0);
                  return (data.ciudad || []).map((r, i) => {
                    const pct = totalC > 0 ? ((n(r.total_leads) / totalC) * 100).toFixed(1) : "0";
                    return (
                      <tr key={i} className="border-b hover:bg-blue-50/20" style={{ borderColor: C.border }}>
                        <td className="px-4 py-1.5 font-black border-r" style={{ color: C.cyan, borderColor: C.border }}>{r.ciudad}</td>
                        <td className="px-4 py-1.5 border-r" style={{ color: C.muted, borderColor: C.border }}>{r.provincia}</td>
                        <td className="px-4 py-1.5 text-center border-r" style={{ color: C.primary, borderColor: C.border }}>
                          {n(r.total_leads)} <span style={{ color: C.muted }}>({pct}%)</span>
                        </td>
                        <td className="px-4 py-1.5 text-center font-black border-r" style={{ color: C.success, borderColor: C.border }}>{n(r.activos)}</td>
                        <td className="px-4 py-1.5 text-center border-r" style={{ color: C.slate, borderColor: C.border }}>{n(r.ingresos_jot)}</td>
                        <td className="px-4 py-1.5 text-center font-black"
                          style={{ color: n(r.pct_activos) >= 10 ? C.success : n(r.pct_activos) >= 5 ? C.warning : C.danger }}>
                          {n(r.pct_activos).toFixed(1)}%
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </Block>
        </div>
      )}

      {!loading && !data && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl" style={{ background: `${C.primary}10` }}>📑</div>
          <div className="text-sm font-black" style={{ color: C.slate }}>Selecciona mes, año y presiona "Generar"</div>
          <div className="text-xs text-center max-w-sm leading-relaxed" style={{ color: C.muted }}>
            Filtra por canal de publicidad para ver datos específicos, o deja en "Todos" para el consolidado.
          </div>
        </div>
      )}
    </div>
  );
}