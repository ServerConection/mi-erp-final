// Plantillas predeterminadas del Inbox.
// - Gestionan: ADMINISTRADOR (cualquier empresa o TODAS), GERENCIA/GERENTE y
//   SUPERVISOR (solo su empresa).
// - Usan: todos los perfiles del Inbox, viendo las de su empresa + las de TODAS.

const { empresasVisiblesWabot } = require('../shared/waAccesoEmpresa')

const EMPRESAS = ['NOVONET', 'VELSA', 'SEMILLERO', 'VENTAENLINEA', 'TODAS']
const norm = v => String(v || '').trim().toUpperCase()

const esAdmin = user => norm(user?.perfil) === 'ADMINISTRADOR'
function puedeGestionar(user) {
  const p = norm(user?.perfil)
  return esAdmin(user) || p === 'SUPERVISOR' || p === 'GERENCIA' || p === 'GERENTE' || /^GEREN(CIA|TE)[ _-]/.test(p)
}

// Empresa con la que se guarda una plantilla: el admin elige; el resto, la suya.
function empresaDestino(user, pedida) {
  if (esAdmin(user)) {
    const e = norm(pedida).replace(/\s+/g, '')
    return EMPRESAS.includes(e) ? e : 'TODAS'
  }
  return norm(user?.empresa)
}

function error(status, mensaje) { const e = new Error(mensaje); e.status = status; return e }

function validar(body = {}) {
  const titulo = String(body.titulo || '').trim().slice(0, 120)
  const texto = String(body.texto || '').trim().slice(0, 4000)
  const media_url = String(body.media_url || '').trim() || null
  if (!titulo) throw error(400, 'El título es obligatorio')
  if (!texto && !media_url) throw error(400, 'La plantilla necesita texto o imagen')
  if (media_url && !/^(\/wa-uploads\/|\/uploads\/|https?:\/\/)/i.test(media_url)) throw error(400, 'Archivo no válido')
  return {
    titulo, texto: texto || null, media_url,
    media_type: media_url ? (String(body.media_type || 'image').slice(0, 20)) : null,
    media_filename: media_url ? (String(body.media_filename || '').slice(0, 255) || null) : null,
    orden: Number.isInteger(Number(body.orden)) ? Number(body.orden) : 0,
  }
}

// Plantillas que el usuario puede USAR en el Inbox.
async function listarParaInbox(user, db) {
  const params = []
  let where = 'WHERE p.activo'
  if (!esAdmin(user)) {
    params.push([...empresasVisiblesWabot(user), 'TODAS'])
    where += ` AND p.empresa = ANY($1::text[])`
  }
  const { rows } = await db.query(
    `SELECT p.id, p.empresa, p.titulo, p.texto, p.media_url, p.media_type, p.media_filename
       FROM inbox_plantillas p ${where}
      ORDER BY p.orden, p.titulo`, params)
  return rows
}

// Plantillas que el usuario puede GESTIONAR (incluye inactivas).
async function listarGestion(user, db) {
  if (!puedeGestionar(user)) throw error(403, 'Solo administración, gerencia y supervisores gestionan plantillas')
  const params = []
  let where = ''
  if (!esAdmin(user)) { params.push(norm(user.empresa)); where = 'WHERE p.empresa = $1' }
  const { rows } = await db.query(
    `SELECT p.*, u.usuario AS creado_por
       FROM inbox_plantillas p LEFT JOIN usuarios u ON u.id = p.created_by
       ${where} ORDER BY p.activo DESC, p.empresa, p.orden, p.titulo`, params)
  return rows
}

async function crear(user, body, db) {
  if (!puedeGestionar(user)) throw error(403, 'Solo administración, gerencia y supervisores crean plantillas')
  const d = validar(body)
  const { rows } = await db.query(
    `INSERT INTO inbox_plantillas (empresa, titulo, texto, media_url, media_type, media_filename, orden, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *`,
    [empresaDestino(user, body.empresa), d.titulo, d.texto, d.media_url, d.media_type, d.media_filename, d.orden, user.id])
  return rows[0]
}

async function obtenerPropia(user, id, db) {
  if (!puedeGestionar(user)) throw error(403, 'Sin permiso para gestionar plantillas')
  const { rows } = await db.query('SELECT * FROM inbox_plantillas WHERE id::text = $1', [String(id)])
  const p = rows[0]
  if (!p || (!esAdmin(user) && p.empresa !== norm(user.empresa))) throw error(404, 'Plantilla no encontrada')
  return p
}

async function actualizar(user, id, body, db) {
  const actual = await obtenerPropia(user, id, db)
  const d = validar({ ...actual, ...body })
  const activo = body.activo === undefined ? actual.activo : Boolean(body.activo)
  const empresa = body.empresa === undefined ? actual.empresa : empresaDestino(user, body.empresa)
  const { rows } = await db.query(
    `UPDATE inbox_plantillas SET empresa=$2, titulo=$3, texto=$4, media_url=$5, media_type=$6,
            media_filename=$7, orden=$8, activo=$9, updated_by=$10, updated_at=NOW()
      WHERE id=$1 RETURNING *`,
    [actual.id, empresa, d.titulo, d.texto, d.media_url, d.media_type, d.media_filename, d.orden, activo, user.id])
  return rows[0]
}

module.exports = { puedeGestionar, empresaDestino, validar, listarParaInbox, listarGestion, crear, actualizar, EMPRESAS }
