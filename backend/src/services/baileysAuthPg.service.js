/**
 * Estado de autenticación de Baileys en Postgres (Opción B)
 * ---------------------------------------------------------------------------
 * Reemplaza a `useMultiFileAuthState`, que guarda la sesión en una carpeta del
 * disco persistente. Ese disco es la razón por la que `erp-wabot` está clavado
 * en `numInstances: 1`: Render no monta el mismo disco en dos instancias, así
 * que si el servicio se cae, se caen TODAS las líneas a la vez.
 *
 * Con el estado en Postgres el servicio deja de tener estado local y se puede
 * correr en varias instancias. Eso NO alcanza por sí solo: dos instancias
 * podrían levantar la misma sesión y WhatsApp lee dos sockets con las mismas
 * credenciales como robo de sesión. Por eso esto SIEMPRE va junto con
 * lineLock.service.js, que garantiza un único dueño por línea.
 *
 * Uso (reemplaza la línea 230 de BaileysManager.js):
 *   const { state, saveCreds } = await useDbAuthState(lineId)
 *
 * El `data` se guarda como TEXT, no JSONB: el contenido lleva Buffers
 * serializados con el BufferJSON de Baileys y jsonb los desarmaría.
 */
const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys')
const pool = require('../config/db')

const ser   = (valor) => JSON.stringify(valor, BufferJSON.replacer)
const deser = (texto) => JSON.parse(texto, BufferJSON.reviver)

/**
 * MISMA transformación de nombre que usa useMultiFileAuthState en disco
 * (`fixFileName`: '/' → '__', ':' → '-'). El key_id guardado en Postgres es
 * idéntico al nombre del archivo sin '.json'.
 *
 * Esto importa mucho: así migrar una sesión del disco es copiar
 * nombre-de-archivo → key_id, sin tener que revertir la transformación. Y
 * revertirla es IMPOSIBLE de forma fiable, porque un id de sesión real
 * ('5939...0:1@s.whatsapp.net') ya contiene guiones propios y no hay manera de
 * saber cuáles venían de un ':'. Un solo id mal reconstruido corrompe la
 * sesión y WhatsApp la cierra con 401 — es decir, QR nuevo para ese asesor.
 */
const fixKeyId = (nombre) => nombre.replace(/\//g, '__').replace(/:/g, '-')

async function leer(lineId, keyId) {
  const r = await pool.query(
    'SELECT data FROM wa_auth_state WHERE line_id = $1 AND key_id = $2',
    [lineId, keyId]
  )
  if (!r.rows.length) return null
  try {
    return deser(r.rows[0].data)
  } catch (e) {
    console.error(`[authPg ${lineId}] clave "${keyId}" ilegible, se descarta:`, e.message)
    return null
  }
}

async function escribir(lineId, keyId, valor) {
  await pool.query(
    `INSERT INTO wa_auth_state (line_id, key_id, data, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (line_id, key_id)
     DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [lineId, keyId, ser(valor)]
  )
}

async function borrar(lineId, keyId) {
  await pool.query('DELETE FROM wa_auth_state WHERE line_id = $1 AND key_id = $2', [lineId, keyId])
}

/** Borra TODA la sesión de una línea. Se llama al desvincular (logged_out). */
async function borrarSesion(lineId) {
  const r = await pool.query('DELETE FROM wa_auth_state WHERE line_id = $1', [lineId])
  return r.rowCount
}

/**
 * Equivalente a useMultiFileAuthState pero contra Postgres.
 * Devuelve { state, saveCreds } con la misma forma que espera Baileys.
 */
async function useDbAuthState(lineId) {
  const creds = (await leer(lineId, 'creds')) || initAuthCreds()

  const keys = {
    // Baileys pide: get(type, ids) -> { [id]: valor }
    get: async (type, ids) => {
      const out = {}
      if (!ids.length) return out
      // key_id transformado → id ORIGINAL que pidió Baileys. No se deriva del
      // key_id (ver fixKeyId): se conserva el id tal cual vino.
      const porKeyId = new Map(ids.map((id) => [fixKeyId(`${type}-${id}`), id]))
      const r = await pool.query(
        'SELECT key_id, data FROM wa_auth_state WHERE line_id = $1 AND key_id = ANY($2::text[])',
        [lineId, [...porKeyId.keys()]]
      )
      for (const row of r.rows) {
        const id = porKeyId.get(row.key_id)
        if (id === undefined) continue
        let valor
        try { valor = deser(row.data) } catch { continue }
        // Igual que el store de archivos: esta clave se rehidrata como proto.
        if (type === 'app-state-sync-key' && valor) {
          valor = proto.Message.AppStateSyncKeyData.fromObject(valor)
        }
        out[id] = valor
      }
      return out
    },

    // set(data) -> data = { [type]: { [id]: valor | null } }; null = borrar
    set: async (data) => {
      const inserts = []
      const deletes = []
      for (const type of Object.keys(data)) {
        for (const id of Object.keys(data[type])) {
          const valor = data[type][id]
          const keyId = fixKeyId(`${type}-${id}`)
          if (valor) inserts.push([keyId, ser(valor)])
          else deletes.push(keyId)
        }
      }
      // Una sola transacción: si el proceso muere a mitad, la sesión no queda
      // en un estado intermedio que obligue a reescanear el QR.
      await pool.transaction(async (client) => {
        if (deletes.length) {
          await client.query(
            'DELETE FROM wa_auth_state WHERE line_id = $1 AND key_id = ANY($2::text[])',
            [lineId, deletes]
          )
        }
        for (const [keyId, texto] of inserts) {
          await client.query(
            `INSERT INTO wa_auth_state (line_id, key_id, data, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (line_id, key_id)
             DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
            [lineId, keyId, texto]
          )
        }
      })
    },
  }

  return {
    state: { creds, keys },
    saveCreds: () => escribir(lineId, 'creds', creds),
  }
}

/**
 * Migra una sesión que ya existe en disco hacia Postgres, sin pedir QR nuevo.
 * Se corre UNA vez por línea durante el corte. Idempotente: si la línea ya
 * tiene estado en Postgres no la pisa, salvo que se pase forzar = true.
 */
async function migrarDesdeDisco(lineId, authDir, { forzar = false } = {}) {
  const fs = require('fs')
  const path = require('path')
  if (!fs.existsSync(authDir)) return { migrada: false, motivo: 'sin carpeta en disco' }

  if (!forzar) {
    const ya = await pool.query('SELECT 1 FROM wa_auth_state WHERE line_id = $1 LIMIT 1', [lineId])
    if (ya.rows.length) return { migrada: false, motivo: 'ya existe en Postgres' }
  }

  const archivos = fs.readdirSync(authDir).filter((f) => f.endsWith('.json'))
  let n = 0
  for (const archivo of archivos) {
    // Copia literal: el nombre del archivo YA es el key_id (ver fixKeyId).
    const keyId = archivo.replace(/\.json$/, '')
    const texto = fs.readFileSync(path.join(authDir, archivo), 'utf-8')
    try {
      JSON.parse(texto) // solo valida que sea JSON; se guarda tal cual
    } catch {
      console.warn(`[authPg ${lineId}] ${archivo} no es JSON válido, se omite`)
      continue
    }
    await pool.query(
      `INSERT INTO wa_auth_state (line_id, key_id, data, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (line_id, key_id)
       DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [lineId, keyId, texto]
    )
    n++
  }
  return { migrada: n > 0, claves: n }
}

module.exports = { useDbAuthState, borrarSesion, migrarDesdeDisco }
