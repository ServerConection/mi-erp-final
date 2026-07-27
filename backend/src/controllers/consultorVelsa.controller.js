/**
 * CONSULTOR VELSA CONTROLLER
 * Endpoint público (protegido por API Key) para consultores externos de VELSA.
 *
 * GET /api/consultor-velsa/buscar?j_id_bitrix=452799
 *
 * Fuente de datos: public.mv_consultor_velsa (vista MATERIALIZADA e indexada).
 * Se precalcula desde vw_jotform_velsa_netlife_completo (Jotform/Netlife Velsa)
 * porque esa vista base es demasiado pesada para consultarla en caliente
 * (superaba el statement_timeout de 90 s -> 500). El MV ya trae los 4 campos
 * con los nombres finales y un índice único sobre j_id_bitrix (= id_bitrix_ghl),
 * así la búsqueda es instantánea. Ver migración migrations/mv_consultor_velsa.sql
 * y el cron jobs/refreshConsultorVelsa.cron.js.
 *
 * Los campos se devuelven con los MISMOS nombres que la API de Novonet para que
 * VIDIKA reutilice la misma integración sin cambios:
 *   j_id_bitrix            (← id_bitrix_ghl)
 *   j_ciudad              (← ciudad)
 *   j_netlife_estatus_real (← estado_venta_netlife)
 *   j_forma_pago          (← forma_pago)
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

    // Consulta contra el MV indexado: j_id_bitrix ya es texto (id_bitrix_ghl).
    const result = await pool.query(
      `SELECT
         j_id_bitrix,
         j_ciudad,
         j_netlife_estatus_real,
         j_forma_pago
       FROM public.mv_consultor_velsa
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
    console.error('[consultorVelsa.controller] buscarPorBitrixVelsa error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

module.exports = { buscarPorBitrixVelsa };
