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

module.exports = { elegirAsesor, normalizarNombre };
