const express = require('express')
const router = express.Router()
const {
  install, settings, events,
  registrarConector, listarCanales, activarCanal, estado,
} = require('../controllers/bitrixConnector.controller')
const { verificarToken, noAsesor } = require('../middleware/auth')

// Públicas: las llama Bitrix24, no el frontend. Se autentican con
// application_token, que se valida dentro del controlador.
router.post('/install',  install)
router.get('/install',   install)
router.post('/events',   events)
router.get('/settings',  settings)
router.post('/settings', settings)

// Administración desde el ERP.
router.get('/estado',    verificarToken, estado)
router.get('/canales',   verificarToken, listarCanales)
router.post('/registrar', verificarToken, noAsesor, registrarConector)
router.post('/activar',   verificarToken, noAsesor, activarCanal)

module.exports = router
