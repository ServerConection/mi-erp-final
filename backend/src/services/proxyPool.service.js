/**
 * Pool de proxies — asignación de IPs fijas por línea de WhatsApp
 *
 * Modelo: el proveedor (DataImpulse) entrega una IP fija distinta por cada
 * PUERTO sticky (10000, 10001, 10002...). Una línea = un puerto = una IP.
 *
 * Reglas que implementa este módulo:
 *
 *  1. IP fija durante la vida de la sesión. NO se rota por mensaje: WhatsApp
 *     usa un WebSocket persistente y autenticado; cambiar de IP a mitad de
 *     sesión obliga a reconectar y se parece a un robo de sesión, que es de
 *     las señales más fuertes de bloqueo. La rotación pertenece al scraping,
 *     no a sesiones vivas.
 *
 *  2. IP fresca al RE-VINCULAR. Cuando una línea se quema y se enlaza un
 *     número nuevo, toma una IP limpia del pool en vez de heredar la anterior.
 *     Ese es el momento correcto para rotar: al empezar de cero.
 *
 *  3. IPs quemadas se retiran. Si WhatsApp bloqueó un número usando cierta IP,
 *     esa IP no se reasigna a otro número (tabla proxy_puertos_quemados).
 */
const { query } = require('../config/db')

const PROXY_HOST      = process.env.PROXY_HOST      || 'gw.dataimpulse.com'
const PROXY_USER      = process.env.PROXY_USER      || ''
const PROXY_PASS      = process.env.PROXY_PASS      || ''
const PROXY_COUNTRY   = process.env.PROXY_COUNTRY   || 'ec'
const PROXY_BASE_PORT = parseInt(process.env.PROXY_STICKY_BASE_PORT || '10000', 10)
// Cuántos puertos sticky entrega el plan contratado (DataImpulse: "Cantidad")
const PROXY_PUERTOS   = parseInt(process.env.PROXY_PUERTOS || '120', 10)
const PROXY_MAX_PORT  = PROXY_BASE_PORT + PROXY_PUERTOS - 1

const hayCredenciales = () => !!(PROXY_USER && PROXY_PASS)

/**
 * Primer puerto libre del pool: el menor que no esté en uso por una línea
 * activa ni marcado como quemado. Reutiliza huecos que dejaron líneas dadas
 * de baja, salvo que su IP esté retirada.
 * Devuelve null si el pool está agotado.
 */
async function siguientePuertoLibre() {
  const { rows } = await query(`
    SELECT g.puerto
    FROM generate_series($1::int, $2::int) AS g(puerto)
    WHERE NOT EXISTS (
      SELECT 1 FROM lines l
      WHERE l.deleted_at IS NULL
        AND l.proxy_config->>'host' = $3
        AND l.proxy_config->>'port' ~ '^[0-9]+$'
        AND (l.proxy_config->>'port')::int = g.puerto
    )
    AND NOT EXISTS (
      SELECT 1 FROM proxy_puertos_quemados q
      WHERE q.host = $3 AND q.puerto = g.puerto
    )
    ORDER BY g.puerto
    LIMIT 1
  `, [PROXY_BASE_PORT, PROXY_MAX_PORT, PROXY_HOST])

  return rows[0]?.puerto ?? null
}

/**
 * Devuelve el puerto (IP) de una línea al pool: vacía su proxy_config para que
 * `siguientePuertoLibre()` lo vuelva a ofrecer a otra línea.
 *
 * Se usa cuando una línea deja de necesitar su IP de verdad:
 *   - baja lógica de la línea
 *   - sesión cerrada por WhatsApp (logged_out) tras agotar el reintento
 *   - línea muerta hace mucho (ver reconciliarPuertos)
 *
 * NO se llama en una desconexión pasajera (corte de red): ahí la línea reconecta
 * sola sobre su misma IP y robársela provocaría dos números en la misma IP.
 */
async function liberarPuertoDeLinea(lineId) {
  if (!lineId) return false
  try {
    const { rowCount } = await query(
      `UPDATE lines
          SET proxy_enabled = false, proxy_config = '{}'::jsonb, updated_at = NOW()
        WHERE id = $1
          AND proxy_config->>'port' IS NOT NULL`,
      [lineId]
    )
    if (rowCount) console.log(`[proxyPool] ♻️ Puerto liberado de la línea ${lineId} — vuelve al pool`)
    return rowCount > 0
  } catch (e) {
    console.warn(`[proxyPool] No se pudo liberar el puerto de ${lineId}:`, e.message)
    return false
  }
}

/**
 * Recupera puertos "colgados": líneas que reservan una IP pero ya no la usan.
 *   - status 'logged_out'          → sesión cerrada, necesita QR + IP nueva
 *   - 'disconnected' / 'error' con updated_at > 24 h → línea muerta
 * NO toca líneas conectadas, conectando, esperando QR ni caídas hace poco.
 * Devuelve cuántos puertos volvieron al pool.
 */
async function reconciliarPuertos() {
  try {
    const { rowCount } = await query(`
      UPDATE lines
         SET proxy_enabled = false, proxy_config = '{}'::jsonb, updated_at = NOW()
       WHERE deleted_at IS NULL
         AND proxy_config->>'port' IS NOT NULL
         AND (
              status = 'logged_out'
           OR (status IN ('disconnected','error') AND updated_at < NOW() - INTERVAL '24 hours')
         )
    `)
    if (rowCount) console.log(`[proxyPool] ♻️ reconciliarPuertos: ${rowCount} puerto(s) devuelto(s) al pool`)
    return rowCount
  } catch (e) {
    console.warn('[proxyPool] reconciliarPuertos falló:', e.message)
    return 0
  }
}

