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
  'Fuera de Cobertura', 'Zona Peligrosa', 'Innegociable',
  // Agregadas 2026-11-10 (pedido de operación): sin modificar las anteriores.
  'Contrató con competencia', 'Buzón de voz', 'Apagado / fuera de servicio', 'Número errado', 'Cuelga',
  'No desea - Precio', 'No desea - Cobertura', 'No desea - Ya tiene servicio', 'No desea - Otro']

// Tipificaciones que cierran al cliente: no se le vuelve a llamar ni se reintenta.
const TIPIFICACIONES_FINALES = ['Contrata', 'No desea', 'Fuera de Cobertura', 'Zona Peligrosa', 'Innegociable',
  'Contrató con competencia', 'Número errado',
  'No desea - Precio', 'No desea - Cobertura', 'No desea - Ya tiene servicio', 'No desea - Otro']
// Tipificaciones que valen como "no hubo contacto": se reintenta aunque Bitrix diga contestada (buzón).
const TIPIFICACIONES_REINTENTO = ['No contesta', 'Buzón de voz', 'Apagado / fuera de servicio']
const MAX_INTENTOS = 3          // intentos por número dentro de una campaña
const HORAS_ENTRE_INTENTOS = 2  // espera mínima entre intentos
const HORARIO = { desde: 8, hasta: 19 } // horas de inicio permitidas (hora Ecuador)
const DIAS_RECIENTE = 7         // no se carga un número llamado en los últimos N días
const OFFSET_EC_MS = -5 * 3600000 // Ecuador: UTC-5 fijo, sin horario de verano

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
ALTER TABLE automarcador_bx_items ADD COLUMN IF NOT EXISTS proximo_intento TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_automarcador_bx_items_reintento
  ON automarcador_bx_items (usuario_id, proximo_intento) WHERE proximo_intento IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_automarcador_bx_items_deal ON automarcador_bx_items (deal_id);
CREATE TABLE IF NOT EXISTS automarcador_bx_intentos (
  id            SERIAL PRIMARY KEY,
  item_id       INTEGER NOT NULL REFERENCES automarcador_bx_items(id) ON DELETE CASCADE,
  campana_id    INTEGER NOT NULL,
  usuario_id    INTEGER NOT NULL,
  deal_id       VARCHAR(30),
  numero        INTEGER NOT NULL,
  estado        VARCHAR(20) NOT NULL DEFAULT 'en_llamada',
  duracion_seg  INTEGER,
  tipificacion  VARCHAR(40),
  inicio        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fin           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_automarcador_bx_intentos_item ON automarcador_bx_intentos (item_id, id);
CREATE INDEX IF NOT EXISTS idx_automarcador_bx_intentos_inicio ON automarcador_bx_intentos (inicio);
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
// Lista de exclusión: quita de la base los números que no conviene llamar.
//  - tipificacion: ya se cerraron (Contrata, No desea, Número errado, …)
//  - reciente: se llamaron en los últimos DIAS_RECIENTE días
//  - en_otra_campana: siguen pendientes en otra campaña activa
//  - duplicados: el mismo número viene dos veces en la base
async function filtrarExcluidos(empresa, items, db) {
  const tel9 = (v) => String(v || '').replace(/\D/g, '').slice(-9)
  const tels = [...new Set(items.map(it => tel9(it.wa_number)).filter(Boolean))]
  const deals = [...new Set(items.map(it => String(it.variables?.bitrix_id || '')).filter(Boolean))]
  const r = await db.query(
    `SELECT RIGHT(regexp_replace(i.telefono, '\\D', '', 'g'), 9) AS tel, i.deal_id,
            CASE WHEN i.tipificacion = ANY($2::text[]) THEN 'tipificacion'
                 WHEN i.estado = 'pendiente' AND c.estado = 'activa' THEN 'en_otra_campana'
                 ELSE 'reciente' END AS motivo
       FROM automarcador_bx_items i
       JOIN automarcador_bx_campanas c ON c.id = i.campana_id AND c.empresa = $1
      WHERE (RIGHT(regexp_replace(i.telefono, '\\D', '', 'g'), 9) = ANY($3::text[]) OR i.deal_id = ANY($4::text[]))
        AND (i.tipificacion = ANY($2::text[])
             OR (i.estado = 'pendiente' AND c.estado = 'activa')
             OR i.ultimo_intento > NOW() - make_interval(days => $5))`,
    [empresa, TIPIFICACIONES_FINALES, tels, deals, DIAS_RECIENTE]
  )
  // Un número puede salir varias veces: gana el motivo más fuerte.
  const peso = { tipificacion: 3, en_otra_campana: 2, reciente: 1 }
  const porTel = new Map(), porDeal = new Map()
  const guardar = (mapa, k, m) => { if (k && (peso[m] || 0) > (peso[mapa.get(k)] || 0)) mapa.set(k, m) }
  for (const f of r.rows) { guardar(porTel, f.tel, f.motivo); guardar(porDeal, f.deal_id, f.motivo) }

  const excluidos = { tipificacion: 0, reciente: 0, en_otra_campana: 0, duplicados: 0 }
  const vistos = new Set()
  const aptos = []
  for (const it of items) {
    const t = tel9(it.wa_number)
    const d = String(it.variables?.bitrix_id || '')
    const ta = porTel.get(t), de = porDeal.get(d)
    const motivo = (peso[ta] || 0) >= (peso[de] || 0) ? ta : de
    if (motivo) { excluidos[motivo]++; continue }
    if (t && vistos.has(t)) { excluidos.duplicados++; continue }
    if (t) vistos.add(t)
    aptos.push(it)
  }
  return { aptos, excluidos }
}

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

  const { aptos, excluidos } = await filtrarExcluidos(empresaDe(user), items, db)
  if (!aptos.length) {
    const e = new Error('Todos los números fueron excluidos (ya cerrados, llamados en los últimos 7 días o en otra campaña activa)')
    e.status = 400; throw e
  }
  items = aptos

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
    return { campana_id: campanaId, total: items.length, por_asesor: porAsesor, excluidos }
  })
}

