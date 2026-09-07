/**
 * BACKOFFICE JOTFORM — módulo de revisión, embudo y heatmap de envíos Jotform
 * para NOVONET y VELSA (cuentas Jotform separadas, mismo backoffice).
 *
 * Fuentes de datos:
 *   NOVONET → public.mestra_bitrix (mb)   — solo filas con mb.j_id_bitrix (= ingreso Jotform real)
 *   VELSA   → public.mv_indicadores_velsa_completo (mv) — solo filas con mv.id_jotform
 *
 * Estado de revisión (aprobar/rechazar/pendiente) se guarda en
 * public.backoffice_jotform_revision (tabla propia, no se altera la fuente).
 *
 * "Gestionable" = etapa CRM que NO sea DUPLICADO / ATC / FUERA DE COBERTURA / ZONA PELIGROSA
 * (mismo criterio usado en indicadores.controller.js / reporteDetalle.controller.js).
 * "Activo"      = estado Jotform/Netlife = 'ACTIVO' (mismo criterio que indicadoresVelsaMaterialized.controller.js).
 *
 * Embudo (3 etapas, igual para ambas empresas):
 *   1. Ingresados   → todo registro con id de Jotform en el rango de fechas
 *   2. Gestionables → no cae en una etapa CRM no-gestionable
 *   3. Activos      → estado Jotform/Netlife = ACTIVO
 * El "cuello de botella" es la transición consecutiva con menor % de conversión.
 */
const pool = require('../config/db');


// ─────────────────────────────────────────────────────────────────────────────
// TABLA OFICIAL DE ETAPAS (GESTIONABLE / DESCARTE / LEADS TOTALES)
// FUENTE ÚNICA DE VERDAD: backend/src/shared/etapas.js
// NO redefinir las listas aquí: si divergen, cada pantalla muestra un número
// distinto para el mismo indicador (fue exactamente lo que pasó con las etapas
// DUPLICADO / REMARKETING / REGULARIZACION).
// ─────────────────────────────────────────────────────────────────────────────
const {
    esLeadTotalExpr,
    esGestionableExpr,
    esDescarteExpr,
    ETAPAS_NO_GESTIONABLES,
} = require('../shared/etapas');

const getFechaEcuador = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

const EMPRESAS = ['novonet', 'velsa'];

function validarEmpresa(req, res) {
  const empresa = (req.query.empresa || req.params.empresa || req.body.empresa || '').toLowerCase();
  if (!EMPRESAS.includes(empresa)) {
    res.status(400).json({ success: false, error: 'Empresa inválida (novonet|velsa)' });
    return null;
  }
  return empresa;
}

function rangoFechas(req, res, maxDias = 92) {
  const hoy   = getFechaEcuador();
  const desde = req.query.fechaDesde || hoy.slice(0, 7) + '-01';
  const hasta = req.query.fechaHasta || hoy;
  const dias  = (new Date(hasta) - new Date(desde)) / 86400000;
  if (isNaN(dias) || dias < 0) {
    res.status(400).json({ success: false, error: 'Rango de fechas inválido' });
    return null;
  }
  if (dias > maxDias) {
    res.status(400).json({ success: false, error: `Máximo ${maxDias} días por consulta` });
    return null;
  }
  return { desde, hasta };
}

// ─────────────────────────────────────────────────────────────────────────
// VENTA DE SERVICIO: igual condición base que "activo" (estado = ACTIVO) más
// la exigencia de que al menos una columna plan_* tenga datos reales — si no,
// el registro es solo un servicio adicional, no una venta de producto.
// Ninguna fuente (mestra_bitrix / mv_indicadores_velsa_completo) expone las
// columnas plan_*, por lo que se obtienen vía LEFT JOIN en el controller,
// sin modificar ningún esquema/vista/MV existente.
// ─────────────────────────────────────────────────────────────────────────
// FIX (2026-06-23): vista_analisis_novonet puede tener varias filas por
// id_bitrix; se dedupea con GROUP BY antes del JOIN para que no multiplique
// las filas de mb (causaba KPIs de "ingresados" inflados).
const JOIN_PLAN_NOVONET = `LEFT JOIN (
    SELECT
        id_bitrix,
        MAX(plan_casa)               AS plan_casa,
        MAX(plan_profesional)        AS plan_profesional,
        MAX(plan_pyme)                AS plan_pyme,
        MAX(plan_pyme_corp)          AS plan_pyme_corp,
        MAX(plan_hogar_adulto_mayor) AS plan_hogar_adulto_mayor,
        MAX(plan_centro_comercial)   AS plan_centro_comercial
    FROM public.vista_analisis_novonet
    GROUP BY id_bitrix
) van ON mb.j_id_bitrix::text = van.id_bitrix::text`;
const HAS_PLAN_NOVONET = `(
    (van.plan_casa IS NOT NULL AND TRIM(van.plan_casa::text) <> '') OR
    (van.plan_profesional IS NOT NULL AND TRIM(van.plan_profesional::text) <> '') OR
    (van.plan_pyme IS NOT NULL AND TRIM(van.plan_pyme::text) <> '') OR
    (van.plan_pyme_corp IS NOT NULL AND TRIM(van.plan_pyme_corp::text) <> '') OR
    (van.plan_hogar_adulto_mayor IS NOT NULL AND TRIM(van.plan_hogar_adulto_mayor::text) <> '') OR
    (van.plan_centro_comercial IS NOT NULL AND TRIM(van.plan_centro_comercial::text) <> '')
)`;

