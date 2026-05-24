// =============================================================================
// MUNDIALITO - Programa de Aceleracion Comercial
// Estilo claro, moderno y profesional. Acentos azul y dorado.
// =============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const API = import.meta.env.VITE_API_URL || "";

// Helpers --------------------------------------------------------------------
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const fetchJson = async (url, opts = {}) => {
  const res = await fetch(`${API}${url}`, {
    headers: authHeaders(),
    ...opts,
  });
  return res.json();
};

const hoy = () => new Date().toISOString().slice(0, 10);
const initials = (n) => (n || "?").split(" ").slice(0, 2).map((w) => w[0]).join("");

// Sonido sintetizado con WebAudio (sin archivos externos)
const audioCtx = (() => {
  try { return new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; }
})();
const playGoalSound = (volume = 0.4) => {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  [440, 660, 880].forEach((freq, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type = "square"; o.frequency.setValueAtTime(freq, t + i * 0.12);
    g.gain.setValueAtTime(0, t + i * 0.12);
    g.gain.linearRampToValueAtTime(volume, t + i * 0.12 + 0.02);
    g.gain.linearRampToValueAtTime(0, t + i * 0.12 + 0.18);
    o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.2);
  });
};

// =============================================================================
// CONFETTI animado (CSS-only)
// =============================================================================
const Confetti = ({ trigger }) => {
  if (!trigger) return null;
  const pieces = Array.from({ length: 60 });
  return (
    <div style={{ pointerEvents: "none", position: "fixed", inset: 0, zIndex: 9999, overflow: "hidden" }}>
      {pieces.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.5;
        const duration = 2 + Math.random() * 1.5;
        const colors = ["#fbbf24", "#ef4444", "#3b82f6", "#10b981", "#8b5cf6", "#f97316"];
        const color = colors[i % colors.length];
        const size = 8 + Math.random() * 6;
        return (
          <div key={i} style={{
            position: "absolute", top: "-20px", left: `${left}%`,
            width: size, height: size, background: color,
            borderRadius: Math.random() > .5 ? "50%" : "2px",
            animation: `confettiFall ${duration}s ${delay}s linear forwards`,
            transform: `rotate(${Math.random() * 360}deg)`,
          }} />
        );
      })}
    </div>
  );
};

// =============================================================================
// OVERLAY "GOOOOL!"
// =============================================================================
const GolOverlay = ({ data, onDone }) => {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);
  if (!data) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9998,
      background: "rgba(248, 250, 252, 0.92)",
      backdropFilter: "blur(12px)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      animation: "fadeIn .3s ease",
    }}>
      <div style={{
        fontSize: "min(20vw, 200px)", fontWeight: 900, lineHeight: 1,
        background: "linear-gradient(180deg, #f59e0b 0%, #b45309 100%)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        textShadow: "0 8px 32px rgba(245,158,11,.25)",
        animation: "golBounce 2.8s cubic-bezier(.25,1.4,.5,1) forwards",
        letterSpacing: "-.03em",
      }}>
        ¡GOOOL!
      </div>
      <div style={{
        marginTop: 24, padding: "16px 32px",
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 16, color: "#0f172a", fontWeight: 800,
        fontSize: 22, animation: "fadeIn 1s .4s both",
        boxShadow: "0 12px 32px rgba(15,23,42,.12)",
      }}>
        ⚽ {data.asesor?.nombre || "Asesor"} — {data.tipo} (+{data.cantidad})
      </div>
    </div>
  );
};

