const { query } = require('../config/db')
const fs = require('fs')
const path = require('path')

// ── Bitrix: webhook por empresa (usa env si existe, si no las URLs por defecto) ──
const BITRIX_WEBHOOKS = {
  VELSA:   (process.env.BITRIX_VELSA_URL   || process.env.BITRIX_WEBHOOK || 'https://aclopecuador.bitrix24.es/rest/34852/9yzfguq80owrc8wv').replace(/\/$/, ''),
  NOVONET: (process.env.BITRIX_NOVONET_URL || 'https://novonet.bitrix24.es/rest/87387/vcca209sfcjflxp8').replace(/\/$/, ''),
}

// Llama a un método REST de Bitrix según la empresa del usuario
async function bitrixGet(empresa, method, params = {}) {
  const base = BITRIX_WEBHOOKS[(empresa || '').toUpperCase()]
  if (!base) throw new Error('Empresa sin webhook de Bitrix: ' + empresa)
  const qs = new URLSearchParams(params).toString()
  const url = `${base}/${method}.json?${qs}`
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    const json = await res.json()
    if (json.error) throw new Error(`Bitrix [${method}]: ${json.error_description || json.error}`)
    return json.result
  } finally { clearTimeout(t) }
}

// Normaliza teléfono de Bitrix al formato de WhatsApp (dígitos, Ecuador +593)
function normalizePhoneEC(raw) {
  let d = (raw || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('00')) d = d.slice(2)          // 00593... → 593...
  if (d.startsWith('0'))  d = '593' + d.slice(1)  // 09xxxxxxxx → 5939xxxxxxxx
  else if (!d.startsWith('593') && d.length <= 10) d = '593' + d  // 9xxxxxxxx → 593...
  return d
}

// Obtiene el teléfono a partir de un deal (negociación) de Bitrix
async function phoneFromDeal(empresa, dealId) {
  const deal = await bitrixGet(empresa, 'crm.deal.get', { ID: dealId })
  if (!deal || !deal.ID) throw new Error('Negociación no encontrada en Bitrix')

  let phoneRaw = null
  let contactName = deal.TITLE || null

  // 1) Contacto vinculado (caso estándar)
  if (deal.CONTACT_ID && deal.CONTACT_ID !== '0') {
    const contact = await bitrixGet(empresa, 'crm.contact.get', { ID: deal.CONTACT_ID })
    if (contact) {
      phoneRaw = contact.PHONE?.[0]?.VALUE || null
      const nm = [contact.NAME, contact.LAST_NAME].filter(Boolean).join(' ').trim()
      if (nm) contactName = nm
    }
  }
  // 2) Fallback: empresa vinculada
  if (!phoneRaw && deal.COMPANY_ID && deal.COMPANY_ID !== '0') {
    const company = await bitrixGet(empresa, 'crm.company.get', { ID: deal.COMPANY_ID })
    if (company) {
      phoneRaw = company.PHONE?.[0]?.VALUE || null
      if (company.TITLE) contactName = company.TITLE
    }
  }

  return {
    phone: normalizePhoneEC(phoneRaw),
    phoneRaw,
    contactName,
    dealTitle: deal.TITLE || null,
  }
}

// Traduce /wa-uploads/... a la ruta real en disco
function resolveMediaPath(mediaUrl) {
  if (mediaUrl.startsWith('/wa-uploads/')) {
    const dir = process.env.WA_UPLOADS_DIR || path.join(__dirname, '../../wa_uploads')
    return path.join(dir, mediaUrl.slice('/wa-uploads/'.length))
  }
  return mediaUrl
}

function guessMime(filename) {
  const ext = (path.extname(filename || '') || '').toLowerCase()
  const map = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
    '.webp': 'image/webp', '.pdf': 'application/pdf',
  }
  return map[ext] || 'application/octet-stream'
}

const isAdmin = (req) => (req.user?.perfil || '').toUpperCase() === 'ADMINISTRADOR'
const isSupervisor = (req) => (req.user?.perfil || '').toUpperCase() === 'SUPERVISOR'

