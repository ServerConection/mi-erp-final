const { query, transaction } = require('../config/db')
const { normalizeNumber } = require('./wa_contacts.controller')
const campaignsReport = require('../services/waCampaignsReport.service')
const { esMandoWabot, empresasVisiblesWabot } = require('../shared/waAccesoEmpresa')
const { normalizarModo } = require('../services/campaignLineas')

// Líneas de envío de una campaña. Acepta line_ids (varias) o line_id (una).
// Permisos: ADMINISTRADOR cualquiera; supervisores/gerencia solo líneas de su
// empresa; asesores solo SU línea. Devuelve { ids } o { error }.
async function validarLineasCampania(req, body) {
  const crudas = Array.isArray(body.line_ids) && body.line_ids.length ? body.line_ids : (body.line_id ? [body.line_id] : [])
  const ids = [...new Set(crudas.map(v => String(v || '').trim()).filter(Boolean))].slice(0, 50)
  if (!ids.length) return { error: 'Selecciona al menos una línea de envío' }
  const r = await query(
    `SELECT l.id, l.created_by, UPPER(TRIM(COALESCE(u.empresa, ''))) AS empresa
       FROM lines l LEFT JOIN usuarios u ON u.id = l.created_by
      WHERE l.id::text = ANY($1::text[]) AND l.deleted_at IS NULL`,
    [ids]
  )
  if (r.rows.length !== ids.length) return { error: 'Alguna línea seleccionada no existe' }
  if (!isAdmin(req)) {
    if (esMandoWabot(req.user)) {
      const empresas = empresasVisiblesWabot(req.user)
      if (r.rows.some(l => !empresas.includes(l.empresa))) return { error: 'Solo puedes usar líneas de tu empresa' }
    } else {
      if (ids.length > 1 || r.rows.some(l => l.created_by !== req.user.id)) {
        return { error: 'Solo puedes enviar desde tu propia línea' }
      }
    }
  }
  return { ids }
}

const isAdmin = (req) => req.user?.perfil === 'ADMINISTRADOR'

// Valida/normaliza el horario de envío (días 0-6 = domingo..sábado, horas
// 0-23). Lanza un Error con mensaje amigable si algo no calza; devuelve
// null en cada campo si no vino nada (= sin restricción).
function parseHorarioEnvio(body) {
  let { send_days, send_hour_from, send_hour_to } = body

  let dias = null
  if (Array.isArray(send_days) && send_days.length) {
    dias = [...new Set(send_days.map(d => parseInt(d, 10)))]
    if (dias.some(d => Number.isNaN(d) || d < 0 || d > 6)) {
      throw new Error('send_days debe ser un arreglo de números 0-6 (0=domingo ... 6=sábado)')
    }
  }

  const desde = send_hour_from === '' || send_hour_from === undefined ? null : send_hour_from
  const hasta = send_hour_to   === '' || send_hour_to   === undefined ? null : send_hour_to
  if ((desde === null) !== (hasta === null)) {
    throw new Error('send_hour_from y send_hour_to deben venir juntos (o ninguno de los dos)')
  }
  let horaDesde = null, horaHasta = null
  if (desde !== null) {
    horaDesde = parseInt(desde, 10)
    horaHasta = parseInt(hasta, 10)
    if ([horaDesde, horaHasta].some(h => Number.isNaN(h) || h < 0 || h > 23)) {
      throw new Error('send_hour_from y send_hour_to deben ser horas 0-23')
    }
  }

  return { send_days: dias, send_hour_from: horaDesde, send_hour_to: horaHasta }
}

// Verifica que la campaña exista y pertenezca al usuario (o que sea admin).
async function findOwnedCampaign(req, id) {
  const result = await query('SELECT * FROM campaigns WHERE id=$1', [id])
  if (!result.rows.length) return null
  const camp = result.rows[0]
  if (!isAdmin(req) && camp.created_by !== null && camp.created_by !== req.user.id) return null
  return camp
}

