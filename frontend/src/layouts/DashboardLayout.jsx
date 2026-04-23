import { useState, useEffect, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { io } from "socket.io-client";

const API = import.meta.env.VITE_API_URL;

// ─────────────────────────────────────────────────────────────────────────────
// RUTAS QUE NO REQUIEREN PERMISOS ESPECIALES
// ─────────────────────────────────────────────────────────────────────────────
const RUTAS_PUBLICAS = ['/guia-planes-marzo', '/broadcast']; // ✅ FIX: era '/guia-comercial'

// ─────────────────────────────────────────────────────────────────────────────
// SOCKET SINGLETON
// ─────────────────────────────────────────────────────────────────────────────
let socketSingleton = null;

const getSocket = () => {
  if (!socketSingleton) {
    socketSingleton = io(API, {
      auth: { token: localStorage.getItem('token') },
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });
  }
  return socketSingleton;
};

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
// DATOS VIVOS
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
        { label: "Ingresos Jot", val: datos.ingresos_hoy,   color: "#34d399" },
        { label: "Activas",      val: datos.activas_hoy,    color: "#60a5fa" },
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
// BROADCAST OVERLAY
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

  const colorFondo = mensaje.color_fondo || "#0f172a";
  const colorTexto = mensaje.color_texto || "#ffffff";

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

      <Particulas efecto={mensaje.efecto} />

      {mensaje.imagen_url && (
        <img src={`${API}${mensaje.imagen_url}`} alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", opacity: .2, zIndex: 0 }} />
      )}

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

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
        height: 5, background: "rgba(255,255,255,.15)", zIndex: 3 }}>
        <div style={{ height: "100%", width: `${progreso}%`,
          background: colorTexto, transition: "width .1s linear" }} />
      </div>

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
// MENÚ
// ─────────────────────────────────────────────────────────────────────────────
const ALL_MENU_ITEMS = [
  { name: "Inicio",             path: "/",                    icon: "🏠", permiso: null },
  { name: "Guía Comercial",     path: "/guia-planes-marzo",   icon: "📖", permiso: null }, // ✅ FIX: era '/guia-comercial'
  { name: "Indicadores",        path: "/indicadores",              icon: "📊", permiso: "Indicadores" },
  { name: "Comparativa Sup.",   path: "/comparativa-supervisores", icon: "📈", permiso: "Indicadores" },
  { name: "Indicadores VELSA",  path: "/indicadores-velsa",        icon: "📊", permiso: "IndicadoresVelsa" },
  { name: "Vista Asesor",       path: "/vista-asesor",        icon: "👤", permiso: "VistaAsesor" },
  { name: "Vista Asesor VELSA", path: "/vista-asesor-velsa",  icon: "👤", permiso: "VistaAsesorVelsa" },
  { name: "Seguimiento Venta",  path: "/seguimiento-ventas",  icon: "✔️", permiso: "SeguimientoVentas" },
  { name: "Seguimiento VELSA",  path: "/seguimiento-velsa",   icon: "✔️", permiso: "SeguimientoVelsa" },
  { name: "Redes",              path: "/redes",               icon: "🚩", permiso: "Redes" },
  { name: "Ventas Formulario",  path: "/ventas",              icon: "📝", permiso: "VentasFormulario" },
  { name: "RRHH",               path: "/rrhh",                icon: "👥", permiso: "RRHH" },
  { name: "Horarios",           path: "/horarios",            icon: "⏰", permiso: "Horarios" },
  { name: "Billetera",          path: "/billetera",           icon: "💳", permiso: "Billetera" },
  { name: "Comisiones",         path: "/comisiones",          icon: "💰", permiso: "Comisiones" },
];

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD LAYOUT
// ─────────────────────────────────────────────────────────────────────────────
export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser]                             = useState(null);
  const [permisos, setPermisos]                     = useState([]);
  const [sidebarOpen, setSidebarOpen]               = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const [broadcast, setBroadcast]                   = useState(null);

  const BG_IMAGE = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop";

  // ── Cargar usuario y permisos ───────────────────────────────────────────────
  useEffect(() => {
    const userData = localStorage.getItem("userProfile");
    if (!userData) {
      navigate("/login");
      return;
    }
    try {
      const parsedUser = JSON.parse(userData);
      setUser(parsedUser);

      if (Array.isArray(parsedUser.permisos) && parsedUser.permisos.length > 0) {
        setPermisos(parsedUser.permisos);
      } else {
        if (!RUTAS_PUBLICAS.includes(location.pathname)) {
          console.warn("Sin permisos definidos → cerrando sesión");
          navigate("/login");
        }
      }
    } catch (err) {
      console.error("Error parseando usuario:", err);
      navigate("/login");
    }
  }, [navigate]);

  // ── Socket.io para broadcasts ───────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    const handleBroadcast = (data) => {
      setBroadcast(data);
      if (data.sonido && data.sonido !== "ninguno") playSound(data.sonido);
    };
    socket.off("broadcast_mensaje", handleBroadcast);
    socket.on("broadcast_mensaje", handleBroadcast);
    return () => {
      socket.off("broadcast_mensaje", handleBroadcast);
    };
  }, []);

  // ── Proteger rutas ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || permisos.length === 0) return;
    if (RUTAS_PUBLICAS.includes(location.pathname)) return;

    const itemActual = ALL_MENU_ITEMS.find(m => m.path === location.pathname);
    if (!itemActual) return;
    if (itemActual.permiso && !permisos.includes(itemActual.permiso)) {
      navigate("/");
    }
  }, [location.pathname, permisos, user, navigate]);

  const handleLogout = () => {
    if (socketSingleton) {
      socketSingleton.disconnect();
      socketSingleton = null;
    }
    localStorage.removeItem("token");
    localStorage.removeItem("userProfile");
    navigate("/login");
  };

  if (!user) return null;

  const menuItems = ALL_MENU_ITEMS.filter(item =>
    !item.permiso || permisos.includes(item.permiso)
  );

  return (
    <>
      {broadcast && (
        <BroadcastOverlay mensaje={broadcast} onClose={() => setBroadcast(null)} />
      )}

      {/* ── Estilos del layout claro ── */}
      <style>{`
        .dl-sidebar-scrollbar::-webkit-scrollbar { width: 4px; }
        .dl-sidebar-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .dl-sidebar-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 99px; }
        .dl-sidebar-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
        @keyframes dl-fadein { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
        .dl-nav-label { animation: dl-fadein .2s ease both; }
      `}</style>

      {/* ── Fondo general claro ── */}
      <div className="flex h-screen overflow-hidden" style={{ background: "#f1f5f9" }}>

        {/* Overlay mobile */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-20 md:hidden"
            style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}
          />
        )}

        {/* ════ SIDEBAR ════ */}
        <aside
          className={`fixed md:static inset-y-0 left-0 z-30 flex flex-col transition-all duration-300 ease-in-out
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
            md:translate-x-0
            ${isDesktopCollapsed ? "md:w-20" : "md:w-64"}`}
          style={{
            background: "white",
            borderRight: "1px solid #e2e8f0",
            boxShadow: "2px 0 16px rgba(30,58,138,0.06)",
          }}
        >
          {/* Botón colapsar */}
          <button
            onClick={() => setIsDesktopCollapsed(!isDesktopCollapsed)}
            className="hidden md:flex absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-16 rounded-r-xl items-center justify-center z-50 transition-all group"
            style={{
              background: "#2563eb",
              border: "1px solid #1d4ed8",
              boxShadow: "3px 0 12px rgba(37,99,235,0.25)",
            }}
          >
            <div className={`transition-transform duration-300 ${isDesktopCollapsed ? "rotate-180" : ""}`}>
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="white" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </div>
          </button>

          {/* Logo NOVO ERP */}
          <div
            className="flex items-center overflow-hidden shrink-0"
            style={{
              padding: isDesktopCollapsed ? "1.25rem 0" : "1.25rem 1.25rem",
              justifyContent: isDesktopCollapsed ? "center" : "flex-start",
              borderBottom: "1px solid #f1f5f9",
              minHeight: 68,
            }}
          >
            {/* Ícono WiFi */}
            <div
              className="shrink-0 flex items-center justify-center rounded-xl"
              style={{
                width: 36, height: 36,
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                boxShadow: "0 4px 12px rgba(37,99,235,0.30)",
              }}
            >
              <svg width="18" height="15" viewBox="0 0 24 20" fill="none">
                <path d="M2 6Q12 0 22 6"    stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M5 11Q12 5 19 11"  stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M9 16Q12 13 15 16" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                <circle cx="12" cy="19" r="2" fill="white"/>
              </svg>
            </div>
            {!isDesktopCollapsed && (
              <span
                className="dl-nav-label ml-3 font-black tracking-wide"
                style={{ fontSize: "1.1rem", color: "#1e3a8a", whiteSpace: "nowrap" }}
              >
                NOVO <span style={{ color: "#2563eb" }}>ERP</span>
              </span>
            )}
          </div>

          {/* Nav */}
          <nav
            className="flex-1 dl-sidebar-scrollbar overflow-y-auto"
            style={{ padding: isDesktopCollapsed ? "1rem 0.5rem" : "1rem 0.75rem" }}
          >
            {/* Separador de sección */}
            {!isDesktopCollapsed && (
              <p style={{ fontSize: "0.6rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", padding: "0 0.75rem", marginBottom: "0.4rem" }}>
                Menú
              </p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {menuItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <button
                    key={item.name}
                    onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                    className="w-full flex items-center transition-all duration-200 group"
                    style={{
                      borderRadius: 10,
                      padding: isDesktopCollapsed ? "0.6rem 0" : "0.55rem 0.75rem",
                      justifyContent: isDesktopCollapsed ? "center" : "flex-start",
                      gap: isDesktopCollapsed ? 0 : 10,
                      background: isActive ? "#eff6ff" : "transparent",
                      border: isActive ? "1px solid #bfdbfe" : "1px solid transparent",
                      color: isActive ? "#2563eb" : "#64748b",
                      fontWeight: isActive ? 700 : 500,
                      cursor: "pointer",
                    }}
                    onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.color = "#1e293b"; } }}
                    onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#64748b"; } }}
                  >
                    <span style={{ fontSize: isDesktopCollapsed ? "1.4rem" : "1.1rem", lineHeight: 1, flexShrink: 0 }}>
                      {item.icon}
                    </span>
                    {!isDesktopCollapsed && (
                      <span className="dl-nav-label truncate" style={{ fontSize: "0.82rem" }}>
                        {item.name}
                      </span>
                    )}
                    {isActive && !isDesktopCollapsed && (
                      <div style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "#2563eb", flexShrink: 0 }} />
                    )}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Footer usuario */}
          <div
            style={{
              padding: isDesktopCollapsed ? "0.75rem 0.5rem" : "0.75rem 1rem",
              borderTop: "1px solid #f1f5f9",
              background: "#fafafa",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: isDesktopCollapsed ? 0 : 10,
                justifyContent: isDesktopCollapsed ? "center" : "flex-start",
                marginBottom: "0.6rem",
              }}
            >
              <div
                style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, color: "white", fontSize: "0.9rem",
                  boxShadow: "0 2px 8px rgba(37,99,235,0.30)",
                }}
              >
                {user.usuario?.charAt(0).toUpperCase() || "U"}
              </div>
              {!isDesktopCollapsed && (
                <div className="dl-nav-label overflow-hidden">
                  <p style={{ fontSize: "0.8rem", fontWeight: 700, color: "#0f172a", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {user.usuario}
                  </p>
                  <p style={{ fontSize: "0.65rem", color: "#2563eb", fontWeight: 600, margin: 0, whiteSpace: "nowrap" }}>
                    {user.perfil} · {user.empresa}
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center transition-all"
              style={{
                gap: 6,
                fontSize: "0.7rem",
                fontWeight: 700,
                color: "#ef4444",
                background: "transparent",
                border: "1px solid #fecaca",
                borderRadius: 8,
                padding: "0.45rem",
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#fef2f2"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              <span>🚫</span>
              {!isDesktopCollapsed && <span>Desconectar</span>}
            </button>
          </div>
        </aside>

        {/* ════ MAIN CONTENT ════ */}
        <main className="flex-1 flex flex-col overflow-hidden w-full transition-all duration-300" style={{ minWidth: 0 }}>

          {/* Header */}
          <header
            className="shrink-0 flex items-center justify-between"
            style={{
              height: 64,
              padding: "0 1.75rem",
              background: "white",
              borderBottom: "1px solid #e2e8f0",
              boxShadow: "0 1px 8px rgba(30,58,138,0.05)",
            }}
          >
            <div className="flex items-center gap-4">
              {/* Hamburguesa mobile */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden flex items-center justify-center rounded-xl transition-colors"
                style={{ width: 36, height: 36, background: "#f1f5f9", border: "1px solid #e2e8f0", cursor: "pointer" }}
              >
                <svg className="w-5 h-5" fill="none" stroke="#64748b" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Título de página */}
              <div>
                <h2 style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "0.01em" }}>
                  {menuItems.find(m => m.path === location.pathname)?.name || "Dashboard"}
                </h2>
                <p style={{ fontSize: "0.7rem", color: "#94a3b8", margin: 0, marginTop: 1 }}>
                  NOVO ERP · {new Date().toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long" })}
                </p>
              </div>
            </div>

            {/* Lado derecho header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Indicador usuario */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 2px rgba(34,197,94,0.25)' }} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
                  {user.usuario}
                </span>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-auto" style={{ padding: '1.25rem 1.5rem' }}>
            <Outlet />
          </div>
        </main>
      </div>
    </>
  );
}
