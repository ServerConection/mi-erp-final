// =============================================================================
// MUNDIALITO - Programa de Aceleracion Comercial
// Tema oscuro con foto de fondo (transparencia alta).
// =============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const API = import.meta.env.VITE_API_URL || "";
const FONDO_URL = "/mundialito-bg.jpg"; // colocar imagen en frontend/public/

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const fetchJson = async (url, opts = {}) => {
  const res = await fetch(`${API}${url}`, { headers: authHeaders(), ...opts });
  return res.json();
};

const hoy = () => new Date().toISOString().slice(0, 10);
const initials = (n) => (n || "?").split(" ").slice(0, 2).map((w) => w[0]).join("");

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

const GolOverlay = ({ data, onDone }) => {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);
  if (!data) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9998,
      background: "radial-gradient(ellipse at center, rgba(15,23,42,.85) 0%, rgba(2,6,23,.95) 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      animation: "fadeIn .3s ease",
    }}>
      <div style={{
        fontSize: "min(20vw, 200px)", fontWeight: 900, lineHeight: 1,
        background: "linear-gradient(180deg, #fbbf24 0%, #f59e0b 50%, #b45309 100%)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        textShadow: "0 0 60px rgba(251,191,36,.5)",
        animation: "golBounce 2.8s cubic-bezier(.25,1.4,.5,1) forwards",
        letterSpacing: "-.03em",
      }}>
        ¡GOOOL!
      </div>
      <div style={{
        marginTop: 24, padding: "16px 32px",
        background: "rgba(15, 23, 42, .8)",
        border: "2px solid rgba(251, 191, 36, .5)",
        borderRadius: 16, color: "#fbbf24", fontWeight: 800,
        fontSize: 22, animation: "fadeIn 1s .4s both",
      }}>
        ⚽ {data.asesor?.nombre || "Asesor"} — {data.tipo} (+{data.cantidad})
      </div>
    </div>
  );
};

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
      0%, 100% { transform: scale(1) rotate(-5deg); filter: drop-shadow(0 0 8px rgba(251,191,36,.6)); }
      50%      { transform: scale(1.1) rotate(5deg); filter: drop-shadow(0 0 18px rgba(251,191,36,1)); }
    }
    @keyframes tickerScroll {
      0%   { transform: translateX(100%); }
      100% { transform: translateX(-100%); }
    }
    .mundi-leader-row {
      background: linear-gradient(90deg, rgba(251,191,36,0) 0%, rgba(251,191,36,.18) 50%, rgba(251,191,36,0) 100%);
      background-size: 200% 100%;
      animation: shimmer 3s linear infinite;
    }
    .mundi-table-row { transition: background .2s ease; }
    .mundi-table-row:hover { background: rgba(59,130,246,.12); }
    .mundi-btn {
      background: linear-gradient(180deg, #1e40af, #1e3a8a);
      color: white; padding: 10px 20px; border-radius: 10px;
      font-weight: 800; font-size: 12px; letter-spacing: .05em; text-transform: uppercase;
      border: 1px solid #3b82f6; cursor: pointer; transition: all .2s ease;
      box-shadow: 0 4px 12px rgba(30,64,175,.4);
    }
    .mundi-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(30,64,175,.6); }
    .mundi-btn:active { transform: translateY(0); }
    .mundi-btn-gold { background: linear-gradient(180deg,#f59e0b,#b45309); border-color: #fbbf24; }
    .mundi-btn-red { background: linear-gradient(180deg,#dc2626,#991b1b); border-color: #ef4444; }
    .mundi-btn-green { background: linear-gradient(180deg,#16a34a,#166534); border-color: #22c55e; }
    .mundi-pill {
      padding: 4px 10px; border-radius: 999px; font-weight: 800; font-size: 10px;
      letter-spacing: .08em; text-transform: uppercase;
    }
    .mundi-ticker { animation: tickerScroll 40s linear infinite; }
    .mundi-bg-overlay::before {
      content: ''; position: fixed; inset: 0; z-index: 0;
      background-image: url('${FONDO_URL}');
      background-size: cover; background-position: center;
      background-repeat: no-repeat;
      opacity: 0.15;
      pointer-events: none;
    }
    .mundi-bg-overlay::after {
      content: ''; position: fixed; inset: 0; z-index: 0;
      background: linear-gradient(180deg, rgba(2,6,23,.85) 0%, rgba(15,23,42,.75) 50%, rgba(30,41,59,.85) 100%);
      pointer-events: none;
    }
    .mundi-content { position: relative; z-index: 1; }
  `}</style>
);

export default function Mundialito() {
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
    if (!confirm("Realizar sorteo aleatorio de grupos?")) return;
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

  return (
    <div className="mundi-bg-overlay" style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #020617 0%, #0f172a 50%, #1e293b 100%)",
      color: "#e2e8f0", padding: 24,
      fontFamily: "system-ui, -apple-system, sans-serif",
      position: "relative",
    }}>
      <Styles />
      <Confetti trigger={confettiKey} />
      {golOverlay && <GolOverlay data={golOverlay} onDone={() => setGolOverlay(null)} />}

      <div className="mundi-content">
      {/* HEADER */}
      <div style={{
        background: "linear-gradient(90deg, rgba(30,58,138,.85) 0%, rgba(30,64,175,.85) 50%, rgba(30,58,138,.85) 100%)",
        border: "1px solid rgba(59,130,246,.4)",
        borderRadius: 16, padding: "20px 28px", marginBottom: 20,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 12,
        boxShadow: "0 8px 24px rgba(30,58,138,.4)",
        backdropFilter: "blur(6px)",
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#93c5fd", letterSpacing: ".15em" }}>
            PROGRAMA DE ACELERACIÓN COMERCIAL
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "white", marginTop: 4, letterSpacing: "-.02em" }}>
            🏆 MUNDIALITO {empresa}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} style={selectDark}>
            <option value="NOVONET">NOVONET</option>
            <option value="VELSA">VELSA</option>
          </select>
          <select value={torneo?.id || ""} onChange={(e) => setTorneo(torneos.find(t => t.id === Number(e.target.value)))}
            style={selectDark}>
            <option value="">— Selecciona torneo —</option>
            {torneos.map(t => <option key={t.id} value={t.id}>{t.nombre} ({t.fase})</option>)}
          </select>
          <button onClick={() => setSoundOn(s => !s)} className="mundi-btn">
            {soundOn ? "🔊 Sonido ON" : "🔇 Sonido OFF"}
          </button>
        </div>
      </div>

      {/* TICKER */}
      <div style={{
        background: "rgba(15,23,42,.85)", border: "1px solid rgba(59,130,246,.3)",
        borderRadius: 10, overflow: "hidden", padding: "8px 0", marginBottom: 16,
        fontSize: 13, fontWeight: 700, color: "#fbbf24",
        backdropFilter: "blur(6px)",
      }}>
        <div className="mundi-ticker" style={{ whiteSpace: "nowrap" }}>{tickerText}</div>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
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

      {!torneo && tab !== "config" && (
        <div style={card}>
          <h3 style={{ fontWeight: 900, fontSize: 18 }}>No hay torneo activo</h3>
          <p style={{ color: "#94a3b8" }}>Ve a la pestaña <b>Configuración</b> para crear el primer torneo de {empresa}.</p>
        </div>
      )}

      {/* TAB: POSICIONES */}
      {tab === "posiciones" && torneo && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={titleStyle}>Tabla de Posiciones — Fase {torneo.fase}</h3>
            <button className="mundi-btn" onClick={() => cargarDatosTorneo(torneo)}>🔄 Refrescar</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr style={{ background: "rgba(30,58,138,.6)" }}>
                  <th style={th}>RANGO</th>
                  <th style={th}>ASESOR</th>
                  <th style={th}>GRUPO</th>
                  <th style={th}>EFICIENCIA</th>
                  <th style={th}>VELOCIDAD</th>
                  <th style={th}>CONVERSIÓN</th>
                  <th style={th}>PJ</th>
                  <th style={th}>PG</th>
                  <th style={th}>PE</th>
                  <th style={th}>PP</th>
                  <th style={th}>GOLES</th>
                  <th style={{ ...th, color: "#fbbf24" }}>TOTAL PTS</th>
                </tr>
              </thead>
              <tbody>
                {posiciones.map((p, idx) => (
                  <tr key={p.participante_id}
                      className={`mundi-table-row ${idx === 0 ? "mundi-leader-row" : ""}`}
                      style={{ borderBottom: "1px solid rgba(59,130,246,.15)" }}>
                    <td style={td}>
                      {idx === 0 && <span style={{ fontSize: 24, display: "inline-block", animation: "crownPulse 2s ease infinite" }}>👑</span>}
                      {idx === 1 && <span style={{ fontSize: 22 }}>🥈</span>}
                      {idx === 2 && <span style={{ fontSize: 22 }}>🥉</span>}
                      {idx > 2 && <span style={{ fontWeight: 900, color: "#94a3b8" }}>#{idx + 1}</span>}
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={avatar(p.grupo_color)}>{initials(p.asesor_nombre)}</div>
                        <span style={{ fontWeight: 700 }}>{p.asesor_nombre}</span>
                      </div>
                    </td>
                    <td style={td}>
                      <span className="mundi-pill" style={{ background: (p.grupo_color || "#3b82f6") + "33", color: p.grupo_color, border: `1px solid ${p.grupo_color}` }}>
                        {p.grupo_nombre || "SIN GRUPO"}
                      </span>
                    </td>
                    <td style={{ ...td, color: "#22d3ee", fontWeight: 800 }}>{p.kpi_eficiencia_pct}%</td>
                    <td style={{ ...td, color: "#a78bfa", fontWeight: 800 }}>{p.kpi_velocidad_min} min</td>
                    <td style={{ ...td, color: "#fbbf24", fontWeight: 800 }}>{p.kpi_conversion_pct}%</td>
                    <td style={td}>{p.pj}</td>
                    <td style={{ ...td, color: "#22c55e" }}>{p.pg}</td>
                    <td style={{ ...td, color: "#94a3b8" }}>{p.pe}</td>
                    <td style={{ ...td, color: "#ef4444" }}>{p.pp}</td>
                    <td style={{ ...td, fontSize: 16, fontWeight: 900, color: "#fff" }}>⚽ {p.goles_totales}</td>
                    <td style={{ ...td, fontSize: 18, fontWeight: 900, color: "#fbbf24" }}>{p.puntos_total}</td>
                  </tr>
                ))}
                {posiciones.length === 0 && (
                  <tr><td colSpan={12} style={{ ...td, textAlign: "center", color: "#94a3b8", padding: 32 }}>Sin participantes aun.</td></tr>
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
              <div key={p.id} style={partidoCard}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", marginBottom: 8 }}>
                  {new Date(p.fecha).toLocaleDateString()}
                  {p.cerrado && <span style={{ marginLeft: 8, color: "#22c55e" }}>● CERRADO</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={avatar("#3b82f6", 44)}>{initials(p.local_nombre)}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6 }}>{p.local_nombre}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>{p.local_grupo}</div>
                  </div>
                  <div style={{ textAlign: "center", padding: "0 12px" }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: "#fbbf24" }}>
                      {p.goles_local} - {p.goles_visitante}
                    </div>
                    {!p.cerrado && (
                      <button onClick={() => cerrarPartido(p.id)} className="mundi-btn mundi-btn-red" style={{ fontSize: 10, padding: "6px 10px", marginTop: 6 }}>
                        Cerrar
                      </button>
                    )}
                  </div>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={avatar("#ef4444", 44)}>{initials(p.visitante_nombre)}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6 }}>{p.visitante_nombre}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>{p.visitante_grupo}</div>
                  </div>
                </div>
              </div>
            ))}
            {partidos.length === 0 && (
              <div style={{ color: "#94a3b8", textAlign: "center", padding: 32 }}>No hay partidos generados.</div>
            )}
          </div>
        </div>
      )}

      {/* TAB: GOLES */}
      {tab === "goles" && torneo && (
        <div style={card}>
          <h3 style={titleStyle}>Últimos Goles</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", marginBottom: 6 }}>REGISTRAR GOL MANUAL</div>
              <select id="golAsesor" style={selectDark}>
                <option value="">— Selecciona asesor —</option>
                {participantes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <select id="golTipo" style={{ ...selectDark, marginTop: 8 }}>
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
              <div style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", marginBottom: 6 }}>FEED EN VIVO</div>
              <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid rgba(59,130,246,.2)", borderRadius: 8 }}>
                {goles.map(g => (
                  <div key={g.id} style={{ padding: "8px 12px", borderBottom: "1px solid rgba(59,130,246,.15)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 700 }}>⚽ {g.asesor_nombre}</span>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>{new Date(g.fecha_hora).toLocaleTimeString()}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#fbbf24" }}>{g.tipo} (+{g.cantidad})</div>
                  </div>
                ))}
                {goles.length === 0 && <div style={{ padding: 20, color: "#94a3b8", textAlign: "center" }}>Sin goles aun</div>}
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
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input placeholder="Nombre del asesor"
              value={newParticipante.nombre}
              onChange={e => setNewParticipante(s => ({ ...s, nombre: e.target.value, asesor_key: e.target.value }))}
              style={{ ...selectDark, flex: 1 }} />
            <button className="mundi-btn mundi-btn-green" onClick={agregarParticipante}>+ Agregar</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
            {participantes.map(p => (
              <div key={p.id} style={{ ...partidoCard, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={avatar(p.grupo_color || "#3b82f6", 40)}>{initials(p.nombre)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>{p.nombre}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{p.grupo_nombre || "Sin grupo"}</div>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
            {top10.map(t => (
              <div key={t.id} style={{
                ...partidoCard,
                borderColor: t.posicion <= 3 ? "#fbbf24" : "rgba(59,130,246,.3)",
                background: t.posicion <= 3 ? "rgba(251,191,36,.08)" : "rgba(15,23,42,.6)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 24 }}>
                    {t.posicion === 1 ? "🥇" : t.posicion === 2 ? "🥈" : t.posicion === 3 ? "🥉" : `#${t.posicion}`}
                  </span>
                  <div style={avatar("#3b82f6", 40)}>{initials(t.asesor_nombre)}</div>
                </div>
                <div style={{ marginTop: 8, fontWeight: 800 }}>{t.asesor_nombre}</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{t.grupo_nombre}</div>
                <div style={{ marginTop: 6, fontSize: 11, color: "#22c55e" }}>{t.beneficio}</div>
              </div>
            ))}
            {top10.length === 0 && <div style={{ color: "#94a3b8", padding: 20 }}>Haz click en "Recalcular Top 10".</div>}
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
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "rgba(30,58,138,.6)" }}>
                <th style={th}>ASESOR</th>
                <th style={th}>MOTIVO</th>
                <th style={th}>MONTO USD</th>
                <th style={th}>PAGADO</th>
              </tr>
            </thead>
            <tbody>
              {premios.map(p => (
                <tr key={p.id} style={{ borderBottom: "1px solid rgba(59,130,246,.15)" }}>
                  <td style={td}>{p.asesor_nombre}</td>
                  <td style={td}>{p.motivo}</td>
                  <td style={{ ...td, fontWeight: 900, color: "#22c55e" }}>${Number(p.monto).toFixed(2)}</td>
                  <td style={td}>{p.pagado ? "✓" : "—"}</td>
                </tr>
              ))}
              {premios.length === 0 && <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: "#94a3b8", padding: 20 }}>Sin premios aun</td></tr>}
            </tbody>
          </table>
          <div style={{ marginTop: 12, fontSize: 11, color: "#94a3b8" }}>
            Total liquidado: <b style={{ color: "#22c55e" }}>${premios.reduce((a, p) => a + Number(p.monto), 0).toFixed(2)}</b>
          </div>
        </div>
      )}

      {/* TAB: CONFIG */}
      {tab === "config" && (
        <div style={card}>
          <h3 style={titleStyle}>⚙️ Crear nuevo torneo en {empresa}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
            <input placeholder="Nombre del torneo" value={newTorneo.nombre}
              onChange={e => setNewTorneo(s => ({ ...s, nombre: e.target.value }))} style={selectDark} />
            <select value={newTorneo.fase} onChange={e => setNewTorneo(s => ({ ...s, fase: e.target.value }))} style={selectDark}>
              {["GRUPOS","OCTAVOS","CUARTOS","SEMIS","FINAL"].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <input type="date" value={newTorneo.fecha_inicio}
              onChange={e => setNewTorneo(s => ({ ...s, fecha_inicio: e.target.value }))} style={selectDark} />
            <input type="date" value={newTorneo.fecha_fin}
              onChange={e => setNewTorneo(s => ({ ...s, fecha_fin: e.target.value }))} style={selectDark} />
            <button className="mundi-btn mundi-btn-green" onClick={crearTorneo}>+ Crear Torneo</button>
          </div>

          {torneo && (
            <div style={{ marginTop: 24 }}>
              <h4 style={{ fontWeight: 900, fontSize: 14, marginBottom: 8 }}>📋 Reglas del torneo activo</h4>
              <pre style={{
                background: "rgba(2,6,23,.7)", padding: 12, borderRadius: 8,
                border: "1px solid rgba(59,130,246,.2)", fontSize: 11, color: "#cbd5e1",
                maxHeight: 240, overflow: "auto",
              }}>{JSON.stringify(torneo.reglas_json, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 32, textAlign: "center", fontSize: 10, color: "#64748b" }}>
        *KPIs y eficiencias actualizados en tiempo real vía Socket.IO
      </div>
      </div>
    </div>
  );
}

const card = {
  background: "rgba(15,23,42,.75)",
  border: "1px solid rgba(59,130,246,.25)",
  borderRadius: 16, padding: 20,
  backdropFilter: "blur(10px)",
  boxShadow: "0 12px 32px rgba(2,6,23,.6)",
};
const titleStyle = { fontWeight: 900, fontSize: 18, color: "white", margin: 0 };
const selectDark = {
  background: "rgba(2,6,23,.7)", color: "#e2e8f0",
  border: "1px solid rgba(59,130,246,.4)", borderRadius: 8,
  padding: "8px 12px", fontSize: 12, fontWeight: 700, outline: "none", width: "100%",
};
const tabActive = {
  background: "linear-gradient(180deg,#fbbf24,#b45309)",
  color: "#1e293b", padding: "8px 14px", borderRadius: 10,
  fontWeight: 900, fontSize: 11, border: "1px solid #fbbf24", cursor: "pointer",
};
const tabInactive = {
  background: "rgba(15,23,42,.7)", color: "#cbd5e1",
  padding: "8px 14px", borderRadius: 10, fontWeight: 700, fontSize: 11,
  border: "1px solid rgba(59,130,246,.25)", cursor: "pointer",
  backdropFilter: "blur(6px)",
};
const tableStyle = {
  width: "100%", borderCollapse: "collapse",
  background: "rgba(2,6,23,.4)", borderRadius: 8, overflow: "hidden",
};
const th = {
  padding: "10px 8px", textAlign: "left",
  fontSize: 10, fontWeight: 900, color: "#93c5fd",
  letterSpacing: ".05em", textTransform: "uppercase",
  borderBottom: "1px solid rgba(59,130,246,.3)",
};
const td = { padding: "8px", fontSize: 12, color: "#e2e8f0" };
const partidoCard = {
  background: "rgba(15,23,42,.6)", border: "1px solid rgba(59,130,246,.3)",
  borderRadius: 12, padding: 14,
  backdropFilter: "blur(6px)",
};
const avatar = (color = "#3b82f6", size = 36) => ({
  width: size, height: size, borderRadius: "50%",
  background: `linear-gradient(135deg, ${color}, ${color}88)`,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  color: "white", fontWeight: 900, fontSize: size * 0.4,
  border: `2px solid ${color}`,
  boxShadow: `0 2px 8px ${color}40`,
});
