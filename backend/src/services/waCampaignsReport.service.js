// Reporte de uso de Campañas Masivas por empresa, supervisor y asesor, con
// detalle por hora, día, línea, campaña y mensaje.
// ADMINISTRADOR y usuarios autorizados (USUARIOS_REPORTE) ven todo.

// GERENCIA/GERENTE y SUPERVISOR también lo ven, pero SOLO las campañas de su
// empresa (la empresa la fija el backend, no el navegador).

const USUARIOS_REPORTE = ['acloaiza']
const PERFILES_GERENCIA = ['GERENCIA', 'GERENTE', 'SUPERVISOR']

const perfilDe = user => String(user?.perfil || '').trim().toUpperCase()
const esGerencia = user => PERFILES_GERENCIA.includes(perfilDe(user))

// Ven todas las empresas (pueden elegir el filtro).
function veTodasLasEmpresas(user) {
  return perfilDe(user) === 'ADMINISTRADOR'
    || USUARIOS_REPORTE.includes(String(user?.usuario || '').trim().toLowerCase())
}

function puedeVerReporte(user) {
  return veTodasLasEmpresas(user) || (esGerencia(user) && Boolean(empresaForzada(user)))
}

// Empresa fija para gerencia (null = sin restricción).
function empresaForzada(user) {
  if (veTodasLasEmpresas(user)) return null
  return String(user?.empresa || '').trim().toUpperCase() || null
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

async function reporteUso(input, db = require('../config/db'), user = null) {
  const f = validarRango(input)
  // Gerencia: se ignora lo que pida el navegador y se fija su empresa.
  const fija = user ? empresaForzada(user) : null
  if (fija) f.empresa = fija
  const params = [f.desde, f.hasta, f.empresa]
  const [{ rows }, detalle] = await Promise.all([
    db.query(SQL_REPORTE, params),
    reporteDetalle(params, db),
  ])
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
    ...detalle,
  }
}

// ── Detalle: horarios, líneas, campañas, mensajes y tiempos de lectura ──────
// Todas las consultas parten de las mismas campañas (rango de creación +
// empresa del creador). "Enviado" = tiene sent_at y no terminó en fallo.
// "Respondió" = la conversación recibió un mensaje del cliente dentro de las
// 48 h siguientes al envío de la campaña (usa idx conversation/direction/ts).
const TZ = `'America/Guayaquil'`
const BASE = `
WITH camp AS MATERIALIZED (
  SELECT c.id, c.name, c.status, c.created_at, c.modo_responsable, c.line_id, c.line_ids,
         UPPER(COALESCE(u.empresa, 'SIN EMPRESA')) AS empresa, u.usuario,
         NULLIF(BTRIM(CONCAT_WS(' ', u.nombres, u.apellidos)), '') AS creador
    FROM campaigns c
    LEFT JOIN usuarios u ON u.id = c.created_by
   WHERE (c.created_at AT TIME ZONE ${TZ})::date BETWEEN $1::date AND $2::date
     AND ($3 = '' OR UPPER(COALESCE(u.empresa, '')) = $3)
),
rec AS MATERIALIZED (
  SELECT r.campaign_id, r.message_id, r.status, r.line_id,
         (r.sent_at IS NOT NULL AND r.status <> 'failed')                      AS enviado,
         (r.status <> 'failed' AND (r.delivered_at IS NOT NULL OR r.read_at IS NOT NULL
           OR r.status IN ('delivered', 'read')))                              AS entregado,
         (r.status <> 'failed' AND (r.read_at IS NOT NULL OR r.status = 'read')) AS leido,
         r.sent_at AT TIME ZONE ${TZ} AS sent_local,
         r.read_at AT TIME ZONE ${TZ} AS read_local,
         CASE WHEN r.read_at > r.sent_at THEN EXTRACT(EPOCH FROM r.read_at - r.sent_at) / 60 END AS min_lectura
    FROM campaign_recipients r
   WHERE r.campaign_id IN (SELECT id FROM camp)
)`
const RESPUESTAS = `,
envio AS MATERIALIZED (
  SELECT m.campaign_id, m.line_id, m.conversation_id, MIN(m.timestamp) AS t0
    FROM messages m
   WHERE m.campaign_id IN (SELECT id FROM camp) AND m.direction = 'out' AND m.conversation_id IS NOT NULL
   GROUP BY 1, 2, 3
),
resp AS MATERIALIZED (
  SELECT e.*, (SELECT MIN(i.timestamp) FROM messages i
                WHERE i.conversation_id = e.conversation_id AND i.direction = 'in'
                  AND i.timestamp > e.t0 AND i.timestamp <= e.t0 + INTERVAL '48 hours') AS t_resp
    FROM envio e
)`

