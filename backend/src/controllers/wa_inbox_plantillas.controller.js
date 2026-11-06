const db = require('../config/db')
const svc = require('../services/inboxPlantillas.service')

const responder = (res, err, ctx) => {
  if (err.status) return res.status(err.status).json({ success: false, error: err.message })
  console.error(`[inbox-plantillas.${ctx}]`, err)
  res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
}

async function listar(req, res) {
  try { res.json({ success: true, data: await svc.listarParaInbox(req.user, db) }) } catch (e) { responder(res, e, 'listar') }
}
async function gestion(req, res) {
  try {
    res.json({ success: true, data: await svc.listarGestion(req.user, db),
      meta: { es_admin: String(req.user?.perfil || '').toUpperCase() === 'ADMINISTRADOR', empresas: svc.EMPRESAS } })
  } catch (e) { responder(res, e, 'gestion') }
}
async function crear(req, res) {
  try { res.status(201).json({ success: true, data: await svc.crear(req.user, req.body || {}, db) }) } catch (e) { responder(res, e, 'crear') }
}
async function actualizar(req, res) {
  try { res.json({ success: true, data: await svc.actualizar(req.user, req.params.id, req.body || {}, db) }) } catch (e) { responder(res, e, 'actualizar') }
}

module.exports = { listar, gestion, crear, actualizar }
