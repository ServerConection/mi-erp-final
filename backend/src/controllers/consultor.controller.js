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

module.exports = { buscarPorBitrix };
