import { useState, useEffect, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { io } from "socket.io-client";

const API = import.meta.env.VITE_API_URL;

// ─────────────────────────────────────────────────────────────────────────────
// SONIDOS
// ─────────────────────────────────────────────────────────────────────────────
const playSound = (tipo) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const sounds = {
      chime:    [{ freq: 523.25, t: 0, dur: .2 }, { freq: 659.25, t: .15, dur: .2 }, { freq: 783.99, t: .3, dur: .3 }],
      alerta:   [{ freq: 880, t: 0, dur: .15 }, { freq: 880, t: .25, dur: .15 }, { freq: 1100, t: .45, dur: .3 }],
      victoria: [{ freq: 523.25, t: 0, dur: .15 }, { freq: 659.25, t: .1, dur: .15 }, { freq: 783.99, t: .2, dur: .15 }, { freq: 1046.5, t: .3, dur: .4 }],
      error:    [{ freq: 440, t: 0, dur: .2 }, { freq: 330, t: .2, dur: .3 }],
    };
    (sounds[tipo] || sounds.chime).forEach(({ freq, t, dur }) => {
      if (!freq) return;
      const osc = ctx.createOscillator();
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
// PARTÍCULAS
// ─────────────────────────────────────────────────────────────────────────────
const CONFETTI_COLORS = ["#fbbf24","#10b981","#f97316","#f472b6","#60a5fa","#a78bfa","#34d399"];

function Particulas({ efecto }) {
  const pieces = Array.from({ length: 50 }, (_, i) => i);
  if (!efecto || efecto === "ninguno") return null;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 1 }}>
      {pieces.map(i => {
        if (efecto === "confeti") return (
          <div key={i} style={{
            position: "absolute", top: "-20px",
            left: `${Math.random() * 100}%`,
            width: `${6 + Math.random() * 8}px`, height: `${10 + Math.random() * 10}px`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            borderRadius: i % 3 === 0 ? "50%" : "2px",
            animation: `confettiFall ${1.5 + Math.random() * 2}s ${Math.random() * 0.8}s ease-in forwards`,
          }} />
        );
        if (efecto === "alertaroja") return (
          <div key={i} style={{
            position: "absolute", inset: 0,
            border: "10px solid #ef4444",
            animation: "alertFlash .5s ease-in-out infinite",
            pointerEvents: "none",
          }} />
        );
        if (efecto === "estrellas") return (
          <div key={i} style={{
            position: "absolute",
            left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
            width: `${4 + Math.random() * 6}px`, height: `${4 + Math.random() * 6}px`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            borderRadius: "50%",
            animation: `starTwinkle ${1 + Math.random() * 2}s ${Math.random() * 2}s ease-in-out infinite`,
          }} />
        );
        return null;
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DATOS VIVOS — versión compacta para overlay
// ─────────────────────────────────────────────────────────────────────────────
function DatosVivos({ tipo, datos, colorTexto }) {
  if (!datos) return null;
  const s = { color: colorTexto };

  if ((tipo === "top_asesores" || tipo === "top_activas") && Array.isArray(datos)) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center", marginTop: 16 }}>
      {datos.slice(0, 5).map((a, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12,
          background: "rgba(255,255,255,.12)", borderRadius: 10, padding: "7px 20px", minWidth: 260 }}>
          <span style={{ fontSize: 18 }}>{["🥇","🥈","🥉","4️⃣","5️⃣"][i]}</span>
          <span style={{ fontSize: 14, fontWeight: 800, flex: 1, ...s }}>{a.nombre}</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: "#fbbf24" }}>
            {a.ingresos ?? a.activas}
          </span>
        </div>
      ))}
    </div>
  );

  if (tipo === "sin_ventas" && Array.isArray(datos)) return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center",
      maxWidth: 560, margin: "16px auto 0" }}>
      {datos.slice(0, 10).map((nombre, i) => (
        <span key={i} style={{ background: "rgba(239,68,68,.25)", borderRadius: 20,
          padding: "4px 12px", fontSize: 13, fontWeight: 700, ...s }}>{nombre}</span>
      ))}
    </div>
  );

  if (tipo === "resumen_dia" && datos && !Array.isArray(datos)) return (
    <div style={{ display: "flex", gap: 24, justifyContent: "center", marginTop: 16 }}>
      {[
        { label: "Ingresos Jot", val: datos.ingresos_hoy, color: "#34d399" },
        { label: "Activas",      val: datos.activas_hoy,  color: "#60a5fa" },
        { label: "Gest. Diaria", val: datos.gestion_diaria, color: "#fbbf24" },
      ].map(({ label, val, color }) => (
        <div key={label} style={{ textAlign: "center",
          background: "rgba(255,255,255,.1)", borderRadius: 12, padding: "12px 20px" }}>
          <div style={{ fontSize: 36, fontWeight: 900, color, lineHeight: 1 }}>{val ?? 0}</div>
          <div style={{ fontSize: 10, fontWeight: 700, ...s, opacity: .7,
            textTransform: "uppercase", letterSpacing: ".1em", marginTop: 4 }}>{label}</div>
        </div>
      ))}
    </div>
  );

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// BROADCAST OVERLAY FULLSCREEN
// ─────────────────────────────────────────────────────────────────────────────
const TIPO_ICONOS = {
  urgente: "🚨", prevencion: "⚠️", logro: "🏆", info: "📢", personalizado: "✨",
};

