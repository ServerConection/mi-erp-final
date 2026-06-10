const { query } = require('../config/db')

async function getByLine(req, res) {
  try {
    const { lineId } = req.params
    const { from, to } = req.query
    const dateFrom = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const dateTo = to || new Date().toISOString()

    const convByDay = await query(`
      SELECT DATE(started_at) AS date,
             COUNT(*) AS total,
             COUNT(CASE WHEN status='closed' THEN 1 END) AS closed
      FROM conversations
      WHERE line_id=$1 AND started_at BETWEEN $2 AND $3
      GROUP BY DATE(started_at) ORDER BY date ASC
    `, [lineId, dateFrom, dateTo])

    const msgTotals = await query(`
      SELECT COUNT(*) AS total,
             COUNT(CASE WHEN direction='in' THEN 1 END) AS received,
             COUNT(CASE WHEN direction='out' THEN 1 END) AS sent
      FROM messages
      WHERE line_id=$1 AND timestamp BETWEEN $2 AND $3
    `, [lineId, dateFrom, dateTo])

    const totals = await query(`
      SELECT COUNT(DISTINCT wa_number) AS unique_contacts,
             COUNT(*) AS total_conversations,
             COUNT(CASE WHEN status='active' THEN 1 END) AS active_conversations
      FROM conversations WHERE line_id=$1
    `, [lineId])

    const topNodes = await query(`
      SELECT node_type, COUNT(*) AS executions
      FROM messages
      WHERE line_id=$1 AND node_type IS NOT NULL AND timestamp BETWEEN $2 AND $3
      GROUP BY node_type ORDER BY executions DESC LIMIT 5
    `, [lineId, dateFrom, dateTo])

    res.json({
      convByDay: convByDay.rows,
      messages: msgTotals.rows[0],
      totals: totals.rows[0],
      topNodes: topNodes.rows,
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function getAllLines(req, res) {
  try {
    const result = await query(`
      SELECT l.id, l.name, l.phone_number, l.status,
             COUNT(DISTINCT c.id) AS total_conversations,
             COUNT(DISTINCT c.wa_number) AS unique_contacts,
             COUNT(m.id) AS total_messages,
             MAX(m.timestamp) AS last_activity
      FROM lines l
      LEFT JOIN conversations c ON c.line_id = l.id
      LEFT JOIN messages m ON m.line_id = l.id
      GROUP BY l.id ORDER BY l.created_at ASC
    `)
    res.json({ success: true, data: result.rows })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// ── Helper: resolver número real desde wa_number (puede ser @lid) ─────────
function resolvePhoneNumber(waNumber, metadata) {
  if (!waNumber) return ''
  // Prioridad 1: número real guardado en metadata
  if (metadata?.real_phone) return `+${metadata.real_phone}`
  const clean = waNumber.replace(/\D/g, '')
  // Prioridad 2: si tiene 7-15 dígitos es un número real
  if (clean.length >= 7 && clean.length <= 15) return `+${clean}`
  // Prioridad 3: es un LID de Meta — no tenemos el número real
  return `LID:${clean.slice(-8)}`
}

// ── Exportar CSV — una fila por conversación ──────────────────────────────
async function exportCSV(req, res) {
  try {
    const { lineId } = req.params
    const { from, to } = req.query
    const { Parser } = require('json2csv')

    // Obtener conversaciones con sus mensajes agrupados
    const convs = await query(`
      SELECT
        c.id AS conversation_id,
        c.wa_number,
        ct.name AS contact_name,
        ct.metadata AS contact_metadata,
        c.started_at,
        c.closed_at,
        c.status,
        EXTRACT(EPOCH FROM (COALESCE(c.closed_at, NOW()) - c.started_at))/60 AS duration_minutes,
        COUNT(m.id) FILTER (WHERE m.direction='in') AS messages_received,
        COUNT(m.id) FILTER (WHERE m.direction='out' AND m.type != 'system') AS messages_sent,
        STRING_AGG(
          CASE WHEN m.direction='in' AND m.content IS NOT NULL AND m.content != ''
          THEN m.content END,
          ' | '
          ORDER BY m.timestamp
        ) AS client_messages,
        l.name AS line_name,
        l.phone_number AS line_number
      FROM conversations c
      LEFT JOIN contacts ct ON ct.wa_number = c.wa_number AND ct.line_id = c.line_id
      LEFT JOIN messages m ON m.conversation_id = c.id
      LEFT JOIN lines l ON l.id = c.line_id
      WHERE c.line_id = $1
        AND ($2::timestamptz IS NULL OR c.started_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR c.started_at <= $3::timestamptz)
      GROUP BY c.id, ct.name, ct.metadata, l.name, l.phone_number
      ORDER BY c.started_at DESC
    `, [lineId, from || null, to || null])

    // Formatear filas
    const rows = convs.rows.map(c => {
      // Extraer variables guardadas del metadata del contacto
      const metadata = c.contact_metadata || {}

      return {
        'ID Conversación': c.conversation_id,
        'Número WA': resolvePhoneNumber(c.wa_number, c.contact_metadata || {}),
        'ID Raw': c.wa_number,
        'Nombre contacto': c.contact_name || metadata.nombre || '',
        'Email': metadata.email || '',
        'Datos capturados': Object.entries(metadata)
          .filter(([k]) => !['nombre','email'].includes(k))
          .map(([k,v]) => `${k}:${v}`)
          .join(' | '),
        'Línea': c.line_name || '',
        'Número línea': c.line_number ? `+${c.line_number}` : '',
        'Estado': c.status === 'closed' ? 'Cerrada' : c.status === 'active' ? 'Activa' : c.status,
        'Inicio': c.started_at ? new Date(c.started_at).toLocaleString('es') : '',
        'Fin': c.closed_at ? new Date(c.closed_at).toLocaleString('es') : '',
        'Duración (min)': c.duration_minutes ? Math.round(c.duration_minutes) : '',
        'Mensajes recibidos': c.messages_received || 0,
        'Mensajes enviados': c.messages_sent || 0,
        'Mensajes del cliente': c.client_messages || '',
      }
    })

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Sin datos para exportar' })
    }

    const fields = Object.keys(rows[0])
    const parser = new Parser({ fields })
    const csv = parser.parse(rows)

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="conversaciones_${lineId}_${new Date().toISOString().slice(0,10)}.csv"`)
    res.send('\uFEFF' + csv) // BOM para que Excel lo abra correctamente
  } catch (err) {
    console.error('Error exportCSV:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

// ── Exportar Excel — una fila por conversación ────────────────────────────
async function exportExcel(req, res) {
  try {
    const { lineId } = req.params
    const { from, to } = req.query
    const XLSX = require('xlsx')

    const convs = await query(`
      SELECT
        c.id AS conversation_id,
        c.wa_number,
        ct.name AS contact_name,
        ct.metadata AS contact_metadata,
        ct.tags,
        c.started_at,
        c.closed_at,
        c.status,
        EXTRACT(EPOCH FROM (COALESCE(c.closed_at, NOW()) - c.started_at))/60 AS duration_minutes,
        COUNT(m.id) FILTER (WHERE m.direction='in') AS messages_received,
        COUNT(m.id) FILTER (WHERE m.direction='out' AND m.type != 'system') AS messages_sent,
        STRING_AGG(
          CASE WHEN m.direction='in' AND m.content IS NOT NULL AND m.content != ''
          THEN m.content END,
          ' | '
          ORDER BY m.timestamp
        ) AS client_messages,
        l.name AS line_name,
        l.phone_number AS line_number
      FROM conversations c
      LEFT JOIN contacts ct ON ct.wa_number = c.wa_number AND ct.line_id = c.line_id
      LEFT JOIN messages m ON m.conversation_id = c.id
      LEFT JOIN lines l ON l.id = c.line_id
      WHERE c.line_id = $1
        AND ($2::timestamptz IS NULL OR c.started_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR c.started_at <= $3::timestamptz)
      GROUP BY c.id, ct.name, ct.metadata, ct.tags, l.name, l.phone_number
      ORDER BY c.started_at DESC
    `, [lineId, from || null, to || null])

    const rows = convs.rows.map(c => {
      const metadata = c.contact_metadata || {}
      return {
        'ID Conversación': c.conversation_id,
        'Número WA': resolvePhoneNumber(c.wa_number, c.contact_metadata || {}),
        'ID Raw': c.wa_number,
        'Nombre': c.contact_name || metadata.nombre || '',
        'Email': metadata.email || '',
        'Etiquetas': (c.tags || []).join(', '),
        'Datos capturados': Object.entries(metadata)
          .filter(([k]) => !['nombre','email'].includes(k))
          .map(([k,v]) => `${k}: ${v}`)
          .join(' | '),
        'Línea': c.line_name || '',
        'Número línea': c.line_number ? `+${c.line_number}` : '',
        'Estado': c.status === 'closed' ? 'Cerrada' : c.status === 'active' ? 'Activa' : c.status,
        'Fecha inicio': c.started_at ? new Date(c.started_at).toLocaleString('es') : '',
        'Fecha fin': c.closed_at ? new Date(c.closed_at).toLocaleString('es') : '',
        'Duración (min)': c.duration_minutes ? Math.round(c.duration_minutes) : '',
        'Mensajes cliente': c.messages_received || 0,
        'Mensajes bot': c.messages_sent || 0,
        'Historial mensajes': c.client_messages || '',
      }
    })

    const ws = XLSX.utils.json_to_sheet(rows)

    // Ajustar ancho de columnas automáticamente
    const colWidths = Object.keys(rows[0] || {}).map(key => ({
      wch: Math.min(50, Math.max(15, key.length + 5))
    }))
    ws['!cols'] = colWidths

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Conversaciones')

    // Hoja resumen
    const summary = await query(`
      SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN status='closed' THEN 1 END) AS cerradas,
        COUNT(CASE WHEN status='active' THEN 1 END) AS activas,
        COUNT(DISTINCT wa_number) AS contactos_unicos
      FROM conversations WHERE line_id=$1
    `, [lineId])

    const summaryData = [{
      'Total conversaciones': summary.rows[0].total,
      'Cerradas': summary.rows[0].cerradas,
      'Activas': summary.rows[0].activas,
      'Contactos únicos': summary.rows[0].contactos_unicos,
      'Exportado el': new Date().toLocaleString('es'),
    }]
    const wsSummary = XLSX.utils.json_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="conversaciones_${lineId}_${new Date().toISOString().slice(0,10)}.xlsx"`)
    res.send(buf)
  } catch (err) {
    console.error('Error exportExcel:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

module.exports = { getByLine, getAllLines, exportCSV, exportExcel }