// FIX (2026-06-23): misma deduplicación que JOIN_PLAN_NOVONET, aplicada a la
// vista de Jotform Velsa (también puede tener varias filas por negociación).
const JOIN_PLAN_VELSA = `LEFT JOIN (
    SELECT
        id_negociacion_bitrix,
        MAX(plan_casa)                  AS plan_casa,
        MAX(plan_pyme)                   AS plan_pyme,
        MAX(plan_profesional)            AS plan_profesional,
        MAX(plan_hogar_adulto_mayor)     AS plan_hogar_adulto_mayor,
        MAX(plan_pyme_corp)              AS plan_pyme_corp,
        MAX(plan_centro_red_comercial)   AS plan_centro_red_comercial
    FROM public.vw_jotform_velsa_netlife_completo
    GROUP BY id_negociacion_bitrix
) jf2 ON mv.id_jotform::text = jf2.id_negociacion_bitrix::text`;
const HAS_PLAN_VELSA = `(
    (jf2.plan_casa IS NOT NULL AND TRIM(jf2.plan_casa::text) <> '') OR
    (jf2.plan_pyme IS NOT NULL AND TRIM(jf2.plan_pyme::text) <> '') OR
    (jf2.plan_profesional IS NOT NULL AND TRIM(jf2.plan_profesional::text) <> '') OR
    (jf2.plan_hogar_adulto_mayor IS NOT NULL AND TRIM(jf2.plan_hogar_adulto_mayor::text) <> '') OR
    (jf2.plan_pyme_corp IS NOT NULL AND TRIM(jf2.plan_pyme_corp::text) <> '') OR
    (jf2.plan_centro_red_comercial IS NOT NULL AND TRIM(jf2.plan_centro_red_comercial::text) <> '')
)`;

// ─────────────────────────────────────────────────────────────────────────
// COLUMNAS DE PLANES COMERCIALES PARA EL EXPORT
// El JOIN de planes (van / jf2) ya existía pero solo se usaba para calcular
// es_venta_servicio; el Excel salía SIN los planes. Aquí se exponen:
//   plan_comercial  → valor del plan contratado (primer plan_* no vacío)
//   categoria_plan  → segmento comercial (HOGAR / PYME / GAMER / ...)
//   plan_*          → columnas individuales, por si se necesita el detalle
// NOTA: la vista Velsa (vw_jotform_velsa_netlife_completo) NO expone plan_gamer
// (pregunta 241 de Jotform). Si se agrega a la vista, basta con sumarlo a
// COLS_PLAN_VELSA y al SELECT del JOIN_PLAN_VELSA.
// ─────────────────────────────────────────────────────────────────────────
const valPlan = (alias, col) => `NULLIF(TRIM(${alias}.${col}::text), '')`;

function buildSelectPlanes(alias, cols) {
  const coalesce  = cols.map(([c]) => valPlan(alias, c)).join(', ');
  const categoria = cols
    .map(([c, label]) => `WHEN ${valPlan(alias, c)} IS NOT NULL THEN '${label}'`)
    .join('\n          ');
  // El 3er elemento (opcional) es el nombre de salida: Velsa llama
  // plan_centro_red_comercial a lo que Novonet llama plan_centro_comercial.
  // Se renombra aquí para que el Excel de las dos empresas sea idéntico.
  const detalle = cols
    .map(([c, , salida]) => `${alias}.${c} AS ${salida || c}`)
    .join(',\n        ');
  return `
        COALESCE(${coalesce}) AS plan_comercial,
        CASE
          ${categoria}
          ELSE NULL
        END AS categoria_plan,
        ${detalle}`;
}

