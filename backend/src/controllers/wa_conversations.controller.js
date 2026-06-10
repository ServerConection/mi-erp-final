const { query } = require('../config/db')

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
    const { text, takeover } = req.body
    if (!text) return res.status(400).json({ success: false, error: 'text requerido' })

    const conv = await query('SELECT * FROM conversations WHERE id=$1', [id])
    if (!conv.rows.length) return res.status(404).json({ success: false, error: 'Conversación no encontrada' })

    const c = conv.rows[0]
    const bm = req.app.get('baileysManager')
    await bm.sendText(c.line_id, c.wa_number, text)

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

// ── Cerrar conversación ──────────────────────────────────────
async function close(req, res) {
  try {
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
    const c = await query('SELECT line_id, wa_number FROM conversations WHERE id=$1', [id])
    if (!c.rows.length) return res.status(404).json({ success: false, error: 'No encontrada' })
    await query(
      `UPDATE contacts SET metadata = metadata - 'human_agent' - 'bot_reactivate_at'
       WHERE wa_number=$1 AND line_id=$2`,
      [c.rows[0].wa_number, c.rows[0].line_id]
    )
    await query(`UPDATE conversations SET status='active' WHERE id=$1`, [id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

module.exports = { getAll, getMessages, sendMessage, close, returnToBot }
