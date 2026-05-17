// src/pages/TVMode.jsx
// Ruta: /tv?canal=velsa | /tv?canal=novonet | /tv (admin = todos)
// Sin login. Pantalla completa. Siempre escuchando Socket.io.

import { useEffect, useState, useRef, useMemo } from "react";
import { io } from "socket.io-client";

const API = import.meta.env.VITE_API_URL;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const rnd = (min, max) => min + Math.random() * (max - min);
const CONFETTI_COLORS = ["#fbbf24","#10b981","#f97316","#f472b6","#60a5fa","#a78bfa","#34d399","#fb7185"];
const FIRE_COLORS     = ["#ff4500","#ff6200","#ff8c00","#ffaa00","#ffcc00","#ff3300"];
const MATRIX_CHARS    = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*<>[]{}|";

// ─── Sonidos sintetizados ──────────────────────────────────────────────────────
const playSound = (tipo) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const play = (freq, t, dur, type = "sine", vol = 0.3) => {
      if (!freq) return;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + t);
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + dur);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + dur + 0.05);
    };
    const sounds = {
      chime:    [[523.25,0,.2],[659.25,.15,.2],[783.99,.3,.3]],
      alerta:   [[880,0,.15],[880,.25,.15],[1100,.45,.3]],
      victoria: [[523.25,0,.15,"triangle"],[659.25,.1,.15,"triangle"],[783.99,.2,.15,"triangle"],[1046.5,.3,.4,"triangle"]],
      error:    [[440,0,.2],[330,.2,.3]],
      pop:      [[800,0,.08,"sine",.4],[400,.08,.15,"sine",.2]],
      swoosh:   [[200,0,.05],[400,.05,.1],[300,.15,.2]],
      cash:     [[1200,0,.04,"square",.2],[900,.04,.04,"square",.2],[1500,.08,.08,"triangle",.3]],
    };
    (sounds[tipo] || sounds.chime).forEach(([f, t, d, tp, v]) => play(f, t, d, tp, v));
  } catch (_) {}
};