function BroadcastOverlay({ mensaje, onClose }) {
  const [progreso, setProgreso] = useState(100);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!mensaje) return;
    setProgreso(100);
    const duracion = (parseInt(mensaje.duracion) || 30) * 1000;
    const paso = 100 / (duracion / 100);
    intervalRef.current = setInterval(() => {
      setProgreso(p => {
        if (p - paso <= 0) { clearInterval(intervalRef.current); onClose(); return 0; }
        return p - paso;
      });
    }, 100);
    return () => clearInterval(intervalRef.current);
  }, [mensaje]);

  if (!mensaje) return null;

  const colorFondo  = mensaje.color_fondo  || "#0f172a";
  const colorTexto  = mensaje.color_texto  || "#ffffff";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: colorFondo,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column",
      animation: "broadcastIn .4s cubic-bezier(.34,1.56,.64,1) forwards",
    }}>
      <style>{`
        @keyframes broadcastIn { from { opacity:0; transform:scale(.92); } to { opacity:1; transform:scale(1); } }
        @keyframes confettiFall { 0% { transform:translateY(-10px) rotate(0deg); opacity:1; } 100% { transform:translateY(110vh) rotate(720deg); opacity:0; } }
        @keyframes alertFlash { 0%,100% { opacity:.08; } 50% { opacity:.4; } }
        @keyframes starTwinkle { 0%,100% { transform:scale(1); opacity:.8; } 50% { transform:scale(2.5); opacity:1; } }
        @keyframes pulseIcon { 0%,100% { transform:scale(1); } 50% { transform:scale(1.15); } }
      `}</style>

      {/* Partículas */}
      <Particulas efecto={mensaje.efecto} />

      {/* Imagen de fondo */}
      {mensaje.imagen_url && (
        <img src={`${API}${mensaje.imagen_url}`} alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", opacity: .2, zIndex: 0 }} />
      )}

      {/* Contenido */}
      <div style={{ position: "relative", zIndex: 2, textAlign: "center",
        maxWidth: "75vw", padding: "0 20px" }}>
        <div style={{ fontSize: "min(8vw,72px)", marginBottom: "2vh",
          animation: "pulseIcon 1.8s ease-in-out infinite" }}>
          {TIPO_ICONOS[mensaje.tipo] || "📢"}
        </div>
        <div style={{
          fontSize: "min(5vw,52px)", fontWeight: 900,
          color: colorTexto, textTransform: "uppercase",
          letterSpacing: ".03em", lineHeight: 1.1,
          textShadow: "0 4px 20px rgba(0,0,0,.4)",
          marginBottom: "2vh", wordBreak: "break-word",
        }}>
          {mensaje.titulo}
        </div>
        {mensaje.mensaje && (
          <div style={{ fontSize: "min(2.4vw,24px)", fontWeight: 600,
            color: colorTexto, opacity: .9, lineHeight: 1.5,
            maxWidth: "55vw", margin: "0 auto 2vh", wordBreak: "break-word" }}>
            {mensaje.mensaje}
          </div>
        )}
        <DatosVivos tipo={mensaje.datos_vivos} datos={mensaje.datosVivos} colorTexto={colorTexto} />
      </div>

      {/* Barra de progreso */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
        height: 5, background: "rgba(255,255,255,.15)", zIndex: 3 }}>
        <div style={{ height: "100%", width: `${progreso}%`,
          background: colorTexto, transition: "width .1s linear" }} />
      </div>

      {/* Tiempo restante + cerrar */}
      <div style={{ position: "absolute", top: 16, right: 16, zIndex: 4,
        display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 11, color: colorTexto, opacity: .5, fontWeight: 700 }}>
          {Math.ceil(progreso * parseInt(mensaje.duracion || 30) / 100)}s
        </span>
        <button onClick={onClose}
          style={{ background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)",
            borderRadius: "50%", width: 38, height: 38, cursor: "pointer",
            color: colorTexto, fontSize: 16, display: "flex",
            alignItems: "center", justifyContent: "center",
            backdropFilter: "blur(8px)" }}>
          ✕
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD LAYOUT PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser]                       = useState(null);
  const [sidebarOpen, setSidebarOpen]         = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const [broadcast, setBroadcast]             = useState(null);
  const socketRef                             = useRef(null);

  const BG_IMAGE = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop";

  useEffect(() => {
    const userData = localStorage.getItem("userProfile");
    if (!userData) { navigate("/login"); return; }
    setUser(JSON.parse(userData));
  }, [navigate]);

  // ── Socket.io — escucha broadcasts ────────────────────────────────────────
  // 🔐 ACTUALIZACIÓN: Agregar autenticación JWT en Socket.io
  useEffect(() => {
    socketRef.current = io(API, {
      auth: { token: localStorage.getItem('token') },  // ← JWT token requerido
      transports: ["websocket"]
    });
    socketRef.current.on("broadcast_mensaje", (data) => {
      setBroadcast(data);
      if (data.sonido && data.sonido !== "ninguno") playSound(data.sonido);
    });
    return () => socketRef.current?.disconnect();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userProfile");
    navigate("/login");
  };

  if (!user) return null;

  const menuItems = [
    { name: "Inicio",             path: "/",                 icon: "🏠" },
    { name: "Indicadores",        path: "/indicadores",      icon: "📊" },
    { name: "Ventas",             path: "/ventas",           icon: "📈" },
    { name: "RRHH",               path: "/rrhh",             icon: "👥" },
    { name: "Horarios",           path: "/horarios",         icon: "⏰" },
    { name: "Billetera",          path: "/billetera",        icon: "💳" },
    { name: "Comisiones",         path: "/comisiones",       icon: "💰" },
    { name: "Seguimient Venta",   path: "/Seguimiento_Venta",icon: "✔️" },
    { name: "Redes",              path: "/redes",            icon: "🚩" },
  ];

  return (
    <>
      {/* ── BROADCAST OVERLAY — aparece encima de TODO ── */}
      {broadcast && (
        <BroadcastOverlay mensaje={broadcast} onClose={() => setBroadcast(null)} />
      )}

      <div
        className="flex h-screen bg-cover bg-center overflow-hidden relative"
        style={{ backgroundImage: `url(${BG_IMAGE})` }}
      >
        <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm z-0"></div>

        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 z-20 md:hidden backdrop-blur-sm"
          ></div>
        )}

        {/* SIDEBAR */}
        <aside
          className={`
            fixed md:static inset-y-0 left-0 z-30
            bg-black/40 backdrop-blur-2xl border-r border-white/10 flex flex-col transition-all duration-500 ease-in-out
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
            md:translate-x-0
            ${isDesktopCollapsed ? "md:w-20" : "md:w-72"}
          `}
        >
          <button
            onClick={() => setIsDesktopCollapsed(!isDesktopCollapsed)}
            className="hidden md:flex absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-20 bg-blue-600/80 hover:bg-blue-500 backdrop-blur-md rounded-r-2xl items-center justify-center text-white border-y border-r border-white/20 z-50 shadow-[5px_0_15px_rgba(0,0,0,0.3)] transition-all group"
          >
            <div className={`transition-transform duration-500 ${isDesktopCollapsed ? "rotate-180" : ""}`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 group-hover:scale-125 transition-transform">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </div>
          </button>

          <div className="p-8 border-b border-white/5 flex justify-center items-center overflow-hidden">
            <h1 className={`font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 transition-all duration-500 ${isDesktopCollapsed ? "text-xs opacity-0" : "text-2xl opacity-100"}`}>
              NOVONET PRO
            </h1>
            {isDesktopCollapsed && <span className="text-blue-400 font-bold text-xl">N</span>}
          </div>

          <nav className="flex-1 px-3 py-10 space-y-4 overflow-y-auto custom-scrollbar">
            {menuItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.name}
                  onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                  className={`w-full flex items-center rounded-2xl transition-all duration-300 group ${
                    isDesktopCollapsed ? "justify-center h-14" : "px-5 py-4 space-x-5"
                  } ${
                    isActive
                      ? "bg-blue-600/20 border border-blue-500/40 text-white shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className={`${isDesktopCollapsed ? "text-3xl" : "text-2xl"} transition-all group-hover:scale-110 drop-shadow-md`}>
                    {item.icon}
                  </span>
                  {!isDesktopCollapsed && <span className="font-bold tracking-wide truncate">{item.name}</span>}
                </button>
              );
            })}
          </nav>

          <div className={`p-6 border-t border-white/5 bg-black/20 ${isDesktopCollapsed ? "text-center px-2" : ""}`}>
            <div className={`flex items-center mb-6 ${isDesktopCollapsed ? "justify-center" : "space-x-4"}`}>
              <div className="w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center font-black text-white shadow-xl border border-white/10">
                {user.usuario.charAt(0).toUpperCase()}
              </div>
              {!isDesktopCollapsed && (
                <div className="overflow-hidden text-left">
                  <p className="text-sm font-black text-white truncate uppercase tracking-tight">{user.usuario}</p>
                  <p className="text-[10px] text-blue-400 font-bold tracking-widest uppercase">Online</p>
                </div>
              )}
            </div>
            <button onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 text-[10px] font-black text-red-400 hover:text-white hover:bg-red-500/30 py-3 rounded-xl border border-red-500/20 transition-all uppercase tracking-widest">
              <span>🚫</span>
              {!isDesktopCollapsed && <span>Desconectar</span>}
            </button>
          </div>
        </aside>

        {/* ÁREA DE CONTENIDO */}
        <main className="flex-1 flex flex-col relative z-10 overflow-hidden w-full transition-all duration-500">
          <header className="h-20 flex items-center justify-between px-8 border-b border-white/5 bg-black/20 shrink-0 backdrop-blur-md">
            <div className="flex items-center gap-6">
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-3 text-white bg-white/10 rounded-xl"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic bg-clip-text">
                {menuItems.find(m => m.path === location.pathname)?.name}
              </h2>
            </div>
          </header>

          <div className="flex-1 overflow-auto p-4 md:p-10 w-full transition-all">
            <Outlet />
          </div>
        </main>
      </div>
    </>
  );
}