const SQL_POR_CAMPANA = `${BASE}${RESPUESTAS},
r1 AS (
  SELECT campaign_id, COUNT(*)::int AS destinatarios,
         COUNT(*) FILTER (WHERE enviado)::int   AS enviados,
         COUNT(*) FILTER (WHERE entregado)::int AS entregados,
         COUNT(*) FILTER (WHERE leido)::int     AS leidos,
         COUNT(*) FILTER (WHERE status = 'failed')::int  AS fallidos,
         COUNT(*) FILTER (WHERE status = 'skipped')::int AS saltados,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pendientes,
         COUNT(DISTINCT line_id) FILTER (WHERE enviado)::int AS lineas_usadas,
         ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY min_lectura)::numeric, 1) AS min_lectura_mediana,
         MIN(sent_local) AS primer_envio, MAX(sent_local) AS ultimo_envio
    FROM rec GROUP BY campaign_id
),
r2 AS (
  SELECT campaign_id, COUNT(*) FILTER (WHERE t_resp IS NOT NULL)::int AS respondieron
    FROM resp GROUP BY campaign_id
)
SELECT c.id, c.name, c.empresa, c.usuario, c.creador, c.status, COALESCE(c.modo_responsable, 'libre') AS modo,
       COALESCE(array_length(c.line_ids, 1), CASE WHEN c.line_id IS NULL THEN 0 ELSE 1 END) AS lineas,
       to_char(c.created_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD HH24:MI') AS creada,
       to_char(r1.primer_envio, 'YYYY-MM-DD HH24:MI') AS primer_envio,
       to_char(r1.ultimo_envio, 'YYYY-MM-DD HH24:MI') AS ultimo_envio,
       COALESCE(r1.destinatarios, 0) AS destinatarios, COALESCE(r1.enviados, 0) AS enviados,
       COALESCE(r1.entregados, 0) AS entregados, COALESCE(r1.leidos, 0) AS leidos,
       COALESCE(r2.respondieron, 0) AS respondieron, COALESCE(r1.fallidos, 0) AS fallidos,
       COALESCE(r1.saltados, 0) AS saltados, COALESCE(r1.pendientes, 0) AS pendientes,
       COALESCE(r1.lineas_usadas, 0) AS lineas_usadas, r1.min_lectura_mediana::float AS min_lectura_mediana
  FROM camp c LEFT JOIN r1 ON r1.campaign_id = c.id LEFT JOIN r2 ON r2.campaign_id = c.id
 ORDER BY c.created_at DESC
 LIMIT 500`

const SQL_POR_HORA = `${BASE}${RESPUESTAS}
SELECT h.hora,
       (SELECT COUNT(*) FROM rec WHERE enviado AND EXTRACT(HOUR FROM sent_local) = h.hora)::int AS enviados,
       (SELECT COUNT(*) FROM rec WHERE enviado AND leido AND EXTRACT(HOUR FROM sent_local) = h.hora)::int AS leidos_de_enviados,
       (SELECT COUNT(*) FROM rec WHERE read_local IS NOT NULL AND EXTRACT(HOUR FROM read_local) = h.hora)::int AS lecturas,
       (SELECT COUNT(*) FROM resp WHERE t_resp IS NOT NULL AND EXTRACT(HOUR FROM t_resp AT TIME ZONE ${TZ}) = h.hora)::int AS respuestas
  FROM generate_series(0, 23) AS h(hora)
 ORDER BY h.hora`

const SQL_POR_DIA_SEMANA = `${BASE}
SELECT EXTRACT(ISODOW FROM sent_local)::int AS dia,
       COUNT(*)::int AS enviados, COUNT(*) FILTER (WHERE leido)::int AS leidos
  FROM rec WHERE enviado
 GROUP BY 1 ORDER BY 1`

const SQL_POR_DIA = `${BASE}
SELECT to_char(sent_local::date, 'YYYY-MM-DD') AS fecha,
       COUNT(*) FILTER (WHERE enviado)::int AS enviados,
       COUNT(*) FILTER (WHERE enviado AND leido)::int AS leidos,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS fallidos
  FROM rec WHERE sent_local IS NOT NULL
 GROUP BY 1 ORDER BY 1`

