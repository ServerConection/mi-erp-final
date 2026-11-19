/**
 * Prueba credenciales NUEVAS de DataImpulse ANTES de ponerlas en Render.
 * Solo lectura: no toca BD ni líneas.
 * Uso (PowerShell, desde backend):
 *   $env:NEW_USER="login"; $env:NEW_PASS="password"; node scripts/probar_residencial.js
 */
const https = require('https')
const { HttpsProxyAgent } = require('https-proxy-agent')
const U = process.env.NEW_USER, P = process.env.NEW_PASS
if (!U || !P) { console.error('Faltan NEW_USER / NEW_PASS'); process.exit(1) }

const get = (url, agent) => new Promise(r => {
  const t0 = Date.now()
  const q = https.get(url, { agent, timeout: 15000 }, res => {
    let b = ''; res.on('data', d => b += d); res.on('end', () => r({ code: res.statusCode, body: b.trim().slice(0, 40), ms: Date.now() - t0 }))
  })
  q.on('timeout', () => { q.destroy(); r({ code: 'timeout' }) })
  q.on('error', e => r({ code: e.code || e.message }))
})

;(async () => {
  const filas = []
  for (const port of [10200, 10201, 10202, 10203, 10204, 10205, 10206, 10207, 10208, 10209]) {
    const agent = new HttpsProxyAgent(`http://${encodeURIComponent(U + '__cr.ec')}:${encodeURIComponent(P)}@gw.dataimpulse.com:${port}`)
    const ip = await get('https://api.ipify.org', agent)
    const wa = ip.code === 200 ? await get('https://web.whatsapp.com', agent) : { code: '-' }
    filas.push({ puerto: port, ip: ip.code === 200 ? ip.body : `FALLA ${ip.code}`, whatsapp: wa.code === 200 ? `OK ${wa.ms}ms` : `FALLA ${wa.code}` })
  }
  console.table(filas)
  const ok = filas.filter(f => String(f.whatsapp).startsWith('OK')).length
  console.log(`\n${ok} de ${filas.length} puertos con IP de Ecuador funcionando.`)
})()
