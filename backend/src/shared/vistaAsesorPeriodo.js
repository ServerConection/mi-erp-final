/** Alcance temporal comun de los detalles de Vista Asesor ($1/$2 del endpoint). */
const enPeriodoSeleccionadoExpr = (columna) =>
  `(${columna} BETWEEN $1::date AND $2::date)`;

const backlogEnPeriodoSeleccionadoExpr = (columnaActivacion, columnaRegistro) =>
  `((${columnaActivacion} BETWEEN $1::date AND $2::date) AND ${columnaRegistro} < $1::date)`;

// VELSA guarda el selector de Backoffice como texto JSON, por ejemplo
// ["POR REGULARIZAR"] o ["POR REGULARIZAR", "{codigo}"].
const esPorRegularizarVelsa = (valor) =>
  /(^|[^A-Z])POR\s+REGULARIZAR([^A-Z]|$)/i.test(String(valor ?? ''));

const esPorRegularizarVelsaExpr = (columna) =>
  `(COALESCE(${columna}::text, '') ~* '(^|[^A-Z])POR[[:space:]]+REGULARIZAR([^A-Z]|$)')`;

module.exports = {
  enPeriodoSeleccionadoExpr,
  backlogEnPeriodoSeleccionadoExpr,
  esPorRegularizarVelsa,
  esPorRegularizarVelsaExpr,
};
