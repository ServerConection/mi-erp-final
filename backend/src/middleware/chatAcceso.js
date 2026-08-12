/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MIDDLEWARE: Control de acceso del módulo Chat Interno
 * ═══════════════════════════════════════════════════════════════════════════════
 * Regla simple: solo los participantes activos de una conversación pueden verla
 * o escribir en ella. No hay nivel ADMIN que vea los mensajes de otros — el
 * cruce de empresas para ADMINISTRADOR aplica solo a QUIÉN puede agregar a una
 * conversación (ver validarParticipantes), no a leer chats ajenos.
 *
 * Debe usarse SIEMPRE después de verificarToken.
 */

const pool = require('../config/db');

/**
 * Puerta de entrada del módulo. Cualquier usuario autenticado y activo entra;
 * el listado se encarga de mostrarle solo sus propias conversaciones.
 */
const accesoChat = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'No autenticado' });
  }
  next();
};

/**
 * Carga la conversación de :conversacionId y exige que el usuario sea
 * participante activo. Mismo mensaje para "no existe" y "no tienes acceso":
 * no filtramos la existencia de conversaciones ajenas.
 * Deja disponibles req.conversacion y req.esCreador para el controlador.
 */
const exigeParticipante = async (req, res, next) => {
  try {
    const id = parseInt(req.params.conversacionId, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ success: false, error: 'Conversación no encontrada' });
    }

    const { rows } = await pool.query(
      `SELECT c.id, c.tipo, c.nombre, c.creado_por, c.created_at, c.updated_at,
              p.ultimo_leido_id
         FROM chat_conversaciones c
         JOIN chat_participantes p
              ON p.conversacion_id = c.id AND p.usuario_id = $2 AND p.activo
        WHERE c.id = $1`,
      [id, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversación no encontrada' });
    }

    req.conversacion = rows[0];
    req.esCreador = rows[0].creado_por === req.user.id;
    next();
  } catch (error) {
    console.error('[chatAcceso] Error resolviendo acceso:', error);
    res.status(500).json({ success: false, error: 'Error validando permisos del chat' });
  }
};

/**
 * Valida una lista de usuario_id destino contra las reglas de empresa:
 *   - ADMINISTRADOR puede agregar gente de cualquier empresa.
 *   - Cualquier otro perfil solo puede agregar gente de SU MISMA empresa.
 * Devuelve { ok: true, usuarios } o { ok: false, error }.
 */
async function validarParticipantes(idsDestino, solicitante) {
  const ids = [...new Set(idsDestino.map(v => parseInt(v, 10)))].filter(v => Number.isInteger(v) && v > 0 && v !== solicitante.id);
  if (ids.length === 0) {
    return { ok: false, error: 'Debes elegir al menos un usuario' };
  }

  const { rows } = await pool.query(
    `SELECT id, usuario, nombres, apellidos, perfil, empresa
       FROM usuarios
      WHERE id = ANY($1::int[]) AND activo = 'SI'`,
    [ids]
  );

  if (rows.length !== ids.length) {
    return { ok: false, error: 'Uno o más usuarios no existen o están desactivados' };
  }

  if (solicitante.perfil !== 'ADMINISTRADOR') {
    const fueraDeEmpresa = rows.filter(u => (u.empresa || '').toUpperCase() !== solicitante.empresa);
    if (fueraDeEmpresa.length > 0) {
      return { ok: false, error: 'Solo puedes chatear con usuarios de tu misma empresa' };
    }
  }

  return { ok: true, usuarios: rows };
}

module.exports = { accesoChat, exigeParticipante, validarParticipantes };
