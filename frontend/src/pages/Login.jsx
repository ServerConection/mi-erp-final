import { useState } from "react";
import { useNavigate } from "react-router-dom";

const API = "https://erp-backend-v1-qhk2.onrender.com";

/* ─────────────────────────────────────────────────────────────────────────────
   Panel izquierdo — Ilustración animada telecomunicaciones
───────────────────────────────────────────────────────────────────────────── */
function TelecomIllustration() {
  return (
    <div style={{
      width: "100%",
      height: "100%",
      position: "relative",
      borderRadius: "20px",
      overflow: "hidden",
      boxShadow: "0 20px 60px rgba(15,23,42,0.40)",
      background: "linear-gradient(145deg, #0c1a3a 0%, #0f2a5c 40%, #1a4080 70%, #0c1a3a 100%)",
    }}>

      {/* ── Fondo: antena/torre difuminada ── */}
      <img
        src="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=70"
        alt=""
        aria-hidden="true"
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          objectFit: "cover", objectPosition: "center",
          opacity: 0.13, display: "block",
        }}
      />

      {/* ── Overlay degradado azul ── */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(160deg, rgba(29,78,216,0.30) 0%, rgba(15,23,42,0.15) 55%, rgba(37,99,235,0.35) 100%)",
        pointerEvents: "none",
      }} />

      {/* ── Orbes de luz animados ── */}
      <div className="go go-1" />
      <div className="go go-2" />
      <div className="go go-3" />
      <div className="go go-4" />

      {/* ── Barrido de luz sutil ── */}
      <div className="light-sweep" />

      {/* ── Imagen principal: persona telecomunicaciones ── */}
      <img
        src="https://images.unsplash.com/photo-1607799279861-4dd421887fb3?w=480&q=80"
        alt="Profesional NOVONET"
        style={{
          position: "absolute",
          bottom: "72px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "78%",
          maxWidth: "310px",
          objectFit: "cover",
          objectPosition: "center top",
          aspectRatio: "3/4",
          borderRadius: "140px 140px 0 0",
          filter: "drop-shadow(0 8px 32px rgba(37,99,235,0.55)) brightness(1.05) saturate(1.1)",
        }}
      />

      {/* ── Halo debajo de la persona ── */}
      <div style={{
        position: "absolute",
        bottom: "68px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "240px",
        height: "40px",
        background: "radial-gradient(ellipse, rgba(59,130,246,0.45) 0%, transparent 70%)",
        filter: "blur(12px)",
        pointerEvents: "none",
      }} />

      {/* ── Tagline inferior ── */}
      <div style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0,
        padding: "1.5rem 1.75rem 1.5rem",
        background: "linear-gradient(to top, rgba(10,20,50,0.92) 0%, transparent 100%)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "0.35rem" }}>
          <svg width="26" height="20" viewBox="0 0 38 30" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 8 Q19 0 36 8"    fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"/>
            <path d="M6 14 Q19 6 32 14"  fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"/>
            <path d="M11 20 Q19 13 27 20" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"/>
            <circle cx="19" cy="26" r="4" fill="white"/>
          </svg>
          <span style={{ color: "white", fontSize: "1.35rem", fontWeight: 800, letterSpacing: "0.05em" }}>
            NOVONET
          </span>
        </div>
        <p style={{ color: "rgba(186,220,255,0.88)", fontSize: "0.88rem", margin: 0, fontStyle: "italic" }}>
          Conectamos lo que te mueve
        </p>
      </div>
    </div>
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

        /* ════════════════════════════════════════════════
           LUCES ANIMADAS — panel izquierdo
        ════════════════════════════════════════════════ */

        /* Orbe 1: arriba izquierda, movimiento suave */
        @keyframes goFloat1 {
          0%,100% { transform: translate(0px, 0px) scale(1);    opacity: 0.60; }
          25%      { transform: translate(20px,-25px) scale(1.07); opacity: 0.80; }
          55%      { transform: translate(28px, 10px) scale(0.97); opacity: 0.50; }
          80%      { transform: translate(-8px, 18px) scale(1.03); opacity: 0.65; }
        }
        /* Orbe 2: abajo derecha, periodo diferente */
        @keyframes goFloat2 {
          0%,100% { transform: translate(0px, 0px) scale(1);     opacity: 0.45; }
          35%      { transform: translate(-24px,-18px) scale(1.12); opacity: 0.70; }
          70%      { transform: translate(12px, 22px) scale(0.93); opacity: 0.38; }
        }
        /* Orbe 3: centro derecho */
        @keyframes goFloat3 {
          0%,100% { transform: translate(0px,0px) scale(1);     opacity: 0.30; }
          50%      { transform: translate(14px,-30px) scale(1.18); opacity: 0.55; }
        }
        /* Orbe 4: pequeño, muy lento */
        @keyframes goFloat4 {
          0%,100% { transform: translate(0px,0px) scale(1);     opacity: 0.25; }
          40%      { transform: translate(-18px, 12px) scale(1.20); opacity: 0.50; }
          75%      { transform: translate(10px,-10px) scale(0.90); opacity: 0.20; }
        }

        /* Barrido de luz diagonal — pasa cada ~8 s */
        @keyframes sweep {
          0%   { opacity: 0; transform: translateX(-320px) skewX(-18deg); }
          12%  { opacity: 1; }
          88%  { opacity: 0.6; }
          100% { opacity: 0; transform: translateX(700px) skewX(-18deg); }
        }

        /* Clases base de los orbes */
        .go {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(45px);
        }
        .go-1 {
          width: 210px; height: 210px;
          background: radial-gradient(circle, rgba(59,130,246,0.70) 0%, transparent 68%);
          top: 8%; left: 4%;
          animation: goFloat1 7.5s ease-in-out infinite;
        }
        .go-2 {
          width: 170px; height: 170px;
          background: radial-gradient(circle, rgba(37,99,235,0.60) 0%, transparent 68%);
          bottom: 18%; right: 5%;
          animation: goFloat2 10s ease-in-out infinite;
        }
        .go-3 {
          width: 130px; height: 130px;
          background: radial-gradient(circle, rgba(96,165,250,0.50) 0%, transparent 70%);
          top: 42%; right: 14%;
          animation: goFloat3 12s ease-in-out infinite;
        }
        .go-4 {
          width: 90px; height: 90px;
          background: radial-gradient(circle, rgba(147,197,253,0.55) 0%, transparent 70%);
          top: 25%; left: 38%;
          animation: goFloat4 15s ease-in-out infinite;
        }

        /* Barrido de brillo */
        .light-sweep {
          position: absolute;
          top: 0; bottom: 0;
          left: 0;
          width: 120px;
          pointer-events: none;
          background: linear-gradient(
            105deg,
            transparent 0%,
            rgba(255,255,255,0.00) 38%,
            rgba(255,255,255,0.09) 48%,
            rgba(255,255,255,0.14) 50%,
            rgba(255,255,255,0.09) 52%,
            rgba(255,255,255,0.00) 62%,
            transparent 100%
          );
          animation: sweep 8s ease-in-out infinite;
        }

        @media (max-width: 768px) {
          .lp { flex-direction: column; }
          .lp-left { display: none; }
          .lp-right { flex: 1; padding: 1.5rem 1rem; }
          .login-card { padding: 2rem 1.5rem; }
        }
      `}</style>

      <div className="lp">

        {/* ════ IZQUIERDA — Ilustración ════ */}
        <div className="lp-left">
          <div style={{ width: "100%", maxWidth: 480, height: 580 }}>
            <TelecomIllustration />
          </div>
        </div>

        {/* ════ DERECHA — Tarjeta Login ════ */}
        <div className="lp-right">
          <div className="login-card">

            {/* ── Marca NOVONET ── */}
            <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: "0.4rem" }}>
                <svg width="38" height="30" viewBox="0 0 38 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 8 Q19 0 36 8"    fill="none" stroke="#1d4ed8" strokeWidth="3" strokeLinecap="round"/>
                  <path d="M6 14 Q19 6 32 14"   fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round"/>
                  <path d="M11 20 Q19 13 27 20" fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round"/>
                  <circle cx="19" cy="26" r="4"  fill="#2563eb"/>
                </svg>
                <span style={{ fontSize: "1.7rem", fontWeight: 800, color: "#1e3a8a", letterSpacing: "0.04em" }}>
                  NOVO<span style={{ color: "#2563eb" }}>NET</span>
                </span>
              </div>
              <p style={{ color: "#64748b", fontSize: "0.8rem", margin: 0 }}>
                Soluciones en Telecomunicaciones
              </p>

              <div style={{ marginTop: "1.4rem" }}>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: "0 0 0.25rem" }}>
                  {paso === 1 ? "Bienvenido" : "Verificación OTP"}
                </h1>
                <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
                  {paso === 1 ? "Inicia sesión para continuar" : "Ingresa el código enviado a tu correo"}
                </p>
              </div>

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
              NOVONET © {new Date().getFullYear()} · Acceso restringido
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
