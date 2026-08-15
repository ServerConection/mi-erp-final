// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  TabComparativo.jsx — Comparativo Semanas & Meses VELSA NETLIFE         ║
// ║  Compara: semana actual vs semanas del mismo mes                        ║
// ║           mes actual vs meses anteriores                                ║
// ║  KPIs: Leads · Efectividad · CPL · ATC · Activos · V.Subida · ROAS     ║
// ╚══════════════════════════════════════════════════════════════════════════╝
import { useEffect, useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";

// ── Colores base (mismo sistema que Redes.jsx) ────────────────────────────────
const C = {
  primary: "#1e3a8a", sky: "#0ea5e9", success: "#059669",
  warning: "#f59e0b", danger: "#ef4444", violet: "#7c3aed",
  cyan: "#06b6d4", slate: "#334155", muted: "#64748b",
  light: "#f8fafc", border: "#e2e8f0", orange: "#ea580c",
};

// Paleta para semanas (4 semanas máx)
const SEMANA_COLS = ["#1e3a8a", "#0ea5e9", "#059669", "#f59e0b"];
// Paleta para meses (6 meses)
const MES_COLS   = ["#1e3a8a", "#7c3aed", "#0ea5e9", "#059669", "#f59e0b", "#ef4444"];

const API = import.meta.env.VITE_API_URL;
const n   = (v) => Number(v || 0);
const safe = (v) => isFinite(n(v)) ? n(v) : 0;
const pct  = (a, b) => b > 0 ? (a / b) * 100 : 0;
const fmtP = (v) => `${safe(v).toFixed(1)}%`;
const fmtU = (v) => `$${safe(v).toFixed(2)}`;
const fmtN = (v) => String(Math.round(safe(v)));

// ── Helpers de fecha ──────────────────────────────────────────────────────────
const toISO = (d) => d.toISOString().split("T")[0];

function getSemanasDelMes(año, mes) {
  // Devuelve las semanas del mes como { label, desde, hasta, num }
  const semanas = [];
  const primerDia = new Date(año, mes - 1, 1);
  const ultimoDia = new Date(año, mes, 0);
  let cursor = new Date(primerDia);
  let num = 1;
  while (cursor <= ultimoDia) {
    const desde = new Date(cursor);
    // Fin de semana: domingo o fin de mes
    const finSemana = new Date(cursor);
    finSemana.setDate(finSemana.getDate() + (6 - finSemana.getDay()));
    const hasta = finSemana > ultimoDia ? new Date(ultimoDia) : finSemana;
    semanas.push({
      num,
      label: `Sem ${num}`,
      labelFull: `${desde.getDate()}/${mes} – ${hasta.getDate()}/${mes}`,
      desde: toISO(desde),
      hasta: toISO(hasta),
    });
    cursor = new Date(hasta);
    cursor.setDate(cursor.getDate() + 1);
    num++;
  }
  return semanas;
}

function getMesesAnteriores(n = 5) {
  const meses = [];
  const hoy = new Date();
  for (let i = n; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const nombres = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    meses.push({
      label: `${nombres[d.getMonth()]} ${d.getFullYear()}`,
      labelCorto: nombres[d.getMonth()],
      desde: toISO(d),
      hasta: toISO(ultimo),
      esMesActual: i === 0,
    });
  }
  return meses;
}

// ── Fetch datos de un período ────────────────────────────────────────────────
async function fetchPeriodo(desde, hasta) {
  try {
    const r = await fetch(`${API}/api/redes/monitoreo-redes?fechaDesde=${desde}&fechaHasta=${hasta}`);
    const d = await r.json();
    if (!d.success || !d.data) return null;

    // Agregar totales de todas las filas
    const filas = d.data;
    const invSet = new Set();
    let leads = 0, neg = 0, atc = 0, vsub = 0, jot = 0, act = 0, inv = 0, backlog = 0;

    filas.forEach(row => {
      leads   += n(row.n_leads);
      neg     += n(row.negociables);
      atc     += n(row.atc_soporte);
      vsub    += n(row.venta_subida_bitrix);
      jot     += n(row.ingreso_jot);
      act     += n(row.activos_mes);
      backlog += n(row.activo_backlog);
      const canal = row.canal_inversion || row.canal_publicidad || "?";
      const fecha = String(row.fecha).split("T")[0];
      const k = `${fecha}|${canal}`;
      if (!invSet.has(k) && n(row.inversion_usd) > 0) {
        inv += n(row.inversion_usd);
        invSet.add(k);
      }
    });

    const efect   = pct(act, leads);
    const pctAtc  = pct(atc, leads);
    const pctNeg  = pct(neg, leads);
    const pctVsub = pct(vsub, leads);
    const cpl     = leads > 0 && inv > 0 ? inv / leads : null;
    const cpAct   = act   > 0 && inv > 0 ? inv / act   : null;
    const roas    = inv > 0 ? (act * 25) / inv : null; // ticket estimado $25

    return {
      desde, hasta,
      leads, neg, atc, vsub, jot, act, inv, backlog,
      efect, pctAtc, pctNeg, pctVsub,
      cpl, cpAct, roas,
      // Para canales
      canales: agregarPorCanalLocal(filas),
    };
  } catch (e) {
    return null;
  }
}

function agregarPorCanalLocal(filas) {
  const map = {}, invC = {};
  filas.forEach(row => {
    const canal = row.canal_inversion || "?";
    if (canal === "MAL INGRESO" || canal === "SIN MAPEO") return;
    if (!map[canal]) map[canal] = { canal, leads: 0, act: 0, vsub: 0, jot: 0, atc: 0, inv: 0 };
    map[canal].leads += n(row.n_leads);
    map[canal].act   += n(row.activos_mes);
    map[canal].vsub  += n(row.venta_subida_bitrix);
    map[canal].jot   += n(row.ingreso_jot);
    map[canal].atc   += n(row.atc_soporte);
    const k = `${String(row.fecha).split("T")[0]}|${canal}`;
    if (!invC[k] && n(row.inversion_usd) > 0) { map[canal].inv += n(row.inversion_usd); invC[k] = true; }
  });
  return Object.values(map);
}

// ── Calcular variación % entre dos valores ───────────────────────────────────
function variacion(actual, anterior) {
  if (!anterior || anterior === 0) return null;
  return ((actual - anterior) / anterior) * 100;
}

// ── Componentes UI ────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-10 h-10 border-4 rounded-full animate-spin"
        style={{ borderColor: `${C.primary}30`, borderTopColor: C.primary }} />
    </div>
  );
}

