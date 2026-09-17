// backend/src/controllers/bitrixConnectorVelsa.controller.js
//
// Mismo controlador que Novonet (misma lógica, ver bitrixConnector.controller.js),
// pero atado a la instancia de Velsa. No duplica código: usa la fábrica.
const { crearControladorBitrixConnector } = require('./bitrixConnector.controller')
const { bitrixApp, conector } = require('../services/bitrixPortales')

module.exports = crearControladorBitrixConnector({
  bitrixApp: bitrixApp.velsa,
  conector: conector.velsa,
  appToken: process.env.BITRIX_APP_TOKEN_VELSA,
})
