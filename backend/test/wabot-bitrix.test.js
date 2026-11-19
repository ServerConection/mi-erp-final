/**
 * Pruebas de WABOT-BITRIX sin Postgres real.
 * Se simula `config/db` con un motor en memoria que entiende las pocas
 * sentencias que usan los módulos nuevos. No valida el SQL contra Postgres
 * (eso se hace corriendo la migración), pero sí valida la LÓGICA: que las
 * credenciales sobrevivan el ida y vuelta con Buffers, que el lease no se lo
 * pueda robar otra instancia mientras está vivo, y que sí se lo pueda robar
 * cuando vence.
 */
const assert = require('assert')
const path = require('path')
const Module = require('module')

// ── Postgres en memoria (solo lo que necesitan estos módulos) ───────────────
const tablas = { wa_auth_state: [], wa_line_locks: [] }
const fakePool = {
  query: async (sql, p = []) => {
    const q = sql.replace(/\s+/g, ' ').trim()

    if (/^SELECT data FROM wa_auth_state/.test(q)) {
      const f = tablas.wa_auth_state.find(r => r.line_id === p[0] && r.key_id === p[1])
      return { rows: f ? [{ data: f.data }] : [], rowCount: f ? 1 : 0 }
    }
    if (/^SELECT key_id, data FROM wa_auth_state/.test(q)) {
      const rows = tablas.wa_auth_state.filter(r => r.line_id === p[0] && p[1].includes(r.key_id))
      return { rows, rowCount: rows.length }
    }
    if (/^INSERT INTO wa_auth_state/.test(q)) {
      const i = tablas.wa_auth_state.findIndex(r => r.line_id === p[0] && r.key_id === p[1])
      if (i >= 0) tablas.wa_auth_state[i].data = p[2]
      else tablas.wa_auth_state.push({ line_id: p[0], key_id: p[1], data: p[2] })
      return { rows: [], rowCount: 1 }
    }
    if (/^DELETE FROM wa_auth_state WHERE line_id = \$1 AND key_id = ANY/.test(q)) {
      const antes = tablas.wa_auth_state.length
      tablas.wa_auth_state = tablas.wa_auth_state.filter(r => !(r.line_id === p[0] && p[1].includes(r.key_id)))
      return { rows: [], rowCount: antes - tablas.wa_auth_state.length }
    }
    if (/^DELETE FROM wa_auth_state WHERE line_id = \$1$/.test(q)) {
      const antes = tablas.wa_auth_state.length
      tablas.wa_auth_state = tablas.wa_auth_state.filter(r => r.line_id !== p[0])
      return { rows: [], rowCount: antes - tablas.wa_auth_state.length }
    }
    if (/^SELECT 1 FROM wa_auth_state/.test(q)) {
      const hay = tablas.wa_auth_state.some(r => r.line_id === p[0])
      return { rows: hay ? [{ '?column?': 1 }] : [], rowCount: hay ? 1 : 0 }
    }

    // ── lease ──
    if (/^INSERT INTO wa_line_locks/.test(q)) {
      const [lineId, owner, ttl] = p
      const exp = new Date(Date.now() + Number(ttl) * 1000)
      const i = tablas.wa_line_locks.findIndex(r => r.line_id === lineId)
      if (i < 0) { tablas.wa_line_locks.push({ line_id: lineId, owner, expires_at: exp }); return { rows: [{ owner }] } }
      const act = tablas.wa_line_locks[i]
      const vencido = act.expires_at.getTime() < Date.now()
      if (vencido || act.owner === owner) { act.owner = owner; act.expires_at = exp; return { rows: [{ owner }] } }
      return { rows: [] } // el WHERE del ON CONFLICT no matchea → no se toma
    }
    if (/^UPDATE wa_line_locks/.test(q)) {
      const [lineId, owner, ttl] = p
      const r = tablas.wa_line_locks.find(x => x.line_id === lineId && x.owner === owner)
      if (!r) return { rows: [] }
      r.expires_at = new Date(Date.now() + Number(ttl) * 1000)
      return { rows: [{ owner }] }
    }
    if (/^DELETE FROM wa_line_locks/.test(q)) {
      tablas.wa_line_locks = tablas.wa_line_locks.filter(r => !(r.line_id === p[0] && r.owner === p[1]))
      return { rows: [], rowCount: 1 }
    }
    return { rows: [], rowCount: 0 }
  },
  transaction: async (fn) => fn({ query: (s, p) => fakePool.query(s, p) }),
}

const orig = Module.prototype.require
Module.prototype.require = function (id) {
  if (id.endsWith('config/db')) return fakePool
  return orig.apply(this, arguments)
}

