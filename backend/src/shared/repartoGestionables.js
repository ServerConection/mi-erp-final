/**
 * REPARTO DE GESTIONABLES POR RONDAS (sin favoritismo) — lógica pura.
 *
 * Regla: entre los asesores que AÚN tienen cupo hoy (asignados < permitidos),
 * gana el que MENOS gestionables lleva asignados hoy. Así nadie recibe su
 * lead N+1 hasta que todos los que tienen cupo recibieron su lead N
 * (primero se completa una ronda y recién ahí empieza la siguiente).
 *
 * Desempate dentro de la misma ronda: el que lleva MÁS tiempo sin recibir
 * (nunca recibió hoy = primero). Si aún empatan, azar — para que el orden
 * alfabético no favorezca siempre al mismo en la primera ronda.
 *
 * candidatos: [{ nombre, permitidos, asignados, ultimaAsignacion: Date|null }]
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
  const conAzar = conCupo.map((c) => ({ c, r: azar() }));
  conAzar.sort((a, b) =>
    (Number(a.c.asignados) - Number(b.c.asignados)) ||
    (ts(a.c.ultimaAsignacion) - ts(b.c.ultimaAsignacion)) ||
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
