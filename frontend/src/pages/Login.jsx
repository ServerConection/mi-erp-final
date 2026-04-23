import { useState } from "react";
import { useNavigate } from "react-router-dom";

const API = "https://erp-backend-v1-qhk2.onrender.com";

/* ─────────────────────────────────────────────────────────────────────────────
   Personaje cartoon telecomunicaciones — tema claro azul
───────────────────────────────────────────────────────────────────────────── */
function TelecomCharacter() {
  return (
    <>
      <style>{`
        @keyframes charFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-12px); }
        }
        @keyframes streakMove {
          0%   { stroke-dashoffset: 600; opacity: 0; }
          30%  { opacity: 0.75; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
        @keyframes badgePulse {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.04); }
        }
        @keyframes eyeBlink {
          0%, 88%, 100% { transform: scaleY(1); }
          93%            { transform: scaleY(0.08); }
        }
        @keyframes wifiDot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.2; }
        }
        .char-float  { animation: charFloat 4s ease-in-out infinite; transform-origin: 200px 330px; }
        .streak      { stroke-dasharray: 600; animation: streakMove 3.5s ease-in-out infinite; }
        .streak-b    { animation-delay: 1.2s; }
        .streak-c    { animation-delay: 2.4s; }
        .badge-pulse { animation: badgePulse 2.5s ease-in-out infinite; transform-origin: 108px 482px; }
        .eye-l       { animation: eyeBlink 5s ease-in-out infinite; transform-origin: 168px 184px; }
        .eye-r       { animation: eyeBlink 5s ease-in-out infinite 0.15s; transform-origin: 232px 184px; }
        .wifi-dot    { animation: wifiDot 1.8s ease-in-out infinite; }
      `}</style>

      <svg
        viewBox="0 0 420 560"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: "100%", height: "100%", userSelect: "none" }}
        aria-label="Personaje cartoon telecomunicaciones"
      >
        {/* ── Torre al fondo ── */}
        <g opacity="0.10" transform="translate(318,30)">
          <rect x="16" y="0" width="10" height="320" fill="#1e3a8a"/>
          <line x1="-2"  y1="20"  x2="44"  y2="90"  stroke="#1e3a8a" strokeWidth="2.5"/>
          <line x1="44"  y1="20"  x2="-2"  y2="90"  stroke="#1e3a8a" strokeWidth="2.5"/>
          <line x1="-8"  y1="90"  x2="50"  y2="170" stroke="#1e3a8a" strokeWidth="2.5"/>
          <line x1="50"  y1="90"  x2="-8"  y2="170" stroke="#1e3a8a" strokeWidth="2.5"/>
          <line x1="-14" y1="170" x2="56"  y2="260" stroke="#1e3a8a" strokeWidth="2.5"/>
          <line x1="56"  y1="170" x2="-14" y2="260" stroke="#1e3a8a" strokeWidth="2.5"/>
        </g>

        {/* ── Antena parabólica ── */}
        <g opacity="0.10" transform="translate(10,310)">
          <line x1="40" y1="0" x2="40" y2="75" stroke="#1e3a8a" strokeWidth="5"/>
          <ellipse cx="40" cy="80" rx="52" ry="28" fill="#1e3a8a"/>
          <line x1="6"  y1="62" x2="74" y2="98" stroke="#3b82f6" strokeWidth="2"/>
        </g>

        {/* ── Rayos de luz animados ── */}
        <path className="streak"     d="M20 520 Q180 370 410 160" fill="none" stroke="#93c5fd" strokeWidth="2.5"/>
        <path className="streak streak-b" d="M10 470 Q160 330 390 110" fill="none" stroke="#60a5fa" strokeWidth="1.5"/>
        <path className="streak streak-c" d="M40 540 Q210 390 420 200" fill="none" stroke="#bfdbfe" strokeWidth="1"/>

        {/* ════ PERSONAJE FLOTANTE ════ */}
        <g className="char-float">

          {/* Sombra suelo */}
          <ellipse cx="198" cy="548" rx="92" ry="11" fill="#94a3b8" opacity="0.22"/>

          {/* ── Piernas (jeans oscuros) ── */}
          <rect x="148" y="395" width="50" height="130" rx="14" fill="#1e293b"/>
          <rect x="210" y="395" width="50" height="130" rx="14" fill="#1e293b"/>
          {/* Detalle jean */}
          <rect x="154" y="402" width="14" height="118" rx="7" fill="#334155" opacity="0.45"/>
          <rect x="216" y="402" width="14" height="118" rx="7" fill="#334155" opacity="0.45"/>

          {/* Cinturón */}
          <rect x="138" y="372" width="126" height="16" rx="6" fill="#0f172a"/>
          <rect x="186" y="373" width="22" height="13" rx="3" fill="#475569"/>
          <rect x="190" y="376" width="14" height="7"  rx="2" fill="#94a3b8"/>

          {/* Zapatos */}
          <ellipse cx="172" cy="535" rx="36" ry="13" fill="#111827"/>
          <ellipse cx="236" cy="535" rx="36" ry="13" fill="#111827"/>
          <ellipse cx="155" cy="530" rx="14" ry="8"  fill="#1e293b"/>
          <ellipse cx="219" cy="530" rx="14" ry="8"  fill="#1e293b"/>

          {/* ── Camisa polo azul ── */}
          <path d="M126 248 Q122 385 136 398 L264 398 Q278 385 274 248 Q258 236 238 232 L218 248 L198 265 L178 248 L158 232 Q138 236 126 248Z" fill="#1d4ed8"/>
          {/* Sombra lateral camisa */}
          <path d="M126 248 Q122 385 136 398 L162 398 L162 232 Q138 236 126 248Z" fill="#1e40af" opacity="0.4"/>
          <path d="M274 248 Q278 385 264 398 L238 398 L238 232 Q258 236 274 248Z" fill="#1e3a8a" opacity="0.25"/>

          {/* Cuello / solapa */}
          <path d="M178 248 L196 278 L204 278 L222 248 L206 240 L200 258 L194 240Z" fill="#1e3a8a"/>

          {/* Botones */}
          <circle cx="200" cy="284" r="3.5" fill="#1e3a8a"/>
          <circle cx="200" cy="300" r="3.5" fill="#1e3a8a"/>

          {/* Logo NOVO ERP en camisa */}
          <text x="200" y="340" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold" opacity="0.88" fontFamily="sans-serif">NOVO ERP</text>

          {/* WiFi en camisa */}
          <path d="M192 318 Q200 313 208 318" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" opacity="0.85"/>
          <path d="M188 323 Q200 315 212 323" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" opacity="0.55"/>
          <circle className="wifi-dot" cx="200" cy="327" r="2.8" fill="white" opacity="0.85"/>

          {/* ── Brazo izquierdo (relajado hacia abajo) ── */}
          <path d="M129 262 Q98  302 94  365" stroke="#f5c5a3" strokeWidth="36" strokeLinecap="round" fill="none"/>
          <path d="M129 262 Q100 298 96  360" stroke="#1d4ed8" strokeWidth="32" strokeLinecap="round" fill="none"/>
          {/* Mano izquierda */}
          <ellipse cx="94" cy="370" rx="24" ry="19" fill="#f5c5a3"/>
          <path d="M75 362 Q70 372 75 380" fill="none" stroke="#e8b89a" strokeWidth="4.5" strokeLinecap="round"/>
          <path d="M113 362 Q118 372 113 380" fill="none" stroke="#e8b89a" strokeWidth="4.5" strokeLinecap="round"/>

          {/* ── Brazo derecho (pulgar arriba) ── */}
          <path d="M267 262 Q300 282 304 325" stroke="#f5c5a3" strokeWidth="36" strokeLinecap="round" fill="none"/>
          <path d="M267 262 Q298 280 302 322" stroke="#1d4ed8" strokeWidth="32" strokeLinecap="round" fill="none"/>
          {/* Antebrazo hacia arriba */}
          <path d="M302 322 Q310 298 306 266" stroke="#f5c5a3" strokeWidth="30" strokeLinecap="round" fill="none"/>
          {/* Puño */}
          <rect x="286" y="250" width="44" height="38" rx="13" fill="#f5c5a3"/>
          {/* Líneas nudillos */}
          <line x1="297" y1="253" x2="297" y2="285" stroke="#e8b89a" strokeWidth="1.5" opacity="0.5"/>
          <line x1="308" y1="253" x2="308" y2="285" stroke="#e8b89a" strokeWidth="1.5" opacity="0.5"/>
          <line x1="319" y1="253" x2="319" y2="285" stroke="#e8b89a" strokeWidth="1.5" opacity="0.5"/>
          {/* Pulgar */}
          <path d="M288 258 Q272 244 270 228 Q268 212 282 210 Q298 208 302 226 L302 258Z" fill="#f5c5a3"/>
          <ellipse cx="274" cy="222" rx="6" ry="10" fill="#e8b89a" opacity="0.55" transform="rotate(-12,274,222)"/>

          {/* ── Cuello ── */}
          <rect x="182" y="228" width="36" height="28" rx="8" fill="#f5c5a3"/>

          {/* ── Cabeza ── */}
          <path d="M130 178 Q130 258 158 264 Q178 270 200 270 Q222 270 242 264 Q270 258 270 178 Q270 112 200 110 Q130 112 130 178Z" fill="#f5c5a3"/>

          {/* Frente más clara */}
          <ellipse cx="200" cy="152" rx="58" ry="28" fill="#fbd5b8" opacity="0.4"/>

          {/* ── Pelo castaño ── */}
          <path d="M132 168 Q138 100 200 96 Q262 100 268 168 Q260 126 238 114 Q220 104 200 102 Q180 104 162 114 Q140 126 132 168Z" fill="#6b3a1f"/>
          <path d="M132 168 Q128 145 138 118 Q148 104 160 108 L148 120 Q136 138 134 162Z" fill="#5c3214"/>
          <path d="M268 168 Q272 145 262 118 Q252 104 240 108 L252 120 Q264 138 266 162Z" fill="#5c3214"/>
          <path d="M158 100 Q170 88 185 91 Q175 95 168 103Z" fill="#7a4422"/>
          <path d="M215 91 Q230 88 242 98 Q234 96 228 103Z" fill="#7a4422"/>

          {/* ── Orejas ── */}
          <ellipse cx="130" cy="188" rx="14" ry="18" fill="#f5c5a3"/>
          <ellipse cx="270" cy="188" rx="14" ry="18" fill="#f5c5a3"/>
          <path d="M133 180 Q138 188 133 196" fill="none" stroke="#e8b89a" strokeWidth="2" strokeLinecap="round"/>
          <path d="M267 180 Q262 188 267 196" fill="none" stroke="#e8b89a" strokeWidth="2" strokeLinecap="round"/>

          {/* ── Audífonos (headphones) ── */}
          {/* Banda */}
          <path d="M122 172 Q200 88 278 172" fill="none" stroke="#1e293b" strokeWidth="15" strokeLinecap="round"/>
          <path d="M122 172 Q200 92 278 172" fill="none" stroke="#334155" strokeWidth="9" strokeLinecap="round"/>
          <path d="M122 172 Q200 96 278 172" fill="none" stroke="#475569" strokeWidth="3.5" strokeLinecap="round"/>
          {/* Copa izquierda */}
          <ellipse cx="116" cy="192" rx="24" ry="28" fill="#1e293b"/>
          <ellipse cx="116" cy="192" rx="17" ry="20" fill="#334155"/>
          <ellipse cx="116" cy="192" rx="11" ry="13" fill="#2563eb"/>
          {/* WiFi en copa */}
          <path d="M111 190 Q116 185 121 190" fill="none" stroke="#93c5fd" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M108 194 Q116 186 124 194" fill="none" stroke="#93c5fd" strokeWidth="1.2" strokeLinecap="round" opacity="0.55"/>
          <circle cx="116" cy="198" r="2.2" fill="#93c5fd"/>
          {/* Copa derecha */}
          <ellipse cx="284" cy="192" rx="24" ry="28" fill="#1e293b"/>
          <ellipse cx="284" cy="192" rx="17" ry="20" fill="#334155"/>
          <ellipse cx="284" cy="192" rx="11" ry="13" fill="#2563eb"/>
          {/* Brazo micrófono */}
          <path d="M138 204 Q146 222 153 236 Q158 244 172 244" fill="none" stroke="#1e293b" strokeWidth="5.5" strokeLinecap="round"/>
          <path d="M138 204 Q146 222 153 236 Q158 244 172 244" fill="none" stroke="#475569" strokeWidth="3" strokeLinecap="round"/>
          <ellipse cx="176" cy="243" rx="9" ry="7" fill="#1e293b"/>
          <ellipse cx="176" cy="243" rx="6" ry="4.5" fill="#334155"/>

          {/* ── Ojos ── */}
          <ellipse cx="168" cy="184" rx="17" ry="18" fill="white"/>
          <ellipse cx="232" cy="184" rx="17" ry="18" fill="white"/>
          {/* Iris */}
          <circle cx="168" cy="186" r="12" fill="#6b3a1f"/>
          <circle cx="232" cy="186" r="12" fill="#6b3a1f"/>
          {/* Pupila */}
          <circle cx="169" cy="187" r="7"   fill="#0f172a"/>
          <circle cx="233" cy="187" r="7"   fill="#0f172a"/>
          {/* Brillo */}
          <circle cx="173" cy="182" r="4"   fill="white"/>
          <circle cx="237" cy="182" r="4"   fill="white"/>
          <circle cx="174" cy="183" r="1.8" fill="white" opacity="0.55"/>
          {/* Párpado animado izq */}
          <ellipse className="eye-l" cx="168" cy="180" rx="17" ry="4" fill="#f5c5a3"/>
          <ellipse className="eye-r" cx="232" cy="180" rx="17" ry="4" fill="#f5c5a3"/>

          {/* Cejas */}
          <path d="M153 164 Q168 156 184 162" fill="none" stroke="#4a2810" strokeWidth="4"   strokeLinecap="round"/>
          <path d="M216 162 Q232 156 248 164" fill="none" stroke="#4a2810" strokeWidth="4"   strokeLinecap="round"/>

          {/* Rubor mejillas */}
          <ellipse cx="146" cy="204" rx="19" ry="13" fill="#fda4af" opacity="0.22"/>
          <ellipse cx="254" cy="204" rx="19" ry="13" fill="#fda4af" opacity="0.22"/>

          {/* Nariz */}
          <path d="M194 196 Q200 208 206 196" fill="none" stroke="#d4956a" strokeWidth="2.2" strokeLinecap="round"/>
          <circle cx="196" cy="200" r="3.5" fill="#e8a87c" opacity="0.35"/>
          <circle cx="204" cy="200" r="3.5" fill="#e8a87c" opacity="0.35"/>

          {/* Sonrisa */}
          <path d="M166 218 Q200 240 234 218" fill="none" stroke="#c47a52" strokeWidth="4" strokeLinecap="round"/>
          {/* Dientes */}
          <path d="M170 223 Q200 238 230 223 Q200 232 170 223Z" fill="white" opacity="0.82"/>
        </g>

        {/* ── Badge WiFi inferior ── */}
        <g className="badge-pulse">
          <rect x="22" y="462" width="178" height="52" rx="26" fill="#1d4ed8"/>
          <rect x="22" y="462" width="178" height="52" rx="26" fill="none" stroke="#93c5fd" strokeWidth="1" opacity="0.45"/>
          <path d="M44 480 Q54 472 64 480" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round"/>
          <path d="M39 486 Q54 475 69 486" fill="none" stroke="white" strokeWidth="2"   strokeLinecap="round" opacity="0.6"/>
          <circle cx="54" cy="491" r="3.5" fill="white"/>
          <text x="82" y="480" fill="white"   fontSize="11" fontWeight="bold" fontFamily="sans-serif">Conectamos</text>
          <text x="82" y="496" fill="#93c5fd" fontSize="10" fontFamily="sans-serif">lo que te mueve</text>
        </g>
      </svg>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Componente principal Login
