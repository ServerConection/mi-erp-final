export const FILTER_KEYS = ['desde', 'hasta', 'empresa', 'origen', 'asesor_id', 'etapa'];
const SERIALIZE_KEYS = ['empresa', 'origen', 'asesor_id', 'etapa', 'desde', 'hasta'];

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