// Condición SQL de visibilidad de conversaciones/líneas según el perfil.
//  - ADMINISTRADOR: ve todo (null → sin filtro)
//  - SUPERVISOR:    ve las líneas de asesores de SU empresa
//  - ASESOR/otros:  ve solo sus propias líneas (o huérfanas sin dueño)
// Requiere que la consulta tenga la tabla lines con alias `l`.
// Agrega los parámetros necesarios al array `params` (por referencia).
function visibilityCondition(req, params) {
  if (isAdmin(req)) return null
  if (isSupervisor(req)) {
    params.push((req.user.empresa || '').toUpperCase())
    return `l.created_by IN (SELECT id FROM usuarios WHERE UPPER(empresa) = $${params.length})`
  }
  params.push(req.user.id)
  return `(l.created_by = $${params.length} OR l.created_by IS NULL)`
}

// Verifica que la conversación exista y que el usuario pueda verla según su perfil.
async function findOwnedConversation(req, id) {
  const result = await query(
    `SELECT c.*, l.created_by AS line_created_by, u.empresa AS line_empresa
     FROM conversations c
     LEFT JOIN lines l ON c.line_id = l.id
     LEFT JOIN usuarios u ON l.created_by = u.id
     WHERE c.id=$1`,
    [id]
  )
  if (!result.rows.length) return null
  const conv = result.rows[0]
  if (isAdmin(req)) return conv
  if (isSupervisor(req)) {
    return (conv.line_empresa || '').toUpperCase() === (req.user.empresa || '').toUpperCase() ? conv : null
  }
  // Asesor: solo lo suyo (o líneas huérfanas)
  if (conv.line_created_by === req.user.id || conv.line_created_by === null) return conv
  return null
}

