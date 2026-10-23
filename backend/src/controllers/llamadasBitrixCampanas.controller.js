/**
 * AUTOMARCADOR BITRIX — lado supervisor (ERP, con JWT).
 * Crea campañas con la misma consulta de "Cargar base" (etapas, responsables,
 * fechas) y reparte los números entre los asesores elegidos. Los asesores los
 * marcan desde la app "Automarcador" dentro de Bitrix.
 */
const bitrixLists = require('../services/waBitrixContactLists.service')
const svc = require('../services/automarcadorBitrix.service')

function crearCampanasController({ db = require('../config/db'), lists = bitrixLists } = {}) {
  const responder = (fn) => async (req, res) => {
    try { res.json({ success: true, data: await fn(req) }) }
    catch (err) {
      if (!err.status) console.error('[AUTOMARCADOR-BX campañas]', err.message)
      res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Error interno del servidor' })
    }
  }
  return {
    asesores: responder(req => svc.listarAsesores(req.user, db)),
    campanas: responder(req => svc.listarCampanas(req.user, db)),
    crear: responder(async (req) => {
      const body = req.body || {}
      const consulta = await lists.consultar(req.user, body, db)
      return svc.crearCampana(req.user, {
        nombre: body.name,
        filtros: { stage_ids: body.stage_ids, responsible_ids: body.responsible_ids, date_from: body.date_from, date_to: body.date_to },
        asesorIds: body.asesor_ids,
        items: consulta.items,
      }, db)
    }),
    reintentar: responder(req => svc.reintentarNoContestados(req.user, req.params.id, db)),
    reporte: responder(req => svc.reporte(req.user, req.query || {}, db)),
    resumen: responder(req => svc.resumen(req.user, req.query || {}, db)),
    control: responder(req => svc.control(req.user, db)),
  }
}

module.exports = { crearCampanasController }
