// src/utils/coloresBackoffice.js
// Colores de "etiqueta" para las tablas de Backoffice, al estilo de Jotform:
// cada valor de un campo de opciones se pinta como una pastilla de color.
//
// - Los campos de ESTADO tienen colores fijos con significado (mismos que en Jotform).
// - Los demás campos de opciones (supervisor, forma de pago, provincia, planes…)
//   reciben un color pastel estable calculado a partir del texto: el mismo valor
//   siempre sale del mismo color, en todos los submódulos.
// - Los campos que no están en CAMPOS_CON_COLOR se muestran como texto normal.

// Sin tildes, sin espacios sobrantes, sin punto final y en mayúsculas.
// "Efectivo." y "EFECTIVO" caen en el mismo color.
export function normalizarValor(txt) {
  return String(txt ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ").trim().replace(/\.+$/, "").toUpperCase();
}

const c = (fondo, texto) => ({ fondo, texto });

// Colores fijos por estado (tomados de la tabla de Jotform).
const COLORES_FIJOS = {
  netlife_estatus_real: {
    "PRESERVICIO": c("#c9ddf7", "#1e3a8a"),
    "ASIGNADO": c("#fdd5c9", "#9a3412"),
    "FIN DE GESTION": c("#ef5350", "#ffffff"),
    "PREPLANIFICADO": c("#fdae6b", "#7c2d12"),
    "REPLANIFICADO": c("#fcd34d", "#78350f"),
    "ACTIVO": c("#86d993", "#14532d"),
    "FACTIBLE": c("#ddd6fe", "#5b21b6"),
    "RECHAZADO": c("#f87171", "#ffffff"),
    "ANULADO": c("#9ca3af", "#ffffff"),
    "DETENIDO": c("#fde68a", "#78350f"),
    "DUPLICADO": c("#e5e7eb", "#374151"),
    "ZONA PELIGROSA": c("#fecaca", "#991b1b"),
    "FUERA DE COBERTURA": c("#fee2e2", "#991b1b"),
    "DESISTE DEL SERVICIO": c("#fbcfe8", "#9d174d"),
    "ELIMINADO": c("#d1d5db", "#1f2937"),
    "SIN ESTADO": c("#f1f5f9", "#64748b"),
  },
  calidad_venta_analista: {
    "EN CURSO": c("#4f8ef7", "#ffffff"),
    "APROBADO": c("#6cc070", "#0b3d13"),
    "FIN DE GESTION": c("#93c5fd", "#1e3a8a"),
    "RECHAZADO": c("#ef5350", "#ffffff"),
  },
  estatus_regularizacion: {
    "SIN REVISAR": c("#f1f5f9", "#475569"),
    "POR REGULARIZAR": c("#fde68a", "#92400e"),
    "NO REQUIERE REGULARIZAR": c("#ede9fe", "#6d28d9"),
    "REGULARIZADO": c("#bbf7d0", "#047857"),
    "GESTION ATC": c("#fecdd3", "#be123c"),
  },
};

// Paleta pastel parecida a la de Jotform para los demás campos de opciones.
const PALETA = [
  c("#fdd9b5", "#7c2d12"), // durazno
  c("#fde0dc", "#9f1239"), // salmón
  c("#fce7f3", "#9d174d"), // rosado
  c("#e9d5ff", "#6b21a8"), // lavanda
  c("#c7f0e8", "#115e59"), // menta
  c("#d9f99d", "#3f6212"), // lima
  c("#bfe3c0", "#14532d"), // verde
  c("#bae6fd", "#075985"), // celeste
  c("#fef08a", "#713f12"), // amarillo
  c("#c7d2fe", "#3730a3"), // índigo
  c("#f5d0a9", "#7c2d12"), // canela
  c("#e5e7eb", "#374151"), // gris
];

// Campos que se muestran como pastilla de color.
export const CAMPOS_CON_COLOR = new Set([
  // estados
  "netlife_estatus_real", "calidad_venta_analista", "estatus_regularizacion",
  "auditoria_documentos", "estado_recaudacion", "estatus_envio", "venta_efectiva",
  "gestion_atc", "errores_telcos",
  // opciones de la venta
  "distribuidor_autorizado", "supervisor", "origen_venta", "venta_nueva_o_reingreso",
  "clausulas", "tipo_cliente", "tipo_contrato", "forma_pago", "banco",
  "aplica_descuento_3ra_edad", "plan_contratado_final", "servicios_digitales",
  "turno_agendado",
  // opciones del cliente
  "genero_cliente", "tipo_documento", "estado_civil", "provincia", "ciudad",
  "tipo_vivienda", "regimen_vivienda",
]);

function hashTexto(txt) {
  let h = 0;
  for (let i = 0; i < txt.length; i++) h = (h * 31 + txt.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Devuelve { fondo, texto } para pintar el valor, o null si ese campo/valor
 * se debe mostrar como texto normal (campo sin color o valor vacío).
 */
export function colorDeValor(campo, valor) {
  if (!CAMPOS_CON_COLOR.has(campo)) return null;
  const v = normalizarValor(valor);
  if (!v || v === "—") return null;
  const fijo = COLORES_FIJOS[campo]?.[v];
  if (fijo) return fijo;
  return PALETA[hashTexto(v) % PALETA.length];
}
