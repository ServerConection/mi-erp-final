import { useState, useEffect } from "react";

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

  .redes-root * { box-sizing: border-box; margin: 0; padding: 0; }

  .redes-root {
    background: #f4f6fb;
    min-height: 100vh;
    font-family: 'Inter', sans-serif;
    color: #1a2236;
  }

  /* ── Header ── */
  .rn-header {
    background: linear-gradient(90deg, #1a2a4a 0%, #2563eb 100%);
    padding: 14px 32px;
    display: flex; align-items: center; justify-content: space-between;
    box-shadow: 0 2px 12px rgba(37,99,235,0.18);
  }
  .rn-header-left { display: flex; align-items: center; gap: 14px; }
  .rn-header-icon {
    width: 40px; height: 40px; border-radius: 10px;
    background: rgba(255,255,255,0.15);
    display: flex; align-items: center; justify-content: center; font-size: 20px;
  }
  .rn-header h1 {
    font-size: 18px; font-weight: 800; letter-spacing: 2px;
    text-transform: uppercase; color: #fff;
  }
  .rn-header p { font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 1px; }

  /* ── Nav Tabs ── */
  .rn-nav {
    background: #fff;
    border-bottom: 2px solid #e8edf5;
    padding: 0 32px;
    display: flex; gap: 4px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  }
  .rn-tab {
    padding: 14px 24px;
    font-size: 13px; font-weight: 600; letter-spacing: 0.5px;
    cursor: pointer; border: none; background: transparent;
    color: #8a9ab5; border-bottom: 3px solid transparent;
    transition: all 0.2s; font-family: 'Inter', sans-serif;
    margin-bottom: -2px;
  }
  .rn-tab:hover { color: #2563eb; }
  .rn-tab.active { color: #2563eb; border-bottom-color: #2563eb; }

  /* ── Content ── */
  .rn-content { padding: 28px 32px; }

  /* ── Toolbar ── */
  .rn-toolbar {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 22px; gap: 12px; flex-wrap: wrap;
  }
  .rn-toolbar-title {
    font-size: 18px; font-weight: 800; color: #1a2236;
    display: flex; align-items: center; gap: 10px;
  }
  .rn-toolbar-title span {
    width: 5px; height: 22px; background: #2563eb;
    border-radius: 3px; display: inline-block;
  }
  .rn-actions { display: flex; gap: 10px; align-items: center; }

  /* Buttons */
  .rn-btn {
    padding: 9px 20px; border: none; border-radius: 10px;
    font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: all 0.18s; display: inline-flex; align-items: center; gap: 6px;
  }
  .rn-btn-primary {
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    color: #fff; box-shadow: 0 2px 10px rgba(37,99,235,0.25);
  }
  .rn-btn-primary:hover { box-shadow: 0 4px 18px rgba(37,99,235,0.4); transform: translateY(-1px); }
  .rn-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
  .rn-btn-outline {
    background: #fff; border: 1.5px solid #dde3f0; color: #5a6a85;
  }
  .rn-btn-outline:hover { border-color: #2563eb; color: #2563eb; }
  .rn-btn-yellow {
    background: #FFD600; color: #1a2236; font-weight: 700;
    box-shadow: 0 2px 8px rgba(255,214,0,0.3);
  }
  .rn-btn-yellow:hover { filter: brightness(1.05); transform: translateY(-1px); }

  /* Search */
  .rn-search-wrap { position: relative; }
  .rn-search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #aab4c8; font-size: 14px; pointer-events: none; }
  .rn-search {
    background: #fff; border: 1.5px solid #dde3f0; border-radius: 10px;
    padding: 8px 14px 8px 32px; color: #1a2236;
    font-family: 'Inter', sans-serif; font-size: 13px;
    outline: none; width: 170px; transition: border-color 0.2s;
  }
  .rn-search:focus { border-color: #2563eb; }

  /* Timestamp */
  .rn-ts { font-size: 11px; color: #aab4c8; }

  /* ── Stats row ── */
  .rn-stats {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 14px; margin-bottom: 22px;
  }
  .rn-stat {
    background: #fff; border-radius: 14px; padding: 18px 20px;
    box-shadow: 0 1px 6px rgba(0,0,0,0.06); border: 1.5px solid #e8edf5;
    position: relative; overflow: hidden;
  }
  .rn-stat::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: linear-gradient(90deg, #2563eb, transparent);
    border-radius: 3px 3px 0 0;
  }
  .rn-stat-label { font-size: 10px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: #8a9ab5; margin-bottom: 6px; }
  .rn-stat-value { font-size: 28px; font-weight: 800; color: #2563eb; line-height: 1; }
  .rn-stat-sub { font-size: 11px; color: #aab4c8; margin-top: 4px; }

  /* ── Error banner ── */
  .rn-error {
    background: #fff5f5; border: 1.5px solid #fca5a5; border-radius: 10px;
    padding: 12px 16px; color: #dc2626; font-size: 13px; margin-bottom: 16px;
    display: flex; align-items: center; gap: 8px;
  }

  /* ── Table ── */
  .rn-table-wrap {
    background: #fff; border-radius: 16px; border: 1.5px solid #e8edf5;
    overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  }
  .rn-table-scroll { overflow-x: auto; }
  .rn-table {
    width: 100%; border-collapse: collapse; font-size: 13px; min-width: 800px;
  }
  .rn-table thead tr {
    background: linear-gradient(90deg, #f0f4ff, #e8edf5);
    border-bottom: 2px solid #dde3f0;
  }
  .rn-table thead th {
    padding: 13px 16px; text-align: left; font-size: 11px; font-weight: 700;
    letter-spacing: 1.5px; text-transform: uppercase; color: #2563eb; white-space: nowrap;
  }
  .rn-table thead th.th-total { color: #d97706; }
  .rn-table thead th.th-date  { color: #7c3aed; }
  .rn-table tbody tr { border-bottom: 1px solid #f0f3f8; transition: background 0.12s; }
  .rn-table tbody tr:nth-child(even) { background: #fafbff; }
  .rn-table tbody tr:hover { background: #eff4ff; }
  .rn-table tbody td { padding: 11px 16px; vertical-align: middle; font-size: 13px; }
  .rn-table td.td-etapa { font-weight: 600; color: #1a2236; }
  .rn-table td.td-num { text-align: right; font-variant-numeric: tabular-nums; }
  .rn-table td.td-total { color: #d97706; font-weight: 700; font-size: 14px; text-align: right; }
  .rn-table td.td-date  { color: #4f46e5; text-align: right; }
  .rn-table td.td-zero  { color: #c9d1e0; text-align: right; }

  .rn-etapa-badge { display: inline-flex; align-items: center; gap: 8px; }
  .rn-etapa-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

  .rn-bar-wrap { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
  .rn-bar-bg { height: 5px; background: #eef0f5; border-radius: 3px; min-width: 60px; max-width: 110px; flex: 1; }
  .rn-bar-fill { height: 100%; border-radius: 3px; transition: width 0.6s ease; }

  .rn-state { padding: 60px; text-align: center; }
  .rn-state .icon { font-size: 38px; margin-bottom: 10px; }
  .rn-state p { color: #aab4c8; font-size: 14px; }
  .rn-spinner {
    width: 30px; height: 30px; margin: 0 auto 12px;
    border: 3px solid #e8edf5; border-top-color: #2563eb;
    border-radius: 50%; animation: rn-spin 0.7s linear infinite;
  }
  @keyframes rn-spin { to { transform: rotate(360deg); } }

  /* ── KPI Cards ── */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
  }
  .kpi-card {
    background: #fff; border-radius: 16px; padding: 16px 18px;
    border: 1.5px solid #e8edf5; box-shadow: 0 2px 10px rgba(0,0,0,0.05);
    display: flex; flex-direction: column; gap: 5px;
    position: relative; overflow: hidden;
    transition: box-shadow 0.2s, transform 0.2s;
  }
  .kpi-card:hover { box-shadow: 0 6px 24px rgba(37,99,235,0.12); transform: translateY(-2px); }
  .kpi-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
  .kpi-icon {
    width: 36px; height: 36px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0;
  }
  .kpi-label { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #8a9ab5; flex: 1; line-height: 1.35; }
  .kpi-gear { color: #c9d1e0; font-size: 15px; cursor: pointer; transition: color 0.2s; }
  .kpi-gear:hover { color: #2563eb; }
  .kpi-value { font-size: 28px; font-weight: 800; line-height: 1; margin-top: 2px; }
  .kpi-objetivo { font-size: 11px; color: #aab4c8; margin-top: 1px; }
  .kpi-delta-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
  .kpi-delta {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 20px;
  }
  .kpi-delta.up   { background: #f0fdf4; color: #16a34a; }
  .kpi-delta.down { background: #fff1f2; color: #e11d48; }
  .kpi-delta-label { font-size: 12px; font-weight: 700; }
  .kpi-delta-label.up   { color: #16a34a; }
  .kpi-delta-label.down { color: #e11d48; }
  .kpi-sparkline { display: inline-block; vertical-align: middle; }
`;

const ETAPA_COLORS = ["#2563eb","#16a34a","#d97706","#dc2626","#7c3aed","#0891b2","#059669","#db2777","#ea580c","#4f46e5"];

const KPI_DATA = [
  { icon: "👥", iconBg: "#dbeafe", accent: "#2563eb", label: "Leads Totales",            value: "38",       objetivo: "133",     delta: "-95 leads",  deltaLabel: "28,57%",  up: false },
  { icon: "🎧", iconBg: "#f1f5f9", accent: "#475569", label: "Leads SAC / ATC",          value: "21 (55%)", objetivo: "45%",     delta: "+10,26%",    deltaLabel: null,      up: true, spark: true },
  { icon: "👍", iconBg: "#dcfce7", accent: "#16a34a", label: "Leads Calidad",            value: "17 (45%)", objetivo: "60%",     delta: "+15,26%",    deltaLabel: null,      up: true, spark: true },
  { icon: "💰", iconBg: "#fef9c3", accent: "#d97706", label: "Ventas",                   value: "2 (12%)",  objetivo: "45%",     delta: "– 6%",       deltaLabel: "-6%",     up: false },
  { icon: "💳", iconBg: "#fee2e2", accent: "#dc2626", label: "Consumo Presupuesto",      value: "$151,29",  objetivo: "$585,20", delta: "-$433,91",   deltaLabel: "25,85%",  up: false },
  { icon: "⭐", iconBg: "#dbeafe", accent: "#2563eb", label: "CTR / Objetivo CTR",       value: "20,89%",   objetivo: "35%",     delta: "-14,1%",     deltaLabel: "14,1%",   up: false },
  { icon: "⭐", iconBg: "#dbeafe", accent: "#2563eb", label: "CTR / Objetivo CTR",       value: "20,89%",   objetivo: "35%",     delta: "-14,1%",     deltaLabel: "-14,1%",  up: false },
  { icon: "🔑", iconBg: "#ede9fe", accent: "#7c3aed", label: "CPL / Objetivo CPL",       value: "$3,98",    objetivo: "$4,40",   delta: "+0,42",      deltaLabel: "+0,42",   up: true  },
  { icon: "💼", iconBg: "#e0f2fe", accent: "#0284c7", label: "CPL Gest / Obj CPL Gest",  value: "$8,90",    objetivo: "$8,00",   delta: "-0,90",      deltaLabel: "– $8,21", up: false },
  { icon: "🎯", iconBg: "#fee2e2", accent: "#dc2626", label: "CPA / Objetivo CPA",       value: "$75,65",   objetivo: "$22,00",  delta: "-83,21%",    deltaLabel: "+93,21",  up: false },
];

const Spark = ({ up }) => (
  <svg className="kpi-sparkline" width="48" height="20" viewBox="0 0 48 20" fill="none">
    <path
      d={up ? "M2,16 C8,12 14,8 20,10 C26,12 32,4 38,3 C42,2 45,5 46,4" : "M2,4 C8,8 14,10 20,9 C26,8 32,13 38,14 C42,15 45,13 46,15"}
      stroke={up ? "#16a34a" : "#e11d48"} strokeWidth="2" strokeLinecap="round" fill="none"
    />
  </svg>
);

// ─── MonitoreoCosto ───────────────────────────────────────────────────────────
function MonitoreoCosto() {
  const [search, setSearch] = useState("");
  const filtered = KPI_DATA.filter((k) =>
    k.label.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div>
      <div className="rn-toolbar">
        <div className="rn-toolbar-title"><span />KPI de Campaña GOOGLE</div>
        <div className="rn-actions">
          <div className="rn-search-wrap">
            <span className="rn-search-icon">🔍</span>
            <input className="rn-search" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button className="rn-btn rn-btn-yellow">+ Nueva Campaña</button>
        </div>
      </div>

      <div className="kpi-grid">
        {filtered.map((k, i) => (
          <div key={i} className="kpi-card">
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: `linear-gradient(90deg, ${k.accent}, transparent)`, borderRadius: "3px 3px 0 0" }} />
            <div className="kpi-card-top">
              <div className="kpi-icon" style={{ background: k.iconBg }}>{k.icon}</div>
              <span className="kpi-label">{k.label}</span>
              <span className="kpi-gear">⚙</span>
            </div>
            <div className="kpi-value" style={{ color: k.accent }}>{k.value}</div>
            <div className="kpi-objetivo">Objetivo {k.objetivo}</div>
            <div className="kpi-delta-row">
              <span className={`kpi-delta ${k.up ? "up" : "down"}`}>{k.up ? "▲" : "▼"} {k.delta}</span>
              {k.spark && <Spark up={k.up} />}
              {k.deltaLabel && <span className={`kpi-delta-label ${k.up ? "up" : "down"}`}>{k.deltaLabel}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MonitoreoRedes ───────────────────────────────────────────────────────────
function MonitoreoRedes() {
  const [rows, setRows]           = useState([]);
  const [cols, setCols]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch("/api/redes/monitoreo-redes");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Error del servidor");
      setRows(json.data || []); setCols(json.columns || []);
      setLastFetch(new Date());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const dateCols       = cols.filter((c) => c !== "etapa" && c !== "total");
  const maxTotal       = Math.max(...rows.map((r) => Number(r.total) || 0), 1);
  const totalGeneral   = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const etapasActivas  = rows.filter((r) => Number(r.total) > 0).length;
  const ultimoDia      = dateCols[0];
  const totalUltimoDia = rows.reduce((s, r) => s + (Number(r[ultimoDia]) || 0), 0);

  return (
    <div>
      <div className="rn-toolbar">
        <div className="rn-toolbar-title"><span />Monitoreo Redes General</div>
        <div className="rn-actions">
          {lastFetch && <span className="rn-ts">Actualizado: {lastFetch.toLocaleTimeString()}</span>}
          <button className="rn-btn rn-btn-outline" onClick={fetchData} disabled={loading}>↻ Refrescar</button>
          <button className="rn-btn rn-btn-primary" disabled={loading} onClick={fetchData}>
            {loading ? "Cargando..." : "⟳ Cargar Datos"}
          </button>
        </div>
      </div>

      <div className="rn-stats">
        <div className="rn-stat"><div className="rn-stat-label">Total General</div><div className="rn-stat-value">{totalGeneral.toLocaleString()}</div><div className="rn-stat-sub">Registros acumulados</div></div>
        <div className="rn-stat"><div className="rn-stat-label">Etapas Activas</div><div className="rn-stat-value">{etapasActivas}</div><div className="rn-stat-sub">De {rows.length} etapas totales</div></div>
        <div className="rn-stat"><div className="rn-stat-label">Último Día ({ultimoDia || "—"})</div><div className="rn-stat-value">{totalUltimoDia.toLocaleString()}</div><div className="rn-stat-sub">Registros del día más reciente</div></div>
        <div className="rn-stat"><div className="rn-stat-label">Días con datos</div><div className="rn-stat-value">{dateCols.length}</div><div className="rn-stat-sub">Columnas de fecha activas</div></div>
      </div>

      {error && <div className="rn-error">⚠ {error}</div>}

      <div className="rn-table-wrap">
        <div className="rn-table-scroll">
          <table className="rn-table">
            <thead>
              <tr>
                <th>Etapa</th>
                <th className="th-total">Total</th>
                {dateCols.map((c) => <th key={c} className="th-date">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr><td colSpan={2 + dateCols.length}><div className="rn-state"><div className="rn-spinner" /><p>Consultando base de datos...</p></div></td></tr>
              ) : !loading && rows.length === 0 ? (
                <tr><td colSpan={2 + dateCols.length}><div className="rn-state"><div className="icon">📡</div><p>Sin datos disponibles</p></div></td></tr>
              ) : (
                rows.map((row, i) => {
                  const total = Number(row.total) || 0;
                  const pct   = (total / maxTotal) * 100;
                  const color = ETAPA_COLORS[i % ETAPA_COLORS.length];
                  return (
                    <tr key={i}>
                      <td className="td-etapa">
                        <span className="rn-etapa-badge">
                          <span className="rn-etapa-dot" style={{ background: color }} />
                          {row.etapa ?? "—"}
                        </span>
                      </td>
                      <td className="td-total">
                        <div className="rn-bar-wrap">
                          <span>{total.toLocaleString()}</span>
                          <div className="rn-bar-bg"><div className="rn-bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
                        </div>
                      </td>
                      {dateCols.map((c) => {
                        const val = Number(row[c]) || 0;
                        return <td key={c} className={val === 0 ? "td-zero" : "td-date"}>{val === 0 ? "—" : val.toLocaleString()}</td>;
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Redes() {
  const [tab, setTab] = useState("costo");

  return (
    <>
      <style>{STYLES}</style>
      <div className="redes-root">
        <header className="rn-header">
          <div className="rn-header-left">
            <div className="rn-header-icon">🌐</div>
            <div>
              <h1>ERP — Módulo Redes</h1>
              <p>Sistema de monitoreo y control de redes</p>
            </div>
          </div>
        </header>

        <nav className="rn-nav">
          <button className={`rn-tab ${tab === "costo" ? "active" : ""}`} onClick={() => setTab("costo")}>
            💰 Monitoreo Costo General
          </button>
          <button className={`rn-tab ${tab === "redes" ? "active" : ""}`} onClick={() => setTab("redes")}>
            📡 Monitoreo Redes General
          </button>
        </nav>

        <main className="rn-content">
          {tab === "costo" ? <MonitoreoCosto /> : <MonitoreoRedes />}
        </main>
      </div>
    </>
  );
}