// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  TabReporteData.jsx                                                      ║
// ║  Recibe prop `filtro` del Redes.jsx (filtro global de fechas)            ║
// ║  Selecciona mes/año propio para el reporte mensual                       ║
// ║  Orígenes agrupados por canal de publicidad                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝
import { useEffect, useState, useCallback } from "react";
import * as XLSX from "xlsx";

// ─────────────────────────────────────────────────────────────────────────────
// PALETA (misma que Redes.jsx)
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  primary:  "#1e3a8a",
  sky:      "#0ea5e9",
  success:  "#059669",
  warning:  "#f59e0b",
  danger:   "#ef4444",
  violet:   "#7c3aed",
  cyan:     "#06b6d4",
  slate:    "#334155",
  muted:    "#64748b",
  light:    "#f8fafc",
  border:   "#e2e8f0",
};

// Canales con identidad visual
const CANALES = {
  "ARTS":               { color: "#1e3a8a", bg: "#dbeafe", icon: "🎨", label: "ARTS" },
  "ARTS FACEBOOK":      { color: "#1877f2", bg: "#eff6ff", icon: "📘", label: "ARTS FB" },
  "ARTS GOOGLE":        { color: "#ea4335", bg: "#fee2e2", icon: "🔍", label: "ARTS GG" },
  "REMARKETING":        { color: "#7c3aed", bg: "#ede9fe", icon: "🔁", label: "REMARKETING" },
  "VIDIKA GOOGLE":      { color: "#059669", bg: "#d1fae5", icon: "📺", label: "VIDIKA GG" },
  "POR RECOMENDACIÓN":  { color: "#f59e0b", bg: "#fef3c7", icon: "🤝", label: "RECOMEND." },
  "MAL INGRESO":        { color: "#94a3b8", bg: "#f1f5f9", icon: "⚠️", label: "MAL ING." },
  "SIN MAPEO":          { color: "#cbd5e1", bg: "#f8fafc", icon: "❓", label: "SIN MAPEO" },
};

// Mapeo origen → canal
const ORIGEN_CANAL = {
  "BASE 593-979083368":                    "ARTS",
  "BASE 593-995211968":                    "ARTS FACEBOOK",
  "BASE 593-992827793":                    "ARTS GOOGLE",
  "FORMULARIO LANDING 3":                  "ARTS GOOGLE",
  "LLAMADA LANDING 3":                     "ARTS GOOGLE",
  "POR RECOMENDACIÓN":                     "POR RECOMENDACIÓN",
  "REFERIDO PERSONAL":                     "POR RECOMENDACIÓN",
  "TIENDA ONLINE":                         "POR RECOMENDACIÓN",
  "BASE 593-958993371":                    "REMARKETING",
  "BASE 593-984414273":                    "REMARKETING",
  "BASE 593-995967355":                    "REMARKETING",
  "WHATSAPP 593958993371":                 "REMARKETING",
  "BASE 593-962881280":                    "VIDIKA GOOGLE",
  "BASE 593-987133635":                    "VIDIKA GOOGLE",
  "BASE API 593963463480":                 "VIDIKA GOOGLE",
  "FORMULARIO LANDING 4":                  "VIDIKA GOOGLE",
  "LLAMADA":                               "VIDIKA GOOGLE",
  "LLAMADA LANDING 4":                     "VIDIKA GOOGLE",
  "BASE 593-958688121":                    "MAL INGRESO",
  "CONTRATO NETLIFE":                      "MAL INGRESO",
  "NO VOLVER A CONTACTAR":                 "MAL INGRESO",
  "OPORTUNIDADES":                         "MAL INGRESO",
  "WAZZUP: WHATSAPP - ECUANET REGESTION":  "MAL INGRESO",
  "ZONAS PELIGROSAS":                      "MAL INGRESO",
  "VENTA ECUANET DIRECTA":                 "MAL INGRESO",
};

const getCanal = (origen) => (!origen ? "SIN MAPEO" : ORIGEN_CANAL[origen.toUpperCase()] || ORIGEN_CANAL[origen] || "SIN MAPEO");
const getCfg   = (canal) => CANALES[canal] || { color: C.muted, bg: "#f8fafc", icon: "•", label: canal };

const API    = import.meta.env.VITE_API_URL;
const MESES  = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────────────────────
const n    = (v) => Number(v || 0);
const usd  = (v) => (v !== null && v !== undefined && !isNaN(n(v)) && n(v) !== 0) ? `$${n(v).toFixed(2)}` : "—";
const pf   = (v) => (v !== null && v !== undefined && !isNaN(n(v))) ? `${n(v).toFixed(1)}%` : "—";