// ─── PARTÍCULAS ────────────────────────────────────────────────────────────────
function Particulas({ efecto }) {
  // Generamos las partículas solo una vez por montaje del efecto
  const pieces = useMemo(() => {
    const count = efecto === "fuego" ? 35 : efecto === "explosion" ? 50 : 60;
    return Array.from({ length: count }, (_, i) => ({ i, r: Math.random() }));
  }, [efecto]);

  if (!efecto || efecto === "ninguno") return null;

  const confettiStyle = ({ i, r }) => ({
    position: "absolute",
    left: `${r * 100}%`,
    top: "-30px",
    width: `${6 + r * 10}px`,
    height: `${10 + r * 12}px`,
    background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    borderRadius: i % 3 === 0 ? "50%" : i % 3 === 1 ? "2px" : "50% 0 50% 0",
    transform: `rotate(${r * 360}deg)`,
    animation: `tvConfetti ${1.4 + r * 2}s ${r * 1.2}s ease-in forwards`,
    pointerEvents: "none", zIndex: 10,
  });

  const fuegoStyle = ({ i, r }) => ({
    position: "absolute",
    left: `${5 + r * 90}%`,
    bottom: "0px",
    width: `${8 + r * 20}px`,
    height: `${25 + r * 50}px`,
    background: `radial-gradient(ellipse at bottom, ${FIRE_COLORS[i % FIRE_COLORS.length]} 0%, transparent 70%)`,
    borderRadius: "50% 50% 30% 30%",
    opacity: 0.6 + r * 0.4,
    animation: `tvFireRise ${0.7 + r * 1.2}s ${r * 0.6}s ease-out infinite`,
    pointerEvents: "none", zIndex: 10,
  });

  const nieveStyle = ({ i, r }) => ({
    position: "absolute",
    left: `${r * 102}%`,
    top: `${-10 - r * 10}px`,
    width: `${4 + r * 10}px`,
    height: `${4 + r * 10}px`,
    background: "radial-gradient(circle, #fff 30%, rgba(147,197,253,.6) 100%)",
    borderRadius: "50%",
    opacity: 0.5 + r * 0.5,
    animation: `tvSnow ${3 + r * 5}s ${r * 3}s linear infinite`,
    pointerEvents: "none", zIndex: 10,
  });

  const estrellaStyle = ({ i, r }) => ({
    position: "absolute",
    left: `${r * 100}%`,
    top: `${r * 90}%`,
    width: `${5 + r * 10}px`,
    height: `${5 + r * 10}px`,
    background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    borderRadius: "50%",
    boxShadow: `0 0 ${4 + r * 8}px ${CONFETTI_COLORS[i % CONFETTI_COLORS.length]}`,
    animation: `tvStar ${0.8 + r * 2}s ${r * 2}s ease-in-out infinite`,
    pointerEvents: "none", zIndex: 10,
  });

  const explosionStyle = ({ i, r }) => {
    const angle = (i / 50) * 360;
    const dist  = 20 + r * 45;
    const x = Math.cos((angle * Math.PI) / 180) * dist;
    const y = Math.sin((angle * Math.PI) / 180) * dist;
    return {
      position: "absolute",
      left: "50%", top: "50%",
      width: `${6 + r * 14}px`,
      height: `${6 + r * 14}px`,
      background: FIRE_COLORS[i % FIRE_COLORS.length],
      borderRadius: "50%",
      animation: `tvExplode 1.2s ${r * 0.3}s ease-out forwards`,
      "--tx": `${x}vw`, "--ty": `${y}vh`,
      pointerEvents: "none", zIndex: 12,
    };
  };

  const getStyle = (p) => {
    switch (efecto) {
      case "confeti":    return confettiStyle(p);
      case "fuego":      return fuegoStyle(p);
      case "nieve":      return nieveStyle(p);
      case "estrellas":  return estrellaStyle(p);
      case "explosion":  return explosionStyle(p);
      default: return null;
    }
  };

  if (!["confeti","fuego","nieve","estrellas","explosion"].includes(efecto)) return null;

  return (
    <div style={{ position:"fixed", inset:0, pointerEvents:"none", overflow:"hidden", zIndex:10 }}>
      {pieces.map(p => {
        const st = getStyle(p);
        return st ? <div key={p.i} style={st} /> : null;
      })}
    </div>
  );
}

