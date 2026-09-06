/**
 * Migración de la sesión de Baileys: disco → Postgres.
 *
 * Lo que se prueba es lo único que importa aquí: que una sesión que ya está
 * en disco se pueda leer IGUAL desde Postgres. Si un solo id se reconstruye
 * mal, WhatsApp cierra la sesión con 401 y el asesor tiene que reescanear el
 * QR. Por eso se usan ids reales, con ':' y '/' dentro.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const dbPath = path.resolve(__dirname, '../src/config/db.js')
const authPgPath = path.resolve(__dirname, '../src/services/baileysAuthPg.service.js')

// Postgres de mentira: una tabla wa_auth_state en memoria.
function poolFalso() {
  const tabla = new Map() // `${line}|${key}` -> data
  const ejecutar = async (sql, params = []) => {
    if (/INSERT INTO wa_auth_state/.test(sql)) {
      tabla.set(`${params[0]}|${params[1]}`, params[2]); return { rows: [], rowCount: 1 }
    }
    if (/SELECT data FROM wa_auth_state/.test(sql)) {
      const d = tabla.get(`${params[0]}|${params[1]}`)
      return { rows: d === undefined ? [] : [{ data: d }] }
    }
    if (/SELECT key_id, data FROM wa_auth_state/.test(sql)) {
      const rows = []
      for (const k of params[1]) {
        const d = tabla.get(`${params[0]}|${k}`)
        if (d !== undefined) rows.push({ key_id: k, data: d })
      }
      return { rows }
    }
    if (/SELECT 1 FROM wa_auth_state/.test(sql)) {
      const hay = [...tabla.keys()].some((k) => k.startsWith(`${params[0]}|`))
      return { rows: hay ? [{ '?column?': 1 }] : [] }
    }
    if (/DELETE FROM wa_auth_state WHERE line_id = \$1 AND key_id = ANY/.test(sql)) {
      for (const k of params[1]) tabla.delete(`${params[0]}|${k}`)
      return { rows: [], rowCount: 0 }
    }
    if (/DELETE FROM wa_auth_state WHERE line_id = \$1$/m.test(sql.trim())) {
      let n = 0
      for (const k of [...tabla.keys()]) if (k.startsWith(`${params[0]}|`)) { tabla.delete(k); n++ }
      return { rowCount: n }
    }
    return { rows: [] }
  }
  return { query: ejecutar, transaction: async (fn) => fn({ query: ejecutar }), _tabla: tabla }
}

function cargar(pool) {
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool }
  delete require.cache[authPgPath]
  return require(authPgPath)
}

// Ids reales de WhatsApp: llevan ':' y el nombre de archivo en disco los
// convierte en '-'. Ahí es donde se corrompía la sesión.
const CLAVES = {
  'session': {
    '593999888777.0:1@s.whatsapp.net': { registrado: true, cadena: 'abc' },
    '593911223344:12@s.whatsapp.net': { registrado: false },
  },
  'pre-key': { '3': { publica: 'k3' } },
  'sender-key': { '120363000000000000@g.us::593999888777@s.whatsapp.net': { v: 1 } },
}

test('una sesion en disco se lee igual despues de migrar a Postgres', async () => {
  const { useMultiFileAuthState } = require('@whiskeysockets/baileys')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-auth-'))
  const LINEA = '11111111-1111-1111-1111-111111111111'
  try {
    // 1) sesión escrita en disco, exactamente como hoy en producción
    const enDisco = await useMultiFileAuthState(dir)
    await enDisco.state.keys.set(CLAVES)
    await enDisco.saveCreds()

    // 2) migrar
    const pool = poolFalso()
    const authPg = cargar(pool)
    const res = await authPg.migrarDesdeDisco(LINEA, dir)
    assert.equal(res.migrada, true, 'debió migrar algo')

    // 3) leer desde Postgres con los MISMOS ids
    const enPg = await authPg.useDbAuthState(LINEA)
    for (const tipo of Object.keys(CLAVES)) {
      const ids = Object.keys(CLAVES[tipo])
      const leido = await enPg.state.keys.get(tipo, ids)
      for (const id of ids) {
        assert.deepEqual(
          JSON.parse(JSON.stringify(leido[id] ?? null)),
          JSON.parse(JSON.stringify(CLAVES[tipo][id])),
          `la clave ${tipo}/${id} no sobrevivió la migración`
        )
      }
    }
    // las credenciales también
    assert.equal(enPg.state.creds.registrationId, enDisco.state.creds.registrationId)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
    delete require.cache[authPgPath]; delete require.cache[dbPath]
  }
})

test('lo que se escribe en Postgres se vuelve a leer con el id original', async () => {
  const pool = poolFalso()
  const authPg = cargar(pool)
  const LINEA = '22222222-2222-2222-2222-222222222222'
  try {
    const { state } = await authPg.useDbAuthState(LINEA)
    await state.keys.set(CLAVES)
    const ids = Object.keys(CLAVES['session'])
    const leido = await state.keys.get('session', ids)
    assert.deepEqual(leido[ids[0]], CLAVES['session'][ids[0]])
    assert.deepEqual(leido[ids[1]], CLAVES['session'][ids[1]])
  } finally { delete require.cache[authPgPath]; delete require.cache[dbPath] }
})

test('migrar dos veces no pisa lo que ya esta en Postgres', async () => {
  const { useMultiFileAuthState } = require('@whiskeysockets/baileys')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-auth2-'))
  const LINEA = '33333333-3333-3333-3333-333333333333'
  try {
    const enDisco = await useMultiFileAuthState(dir)
    await enDisco.saveCreds()
    const pool = poolFalso()
    const authPg = cargar(pool)
    assert.equal((await authPg.migrarDesdeDisco(LINEA, dir)).migrada, true)
    const segunda = await authPg.migrarDesdeDisco(LINEA, dir)
    assert.equal(segunda.migrada, false)
    assert.match(segunda.motivo, /ya existe/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
    delete require.cache[authPgPath]; delete require.cache[dbPath]
  }
})

test('borrarSesion deja la linea sin claves (logout limpio)', async () => {
  const pool = poolFalso()
  const authPg = cargar(pool)
  const LINEA = '44444444-4444-4444-4444-444444444444'
  try {
    const { state } = await authPg.useDbAuthState(LINEA)
    await state.keys.set(CLAVES)
    assert.ok(pool._tabla.size > 0)
    await authPg.borrarSesion(LINEA)
    assert.equal([...pool._tabla.keys()].filter(k => k.startsWith(LINEA)).length, 0)
  } finally { delete require.cache[authPgPath]; delete require.cache[dbPath] }
})
