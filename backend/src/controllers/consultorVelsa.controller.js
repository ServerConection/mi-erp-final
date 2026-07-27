/**
 * CONSULTOR VELSA CONTROLLER
 * Endpoint público (protegido por API Key) para consultores externos de VELSA.
 *
 * GET /api/consultor-velsa/buscar?j_id_bitrix=452799
 *
 * Fuente de datos: public.vw_jotform_velsa_netlife_completo (Jotform/Netlife Velsa).
 * Los campos se devuelven con los MISMOS nombres que la API de Novonet para que
 * VIDIKA reutilice la misma integración sin cambios.
 *
 * Mapeo Novonet (mestra_bitrix)  →  Velsa (vw_jotform_velsa_netlife_completo):
 *   j_id_bitrix            → id_bitrix_ghl
 *   j_ciudad              → ciudad
 *   j_netlife_estatus_real → estado_venta_netlife
 *   j_forma_pago          → forma_pago
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

// ── GET /api/consultor-velsa/buscar?j_id_bitrix=XXXXX ─────────────────────────
const buscarPorBitrixVelsa = async (req, res) => {
  try {
    const { j_id_bitrix } = req.query;

    // Validación del parámetro requerido
    if (!j_id_bitrix || String(j_id_bitrix).trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'El parámetro j_id_bitrix es requerido'
      });
    }

    // Nota: id_bitrix_ghl en la vista se compara como texto para aceptar
    // el parámetro tal cual llega en la URL.
    const result = await pool.query(
      `SELECT
         jf.id_bitrix_ghl::text          AS j_id_bitrix,
         jf.ciudad                       AS j_ciudad,
         jf.estado_venta_netlife         AS j_netlife_estatus_real,
         jf.forma_pago                   AS j_forma_pago
       FROM public.vw_jotform_velsa_netlife_completo jf
       WHERE jf.id_bitrix_ghl::text = $1
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
    console.error('[consultorVelsa.controller] buscarPorBitrixVelsa error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

module.exports = { buscarPorBitrixVelsa };
