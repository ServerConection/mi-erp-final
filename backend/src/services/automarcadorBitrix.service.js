/**
 * AUTOMARCADOR BITRIX — campañas de marcado continuo por asesor.
 *
 * El ERP es el "cerebro": guarda la campaña, reparte los números entre los
 * asesores elegidos y lleva el resultado de cada llamada. La llamada la hace
 * Bitrix desde el teléfono del propio asesor (app local "Automarcador" que
 * abre /api/llamadas/bitrix-dialer/app dentro de Bitrix).
 *
 * Módulo NUEVO y aislado: no toca la app WABOT/LLAMAR que ya vive en Bitrix.
 * Tablas propias (automarcador_bx_*), creadas de forma idempotente.
 */
const ESTADOS_FINALES = ['contestada', 'no_contesta', 'fallida', 'omitida']
// Tipificaciones que el asesor elige al terminar cada llamada.
const TIPIFICACIONES = ['Contrata', 'No contesta', 'Seguimiento', 'No desea', 'ATC',
  'Fuera de Cobertura', 'Zona Peligrosa', 'Innegociable']

const DDL = `
CREATE TABLE IF NOT EXISTS automarcador_bx_campanas (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(160) NOT NULL,
  empresa     VARCHAR(20)  NOT NULL,
  creado_por  INTEGER,
  filtros     JSONB,
  estado      VARCHAR(20)  NOT NULL DEFAULT 'activa',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS automarcador_bx_items (
  id              SERIAL PRIMARY KEY,
  campana_id      INTEGER NOT NULL REFERENCES automarcador_bx_campanas(id) ON DELETE CASCADE,
  usuario_id      INTEGER NOT NULL,
  telefono        VARCHAR(20) NOT NULL,
  nombre_cliente  VARCHAR(200),
  deal_id         VARCHAR(30),
  estado          VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  intentos        INTEGER NOT NULL DEFAULT 0,
  duracion_seg    INTEGER,
  ultimo_intento  TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_automarcador_bx_items_cola
  ON automarcador_bx_items (usuario_id, estado, id);
ALTER TABLE automarcador_bx_items ADD COLUMN IF NOT EXISTS tipificacion VARCHAR(40);
ALTER TABLE automarcador_bx_items ADD COLUMN IF NOT EXISTS tipificado_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_automarcador_bx_items_fecha
  ON automarcador_bx_items (ultimo_intento);
`

let esquemaListo = null
function asegurarEsquema(db) {
  if (!esquemaListo) esquemaListo = db.query(DDL).catch((e) => { esquemaListo = null; throw e })
  return esquemaListo
}

function empresaDe(user) {
  const e = String(user?.empresa || 'NOVONET').trim().toUpperCase()
  return ['NOVONET', 'VELSA', 'SEMILLERO'].includes(e) ? e : 'NOVONET'
}

// Asesores activos de la misma empresa del supervisor (los que pueden recibir números).
async function listarAsesores(user, db) {
  const r = await db.query(
    `SELECT id, TRIM(CONCAT(nombres, ' ', apellidos)) AS nombre
       FROM usuarios
      WHERE activo = 'SI' AND UPPER(perfil) IN ('USUARIO', 'ASESOR') AND UPPER(empresa) = $1
      ORDER BY nombre`,
    [empresaDe(user)]
  )
  return r.rows.map(a => ({ id: String(a.id), name: a.nombre || `Usuario #${a.id}` }))
}

