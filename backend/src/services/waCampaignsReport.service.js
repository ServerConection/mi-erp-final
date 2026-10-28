// Reporte de uso de Campañas Masivas por empresa, supervisor y asesor.
// Solo ADMINISTRADOR y usuarios autorizados (USUARIOS_REPORTE).

const USUARIOS_REPORTE = ['acloaiza']

function puedeVerReporte(user) {
  if (String(user?.perfil || '').trim().toUpperCase() === 'ADMINISTRADOR') return true
  return USUARIOS_REPORTE.includes(String(user?.usuario || '').trim().toLowerCase())
}

function validarRango(input = {}) {
  const desde = String(input.desde || '').trim()
  const hasta = String(input.hasta || '').trim()
  const fecha = /^\d{4}-\d{2}-\d{2}$/
  if (!fecha.test(desde) || !fecha.test(hasta) || desde > hasta) {
    const err = new Error('Selecciona un rango de fechas válido')
    err.status = 400
    throw err
  }
  const empresa = String(input.empresa || '').trim().toUpperCase()
  return { desde, hasta, empresa: empresa && empresa !== 'TODAS' ? empresa : '' }
}

// Una fila por usuario creador de campañas en el rango. El frontend separa
// supervisores y asesores por el perfil. Leídos/entregados salen de los
// destinatarios; enviados/fallidos de los contadores de la campaña.
const SQL_REPORTE = `
WITH camp AS (
  SELECT c.id, c.created_by, c.status, c.started_at,
         COALESCE(c.total_recipients, 0) AS total_recipients,
         COALESCE(c.sent_count, 0)       AS sent_count,
         COALESCE(c.failed_count, 0)     AS failed_count
    FROM campaigns c
   WHERE (c.created_at AT TIME ZONE 'America/Guayaquil')::date BETWEEN $1::date AND $2::date
),
lect AS (
  SELECT r.campaign_id,
         COUNT(*) FILTER (WHERE r.delivered_at IS NOT NULL OR r.read_at IS NOT NULL) AS entregados,
         COUNT(*) FILTER (WHERE r.read_at IS NOT NULL) AS leidos
    FROM campaign_recipients r
   WHERE r.campaign_id IN (SELECT id FROM camp)
   GROUP BY r.campaign_id
)
SELECT u.id AS usuario_id,
       COALESCE(u.usuario, 'SIN USUARIO') AS usuario,
       NULLIF(BTRIM(CONCAT_WS(' ', u.nombres, u.apellidos)), '') AS nombre,
       UPPER(COALESCE(u.empresa, 'SIN EMPRESA')) AS empresa,
       UPPER(COALESCE(u.perfil, 'SIN PERFIL'))   AS perfil,
       COUNT(c.id)::int                                        AS campanas,
       COUNT(c.id) FILTER (WHERE c.started_at IS NOT NULL)::int AS ejecutadas,
       COALESCE(SUM(c.total_recipients), 0)::int               AS destinatarios,
       COALESCE(SUM(c.sent_count), 0)::int                     AS enviados,
       COALESCE(SUM(c.failed_count), 0)::int                   AS fallidos,
       COALESCE(SUM(l.entregados), 0)::int                     AS entregados,
       COALESCE(SUM(l.leidos), 0)::int                         AS leidos
  FROM camp c
  LEFT JOIN usuarios u ON u.id = c.created_by
  LEFT JOIN lect l ON l.campaign_id = c.id
 WHERE ($3 = '' OR UPPER(COALESCE(u.empresa, '')) = $3)
 GROUP BY u.id, u.usuario, u.nombres, u.apellidos, u.empresa, u.perfil
 ORDER BY enviados DESC, campanas DESC`

async function reporteUso(input, db = require('../config/db')) {
  const f = validarRango(input)
  const { rows } = await db.query(SQL_REPORTE, [f.desde, f.hasta, f.empresa])
  const esSupervisor = r => ['SUPERVISOR', 'GERENCIA'].includes(r.perfil)
  const sumar = filas => filas.reduce((acc, r) => {
    for (const k of ['campanas', 'ejecutadas', 'destinatarios', 'enviados', 'fallidos', 'entregados', 'leidos']) acc[k] += r[k]
    return acc
  }, { campanas: 0, ejecutadas: 0, destinatarios: 0, enviados: 0, fallidos: 0, entregados: 0, leidos: 0 })
  const porEmpresa = new Map()
  for (const r of rows) {
    if (!porEmpresa.has(r.empresa)) porEmpresa.set(r.empresa, [])
    porEmpresa.get(r.empresa).push(r)
  }
  return {
    ...f,
    total: sumar(rows),
    empresas: [...porEmpresa.entries()].map(([empresa, filas]) => ({ empresa, usuarios: filas.length, ...sumar(filas) }))
      .sort((a, b) => b.enviados - a.enviados),
    supervisores: rows.filter(esSupervisor),
    asesores: rows.filter(r => !esSupervisor(r)),
  }
}

module.exports = { puedeVerReporte, validarRango, reporteUso }