/**
 * Estado del pool para pintarlo en pantalla.
 * { credenciales, total, en_uso, quemados, libres }
 */
async function estadoPool() {
  await reconciliarPuertos()
  try {
    const [uso, quemados] = await Promise.all([
      query(`
        SELECT COUNT(*)::int AS n FROM lines l
        WHERE l.deleted_at IS NULL
          AND l.proxy_enabled = true
          AND l.proxy_config->>'host' = $1
          AND l.proxy_config->>'port' ~ '^[0-9]+$'
          AND (l.proxy_config->>'port')::int BETWEEN $2 AND $3
      `, [PROXY_HOST, PROXY_BASE_PORT, PROXY_MAX_PORT]),
      query(`
        SELECT COUNT(*)::int AS n FROM proxy_puertos_quemados
        WHERE host = $1 AND puerto BETWEEN $2 AND $3
      `, [PROXY_HOST, PROXY_BASE_PORT, PROXY_MAX_PORT]),
    ])
    const total    = PROXY_PUERTOS
    const en_uso   = uso.rows[0].n
    const quemadosN = quemados.rows[0].n
    const libres   = Math.max(0, total - en_uso - quemadosN)
    return { credenciales: hayCredenciales(), total, en_uso, quemados: quemadosN, libres }
  } catch (e) {
    console.warn('[proxyPool] estadoPool falló:', e.message)
    return { credenciales: hayCredenciales(), total: PROXY_PUERTOS, en_uso: null, quemados: null, libres: null }
  }
}

/**
 * Arma la configuración de proxy para una línea nueva.
 * Devuelve null si no hay credenciales o si el pool está agotado.
 */
async function construirProxyAutomatico() {
  if (!hayCredenciales()) return null
  try {
    await reconciliarPuertos()
    const puerto = await siguientePuertoLibre()
    if (puerto === null) {
      console.warn(
        `[proxyPool] Pool agotado: no quedan puertos libres entre ${PROXY_BASE_PORT} y ${PROXY_MAX_PORT}. ` +
        `Amplía el plan o libera IPs quemadas.`
      )
      return null
    }
    return {
      protocol: 'http',
      host: PROXY_HOST,
      port: puerto,
      // Formato DataImpulse para fijar país: usuario__cr.ec
      username: `${PROXY_USER}__cr.${PROXY_COUNTRY}`,
      password: PROXY_PASS,
    }
  } catch (e) {
    console.warn('[proxyPool] No se pudo asignar proxy:', e.message)
    return null
  }
}

/**
 * Marca un puerto (IP) como quemado para que no vuelva a asignarse.
 * Idempotente: si ya estaba registrado, no hace nada.
 */
async function quemarPuerto(host, puerto, lineId, motivo) {
  if (!host || !puerto) return false
  try {
    await query(`
      INSERT INTO proxy_puertos_quemados (host, puerto, line_id, motivo)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (host, puerto) DO NOTHING
    `, [host, parseInt(puerto, 10), lineId || null, motivo || 'manual'])
    console.warn(`[proxyPool] 🔥 IP retirada: ${host}:${puerto} (motivo: ${motivo}). No se reasignará.`)
    return true
  } catch (e) {
    console.warn('[proxyPool] No se pudo registrar la IP quemada:', e.message)
    return false
  }
}

/**
 * Quema la IP actual de una línea (si tiene) y le asigna una fresca del pool.
 * Se usa al re-vincular una línea que quedó en logged_out/error.
 * Devuelve la nueva config, o null si no se pudo rotar (y entonces se conserva
 * la que tenía, que es preferible a quedarse sin proxy).
 */
async function rotarProxyDeLinea(lineId, motivo = 'revinculacion') {
  if (!hayCredenciales()) return null
  try {
    const { rows } = await query(
      `SELECT proxy_enabled, proxy_config FROM lines WHERE id = $1`,
      [lineId]
    )
    const linea = rows[0]
    if (!linea || !linea.proxy_enabled) return null

    const actual = linea.proxy_config || {}
    if (!actual.host || !actual.port) return null

    // 1. Retirar la IP anterior (pudo quedar marcada por WhatsApp)
    await quemarPuerto(actual.host, actual.port, lineId, motivo)

    // 2. Tomar una limpia
    const nueva = await construirProxyAutomatico()
    if (!nueva) {
      console.warn(`[proxyPool] Línea ${lineId}: sin puertos libres, se conserva ${actual.host}:${actual.port}`)
      return null
    }

    await query(
      `UPDATE lines SET proxy_config = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(nueva), lineId]
    )
    console.log(`[proxyPool] ♻️ Línea ${lineId}: IP rotada ${actual.port} → ${nueva.port} (${motivo})`)
    return nueva
  } catch (e) {
    console.warn('[proxyPool] No se pudo rotar el proxy:', e.message)
    return null
  }
}

module.exports = {
  PROXY_HOST,
  PROXY_BASE_PORT,
  PROXY_MAX_PORT,
  hayCredenciales,
  siguientePuertoLibre,
  construirProxyAutomatico,
  quemarPuerto,
  rotarProxyDeLinea,
  liberarPuertoDeLinea,
  reconciliarPuertos,
  estadoPool,
}