// Reparte los teléfonos en ronda entre los asesores elegidos y crea la campaña.
async function crearCampana(user, { nombre, filtros, asesorIds, items }, db) {
  const asesores = [...new Set((asesorIds || []).map(v => parseInt(v, 10)).filter(n => n > 0))]
  if (!asesores.length) { const e = new Error('Selecciona al menos un asesor'); e.status = 400; throw e }
  if (!items?.length) { const e = new Error('La consulta no tiene teléfonos válidos'); e.status = 400; throw e }
  await asegurarEsquema(db)

  const validos = await db.query(
    `SELECT id FROM usuarios WHERE id = ANY($1::int[]) AND activo = 'SI' AND UPPER(empresa) = $2`,
    [asesores, empresaDe(user)]
  )
  const ids = validos.rows.map(r => Number(r.id))
  if (ids.length !== asesores.length) { const e = new Error('Hay asesores inactivos o de otra empresa'); e.status = 400; throw e }

  return db.transaction(async (client) => {
    const c = await client.query(
      `INSERT INTO automarcador_bx_campanas (nombre, empresa, creado_por, filtros)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [String(nombre || '').trim().slice(0, 160) || `Bitrix ${new Date().toISOString().slice(0, 10)}`,
        empresaDe(user), user?.id || null, JSON.stringify(filtros || {})]
    )
    const campanaId = c.rows[0].id
    const porAsesor = {}
    for (let i = 0; i < items.length; i += 500) {
      const lote = items.slice(i, i + 500)
      const valores = []
      const params = []
      lote.forEach((it, j) => {
        const asesor = ids[(i + j) % ids.length]
        porAsesor[asesor] = (porAsesor[asesor] || 0) + 1
        params.push(campanaId, asesor, String(it.wa_number).slice(0, 20),
          it.name ? String(it.name).slice(0, 200) : null,
          it.variables?.bitrix_id ? String(it.variables.bitrix_id).slice(0, 30) : null)
        const b = j * 5
        valores.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`)
      })
      await client.query(
        `INSERT INTO automarcador_bx_items (campana_id, usuario_id, telefono, nombre_cliente, deal_id)
         VALUES ${valores.join(',')}`, params)
    }
    return { campana_id: campanaId, total: items.length, por_asesor: porAsesor }
  })
}

async function listarCampanas(user, db) {
  await asegurarEsquema(db)
  const r = await db.query(
    `SELECT c.id, c.nombre, c.created_at, c.estado,
            COUNT(i.id)::int AS total,
            COUNT(*) FILTER (WHERE i.estado = 'pendiente')::int   AS pendientes,
            COUNT(*) FILTER (WHERE i.estado = 'contestada')::int  AS contestadas,
            COUNT(*) FILTER (WHERE i.estado = 'no_contesta')::int AS no_contesta
       FROM automarcador_bx_campanas c
       LEFT JOIN automarcador_bx_items i ON i.campana_id = c.id
      WHERE c.empresa = $1
      GROUP BY c.id ORDER BY c.id DESC LIMIT 30`,
    [empresaDe(user)]
  )
  return r.rows
}

// Devuelve a la cola los números que no contestaron (o fallaron) de una campaña.
async function reintentarNoContestados(user, campanaId, db) {
  await asegurarEsquema(db)
  const r = await db.query(
    `UPDATE automarcador_bx_items i SET estado = 'pendiente', updated_at = NOW()
       FROM automarcador_bx_campanas c
      WHERE c.id = i.campana_id AND c.id = $1 AND c.empresa = $2
        AND i.estado IN ('no_contesta', 'fallida')
      RETURNING i.id`,
    [parseInt(campanaId, 10) || 0, empresaDe(user)]
  )
  return { reencolados: r.rows.length }
}

// ── Lado asesor (app dentro de Bitrix) ────────────────────────────────────
async function resumenAsesor(usuarioId, db) {
  await asegurarEsquema(db)
  const r = await db.query(
    `SELECT COUNT(*) FILTER (WHERE i.estado = 'pendiente')::int AS pendientes,
            COUNT(*) FILTER (WHERE i.estado = 'contestada' AND i.ultimo_intento::date = CURRENT_DATE)::int AS contestadas_hoy,
            COUNT(*) FILTER (WHERE i.estado IN ('no_contesta','fallida') AND i.ultimo_intento::date = CURRENT_DATE)::int AS no_contesta_hoy
       FROM automarcador_bx_items i
       JOIN automarcador_bx_campanas c ON c.id = i.campana_id AND c.estado = 'activa'
      WHERE i.usuario_id = $1`,
    [usuarioId]
  )
  return r.rows[0]
}

