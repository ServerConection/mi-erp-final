import { useState, useEffect, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";

// ─── PALETA ──────────────────────────────────────────────────────────────────
const C = {
  nov: "#2B5EC7",
  vel: "#0D9E73",
  novLight: "#EBF1FC",
  velLight: "#D6F5EC",
  novMid: "#6D97E0",
  velMid: "#50C9A0",
  gray: "#6B7280",
  border: "rgba(0,0,0,0.08)",
  bg: "#F9FAFB",
  card: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  tip: "#9CA3AF",
};

// ─── DATOS DEMO ───────────────────────────────────────────────────────────────
const NOV_ASESORES = 45;
const VEL_ASESORES = 28;

const volData = [
  { label: "Leads totales",    nov: 1820, vel: 1105 },
  { label: "Gestionables",     nov: 1340, vel: 860  },
  { label: "Ventas CRM",       nov: 412,  vel: 268  },
  { label: "Ingresos Jot",     nov: 387,  vel: 249  },
  { label: "Activas",          nov: 298,  vel: 201  },
];

const ratesData = [
  { label: "Efectividad",   nov: 28.9, vel: 31.2, hib: true,  tip: "Ingresos Jot ÷ Gestionables × 100" },
  { label: "T. Instalación",nov: 77.0, vel: 80.7, hib: true,  tip: "Activas ÷ Ingresos Jot × 100" },
  { label: "Eficiencia",    nov: 72.3, vel: 76.1, hib: true,  tip: "Activas netas ÷ Gestionables × 100" },
  { label: "% Descarte",    nov: 14.2, vel: 11.8, hib: false, tip: "Descartados ÷ Gestionables × 100 — menor es mejor" },
  { label: "% 3ra Edad",    nov: 8.1,  vel: 6.3,  hib: false, tip: "Activos 3ra edad ÷ Total activos × 100" },
  { label: "% Tarjeta",     nov: 22.4, vel: 19.8, hib: false, tip: "Tarjeta crédito ÷ Ingresos Jot × 100" },
];

const radarData = [
  { metric: "Efectividad",    nov: 72, vel: 78 },
  { metric: "Instalación",    nov: 77, vel: 81 },
  { metric: "Eficiencia",     nov: 72, vel: 76 },
  { metric: "Prod/Asesor",    nov: 66, vel: 72 },
  { metric: "Volumen",        nov: 100, vel: 61 },
  { metric: "Desc. bajo",     nov: 60, vel: 74 },
];

const estadosNov = [
  { name: "Activo",      value: 298, color: C.nov },
  { name: "Preservicio", value: 52,  color: C.novMid },
  { name: "Otros",       value: 37,  color: "#D1D5DB" },
];
const estadosVel = [
  { name: "Activo",      value: 201, color: C.vel },
  { name: "Preservicio", value: 31,  color: C.velMid },
  { name: "Otros",       value: 17,  color: "#D1D5DB" },
];

const tableRows = [
  { name: "Leads totales",         nov: 1820,                          vel: 1105,                          hib: true,  tip: "Total leads creados en CRM" },
  { name: "Leads gestionables",    nov: 1340,                          vel: 860,                           hib: true,  tip: "En etapas activas del pipeline" },
  { name: "Ventas CRM subidas",    nov: 412,                           vel: 268,                           hib: true,  tip: 'Oportunidades "Venta Subida"' },
  { name: "Ingresos Jotform",      nov: 387,                           vel: 249,                           hib: true,  tip: "Formularios Jotform completados" },
  { name: "Activaciones activas",  nov: 298,                           vel: 201,                           hib: true,  tip: "Estado ACTIVO confirmado Netlife" },
  { name: "Leads / asesor",        nov: +(1820/NOV_ASESORES).toFixed(1), vel: +(1105/VEL_ASESORES).toFixed(1), hib: true,  tip: "Volumen normalizado por equipo" },
  { name: "Gestionables / asesor", nov: +(1340/NOV_ASESORES).toFixed(1), vel: +(860/VEL_ASESORES).toFixed(1),  hib: true,  tip: "Carga de gestión por asesor" },
  { name: "Activas / asesor",      nov: +(298/NOV_ASESORES).toFixed(2),  vel: +(201/VEL_ASESORES).toFixed(2),  hib: true,  tip: "Producción normalizada" },
  { name: "Efectividad real %",    nov: "28.9%",                       vel: "31.2%",                       hib: true,  tip: "Ingresos Jot ÷ Gestionables" },
  { name: "Tasa instalación %",    nov: "77.0%",                       vel: "80.7%",                       hib: true,  tip: "Activas ÷ Ingresos Jot" },
  { name: "Eficiencia %",          nov: "72.3%",                       vel: "76.1%",                       hib: true,  tip: "Activas netas ÷ Gestionables" },
  { name: "% Descarte",            nov: "14.2%",                       vel: "11.8%",                       hib: false, tip: "Descartados ÷ Gestionables — menor mejor" },
  { name: "Total asesores",        nov: NOV_ASESORES,                  vel: VEL_ASESORES,                  hib: false, tip: "Tamaño del equipo comercial" },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt = (v) =>
  typeof v === "number" && v >= 1000 ? v.toLocaleString("es-EC") : v;

const winnerOf = (nov, vel, hib) => {
  const n = parseFloat(String(nov).replace("%", ""));
  const v = parseFloat(String(vel).replace("%", ""));
  if (Math.abs(n - v) < 0.01) return "tie";
  return hib ? (n > v ? "nov" : "vel") : (n < v ? "nov" : "vel");
};

// ─── SUB-COMPONENTES ─────────────────────────────────────────────────────────

function Header() {
  const now = new Date();
  const mes = now.toLocaleDateString("es-EC", { month: "long", year: "numeric", timeZone: "America/Guayaquil" });
  const mesStr = mes.charAt(0).toUpperCase() + mes.slice(1);
  return (
    <div style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 16, marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>
          Gerencia General · Reporte Comparativo
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, letterSpacing: "-0.02em" }}>
          Novonet vs Velsa
        </h1>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{mesStr} · Datos de demostración</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          { label: "Novonet", count: NOV_ASESORES, color: C.nov, bg: C.novLight },
          { label: "Velsa",   count: VEL_ASESORES, color: C.vel, bg: C.velLight },
        ].map(({ label, count, color, bg }) => (
          <div key={label} style={{ background: bg, borderRadius: 8, padding: "6px 12px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{count}</span>
            <span style={{ fontSize: 10, color, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label} · asesores</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 10, marginTop: 28 }}>
      {children}
    </div>
  );
}

function KpiCard({ label, novVal, velVal, tip }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: C.nov, lineHeight: 1 }}>{fmt(novVal)}</span>
        <span style={{ fontSize: 11, color: C.tip }}>vs</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: C.vel, lineHeight: 1 }}>{fmt(velVal)}</span>
      </div>
      <div style={{ fontSize: 10, color: C.tip, borderTop: `1px solid ${C.border}`, paddingTop: 6, lineHeight: 1.5 }}>{tip}</div>
    </div>
  );
}

