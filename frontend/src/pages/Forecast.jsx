/**
 * Forecast.jsx — Módulo de seguimiento de campañas publicitarias
 * Consume: GET /api/forecast/dashboard | /api/forecast/diario/:canal
 *          GET /api/forecast/ejecutivos | /api/forecast/objetivos
 *          POST /api/forecast/objetivos (solo admin)
 */
import { useState, useEffect, useCallback } from "react";
import { jwtDecode } from "jwt-decode";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ComposedChart, Cell,
} from "recharts";

const API = `${import.meta.env.VITE_API_URL}/api/forecast`;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getToken  = () => localStorage.getItem("token");
const headers   = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" });
const getUserRol = () => {
  try { return jwtDecode(getToken()).perfil || null; } catch { return null; }
};

const fmt  = (n, d = 0) => n == null ? "—" : Number(n).toLocaleString("es-EC", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtM = (n) => n == null ? "—" : `$${Number(n).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtP = (n) => n == null ? "—" : `${Number(n * 100).toFixed(1)}%`;

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const CAMPANAS_DEFAULT = ["ARTS FACEBOOK","ARTS GOOGLE","VIDIKA GOOGLE","REMARKETING","ARTS"];

const CAMPANA_COLOR = {
  "ARTS FACEBOOK":  "#3b82f6",
  "ARTS GOOGLE":    "#f59e0b",
  "VIDIKA GOOGLE":  "#10b981",
  "REMARKETING":    "#8b5cf6",
  "ARTS":           "#6366f1",
};

const pctColor = (pct) => {
  if (pct == null) return "text-slate-400";
  if (pct >= 95) return "text-emerald-600";
  if (pct >= 75) return "text-yellow-600";
  return "text-red-500";
};

// ─── Componentes pequeños ────────────────────────────────────────────────────

function KpiCard({ label, real, objetivo, pct, prefijo = "", sufijo = "", decimals = 0, color }) {
  const pctOk  = pct != null;
  const pctTxt = pctOk ? `${pct}%` : null;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-1 shadow-sm">
      <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">{label}</span>
      <span className="text-2xl font-black" style={{ color: color || "#1e293b" }}>
        {prefijo}{fmt(real, decimals)}{sufijo}
      </span>
      {objetivo != null && (
        <span className="text-xs text-slate-400">
          Meta: <span className="font-semibold text-slate-600">{prefijo}{fmt(objetivo, decimals)}{sufijo}</span>
          {pctOk && (
            <span className={`ml-2 font-bold ${pctColor(pct)}`}>{pctTxt}</span>
          )}
        </span>
      )}
    </div>
  );
}

function RatioRow({ label, real, objetivo, better = "low" }) {
  const realPct = real != null ? +(real * 100).toFixed(1) : null;
  const objPct  = objetivo != null ? +(objetivo * 100).toFixed(1) : null;
  const ok = realPct != null && objPct != null
    ? (better === "low" ? realPct <= objPct : realPct >= objPct)
    : null;
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-2 pr-4 text-sm text-slate-600 font-medium">{label}</td>
      <td className="py-2 text-sm font-bold text-slate-800">{realPct != null ? `${realPct}%` : "—"}</td>
      <td className="py-2 text-sm text-slate-400">{objPct != null ? `${objPct}%` : "—"}</td>
      <td className="py-2">
        {ok != null && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
            {ok ? "✓ OK" : "✗ Off"}
          </span>
        )}
      </td>
    </tr>
  );
}

function ProgressBar({ pct, color = "#3b82f6" }) {
  const clamped = Math.min(pct || 0, 100);
  return (
    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${clamped}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ─── Tab Campañas ─────────────────────────────────────────────────────────────
function TabCampanas({ campanas, periodo, isAdmin, mes, anio, onRefresh }) {
  const [selected, setSelected] = useState(null);
  const [diario, setDiario]     = useState(null);
  const [loadingDiario, setLoadingDiario] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({});
  const [saving, setSaving]     = useState(false);

  const loadDiario = useCallback(async (canal) => {
    setLoadingDiario(true);
    try {
      const r = await fetch(`${API}/diario/${encodeURIComponent(canal)}?mes=${mes}&anio=${anio}`, { headers: headers() });
      const d = await r.json();
      if (d.ok) setDiario(d);
    } catch {}
    setLoadingDiario(false);
  }, [mes, anio]);

  const handleSelect = (c) => {
    setSelected(c.campana);
    loadDiario(c.campana);
    if (c.objetivo) {
      setForm({
        inversion_mensual:   c.objetivo.inversion_mensual,
        cpl_objetivo:        c.objetivo.cpl_objetivo,
        cpa_objetivo:        c.objetivo.cpa_objetivo,
        leads_objetivo:      c.objetivo.leads_objetivo,
        ventas_objetivo:     c.objetivo.ventas_objetivo,
        ratio_atc:           +(c.objetivo.ratio_atc * 100).toFixed(2),
        ratio_fc_zp:         +(c.objetivo.ratio_fc_zp * 100).toFixed(2),
        ratio_innegociable:  +(c.objetivo.ratio_innegociable * 100).toFixed(2),
        ratio_gestionable:   +(c.objetivo.ratio_gestionable * 100).toFixed(2),
        ratio_efectividad:   +(c.objetivo.ratio_efectividad * 100).toFixed(2),
        ratio_activacion:    +(c.objetivo.ratio_activacion * 100).toFixed(2),
      });
    } else {
      setForm({});
    }
    setShowForm(false);
  };

  const handleSave = async () => {
    const campana = campanas.find(c => c.campana === selected);
    if (!campana) return;
    setSaving(true);
    try {
      const body = {
        empresa: "NOVONET", campana: selected, mes, anio,
        inversion_mensual:  parseFloat(form.inversion_mensual) || null,
        cpl_objetivo:       parseFloat(form.cpl_objetivo) || null,
        cpa_objetivo:       parseFloat(form.cpa_objetivo) || null,
        leads_objetivo:     parseInt(form.leads_objetivo) || null,
        ventas_objetivo:    parseInt(form.ventas_objetivo) || null,
        ratio_atc:          (parseFloat(form.ratio_atc) || 0) / 100,
        ratio_fc_zp:        (parseFloat(form.ratio_fc_zp) || 0) / 100,
        ratio_innegociable: (parseFloat(form.ratio_innegociable) || 0) / 100,
        ratio_gestionable:  (parseFloat(form.ratio_gestionable) || 0) / 100,
        ratio_efectividad:  (parseFloat(form.ratio_efectividad) || 0) / 100,
        ratio_activacion:   (parseFloat(form.ratio_activacion) || 0) / 100,
      };
      await fetch(`${API}/objetivos`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
      setShowForm(false);
      onRefresh();
    } catch {}
    setSaving(false);
  };

  const active = campanas.find(c => c.campana === selected);

  return (
    <div className="flex flex-col gap-6">
      {/* Tabs de campaña */}
      <div className="flex flex-wrap gap-2">
        {campanas.map(c => (
          <button
            key={c.campana}
            onClick={() => handleSelect(c)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all
              ${selected === c.campana
                ? "text-white border-transparent shadow"
                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            style={selected === c.campana ? { backgroundColor: CAMPANA_COLOR[c.campana] || "#6366f1" } : {}}
          >
            {c.campana}
          </button>
        ))}
      </div>

      {!active && (
        <div className="text-center py-20 text-slate-400 text-sm">
          Selecciona una campaña para ver el detalle
        </div>
      )}

      {active && (
        <div className="flex flex-col gap-6 animate-fade-in-up">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="Inversión" real={active.total_inversion} objetivo={active.objetivo?.inversion_mensual}
              pct={active.pct_inversion} prefijo="$" decimals={0} color={CAMPANA_COLOR[active.campana]} />
            <KpiCard label="CPL Real" real={active.cpl_real} objetivo={active.objetivo?.cpl_objetivo}
              pct={active.cpl_real && active.objetivo?.cpl_objetivo
                ? +(active.objetivo.cpl_objetivo / active.cpl_real * 100).toFixed(1) : null}
              prefijo="$" decimals={2} />
            <KpiCard label="CPA Real" real={active.cpa_real} objetivo={active.objetivo?.cpa_objetivo}
              pct={active.cpa_real && active.objetivo?.cpa_objetivo
                ? +(active.objetivo.cpa_objetivo / active.cpa_real * 100).toFixed(1) : null}
              prefijo="$" decimals={2} />
            <KpiCard label="Leads" real={active.total_leads} objetivo={active.objetivo?.leads_objetivo}
              pct={active.pct_leads} />
            <KpiCard label="Ventas" real={active.total_ventas} objetivo={active.objetivo?.ventas_objetivo}
              pct={active.objetivo?.ventas_objetivo
                ? +(active.total_ventas / active.objetivo.ventas_objetivo * 100).toFixed(1) : null} />
            <KpiCard label="Activaciones" real={active.total_activaciones} />
          </div>

          {/* Progreso del mes */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-slate-700">Progreso del mes</span>
              <span className="text-xs text-slate-500">
                Día {periodo.dias_transcurridos} de {periodo.dias_mes} — {periodo.progreso_pct}% transcurrido
              </span>
            </div>
            <ProgressBar pct={periodo.progreso_pct} color={CAMPANA_COLOR[active.campana]} />
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>Proyección leads: {fmt(active.leads_proyectado)}</span>
              <span>Proyección inv: {fmtM(active.inv_proyectada)}</span>
            </div>
          </div>

          {/* Ratios */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 mb-3">Ratios de gestión</h3>
            <table className="w-full">
              <thead>
                <tr className="text-xs text-slate-400 uppercase">
                  <th className="text-left pb-2">Indicador</th>
                  <th className="text-left pb-2">Real</th>
                  <th className="text-left pb-2">Objetivo</th>
                  <th className="text-left pb-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                <RatioRow label="ATC / Soporte"    real={active.ratio_atc}         objetivo={active.objetivo?.ratio_atc}         better="low" />
                <RatioRow label="FC + Zona Peligro" real={active.ratio_fc_zp}       objetivo={active.objetivo?.ratio_fc_zp}       better="low" />
                <RatioRow label="Innegociable"     real={active.ratio_inneg}        objetivo={active.objetivo?.ratio_innegociable} better="low" />
                <RatioRow label="Gestionable"      real={active.ratio_gestionable}  objetivo={active.objetivo?.ratio_gestionable} better="high" />
                <RatioRow label="Efectividad"      real={active.ratio_efectividad}  objetivo={active.objetivo?.ratio_efectividad} better="high" />
                <RatioRow label="Activación"       real={active.ratio_activacion}   objetivo={active.objetivo?.ratio_activacion}  better="high" />
              </tbody>
            </table>
          </div>

          {/* Gráfico diario */}
          {loadingDiario && (
            <div className="text-center py-10 text-slate-400 text-sm">Cargando datos diarios…</div>
          )}
          {diario && !loadingDiario && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-4">Evolución diaria</h3>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={diario.dias} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                    formatter={(value, name) => {
                      if (name === "inversion" || name === "inv_objetivo_dia") return [`$${Number(value).toFixed(0)}`, name === "inversion" ? "Inversión" : "Inv. objetivo"];
                      return [value, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="leads" name="Leads" fill={CAMPANA_COLOR[selected] || "#6366f1"} opacity={0.8} radius={[3,3,0,0]} />
                  <Bar yAxisId="left" dataKey="ventas" name="Ventas" fill="#10b981" opacity={0.8} radius={[3,3,0,0]} />
                  <Line yAxisId="right" type="monotone" dataKey="inversion" name="Inversión $" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  {diario.dias[0]?.inv_objetivo_dia != null && (
                    <Line yAxisId="right" type="monotone" dataKey="inv_objetivo_dia" name="Objetivo diario $"
                      stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Botón editar objetivos (solo admin) */}
          {isAdmin && (
            <div className="flex justify-end">
              <button
                onClick={() => setShowForm(!showForm)}
                className="px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition"
              >
                {showForm ? "Cancelar" : "✏️ Editar objetivos"}
              </button>
            </div>
          )}

          {/* Formulario de objetivos */}
          {showForm && isAdmin && (
            <div className="bg-white rounded-2xl border border-violet-200 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-4">Objetivos — {selected} — {MESES[mes-1]} {anio}</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { key: "inversion_mensual", label: "Inversión mensual ($)" },
                  { key: "cpl_objetivo",      label: "CPL objetivo ($)" },
                  { key: "cpa_objetivo",      label: "CPA objetivo ($)" },
                  { key: "leads_objetivo",    label: "Leads objetivo" },
                  { key: "ventas_objetivo",   label: "Ventas objetivo" },
                  { key: "ratio_atc",         label: "ATC objetivo (%)" },
                  { key: "ratio_fc_zp",       label: "FC + ZP objetivo (%)" },
                  { key: "ratio_innegociable",label: "Inneg. objetivo (%)" },
                  { key: "ratio_gestionable", label: "Gestionable objetivo (%)" },
                  { key: "ratio_efectividad", label: "Efectividad objetivo (%)" },
                  { key: "ratio_activacion",  label: "Activación objetivo (%)" },
                ].map(f => (
                  <div key={f.key} className="flex flex-col gap-1">
                    <label className="text-xs text-slate-500 font-medium">{f.label}</label>
                    <input
                      type="number" step="0.01"
                      value={form[f.key] ?? ""}
                      onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400"
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-3 mt-5">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancelar</button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-5 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-60"
                >
                  {saving ? "Guardando…" : "Guardar objetivos"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab Ejecutivos ───────────────────────────────────────────────────────────
function TabEjecutivos({ mes, anio }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [canal, setCanal]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = `${API}/ejecutivos?mes=${mes}&anio=${anio}${canal ? `&canal=${encodeURIComponent(canal)}` : ""}`;
      const r = await fetch(url, { headers: headers() });
      const d = await r.json();
      if (d.ok) setData(d);
    } catch {}
    setLoading(false);
  }, [mes, anio, canal]);

  useEffect(() => { load(); }, [load]);

  const tcColor = (pct) => {
    if (pct <= 30) return "text-emerald-600 bg-emerald-50";
    if (pct <= 45) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Filtro canal */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-600 font-medium">Filtrar por campaña:</label>
        <select
          value={canal}
          onChange={e => setCanal(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400"
        >
          <option value="">Todas</option>
          {["ARTS FACEBOOK","ARTS GOOGLE","VIDIKA GOOGLE","REMARKETING","ARTS"].map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {loading && <div className="text-center py-16 text-slate-400 text-sm">Cargando ejecutivos…</div>}

      {!loading && data && data.equipos.map(equipo => (
        <div key={equipo.supervisor} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header supervisor */}
          <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 flex items-center justify-between">
            <span className="text-white font-bold text-sm">{equipo.supervisor}</span>
            <div className="flex gap-4 text-white text-xs">
              <span>Leads: <b>{fmt(equipo.totales.total_leads)}</b></span>
              <span>Ventas: <b>{fmt(equipo.totales.ventas)}</b></span>
              <span>%TC: <b>{equipo.totales.pct_tc}%</b></span>
              <span>Efect: <b>{equipo.totales.pct_efect}%</b></span>
            </div>
          </div>

          {/* Tabla agentes */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-xs text-slate-500 uppercase">
                  <th className="text-left px-4 py-2">Ejecutivo</th>
                  <th className="px-3 py-2">Leads</th>
                  <th className="px-3 py-2">ATC</th>
                  <th className="px-3 py-2">FC+ZP</th>
                  <th className="px-3 py-2">Inneg</th>
                  <th className="px-3 py-2">Gest.</th>
                  <th className="px-3 py-2">Ventas</th>
                  <th className="px-3 py-2">Activ.</th>
                  <th className="px-3 py-2">%TC</th>
                  <th className="px-3 py-2">Efect.</th>
                </tr>
              </thead>
              <tbody>
                {equipo.agentes.map((ag, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition">
                    <td className="px-4 py-2.5 font-medium text-slate-700">
                      {ag.ejecutivo}
                      {ag.codigo && <span className="ml-1 text-xs text-slate-400">#{ag.codigo}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-600">{fmt(ag.total_leads)}</td>
                    <td className="px-3 py-2.5 text-center text-slate-500">{fmt(ag.atc)}</td>
                    <td className="px-3 py-2.5 text-center text-slate-500">{fmt(ag.fc_zp)}</td>
                    <td className="px-3 py-2.5 text-center text-slate-500">{fmt(ag.inneg)}</td>
                    <td className="px-3 py-2.5 text-center font-semibold text-slate-700">{fmt(ag.gestionable)}</td>
                    <td className="px-3 py-2.5 text-center font-bold text-emerald-600">{fmt(ag.ventas)}</td>
                    <td className="px-3 py-2.5 text-center text-blue-600">{fmt(ag.activaciones)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tcColor(ag.pct_tc)}`}>
                        {ag.pct_tc}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                        ${ag.pct_efect >= 25 ? "bg-emerald-50 text-emerald-700" : ag.pct_efect >= 15 ? "bg-yellow-50 text-yellow-700" : "bg-red-50 text-red-600"}`}>
                        {ag.pct_efect}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {!loading && data && data.equipos.length === 0 && (
        <div className="text-center py-16 text-slate-400 text-sm">
          Sin datos de ejecutivos para este período
        </div>
      )}
    </div>
  );
}

// ─── Tab Resumen general ──────────────────────────────────────────────────────
function TabResumen({ campanas, totales, periodo }) {
  const chartData = campanas.map(c => ({
    campana: c.campana.replace(" GOOGLE", " G.").replace(" FACEBOOK", " FB"),
    leads:   c.total_leads,
    ventas:  c.total_ventas,
    inversion: c.total_inversion,
    cpl:     c.cpl_real,
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* Totales globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Leads" real={totales.total_leads} color="#6366f1" />
        <KpiCard label="Total Ventas" real={totales.total_ventas} color="#10b981" />
        <KpiCard label="Total Activaciones" real={totales.total_activaciones} color="#3b82f6" />
        <KpiCard label="Total Inversión" real={totales.total_inversion} prefijo="$" color="#f59e0b" />
      </div>

      {/* Barra comparativa leads por campaña */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-700 mb-4">Leads y Ventas por campaña</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="campana" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="leads" name="Leads" radius={[4,4,0,0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={Object.values(CAMPANA_COLOR)[i] || "#6366f1"} />
              ))}
            </Bar>
            <Bar dataKey="ventas" name="Ventas" fill="#10b981" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* CPL por campaña */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-700 mb-4">CPL real por campaña</h3>
        <div className="flex flex-col gap-3">
          {campanas.map(c => {
            const pctObj = c.objetivo?.cpl_objetivo && c.cpl_real
              ? +(c.objetivo.cpl_objetivo / c.cpl_real * 100).toFixed(1)
              : null;
            return (
              <div key={c.campana}>
                <div className="flex justify-between items-center text-sm mb-1">
                  <span className="font-medium text-slate-700">{c.campana}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500 text-xs">
                      {c.objetivo?.cpl_objetivo ? `Obj: $${c.objetivo.cpl_objetivo}` : ""}
                    </span>
                    <span className="font-bold" style={{ color: CAMPANA_COLOR[c.campana] || "#6366f1" }}>
                      {c.cpl_real ? `$${c.cpl_real}` : "—"}
                    </span>
                    {pctObj && (
                      <span className={`text-xs font-semibold ${pctColor(pctObj)}`}>{pctObj}%</span>
                    )}
                  </div>
                </div>
                <ProgressBar
                  pct={pctObj ? Math.min(pctObj, 100) : (c.total_leads > 0 ? 50 : 0)}
                  color={CAMPANA_COLOR[c.campana] || "#6366f1"}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabla resumen */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr className="text-xs text-slate-500 uppercase">
              <th className="text-left px-4 py-3">Campaña</th>
              <th className="px-3 py-3">Leads</th>
              <th className="px-3 py-3">Inversión</th>
              <th className="px-3 py-3">CPL</th>
              <th className="px-3 py-3">Ventas</th>
              <th className="px-3 py-3">Activac.</th>
              <th className="px-3 py-3">CPA</th>
              <th className="px-3 py-3">Efect.</th>
            </tr>
          </thead>
          <tbody>
            {campanas.map(c => (
              <tr key={c.campana} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold" style={{ color: CAMPANA_COLOR[c.campana] || "#64748b" }}>
                  {c.campana}
                </td>
                <td className="px-3 py-3 text-center">{fmt(c.total_leads)}</td>
                <td className="px-3 py-3 text-center">{fmtM(c.total_inversion)}</td>
                <td className="px-3 py-3 text-center font-semibold">{c.cpl_real ? `$${c.cpl_real}` : "—"}</td>
                <td className="px-3 py-3 text-center font-bold text-emerald-600">{fmt(c.total_ventas)}</td>
                <td className="px-3 py-3 text-center text-blue-600">{fmt(c.total_activaciones)}</td>
                <td className="px-3 py-3 text-center">{c.cpa_real ? `$${c.cpa_real}` : "—"}</td>
                <td className="px-3 py-3 text-center">{fmtP(c.ratio_efectividad)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// Componente principal
// ════════════════════════════════════════════════════════════════════════════════
export default function Forecast() {
  const hoy     = new Date();
  const [mes,   setMes]   = useState(hoy.getMonth() + 1);
  const [anio,  setAnio]  = useState(hoy.getFullYear());
  const [empresa]         = useState("NOVONET");
  const [tab, setTab]     = useState("resumen");
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const isAdmin = getUserRol() === "ADMINISTRADOR";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/dashboard?empresa=${empresa}&mes=${mes}&anio=${anio}`, { headers: headers() });
      const d = await r.json();
      if (d.ok) setData(d);
      else setError(d.error || "Error cargando datos");
    } catch (e) {
      setError("Error de conexión");
    }
    setLoading(false);
  }, [empresa, mes, anio]);

  useEffect(() => { load(); }, [load]);

  const tabs = [
    { id: "resumen",    label: "📊 Resumen general" },
    { id: "campanas",   label: "🎯 Por campaña" },
    { id: "ejecutivos", label: "👥 Ejecutivos" },
  ];

  const aniosDisp = Array.from({ length: 3 }, (_, i) => hoy.getFullYear() - i);

  return (
    <div className="flex flex-col gap-6 pb-10 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">🎯 Forecast Campañas</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Seguimiento de objetivos vs. real — <span className="font-semibold text-violet-600">{empresa}</span>
            {" "}·{" "}
            <span className="text-slate-400 text-xs">VELSA próximamente</span>
          </p>
        </div>

        {/* Filtros mes / año */}
        <div className="flex items-center gap-3">
          <select
            value={mes}
            onChange={e => setMes(Number(e.target.value))}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400 bg-white"
          >
            {MESES.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={anio}
            onChange={e => setAnio(Number(e.target.value))}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400 bg-white"
          >
            {aniosDisp.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button
            onClick={load}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition"
          >
            ↻ Actualizar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-semibold transition border-b-2 -mb-px
              ${tab === t.id
                ? "border-violet-600 text-violet-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Estados de carga/error */}
      {loading && (
        <div className="flex items-center justify-center py-24 text-slate-400 gap-3">
          <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Cargando datos del forecast…</span>
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Contenido por tab */}
      {!loading && !error && data && (
        <>
          {tab === "resumen" && (
            <TabResumen campanas={data.campanas} totales={data.totales} periodo={data.periodo} />
          )}
          {tab === "campanas" && (
            <TabCampanas
              campanas={data.campanas}
              periodo={data.periodo}
              isAdmin={isAdmin}
              mes={mes}
              anio={anio}
              onRefresh={load}
            />
          )}
          {tab === "ejecutivos" && (
            <TabEjecutivos mes={mes} anio={anio} />
          )}
        </>
      )}

      {!loading && !error && data && data.campanas.length === 0 && (
        <div className="text-center py-20 text-slate-400 text-sm">
          Sin datos publicitarios para {MESES[mes - 1]} {anio}
        </div>
      )}
    </div>
  );
}