// Toma el siguiente número pendiente del asesor (sin choques entre pestañas).
async function siguiente(usuarioId, db) {
  await asegurarEsquema(db)
  // Una llamada que quedó "en_llamada" más de 15 min (pestaña cerrada) vuelve a la cola.
  await db.query(
    `UPDATE automarcador_bx_items SET estado = 'pendiente', updated_at = NOW()
      WHERE usuario_id = $1 AND estado = 'en_llamada' AND ultimo_intento < NOW() - INTERVAL '15 minutes'`,
    [usuarioId]
  )
  const r = await db.query(
    `UPDATE automarcador_bx_items SET estado = 'en_llamada', intentos = intentos + 1,
            ultimo_intento = NOW(), updated_at = NOW()
      WHERE id = (
        SELECT i.id FROM automarcador_bx_items i
          JOIN automarcador_bx_campanas c ON c.id = i.campana_id AND c.estado = 'activa'
         WHERE i.usuario_id = $1 AND i.estado = 'pendiente'
         ORDER BY i.id
         LIMIT 1 FOR UPDATE OF i SKIP LOCKED)
      RETURNING id, telefono, nombre_cliente, deal_id, ultimo_intento`,
    [usuarioId]
  )
  return r.rows[0] || null
}

async function registrarResultado(usuarioId, { item_id, estado, duracion }, db) {
  if (!ESTADOS_FINALES.includes(estado)) { const e = new Error('Estado inválido'); e.status = 400; throw e }
  const r = await db.query(
    `UPDATE automarcador_bx_items SET estado = $3, duracion_seg = $4, updated_at = NOW()
      WHERE id = $1 AND usuario_id = $2 AND estado = 'en_llamada' RETURNING id`,
    [parseInt(item_id, 10) || 0, usuarioId, estado, Number.isFinite(+duracion) ? Math.max(0, Math.round(+duracion)) : null]
  )
  if (!r.rows.length) { const e = new Error('La llamada ya no está activa'); e.status = 409; throw e }
  return { ok: true }
}

// La llamada que el asesor tiene en curso (para buscar su resultado).
async function itemEnLlamada(usuarioId, itemId, db) {
  const r = await db.query(
    `SELECT id, telefono, ultimo_intento FROM automarcador_bx_items
      WHERE id = $1 AND usuario_id = $2 AND estado = 'en_llamada'`,
    [parseInt(itemId, 10) || 0, usuarioId]
  )
  return r.rows[0] || null
}

// El asesor tipifica una llamada suya ya marcada (en curso o terminada).
async function tipificar(usuarioId, { item_id, tipificacion }, db) {
  if (!TIPIFICACIONES.includes(tipificacion)) { const e = new Error('Tipificación inválida'); e.status = 400; throw e }
  await asegurarEsquema(db)
  const r = await db.query(
    `UPDATE automarcador_bx_items SET tipificacion = $3, tipificado_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND usuario_id = $2 AND estado <> 'pendiente' RETURNING id`,
    [parseInt(item_id, 10) || 0, usuarioId, tipificacion]
  )
  if (!r.rows.length) { const e = new Error('No se encontró la llamada'); e.status = 404; throw e }
  return { ok: true }
}