const { useDbAuthState, borrarSesion } = require(path.resolve(__dirname, '../src/services/baileysAuthPg.service'))

let ok = 0, fail = 0
const test = async (nombre, fn) => {
  try { await fn(); console.log(`  ✓ ${nombre}`); ok++ }
  catch (e) { console.error(`  ✗ ${nombre}\n     ${e.message}`); fail++ }
}

;(async () => {
  console.log('\nbaileysAuthPg.service')

  await test('crea credenciales nuevas si la línea no existe', async () => {
    const { state } = await useDbAuthState('linea-A')
    assert.ok(state.creds, 'debería inicializar creds')
    assert.ok(state.creds.noiseKey, 'creds debe traer noiseKey')
  })

  await test('las credenciales sobreviven el ida y vuelta CON Buffers intactos', async () => {
    const a = await useDbAuthState('linea-B')
    const original = Buffer.from(a.state.creds.noiseKey.private)
    await a.saveCreds()
    const b = await useDbAuthState('linea-B')
    assert.ok(Buffer.isBuffer(b.state.creds.noiseKey.private), 'debe volver como Buffer, no como objeto plano')
    assert.strictEqual(Buffer.compare(original, b.state.creds.noiseKey.private), 0, 'los bytes deben ser idénticos')
  })

  await test('keys.set guarda y keys.get devuelve', async () => {
    const { state } = await useDbAuthState('linea-C')
    await state.keys.set({ 'pre-key': { '1': { public: Buffer.from([1, 2, 3]) } } })
    const r = await state.keys.get('pre-key', ['1'])
    assert.ok(r['1'], 'debe encontrar la clave guardada')
    assert.strictEqual(Buffer.compare(r['1'].public, Buffer.from([1, 2, 3])), 0)
  })

  await test('keys.set con null borra la clave', async () => {
    const { state } = await useDbAuthState('linea-D')
    await state.keys.set({ 'pre-key': { '9': { public: Buffer.from([7]) } } })
    await state.keys.set({ 'pre-key': { '9': null } })
    const r = await state.keys.get('pre-key', ['9'])
    assert.strictEqual(r['9'], undefined, 'la clave debería haber desaparecido')
  })

  await test('keys.get con ids que no existen no rompe', async () => {
    const { state } = await useDbAuthState('linea-E')
    const r = await state.keys.get('session', ['no-existe'])
    assert.deepStrictEqual(r, {})
  })

  await test('borrarSesion limpia todas las claves de la línea', async () => {
    const { state, saveCreds } = await useDbAuthState('linea-F')
    await saveCreds()
    await state.keys.set({ 'pre-key': { '1': { public: Buffer.from([1]) } } })
    const n = await borrarSesion('linea-F')
    assert.ok(n >= 2, `esperaba borrar >=2 filas, borró ${n}`)
    const r = await state.keys.get('pre-key', ['1'])
    assert.strictEqual(r['1'], undefined)
  })

  console.log('\nlineLock.service')

  // Se recarga con OWNER distinto para simular DOS instancias.
  const cargarLock = (owner) => {
    process.env.RENDER_INSTANCE_ID = owner
    const ruta = require.resolve(path.resolve(__dirname, '../src/services/lineLock.service'))
    delete require.cache[ruta]
    return require(ruta)
  }

  const A = cargarLock('instancia-A')
  const B = cargarLock('instancia-B')

  await test('la primera instancia toma la línea', async () => {
    assert.strictEqual(await A.adquirir('L1'), true)
  })

  await test('la segunda NO puede robarla mientras el lease está vivo', async () => {
    assert.strictEqual(await B.adquirir('L1'), false, 'dos sockets con las mismas credenciales queman el número')
  })

  await test('la dueña puede re-adquirir (reconnect no se bloquea a sí mismo)', async () => {
    assert.strictEqual(await A.adquirir('L1'), true)
  })

  await test('la segunda SÍ la toma cuando el lease vence', async () => {
    const fila = tablas.wa_line_locks.find(r => r.line_id === 'L1')
    fila.expires_at = new Date(Date.now() - 1000) // simula instancia caída
    assert.strictEqual(await B.adquirir('L1'), true)
  })

  await test('renovar falla si ya no somos dueños', async () => {
    assert.strictEqual(await A.renovar('L1'), false)
  })

  await test('soltar libera la línea para otra instancia', async () => {
    await B.soltar('L1')
    assert.strictEqual(await A.adquirir('L1'), true)
  })

  console.log(`\n${ok} pasaron, ${fail} fallaron\n`)
  process.exit(fail ? 1 : 0)
})()
