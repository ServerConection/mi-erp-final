/**
 * REPORTE DETALLE — BI interactivo (estilo Power BI) para Novonet y Velsa.
 *
 * Cubo de eventos del backend: t(lead|mod|jot) × fecha × hora × asesor × etapa × cantidad.
 * TODO el cross-filtering ocurre aquí: clic en cualquier barra/fila/celda filtra el resto.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  LineChart, Line, CartesianGrid, Legend, Cell,
} from "recharts";

const API = import.meta.env.VITE_API_URL;
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

const TIPOS = {
  lead: { label: "Creación leads", color: "#2563eb" },
  mod:  { label: "Modificaciones CRM", color: "#f59e0b" },
  jot:  { label: "Ingresos Jotform", color: "#10b981" },
};

const hoyEc = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });

export default function ReporteDetalle({ empresa = "novonet" }) {
  const accent = empresa === "velsa" ? "#7c3aed" : "#2563eb";
  const titulo = empresa === "velsa" ? "VELSA" : "NOVONET";

  const [desde, setDesde]     = useState(hoyEc().slice(0, 7) + "-01");
  const [hasta, setHasta]     = useState(hoyEc());
  const [eventos, setEventos] = useState([]);
  const [noGest, setNoGest]   = useState(["DUPLICADO", "ATC", "FUERA DE COBERTURA", "ZONA PELIGROSA"]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // ── Filtros cruzados (estilo Power BI) ────────────────────
  const [fAsesores, setFAsesores] = useState(new Set());
  const [fEtapas, setFEtapas]     = useState(new Set());
  const [fDias, setFDias]         = useState(new Set());
  const [fHoras, setFHoras]       = useState(new Set());
  const [pivotModo, setPivotModo] = useState("jot"); // jot | crm

  const toggle = (setter) => (valor) => setter(prev => {
    const next = new Set(prev);
    next.has(valor) ? next.delete(valor) : next.add(valor);
    return next;
  });
  const togAsesor = toggle(setFAsesores), togEtapa = toggle(setFEtapas);
  const togDia = toggle(setFDias), togHora = toggle(setFHoras);
  const limpiar = () => { setFAsesores(new Set()); setFEtapas(new Set()); setFDias(new Set()); setFHoras(new Set()); };
  const hayFiltros = fAsesores.size || fEtapas.size || fDias.size || fHoras.size;

  // ── Carga del cubo ─────────────────────────────────────────
  const cargar = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch(`${API}/api/reporte-detalle/${empresa}/cubo?fechaDesde=${desde}&fechaHasta=${hasta}`, { headers: authH() });
      const d = await r.json();
      if (!d.success) { setError(d.error || "Error cargando datos"); setEventos([]); }
      else {
        setEventos(Array.isArray(d.eventos) ? d.eventos : []);
        if (Array.isArray(d.etapas_no_gestionables)) setNoGest(d.etapas_no_gestionables);
        limpiar();
      }
    } catch (e) { setError("Error de conexión"); }
    finally { setLoading(false); }
  }, [empresa, desde, hasta]);

  useEffect(() => { cargar(); }, [empresa]); // carga inicial y al cambiar de empresa

  const esGestionable = useCallback((etapa) =>
    !noGest.some(p => (etapa || "").toUpperCase().includes(p)), [noGest]);

  // ── Cubo filtrado (núcleo del cross-filtering) ────────────
  const filtrados = useMemo(() => eventos.filter(ev =>
    (!fAsesores.size || fAsesores.has(ev.a)) &&
    (!fEtapas.size   || fEtapas.has(ev.e)) &&
    (!fDias.size     || fDias.has(ev.f)) &&
    (!fHoras.size    || fHoras.has(ev.h))
  ), [eventos, fAsesores, fEtapas, fDias, fHoras]);

  const suma = (arr, cond) => arr.reduce((acc, ev) => acc + (cond(ev) ? ev.c : 0), 0);

  // ── KPIs + embudo ──────────────────────────────────────────
  const kpis = useMemo(() => {
    const leads  = suma(filtrados, ev => ev.t === "lead");
    const gest   = suma(filtrados, ev => ev.t === "lead" && esGestionable(ev.e));
    const mods   = suma(filtrados, ev => ev.t === "mod");
    const jot    = suma(filtrados, ev => ev.t === "jot");
    const activ  = suma(filtrados, ev => ev.t === "jot" && ev.e === "ACTIVO");
    return {
      leads, gest, mods, jot, activ,
      pctGest:  leads ? +((gest / leads) * 100).toFixed(1) : 0,
      pctJot:   gest ? +((jot / gest) * 100).toFixed(1) : 0,
      pctActiv: jot ? +((activ / jot) * 100).toFixed(1) : 0,
    };
  }, [filtrados, esGestionable]);

  // ── Distribuciones por etapa (clicables) ──────────────────
  const porEtapa = useCallback((tipo) => {
    const m = new Map();
    for (const ev of filtrados) if (ev.t === tipo) m.set(ev.e, (m.get(ev.e) || 0) + ev.c);
    return [...m.entries()].map(([e, c]) => ({ etapa: e, total: c })).sort((x, y) => y.total - x.total);
  }, [filtrados]);

  const etapasCRM = useMemo(() => porEtapa("lead"), [porEtapa]);
  const etapasJot = useMemo(() => porEtapa("jot"), [porEtapa]);

  // ── Por hora y por día ─────────────────────────────────────
  const porHora = useMemo(() => {
    const base = Array.from({ length: 24 }, (_, h) => ({ hora: h, lead: 0, mod: 0, jot: 0 }));
    for (const ev of filtrados) if (ev.h >= 0 && ev.h <= 23) base[ev.h][ev.t] += ev.c;
    return base;
  }, [filtrados]);

  const porDia = useMemo(() => {
    const m = new Map();
    for (const ev of filtrados) {
      if (!ev.f) continue;
      if (!m.has(ev.f)) m.set(ev.f, { fecha: ev.f, lead: 0, mod: 0, jot: 0 });
      m.get(ev.f)[ev.t] += ev.c;
    }
    return [...m.values()].sort((x, y) => x.fecha.localeCompare(y.fecha));
  }, [filtrados]);

  // ── Pivot asesor × etapa ───────────────────────────────────
  const pivot = useMemo(() => {
    const tipo = pivotModo === "jot" ? "jot" : "lead";
    const cols = new Map(); // etapa → total
    const filas = new Map(); // asesor → {etapa→c, total}
    for (const ev of filtrados) {
      if (ev.t !== tipo) continue;
      cols.set(ev.e, (cols.get(ev.e) || 0) + ev.c);
      if (!filas.has(ev.a)) filas.set(ev.a, { __total: 0 });
      const row = filas.get(ev.a);
      row[ev.e] = (row[ev.e] || 0) + ev.c;
      row.__total += ev.c;
    }
    const columnas = [...cols.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([e]) => e);
    const filasArr = [...filas.entries()]
      .map(([a, vals]) => ({ asesor: a, ...vals }))
      .sort((x, y) => y.__total - x.__total);
    return { columnas, filas: filasArr, totales: cols };
  }, [filtrados, pivotModo]);

  const descargarCSV = () => {
    const { columnas, filas } = pivot;
    const head = ["ASESOR", ...columnas, "TOTAL"].join(";");
    const body = filas.map(r => [r.asesor, ...columnas.map(c => r[c] || 0), r.__total].join(";")).join("\n");
    const blob = new Blob(["﻿" + head + "\n" + body], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `reporte_detalle_${empresa}_${desde}_${hasta}.csv`;
    a.click();
  };

  // ── UI helpers ─────────────────────────────────────────────
  const Card = ({ children, style }) => (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,.05)", ...style }}>
      {children}
    </div>
  );
  const TituloCard = ({ children }) => (
    <p style={{ fontSize: ".68rem", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".1em", margin: "0 0 .6rem" }}>{children}</p>
  );

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: "#64748b" }}>
      Cargando cubo de datos…
    </div>
  );

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── Header + filtros de fecha ── */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h1 style={{ fontSize: "1.2rem", fontWeight: 900, color: "#1e293b", margin: 0 }}>
            🔬 Reporte Detalle <span style={{ color: accent }}>{titulo}</span>
          </h1>
          <p style={{ fontSize: ".75rem", color: "#64748b", margin: "2px 0 0" }}>
            Haz clic en cualquier barra, etapa, asesor, hora o día para filtrar todo el tablero.
          </p>
        </div>
        <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
          style={{ padding: ".45rem .6rem", border: "1px solid #cbd5e1", borderRadius: 10, fontSize: ".8rem" }} />
        <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
          style={{ padding: ".45rem .6rem", border: "1px solid #cbd5e1", borderRadius: 10, fontSize: ".8rem" }} />
        <button onClick={cargar}
          style={{ padding: ".5rem 1.1rem", borderRadius: 10, border: "none", background: accent, color: "#fff", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
          Aplicar
        </button>
      </div>

      {error && <Card style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c", fontSize: ".85rem" }}>{error}</Card>}

      {/* ── Chips de filtros activos ── */}
      {hayFiltros > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: ".7rem", fontWeight: 700, color: "#64748b" }}>Filtros:</span>
          {[...fAsesores].map(v => <Chip key={"a" + v} onClick={() => togAsesor(v)} color={accent}>👤 {v}</Chip>)}
          {[...fEtapas].map(v => <Chip key={"e" + v} onClick={() => togEtapa(v)} color={accent}>🏷️ {v}</Chip>)}
          {[...fDias].map(v => <Chip key={"d" + v} onClick={() => togDia(v)} color={accent}>📅 {v}</Chip>)}
          {[...fHoras].map(v => <Chip key={"h" + v} onClick={() => togHora(v)} color={accent}>🕐 {v}:00</Chip>)}
          <button onClick={limpiar}
            style={{ fontSize: ".7rem", padding: ".25rem .7rem", borderRadius: 999, border: "1px solid #ef4444", color: "#ef4444", background: "#fff", cursor: "pointer", fontWeight: 700 }}>
            ✕ Limpiar todo
          </button>
        </div>
      )}

      {/* ── KPIs + embudo ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <KPI titulo="Leads creados" valor={kpis.leads} color="#2563eb" />
        <KPI titulo="Gestionables" valor={kpis.gest} sub={`${kpis.pctGest}% de leads`} color="#0ea5e9" />
        <KPI titulo="Modificaciones CRM" valor={kpis.mods} color="#f59e0b" />
        <KPI titulo="Ingresos Jotform" valor={kpis.jot} sub={`${kpis.pctJot}% de gestionables`} color="#10b981" />
        <KPI titulo="Activas (Jot)" valor={kpis.activ} sub={`${kpis.pctActiv}% de ingresos`} color="#22c55e" />
      </div>

      {/* ── Embudo de conversión ── */}
      <Card>
        <TituloCard>Embudo de conversión</TituloCard>
        {[
          { label: "Leads", valor: kpis.leads, color: "#2563eb" },
          { label: "Gestionables", valor: kpis.gest, color: "#0ea5e9" },
          { label: "Ingresos Jotform", valor: kpis.jot, color: "#10b981" },
          { label: "Activas", valor: kpis.activ, color: "#22c55e" },
        ].map((n, i, arr) => {
          const max = arr[0].valor || 1;
          const pct = Math.max(4, (n.valor / max) * 100);
          const convPrev = i > 0 && arr[i - 1].valor ? ((n.valor / arr[i - 1].valor) * 100).toFixed(1) : null;
          return (
            <div key={n.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ width: 130, fontSize: ".72rem", fontWeight: 700, color: "#475569", textAlign: "right" }}>{n.label}</span>
              <div style={{ flex: 1 }}>
                <div style={{ width: `${pct}%`, background: n.color, color: "#fff", borderRadius: 8, padding: ".3rem .6rem", fontSize: ".75rem", fontWeight: 800, minWidth: 60 }}>
                  {n.valor.toLocaleString()}
                </div>
              </div>
              <span style={{ width: 90, fontSize: ".7rem", color: "#94a3b8" }}>{convPrev ? `↓ ${convPrev}%` : ""}</span>
            </div>
          );
        })}
      </Card>

      {/* ── Etapas CRM + Estatus Jotform (clicables) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 14 }}>
        <Card>
          <TituloCard>Leads por etapa CRM — clic para filtrar</TituloCard>
          <ListaEtapas datos={etapasCRM} seleccion={fEtapas} onClick={togEtapa} accent={accent} esGestionable={esGestionable} />
        </Card>
        <Card>
          <TituloCard>Ingresos Jotform por estatus — clic para filtrar</TituloCard>
          <ListaEtapas datos={etapasJot} seleccion={fEtapas} onClick={togEtapa} accent="#10b981" esGestionable={() => true} />
        </Card>
      </div>

      {/* ── Actividad por hora ── */}
      <Card>
        <TituloCard>Actividad por hora del día — clic en una barra para filtrar la hora</TituloCard>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={porHora} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="hora" tickFormatter={h => `${h}h`} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip labelFormatter={h => `${h}:00 — ${Number(h) + 1}:00`} />
            <Legend formatter={(v) => TIPOS[v]?.label || v} wrapperStyle={{ fontSize: 12 }} />
            {Object.keys(TIPOS).map(t => (
              <Bar key={t} dataKey={t} stackId="x" fill={TIPOS[t].color} cursor="pointer"
                onClick={(d) => d && togHora(d.hora)}>
                {porHora.map((row, i) => (
                  <Cell key={i} opacity={!fHoras.size || fHoras.has(row.hora) ? 1 : 0.25} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* ── Tendencia por día ── */}
      <Card>
        <TituloCard>Tendencia por día — clic en un punto para filtrar el día</TituloCard>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={porDia} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="fecha" tick={{ fontSize: 10 }} tickFormatter={f => f.slice(5)} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend formatter={(v) => TIPOS[v]?.label || v} wrapperStyle={{ fontSize: 12 }} />
            {Object.keys(TIPOS).map(t => (
              <Line key={t} type="monotone" dataKey={t} stroke={TIPOS[t].color} strokeWidth={2}
                dot={{ r: 3, cursor: "pointer", onClick: (_, p) => p?.payload && togDia(p.payload.fecha) }}
                activeDot={{ r: 6, cursor: "pointer", onClick: (_, p) => p?.payload && togDia(p.payload.fecha) }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* ── Pivot asesor × etapa ── */}
      <Card>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <TituloCard>Tabla dinámica: asesor × {pivotModo === "jot" ? "estatus Jotform" : "etapa CRM"}</TituloCard>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {[["jot", "Jotform"], ["crm", "CRM"]].map(([m, lbl]) => (
              <button key={m} onClick={() => setPivotModo(m)}
                style={{
                  fontSize: ".72rem", padding: ".3rem .9rem", borderRadius: 999, cursor: "pointer", fontWeight: 700,
                  border: `1px solid ${pivotModo === m ? accent : "#cbd5e1"}`,
                  background: pivotModo === m ? accent : "#fff",
                  color: pivotModo === m ? "#fff" : "#64748b",
                }}>{lbl}</button>
            ))}
            <button onClick={descargarCSV}
              style={{ fontSize: ".72rem", padding: ".3rem .9rem", borderRadius: 999, border: "1px solid #10b981", background: "#fff", color: "#059669", fontWeight: 700, cursor: "pointer" }}>
              ⬇ CSV
            </button>
          </div>
        </div>
        <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: ".72rem" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
              <tr style={{ background: "#1e293b", color: "#fff" }}>
                <th style={{ padding: ".45rem .6rem", textAlign: "left", position: "sticky", left: 0, background: "#1e293b" }}>ASESOR (clic filtra)</th>
                {pivot.columnas.map(c => (
                  <th key={c} onClick={() => togEtapa(c)}
                    style={{ padding: ".45rem .5rem", cursor: "pointer", whiteSpace: "nowrap", background: fEtapas.has(c) ? accent : "#1e293b" }}
                    title="Clic para filtrar esta etapa">
                    {c.length > 16 ? c.slice(0, 15) + "…" : c}
                  </th>
                ))}
                <th style={{ padding: ".45rem .6rem", background: "#0f172a" }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {pivot.filas.map((r, idx) => (
                <tr key={r.asesor}
                  style={{ background: fAsesores.has(r.asesor) ? `${accent}18` : idx % 2 ? "#f8fafc" : "#fff", cursor: "pointer" }}
                  onClick={() => togAsesor(r.asesor)}>
                  <td style={{ padding: ".4rem .6rem", fontWeight: 700, color: "#334155", position: "sticky", left: 0, background: "inherit", whiteSpace: "nowrap" }}>
                    {fAsesores.has(r.asesor) ? "✓ " : ""}{r.asesor}
                  </td>
                  {pivot.columnas.map(c => (
                    <td key={c} style={{ padding: ".4rem .5rem", textAlign: "center", color: r[c] ? "#1e293b" : "#cbd5e1", fontWeight: r[c] ? 700 : 400 }}>
                      {r[c] || "—"}
                    </td>
                  ))}
                  <td style={{ padding: ".4rem .6rem", textAlign: "center", fontWeight: 900, color: accent }}>{r.__total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: ".68rem", color: "#94a3b8", margin: "6px 0 0" }}>
          {pivot.filas.length} asesores · columnas = top 12 etapas por volumen · los totales respetan los filtros activos
        </p>
      </Card>
    </div>
  );
}

// ── Subcomponentes ────────────────────────────────────────────
const Chip = ({ children, onClick, color }) => (
  <button onClick={onClick}
    style={{
      fontSize: ".7rem", padding: ".25rem .7rem", borderRadius: 999, cursor: "pointer",
      border: `1px solid ${color}`, background: `${color}15`, color, fontWeight: 700,
    }}
    title="Clic para quitar este filtro">
    {children} ✕
  </button>
);

const KPI = ({ titulo, valor, sub, color }) => (
  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderLeft: `4px solid ${color}`, borderRadius: 12, padding: ".7rem .9rem" }}>
    <p style={{ fontSize: ".62rem", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", margin: 0 }}>{titulo}</p>
    <p style={{ fontSize: "1.45rem", fontWeight: 900, color: "#1e293b", margin: "2px 0 0" }}>{Number(valor).toLocaleString()}</p>
    {sub && <p style={{ fontSize: ".68rem", color, margin: 0, fontWeight: 700 }}>{sub}</p>}
  </div>
);

const ListaEtapas = ({ datos, seleccion, onClick, accent, esGestionable }) => {
  const max = datos[0]?.total || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" }}>
      {datos.length === 0 && <p style={{ fontSize: ".75rem", color: "#94a3b8" }}>Sin datos con los filtros actuales.</p>}
      {datos.slice(0, 18).map(d => {
        const activa = seleccion.has(d.etapa);
        const gest = esGestionable(d.etapa);
        return (
          <button key={d.etapa} onClick={() => onClick(d.etapa)}
            style={{ display: "flex", alignItems: "center", gap: 8, border: "none", background: "transparent", cursor: "pointer", padding: 0, opacity: !seleccion.size || activa ? 1 : 0.35 }}
            title={gest ? "Gestionable" : "NO gestionable (excluida del conteo)"}>
            <span style={{ width: 170, fontSize: ".68rem", fontWeight: activa ? 800 : 600, color: activa ? accent : "#475569", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {!gest && "🚫 "}{d.etapa}
            </span>
            <div style={{ flex: 1, background: "#f1f5f9", borderRadius: 6, height: 18, position: "relative" }}>
              <div style={{ width: `${Math.max(2, (d.total / max) * 100)}%`, background: activa ? accent : gest ? `${accent}99` : "#cbd5e1", height: "100%", borderRadius: 6 }} />
            </div>
            <span style={{ width: 52, fontSize: ".7rem", fontWeight: 800, color: "#1e293b", textAlign: "right" }}>{d.total.toLocaleString()}</span>
          </button>
        );
      })}
    </div>
  );
};