const SQL_POR_LINEA = `${BASE}${RESPUESTAS},
r2 AS (SELECT line_id, COUNT(*) FILTER (WHERE t_resp IS NOT NULL)::int AS respondieron FROM resp GROUP BY line_id)
SELECT l.name AS linea,
       NULLIF(BTRIM(CONCAT_WS(' ', u.nombres, u.apellidos)), '') AS dueno,
       COUNT(*) FILTER (WHERE rec.enviado)::int   AS enviados,
       COUNT(*) FILTER (WHERE rec.entregado)::int AS entregados,
       COUNT(*) FILTER (WHERE rec.leido)::int     AS leidos,
       COUNT(*) FILTER (WHERE rec.status = 'failed')::int AS fallidos,
       COALESCE(MAX(r2.respondieron), 0)::int AS respondieron,
       ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rec.min_lectura)::numeric, 1)::float AS min_lectura_mediana
  FROM rec
  JOIN lines l ON l.id = rec.line_id
  LEFT JOIN usuarios u ON u.id = l.created_by
  LEFT JOIN r2 ON r2.line_id = rec.line_id
 GROUP BY l.id, l.name, u.nombres, u.apellidos
 ORDER BY enviados DESC
 LIMIT 200`

const SQL_POR_MENSAJE = `${BASE}
SELECT c.name AS campana, COALESCE(NULLIF(BTRIM(cm.label), ''), 'Mensaje ' || (cm.sort_order + 1)) AS etiqueta,
       LEFT(REGEXP_REPLACE(COALESCE(cm.message_text, cm.media_caption, ''), '\\s+', ' ', 'g'), 140) AS texto,
       cm.media_type,
       COUNT(*) FILTER (WHERE rec.enviado)::int AS enviados,
       COUNT(*) FILTER (WHERE rec.leido)::int   AS leidos
  FROM rec
  JOIN campaign_messages cm ON cm.id = rec.message_id
  JOIN camp c ON c.id = rec.campaign_id
 GROUP BY c.name, cm.id, cm.label, cm.sort_order, cm.message_text, cm.media_caption, cm.media_type
HAVING COUNT(*) FILTER (WHERE rec.enviado) > 0
 ORDER BY enviados DESC
 LIMIT 100`

const SQL_TIEMPO_LECTURA = `${BASE}
SELECT tramo, COUNT(*)::int AS leidos FROM (
  SELECT CASE WHEN min_lectura < 5 THEN 1 WHEN min_lectura < 30 THEN 2 WHEN min_lectura < 60 THEN 3
              WHEN min_lectura < 180 THEN 4 WHEN min_lectura < 1440 THEN 5 ELSE 6 END AS tramo
    FROM rec WHERE min_lectura IS NOT NULL
) t GROUP BY tramo ORDER BY tramo`

const TRAMOS = ['< 5 min', '5–30 min', '30–60 min', '1–3 h', '3–24 h', '> 24 h']
const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

async function reporteDetalle(params, db) {
  const q = sql => db.query(sql, params).then(r => r.rows)
  const [campanas, horas, diasSemana, dias, lineas, mensajes, tiempos] = await Promise.all([
    q(SQL_POR_CAMPANA), q(SQL_POR_HORA), q(SQL_POR_DIA_SEMANA), q(SQL_POR_DIA),
    q(SQL_POR_LINEA), q(SQL_POR_MENSAJE), q(SQL_TIEMPO_LECTURA),
  ])
  const porTramo = new Map(tiempos.map(t => [Number(t.tramo), t.leidos]))
  return {
    campanas,
    por_hora: horas,
    por_dia_semana: diasSemana.map(d => ({ ...d, nombre: DIAS[d.dia] || String(d.dia) })),
    por_dia: dias,
    por_linea: lineas,
    por_mensaje: mensajes,
    tiempo_lectura: TRAMOS.map((tramo, i) => ({ tramo, leidos: porTramo.get(i + 1) || 0 })),
    embudo: campanas.reduce((a, c) => {
      for (const k of ['destinatarios', 'enviados', 'entregados', 'leidos', 'respondieron', 'fallidos', 'saltados', 'pendientes']) a[k] += c[k]
      return a
    }, { destinatarios: 0, enviados: 0, entregados: 0, leidos: 0, respondieron: 0, fallidos: 0, saltados: 0, pendientes: 0 }),
  }
}

module.exports = { puedeVerReporte, empresaForzada, validarRango, reporteUso }
