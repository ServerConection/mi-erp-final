const { query } = require('../config/db')
const path = require('path')
const fs = require('fs')

// ── Helper: normaliza un número de WhatsApp ──────────────────
function normalizeNumber(raw) {
  if (raw === null || raw === undefined) return ''
  const str = String(raw).trim()
  if (!str) return ''
  const digits = str.replace(/[^\d]/g, '')
  return digits
}

// ── LISTAR todos los contactos ───────────────────────────────
async function getAll(req, res) {
  try {
    const { line_id, search, tag, limit = 200, offset = 0 } = req.query
    const where = []
    const params = []

    if (line_id) { params.push(line_id); where.push(`line_id = $${params.length}`) }
    if (search)  { params.push(`%${search}%`); where.push(`(name ILIKE $${params.length} OR wa_number ILIKE $${params.length})`) }
    if (tag)     { params.push(tag); where.push(`$${params.length} = ANY(tags)`) }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    params.push(parseInt(limit))
    params.push(parseInt(offset))

    const result = await query(
      `SELECT id, wa_number, name, email, line_id, tags, metadata, is_blocked, first_seen, last_seen
       FROM contacts ${whereSql}
       ORDER BY last_seen DESC NULLS LAST
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    )

    const countParams = params.slice(0, params.length - 2)
    const countRes = await query(`SELECT COUNT(*)::int AS total FROM contacts ${whereSql}`, countParams)

    res.json({ success: true, data: result.rows, total: countRes.rows[0].total })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// ── CREAR contacto manualmente ───────────────────────────────
async function create(req, res) {
  try {
    const { wa_number, name, email, line_id, tags } = req.body
    const num = normalizeNumber(wa_number)
    if (!num) return res.status(400).json({ success: false, error: 'wa_number requerido' })

    const result = await query(
      `INSERT INTO contacts (wa_number, name, email, line_id, tags)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (wa_number, line_id)
       DO UPDATE SET name = COALESCE(EXCLUDED.name, contacts.name),
                     email = COALESCE(EXCLUDED.email, contacts.email),
                     tags = COALESCE(EXCLUDED.tags, contacts.tags),
                     last_seen = NOW()
       RETURNING *`,
      [num, name || null, email || null, line_id || null, tags || []]
    )
    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// ── ACTUALIZAR contacto ──────────────────────────────────────
async function update(req, res) {
  try {
    const { id } = req.params
    const { name, email, tags, is_blocked, metadata } = req.body
    const result = await query(
      `UPDATE contacts SET
         name       = COALESCE($1, name),
         email      = COALESCE($2, email),
         tags       = COALESCE($3, tags),
         is_blocked = COALESCE($4, is_blocked),
         metadata   = COALESCE($5, metadata)
       WHERE id=$6 RETURNING *`,
      [name, email, tags, is_blocked, metadata ? JSON.stringify(metadata) : null, id]
    )
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Contacto no encontrado' })
    res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// ── ELIMINAR contacto ────────────────────────────────────────
async function remove(req, res) {
  try {
    await query('DELETE FROM contacts WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// ── IMPORTAR contactos desde CSV / Excel ─────────────────────
async function importFile(req, res) {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Sin archivo' })
    const { line_id, list_id } = req.body
    const filePath = req.file.path
    const ext = path.extname(req.file.originalname).toLowerCase()

    let rows = []
    if (ext === '.csv') {
      const content = fs.readFileSync(filePath, 'utf8')
      rows = parseCSV(content)
    } else if (ext === '.xlsx' || ext === '.xls') {
      const XLSX = require('xlsx')
      const wb = XLSX.readFile(filePath)
      const sheet = wb.Sheets[wb.SheetNames[0]]
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
    } else {
      return res.status(400).json({ success: false, error: 'Formato no soportado (usa CSV o XLSX)' })
    }

    if (!rows.length) return res.status(400).json({ success: false, error: 'Archivo vacío' })

    // Detectar columna número y nombre (flexible)
    const sample = rows[0]
    const keys = Object.keys(sample).map(k => k.toLowerCase())
    const numKey = Object.keys(sample).find(k => /numero|number|tel|phone|wa|whatsapp|cel/i.test(k))
                  || Object.keys(sample)[0]
    const nameKey = Object.keys(sample).find(k => /nombre|name|cliente|client/i.test(k))

    let imported = 0
    let skipped = 0
    let added_to_list = 0

    for (const row of rows) {
      const num = normalizeNumber(row[numKey])
      if (!num || num.length < 7) { skipped++; continue }
      const name = nameKey ? String(row[nameKey] || '').trim() : null

      // Variables extra (cualquier otra columna)
      const variables = {}
      for (const [k, v] of Object.entries(row)) {
        if (k !== numKey && k !== nameKey && v !== null && v !== '') {
          variables[k] = String(v)
        }
      }

      try {
        await query(
          `INSERT INTO contacts (wa_number, name, line_id, metadata)
           VALUES ($1,$2,$3,$4::jsonb)
           ON CONFLICT (wa_number, line_id)
           DO UPDATE SET name = COALESCE(EXCLUDED.name, contacts.name),
                         metadata = contacts.metadata || EXCLUDED.metadata,
                         last_seen = NOW()`,
          [num, name || null, line_id || null, JSON.stringify(variables)]
        )
        imported++

        if (list_id) {
          await query(
            `INSERT INTO contact_list_items (list_id, wa_number, name, variables)
             VALUES ($1,$2,$3,$4::jsonb)
             ON CONFLICT (list_id, wa_number) DO UPDATE SET
               name = COALESCE(EXCLUDED.name, contact_list_items.name),
               variables = contact_list_items.variables || EXCLUDED.variables`,
            [list_id, num, name || null, JSON.stringify(variables)]
          )
          added_to_list++
        }
      } catch (e) {
        console.warn('[contacts.import] fila falló:', e.message)
        skipped++
      }
    }

    // Limpiar archivo
    try { fs.unlinkSync(filePath) } catch (e) {}

    res.json({
      success: true,
      data: { imported, skipped, added_to_list, total_rows: rows.length },
    })
  } catch (err) {
    console.error('[contacts.import] error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

// ── Parser CSV mínimo (separador coma o ;) ───────────────────
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return []
  const sep = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const values = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''))
    const obj = {}
    headers.forEach((h, i) => { obj[h] = values[i] ?? '' })
    return obj
  })
}

module.exports = { getAll, create, update, remove, importFile, normalizeNumber }
