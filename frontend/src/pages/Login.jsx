import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ usuario: "", contraseña: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // IMAGEN DE FONDO (Tecnología oscura / Cyberpunk corporativo)
  const BG_IMAGE = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop";

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("https://velsa-backend.onrender.com/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await response.json();

      if (data.success) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("userProfile", JSON.stringify(data.user));
        navigate("/");
      } else {
        setError("Acceso denegado. Verifica tus credenciales.");
      }
    } catch (err) {
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
      {/* Capa oscura para mejorar lectura */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

      {/* Tarjeta de Cristal (Glassmorphism) */}
      <div className="relative z-10 w-full max-w-md p-8 rounded-2xl border border-white/10 bg-white/10 backdrop-blur-md shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white tracking-wider drop-shadow-lg">MI ERP</h1>
          <p className="text-blue-200 mt-2 font-light">Acceso Corporativo Seguro</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-100 text-sm text-center backdrop-blur-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
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
            {loading ? "Autenticando..." : "Ingresar al Sistema"}
          </button>
        </form>
      </div>
    </div>
  );
}