const ESTADOS_CAMPANA = ['activa', 'pausada', 'finalizada']
const MAX_CAMPANAS = 500

// Historial de campañas de la empresa, con filtro opcional por fecha de
// creación (hora Ecuador) y estado. Sin filtros trae todo (hasta 500).
async function listarCampanas(user, { desde, hasta, estado } = {}, db) {
  await asegurarEsquema(db)
  const fecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null
  const params = [empresaDe(user)]
  const filtros = []
  const fechaC = `(c.created_at AT TIME ZONE 'America/Guayaquil')::date`
  if (fecha(desde)) { params.push(fecha(desde)); filtros.push(`${fechaC} >= $${params.length}::date`) }
  if (fecha(hasta)) { params.push(fecha(hasta)); filtros.push(`${fechaC} <= $${params.length}::date`) }
  if (ESTADOS_CAMPANA.includes(estado)) { params.push(estado); filtros.push(`c.estado = $${params.length}`) }
  const r = await db.query(
    `SELECT c.id, c.nombre, c.created_at, c.estado,
            COUNT(i.id)::int AS total,
            COUNT(*) FILTER (WHERE i.estado = 'pendiente')::int   AS pendientes,
            COUNT(*) FILTER (WHERE i.estado = 'contestada')::int  AS contestadas,
            COUNT(*) FILTER (WHERE i.estado = 'no_contesta')::int AS no_contesta
       FROM automarcador_bx_campanas c
       LEFT JOIN automarcador_bx_items i ON i.campana_id = c.id
      WHERE c.empresa = $1${filtros.map(f => ` AND ${f}`).join('')}
      GROUP BY c.id ORDER BY c.id DESC LIMIT ${MAX_CAMPANAS}`,
    params
  )
  return r.rows
}

// Devuelve a la cola los números que no contestaron (o fallaron) de una campaña.
async function reintentarNoContestados(user, campanaId, db) {
  await asegurarEsquema(db)
  const r = await db.query(
    `UPDATE automarcador_bx_items i SET estado = 'pendiente', proximo_intento = NULL, updated_at = NOW()
       FROM automarcador_bx_campanas c
      WHERE c.id = i.campana_id AND c.id = $1 AND c.empresa = $2
        AND c.estado <> 'finalizada'
        AND i.estado IN ('no_contesta', 'fallida')
        AND (i.tipificacion IS NULL OR NOT (i.tipificacion = ANY($3::text[])))
      RETURNING i.id`,
    [parseInt(campanaId, 10) || 0, empresaDe(user), TIPIFICACIONES_FINALES]
  )
  return { reencolados: r.rows.length }
}

