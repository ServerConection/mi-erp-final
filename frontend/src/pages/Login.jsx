import { useState } from "react";
import { useNavigate } from "react-router-dom";

const API = "https://erp-backend-v1-qhk2.onrender.com";

/* ─────────────────────────────────────────────────────────────────────────────
   Componente principal Login — Fondo imagen corporativa Novonet
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

  // ─── PASO 1: Login → solicitar OTP ──────────────────────────────────────────
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

  // ─── PASO 2: Verificar OTP ───────────────────────────────────────────────────
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
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

        /* ── Reset & base ── */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ══════════════════════════════════════════
           PÁGINA — imagen de fondo full screen
        ══════════════════════════════════════════ */
        .lp {
          font-family: 'Inter', system-ui, sans-serif;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          position: relative;
          overflow: hidden;
          background: #0a1a4a;
        }

        /* Imagen de fondo */
        .lp-bg {
          position: absolute;
          inset: 0;
          background-image: url('/fondo.jpeg');
          background-size: cover;
          background-position: center center;
          background-repeat: no-repeat;
          z-index: 0;
        }

        /* Overlay degradado sutil — aclara el lado derecho para legibilidad */
        .lp-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            105deg,
            rgba(5, 15, 50, 0.05) 0%,
            rgba(5, 15, 50, 0.10) 45%,
            rgba(5, 20, 70, 0.60) 68%,
            rgba(5, 20, 70, 0.82) 100%
          );
          z-index: 1;
        }

        /* ── Columna del formulario ── */
        .lp-right {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 460px;
          padding: 2rem 2.5rem 2rem 2rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }

        /* ══════════════════════════════════════════
           CARD — glassmorphism
        ══════════════════════════════════════════ */
        .login-card {
          width: 100%;
          background: rgba(255, 255, 255, 0.10);
          backdrop-filter: blur(28px) saturate(1.6);
          -webkit-backdrop-filter: blur(28px) saturate(1.6);
          border-radius: 28px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow:
            0 32px 80px rgba(5, 15, 60, 0.45),
            0 8px 24px rgba(5, 15, 60, 0.30),
            inset 0 1px 0 rgba(255,255,255,0.25);
          padding: 2.5rem 2.25rem 2rem;
          transition: box-shadow 0.3s ease;
        }
        .login-card:hover {
          box-shadow:
            0 40px 100px rgba(5, 15, 60, 0.55),
            0 12px 32px rgba(5, 15, 60, 0.35),
            inset 0 1px 0 rgba(255,255,255,0.30);
        }

        /* ── Logo marca ── */
        .lc-brand {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 1.8rem;
          gap: 0.5rem;
        }
        .lc-brand-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .lc-brand-name {
          font-size: 2rem;
          font-weight: 900;
          letter-spacing: 0.04em;
          color: #ffffff;
          text-shadow: 0 2px 12px rgba(37,99,235,0.5);
        }
        .lc-brand-name span { color: #60a5fa; }
        .lc-brand-sub {
          font-size: 0.78rem;
          color: rgba(186, 220, 255, 0.80);
          font-style: italic;
          letter-spacing: 0.02em;
        }

        /* Separador */
        .lc-divider {
          width: 40px;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(96,165,250,0.6), transparent);
          border-radius: 99px;
          margin: 0.6rem auto;
        }

        /* Título del paso */
        .lc-title {
          font-size: 1.35rem;
          font-weight: 800;
          color: #ffffff;
          text-align: center;
          margin-bottom: 0.2rem;
          letter-spacing: -0.01em;
        }
        .lc-subtitle {
          font-size: 0.82rem;
          color: rgba(186,220,255,0.75);
          text-align: center;
          margin-bottom: 1.6rem;
        }

        /* ── Step indicator ── */
        .step-bar {
          display: flex;
          justify-content: center;
          gap: 6px;
          margin-bottom: 1.5rem;
        }
        .step-dot {
          height: 4px;
          border-radius: 99px;
          transition: all 0.35s cubic-bezier(.4,0,.2,1);
        }

        /* ── Error ── */
        .lc-error {
          background: rgba(239, 68, 68, 0.18);
          border: 1px solid rgba(239,68,68,0.40);
          border-radius: 12px;
          padding: 0.75rem 1rem;
          color: #fca5a5;
          font-size: 0.84rem;
          text-align: center;
          margin-bottom: 1.1rem;
          backdrop-filter: blur(4px);
        }

        /* ── Label ── */
        .lc-label {
          display: block;
          font-size: 0.75rem;
          font-weight: 700;
          color: rgba(186,220,255,0.85);
          margin-bottom: 0.4rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        /* ── Input wrapper ── */
        .lc-wrap { position: relative; }
        .lc-icon {
          position: absolute;
          left: 1rem;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(147,197,253,0.75);
          pointer-events: none;
          display: flex;
        }
        .lc-eye {
          position: absolute;
          right: 0.85rem;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: rgba(147,197,253,0.65);
          cursor: pointer;
          padding: 4px;
          display: flex;
          transition: color 0.15s;
        }
        .lc-eye:hover { color: rgba(147,197,253,1); }

        /* ── Inputs glass ── */
        .lc-input {
          width: 100%;
          background: rgba(255,255,255,0.10);
          border: 1.5px solid rgba(255,255,255,0.18);
          border-radius: 14px;
          padding: 0.9rem 1rem 0.9rem 3rem;
          color: #ffffff;
          font-size: 0.95rem;
          outline: none;
          transition: all 0.22s ease;
          font-family: inherit;
          backdrop-filter: blur(8px);
        }
        .lc-input::placeholder { color: rgba(147,197,253,0.50); }
        .lc-input:focus {
          border-color: rgba(96,165,250,0.70);
          background: rgba(255,255,255,0.15);
          box-shadow:
            0 0 0 3px rgba(59,130,246,0.20),
            inset 0 1px 0 rgba(255,255,255,0.12);
        }
        .lc-input:-webkit-autofill {
          -webkit-box-shadow: 0 0 0px 1000px rgba(15,35,100,0.7) inset;
          -webkit-text-fill-color: #fff;
        }

        /* OTP */
        .lc-input-otp {
          text-align: center;
          font-size: 1.9rem;
          letter-spacing: 0.55em;
          font-weight: 700;
          padding-left: 1.5rem;
        }

        /* ── Checkbox fila ── */
        .lc-row-check {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .lc-check-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.83rem;
          color: rgba(186,220,255,0.80);
          cursor: pointer;
        }

        /* ── Link botón ── */
        .lc-link {
          background: none;
          border: none;
          color: #60a5fa;
          font-size: 0.83rem;
          cursor: pointer;
          font-family: inherit;
          padding: 0;
          transition: color 0.15s;
          font-weight: 600;
        }
        .lc-link:hover { color: #93c5fd; text-decoration: underline; }

        /* ── Botón primario ── */
        .lc-btn {
          width: 100%;
          padding: 0.95rem;
          border-radius: 14px;
          border: none;
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 60%, #1e40af 100%);
          color: white;
          font-weight: 800;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.22s ease;
          font-family: inherit;
          box-shadow:
            0 6px 24px rgba(37,99,235,0.50),
            inset 0 1px 0 rgba(255,255,255,0.20);
          letter-spacing: 0.02em;
          text-transform: uppercase;
          position: relative;
          overflow: hidden;
        }
        .lc-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.10) 0%, transparent 60%);
          pointer-events: none;
        }
        .lc-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow:
            0 12px 36px rgba(37,99,235,0.65),
            inset 0 1px 0 rgba(255,255,255,0.25);
        }
        .lc-btn:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 4px 16px rgba(37,99,235,0.40);
        }
        .lc-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        /* ── OTP info box ── */
        .lc-otp-info {
          text-align: center;
          background: rgba(37,99,235,0.18);
          border: 1px solid rgba(96,165,250,0.30);
          border-radius: 12px;
          padding: 0.75rem 1rem;
          color: #93c5fd;
          font-size: 0.84rem;
          backdrop-filter: blur(4px);
        }

        /* ── Footer ── */
        .lc-footer {
          margin-top: 1.5rem;
          padding-top: 1.1rem;
          border-top: 1px solid rgba(255,255,255,0.10);
          text-align: center;
          color: rgba(147,197,253,0.50);
          font-size: 0.70rem;
          letter-spacing: 0.04em;
        }

        /* ── Spinner ── */
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Shimmer en la card ── */
        @keyframes cardShimmer {
          0%   { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }

        /* ── Responsive ── */
        @media (max-width: 640px) {
          .lp { justify-content: center; }
          .lp-right {
            padding: 1.5rem 1rem;
            max-width: 100%;
            min-height: auto;
          }
          .lp-overlay {
            background: rgba(5, 15, 60, 0.72);
          }
          .login-card { padding: 2rem 1.5rem; }
          .lc-brand-name { font-size: 1.65rem; }
        }
      `}</style>

      <div className="lp">
        {/* ── Fondo imagen ── */}
        <div className="lp-bg" />

        {/* ── Overlay degradado ── */}
        <div className="lp-overlay" />

        {/* ════ COLUMNA FORMULARIO (derecha) ════ */}
        <div className="lp-right">
          <div className="login-card">

            {/* ── Marca NOVONET ── */}
            <div className="lc-brand">
              <div className="lc-brand-row">
                {/* Logo N de Novonet — SVG vectorial */}
                <svg width="42" height="42" viewBox="0 0 42 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="ng" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%"   stopColor="#2563eb"/>
                      <stop offset="50%"  stopColor="#0ea5e9"/>
                      <stop offset="100%" stopColor="#06b6d4"/>
                    </linearGradient>
                  </defs>
                  <rect width="42" height="42" rx="12" fill="rgba(255,255,255,0.12)"/>
                  <text x="21" y="31" textAnchor="middle" fontFamily="Inter,sans-serif"
                    fontWeight="900" fontSize="26" fill="url(#ng)">N</text>
                </svg>
                <span className="lc-brand-name">NOVO<span>NET</span></span>
              </div>
              <p className="lc-brand-sub">Conectamos lo que te mueve</p>
              <div className="lc-divider" />
            </div>

            {/* ── Título del paso ── */}
            <h1 className="lc-title">
              {paso === 1 ? "Bienvenido de vuelta" : "Verificación OTP"}
            </h1>
            <p className="lc-subtitle">
              {paso === 1
                ? "Ingresa tus credenciales para acceder al sistema"
                : "Revisá tu correo e ingresá el código de 6 dígitos"}
            </p>

            {/* Step bar */}
            <div className="step-bar">
              <div className="step-dot" style={{
                width: paso === 1 ? 40 : 28,
                background: paso >= 1
                  ? "linear-gradient(90deg,#2563eb,#0ea5e9)"
                  : "rgba(255,255,255,0.15)",
              }}/>
              <div className="step-dot" style={{
                width: paso === 2 ? 40 : 28,
                background: paso >= 2
                  ? "linear-gradient(90deg,#2563eb,#0ea5e9)"
                  : "rgba(255,255,255,0.15)",
              }}/>
            </div>

            {/* ── Error ── */}
            {error && <div className="lc-error">⚠ {error}</div>}

            {/* ════ PASO 1: Credenciales ════ */}
            {paso === 1 && (
              <form onSubmit={handleLogin} style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>

                <div>
                  <label className="lc-label">Usuario</label>
                  <div className="lc-wrap">
                    <span className="lc-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                    <button type="button" className="lc-eye"
                      onClick={() => setShowPass(!showPass)}
                      aria-label="Mostrar/ocultar contraseña">
                      {showPass ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="lc-row-check">
                  <label className="lc-check-label">
                    <input type="checkbox" style={{ accentColor:"#2563eb", width:15, height:15 }}/>
                    Recordarme
                  </label>
                  <button type="button" className="lc-link">¿Olvidaste tu contraseña?</button>
                </div>

                <button type="submit" className="lc-btn" disabled={loading}
                  style={{ marginTop:"0.3rem" }}>
                  {loading ? (
                    <span style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5"
                        style={{ animation:"spin 0.8s linear infinite" }}>
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                      </svg>
                      Verificando…
                    </span>
                  ) : "→ Iniciar sesión"}
                </button>

                <p style={{ textAlign:"center", color:"rgba(147,197,253,0.55)", fontSize:"0.78rem" }}>
                  ¿No tienes una cuenta?{" "}
                  <button type="button" className="lc-link">Contáctanos</button>
                </p>
              </form>
            )}

            {/* ════ PASO 2: OTP ════ */}
            {paso === 2 && (
              <form onSubmit={handleVerifyOtp}
                style={{ display:"flex", flexDirection:"column", gap:"1.25rem" }}>

                <div className="lc-otp-info">
                  📧 Revisá tu correo e ingresá el código de 6 dígitos
                </div>

                <div>
                  <label className="lc-label">Código OTP</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g,""))}
                    className="lc-input lc-input-otp"
                    placeholder="000000"
                    autoComplete="one-time-code"
                    required
                    style={{ paddingLeft:"1.5rem" }}
                  />
                </div>

                <button type="submit" className="lc-btn"
                  disabled={loading || otp.length < 6}>
                  {loading ? (
                    <span style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5"
                        style={{ animation:"spin 0.8s linear infinite" }}>
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                      </svg>
                      Verificando…
                    </span>
                  ) : "✓ Confirmar código"}
                </button>

                <div style={{ textAlign:"center" }}>
                  <button type="button" className="lc-link"
                    onClick={() => { setPaso(1); setError(""); setOtp(""); setUsuarioId(null); }}>
                    ← Volver al inicio
                  </button>
                </div>
              </form>
            )}

            {/* ── Footer ── */}
            <div className="lc-footer">
              NOVONET © {new Date().getFullYear()} · Acceso restringido al sistema ERP
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