// =============================================================================
// CSS GLOBAL
// =============================================================================
const Styles = () => (
  <style>{`
    @keyframes confettiFall {
      0% { transform: translateY(0) rotate(0deg); opacity: 1; }
      100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
    }
    @keyframes golBounce {
      0%   { transform: scale(0) rotate(-15deg); opacity: 0; }
      30%  { transform: scale(1.3) rotate(5deg); opacity: 1; }
      45%  { transform: scale(.9) rotate(-2deg); }
      60%  { transform: scale(1.1) rotate(2deg); }
      75%  { transform: scale(1) rotate(0); }
      90%  { transform: scale(1) rotate(0); opacity: 1; }
      100% { transform: scale(.7) translateY(-100px); opacity: 0; }
    }
    @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
    @keyframes shimmer {
      0%   { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes crownPulse {
      0%, 100% { transform: scale(1) rotate(-5deg); filter: drop-shadow(0 0 8px rgba(245,158,11,.5)); }
      50%      { transform: scale(1.1) rotate(5deg); filter: drop-shadow(0 0 16px rgba(245,158,11,.9)); }
    }
    @keyframes tickerScroll {
      0%   { transform: translateX(100%); }
      100% { transform: translateX(-100%); }
    }
    .mundi-leader-row {
      background: linear-gradient(90deg, rgba(245,158,11,0) 0%, rgba(245,158,11,.12) 50%, rgba(245,158,11,0) 100%);
      background-size: 200% 100%;
      animation: shimmer 3s linear infinite;
    }
    .mundi-table-row { transition: background .2s ease; }
    .mundi-table-row:hover { background: #f1f5f9; }
    .mundi-btn {
      background: white; color: #1e293b;
      padding: 9px 16px; border-radius: 10px;
      font-weight: 700; font-size: 12px; letter-spacing: .02em;
      border: 1px solid #e2e8f0; cursor: pointer; transition: all .15s ease;
      box-shadow: 0 1px 2px rgba(15,23,42,.04);
    }
    .mundi-btn:hover { background: #f8fafc; border-color: #cbd5e1; box-shadow: 0 4px 12px rgba(15,23,42,.08); }
    .mundi-btn:active { transform: translateY(1px); }
    .mundi-btn-primary {
      background: linear-gradient(180deg,#3b82f6,#2563eb);
      color: white; border-color: #2563eb;
      box-shadow: 0 1px 2px rgba(37,99,235,.3);
    }
    .mundi-btn-primary:hover { background: linear-gradient(180deg,#2563eb,#1d4ed8); border-color: #1d4ed8; }
    .mundi-btn-gold {
      background: linear-gradient(180deg,#f59e0b,#d97706);
      color: white; border-color: #d97706;
      box-shadow: 0 1px 2px rgba(217,119,6,.3);
    }
    .mundi-btn-gold:hover { background: linear-gradient(180deg,#d97706,#b45309); }
    .mundi-btn-green {
      background: linear-gradient(180deg,#10b981,#059669);
      color: white; border-color: #059669;
      box-shadow: 0 1px 2px rgba(5,150,105,.3);
    }
    .mundi-btn-green:hover { background: linear-gradient(180deg,#059669,#047857); }
    .mundi-btn-red {
      background: linear-gradient(180deg,#ef4444,#dc2626);
      color: white; border-color: #dc2626;
    }
    .mundi-btn-red:hover { background: linear-gradient(180deg,#dc2626,#b91c1c); }
    .mundi-pill {
      padding: 4px 10px; border-radius: 999px; font-weight: 700; font-size: 10px;
      letter-spacing: .04em; text-transform: uppercase;
    }
    .mundi-ticker { animation: tickerScroll 40s linear infinite; }
    .mundi-card-hover { transition: all .2s ease; }
    .mundi-card-hover:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(15,23,42,.08); }
  `}</style>
);

// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================
export default function Mundialito() {
  // Habilitado para todos los perfiles autenticados
  const isAdmin = true;

  const [tab, setTab] = useState("posiciones");
  const [empresa, setEmpresa] = useState("NOVONET");
  const [torneos, setTorneos] = useState([]);
  const [torneo, setTorneo] = useState(null);
  const [grupos, setGrupos] = useState([]);
  const [posiciones, setPosiciones] = useState([]);
  const [partidos, setPartidos] = useState([]);
  const [participantes, setParticipantes] = useState([]);
  const [goles, setGoles] = useState([]);
  const [top10, setTop10] = useState([]);
  const [premios, setPremios] = useState([]);

  const [soundOn, setSoundOn] = useState(false);
  const [golOverlay, setGolOverlay] = useState(null);
  const [confettiKey, setConfettiKey] = useState(0);
  const socketRef = useRef(null);

  const [newTorneo, setNewTorneo] = useState({
    nombre: `Mundialito Fase Grupos ${new Date().getFullYear()}`,
    fase: "GRUPOS",
    fecha_inicio: `${new Date().getFullYear()}-06-01`,
    fecha_fin:    `${new Date().getFullYear()}-06-13`,
  });
  const [newParticipante, setNewParticipante] = useState({ nombre: "", asesor_key: "" });

  const cargarTorneos = async () => {
    const r = await fetchJson(`/api/mundialito/torneos?empresa=${empresa}`);
    if (r.success) {
      setTorneos(r.torneos);
      if (!torneo && r.torneos.length > 0) setTorneo(r.torneos[0]);
    }
  };

  const cargarDatosTorneo = async (t) => {
    if (!t) return;
    const [g, p, pa, pos, gl, t10, pr] = await Promise.all([
      fetchJson(`/api/mundialito/torneos/${t.id}/grupos`),
      fetchJson(`/api/mundialito/torneos/${t.id}/participantes`),
      fetchJson(`/api/mundialito/torneos/${t.id}/partidos`),
      fetchJson(`/api/mundialito/torneos/${t.id}/posiciones`),
      fetchJson(`/api/mundialito/torneos/${t.id}/goles?limit=20`),
      fetchJson(`/api/mundialito/torneos/${t.id}/top10`),
      fetchJson(`/api/mundialito/torneos/${t.id}/premios`),
    ]);
    if (g.success)  setGrupos(g.grupos);
    if (p.success)  setParticipantes(p.participantes);
    if (pa.success) setPartidos(pa.partidos);
    if (pos.success) setPosiciones(pos.posiciones);
    if (gl.success) setGoles(gl.goles);
    if (t10.success) setTop10(t10.top10);
    if (pr.success)  setPremios(pr.premios);
  };

  useEffect(() => { cargarTorneos(); }, [empresa]);
  useEffect(() => { cargarDatosTorneo(torneo); }, [torneo]);

  useEffect(() => {
    const s = io(API, { auth: { token: localStorage.getItem("token") } });
    socketRef.current = s;
    s.on("mundialito:gol", (data) => {
      setGolOverlay(data);
      setConfettiKey(k => k + 1);
      if (soundOn) playGoalSound(0.5);
      cargarDatosTorneo(torneo);
    });
    s.on("mundialito:partido_cerrado", () => cargarDatosTorneo(torneo));
    s.on("mundialito:sorteo", () => cargarDatosTorneo(torneo));
    return () => { s.disconnect(); };
  }, [torneo, soundOn]);

  const crearTorneo = async () => {
    const body = { ...newTorneo, empresa };
    const r = await fetchJson(`/api/mundialito/torneos`, { method: "POST", body: JSON.stringify(body) });
    if (r.success) { await cargarTorneos(); setTorneo(r.torneo); alert("Torneo creado"); }
    else alert("Error: " + r.error);
  };

  const agregarParticipante = async () => {
    if (!newParticipante.nombre.trim()) return;
    const r = await fetchJson(`/api/mundialito/torneos/${torneo.id}/participantes`, {
      method: "POST",
      body: JSON.stringify({ ...newParticipante, empresa }),
    });
    if (r.success) {
      setNewParticipante({ nombre: "", asesor_key: "" });
      cargarDatosTorneo(torneo);
    }
  };

  const sortear = async () => {
    if (!confirm("Realizar sorteo aleatorio de grupos? Esto reasignara grupo a TODOS los participantes.")) return;
    const r = await fetchJson(`/api/mundialito/torneos/${torneo.id}/sorteo`, { method: "POST" });
    if (r.success) { setConfettiKey(k => k + 1); cargarDatosTorneo(torneo); }
    else alert("Error: " + r.error);
  };

  const generarPartidos = async () => {
    const fecha = prompt("Fecha de partidos (YYYY-MM-DD):", hoy()) || hoy();
    const r = await fetchJson(`/api/mundialito/torneos/${torneo.id}/partidos/generar`, {
      method: "POST", body: JSON.stringify({ fecha }),
    });
    if (r.success) { alert(`${r.partidos_creados} partidos generados`); cargarDatosTorneo(torneo); }
    else alert("Error: " + r.error);
  };

  const registrarGolManual = async (asesor_id, tipo, cantidad = 1) => {
    await fetchJson(`/api/mundialito/torneos/${torneo.id}/goles`, {
      method: "POST",
      body: JSON.stringify({ asesor_id, tipo, cantidad, descripcion: `Gol ${tipo} manual` }),
    });
  };

  const cerrarPartido = async (id) => {
    await fetchJson(`/api/mundialito/partidos/${id}/cerrar`, { method: "PUT" });
    cargarDatosTorneo(torneo);
  };

  const calcularTop10 = async () => {
    await fetchJson(`/api/mundialito/torneos/${torneo.id}/top10/calcular`, { method: "POST" });
    cargarDatosTorneo(torneo);
  };

  const calcularPremios = async () => {
    await fetchJson(`/api/mundialito/torneos/${torneo.id}/premios/calcular`, { method: "POST" });
    cargarDatosTorneo(torneo);
  };

  const tickerText = useMemo(() => {
    if (!goles.length) return "Esperando goles...";
    return goles.slice(0, 10).map(g => `⚽ ${g.asesor_nombre} (${g.tipo} +${g.cantidad})`).join("   •   ");
  }, [goles]);

  // ====== RENDER ============================================================
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
      color: "#1e293b", padding: 24,
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <Styles />
      <Confetti trigger={confettiKey} />
      {golOverlay && <GolOverlay data={golOverlay} onDone={() => setGolOverlay(null)} />}

      {/* HEADER */}
      <div style={{
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 16, padding: "20px 28px", marginBottom: 16,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 12,
        boxShadow: "0 1px 3px rgba(15,23,42,.04)",
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: ".15em", textTransform: "uppercase" }}>
            Programa de Aceleración Comercial
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", marginTop: 2, letterSpacing: "-.02em" }}>
            🏆 Mundialito {empresa}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} style={selectLight}>
            <option value="NOVONET">NOVONET</option>
            <option value="VELSA">VELSA</option>
          </select>
          <select value={torneo?.id || ""} onChange={(e) => setTorneo(torneos.find(t => t.id === Number(e.target.value)))}
            style={selectLight}>
            <option value="">— Selecciona torneo —</option>
            {torneos.map(t => <option key={t.id} value={t.id}>{t.nombre} ({t.fase})</option>)}
          </select>
          <button onClick={() => setSoundOn(s => !s)} className="mundi-btn" title="Sonido">
            {soundOn ? "🔊 Sonido" : "🔇 Sonido"}
          </button>
        </div>
      </div>

      {/* TICKER */}
      <div style={{
        background: "white", border: "1px solid #e2e8f0",
        borderRadius: 10, overflow: "hidden", padding: "8px 0", marginBottom: 16,
        fontSize: 12, fontWeight: 600, color: "#475569",
        boxShadow: "0 1px 2px rgba(15,23,42,.04)",
      }}>
        <div className="mundi-ticker" style={{ whiteSpace: "nowrap" }}>{tickerText}</div>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          ["posiciones",    "📊 Posiciones"],
          ["partidos",      "⚔️ Partidos"],
          ["goles",         "⚽ Goles en vivo"],
          ["participantes", "👥 Participantes"],
          ["top10",         "🏆 Top 10"],
          ["premios",       "💰 Premios"],
          ["config",        "⚙️ Configuración"],
        ].map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)}
            style={tab === k ? tabActive : tabInactive}>
            {lbl}
          </button>
        ))}
      </div>

      {/* CONTENIDO */}
      {!torneo && tab !== "config" && (
        <div style={card}>
          <h3 style={{ fontWeight: 800, fontSize: 16, color: "#0f172a" }}>No hay torneo activo</h3>
          <p style={{ color: "#64748b", fontSize: 13 }}>Ve a la pestaña <b>Configuración</b> para crear el primer torneo de {empresa}.</p>
        </div>
      )}

      {/* TAB: POSICIONES */}
      {tab === "posiciones" && torneo && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={titleStyle}>Tabla de Posiciones — Fase {torneo.fase}</h3>
            <button className="mundi-btn" onClick={() => cargarDatosTorneo(torneo)}>🔄 Refrescar</button>
          </div>
          <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 12 }}>
            <table style={tableStyle}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={th}>Rango</th>
                  <th style={th}>Asesor</th>
                  <th style={th}>Grupo</th>
                  <th style={th}>Eficiencia</th>
                  <th style={th}>Velocidad</th>
                  <th style={th}>Conversión</th>
                  <th style={th}>PJ</th>
                  <th style={th}>PG</th>
                  <th style={th}>PE</th>
                  <th style={th}>PP</th>
                  <th style={th}>Goles</th>
                  <th style={{ ...th, color: "#b45309" }}>Total Pts</th>
                </tr>
              </thead>
              <tbody>
                {posiciones.map((p, idx) => (
                  <tr key={p.participante_id}
                      className={`mundi-table-row ${idx === 0 ? "mundi-leader-row" : ""}`}
                      style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={td}>
                      {idx === 0 && <span style={{ fontSize: 22, display: "inline-block", animation: "crownPulse 2s ease infinite" }}>👑</span>}
                      {idx === 1 && <span style={{ fontSize: 20 }}>🥈</span>}
                      {idx === 2 && <span style={{ fontSize: 20 }}>🥉</span>}
                      {idx > 2 && <span style={{ fontWeight: 700, color: "#94a3b8" }}>#{idx + 1}</span>}
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={avatar(p.grupo_color || "#3b82f6")}>{initials(p.asesor_nombre)}</div>
                        <span style={{ fontWeight: 600, color: "#0f172a" }}>{p.asesor_nombre}</span>
                      </div>
                    </td>
                    <td style={td}>
                      <span className="mundi-pill" style={{
                        background: (p.grupo_color || "#3b82f6") + "1a",
                        color: p.grupo_color || "#3b82f6",
                        border: `1px solid ${(p.grupo_color || "#3b82f6") + "33"}`,
                      }}>
                        {p.grupo_nombre || "SIN GRUPO"}
                      </span>
                    </td>
                    <td style={{ ...td, color: "#0891b2", fontWeight: 700 }}>{p.kpi_eficiencia_pct}%</td>
                    <td style={{ ...td, color: "#7c3aed", fontWeight: 700 }}>{p.kpi_velocidad_min} min</td>
                    <td style={{ ...td, color: "#d97706", fontWeight: 700 }}>{p.kpi_conversion_pct}%</td>
                    <td style={td}>{p.pj}</td>
                    <td style={{ ...td, color: "#059669", fontWeight: 600 }}>{p.pg}</td>
                    <td style={{ ...td, color: "#64748b" }}>{p.pe}</td>
                    <td style={{ ...td, color: "#dc2626", fontWeight: 600 }}>{p.pp}</td>
                    <td style={{ ...td, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                      ⚽ {p.goles_totales}
                    </td>
                    <td style={{ ...td, fontSize: 16, fontWeight: 800, color: "#b45309" }}>
                      {p.puntos_total}
                    </td>
                  </tr>
                ))}
                {posiciones.length === 0 && (
                  <tr><td colSpan={12} style={{ ...td, textAlign: "center", color: "#94a3b8", padding: 32 }}>Sin participantes aun. Agregalos en la pestaña Participantes.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: PARTIDOS */}
      {tab === "partidos" && torneo && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={titleStyle}>Partidos</h3>
            <button className="mundi-btn mundi-btn-green" onClick={generarPartidos}>+ Generar Partidos del Día</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
            {partidos.map(p => (
              <div key={p.id} className="mundi-card-hover" style={partidoCard}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                  <span>{new Date(p.fecha).toLocaleDateString()}</span>
                  {p.cerrado && <span style={{ color: "#059669" }}>● CERRADO</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={avatar("#3b82f6", 44)}>{initials(p.local_nombre)}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6, color: "#0f172a" }}>{p.local_nombre}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>{p.local_grupo}</div>
                  </div>
                  <div style={{ textAlign: "center", padding: "0 12px" }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: "#b45309" }}>
                      {p.goles_local} - {p.goles_visitante}
                    </div>
                    {!p.cerrado && (
                      <button onClick={() => cerrarPartido(p.id)} className="mundi-btn mundi-btn-red" style={{ fontSize: 10, padding: "5px 10px", marginTop: 6 }}>
                        Cerrar
                      </button>
                    )}
                  </div>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={avatar("#ef4444", 44)}>{initials(p.visitante_nombre)}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6, color: "#0f172a" }}>{p.visitante_nombre}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>{p.visitante_grupo}</div>
                  </div>
                </div>
              </div>
            ))}
            {partidos.length === 0 && (
              <div style={{ color: "#94a3b8", textAlign: "center", padding: 32 }}>No hay partidos generados. Usa el boton "Generar Partidos del Día".</div>
            )}
          </div>
        </div>
      )}

      {/* TAB: GOLES EN VIVO */}
      {tab === "goles" && torneo && (
        <div style={card}>
          <h3 style={titleStyle}>Últimos Goles</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12 }}>
            <div>
              <div style={labelStyle}>Registrar Gol Manual</div>
              <select id="golAsesor" style={selectLight}>
                <option value="">— Selecciona asesor —</option>
                {participantes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <select id="golTipo" style={{ ...selectLight, marginTop: 8 }}>
                <option value="VENTA">VENTA (+1)</option>
                <option value="BONO_90MIN">BONO 90 min (+2)</option>
                <option value="BONO_MISMO_DIA">BONO Mismo Día (+1)</option>
                <option value="MANUAL">MANUAL</option>
              </select>
              <button className="mundi-btn mundi-btn-green" style={{ marginTop: 8 }}
                onClick={() => {
                  const a = Number(document.getElementById("golAsesor").value);
                  const t = document.getElementById("golTipo").value;
                  if (!a) return alert("Selecciona asesor");
                  const cant = t === "BONO_90MIN" ? 2 : 1;
                  registrarGolManual(a, t, cant);
                }}>
                ⚽ Registrar Gol
              </button>
            </div>
            <div>
              <div style={labelStyle}>Feed en Vivo</div>
              <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8, background: "white" }}>
                {goles.map(g => (
                  <div key={g.id} style={{ padding: "10px 12px", borderTop: "1px solid #f1f5f9" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 600, color: "#0f172a" }}>⚽ {g.asesor_nombre}</span>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>{new Date(g.fecha_hora).toLocaleTimeString()}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#b45309", marginTop: 2 }}>{g.tipo} (+{g.cantidad})</div>
                  </div>
                ))}
                {goles.length === 0 && <div style={{ padding: 20, color: "#94a3b8", textAlign: "center", fontSize: 12 }}>Sin goles aun</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: PARTICIPANTES */}
      {tab === "participantes" && torneo && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            <h3 style={titleStyle}>Participantes ({participantes.length})</h3>
            <button className="mundi-btn mundi-btn-gold" onClick={sortear}>🎲 Realizar Sorteo</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input placeholder="Nombre del asesor"
              value={newParticipante.nombre}
              onChange={e => setNewParticipante(s => ({ ...s, nombre: e.target.value, asesor_key: e.target.value }))}
              style={{ ...selectLight, flex: 1 }} />
            <button className="mundi-btn mundi-btn-green" onClick={agregarParticipante}>+ Agregar</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
            {participantes.map(p => (
              <div key={p.id} className="mundi-card-hover" style={{ ...partidoCard, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={avatar(p.grupo_color || "#3b82f6", 40)}>{initials(p.nombre)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>{p.nombre}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{p.grupo_nombre || "Sin grupo"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: TOP 10 */}
      {tab === "top10" && torneo && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={titleStyle}>🏆 Top 10 — Premio: Horario Flexible</h3>
            <button className="mundi-btn mundi-btn-gold" onClick={calcularTop10}>📊 Recalcular Top 10</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
            {top10.map(t => (
              <div key={t.id} className="mundi-card-hover" style={{
                ...partidoCard,
                borderColor: t.posicion <= 3 ? "#fbbf24" : "#e2e8f0",
                background: t.posicion <= 3 ? "linear-gradient(180deg, #fffbeb 0%, white 100%)" : "white",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 22 }}>
                    {t.posicion === 1 ? "🥇" : t.posicion === 2 ? "🥈" : t.posicion === 3 ? "🥉" : <span style={{ fontSize: 14, color: "#64748b", fontWeight: 800 }}>#{t.posicion}</span>}
                  </span>
                  <div style={avatar("#3b82f6", 40)}>{initials(t.asesor_nombre)}</div>
                </div>
                <div style={{ marginTop: 8, fontWeight: 700, color: "#0f172a" }}>{t.asesor_nombre}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{t.grupo_nombre}</div>
                <div style={{ marginTop: 6, fontSize: 11, color: "#059669" }}>{t.beneficio}</div>
              </div>
            ))}
            {top10.length === 0 && <div style={{ color: "#94a3b8", padding: 20, fontSize: 13 }}>Haz click en "Recalcular Top 10".</div>}
          </div>
        </div>
      )}

      {/* TAB: PREMIOS */}
      {tab === "premios" && torneo && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={titleStyle}>💰 Liquidación de Premios</h3>
            <button className="mundi-btn mundi-btn-green" onClick={calcularPremios}>💵 Recalcular Premios</button>
          </div>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
            <table style={tableStyle}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={th}>Asesor</th>
                  <th style={th}>Motivo</th>
                  <th style={th}>Monto USD</th>
                  <th style={th}>Pagado</th>
                </tr>
              </thead>
              <tbody>
                {premios.map(p => (
                  <tr key={p.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={td}>{p.asesor_nombre}</td>
                    <td style={td}>{p.motivo}</td>
                    <td style={{ ...td, fontWeight: 700, color: "#059669" }}>${Number(p.monto).toFixed(2)}</td>
                    <td style={td}>{p.pagado ? "✓" : "—"}</td>
                  </tr>
                ))}
                {premios.length === 0 && <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: "#94a3b8", padding: 24 }}>Sin premios aun</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: "#64748b" }}>
            Total liquidado: <b style={{ color: "#059669" }}>${premios.reduce((a, p) => a + Number(p.monto), 0).toFixed(2)}</b>
          </div>
        </div>
      )}

      {/* TAB: CONFIGURACION */}
      {tab === "config" && (
        <div style={card}>
          <h3 style={titleStyle}>⚙️ Crear nuevo torneo en {empresa}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8, marginTop: 12 }}>
            <input placeholder="Nombre del torneo" value={newTorneo.nombre}
              onChange={e => setNewTorneo(s => ({ ...s, nombre: e.target.value }))} style={selectLight} />
            <select value={newTorneo.fase} onChange={e => setNewTorneo(s => ({ ...s, fase: e.target.value }))} style={selectLight}>
              {["GRUPOS","OCTAVOS","CUARTOS","SEMIS","FINAL"].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <input type="date" value={newTorneo.fecha_inicio}
              onChange={e => setNewTorneo(s => ({ ...s, fecha_inicio: e.target.value }))} style={selectLight} />
            <input type="date" value={newTorneo.fecha_fin}
              onChange={e => setNewTorneo(s => ({ ...s, fecha_fin: e.target.value }))} style={selectLight} />
            <button className="mundi-btn mundi-btn-green" onClick={crearTorneo}>+ Crear Torneo</button>
          </div>

          {torneo && (
            <div style={{ marginTop: 24 }}>
              <h4 style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: "#0f172a" }}>📋 Reglas del torneo activo</h4>
              <pre style={{
                background: "#f8fafc", padding: 12, borderRadius: 8,
                border: "1px solid #e2e8f0", fontSize: 11, color: "#475569",
                maxHeight: 240, overflow: "auto",
              }}>{JSON.stringify(torneo.reglas_json, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 24, textAlign: "center", fontSize: 11, color: "#94a3b8" }}>
        *KPIs y eficiencias actualizados en tiempo real vía Socket.IO
      </div>
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================
const card = {
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 16, padding: 20,
  boxShadow: "0 1px 3px rgba(15,23,42,.04)",
};
const titleStyle = { fontWeight: 700, fontSize: 16, color: "#0f172a", margin: 0 };
const labelStyle = { fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 6, letterSpacing: ".05em", textTransform: "uppercase" };
const selectLight = {
  background: "white", color: "#0f172a",
  border: "1px solid #e2e8f0", borderRadius: 8,
  padding: "8px 12px", fontSize: 12, fontWeight: 500, outline: "none", width: "100%",
  transition: "border-color .15s ease",
};
const tabActive = {
  background: "white",
  color: "#0f172a", padding: "8px 14px", borderRadius: 10,
  fontWeight: 700, fontSize: 12, border: "1px solid #0f172a", cursor: "pointer",
  boxShadow: "0 1px 3px rgba(15,23,42,.06)",
};
const tabInactive = {
  background: "transparent", color: "#64748b",
  padding: "8px 14px", borderRadius: 10, fontWeight: 500, fontSize: 12,
  border: "1px solid #e2e8f0", cursor: "pointer",
};
const tableStyle = {
  width: "100%", borderCollapse: "collapse",
  background: "white",
};
const th = {
  padding: "10px 12px", textAlign: "left",
  fontSize: 10, fontWeight: 700, color: "#64748b",
  letterSpacing: ".05em", textTransform: "uppercase",
};
const td = { padding: "10px 12px", fontSize: 13, color: "#334155" };
const partidoCard = {
  background: "white", border: "1px solid #e2e8f0",
  borderRadius: 12, padding: 14,
  boxShadow: "0 1px 2px rgba(15,23,42,.04)",
};
const avatar = (color = "#3b82f6", size = 36) => ({
  width: size, height: size, borderRadius: "50%",
  background: `linear-gradient(135deg, ${color}, ${color}cc)`,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  color: "white", fontWeight: 700, fontSize: size * 0.38,
  border: `2px solid white`,
  boxShadow: `0 2px 6px ${color}30`,
  flexShrink: 0,
});