const COLS_PLAN_NOVONET = [
  ['plan_casa',               'HOGAR'],
  ['plan_hogar_adulto_mayor', 'ADULTO MAYOR'],
  ['plan_profesional',        'PROFESIONAL'],
  ['plan_pyme',               'PYME'],
  ['plan_pyme_corp',          'PYME CORP'],
  ['plan_centro_comercial',   'CENTRO COMERCIAL'],
];

const COLS_PLAN_VELSA = [
  ['plan_casa',                 'HOGAR'],
  ['plan_hogar_adulto_mayor',   'ADULTO MAYOR'],
  ['plan_profesional',          'PROFESIONAL'],
  ['plan_pyme',                 'PYME'],
  ['plan_pyme_corp',            'PYME CORP'],
  ['plan_centro_red_comercial', 'CENTRO/RED COMERCIAL', 'plan_centro_comercial'],
];


// ═══════════════════════════════════════════════════════════════════════════
// COLUMNAS DEL EXPORT — LAS MISMAS PARA NOVONET Y VELSA
// ═══════════════════════════════════════════════════════════════════════════
// Las dos empresas viven en tablas distintas y con nombres distintos: Novonet
// en mestra_bitrix (columnas j_* de Jotform y b_* del CRM) y Velsa en la vista
// mv_indicadores_velsa_completo. El Excel salía con columnas diferentes según
// la empresa, así que no se podían pegar uno debajo del otro ni comparar.
//
// Esta tabla es el traductor: una fila por columna del Excel, con la expresión
// que le corresponde a cada empresa. Lo que una empresa no tiene sale en NULL
// EXPLÍCITO en vez de desaparecer — así las dos descargas tienen las mismas
// columnas, en el mismo orden, y el hueco se ve como hueco.
//
// Para agregar una columna al Excel: una línea acá, y las dos empresas la
// tienen. No hay que tocar nada más.
const NULO = `NULL::text`;

const COLUMNAS_EXPORT = [
  // salida                    Novonet (mestra_bitrix mb)                  Velsa (mv_indicadores_velsa_completo mv)
  ['id_crm',                  `mb.b_id::text`,                            `mv.id_crm::text`],
  ['id_jotform',              `mb.j_id_bitrix::text`,                     `mv.id_jotform::text`],
  ['fecha',                   `mb.j_fecha_registro_sistema::date::text`,   `(mv.fecha_registro_jotform - INTERVAL '5 hours')::date::text`],
  ['hora',                    `COALESCE(EXTRACT(HOUR FROM mb.j_fecha_registro_sistema::timestamp)::int, -1)`,
                              `COALESCE(EXTRACT(HOUR FROM (mv.fecha_registro_jotform::timestamp - INTERVAL '5 hours'))::int, -1)`],

  // El código de asesor es lo que permite cruzar esta descarga con nómina,
  // comisiones y metas. Las dos empresas lo guardan, con otro nombre.
  ['codigo_asesor',           `mb.j_codigo_asesor`,                       `mv.codigo_asesor`],
  ['asesor',                  `COALESCE(NULLIF(TRIM(mb.b_persona_responsable), ''), 'SIN ASIGNAR')`,
                              `COALESCE(NULLIF(TRIM(mv.asesor), ''), 'SIN ASIGNAR')`],
  ['supervisor',              `mb.j_supervisor`,                          `mv.supervisor`],

  ['etapa_crm',               `UPPER(TRIM(mb.b_etapa_de_la_negociacion))`, `UPPER(TRIM(mv.etapa_crm))`],
  ['estado_jot',              `COALESCE(NULLIF(TRIM(UPPER(mb.j_netlife_estatus_real)), ''), 'SIN ESTADO')`,
                              `COALESCE(NULLIF(TRIM(UPPER(mv.estado_venta)), ''), 'SIN ESTADO')`],

  ['ciudad',                  `mb.j_ciudad`,                              `mv.ciudad`],
  ['forma_pago',              `mb.j_forma_pago`,                          `mv.forma_pago`],
  ['aplica_descuento',        `mb.j_aplica_descuento_3ra_edad`,           `mv.aplica_descuento`],
  ['estado_regularizacion',   `mb.j_estatus_regularizacion`,              `mv.estado_regularizacion`],
  ['detalle_regularizacion',  `mb.j_detalle_regularizacion`,              `mv.detalle_regularizacion`],
  ['fecha_activacion',        `mb.j_fecha_activacion_netlife::text`,      `mv.fecha_activacion::text`],
  ['fecha_agenda',            `mb.j_fecha_agenda::text`,                  `mv.fecha_agenda::text`],
  ['login_netlife',           `mb.j_netlife_login`,                       `mv.inicio_sesion_netlife`],
  ['origen',                  `mb.b_origen`,                              `mv.origen`],
  ['fecha_creacion_crm',      `mb.b_creado_el_fecha::text`,               `mv.fecha_creacion_crm::text`],
  ['fecha_modificacion_crm',  `mb.b_modificado_el_fecha::text`,           `mv.fecha_modificacion_crm::text`],

  // Cada empresa registra algo que la otra no. La columna se mantiene igual
  // para que el archivo sea el mismo; vacía donde no aplica.
  ['novedades_atc',           `mb.j_novedades_atc`,                       NULO],
  ['fecha_ingresa_telcos',    NULO,                                       `mv.fecha_ingresa_telcos::text`],
  ['observacion_telcos',      NULO,                                       `mv.observacion_telcos`],
];

