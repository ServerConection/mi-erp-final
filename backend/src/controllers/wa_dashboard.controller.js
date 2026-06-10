const { query } = require('../config/db')

// ── KPIs para dashboard principal ────────────────────────────
async function getOverview(req, res) {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const [
      linesRes, botsRes, contactsRes, convRes,
      msgTodayRes, msgWeekRes, campRes, listsRes,
    ] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total,
                    COUNT(CASE WHEN status='connected' THEN 1 END)::int AS connected
             FROM lines`),
      query(`SELECT COUNT(*)::int AS total,
                    COUNT(CASE WHEN is_active THEN 1 END)::int AS active FROM bots`),
      query(`SELECT COUNT(*)::int AS total FROM contacts`),
      query(`SELECT COUNT(*)::int AS total,
                    COUNT(CASE WHEN status='active' THEN 1 END)::int AS active
             FROM conversations`),
      query(`SELECT COUNT(*)::int AS total,
                    COUNT(CASE WHEN direction='in' THEN 1 END)::int AS received,
                    COUNT(CASE WHEN direction='out' THEN 1 END)::int AS sent
             FROM messages WHERE timestamp >= $1`, [today]),
      query(`SELECT DATE(timestamp) AS date,
                    COUNT(CASE WHEN direction='in' THEN 1 END)::int AS received,
                    COUNT(CASE WHEN direction='out' THEN 1 END)::int AS sent
             FROM messages WHERE timestamp >= $1
             GROUP BY DATE(timestamp) ORDER BY date ASC`, [weekAgo]),
      query(`SELECT COUNT(*)::int AS total,
                    COUNT(CASE WHEN status='running' THEN 1 END)::int AS running,
                    COUNT(CASE WHEN status='completed' THEN 1 END)::int AS completed,
                    COALESCE(SUM(sent_count),0)::int AS total_sent
             FROM campaigns`),
      query(`SELECT COUNT(*)::int AS total FROM contact_lists`),
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
