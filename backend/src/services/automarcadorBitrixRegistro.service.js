/**
 * AUTOMARCADOR BITRIX — registro de llamadas compartido.
 *
 * Antes cada asesor consultaba voximplant.statistic.get cada 4 s desde su
 * navegador (15 peticiones/min por asesor). Ahora el backend hace UNA sola
 * consulta cada `intervaloMs` para todos los asesores y la guarda en memoria;
 * las páginas de los asesores preguntan al ERP, que no toca Bitrix.
 *
 * Usa un webhook entrante con permiso telephony (AUTOMARCADOR_BITRIX_WEBHOOK).
 */
const MAX_PAGINAS = 4 // 200 llamadas en la ventana: de sobra para el equipo

const ultimos9 = (v) => String(v || '').replace(/\D/g, '').slice(-9)
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, '+00:00')

function crearRegistroLlamadas({
  webhook = process.env.AUTOMARCADOR_BITRIX_WEBHOOK,
  fetchImpl = fetch,
  now = () => Date.now(),
  intervaloMs = 15000,
  ventanaMin = 30,
  logger = console,
} = {}) {
  const base = String(webhook || '').trim().replace(/\/+$/, '').replace(/\/[a-z0-9_.]+\.json$/i, '')
  let filas = []
  let ultimaLectura = 0
  let enCurso = null
  let pausaHasta = 0

  async function leer() {
    const nuevas = []
    for (let pagina = 0, start = 0; pagina < MAX_PAGINAS; pagina++) {
      const r = await fetchImpl(`${base}/voximplant.statistic.get.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          FILTER: { '>=CALL_START_DATE': iso(now() - ventanaMin * 60000) },
          SORT: 'CALL_START_DATE', ORDER: 'DESC', start,
        }),
      })
      const j = await r.json()
      if (j.error) throw new Error(j.error_description || j.error)
      nuevas.push(...(j.result || []))
      if (j.next === undefined || !(j.result || []).length) break
      start = j.next
    }
    filas = nuevas
    ultimaLectura = now()
  }

  // Refresca como máximo una vez por intervalo, sin lecturas en paralelo.
  async function refrescar() {
    if (!base) return
    if (now() - ultimaLectura < intervaloMs || now() < pausaHasta) return
    if (!enCurso) {
      enCurso = leer()
        .catch((err) => {
          logger.error('[AUTOMARCADOR-BX] registro:', err.message)
          pausaHasta = now() + intervaloMs * 2 // Bitrix ocupado: esperar más
        })
        .finally(() => { enCurso = null })
    }
    await enCurso
  }

  /** Busca la llamada del asesor a ese número iniciada después de `desde`. */
  async function buscar({ bitrixUserId, telefono, desde }) {
    if (!base) return null
    await refrescar()
    const tel = ultimos9(telefono)
    const limite = new Date(desde).getTime() - 15000
    return filas.find((f) =>
      String(f.PORTAL_USER_ID) === String(bitrixUserId) &&
      ultimos9(f.PHONE_NUMBER) === tel &&
      new Date(f.CALL_START_DATE).getTime() >= limite) || null
  }

  return { buscar, configurado: () => !!base }
}

/** Traduce una fila del registro de Bitrix al resultado del Automarcador. */
function resultadoDeFila(fila) {
  const duracion = parseInt(fila.CALL_DURATION, 10) || 0
  return { estado: String(fila.CALL_FAILED_CODE) === '200' && duracion > 0 ? 'contestada' : 'no_contesta', duracion }
}

module.exports = { crearRegistroLlamadas, resultadoDeFila, ultimos9 }