// ── Red de seguridad: columnas que la tabla puede no tener ──────────────────
// mestra_bitrix y la vista de Velsa se han ido ampliando con el tiempo y no
// están versionadas en este repo. Si una columna de arriba no existe todavía,
// pedirla rompería TODA la descarga. Así que antes de armar el SELECT se
// consulta qué columnas existen de verdad y las que falten salen vacías: se
// pierde ese dato, no el archivo.
const RELACIONES = { novonet: 'mestra_bitrix', velsa: 'mv_indicadores_velsa_completo' };
const cacheColumnas = new Map();

async function columnasReales(empresa) {
  if (cacheColumnas.has(empresa)) return cacheColumnas.get(empresa);
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [RELACIONES[empresa]]
  );
  const set = new Set(rows.map((r) => r.column_name));
  if (set.size) cacheColumnas.set(empresa, set);   // vacío = no cachear (vista aún no creada)
  return set;
}

/** El SELECT del export para la empresa que toca, con las mismas columnas y en
 *  el mismo orden en ambos casos. */
async function selectExport(empresa) {
  const idx = empresa === 'novonet' ? 1 : 2;
  const alias = empresa === 'novonet' ? 'mb' : 'mv';
  const existentes = await columnasReales(empresa);

  const usable = (expr) => {
    if (!existentes.size) return true;            // sin catálogo, no se filtra nada
    const usadas = [...expr.matchAll(new RegExp(`\\b${alias}\\.([a-z0-9_]+)`, 'g'))];
    return usadas.every(([, col]) => existentes.has(col));
  };

  return COLUMNAS_EXPORT
    .map(([salida, ...exprs]) => {
      const expr = exprs[idx - 1];
      return `${usable(expr) ? expr : NULO} AS ${salida}`;
    })
    .join(',\n        ');
}

