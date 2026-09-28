const express = require('express')
const router = express.Router()
const {
  install, settings, events, placementInbox,
  registrarConector, registrarPlacement, listarCanales, activarCanal, estado,
} = require('../controllers/bitrixConnector.controller')
const { verificarToken, noAsesor } = require('../middleware/auth')
const bitrixApp = require('../services/bitrixApp.service')
const conector = require('../services/bitrixConnector.service')
const pool = require('../config/db')
const { createBitrixCallPlacementController } = require('../controllers/bitrixCallPlacement.controller')

const callPlacement = createBitrixCallPlacementController({
  bitrixApp,
  pool,
  actionSecret: process.env.BITRIX_CALL_ACTION_SECRET,
  automarcadorUrl: process.env.AUTOMARCADOR_URL,
  automarcadorApiKey: process.env.AUTOMARCADOR_API_KEY,
})

// Públicas: las llama Bitrix24, no el frontend. Se autentican con
// application_token, que se valida dentro del controlador.
router.post('/install',  install)
router.get('/install',   install)
router.post('/events',   events)
router.get('/settings',  settings)
router.post('/settings', settings)
router.get('/placement-inbox',  placementInbox)
router.post('/placement-inbox', placementInbox)
router.post('/placement-call', callPlacement.placementCall)
router.post('/placement-call/start', callPlacement.startCall)

// Administración desde el ERP.
router.get('/estado',    verificarToken, estado)
router.get('/canales',   verificarToken, listarCanales)
router.post('/registrar', verificarToken, noAsesor, registrarConector)
router.post('/registrar-placement', verificarToken, noAsesor, registrarPlacement)
router.post('/registrar-call-placement', verificarToken, noAsesor, async (req, res) => {
  try {
    if (String(process.env.BITRIX_CALL_ACTION_SECRET || '').length < 32 || !process.env.AUTOMARCADOR_URL || !process.env.AUTOMARCADOR_API_KEY) {
      return res.status(503).json({ success: false, message: 'Configura BITRIX_CALL_ACTION_SECRET, AUTOMARCADOR_URL y AUTOMARCADOR_API_KEY antes de registrar LLAMAR' })
    }
    const tokens = await bitrixApp.leerTokens()
    if (!tokens) {
      return res.status(503).json({ success: false, message: 'La app local de Bitrix no está instalada' })
    }
    const missing = require('../services/bitrixApp.service').requiredScopes(tokens.scope)
    if (missing.length) {
      return res.status(503).json({ success: false, message: `Faltan permisos de Bitrix para LLAMAR: ${missing.join(', ')}` })
    }
    return res.json({ success: true, data: await conector.registrarLlamadaPlacement() })
  }
  catch (error) { return res.status(500).json({ success: false, message: error.message }) }
})
router.post('/activar',   verificarToken, noAsesor, activarCanal)

module.exports = router
