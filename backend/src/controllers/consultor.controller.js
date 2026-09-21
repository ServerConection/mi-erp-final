/**
 * CONSULTOR CONTROLLER
 * Endpoint público (protegido por API Key) para consultores externos.
 *
 * GET /api/consultor/buscar?j_id_bitrix=452799
 *
 * Respuesta exitosa:
 * {
 *   "success": true,
 *   "data": {
 *     "j_id_bitrix": "452799",
 *     "j_ciudad": "Quito",
 *     "j_netlife_estatus_real": "ACTIVO",
 *     "j_forma_pago": "DEBITO"
 *   }
 * }
 */

const pool = require('../config/db');

// ── GET /api/consultor/buscar?j_id_bitrix=XXXXX ───────────────────────────────
const buscarPorBitrix = async (req, res) => {
  try {
    const { j_id_bitrix } = req.query;

    // Validación del parámetro requerido
    if (!j_id_bitrix || String(j_id_bitrix).trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'El parámetro j_id_bitrix es requerido'
      });
    }

    const result = await pool.query(
      `SELECT
         j_id_bitrix,
         j_ciudad,
         j_netlife_estatus_real,
         j_forma_pago
       FROM public.mestra_bitrix
       WHERE j_id_bitrix = $1
       LIMIT 1`,
      [String(j_id_bitrix).trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No se encontró registro con j_id_bitrix = ${j_id_bitrix}`
      });
    }

    return res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (err) {
    console.error('[consultor.controller] buscarPorBitrix error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

// ── GET /api/consultor/novonet-leads?fecha=YYYY-MM-DD ─────────────────────────
// (o ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD para un rango)
// Devuelve SOLO 5 campos, filtrando por fecha de creación del lead.
const consultarNovonetPorFecha = async (req, res) => {
  try {
    const { fecha, desde, hasta } = req.query;

    if (!fecha && !desde && !hasta) {
      return res.status(400).json({
        success: false,
        error: 'Debes enviar el parámetro fecha=YYYY-MM-DD, o desde/hasta=YYYY-MM-DD'
      });
    }

    const params = [];
    let where;

    if (fecha) {
      params.push(String(fecha).trim());
      where = `WHERE b_creado_el_fecha = $${params.length}`;
    } else {
      const condiciones = [];
      if (desde) {
        params.push(String(desde).trim());
        condiciones.push(`b_creado_el_fecha >= $${params.length}`);
      }
      if (hasta) {
        params.push(String(hasta).trim());
        condiciones.push(`b_creado_el_fecha <= $${params.length}`);
      }
      where = `WHERE ${condiciones.join(' AND ')}`;
    }

    const result = await pool.query(
      `SELECT
         b_creado_el_fecha        AS fecha_creacion,
         b_id                     AS id_bitrix,
         b_origen                 AS origen,
         b_telefono               AS telefono,
         b_etapa_de_la_negociacion AS etapa
       FROM public.vw_bitrix_novonet
       ${where}
       ORDER BY b_creado_el_fecha DESC
       LIMIT 5000`,
      params
    );

    return res.json({
      success: true,
      total: result.rows.length,
      data: result.rows
    });

  } catch (err) {
    console.error('[consultor.controller] consultarNovonetPorFecha error:', err.message);
    return res.status(400).json({
      success: false,
      error: 'Fecha inválida o error de consulta. Formato esperado: YYYY-MM-DD'
    });
  }
};

module.exports = { buscarPorBitrix, consultarNovonetPorFecha };
