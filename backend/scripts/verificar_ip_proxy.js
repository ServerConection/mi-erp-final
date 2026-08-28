/**
 * Verificación de IP del proxy — ¿es realmente estable/dedicada o es del
 * pool compartido de DataImpulse?
 *
 * Qué hace: se conecta a través de UNO (o varios) de los puertos sticky
 * configurados en PROXY_HOST/PROXY_USER/PROXY_PASS, consulta un servicio
 * público (ipinfo.io) para ver con qué IP y qué organización/ASN sale a
 * internet en ese momento, y guarda el resultado en un log local
 * (scripts/logs/verificacion_proxy_ip.jsonl). Corriéndolo varias veces a
 * lo largo de varios días (a mano, o con el Programador de tareas de
 * Windows) queda un historial real de si la IP cambia sola o no.
 *
 * Uso:
 *   node scripts/verificar_ip_proxy.js                    → chequea el puerto base (línea 1) una vez
 *   node scripts/verificar_ip_proxy.js --puerto 10005      → chequea un puerto específico
 *   node scripts/verificar_ip_proxy.js --puertos 10000,10001,10002  → varios de una
 *   node scripts/verificar_ip_proxy.js --repetir 5 --cada 30        → 5 veces, cada 30 min, en esta misma corrida
 *   node scripts/verificar_ip_proxy.js --resumen                    → solo analiza el log ya guardado, sin red
 */
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const https = require('https')

const PROXY_HOST      = process.env.PROXY_HOST      || 'gw.dataimpulse.com'
const PROXY_USER      = process.env.PROXY_USER      || ''
const PROXY_PASS      = process.env.PROXY_PASS      || ''
const PROXY_COUNTRY   = process.env.PROXY_COUNTRY   || 'ec'
const PROXY_BASE_PORT = parseInt(process.env.PROXY_STICKY_BASE_PORT || '10000', 10)

const LOG_DIR  = path.join(__dirname, 'logs')
const LOG_FILE = path.join(LOG_DIR, 'verificacion_proxy_ip.jsonl')

// ── Args de línea de comandos ────────────────────────────────────────────
function leerArgs() {
  const args = process.argv.slice(2)
  const get = (flag) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : null
  }
  const puertosStr = get('--puertos')
  const puertoUnico = get('--puerto')
  let puertos = [PROXY_BASE_PORT]
  if (puertosStr) puertos = puertosStr.split(',').map(p => parseInt(p.trim(), 10)).filter(Boolean)
  else if (puertoUnico) puertos = [parseInt(puertoUnico, 10)]

  return {
    puertos,
    repetir: parseInt(get('--repetir') || '1', 10),
    cadaMin: parseFloat(get('--cada') || '0'),
    resumen: args.includes('--resumen'),
  }
}

// ── Consulta la IP de salida a través de un puerto del proxy ────────────
function consultarIpViaProxy(puerto) {
  return new Promise((resolve) => {
    if (!PROXY_USER || !PROXY_PASS) {
      return resolve({ puerto, error: 'Faltan PROXY_USER/PROXY_PASS en el .env' })
    }
    let HttpsProxyAgent
    try {
      ;({ HttpsProxyAgent } = require('https-proxy-agent'))
    } catch (e) {
      return resolve({ puerto, error: 'Falta instalar https-proxy-agent (npm install https-proxy-agent)' })
    }

    const username = `${PROXY_USER}__cr.${PROXY_COUNTRY}`
    const proxyUrl = `http://${username}:${PROXY_PASS}@${PROXY_HOST}:${puerto}`
    const agent = new HttpsProxyAgent(proxyUrl)

    const req = https.get('https://ipinfo.io/json', { agent, timeout: 15000 }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const info = JSON.parse(data)
          resolve({
            puerto,
            ip: info.ip || null,
            org: info.org || null,
            ciudad: info.city || null,
            pais: info.country || null,
          })
        } catch (e) {
          resolve({ puerto, error: `Respuesta inesperada de ipinfo.io: ${e.message}` })
        }
      })
    })
    req.on('timeout', () => { req.destroy(); resolve({ puerto, error: 'Timeout consultando a través del proxy (15s)' }) })
    req.on('error', (e) => resolve({ puerto, error: e.message }))
  })
}

