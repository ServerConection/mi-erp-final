/**
 * DIAGNÓSTICO WABOT — SOLO LECTURA (no modifica BD ni líneas).
 * Uso (desde la carpeta backend):  node scripts/diagnostico_wabot.js
 *
 * 1) Lista las líneas activas con su estado y proxy.
 * 2) Prueba cada proxy: sale a internet, IP de salida y si alcanza WhatsApp.
 * 3) Resume el pool (puertos en uso / quemados).
 */
require('dotenv').config()
const https = require('https')
const { query } = require('../src/config/db')

function agenteDe(pc) {
  const proto = (pc.protocol || 'socks5').toLowerCase()
  const url = pc.username
    ? `${proto}://${encodeURIComponent(pc.username)}:${encodeURIComponent(pc.password || '')}@${pc.host}:${pc.port}`
    : `${proto}://${pc.host}:${pc.port}`
  if (proto.startsWith('socks')) { const { SocksProxyAgent } = require('socks-proxy-agent'); return new SocksProxyAgent(url) }
  const { HttpsProxyAgent } = require('https-proxy-agent'); return new HttpsProxyAgent(url)
}

function get(url, agent, ms = 12000) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const req = https.get(url, { agent, timeout: ms }, (res) => {
      let body = ''; res.on('data', d => { if (body.length < 200) body += d })
      res.on('end', () => resolve({ ok: true, code: res.statusCode, ms: Date.now() - t0, body: body.trim() }))
    })
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, err: 'timeout', ms: Date.now() - t0 }) })
    req.on('error', (e) => resolve({ ok: false, err: e.code || e.message, ms: Date.now() - t0 }))
  })
}

;(async () => {
  console.log('\n=== WABOT: estado de líneas ===')
  console.log('Node', process.version, '| Baileys', require('@whiskeysockets/baileys/package.json').version)
  console.log('WA_PROXY_REQUIRED (local .env):', process.env.WA_PROXY_REQUIRED || '(no definido)')

  const { rows } = await query(`
    SELECT id, name, status, proxy_enabled, proxy_config, updated_at
    FROM lines WHERE deleted_at IS NULL ORDER BY status, name`)

  const porEstado = {}
  rows.forEach(r => { porEstado[r.status] = (porEstado[r.status] || 0) + 1 })
  console.log('Total líneas:', rows.length, '| por estado:', porEstado)

  console.log('\n=== Prueba de proxies (una por línea) ===')
  const resultados = []
  for (const l of rows) {
    const pc = l.proxy_config || {}
    if (!l.proxy_enabled || !pc.host) { resultados.push({ linea: l.name, estado: l.status, proxy: 'SIN PROXY' }); continue }
    let agent
    try { agent = agenteDe(pc) } catch (e) { resultados.push({ linea: l.name, estado: l.status, proxy: `${pc.port}`, salida: 'ERROR agente: ' + e.message }); continue }
    const ip = await get('https://api.ipify.org', agent)
    const wa = await get('https://web.whatsapp.com', agent)
    resultados.push({
      linea: l.name.slice(0, 32), estado: l.status, puerto: pc.port,
      ip_salida: (ip.ok && ip.code === 200) ? ip.body : `FALLA (${ip.code || ip.err})`,
      whatsapp: (wa.ok && wa.code < 500 && ip.ok && ip.code === 200) ? `OK ${wa.code} ${wa.ms}ms` : `FALLA (proxy ${wa.code || wa.err})`,
    })
    // Si falla, se prueba el MISMO puerto sin filtro de país (__cr.ec) para
    // saber si el problema es la falta de IPs de Ecuador en el proveedor.
    const ultimo = resultados[resultados.length - 1]
    if (ultimo.whatsapp.startsWith('FALLA') && String(pc.username || '').includes('__cr.')) {
      const sinPais = await get('https://api.ipify.org', agenteDe({ ...pc, username: pc.username.split('__')[0] }))
      ultimo.sin_pais = sinPais.ok && sinPais.code === 200 ? `OK ${sinPais.body}` : `FALLA ${sinPais.code || sinPais.err}`
    }
  }
  console.table(resultados)

  // IPs repetidas = dos números saliendo por la misma IP (riesgo de bloqueo)
  const ips = {}
  resultados.forEach(r => { if (r.ip_salida && !String(r.ip_salida).startsWith('FALLA')) (ips[r.ip_salida] = ips[r.ip_salida] || []).push(r.linea) })
  const repetidas = Object.entries(ips).filter(([, v]) => v.length > 1)
  console.log('\nIPs compartidas por más de una línea:', repetidas.length ? repetidas : 'ninguna')

  try {
    const q = await query(`SELECT COUNT(*)::int n FROM proxy_puertos_quemados`)
    console.log('Puertos quemados en BD:', q.rows[0].n)
  } catch (e) { console.log('proxy_puertos_quemados:', e.message) }

  const fallan = resultados.filter(r => String(r.whatsapp || '').startsWith('FALLA')).length
  console.log(`\nRESUMEN: ${fallan} de ${resultados.length} líneas NO alcanzan WhatsApp por su proxy.`)
  process.exit(0)
})().catch(e => { console.error('Error:', e.message); process.exit(1) })
