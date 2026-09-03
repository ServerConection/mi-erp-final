const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const controllerPath = path.resolve(__dirname, '../src/controllers/wa_lines.controller.js')
const proxyPoolPath  = path.resolve(__dirname, '../src/services/proxyPool.service.js')
const dbPath         = path.resolve(__dirname, '../src/config/db.js')

function fakeRes() {
  const res = { statusCode: 200 }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

// ── proxyPool.service ──────────────────────────────────────────────────────

test('liberarPuertoDeLinea vacía proxy_config solo si la línea tiene puerto', async () => {
  const sqls = []
  require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true,
    exports: { query: async (sql, params) => { sqls.push({ sql, params }); return { rowCount: 1, rows: [] } } },
  }
  delete require.cache[proxyPoolPath]
  const { liberarPuertoDeLinea } = require(proxyPoolPath)

  const ok = await liberarPuertoDeLinea('line-1')
  assert.equal(ok, true)
  assert.match(sqls[0].sql, /UPDATE lines/)
  assert.match(sqls[0].sql, /proxy_enabled = false/)
  assert.match(sqls[0].sql, /proxy_config->>'port' IS NOT NULL/)
  assert.deepEqual(sqls[0].params, ['line-1'])
})

test('estadoPool calcula libres = total - en_uso - quemados y reconciliar corre antes', async () => {
  const vistos = []
  require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true,
    exports: {
      query: async (sql) => {
        vistos.push(sql.replace(/\s+/g, ' ').trim().slice(0, 40))
        if (/UPDATE lines/.test(sql)) return { rowCount: 2, rows: [] }          // reconciliarPuertos
        if (/FROM lines l/.test(sql)) return { rows: [{ n: 20 }] }              // en_uso
        if (/proxy_puertos_quemados/.test(sql)) return { rows: [{ n: 5 }] }     // quemados
        return { rows: [] }
      },
    },
  }
  process.env.PROXY_USER = 'u'; process.env.PROXY_PASS = 'p'; process.env.PROXY_PUERTOS = '60'
  delete require.cache[proxyPoolPath]
  const { estadoPool } = require(proxyPoolPath)

  const est = await estadoPool()
  assert.equal(est.total, 60)
  assert.equal(est.en_uso, 20)
  assert.equal(est.quemados, 5)
  assert.equal(est.libres, 35)
  assert.equal(est.credenciales, true)
  assert.ok(vistos.some(s => s.startsWith('UPDATE lines')), 'debe reconciliar antes de contar')
})

// ── controller: resetAll ───────────────────────────────────────────────────

function cargarControlador(queryImpl) {
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: queryImpl } }
  require.cache[proxyPoolPath] = {
    id: proxyPoolPath, filename: proxyPoolPath, loaded: true,
    exports: {
      construirProxyAutomatico: async () => null,
      liberarPuertoDeLinea: async () => true,
      estadoPool: async () => ({ credenciales: true, total: 60, en_uso: 0, quemados: 0, libres: 60 }),
      quemarPuerto: async () => true,
      rotarProxyDeLinea: async () => null,
    },
  }
  delete require.cache[controllerPath]
  return require(controllerPath)
}

test('resetAll: un ASESOR no puede reiniciar todas las líneas', async () => {
  const { resetAll } = cargarControlador(async () => ({ rows: [] }))
  const res = fakeRes()
  await resetAll({ user: { id: 9, perfil: 'ASESOR' }, app: { get: () => ({ resetAll: async () => 0 }) } }, res)
  assert.equal(res.statusCode, 403)
})

// ── BaileysManager: no quedarse pegado en un socket zombi ──────────────────

test('connect() descarta una instancia colgada en "connecting" sin QR en vez de ignorarla', async () => {
  const managerPath = path.resolve(__dirname, '../src/services/BaileysManager.js')
  const prev = process.env.WA_PROXY_REQUIRED
  process.env.WA_PROXY_REQUIRED = 'true' // corta connect() pronto, tras pasar el gate del zombi

  const estados = []
  require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true,
    exports: {
      query: async (sql, params) => {
        if (/UPDATE lines SET status/.test(sql)) estados.push(params[0])
        if (/SELECT \* FROM lines WHERE id/.test(sql)) return { rows: [{ id: 'L', name: 'ENVIO_1', proxy_enabled: false, proxy_config: {} }] }
        return { rows: [] }
      },
      transaction: async (fn) => fn({ query: async () => ({ rows: [] }) }),
    },
  }
  delete require.cache[managerPath]
  const BaileysManager = require(managerPath)

  const io = { emit() {}, to() { return { emit() {} } } }
  const mgr = new BaileysManager(io)

  let endLlamado = false
  mgr.instances['L'] = {
    sock: { end() { endLlamado = true }, ws: { close() {} }, ev: { on() {} } },
    status: 'connecting',
    qr: null,
  }

  await mgr.connect('L').catch(() => {}) // lanza PROXY_REQUIRED, no importa

  assert.equal(endLlamado, true, 'debió cerrar el socket zombi')
  assert.ok(estados.includes('proxy_error'), 'debió avanzar hasta el chequeo de proxy, no hacer return temprano')

  process.env.WA_PROXY_REQUIRED = prev
})

test('resetAll: un ADMINISTRADOR dispara bm.resetAll con logout', async () => {
  let opts = null
  const { resetAll } = cargarControlador(async () => ({ rows: [] }))
  const res = fakeRes()
  await resetAll(
    { user: { id: 1, perfil: 'ADMINISTRADOR' }, app: { get: () => ({ resetAll: async (o) => { opts = o; return 12 } }) } },
    res,
  )
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.total, 12)
  assert.deepEqual(opts, { logout: true })
})
