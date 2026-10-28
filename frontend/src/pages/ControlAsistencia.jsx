import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Circle,
  CircleAlert,
  CircleCheck,
  Clock,
  Coffee,
  ListChecks,
  LoaderCircle,
  LogIn,
  LogOut,
  MapPin,
  MapPinOff,
  Monitor,
  Pause,
  Play,
  RefreshCw,
  Utensils,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL;

// ─────────────────────────────────────────────
// ACTIVIDADES
//
// value = lo que se guarda en base de datos
// label = lo que ve el usuario
// ─────────────────────────────────────────────

const ACTIVIDADES = [
  {
    value: "INGRESO",
    label: "Ingreso",
  },

  {
    value: "SALIDA ALMUERZO",
    label: "Salida a almuerzo",
  },

  {
    value: "INGRESO ALMUERZO",
    label: "Regreso de almuerzo",
  },

  {
    value: "SALIDA",
    label: "Salida",
  },
];

function fechaHoyEcuador() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function fechaInicioMesEcuador() {
  const hoy = fechaHoyEcuador();
  return `${hoy.slice(0, 7)}-01`;
}

// ─────────────────────────────────────────────
// KIOSKO DE MARCACIÓN
// ─────────────────────────────────────────────

const ZONA_EC = "America/Guayaquil";
const JORNADA_HORAS = 8;

// Orden natural de la jornada. value = lo que espera el backend.
const PASOS_NOMINA = [
  { value: "INGRESO", titulo: "Ingreso", Icono: LogIn, color: "#0f766e", fondo: "#ccfbf1" },
  { value: "SALIDA ALMUERZO", titulo: "Salida Almuerzo", Icono: Utensils, color: "#c2410c", fondo: "#ffedd5" },
  { value: "INGRESO ALMUERZO", titulo: "Regreso Almuerzo", Icono: Coffee, color: "#4338ca", fondo: "#e0e7ff" },
  { value: "SALIDA", titulo: "Salida Jornada", Icono: LogOut, color: "#be123c", fondo: "#ffe4e6" },
];

// Asesores comisionistas (perfil USUARIO): no es asistencia, es control de
// conexión al sistema para la entrega de leads. Se guardan los mismos códigos
// en BD (el perfil/cargo del registro distingue al comisionista).
const PASOS_COMISIONISTA = [
  { value: "INGRESO", titulo: "Inicio de Conexión Toma de Leads", Icono: LogIn, color: "#0f766e", fondo: "#ccfbf1" },
  { value: "SALIDA ALMUERZO", titulo: "Pausa Recepción Leads", Icono: Pause, color: "#c2410c", fondo: "#ffedd5" },
  { value: "INGRESO ALMUERZO", titulo: "Inicio Segundo Bloque Toma de Leads", Icono: Play, color: "#4338ca", fondo: "#e0e7ff" },
  { value: "SALIDA", titulo: "Fin de Conexión Toma de Leads", Icono: LogOut, color: "#be123c", fondo: "#ffe4e6" },
];

const TEXTOS_NOMINA = {
  kioskoTitulo: "NOVONET ACCESS",
  kioskoSub: "Registra tu ingreso, almuerzo o salida",
  panelTitulo: "Mi Jornada Hoy",
  enCurso: "En jornada",
  enPausa: "En almuerzo",
  finalizado: "Jornada finalizada",
  completo: "Jornada completa · ¡Buen descanso!",
  acumulado: "Tiempo acumulado de jornada",
  pausa: "Almuerzo",
};

const TEXTOS_COMISIONISTA = {
  kioskoTitulo: "Control Conexión Coworking Leads",
  kioskoSub: "Registra tu conexión para la toma de leads",
  panelTitulo: "Mi Conexión Hoy",
  enCurso: "Conectado",
  enPausa: "En pausa",
  finalizado: "Conexión finalizada",
  completo: "Conexión finalizada · ¡Gracias!",
  acumulado: "Tiempo acumulado de conexión",
  pausa: "Pausa",
};

// Fecha (YYYY-MM-DD) y hora (HH:mm:ss) en Ecuador para un timestamp ISO.
function partesEcuador(valor) {
  if (!valor) return null;
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;
  try {
    const dia = new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONA_EC, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(fecha);
    const hora = new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONA_EC, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).format(fecha);
    return { fecha: dia, hora };
  } catch {
    return null;
  }
}

function relojEcuador(fecha) {
  try {
    const partes = new Intl.DateTimeFormat("en-US", {
      timeZone: ZONA_EC, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
    }).formatToParts(fecha);
    const v = (t) => partes.find((p) => p.type === t)?.value || "";
    const largo = new Intl.DateTimeFormat("es-EC", {
      timeZone: ZONA_EC, weekday: "long", day: "numeric", month: "long", year: "numeric",
    }).format(fecha);
    return {
      hms: `${v("hour")}:${v("minute")}:${v("second")}`,
      periodo: v("dayPeriod").toUpperCase(),
      fechaLarga: largo.charAt(0).toUpperCase() + largo.slice(1),
    };
  } catch {
    return { hms: "--:--:--", periodo: "", fechaLarga: "" };
  }
}