// ─── OVERLAY de efectos de pantalla ───────────────────────────────────────────
function EfectoOverlay({ efecto }) {
  // Matrix: columnas de caracteres cayendo
  const matrixCols = useMemo(() => {
    if (efecto !== "matrix") return [];
    return Array.from({ length: 24 }, (_, col) => ({
      col,
      chars: Array.from({ length: 20 }, () =>
        MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]
      ),
      delay: Math.random() * 2,
      dur:   1.5 + Math.random() * 2,
    }));
  }, [efecto]);

  if (efecto === "alertaroja") return (
    <>
      <div style={{
        position:"fixed", inset:0, pointerEvents:"none", zIndex:5,
        border:"16px solid #ef4444",
        animation:"tvAlertBorder .4s ease-in-out infinite",
      }} />
      <div style={{
        position:"fixed", inset:0, pointerEvents:"none", zIndex:4,
        background:"rgba(239,68,68,0)",
        animation:"tvAlertFlash .4s ease-in-out infinite",
      }} />
    </>
  );

  if (efecto === "arcoiris") return (
    <>
      <div style={{
        position:"fixed", inset:0, pointerEvents:"none", zIndex:5,
        background:"linear-gradient(135deg, rgba(239,68,68,.15) 0%, rgba(234,179,8,.15) 20%, rgba(34,197,94,.15) 40%, rgba(59,130,246,.15) 60%, rgba(168,85,247,.15) 80%, rgba(236,72,153,.15) 100%)",
        animation:"tvRainbow 3s linear infinite",
      }} />
      <div style={{
        position:"fixed", inset:0, pointerEvents:"none", zIndex:6,
        backgroundImage:"linear-gradient(to bottom, transparent 60%, rgba(0,0,0,.3) 100%)",
      }} />
    </>
  );

  if (efecto === "matrix") return (
    <div style={{
      position:"fixed", inset:0, pointerEvents:"none", zIndex:5,
      overflow:"hidden",
      background:"rgba(0,20,0,.35)",
    }}>
      {/* Scanline */}
      <div style={{
        position:"absolute", left:0, right:0, height:"3px",
        background:"rgba(34,197,94,.5)",
        boxShadow:"0 0 12px rgba(34,197,94,.8)",
        animation:"tvScanline 1.8s linear infinite",
      }} />
      {/* Caracteres */}
      <div style={{ position:"absolute", inset:0, display:"flex",
        justifyContent:"space-around", overflow:"hidden" }}>
        {matrixCols.map(({ col, chars, delay, dur }) => (
          <div key={col} style={{
            display:"flex", flexDirection:"column",
            animation:`tvMatrixCol ${dur}s ${delay}s linear infinite`,
            fontSize:"min(1.4vw, 16px)", fontFamily:"monospace",
            color:"#22c55e", textShadow:"0 0 8px #22c55e",
            lineHeight:1.3, opacity:0.7,
          }}>
            {chars.map((ch, j) => (
              <span key={j} style={{ opacity: j === chars.length - 1 ? 1 : 0.4 + j * 0.03 }}>
                {ch}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  if (efecto === "spotlight") return (
    <div style={{
      position:"fixed", inset:0, pointerEvents:"none", zIndex:5,
      animation:"tvSpotlight 4s ease-in-out infinite",
    }} />
  );

  if (efecto === "pulso") return (
    <div style={{
      position:"fixed", inset:0, pointerEvents:"none", zIndex:5,
      animation:"tvPulse 1s ease-in-out infinite",
    }} />
  );

  if (efecto === "glitch") return (
    <>
      <div style={{
        position:"fixed", inset:0, pointerEvents:"none", zIndex:5,
        mixBlendMode:"screen",
        animation:"tvGlitchR .5s steps(1) infinite",
        background:"rgba(255,0,0,0)",
      }} />
      <div style={{
        position:"fixed", inset:0, pointerEvents:"none", zIndex:6,
        animation:"tvGlitchLines .3s steps(1) infinite",
      }} />
    </>
  );

  if (efecto === "explosion") return (
    <div style={{
      position:"fixed", inset:0, pointerEvents:"none", zIndex:4,
      background:"rgba(249,115,22,0)",
      animation:"tvExplosionFlash .4s ease-out",
    }} />
  );

  return null;
}

// ─── DATOS EN VIVO ────────────────────────────────────────────────────────────
function DatosVivos({ tipo, datos, colorTexto }) {
  if (!datos) return null;
  const st = { color: colorTexto, opacity: .92 };

  if (tipo === "top_asesores" && Array.isArray(datos)) return (
    <div style={{ marginTop:"2vh", display:"flex", flexDirection:"column", gap:"1vh", alignItems:"center" }}>
      <div style={{ fontSize:"min(1.5vw,14px)", fontWeight:800, ...st, opacity:.6,
        textTransform:"uppercase", letterSpacing:".14em", marginBottom:"1vh" }}>
        🏆 Top Asesores del Día
      </div>
      {datos.slice(0,5).map((a,i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:"2vw",
          background:"rgba(255,255,255,.12)", borderRadius:"1vw",
          padding:"1vh 3vw", minWidth:"30vw", backdropFilter:"blur(8px)" }}>
          <span style={{ fontSize:"min(3vw,28px)", fontWeight:900 }}>{["🥇","🥈","🥉","4️⃣","5️⃣"][i]}</span>
          <span style={{ fontSize:"min(2.2vw,22px)", fontWeight:800, flex:1, ...st }}>{a.nombre}</span>
          <span style={{ fontSize:"min(2.8vw,28px)", fontWeight:900, color:"#fbbf24" }}>{a.ingresos}</span>
        </div>
      ))}
    </div>
  );

  if (tipo === "top_activas" && Array.isArray(datos)) return (
    <div style={{ marginTop:"2vh", display:"flex", flexDirection:"column", gap:"1vh", alignItems:"center" }}>
      <div style={{ fontSize:"min(1.5vw,14px)", fontWeight:800, ...st, opacity:.6,
        textTransform:"uppercase", letterSpacing:".14em", marginBottom:"1vh" }}>
        ✅ Top Activas del Mes
      </div>
      {datos.slice(0,5).map((a,i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:"2vw",
          background:"rgba(255,255,255,.12)", borderRadius:"1vw", padding:"1vh 3vw", minWidth:"30vw" }}>
          <span style={{ fontSize:"min(2.2vw,22px)", fontWeight:900, ...st }}>{i+1}.</span>
          <span style={{ fontSize:"min(2.2vw,22px)", fontWeight:800, flex:1, ...st }}>{a.nombre}</span>
          <span style={{ fontSize:"min(2.8vw,28px)", fontWeight:900, color:"#34d399" }}>{a.activas}</span>
        </div>
      ))}
    </div>
  );

  if (tipo === "sin_ventas" && Array.isArray(datos)) return (
    <div style={{ marginTop:"2vh", textAlign:"center" }}>
      <div style={{ fontSize:"min(1.5vw,14px)", fontWeight:800, ...st, opacity:.6,
        textTransform:"uppercase", letterSpacing:".14em", marginBottom:"1vh" }}>
        📉 Sin ventas hoy ({datos.length})
      </div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:"1vw", justifyContent:"center", maxWidth:"70vw" }}>
        {datos.slice(0,12).map((nombre,i) => (
          <span key={i} style={{ background:"rgba(239,68,68,.3)", borderRadius:"2vw",
            padding:".5vh 1.5vw", fontSize:"min(1.8vw,18px)", fontWeight:700, ...st }}>
            {nombre}
          </span>
        ))}
      </div>
    </div>
  );

  if (tipo === "gestion_diaria" && Array.isArray(datos)) return (
    <div style={{ marginTop:"2vh", display:"flex", flexDirection:"column", gap:"1vh", alignItems:"center" }}>
      <div style={{ fontSize:"min(1.5vw,14px)", fontWeight:800, ...st, opacity:.6,
        textTransform:"uppercase", letterSpacing:".14em", marginBottom:"1vh" }}>
        ⚠️ Gestión Diaria pendiente
      </div>
      {datos.slice(0,5).map((a,i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:"2vw",
          background:"rgba(251,191,36,.2)", borderRadius:"1vw", padding:"1vh 2vw" }}>
          <span style={{ fontSize:"min(2vw,20px)", fontWeight:700, ...st }}>{a.nombre}</span>
          <span style={{ fontSize:"min(2.5vw,26px)", fontWeight:900, color:"#fbbf24" }}>{a.cantidad} leads</span>
        </div>
      ))}
    </div>
  );

  if (tipo === "resumen_dia" && datos && !Array.isArray(datos)) return (
    <div style={{ marginTop:"3vh", display:"flex", gap:"4vw", justifyContent:"center", flexWrap:"wrap" }}>
      {[
        { label:"Ingresos Jot", val:datos.ingresos_hoy,    color:"#34d399" },
        { label:"Activas hoy",  val:datos.activas_hoy,     color:"#60a5fa" },
        { label:"Gest. Diaria", val:datos.gestion_diaria,  color:"#fbbf24" },
      ].map(({ label, val, color }) => (
        <div key={label} style={{ textAlign:"center",
          background:"rgba(255,255,255,.1)", borderRadius:"1.5vw", padding:"2vh 3vw",
          backdropFilter:"blur(12px)", border:"1px solid rgba(255,255,255,.15)" }}>
          <div style={{ fontSize:"min(8vw,80px)", fontWeight:900, color, lineHeight:1 }}>{val ?? 0}</div>
          <div style={{ fontSize:"min(1.4vw,14px)", fontWeight:700, color:"#fff", opacity:.7,
            textTransform:"uppercase", letterSpacing:".1em", marginTop:"1vh" }}>{label}</div>
        </div>
      ))}
    </div>
  );

  return null;
}


