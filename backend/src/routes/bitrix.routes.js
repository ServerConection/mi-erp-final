const express = require('express');
const router  = express.Router();
const {
  triggerSync,
  getSyncStatus,
  getResumenVelsaBitrix,
  getTablaBitrix,
  getLiveActividad,
} = require('../controllers/bitrix.controller');

const { verificarToken } = require('../middleware/auth');
const pool = require('../config/db');

// Sync manual — sí requiere auth (acción que modifica datos)
router.post('/sync',        verificarToken, triggerSync);
router.get('/sync/status',  verificarToken, getSyncStatus);

// Consultas de solo lectura — sin verificarToken igual que indicadoresVelsa.routes.js
router.get('/velsa',        getResumenVelsaBitrix);
router.get('/velsa/tabla',  getTablaBitrix);
router.get('/live-actividad', getLiveActividad);

router.get('/origenes', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT UPPER(TRIM(source)) AS source
      FROM bitrix_webhook_leads
      WHERE source IS NOT NULL
        AND TRIM(source) <> ''
      ORDER BY UPPER(TRIM(source)) ASC
    `);

    const origenes = result.rows.map(r => r.source).filter(Boolean);
    return res.json({ success: true, data: origenes });
  } catch (error) {
    console.error('[bitrix.origenes] ERROR:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Validar ID Bitrix. Velsa permite cargar ventas aunque la etapa no sea "VENTA SUBIDA".
router.get('/validar-venta/:idBitrix', verificarToken, async (req, res) => {
  try {
    const { idBitrix } = req.params;
    const empresaUsuario = String(req.user?.empresa || '').trim().toUpperCase();
    const esUsuarioVelsa = empresaUsuario === 'VELSA';

    if (esUsuarioVelsa) {
      return res.json({
       success: true,
       existe: true,
       data: {
         idBitrix,
         empresa: empresaUsuario,
         etapa: null,
         source: null,
         creadoEl: null,
         permiteSinVentaSubida: true,
         existeEnTabla: false
       }
      });
    }

    const result = await pool.query(
      `SELECT bitrix_id, empresa, etapa, source, created_at_ecuador, created_at
       FROM bitrix_webhook_leads
       WHERE bitrix_id::text = $1
       ORDER BY created_at DESC NULLS LAST
       LIMIT 1`,
      [idBitrix]
    );

    if (result.rows.length === 0) {
      return res.json({
       success: false,
       existe: false,
       error: `No existe un lead con ID Bitrix #${idBitrix} en etapa VENTA SUBIDA`
      });
    }

    const lead = result.rows[0];
    const empresa = String(lead.empresa || '').trim().toUpperCase();
    const etapa = String(lead.etapa || '').trim().toUpperCase();
    const esVelsa = empresa.includes('VELSA');
    const esVentaSubida = etapa === 'VENTA SUBIDA';

    if (!esVelsa && !esVentaSubida) {
      return res.json({
       success: false,
       existe: false,
       error: `No existe un lead con ID Bitrix #${idBitrix} en etapa VENTA SUBIDA`
      });
    }

    res.json({
      success: true,
      existe: true,
      data: {
       idBitrix: lead.bitrix_id,
       empresa: lead.empresa,
       etapa: lead.etapa,
       source: lead.source,
       creadoEl: lead.created_at_ecuador || lead.created_at,
       permiteSinVentaSubida: esVelsa,
       existeEnTabla: true
      }
    });
  } catch (error) {
    console.error('[bitrix.validar-venta] ERROR:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
