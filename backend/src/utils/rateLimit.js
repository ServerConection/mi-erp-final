// src/utils/rateLimit.js
// ============================================================
// Limitador de tasa en memoria, sin dependencias.
//
// POR QUÉ EXISTE
// --------------
// Las rutas de subida aceptan hasta 15 MB por request. Sin límite, una sola
// cuenta comprometida (o un script) puede llenar el disco del servidor de
// almacenamiento y saturar el ancho de banda del túnel — denegación de servicio
// barata (CWE-770: allocation without limits).
//
// LIMITACIÓN CONOCIDA
// -------------------
// El contador vive en el proceso. Si Render escala a varias instancias, el
// límite efectivo se multiplica por el número de instancias. Es suficiente como
// primera barrera; si algún día hay varias instancias, mover el contador a
// Redis/Postgres.
// ============================================================

'use strict';

/**
 * Crea un middleware de rate limit por ventana deslizante.
 *
 * @param {Object} opts
 * @param {number} opts.ventanaMs   - tamaño de la ventana
 * @param {number} opts.maximo      - peticiones permitidas por ventana
 * @param {Function} [opts.clave]   - (req) => string. Por defecto el id de usuario.
 * @param {string} [opts.mensaje]
 */
function crearRateLimit({ ventanaMs, maximo, clave, mensaje }) {
  const registro = new Map(); // clave -> number[] (timestamps)
  const MAX_CLAVES = 20000;   // techo de memoria

  const obtenerClave = clave || ((req) => `u:${req.user?.id ?? req.ip ?? 'anon'}`);

  // Barrido periódico de claves muertas para que el Map no crezca sin control.
  const barrido = setInterval(() => {
    const corte = Date.now() - ventanaMs;
    for (const [k, hits] of registro) {
      const vivos = hits.filter((t) => t > corte);
      if (vivos.length === 0) registro.delete(k);
      else registro.set(k, vivos);
    }
  }, Math.max(ventanaMs, 30_000));
  if (typeof barrido.unref === 'function') barrido.unref();

  return function rateLimit(req, res, next) {
    const k = obtenerClave(req);
    const ahora = Date.now();
    const corte = ahora - ventanaMs;

    let hits = registro.get(k) || [];
    hits = hits.filter((t) => t > corte);

    if (hits.length >= maximo) {
      const esperaSeg = Math.ceil((hits[0] + ventanaMs - ahora) / 1000);
      res.set('Retry-After', String(Math.max(esperaSeg, 1)));
      return res.status(429).json({
        success: false,
        error: mensaje || 'Demasiadas peticiones. Espera un momento antes de reintentar.',
      });
    }

    hits.push(ahora);
    registro.set(k, hits);

    if (registro.size > MAX_CLAVES) {
      const primera = registro.keys().next().value;
      registro.delete(primera);
    }

    next();
  };
}

module.exports = { crearRateLimit };
