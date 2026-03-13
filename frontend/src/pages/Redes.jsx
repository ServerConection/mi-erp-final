import { useEffect, useState } from "react";

const getFechaHoy = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });

const formatFecha = (f) => {
  if (!f) return "—";
  const d = String(f).split("T")[0];
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

// ── Colores semáforo ──────────────────────────────────────────────────────────
const pctColor = (v) => {
  const n = Number(v);
  if (n >= 80) return "text-emerald-600 font-black";
  if (n >= 50) return "text-amber-500 font-black";
  return "text-red-500 font-black";
};

// ── Componente: filtro de fechas ──────────────────────────────────────────────
function FiltroPeriodo({ fechaDesde, fechaHasta, onChange, onAplicar, loading }) {
  return (
    <div className="flex flex-wrap items-end gap-3 mb-6">
      <div className="flex flex-col gap-1">
        <label className="text-[9px] font-black text-orange-400 uppercase tracking-widest">Desde</label>
        <input
          type="date"
          value={fechaDesde}
          onChange={(e) => onChange("fechaDesde", e.target.value)}
          className="bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-[11px] font-bold text-white outline-none focus:border-orange-500 [color-scheme:dark]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[9px] font-black text-orange-400 uppercase tracking-widest">Hasta</label>
        <input
          type="date"
          value={fechaHasta}
          onChange={(e) => onChange("fechaHasta", e.target.value)}
          className="bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-[11px] font-bold text-white outline-none focus:border-orange-500 [color-scheme:dark]"
        />
      </div>
      <button
        onClick={onAplicar}
        className="bg-orange-600 hover:bg-orange-500 active:scale-95 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-lg shadow-orange-900/30"
      >
        {loading ? "Cargando..." : "Aplicar"}
      </button>
    </div>
  );
}

// ── Componente: badge de total ────────────────────────────────────────────────
function TotalBadge({ label, value, color = "bg-orange-900/60 text-orange-300" }) {
  return (
    <span className={`${color} text-[9px] font-black px-2 py-0.5 rounded-full uppercase`}>
      {label}: {value ?? "—"}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TABLA 1 — MONITOREO PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
function TablaMonitoreoRedes({ fechaDesde, fechaHasta }) {
  const [data, setData] = useState([]);
  const [totales, setTotales] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetch_ = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/redes/monitoreo-redes?fechaDesde=${fechaDesde}&fechaHasta=${fechaHasta}`
      );
      const r = await res.json();
      if (r.success) { setData(r.data); setTotales(r.totales); }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetch_(); }, [fechaDesde, fechaHasta]);

  const cols = [
    { key: "fecha",                  label: "FECHA",           fmt: formatFecha },
    { key: "dia_semana",             label: "DÍA" },
    { key: "n_leads",                label: "LEADS" },
    { key: "negociables",            label: "NEGOC." },
    { key: "atc_soporte",            label: "ATC" },
    { key: "fuera_cobertura",        label: "F.COB." },
    { key: "zonas_peligrosas",       label: "Z.PELIG." },
    { key: "innegociable",           label: "INNEG." },
    { key: "venta_subida_bitrix",    label: "V.SUBIDA" },
    { key: "seguimiento_negociacion",label: "SEGUIM." },
    { key: "ingreso_jot",            label: "ING.JOT" },
    { key: "ingreso_bitrix_mismo_dia",label: "ING.BITRIX" },
    { key: "activo_backlog",         label: "BACKLOG" },
    { key: "activos_mes",            label: "ACTIVOS" },
    { key: "pago_cuenta",            label: "P.CUENTA" },
    { key: "pago_efectivo",          label: "P.EFECT." },
    { key: "pago_tarjeta",           label: "P.TARJ." },
    { key: "ciclo_0_dias",           label: "C.0D" },
    { key: "ciclo_1_dia",            label: "C.1D" },
    { key: "ciclo_2_dias",           label: "C.2D" },
    { key: "ciclo_3_dias",           label: "C.3D" },
    { key: "ciclo_4_dias",           label: "C.4D" },
    { key: "ciclo_mas5_dias",        label: "C.+5D" },
    { key: "inversion_usd",          label: "INV.$", fmt: (v) => `$${Number(v).toFixed(2)}` },
    { key: "cpl",                    label: "CPL", fmt: (v) => `$${v}` },
    { key: "costo_activa",           label: "C.ACTIVA", fmt: (v) => `$${v}` },
    { key: "costo_por_negociable",   label: "C.NEGOC.", fmt: (v) => `$${v}` },
    { key: "pct_atc",                label: "% ATC", fmt: (v) => `${v}%`, cls: pctColor },
    { key: "pct_negociable",         label: "% NEGOC.", fmt: (v) => `${v}%` },
    { key: "efectividad_total",      label: "% EFECT.", fmt: (v) => `${v}%`, cls: pctColor },
  ];

  const totalRow = totales ? {
    fecha: "TOTAL",
    dia_semana: "",
    ...totales,
  } : null;

  return (
    <div className="bg-stone-950 rounded-2xl border border-stone-800 shadow-2xl overflow-hidden mb-8">
      {/* Header */}
      <div className="px-5 py-3 bg-stone-900 border-b border-stone-800 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[10px] font-black text-orange-400 uppercase italic tracking-widest flex items-center gap-2">
          <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
          Monitoreo Principal — Métricas por Día
        </h3>
        <div className="flex flex-wrap gap-2">
          <TotalBadge label="Leads" value={totales?.n_leads} />
          <TotalBadge label="Negoc." value={totales?.negociables} color="bg-amber-900/60 text-amber-300" />
          <TotalBadge label="Ing.JOT" value={totales?.ingreso_jot} color="bg-emerald-900/60 text-emerald-300" />
          <TotalBadge label="Activos" value={totales?.activos_mes} color="bg-cyan-900/60 text-cyan-300" />
          <TotalBadge label="Inv." value={totales?.inversion_usd ? `$${Number(totales.inversion_usd).toFixed(0)}` : "—"} color="bg-violet-900/60 text-violet-300" />
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-auto max-h-[480px]">
        {loading ? (
          <div className="text-center py-12 text-stone-500 text-[10px] uppercase">Cargando...</div>
        ) : (
          <table className="text-[9px] font-mono border-collapse w-full whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr className="bg-stone-800 text-stone-400 font-black uppercase">
                {cols.map((c) => (
                  <th key={c.key} className="px-3 py-2 border-r border-stone-700 text-center last:border-r-0">
                    {c.label}
                  </th>
                ))}
              </tr>
              {/* Fila TOTAL */}
              {totalRow && (
                <tr className="bg-orange-950 text-orange-200 font-black border-b border-orange-800">
                  {cols.map((c) => {
                    const val = totalRow[c.key];
                    const display = c.fmt ? c.fmt(val ?? 0) : (val ?? "—");
                    return (
                      <td key={c.key} className="px-3 py-2 border-r border-orange-900 text-center last:border-r-0">
                        {c.key === "fecha" ? "▶ TOTAL" : display}
                      </td>
                    );
                  })}
                </tr>
              )}
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr><td colSpan={cols.length} className="text-center py-10 text-stone-500 uppercase text-[9px]">Sin datos para el período</td></tr>
              ) : (
                data.map((row, i) => (
                  <tr key={i} className="border-b border-stone-800 hover:bg-stone-900 transition-colors">
                    {cols.map((c) => {
                      const val = row[c.key];
                      const display = c.fmt ? c.fmt(val ?? 0) : (val ?? "—");
                      const cls = c.cls ? c.cls(val) : "text-stone-300";
                      return (
                        <td key={c.key} className={`px-3 py-1.5 border-r border-stone-800 text-center last:border-r-0 ${c.key === "fecha" ? "text-orange-300 font-black" : cls}`}>
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TABLA 2 — POR CIUDAD
// ══════════════════════════════════════════════════════════════════════════════
function TablaMonitoreoCiudad({ fechaDesde, fechaHasta }) {
  const [data, setData] = useState([]);
  const [totales, setTotales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [vista, setVista] = useState("detalle"); // detalle | resumen

  const fetch_ = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/redes/monitoreo-ciudad?fechaDesde=${fechaDesde}&fechaHasta=${fechaHasta}`
      );
      const r = await res.json();
      if (r.success) { setData(r.data); setTotales(r.totales); }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetch_(); }, [fechaDesde, fechaHasta]);

  const totalLeads   = totales.reduce((a, r) => a + Number(r.total_leads || 0), 0);
  const totalActivos = totales.reduce((a, r) => a + Number(r.activos || 0), 0);
  const totalJot     = totales.reduce((a, r) => a + Number(r.ingresos_jot || 0), 0);

  return (
    <div className="bg-stone-950 rounded-2xl border border-stone-800 shadow-2xl overflow-hidden mb-8">
      <div className="px-5 py-3 bg-stone-900 border-b border-stone-800 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[10px] font-black text-amber-400 uppercase italic tracking-widest flex items-center gap-2">
          <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
          Distribución por Ciudad
        </h3>
        <div className="flex items-center gap-3">
          <TotalBadge label="Leads" value={totalLeads} />
          <TotalBadge label="Activos" value={totalActivos} color="bg-emerald-900/60 text-emerald-300" />
          <TotalBadge label="Ing.JOT" value={totalJot} color="bg-cyan-900/60 text-cyan-300" />
          <div className="flex bg-stone-800 rounded-lg p-0.5">
            {["detalle", "resumen"].map((v) => (
              <button key={v} onClick={() => setVista(v)}
                className={`px-3 py-1 text-[8px] font-black uppercase rounded-md transition-all ${vista === v ? "bg-amber-600 text-white" : "text-stone-400 hover:text-white"}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-auto max-h-[400px]">
        {loading ? (
          <div className="text-center py-12 text-stone-500 text-[10px] uppercase">Cargando...</div>
        ) : vista === "resumen" ? (
          <table className="text-[9px] font-mono border-collapse w-full whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr className="bg-stone-800 text-stone-400 font-black uppercase">
                {["CIUDAD", "PROVINCIA", "LEADS", "ACTIVOS", "ING.JOT", "% ACTIVOS"].map((h) => (
                  <th key={h} className="px-4 py-2 border-r border-stone-700 text-center last:border-r-0">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {totales.map((row, i) => (
                <tr key={i} className="border-b border-stone-800 hover:bg-stone-900 transition-colors">
                  <td className="px-4 py-1.5 border-r border-stone-800 text-amber-300 font-black uppercase">{row.ciudad}</td>
                  <td className="px-4 py-1.5 border-r border-stone-800 text-stone-400">{row.provincia}</td>
                  <td className="px-4 py-1.5 border-r border-stone-800 text-center text-stone-300">{row.total_leads}</td>
                  <td className="px-4 py-1.5 border-r border-stone-800 text-center text-emerald-400 font-black">{row.activos}</td>
                  <td className="px-4 py-1.5 border-r border-stone-800 text-center text-cyan-400">{row.ingresos_jot}</td>
                  <td className={`px-4 py-1.5 text-center ${pctColor(row.pct_activos)}`}>{row.pct_activos}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="text-[9px] font-mono border-collapse w-full whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr className="bg-stone-800 text-stone-400 font-black uppercase">
                {["FECHA", "CIUDAD", "PROVINCIA", "LEADS", "ACTIVOS", "ING.JOT", "% ACTIVOS"].map((h) => (
                  <th key={h} className="px-4 py-2 border-r border-stone-700 text-center last:border-r-0">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-stone-500 uppercase text-[9px]">Sin datos</td></tr>
              ) : (
                data.map((row, i) => (
                  <tr key={i} className="border-b border-stone-800 hover:bg-stone-900 transition-colors">
                    <td className="px-4 py-1.5 border-r border-stone-800 text-orange-300 font-black">{formatFecha(row.fecha)}</td>
                    <td className="px-4 py-1.5 border-r border-stone-800 text-amber-300 font-bold uppercase">{row.ciudad}</td>
                    <td className="px-4 py-1.5 border-r border-stone-800 text-stone-400">{row.provincia}</td>
                    <td className="px-4 py-1.5 border-r border-stone-800 text-center text-stone-300">{row.total_leads}</td>
                    <td className="px-4 py-1.5 border-r border-stone-800 text-center text-emerald-400 font-black">{row.activos}</td>
                    <td className="px-4 py-1.5 border-r border-stone-800 text-center text-cyan-400">{row.ingresos_jot}</td>
                    <td className={`px-4 py-1.5 text-center ${pctColor(row.pct_activos)}`}>{row.pct_activos}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TABLA 3 — POR HORA
// ══════════════════════════════════════════════════════════════════════════════
function TablaMonitoreoHora({ fechaDesde, fechaHasta }) {
  const [data, setData] = useState([]);
  const [totales, setTotales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [vista, setVista] = useState("resumen");

  const fetch_ = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/redes/monitoreo-hora?fechaDesde=${fechaDesde}&fechaHasta=${fechaHasta}`
      );
      const r = await res.json();
      if (r.success) { setData(r.data); setTotales(r.totales); }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetch_(); }, [fechaDesde, fechaHasta]);

  const totalLeads = totales.reduce((a, r) => a + Number(r.n_leads || 0), 0);
  const totalAtc   = totales.reduce((a, r) => a + Number(r.atc || 0), 0);

  return (
    <div className="bg-stone-950 rounded-2xl border border-stone-800 shadow-2xl overflow-hidden mb-8">
      <div className="px-5 py-3 bg-stone-900 border-b border-stone-800 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[10px] font-black text-cyan-400 uppercase italic tracking-widest flex items-center gap-2">
          <span className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
          Leads por Hora del Día
        </h3>
        <div className="flex items-center gap-3">
          <TotalBadge label="Leads" value={totalLeads} color="bg-cyan-900/60 text-cyan-300" />
          <TotalBadge label="ATC" value={totalAtc} color="bg-rose-900/60 text-rose-300" />
          <div className="flex bg-stone-800 rounded-lg p-0.5">
            {["resumen", "detalle"].map((v) => (
              <button key={v} onClick={() => setVista(v)}
                className={`px-3 py-1 text-[8px] font-black uppercase rounded-md transition-all ${vista === v ? "bg-cyan-600 text-white" : "text-stone-400 hover:text-white"}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-auto max-h-[400px]">
        {loading ? (
          <div className="text-center py-12 text-stone-500 text-[10px] uppercase">Cargando...</div>
        ) : vista === "resumen" ? (
          <table className="text-[9px] font-mono border-collapse w-full whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr className="bg-stone-800 text-stone-400 font-black uppercase">
                {["HORA", "LEADS", "ATC", "% ATC"].map((h) => (
                  <th key={h} className="px-4 py-2 border-r border-stone-700 text-center last:border-r-0">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {totales.map((row, i) => (
                <tr key={i} className="border-b border-stone-800 hover:bg-stone-900 transition-colors">
                  <td className="px-4 py-1.5 border-r border-stone-800 text-cyan-300 font-black text-center">{String(row.hora).padStart(2,"0")}:00</td>
                  <td className="px-4 py-1.5 border-r border-stone-800 text-center text-stone-300">{row.n_leads}</td>
                  <td className="px-4 py-1.5 border-r border-stone-800 text-center text-rose-400">{row.atc}</td>
                  <td className={`px-4 py-1.5 text-center ${pctColor(row.pct_atc_hora)}`}>{row.pct_atc_hora}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="text-[9px] font-mono border-collapse w-full whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr className="bg-stone-800 text-stone-400 font-black uppercase">
                {["FECHA", "HORA", "LEADS", "ATC", "% ATC"].map((h) => (
                  <th key={h} className="px-4 py-2 border-r border-stone-700 text-center last:border-r-0">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-stone-500 uppercase text-[9px]">Sin datos</td></tr>
              ) : (
                data.map((row, i) => (
                  <tr key={i} className="border-b border-stone-800 hover:bg-stone-900 transition-colors">
                    <td className="px-4 py-1.5 border-r border-stone-800 text-orange-300 font-black">{formatFecha(row.fecha)}</td>
                    <td className="px-4 py-1.5 border-r border-stone-800 text-cyan-300 font-black text-center">{String(row.hora).padStart(2,"0")}:00</td>
                    <td className="px-4 py-1.5 border-r border-stone-800 text-center text-stone-300">{row.n_leads}</td>
                    <td className="px-4 py-1.5 border-r border-stone-800 text-center text-rose-400">{row.atc}</td>
                    <td className={`px-4 py-1.5 text-center ${pctColor(row.pct_atc_hora)}`}>{row.pct_atc_hora}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TABLA 4 — MOTIVOS ATC
// ══════════════════════════════════════════════════════════════════════════════
function TablaMonitoreoAtc({ fechaDesde, fechaHasta }) {
  const [data, setData] = useState([]);
  const [totales, setTotales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [vista, setVista] = useState("resumen");

  const fetch_ = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/redes/monitoreo-atc?fechaDesde=${fechaDesde}&fechaHasta=${fechaHasta}`
      );
      const r = await res.json();
      if (r.success) { setData(r.data); setTotales(r.totales); }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetch_(); }, [fechaDesde, fechaHasta]);

  const totalAtc = totales.reduce((a, r) => a + Number(r.cantidad || 0), 0);

  return (
    <div className="bg-stone-950 rounded-2xl border border-stone-800 shadow-2xl overflow-hidden mb-8">
      <div className="px-5 py-3 bg-stone-900 border-b border-stone-800 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[10px] font-black text-rose-400 uppercase italic tracking-widest flex items-center gap-2">
          <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
          Motivos ATC
        </h3>
        <div className="flex items-center gap-3">
          <TotalBadge label="Total ATC" value={totalAtc} color="bg-rose-900/60 text-rose-300" />
          <div className="flex bg-stone-800 rounded-lg p-0.5">
            {["resumen", "detalle"].map((v) => (
              <button key={v} onClick={() => setVista(v)}
                className={`px-3 py-1 text-[8px] font-black uppercase rounded-md transition-all ${vista === v ? "bg-rose-600 text-white" : "text-stone-400 hover:text-white"}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-auto max-h-[400px]">
        {loading ? (
          <div className="text-center py-12 text-stone-500 text-[10px] uppercase">Cargando...</div>
        ) : vista === "resumen" ? (
          <table className="text-[9px] font-mono border-collapse w-full whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr className="bg-stone-800 text-stone-400 font-black uppercase">
                {["MOTIVO ATC", "CANTIDAD", "% DEL TOTAL"].map((h) => (
                  <th key={h} className="px-4 py-2 border-r border-stone-700 text-center last:border-r-0">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {totales.map((row, i) => {
                const pct = totalAtc > 0 ? ((Number(row.cantidad) / totalAtc) * 100).toFixed(1) : 0;
                return (
                  <tr key={i} className="border-b border-stone-800 hover:bg-stone-900 transition-colors">
                    <td className="px-4 py-1.5 border-r border-stone-800 text-rose-300 font-bold uppercase">{row.motivo_atc}</td>
                    <td className="px-4 py-1.5 border-r border-stone-800 text-center text-white font-black">{row.cantidad}</td>
                    <td className="px-4 py-1.5 text-center">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-stone-800 rounded-full h-1.5 overflow-hidden">
                          <div className="h-1.5 bg-rose-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-rose-300 font-black w-10 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="text-[9px] font-mono border-collapse w-full whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr className="bg-stone-800 text-stone-400 font-black uppercase">
                {["FECHA", "MOTIVO ATC", "CANTIDAD"].map((h) => (
                  <th key={h} className="px-4 py-2 border-r border-stone-700 text-center last:border-r-0">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr><td colSpan={3} className="text-center py-10 text-stone-500 uppercase text-[9px]">Sin datos</td></tr>
              ) : (
                data.map((row, i) => (
                  <tr key={i} className="border-b border-stone-800 hover:bg-stone-900 transition-colors">
                    <td className="px-4 py-1.5 border-r border-stone-800 text-orange-300 font-black">{formatFecha(row.fecha)}</td>
                    <td className="px-4 py-1.5 border-r border-stone-800 text-rose-300 font-bold uppercase">{row.motivo_atc}</td>
                    <td className="px-4 py-1.5 text-center text-white font-black">{row.cantidad}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL — Redes.jsx
// ══════════════════════════════════════════════════════════════════════════════
export default function Redes() {
  const hoy = getFechaHoy();
  const [fechaDesde, setFechaDesde] = useState(hoy);
  const [fechaHasta, setFechaHasta] = useState(hoy);
  const [filtroActivo, setFiltroActivo] = useState({ desde: hoy, hasta: hoy });
  const [loading, setLoading] = useState(false);

  const handleChange = (key, val) => {
    if (key === "fechaDesde") setFechaDesde(val);
    else setFechaHasta(val);
  };

  const handleAplicar = () => {
    setLoading(true);
    setFiltroActivo({ desde: fechaDesde, hasta: fechaHasta });
    setTimeout(() => setLoading(false), 300);
  };

  return (
    <div className="min-h-screen bg-stone-950 p-6 font-['Inter',_sans-serif]">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2 mb-1">
          <span className="bg-orange-600 text-white px-2 py-0.5 rounded italic text-lg">VLS</span>
          Monitoreo Redes General
        </h1>
        <p className="text-[9px] text-stone-500 uppercase tracking-widest font-bold">
          Inversión · Leads · Ciudad · Hora · ATC — Actualización cada 15 min
        </p>
      </div>

      {/* Filtro */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl px-5 py-4 mb-8">
        <FiltroPeriodo
          fechaDesde={fechaDesde}
          fechaHasta={fechaHasta}
          onChange={handleChange}
          onAplicar={handleAplicar}
          loading={loading}
        />
        <p className="text-[8px] text-stone-600 uppercase font-bold">
          Período activo: {formatFecha(filtroActivo.desde)} → {formatFecha(filtroActivo.hasta)}
        </p>
      </div>

      {/* Tabla 1 */}
      <TablaMonitoreoRedes
        fechaDesde={filtroActivo.desde}
        fechaHasta={filtroActivo.hasta}
      />

      {/* Tabla 2 */}
      <TablaMonitoreoCiudad
        fechaDesde={filtroActivo.desde}
        fechaHasta={filtroActivo.hasta}
      />

      {/* Tabla 3 */}
      <TablaMonitoreoHora
        fechaDesde={filtroActivo.desde}
        fechaHasta={filtroActivo.hasta}
      />

      {/* Tabla 4 */}
      <TablaMonitoreoAtc
        fechaDesde={filtroActivo.desde}
        fechaHasta={filtroActivo.hasta}
      />

    </div>
  );
}