// Cliente API del módulo Soporte Desarrollo (/api/soporte).
const BASE = `${import.meta.env.VITE_API_URL}/api/soporte`;

const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

async function pedir(path, { method = "GET", body, form } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: form ? auth() : { ...auth(), "Content-Type": "application/json" },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  let data = {};
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok || data.success === false) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export const soporteApi = {
  me: () => pedir("/me").then((d) => d.data),
  tickets: (alcance = "mios") => pedir(`/tickets?alcance=${alcance}`).then((d) => d.data),
  crear: (form) => pedir("/tickets", { method: "POST", form }),
  cambiarEstado: (id, estado, respuesta) =>
    pedir(`/tickets/${id}/estado`, { method: "PATCH", body: { estado, respuesta } }).then((d) => d.data),
  visto: (id) => pedir(`/tickets/${id}/visto`, { method: "POST" }),
  avisos: () => pedir("/avisos").then((d) => d.data),
  metricas: (desde, hasta) =>
    pedir(`/metricas?desde=${desde || ""}&hasta=${hasta || ""}`).then((d) => d.data),
  adjuntoBlob: async (id) => {
    const r = await fetch(`${BASE}/adjuntos/${id}`, { headers: auth() });
    if (!r.ok) throw new Error("No se pudo cargar la captura");
    return r.blob();
  },
};

// WABOT primero: es la herramienta a la que más se reporta.
export const MODULOS_SOPORTE = [
  "WABOT (WhatsApp)",
  "Bitrix24",
  "Indicadores NOVONET",
  "Indicadores VELSA",
  "Vista Asesor",
  "Mis Negociaciones",
  "Nueva Venta / Envíos de ventas",
  "Seguimiento de Ventas",
  "Backoffice",
  "Contactabilidad",
  "NEXO IA",
  "BotAuditor",
  "Reparto de Gestionables",
  "Bolsa Leads",
  "Automarcador / Llamadas",
  "Guía de Planes",
  "Cobertura",
  "Comisiones",
  "Rol de Pagos",
  "Control Horarios / NOVONET ACCESS",
  "Evaluaciones",
  "Recursos Humanos (TTHH)",
  "Inventario de Activos TI",
  "Chat Interno",
  "Login / Acceso al ERP",
  "Otro",
];

export const TIPOS_SOPORTE = {
  INCIDENCIA:          { label: "Reportar una falla", corto: "Incidencia", icono: "🛠️", color: "bg-rose-100 text-rose-700" },
  CREACION_USUARIO:    { label: "Creación de usuario", corto: "Crear usuario", icono: "👤", color: "bg-emerald-100 text-emerald-700" },
  ELIMINACION_USUARIO: { label: "Eliminación de usuario", corto: "Eliminar usuario", icono: "🚫", color: "bg-amber-100 text-amber-700" },
};

export const ESTADOS_SOPORTE = {
  SIN_ATENDER: { label: "Sin atender", color: "bg-rose-500", suave: "bg-rose-50 border-rose-200 text-rose-700" },
  EN_PROCESO:  { label: "En proceso",  color: "bg-amber-500", suave: "bg-amber-50 border-amber-200 text-amber-700" },
  ATENDIDO:    { label: "Atendido",    color: "bg-emerald-500", suave: "bg-emerald-50 border-emerald-200 text-emerald-700" },
};

export const hace = (f) => {
  if (!f) return "";
  const min = Math.max(0, Math.round((Date.now() - new Date(f).getTime()) / 60000));
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
};

export const duracion = (min) => {
  if (min === null || min === undefined) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${min % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
};

export const fechaHora = (f) => (f ? new Date(f).toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" }) : "—");
