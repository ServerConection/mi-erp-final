/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SERVICIO: Archivos Compartidos
 * ═══════════════════════════════════════════════════════════════════════════════
 * Dos cosas que TODOS los controladores del módulo necesitan hacer igual:
 *   1. Dejar constancia del cambio en el historial
 *   2. Avisar en vivo a los demás que están viendo la misma hoja
 *
 * Al vivir aquí, un controlador nunca se olvida de una de las dos.
 */

const pool = require('../config/db');

const salaDeHoja = (hojaId) => `hoja:${hojaId}`;

/**
 * Emite un evento a todos los conectados a una hoja.
 * Nunca lanza: si socket.io no está levantado (proceso sin websocket),
 * el guardado en BD ya ocurrió y eso es lo que importa.
 */
function emitirAHoja(hojaId, evento, payload) {
  try {
    const { getIO } = require('../config/socket');
    getIO().to(salaDeHoja(hojaId)).emit(evento, payload);
  } catch (error) {
    console.warn('[hojas.service] No se pudo emitir', evento, '-', error.message);
  }
}

/**
 * Registra un cambio en la bitácora.
 * Acepta un cliente de transacción (`db`) para que el historial se escriba
 * dentro del mismo BEGIN/COMMIT que el cambio real.
 */
async function registrarHistorial(datos, db = pool) {
  const {
    hojaId, filaId = null, columnaId = null,
    accion, valorAnterior = null, valorNuevo = null, usuarioId,
  } = datos;

  try {
    await db.query(
      `INSERT INTO hoj_historial
         (hoja_id, fila_id, columna_id, accion, valor_anterior, valor_nuevo, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [hojaId, filaId, columnaId, accion, valorAnterior, valorNuevo, usuarioId]
    );
  } catch (error) {
    // El historial es auditoría, no es el dato. Que falle no debe tumbar
    // la operación del usuario.
    console.error('[hojas.service] Error escribiendo historial:', error.message);
  }
}

/** Historial + emisión, que es lo que se hace en el 90% de los casos. */
async function registrarYEmitir(datos, evento, payload, db = pool) {
  await registrarHistorial(datos, db);
  emitirAHoja(datos.hojaId, evento, payload);
}

/**
 * Normaliza el valor de una celda según el tipo de su columna.
 * Devuelve { ok: true, valor } o { ok: false, error }.
 *
 * Vale la pena validar en el servidor aunque el frontend ya lo haga: el
 * frontend es una sugerencia, el servidor es la regla.
 */
function normalizarValor(valor, columna) {
  if (valor === null || valor === undefined || valor === '') {
    return { ok: true, valor: null };
  }

  const texto = String(valor).trim();
  if (texto === '') return { ok: true, valor: null };

  switch (columna.tipo) {
    case 'LISTA': {
      const opciones = Array.isArray(columna.opciones) ? columna.opciones : [];
      if (opciones.length > 0 && !opciones.includes(texto)) {
        return { ok: false, error: `"${texto}" no es una opción válida de ${columna.nombre}` };
      }
      return { ok: true, valor: texto };
    }

    case 'FECHA': {
      // Se guarda siempre ISO corto (YYYY-MM-DD): ordena bien como texto
      // y no arrastra problemas de zona horaria.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
        return { ok: false, error: `${columna.nombre} espera una fecha (YYYY-MM-DD)` };
      }
      const d = new Date(`${texto}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) {
        return { ok: false, error: `${columna.nombre} tiene una fecha inválida` };
      }
      return { ok: true, valor: texto };
    }

    case 'USUARIO': {
      const id = parseInt(texto, 10);
      if (!Number.isInteger(id) || id <= 0) {
        return { ok: false, error: `${columna.nombre} espera un usuario válido` };
      }
      return { ok: true, valor: String(id) };
    }

    case 'TEXTO':
    default: {
      if (texto.length > 2000) {
        return { ok: false, error: `${columna.nombre} admite máximo 2000 caracteres` };
      }
      return { ok: true, valor: texto };
    }
  }
}

module.exports = {
  salaDeHoja,
  emitirAHoja,
  registrarHistorial,
  registrarYEmitir,
  normalizarValor,
};