function Legend2({ style }) {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", ...style }}>
      {[{ label: "Novonet", color: C.nov }, { label: "Velsa", color: C.vel }].map(({ label, color }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
          <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, sub, children }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>{sub}</div>}
      {children}
    </div>
  );
}

function EffBar({ label, novVal, velVal, hib, tip }) {
  const maxV = Math.max(novVal, velVal, 1);
  const nWin = hib ? novVal >= velVal : novVal <= velVal;
  const vWin = hib ? velVal > novVal : velVal < novVal;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 9, color: C.tip }}>{hib ? "↑ mayor mejor" : "↓ menor mejor"}</span>
      </div>
      {[
        { val: novVal, win: nWin, color: C.nov, label2: "N" },
        { val: velVal, win: vWin, color: C.vel, label2: "V" },
      ].map(({ val, win, color, label2 }) => (
        <div key={label2} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <div style={{ flex: 1, height: 7, background: "#F3F4F6", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${(val / maxV) * 100}%`, height: "100%", background: color, borderRadius: 4, transition: "width .6s ease" }} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, color, minWidth: 38, textAlign: "right" }}>
            {val}%{win ? " ↑" : ""}
          </span>
        </div>
      ))}
      {tip && <div style={{ fontSize: 9, color: C.tip, marginTop: 2 }}>{tip}</div>}
    </div>
  );
}

function DonutLabel({ entries }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, justifyContent: "center" }}>
      {entries.map(({ name, value, color }) => (
        <div key={name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: C.muted }}>{name}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.text, marginLeft: "auto" }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function RatioPorAsesor() {
  const rows = [
    { label: "Leads / asesor",        nov: (1820 / NOV_ASESORES).toFixed(1), vel: (1105 / VEL_ASESORES).toFixed(1), hib: true },
    { label: "Gestionables / asesor", nov: (1340 / NOV_ASESORES).toFixed(1), vel: (860  / VEL_ASESORES).toFixed(1), hib: true },
    { label: "Ingresos Jot / asesor", nov: (387  / NOV_ASESORES).toFixed(1), vel: (249  / VEL_ASESORES).toFixed(1), hib: true },
    { label: "Activas / asesor",      nov: (298  / NOV_ASESORES).toFixed(2), vel: (201  / VEL_ASESORES).toFixed(2), hib: true },
  ];
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.nov }}>Novonet</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.vel }}>Velsa</span>
      </div>
      {rows.map(({ label, nov, vel, hib }) => {
        const nw = hib ? +nov >= +vel : +nov <= +vel;
        const vw = hib ? +vel > +nov : +vel < +nov;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
            <div style={{ display: "flex", gap: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.nov, minWidth: 36, textAlign: "right" }}>{nov}{nw ? " ↑" : ""}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.vel, minWidth: 36, textAlign: "right" }}>{vel}{vw ? " ↑" : ""}</span>
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 10, color: C.tip, marginTop: 8, lineHeight: 1.5, background: "#F9FAFB", padding: "6px 8px", borderRadius: 6, borderLeft: `3px solid ${C.border}` }}>
        Novonet tiene {NOV_ASESORES} asesores · Velsa tiene {VEL_ASESORES} asesores.
        Las métricas por asesor nivelan la cancha para comparar equipos de diferente tamaño.
      </div>
    </div>
  );
}

function ResumenTabla() {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {["Indicador", "Novonet", "Velsa", "Mejor", "¿Para qué sirve?"].map((h, i) => (
              <th key={h} style={{ padding: "6px 8px", fontWeight: 600, fontSize: 10, color: i === 1 ? C.nov : i === 2 ? C.vel : C.muted, textAlign: i >= 1 && i <= 3 ? "right" : "left", whiteSpace: "nowrap" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableRows.map(({ name, nov, vel, hib, tip }) => {
            const w = winnerOf(nov, vel, hib);
            return (
              <tr key={name} style={{ borderBottom: `1px solid ${C.border}` }}
                onMouseEnter={e => e.currentTarget.style.background = C.bg}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "7px 8px", color: C.text, fontWeight: 500 }}>{name}</td>
                <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 700, color: C.nov }}>{fmt(nov)}</td>
                <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 700, color: C.vel }}>{fmt(vel)}</td>
                <td style={{ padding: "7px 8px", textAlign: "right" }}>
                  {w === "tie" ? (
                    <span style={{ fontSize: 9, color: C.tip }}>Empate</span>
                  ) : w === "nov" ? (
                    <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: C.novLight, color: C.nov, fontWeight: 700 }}>Novonet ↑</span>
                  ) : (
                    <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: C.velLight, color: C.vel, fontWeight: 700 }}>Velsa ↑</span>
                  )}
                </td>
                <td style={{ padding: "7px 8px", fontSize: 10, color: C.tip, maxWidth: 200 }}>{tip}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function GerenciaComparativo() {
  const [tab, setTab] = useState("dashboard");

  const tabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "eficiencia", label: "Eficiencia" },
    { id: "porAsesor", label: "Por asesor" },
    { id: "resumen", label: "Resumen completo" },
  ];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "24px 16px", fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <Header />

        {/* TABS */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
          {tabs.map(({ id, label }) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: "8px 16px", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
              background: "transparent", borderBottom: tab === id ? `2px solid ${C.nov}` : "2px solid transparent",
              color: tab === id ? C.nov : C.muted, transition: "all .15s",
            }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── TAB DASHBOARD ── */}
        {tab === "dashboard" && (
          <>
            <SectionLabel>Volumen — leads y pipeline</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
              {volData.map(({ label, nov, vel }) => (
                <KpiCard key={label} label={label} novVal={nov} velVal={vel}
                  tip={{ "Leads totales": "Total leads creados en CRM", "Gestionables": "En etapas activas del pipeline", "Ventas CRM": 'Oportunidades "Venta Subida"', "Ingresos Jot": "Formularios Jotform completados", "Activas": "Estado ACTIVO en Netlife" }[label] || ""} />
              ))}
            </div>

            <SectionLabel>Comparativo de volúmenes</SectionLabel>
            <ChartCard title="Indicadores clave" sub="Valores absolutos del mes actual">
              <Legend2 style={{ marginBottom: 12 }} />
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={volData} barCategoryGap="30%" barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v} />
                  <Tooltip
                    contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                    formatter={(v, name) => [v.toLocaleString("es-EC"), name]}
                  />
                  <Bar dataKey="nov" name="Novonet" fill={C.nov} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="vel" name="Velsa"   fill={C.vel} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <SectionLabel>Radar — perfil de desempeño normalizado</SectionLabel>
            <ChartCard title="Perfil comparativo multidimensional" sub="Valores normalizados 0–100 para comparación entre equipos">
              <Legend2 style={{ marginBottom: 12 }} />
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke={C.border} />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: C.muted }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Novonet" dataKey="nov" stroke={C.nov} fill={C.nov} fillOpacity={0.2} strokeWidth={2} />
                  <Radar name="Velsa"   dataKey="vel" stroke={C.vel} fill={C.vel} fillOpacity={0.2} strokeWidth={2} />
                  <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                </RadarChart>
              </ResponsiveContainer>
            </ChartCard>

            <SectionLabel>Distribución de estados Netlife</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { title: "Novonet", data: estadosNov },
                { title: "Velsa",   data: estadosVel },
              ].map(({ title, data }) => (
                <ChartCard key={title} title={title} sub="Activo · Preservicio · Otros">
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <ResponsiveContainer width={130} height={130}>
                      <PieChart>
                        <Pie data={data} dataKey="value" innerRadius={38} outerRadius={58} paddingAngle={2}>
                          {data.map(({ name, color }) => <Cell key={name} fill={color} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <DonutLabel entries={data} />
                  </div>
                </ChartCard>
              ))}
            </div>
          </>
        )}

        {/* ── TAB EFICIENCIA ── */}
        {tab === "eficiencia" && (
          <>
            <SectionLabel>Tasas de eficiencia y conversión</SectionLabel>
            <ChartCard title="Comparativo porcentual" sub="↑ mayor es mejor, excepto Descarte y métricas marcadas con ↓">
              <Legend2 style={{ marginBottom: 16 }} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
                {ratesData.map(({ label, nov, vel, hib, tip }) => (
                  <EffBar key={label} label={label} novVal={nov} velVal={vel} hib={hib} tip={tip} />
                ))}
              </div>
            </ChartCard>

            <SectionLabel>Conversión — Jotform y activaciones</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
              {[
                { label: "Activaciones reales",   nov: 298,   vel: 201,   tip: "Estado ACTIVO confirmado por Netlife" },
                { label: "Activas / asesor",       nov: +(298/NOV_ASESORES).toFixed(1), vel: +(201/VEL_ASESORES).toFixed(1), tip: "Producción normalizada por equipo" },
                { label: "Efectividad real %",     nov: "28.9%", vel: "31.2%", tip: "Ingresos Jot ÷ Gestionables × 100" },
                { label: "Tasa instalación %",     nov: "77.0%", vel: "80.7%", tip: "Activas ÷ Ingresos Jot × 100" },
              ].map(({ label, nov, vel, tip }) => (
                <KpiCard key={label} label={label} novVal={nov} velVal={vel} tip={tip} />
              ))}
            </div>
          </>
        )}

        {/* ── TAB POR ASESOR ── */}
        {tab === "porAsesor" && (
          <>
            <SectionLabel>Rendimiento normalizado por asesor</SectionLabel>
            <ChartCard title="Métricas por asesor" sub="Permite comparar equipos de distinto tamaño sin distorsión por volumen">
              <RatioPorAsesor />
            </ChartCard>

            <SectionLabel>Comparativo visual — producción por asesor</SectionLabel>
            <ChartCard title="Volumen por asesor" sub="Barras normalizadas — cada bar representa el promedio por asesor del equipo">
              <Legend2 style={{ marginBottom: 12 }} />
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={[
                    { label: "Leads",        nov: +(1820/NOV_ASESORES).toFixed(1), vel: +(1105/VEL_ASESORES).toFixed(1) },
                    { label: "Gestionables", nov: +(1340/NOV_ASESORES).toFixed(1), vel: +(860/VEL_ASESORES).toFixed(1)  },
                    { label: "Ingresos Jot", nov: +(387/NOV_ASESORES).toFixed(1),  vel: +(249/VEL_ASESORES).toFixed(1)  },
                    { label: "Activas",      nov: +(298/NOV_ASESORES).toFixed(2),  vel: +(201/VEL_ASESORES).toFixed(2)  },
                  ]}
                  barCategoryGap="35%" barGap={4}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="nov" name="Novonet" fill={C.nov} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="vel" name="Velsa"   fill={C.vel} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </>
        )}

        {/* ── TAB RESUMEN ── */}
        {tab === "resumen" && (
          <>
            <SectionLabel>Todos los indicadores</SectionLabel>
            <ChartCard title="Resumen completo" sub="Ganador destacado por fila · hover para resaltar fila">
              <ResumenTabla />
            </ChartCard>
          </>
        )}

        {/* FOOTER */}
        <div style={{ marginTop: 32, padding: "12px 0", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 10, color: C.tip }}>Reporte Gerencia General · Novonet &amp; Velsa · Datos de demostración</span>
          <span style={{ fontSize: 10, color: C.tip }}>Reemplazar bloques de datos con respuesta real de la API</span>
        </div>
      </div>
    </div>
  );
}