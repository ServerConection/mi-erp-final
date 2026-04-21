// src/pages/TVMode.jsx
// Ruta: /tv — sin login, pantalla completa, siempre escuchando Socket.io

import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

const API = import.meta.env.VITE_API_URL;

// ─────────────────────────────────────────────────────────────────────────────
// PARTÍCULAS DE EFECTOS
// ─────────────────────────────────────────────────────────────────────────────
const CONFETTI_COLORS = ["#fbbf24","#10b981","#f97316","#f472b6","#60a5fa","#a78bfa","#34d399"];
const FIRE_COLORS     = ["#ff4500","#ff6200","#ff8c00","#ffaa00","#ffcc00"];

function Particulas({ efecto }) {
  const pieces = Array.from({ length: efecto === "fuego" ? 30 : 60 }, (_, i) => i);

  if (efecto === "ninguno" || !efecto) return null;

  const getStyle = (i) => {
    const base = {
      position: "absolute",
      pointerEvents: "none",
      zIndex: 10,
    };
    if (efecto === "confeti") return {
      ...base,
      left: `${Math.random() * 100}%`,
      top: "-20px",
      width: `${6 + Math.random() * 8}px`,
      height: `${10 + Math.random() * 10}px`,
      background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      borderRadius: i % 3 === 0 ? "50%" : "2px",
      animation: `confettiFall ${1.5 + Math.random() * 2}s ${Math.random() * 0.8}s ease-in forwards`,
    };
    if (efecto === "fuego") return {
      ...base,
      left: `${10 + Math.random() * 80}%`,
      bottom: "0px",
      width: `${8 + Math.random() * 16}px`,
      height: `${20 + Math.random() * 40}px`,
      background: FIRE_COLORS[i % FIRE_COLORS.length],
      borderRadius: "50% 50% 30% 30%",
      opacity: 0.7 + Math.random() * 0.3,
      animation: `fireRise ${0.8 + Math.random() * 1.2}s ${Math.random() * 0.5}s ease-out infinite`,
    };
    if (efecto === "nieve") return {
      ...base,
      left: `${Math.random() * 100}%`,
      top: "-10px",
      width: `${4 + Math.random() * 8}px`,
      height: `${4 + Math.random() * 8}px`,
      background: "#fff",
      borderRadius: "50%",
      opacity: 0.6 + Math.random() * 0.4,
      animation: `snowFall ${3 + Math.random() * 4}s ${Math.random() * 2}s linear infinite`,
    };
    if (efecto === "estrellas") return {
      ...base,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      width: `${4 + Math.random() * 8}px`,
      height: `${4 + Math.random() * 8}px`,
      background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      borderRadius: "50%",
      animation: `starTwinkle ${1 + Math.random() * 2}s ${Math.random() * 2}s ease-in-out infinite`,
    };
    if (efecto === "alertaroja") return {
      ...base,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      width: "100%",
      height: "100%",
      background: "rgba(239,68,68,0.15)",
      animation: `alertFlash 0.5s ${i * 0.1}s ease-in-out infinite`,
    };
    return base;
  };

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 10 }}>
      {pieces.map(i => <div key={i} style={getStyle(i)} />)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SONIDOS
// ─────────────────────────────────────────────────────────────────────────────
const playSound = (tipo) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const sounds = {
      chime: [
        { freq: 523.25, t: 0, dur: 0.2 },
        { freq: 659.25, t: 0.15, dur: 0.2 },
        { freq: 783.99, t: 0.3, dur: 0.3 },
      ],
      alerta: [
        { freq: 880, t: 0, dur: 0.15 },
        { freq: 0,   t: 0.2, dur: 0.05 },
        { freq: 880, t: 0.25, dur: 0.15 },
        { freq: 0,   t: 0.4, dur: 0.05 },
        { freq: 1100, t: 0.45, dur: 0.3 },
      ],
      victoria: [
        { freq: 523.25, t: 0,    dur: 0.15 },
        { freq: 659.25, t: 0.1,  dur: 0.15 },
        { freq: 783.99, t: 0.2,  dur: 0.15 },
        { freq: 1046.5, t: 0.3,  dur: 0.4  },
      ],
      error: [
        { freq: 440, t: 0,   dur: 0.2 },
        { freq: 330, t: 0.2, dur: 0.3 },
      ],
    };
    (sounds[tipo] || sounds.chime).forEach(({ freq, t, dur }) => {
      if (!freq) return;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = tipo === "victoria" ? "triangle" : "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + t);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + dur);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + dur + 0.05);
    });
  } catch (_) {}
};

