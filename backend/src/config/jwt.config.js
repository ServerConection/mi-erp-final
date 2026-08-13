/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CONFIGURACIÓN DEL JWT · duración de la sesión
 * ═══════════════════════════════════════════════════════════════════════════════
 * Un solo lugar define cuánto dura el token. Antes estaba escrito a mano ('8h')
 * en cuatro archivos de rutas distintos, con el riesgo de que se desincronizaran.
 *
 * Se ajusta con la variable de entorno JWT_EXPIRES_IN (en Render, en el
 * Environment Group `erp-shared`). No requiere tocar el código ni desplegar.
 *
 *   JWT_EXPIRES_IN=3d     ← valor por defecto (2026-08): pedido para que el
 *                           usuario no tenga que reloguearse ni recibir avisos
 *                           de cierre de sesión todos los días.
 *   JWT_EXPIRES_IN=12h
 *   JWT_EXPIRES_IN=24h
 *   JWT_EXPIRES_IN=7d
 *
 * Formatos aceptados: '30m', '8h', '12h', '1d', '7d' o un número en segundos.
 *
 * ⚠️ NOTA DE SEGURIDAD
 * No hay refresh token: cuando el JWT expira, el usuario vuelve a pasar por OTP.
 * Un token largo NO impide bloquear a alguien: `middleware/auth.js` revalida
 * contra la base de datos cada 60 segundos y corta el acceso si `activo <> 'SI'`.
 * El riesgo real de alargarlo es un token robado de un equipo comprometido.
 */

const POR_DEFECTO = '3d';

// Formatos válidos de la librería `ms` que usa jsonwebtoken
const FORMATO = /^\d+(\.\d+)?\s?(ms|s|m|h|d|w|y)?$/i;

function resolverExpiracion() {
  const valor = (process.env.JWT_EXPIRES_IN || '').trim();

  if (!valor) return POR_DEFECTO;

  if (!FORMATO.test(valor)) {
    console.warn(
      `[jwt.config] JWT_EXPIRES_IN="${valor}" no tiene un formato válido. ` +
      `Usa por ejemplo 12h, 24h o 7d. Se aplica el valor por defecto: ${POR_DEFECTO}`
    );
    return POR_DEFECTO;
  }

  return valor;
}

const JWT_EXPIRES_IN = resolverExpiracion();

console.log(`[jwt.config] Duración de sesión: ${JWT_EXPIRES_IN}`);

module.exports = { JWT_EXPIRES_IN };
