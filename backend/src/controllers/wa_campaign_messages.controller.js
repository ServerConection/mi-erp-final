/**
 * campaign_messages.controller.js
 * CRUD de variantes de mensaje para una campaña.
 *
 * Una campaña puede tener N variantes; el CampaignEngine
 * elige una al azar por cada destinatario.
 * Todas las variantes soportan {{variables}} igual que la campaña principal.
 */

const { query } = require('../config/db')
const path = require('path')
const fs   = require('fs')

// ── Listar variantes de una campaña ──────────────────────────
async function getAll(req, res) {
  try {
    const { campaignId } = req.params
    const { rows } = await query(
      `SELECT * FROM campaign_messages
       WHERE campaign_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [campaignId]
    )
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// ── Crear variante ────────────────────────────────────────────
async function create(req, res) {
  try {
    const { campaignId } = req.params
    const { label, message_text, media_url, media_type, media_caption, sort_order } = req.body

    if (!message_text && !media_url) {
      return res.status(400).json({ success: false, error: 'Se requiere al menos texto o archivo adjunto' })
    }

    const { rows } = await query(
      `INSERT INTO campaign_messages
         (campaign_id, label, message_text, media_url, media_type, media_caption, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        campaignId,
        label        || null,
        message_text || null,
        media_url    || null,
        media_type   || null,
        media_caption|| null,
        sort_order   || 0,
      ]
    )
    res.status(201).json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('[CampaignMessages] create:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}

// ── Actualizar variante ───────────────────────────────────────
async function update(req, res) {
  try {
    const { campaignId, messageId } = req.params
    const { label, message_text, media_url, media_type, media_caption, sort_order } = req.body

    const { rows } = await query(
      `UPDATE campaign_messages SET
         label         = $1,
         message_text  = $2,
         media_url     = $3,
         media_type    = $4,
         media_caption = $5,
         sort_order    = COALESCE($6, sort_order),
         updated_at    = NOW()
       WHERE id = $7 AND campaign_id = $8
       RETURNING *`,
      [
        label        || null,
        message_text || null,
        media_url    || null,
        media_type   || null,
        media_caption|| null,
        sort_order,
        messageId,
        campaignId,
      ]
    )
    if (!rows.length) return res.status(404).json({ success: false, error: 'Variante no encontrada' })
    res.json({ success: true, data: rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// ── Eliminar variante ─────────────────────────────────────────
async function remove(req, res) {
  try {
    const { campaignId, messageId } = req.params

    const existing = await query(
      `SELECT media_url FROM campaign_messages WHERE id=$1 AND campaign_id=$2`,
      [messageId, campaignId]
    )
    if (!existing.rows.length) return res.status(404).json({ success: false, error: 'Variante no encontrada' })

    // Borrar archivo de media si existe en disco
    const mediaUrl = existing.rows[0].media_url
    if (mediaUrl) {
      const filePath = path.isAbsolute(mediaUrl)
        ? mediaUrl
        : path.join(__dirname, '../../', mediaUrl)
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath) } catch (e) { /* ignorar */ }
      }
    }

    await query(`DELETE FROM campaign_messages WHERE id=$1 AND campaign_id=$2`, [messageId, campaignId])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// ── Reordenar variantes ───────────────────────────────────────
async function reorder(req, res) {
  try {
    const { campaignId } = req.params
    const { order } = req.body  // [{ id, sort_order }]
    if (!Array.isArray(order)) return res.status(400).json({ success: false, error: 'order debe ser un array' })

    for (const item of order) {
      await query(
        `UPDATE campaign_messages SET sort_order=$1 WHERE id=$2 AND campaign_id=$3`,
        [item.sort_order, item.id, campaignId]
      )
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

module.exports = { getAll, create, update, remove, reorder }