// Reporte de llamadas hechas (hora, duración, resultado, tipificación) por rango de fechas.
async function reporte(user, { desde, hasta, campana_id } = {}, db) {
  const fecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null
  const d = fecha(desde), h = fecha(hasta)
  if (!d || !h || d > h) { const e = new Error('Selecciona un rango de fechas válido'); e.status = 400; throw e }
  await asegurarEsquema(db)
  const params = [empresaDe(user), d, h]
  let extra = ''
  if (campana_id) { params.push(parseInt(campana_id, 10) || 0); extra = ` AND c.id = $${params.length}` }
  const r = await db.query(
    `SELECT c.id AS campana_id, c.nombre AS campana,
            TRIM(CONCAT(u.nombres, ' ', u.apellidos)) AS asesor,
            i.nombre_cliente, i.telefono, i.deal_id,
            to_char(i.ultimo_intento AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI:SS') AS hora_llamada,
            i.duracion_seg, i.estado, i.tipificacion,
            to_char(i.tipificado_at AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI:SS') AS hora_tipificacion,
            i.intentos
       FROM automarcador_bx_items i
       JOIN automarcador_bx_campanas c ON c.id = i.campana_id AND c.empresa = $1
       LEFT JOIN usuarios u ON u.id = i.usuario_id
      WHERE i.ultimo_intento IS NOT NULL
        AND (i.ultimo_intento AT TIME ZONE 'America/Guayaquil')::date BETWEEN $2::date AND $3::date${extra}
      ORDER BY i.ultimo_intento DESC
      LIMIT 20000`,
    params
  )
  return r.rows
}