function guardarResultado(resultado) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
  const linea = JSON.stringify({ timestamp: new Date().toISOString(), ...resultado })
  fs.appendFileSync(LOG_FILE, linea + '\n', 'utf8')
}

function leerLog() {
  if (!fs.existsSync(LOG_FILE)) return []
  return fs.readFileSync(LOG_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => { try { return JSON.parse(l) } catch { return null } })
    .filter(Boolean)
}

// ── Resumen: ¿cuántas IPs distintas vio cada puerto, y cuándo cambió? ───
function imprimirResumen() {
  const registros = leerLog()
  if (!registros.length) {
    console.log('Todavía no hay chequeos guardados. Corre el script sin --resumen primero.')
    return
  }

  const porPuerto = {}
  for (const r of registros) {
    if (!porPuerto[r.puerto]) porPuerto[r.puerto] = []
    porPuerto[r.puerto].push(r)
  }

  console.log(`\n=== Resumen de verificación de IP (${registros.length} chequeos guardados) ===\n`)
  for (const puerto of Object.keys(porPuerto).sort()) {
    const regs = porPuerto[puerto].filter(r => r.ip)
    const ips = [...new Set(regs.map(r => r.ip))]
    const errores = porPuerto[puerto].filter(r => r.error).length

    console.log(`Puerto ${puerto}:`)
    console.log(`  Chequeos: ${porPuerto[puerto].length} (${errores} con error)`)
    console.log(`  IPs distintas vistas: ${ips.length}${ips.length > 1 ? '  ⚠️  LA IP CAMBIÓ EN ALGÚN MOMENTO' : '  ✅ siempre la misma IP'}`)
    if (ips.length) {
      const ultimo = regs[regs.length - 1]
      console.log(`  Última IP vista: ${ultimo.ip} (${ultimo.org || 'organización desconocida'}) — ${ultimo.timestamp}`)
    }
    if (ips.length > 1) {
      console.log(`  Historial de IPs: ${ips.join(', ')}`)
    }
    console.log('')
  }

  console.log(
    'Interpretación rápida: si un puerto muestra más de una IP distinta a lo\n' +
    'largo de varios días, esa "IP fija" en realidad rota sola (confirma la\n' +
    'limitación de las sesiones "sticky" de DataImpulse). Si dos puertos\n' +
    'distintos alguna vez muestran la MISMA IP en el mismo momento, es señal\n' +
    'de pool compartido con solape. Revisa manualmente el campo "org" de\n' +
    'cada IP en https://ipinfo.io/<ip> para confirmar que sea un operador\n' +
    'móvil ecuatoriano (Claro, Movistar, CNT) y no un datacenter.\n'
  )
}

async function main() {
  const { puertos, repetir, cadaMin, resumen } = leerArgs()

  if (resumen) return imprimirResumen()

  for (let vuelta = 1; vuelta <= repetir; vuelta++) {
    if (repetir > 1) console.log(`\n--- Vuelta ${vuelta}/${repetir} ---`)
    for (const puerto of puertos) {
      const resultado = await consultarIpViaProxy(puerto)
      guardarResultado(resultado)
      if (resultado.error) {
        console.log(`Puerto ${puerto}: ❌ ${resultado.error}`)
      } else {
        console.log(`Puerto ${puerto}: ${resultado.ip}  (${resultado.org || '?'}, ${resultado.ciudad || '?'}, ${resultado.pais || '?'})`)
      }
    }
    if (vuelta < repetir && cadaMin > 0) {
      console.log(`Esperando ${cadaMin} minuto(s) antes de la siguiente vuelta...`)
      await new Promise(r => setTimeout(r, cadaMin * 60 * 1000))
    }
  }

  console.log(`\nGuardado en: ${LOG_FILE}`)
  console.log('Corre con --resumen en cualquier momento para ver el análisis acumulado.')
}

main()
