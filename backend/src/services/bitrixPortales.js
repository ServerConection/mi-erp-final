/**
 * Registro de portales de Bitrix conectados a WABOT-BITRIX.
 * ---------------------------------------------------------------------------
 * Novonet usa las instancias "de compatibilidad" que ya exportan
 * bitrixApp.service.js y bitrixConnector.service.js (leen las variables de
 * entorno de siempre — cero cambios de comportamiento). Velsa es una
 * instancia nueva, con sus propias variables de entorno.
 */
const pool = require('../config/db')
const { crearBitrixApp } = require('./bitrixApp.service')
const { crearBitrixConnector } = require('./bitrixConnector.service')

const bitrixApp = {
  novonet: require('./bitrixApp.service'),
  velsa: crearBitrixApp({
    portalUrl: process.env.BITRIX_PORTAL_URL_VELSA,
    clientId: process.env.BITRIX_APP_CLIENT_ID_VELSA,
    clientSecret: process.env.BITRIX_APP_CLIENT_SECRET_VELSA,
  }),
}

// URL publica base (dominio, sin prefijo de ruta) — el prefijo de ruta propio
// de cada portal se pasa aparte como routePrefix a crearBitrixConnector, que
// lo usa solo para armar PLACEMENT_HANDLER. url_im sigue siendo el dominio
// puro para ambos portales, igual que siempre fue para Novonet.
const BASE_URL_VELSA = (process.env.BITRIX_APP_BASE_URL_VELSA || process.env.BITRIX_APP_BASE_URL || '').replace(/\/+$/, '')

const conector = {
  novonet: require('./bitrixConnector.service'),
  velsa: crearBitrixConnector({
    bitrixApp: bitrixApp.velsa,
    connectorId: process.env.BITRIX_CONNECTOR_ID_VELSA || process.env.BITRIX_CONNECTOR_ID,
    connectorName: process.env.BITRIX_CONNECTOR_NAME_VELSA || 'WABOT-BITRIX Velsa (WhatsApp)',
    baseUrl: BASE_URL_VELSA,
    routePrefix: '/api/bitrix-connector-velsa',
  }),
}

/**
 * Empresa dueña de una línea de WhatsApp ('NOVONET' | 'VELSA' | null).
 * Reutiliza el mismo join que ya usa wa_lines.controller.js
 * (lines.created_by -> usuarios.empresa). Una línea sin created_by (huérfana)
 * devuelve null — hoy ese caso se trata igual que Novonet en el resto del
 * ERP, así que quien use esto debe decidir el mismo fallback.
 */
async function empresaDeLinea(lineId) {
  const r = await pool.query(
    `SELECT UPPER(u.empresa) AS empresa
     FROM lines l LEFT JOIN usuarios u ON l.created_by = u.id
     WHERE l.id = $1`,
    [lineId]
  )
  return r.rows[0]?.empresa || null
}

module.exports = { bitrixApp, conector, empresaDeLinea }