// ── LISTAR conversaciones (inbox) ────────────────────────────
async function getAll(req, res) {
  try {
    const { line_id, status, search, limit = 100 } = req.query
    const where = []
    const params = []

    if (line_id) { params.push(line_id); where.push(`c.line_id = $${params.length}`) }
    if (status)  { params.push(status);  where.push(`c.status = $${params.length}`) }
    if (search)  {
      params.push(`%${search}%`)
      where.push(`(c.wa_number ILIKE $${params.length} OR ct.name ILIKE $${params.length})`)
    }
    const vc = visibilityCondition(req, params)
    if (vc) where.push(vc)

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    params.push(parseInt(limit))

    const result = await query(`
      SELECT c.*,
             ct.name AS contact_name,
             ct.metadata AS contact_metadata,
             ct.is_blocked,
             l.name AS line_name,
             (SELECT content FROM messages m
              WHERE m.conversation_id = c.id ORDER BY timestamp DESC LIMIT 1) AS last_message,
             (SELECT direction FROM messages m
              WHERE m.conversation_id = c.id ORDER BY timestamp DESC LIMIT 1) AS last_direction
      FROM conversations c
      LEFT JOIN contacts ct ON c.contact_id = ct.id
      LEFT JOIN lines l ON c.line_id = l.id
      ${whereSql}
      ORDER BY c.last_msg_at DESC
      LIMIT $${params.length}
    `, params)

    res.json({ success: true, data: result.rows })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// ── Mensajes de una conversación ─────────────────────────────
async function getMessages(req, res) {
  try {
    const { id } = req.params
    const owned = await findOwnedConversation(req, id)
    if (!owned) return res.status(404).json({ success: false, error: 'Conversación no encontrada' })

    const result = await query(
      `SELECT id, direction, type, content, media_url, status, timestamp, node_type
       FROM messages WHERE conversation_id=$1 ORDER BY timestamp ASC LIMIT 500`,
      [id]
    )
    // Marcar como leídas
    await query('UPDATE conversations SET unread_count=0 WHERE id=$1', [id])
    res.json({ success: true, data: result.rows })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// ── Enviar mensaje manual desde el inbox ─────────────────────
async function sendMessage(req, res) {
  try {
    const { id } = req.params
    const { takeover, media_url, media_type, media_filename } = req.body
    const text = req.body.text || req.body.body   // acepta ambos nombres
    if (!text && !media_url) return res.status(400).json({ success: false, error: 'text o media_url requerido' })

    const owned = await findOwnedConversation(req, id)
    if (!owned) return res.status(404).json({ success: false, error: 'Conversación no encontrada' })

    const c = owned
    const bm = req.app.get('baileysManager')

    if (media_url) {
      // Enviar imagen/documento (subido antes con POST /api/wa/upload)
      let buffer
      if (/^https?:\/\//i.test(media_url)) {
        const resp = await fetch(media_url)
        if (!resp.ok) throw new Error(`No se pudo descargar el medio (HTTP ${resp.status})`)
        buffer = Buffer.from(await resp.arrayBuffer())
      } else {
        const filePath = resolveMediaPath(media_url)
        if (!fs.existsSync(filePath)) return res.status(400).json({ success: false, error: 'Archivo no existe' })
        buffer = fs.readFileSync(filePath)
      }
      await bm.sendMedia(c.line_id, c.wa_number, {
        type:     media_type || 'image',
        buffer,
        mimetype: guessMime(media_filename || media_url),
        filename: media_filename || path.basename(media_url),
        caption:  text || '',
        mediaUrl: media_url,
      })
    } else {
      await bm.sendText(c.line_id, c.wa_number, text)
    }

    // Si se pidió takeover, pausar bot por 24h
    if (takeover) {
      const reactivateAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      await query(
        `UPDATE contacts SET metadata = metadata || $1::jsonb
         WHERE wa_number=$2 AND line_id=$3`,
        [JSON.stringify({ human_agent: true, bot_reactivate_at: reactivateAt }), c.wa_number, c.line_id]
      )
      await query(`UPDATE conversations SET status='human_takeover' WHERE id=$1`, [id])
    }

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// ── RESPALDO: buscar por número O por nombre ──────────────────
// Acepta ?phone= (dígitos, busca en número guardado o número real) y/o
// ?name= (nombre del contacto). Devuelve número real y si es un LID.
async function backupSearch(req, res) {
  try {
    const q = (req.query.phone || req.query.q || '').trim()
    const nameQ = (req.query.name || '').trim()
    const digits = q.replace(/\D/g, '')

    const params = []
    const conds = []

    // Si el texto tiene dígitos → buscar por número guardado o número real (metadata)
    if (digits) {
      params.push(`%${digits}%`)
      conds.push(`(m.wa_number ILIKE $${params.length} OR ct.metadata->>'real_phone' ILIKE $${params.length})`)
    }
    // Búsqueda por nombre: usa ?name= o el mismo texto de ?phone si no era numérico
    const nameText = nameQ || (!digits && q ? q : '')
    if (nameText) {
      params.push(`%${nameText}%`)
      conds.push(`ct.name ILIKE $${params.length}`)
    }
    const vc = visibilityCondition(req, params)
    if (vc) conds.push(vc)

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''

    const result = await query(`
      SELECT m.wa_number,
             MAX(ct.name)                          AS contact_name,
             MAX(ct.metadata->>'real_phone')       AS real_phone,
             MAX(l.name)                           AS line_name,
             COUNT(*)::int                         AS total_mensajes,
             MIN(m.timestamp)                      AS primer_mensaje,
             MAX(m.timestamp)                      AS ultimo_mensaje
      FROM messages m
      LEFT JOIN lines l ON m.line_id = l.id
      LEFT JOIN contacts ct ON ct.wa_number = m.wa_number AND ct.line_id = m.line_id
      ${where}
      GROUP BY m.wa_number
      ORDER BY MAX(m.timestamp) DESC
      LIMIT 100
    `, params)

    // Marcar LID: número muy largo (>13 dígitos) sin real_phone
    const rows = result.rows.map(r => ({
      ...r,
      is_lid: (r.wa_number || '').length > 13 && !r.real_phone,
      display_number: r.real_phone || r.wa_number,
    }))
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// ── RESPALDO: toda la conversación de un número (continuidad completa) ──
async function backupByNumber(req, res) {
  try {
    const digits = (req.params.phone || '').replace(/\D/g, '')
    if (!digits) return res.status(400).json({ success: false, error: 'Número requerido' })

    const params = [digits]
    const vc = visibilityCondition(req, params)
    const ownerFilter = vc ? `AND ${vc}` : ''

    const info = await query(`
      SELECT m.wa_number,
             MAX(ct.name)                     AS contact_name,
             MAX(ct.metadata->>'real_phone')  AS real_phone,
             MAX(l.name)                      AS line_name,
             COUNT(*)::int                    AS total_mensajes
      FROM messages m
      LEFT JOIN lines l ON m.line_id = l.id
      LEFT JOIN contacts ct ON ct.wa_number = m.wa_number AND ct.line_id = m.line_id
      WHERE m.wa_number = $1 ${ownerFilter}
      GROUP BY m.wa_number
    `, params)

    if (!info.rows.length) return res.status(404).json({ success: false, error: 'Sin mensajes para ese número' })

    // TODOS los mensajes en orden cronológico → continuidad del chat
    const msgs = await query(`
      SELECT m.direction, m.type, m.content, m.media_url, m.status, m.timestamp,
             l.name AS line_name, m.campaign_id
      FROM messages m
      LEFT JOIN lines l ON m.line_id = l.id
      WHERE m.wa_number = $1 ${ownerFilter}
      ORDER BY m.timestamp ASC
    `, params)

    res.json({
      success: true,
      data: { ...info.rows[0], messages: msgs.rows },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// ── Iniciar conversación: por número directo O por ID Bitrix ────
// Body: { phone?, bitrix_id?, line_id? }
//  - Si viene phone → se usa directo. Si viene bitrix_id → se consulta en Bitrix.
//  - line_id opcional: admin/supervisor eligen la línea; el asesor usa la suya.
async function startFromBitrix(req, res) {
  try {
    const bitrixId = String(req.body.bitrix_id || '').trim()
    const phoneIn  = String(req.body.phone || '').trim()
    const lineIdIn = req.body.line_id || null
    if (!bitrixId && !phoneIn) {
      return res.status(400).json({ success: false, error: 'Debes indicar un número o un ID de negociación' })
    }

    const empresa = (req.user.empresa || '').toUpperCase()

    // 1) Determinar el número: directo o desde Bitrix
    let waNumber = ''
    let contactName = null
    if (phoneIn) {
      waNumber = normalizePhoneEC(phoneIn)
      if (!waNumber) return res.status(400).json({ success: false, error: 'Número de teléfono inválido' })
    } else {
      if (!BITRIX_WEBHOOKS[empresa]) {
        return res.status(400).json({ success: false, error: `Tu empresa (${empresa || '—'}) no tiene Bitrix configurado` })
      }
      let info
      try { info = await phoneFromDeal(empresa, bitrixId) }
      catch (e) { return res.status(502).json({ success: false, error: 'Bitrix: ' + e.message }) }
      if (!info.phone) return res.status(404).json({ success: false, error: 'La negociación no tiene un teléfono válido en Bitrix' })
      waNumber = info.phone
      contactName = info.contactName
    }

    // 2) Elegir línea de envío
    const bm = req.app.get('baileysManager')
    const canPickLine = isAdmin(req) || isSupervisor(req)   // asesor NO elige línea
    let candidates
    if (isAdmin(req)) {
      candidates = (await query(`SELECT id, name, bot_id FROM lines ORDER BY created_at ASC`)).rows
    } else if (isSupervisor(req)) {
      candidates = (await query(
        `SELECT id, name, bot_id FROM lines WHERE created_by IN (SELECT id FROM usuarios WHERE UPPER(empresa)=$1) ORDER BY created_at ASC`,
        [empresa]
      )).rows
    } else {
      candidates = (await query(
        `SELECT id, name, bot_id FROM lines WHERE created_by=$1 OR created_by IS NULL ORDER BY created_at ASC`,
        [req.user.id]
      )).rows
    }

    let chosen = null
    if (canPickLine && lineIdIn) {
      chosen = candidates.find(l => l.id === lineIdIn && bm && bm.getStatus(l.id) === 'connected') || null
      if (!chosen) return res.status(400).json({ success: false, error: 'La línea seleccionada no está conectada' })
    } else {
      chosen = candidates.find(l => bm && bm.getStatus(l.id) === 'connected') || null
    }
    if (!chosen) {
      return res.status(400).json({ success: false, error: 'No hay una línea de WhatsApp conectada. Ve a Líneas y conecta una.' })
    }

    const lineId = chosen.id

    // Registrar la identidad real del número en WhatsApp (maneja LID) para
    // que una respuesta temprana del cliente caiga en ESTA conversación.
    try { await bm.resolveWaJid(lineId, waNumber) } catch (e) {}

    // 3) Crear/abrir conversación (reusa si ya existe una abierta)
    const existing = await query(
      `SELECT * FROM conversations WHERE line_id=$1 AND wa_number=$2 AND status != 'closed' ORDER BY started_at DESC LIMIT 1`,
      [lineId, waNumber]
    )
    let conv
    if (existing.rows.length) {
      conv = existing.rows[0]
      if (bitrixId) await query(`UPDATE conversations SET bitrix_deal_id=$1 WHERE id=$2`, [bitrixId, conv.id])
    } else {
      const contactRes = await query(
        `INSERT INTO contacts (wa_number, line_id, name)
         VALUES ($1,$2,$3)
         ON CONFLICT (wa_number, line_id) DO UPDATE SET name=COALESCE(contacts.name, EXCLUDED.name), last_seen=NOW()
         RETURNING id`,
        [waNumber, lineId, contactName || null]
      )
      const ins = await query(
        `INSERT INTO conversations (line_id, contact_id, wa_number, bot_id, status, bitrix_deal_id)
         VALUES ($1,$2,$3,$4,'human_takeover',$5) RETURNING *`,
        [lineId, contactRes.rows[0].id, waNumber, chosen.bot_id || null, bitrixId || null]
      )
      conv = ins.rows[0]
    }

    const full = await query(`
      SELECT c.*, ct.name AS contact_name, l.name AS line_name
      FROM conversations c
      LEFT JOIN contacts ct ON c.contact_id = ct.id
      LEFT JOIN lines l ON c.line_id = l.id
      WHERE c.id = $1
    `, [conv.id])

    res.json({ success: true, data: { ...full.rows[0], phone: waNumber } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// ── BITRIX: asociar / cambiar el ID de negociación de una conversación ──
async function setBitrixId(req, res) {
  try {
    const { id } = req.params
    const bitrixId = String(req.body.bitrix_id || '').trim()
    const owned = await findOwnedConversation(req, id)
    if (!owned) return res.status(404).json({ success: false, error: 'Conversación no encontrada' })

    await query(`UPDATE conversations SET bitrix_deal_id=$1 WHERE id=$2`, [bitrixId || null, id])
    res.json({ success: true, data: { id, bitrix_deal_id: bitrixId || null } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// ── Tomar control (pausa el bot 24h, NO cierra la conversación) ──
async function takeover(req, res) {
  try {
    const { id } = req.params
    const owned = await findOwnedConversation(req, id)
    if (!owned) return res.status(404).json({ success: false, error: 'Conversación no encontrada' })

    const reactivateAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    await query(
      `UPDATE contacts SET metadata = metadata || $1::jsonb
       WHERE wa_number=$2 AND line_id=$3`,
      [JSON.stringify({ human_agent: true, bot_reactivate_at: reactivateAt }), owned.wa_number, owned.line_id]
    )
    await query(`UPDATE conversations SET status='human_takeover' WHERE id=$1`, [id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// ── Cerrar conversación ──────────────────────────────────────
async function close(req, res) {
  try {
    const owned = await findOwnedConversation(req, req.params.id)
    if (!owned) return res.status(404).json({ success: false, error: 'Conversación no encontrada' })

    await query(
      `UPDATE conversations SET status='closed', closed_at=NOW(), current_node_id=NULL WHERE id=$1`,
      [req.params.id]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// ── Devolver al bot (cancelar takeover) ──────────────────────
async function returnToBot(req, res) {
  try {
    const { id } = req.params
    const owned = await findOwnedConversation(req, id)
    if (!owned) return res.status(404).json({ success: false, error: 'No encontrada' })

    await query(
      `UPDATE contacts SET metadata = metadata - 'human_agent' - 'bot_reactivate_at'
       WHERE wa_number=$1 AND line_id=$2`,
      [owned.wa_number, owned.line_id]
    )
    await query(`UPDATE conversations SET status='active' WHERE id=$1`, [id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

module.exports = { getAll, getMessages, sendMessage, close, returnToBot, takeover, backupSearch, backupByNumber, startFromBitrix, setBitrixId }
