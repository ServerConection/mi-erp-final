/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SERVICIO: Visibilidad de tareas
 * ═══════════════════════════════════════════════════════════════════════════════
 * UN SOLO LUGAR define quién ve qué. Todos los endpoints de lectura usan este
 * predicado. Si mañana cambian las reglas, se cambian aquí y en ningún otro lado.
 *
 * REGLAS
 *   1. Siempre se filtra por empresa del usuario.
 *   2. ADMINISTRADOR ve todo lo de su empresa.
 *   3. Cualquiera ve las tareas donde es responsable o solicitante.
 *   4. Las jefaturas (cargo.es_jefatura) ven todo lo de su área.
 *   5. Las jefaturas ven las tareas donde su área está marcada como involucrada.
 */

/**
 * Construye el fragmento WHERE de visibilidad.
 *
 * @param {object} u      req.tareasUser
 * @param {array}  params Array de parámetros existente (se le agregan los nuevos)
 * @param {string} alias  Alias de la tabla/vista de tareas en la consulta
 * @returns {string} SQL listo para concatenar tras un WHERE/AND
 */
function construirFiltroVisibilidad(u, params, alias = 't') {
  // Regla 1 · aislamiento por empresa (aplica también al admin)
  params.push(u.empresa);
  const filtroEmpresa = `${alias}.empresa = $${params.length}`;

  // Regla 2 · el admin no necesita más filtros
  if (u.esAdmin) {
    return filtroEmpresa;
  }

  const condiciones = [];

  // Regla 3 · soy responsable o solicitante
  params.push(u.id);
  const idxUser = params.length;
  condiciones.push(`${alias}.responsable_id = $${idxUser}`);
  condiciones.push(`${alias}.solicitante_id = $${idxUser}`);

  // Reglas 4 y 5 · jefatura sobre su área
  if (u.esJefatura && u.areaId) {
    params.push(u.areaId);
    const idxArea = params.length;
    condiciones.push(`${alias}.area_responsable_id = $${idxArea}`);
    condiciones.push(
      `EXISTS (SELECT 1 FROM public.tar_tarea_areas ta
                WHERE ta.tarea_id = ${alias}.id AND ta.area_id = $${idxArea})`
    );
  }

  return `${filtroEmpresa} AND (${condiciones.join(' OR ')})`;
}

/**
 * ¿Este usuario puede ver esta tarea concreta?
 * Se usa antes de devolver un detalle o de permitir un cambio.
 *
 * @param {object} u     req.tareasUser
 * @param {object} tarea fila de tar_tareas (con area_responsable_id)
 * @param {number[]} areasInvolucradas ids de áreas involucradas
 */
function puedeVerTarea(u, tarea, areasInvolucradas = []) {
  if (!tarea) return false;
  if ((tarea.empresa || '').toUpperCase() !== u.empresa) return false;
  if (u.esAdmin) return true;
  if (tarea.responsable_id === u.id) return true;
  if (tarea.solicitante_id === u.id) return true;
  if (u.esJefatura && u.areaId) {
    if (tarea.area_responsable_id === u.areaId) return true;
    if (areasInvolucradas.includes(u.areaId)) return true;
  }
  return false;
}

/**
 * Roles que tiene este usuario SOBRE esta tarea. Alimenta la máquina de estados.
 * @returns {string[]} ej. ['RESPONSABLE','JEFE_AREA']
 */
function rolesSobreTarea(u, tarea, areasInvolucradas = []) {
  const roles = [];
  if (u.esAdmin) roles.push('ADMIN');
  if (tarea.responsable_id === u.id) roles.push('RESPONSABLE');
  if (tarea.solicitante_id === u.id) roles.push('SOLICITANTE');
  if (u.esJefatura && u.areaId &&
      (tarea.area_responsable_id === u.areaId || areasInvolucradas.includes(u.areaId))) {
    roles.push('JEFE_AREA');
  }
  return roles;
}

/**
 * ¿Puede editar los campos de la tarea (título, fechas, prioridad…)?
 * Responsable, solicitante, jefe del área y admin.
 */
function puedeEditarTarea(u, tarea, areasInvolucradas = []) {
  const roles = rolesSobreTarea(u, tarea, areasInvolucradas);
  return roles.length > 0;
}

/**
 * ¿Puede reasignar el responsable?
 * Solo solicitante, jefatura del área y admin. El responsable no puede
 * pasarle el muerto a otro por su cuenta.
 */
function puedeReasignar(u, tarea, areasInvolucradas = []) {
  const roles = rolesSobreTarea(u, tarea, areasInvolucradas);
  return roles.includes('ADMIN') || roles.includes('SOLICITANTE') || roles.includes('JEFE_AREA');
}

module.exports = {
  construirFiltroVisibilidad,
  puedeVerTarea,
  rolesSobreTarea,
  puedeEditarTarea,
  puedeReasignar,
};
