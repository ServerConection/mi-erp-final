/**
 * SEGURIDAD: Rate limiting global en memoria (sin dependencias externas).
 *
 * Objetivo: frenar abuso/escaneo automatizado y ataques de fuerza bruta a nivel
 * de toda la API, SIN afectar el uso normal de los dashboards.
 *
 * Diseño conservador para NO romper funcionamiento:
 *   - Límite alto (por defecto 600 req/min por IP). Una carga de dashboard
 *     dispara ~5-15 requests; este umbral solo se alcanza con abuso real.
 *   - Ventana deslizante simple de 60s.
 *   - Se omiten preflight OPTIONS y el endpoint /health.
 *   - Limpieza periódica para evitar fugas de memoria.
 *
 * Configurable por entorno:
 *   RATE_LIMIT_MAX     (default 600)
 *   RATE_LIMIT_WINDOW_MS (default 60000)
 */

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const MAX_REQ   = parseInt(process.env.RATE_LIMIT_MAX || '600', 10);

const hits = new Map(); // ip -> { count, resetAt }

// Limpieza periódica de entradas expiradas
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [ip, info] of hits) {
    if (info.resetAt < now) hits.delete(ip);
  }
}, WINDOW_MS);
if (cleanup.unref) cleanup.unref();

function rateLimit(req, res, next) {
  // No limitar preflight ni health checks
  if (req.method === 'OPTIONS' || req.path === '/health') return next();

  const ip = req.ip || req.connection?.remoteAddress || 'desconocido';
  const now = Date.now();
  let info = hits.get(ip);

  if (!info || info.resetAt < now) {
    info = { count: 1, resetAt: now + WINDOW_MS };
    hits.set(ip, info);
    return next();
  }

  info.count++;

  if (info.count > MAX_REQ) {
    const retry = Math.ceil((info.resetAt - now) / 1000);
    res.setHeader('Retry-After', retry);
    return res.status(429).json({
      success: false,
      error: 'Demasiadas solicitudes. Intenta de nuevo en unos momentos.'
    });
  }

  next();
}

module.exports = rateLimit;