// ─── Inyector de CSS de animaciones (evita template literals JSX) ─────────────
const TV_CSS = [
  "@keyframes tvConfetti { 0%{transform:translateY(-20px) rotate(0deg);opacity:1} 80%{opacity:1} 100%{transform:translateY(110vh) rotate(720deg);opacity:0} }",
  "@keyframes tvFireRise { 0%{transform:translateY(0) scaleX(1);opacity:.85} 50%{transform:translateY(-6vh) scaleX(1.5);opacity:.6} 100%{transform:translateY(-14vh) scaleX(.6);opacity:0} }",
  "@keyframes tvSnow { 0%{transform:translateY(-20px) translateX(0) rotate(0deg);opacity:.8} 50%{transform:translateY(50vh) translateX(3vw) rotate(180deg);opacity:.7} 100%{transform:translateY(110vh) translateX(-2vw) rotate(360deg);opacity:.1} }",
  "@keyframes tvStar { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(2.8);opacity:1} }",
  "@keyframes tvAlertBorder { 0%,100%{opacity:.25} 50%{opacity:1} }",
  "@keyframes tvAlertFlash { 0%,100%{background:rgba(239,68,68,0)} 50%{background:rgba(239,68,68,.2)} }",
  "@keyframes tvShake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-5px)} 80%{transform:translateX(5px)} }",
  "@keyframes tvRainbow { 0%{filter:hue-rotate(0deg)} 100%{filter:hue-rotate(360deg)} }",
  "@keyframes tvRainbowText { 0%{filter:hue-rotate(0deg) saturate(2)} 100%{filter:hue-rotate(360deg) saturate(2)} }",
  "@keyframes tvScanline { 0%{top:-5%} 100%{top:108%} }",
  "@keyframes tvMatrixCol { 0%{transform:translateY(-100%);opacity:0} 10%{opacity:.7} 90%{opacity:.7} 100%{transform:translateY(120vh);opacity:0} }",
  "@keyframes tvSpotlight { 0%{background:radial-gradient(ellipse 30vw 30vh at 40% 50%,transparent 0%,rgba(0,0,0,.75) 60%)} 50%{background:radial-gradient(ellipse 28vw 28vh at 60% 48%,transparent 0%,rgba(0,0,0,.75) 60%)} 100%{background:radial-gradient(ellipse 30vw 30vh at 40% 50%,transparent 0%,rgba(0,0,0,.75) 60%)} }",
  "@keyframes tvPulse { 0%,100%{background:rgba(255,255,255,0)} 50%{background:rgba(255,255,255,.07)} }",
  "@keyframes tvPulseContent { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.78;transform:scale(.97)} }",
  "@keyframes tvExplode { 0%{transform:translate(-50%,-50%) translate(0,0) scale(0);opacity:1} 100%{transform:translate(-50%,-50%) translate(var(--tx),var(--ty)) scale(1.5);opacity:0} }",
  "@keyframes tvExplosionFlash { 0%{background:rgba(249,115,22,.6)} 100%{background:rgba(249,115,22,0)} }",
  "@keyframes tvExplodeIn { 0%{opacity:0;transform:scale(.55) rotate(-3deg)} 55%{transform:scale(1.06) rotate(1deg)} 100%{opacity:1;transform:scale(1) rotate(0deg)} }",
  "@keyframes tvGlitchContent { 0%,100%{transform:translate(0);filter:none} 15%{transform:translate(-4px,2px);filter:hue-rotate(90deg) saturate(3)} 30%{transform:translate(4px,-2px)} 50%{transform:translate(-3px,1px);filter:hue-rotate(180deg) saturate(3)} 70%{transform:translate(3px,-1px)} 85%{transform:translate(-2px,3px);filter:hue-rotate(270deg)} }",
  "@keyframes tvGlitchLines { 0%,88%,100%{background:transparent} 89%{background:repeating-linear-gradient(0deg,rgba(255,0,60,.1) 0px,rgba(255,0,60,.1) 2px,transparent 2px,transparent 6px)} 94%{background:repeating-linear-gradient(0deg,rgba(0,255,200,.1) 0px,rgba(0,255,200,.1) 2px,transparent 2px,transparent 4px)} }",
  "@keyframes tvGlitchR { 0%,85%,100%{opacity:0;transform:translate(0)} 86%{opacity:.5;transform:translate(5px,0);background:rgba(255,0,0,.18)} 90%{opacity:.5;transform:translate(-5px,0);background:rgba(0,255,200,.18)} }",
  "@keyframes tvMsgIn { 0%{opacity:0;transform:scale(.78) translateY(6vh)} 65%{transform:scale(1.03) translateY(-1vh)} 100%{opacity:1;transform:scale(1) translateY(0)} }",
  "@keyframes tvPulseIcon { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.7;transform:scale(.92)} }",
].join(" ");