───────────────────────────────────────────────────────────────────────────── */
export default function Login() {
  const navigate = useNavigate();

  const [paso, setPaso]               = useState(1);
  const [formData, setFormData]       = useState({ usuario: "", contraseña: "" });
  const [otp, setOtp]                 = useState("");
  const [usuarioId, setUsuarioId]     = useState(null);
  const [usuarioLogin, setUsuarioLogin] = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [showPass, setShowPass]       = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // ─── PASO 1: Login → solicitar OTP ─────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/otp/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: formData.usuario, password: formData.contraseña }),
      });
      const data = await res.json();
      if (!data.success) { setError("Credenciales inválidas."); return; }
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
        body: JSON.stringify({ usuario_id: usuarioId, usuario: usuarioLogin, otp: otp.trim() }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || "Código incorrecto o expirado."); return; }
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
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        /* ── Página ── */
        .lp {
          font-family: 'Inter', system-ui, sans-serif;
          min-height: 100vh;
          display: flex;
          background: linear-gradient(140deg, #dbeafe 0%, #eff6ff 35%, #e0f2fe 65%, #dbeafe 100%);
          position: relative;
          overflow: hidden;
        }
        .lp::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(circle at 18% 55%, rgba(59,130,246,0.10) 0%, transparent 55%),
            radial-gradient(circle at 82% 18%, rgba(37,99,235,0.07) 0%, transparent 50%),
            radial-gradient(circle at 50% 90%, rgba(96,165,250,0.06) 0%, transparent 45%);
          pointer-events: none;
        }

        /* ── Paneles ── */
        .lp-left {
          flex: 0 0 52%;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          padding: 2rem 1rem;
          z-index: 1;
        }
        .lp-right {
          flex: 0 0 48%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          z-index: 1;
        }

        /* ── Tarjeta blanca ── */
        .login-card {
          background: white;
          border-radius: 24px;
          box-shadow:
            0 24px 64px rgba(30,58,138,0.12),
            0 4px 20px rgba(30,58,138,0.07),
            0 0 0 1px rgba(219,234,254,0.7);
          width: 100%;
          max-width: 440px;
          padding: 2.5rem;
        }

        /* ── Inputs ── */
        .lc-wrap  { position: relative; }
        .lc-icon  { position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none; display: flex; }
        .lc-eye   { position: absolute; right: 0.85rem; top: 50%; transform: translateY(-50%); background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px; display: flex; }
        .lc-eye:hover { color: #64748b; }

        .lc-input {
          width: 100%;
          background: #f8fafc;
          border: 1.5px solid #e2e8f0;
          border-radius: 12px;
          padding: 0.9rem 1rem 0.9rem 3rem;
          color: #0f172a;
          font-size: 0.95rem;
          outline: none;
          transition: all 0.2s;
          box-sizing: border-box;
          font-family: inherit;
        }
        .lc-input::placeholder { color: #94a3b8; }
        .lc-input:focus {
          border-color: #3b82f6;
          background: white;
          box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
        }
        .lc-input-otp {
          text-align: center;
          font-size: 2rem;
          letter-spacing: 0.55em;
          font-weight: 700;
          padding-left: 1.5rem;
        }

        /* ── Label ── */
        .lc-label {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          color: #475569;
          margin-bottom: 0.45rem;
        }

        /* ── Error ── */
        .lc-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 10px;
          padding: 0.75rem 1rem;
          color: #dc2626;
          font-size: 0.85rem;
          text-align: center;
          margin-bottom: 1.25rem;
        }

        /* ── Botón primario ── */
        .lc-btn {
          width: 100%;
          padding: 0.95rem;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          color: white;
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
          box-shadow: 0 4px 18px rgba(37,99,235,0.30);
          letter-spacing: 0.01em;
        }
        .lc-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 26px rgba(37,99,235,0.40);
        }
        .lc-btn:active:not(:disabled) { transform: translateY(0); }
        .lc-btn:disabled { opacity: 0.48; cursor: not-allowed; }

        /* ── Link botón ── */
        .lc-link {
          background: none;
          border: none;
          color: #2563eb;
          font-size: 0.85rem;
          cursor: pointer;
          font-family: inherit;
          padding: 0;
          transition: color 0.15s;
        }
        .lc-link:hover { color: #1d4ed8; text-decoration: underline; }

        /* ── Step indicator ── */
        .step-bar { display: flex; justify-content: center; gap: 6px; margin-top: 0.8rem; }
        .step-dot {
          height: 4px;
          border-radius: 99px;
          transition: all 0.3s;
        }

        /* ── Spinner ── */
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 768px) {
          .lp { flex-direction: column; }
          .lp-left { display: none; }
          .lp-right { flex: 1; padding: 1.5rem 1rem; }
          .login-card { padding: 2rem 1.5rem; }
        }
      `}</style>

      <div className="lp">

        {/* ════ IZQUIERDA — Personaje ════ */}
        <div className="lp-left">
          <div style={{ width: "100%", maxWidth: 420, height: 530 }}>
            <TelecomCharacter />
          </div>
        </div>

        {/* ════ DERECHA — Tarjeta Login ════ */}
        <div className="lp-right">
          <div className="login-card">

            {/* ── Marca NOVO ERP ── */}
            <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
              {/* Ícono WiFi + nombre */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: "0.4rem" }}>
                <svg width="38" height="30" viewBox="0 0 38 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 8 Q19 0 36 8"    fill="none" stroke="#1d4ed8" strokeWidth="3"   strokeLinecap="round"/>
                  <path d="M6 14 Q19 6 32 14"   fill="none" stroke="#2563eb" strokeWidth="3"   strokeLinecap="round"/>
                  <path d="M11 20 Q19 13 27 20" fill="none" stroke="#3b82f6" strokeWidth="3"   strokeLinecap="round"/>
                  <circle cx="19" cy="26" r="4"  fill="#2563eb"/>
                </svg>
                <span style={{ fontSize: "1.7rem", fontWeight: 800, color: "#1e3a8a", letterSpacing: "0.04em" }}>
                  NOVO <span style={{ color: "#2563eb" }}>ERP</span>
                </span>
              </div>
              <p style={{ color: "#64748b", fontSize: "0.8rem", margin: 0 }}>
                Soluciones en Telecomunicaciones
              </p>

              {/* Título de paso */}
              <div style={{ marginTop: "1.4rem" }}>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: "0 0 0.25rem" }}>
                  {paso === 1 ? "Bienvenido" : "Verificación OTP"}
                </h1>
                <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
                  {paso === 1 ? "Inicia sesión para continuar" : "Ingresa el código enviado a tu correo"}
                </p>
              </div>

              {/* Barra de pasos */}
              <div className="step-bar">
                <div className="step-dot" style={{
                  width: paso === 1 ? 36 : 28,
                  background: paso >= 1 ? "#2563eb" : "#e2e8f0",
                }}/>
                <div className="step-dot" style={{
                  width: paso === 2 ? 36 : 28,
                  background: paso >= 2 ? "#2563eb" : "#e2e8f0",
                }}/>
              </div>
            </div>

            {/* ── Error ── */}
            {error && <div className="lc-error">{error}</div>}

            {/* ════ PASO 1: Credenciales ════ */}
            {paso === 1 && (
              <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

                <div>
                  <label className="lc-label">Usuario</label>
                  <div className="lc-wrap">
                    <span className="lc-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                    </span>
                    <input
                      type="text"
                      name="usuario"
                      className="lc-input"
                      onChange={handleChange}
                      placeholder="Usuario o correo electrónico"
                      autoComplete="username"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="lc-label">Contraseña</label>
                  <div className="lc-wrap">
                    <span className="lc-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    </span>
                    <input
                      type={showPass ? "text" : "password"}
                      name="contraseña"
                      className="lc-input"
                      onChange={handleChange}
                      placeholder="Contraseña"
                      autoComplete="current-password"
                      required
                    />
                    <button type="button" className="lc-eye" onClick={() => setShowPass(!showPass)} aria-label="Mostrar/ocultar contraseña">
                      {showPass ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", color: "#475569", cursor: "pointer" }}>
                    <input type="checkbox" style={{ accentColor: "#2563eb", width: 16, height: 16 }} />
                    Recordarme
                  </label>
                  <button type="button" className="lc-link">¿Olvidaste tu contraseña?</button>
                </div>

                <button type="submit" className="lc-btn" disabled={loading} style={{ marginTop: "0.4rem" }}>
                  {loading ? (
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                        style={{ animation: "spin 0.8s linear infinite" }}>
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                      </svg>
                      Verificando…
                    </span>
                  ) : "Iniciar sesión"}
                </button>

                <p style={{ textAlign: "center", color: "#94a3b8", fontSize: "0.8rem", margin: 0 }}>
                  ¿No tienes una cuenta?{" "}
                  <button type="button" className="lc-link">Contáctanos</button>
                </p>
              </form>
            )}

            {/* ════ PASO 2: OTP ════ */}
            {paso === 2 && (
              <form onSubmit={handleVerifyOtp} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div style={{
                  textAlign: "center",
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: 10,
                  padding: "0.75rem",
                  color: "#1e40af",
                  fontSize: "0.85rem",
                }}>
                  📧 Revisá tu correo e ingresá el código de 6 dígitos
                </div>

                <div>
                  <label className="lc-label">Código OTP de 6 dígitos</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    className="lc-input lc-input-otp"
                    placeholder="000000"
                    autoComplete="one-time-code"
                    required
                    style={{ paddingLeft: "1.5rem" }}
                  />
                </div>

                <button
                  type="submit"
                  className="lc-btn"
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
                  ) : "✓ Confirmar código"}
                </button>

                <div style={{ textAlign: "center" }}>
                  <button
                    type="button"
                    className="lc-link"
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
              borderTop: "1px solid #f1f5f9",
              textAlign: "center",
              color: "#94a3b8",
              fontSize: "0.72rem",
            }}>
              NOVO ERP © {new Date().getFullYear()} · Acceso restringido
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