/**
 * Formato "25 (12.5%)" — cantidad y porcentaje en la misma celda
 * Así se ahorra espacio y se evita añadir filas extra de porcentajes
 */
function fmtCantPct(cant, pct) {
  if (cant === undefined || cant === null) return "—";
  const c = n(cant);
  if (c === 0) return "—";
  if (pct !== null && pct !== undefined && !isNaN(n(pct))) {
    return `${c} (${n(pct).toFixed(1)}%)`;
  }
  return String(c);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS PARA CONSTRUIR MAPAS DÍA → VALOR
// ─────────────────────────────────────────────────────────────────────────────
function byDiaMap(rows, diaKey, valueKey) {
  const map = {};
  rows.forEach((r) => { map[r[diaKey]] = n(r[valueKey]); });
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
    <div id={id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
        <div className="w-1 h-7 rounded-full" style={{ background: accent }} />
        <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: accent }}>{title}</span>
      </div>
      <div className="overflow-auto">{children}</div>
    </div>
  );
}

/**
 * Tabla principal del reporte:
 * - Filas  = métricas
 * - Columnas = días 1..31 + TOTAL
 * - Cada celda puede mostrar solo valor o "valor (pct%)"
 */
function TablaHorizontal({ filas, dias, accent = C.primary }) {
  if (!filas || filas.length === 0) {
    return <p className="p-4 text-[9px] text-slate-400 italic">Sin datos</p>;
  }
  return (
    <table className="text-[8px] font-mono border-collapse w-full whitespace-nowrap">
      <thead className="sticky top-0 z-10 bg-slate-50 border-b-2 border-slate-200">
        <tr>
          <th className="px-3 py-2 text-left font-black text-slate-600 border-r border-slate-200 min-w-[180px] sticky left-0 bg-slate-50">
            MÉTRICA
          </th>
          {dias.map((d) => (
            <th key={d.dia} className="px-2 py-2 text-center font-black border-r border-slate-100 min-w-[56px]"
              style={{ color: accent }}>
              {d.dia}<br /><span className="font-medium text-slate-400">{d.nombre}</span>
            </th>
          ))}
          <th className="px-3 py-2 text-center font-black border-l border-slate-300 min-w-[72px]"
            style={{ color: accent }}>TOTAL</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((fila, fi) => (
          <tr
            key={fi}
            className={`border-b border-slate-100 hover:bg-slate-50 ${fila.separador ? "bg-slate-100" : ""}`}
          >
            {/* Columna de etiqueta */}
            <td className={`px-3 py-1.5 font-black text-[8px] border-r border-slate-200 sticky left-0 ${fila.separador ? "bg-slate-100 text-slate-500" : "bg-white text-slate-700"}`}>
              {fila.label}
            </td>

            {/* Columnas de días */}
            {dias.map((d) => {
              const val = fila.byDia?.[d.dia];
              const pct = fila.pctDia?.[d.dia];
              let display;

              if (fila.separador) {
                display = "";
              } else if (fila.fmt) {
                display = fila.fmt(val);
              } else if (fila.showPct) {
                display = fmtCantPct(val, pct);
              } else {
                display = (val !== undefined && val !== null && n(val) !== 0) ? String(n(val)) : "—";
              }

              return (
                <td key={d.dia} className="px-2 py-1.5 text-center border-r border-slate-100"
                  style={{ color: fila.color || C.muted }}>
                  {display}
                </td>
              );
            })}

            {/* Columna TOTAL */}
            <td className="px-3 py-1.5 text-center font-black border-l border-slate-200"
              style={{ color: fila.color || C.muted }}>
              {fila.separador ? "" :
                fila.fmt ? fila.fmt(fila.total) :
                fila.showPct ? fmtCantPct(fila.total, fila.totalPct) :
                (fila.total !== null && fila.total !== undefined ? String(n(fila.total) % 1 !== 0 ? n(fila.total).toFixed(2) : n(fila.total)) : "—")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILDERS DE FILAS — cada bloque tiene su propio builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BLOQUE 1: Inversión & Costos
 * La inversión viene de `inversion_usd` que ya está correcta en el backend
 * (una vez por canal×día gracias al JOIN con velsa_inversion_diaria).
 * Los costos se calculan aquí en frontend con los totales acumulados.
 */
function buildInversionFilas(d, dias) {
  if (!d.inversion) return [];
  const g = (key) => byDiaMap(d.inversion, "dia", key);

  const inv     = g("inversion_usd");
  const leads   = g("n_leads");
  const bitrix  = g("ingreso_bitrix");
  const jot     = g("ingreso_jot");
  const activos = g("activos");        // activos_mes (mismo mes del lead)
  const backlog = g("activo_backlog"); // activos cualquier fecha
  const negoc   = g("negociables");

  // Totales acumulados del mes
  const tInv    = totalFromMap(inv);
  const tLeads  = totalFromMap(leads);
  const tBitrix = totalFromMap(bitrix);
  const tJot    = totalFromMap(jot);
  const tAct    = totalFromMap(activos);
  const tBack   = totalFromMap(backlog);
  const tNegoc  = totalFromMap(negoc);

  return [
    {
      label: "INVERSIÓN DIARIA",
      byDia: inv, total: tInv,
      fmt: usd, color: C.violet,
    },
    {
      label: "CPL  (inv / leads totales)",
      byDia: divDiaMap(inv, leads),
      total: tLeads > 0 ? tInv / tLeads : null,
      fmt: usd, color: C.primary,
    },
    {
      label: "COSTO INGRESO (BITRIX)",
      byDia: divDiaMap(inv, bitrix),
      total: tBitrix > 0 ? tInv / tBitrix : null,
      fmt: usd,
    },
    {
      label: "COSTO INGRESO (JOT)",
      byDia: divDiaMap(inv, jot),
      total: tJot > 0 ? tInv / tJot : null,
      fmt: usd,
    },
    {
      label: "COSTO ACTIVA  (mismo mes)",
      byDia: divDiaMap(inv, activos),
      total: tAct > 0 ? tInv / tAct : null,
      fmt: usd, color: C.success,
    },
    {
      label: "COSTO ACTIVA + BACKLOG",
      byDia: divDiaMap(inv, backlog),
      total: tBack > 0 ? tInv / tBack : null,
      fmt: usd,
    },
    {
      label: "COSTO POR NEGOCIABLE",
      byDia: divDiaMap(inv, negoc),
      total: tNegoc > 0 ? tInv / tNegoc : null,
      fmt: usd, color: C.cyan,
    },
  ];
}

/** BLOQUE 2: Leads + Etapas Bitrix */
function buildEtapasFilas(d, dias) {
  if (!d.etapas) return [];
  const g = (key) => byDiaMap(d.etapas, "dia", key);

  const leads = g("total_leads");
  const atc   = g("atc_soporte");
  const fc    = g("fuera_cobertura");
  const zp    = g("zonas_peligrosas");
  const inn   = g("innegociable");
  const vs    = g("venta_subida");

  // Negociables = leads - todas las causas de no-contacto
  const negocMap = {};
  dias.forEach(({ dia }) => {
    negocMap[dia] = Math.max(0, n(leads[dia]) - n(atc[dia]) - n(fc[dia]) - n(zp[dia]) - n(inn[dia]));
  });

  const tL   = totalFromMap(leads), tA   = totalFromMap(atc);
  const tFC  = totalFromMap(fc),    tZP  = totalFromMap(zp);
  const tI   = totalFromMap(inn);
  const tNeg = Math.max(0, tL - tA - tFC - tZP - tI);
  const tVS  = totalFromMap(vs);

  const etapasExtra = [
    "seguimiento", "gestion_diaria", "doc_pendientes", "volver_llamar",
    "mantiene_proveedor", "otro_proveedor", "no_volver_contactar",
    "no_interesa_costo", "desiste_compra", "cliente_discapacidad",
    "oportunidades", "duplicado", "contrato_netlife",
  ];

  return [
    { label: "N LEADS",          byDia: leads,    total: tL,   color: C.primary },
    {
      label: "ATC / SOPORTE",    byDia: atc,      total: tA,
      pctDia: pctDiaMap(atc, leads), totalPct: tL > 0 ? (tA / tL) * 100 : null,
      showPct: true, color: C.danger,
    },
    {
      label: "FUERA COBERTURA",  byDia: fc,       total: tFC,
      pctDia: pctDiaMap(fc, leads), totalPct: tL > 0 ? (tFC / tL) * 100 : null,
      showPct: true,
    },
    {
      label: "ZONAS PELIGROSAS", byDia: zp,       total: tZP,
      pctDia: pctDiaMap(zp, leads), totalPct: tL > 0 ? (tZP / tL) * 100 : null,
      showPct: true,
    },
    {
      label: "INNEGOCIABLE",     byDia: inn,      total: tI,
      pctDia: pctDiaMap(inn, leads), totalPct: tL > 0 ? (tI / tL) * 100 : null,
      showPct: true, color: C.warning,
    },
    {
      label: "NEGOCIABLES",      byDia: negocMap, total: tNeg,
      pctDia: pctDiaMap(negocMap, leads), totalPct: tL > 0 ? (tNeg / tL) * 100 : null,
      showPct: true, color: C.success,
    },
    {
      label: "VENTA SUBIDA",     byDia: vs,       total: tVS,
      pctDia: pctDiaMap(vs, leads), totalPct: tL > 0 ? (tVS / tL) * 100 : null,
      showPct: true, color: C.primary,
    },
    {
      label: "% EFECTIVIDAD TOTAL",
      byDia: pctDiaMap(vs, leads),
      total: tL > 0 ? (tVS / tL) * 100 : null,
      fmt: pf, color: C.cyan,
    },
    {
      label: "% EFECT. NEGOCIABLES",
      byDia: pctDiaMap(vs, negocMap),
      total: tNeg > 0 ? (tVS / tNeg) * 100 : null,
      fmt: pf, color: C.violet,
    },
    { label: "── ETAPAS DETALLE ──", separador: true, byDia: {}, total: null },
    ...etapasExtra.map((k) => {
      const m = g(k), t = totalFromMap(m);
      return {
        label: k.replace(/_/g, " ").toUpperCase(),
        byDia: m, total: t,
        pctDia: pctDiaMap(m, leads),
        totalPct: tL > 0 ? (t / tL) * 100 : null,
        showPct: true, color: C.muted,
      };
    }),
  ];
}

/** BLOQUE 3: Estatus ventas JOT */
function buildJotFilas(d, dias) {
  if (!d.status_jot) return [];
  const g = (k) => byDiaMap(d.status_jot, "dia", k);

  const jot    = g("ingreso_jot");
  const bitrix = g("ingreso_bitrix");
  const act    = g("activos");
  const bk     = g("activo_backlog");
  const tvj    = g("total_ventas_jot");
  const dsj    = g("desiste_servicio_jot");
  const reg    = g("regularizados");
  const preg   = g("por_regularizar");

  const tJot = totalFromMap(jot), tAct = totalFromMap(act), tBk = totalFromMap(bk);

  return [
    { label: "INGRESO EN BITRIX",     byDia: bitrix, total: totalFromMap(bitrix), color: C.primary },
    { label: "INGRESO EN JOT",        byDia: jot,    total: tJot,                 color: C.success },
    {
      label: "ACTIVO + BACKLOG",
      byDia: addMaps(act, bk), total: tAct + tBk,
      pctDia: pctDiaMap(addMaps(act, bk), jot),
      totalPct: tJot > 0 ? ((tAct + tBk) / tJot) * 100 : null,
      showPct: true,
    },
    {
      label: "ACTIVO (MISMO MES)",
      byDia: act, total: tAct,
      pctDia: pctDiaMap(act, jot),
      totalPct: tJot > 0 ? (tAct / tJot) * 100 : null,
      showPct: true, color: C.success,
    },
    { label: "TOTAL VENTAS JOT",      byDia: tvj,  total: totalFromMap(tvj) },
    { label: "DESISTE SERVICIO JOT",  byDia: dsj,  total: totalFromMap(dsj),  color: C.danger },
    { label: "REGULARIZADOS",         byDia: reg,  total: totalFromMap(reg),  color: C.cyan },
    { label: "POR REGULARIZAR",       byDia: preg, total: totalFromMap(preg), color: C.warning },
  ];
}

/** BLOQUE 4: Forma de pago */
function buildPagoFilas(d, dias) {
  if (!d.pago) return [];
  const g = (k) => byDiaMap(d.pago, "dia", k);

  const pc  = g("pago_cuenta"),   pe  = g("pago_efectivo"),   pt  = g("pago_tarjeta");
  const pca = g("pago_cuenta_activa"), pea = g("pago_efectivo_activa"), pta = g("pago_tarjeta_activa");

  const totIngMap = Object.fromEntries(dias.map(({ dia }) => [dia, n(pc[dia]) + n(pe[dia]) + n(pt[dia])]));
  const totActMap = Object.fromEntries(dias.map(({ dia }) => [dia, n(pca[dia]) + n(pea[dia]) + n(pta[dia])]));

  const tPC = totalFromMap(pc),  tPE = totalFromMap(pe),  tPT = totalFromMap(pt);
  const tPCA = totalFromMap(pca), tPEA = totalFromMap(pea), tPTA = totalFromMap(pta);
  const tI = tPC + tPE + tPT, tA = tPCA + tPEA + tPTA;

  return [
    { label: "── INGRESOS JOT ──", separador: true, byDia: {}, total: null },
    { label: "CUENTA",    byDia: pc,  total: tPC,  pctDia: pctDiaMap(pc, totIngMap),  totalPct: tI > 0 ? (tPC  / tI) * 100 : null, showPct: true, color: C.cyan },
    { label: "EFECTIVO",  byDia: pe,  total: tPE,  pctDia: pctDiaMap(pe, totIngMap),  totalPct: tI > 0 ? (tPE  / tI) * 100 : null, showPct: true, color: C.success },
    { label: "TARJETA",   byDia: pt,  total: tPT,  pctDia: pctDiaMap(pt, totIngMap),  totalPct: tI > 0 ? (tPT  / tI) * 100 : null, showPct: true, color: C.primary },
    { label: "── ACTIVAS ──",        separador: true, byDia: {}, total: null },
    { label: "CUENTA",    byDia: pca, total: tPCA, pctDia: pctDiaMap(pca, totActMap), totalPct: tA > 0 ? (tPCA / tA) * 100 : null, showPct: true, color: C.cyan },
    { label: "EFECTIVO",  byDia: pea, total: tPEA, pctDia: pctDiaMap(pea, totActMap), totalPct: tA > 0 ? (tPEA / tA) * 100 : null, showPct: true, color: C.success },
    { label: "TARJETA",   byDia: pta, total: tPTA, pctDia: pctDiaMap(pta, totActMap), totalPct: tA > 0 ? (tPTA / tA) * 100 : null, showPct: true, color: C.primary },
  ];
}

/** BLOQUE 5: Ciclo de venta */
function buildCicloFilas(d, dias) {
  if (!d.ciclo) return [];
  const g = (k) => byDiaMap(d.ciclo, "dia", k);

  const keys   = ["ciclo_0", "ciclo_1", "ciclo_2", "ciclo_3", "ciclo_4", "ciclo_mas5"];
  const labels = ["0 DÍAS", "1 DÍA", "2 DÍAS", "3 DÍAS", "4 DÍAS", "MÁS DE 5 DÍAS"];
  const colors = [C.success, C.cyan, C.primary, C.warning, C.danger, C.violet];
  const maps   = keys.map((k) => g(k));
  const tots   = maps.map((m) => totalFromMap(m));
  const totTotal = tots.reduce((a, b) => a + b, 0);

  // Mapa de total por día (suma de todos los ciclos)
  const totalDiaMap = Object.fromEntries(
    dias.map(({ dia }) => [dia, keys.reduce((s, _k, i) => s + n(maps[i][dia]), 0)])
  );

  return [
    ...labels.map((lbl, i) => ({
      label:    lbl,
      byDia:    maps[i],
      total:    tots[i],
      pctDia:   pctDiaMap(maps[i], totalDiaMap),
      totalPct: totTotal > 0 ? (tots[i] / totTotal) * 100 : null,
      showPct:  true,
      color:    colors[i],
    })),
    { label: "TOTAL", byDia: totalDiaMap, total: totTotal, color: C.primary },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function TabReporteData({ filtro }) {
  const hoy = new Date();

  // El reporte es mensual — tiene su propio selector de mes/año
  // pero no duplica el filtro de fechas del header principal
  const [anio, setAnio]         = useState(hoy.getFullYear());
  const [mes,  setMes]          = useState(hoy.getMonth() + 1);
  const [origenes, setOrigenes] = useState([]);
  const [origenesDisp, setOrigenesDisp] = useState([]);
  const [data,    setData]      = useState(null);
  const [loading, setLoading]   = useState(false);

  const toggleOrigen = (o) =>
    setOrigenes((prev) => prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o]);

  // Cargar orígenes disponibles al cambiar mes/año
  useEffect(() => {
    fetch(`${API}/api/redes/reporte-data?anio=${anio}&mes=${mes}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setOrigenesDisp(d.origenes_disponibles || []); })
      .catch(() => {});
  }, [anio, mes]);

  const handleCargar = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ anio, mes, origenes: origenes.join(",") });
    fetch(`${API}/api/redes/reporte-data?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [anio, mes, origenes]);

  // ── Exportar a Excel ──────────────────────────────────────────────────────
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
          const val = f.byDia?.[d.dia];
          const pct = f.pctDia?.[d.dia];
          if (f.fmt)     { row.push(f.fmt(val)); return; }
          if (f.showPct) { row.push(fmtCantPct(val, pct)); return; }
          row.push(val !== undefined && n(val) !== 0 ? n(val) : "");
        });
        if (f.separador) { row.push(""); }
        else if (f.fmt)     { row.push(f.fmt(f.total)); }
        else if (f.showPct) { row.push(fmtCantPct(f.total, f.totalPct)); }
        else { row.push(f.total !== null && f.total !== undefined ? n(f.total) : ""); }
        return row;
      });
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      ws["!cols"] = [{ wch: 32 }, ...dias.map(() => ({ wch: 13 })), { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 31));
    };

    if (data.inversion?.length)   addSheet("Inversión-Costos",  buildInversionFilas(data, dias));
    if (data.etapas?.length)      addSheet("Leads-Etapas",       buildEtapasFilas(data, dias));
    if (data.status_jot?.length)  addSheet("Estatus JOT",        buildJotFilas(data, dias));
    if (data.pago?.length)        addSheet("Forma de Pago",      buildPagoFilas(data, dias));
    if (data.ciclo?.length)       addSheet("Ciclo Venta",        buildCicloFilas(data, dias));

    // Hoja Leads por hora
    if (data.hora?.length) {
      const totalLeadsHora = data.hora.reduce((s, r) => s + n(r.n_leads), 0);
      const ws = XLSX.utils.json_to_sheet(data.hora.map((h) => ({
        HORA:     `${String(h.hora).padStart(2, "0")}:00`,
        LEADS:    `${n(h.n_leads)} (${totalLeadsHora > 0 ? ((n(h.n_leads) / totalLeadsHora) * 100).toFixed(1) : 0}%)`,
        ATC:      n(h.atc),
        "% ATC":  `${n(h.pct_atc).toFixed(1)}%`,
      })));
      XLSX.utils.book_append_sheet(wb, ws, "Leads por Hora");
    }

    // Hoja Motivos ATC
    if (data.atc_totales?.length) {
      const totalAtc = data.atc_totales.reduce((s, r) => s + n(r.cantidad), 0);
      const ws = XLSX.utils.json_to_sheet(data.atc_totales.map((r) => ({
        MOTIVO:   r.motivo_atc,
        CANTIDAD: n(r.cantidad),
        "%":      totalAtc > 0 ? `${((n(r.cantidad) / totalAtc) * 100).toFixed(1)}%` : "0%",
      })));
      XLSX.utils.book_append_sheet(wb, ws, "Motivos ATC");
    }

    // Hoja Ciudad
    if (data.ciudad?.length) {
      const totalLeadsCiudad = data.ciudad.reduce((s, r) => s + n(r.total_leads), 0);
      const ws = XLSX.utils.json_to_sheet(data.ciudad.map((r) => ({
        CIUDAD:         r.ciudad,
        PROVINCIA:      r.provincia,
        LEADS:          `${n(r.total_leads)} (${totalLeadsCiudad > 0 ? ((n(r.total_leads) / totalLeadsCiudad) * 100).toFixed(1) : 0}%)`,
        ACTIVOS:        n(r.activos),
        "INGRESOS JOT": n(r.ingresos_jot),
        "% ACTIVOS":    `${n(r.pct_activos).toFixed(1)}%`,
      })));
      XLSX.utils.book_append_sheet(wb, ws, "Ciudad");
    }

    XLSX.writeFile(wb, `ReporteData_${MESES[mes - 1]}_${anio}.xlsx`);
  };

  // Agrupa orígenes disponibles por canal
  const canalesAgr = {};
  origenesDisp.forEach((o) => {
    const canal = getCanal(o);
    if (!canalesAgr[canal]) canalesAgr[canal] = [];
    canalesAgr[canal].push(o);
  });

  const dias = data?.meta?.dias || [];

  return (
    <div className="space-y-4">

      {/* ── Filtros ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1 h-7 rounded-full" style={{ background: C.primary }} />
          <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: C.primary }}>
            Filtros — Reporte Data
          </span>
        </div>

        {/* Selector de mes/año (distinto al filtro de fechas global — este es por mes completo) */}
        <div className="flex flex-wrap items-end gap-4 mb-4">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Año</label>
            <select
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
              className="border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-700 outline-none focus:border-blue-400 bg-white"
            >
              {[2024, 2025, 2026, 2027].map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Mes</label>
            <select
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
              className="border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-700 outline-none focus:border-blue-400 bg-white"
            >
              {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <button
            onClick={handleCargar}
            className="px-6 py-2 rounded-xl text-[10px] font-black uppercase text-white transition-all active:scale-95 shadow-sm"
            style={{ background: C.primary }}
          >
            {loading ? "Cargando..." : "Cargar Reporte"}
          </button>
          {data && (
            <button
              onClick={handleExport}
              className="px-6 py-2 rounded-xl text-[10px] font-black uppercase text-white transition-all active:scale-95 shadow-sm flex items-center gap-2"
              style={{ background: C.success }}
            >
              ⬇ Exportar Excel
            </button>
          )}
        </div>

        {/* Orígenes agrupados por canal */}
        {origenesDisp.length > 0 && (
          <div className="mt-2">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3">
              Filtrar por Origen (sin selección = todos)
            </div>
            {Object.entries(canalesAgr).map(([canal, lineas]) => {
              const cfg    = getCfg(canal);
              const allSel = lineas.every((l) => origenes.includes(l));
              return (
                <div key={canal} className="mb-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[8px] font-black uppercase" style={{ color: cfg.color }}>
                      {cfg.icon} {cfg.label}
                    </span>
                    <button
                      onClick={() => allSel
                        ? setOrigenes((p) => p.filter((o) => !lineas.includes(o)))
                        : setOrigenes((p) => [...new Set([...p, ...lineas])])
                      }
                      className="text-[7px] font-black uppercase px-2 py-0.5 rounded-full border transition-all"
                      style={allSel
                        ? { background: cfg.color, color: "#fff", borderColor: cfg.color }
                        : { background: cfg.bg,    color: cfg.color, borderColor: `${cfg.color}40` }
                      }
                    >
                      {allSel ? "✓ Todos" : "Sel. todos"}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 ml-4">
                    {lineas.map((o) => {
                      const sel = origenes.includes(o);
                      return (
                        <button
                          key={o}
                          onClick={() => toggleOrigen(o)}
                          className="px-2 py-0.5 rounded-full text-[8px] font-bold border transition-all"
                          style={sel
                            ? { background: cfg.color, color: "#fff",   borderColor: cfg.color }
                            : { background: "#fff",     color: C.muted,  borderColor: C.border }
                          }
                        >{o}</button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {origenes.length > 0 && (
              <div className="text-[8px] font-medium mt-1" style={{ color: C.muted }}>
                Canal(es): {[...new Set(origenes.map((o) => getCfg(getCanal(o)).label))].join(" · ")}
              </div>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div className="text-center py-16 text-slate-400 text-sm font-medium">Generando reporte...</div>
      )}

      {!loading && data && (
        <>
          {/* Cabecera del reporte */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-3 flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-lg font-black text-slate-800">
                Reporte Data — {MESES[data.meta.mes - 1]} {data.meta.anio}
              </div>
              <div className="text-[9px] text-slate-400 font-medium uppercase tracking-widest mt-0.5">
                NETLIFE VELSA · {origenes.length > 0 ? origenes.join(" · ") : "Todos los orígenes"}
              </div>
            </div>
            <span className="text-[9px] font-black px-3 py-1 rounded-full"
              style={{ background: `${C.primary}12`, color: C.primary }}>
              {data.meta.dias.length} días
            </span>
          </div>

          {/* BLOQUE 1 — Inversión & Costos */}
          <Block title="Inversión & Costos" accent={C.violet} id="bloque-inversion">
            <TablaHorizontal filas={buildInversionFilas(data, dias)} dias={dias} accent={C.violet} />
          </Block>

          {/* BLOQUE 2 — Leads + Etapas Bitrix */}
          <Block title="Leads por Origen + Etapas Bitrix" accent={C.primary} id="bloque-etapas">
            <TablaHorizontal filas={buildEtapasFilas(data, dias)} dias={dias} accent={C.primary} />
          </Block>

          {/* BLOQUE 3 — Estatus Ventas JOT */}
          <Block title="Estatus Ventas JOT" accent={C.success} id="bloque-jot">
            <TablaHorizontal filas={buildJotFilas(data, dias)} dias={dias} accent={C.success} />
          </Block>

          {/* BLOQUE 4 — Forma de Pago */}
          <Block title="Forma de Pago" accent={C.cyan} id="bloque-pago">
            <TablaHorizontal filas={buildPagoFilas(data, dias)} dias={dias} accent={C.cyan} />
          </Block>

          {/* BLOQUE 5 — Ciclo de Venta */}
          <Block title="Ciclo de Venta" accent={C.warning} id="bloque-ciclo">
            <TablaHorizontal filas={buildCicloFilas(data, dias)} dias={dias} accent={C.warning} />
          </Block>

          {/* BLOQUE 6 — Leads por Hora */}
          <Block title="Leads por Hora del Día" accent={C.cyan} id="bloque-hora">
            <table className="text-[8px] font-mono border-collapse w-full whitespace-nowrap">
              <thead className="sticky top-0 bg-slate-50 border-b-2 border-slate-200">
                <tr>
                  {["HORA", "LEADS (%)", "ATC", "% ATC"].map((h) => (
                    <th key={h} className="px-4 py-2 text-center font-black border-r border-slate-100 last:border-r-0"
                      style={{ color: C.cyan }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const totalLeadsHora = (data.hora || []).reduce((s, r) => s + n(r.n_leads), 0);
                  return (data.hora || []).map((h, i) => {
                    const pctLeads = totalLeadsHora > 0 ? ((n(h.n_leads) / totalLeadsHora) * 100).toFixed(1) : "0";
                    return (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-1.5 text-center font-black border-r border-slate-100" style={{ color: C.violet }}>
                          {String(h.hora).padStart(2, "0")}:00
                        </td>
                        <td className="px-4 py-1.5 text-center border-r border-slate-100" style={{ color: C.primary }}>
                          {n(h.n_leads)} <span style={{ color: C.muted }}>({pctLeads}%)</span>
                        </td>
                        <td className="px-4 py-1.5 text-center border-r border-slate-100" style={{ color: C.danger }}>
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

          {/* BLOQUE 7 — Motivos ATC */}
          <Block title="Motivos ATC" accent={C.danger} id="bloque-atc">
            <div className="p-4 space-y-2.5">
              {(() => {
                const total = (data.atc_totales || []).reduce((s, r) => s + n(r.cantidad), 0);
                return (data.atc_totales || []).map((r, i) => {
                  const pct = total > 0 ? ((n(r.cantidad) / total) * 100).toFixed(1) : "0";
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="text-[9px] font-bold w-52 truncate" style={{ color: C.slate }}>{r.motivo_atc}</div>
                      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: C.danger }} />
                      </div>
                      <div className="text-[9px] font-black" style={{ color: C.danger }}>
                        {n(r.cantidad)} <span style={{ color: C.muted }}>({pct}%)</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </Block>

          {/* BLOQUE 8 — Activos e Ingresos por Ciudad */}
          <Block title="Activos e Ingresos por Ciudad" accent={C.primary} id="bloque-ciudad">
            <table className="text-[8px] font-mono border-collapse w-full whitespace-nowrap">
              <thead className="sticky top-0 bg-slate-50 border-b-2 border-slate-200">
                <tr>
                  {["CIUDAD", "PROVINCIA", "LEADS (%)", "ACTIVOS", "INGRESOS JOT", "% ACTIVOS"].map((h) => (
                    <th key={h} className="px-4 py-2 text-center font-black border-r border-slate-100 last:border-r-0"
                      style={{ color: C.primary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const totalLeadsCiudad = (data.ciudad || []).reduce((s, r) => s + n(r.total_leads), 0);
                  return (data.ciudad || []).map((r, i) => {
                    const pctLeads = totalLeadsCiudad > 0 ? ((n(r.total_leads) / totalLeadsCiudad) * 100).toFixed(1) : "0";
                    return (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-1.5 font-black border-r border-slate-100" style={{ color: C.cyan }}>{r.ciudad}</td>
                        <td className="px-4 py-1.5 text-slate-500 border-r border-slate-100">{r.provincia}</td>
                        <td className="px-4 py-1.5 text-center border-r border-slate-100" style={{ color: C.primary }}>
                          {n(r.total_leads)} <span style={{ color: C.muted }}>({pctLeads}%)</span>
                        </td>
                        <td className="px-4 py-1.5 text-center font-black border-r border-slate-100" style={{ color: C.success }}>
                          {n(r.activos)}
                        </td>
                        <td className="px-4 py-1.5 text-center border-r border-slate-100">{n(r.ingresos_jot)}</td>
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
        </>
      )}

      {!loading && !data && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="text-5xl">📑</div>
          <div className="text-sm font-black text-slate-600">Selecciona mes, año y presiona "Cargar Reporte"</div>
          <div className="text-xs text-slate-400 text-center max-w-sm leading-relaxed">
            Puedes filtrar por origen / canal o dejar vacío para ver el consolidado de todas las campañas.
          </div>
        </div>
      )}
    </div>
  );
}