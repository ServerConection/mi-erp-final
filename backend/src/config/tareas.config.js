/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MÓDULO DE TAREAS Y ACUERDOS · Configuración
 * Estados, transiciones permitidas, prioridades y tipos.
 * Todo lo que define "las reglas del juego" vive aquí, en un solo archivo.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * ─── QUIÉN ENTRA AL MÓDULO ─────────────────────────────────────────────────────
 * Una sola regla: todos menos los asesores de ventas.
 *
 * No se exige `area_id` ni `cargo_id` a propósito. Esas dos columnas son
 * opcionales y solo sirven para dos cosas:
 *   · agrupar y filtrar por área en la Lista y el Dashboard
 *   · que una jefatura vea todo lo de su área
 * Quien no las tenga igual usa el módulo con normalidad: crea tareas, se las
 * asignan, comenta. Simplemente no aparece agrupado por área.
 *
 * La detección de asesor se hace sobre la columna `cargo` (texto libre) de la
 * tabla `usuarios`, que es donde el ERP ya guarda 'ASESOR'.
 */
const CARGOS_SIN_ACCESO = ['ASESOR', 'ASESORA', 'ASESOR COMERCIAL', 'ASESOR DE VENTAS'];

/**
 * Fragmento SQL reutilizable. Se usa en el middleware de acceso, en el catálogo
 * de usuarios asignables y al validar un responsable. Un solo lugar que cambiar.
 *
 * @param {string} alias alias de la tabla usuarios en la consulta
 */
function sqlTieneAccesoTareas(alias = 'u') {
  const lista = CARGOS_SIN_ACCESO.map(c => `'${c}'`).join(',');
  return `(${alias}.activo = 'SI'
           AND UPPER(BTRIM(COALESCE(${alias}.cargo, ''))) NOT IN (${lista}))`;
}

const ESTADOS = {
  PENDIENTE:   'PENDIENTE',
  EN_PROCESO:  'EN_PROCESO',
  EN_REVISION: 'EN_REVISION',
  COMPLETADA:  'COMPLETADA',
  CANCELADA:   'CANCELADA',
};

const ESTADOS_TERMINALES = [ESTADOS.COMPLETADA, ESTADOS.CANCELADA];

const TIPOS      = ['TAREA', 'ACUERDO', 'SOLICITUD'];
const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'];

/**
 * Máquina de estados.
 *
 *   destino  : a qué estados puede pasar desde el estado actual
 *   quien    : roles que pueden ejecutar esa transición
 *
 * Roles reconocidos:
 *   'RESPONSABLE'  → quien debe ejecutar la tarea
 *   'SOLICITANTE'  → quien la pidió
 *   'JEFE_AREA'    → cargo con es_jefatura = true en el área de la tarea
 *   'ADMIN'        → perfil ADMINISTRADOR
 */
const TRANSICIONES = {
  [ESTADOS.PENDIENTE]: {
    [ESTADOS.EN_PROCESO]: ['RESPONSABLE', 'SOLICITANTE', 'JEFE_AREA', 'ADMIN'],
    [ESTADOS.CANCELADA]:  ['SOLICITANTE', 'JEFE_AREA', 'ADMIN'],
  },
  [ESTADOS.EN_PROCESO]: {
    [ESTADOS.EN_REVISION]: ['RESPONSABLE', 'ADMIN'],
    [ESTADOS.PENDIENTE]:   ['RESPONSABLE', 'SOLICITANTE', 'JEFE_AREA', 'ADMIN'],
    [ESTADOS.CANCELADA]:   ['SOLICITANTE', 'JEFE_AREA', 'ADMIN'],
  },
  [ESTADOS.EN_REVISION]: {
    // El corazón del módulo: solo quien pidió la tarea puede darla por buena.
    [ESTADOS.COMPLETADA]: ['SOLICITANTE', 'ADMIN'],
    [ESTADOS.EN_PROCESO]: ['SOLICITANTE', 'ADMIN'],
    [ESTADOS.CANCELADA]:  ['SOLICITANTE', 'ADMIN'],
  },
  [ESTADOS.COMPLETADA]: {
    [ESTADOS.EN_PROCESO]: ['SOLICITANTE', 'ADMIN'],
  },
  [ESTADOS.CANCELADA]: {
    [ESTADOS.PENDIENTE]: ['SOLICITANTE', 'ADMIN'],
  },
};