// Panel de reportería: indicadores, tipificaciones, asesores y horas del rango.
async function resumen(user, { desde, hasta } = {}, db) {
  const fecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null
  const d = fecha(desde), h = fecha(hasta)
  if (!d || !h || d > h) { const e = new Error('Selecciona un rango de fechas válido'); e.status = 400; throw e }
  await asegurarEsquema(db)
  const base = `FROM automarcador_bx_items i
       JOIN automarcador_bx_campanas c ON c.id = i.campana_id AND c.empresa = $1
      WHERE i.ultimo_intento IS NOT NULL AND i.estado <> 'pendiente'
        AND (i.ultimo_intento AT TIME ZONE 'America/Guayaquil')::date BETWEEN $2::date AND $3::date`
  const p = [empresaDe(user), d, h]
  const [k, t, a, hr, dia] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS llamadas,
                     COUNT(*) FILTER (WHERE i.estado = 'contestada')::int AS contestadas,
                     COUNT(*) FILTER (WHERE i.estado IN ('no_contesta','fallida'))::int AS no_contestadas,
                     COUNT(i.tipificacion)::int AS tipificadas,
                     COALESCE(ROUND(AVG(i.duracion_seg) FILTER (WHERE i.estado = 'contestada')), 0)::int AS duracion_promedio,
                     COALESCE(SUM(i.duracion_seg), 0)::int AS duracion_total,
                     COUNT(DISTINCT i.usuario_id)::int AS asesores
              ${base}`, p),
    db.query(`SELECT COALESCE(i.tipificacion, 'Sin tipificar') AS tipificacion, COUNT(*)::int AS total
              ${base} GROUP BY 1 ORDER BY 2 DESC`, p),
    db.query(`SELECT TRIM(CONCAT(u.nombres, ' ', u.apellidos)) AS asesor,
                     COUNT(*)::int AS llamadas,
                     COUNT(*) FILTER (WHERE i.estado = 'contestada')::int AS contestadas,
                     COUNT(*) FILTER (WHERE i.tipificacion = 'Contrata')::int AS contrata,
                     COUNT(*) FILTER (WHERE i.tipificacion IS NULL)::int AS sin_tipificar,
                     COALESCE(ROUND(AVG(i.duracion_seg) FILTER (WHERE i.estado = 'contestada')), 0)::int AS duracion_promedio
              ${base.replace('JOIN automarcador_bx_campanas', 'LEFT JOIN usuarios u ON u.id = i.usuario_id\n       JOIN automarcador_bx_campanas')}
              GROUP BY 1 ORDER BY llamadas DESC`, p),
    db.query(`SELECT EXTRACT(HOUR FROM i.ultimo_intento AT TIME ZONE 'America/Guayaquil')::int AS hora,
                     COUNT(*)::int AS llamadas,
                     COUNT(*) FILTER (WHERE i.estado = 'contestada')::int AS contestadas
              ${base} GROUP BY 1 ORDER BY 1`, p),
    db.query(`SELECT to_char((i.ultimo_intento AT TIME ZONE 'America/Guayaquil')::date, 'YYYY-MM-DD') AS dia,
                     COUNT(*)::int AS llamadas,
                     COUNT(*) FILTER (WHERE i.estado = 'contestada')::int AS contestadas,
                     COUNT(*) FILTER (WHERE i.tipificacion = 'Contrata')::int AS contrata
              ${base} GROUP BY 1 ORDER BY 1`, p),
  ])
  return { indicadores: k.rows[0], por_tipificacion: t.rows, por_asesor: a.rows, por_hora: hr.rows, por_dia: dia.rows }
}

// Control en vivo para el supervisor: estado de cada asesor hoy y últimas llamadas.
async function control(user, db) {
  await asegurarEsquema(db)
  const emp = empresaDe(user)
  const hoy = `(i.ultimo_intento AT TIME ZONE 'America/Guayaquil')::date = (NOW() AT TIME ZONE 'America/Guayaquil')::date`
  const [asesores, ultimas] = await Promise.all([
    db.query(`SELECT i.usuario_id, TRIM(CONCAT(u.nombres, ' ', u.apellidos)) AS asesor,
                     COUNT(*) FILTER (WHERE i.estado = 'pendiente')::int AS pendientes,
                     COUNT(*) FILTER (WHERE ${hoy} AND i.estado <> 'pendiente')::int AS llamadas_hoy,
                     COUNT(*) FILTER (WHERE ${hoy} AND i.estado = 'contestada')::int AS contestadas_hoy,
                     COUNT(*) FILTER (WHERE ${hoy} AND i.estado IN ('contestada','no_contesta','fallida') AND i.tipificacion IS NULL)::int AS sin_tipificar_hoy,
                     COUNT(*) FILTER (WHERE ${hoy} AND i.tipificacion = 'Contrata')::int AS contrata_hoy,
                     MAX(i.nombre_cliente) FILTER (WHERE i.estado = 'en_llamada') AS en_llamada_con,
                     MAX(i.telefono) FILTER (WHERE i.estado = 'en_llamada') AS en_llamada_tel,
                     MAX(i.ultimo_intento) FILTER (WHERE i.estado = 'en_llamada') AS en_llamada_desde,
                     MAX(i.ultimo_intento) AS ultima_actividad
                FROM automarcador_bx_items i
                JOIN automarcador_bx_campanas c ON c.id = i.campana_id AND c.empresa = $1 AND c.estado = 'activa'
                LEFT JOIN usuarios u ON u.id = i.usuario_id
               GROUP BY i.usuario_id, 2
               ORDER BY (MAX(i.ultimo_intento) FILTER (WHERE i.estado = 'en_llamada')) IS NULL, ultima_actividad DESC NULLS LAST`, [emp]),
    db.query(`SELECT i.id, TRIM(CONCAT(u.nombres, ' ', u.apellidos)) AS asesor, i.nombre_cliente, i.telefono, i.deal_id,
                     i.estado, i.tipificacion, i.duracion_seg, i.ultimo_intento
                FROM automarcador_bx_items i
                JOIN automarcador_bx_campanas c ON c.id = i.campana_id AND c.empresa = $1
                LEFT JOIN usuarios u ON u.id = i.usuario_id
               WHERE i.ultimo_intento IS NOT NULL AND ${hoy}
               ORDER BY i.ultimo_intento DESC LIMIT 25`, [emp]),
  ])
  return { asesores: asesores.rows, ultimas: ultimas.rows, generado: new Date().toISOString() }
}

module.exports = {
  DDL, ESTADOS_FINALES, TIPIFICACIONES, tipificar, reporte, resumen, control, asegurarEsquema, listarAsesores, crearCampana, listarCampanas, reintentarNoContestados,
  resumenAsesor, siguiente, registrarResultado, itemEnLlamada,
  _reset: () => { esquemaListo = null },
}
