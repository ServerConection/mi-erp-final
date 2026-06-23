/**
 * DATOS ADICIONALES CONTROLLER
 *
 * Expone 3 fuentes de datos que ya estaban sincronizadas por ETLs
 * existentes pero que ningún controller del ERP consultaba todavía
 * (ver DOCUMENTACION_TECNICA/04_PLAN_MEJORAS.md):
 *
 *   - GET /api/datos-adicionales/contactos-bitrix   -> bitrix_contacts        (LOCAL)
 *   - GET /api/datos-adicionales/inversion-diaria   -> velsa_inversion_diaria (LOCAL)
 *   - GET /api/datos-adicionales/reporte-mensual-velsa -> reporte_mensual_velsa (Render bddgeneral)
 *
 * `contactos-bitrix` e `inversion-diaria` usan el pool de config/dbLocal.js
 * porque esas tablas viven solo en la Postgres local (no en bddgeneral).
 * `reporte-mensual-velsa` usa el pool normal de config/db.js porque esa
 * tabla ya vive en la misma base que el resto del ERP.
 */
const pool      = require('../config/db');
const poolLocal = require('../config/dbLocal');

const MAX_LIMIT     = 500;
const DEFAULT_LIMIT = 100;

function parsePaginacion(query) {
  let limit = parseInt(query.limit, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  let offset = parseInt(query.offset, 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;

  return { limit, offset };
}

/**
 * GET /api/datos-adicionales/contactos-bitrix
 * Query params opcionales: search (busca en name/phone/email), limit, offset
 */
const listarContactosBitrix = async (req, res) => {
  try {
    const { limit, offset } = parsePaginacion(req.query);
    const search = (req.query.search || '').trim();

    const params = [];
    let whereClause = '';
    if (search) {
      params.push(`%${search}%`);
      whereClause = `
        WHERE name ILIKE $1
           OR phone_1_value ILIKE $1
           OR phone_2_value ILIKE $1
           OR email_1_value ILIKE $1
           OR email_2_value ILIKE $1
      `;
    }

    params.push(limit, offset);
    const result = await poolLocal.query(
      `SELECT contact_id, name,
              phone_1_value, phone_1_type,
              phone_2_value, phone_2_type,
              email_1_value, email_1_type,
              email_2_value, email_2_type
       FROM bitrix_contacts
       ${whereClause}
       ORDER BY contact_id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('[datosAdicionales.controller] listarContactosBitrix error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'No se pudo consultar bitrix_contacts (base local). Verifica que el backend tenga acceso a la Postgres local y que LOCAL_DB_* esté configurado en .env.'
    });
  }
};

/**
 * GET /api/datos-adicionales/inversion-diaria
 * Query params opcionales: desde, hasta (YYYY-MM-DD), canal, limit, offset
 */
const listarInversionDiaria = async (req, res) => {
  try {
    const { limit, offset } = parsePaginacion(req.query);
    const { desde, hasta, canal } = req.query;

    const conditions = [];
    const params = [];

    if (desde) {
      params.push(desde);
      conditions.push(`fecha >= $${params.length}`);
    }
    if (hasta) {
      params.push(hasta);
      conditions.push(`fecha <= $${params.length}`);
    }
    if (canal) {
      params.push(canal);
      conditions.push(`canal = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const result = await poolLocal.query(
      `SELECT fecha, canal, inversion_usd
       FROM public.velsa_inversion_diaria
       ${whereClause}
       ORDER BY fecha DESC, canal ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('[datosAdicionales.controller] listarInversionDiaria error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'No se pudo consultar velsa_inversion_diaria (base local). Verifica que el backend tenga acceso a la Postgres local y que LOCAL_DB_* esté configurado en .env.'
    });
  }
};

/**
 * GET /api/datos-adicionales/reporte-mensual-velsa
 * Query params opcionales: asesor, etapa, limit, offset
 */
const listarReporteMensualVelsa = async (req, res) => {
  try {
    const { limit, offset } = parsePaginacion(req.query);
    const { asesor, etapa } = req.query;

    const conditions = [];
    const params = [];

    if (asesor) {
      params.push(asesor);
      conditions.push(`b_persona_responsable = $${params.length}`);
    }
    if (etapa) {
      params.push(etapa);
      conditions.push(`b_etapa_de_la_negociacion = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const result = await pool.query(
      `SELECT id_unificado, b_id, b_nombre, b_pipeline, b_etapa_de_la_negociacion,
              b_persona_responsable, b_creado_el_fecha, b_creado_el_hora,
              b_ciudad, b_provincia, b_forma_de_pago, supervisor_asignado,
              generado_at
       FROM public.reporte_mensual_velsa
       ${whereClause}
       ORDER BY b_creado_el_fecha DESC NULLS LAST
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('[datosAdicionales.controller] listarReporteMensualVelsa error:', err.message);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

module.exports = {
  listarContactosBitrix,
  listarInversionDiaria,
  listarReporteMensualVelsa,
};