// ─────────────────────────────────────────────────────────────────────────────
// RENDER DE DATOS VIVOS
// ─────────────────────────────────────────────────────────────────────────────
function DatosVivos({ tipo, datos, colorTexto }) {
  if (!datos) return null;

  const style = { color: colorTexto, opacity: .9 };

  if (tipo === "top_asesores" && Array.isArray(datos)) return (
    <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
      <div style={{ fontSize: 12, fontWeight: 800, ...style, opacity: .6,
        textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 4 }}>
        🏆 Top Asesores del Día
      </div>
      {datos.slice(0, 5).map((a, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12,
          background: "rgba(255,255,255,.1)", borderRadius: 10,
          padding: "8px 20px", minWidth: 280 }}>
          <span style={{ fontSize: 20, fontWeight: 900, ...style }}>{["🥇","🥈","🥉","4️⃣","5️⃣"][i]}</span>
          <span style={{ fontSize: 16, fontWeight: 800, flex: 1, ...style }}>{a.nombre}</span>
          <span style={{ fontSize: 20, fontWeight: 900, color: "#fbbf24" }}>{a.ingresos}</span>
        </div>
      ))}
    </div>
  );

  if (tipo === "top_activas" && Array.isArray(datos)) return (
    <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
      <div style={{ fontSize: 12, fontWeight: 800, ...style, opacity: .6,
        textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 4 }}>
        ✅ Top Activas del Mes
      </div>
      {datos.slice(0, 5).map((a, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12,
          background: "rgba(255,255,255,.1)", borderRadius: 10, padding: "8px 20px", minWidth: 280 }}>
          <span style={{ fontSize: 16, fontWeight: 900, ...style }}>{i + 1}.</span>
          <span style={{ fontSize: 16, fontWeight: 800, flex: 1, ...style }}>{a.nombre}</span>
          <span style={{ fontSize: 20, fontWeight: 900, color: "#34d399" }}>{a.activas}</span>
        </div>
      ))}
    </div>
  );

  if (tipo === "sin_ventas" && Array.isArray(datos)) return (
    <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
      <div style={{ fontSize: 12, fontWeight: 800, ...style, opacity: .6,
        textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 4 }}>
        📉 Sin ventas hoy ({datos.length})
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 600 }}>
        {datos.slice(0, 10).map((nombre, i) => (
          <span key={i} style={{ background: "rgba(239,68,68,.25)", borderRadius: 20,
            padding: "4px 12px", fontSize: 13, fontWeight: 700, ...style }}>
            {nombre}
          </span>
        ))}
      </div>
    </div>
  );

  if (tipo === "gestion_diaria" && Array.isArray(datos)) return (
    <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
      <div style={{ fontSize: 12, fontWeight: 800, ...style, opacity: .6,
        textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 4 }}>
        ⚠️ Gestión Diaria pendiente
      </div>
      {datos.slice(0, 5).map((a, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12,
          background: "rgba(251,191,36,.15)", borderRadius: 10, padding: "6px 16px" }}>
          <span style={{ fontSize: 14, fontWeight: 700, ...style }}>{a.nombre}</span>
          <span style={{ fontSize: 16, fontWeight: 900, color: "#fbbf24" }}>{a.cantidad} leads</span>
        </div>
      ))}
    </div>
  );

  if (tipo === "resumen_dia" && datos && !Array.isArray(datos)) return (
    <div style={{ marginTop: 20, display: "flex", gap: 32, justifyContent: "center" }}>
      {[
        { label: "Ingresos Jot", val: datos.ingresos_hoy, color: "#34d399" },
        { label: "Activas hoy",  val: datos.activas_hoy,  color: "#60a5fa" },
        { label: "Gest. Diaria", val: datos.gestion_diaria, color: "#fbbf24" },
      ].map(({ label, val, color }) => (
        <div key={label} style={{ textAlign: "center",
          background: "rgba(255,255,255,.1)", borderRadius: 14, padding: "16px 24px" }}>
          <div style={{ fontSize: 48, fontWeight: 900, color, lineHeight: 1 }}>{val ?? 0}</div>
          <div style={{ fontSize: 11, fontWeight: 700, ...style, opacity: .7,
            textTransform: "uppercase", letterSpacing: ".1em", marginTop: 4 }}>{label}</div>
        </div>
      ))}
    </div>
  );

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL TV MODE
// ─────────────────────────────────────────────────────────────────────────────
export default function TVMode() {
  const [mensaje, setMensaje]   = useState(null);
  const [visible, setVisible]   = useState(false);
  const [progreso, setProgreso] = useState(100);
  const timerRef                = useRef(null);
  const intervalRef             = useRef(null);
  const socketRef               = useRef(null);

  useEffect(() => {
    // 🔐 Conectar Socket.io con autenticación JWT
    socketRef.current = io(API, {
      auth: { token: localStorage.getItem('token') },  // ← JWT token requerido
      transports: ["websocket"]
    });
    socketRef.current.on("broadcast_mensaje", (data) => {
      mostrarMensaje(data);
    });
    return () => socketRef.current?.disconnect();
  }, []);

  const mostrarMensaje = (data) => {
    // Limpiar timers anteriores
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);

    setMensaje(data);
    setVisible(true);
    setProgreso(100);
    if (data.sonido && data.sonido !== "ninguno") playSound(data.sonido);

    const duracion = (parseInt(data.duracion) || 30) * 1000;
    const paso = 100 / (duracion / 100);

    intervalRef.current = setInterval(() => {
      setProgreso(p => Math.max(0, p - paso));
    }, 100);

    timerRef.current = setTimeout(() => {
      setVisible(false);
      clearInterval(intervalRef.current);
    }, duracion);
  };

  const cerrar = () => {
    setVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const TIPO_ICONOS = {
    urgente:       "🚨",
    prevencion:    "⚠️",
    logro:         "🏆",
    info:          "📢",
    personalizado: "✨",
  };

  return (
    <div style={{
      width: "100vw", height: "100vh",
      background: visible && mensaje ? mensaje.color_fondo || "#0f172a" : "#0f172a",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", position: "relative",
      transition: "background 0.5s ease",
    }}>

      {/* CSS animations */}
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-10px) rotate(0deg); opacity:1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity:0; }
        }
        @keyframes fireRise {
          0%   { transform: translateY(0) scaleX(1); opacity:.8; }
          50%  { transform: translateY(-40px) scaleX(1.3); opacity:.6; }
          100% { transform: translateY(-80px) scaleX(.8); opacity:0; }
        }
        @keyframes snowFall {
          0%   { transform: translateY(-10px) rotate(0deg); opacity:.8; }
          100% { transform: translateY(110vh) rotate(360deg); opacity:.2; }
        }
        @keyframes starTwinkle {
          0%,100% { transform: scale(1); opacity:.8; }
          50%     { transform: scale(2); opacity:1; }
        }
        @keyframes alertFlash {
          0%,100% { opacity:.05; }
          50%     { opacity:.3; }
        }
        @keyframes msgIn {
          0%   { opacity:0; transform: scale(.85) translateY(40px); }
          100% { opacity:1; transform: scale(1) translateY(0); }
        }
        @keyframes msgOut {
          0%   { opacity:1; transform: scale(1); }
          100% { opacity:0; transform: scale(.95) translateY(-20px); }
        }
        @keyframes pulse {
          0%,100% { opacity:1; }
          50%     { opacity:.5; }
        }
      `}</style>

      {/* Estado en espera */}
      {!visible && (
        <div style={{ textAlign: "center", opacity: .2 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>📺</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#fff",
            textTransform: "uppercase", letterSpacing: ".2em" }}>
            MODO TV — EN ESPERA
          </div>
          <div style={{ fontSize: 11, color: "#fff", marginTop: 8, opacity: .6 }}>
            Los mensajes aparecerán aquí automáticamente
          </div>
        </div>
      )}

      {/* Mensaje activo */}
      {visible && mensaje && (
        <>
          {/* Efectos de partículas */}
          <Particulas efecto={mensaje.efecto} />

          {/* Imagen de fondo */}
          {mensaje.imagen_url && (
            <img src={`${API}${mensaje.imagen_url}`} alt=""
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "cover", opacity: .25, zIndex: 0 }} />
          )}

          {/* Overlay de alerta roja */}
          {mensaje.efecto === "alertaroja" && (
            <div style={{ position: "absolute", inset: 0, border: "12px solid #ef4444",
              zIndex: 5, pointerEvents: "none", animation: "alertFlash .5s ease-in-out infinite" }} />
          )}

          {/* Contenido principal */}
          <div style={{
            position: "relative", zIndex: 20,
            textAlign: "center", maxWidth: "80vw",
            animation: "msgIn .5s cubic-bezier(.34,1.56,.64,1) forwards",
          }}>
            {/* Icono tipo */}
            <div style={{ fontSize: "min(10vw, 80px)", marginBottom: "2vh",
              animation: "pulse 2s ease-in-out infinite" }}>
              {TIPO_ICONOS[mensaje.tipo] || "📢"}
            </div>

            {/* Título */}
            <div style={{
              fontSize: "min(6vw, 64px)", fontWeight: 900,
              color: mensaje.color_texto || "#fff",
              textTransform: "uppercase", letterSpacing: ".04em",
              lineHeight: 1.05, marginBottom: "2vh",
              textShadow: "0 4px 20px rgba(0,0,0,.4)",
              wordBreak: "break-word",
            }}>
              {mensaje.titulo}
            </div>

            {/* Mensaje */}
            {mensaje.mensaje && (
              <div style={{
                fontSize: "min(2.8vw, 28px)", fontWeight: 600,
                color: mensaje.color_texto || "#fff", opacity: .9,
                lineHeight: 1.5, maxWidth: "60vw", margin: "0 auto 2vh",
                wordBreak: "break-word",
              }}>
                {mensaje.mensaje}
              </div>
            )}

            {/* Datos en vivo */}
            <DatosVivos
              tipo={mensaje.datos_vivos}
              datos={mensaje.datosVivos}
              colorTexto={mensaje.color_texto || "#fff"}
            />
          </div>

          {/* Barra de progreso */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
            height: 6, background: "rgba(255,255,255,.15)", zIndex: 30 }}>
            <div style={{
              height: "100%", width: `${progreso}%`,
              background: mensaje.color_texto || "#fff",
              transition: "width .1s linear",
            }} />
          </div>

          {/* Botón cerrar */}
          <button onClick={cerrar}
            style={{
              position: "absolute", top: 20, right: 20, zIndex: 40,
              background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)",
              borderRadius: "50%", width: 44, height: 44, cursor: "pointer",
              color: "#fff", fontSize: 18, display: "flex",
              alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(8px)",
            }}>
            ✕
          </button>

          {/* Tiempo restante */}
          <div style={{ position: "absolute", bottom: 16, right: 20, zIndex: 30,
            fontSize: 11, color: mensaje.color_texto || "#fff", opacity: .5,
            fontWeight: 700, letterSpacing: ".1em" }}>
            {Math.ceil(progreso * parseInt(mensaje.duracion || 30) / 100)}s
          </div>
        </>
      )}
    </div>
  );
}