// ── Lado asesor (app dentro de Bitrix) ────────────────────────────────────
async function resumenAsesor(usuarioId, db) {
  await asegurarEsquema(db)
  const r = await db.query(
    `SELECT COUNT(*) FILTER (WHERE (i.estado = 'pendiente' OR (i.estado <> 'en_llamada' AND i.proximo_intento <= NOW())))::int AS pendientes,
            COUNT(*) FILTER (WHERE i.proximo_intento > NOW())::int AS reintentos_programados,
            COUNT(*) FILTER (WHERE i.estado = 'contestada' AND i.ultimo_intento::date = CURRENT_DATE)::int AS contestadas_hoy,
            COUNT(*) FILTER (WHERE i.estado IN ('no_contesta','fallida') AND i.ultimo_intento::date = CURRENT_DATE)::int AS no_contesta_hoy
       FROM automarcador_bx_items i
       JOIN automarcador_bx_campanas c ON c.id = i.campana_id AND c.estado = 'activa'
      WHERE i.usuario_id = $1`,
    [usuarioId]
  )
  return r.rows[0]
}

// Toma el siguiente número del asesor (sin choques entre pestañas) y abre su
// intento en el historial. Primero los reintentos ya vencidos (programados en
// la mejor hora), luego los números nuevos en orden de carga.
async function siguiente(usuarioId, db) {
  await asegurarEsquema(db)
  // Una llamada que quedó "en_llamada" más de 15 min (pestaña cerrada) vuelve a la cola.
  await db.query(
    `WITH viejas AS (
       UPDATE automarcador_bx_items SET estado = 'pendiente', updated_at = NOW()
        WHERE usuario_id = $1 AND estado = 'en_llamada' AND ultimo_intento < NOW() - INTERVAL '15 minutes'
        RETURNING id)
     UPDATE automarcador_bx_intentos t SET estado = 'abandonada', fin = NOW()
       FROM viejas WHERE t.item_id = viejas.id AND t.estado = 'en_llamada'`,
    [usuarioId]
  )
  const r = await db.query(
    `WITH tomado AS (
       UPDATE automarcador_bx_items SET estado = 'en_llamada', intentos = intentos + 1,
              ultimo_intento = NOW(), proximo_intento = NULL, updated_at = NOW()
        WHERE id = (
          SELECT i.id FROM automarcador_bx_items i
            JOIN automarcador_bx_campanas c ON c.id = i.campana_id AND c.estado = 'activa'
           WHERE i.usuario_id = $1
             AND (i.estado = 'pendiente' OR (i.estado <> 'en_llamada' AND i.proximo_intento <= NOW()))
           ORDER BY i.proximo_intento NULLS LAST, i.id
           LIMIT 1 FOR UPDATE OF i SKIP LOCKED)
        RETURNING id, campana_id, usuario_id, telefono, nombre_cliente, deal_id, intentos, ultimo_intento),
     abierto AS (
       INSERT INTO automarcador_bx_intentos (item_id, campana_id, usuario_id, deal_id, numero, inicio)
       SELECT id, campana_id, usuario_id, deal_id, intentos, ultimo_intento FROM tomado)
     SELECT id, telefono, nombre_cliente, deal_id, ultimo_intento FROM tomado`,
    [usuarioId]
  )
  return r.rows[0] || null
}

// Tasa de contacto por hora (últimos 30 días), en caché 30 min.
let tasasCache = { exp: 0, valor: {} }
async function tasasPorHora(db) {
  if (tasasCache.exp > Date.now()) return tasasCache.valor
  const r = await db.query(
    `SELECT EXTRACT(HOUR FROM ultimo_intento AT TIME ZONE 'America/Guayaquil')::int AS hora,
            COUNT(*)::int AS llamadas,
            COUNT(*) FILTER (WHERE estado = 'contestada')::int AS contestadas
       FROM automarcador_bx_items
      WHERE ultimo_intento > NOW() - INTERVAL '30 days'
        AND estado IN ('contestada', 'no_contesta', 'fallida')
      GROUP BY 1`
  )
  const valor = {}
  for (const f of r.rows) if (f.llamadas >= 20) valor[f.hora] = f.contestadas / f.llamadas // muestra mínima
  tasasCache = { exp: Date.now() + 30 * 60000, valor }
  return valor
}

