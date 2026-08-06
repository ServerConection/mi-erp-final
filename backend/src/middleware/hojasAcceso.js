/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MIDDLEWARE: Control de acceso del módulo Archivos Compartidos
 * ═══════════════════════════════════════════════════════════════════════════════
 * Un solo lugar decide quién puede hacer qué. Los controladores nunca vuelven a
 * preguntarse por permisos: leen `req.hoja` y `req.nivel` y confían.
 *
 * NIVELES (de mayor a menor):
 *   ADMIN   → perfil ADMINISTRADOR. Ve y edita absolutamente todas las hojas.
 *   DUENO   → creó la hoja. Edita, define columnas y reparte permisos.
 *   EDITOR  → invitado con permiso de escritura. Edita celdas y filas.
 *   LECTOR  → invitado de solo lectura.
 *   (null)  → sin acceso. Ni siquiera sabe que la hoja existe.
 *
 * Debe usarse SIEMPRE después de verificarToken.
 */

const pool = require('../config/db');

// Perfiles autorizados a crear hojas nuevas.
const PERFILES_CREADORES = ['ADMINISTRADOR', 'GERENCIA', 'ANALISTA', 'SUPERVISOR'];

const NIVELES = { ADMIN: 4, DUENO: 3, EDITOR: 2, LECTOR: 1 };

/** ¿Este nivel alcanza para lo que se necesita? */
const alcanza = (nivel, minimo) => (NIVELES[nivel] || 0) >= (NIVELES[minimo] || 0);

/**
 * Resuelve el nivel de acceso de un usuario sobre una hoja.
 * Devuelve { hoja, nivel } o { hoja: null, nivel: null } si no tiene acceso.
 *
 * Se exporta porque el canal de socket.io necesita exactamente la misma
 * decisión que las rutas HTTP: una sola fuente de verdad.
 */
async function resolverAcceso(hojaId, usuario) {
  const id = parseInt(hojaId, 10);
  if (!Number.isInteger(id) || id <= 0) return { hoja: null, nivel: null };

  const { rows } = await pool.query(
    `SELECT h.id, h.nombre, h.descripcion, h.empresa, h.color,
            h.creado_por, h.activo, h.created_at, h.updated_at,
            u.usuario  AS creador_usuario,
            u.nombres  AS creador_nombres,
            u.apellidos AS creador_apellidos,
            p.nivel    AS permiso_nivel
       FROM hoj_hojas h
       JOIN usuarios  u ON u.id = h.creado_por
       LEFT JOIN hoj_permisos p
              ON p.hoja_id = h.id AND p.usuario_id = $2
      WHERE h.id = $1`,
    [id, usuario.id]
  );

  if (rows.length === 0) return { hoja: null, nivel: null };

  const hoja = rows[0];

  // Una hoja archivada solo la ve quien puede desarchivarla.
  const esAdmin = usuario.perfil === 'ADMINISTRADOR';
  const esDueno = hoja.creado_por === usuario.id;

  if (esAdmin) return { hoja, nivel: 'ADMIN' };
  if (!hoja.activo) return { hoja: null, nivel: null };
  if (esDueno) return { hoja, nivel: 'DUENO' };
  if (hoja.permiso_nivel) return { hoja, nivel: hoja.permiso_nivel }; // EDITOR | LECTOR

  return { hoja: null, nivel: null };
}

/**
 * Puerta de entrada del módulo. Deja pasar a cualquier usuario autenticado:
 * el listado se encarga de mostrarle solo lo suyo. Un asesor sin hojas
 * compartidas simplemente verá la lista vacía.
 */
const accesoHojas = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'No autenticado' });
  }
  req.puedeCrearHojas = PERFILES_CREADORES.includes(req.user.perfil);
  next();
};

/** Solo perfiles habilitados pueden crear hojas nuevas. */
const puedeCrearHoja = (req, res, next) => {
  if (!PERFILES_CREADORES.includes(req.user?.perfil)) {
    return res.status(403).json({
      success: false,
      error: 'Tu perfil no puede crear archivos compartidos. Pide a un supervisor que te comparta uno.'
    });
  }
  next();
};

/**
 * Carga la hoja de :hojaId y exige un nivel mínimo.
 * Deja disponibles req.hoja y req.nivel para el controlador.
 *
 *   router.get('/:hojaId', exigeNivel('LECTOR'), ctrl.detalle)
 *   router.patch('/:hojaId/celdas', exigeNivel('EDITOR'), ctrl.guardarCelda)
 *   router.post('/:hojaId/permisos', exigeNivel('DUENO'), ctrl.compartir)
 */
const exigeNivel = (minimo) => async (req, res, next) => {
  try {
    const { hoja, nivel } = await resolverAcceso(req.params.hojaId, req.user);

    // Mismo mensaje para "no existe" y "no tienes acceso": no filtramos
    // la existencia de hojas ajenas.
    if (!hoja) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
    }

    if (!alcanza(nivel, minimo)) {
      return res.status(403).json({
        success: false,
        error: minimo === 'DUENO'
          ? 'Solo el creador del archivo puede hacer esto.'
          : 'Tienes este archivo en modo solo lectura.'
      });
    }

    req.hoja  = hoja;
    req.nivel = nivel;
    next();
  } catch (error) {
    console.error('[hojasAcceso] Error resolviendo acceso:', error);
    res.status(500).json({ success: false, error: 'Error validando permisos del archivo' });
  }
};

module.exports = {
  accesoHojas,
  puedeCrearHoja,
  exigeNivel,
  resolverAcceso,
  alcanza,
  PERFILES_CREADORES,
};
