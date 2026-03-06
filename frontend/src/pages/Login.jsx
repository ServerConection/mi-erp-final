import { useState } from "react";
import { useNavigate } from "react-router-dom";

const BG_IMAGE = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop";
const API = "https://erp-backend-v1-qhk2.onrender.com";

export default function Login() {
  const navigate = useNavigate();

  const [paso, setPaso] = useState(1); // 1 = login, 2 = otp
  const [formData, setFormData] = useState({ usuario: "", contraseña: "" });
  const [otp, setOtp] = useState("");
  const [usuarioId, setUsuarioId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // ─── PASO 1: Login → solicitar OTP ───────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Intentar con dispositivo confiable primero
      const deviceToken = localStorage.getItem("device_token");

      const body = {
        usuario: formData.usuario,
        password: formData.contraseña,
        ...(deviceToken && { device_token: deviceToken })
      };

      const res = await fetch(`${API}/api/otp/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (!data.success) {
        setError("Credenciales inválidas.");
        return;
      }

      // Dispositivo confiable → token directo
      if (data.trusted) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("userProfile", JSON.stringify(data.user));
        navigate("/");
        return;
      }

      // Sin dispositivo confiable → ir a paso OTP
      setUsuarioId(data.usuario_id);
      setPaso(2);

    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  // ─── PASO 2: Verificar OTP ────────────────────────────────────────────────
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API}/api/otp/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario_id: usuarioId, otp })
      });

      const data = await res.json();

      if (!data.success) {
        setError("Código incorrecto o expirado.");
        return;
      }

      // Guardar token y device_token
      localStorage.setItem("token", data.token);
      localStorage.setItem("userProfile", JSON.stringify(data.user));
      localStorage.setItem("device_token", data.device_token);

      navigate("/");

    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-cover bg-center relative"
      style={{ backgroundImage: `url(${BG_IMAGE})` }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

      <div className="relative z-10 w-full max-w-md p-8 rounded-2xl border border-white/10 bg-white/10 backdrop-blur-md shadow-2xl">

        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white tracking-wider drop-shadow-lg">MI ERP</h1>
          <p className="text-blue-200 mt-2 font-light">
            {paso === 1 ? "Acceso Corporativo Seguro" : "Verificación de identidad"}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-100 text-sm text-center backdrop-blur-sm">
            {error}
          </div>
        )}

        {/* ── PASO 1: Usuario y contraseña ── */}
        {paso === 1 && (
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-blue-200 uppercase tracking-wide ml-1">Usuario</label>
              <input
                type="text"
                name="usuario"
                onChange={handleChange}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all backdrop-blur-sm"
                placeholder="Ej. admin"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-blue-200 uppercase tracking-wide ml-1">Contraseña</label>
              <input
                type="password"
                name="contraseña"
                onChange={handleChange}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all backdrop-blur-sm"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3.5 rounded-xl shadow-lg transform transition hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mt-4 border border-white/10"
            >
              {loading ? "Verificando..." : "Ingresar al Sistema"}
            </button>
          </form>
        )}

        {/* ── PASO 2: Código OTP ── */}
        {paso === 2 && (
          <form onSubmit={handleVerifyOtp} className="space-y-6">
            <div className="text-center text-white/70 text-sm mb-2">
              📧 Ingresa el código que enviamos a tu correo
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-blue-200 uppercase tracking-wide ml-1">Código OTP</label>
              <input
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white text-center text-2xl tracking-widest placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all backdrop-blur-sm"
                placeholder="000000"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3.5 rounded-xl shadow-lg transform transition hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mt-4 border border-white/10"
            >
              {loading ? "Verificando..." : "Confirmar Código"}
            </button>

            <button
              type="button"
              onClick={() => { setPaso(1); setError(""); }}
              className="w-full text-white/50 hover:text-white text-sm transition mt-2"
            >
              ← Volver
            </button>
          </form>
        )}
      </div>
    </div>
  );
}