// ── Definición de campos por empresa (fuente, id, fecha, hora, asesor, etapa-crm, estado-jot) ──
const CFG = {
  novonet: {
    from: `public.mestra_bitrix mb`,
    idExterno: `COALESCE(mb.j_id_bitrix::text, mb.b_id::text)`,
    fechaJot: `mb.j_fecha_registro_sistema::date`,
    horaJot: `COALESCE(EXTRACT(HOUR FROM mb.j_fecha_registro_sistema::timestamp)::int, -1)`,
    asesor: `COALESCE(NULLIF(TRIM(mb.b_persona_responsable), ''), 'SIN ASIGNAR')`,
    etapaCrm: `mb.b_etapa_de_la_negociacion`,
    estadoJot: `COALESCE(NULLIF(TRIM(UPPER(mb.j_netlife_estatus_real)), ''), 'SIN ESTADO')`,
    whereJot: `mb.j_id_bitrix IS NOT NULL`,
    joinPlan: JOIN_PLAN_NOVONET,
    selectPlanes: buildSelectPlanes('van', COLS_PLAN_NOVONET),
    esVentaServicio: `(UPPER(TRIM(mb.j_netlife_estatus_real)) = 'ACTIVO' AND ${HAS_PLAN_NOVONET})`,
    selectExtra: `
      mb.b_id              AS id_crm,
      mb.j_id_bitrix       AS id_jotform,
      mb.j_netlife_login   AS login,
      mb.j_forma_pago      AS forma_pago,
      mb.j_estatus_regularizacion AS estado_regularizacion,
      mb.j_novedades_atc   AS novedades_atc,
      mb.j_fecha_activacion_netlife AS fecha_activacion,
      mb.j_fecha_agenda    AS fecha_agenda
    `,
  },
  velsa: {
    from: `public.mv_indicadores_velsa_completo mv`,
    idExterno: `COALESCE(mv.id_jotform::text, mv.id_crm::text)`,
    fechaJot: `(mv.fecha_registro_jotform - INTERVAL '5 hours')::date`,
    horaJot: `COALESCE(EXTRACT(HOUR FROM (mv.fecha_registro_jotform::timestamp - INTERVAL '5 hours'))::int, -1)`,
    asesor: `COALESCE(NULLIF(TRIM(mv.asesor), ''), 'SIN ASIGNAR')`,
    etapaCrm: `mv.etapa_crm`,
    estadoJot: `COALESCE(NULLIF(TRIM(UPPER(mv.estado_venta)), ''), 'SIN ESTADO')`,
    whereJot: `mv.id_jotform IS NOT NULL`,
    joinPlan: JOIN_PLAN_VELSA,
    selectPlanes: buildSelectPlanes('jf2', COLS_PLAN_VELSA),
    esVentaServicio: `(UPPER(TRIM(mv.estado_venta)) = 'ACTIVO' AND ${HAS_PLAN_VELSA})`,
    selectExtra: `
      mv.id_crm            AS id_crm,
      mv.id_jotform         AS id_jotform,
      mv.forma_pago         AS forma_pago,
      mv.estado_venta       AS estado_regularizacion,
      mv.supervisor         AS supervisor
    `,
  },
};