function Card({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${className}`}
      style={{ borderColor: C.border }}>{children}</div>
  );
}

function CardHeader({ title, subtitle, accent = C.primary, badge }) {
  return (
    <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap"
      style={{ borderColor: C.border }}>
      <div className="flex items-center gap-3">
        <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: accent }} />
        <div>
          <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: accent }}>{title}</div>
          {subtitle && <div className="text-[9px] font-medium mt-0.5" style={{ color: C.muted }}>{subtitle}</div>}
        </div>
      </div>
      {badge && <div className="flex items-center gap-2 flex-wrap">{badge}</div>}
    </div>
  );
}

// Chip de variación con flecha
function VarChip({ valor, invertir = false, size = "sm" }) {
  if (valor === null || !isFinite(valor)) return <span className="text-[8px]" style={{ color: C.muted }}>—</span>;
  const positivo = invertir ? valor < 0 : valor > 0;
  const abs = Math.abs(valor);
  const color = positivo ? C.success : C.danger;
  const bg    = positivo ? "#d1fae5" : "#fee2e2";
  const arrow = positivo ? "▲" : "▼";
  const cls   = size === "sm" ? "text-[8px] px-1.5 py-0.5" : "text-[9px] px-2 py-0.5";
  return (
    <span className={`${cls} rounded-full font-black inline-flex items-center gap-0.5`}
      style={{ background: bg, color }}>
      {arrow} {abs.toFixed(1)}%
    </span>
  );
}

// KPI card con variación
function KpiComp({ label, actual, anterior, fmt = fmtN, color = C.primary, icon, invertir = false, info }) {
  const var_ = variacion(actual, anterior);
  return (
    <div className="bg-white rounded-2xl border shadow-sm p-4" style={{ borderColor: C.border }}>
      <div className="flex items-start justify-between mb-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
          style={{ background: `${color}15` }}>{icon}</div>
        <VarChip valor={var_} invertir={invertir} />
      </div>
      <div className="text-[8px] font-black uppercase tracking-widest mb-0.5" style={{ color: C.muted }}>{label}</div>
      <div className="text-xl font-black leading-tight" style={{ color }}>{fmt(actual)}</div>
      {anterior !== null && anterior !== undefined && (
        <div className="text-[8px] mt-1" style={{ color: C.muted }}>
          Anterior: <span className="font-bold">{fmt(anterior)}</span>
        </div>
      )}
      {info && <div className="text-[7.5px] mt-1.5 leading-relaxed" style={{ color: C.muted }}>{info}</div>}
    </div>
  );
}

// Tooltip custom
const CTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border rounded-xl shadow-xl px-4 py-3 text-[10px] max-w-xs z-50"
      style={{ borderColor: C.border }}>
      <div className="font-black mb-2 uppercase text-[9px]" style={{ color: C.slate }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-0.5">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color || p.fill }} />
          <span style={{ color: C.muted }}>{p.name}:</span>
          <span className="font-black" style={{ color: C.slate }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ── Panel de Semana actual vs semanas del mismo mes ───────────────────────────
function PanelSemanas({ año, mes }) {
  const [semanas, setSemanas]     = useState([]);
  const [dataSem, setDataSem]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [semActual, setSemActual] = useState(null);
  const [metrica, setMetrica]     = useState("leads");

  useEffect(() => {
    const sems = getSemanasDelMes(año, mes);
    setSemanas(sems);

    // Detectar semana actual
    const hoy = toISO(new Date());
    const actual = sems.findIndex(s => s.desde <= hoy && s.hasta >= hoy);
    setSemActual(actual >= 0 ? actual : sems.length - 1);

    setLoading(true);
    Promise.all(sems.map(s => fetchPeriodo(s.desde, s.hasta)))
      .then(results => setDataSem(results))
      .finally(() => setLoading(false));
  }, [año, mes]);

  const METRICAS = [
    { key: "leads",   label: "Leads",        fmt: fmtN, color: C.primary,  icon: "👥", inv: false, info: "Total leads ingresados en la semana" },
    { key: "efect",   label: "Efectividad %", fmt: fmtP, color: C.success,  icon: "✅", inv: false, info: "% activos / leads — qué tan bien convierte" },
    { key: "pctAtc",  label: "% ATC",         fmt: fmtP, color: C.danger,   icon: "📞", inv: true,  info: "% leads que van a soporte — menor es mejor" },
    { key: "vsub",    label: "Ventas Subidas", fmt: fmtN, color: C.sky,      icon: "📈", inv: false, info: "Contratos subidos al sistema en la semana" },
    { key: "act",     label: "Activos Mes",   fmt: fmtN, color: "#10b981",  icon: "🟢", inv: false, info: "Clientes activados durante la semana" },
    { key: "cpl",     label: "CPL $",         fmt: fmtU, color: C.violet,   icon: "💸", inv: true,  info: "Costo por lead — menor es mejor" },
    { key: "cpAct",   label: "CP Activado $", fmt: fmtU, color: C.orange,   icon: "🎯", inv: true,  info: "Inversión / cliente activado — menor es mejor" },
    { key: "inv",     label: "Inversión $",   fmt: fmtU, color: C.violet,   icon: "💰", inv: false, info: "Gasto en pauta durante la semana" },
  ];

  const cfg = METRICAS.find(m => m.key === metrica) || METRICAS[0];

  // Datos para gráfico de barras comparativo
  const barData = semanas.map((s, i) => {
    const d = dataSem[i];
    if (!d) return { name: s.label, val: 0, rango: s.labelFull };
    const val = metrica === "efect"  ? d.efect   :
                metrica === "pctAtc" ? d.pctAtc  :
                metrica === "cpl"    ? (d.cpl ?? 0) :
                metrica === "cpAct"  ? (d.cpAct ?? 0) :
                d[metrica] ?? 0;
    return { name: s.label, val: parseFloat(safe(val).toFixed(2)), rango: s.labelFull, esActual: i === semActual };
  });

  // Datos radar (normalizado 0-100 para cada métrica)
  const radarDims = ["leads", "efect", "pctAtc", "vsub", "act"];
  const maximos = radarDims.reduce((acc, k) => {
    acc[k] = Math.max(1, ...dataSem.filter(Boolean).map(d => safe(d[k])));
    return acc;
  }, {});

  const radarData = radarDims.map(k => {
    const entry = { dim: { leads: "Leads", efect: "Efectiv.", pctAtc: "ATC", vsub: "V.Subida", act: "Activos" }[k] };
    semanas.forEach((s, i) => {
      const d = dataSem[i];
      const raw = d ? safe(d[k]) : 0;
      // Para ATC invertir (menos = mejor = más alto en radar)
      entry[s.label] = k === "pctAtc" ? Math.max(0, 100 - (raw / maximos[k]) * 100) : (raw / maximos[k]) * 100;
    });
    return entry;
  });

  if (loading) return <Spinner />;

  const semActualData   = dataSem[semActual];
  const semAnteriorData = semActual > 0 ? dataSem[semActual - 1] : null;

  return (
    <div className="space-y-5">
      {/* KPIs semana actual vs anterior */}
      {semActualData && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: C.primary }}>
              {semanas[semActual]?.label} ({semanas[semActual]?.labelFull}) vs semana anterior
            </div>
            {semAnteriorData && (
              <span className="text-[8px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${C.primary}10`, color: C.primary }}>
                {semanas[semActual - 1]?.labelFull}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {METRICAS.map(m => (
              <KpiComp key={m.key} label={m.label} icon={m.icon} color={m.color} invertir={m.inv}
                fmt={m.fmt} info={m.info}
                actual={m.key === "efect" ? semActualData.efect : m.key === "pctAtc" ? semActualData.pctAtc : m.key === "cpl" ? semActualData.cpl : m.key === "cpAct" ? semActualData.cpAct : semActualData[m.key]}
                anterior={semAnteriorData ? (m.key === "efect" ? semAnteriorData.efect : m.key === "pctAtc" ? semAnteriorData.pctAtc : m.key === "cpl" ? semAnteriorData.cpl : m.key === "cpAct" ? semAnteriorData.cpAct : semAnteriorData[m.key]) : null}
              />
            ))}
          </div>
        </div>
      )}

      {/* Selector de métrica + gráfico de barras */}
      <Card>
        <CardHeader title="Comparativo por Semana" subtitle="Selecciona métrica para comparar todas las semanas del mes"
          accent={cfg.color}
          badge={
            <div className="flex flex-wrap gap-1.5">
              {METRICAS.map(m => (
                <button key={m.key} onClick={() => setMetrica(m.key)}
                  className="px-2.5 py-1 rounded-full text-[8px] font-black uppercase border transition-all"
                  style={metrica === m.key
                    ? { background: m.color, color: "#fff", borderColor: m.color }
                    : { background: "#fff", color: C.muted, borderColor: C.border }}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          } />
        <div className="p-5">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: C.muted }} />
              <YAxis tick={{ fontSize: 9, fill: C.muted }} width={45}
                tickFormatter={v => cfg.key === "cpl" || cfg.key === "cpAct" || cfg.key === "inv" ? `$${v}` : cfg.key === "efect" || cfg.key === "pctAtc" ? `${v}%` : v} />
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const item = barData.find(b => b.name === label);
                return (
                  <div className="bg-white border rounded-xl shadow-xl px-4 py-3 text-[10px]" style={{ borderColor: C.border }}>
                    <div className="font-black mb-1" style={{ color: C.slate }}>{label} · {item?.rango}</div>
                    <div style={{ color: cfg.color }} className="font-black">
                      {cfg.fmt(payload[0].value)}
                    </div>
                    <div className="text-[8px] mt-1" style={{ color: C.muted }}>{cfg.info}</div>
                  </div>
                );
              }} />
              <Bar dataKey="val" name={cfg.label} radius={[6, 6, 0, 0]}>
                {barData.map((entry, i) => (
                  <Cell key={i}
                    fill={entry.esActual ? cfg.color : `${cfg.color}55`}
                    stroke={entry.esActual ? cfg.color : "none"}
                    strokeWidth={entry.esActual ? 2 : 0} />
                ))}
              </Bar>
              {semActual !== null && (
                <ReferenceLine x={semanas[semActual]?.label} stroke={cfg.color} strokeDasharray="4 2"
                  label={{ value: "← Actual", position: "insideTopRight", fontSize: 8, fill: cfg.color }} />
              )}
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 flex items-center gap-3 text-[8px]" style={{ color: C.muted }}>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ background: cfg.color }} />
              Semana actual
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ background: `${cfg.color}55` }} />
              Semanas anteriores del mes
            </div>
          </div>
        </div>
      </Card>

      {/* Radar comparativo de semanas */}
      {semanas.length > 1 && (
        <Card>
          <CardHeader title="Radar Multidimensional por Semana"
            subtitle="Compara rendimiento en 5 dimensiones — ATC invertido (más alto = menos ATC = mejor)"
            accent={C.violet} />
          <div className="p-5">
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                <PolarGrid stroke={C.border} />
                <PolarAngleAxis dataKey="dim" tick={{ fontSize: 9, fill: C.muted, fontWeight: 700 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 7, fill: C.muted }} tickCount={3} />
                {semanas.map((s, i) => (
                  <Radar key={s.label} name={`${s.label} (${s.labelFull})`} dataKey={s.label}
                    stroke={SEMANA_COLS[i % SEMANA_COLS.length]}
                    fill={SEMANA_COLS[i % SEMANA_COLS.length]}
                    fillOpacity={i === semActual ? 0.25 : 0.08}
                    strokeWidth={i === semActual ? 2.5 : 1.5}
                    strokeDasharray={i === semActual ? "0" : "4 2"} />
                ))}
                <Legend wrapperStyle={{ fontSize: 9 }} />
                <Tooltip content={<CTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Tabla resumen semanas */}
      <Card>
        <CardHeader title="Tabla Comparativa de Semanas" accent={C.slate}
          subtitle="Todas las semanas del mes en una vista" />
        <div className="overflow-auto">
          <table className="text-[9px] font-mono border-collapse w-full whitespace-nowrap">
            <thead className="sticky top-0" style={{ background: C.light, borderBottom: `2px solid ${C.border}` }}>
              <tr>
                {["SEMANA", "RANGO", "LEADS", "NEGOC.", "ATC %", "V.SUBIDA", "ACTIVOS", "EFECT. %", "CPL $", "CP ACT. $", "INV. $"].map(h => (
                  <th key={h} className="px-3 py-2.5 border-r text-center font-black uppercase text-[8px]"
                    style={{ color: C.muted, borderColor: C.border }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {semanas.map((s, i) => {
                const d = dataSem[i];
                const esActual = i === semActual;
                const prev = i > 0 ? dataSem[i - 1] : null;
                if (!d) return (
                  <tr key={s.label} className="border-b" style={{ borderColor: C.border }}>
                    <td colSpan={11} className="px-3 py-2 text-center text-[8px]" style={{ color: C.muted }}>
                      {s.label} — Sin datos
                    </td>
                  </tr>
                );
                return (
                  <tr key={s.label} className="border-b transition-colors"
                    style={{ borderColor: C.border, background: esActual ? `${C.primary}06` : undefined }}>
                    <td className="px-3 py-2 border-r font-black text-center"
                      style={{ borderColor: C.border, color: SEMANA_COLS[i % SEMANA_COLS.length] }}>
                      {s.label} {esActual && <span className="text-[7px] px-1 py-0.5 rounded ml-1" style={{ background: `${C.primary}15`, color: C.primary }}>Actual</span>}
                    </td>
                    <td className="px-3 py-2 border-r text-[8px]" style={{ color: C.muted, borderColor: C.border }}>{s.labelFull}</td>
                    {[
                      [d.leads,   fmtN, C.primary, prev?.leads,   false],
                      [d.neg,     fmtN, C.success, prev?.neg,     false],
                      [d.pctAtc,  fmtP, d.pctAtc > 40 ? C.danger : d.pctAtc > 20 ? C.warning : C.success, prev?.pctAtc, true],
                      [d.vsub,    fmtN, C.sky,     prev?.vsub,    false],
                      [d.act,     fmtN, "#10b981", prev?.act,     false],
                      [d.efect,   fmtP, d.efect >= 15 ? C.success : d.efect >= 8 ? C.warning : C.danger, prev?.efect, false],
                      [d.cpl,     v => v ? fmtU(v) : "—", C.violet, prev?.cpl, true],
                      [d.cpAct,   v => v ? fmtU(v) : "—", C.orange, prev?.cpAct, true],
                      [d.inv,     fmtU, C.violet, prev?.inv, false],
                    ].map(([val, fmt, col, prevVal, inv], j) => {
                      const v_ = variacion(val, prevVal);
                      return (
                        <td key={j} className="px-3 py-2 border-r text-center" style={{ borderColor: C.border }}>
                          <span className="font-black text-[9px]" style={{ color: col }}>{fmt(val)}</span>
                          {v_ !== null && (
                            <div className="mt-0.5"><VarChip valor={v_} invertir={inv} /></div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Panel de Meses anteriores ─────────────────────────────────────────────────
function PanelMeses() {
  const [meses]         = useState(() => getMesesAnteriores(5));
  const [dataMes, setDataMes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [metrica, setMetrica] = useState("leads");

  useEffect(() => {
    setLoading(true);
    Promise.all(meses.map(m => fetchPeriodo(m.desde, m.hasta)))
      .then(results => setDataMes(results))
      .finally(() => setLoading(false));
  }, []);

  const METRICAS = [
    { key: "leads",   label: "Leads",         fmt: fmtN, color: C.primary, icon: "👥", inv: false },
    { key: "efect",   label: "Efectividad %",  fmt: fmtP, color: C.success, icon: "✅", inv: false },
    { key: "pctAtc",  label: "% ATC",          fmt: fmtP, color: C.danger,  icon: "📞", inv: true  },
    { key: "vsub",    label: "Ventas Subidas",  fmt: fmtN, color: C.sky,     icon: "📈", inv: false },
    { key: "act",     label: "Activos",         fmt: fmtN, color: "#10b981", icon: "🟢", inv: false },
    { key: "cpl",     label: "CPL $",           fmt: fmtU, color: C.violet,  icon: "💸", inv: true  },
    { key: "cpAct",   label: "CP Activado $",   fmt: fmtU, color: C.orange,  icon: "🎯", inv: true  },
    { key: "inv",     label: "Inversión $",     fmt: fmtU, color: C.violet,  icon: "💰", inv: false },
    { key: "roas",    label: "ROAS",            fmt: v => v ? `${safe(v).toFixed(1)}x` : "—", color: C.cyan, icon: "📊", inv: false },
  ];

  const cfg = METRICAS.find(m => m.key === metrica) || METRICAS[0];

  const getValue = (d, key) => {
    if (!d) return null;
    if (key === "efect")  return d.efect;
    if (key === "pctAtc") return d.pctAtc;
    if (key === "cpl")    return d.cpl;
    if (key === "cpAct")  return d.cpAct;
    if (key === "roas")   return d.roas;
    return d[key];
  };

  // Tendencia línea
  const lineData = meses.map((m, i) => {
    const d = dataMes[i];
    const v = getValue(d, metrica);
    return {
      name: m.labelCorto,
      val: v !== null && v !== undefined ? parseFloat(safe(v).toFixed(2)) : null,
      esMesActual: m.esMesActual,
      desde: m.desde,
    };
  });

  // KPIs mes actual vs mes anterior
  const mesActualIdx    = meses.length - 1;
  const mesActualData   = dataMes[mesActualIdx];
  const mesAnteriorData = dataMes[mesActualIdx - 1];

  // Radar por canal entre mes actual y anterior
  const canalActual   = mesActualData?.canales   || [];
  const canalAnterior = mesAnteriorData?.canales || [];
  const canalesUnion  = [...new Set([...canalActual.map(c => c.canal), ...canalAnterior.map(c => c.canal)])];

  const radarCanalData = ["leads", "act", "vsub", "atc"].map(k => {
    const maxA = Math.max(1, ...canalActual.map(c => safe(c[k])));
    const maxAnt = Math.max(1, ...canalAnterior.map(c => safe(c[k])));
    const mx = Math.max(maxA, maxAnt, 1);
    const entry = { dim: { leads: "Leads", act: "Activos", vsub: "V.Subida", atc: "ATC inv." }[k] };
    canalesUnion.slice(0, 5).forEach(canal => {
      const a   = canalActual.find(c => c.canal === canal);
      const ant = canalAnterior.find(c => c.canal === canal);
      const valA   = a   ? safe(a[k]) : 0;
      const valAnt = ant ? safe(ant[k]) : 0;
      entry[`${canal}_act`] = k === "atc" ? Math.max(0, 100 - (valA / mx) * 100) : (valA / mx) * 100;
      entry[`${canal}_ant`] = k === "atc" ? Math.max(0, 100 - (valAnt / mx) * 100) : (valAnt / mx) * 100;
    });
    return entry;
  });

  if (loading) return <Spinner />;

  return (
    <div className="space-y-5">
      {/* KPIs mes actual vs anterior */}
      {mesActualData && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: C.primary }}>
              {meses[mesActualIdx]?.label} vs {meses[mesActualIdx - 1]?.label}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-3">
            {METRICAS.map(m => (
              <KpiComp key={m.key} label={m.label} icon={m.icon} color={m.color} invertir={m.inv}
                fmt={m.fmt}
                actual={getValue(mesActualData, m.key)}
                anterior={mesAnteriorData ? getValue(mesAnteriorData, m.key) : null}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tendencia mensual — línea */}
      <Card>
        <CardHeader title="Tendencia Mensual (6 meses)" accent={cfg.color}
          subtitle="Evolución histórica — mes actual marcado en azul"
          badge={
            <div className="flex flex-wrap gap-1.5">
              {METRICAS.map(m => (
                <button key={m.key} onClick={() => setMetrica(m.key)}
                  className="px-2.5 py-1 rounded-full text-[8px] font-black uppercase border transition-all"
                  style={metrica === m.key
                    ? { background: m.color, color: "#fff", borderColor: m.color }
                    : { background: "#fff", color: C.muted, borderColor: C.border }}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          } />
        <div className="p-5">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={lineData} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: C.muted }} />
              <YAxis tick={{ fontSize: 9, fill: C.muted }} width={50}
                tickFormatter={v => cfg.key === "cpl" || cfg.key === "cpAct" || cfg.key === "inv" ? `$${v}` :
                  cfg.key === "efect" || cfg.key === "pctAtc" ? `${v}%` :
                  cfg.key === "roas" ? `${v}x` : v} />
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const item = lineData.find(l => l.name === label);
                return (
                  <div className="bg-white border rounded-xl shadow-xl px-4 py-3 text-[10px]" style={{ borderColor: C.border }}>
                    <div className="font-black mb-1" style={{ color: C.slate }}>
                      {label} {item?.esMesActual && "· Mes actual"}
                    </div>
                    <div className="font-black" style={{ color: cfg.color }}>
                      {payload[0].value !== null ? cfg.fmt(payload[0].value) : "—"}
                    </div>
                  </div>
                );
              }} />
              <Line type="monotone" dataKey="val" name={cfg.label}
                stroke={cfg.color} strokeWidth={3}
                dot={(props) => {
                  const item = lineData[props.index];
                  return (
                    <circle key={props.index} cx={props.cx} cy={props.cy} r={item?.esMesActual ? 7 : 4}
                      fill={item?.esMesActual ? cfg.color : "#fff"}
                      stroke={cfg.color} strokeWidth={2} />
                  );
                }}
                activeDot={{ r: 8 }} connectNulls />
              {/* Área bajo la curva como referencia visual */}
              <ReferenceLine y={0} stroke={C.border} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Barras agrupadas — todas las métricas clave por mes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Leads & Activos por Mes" accent={C.primary} />
          <div className="p-5">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={meses.map((m, i) => ({
                name: m.labelCorto,
                Leads:   safe(dataMes[i]?.leads),
                Activos: safe(dataMes[i]?.act),
                esActual: m.esMesActual,
              }))} margin={{ top: 16, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: C.muted }} />
                <YAxis tick={{ fontSize: 9, fill: C.muted }} width={35} />
                <Tooltip content={<CTooltip />} />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                <Bar dataKey="Leads" fill={`${C.primary}60`} radius={[4, 4, 0, 0]}>
                  {meses.map((m, i) => <Cell key={i} fill={m.esMesActual ? C.primary : `${C.primary}45`} />)}
                </Bar>
                <Bar dataKey="Activos" fill={C.success} radius={[4, 4, 0, 0]}>
                  {meses.map((m, i) => <Cell key={i} fill={m.esMesActual ? C.success : `${C.success}55`} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Ventas Subidas & Inversión $" accent={C.violet} />
          <div className="p-5">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={meses.map((m, i) => ({
                name: m.labelCorto,
                "V.Subida": safe(dataMes[i]?.vsub),
                "Inv.$":    Math.round(safe(dataMes[i]?.inv)),
                esActual: m.esMesActual,
              }))} margin={{ top: 16, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: C.muted }} />
                <YAxis yAxisId="l" tick={{ fontSize: 9, fill: C.muted }} width={35} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 9, fill: C.muted }} width={50}
                  tickFormatter={v => `$${v}`} />
                <Tooltip content={<CTooltip />} />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                <Bar yAxisId="l" dataKey="V.Subida" radius={[4, 4, 0, 0]}>
                  {meses.map((m, i) => <Cell key={i} fill={m.esMesActual ? C.sky : `${C.sky}55`} />)}
                </Bar>
                <Bar yAxisId="r" dataKey="Inv.$" radius={[4, 4, 0, 0]}>
                  {meses.map((m, i) => <Cell key={i} fill={m.esMesActual ? C.violet : `${C.violet}45`} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* CPL y Efectividad mensual */}
      <Card>
        <CardHeader title="Eficiencia Mensual — CPL $ · Efectividad % · % ATC"
          subtitle="Evolución de los 3 indicadores clave de calidad de pauta" accent={C.warning} />
        <div className="p-5">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={meses.map((m, i) => ({
              name: m.labelCorto,
              "CPL $":    dataMes[i]?.cpl    ? parseFloat(safe(dataMes[i].cpl).toFixed(2))   : null,
              "Efect. %": parseFloat(safe(dataMes[i]?.efect).toFixed(1)),
              "ATC %":    parseFloat(safe(dataMes[i]?.pctAtc).toFixed(1)),
              esActual: m.esMesActual,
            }))} margin={{ top: 16, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: C.muted }} />
              <YAxis yAxisId="pct" tick={{ fontSize: 9, fill: C.muted }} width={35} unit="%" domain={[0, 100]} />
              <YAxis yAxisId="usd" orientation="right" tick={{ fontSize: 9, fill: C.muted }} width={40}
                tickFormatter={v => `$${v}`} />
              <Tooltip content={<CTooltip />} />
              <Legend wrapperStyle={{ fontSize: 9 }} />
              <Line yAxisId="pct" type="monotone" dataKey="Efect. %" stroke={C.success} strokeWidth={2.5}
                dot={{ r: 4, fill: C.success }} connectNulls />
              <Line yAxisId="pct" type="monotone" dataKey="ATC %" stroke={C.danger} strokeWidth={2.5}
                dot={{ r: 4, fill: C.danger }} strokeDasharray="5 3" connectNulls />
              <Line yAxisId="usd" type="monotone" dataKey="CPL $" stroke={C.violet} strokeWidth={2.5}
                dot={{ r: 4, fill: C.violet }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Tabla resumen meses */}
      <Card>
        <CardHeader title="Tabla Histórica de Meses" accent={C.slate}
          subtitle="Últimos 6 meses con variación mes a mes" />
        <div className="overflow-auto">
          <table className="text-[9px] font-mono border-collapse w-full whitespace-nowrap">
            <thead className="sticky top-0" style={{ background: C.light, borderBottom: `2px solid ${C.border}` }}>
              <tr>
                {["MES", "LEADS", "NEGOC.", "ATC %", "V.SUBIDA", "ACTIVOS", "EFECT. %", "CPL $", "CP ACT. $", "INV. $", "ROAS"].map(h => (
                  <th key={h} className="px-3 py-2.5 border-r text-center font-black uppercase text-[8px]"
                    style={{ color: C.muted, borderColor: C.border }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {meses.map((m, i) => {
                const d    = dataMes[i];
                const prev = i > 0 ? dataMes[i - 1] : null;
                return (
                  <tr key={m.label} className="border-b"
                    style={{ borderColor: C.border, background: m.esMesActual ? `${C.primary}06` : undefined }}>
                    <td className="px-3 py-2 border-r font-black"
                      style={{ color: MES_COLS[i % MES_COLS.length], borderColor: C.border }}>
                      {m.label}
                      {m.esMesActual && <span className="text-[7px] ml-1 px-1 py-0.5 rounded"
                        style={{ background: `${C.primary}15`, color: C.primary }}>Actual</span>}
                    </td>
                    {d ? [
                      [d.leads,   fmtN, C.primary,  prev?.leads,   false],
                      [d.neg,     fmtN, C.success,  prev?.neg,     false],
                      [d.pctAtc,  fmtP, d.pctAtc > 40 ? C.danger : C.success, prev?.pctAtc, true],
                      [d.vsub,    fmtN, C.sky,      prev?.vsub,    false],
                      [d.act,     fmtN, "#10b981",  prev?.act,     false],
                      [d.efect,   fmtP, d.efect >= 15 ? C.success : C.danger, prev?.efect, false],
                      [d.cpl,     v => v ? fmtU(v) : "—", C.violet, prev?.cpl, true],
                      [d.cpAct,   v => v ? fmtU(v) : "—", C.orange, prev?.cpAct, true],
                      [d.inv,     fmtU, C.violet,   prev?.inv,     false],
                      [d.roas,    v => v ? `${safe(v).toFixed(1)}x` : "—", C.cyan, prev?.roas, false],
                    ].map(([val, fmt, col, prevVal, inv], j) => {
                      const v_ = variacion(val, prevVal);
                      return (
                        <td key={j} className="px-3 py-2 border-r text-center" style={{ borderColor: C.border }}>
                          <div className="font-black text-[9px]" style={{ color: col }}>{fmt(val)}</div>
                          {v_ !== null && <div className="mt-0.5"><VarChip valor={v_} invertir={inv} /></div>}
                        </td>
                      );
                    }) : (
                      <td colSpan={10} className="px-3 py-2 text-center text-[8px]" style={{ color: C.muted }}>
                        Cargando...
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
export default function TabComparativo({ filtro }) {
  const [vista, setVista] = useState("semanas");

  // Extraer año y mes del filtro actual
  const año = filtro?.desde ? parseInt(filtro.desde.split("-")[0]) : new Date().getFullYear();
  const mes  = filtro?.desde ? parseInt(filtro.desde.split("-")[1]) : new Date().getMonth() + 1;
  const nombresMes = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  const VISTAS = [
    { id: "semanas", label: "Semanas del Mes",  icon: "📅" },
    { id: "meses",   label: "Histórico Meses",  icon: "📆" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border px-5 py-4 flex items-start justify-between gap-4 flex-wrap"
        style={{ borderColor: `${C.primary}30`, background: "#eff6ff" }}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">📊</span>
            <span className="text-[13px] font-black uppercase tracking-wide" style={{ color: C.primary }}>
              Comparativo Inteligente
            </span>
            <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase"
              style={{ background: `${C.primary}15`, color: C.primary }}>
              {nombresMes[mes]} {año}
            </span>
          </div>
          <p className="text-[9px] leading-relaxed" style={{ color: C.muted }}>
            Semana vs semana del mismo mes · Mes actual vs meses anteriores · Variación automática · ICP por período
          </p>
        </div>
        {/* Leyenda de chips */}
        <div className="flex flex-col gap-1.5 text-[8px]" style={{ color: C.muted }}>
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded-full font-black" style={{ background: "#d1fae5", color: C.success }}>▲ 12.5%</span>
            Subió vs período anterior
          </div>
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded-full font-black" style={{ background: "#fee2e2", color: C.danger }}>▼ 8.3%</span>
            Bajó vs período anterior
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold" style={{ color: C.warning }}>ATC / CPL / CPA:</span> ▼ rojo = sube = peor
          </div>
        </div>
      </div>

      {/* Selector de vista */}
      <div className="flex gap-1 bg-white border rounded-xl p-1 w-fit" style={{ borderColor: C.border }}>
        {VISTAS.map(v => (
          <button key={v.id} onClick={() => setVista(v.id)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[9px] font-black uppercase tracking-wide transition-all"
            style={vista === v.id
              ? { background: C.primary, color: "#fff", boxShadow: `0 2px 8px ${C.primary}30` }
              : { color: C.muted }}>
            <span>{v.icon}</span>
            <span className="hidden sm:inline">{v.label}</span>
          </button>
        ))}
      </div>

      {/* Contenido */}
      {vista === "semanas" && <PanelSemanas año={año} mes={mes} />}
      {vista === "meses"   && <PanelMeses />}
    </div>
  );
}