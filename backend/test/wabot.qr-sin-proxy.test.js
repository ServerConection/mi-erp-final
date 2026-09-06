/**
 * El QR nunca aparecía: con proxy, el socket moría con "Código: 408" antes de
 * que WhatsApp emitiera el evento 'qr' (cuatro IPs seguidas del pool fallaron
 * igual). La vinculación por QR sale ahora sin proxy; TODO lo demás —
 * reconexiones automáticas, campañas, envíos — sigue saliendo por él.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const managerPath = path.resolve(__dirname, '../src/services/BaileysManager.js')
const dbPath = path.resolve(__dirname, '../src/config/db.js')
const baileysPath = require.resolve('@whiskeysockets/baileys')

const LINEA = 'linea-con-proxy'
const PROXY = { protocol: 'http', host: 'gw.dataimpulse.com', port: 10001, username: 'u', password: 'p' }

// Socket de mentira: solo lo justo para que connect() llegue al final sin red.
function socketFalso() {
  return {
    ev: { on: () => {} },
    ws: { close: () => {} },
    end: () => {},
    user: null,
  }
}

function preparar() {
  require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true,
    exports: {
      query: async (sql, params) => {
        if (sql.includes('SELECT status FROM lines')) return { rows: [{ status: 'disconnected' }] }
        if (sql.includes('SELECT * FROM lines WHERE id')) {
          return { rows: [{ id: params[0], proxy_enabled: true, proxy_config: PROXY, created_by: 1, name: 'PRUEBA' }] }
        }
        return { rows: [] }
      },
      transaction: async (fn) => fn({ query: async () => ({ rows: [] }) }),
    },
  }

  const opcionesVistas = []
  const real = require(baileysPath)
  require.cache[baileysPath] = {
    id: baileysPath, filename: baileysPath, loaded: true,
    exports: {
      ...real,
      makeWASocket: (opts) => { opcionesVistas.push(opts); return socketFalso() },
      default: (opts) => { opcionesVistas.push(opts); return socketFalso() },
      useMultiFileAuthState: async () => ({ state: { creds: {}, keys: {} }, saveCreds: async () => {} }),
      fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 1] }),
    },
  }

  delete require.cache[managerPath]
  const BaileysManager = require(managerPath)
  const manager = new BaileysManager({ emit: () => {}, to: () => ({ emit: () => {} }) })
  manager._lidMapLoaded = true
  return { manager, opcionesVistas }
}

function limpiar() {
  delete require.cache[managerPath]
  delete require.cache[baileysPath]
  delete require.cache[dbPath]
}

test('la vinculacion por QR NO sale por el proxy', async () => {
  const { manager, opcionesVistas } = preparar()
  try {
    await manager.connect(LINEA, 1, { paraQr: true })
    assert.equal(opcionesVistas.length, 1, 'debe haber creado el socket')
    assert.equal(opcionesVistas[0].agent, undefined, 'el socket del QR no debe llevar agente de proxy')
  } finally { limpiar() }
})

test('una reconexion automatica SI sale por el proxy', async () => {
  const { manager, opcionesVistas } = preparar()
  try {
    await manager.connect(LINEA)
    assert.equal(opcionesVistas.length, 1)
    assert.ok(opcionesVistas[0].agent, 'la reconexion debe conservar el agente de proxy')
  } finally { limpiar() }
})

test('con WA_QR_SIN_PROXY=false el QR vuelve a salir por el proxy', async () => {
  const previo = process.env.WA_QR_SIN_PROXY
  process.env.WA_QR_SIN_PROXY = 'false'
  const { manager, opcionesVistas } = preparar()
  try {
    await manager.connect(LINEA, 1, { paraQr: true })
    assert.ok(opcionesVistas[0].agent, 'con el interruptor apagado el QR debe usar el proxy')
  } finally {
    if (previo === undefined) delete process.env.WA_QR_SIN_PROXY
    else process.env.WA_QR_SIN_PROXY = previo
    limpiar()
  }
})