// ─────────────────────────────────────────────────────────────────────────
// GET /api/backoffice-jotform/listado
// ─────────────────────────────────────────────────────────────────────────
async function getListado(req, res) {
  try {
    const empresa = validarEmpresa(req, res);
    if (!empresa) return;
    const rango = rangoFechas(req, res);
    if (!rango) return;
    const c = CFG[empresa];

    const page     = Math.max(parseInt(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 50, 1), 200);
    const offset   = (page - 1) * pageSize;

    const where = [`${c.fechaJot} BETWEEN $1::date AND $2::date`, c.whereJot];
    const values = [rango.desde, rango.hasta];

    if (req.query.asesor) {
      values.push(`%${req.query.asesor}%`);
      where.push(`${c.asesor} ILIKE $${values.length}`);
    }
    if (req.query.etapa) {
      values.push(`%${req.query.etapa}%`);
      where.push(`(UPPER(${c.etapaCrm}) ILIKE UPPER($${values.length}) OR ${c.estadoJot} ILIKE $${values.length})`);
    }
    if (req.query.q) {
      values.push(`%${req.query.q}%`);
      where.push(`${c.idExterno} ILIKE $${values.length}`);
    }
    if (req.query.estadoRevision) {
      values.push(req.query.estadoRevision.toUpperCase());
      where.push(`COALESCE(r.estado_revision, 'PENDIENTE') = $${values.length}`);
    }

    const sql = `
      SELECT
        ${c.idExterno}        AS id_externo,
        ${c.fechaJot}::text   AS fecha,
        ${c.horaJot}          AS hora,
        ${c.asesor}           AS asesor,
        UPPER(TRIM(${c.etapaCrm})) AS etapa_crm,
        ${c.estadoJot}        AS estado_jot,
        ${esGestionableExpr(c.etapaCrm)} AS gestionable,
        ${c.esVentaServicio} AS es_venta_servicio,
        ${c.selectExtra},
        COALESCE(r.estado_revision, 'PENDIENTE') AS estado_revision,
        r.observacion         AS observacion,
        r.revisado_por        AS revisado_por,
        r.revisado_en         AS revisado_en
      FROM ${c.from}
      ${c.joinPlan}
      LEFT JOIN public.backoffice_jotform_revision r
        ON r.empresa = '${empresa.toUpperCase()}' AND r.id_externo = ${c.idExterno}
      WHERE ${where.join(' AND ')}
      ORDER BY ${c.fechaJot} DESC, ${c.horaJot} DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;
    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM ${c.from}
      LEFT JOIN public.backoffice_jotform_revision r
        ON r.empresa = '${empresa.toUpperCase()}' AND r.id_externo = ${c.idExterno}
      WHERE ${where.join(' AND ')}
    `;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(sql, [...values, pageSize, offset]),
      pool.query(countSql, values),
    ]);

    res.json({
      success: true,
      empresa,
      rango,
      page,
      pageSize,
      total: countRows[0].total,
      data: rows,
    });
  } catch (err) {
    console.error('[BackofficeJotform][listado]', err.message);
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// GET /api/backoffice-jotform/kpis
// ─────────────────────────────────────────────────────────────────────────
async function getKpis(req, res) {
  try {
    const empresa = validarEmpresa(req, res);
    if (!empresa) return;
    const rango = rangoFechas(req, res);
    if (!rango) return;
    const c = CFG[empresa];

    const sql = `
      SELECT
        COUNT(*)::int AS ingresados,
        COUNT(*) FILTER (WHERE ${esGestionableExpr(c.etapaCrm)})::int AS gestionables,
        COUNT(*) FILTER (WHERE ${c.estadoJot} = 'ACTIVO')::int AS activos,
        COUNT(*) FILTER (WHERE ${c.esVentaServicio})::int AS venta_servicio,
        COUNT(*) FILTER (WHERE COALESCE(r.estado_revision,'PENDIENTE') = 'PENDIENTE')::int AS pendientes_revision,
        COUNT(*) FILTER (WHERE r.estado_revision = 'APROBADO')::int AS aprobados,
        COUNT(*) FILTER (WHERE r.estado_revision = 'RECHAZADO')::int AS rechazados,
        COUNT(DISTINCT ${c.asesor})::int AS asesores_activos
      FROM ${c.from}
      ${c.joinPlan}
      LEFT JOIN public.backoffice_jotform_revision r
        ON r.empresa = '${empresa.toUpperCase()}' AND r.id_externo = ${c.idExterno}
      WHERE ${c.fechaJot} BETWEEN $1::date AND $2::date AND ${c.whereJot}
    `;
    const { rows } = await pool.query(sql, [rango.desde, rango.hasta]);
    res.json({ success: true, empresa, rango, kpis: rows[0] });
  } catch (err) {
    console.error('[BackofficeJotform][kpis]', err.message);
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// GET /api/backoffice-jotform/embudo
// Segmentable por asesor (?asesor=) — devuelve además desglose por asesor y por hora
// ─────────────────────────────────────────────────────────────────────────
async function getEmbudo(req, res) {
  try {
    const empresa = validarEmpresa(req, res);
    if (!empresa) return;
    const rango = rangoFechas(req, res);
    if (!rango) return;
    const c = CFG[empresa];

    const where = [`${c.fechaJot} BETWEEN $1::date AND $2::date`, c.whereJot];
    const values = [rango.desde, rango.hasta];
    if (req.query.asesor) {
      values.push(`%${req.query.asesor}%`);
      where.push(`${c.asesor} ILIKE $${values.length}`);
    }
    const whereSql = where.join(' AND ');

    // Totales generales del embudo
    const totalSql = `
      SELECT
        COUNT(*)::int AS ingresados,
        COUNT(*) FILTER (WHERE ${esGestionableExpr(c.etapaCrm)})::int AS gestionables,
        COUNT(*) FILTER (WHERE ${c.estadoJot} = 'ACTIVO')::int AS activos,
        COUNT(*) FILTER (WHERE ${c.esVentaServicio})::int AS venta_servicio
      FROM ${c.from}
      ${c.joinPlan}
      WHERE ${whereSql}
    `;

    // Desglose por asesor (cada etapa del embudo)
    const porAsesorSql = `
      SELECT
        ${c.asesor} AS asesor,
        COUNT(*)::int AS ingresados,
        COUNT(*) FILTER (WHERE ${esGestionableExpr(c.etapaCrm)})::int AS gestionables,
        COUNT(*) FILTER (WHERE ${c.estadoJot} = 'ACTIVO')::int AS activos,
        COUNT(*) FILTER (WHERE ${c.esVentaServicio})::int AS venta_servicio
      FROM ${c.from}
      ${c.joinPlan}
      WHERE ${whereSql}
      GROUP BY 1
      ORDER BY ingresados DESC
    `;

    // Desglose por hora (0-23) del embudo — para ver el cuello de botella horario
    const porHoraSql = `
      SELECT
        ${c.horaJot} AS hora,
        COUNT(*)::int AS ingresados,
        COUNT(*) FILTER (WHERE ${esGestionableExpr(c.etapaCrm)})::int AS gestionables,
        COUNT(*) FILTER (WHERE ${c.estadoJot} = 'ACTIVO')::int AS activos,
        COUNT(*) FILTER (WHERE ${c.esVentaServicio})::int AS venta_servicio
      FROM ${c.from}
      ${c.joinPlan}
      WHERE ${whereSql}
      GROUP BY 1
      ORDER BY 1
    `;

    // Desglose por etapa CRM puntual (para detectar en qué etapa exacta se atascan)
    const porEtapaSql = `
      SELECT
        UPPER(TRIM(${c.etapaCrm})) AS etapa,
        COUNT(*)::int AS cantidad
      FROM ${c.from}
      WHERE ${whereSql}
      GROUP BY 1
      ORDER BY cantidad DESC
      LIMIT 30
    `;

    const [{ rows: totalRows }, { rows: asesorRows }, { rows: horaRows }, { rows: etapaRows }] = await Promise.all([
      pool.query(totalSql, values),
      pool.query(porAsesorSql, values),
      pool.query(porHoraSql, values),
      pool.query(porEtapaSql, values),
    ]);

    const t = totalRows[0];
    const etapas = [
      { etapa: 'Ingresados',        cantidad: t.ingresados },
      { etapa: 'Gestionables',      cantidad: t.gestionables },
      { etapa: 'Activos',           cantidad: t.activos },
      { etapa: 'Venta de Servicio', cantidad: t.venta_servicio },
    ];
    // % conversión entre etapas consecutivas + detección de cuello de botella
    let cuelloDeBottella = null;
    let peorConversion = Infinity;
    for (let i = 1; i < etapas.length; i++) {
      const prev = etapas[i - 1].cantidad;
      const conv = prev > 0 ? (etapas[i].cantidad / prev) * 100 : 0;
      etapas[i].conversion_pct = Math.round(conv * 10) / 10;
      etapas[i].caida_pct = Math.round((100 - conv) * 10) / 10;
      if (conv < peorConversion) {
        peorConversion = conv;
        cuelloDeBottella = { de: etapas[i - 1].etapa, a: etapas[i].etapa, conversion_pct: etapas[i].conversion_pct };
      }
    }

    // Mismo cálculo de conversión aplicado a cada asesor y cada hora, para ubicar el cuello de botella segmentado
    const conConversion = (row) => {
      const g = row.ingresados > 0 ? (row.gestionables / row.ingresados) * 100 : 0;
      const a = row.gestionables > 0 ? (row.activos / row.gestionables) * 100 : 0;
      const vs = row.activos > 0 ? (row.venta_servicio / row.activos) * 100 : 0;
      return {
        ...row,
        conversion_gestionable_pct: Math.round(g * 10) / 10,
        conversion_activo_pct: Math.round(a * 10) / 10,
        conversion_venta_servicio_pct: Math.round(vs * 10) / 10,
      };
    };

    res.json({
      success: true,
      empresa,
      rango,
      embudo: etapas,
      cuello_de_botella: cuelloDeBottella,
      por_asesor: asesorRows.map(conConversion),
      por_hora: horaRows.map(conConversion),
      por_etapa: etapaRows,
    });
  } catch (err) {
    console.error('[BackofficeJotform][embudo]', err.message);
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// GET /api/backoffice-jotform/heatmap  → matriz asesor x hora (cantidad de ingresos)
// ─────────────────────────────────────────────────────────────────────────
async function getHeatmap(req, res) {
  try {
    const empresa = validarEmpresa(req, res);
    if (!empresa) return;
    const rango = rangoFechas(req, res);
    if (!rango) return;
    const c = CFG[empresa];

    const where = [`${c.fechaJot} BETWEEN $1::date AND $2::date`, c.whereJot];
    const values = [rango.desde, rango.hasta];
    if (req.query.asesor) {
      values.push(`%${req.query.asesor}%`);
      where.push(`${c.asesor} ILIKE $${values.length}`);
    }

    const sql = `
      SELECT
        ${c.asesor} AS asesor,
        ${c.horaJot} AS hora,
        COUNT(*)::int AS cantidad
      FROM ${c.from}
      WHERE ${where.join(' AND ')}
      GROUP BY 1,2
      ORDER BY 1,2
    `;
    const { rows } = await pool.query(sql, values);
    res.json({ success: true, empresa, rango, celdas: rows });
  } catch (err) {
    console.error('[BackofficeJotform][heatmap]', err.message);
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// POST /api/backoffice-jotform/revision  { empresa, id_externo, estado_revision, observacion }
// ─────────────────────────────────────────────────────────────────────────
async function setRevision(req, res) {
  try {
    const empresa = (req.body.empresa || '').toLowerCase();
    if (!EMPRESAS.includes(empresa)) {
      return res.status(400).json({ success: false, error: 'Empresa inválida (novonet|velsa)' });
    }
    const { id_externo, estado_revision, observacion } = req.body;
    if (!id_externo) return res.status(400).json({ success: false, error: 'id_externo es requerido' });
    const estado = (estado_revision || 'PENDIENTE').toUpperCase();
    if (!['PENDIENTE', 'APROBADO', 'RECHAZADO'].includes(estado)) {
      return res.status(400).json({ success: false, error: 'estado_revision inválido (PENDIENTE|APROBADO|RECHAZADO)' });
    }

    const revisadoPor = req.user?.nombre || req.user?.usuario || 'sistema';

    const { rows } = await pool.query(`
      INSERT INTO public.backoffice_jotform_revision
        (empresa, id_externo, estado_revision, observacion, revisado_por, revisado_en)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (empresa, id_externo) DO UPDATE SET
        estado_revision = EXCLUDED.estado_revision,
        observacion     = EXCLUDED.observacion,
        revisado_por    = EXCLUDED.revisado_por,
        revisado_en     = NOW()
      RETURNING *
    `, [empresa.toUpperCase(), String(id_externo), estado, observacion || null, revisadoPor]);

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[BackofficeJotform][setRevision]', err.message);
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// GET /api/backoffice-jotform/export  → Excel (xlsx) con los filtros del listado (máx 5000 filas)
// ─────────────────────────────────────────────────────────────────────────
async function exportExcel(req, res) {
  try {
    const empresa = validarEmpresa(req, res);
    if (!empresa) return;
    const rango = rangoFechas(req, res);
    if (!rango) return;
    const c = CFG[empresa];

    const where = [`${c.fechaJot} BETWEEN $1::date AND $2::date`, c.whereJot];
    const values = [rango.desde, rango.hasta];
    if (req.query.asesor) {
      values.push(`%${req.query.asesor}%`);
      where.push(`${c.asesor} ILIKE $${values.length}`);
    }
    if (req.query.estadoRevision) {
      values.push(req.query.estadoRevision.toUpperCase());
      where.push(`COALESCE(r.estado_revision, 'PENDIENTE') = $${values.length}`);
    }

    // Mismas columnas y mismo orden para las dos empresas (ver COLUMNAS_EXPORT).
    const sql = `
      SELECT
        ${c.idExterno}        AS id_externo,
        ${await selectExport(empresa)},
        ${c.esVentaServicio}  AS es_venta_servicio,
        ${c.selectPlanes},
        COALESCE(r.estado_revision, 'PENDIENTE') AS estado_revision,
        r.observacion         AS observacion,
        r.revisado_por        AS revisado_por
      FROM ${c.from}
      ${c.joinPlan}
      LEFT JOIN public.backoffice_jotform_revision r
        ON r.empresa = '${empresa.toUpperCase()}' AND r.id_externo = ${c.idExterno}
      WHERE ${where.join(' AND ')}
      ORDER BY ${c.fechaJot} DESC, ${c.horaJot} DESC
      LIMIT 5000
    `;
    const { rows } = await pool.query(sql, values);

    const XLSX = require('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BackofficeJotform');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="backoffice_jotform_${empresa}_${rango.desde}_${rango.hasta}.xlsx"`);
    res.send(buf);
  } catch (err) {
    console.error('[BackofficeJotform][export]', err.message);
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) });
  }
}

module.exports = {
  getListado, getKpis, getEmbudo, getHeatmap, setRevision, exportExcel,
  // Exportados para reutilizar la misma fuente/columnas Jotform (Novonet/Velsa)
  // desde otros módulos (p.ej. Productividad de asesores en TTHH), sin duplicar
  // la definición de columnas por empresa.
  CFG, EMPRESAS, esGestionableExpr, rangoFechas, validarEmpresa,
  // Solo para las pruebas: la caché de columnas debe poder vaciarse.
  _limpiarCacheColumnas: () => cacheColumnas.clear(),
};
