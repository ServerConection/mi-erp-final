/**
 * Rutas del Automarcador Bitrix (lado asesor, dentro de Bitrix).
 * Se montan ANTES de verificarToken en llamadas.routes.js: aquí no hay JWT del
 * ERP, la identidad viene de la sesión de Bitrix (header X-Bitrix-Auth).
 */
const express = require('express')
const { crearDialerController } = require('../controllers/llamadasBitrixDialer.controller')

function crearRouter({
  bitrixApp = require('../services/bitrixApp.service'),
  db = require('../config/db'),
  portalUrl = process.env.BITRIX_PORTAL_URL,
} = {}) {
  const router = express.Router()
  const c = crearDialerController({ bitrixApp, db, portalUrl })
  // Bitrix abre la app y la instalación con POST (form) o GET.
  router.all('/app', c.app)
  router.all('/install', c.install)
  router.get('/cola', c.autenticar, c.cola)
  router.post('/siguiente', express.json({ limit: '4kb' }), c.autenticar, c.siguiente)
  router.post('/resultado', express.json({ limit: '4kb' }), c.autenticar, c.resultado)
  router.post('/estado', express.json({ limit: '4kb' }), c.autenticar, c.estado)
  router.post('/tipificar', express.json({ limit: '4kb' }), c.autenticar, c.tipificar)
  return router
}

module.exports = { crearRouter }
