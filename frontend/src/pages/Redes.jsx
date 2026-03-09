import { useState, useEffect } from "react";

// ─── Paleta y estilos globales ────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');

  :root {
    --bg-primary:    #060d1a;
    --bg-card:       #0a1628;
    --bg-row-even:   #0d1e35;
    --bg-row-hover:  #112540;
    --accent-cyan:   #00e5ff;
    --accent-blue:   #1565c0;
    --accent-green:  #00e676;
    --accent-yellow: #ffd600;
    --accent-red:    #ff1744;
    --text-primary:  #e8f4fd;
    --text-muted:    #5a7a9a;
    --border:        #1a3a5c;
    --shadow-glow:   0 0 20px rgba(0,229,255,0.15);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .redes-wrapper {
    background: var(--bg-primary);
    min-height: 100vh;
    font-family: 'Rajdhani', sans-serif;
    color: var(--text-primary);
    padding: 0;
  }

  /* ── Header ── */
  .redes-header {
    background: linear-gradient(135deg, #060d1a 0%, #0a1f3a 100%);
    border-bottom: 1px solid var(--border);
    padding: 16px 32px;
    display: flex;
    align-items: center;
    gap: 16px;
    box-shadow: 0 2px 20px rgba(0,0,0,0.5);
  }
  .redes-header-icon {
    width: 42px; height: 42px;
    background: linear-gradient(135deg, var(--accent-cyan), var(--accent-blue));
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px;
    box-shadow: 0 0 16px rgba(0,229,255,0.4);
  }
  .redes-header h1 {
    font-size: 22px; font-weight: 700; letter-spacing: 3px;
    text-transform: uppercase;
    background: linear-gradient(90deg, var(--accent-cyan), #82b1ff);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .redes-header p {
    font-size: 12px; color: var(--text-muted); letter-spacing: 1px;
    font-family: 'Share Tech Mono', monospace;
  }

  /* ── Nav Tabs ── */
  .redes-nav {
    display: flex;
    background: #070e1c;
    border-bottom: 1px solid var(--border);
    padding: 0 32px;
  }
  .redes-tab {
    padding: 14px 28px;
    font-size: 13px; font-weight: 600; letter-spacing: 2px;
    text-transform: uppercase;
    cursor: pointer;
    border: none; background: transparent;
    color: var(--text-muted);
    border-bottom: 3px solid transparent;
    transition: all 0.2s;
    font-family: 'Rajdhani', sans-serif;
    position: relative;
  }
  .redes-tab:hover { color: var(--text-primary); }
  .redes-tab.active {
    color: var(--accent-cyan);
    border-bottom-color: var(--accent-cyan);
  }
  .redes-tab.active::before {
    content: '';
    position: absolute; bottom: -1px; left: 0; right: 0; height: 1px;
    background: var(--accent-cyan);
    box-shadow: 0 0 8px var(--accent-cyan);
  }

  /* ── Contenido ── */
  .redes-content { padding: 28px 32px; }

  /* ── Toolbar ── */
  .toolbar {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 20px; gap: 12px; flex-wrap: wrap;
  }
  .toolbar-title {
    font-size: 16px; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase; color: var(--text-primary);
    display: flex; align-items: center; gap: 10px;
  }
  .toolbar-title span {
    width: 6px; height: 22px;
    background: var(--accent-cyan);
    border-radius: 3px;
    box-shadow: 0 0 8px var(--accent-cyan);
    display: inline-block;
  }
  .toolbar-actions { display: flex; gap: 10px; align-items: center; }

  .btn {
    padding: 8px 18px; border: none; border-radius: 6px;
    font-family: 'Rajdhani', sans-serif; font-size: 13px;
    font-weight: 600; letter-spacing: 1px; cursor: pointer;
    transition: all 0.2s; text-transform: uppercase;
  }
  .btn-primary {
    background: linear-gradient(135deg, #00b4d8, #0077b6);
    color: #fff;
    box-shadow: 0 0 12px rgba(0,180,216,0.3);
  }
  .btn-primary:hover { box-shadow: 0 0 20px rgba(0,180,216,0.5); transform: translateY(-1px); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .btn-outline {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
  }
  .btn-outline:hover { border-color: var(--accent-cyan); color: var(--accent-cyan); }

  /* ── Stats cards ── */
  .stats-row {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 14px; margin-bottom: 22px;
  }
  .stat-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px 20px;
    position: relative; overflow: hidden;
  }
  .stat-card::before {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, var(--accent-cyan), transparent);
  }
  .stat-card .label {
    font-size: 11px; letter-spacing: 2px; text-transform: uppercase;
    color: var(--text-muted); margin-bottom: 8px;
    font-family: 'Share Tech Mono', monospace;
  }
  .stat-card .value {
    font-size: 28px; font-weight: 700;
    color: var(--accent-cyan); font-family: 'Share Tech Mono', monospace;
    line-height: 1;
  }
  .stat-card .sub { font-size: 11px; color: var(--text-muted); margin-top: 4px; }

  /* ── Tabla ── */
  .table-wrapper {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: var(--shadow-glow);
  }
  .table-scroll { overflow-x: auto; }

  table {
    width: 100%; border-collapse: collapse;
    font-size: 13px; font-family: 'Share Tech Mono', monospace;
    min-width: 900px;
  }

  thead tr {
    background: linear-gradient(90deg, #0a2040, #0d2d52);
    border-bottom: 1px solid var(--accent-cyan);
  }
  thead th {
    padding: 12px 16px; text-align: left;
    font-size: 11px; letter-spacing: 2px; text-transform: uppercase;
    color: var(--accent-cyan); font-weight: 600;
    white-space: nowrap;
  }
  thead th:first-child { min-width: 180px; }
  thead th.col-total { color: var(--accent-yellow); }
  thead th.col-date  { color: #82b1ff; }

  tbody tr {
    border-bottom: 1px solid rgba(26,58,92,0.5);
    transition: background 0.15s;
  }
  tbody tr:nth-child(even) { background: var(--bg-row-even); }
  tbody tr:hover { background: var(--bg-row-hover); }

  tbody td {
    padding: 11px 16px; vertical-align: middle;
  }
  td.etapa {
    font-family: 'Rajdhani', sans-serif;
    font-size: 14px; font-weight: 600;
    color: var(--text-primary);
  }
  td.num {
    text-align: right; font-variant-numeric: tabular-nums;
  }
  td.num-total {
    color: var(--accent-yellow); font-weight: 700; font-size: 14px;
  }
  td.num-date { color: #b0d4f1; }
  td.num-zero { color: var(--text-muted); }

  /* Badge de etapa */
  .etapa-badge {
    display: inline-flex; align-items: center; gap: 6px;
  }
  .etapa-dot {
    width: 7px; height: 7px; border-radius: 50%;
    flex-shrink: 0;
  }

  /* Barra de progreso en total */
  .bar-wrap {
    display: flex; align-items: center; gap: 8px;
  }
  .bar-bg {
    flex: 1; height: 4px; background: rgba(255,255,255,0.06);
    border-radius: 2px; min-width: 60px; max-width: 120px;
  }
  .bar-fill {
    height: 100%; border-radius: 2px;
    background: linear-gradient(90deg, var(--accent-cyan), #82b1ff);
    transition: width 0.6s ease;
  }

  /* ── Empty / Loading ── */
  .state-box {
    padding: 60px; text-align: center;
  }
  .state-box .icon { font-size: 40px; margin-bottom: 12px; }
  .state-box p { color: var(--text-muted); font-size: 14px; letter-spacing: 1px; }

  /* Spinner */
  .spinner {
    width: 32px; height: 32px; margin: 0 auto 12px;
    border: 3px solid rgba(0,229,255,0.15);
    border-top-color: var(--accent-cyan);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Error */
  .error-banner {
    background: rgba(255,23,68,0.1);
    border: 1px solid rgba(255,23,68,0.3);
    border-radius: 8px; padding: 14px 18px;
    color: #ff6d8a; font-size: 13px; margin-bottom: 16px;
    display: flex; align-items: center; gap: 10px;
  }

  /* Coming soon */
  .coming-soon {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    min-height: 60vh; gap: 16px;
  }
  .coming-soon .cs-icon {
    font-size: 56px;
    filter: drop-shadow(0 0 20px rgba(0,229,255,0.4));
  }
  .coming-soon h2 {
    font-size: 20px; letter-spacing: 4px; text-transform: uppercase;
    color: var(--accent-cyan);
  }
  .coming-soon p { color: var(--text-muted); font-size: 13px; letter-spacing: 1px; }

  /* Timestamp */
  .timestamp {
    font-family: 'Share Tech Mono', monospace;
    font-size: 11px; color: var(--text-muted); letter-spacing: 1px;
  }
`;

// ─── Colores por etapa ────────────────────────────────────────────────────────
const ETAPA_COLORS = [
  "#00e5ff","#00e676","#ffd600","#ff6d00","#e040fb",
  "#ff1744","#40c4ff","#69f0ae","#ffff00","#ff4081",
];

// ─── Módulo: Monitoreo Redes General ─────────────────────────────────────────
function MonitoreoRedes() {
  const [rows, setRows]       = useState([]);
  const [cols, setCols]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/redes/monitoreo-redes");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Error del servidor");

      setRows(json.data || []);
      setCols(json.columns || []);
      setLastFetch(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // ── Columnas dinámicas (sin etapa ni total)
  const dateCols = cols.filter((c) => c !== "etapa" && c !== "total");

  // ── Máximo para barras
  const maxTotal = Math.max(...rows.map((r) => Number(r.total) || 0), 1);

  // ── Stats
  const totalGeneral  = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const etapasActivas = rows.filter((r) => Number(r.total) > 0).length;
  const ultimoDia     = dateCols[0];
  const totalUltimoDia = rows.reduce((s, r) => s + (Number(r[ultimoDia]) || 0), 0);

  return (
    <div>
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-title">
          <span />
          Monitoreo Redes General
        </div>
        <div className="toolbar-actions">
          {lastFetch && (
            <span className="timestamp">
              Actualizado: {lastFetch.toLocaleTimeString()}
            </span>
          )}
          <button className="btn btn-outline" onClick={fetchData} disabled={loading}>
            ↻ Refrescar
          </button>
          <button className="btn btn-primary" disabled={loading} onClick={fetchData}>
            {loading ? "Cargando..." : "Cargar Datos"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="label">Total General</div>
          <div className="value">{totalGeneral.toLocaleString()}</div>
          <div className="sub">Registros acumulados</div>
        </div>
        <div className="stat-card">
          <div className="label">Etapas Activas</div>
          <div className="value">{etapasActivas}</div>
          <div className="sub">De {rows.length} etapas totales</div>
        </div>
        <div className="stat-card">
          <div className="label">Último Día ({ultimoDia || "—"})</div>
          <div className="value">{totalUltimoDia.toLocaleString()}</div>
          <div className="sub">Registros del día más reciente</div>
        </div>
        <div className="stat-card">
          <div className="label">Días con datos</div>
          <div className="value">{dateCols.length}</div>
          <div className="sub">Columnas de fecha activas</div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="error-banner">
          ⚠ {error}
        </div>
      )}

      {/* Tabla */}
      <div className="table-wrapper">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Etapa</th>
                <th className="col-total">Total</th>
                {dateCols.map((c) => (
                  <th key={c} className="col-date">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={2 + dateCols.length}>
                    <div className="state-box">
                      <div className="spinner" />
                      <p>Consultando base de datos...</p>
                    </div>
                  </td>
                </tr>
              ) : !loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={2 + dateCols.length}>
                    <div className="state-box">
                      <div className="icon">📡</div>
                      <p>Sin datos disponibles</p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => {
                  const total = Number(row.total) || 0;
                  const pct   = (total / maxTotal) * 100;
                  const color = ETAPA_COLORS[i % ETAPA_COLORS.length];
                  return (
                    <tr key={i}>
                      <td className="etapa">
                        <span className="etapa-badge">
                          <span className="etapa-dot" style={{ background: color }} />
                          {row.etapa ?? "—"}
                        </span>
                      </td>
                      <td className="num num-total">
                        <div className="bar-wrap">
                          <span>{total.toLocaleString()}</span>
                          <div className="bar-bg">
                            <div
                              className="bar-fill"
                              style={{ width: `${pct}%`, background: color }}
                            />
                          </div>
                        </div>
                      </td>
                      {dateCols.map((c) => {
                        const val = Number(row[c]) || 0;
                        return (
                          <td
                            key={c}
                            className={`num ${val === 0 ? "num-zero" : "num-date"}`}
                          >
                            {val === 0 ? "—" : val.toLocaleString()}
                          </td>
                        );
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

// ─── Módulo: Monitoreo Costo General (placeholder) ───────────────────────────
function MonitoreoCosto() {
  return (
    <div className="coming-soon">
      <div className="cs-icon">💰</div>
      <h2>Monitoreo Costo General</h2>
      <p>Módulo en desarrollo — próximamente disponible</p>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Redes() {
  const [tab, setTab] = useState("redes");

  return (
    <>
      <style>{STYLES}</style>
      <div className="redes-wrapper">
        {/* Header */}
        <header className="redes-header">
          <div className="redes-header-icon">🌐</div>
          <div>
            <h1>ERP — Módulo Redes</h1>
            <p>Sistema de monitoreo y control de redes</p>
          </div>
        </header>

        {/* Tabs */}
        <nav className="redes-nav">
          <button
            className={`redes-tab ${tab === "costo" ? "active" : ""}`}
            onClick={() => setTab("costo")}
          >
            💰 Monitoreo Costo General
          </button>
          <button
            className={`redes-tab ${tab === "redes" ? "active" : ""}`}
            onClick={() => setTab("redes")}
          >
            📡 Monitoreo Redes General
          </button>
        </nav>

        {/* Contenido */}
        <main className="redes-content">
          {tab === "costo" ? <MonitoreoCosto /> : <MonitoreoRedes />}
        </main>
      </div>
    </>
  );
}