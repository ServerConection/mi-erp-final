/**
 * Lease por línea — un solo dueño de cada sesión de WhatsApp
 * ---------------------------------------------------------------------------
 * Con el estado de Baileys en Postgres (baileysAuthPg.service.js) el servicio
 * deja de tener estado local y se puede escalar. Pero aparece un peligro nuevo:
 * dos instancias podrían levantar la MISMA sesión al mismo tiempo, y dos
 * sockets con las mismas credenciales es exactamente la señal que WhatsApp lee
 * como robo de sesión. Es de las formas más rápidas de que te quemen el número.
 *
 * Este módulo evita eso con un lease en base: una instancia toma la línea, la
 * renueva por heartbeat mientras la tiene viva, y otra instancia solo puede
 * robarla si el lease VENCIÓ (es decir, la dueña murió y dejó de renovar).
 *
 * Se usa lease con vencimiento y no un advisory lock de Postgres a propósito:
 * el advisory lock vive atado a la conexión, y con un pool la conexión se
 * devuelve y el lock se suelta sin que nadie se entere.
 *
 * TTL 90s / heartbeat 30s: si una instancia se cae, otra puede tomar la línea
 * en menos de 90 segundos, y hay margen de 3 latidos perdidos antes de que
 * alguien la robe por error durante un hipo de red.
 */
const os = require('os')
const pool = require('../config/db')

const TTL_SEG       = parseInt(process.env.WA_LOCK_TTL_SEG || '90', 10)
const HEARTBEAT_SEG = parseInt(process.env.WA_LOCK_HEARTBEAT_SEG || '30', 10)

// Identidad de esta instancia. En Render, RENDER_INSTANCE_ID es único por
// instancia; el hostname + pid sirve de respaldo en local.
const OWNER = process.env.RENDER_INSTANCE_ID || `${os.hostname()}:${process.pid}`

const heartbeats = new Map() // lineId -> intervalo

/**
 * Intenta tomar la línea. Devuelve true solo si esta instancia quedó dueña.
 * Se puede tomar si: nadie la tiene, el lease venció, o ya éramos dueños
 * (re-entrante, para que un reconnect no se bloquee a sí mismo).
 */
async function adquirir(lineId) {
  const r = await pool.query(
    `INSERT INTO wa_line_locks (line_id, owner, expires_at, updated_at)
     VALUES ($1, $2, NOW() + ($3 || ' seconds')::interval, NOW())
     ON CONFLICT (line_id) DO UPDATE
       SET owner      = EXCLUDED.owner,
           expires_at = EXCLUDED.expires_at,
           updated_at = NOW()
     WHERE wa_line_locks.expires_at < NOW()
        OR wa_line_locks.owner = EXCLUDED.owner
     RETURNING owner`,
    [lineId, OWNER, String(TTL_SEG)]
  )
  const tomada = r.rows.length > 0 && r.rows[0].owner === OWNER
  if (tomada) _iniciarHeartbeat(lineId)
  return tomada
}

/** Renueva el lease. Devuelve false si lo perdimos (otra instancia lo robó). */
async function renovar(lineId) {
  const r = await pool.query(
    `UPDATE wa_line_locks
        SET expires_at = NOW() + ($3 || ' seconds')::interval, updated_at = NOW()
      WHERE line_id = $1 AND owner = $2
      RETURNING owner`,
    [lineId, OWNER, String(TTL_SEG)]
  )
  return r.rows.length > 0
}

/** Suelta la línea. Solo borra si seguimos siendo los dueños. */
async function soltar(lineId) {
  _detenerHeartbeat(lineId)
  await pool.query('DELETE FROM wa_line_locks WHERE line_id = $1 AND owner = $2', [lineId, OWNER])
}

/** Suelta todo — para el apagado ordenado (SIGTERM de Render en cada deploy). */
async function soltarTodo() {
  for (const lineId of [...heartbeats.keys()]) _detenerHeartbeat(lineId)
  await pool.query('DELETE FROM wa_line_locks WHERE owner = $1', [OWNER])
}

/**
 * Callback que se dispara si perdemos un lease sin querer. Quien lo registre
 * (BaileysManager) debe CERRAR el socket de esa línea de inmediato: si otra
 * instancia ya la tomó, seguir conectados es justo lo que quema el número.
 */
let alPerder = null
function onLeasePerdido(fn) { alPerder = fn }

function _iniciarHeartbeat(lineId) {
  if (heartbeats.has(lineId)) return
  const t = setInterval(async () => {
    try {
      const sigue = await renovar(lineId)
      if (!sigue) {
        console.error(`[lock ${lineId}] lease PERDIDO — otra instancia tomó la línea. Cerrando socket.`)
        _detenerHeartbeat(lineId)
        if (alPerder) { try { await alPerder(lineId) } catch (e) { console.error('[lock] alPerder falló:', e.message) } }
      }
    } catch (e) {
      // Un error de red no significa que perdimos el lease: quedan 3 latidos
      // de margen antes de que venza. Se reintenta en el próximo tick.
      console.warn(`[lock ${lineId}] heartbeat falló (se reintenta):`, e.message)
    }
  }, HEARTBEAT_SEG * 1000)
  if (t.unref) t.unref()
  heartbeats.set(lineId, t)
}

function _detenerHeartbeat(lineId) {
  const t = heartbeats.get(lineId)
  if (t) clearInterval(t)
  heartbeats.delete(lineId)
}

module.exports = { adquirir, renovar, soltar, soltarTodo, onLeasePerdido, OWNER, TTL_SEG, HEARTBEAT_SEG }
