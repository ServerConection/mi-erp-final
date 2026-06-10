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
      transports: ["websocket", "polling"],   // polling como fallback si WS falla
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });
    socketSingleton.on("connect", () => {
      console.log("[Socket] Conectado:", socketSingleton.id);
    });
    socketSingleton.on("connect_error", (err) => {
      console.warn("[Socket] Error de conexión:", err.message);
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
  const [progreso,      setProgreso]      = useState(100);
  const [audioBlocked,  setAudioBlocked]  = useState(false);
  const intervalRef = useRef(null);
  const audioRef    = useRef(null);
  const playTimerRef = useRef(null);

  const tryPlay = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play()
      .then(() => setAudioBlocked(false))
      .catch(() => setAudioBlocked(true));
  };

  useEffect(() => {
    if (!mensaje) return;
    setProgreso(100);
    setAudioBlocked(false);

    // Diferir play para dar tiempo al DOM + ref
    playTimerRef.current = setTimeout(tryPlay, 150);

    const duracion = (parseInt(mensaje.duracion) || 30) * 1000;
    const paso = 100 / (duracion / 100);
    intervalRef.current = setInterval(() => {
      setProgreso(p => {
        if (p - paso <= 0) {
          clearInterval(intervalRef.current);
          if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
          onClose();
          return 0;
        }
        return p - paso;
      });
    }, 100);
    return () => {
      clearTimeout(playTimerRef.current);
      clearInterval(intervalRef.current);
      if (audioRef.current) { audioRef.current.pause(); }
    };
  }, [mensaje]);

  if (!mensaje) return null;

  const colorFondo = mensaje.color_fondo || "#0f172a";
  const colorTexto = mensaje.color_texto || "#ffffff";
  // audio_url puede ser ruta relativa (/uploads/...) o URL externa
  const audioSrc = mensaje.audio_url
    ? (mensaje.audio_url.startsWith('http') ? mensaje.audio_url : `${API}${mensaje.audio_url}`)
    : null;

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

      {/* Audio adjunto — se reproduce automáticamente */}
      {audioSrc && (
        <audio ref={audioRef} src={audioSrc} preload="auto" />
      )}

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
        {/* Audio: botón manual si autoplay fue bloqueado */}
        {audioSrc && audioBlocked && (
          <button
            onClick={tryPlay}
            style={{
              marginTop: 14, padding: "8px 20px", borderRadius: 10,
              background: "rgba(255,255,255,.20)", border: "1px solid rgba(255,255,255,.35)",
              color: colorTexto, fontSize: 13, fontWeight: 700, cursor: "pointer",
              backdropFilter: "blur(6px)",
            }}>
            🔊 Reproducir audio
          </button>
        )}
        {audioSrc && !audioBlocked && (
          <div style={{ marginTop: 10, fontSize: 12, color: colorTexto, opacity: .5, fontWeight: 600 }}>
            🎵 Audio en reproducción
          </div>
        )}
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
// ── Helpers de acceso por perfil/empresa ──────────────────────────────────────
const isAdmin     = (p)    => p === 'ADMINISTRADOR';
const isAnalGer   = (p)    => p === 'ANALISTA' || p === 'GERENCIA';
const forEmpresa  = (p, e, emp) => isAdmin(p) || (isAnalGer(p) && e === emp);

const ALL_MENU_ITEMS = [
  { name: "Inicio",             path: "/",                    icon: "🏠", permiso: null },
  { name: "Guía Comercial",     path: "/guia-planes-marzo",   icon: "📖", permiso: null },
  { name: "Indicadores",        path: "/indicadores",              icon: "📊", permiso: "Indicadores" },
  { name: "Comparativa Sup.",   path: "/comparativa-supervisores", icon: "📈", permiso: "Indicadores" },
  { name: "Indicadores VELSA",  path: "/indicadores-velsa",        icon: "📊", permiso: "IndicadoresVelsa" },
  // BitrixLive: todos los perfiles EXCEPTO ASESOR y CONSULTOR
  { name: "🟢 Bitrix Live",     path: "/bitrix-live",  icon: "🟢",
    accessCheck: (p) => p !== 'ASESOR' && p !== 'CONSULTOR' },
  { name: "Vista Asesor",       path: "/vista-asesor",        icon: "👤", permiso: "VistaAsesor" },
  { name: "Vista Asesor VELSA", path: "/vista-asesor-velsa",  icon: "👤", permiso: "VistaAsesorVelsa" },
  { name: "Seguimiento Venta",  path: "/seguimiento-ventas",  icon: "✔️", permiso: "SeguimientoVentas" },
  { name: "Seguimiento VELSA",  path: "/seguimiento-velsa",   icon: "✔️", permiso: "SeguimientoVelsa" },
  { name: "Redes",              path: "/redes",               icon: "🚩", permiso: "Redes" },
  { name: "WinTracker",         path: "/redes-wintracker",    icon: "📺", permiso: "Redes", isChild: true },
  { name: "Ventas Formulario",  path: "/ventas",              icon: "📝", permiso: "VentasFormulario" },
  { name: "🆕 Ingresar Venta", path: "/nueva-venta",         icon: "💼",
    accessCheck: (p) => p !== 'ASESOR' && p !== 'CONSULTOR' },
  { name: "🔍 Backoffice",    path: "/backoffice",           icon: "🔍",
    accessCheck: (p) => p !== 'ASESOR' && p !== 'CONSULTOR' },
  { name: "🏆 Mundialito",    path: "/mundialito",           icon: "🏆",
    accessCheck: (p) => p !== 'CONSULTOR' },
  { name: "📊 Reporte Jefatura", path: "/reporte-jefatura",  icon: "📊",
    accessCheck: (p) => p !== 'ASESOR' && p !== 'CONSULTOR' },
  { name: "RRHH",               path: "/rrhh",                icon: "👥", permiso: "RRHH" },
  { name: "Horarios",           path: "/horarios",            icon: "⏰", permiso: "Horarios" },
  { name: "Billetera",          path: "/billetera",           icon: "💳", permiso: "Billetera" },
  { name: "Comisiones",         path: "/comisiones",          icon: "💰", permiso: "Comisiones" },
  { name: "Resumen NOVONET",    path: "/resumen-novonet",     icon: "📊", permiso: "ResumenNovonet" },
  { name: "Resumen VELSA",      path: "/resumen-velsa",       icon: "🟣", permiso: "ResumenVelsa" },
  { name: "JOT Formulario",     path: "/jot-formulario",      icon: "📋", permiso: null },
  // Broadcast por canal — acceso según empresa + perfil
  { name: "📡 Broadcast NOVONET", path: "/broadcast-novonet", icon: "📡",
    accessCheck: (p, e) => forEmpresa(p, e, 'NOVONET') },
  { name: "📡 Broadcast VELSA",   path: "/broadcast-velsa",   icon: "📡",
    accessCheck: (p, e) => forEmpresa(p, e, 'VELSA') },
  // ── WhatsApp ────────────────────────────────────────────────────────────────
  { name: "─── WhatsApp ───", path: null, icon: "", accessCheck: (p) => p !== 'CONSULTOR', isSeparator: true },
  { name: "📱 Líneas",      path: "/whatsapp/lineas",    icon: "📱", accessCheck: (p) => p !== 'CONSULTOR' },
  { name: "💬 Inbox",       path: "/whatsapp/inbox",     icon: "💬", accessCheck: (p) => p !== 'CONSULTOR' },
  { name: "📣 Campañas",    path: "/whatsapp/campanas",  icon: "📣", accessCheck: (p) => p !== 'CONSULTOR' },
  { name: "🤖 Chatbots",    path: "/whatsapp/chatbots",  icon: "🤖", accessCheck: (p) => p !== 'CONSULTOR' },
  { name: "👥 Contactos",   path: "/whatsapp/contactos", icon: "👥", accessCheck: (p) => p !== 'CONSULTOR' },
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

  // Ref para acceder al user actualizado dentro del handler del socket
  // (evita el problema de closure obsoleto con useEffect de [])
  const userRef = useRef(null);

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
      userRef.current = parsedUser;   // ← siempre actualizado
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
      // Filtrar por empresa: el backend emite a todos, aquí decidimos si mostrar
      const u      = userRef.current;
      const perfil = (u?.perfil  || '').toUpperCase();
      const emp    = (u?.empresa || '').toUpperCase();
      const canal  = (data.canal || '').toLowerCase();

      const debeVer =
        perfil === 'ADMINISTRADOR'  ||   // admin ve todo
        !canal                      ||   // sin canal = para todos
        canal === emp.toLowerCase();     // canal coincide con empresa del usuario

      if (!debeVer) return;

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
    if (!user) return;
    if (RUTAS_PUBLICAS.includes(location.pathname)) return;

    const itemActual = ALL_MENU_ITEMS.find(m => !m.isSeparator && m.path === location.pathname);
    if (!itemActual) return;

    const p = (user.perfil  || '').toUpperCase();
    const e = (user.empresa || '').toUpperCase();

    if (itemActual.accessCheck) {
      if (!itemActual.accessCheck(p, e)) navigate('/');
    } else if (itemActual.permiso) {
      if (permisos.length === 0) return; // permisos aún cargando
      if (!permisos.includes(itemActual.permiso)) navigate('/');
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

  const menuItems = ALL_MENU_ITEMS.filter(item => {
    if (item.accessCheck) {
      const p = (user?.perfil  || '').toUpperCase();
      const e = (user?.empresa || '').toUpperCase();
      return item.accessCheck(p, e);
    }
    return !item.permiso || permisos.includes(item.permiso);
  });

  // Solo ítems navegables (sin separadores) para búsqueda de título/icono
  const navItems = menuItems.filter(item => !item.isSeparator);

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
        @keyframes dl-fadein { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
        .dl-nav-label { animation: dl-fadein .22s cubic-bezier(.16,1,.3,1) both; }
        .dl-nav-btn { transition: background .16s ease, color .16s ease, box-shadow .16s ease, transform .16s ease; }
        .dl-nav-btn:hover:not(.dl-active) { background: rgba(37,99,235,.05) !important; color: #1e40af !important; transform: translateX(2px); }
        .dl-active { background: linear-gradient(90deg,rgba(37,99,235,.12),rgba(37,99,235,.04)) !important; color: #2563eb !important; border-left: 3px solid #2563eb !important; box-shadow: 0 2px 10px -2px rgba(37,99,235,.18) !important; }
        .dl-logout { transition: background .15s ease, border-color .15s ease, transform .15s ease; }
        .dl-logout:hover { background: #fef2f2 !important; border-color: #fca5a5 !important; transform: translateY(-1px); }
        @keyframes dl-logoshine { 0%,100%{opacity:.7} 50%{opacity:1} }
        .dl-header-shadow { box-shadow: 0 1px 0 #e8edf5, 0 4px 16px -4px rgba(15,23,42,.06) !important; }
        .dl-status-dot { animation: dl-pulse 2.4s ease-in-out infinite; }
        @keyframes dl-pulse { 0%,100% { box-shadow: 0 0 0 2.5px rgba(34,197,94,.22); } 50% { box-shadow: 0 0 0 4.5px rgba(34,197,94,.14); } }
      `}</style>

      {/* ── Fondo general claro ── */}
      <div className="flex h-screen overflow-hidden" style={{ background: "linear-gradient(160deg,#f8fafc 0%,#f1f5f9 100%)" }}>

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
              padding: isDesktopCollapsed ? "1.1rem 0" : "1.1rem 1.25rem",
              justifyContent: isDesktopCollapsed ? "center" : "flex-start",
              borderBottom: "1px solid #f1f5f9",
              minHeight: 64,
              background: "linear-gradient(90deg,rgba(37,99,235,.03),transparent)",
            }}
          >
            <div
              className="shrink-0 flex items-center justify-center rounded-xl"
              style={{
                width: 36, height: 36,
                background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)",
                boxShadow: "0 4px 12px rgba(37,99,235,.35), 0 0 0 3px rgba(37,99,235,.10)",
                flexShrink: 0,
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
              <div className="dl-nav-label ml-3 overflow-hidden">
                <span className="font-black tracking-wide" style={{ fontSize: "1.05rem", color: "#0f172a", whiteSpace: "nowrap" }}>
                  NOVO <span style={{ background: "linear-gradient(90deg,#2563eb,#4f46e5)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>ERP</span>
                </span>
                <p style={{ fontSize: "0.6rem", color: "#94a3b8", margin: 0, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700 }}>Sistema de Gestión</p>
              </div>
            )}
          </div>

          {/* Nav */}
          <nav
            className="flex-1 dl-sidebar-scrollbar overflow-y-auto"
            style={{ padding: isDesktopCollapsed ? "1rem 0.5rem" : "1rem 0.75rem" }}
          >
            {/* Separador de sección */}
            {!isDesktopCollapsed && (
              <p style={{ fontSize: "0.58rem", fontWeight: 800, color: "#c1c9d4", textTransform: "uppercase", letterSpacing: "0.14em", padding: "0 0.5rem", marginBottom: "0.5rem" }}>
                Navegación
              </p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {menuItems.map((item) => {
                // Separador de sección
                if (item.isSeparator) {
                  if (isDesktopCollapsed) return (
                    <div key={item.name} style={{ height: 1, background: "#e2e8f0", margin: "6px 4px" }} />
                  );
                  return (
                    <div key={item.name} style={{
                      fontSize: "0.58rem", fontWeight: 800, color: "#c1c9d4",
                      textTransform: "uppercase", letterSpacing: "0.14em",
                      padding: "0.6rem 0.5rem 0.2rem",
                    }}>
                      WhatsApp
                    </div>
                  );
                }

                const isActive = location.pathname === item.path;
                const isChild  = item.isChild && !isDesktopCollapsed;
                return (
                  <button
                    key={item.name}
                    onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                    className={`w-full flex items-center dl-nav-btn ${isActive ? "dl-active" : ""}`}
                    style={{
                      borderRadius: 10,
                      padding: isDesktopCollapsed ? "0.6rem 0" : isChild ? "0.42rem 0.75rem 0.42rem 1.75rem" : "0.52rem 0.75rem",
                      justifyContent: isDesktopCollapsed ? "center" : "flex-start",
                      gap: isDesktopCollapsed ? 0 : 10,
                      border: isActive ? "none" : "none",
                      borderLeft: isActive ? "3px solid #2563eb" : "3px solid transparent",
                      color: isActive ? "#2563eb" : isChild ? "#7c8fa6" : "#64748b",
                      fontWeight: isActive ? 700 : 500,
                      cursor: "pointer",
                      background: isActive ? "linear-gradient(90deg,rgba(37,99,235,.10),rgba(37,99,235,.03))" : "transparent",
                      fontSize: isChild ? "0.75rem" : undefined,
                    }}
                  >
                    {isChild && !isDesktopCollapsed && (
                      <span style={{ color: "#94a3b8", fontSize: "0.65rem", flexShrink: 0, marginRight: -4 }}>└</span>
                    )}
                    <span style={{ fontSize: isDesktopCollapsed ? "1.35rem" : isChild ? "0.9rem" : "1.05rem", lineHeight: 1, flexShrink: 0, filter: isActive ? "none" : "saturate(.8)" }}>
                      {item.icon}
                    </span>
                    {!isDesktopCollapsed && (
                      <span className="dl-nav-label truncate" style={{ fontSize: isChild ? "0.75rem" : "0.8rem", letterSpacing: ".01em" }}>
                        {item.name}
                      </span>
                    )}
                    {isActive && !isDesktopCollapsed && (
                      <div style={{ marginLeft: "auto", width: 5, height: 5, borderRadius: "50%", background: "#2563eb", flexShrink: 0, boxShadow: "0 0 0 3px rgba(37,99,235,.20)" }} />
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
              background: "linear-gradient(180deg,#fafafa,#f8fafc)",
            }}
          >
            <div
              style={{
                display: "flex", alignItems: "center",
                gap: isDesktopCollapsed ? 0 : 10,
                justifyContent: isDesktopCollapsed ? "center" : "flex-start",
                marginBottom: "0.6rem",
              }}
            >
              <div
                style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  background: "linear-gradient(135deg, #2563eb, #4f46e5)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, color: "white", fontSize: "0.9rem",
                  boxShadow: "0 3px 10px rgba(37,99,235,.30)",
                  letterSpacing: "-.01em",
                }}
              >
                {user.usuario?.charAt(0).toUpperCase() || "U"}
              </div>
              {!isDesktopCollapsed && (
                <div className="dl-nav-label overflow-hidden flex-1">
                  <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "#0f172a", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {user.usuario}
                  </p>
                  <p style={{ fontSize: "0.62rem", fontWeight: 600, margin: 0, whiteSpace: "nowrap",
                    background: "linear-gradient(90deg,#2563eb,#4f46e5)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                    {user.perfil} · {user.empresa}
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="dl-logout w-full flex items-center justify-center"
              style={{
                gap: 6, fontSize: "0.68rem", fontWeight: 700, color: "#ef4444",
                background: "transparent", border: "1px solid #fecaca",
                borderRadius: 8, padding: "0.42rem", cursor: "pointer",
                textTransform: "uppercase", letterSpacing: "0.06em",
                transition: "background .15s ease",
              }}
            >
              <span style={{ fontSize: "0.85rem" }}>⏻</span>
              {!isDesktopCollapsed && <span>Desconectar</span>}
            </button>
          </div>
        </aside>

        {/* ════ MAIN CONTENT ════ */}
        <main className="flex-1 flex flex-col overflow-hidden w-full transition-all duration-300" style={{ minWidth: 0 }}>

          {/* Header */}
          <header
            className="shrink-0 flex items-center justify-between dl-header-shadow"
            style={{
              height: 60,
              padding: "0 1.5rem",
              background: "white",
              borderBottom: "1px solid #e8edf5",
            }}
          >
            <div className="flex items-center gap-3">
              {/* Hamburguesa mobile */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden flex items-center justify-center rounded-xl"
                style={{ width: 34, height: 34, background: "#f8fafc", border: "1px solid #e2e8f0", cursor: "pointer" }}
              >
                <svg className="w-4 h-4" fill="none" stroke="#64748b" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Breadcrumb / título */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: "linear-gradient(135deg,#2563eb,#4f46e5)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.9rem",
                }}>
                  {navItems.find(m => m.path === location.pathname)?.icon || "🏠"}
                </div>
                <div>
                  <h2 style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: ".01em", lineHeight: 1.2 }}>
                    {navItems.find(m => m.path === location.pathname)?.name || "Dashboard"}
                  </h2>
                  <p style={{ fontSize: "0.62rem", color: "#94a3b8", margin: 0, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 600 }}>
                    {new Date().toLocaleDateString("es-GT", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              </div>
            </div>

            {/* Lado derecho */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 7,
                background: "#f8fafc", border: "1px solid #e2e8f0",
                borderRadius: 99, padding: "4px 12px 4px 8px",
              }}>
                <div className="dl-status-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#334155", letterSpacing: ".02em" }}>
                  {user.usuario}
                </span>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-auto" style={{ padding: "1.25rem 1.5rem" }}>
            <Outlet />
          </div>
        </main>
      </div>
    </>
  );
}