// Cuándo reintentar: al menos 2 h después, dentro del horario 08h-19h y en la
// hora con mejor tasa de contacto que quede hoy (si no queda, la mejor de mañana).
function proximoIntento(ahoraMs, tasas = {}) {
  const base = ahoraMs + HORAS_ENTRE_INTENTOS * 3600000
  const local = new Date(base + OFFSET_EC_MS) // reloj de Ecuador en campos UTC
  const h = local.getUTCHours()
  const enHora = (dia, hora) => Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dia, hora) - OFFSET_EC_MS
  const mejor = (horas) => horas.reduce((a, b) => ((tasas[b] ?? -1) > (tasas[a] ?? -1) ? b : a))
  const todas = []
  for (let x = HORARIO.desde; x <= HORARIO.hasta; x++) todas.push(x)
  const hoy = todas.filter(x => x >= h)
  if (hoy.length) {
    const elegida = mejor(hoy)
    return new Date(elegida === h ? base : enHora(0, elegida))
  }
  return new Date(enHora(1, mejor(todas)))
}

// Cierra la llamada en curso: guarda el resultado en el número y en su intento.
// Si no contestó y le quedan intentos, se programa el reintento automático.
async function registrarResultado(usuarioId, { item_id, estado, duracion }, db) {
  if (!ESTADOS_FINALES.includes(estado)) { const e = new Error('Estado inválido'); e.status = 400; throw e }
  const dur = Number.isFinite(+duracion) ? Math.max(0, Math.round(+duracion)) : null
  const reintentable = estado === 'no_contesta' || estado === 'fallida'
  const proximo = reintentable ? proximoIntento(Date.now(), await tasasPorHora(db)) : null
  const r = await db.query(
    `WITH it AS (
       UPDATE automarcador_bx_items SET estado = $3, duracion_seg = $4, updated_at = NOW(),
              proximo_intento = CASE WHEN $6::timestamptz IS NOT NULL AND intentos < $5 THEN $6::timestamptz END
        WHERE id = $1 AND usuario_id = $2 AND estado = 'en_llamada'
        RETURNING id, intentos, proximo_intento),
     cierre AS (
       UPDATE automarcador_bx_intentos t SET estado = $3, duracion_seg = $4, fin = NOW()
         FROM it WHERE t.id = (SELECT MAX(id) FROM automarcador_bx_intentos WHERE item_id = it.id))
     SELECT id, intentos, proximo_intento FROM it`,
    [parseInt(item_id, 10) || 0, usuarioId, estado, dur, MAX_INTENTOS, proximo]
  )
  if (!r.rows.length) { const e = new Error('La llamada ya no está activa'); e.status = 409; throw e }
  return { ok: true, reintento: r.rows[0].proximo_intento || null }
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
// Una tipificación final cancela el reintento; una de "sin contacto" (buzón,
// apagado) lo programa aunque Bitrix la haya marcado contestada.
async function tipificar(usuarioId, { item_id, tipificacion }, db) {
  if (!TIPIFICACIONES.includes(tipificacion)) { const e = new Error('Tipificación inválida'); e.status = 400; throw e }
  await asegurarEsquema(db)
  const proximo = TIPIFICACIONES_REINTENTO.includes(tipificacion) ? proximoIntento(Date.now(), await tasasPorHora(db)) : null
  const r = await db.query(
    `WITH it AS (
       UPDATE automarcador_bx_items SET tipificacion = $3::text, tipificado_at = NOW(), updated_at = NOW(),
              proximo_intento = CASE
                WHEN $3::text = ANY($4::text[]) THEN NULL
                WHEN $3::text = ANY($5::text[]) AND intentos < $6 THEN COALESCE(proximo_intento, $7::timestamptz)
                ELSE proximo_intento END
        WHERE id = $1 AND usuario_id = $2 AND estado <> 'pendiente'
        RETURNING id, proximo_intento),
     marca AS (
       UPDATE automarcador_bx_intentos t SET tipificacion = $3::text
         FROM it WHERE t.id = (SELECT MAX(id) FROM automarcador_bx_intentos WHERE item_id = it.id))
     SELECT id, proximo_intento FROM it`,
    [parseInt(item_id, 10) || 0, usuarioId, tipificacion, TIPIFICACIONES_FINALES, TIPIFICACIONES_REINTENTO, MAX_INTENTOS, proximo]
  )
  if (!r.rows.length) { const e = new Error('No se encontró la llamada'); e.status = 404; throw e }
  return { ok: true, reintento: r.rows[0].proximo_intento || null }
}

// Contactabilidad por cliente (deal): cuántas veces se le llamó, cuántas
// contestó, en cuántas campañas estuvo y su última tipificación.
async function contactabilidad(user, { desde, hasta, campana_id } = {}, db) {
  const fecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null
  const d = fecha(desde), h = fecha(hasta)
  if (!d || !h || d > h) { const e = new Error('Selecciona un rango de fechas válido'); e.status = 400; throw e }
  await asegurarEsquema(db)
  // Buzón de voz / apagado / no contesta no cuentan como contacto aunque Bitrix diga contestada.
  const params = [empresaDe(user), d, h, TIPIFICACIONES_REINTENTO]
  let extra = ''
  if (campana_id) { params.push(parseInt(campana_id, 10) || 0); extra = ` AND c.id = $${params.length}` }
  const r = await db.query(
    `WITH it AS (
       SELECT item_id,
              COUNT(*) FILTER (WHERE estado = 'contestada' AND (tipificacion IS NULL OR NOT (tipificacion = ANY($4::text[]))))::int AS ok,
              COALESCE(SUM(duracion_seg), 0)::int AS dur, MIN(inicio) AS primero
         FROM automarcador_bx_intentos GROUP BY item_id)
     SELECT MAX(NULLIF(i.deal_id, '')) AS deal_id,
            MAX(i.nombre_cliente) AS cliente,
            SUM(i.intentos)::int AS veces_llamado,
            SUM(GREATEST(COALESCE(it.ok, 0), CASE WHEN i.estado = 'contestada'
                AND (i.tipificacion IS NULL OR NOT (i.tipificacion = ANY($4::text[]))) THEN 1 ELSE 0 END))::int AS contestadas,
            COUNT(DISTINCT i.campana_id)::int AS campanas,
            SUM(COALESCE(it.dur, i.duracion_seg, 0))::int AS duracion_total,
            to_char(MIN(COALESCE(it.primero, i.ultimo_intento)) AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI') AS primera_llamada,
            to_char(MAX(i.ultimo_intento) AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI') AS ultima_llamada,
            (ARRAY_AGG(i.tipificacion ORDER BY i.tipificado_at DESC NULLS LAST))[1] AS ultima_tipificacion,
            COALESCE(BOOL_OR(i.proximo_intento > NOW()), false) AS reintento_programado,
            STRING_AGG(DISTINCT TRIM(CONCAT(u.nombres, ' ', u.apellidos)), ', ') AS asesores
       FROM automarcador_bx_items i
       JOIN automarcador_bx_campanas c ON c.id = i.campana_id AND c.empresa = $1
       LEFT JOIN it ON it.item_id = i.id
       LEFT JOIN usuarios u ON u.id = i.usuario_id
      WHERE i.intentos > 0 AND i.ultimo_intento IS NOT NULL
        AND (i.ultimo_intento AT TIME ZONE 'America/Guayaquil')::date BETWEEN $2::date AND $3::date${extra}
      GROUP BY COALESCE(NULLIF(i.deal_id, ''), 'tel:' || RIGHT(regexp_replace(i.telefono, '\\D', '', 'g'), 9))
      ORDER BY veces_llamado DESC, contestadas ASC
      LIMIT 20000`,
    params
  )
  return r.rows
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
            i.nombre_cliente, i.deal_id,
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
                     COUNT(*) FILTER (WHERE (i.estado = 'pendiente' OR (i.estado <> 'en_llamada' AND i.proximo_intento <= NOW())))::int AS pendientes,
                     COUNT(*) FILTER (WHERE i.proximo_intento > NOW())::int AS reintentos_programados,
                     COUNT(*) FILTER (WHERE ${hoy} AND i.estado <> 'pendiente')::int AS llamadas_hoy,
                     COUNT(*) FILTER (WHERE ${hoy} AND i.estado = 'contestada')::int AS contestadas_hoy,
                     COUNT(*) FILTER (WHERE ${hoy} AND i.estado IN ('contestada','no_contesta','fallida') AND i.tipificacion IS NULL)::int AS sin_tipificar_hoy,
                     COUNT(*) FILTER (WHERE ${hoy} AND i.tipificacion = 'Contrata')::int AS contrata_hoy,
                     MAX(i.nombre_cliente) FILTER (WHERE i.estado = 'en_llamada') AS en_llamada_con,
                     MAX(i.deal_id) FILTER (WHERE i.estado = 'en_llamada') AS en_llamada_deal,
                     MAX(i.ultimo_intento) FILTER (WHERE i.estado = 'en_llamada') AS en_llamada_desde,
                     MAX(i.ultimo_intento) AS ultima_actividad
                FROM automarcador_bx_items i
                JOIN automarcador_bx_campanas c ON c.id = i.campana_id AND c.empresa = $1 AND c.estado = 'activa'
                LEFT JOIN usuarios u ON u.id = i.usuario_id
               GROUP BY i.usuario_id, 2
               ORDER BY (MAX(i.ultimo_intento) FILTER (WHERE i.estado = 'en_llamada')) IS NULL, ultima_actividad DESC NULLS LAST`, [emp]),
    db.query(`SELECT i.id, TRIM(CONCAT(u.nombres, ' ', u.apellidos)) AS asesor, i.nombre_cliente, i.deal_id,
                     i.estado, i.tipificacion, i.duracion_seg, i.ultimo_intento
                FROM automarcador_bx_items i
                JOIN automarcador_bx_campanas c ON c.id = i.campana_id AND c.empresa = $1
                LEFT JOIN usuarios u ON u.id = i.usuario_id
               WHERE i.ultimo_intento IS NOT NULL AND ${hoy}
               ORDER BY i.ultimo_intento DESC LIMIT 25`, [emp]),
  ])
  return { asesores: asesores.rows, ultimas: ultimas.rows, generado: new Date().toISOString() }
}

// Pausa, reanuda o finaliza una campaña. En pausa o finalizada, los asesores
// terminan la llamada en curso y ya no reciben más números de ella
// (siguiente() solo toma 'activa'). Una campaña finalizada queda cerrada:
// no se puede reabrir ni reintentar, pero sigue en el historial y reportes.
async function cambiarEstadoCampana(user, campanaId, estado, db) {
  if (!ESTADOS_CAMPANA.includes(estado)) { const e = new Error('Estado inválido'); e.status = 400; throw e }
  await asegurarEsquema(db)
  const id = parseInt(campanaId, 10) || 0
  const r = await db.query(
    `UPDATE automarcador_bx_campanas SET estado = $3
      WHERE id = $1 AND empresa = $2 AND estado <> 'finalizada' RETURNING id, estado`,
    [id, empresaDe(user), estado]
  )
  if (r.rows.length) return r.rows[0]
  const existe = await db.query(
    `SELECT estado FROM automarcador_bx_campanas WHERE id = $1 AND empresa = $2`,
    [id, empresaDe(user)]
  )
  if (existe.rows[0]?.estado === 'finalizada') { const e = new Error('La campaña está finalizada y no se puede reabrir'); e.status = 409; throw e }
  const e = new Error('Campaña no encontrada'); e.status = 404; throw e
}

module.exports = {
  DDL, ESTADOS_CAMPANA, TIPIFICACIONES_FINALES, TIPIFICACIONES_REINTENTO, MAX_INTENTOS, proximoIntento, contactabilidad, filtrarExcluidos, ESTADOS_FINALES, TIPIFICACIONES, tipificar, reporte, resumen, control, cambiarEstadoCampana, asegurarEsquema, listarAsesores, crearCampana, listarCampanas, reintentarNoContestados,
  resumenAsesor, siguiente, registrarResultado, itemEnLlamada,
  _reset: () => { esquemaListo = null; tasasCache = { exp: 0, valor: {} } },
}
