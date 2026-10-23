/**
 * LLAMADAS BITRIX — "Cargar base" del Automarcador igual que en WABOT.
 *
 * Reutiliza el mismo servicio de WABOT (waBitrixContactLists.service) que lee
 * bitrix_webhook_leads en la BD de Render: etapa + responsable + fecha de
 * creación, con teléfono incluido. Así el supervisor arma la base sin
 * descargar nada de Bitrix y sin depender de la Postgres local.
 *
 * El envío al Automarcador se hace DESDE EL BACKEND (no desde el navegador)
 * porque /api/campaigns/from-erp del Automarcador exige la llave admin, que
 * no debe vivir en el frontend.
 *
 * Variables de entorno (Render, grupo erp-shared):
 *   AUTOMARCADOR_URL        -> URL pública del Automarcador (ngrok)
 *   AUTOMARCADOR_ADMIN_KEY  -> la misma AUTOMARCADOR_ADMIN_KEY del .env del Automarcador
 */
const bitrixLists = require('../services/waBitrixContactLists.service')

const PREVIEW_MAX = 200
const TIMEOUT_MS = 60000

function urlAutomarcador() {
  return String(process.env.AUTOMARCADOR_URL || '').trim().replace(/\/+$/, '')
}

// GET /api/llamadas/bitrix/opciones
async function opciones(req, res) {
  try {
    res.json({ success: true, data: await bitrixLists.obtenerOpciones(req.user) })
  } catch (err) {
    console.error('[llamadasBitrix.opciones]', err)
    res.status(err.status || 502).json({ success: false, error: err.message || 'No se pudieron cargar los filtros' })
  }
}

// POST /api/llamadas/bitrix/consultar  { stage_id, responsible_id, date_from, date_to }
async function consultar(req, res) {
  try {
    const data = await bitrixLists.consultar(req.user, req.body)
    // La vista previa no expone teléfonos: solo el ID de Bitrix y el nombre.
    const items = data.items.slice(0, PREVIEW_MAX).map(it => ({ bitrix_id: it.variables?.bitrix_id || '', name: it.name || null }))
    res.json({ success: true, data: { ...data, items } })
  } catch (err) {
    console.error('[llamadasBitrix.consultar]', err)
    res.status(err.status || 502).json({ success: false, error: err.message || 'No se pudo consultar la base' })
  }
}

// POST /api/llamadas/bitrix/enviar  { stage_id, responsible_id, date_from, date_to, name }
async function enviar(req, res) {
  const base = urlAutomarcador()
  const key = String(process.env.AUTOMARCADOR_ADMIN_KEY || '')
  if (!base || !key) {
    return res.status(503).json({ success: false, error: 'Falta configurar AUTOMARCADOR_URL y AUTOMARCADOR_ADMIN_KEY en el servidor' })
  }
  try {
    const data = await bitrixLists.consultar(req.user, req.body)
    if (!data.items.length) {
      return res.status(400).json({ success: false, error: 'La consulta no tiene teléfonos válidos' })
    }
    const name = String(req.body?.name || '').trim().slice(0, 160)
      || `Bitrix ${new Date().toLocaleDateString('es-EC')}`
    const items = data.items.map(it => ({
      telefono: it.wa_number,
      nombre_cliente: it.name || '',
      deal_id: it.variables?.bitrix_id || '',
    }))

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let r, j
    try {
      r = await fetch(`${base}/api/campaigns/from-erp`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ name, items }),
      })
      j = await r.json().catch(() => ({}))
    } finally {
      clearTimeout(timer)
    }
    if (!r.ok || !j.success) {
      return res.status(502).json({ success: false, error: j.error || `El Automarcador respondió ${r.status}` })
    }
    res.json({
      success: true,
      data: {
        campania_id: j.id,
        total: j.total,
        duplicados: j.duplicatesRemoved || 0,
        negocios: data.total_deals,
        sin_telefono: data.deals_without_phone,
        panel_url: `${base}/admin`,
      },
    })
  } catch (err) {
    console.error('[llamadasBitrix.enviar]', err)
    const msg = err.name === 'AbortError' ? 'El Automarcador no respondió (¿está encendido el túnel ngrok?)' : err.message
    res.status(err.status || 502).json({ success: false, error: msg || 'No se pudo enviar al Automarcador' })
  }
}

module.exports = { opciones, consultar, enviar }