// ── LISTAR todas las campañas con stats ──────────────────────
async function getAll(req, res) {
  try {
    const { status } = req.query
    const conditions = []
    const params = []
    if (status) { params.push(status); conditions.push(`c.status = $${params.length}`) }
    if (!isAdmin(req)) { params.push(req.user.id); conditions.push(`(c.created_by = $${params.length} OR c.created_by IS NULL)`) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const result = await query(`
      SELECT c.*,
             l.name AS line_name,
             l.phone_number AS line_phone,
             t.name AS template_name,
             cl.name AS list_name,
             u.usuario AS owner_username,
             (SELECT array_agg(x.name ORDER BY x.name) FROM lines x WHERE x.id = ANY(c.line_ids)) AS line_names,
             (SELECT COUNT(*)::int FROM campaign_recipients r WHERE r.campaign_id = c.id AND r.status = 'skipped') AS skipped_count
      FROM campaigns c
      LEFT JOIN lines l ON c.line_id = l.id
      LEFT JOIN templates t ON c.template_id = t.id
      LEFT JOIN contact_lists cl ON c.list_id = cl.id
      LEFT JOIN usuarios u ON c.created_by = u.id
      ${where}
      ORDER BY c.created_at DESC
    `, params)
    res.json({ success: true, data: result.rows })
  } catch (err) {
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
  }
}

// ── Obtener una campaña con sus destinatarios ────────────────
async function getOne(req, res) {
  try {
    const { id } = req.params
    const owned = await findOwnedCampaign(req, id)
    if (!owned) return res.status(404).json({ success: false, error: 'Campaña no encontrada' })

    const camp = await query(`
      SELECT c.*, l.name AS line_name, t.name AS template_name, cl.name AS list_name
      FROM campaigns c
      LEFT JOIN lines l ON c.line_id = l.id
      LEFT JOIN templates t ON c.template_id = t.id
      LEFT JOIN contact_lists cl ON c.list_id = cl.id
      WHERE c.id=$1
    `, [id])
    if (!camp.rows.length) return res.status(404).json({ success: false, error: 'Campaña no encontrada' })

    const recipients = await query(
      `SELECT * FROM campaign_recipients
       WHERE campaign_id=$1
       ORDER BY id ASC LIMIT 500`,
      [id]
    )

    const statsByStatus = await query(`
      SELECT status, COUNT(*)::int AS count
      FROM campaign_recipients WHERE campaign_id=$1 GROUP BY status
    `, [id])

    res.json({
      success: true,
      data: {
        ...camp.rows[0],
        recipients: recipients.rows,
        stats_by_status: statsByStatus.rows,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
  }
}

// ── CREAR campaña ────────────────────────────────────────────
// Body:
//  - name (required)
//  - line_id (required)
//  - body (required si no hay template)
//  - template_id (opcional → copia body/media de plantilla)
//  - list_id (opcional → agrega contactos de la lista)
//  - recipients [{wa_number, name, variables}] (opcional)
//  - media_url, media_type, media_filename
//  - min_delay_secs, max_delay_secs, batch_size, batch_pause_secs
//  - scheduled_at (opcional ISO date)
async function create(req, res) {
  try {
    const {
      name, line_id, template_id, list_id,
      body, media_url, media_type, media_filename,
      recipients,
      min_delay_secs, max_delay_secs, batch_size, batch_pause_secs,
      scheduled_at,
    } = req.body

    if (!name) return res.status(400).json({ success: false, error: 'Nombre requerido' })
    const lineasOk = await validarLineasCampania(req, req.body)
    if (lineasOk.error) return res.status(400).json({ success: false, error: lineasOk.error })
    const lineIds = lineasOk.ids
    const modoResponsable = normalizarModo(req.body.modo_responsable)

    let horario
    try {
      horario = parseHorarioEnvio(req.body)
    } catch (e) {
      return res.status(400).json({ success: false, error: e.message })
    }

    // Resolver body y media (si vienen de plantilla)
    let finalBody = body
    let finalMediaUrl = media_url
    let finalMediaType = media_type
    let finalMediaFilename = media_filename

    if (template_id) {
      const tplRes = await query('SELECT * FROM templates WHERE id=$1', [template_id])
      if (tplRes.rows.length) {
        const tpl = tplRes.rows[0]
        finalBody = finalBody || tpl.body
        finalMediaUrl = finalMediaUrl || tpl.media_url
        finalMediaType = finalMediaType || tpl.media_type
        finalMediaFilename = finalMediaFilename || tpl.media_filename
      }
    }

    if (!finalBody && !finalMediaUrl) {
      return res.status(400).json({ success: false, error: 'Debe haber al menos un mensaje o adjunto' })
    }

    // Recolectar destinatarios
    let allRecipients = []

    if (list_id) {
      const items = await query('SELECT wa_number, name, variables FROM contact_list_items WHERE list_id=$1', [list_id])
      allRecipients = items.rows.map(i => ({
        wa_number: i.wa_number,
        name: i.name,
        variables: i.variables || {},
      }))
    }

    if (Array.isArray(recipients) && recipients.length) {
      for (const r of recipients) {
        const num = normalizeNumber(r.wa_number)
        if (num) {
          allRecipients.push({
            wa_number: num,
            name: r.name || null,
            variables: r.variables || {},
          })
        }
      }
    }

    // Dedup por número
    const dedup = new Map()
    for (const r of allRecipients) dedup.set(r.wa_number, r)
    allRecipients = [...dedup.values()]

    if (!allRecipients.length) {
      return res.status(400).json({ success: false, error: 'Sin destinatarios. Asigna una lista o agrega recipients.' })
    }

    const status = scheduled_at ? 'scheduled' : 'draft'

    // Transacción: crear campaña + recipients
    const camp = await transaction(async (client) => {
      const c = await client.query(
        `INSERT INTO campaigns
          (name, line_id, template_id, list_id, body, media_url, media_type, media_filename,
           min_delay_secs, max_delay_secs, batch_size, batch_pause_secs,
           total_recipients, status, scheduled_at, created_by,
           send_days, send_hour_from, send_hour_to, line_ids, modo_responsable)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::uuid[],$21) RETURNING *`,
        [
          name, lineIds[0], template_id || null, list_id || null,
          finalBody, finalMediaUrl, finalMediaType, finalMediaFilename,
          min_delay_secs ?? 8, max_delay_secs ?? 20, batch_size ?? 50, batch_pause_secs ?? 120,
          allRecipients.length, status, scheduled_at || null, req.user.id,
          horario.send_days, horario.send_hour_from, horario.send_hour_to,
          lineIds, modoResponsable,
        ]
      )
      const campaign = c.rows[0]

      // Insertar recipients en bulk
      for (const r of allRecipients) {
        await client.query(
          `INSERT INTO campaign_recipients (campaign_id, wa_number, name, variables)
           VALUES ($1,$2,$3,$4::jsonb)
           ON CONFLICT (campaign_id, wa_number) DO NOTHING`,
          [campaign.id, r.wa_number, r.name, JSON.stringify(r.variables || {})]
        )
      }

      return campaign
    })

    res.status(201).json({ success: true, data: camp })
  } catch (err) {
    console.error('[campaigns.create]', err)
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
  }
}

// ── ACTUALIZAR (solo draft / scheduled) ──────────────────────
async function update(req, res) {
  try {
    const { id } = req.params
    const current = await findOwnedCampaign(req, id)
    if (!current) return res.status(404).json({ success: false, error: 'Campaña no encontrada' })
    if (!['draft', 'scheduled', 'paused'].includes(current.status)) {
      return res.status(400).json({ success: false, error: 'Solo se pueden editar campañas en borrador / programadas / pausadas' })
    }

    const {
      name, body, media_url, media_type, media_filename,
      min_delay_secs, max_delay_secs, batch_size, batch_pause_secs, scheduled_at,
      line_id,   // permite cambiar la línea de envío mientras está pausada/borrador
    } = req.body

    let horario
    try {
      horario = parseHorarioEnvio(req.body)
    } catch (e) {
      return res.status(400).json({ success: false, error: e.message })
    }

    // Líneas / modo: solo se tocan si vienen en la petición.
    let lineIds = null
    if ((Array.isArray(req.body.line_ids) && req.body.line_ids.length) || line_id) {
      const lineasOk = await validarLineasCampania(req, req.body)
      if (lineasOk.error) return res.status(400).json({ success: false, error: lineasOk.error })
      lineIds = lineasOk.ids
    }
    const modoResponsable = req.body.modo_responsable !== undefined ? normalizarModo(req.body.modo_responsable) : null

    const result = await query(
      `UPDATE campaigns SET
         name = COALESCE($1, name),
         body = COALESCE($2, body),
         media_url = $3,
         media_type = $4,
         media_filename = $5,
         min_delay_secs = COALESCE($6, min_delay_secs),
         max_delay_secs = COALESCE($7, max_delay_secs),
         batch_size = COALESCE($8, batch_size),
         batch_pause_secs = COALESCE($9, batch_pause_secs),
         scheduled_at = $10,
         line_id = COALESCE($11, line_id),
         send_days = $13,
         send_hour_from = $14,
         send_hour_to = $15,
         paused_for_schedule = false,
         line_ids = COALESCE($16::uuid[], line_ids),
         modo_responsable = COALESCE($17, modo_responsable)
       WHERE id=$12 RETURNING *`,
      [name, body, media_url || null, media_type || null, media_filename || null,
       min_delay_secs, max_delay_secs, batch_size, batch_pause_secs,
       scheduled_at || null, lineIds ? lineIds[0] : null, id,
       horario.send_days, horario.send_hour_from, horario.send_hour_to,
       lineIds, modoResponsable]
    )
    res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
  }
}

// ── ELIMINAR (cualquier estado) ──────────────────────────────
async function remove(req, res) {
  try {
    const owned = await findOwnedCampaign(req, req.params.id)
    if (!owned) return res.status(404).json({ success: false, error: 'Campaña no encontrada' })

    const engine = req.app.get('campaignEngine')
    try { await engine.cancel(req.params.id) } catch (e) {}
    await query('DELETE FROM campaigns WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
  }
}

// ── INICIAR campaña ──────────────────────────────────────────
async function start(req, res) {
  try {
    const owned = await findOwnedCampaign(req, req.params.id)
    if (!owned) return res.status(404).json({ success: false, error: 'Campaña no encontrada' })

    const engine = req.app.get('campaignEngine')
    const r = await engine.start(req.params.id)
    res.json({ success: true, ...r })
  } catch (err) {
    res.status(400).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
  }
}

async function pause(req, res) {
  try {
    const owned = await findOwnedCampaign(req, req.params.id)
    if (!owned) return res.status(404).json({ success: false, error: 'Campaña no encontrada' })

    const engine = req.app.get('campaignEngine')
    const r = await engine.pause(req.params.id)
    res.json({ success: true, ...r })
  } catch (err) {
    res.status(400).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
  }
}

async function resume(req, res) {
  try {
    const owned = await findOwnedCampaign(req, req.params.id)
    if (!owned) return res.status(404).json({ success: false, error: 'Campaña no encontrada' })

    const engine = req.app.get('campaignEngine')
    const r = await engine.resume(req.params.id)
    res.json({ success: true, ...r })
  } catch (err) {
    res.status(400).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
  }
}

async function cancel(req, res) {
  try {
    const owned = await findOwnedCampaign(req, req.params.id)
    if (!owned) return res.status(404).json({ success: false, error: 'Campaña no encontrada' })

    const engine = req.app.get('campaignEngine')
    const r = await engine.cancel(req.params.id)
    res.json({ success: true, ...r })
  } catch (err) {
    res.status(400).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
  }
}

// ── REINTENTAR FALLIDOS ──────────────────────────────────────
async function retryFailed(req, res) {
  try {
    const { id } = req.params
    const owned = await findOwnedCampaign(req, id)
    if (!owned) return res.status(404).json({ success: false, error: 'Campaña no encontrada' })

    const r = await query(
      `UPDATE campaign_recipients SET status='pending', error=NULL
       WHERE campaign_id=$1 AND status='failed'`,
      [id]
    )
    await query(
      `UPDATE campaigns SET failed_count = 0,
        status = CASE WHEN status='completed' THEN 'draft' ELSE status END
       WHERE id=$1`,
      [id]
    )
    res.json({ success: true, retried: r.rowCount })
  } catch (err) {
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
  }
}

// ── Reporte de uso por empresa / supervisor / asesor (admin + autorizados) ──
async function usageReport(req, res) {
  if (!campaignsReport.puedeVerReporte(req.user)) {
    return res.status(403).json({ success: false, error: 'Solo administradores pueden ver el reporte de uso' })
  }
  try {
    res.json({ success: true, data: await campaignsReport.reporteUso(req.query || {}) })
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ success: false, error: err.message })
    console.error('[campaigns.usageReport]', err)
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
  }
}

module.exports = { usageReport,
  getAll, getOne, create, update, remove,
  start, pause, resume, cancel, retryFailed,
}
