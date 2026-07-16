const { query } = require('../config/db')
const fs = require('fs')
const path = require('path')

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

const isAdmin = (req) => req.user?.perfil === 'ADMINISTRADOR'

// Verifica que la conversación exista y que su línea pertenezca al usuario (o que sea admin).
async function findOwnedConversation(req, id) {
  const result = await query(
    `SELECT c.*, l.created_by AS line_created_by
     FROM conversations c
     LEFT JOIN lines l ON c.line_id = l.id
     WHERE c.id=$1`,
    [id]
  )
  if (!result.rows.length) return null
  const conv = result.rows[0]
  if (!isAdmin(req) && conv.line_created_by !== req.user.id) return null
  return conv
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
    if (!isAdmin(req)) { params.push(req.user.id); where.push(`l.created_by = $${params.length}`) }

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

module.exports = { getAll, getMessages, sendMessage, close, returnToBot, takeover }