function duracionTexto(ms) {
  const minutos = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

const CA_CSS = `
.ca-grid{width:100%;max-width:1180px;display:grid;grid-template-columns:minmax(0,1.65fr) minmax(280px,1fr);gap:20px;align-items:start}
@media (max-width:920px){.ca-grid{grid-template-columns:1fr}}
.ca-card{background:#fff;border:1px solid #e2e8f0;border-radius:18px;box-shadow:0 10px 30px rgba(15,23,42,.06);overflow:hidden}
.ca-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px 22px;border-bottom:1px solid #eef2f7;background:linear-gradient(135deg,#f8fafc,#fff)}
.ca-head-title{display:flex;align-items:center;gap:11px;min-width:0}
.ca-head-title h2{margin:0;font-size:16px;font-weight:900;color:#0f172a}
.ca-head-title p{margin:2px 0 0;font-size:11.5px;color:#64748b}
.ca-head-icon{width:36px;height:36px;flex:0 0 36px;display:grid;place-items:center;border-radius:10px;background:#e0f2fe;color:#0369a1}
.ca-user{display:flex;align-items:center;gap:10px;min-width:0}
.ca-user-text{display:grid;text-align:right;min-width:0}
.ca-user-text strong{font-size:12px;font-weight:900;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
.ca-user-text span{font-size:10.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
.ca-avatar{width:36px;height:36px;flex:0 0 36px;display:grid;place-items:center;border-radius:50%;background:linear-gradient(135deg,#0f766e,#0ea5a4);color:#fff;font-size:12px;font-weight:900}
@media (max-width:560px){.ca-user-text{display:none}}
.ca-body{padding:20px 22px 22px}
.ca-estado{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 14px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}
.ca-estado-label{font-size:11px;font-weight:900;color:#334155;text-transform:uppercase;letter-spacing:.04em}
.ca-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:11.5px;font-weight:800;border:1px solid transparent}
.ca-pill::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.st-off{color:#64748b;background:#f1f5f9;border-color:#e2e8f0}
.st-on{color:#047857;background:#ecfdf5;border-color:#a7f3d0}
.st-on::before{animation:ca-pulse 1.6s infinite}
.st-alm{color:#c2410c;background:#fff7ed;border-color:#fed7aa}
.st-fin{color:#4338ca;background:#eef2ff;border-color:#c7d2fe}
.ca-geo{display:inline-flex;align-items:center;gap:6px;margin-left:auto;padding:4px 10px;border-radius:999px;font-size:11.5px;font-weight:800;border:1px solid}
.ca-geo-ayuda{margin:8px 2px 0;font-size:11.5px;color:#b91c1c}
.ca-reloj{text-align:center;padding:22px 0 18px}
.ca-hora{font-size:clamp(44px,7.5vw,72px);font-weight:900;color:#0f172a;letter-spacing:-.02em;line-height:1;font-variant-numeric:tabular-nums}
.ca-hora span{font-size:.32em;margin-left:8px;color:#475569;letter-spacing:0}
.ca-fecha{margin-top:8px;font-size:14px;font-weight:600;color:#475569}
.ca-acciones{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
@media (max-width:620px){.ca-acciones{grid-template-columns:repeat(2,minmax(0,1fr))}}
.ca-accion{position:relative;display:grid;justify-items:center;gap:7px;padding:16px 8px 12px;border:1.5px solid #e2e8f0;border-radius:14px;background:#fff;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease,background .15s ease;font:inherit}
.ca-accion:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 18px rgba(15,23,42,.08);border-color:var(--c)}
.ca-accion:focus-visible{outline:3px solid color-mix(in srgb,var(--c) 35%,transparent);outline-offset:2px}
.ca-accion:disabled{cursor:wait;opacity:.7}
.ca-accion.is-sel{border-color:var(--c);background:color-mix(in srgb,var(--f) 45%,#fff);box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 18%,transparent)}
.ca-accion.is-hecho:not(.is-sel){background:#f8fafc}
.ca-accion-icon{width:46px;height:46px;display:grid;place-items:center;border-radius:12px;background:var(--f);color:var(--c)}
.ca-accion.is-hecho:not(.is-sel) .ca-accion-icon{filter:grayscale(.35);opacity:.8}
.ca-accion-txt{font-size:12.5px;font-weight:900;color:#0f172a;text-align:center;line-height:1.2}
.ca-accion-hora{font-size:11px;font-weight:700;color:#94a3b8;font-variant-numeric:tabular-nums}
.ca-accion.is-hecho .ca-accion-hora{color:#047857}
.ca-check{position:absolute;top:7px;right:7px;color:#10b981;display:flex}
.ca-badge{position:absolute;top:-9px;left:50%;transform:translateX(-50%);padding:2px 8px;border-radius:999px;background:var(--c);color:#fff;font-size:9.5px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap;box-shadow:0 3px 8px rgba(15,23,42,.15)}
.ca-aviso{display:flex;gap:8px;align-items:flex-start;margin-top:14px;padding:10px 13px;border-radius:10px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:12px;font-weight:700;line-height:1.45}
.ca-registrar{width:100%;margin-top:16px;display:flex;align-items:center;justify-content:center;gap:9px;padding:15px 18px;border:0;border-radius:12px;background:linear-gradient(135deg,#0f766e,#0ea5a4);color:#fff;font:inherit;font-size:14px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;cursor:pointer;box-shadow:0 8px 18px rgba(14,165,164,.25);transition:transform .12s ease,box-shadow .15s ease,opacity .15s}
.ca-registrar:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 12px 22px rgba(14,165,164,.32)}
.ca-registrar:active:not(:disabled){transform:translateY(1px)}
.ca-registrar:disabled{background:#cbd5e1;box-shadow:none;cursor:not-allowed}
.ca-registrar.is-loading{background:#64748b;cursor:wait}
.ca-msg{display:flex;align-items:flex-start;gap:10px;margin-top:14px;padding:13px 15px;border-radius:12px;font-size:13px;font-weight:800;line-height:1.45;animation:ca-in .25s ease}
.ca-msg svg{flex:0 0 auto;margin-top:1px}
.ca-msg.ok{background:#ecfdf5;color:#047857;border:1px solid #a7f3d0}
.ca-msg.ok svg{animation:ca-pop .4s ease}
.ca-msg.err{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}
.ca-ultima{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:16px;padding:10px 12px;border-radius:10px;background:#f8fafc;color:#475569;font-size:12px;font-weight:600;text-align:center}
.ca-refresh{width:32px;height:32px;display:grid;place-items:center;border:1px solid #e2e8f0;border-radius:9px;background:#fff;color:#475569;cursor:pointer}
.ca-refresh:hover:not(:disabled){background:#f1f5f9}
.ca-timeline{list-style:none;margin:0;padding:18px 22px 6px}
.ca-timeline li{position:relative;display:flex;gap:12px;padding-bottom:20px}
.ca-timeline li:last-child{padding-bottom:6px}
.ca-timeline li:not(:last-child)::after{content:"";position:absolute;left:10px;top:24px;bottom:2px;width:2px;background:#e2e8f0}
.ca-timeline li.is-hecho:not(:last-child)::after{background:#a7f3d0}
.ca-dot{position:relative;z-index:1;width:22px;height:22px;display:grid;place-items:center;color:#cbd5e1;background:#fff}
.ca-timeline li.is-hecho .ca-dot{color:#10b981}
.ca-timeline li.is-actual .ca-dot{color:var(--c)}
.ca-timeline strong{display:block;font-size:13px;font-weight:800;color:#0f172a}
.ca-timeline li:not(.is-hecho) strong{color:#64748b}
.ca-timeline li span.ca-t{display:block;margin-top:2px;font-size:12px;font-weight:700;color:#94a3b8;font-variant-numeric:tabular-nums}
.ca-timeline li.is-hecho span.ca-t{color:#047857}
.ca-timeline li.is-actual span.ca-t{color:var(--c)}
.ca-resumen{margin:6px 22px 22px;padding:18px 16px;border-top:1px solid #eef2f7;display:grid;justify-items:center;gap:6px}
.ca-donut-wrap{position:relative;width:150px;height:150px}
.ca-donut{width:150px;height:150px}
.ca-donut-bg{fill:none;stroke:#e2e8f0;stroke-width:12}
.ca-donut-val{fill:none;stroke:#0ea5a4;stroke-width:12;stroke-linecap:round;transition:stroke-dasharray .6s ease}
.ca-donut-centro{position:absolute;inset:0;display:grid;place-content:center;text-align:center}
.ca-donut-centro strong{font-size:22px;font-weight:900;color:#0f172a;font-variant-numeric:tabular-nums}
.ca-donut-centro span{font-size:11px;font-weight:700;color:#64748b}
.ca-resumen p{margin:0;font-size:12px;font-weight:800;color:#334155}
.ca-resumen small{font-size:11.5px;color:#64748b;font-weight:600}
.ca-spin{animation:ca-spin 1s linear infinite}
@keyframes ca-spin{to{transform:rotate(360deg)}}
@keyframes ca-pulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes ca-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@keyframes ca-pop{0%{transform:scale(.4)}70%{transform:scale(1.2)}100%{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.ca-grid *{animation:none!important;transition:none!important}}
`;

function fechaVisible(valor) {
  const match = String(valor || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
}

// ─────────────────────────────────────────────
// FECHA / HORA ECUADOR
// ─────────────────────────────────────────────

function formatearFechaHora(fecha) {
  try {
    const partes =
      new Intl.DateTimeFormat("es-EC", {
        timeZone:
          "America/Guayaquil",

        day: "2-digit",
        month: "2-digit",
        year: "numeric",

        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",

        hour12: false,
      }).formatToParts(fecha);

    const obtener = (tipo) =>
      partes.find(
        (p) => p.type === tipo
      )?.value || "";

    return `${obtener(
      "day"
    )}/${obtener(
      "month"
    )}/${obtener(
      "year"
    )} · ${obtener(
      "hour"
    )}:${obtener(
      "minute"
    )}:${obtener("second")}`;
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────
// HORA SOLA
// ─────────────────────────────────────────────

function formatearHora(fecha) {
  try {
    return new Intl.DateTimeFormat(
      "es-EC",
      {
        timeZone:
          "America/Guayaquil",

        hour: "2-digit",
        minute: "2-digit",

        hour12: false,
      }
    ).format(fecha);
  } catch {
    return "";
  }
}

export default function ControlAsistencia() {
  const [user, setUser] =
    useState(() => {
      try { return JSON.parse(localStorage.getItem("userProfile") || "null"); } catch { return null; }
    });

  const modalidadAsistencia = String(user?.modalidad_asistencia || "").trim().toUpperCase();
  // Compatibilidad para sesiones/BD anteriores a la migración. Cuando el
  // campo explícito existe, siempre tiene prioridad sobre el perfil ERP.
  const perfilParaRespaldo = String(user?.perfil || "").trim().toUpperCase();
  const esComisionista = modalidadAsistencia
    ? modalidadAsistencia === "CONEXION"
    : ["USUARIO", "ASESOR"].includes(perfilParaRespaldo);
  const PASOS = esComisionista ? PASOS_COMISIONISTA : PASOS_NOMINA;
  const empresaAccess = String(user?.empresa || "").trim().toUpperCase() === "VELSA" ? "VELSA" : "NOVONET";
  const TX = {
    ...(esComisionista ? TEXTOS_COMISIONISTA : TEXTOS_NOMINA),
    kioskoTitulo: `${empresaAccess} ACCESS`,
  };
  // El resumen de todos los usuarios solo lo ven perfiles administrativos.
  const perfilActual = String(user?.perfil || "").trim().toUpperCase();
  const puedeVerResumen = ["ADMINISTRADOR", "GERENCIA", "GERENTE"].includes(perfilActual)
    || /^GEREN(?:CIA|TE)[ _-]/.test(perfilActual);

  const [
    actividad,
    setActividad,
  ] = useState("");

  const [
    fechaHora,
    setFechaHora,
  ] = useState(new Date());

  const [loading, setLoading] =
    useState(false);

  const [mensaje, setMensaje] =
    useState(null);

  const [vistaActiva, setVistaActiva] = useState("REGISTRO");
  const [fechaDesde, setFechaDesde] = useState(fechaHoyEcuador);
  const [fechaHasta, setFechaHasta] = useState(fechaHoyEcuador);
  const [filtroEmpresa, setFiltroEmpresa] = useState("TODAS");
  const [resumenDia, setResumenDia] = useState([]);
  const [cargandoResumen, setCargandoResumen] = useState(false);

  const [
    estadoUbicacion,
    setEstadoUbicacion,
  ] = useState("pendiente");

  // Evita dos solicitudes simultáneas.
  const bloqueoEnvioRef =
    useRef(false);

  const timeoutMensajeRef =
    useRef(null);

  // Kiosko: marcaciones propias para armar "Mi jornada hoy".
  const [misRegistros, setMisRegistros] = useState([]);
  const [cargandoJornada, setCargandoJornada] = useState(false);
  const [jornadaCargada, setJornadaCargada] = useState(false);
  const [precisionUbicacion, setPrecisionUbicacion] = useState(null);
  const autoSeleccionRef = useRef(false);

  // ─────────────────────────────────────────────
  // CARGAR PERFIL
  // ─────────────────────────────────────────────

  useEffect(() => {
    let activo = true;
    try {
      const perfil = JSON.parse(
        localStorage.getItem(
          "userProfile"
        ) || "null"
      );

      setUser(perfil);
    } catch {
      setUser(null);
    }

    const cargarPerfilVigente = async () => {
      try {
        const token = localStorage.getItem("token");
        const respuesta = await fetch(`${API}/api/control-asistencia/mi-perfil`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await respuesta.json();
        if (activo && respuesta.ok && payload.success) {
          setUser(anterior => ({ ...(anterior || {}), ...payload.data }));
        }
      } catch (error) {
        console.warn("[ControlAsistencia] No se pudo actualizar el perfil:", error);
      }
    };

    cargarPerfilVigente();
    return () => { activo = false; };
  }, []);

  useEffect(() => {
    if (!puedeVerResumen && vistaActiva === "MARCACIONES") setVistaActiva("REGISTRO");
  }, [puedeVerResumen, vistaActiva]);

  // ─────────────────────────────────────────────
  // RELOJ EN TIEMPO REAL
  // ─────────────────────────────────────────────

  useEffect(() => {
    const intervalo = setInterval(
      () => {
        setFechaHora(new Date());
      },
      1000
    );

    return () =>
      clearInterval(intervalo);
  }, []);

  // ─────────────────────────────────────────────
  // LIMPIAR TIMEOUT
  // ─────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (
        timeoutMensajeRef.current
      ) {
        clearTimeout(
          timeoutMensajeRef.current
        );
      }
    };
  }, []);

  // ─────────────────────────────────────────────
  // MOSTRAR MENSAJE
  // ─────────────────────────────────────────────

  const mostrarMensaje = (
    type,
    text,
    ocultarAutomaticamente = false
  ) => {
    if (
      timeoutMensajeRef.current
    ) {
      clearTimeout(
        timeoutMensajeRef.current
      );
    }

    setMensaje({
      type,
      text,
    });

    if (ocultarAutomaticamente) {
      timeoutMensajeRef.current =
        setTimeout(() => {
          setMensaje(null);
        }, 3500);
    }
  };

  const cargarResumenDia = async (desde = fechaDesde, hasta = fechaHasta) => {
    try {
      setCargandoResumen(true);
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${API}/api/control-asistencia/resumen-dia?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.error || "No se pudo cargar el panel diario");
      }
      setResumenDia(json.data || []);
    } catch (error) {
      mostrarMensaje("error", error.message || "No se pudo cargar el panel diario");
    } finally {
      setCargandoResumen(false);
    }
  };

  const cargarMisRegistros = async () => {
    try {
      setCargandoJornada(true);
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${API}/api/control-asistencia/mis-registros?limit=50`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.error || "No se pudo cargar tu jornada");
      }
      setMisRegistros(Array.isArray(json.data) ? json.data : []);
    } catch (error) {
      console.warn("[ControlAsistencia] Mi jornada:", error);
    } finally {
      setCargandoJornada(false);
      setJornadaCargada(true);
    }
  };

  useEffect(() => {
    cargarMisRegistros();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Estado del permiso de ubicación sin pedirlo todavía (solo informativo).
  useEffect(() => {
    let estadoPermiso = null;
    if (!navigator.permissions?.query) return undefined;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        estadoPermiso = status;
        const aplicar = () => {
          setEstadoUbicacion((previo) => {
            if (previo === "obteniendo" || previo === "disponible") return previo;
            if (status.state === "granted") return "permitida";
            if (status.state === "denied") return "denegada";
            return "pendiente";
          });
        };
        aplicar();
        status.onchange = aplicar;
      })
      .catch(() => {});
    return () => {
      if (estadoPermiso) estadoPermiso.onchange = null;
    };
  }, []);
  useEffect(() => {
    if (vistaActiva === "MARCACIONES") {
      cargarResumenDia(fechaDesde, fechaHasta);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaDesde, fechaHasta, vistaActiva]);

  // ─────────────────────────────────────────────
  // OBTENER GEOLOCALIZACIÓN
  // ─────────────────────────────────────────────

  const obtenerUbicacion = () =>
    new Promise(
      (resolve, reject) => {
        if (
          !navigator.geolocation
        ) {
          reject({
            code: 0,
            message:
              "Geolocalización no disponible",
          });

          return;
        }

        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy: true,
            timeout: 12000,
            maximumAge: 0,
          }
        );
      }
    );

  // ─────────────────────────────────────────────
  // REGISTRAR MARCACIÓN
  // ─────────────────────────────────────────────

  const registrarMarcacion =
    async () => {
      // Evitar doble clic.
      if (
        bloqueoEnvioRef.current
      ) {
        return;
      }

      // Debe elegir actividad.
      if (!actividad) {
        mostrarMensaje(
          "error",
          "Selecciona una actividad antes de registrar."
        );

        return;
      }

      bloqueoEnvioRef.current =
        true;

      setLoading(true);

      setMensaje(null);

      setEstadoUbicacion(
        "obteniendo"
      );

      try {
        let posicion;

        // ───────────────────────────
        // UBICACIÓN
        // ───────────────────────────

        try {
          posicion =
            await obtenerUbicacion();
          setPrecisionUbicacion(
            Math.round(posicion.coords.accuracy || 0) || null
          );

          setEstadoUbicacion(
            "disponible"
          );
        } catch (errorGeo) {
          console.warn(
            "[ControlAsistencia] Geolocalización:",
            errorGeo
          );

          if (
            errorGeo?.code === 1
          ) {
            setEstadoUbicacion(
              "denegada"
            );

            mostrarMensaje(
              "error",
              "Debes permitir el acceso a tu ubicación para registrar la marcación."
            );
          } else if (
            errorGeo?.code === 3
          ) {
            setEstadoUbicacion(
              "error"
            );

            mostrarMensaje(
              "error",
              "No fue posible obtener tu ubicación a tiempo. Intenta nuevamente."
            );
          } else {
            setEstadoUbicacion(
              "error"
            );

            mostrarMensaje(
              "error",
              "No fue posible obtener tu ubicación."
            );
          }

          return;
        }

        // ───────────────────────────
        // TOKEN
        // ───────────────────────────

        const token =
          localStorage.getItem(
            "token"
          );

        // ───────────────────────────
        // BODY
        // ───────────────────────────

        const body = {
          actividad,

          latitud:
            posicion.coords
              .latitude,

          longitud:
            posicion.coords
              .longitude,

          precision_metros:
            posicion.coords
              .accuracy,
        };

        // ───────────────────────────
        // REQUEST
        // ───────────────────────────

        const response =
          await fetch(
            `${API}/api/control-asistencia`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",

                ...(token
                  ? {
                    Authorization: `Bearer ${token}`,
                  }
                  : {}),
              },

              body: JSON.stringify(
                body
              ),
            }
          );

        const json =
          await response
            .json()
            .catch(() => ({}));

        if (
          !response.ok ||
          !json.success
        ) {
          throw new Error(
            json.error ||
            "No se pudo registrar la marcación"
          );
        }

        // ───────────────────────────
        // MENSAJE DEL BACKEND
        // ───────────────────────────

        const mensajeBackend =
          json.mensaje ||
          "Que tengas un excelente día.";

        // ───────────────────────────
        // MENSAJE FINAL
        // ───────────────────────────

        const pasoRegistrado = PASOS.find(
          (paso) => paso.value === actividad
        );
        const horaRegistro =
          partesEcuador(json.data?.created_at)?.hora || "";

        mostrarMensaje(
          "success",
          `${pasoRegistrado?.titulo || "Marcación"} registrado${horaRegistro ? ` a las ${horaRegistro}` : ""}. ${mensajeBackend}`,
          true
        );

        // Limpiamos solo actividad.
        setActividad("");
        await cargarMisRegistros();
        if (vistaActiva === "MARCACIONES") {
          await cargarResumenDia(fechaDesde, fechaHasta);
        }
      } catch (error) {
        console.error(
          "[ControlAsistencia] Error:",
          error
        );

        mostrarMensaje(
          "error",
          error.message ||
          "Error de conexión al registrar"
        );
      } finally {
        bloqueoEnvioRef.current =
          false;

        setLoading(false);
      }
    };

  // ─────────────────────────────────────────────
  // ESTADOS VISUALES UBICACIÓN
  // ─────────────────────────────────────────────

  // ─────────────────────────────────────────────
  // KIOSKO: JORNADA DE HOY (derivado de mis-registros)
  // ─────────────────────────────────────────────

  const hoyEcuador = fechaHoyEcuador();

  // Primera marcación de hoy por actividad (mismo criterio que resumen-dia).
  const jornadaHoy = useMemo(() => {
    const mapa = {};
    for (const registro of misRegistros) {
      const partes = partesEcuador(registro.created_at);
      if (!partes || partes.fecha !== hoyEcuador) continue;
      const clave = String(registro.actividad || "").trim().toUpperCase();
      const ms = new Date(registro.created_at).getTime();
      if (!mapa[clave] || ms < mapa[clave].ms) {
        mapa[clave] = { hora: partes.hora, ms };
      }
    }
    return mapa;
  }, [misRegistros, hoyEcuador]);

  const siguientePaso = jornadaHoy.SALIDA
    ? null
    : PASOS.find((paso) => !jornadaHoy[paso.value]) || null;
  const jornadaCompleta = jornadaCargada && !siguientePaso;

  // Al abrir el módulo se preselecciona la siguiente marcación una sola vez.
  // Después de registrar NO se autoselecciona, para evitar marcar dos cosas
  // seguidas por un doble toque.
  useEffect(() => {
    if (!jornadaCargada || autoSeleccionRef.current) return;
    autoSeleccionRef.current = true;
    if (siguientePaso) setActividad(siguientePaso.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jornadaCargada]);

  const pasoSeleccionado = PASOS.find((paso) => paso.value === actividad) || null;
  const seleccionYaRegistrada = pasoSeleccionado ? jornadaHoy[pasoSeleccionado.value] : null;

  let avisoSeleccion = "";
  if (pasoSeleccionado && seleccionYaRegistrada) {
    avisoSeleccion = `Ya registraste ${pasoSeleccionado.titulo} hoy a las ${seleccionYaRegistrada.hora}. Si continúas se guardará una nueva marcación.`;
  } else if (pasoSeleccionado && pasoSeleccionado.value !== "INGRESO" && !jornadaHoy.INGRESO) {
    avisoSeleccion = `Aún no registras tu ${PASOS[0].titulo} de hoy. Verifica que sea la actividad correcta.`;
  } else if (pasoSeleccionado?.value === "INGRESO ALMUERZO" && !jornadaHoy["SALIDA ALMUERZO"]) {
    avisoSeleccion = `Aún no registras tu ${PASOS[1].titulo}.`;
  }

  // Tiempo trabajado (excluye almuerzo) y tiempo de almuerzo.
  const ahoraMs = fechaHora.getTime();
  const msIngreso = jornadaHoy.INGRESO?.ms;
  const msSalidaAlm = jornadaHoy["SALIDA ALMUERZO"]?.ms;
  const msRegresoAlm = jornadaHoy["INGRESO ALMUERZO"]?.ms;
  const msSalida = jornadaHoy.SALIDA?.ms;
  let trabajadoMs = 0;
  let almuerzoMs = 0;
  if (msIngreso) {
    if (msSalidaAlm && msSalidaAlm > msIngreso) {
      trabajadoMs += msSalidaAlm - msIngreso;
      if (msRegresoAlm && msRegresoAlm > msSalidaAlm) {
        almuerzoMs = msRegresoAlm - msSalidaAlm;
        const fin = msSalida ? Math.max(msSalida, msRegresoAlm) : ahoraMs;
        trabajadoMs += Math.max(0, fin - msRegresoAlm);
      } else if (!msSalida) {
        almuerzoMs = Math.max(0, ahoraMs - msSalidaAlm);
      }
    } else {
      const fin = msSalida ? Math.max(msSalida, msIngreso) : ahoraMs;
      trabajadoMs += Math.max(0, fin - msIngreso);
    }
  }
  const progresoJornada = Math.min(1, trabajadoMs / (JORNADA_HORAS * 3600000));
  const CIRCUNFERENCIA = 2 * Math.PI * 50;

  let estadoJornada = { texto: "Sin iniciar", clase: "st-off" };
  if (msSalida) estadoJornada = { texto: TX.finalizado, clase: "st-fin" };
  else if (msSalidaAlm && !msRegresoAlm) estadoJornada = { texto: TX.enPausa, clase: "st-alm" };
  else if (msIngreso) estadoJornada = { texto: TX.enCurso, clase: "st-on" };

  const ultimoRegistro = misRegistros[0];
  const ultimaPartes = partesEcuador(ultimoRegistro?.created_at);
  const ultimaMarcacion = ultimaPartes
    ? `${fechaVisible(ultimaPartes.fecha)} · ${ultimaPartes.hora} (${PASOS.find((paso) => paso.value === String(ultimoRegistro.actividad || "").toUpperCase())?.titulo || ultimoRegistro.actividad})`
    : "";

  const reloj = relojEcuador(fechaHora);
  const nombreVisible =
    user?.nombreCompleto || user?.nombre_completo || user?.nombre || user?.usuario || "Usuario";
  const iniciales = String(nombreVisible)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte.charAt(0))
    .join("")
    .toUpperCase() || "U";

  const ubicacionInfo = {
    permitida: {
      icono: "✓",
      texto: "Ubicación permitida",
      color: "#047857",
      fondo: "#ecfdf5",
      borde: "#a7f3d0",
    },
    pendiente: {
      icono: "📍",

      texto:
        "La ubicación se solicitará al registrar",

      color: "#64748b",

      fondo: "#f8fafc",

      borde: "#e2e8f0",
    },

    obteniendo: {
      icono: "📡",

      texto:
        "Obteniendo ubicación...",

      color: "#0369a1",

      fondo: "#f0f9ff",

      borde: "#bae6fd",
    },

    disponible: {
      icono: "✓",

      texto:
        "Ubicación disponible",

      color: "#047857",

      fondo: "#ecfdf5",

      borde: "#a7f3d0",
    },

    denegada: {
      icono: "⚠",

      texto:
        "Debes permitir el acceso a ubicación",

      color: "#b91c1c",

      fondo: "#fef2f2",

      borde: "#fecaca",
    },

    error: {
      icono: "⚠",

      texto:
        "No se pudo obtener la ubicación",

      color: "#b45309",

      fondo: "#fffbeb",

      borde: "#fde68a",
    },
  };

  const estadoActual =
    ubicacionInfo[
    estadoUbicacion
    ] ||
    ubicacionInfo.pendiente;

  // ─────────────────────────────────────────────
  // ESTILOS
  // ─────────────────────────────────────────────

  const estiloCampo = {
    width: "100%",

    boxSizing: "border-box",

    padding: "11px 12px",

    borderRadius: 9,

    border:
      "1px solid #dbe4f0",

    fontSize: 13,

    color: "#334155",

    background: "#f8fafc",

    outline: "none",

    fontWeight: 600,
  };

  const estiloLabel = {
    fontSize: 11,

    fontWeight: 800,

    color: "#475569",

    textTransform:
      "uppercase",

    letterSpacing: ".04em",

    marginBottom: 6,
  };

  const empresasResumen = [...new Set(resumenDia.map(fila => fila.empresa || "SIN EMPRESA"))].sort();
  const filasResumen = resumenDia.filter(fila => filtroEmpresa === "TODAS" || (fila.empresa || "SIN EMPRESA") === filtroEmpresa);

  return (
    <div
      style={{
        minHeight:
          "calc(100vh - 90px)",

        padding:
          "32px 20px",

        display: "grid",
        gap: 24,
        justifyItems: "center",

        alignItems:
          "flex-start",
      }}
    >
      <nav
        aria-label="Vistas de control de asistencia"
        style={{
          width: "100%",
          maxWidth: vistaActiva === "MARCACIONES" ? 1600 : 1180,
          padding: 5,
          display: "flex",
          gap: 6,
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 15,
          boxShadow: "0 8px 24px rgba(15,23,42,.06)",
        }}
      >
        {[
          { id: "REGISTRO", icono: "⏱️", texto: "REGISTRAR MARCACIÓN" },
          ...(!puedeVerResumen ? [] : [{ id: "MARCACIONES", icono: "📋", texto: "MARCACIONES DEL DÍA" }]),
        ].map((opcion) => {
          const activa = vistaActiva === opcion.id;
          return (
            <button
              key={opcion.id}
              type="button"
              onClick={() => setVistaActiva(opcion.id)}
              style={{
                flex: 1,
                minHeight: 42,
                padding: "10px 16px",
                border: 0,
                borderRadius: 11,
                background: activa
                  ? "linear-gradient(135deg, #0f766e, #0ea5a4)"
                  : "transparent",
                color: activa ? "#fff" : "#64748b",
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: ".035em",
                cursor: "pointer",
                boxShadow: activa ? "0 6px 14px rgba(14,165,164,.22)" : "none",
                transition: "all .18s ease",
              }}
            >
              <span style={{ marginRight: 7 }}>{opcion.icono}</span>
              {opcion.texto}
            </button>
          );
        })}
      </nav>

      {vistaActiva === "REGISTRO" ? (
      <div className="ca-grid">
        <style>{CA_CSS}</style>

        {/* KIOSKO */}
        <section className="ca-card" aria-label="Kiosko digital de marcación">
          <header className="ca-head">
            <div className="ca-head-title">
              <span className="ca-head-icon"><Monitor size={18} /></span>
              <div>
                <h2>{TX.kioskoTitulo}</h2>
                <p>{TX.kioskoSub}</p>
              </div>
            </div>
            <div className="ca-user">
              <div className="ca-user-text">
                <strong title={nombreVisible}>{nombreVisible}</strong>
                <span>{user?.cargo || "Sin cargo asignado"}</span>
              </div>
              <span className="ca-avatar" aria-hidden="true">{iniciales}</span>
            </div>
          </header>

          <div className="ca-body">
            <div className="ca-estado">
              <span className="ca-estado-label">Estado actual</span>
              <span className={`ca-pill ${estadoJornada.clase}`}>{estadoJornada.texto}</span>
              <span
                className="ca-geo"
                style={{ color: estadoActual.color, background: estadoActual.fondo, borderColor: estadoActual.borde }}
              >
                {estadoUbicacion === "obteniendo" ? (
                  <LoaderCircle size={13} className="ca-spin" />
                ) : estadoUbicacion === "denegada" || estadoUbicacion === "error" ? (
                  <MapPinOff size={13} />
                ) : (
                  <MapPin size={13} />
                )}
                {estadoActual.texto}
                {estadoUbicacion === "disponible" && precisionUbicacion ? ` (±${precisionUbicacion} m)` : ""}
              </span>
            </div>
            {estadoUbicacion === "denegada" && (
              <p className="ca-geo-ayuda">
                Activa la ubicación desde el ícono del candado en la barra del navegador y vuelve a intentar.
              </p>
            )}

            <div className="ca-reloj">
              <div className="ca-hora">
                {reloj.hms}
                <span>{reloj.periodo}</span>
              </div>
              <div className="ca-fecha">{reloj.fechaLarga}</div>
            </div>

            <div className="ca-acciones" role="radiogroup" aria-label="Actividad a registrar">
              {PASOS.map((paso) => {
                const hecho = jornadaHoy[paso.value];
                const seleccionado = actividad === paso.value;
                const sugerido = siguientePaso?.value === paso.value;
                const { Icono } = paso;
                return (
                  <button
                    key={paso.value}
                    type="button"
                    role="radio"
                    aria-checked={seleccionado}
                    disabled={loading}
                    onClick={() => {
                      setActividad(paso.value);
                      setMensaje(null);
                    }}
                    className={`ca-accion${seleccionado ? " is-sel" : ""}${hecho ? " is-hecho" : ""}`}
                    style={{ "--c": paso.color, "--f": paso.fondo }}
                  >
                    {sugerido && <span className="ca-badge">Siguiente</span>}
                    {hecho && (
                      <span className="ca-check" aria-label="Registrado">
                        <CircleCheck size={16} />
                      </span>
                    )}
                    <span className="ca-accion-icon">
                      <Icono size={22} />
                    </span>
                    <span className="ca-accion-txt">{paso.titulo}</span>
                    <span className="ca-accion-hora">{hecho ? hecho.hora.slice(0, 5) : "Pendiente"}</span>
                  </button>
                );
              })}
            </div>

            {avisoSeleccion && (
              <div className="ca-aviso" role="note">
                <CircleAlert size={16} style={{ flex: "0 0 auto", marginTop: 1 }} />
                <span>{avisoSeleccion}</span>
              </div>
            )}

            <button
              type="button"
              onClick={registrarMarcacion}
              disabled={loading || !actividad}
              className={`ca-registrar${loading ? " is-loading" : ""}`}
            >
              {loading ? (
                <>
                  <LoaderCircle size={18} className="ca-spin" />
                  {estadoUbicacion === "obteniendo" ? "Validando ubicación..." : "Registrando..."}
                </>
              ) : pasoSeleccionado ? (
                <>
                  <CircleCheck size={18} />
                  {seleccionYaRegistrada ? "Registrar nuevamente" : "Registrar"} {pasoSeleccionado.titulo}
                </>
              ) : jornadaCompleta ? (
                TX.completo
              ) : (
                "Selecciona una actividad"
              )}
            </button>

            {mensaje && (
              <div
                className={`ca-msg ${mensaje.type === "success" ? "ok" : "err"}`}
                role={mensaje.type === "success" ? "status" : "alert"}
              >
                {mensaje.type === "success" ? <CircleCheck size={20} /> : <CircleAlert size={20} />}
                <span>{mensaje.text}</span>
              </div>
            )}

            <div className="ca-ultima">
              <Clock size={14} />
              {ultimaMarcacion ? `Última marcación: ${ultimaMarcacion}` : cargandoJornada ? "Cargando marcaciones…" : "Aún no tienes marcaciones registradas"}
            </div>
          </div>
        </section>

        {/* MI JORNADA HOY */}
        <aside className="ca-card" aria-label="Mi jornada de hoy">
          <header className="ca-head">
            <div className="ca-head-title">
              <span className="ca-head-icon" style={{ background: "#ccfbf1", color: "#0f766e" }}>
                <ListChecks size={18} />
              </span>
              <div>
                <h2>{TX.panelTitulo}</h2>
                <p>Log de marcaciones</p>
              </div>
            </div>
            <button
              type="button"
              className="ca-refresh"
              onClick={cargarMisRegistros}
              disabled={cargandoJornada}
              title="Actualizar"
              aria-label="Actualizar mi jornada"
            >
              <RefreshCw size={15} className={cargandoJornada ? "ca-spin" : ""} />
            </button>
          </header>

          <ol className="ca-timeline">
            {PASOS.map((paso) => {
              const hecho = jornadaHoy[paso.value];
              const actual = !hecho && siguientePaso?.value === paso.value;
              return (
                <li
                  key={paso.value}
                  className={`${hecho ? "is-hecho" : ""}${actual ? " is-actual" : ""}`}
                  style={{ "--c": paso.color }}
                >
                  <span className="ca-dot">
                    {hecho ? <CircleCheck size={20} /> : <Circle size={20} />}
                  </span>
                  <div>
                    <strong>{paso.titulo}</strong>
                    <span className="ca-t">
                      {hecho ? hecho.hora : actual ? "Siguiente marcación" : "--:--:--"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="ca-resumen">
            <div className="ca-donut-wrap">
              <svg
                viewBox="0 0 120 120"
                className="ca-donut"
                role="img"
                aria-label={`Tiempo acumulado ${duracionTexto(trabajadoMs)} de ${JORNADA_HORAS} horas`}
              >
                <circle cx="60" cy="60" r="50" className="ca-donut-bg" />
                {progresoJornada > 0 && (
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    className="ca-donut-val"
                    strokeDasharray={`${progresoJornada * CIRCUNFERENCIA} ${CIRCUNFERENCIA}`}
                    transform="rotate(-90 60 60)"
                  />
                )}
              </svg>
              <div className="ca-donut-centro">
                <strong>{duracionTexto(trabajadoMs)}</strong>
                <span>de {JORNADA_HORAS}h</span>
              </div>
            </div>
            <p>{TX.acumulado}</p>
            {almuerzoMs > 0 && <small>{TX.pausa}: {duracionTexto(almuerzoMs)}</small>}
          </div>
        </aside>
      </div>
      ) : (
      <section style={{ width: "100%", maxWidth: 1600, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, boxShadow: "0 10px 30px rgba(15,23,42,.07)", overflow: "hidden" }}>
        <div style={{ padding: "22px 24px", borderBottom: "1px solid #e8eef5", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", background: "linear-gradient(135deg,#f0fdfa 0%,#ffffff 65%)" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 38, height: 38, display: "grid", placeItems: "center", borderRadius: 11, background: "#ccfbf1", fontSize: 18 }}>📋</div>
              <div>
                <h2 style={{ margin: 0, fontSize: 19, fontWeight: 900, color: "#0f172a" }}>Marcaciones del día</h2>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "#64748b" }}>{filasResumen.length} usuario{filasResumen.length === 1 ? "" : "s"} con registros</p>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => { const hoy = fechaHoyEcuador(); setFechaDesde(hoy); setFechaHasta(hoy); }}
              style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #99f6e4", background: "#f0fdfa", color: "#0f766e", fontSize: 11, fontWeight: 900, cursor: "pointer" }}
            >
              HOY
            </button>
            <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 800, color: "#475569", textTransform: "uppercase" }}>
              Empresa
              <select value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 13, fontWeight: 700, color: "#334155", background: "#fff", outline: "none" }}>
                <option value="TODAS">Todas</option>
                {empresasResumen.map(empresa => <option key={empresa} value={empresa}>{empresa}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 800, color: "#475569", textTransform: "uppercase" }}>
              Desde
              <input type="date" value={fechaDesde} max={fechaHasta} onChange={(e) => setFechaDesde(e.target.value)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 13, fontWeight: 700, color: "#334155", background: "#fff", outline: "none" }} />
            </label>
            <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 800, color: "#475569", textTransform: "uppercase" }}>
              Hasta
              <input type="date" value={fechaHasta} min={fechaDesde} onChange={(e) => setFechaHasta(e.target.value)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 13, fontWeight: 700, color: "#334155", background: "#fff", outline: "none" }} />
            </label>
          </div>
        </div>
        {mensaje?.type === "error" && (
          <div style={{ margin: "16px 20px 0", padding: "11px 14px", borderRadius: 10, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", fontSize: 12, fontWeight: 700 }}>{mensaje.text}</div>
        )}
        <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 500px), 1fr))", gap: 18, alignItems: "start" }}>
          {["NOVONET", "VELSA"].map((empresa) => {
            const filas = filasResumen.filter(fila => (fila.empresa || "SIN EMPRESA") === empresa);
            const color = empresa === "NOVONET" ? { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" } : { bg: "#f5f3ff", border: "#ddd6fe", text: "#6d28d9" };
            return (
              <section key={empresa} style={{ minWidth: 0, border: `1px solid ${color.border}`, borderRadius: 14, overflow: "hidden", background: "#fff" }}>
                <div style={{ padding: "12px 15px", display: "flex", justifyContent: "space-between", alignItems: "center", background: color.bg, color: color.text, fontSize: 12, fontWeight: 900, letterSpacing: ".06em" }}>
                  <span>{empresa}</span><span>{filas.length} usuario{filas.length === 1 ? "" : "s"}</span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 720 }}>
                    <thead><tr style={{ background: "#f8fafc" }}>
                      {["Fecha", "Usuario", "Ingreso", "Salida almuerzo", "Regreso almuerzo", "Salida"].map((titulo) => (
                        <th key={titulo} style={{ padding: "11px 12px", borderBottom: "1px solid #e2e8f0", textAlign: "left", fontSize: 9, color: "#64748b", textTransform: "uppercase", whiteSpace: "nowrap" }}>{titulo}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {filas.map((fila) => (
                        <tr key={`${fila.fecha}-${fila.usuario_id}`}>
                          <td style={{ padding: "12px", borderBottom: "1px solid #f1f5f9", fontSize: 11, fontWeight: 700 }}>{fechaVisible(fila.fecha)}</td>
                          <td style={{ padding: "12px", borderBottom: "1px solid #f1f5f9" }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: "#0f172a" }}>{fila.nombre_completo || fila.usuario || "Usuario"}</div>
                            {fila.usuario && <div style={{ marginTop: 2, fontSize: 9, color: "#64748b" }}>@{fila.usuario}</div>}
                          </td>
                          {[fila.ingreso, fila.salida_almuerzo, fila.regreso_almuerzo, fila.salida].map((hora, index) => (
                            <td key={index} style={{ padding: "12px", borderBottom: "1px solid #f1f5f9" }}><span style={{ display: "inline-block", minWidth: 46, padding: "5px 7px", textAlign: "center", borderRadius: 8, fontSize: 11, fontWeight: 900, color: hora ? "#0f766e" : "#94a3b8", background: hora ? "#f0fdfa" : "#f8fafc" }}>{hora || "—"}</span></td>
                          ))}
                        </tr>
                      ))}
                      {!cargandoResumen && filas.length === 0 && <tr><td colSpan={6} style={{ padding: 28, textAlign: "center", color: "#94a3b8", fontSize: 12 }}>No hay marcaciones de {empresa}.</td></tr>}
                      {cargandoResumen && <tr><td colSpan={6} style={{ padding: 28, textAlign: "center", color: "#64748b", fontSize: 12 }}>Cargando marcaciones…</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      </section>
      )}
    </div>
  );
}
