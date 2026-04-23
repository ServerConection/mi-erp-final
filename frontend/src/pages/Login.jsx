import { useState } from "react";
import { useNavigate } from "react-router-dom";

const API = "https://erp-backend-v1-qhk2.onrender.com";

/* ─────────────────────────────────────────────────────────────────────────────
   Robot / Satélite SVG animado — tema telecomunicaciones
   Animaciones puras con CSS keyframes (sin dependencias externas)
───────────────────────────────────────────────────────────────────────────── */
function TelecomRobot() {
  return (
    <>
      <style>{`
        /* ── Flotación principal ── */
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(-1deg); }
          50%       { transform: translateY(-18px) rotate(1deg); }
        }
        /* ── Pulso de señal / ondas WiFi ── */
        @keyframes signalPulse {
          0%   { opacity: 0.9; transform: scale(1); }
          50%  { opacity: 0.4; transform: scale(1.15); }
          100% { opacity: 0.9; transform: scale(1); }
        }
        /* ── Ondas de radio expansivas ── */
        @keyframes waveExpand {
          0%   { r: 4;  opacity: 0.9; }
          100% { r: 48; opacity: 0; }
        }
        /* ── Órbita de partículas ── */
        @keyframes orbit {
          from { transform: rotate(0deg)   translateX(56px) rotate(0deg); }
          to   { transform: rotate(360deg) translateX(56px) rotate(-360deg); }
        }
        @keyframes orbit2 {
          from { transform: rotate(120deg)  translateX(72px) rotate(-120deg); }
          to   { transform: rotate(480deg)  translateX(72px) rotate(-480deg); }
        }
        @keyframes orbit3 {
          from { transform: rotate(240deg)  translateX(64px) rotate(-240deg); }
          to   { transform: rotate(600deg)  translateX(64px) rotate(-600deg); }
        }
        /* ── Parpadeo de ojos ── */
        @keyframes blink {
          0%, 90%, 100% { ry: 6; }
          95%            { ry: 1; }
        }
        /* ── Rotación antena ── */
        @keyframes antennaGlow {
          0%, 100% { filter: drop-shadow(0 0 4px #22d3ee); }
          50%       { filter: drop-shadow(0 0 12px #06b6d4) drop-shadow(0 0 24px #0891b2); }
        }
        /* ── Glow del robot ── */
        @keyframes robotGlow {
          0%, 100% { filter: drop-shadow(0 0 8px #0891b2) drop-shadow(0 0 16px #0e7490); }
          50%       { filter: drop-shadow(0 0 20px #22d3ee) drop-shadow(0 0 40px #0891b2); }
        }
        /* ── Rotación plato satélite ── */
        @keyframes dishSpin {
          0%   { transform: rotate(-15deg); }
          50%  { transform: rotate(15deg); }
          100% { transform: rotate(-15deg); }
        }
        /* ── Señal desde plato ── */
        @keyframes dishSignal {
          0%   { opacity: 0; transform: scale(0.5); }
          40%  { opacity: 1; }
          100% { opacity: 0; transform: scale(1.6); }
        }
        /* ── Bounce suave del tagline ── */
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        /* ── Scanline en el cuerpo ── */
        @keyframes scanline {
          0%   { transform: translateY(-60px); opacity: 0.6; }
          100% { transform: translateY(60px);  opacity: 0; }
        }
        /* ── Pulso del dot de estado ── */
        @keyframes statusDot {
          0%, 100% { opacity: 1; r: 4; }
          50%       { opacity: 0.3; r: 2; }
        }

        .robot-group  { animation: float 4s ease-in-out infinite, robotGlow 3s ease-in-out infinite; }
        .robot-eye    { animation: blink 5s ease-in-out infinite; }
        .antenna-tip  { animation: antennaGlow 2s ease-in-out infinite; }
        .wave1        { animation: waveExpand 2s ease-out infinite; }
        .wave2        { animation: waveExpand 2s ease-out infinite 0.65s; }
        .wave3        { animation: waveExpand 2s ease-out infinite 1.3s; }
        .orbit-dot1   { animation: orbit  6s linear infinite; }
        .orbit-dot2   { animation: orbit2 9s linear infinite; }
        .orbit-dot3   { animation: orbit3 7.5s linear infinite; }
        .dish-group   { animation: dishSpin 4s ease-in-out infinite; transform-origin: 8px 0px; }
        .dish-signal  { animation: dishSignal 2s ease-out infinite; }
        .scanline     { animation: scanline 2.4s linear infinite; }
        .status-dot   { animation: statusDot 1.5s ease-in-out infinite; }
      `}</style>

      <svg
        viewBox="0 0 260 320"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full max-w-[320px] mx-auto select-none"
        aria-label="Robot telecomunicaciones animado"
      >
        {/* ── Definiciones: gradientes y filtros ── */}
        <defs>
          <radialGradient id="bodyGrad" cx="50%" cy="40%" r="60%">
            <stop offset="0%"   stopColor="#164e63" />
            <stop offset="100%" stopColor="#0c2340" />
          </radialGradient>
          <radialGradient id="headGrad" cx="50%" cy="35%" r="60%">
            <stop offset="0%"   stopColor="#1e3a5f" />
            <stop offset="100%" stopColor="#0a1f3a" />
          </radialGradient>
          <radialGradient id="eyeGrad" cx="40%" cy="35%" r="60%">
            <stop offset="0%"   stopColor="#67e8f9" />
            <stop offset="100%" stopColor="#0891b2" />
          </radialGradient>
          <radialGradient id="glowOrb" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#22d3ee" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="dishGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>
          <filter id="softGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <clipPath id="bodyClip">
            <rect x="80" y="155" width="100" height="90" rx="14" />
          </clipPath>
        </defs>

        {/* ── Halo de fondo ── */}
        <ellipse cx="130" cy="285" rx="70" ry="12" fill="#0891b2" opacity="0.18" />
        <circle cx="130" cy="195" r="95" fill="url(#glowOrb)" />

        {/* ── Grupo principal flotante ── */}
        <g className="robot-group" style={{ transformOrigin: "130px 210px" }}>

          {/* ── Partículas en órbita ── */}
          <g style={{ transformOrigin: "130px 200px" }}>
            <circle className="orbit-dot1" cx="130" cy="200" r="4" fill="#22d3ee" opacity="0.8" />
          </g>
          <g style={{ transformOrigin: "130px 200px" }}>
            <circle className="orbit-dot2" cx="130" cy="200" r="3" fill="#818cf8" opacity="0.7" />
          </g>
          <g style={{ transformOrigin: "130px 200px" }}>
            <circle className="orbit-dot3" cx="130" cy="200" r="3.5" fill="#34d399" opacity="0.6" />
          </g>

          {/* ── Antena principal ── */}
          <line x1="130" y1="100" x2="130" y2="75" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" />
          <circle className="antenna-tip" cx="130" cy="70" r="7" fill="#22d3ee" filter="url(#softGlow)" />
          {/* Ondas de radio desde antena */}
          <g transform="translate(130, 70)">
            <circle className="wave1" cx="0" cy="0" r="4" fill="none" stroke="#22d3ee" strokeWidth="1.5" opacity="0.9" />
            <circle className="wave2" cx="0" cy="0" r="4" fill="none" stroke="#22d3ee" strokeWidth="1.5" opacity="0.9" />
            <circle className="wave3" cx="0" cy="0" r="4" fill="none" stroke="#22d3ee" strokeWidth="1.5" opacity="0.9" />
          </g>

          {/* ── Antenas laterales pequeñas ── */}
          <line x1="97"  y1="100" x2="88"  y2="84" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
          <circle cx="86" cy="81" r="4" fill="#818cf8" opacity="0.85" />
          <line x1="163" y1="100" x2="172" y2="84" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
          <circle cx="174" cy="81" r="4" fill="#34d399" opacity="0.85" />

          {/* ── Cabeza ── */}
          <rect x="88" y="100" width="84" height="70" rx="16" fill="url(#headGrad)" stroke="#1e4a6e" strokeWidth="1.5" />
          {/* Visera / visor */}
          <rect x="96" y="112" width="68" height="38" rx="10" fill="#020c1b" stroke="#0e4d6e" strokeWidth="1" opacity="0.9" />
          {/* Ojos */}
          <ellipse className="robot-eye" cx="116" cy="131" rx="10" ry="6" fill="url(#eyeGrad)" filter="url(#softGlow)" />
          <ellipse className="robot-eye" cx="144" cy="131" rx="10" ry="6" fill="url(#eyeGrad)" filter="url(#softGlow)" style={{ animationDelay: "0.3s" }} />
          {/* Pupila */}
          <circle cx="116" cy="131" r="3" fill="#0a0a1a" />
          <circle cx="144" cy="131" r="3" fill="#0a0a1a" />
          {/* Reflejo en ojos */}
          <circle cx="119" cy="128" r="1.5" fill="white" opacity="0.7" />
          <circle cx="147" cy="128" r="1.5" fill="white" opacity="0.7" />
          {/* Boca / indicador LED */}
          <rect x="108" y="144" width="44" height="5" rx="2.5" fill="#0e7490" opacity="0.5" />
          <rect x="108" y="144" width="22" height="5" rx="2.5" fill="#22d3ee" opacity="0.85" style={{ animation: "signalPulse 1.8s ease-in-out infinite" }} />

          {/* ── Cuello ── */}
          <rect x="118" y="170" width="24" height="10" rx="4" fill="#1e3a5f" stroke="#1e4a6e" strokeWidth="1" />

          {/* ── Cuerpo ── */}
          <rect x="80" y="180" width="100" height="90" rx="16" fill="url(#bodyGrad)" stroke="#1e4a6e" strokeWidth="1.5" />
          {/* Línea de escaneo sobre el cuerpo */}
          <rect x="80" y="180" width="100" height="3" rx="1.5" fill="#22d3ee" opacity="0.5" className="scanline" clipPath="url(#bodyClip)" />
          {/* Panel de control */}
          <rect x="96" y="195" width="68" height="50" rx="8" fill="#020c1b" stroke="#0e4d6e" strokeWidth="1" opacity="0.8" />
          {/* Indicadores del panel */}
          <circle className="status-dot" cx="108" cy="207" r="4" fill="#22d3ee" />
          <circle cx="122" cy="207" r="4" fill="#34d399" opacity="0.6" style={{ animation: "statusDot 2s ease-in-out infinite 0.5s" }} />
          <circle cx="136" cy="207" r="4" fill="#818cf8" opacity="0.6" style={{ animation: "statusDot 2.4s ease-in-out infinite 1s" }} />
          {/* Barras de señal WiFi en panel */}
          <rect x="104" y="220" width="6"  height="14" rx="2" fill="#22d3ee" opacity="0.3" />
          <rect x="114" y="216" width="6"  height="18" rx="2" fill="#22d3ee" opacity="0.5" />
          <rect x="124" y="213" width="6"  height="21" rx="2" fill="#22d3ee" opacity="0.7" />
          <rect x="134" y="210" width="6"  height="24" rx="2" fill="#22d3ee" opacity="0.9" />
          {/* Etiqueta WiFi */}
          <text x="130" y="254" textAnchor="middle" fill="#67e8f9" fontSize="7" fontFamily="monospace" opacity="0.7">4G • 5G • FIBER</text>

          {/* ── Brazo izquierdo ── */}
          <rect x="56" y="185" width="22" height="50" rx="10" fill="url(#bodyGrad)" stroke="#1e4a6e" strokeWidth="1.5" />
          {/* Mano izq */}
          <rect x="52" y="232" width="28" height="18" rx="8" fill="#1e3a5f" stroke="#1e4a6e" strokeWidth="1" />

          {/* ── Brazo derecho con plato satelital ── */}
          <rect x="182" y="185" width="22" height="50" rx="10" fill="url(#bodyGrad)" stroke="#1e4a6e" strokeWidth="1.5" />
          {/* Plato satélite en mano derecha */}
          <g transform="translate(203, 228)" className="dish-group">
            {/* Soporte del plato */}
            <line x1="8" y1="0" x2="8" y2="12" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
            {/* Plato elíptico */}
            <ellipse cx="8" cy="8" rx="18" ry="10" fill="url(#dishGrad)" stroke="#94a3b8" strokeWidth="1" transform="rotate(-30, 8, 8)" />
            <ellipse cx="8" cy="8" rx="12" ry="6.5" fill="none" stroke="#cbd5e1" strokeWidth="0.5" opacity="0.5" transform="rotate(-30, 8, 8)" />
            {/* Centro del plato */}
            <circle cx="8" cy="8" r="2.5" fill="#e2e8f0" />
            {/* Señal emitida por plato */}
            <ellipse className="dish-signal" cx="8" cy="-4" rx="8" ry="4" fill="none" stroke="#22d3ee" strokeWidth="1.5" style={{ animationDelay: "0s" }} />
            <ellipse className="dish-signal" cx="8" cy="-4" rx="8" ry="4" fill="none" stroke="#22d3ee" strokeWidth="1.5" style={{ animationDelay: "0.7s" }} />
          </g>

          {/* ── Piernas ── */}
          <rect x="97"  y="268" width="28" height="36" rx="10" fill="url(#bodyGrad)" stroke="#1e4a6e" strokeWidth="1.5" />
          <rect x="135" y="268" width="28" height="36" rx="10" fill="url(#bodyGrad)" stroke="#1e4a6e" strokeWidth="1.5" />
          {/* Pies */}
          <rect x="92"  y="298" width="36" height="14" rx="7" fill="#1e3a5f" stroke="#1e4a6e" strokeWidth="1" />
          <rect x="132" y="298" width="36" height="14" rx="7" fill="#1e3a5f" stroke="#1e4a6e" strokeWidth="1" />
          {/* Luz en pies */}
          <circle cx="100" cy="305" r="3" fill="#22d3ee" opacity="0.5" style={{ animation: "statusDot 2s ease-in-out infinite" }} />
          <circle cx="160" cy="305" r="3" fill="#22d3ee" opacity="0.5" style={{ animation: "statusDot 2s ease-in-out infinite 1s" }} />
        </g>

        {/* ── Sombra proyectada en el suelo ── */}
        <ellipse cx="130" cy="316" rx="55" ry="7" fill="#0891b2" opacity="0.12" style={{ animation: "signalPulse 4s ease-in-out infinite" }} />
      </svg>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Componente principal Login
───────────────────────────────────────────────────────────────────────────── */
export default function Login() {
  const navigate = useNavigate();

  const [paso, setPaso] = useState(1);
  const [formData, setFormData] = useState({ usuario: "", contraseña: "" });
  const [otp, setOtp] = useState("");
  const [usuarioId, setUsuarioId] = useState(null);
  const [usuarioLogin, setUsuarioLogin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // ─── PASO 1: Login → solicitar OTP ─────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const body = {
        usuario: formData.usuario,
        password: formData.contraseña,
      };

      const res = await fetch(`${API}/api/otp/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!data.success) {
        setError("Credenciales inválidas.");
        return;
      }

      setUsuarioId(data.usuario_id);
      setUsuarioLogin(data.usuario || formData.usuario);
      setPaso(2);
    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  // ─── PASO 2: Verificar OTP ──────────────────────────────────────────────────
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API}/api/otp/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usuario_id: usuarioId,
          usuario: usuarioLogin,
          otp: otp.trim(),
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Código incorrecto o expirado.");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("userProfile", JSON.stringify(data.user));
      navigate("/");
    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* ── Estilos globales de la página ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        .login-page {
          font-family: 'Inter', system-ui, sans-serif;
          min-height: 100vh;
          display: flex;
          background: linear-gradient(135deg, #020c1b 0%, #0a1628 40%, #0c2340 70%, #071524 100%);
          overflow: hidden;
          position: relative;
        }

        /* Estrellas / partículas de fondo */
        .login-page::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(1px 1px at 15%  20%, rgba(34,211,238,0.5) 0%, transparent 100%),
            radial-gradient(1px 1px at 75%  10%, rgba(129,140,248,0.5) 0%, transparent 100%),
            radial-gradient(1px 1px at 45%  80%, rgba(52,211,153,0.4) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 85% 55%, rgba(34,211,238,0.4) 0%, transparent 100%),
            radial-gradient(1px 1px at 30%  45%, rgba(255,255,255,0.25) 0%, transparent 100%),
            radial-gradient(1px 1px at 62%  30%, rgba(255,255,255,0.2) 0%, transparent 100%),
            radial-gradient(1px 1px at 8%   65%, rgba(34,211,238,0.3) 0%, transparent 100%),
            radial-gradient(1px 1px at 90%  85%, rgba(129,140,248,0.3) 0%, transparent 100%);
          pointer-events: none;
          z-index: 0;
        }

        /* Rejilla sutil de fondo */
        .login-page::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(34,211,238,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34,211,238,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
          pointer-events: none;
          z-index: 0;
        }

        /* ── Panel derecho ── */
        .right-panel {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2rem;
          padding: 3rem 2rem;
          background: linear-gradient(135deg, rgba(8,145,178,0.06) 0%, rgba(15,23,42,0.3) 100%);
          border-left: 1px solid rgba(34,211,238,0.08);
        }

        /* ── Panel izquierdo ── */
        .left-panel {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 3rem 2rem;
        }

        /* ── Glassmorphism card ── */
        .glass-card {
          background: rgba(2, 15, 35, 0.65);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(34, 211, 238, 0.15);
          border-radius: 24px;
          box-shadow:
            0 0 0 1px rgba(34,211,238,0.05),
            0 20px 60px rgba(0,0,0,0.5),
            inset 0 1px 0 rgba(255,255,255,0.05);
          width: 100%;
          max-width: 420px;
          padding: 2.5rem;
        }

        /* ── Input ── */
        .erp-input {
          width: 100%;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(34, 211, 238, 0.2);
          border-radius: 12px;
          padding: 0.875rem 1.25rem;
          color: white;
          font-size: 0.95rem;
          outline: none;
          transition: all 0.25s ease;
          box-sizing: border-box;
          font-family: inherit;
        }
        .erp-input::placeholder { color: rgba(148,163,184,0.5); }
        .erp-input:focus {
          border-color: rgba(34,211,238,0.6);
          box-shadow: 0 0 0 3px rgba(34,211,238,0.1), 0 0 20px rgba(34,211,238,0.08);
          background: rgba(8,145,178,0.08);
        }

        /* ── Botón primario ── */
        .erp-btn-primary {
          width: 100%;
          padding: 0.9rem 1.5rem;
          border-radius: 12px;
          border: 1px solid rgba(34,211,238,0.25);
          background: linear-gradient(135deg, #0369a1 0%, #0e7490 50%, #155e75 100%);
          color: white;
          font-weight: 700;
          font-size: 0.95rem;
          letter-spacing: 0.03em;
          cursor: pointer;
          transition: all 0.25s ease;
          font-family: inherit;
          box-shadow: 0 4px 20px rgba(8,145,178,0.3);
          position: relative;
          overflow: hidden;
        }
        .erp-btn-primary::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(34,211,238,0.15) 0%, transparent 60%);
          opacity: 0;
          transition: opacity 0.25s;
        }
        .erp-btn-primary:hover:not(:disabled)::before { opacity: 1; }
        .erp-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 30px rgba(8,145,178,0.45);
        }
        .erp-btn-primary:active:not(:disabled) { transform: translateY(0); }
        .erp-btn-primary:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        /* ── Botón texto ── */
        .erp-btn-text {
          background: none;
          border: none;
          color: rgba(148,163,184,0.7);
          font-size: 0.875rem;
          cursor: pointer;
          transition: color 0.2s;
          font-family: inherit;
          padding: 0.5rem;
        }
        .erp-btn-text:hover { color: rgba(34,211,238,0.9); }

        /* ── Label ── */
        .erp-label {
          display: block;
          font-size: 0.72rem;
          font-weight: 600;
          color: rgba(103,232,249,0.8);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 0.5rem;
        }

        /* ── Error ── */
        .erp-error {
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 10px;
          padding: 0.75rem 1rem;
          color: #fca5a5;
          font-size: 0.85rem;
          text-align: center;
          margin-bottom: 1.25rem;
        }

        /* ── OTP input especial ── */
        .otp-input {
          text-align: center;
          font-size: 1.75rem;
          letter-spacing: 0.5em;
          font-weight: 700;
        }

        /* ── Tagline animado ── */
        .tagline-anim {
          animation: fadeSlideUp 0.8s ease both;
        }
        .tagline-anim-2 { animation: fadeSlideUp 0.8s ease 0.2s both; }
        .tagline-anim-3 { animation: fadeSlideUp 0.8s ease 0.4s both; }

        /* ── Barra decorativa de color ── */
        .color-bar {
          width: 48px;
          height: 3px;
          border-radius: 99px;
          background: linear-gradient(90deg, #22d3ee, #818cf8);
          margin: 0.75rem auto 1.25rem;
        }

        /* ── Chips de features ── */
        .feature-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(34,211,238,0.07);
          border: 1px solid rgba(34,211,238,0.18);
          border-radius: 999px;
          padding: 0.35rem 0.85rem;
          font-size: 0.75rem;
          color: rgba(103,232,249,0.85);
          font-weight: 500;
        }

        /* ── Step indicator ── */
        .step-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          transition: all 0.3s;
        }

        @media (max-width: 768px) {
          .login-page { flex-direction: column; }
          .right-panel { display: none; }
          .left-panel { padding: 2rem 1.25rem; }
        }
      `}</style>

      <div className="login-page">

        {/* ════════════════════════════════════════
            MITAD IZQUIERDA — Formulario
        ════════════════════════════════════════ */}
        <div className="left-panel" style={{ flex: "0 0 45%", minWidth: 0 }}>
          <div className="glass-card">

            {/* ── Logo / Marca ── */}
            <div style={{ textAlign: "center", marginBottom: "2rem" }}>
              {/* Ícono SVG simple */}
              <div style={{
                width: 52, height: 52,
                margin: "0 auto 1rem",
                borderRadius: 14,
                background: "linear-gradient(135deg, #0369a1, #0e7490)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 24px rgba(8,145,178,0.4)",
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="rgba(34,211,238,0.2)" stroke="#22d3ee" strokeWidth="1.5"/>
                  <path d="M8.56 8.56C9.55 7.57 10.72 7 12 7s2.45.57 3.44 1.56" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M5.64 5.64C7.46 3.82 9.61 3 12 3s4.54.82 6.36 2.64" stroke="#67e8f9" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
                  <circle cx="12" cy="12" r="2.5" fill="#22d3ee"/>
                  <line x1="12" y1="14.5" x2="12" y2="19" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="9" y1="19" x2="15" y2="19" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>

              <h1 style={{
                fontSize: "1.6rem", fontWeight: 800,
                color: "white", letterSpacing: "0.04em",
                margin: 0,
              }}>
                MI <span style={{ color: "#22d3ee" }}>ERP</span>
              </h1>
              <p style={{ color: "rgba(103,232,249,0.7)", fontSize: "0.8rem", marginTop: "0.3rem", fontWeight: 400 }}>
                {paso === 1 ? "Acceso Corporativo Seguro" : "Verificación de Identidad"}
              </p>

              {/* Step dots */}
              <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: "0.75rem" }}>
                <div className="step-dot" style={{
                  background: paso >= 1 ? "#22d3ee" : "rgba(34,211,238,0.2)",
                  boxShadow: paso === 1 ? "0 0 8px #22d3ee" : "none",
                }} />
                <div className="step-dot" style={{
                  background: paso >= 2 ? "#22d3ee" : "rgba(34,211,238,0.2)",
                  boxShadow: paso === 2 ? "0 0 8px #22d3ee" : "none",
                }} />
              </div>
            </div>

            {/* ── Error ── */}
            {error && <div className="erp-error">{error}</div>}

            {/* ══ PASO 1: Credenciales ══ */}
            {paso === 1 && (
              <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div>
                  <label className="erp-label">Usuario</label>
                  <input
                    type="text"
                    name="usuario"
                    className="erp-input"
                    onChange={handleChange}
                    placeholder="Ej. admin"
                    autoComplete="username"
                    required
                  />
                </div>

                <div>
                  <label className="erp-label">Contraseña</label>
                  <input
                    type="password"
                    name="contraseña"
                    className="erp-input"
                    onChange={handleChange}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                </div>

                <div style={{ marginTop: "0.5rem" }}>
                  <button type="submit" className="erp-btn-primary" disabled={loading}>
                    {loading ? (
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                          style={{ animation: "spin 0.8s linear infinite" }}>
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg>
                        Verificando…
                      </span>
                    ) : "→ Ingresar al Sistema"}
                  </button>
                </div>
              </form>
            )}

            {/* ══ PASO 2: OTP ══ */}
            {paso === 2 && (
              <form onSubmit={handleVerifyOtp} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div style={{
                  textAlign: "center",
                  color: "rgba(148,163,184,0.8)",
                  fontSize: "0.85rem",
                  background: "rgba(34,211,238,0.05)",
                  border: "1px solid rgba(34,211,238,0.12)",
                  borderRadius: 10,
                  padding: "0.75rem",
                }}>
                  📧 Ingresa el código que enviamos a tu correo
                </div>

                <div>
                  <label className="erp-label">Código OTP de 6 dígitos</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    className="erp-input otp-input"
                    placeholder="000000"
                    autoComplete="one-time-code"
                    required
                  />
                </div>

                <div>
                  <button
                    type="submit"
                    className="erp-btn-primary"
                    disabled={loading || otp.length < 6}
                  >
                    {loading ? (
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                          style={{ animation: "spin 0.8s linear infinite" }}>
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg>
                        Verificando…
                      </span>
                    ) : "✓ Confirmar Código"}
                  </button>
                </div>

                <div style={{ textAlign: "center" }}>
                  <button
                    type="button"
                    className="erp-btn-text"
                    onClick={() => { setPaso(1); setError(""); setOtp(""); setUsuarioId(null); }}
                  >
                    ← Volver al inicio
                  </button>
                </div>
              </form>
            )}

            {/* ── Footer ── */}
            <div style={{
              marginTop: "1.75rem",
              paddingTop: "1.25rem",
              borderTop: "1px solid rgba(34,211,238,0.08)",
              textAlign: "center",
              color: "rgba(100,116,139,0.6)",
              fontSize: "0.72rem",
            }}>
              Sistema ERP © {new Date().getFullYear()} · Acceso restringido
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════
            MITAD DERECHA — Robot animado + Tagline
        ════════════════════════════════════════ */}
        <div className="right-panel" style={{ flex: "0 0 55%", minWidth: 0 }}>

          {/* Orbes decorativos de fondo */}
          <div style={{
            position: "absolute", top: "15%", right: "10%",
            width: 300, height: 300, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(8,145,178,0.12) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", bottom: "20%", left: "5%",
            width: 200, height: 200, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(129,140,248,0.08) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />

          {/* ── Tagline superior ── */}
          <div className="tagline-anim" style={{ textAlign: "center", zIndex: 2 }}>
            <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginBottom: "1.5rem" }}>
              <span className="feature-chip">📡 4G / 5G</span>
              <span className="feature-chip">🌐 Fibra Óptica</span>
              <span className="feature-chip">📶 WiFi Empresarial</span>
            </div>
          </div>

          {/* ── Robot SVG ── */}
          <div style={{ width: "100%", maxWidth: 340, zIndex: 2 }}>
            <TelecomRobot />
          </div>

          {/* ── Tagline inferior ── */}
          <div className="tagline-anim-2" style={{ textAlign: "center", zIndex: 2, maxWidth: 380, padding: "0 1rem" }}>
            <h2 style={{
              fontSize: "1.6rem", fontWeight: 800,
              color: "white", margin: "0 0 0.5rem",
              lineHeight: 1.2,
            }}>
              Conectando el futuro
              <br />
              <span style={{
                background: "linear-gradient(90deg, #22d3ee, #818cf8)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>
                hoy mismo
              </span>
            </h2>
            <p className="tagline-anim-3" style={{
              color: "rgba(148,163,184,0.7)",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              margin: "0.75rem 0 0",
            }}>
              Gestiona tus servicios de telecomunicaciones, ventas
              y equipo desde una sola plataforma inteligente.
            </p>

            {/* Barra separadora animada */}
            <div className="color-bar" style={{ marginTop: "1.25rem" }} />

            {/* Stats rápidas */}
            <div style={{ display: "flex", justifyContent: "center", gap: "2rem", marginTop: "0.25rem" }}>
              {[["99.9%", "Uptime"], ["24/7", "Soporte"], ["5G", "Ready"]].map(([val, lbl]) => (
                <div key={lbl} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#22d3ee" }}>{val}</div>
                  <div style={{ fontSize: "0.7rem", color: "rgba(148,163,184,0.55)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{lbl}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Keyframe global para spinner ── */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
