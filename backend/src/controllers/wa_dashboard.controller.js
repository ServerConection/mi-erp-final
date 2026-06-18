const { query } = require('../config/db')

const isAdmin = (req) => req.user?.perfil === 'ADMINISTRADOR'

// ── KPIs para dashboard principal ────────────────────────────
async function getOverview(req, res) {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const admin = isAdmin(req)
    const uid = req.user.id

    // Filtros de propiedad: si no es admin, todo se restringe a lo creado por el usuario
    // (las líneas propias filtran también conversaciones y mensajes, que no tienen
    // su propia columna created_by pero sí line_id).
    const linesFilter   = admin ? '' : 'WHERE created_by = $1'
    const botsFilter    = admin ? '' : 'WHERE created_by = $1'
    const contactsFilter = admin ? '' : 'WHERE created_by = $1'
    const campFilter    = admin ? '' : 'WHERE created_by = $1'
    const listsFilter   = admin ? '' : 'WHERE created_by = $1'
    const convFilter    = admin ? '' : 'WHERE line_id IN (SELECT id FROM lines WHERE created_by = $1)'
    const msgTodayFilter = admin
      ? 'WHERE timestamp >= $1'
      : 'WHERE timestamp >= $1 AND line_id IN (SELECT id FROM lines WHERE created_by = $2)'
    const msgWeekFilter = admin
      ? 'WHERE timestamp >= $1'
      : 'WHERE timestamp >= $1 AND line_id IN (SELECT id FROM lines WHERE created_by = $2)'

    const linesParams    = admin ? [] : [uid]
    const botsParams     = admin ? [] : [uid]
    const contactsParams = admin ? [] : [uid]
    const campParams     = admin ? [] : [uid]
    const listsParams    = admin ? [] : [uid]
    const convParams     = admin ? [] : [uid]
    const msgTodayParams = admin ? [today] : [today, uid]
    const msgWeekParams  = admin ? [weekAgo] : [weekAgo, uid]

    const [
      linesRes, botsRes, contactsRes, convRes,
      msgTodayRes, msgWeekRes, campRes, listsRes,
    ] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total,
                    COUNT(CASE WHEN status='connected' THEN 1 END)::int AS connected
             FROM lines ${linesFilter}`, linesParams),
      query(`SELECT COUNT(*)::int AS total,
                    COUNT(CASE WHEN is_active THEN 1 END)::int AS active FROM bots ${botsFilter}`, botsParams),
      query(`SELECT COUNT(*)::int AS total FROM contacts ${contactsFilter}`, contactsParams),
      query(`SELECT COUNT(*)::int AS total,
                    COUNT(CASE WHEN status='active' THEN 1 END)::int AS active
             FROM conversations ${convFilter}`, convParams),
      query(`SELECT COUNT(*)::int AS total,
                    COUNT(CASE WHEN direction='in' THEN 1 END)::int AS received,
                    COUNT(CASE WHEN direction='out' THEN 1 END)::int AS sent
             FROM messages ${msgTodayFilter}`, msgTodayParams),
      query(`SELECT DATE(timestamp) AS date,
                    COUNT(CASE WHEN direction='in' THEN 1 END)::int AS received,
                    COUNT(CASE WHEN direction='out' THEN 1 END)::int AS sent
             FROM messages ${msgWeekFilter}
             GROUP BY DATE(timestamp) ORDER BY date ASC`, msgWeekParams),
      query(`SELECT COUNT(*)::int AS total,
                    COUNT(CASE WHEN status='running' THEN 1 END)::int AS running,
                    COUNT(CASE WHEN status='completed' THEN 1 END)::int AS completed,
                    COALESCE(SUM(sent_count),0)::int AS total_sent
             FROM campaigns ${campFilter}`, campParams),
      query(`SELECT COUNT(*)::int AS total FROM contact_lists ${listsFilter}`, listsParams),
    ])

    res.json({
      success: true,
      data: {
        lines: linesRes.rows[0],
        bots: botsRes.rows[0],
        contacts: contactsRes.rows[0],
        conversations: convRes.rows[0],
        messages_today: msgTodayRes.rows[0],
        messages_week: msgWeekRes.rows,
        campaigns: campRes.rows[0],
        lists: listsRes.rows[0],
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

module.exports = { getOverview }
