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

module.exports = {
  DDL, ESTADOS_FINALES, asegurarEsquema, listarAsesores, crearCampana, listarCampanas, reintentarNoContestados,
  resumenAsesor, siguiente, registrarResultado,
  _reset: () => { esquemaListo = null },
}
