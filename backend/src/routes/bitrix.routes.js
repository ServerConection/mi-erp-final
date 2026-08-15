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

// Validar ID Bitrix en etapa VENTA SUBIDA (para NuevaVenta.jsx)
router.get('/validar-venta/:idBitrix', verificarToken, async (req, res) => {
  try {
    const { idBitrix } = req.params;

    const result = await pool.query(
      `SELECT bitrix_id, empresa, etapa, source, created_at_ecuador, created_at
       FROM bitrix_webhook_leads
       WHERE bitrix_id::text = $1 AND LOWER(COALESCE(etapa, '')) = 'venta_subida'
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
    res.json({
      success: true,
      existe: true,
      data: {
        idBitrix: lead.bitrix_id,
        empresa: lead.empresa,
        etapa: lead.etapa,
        source: lead.source,
        creadoEl: lead.created_at_ecuador || lead.created_at
      }
    });
  } catch (error) {
    console.error('[bitrix.validar-venta] ERROR:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
