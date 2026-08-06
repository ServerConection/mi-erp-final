/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MIDDLEWARE: acceso al módulo de Tareas
 * ═══════════════════════════════════════════════════════════════════════════════
 * REGLA ÚNICA: entran todos menos los asesores de ventas.
 *
 * No se exige `area_id` ni `cargo_id`. Quien los tenga gana agrupación por área
 * y, si su cargo es de jefatura, visibilidad sobre toda su área. Quien no los
 * tenga usa el módulo igual: crea tareas, recibe asignaciones y comenta.
 *
 * Debe usarse SIEMPRE después de `verificarToken`.
 *
 * Inyecta en la request:
 *   req.tareasUser = {
 *     id, usuario, empresa, perfil, cargoTexto,
 *     areaId, areaCodigo, areaNombre,
 *     cargoId, cargoCodigo, cargoNombre, nivel,
 *     esJefatura, esAdmin
 *   }
 */

const pool = require('../config/db');
const { sqlTieneAccesoTareas } = require('../config/tareas.config');

// ── Cache en memoria (mismo patrón que auth.js) ───────────────────────────────
const CACHE_TTL_MS = 60 * 1000;
const CACHE_MAX    = 2000;
const cache        = new Map(); // userId -> { data, expiresAt }

function cacheGet(id) {
  const entry = cache.get(id);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(id);
    return null;
  }
  cache.delete(id);
  cache.set(id, entry); // refresca orden LRU
  return entry.data;
}

function cacheSet(id, data) {
  if (cache.size >= CACHE_MAX) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(id, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Invalida el cache de un usuario (llamar al cambiarle área o cargo). */
function invalidarAccesoTareas(id) {
  if (id != null) cache.delete(id);
}

/**
 * Carga área y cargo del usuario y bloquea si no los tiene.
 */
const accesoTareas = async (req, res, next) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ success: false, error: 'No autenticado' });
  }

  try {
    let data = cacheGet(req.user.id);

    if (!data) {
      const { rows } = await pool.query(
        `SELECT u.id,
                u.usuario,
                u.empresa,
                u.perfil,
                u.cargo AS cargo_texto,
                u.area_id,
                a.codigo AS area_codigo,
                a.nombre AS area_nombre,
                u.cargo_id,
                c.codigo AS cargo_codigo,
                c.nombre AS cargo_nombre,
                c.nivel,
                COALESCE(c.es_jefatura, false) AS es_jefatura,
                ${sqlTieneAccesoTareas('u')} AS tiene_acceso
           FROM public.usuarios u
           LEFT JOIN public.tar_areas  a ON a.id = u.area_id
           LEFT JOIN public.tar_cargos c ON c.id = u.cargo_id
          WHERE u.id = $1`,
        [req.user.id]
      );

      if (rows.length === 0) {
        return res.status(401).json({ success: false, error: 'Usuario no encontrado' });
      }

      const r = rows[0];
      data = {
        id:          r.id,
        usuario:     r.usuario,
        empresa:     (r.empresa || '').toUpperCase(),
        perfil:      (r.perfil  || '').toUpperCase(),
        cargoTexto:  r.cargo_texto,
        areaId:      r.area_id,
        areaCodigo:  r.area_codigo,
        areaNombre:  r.area_nombre,
        cargoId:     r.cargo_id,
        // Si no le asignaron cargo del catálogo, mostramos el texto libre
        cargoNombre: r.cargo_nombre || r.cargo_texto || null,
        cargoCodigo: r.cargo_codigo,
        nivel:       r.nivel,
        esJefatura:  r.es_jefatura,
        esAdmin:     (r.perfil || '').toUpperCase() === 'ADMINISTRADOR',
        tieneAcceso: r.tiene_acceso,
      };

      cacheSet(req.user.id, data);
    }

    if (!data.tieneAcceso) {
      return res.status(403).json({
        success: false,
        error: 'El módulo de Tareas no está disponible para asesores de ventas.',
        codigo: 'SIN_ACCESO_TAREAS',
      });
    }

    req.tareasUser = data;
    next();

  } catch (error) {
    console.error('[tareasAcceso] Error:', error.message);
    return res.status(500).json({ success: false, error: 'Error validando acceso al módulo' });
  }
};

/** Solo administradores (para catálogos y borrado duro). */
const soloAdminTareas = (req, res, next) => {
  if (!req.tareasUser?.esAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Solo los administradores pueden realizar esta acción',
    });
  }
  next();
};

/** Jefaturas y administradores (dashboard gerencial). */
const soloJefaturaTareas = (req, res, next) => {
  const u = req.tareasUser;
  if (!u?.esAdmin && !u?.esJefatura) {
    return res.status(403).json({
      success: false,
      error: 'Esta vista es solo para jefaturas',
    });
  }
  next();
};

module.exports = { accesoTareas, soloAdminTareas, soloJefaturaTareas, invalidarAccesoTareas };