/** Etiquetas legibles para la interfaz y los correos. */
const ETIQUETAS_ESTADO = {
  PENDIENTE:   'Pendiente',
  EN_PROCESO:  'En proceso',
  EN_REVISION: 'En revisión',
  COMPLETADA:  'Completada',
  CANCELADA:   'Cancelada',
};

const ETIQUETAS_PRIORIDAD = {
  BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', URGENTE: 'Urgente',
};

const ETIQUETAS_TIPO = {
  TAREA: 'Tarea', ACUERDO: 'Acuerdo', SOLICITUD: 'Solicitud',
};

const ACCIONES_HISTORIAL = {
  CREACION:      'CREACION',
  CAMBIO_ESTADO: 'CAMBIO_ESTADO',
  REASIGNACION:  'REASIGNACION',
  CAMBIO_FECHA:  'CAMBIO_FECHA',
  EDICION:       'EDICION',
  COMENTARIO:    'COMENTARIO',
  CANCELACION:   'CANCELACION',
  REAPERTURA:    'REAPERTURA',
};

const TIPOS_NOTIFICACION = {
  ASIGNACION:          'ASIGNACION',
  COMENTARIO:          'COMENTARIO',
  CAMBIO_ESTADO:       'CAMBIO_ESTADO',
  ENVIADA_REVISION:    'ENVIADA_REVISION',
  APROBADA:            'APROBADA',
  DEVUELTA:            'DEVUELTA',
  PROXIMO_VENCIMIENTO: 'PROXIMO_VENCIMIENTO',
  VENCIDA:             'VENCIDA',
};

/** Campos que el usuario puede editar vía PATCH y que se auditan uno por uno. */
const CAMPOS_EDITABLES = [
  'titulo', 'descripcion', 'tipo', 'prioridad',
  'fecha_inicio', 'fecha_limite', 'progreso',
  'proyecto_id', 'orden',
];

/** Campos cuyo cambio se registra como CAMBIO_FECHA en vez de EDICION. */
const CAMPOS_FECHA = ['fecha_inicio', 'fecha_limite'];

/**
 * ¿La transición estado_actual → estado_nuevo es válida para estos roles?
 * @param {string} actual
 * @param {string} nuevo
 * @param {string[]} rolesUsuario  ej. ['RESPONSABLE','JEFE_AREA']
 * @returns {{ok: boolean, error?: string}}
 */
function validarTransicion(actual, nuevo, rolesUsuario) {
  if (actual === nuevo) {
    return { ok: false, error: 'La tarea ya está en ese estado' };
  }

  const desde = TRANSICIONES[actual];
  if (!desde) {
    return { ok: false, error: `Estado actual desconocido: ${actual}` };
  }

  const permitidos = desde[nuevo];
  if (!permitidos) {
    const opciones = Object.keys(desde).map(e => ETIQUETAS_ESTADO[e]).join(', ');
    return {
      ok: false,
      error: `No se puede pasar de "${ETIQUETAS_ESTADO[actual]}" a "${ETIQUETAS_ESTADO[nuevo]}". ` +
             `Desde aquí solo puedes ir a: ${opciones}`,
    };
  }

  const tienePermiso = rolesUsuario.some(r => permitidos.includes(r));
  if (!tienePermiso) {
    if (nuevo === ESTADOS.COMPLETADA && actual === ESTADOS.EN_REVISION) {
      return {
        ok: false,
        error: 'Solo quien solicitó la tarea puede aprobarla y darla por completada',
      };
    }
    return {
      ok: false,
      error: 'No tienes permiso para realizar este cambio de estado',
    };
  }

  return { ok: true };
}

/** Estados a los que se puede pasar desde `actual` con los roles dados. */
function transicionesDisponibles(actual, rolesUsuario) {
  const desde = TRANSICIONES[actual] || {};
  return Object.entries(desde)
    .filter(([, permitidos]) => rolesUsuario.some(r => permitidos.includes(r)))
    .map(([estado]) => ({ estado, etiqueta: ETIQUETAS_ESTADO[estado] }));
}

module.exports = {
  CARGOS_SIN_ACCESO,
  sqlTieneAccesoTareas,
  ESTADOS,
  ESTADOS_TERMINALES,
  TIPOS,
  PRIORIDADES,
  TRANSICIONES,
  ETIQUETAS_ESTADO,
  ETIQUETAS_PRIORIDAD,
  ETIQUETAS_TIPO,
  ACCIONES_HISTORIAL,
  TIPOS_NOTIFICACION,
  CAMPOS_EDITABLES,
  CAMPOS_FECHA,
  validarTransicion,
  transicionesDisponibles,
};
