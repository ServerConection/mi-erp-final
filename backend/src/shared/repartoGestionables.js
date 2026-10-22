/**
 * REPARTO DE GESTIONABLES — ROTACIÓN POR ORDEN (lógica pura).
 *
 * Regla vigente (2026-10-22): NO se iguala por cantidad. Entre los asesores
 * que aún tienen cupo, recibe el que lleva MÁS TIEMPO sin recibir:
 *   1. Quien todavía no recibió hoy va primero (el que recién se conecta
 *      recibe el siguiente lead y luego pasa al final de la fila).
 *   2. Entre los que nunca recibieron, el que se conectó PRIMERO (inicio de
 *      jornada en Bitrix).
 *   3. Si aún empatan, azar.
 * Así quien entra tarde recibe 1 como todos, sin "ponerse al día".
 *
 * candidatos: [{ nombre, permitidos, asignados, ultimaAsignacion: Date|null, conexion: Date|null }]
 * return: el candidato elegido, o null si nadie tiene cupo.
 */
const normalizarNombre = (s) =>
  String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const elegirAsesor = (candidatos, azar = Math.random) => {
  const conCupo = (candidatos || []).filter(
    (c) => Number(c.asignados) < Number(c.permitidos)
  );
  if (conCupo.length === 0) return null;

  const ts = (d) => (d ? new Date(d).getTime() : -Infinity); // nunca recibió = más antiguo
  const tc = (d) => (d ? new Date(d).getTime() : Infinity);  // sin hora de conexión = al final
  const conAzar = conCupo.map((c) => ({ c, r: azar() }));
  conAzar.sort((a, b) =>
    (ts(a.c.ultimaAsignacion) - ts(b.c.ultimaAsignacion)) ||
    (tc(a.c.conexion) - tc(b.c.conexion)) ||
    (a.r - b.r)
  );
  return conAzar[0].c;
};


// ── Horario laboral y cola de la estación ───────────────────────────────────
// Hora actual de Ecuador como "HH:MM:SS" (el servidor de Render está en UTC).
const horaEcuador = (fecha = new Date()) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(fecha).replace(/^24/, '00');

// ¿Se puede entregar leads ahora? inicio/fin inclusive, formato "HH:MM:SS".
const dentroDeHorario = (fecha = new Date(), inicio = '08:00:00', fin = '22:15:59') => {
  const h = horaEcuador(fecha);
  return h >= inicio && h <= fin;
};

/**
 * Ritmo de la cola de la estación:
 *  - 0 asesores disponibles  → no se entrega.
 *  - 1 o 2 disponibles       → 1 lead y esperar `esperaMin` minutos antes del siguiente
 *                              (para no cargar todo a los primeros que se conectan).
 *  - 3 o más                 → entrega normal por rondas.
 * Devuelve cuántos leads de la cola se pueden entregar en esta pasada.
 */
const cupoDeEntregaCola = ({ disponibles, ultimaEntregaCola, ahora = new Date(), esperaMin = 5, maxPorPasada = 30 }) => {
  if (!disponibles || disponibles < 1) return 0;
  if (disponibles >= 3) return maxPorPasada;
  if (ultimaEntregaCola && (ahora - new Date(ultimaEntregaCola)) < esperaMin * 60 * 1000) return 0;
  return 1;
};

module.exports = { elegirAsesor, normalizarNombre, horaEcuador, dentroDeHorario, cupoDeEntregaCola };