function InjectCSS() {
  useEffect(() => {
    const id = "tv-mode-keyframes";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = TV_CSS;
    document.head.appendChild(el);
    return () => { const s = document.getElementById(id); if(s) s.remove(); };
  }, []);
  return null;
}

// ─── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
export default function TVMode() {
  const [mensaje,  setMensaje]  = useState(null);
  const [visible,  setVisible]  = useState(false);
  const [progreso, setProgreso] = useState(100);
  const [hora,     setHora]     = useState("");

  const timerRef    = useRef(null);
  const intervalRef = useRef(null);
  const socketRef   = useRef(null);
  const audioRef    = useRef(null);

  // Canal de esta pantalla TV — se lee de la URL: /tv?canal=velsa
  const tvCanal = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("canal")?.toLowerCase().trim() || "";
    } catch (_) { return ""; }
  }, []);

  // Reloj
  useEffect(() => {
    const tick = () => setHora(new Date().toLocaleTimeString("es-EC", {
      timeZone:"America/Guayaquil", hour:"2-digit", minute:"2-digit", second:"2-digit",
    }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // Socket
  useEffect(() => {
    const token = localStorage.getItem("token");
    socketRef.current = io(API, {
      auth: token ? { token } : { tv: true },
      transports: ["websocket","polling"],
      reconnection: true,
      reconnectionAttempts: 60,
      reconnectionDelay: 3000,
      reconnectionDelayMax: 12000,
    });

    socketRef.current.on("connect", () => {
      console.log("[TVMode] Conectado:", socketRef.current.id, "canal=", tvCanal || "TODOS");
    });
    socketRef.current.on("connect_error", (err) => {
      console.warn("[TVMode] Error socket:", err.message);
    });
    socketRef.current.on("broadcast_mensaje", (data) => {
      // Filtrar por canal si esta TV tiene canal asignado
      const msgCanal = (data.canal || "").toLowerCase().trim();
      if (tvCanal && msgCanal && msgCanal !== tvCanal) {
        console.log(`[TVMode] Mensaje de canal '${msgCanal}' ignorado (esta TV es '${tvCanal}')`);
        return;
      }
      mostrarMensaje(data);
    });

    return () => socketRef.current?.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tvCanal]);

  const mostrarMensaje = (data) => {
    if (timerRef.current)    clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (audioRef.current)   { audioRef.current.pause(); audioRef.current.currentTime = 0; }

    setMensaje(data);
    setVisible(true);
    setProgreso(100);

    if (data.sonido && data.sonido !== "ninguno") playSound(data.sonido);

    const audioSrc = data.audio_url
      ? (data.audio_url.startsWith("http") ? data.audio_url : `${API}${data.audio_url}`)
      : null;
    if (audioSrc && audioRef.current) {
      audioRef.current.src = audioSrc;
      audioRef.current.play().catch(() => {});
    }

    const duracion = (parseInt(data.duracion) || 30) * 1000;
    const paso = 100 / (duracion / 100);

    intervalRef.current = setInterval(() => {
      setProgreso(p => Math.max(0, p - paso));
    }, 100);

    timerRef.current = setTimeout(() => {
      setVisible(false);
      clearInterval(intervalRef.current);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    }, duracion);
  };

  const cerrar = () => {
    setVisible(false);
    if (timerRef.current)    clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (audioRef.current)    { audioRef.current.pause(); audioRef.current.currentTime = 0; }
  };

  const TIPO_ICONOS = {
    urgente:       "🚨",
    prevencion:    "⚠️",
    logro:         "🏆",
    info:          "📢",
    personalizado: "✨",
    record:        "🥇",
    motivacion:    "💪",
  };

  const getContentAnimation = (efecto) => {
    switch (efecto) {
      case "glitch":     return "tvGlitchContent 0.6s steps(1) infinite";
      case "pulso":      return "tvPulseContent 1s ease-in-out infinite";
      case "arcoiris":   return "tvRainbowText 3s linear infinite";
      case "explosion":  return "tvExplodeIn 0.5s cubic-bezier(.34,1.56,.64,1) forwards";
      case "alertaroja": return "tvShake 0.2s ease-in-out infinite";
      default:           return "tvMsgIn 0.6s cubic-bezier(.34,1.56,.64,1) forwards";
    }
  };

  return (
    <div style={{
      width:"100vw", height:"100vh",
      background: visible && mensaje ? mensaje.color_fondo || "#0f172a" : "#0f172a",
      display:"flex", alignItems:"center", justifyContent:"center",
      overflow:"hidden", position:"relative", transition:"background 0.5s ease",
      fontFamily:"'DM Sans','Inter',system-ui,sans-serif",
    }}>
      <audio ref={audioRef} style={{ display:"none" }} />
      <InjectCSS />
      {visible && mensaje && <EfectoOverlay efecto={mensaje.efecto} />}
      {visible && mensaje && <Particulas efecto={mensaje.efecto} />}
      {!visible && (
        <div style={{ textAlign:"center", opacity:.18, userSelect:"none" }}>
          <div style={{ fontSize:"min(14vw,110px)", marginBottom:"3vh" }}>📺</div>
          <div style={{ fontSize:"min(3vw,28px)", fontWeight:900, color:"#fff", textTransform:"uppercase", letterSpacing:".2em" }}>
            MODO TV — EN ESPERA
          </div>
          {tvCanal && (
            <div style={{ marginTop:"1vh", fontSize:"min(2vw,18px)", color:"#fff", opacity:.6, fontWeight:700, letterSpacing:".12em" }}>
              CANAL: {tvCanal.toUpperCase()}
            </div>
          )}
          <div style={{ marginTop:"2vh", fontSize:"min(2.5vw,22px)", color:"#fff", opacity:.35, fontWeight:700 }}>{hora}</div>
        </div>
      )}
      {visible && mensaje?.imagen_url && (
        <img src={`${API}${mensaje.imagen_url}`} alt=""
          style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", opacity:.22, zIndex:0 }} />
      )}
      {visible && mensaje && (
        <>
          <div style={{
            position:"relative", zIndex:20, textAlign:"center", maxWidth:"82vw",
            animation: getContentAnimation(mensaje.efecto),
          }}>
            <div style={{
              fontSize:"min(10vw,90px)", marginBottom:"2vh", display:"inline-block",
              animation: mensaje.efecto === "glitch" ? "tvGlitchContent .7s steps(1) infinite" : "tvPulseIcon 2.2s ease-in-out infinite",
            }}>
              {TIPO_ICONOS[mensaje.tipo] || "📢"}
            </div>
            <div style={{
              fontSize:"min(6vw,68px)", fontWeight:900, color:mensaje.color_texto || "#fff",
              textTransform:"uppercase", letterSpacing:".04em", lineHeight:1.05,
              marginBottom:"2vh", textShadow:"0 4px 28px rgba(0,0,0,.55)", wordBreak:"break-word",
              ...(mensaje.efecto === "arcoiris" ? { animation:"tvRainbowText 3s linear infinite" } : {}),
            }}>
              {mensaje.titulo}
            </div>
            {mensaje.mensaje && (
              <div style={{
                fontSize:"min(2.8vw,30px)", fontWeight:600, color:mensaje.color_texto || "#fff",
                opacity:.9, lineHeight:1.55, maxWidth:"62vw", margin:"0 auto 2vh", wordBreak:"break-word",
              }}>
                {mensaje.mensaje}
              </div>
            )}
            <DatosVivos tipo={mensaje.datos_vivos} datos={mensaje.datosVivos} colorTexto={mensaje.color_texto || "#fff"} />
          </div>
          {mensaje.canal && (
            <div style={{
              position:"absolute", top:"2vh", left:"2vw", zIndex:30,
              fontSize:"min(1.5vw,13px)", fontWeight:800, padding:".4vh 1.2vw",
              borderRadius:"1vw", background:"rgba(255,255,255,.12)", color:"rgba(255,255,255,.7)",
              border:"1px solid rgba(255,255,255,.2)", backdropFilter:"blur(8px)",
              letterSpacing:".1em", textTransform:"uppercase",
            }}>
              {mensaje.canal.toUpperCase()}
            </div>
          )}
          <div style={{ position:"absolute", bottom:0, left:0, right:0, height:"6px", background:"rgba(255,255,255,.12)", zIndex:30 }}>
            <div style={{ height:"100%", width:`${progreso}%`, background:mensaje.color_texto || "#fff", boxShadow:`0 0 12px ${mensaje.color_texto || "#fff"}`, transition:"width .1s linear" }} />
          </div>
          <div style={{ position:"absolute", bottom:"1.5vh", right:"2vw", zIndex:30, fontSize:"min(1.5vw,13px)", color:mensaje.color_texto || "#fff", opacity:.5, fontWeight:700, letterSpacing:".1em" }}>
            {Math.ceil(progreso * parseInt(mensaje.duracion || 30) / 100)}s
          </div>
          <div style={{ position:"absolute", bottom:"1.5vh", left:"2vw", zIndex:30, fontSize:"min(1.5vw,13px)", color:mensaje.color_texto || "#fff", opacity:.35, fontWeight:700 }}>
            {hora}
          </div>
          <button onClick={cerrar} style={{
            position:"absolute", top:"2vh", right:"2vw", zIndex:40,
            background:"rgba(255,255,255,.14)", border:"1px solid rgba(255,255,255,.25)",
            borderRadius:"50%", width:"min(5vw,52px)", height:"min(5vw,52px)",
            cursor:"pointer", color:"#fff", fontSize:"min(2.2vw,20px)",
            display:"flex", alignItems:"center", justifyContent:"center",
            backdropFilter:"blur(10px)",
          }}>
            ✕
          </button>
        </>
      )}
    </div>
  );
}