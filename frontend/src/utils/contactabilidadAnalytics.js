// Filtros base del tablero + filtros operativos de contactabilidad.
// El orden de SERIALIZE_KEYS define como se ve la URL compartible.
export const BASE_FILTER_KEYS = ['desde', 'hasta', 'empresa', 'origen', 'asesor_id', 'etapa'];
export const OPERATIVE_FILTER_KEYS = [
  'pendiente_por', 'severidad', 'min_espera', 'temperatura', 'q', 'solo_con_mensajes',
];
export const FILTER_KEYS = [...BASE_FILTER_KEYS, ...OPERATIVE_FILTER_KEYS];
const SERIALIZE_KEYS = [
  'empresa', 'origen', 'asesor_id', 'etapa', 'desde', 'hasta', ...OPERATIVE_FILTER_KEYS,
];

// Un unico diccionario de severidad para tabla, semaforo y leyendas.
export const SEVERITY_META = {
  CRITICO: { label: 'Crítico', color: '#b91c1c', bg: '#fee2e2', orden: 0 },
  GRAVE: { label: 'Grave', color: '#c2410c', bg: '#ffedd5', orden: 1 },
  ALERTA: { label: 'En alerta', color: '#a16207', bg: '#fef9c3', orden: 2 },
  OK: { label: 'Al día', color: '#15803d', bg: '#dcfce7', orden: 3 },
};

export const severityMeta = (valor) => SEVERITY_META[String(valor || 'OK').toUpperCase()] || SEVERITY_META.OK;

/**
 * Severidad de una fila. Usa la que calculo el servidor y, si no llego,
 * la deduce en el navegador para que la tabla nunca quede sin semaforo.
 */
export function rowSeverity(row = {}, umbrales = { alerta: 15, grave: 30, critico: 60 }, now = Date.now()) {
  if (row.severidad) return String(row.severidad).toUpperCase();
  if (row.pendiente_por !== 'ASESOR' || !row.ultimo_mensaje_cliente_at) return 'OK';
  const minutos = Math.floor((now - new Date(row.ultimo_mensaje_cliente_at).getTime()) / 60000);
  if (minutos >= umbrales.critico) return 'CRITICO';
  if (minutos >= umbrales.grave) return 'GRAVE';
  if (minutos >= umbrales.alerta) return 'ALERTA';
  return 'OK';
}

/** "hace 3 min" — se recalcula en el navegador, sin esperar al backend. */
export function formatRelative(value, now = Date.now()) {
  if (!value) return '—';
  const ms = now - new Date(value).getTime();
  if (Number.isNaN(ms)) return '—';
  if (ms < 0) return 'ahora';
  const minutos = Math.floor(ms / 60000);
  if (minutos < 1) return 'hace segundos';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h${minutos % 60 ? ` ${minutos % 60} min` : ''}`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} d${horas % 24 ? ` ${horas % 24} h` : ''}`;
}

/** Minutos que el cliente lleva esperando, recalculados en vivo. */
export function waitingMinutes(row = {}, now = Date.now()) {
  if (row.pendiente_por !== 'ASESOR' || !row.ultimo_mensaje_cliente_at) return null;
  const minutos = Math.floor((now - new Date(row.ultimo_mensaje_cliente_at).getTime()) / 60000);
  return Number.isFinite(minutos) && minutos >= 0 ? minutos : null;
}

export const hasActiveFilters = (filters = {}) =>
  FILTER_KEYS.some((key) => filters[key] !== '' && filters[key] != null);

export function buildAnalyticsQuery(filters = {}) {
  const params = new URLSearchParams();
  SERIALIZE_KEYS.forEach((key) => filters[key] && params.set(key, filters[key]));
  return params.toString();
}

export function readFilters(search = '') {
  const params = new URLSearchParams(search);
  return Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) || '']));
}

export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return 'Sin datos';
  const value = Math.max(0, Math.round(Number(seconds)));
  if (value < 60) return `${value} s`;
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  if (minutes < 60) return `${minutes} min${remainder ? ` ${remainder} s` : ''}`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return `${hours} h${remainingMinutes ? ` ${remainingMinutes} min` : ''}`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days} d${remainingHours ? ` ${remainingHours} h` : ''}`;
}

export function rankOrigins(rows = []) {
  return [...rows].sort((a, b) =>
    Number(a.muestra_insuficiente) - Number(b.muestra_insuficiente)
    || Number(b.tasa_contactabilidad || 0) - Number(a.tasa_contactabilidad || 0)
    || Number(b.leads || 0) - Number(a.leads || 0));
}

export function buildHeatmap(rows = []) {
  const names = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const index = new Map(rows.map((row) => [`${Number(row.dia_semana_iso)}-${Number(row.hora)}`, row]));
  return names.map((dia, dayIndex) => ({
    dia_semana_iso: dayIndex + 1,
    dia,
    hours: Array.from({ length: 16 }, (_, hourIndex) => {
      const hora = hourIndex + 7;
      const source = index.get(`${dayIndex + 1}-${hora}`) || {};
      return {
        hora,
        leads_unicos: Number(source.leads_unicos || 0),
        mensajes_cliente: Number(source.mensajes_cliente || 0),
      };
    }),
  }));
}

export function pendingPriority(row = {}) {
  if (row.pendiente_por !== 'ASESOR') return 'normal';
  const minutes = Number(row.minutos_pendiente || 0);
  if (minutes >= 60) return 'critico';
  if (minutes >= 30) return 'alerta';
  return 'normal';
}
