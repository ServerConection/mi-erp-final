const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// TABLA OFICIAL DE ETAPAS (GESTIONABLE / DESCARTE) — FUENTE ÚNICA DE VERDAD
// Aplica IGUAL para NOVONET y VELSA (las etapas del CRM son las mismas).
// Comparación SIEMPRE case-insensitive (UPPER+TRIM) para que no importe si la
// etapa viene en mayúsculas, minúsculas o mixta.
//
// NO GESTIONABLES (todo lo demás se considera gestionable = SI):
//   ATC, ATC/SOPORTE, DUPLICADO, FUERA DE COBERTURA, INNEGOCIABLE,
//   ZONA(S) PELIGROSA(S), POSTVENTA (exacto, no aplica a "POSTVENTA NOVONET"),
//   REGULARIZACION, CONTRATO PARAMOUNT, PARAMOUNT SEGUIMIENTO POR CERRAR.
//
// DESCARTE = SI (subconjunto de las gestionables, el resto de gestionables es
// DESCARTE = NO):
//   CONTRATO NETLIFE, DESCARTE, DESISTE DE COMPRA, MANTIENE PROVEEDOR,
//   NO INTERESA COSTO PLAN, NO VOLVER A CONTACTAR, OTRO PROVEEDOR,
//   DESCARTE REMARKETIZADO, CONTRATO NETLIFE POR OTRO CANAL,
//   DESCARTE PLAN DE 200, NO INTERESA COSTO INSTALACIÓN.
// ─────────────────────────────────────────────────────────────────────────────
const ETAPAS_NO_GESTIONABLES = [
    'ATC',
    'ATC/SOPORTE',
    'DUPLICADO',
    'DUPLLICADO', // typo real encontrado en datos
    'FUERA DE COBERTURA',
    'INNEGOCIABLE',
    'ZONA PELIGROSA',
    'ZONAS PELIGROSAS',
    'POSTVENTA', // exacto: NO incluye "POSTVENTA NOVONET", esa SI es gestionable
    'REGULARIZACION',
    'REGULARIZACIÓN',
    'CONTRATO PARAMOUNT',
    'PARAMOUNT SEGUMIENTO POR CERRAR',
    'PARAMOUNT SEGUIMIENTO POR CERRAR',
];

const ETAPAS_DESCARTE_SI = [
    'CONTRATO NETLIFE',
    'DESCARTE',
    'DESISTE DE COMPRA',
    'MANTIENE PROVEEDOR',
    'NO INTERESA COSTO PLAN',
    'NO VOLVER A CONTACTAR',
    'OTRO PROVEEDOR',
    'DESCARTE REMARKETIZADO',
    'CONTRATO NETLIFE POR OTRO CANAL',
    'DESCARTE PLAN DE 200',
    'NO INTERESA COSTO INSTALACIÓN',
    'NO INTERESA COSTO INSTALACION',
];

const _sqlListaUpper = (arr) => `(${arr.map(e => `'${e.toUpperCase().replace(/'/g, "''")}'`).join(', ')})`;

// gestionable = SI  ⇔  la etapa NO está en la lista de no-gestionables
const esGestionableExpr = (col) =>
    `(UPPER(TRIM(${col})) NOT IN ${_sqlListaUpper(ETAPAS_NO_GESTIONABLES)})`;

// descarte = SI  ⇔  la etapa está en la lista blanca de descarte
const esDescarteExpr = (col) =>
    `(UPPER(TRIM(${col})) IN ${_sqlListaUpper(ETAPAS_DESCARTE_SI)})`;

const getFechaEcuador = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

const getPrimerDiaMesEcuador = () => {
  const f = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guayaquil' }));
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-01`;
};

const MV = `public.mv_indicadores_velsa_completo mv`;
const ESTADO_ACTIVO = `'ACTIVO'`;

// ─────────────────────────────────────────────────────────────────────────────
// VENTA DE SERVICIO: la MV no expone columnas plan_* (no se modifica su esquema
// por decisión del usuario — "Solo JOIN en el controller, sin tocar la MV").
// Se obtienen vía LEFT JOIN directo a la vista base de Jotform Velsa.
// ─────────────────────────────────────────────────────────────────────────────
// FIX (2026-06-23): vw_jotform_velsa_netlife_completo puede tener varias
// filas por id_negociacion_bitrix. Sin deduplicar, el LEFT JOIN multiplica
// las filas de la MV y todos los COUNT(*) que lo usan (ingresos_jot, KPIs de
// monitoreo diario, reporte180, consulta-descarga) quedan inflados.
const JOIN_JF_VELSA_MV = `LEFT JOIN (
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

const HAS_PLAN_VELSA_MV = `(
    (jf2.plan_casa IS NOT NULL AND TRIM(jf2.plan_casa::text) <> '') OR
    (jf2.plan_pyme IS NOT NULL AND TRIM(jf2.plan_pyme::text) <> '') OR
    (jf2.plan_profesional IS NOT NULL AND TRIM(jf2.plan_profesional::text) <> '') OR
    (jf2.plan_hogar_adulto_mayor IS NOT NULL AND TRIM(jf2.plan_hogar_adulto_mayor::text) <> '') OR
    (jf2.plan_pyme_corp IS NOT NULL AND TRIM(jf2.plan_pyme_corp::text) <> '') OR
    (jf2.plan_centro_red_comercial IS NOT NULL AND TRIM(jf2.plan_centro_red_comercial::text) <> '')
)`;
const VENTA_SERVICIO_VELSA_MV = `(UPPER(TRIM(mv.estado_venta)) = 'ACTIVO' AND ${HAS_PLAN_VELSA_MV})`;

// GESTIONABLE / DESCARTE: usar esGestionableExpr() / esDescarteExpr()
// definidas arriba (fuente única de verdad, tabla oficial de etapas).

// ── Filtros dinámicos ─────────────────────────────────────────────────────────
function buildFilters(q, values) {
  let f = '';
  const { asesor, supervisor, estadoNetlife, estadoRegularizacion, etapaCRM, etapaJotform, idBitrix, gestionables, fechaActivacionDesde, fechaActivacionHasta } = q;
  if (asesor)               { values.push(`%${asesor}%`);               f += ` AND mv.asesor ILIKE $${values.length}`; }
  if (supervisor)           { values.push(`%${supervisor}%`);           f += ` AND mv.supervisor ILIKE $${values.length}`; }
  if (estadoNetlife)        { values.push(`%${estadoNetlife}%`);        f += ` AND mv.estado_venta ILIKE $${values.length}`; }
  if (estadoRegularizacion) { values.push(`%${estadoRegularizacion}%`); f += ` AND mv.estado_regularizacion ILIKE $${values.length}`; }
  if (etapaCRM)             { values.push(`%${etapaCRM}%`);             f += ` AND mv.etapa_crm ILIKE $${values.length}`; }
  if (etapaJotform)         { values.push(`%${etapaJotform}%`);         f += ` AND mv.estado_venta ILIKE $${values.length}`; }
  if (idBitrix)             { values.push(idBitrix.toString());         f += ` AND (mv.id_crm::text = $${values.length} OR mv.id_jotform::text = $${values.length})`; }
  // Filtro GESTIONABLES: 'si' = solo gestionables, 'no' = solo NO gestionables
  if (gestionables === 'si')      f += ` AND ${esGestionableExpr('mv.etapa_crm')}`;
  else if (gestionables === 'no') f += ` AND NOT ${esGestionableExpr('mv.etapa_crm')}`;
  // Filtro FECHA DE ACTIVACIÓN (opcional, independiente del rango principal
  // que sigue siendo "fecha de creación" / fecha de registro Jotform).
  // Si NO se envía, no se toca el string de filtros → cero impacto, el
  // comportamiento es exactamente igual que antes.
  // Si SE envía, se agrega como restricción ADICIONAL (AND) sobre
  // mv.fecha_activacion, conviviendo con el filtro de creación en vez de
  // remplazarlo. Aplica a todas las queries que consumen buildFilters().
  if (fechaActivacionDesde && fechaActivacionHasta) {
    values.push(fechaActivacionDesde, fechaActivacionHasta);
    const idxDesde = values.length - 1;
    const idxHasta = values.length;
    f += ` AND mv.fecha_activacion::date BETWEEN $${idxDesde}::date AND $${idxHasta}::date`;
  }
  return f;
}

// ── Query KPI por columna de agrupación ──────────────────────────────────────
const queryKPI = (columna, filters) => `
  SELECT
    COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
    COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date) AS leads_totales,
    -- FIX (2026-06-23): antes este FILTER tenia una ventana de fecha MAS AMPLIA
    -- (fecha_creacion_crm OR fecha_registro_jotform) que la de "leads_totales"
    -- (que solo usa fecha_creacion_crm), permitiendo gestionables > leads_totales
    -- (imposible, ya que gestionables debe ser subconjunto de leads_totales).
    -- Ahora usa la MISMA base de fecha que leads_totales.
    COUNT(*) FILTER (
      WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
      AND ${esGestionableExpr('mv.etapa_crm')}
    ) AS gestionables,
    COUNT(*) FILTER (
      WHERE UPPER(mv.etapa_crm) = 'VENTA SUBIDA'
      AND mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
    ) AS ventas_crm,
    COUNT(*) FILTER (
      WHERE UPPER(mv.etapa_crm) = 'VENTA SUBIDA'
      AND mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
      AND mv.fecha_creacion_crm::date = mv.fecha_modificacion_crm::date
    ) AS ventas_del_dia,
    COUNT(*) FILTER (WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date) AS ingresos_reales,
    COUNT(*) FILTER (
      WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
      AND mv.fecha_creacion_crm::date = (mv.fecha_registro_jotform - INTERVAL '5 hours')::date
    ) AS ingresos_del_dia,
    -- "Activas mes" (real_mes): se cuenta por FECHA DE ACTIVACION TELCOS
    -- (mv.fecha_activacion), no por fecha de registro jotform. Incluye backlog
    -- (creado antes del periodo pero activado dentro de el) porque el WHERE
    -- base de este query ahora tambien incluye fecha_activacion en rango.
    COUNT(*) FILTER (
      WHERE mv.fecha_activacion IS NOT NULL
      AND mv.fecha_activacion::date BETWEEN $1::date AND $2::date
      AND mv.estado_venta = ${ESTADO_ACTIVO}
    ) AS real_mes,
    COUNT(*) FILTER (
      WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
      AND ${VENTA_SERVICIO_VELSA_MV}
    ) AS venta_servicio,
    COUNT(*) FILTER (
      WHERE ${esDescarteExpr('mv.etapa_crm')}
      AND mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
    ) AS descarte_count,
    COUNT(*) FILTER (
      WHERE mv.forma_pago ILIKE '%TARJETA DE CREDITO%'
      AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
    ) AS tarjeta_credito,
    COUNT(*) FILTER (
      WHERE mv.aplica_descuento ILIKE '%TERCERA EDAD%'
      AND mv.estado_venta = ${ESTADO_ACTIVO}
      AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
    ) AS tercera_edad,
    COUNT(*) FILTER (
      WHERE mv.estado_regularizacion ILIKE '%REGULARIZAR%'
      AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
    ) AS regularizacion
  FROM ${MV}
  ${JOIN_JF_VELSA_MV}
  WHERE (
    mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
    OR (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
    OR mv.fecha_activacion::date BETWEEN $1::date AND $2::date
  ) ${filters}
  GROUP BY 1 ORDER BY ingresos_reales DESC, ventas_crm DESC
`;

// ── Query Backlog — solo usa $1 (desde) ──────────────────────────────────────
const queryBacklog = (columna, filters) => `
  SELECT
    COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
    COUNT(DISTINCT mv.id_jotform)::int AS backlog
  FROM ${MV}
  WHERE mv.id_jotform IS NOT NULL
    AND mv.fecha_activacion IS NOT NULL
    AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date < $1::date
    AND mv.fecha_activacion::date BETWEEN $1::date AND $2::date
    AND mv.estado_venta = ${ESTADO_ACTIVO}
    ${filters}
  GROUP BY 1
`;

// ── Merge KPI + Backlog + calcular campos derivados ──────────────────────────
function mergeBacklog(kpiRows, backlogRows) {
  const map = {};
  (backlogRows || []).forEach(r => { map[r.nombre_grupo] = Number(r.backlog || 0); });
  return kpiRows.map(r => {
    const gest  = Number(r.gestionables   || 0);
    const jot   = Number(r.ingresos_reales || 0);
    const activ = Number(r.real_mes       || 0);
    const desc  = Number(r.descarte_count || 0);
    const leads = Number(r.leads_totales  || 0);
    const vdia  = Number(r.ventas_del_dia || 0);
    const bk    = map[r.nombre_grupo] || 0;
    return {
      ...r,
      backlog:                    bk,
      total_activas_calculada:    activ + bk,
      // V. SEGUIMIENTO = INGRESOS JOT − VENTAS DEL DÍA
      venta_seguimiento:          Math.max(0, jot - vdia),
      descarte:                   gest  > 0 ? parseFloat(((desc  / gest)  * 100).toFixed(1)) : 0,
      efectividad_real:           gest  > 0 ? parseFloat(((jot   / gest)  * 100).toFixed(1)) : 0,
      tasa_instalacion:           jot   > 0 ? parseFloat(((activ / jot)   * 100).toFixed(1)) : 0,
      eficiencia:                 leads > 0 ? parseFloat(((activ / leads) * 100).toFixed(1)) : 0,
      efectividad_activas_vs_pauta: gest > 0 ? parseFloat(((activ / gest) * 100).toFixed(1)) : 0,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
async function getIndicadoresDashboardVelsa(req, res) {
  try {
    const hoy   = getFechaEcuador();
    const desde = req.query.fechaDesde || hoy;
    const hasta = req.query.fechaHasta || hoy;

    const valuesMain = [desde, hasta];
    const filters    = buildFilters(req.query, valuesMain);

    const valuesBk  = [desde, hasta];
    const filtersBk = buildFilters(req.query, valuesBk);

    const qEstados = `
      SELECT COALESCE(NULLIF(TRIM(mv.estado_venta),''),'SIN ESTADO') AS estado, COUNT(*)::int AS total
      FROM ${MV}
      WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date ${filters}
      GROUP BY 1 ORDER BY total DESC
    `;
    const qEmbudo = `
      SELECT COALESCE(mv.etapa_crm,'SIN ETAPA') AS etapa, COUNT(*)::int AS total
      FROM ${MV}
      WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date ${filters}
      GROUP BY mv.etapa_crm ORDER BY total DESC
    `;
    const qPorDia = `
      SELECT
        (mv.fecha_registro_jotform - INTERVAL '5 hours')::date::text AS fecha,
        EXTRACT(DAY FROM (mv.fecha_registro_jotform - INTERVAL '5 hours')::date)::int AS dia,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE mv.estado_venta = ${ESTADO_ACTIVO})::int AS activos
      FROM ${MV}
      WHERE mv.fecha_registro_jotform IS NOT NULL
        AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date ${filters}
      GROUP BY (mv.fecha_registro_jotform - INTERVAL '5 hours')::date ORDER BY (mv.fecha_registro_jotform - INTERVAL '5 hours')::date ASC
    `;

    // ── NUEVO: activaciones por día usando fecha_activacion_date ────────────────
    // Indicador independiente — no modifica ningún KPI ni cálculo existente.
    const qActivacionesPorDia = `
      SELECT
        mv.fecha_activacion_date::date::text AS fecha,
        COUNT(*)::int AS activaciones
      FROM ${MV}
      WHERE mv.fecha_activacion_date IS NOT NULL
        AND mv.fecha_activacion_date::date BETWEEN $1::date AND $2::date ${filters}
      GROUP BY mv.fecha_activacion_date::date
      ORDER BY mv.fecha_activacion_date::date ASC
    `;
    const qEtapasCRM = `
      SELECT DISTINCT mv.etapa_crm AS etapa FROM ${MV}
      WHERE mv.etapa_crm IS NOT NULL AND TRIM(mv.etapa_crm) <> ''
      ORDER BY etapa ASC
    `;
    const qEtapasJot = `
      SELECT DISTINCT mv.estado_venta FROM ${MV}
      WHERE mv.estado_venta IS NOT NULL AND TRIM(mv.estado_venta) <> ''
      ORDER BY mv.estado_venta ASC
    `;
    const qTercera = `
      SELECT
        COUNT(*) FILTER (WHERE mv.aplica_descuento ILIKE '%TERCERA EDAD%' AND mv.estado_venta = ${ESTADO_ACTIVO}) AS total_tercera,
        COUNT(*) FILTER (WHERE mv.estado_venta = ${ESTADO_ACTIVO}) AS total_activos
      FROM ${MV}
      WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date ${filters}
    `;
    const qTarjeta = `
      SELECT
        COUNT(*) FILTER (WHERE mv.forma_pago ILIKE '%TARJETA DE CREDITO%') AS total_tarjeta,
        COUNT(*) AS total_jotform
      FROM ${MV}
      WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date ${filters}
    `;
    const qNetlife = `
SELECT
  mv.id_crm AS "ID_CRM",
  mv.id_registro AS "ID_JOT",
  mv.etapa_crm AS "ETAPA",
  mv.fecha_creacion_crm AS "FECHA_CREACION",
  mv.asesor AS "ASESOR",
  mv.supervisor AS "SUPERVISOR",
  mv.origen AS "ORIGEN",
  mv.payload_created_at AS "FECHA_CREADO_JOT",
  mv.codigo_asesor AS "COD_ASESOR_JOT",
  mv.inicio_sesion_netlife AS "LOGIN",
  mv.estado_venta AS "ESTADO_NETLIFE",
  mv.observacion_telcos AS "OBSERVACION_TELCOS",
  mv.fecha_ingresa_telcos AS "INGRESO_TELCOS",
  mv.fecha_activacion AS "FECHA_ACTIVACION",
  mv.estado_regularizacion AS "ESTADO_REGULARIZACION",
  mv.detalle_regularizacion AS "OBSERV_REGULARIZACION",
  mv.plan_casa AS "PLAN_CASA",
  mv.plan_pyme AS "PLAN_PYME",
  mv.plan_profesional AS "PLAN_PROFESIONAL",
  mv.plan_hogar_adulto_mayor AS "PLAN_HOGAR_ADULTO_MAYOR",
  mv.plan_pyme_corp AS "PLAN_PYME_CORP",
  mv.plan_centro_red_comercial AS "PLAN_CENTRO_RED_COMERCIAL",
  mv.forma_pago AS "FORMA_PAGO",
  mv.aplica_descuento AS "APLICA_DESCUENTO",
  mv.fecha_agenda AS "FECHA_AGENDA",
  mv.observacion AS "OBSERVACION"
FROM public.mv_indicadores_velsa_completo mv
WHERE mv.fecha_registro_jotform IS NOT NULL
AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
${filters}
LIMIT 6000
    `;

    // ─────────────────────────────────────────────────────────────────────
    // PLANES POR CATEGORIA (Hogar / Pymes / Adulto Mayor) - ingresados vs activos
    // Mismo criterio que en Reporte180Velsa: Hogar=plan_casa | Pymes=plan_pyme+plan_pyme_corp
    // | Adulto Mayor=plan_hogar_adulto_mayor. Fecha base = ingresos_jot (fecha_registro_jotform - 5h).
    // ─────────────────────────────────────────────────────────────────────
    // PERF FIX (2026-06-23): la MV ya expone plan_casa/plan_pyme/plan_pyme_corp/
    // plan_hogar_adulto_mayor directamente (ver qNetlife). El JOIN_JF_VELSA_MV
    // (subquery sin filtro de fecha sobre toda vw_jotform_velsa_netlife_completo)
    // era innecesario aqui y sobrecargaba cada fetch del dashboard, causando
    // "Connection terminated unexpectedly" al filtrar rangos amplios.
    const qPlanesDash = `
      SELECT
        COUNT(*) FILTER (
          WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
          AND mv.plan_casa IS NOT NULL AND TRIM(mv.plan_casa::text) <> ''
        ) AS hogar_ingresados,
        COUNT(*) FILTER (
          WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
          AND mv.estado_venta = ${ESTADO_ACTIVO}
          AND mv.plan_casa IS NOT NULL AND TRIM(mv.plan_casa::text) <> ''
        ) AS hogar_activos,
        COUNT(*) FILTER (
          WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
          AND (
            (mv.plan_pyme IS NOT NULL AND TRIM(mv.plan_pyme::text) <> '') OR
            (mv.plan_pyme_corp IS NOT NULL AND TRIM(mv.plan_pyme_corp::text) <> '')
          )
        ) AS pymes_ingresados,
        COUNT(*) FILTER (
          WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
          AND mv.estado_venta = ${ESTADO_ACTIVO}
          AND (
            (mv.plan_pyme IS NOT NULL AND TRIM(mv.plan_pyme::text) <> '') OR
            (mv.plan_pyme_corp IS NOT NULL AND TRIM(mv.plan_pyme_corp::text) <> '')
          )
        ) AS pymes_activos,
        COUNT(*) FILTER (
          WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
          AND mv.plan_hogar_adulto_mayor IS NOT NULL AND TRIM(mv.plan_hogar_adulto_mayor::text) <> ''
        ) AS adulto_mayor_ingresados,
        COUNT(*) FILTER (
          WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
          AND mv.estado_venta = ${ESTADO_ACTIVO}
          AND mv.plan_hogar_adulto_mayor IS NOT NULL AND TRIM(mv.plan_hogar_adulto_mayor::text) <> ''
        ) AS adulto_mayor_activos
      FROM ${MV}
      WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date ${filters}
    `;

    const [
      resSup, resAses, resBkSup, resBkAses,
      resEstados, resEmbudo, resDia,
      resEtapasCRM, resEtapasJot, resTercera, resTarjeta,
      resNetlife, resActivacionesDia, resPlanesDash,
    ] = await Promise.all([
      pool.query(queryKPI('mv.supervisor', filters), valuesMain),
      pool.query(queryKPI('mv.asesor',     filters), valuesMain),
      pool.query(queryBacklog('mv.supervisor', filtersBk), valuesBk),
      pool.query(queryBacklog('mv.asesor',     filtersBk), valuesBk),
      pool.query(qEstados,   valuesMain),
      pool.query(qEmbudo,    valuesMain),
      pool.query(qPorDia,    valuesMain),
      pool.query(qEtapasCRM),
      pool.query(qEtapasJot),
      pool.query(qTercera,   valuesMain),
      pool.query(qTarjeta,   valuesMain),
      pool.query(qNetlife,   valuesMain),
      pool.query(qActivacionesPorDia, valuesMain), // NUEVO: activaciones por fecha_activacion_date
      pool.query(qPlanesDash, valuesMain),
    ]);

    const supervisores = mergeBacklog(resSup.rows,  resBkSup.rows);
    const asesores     = mergeBacklog(resAses.rows, resBkAses.rows);

    const tRow = resTercera.rows[0] || {};
    const porcentajeTerceraEdad = Number(tRow.total_activos) > 0
      ? parseFloat(((Number(tRow.total_tercera) / Number(tRow.total_activos)) * 100).toFixed(2)) : 0;

    const taRow = resTarjeta.rows[0] || {};
    const porcentajeTarjeta = Number(taRow.total_jotform) > 0
      ? parseFloat(((Number(taRow.total_tarjeta) / Number(taRow.total_jotform)) * 100).toFixed(2)) : 0;

    console.log(`[DASHBOARD-VELSA] ${desde}~${hasta} | Sup:${supervisores.length} Ases:${asesores.length}`);

    res.json({
      success: true,
      supervisores,
      asesores,
      dataNetlife:           resNetlife.rows,
      estadosNetlife:        resEstados.rows.map(r => ({ estado: r.estado, total: Number(r.total) })),
      graficoEmbudo:         resEmbudo.rows,
      graficoBarrasDia:      resDia.rows,
      graficoActivacionesDia: resActivacionesDia.rows, // NUEVO: activaciones por fecha_activacion_date
      etapasCRM:             resEtapasCRM.rows.map(r => r.etapa),
      etapasJotform:         resEtapasJot.rows.map(r => r.estado_venta),
      porcentajeTerceraEdad,
      porcentajeTarjeta,
      planesPorCategoria: (() => {
        const p = resPlanesDash.rows[0] || {};
        return {
          hogar:        { ingresados: Number(p.hogar_ingresados || 0),        activos: Number(p.hogar_activos || 0) },
          pymes:        { ingresados: Number(p.pymes_ingresados || 0),        activos: Number(p.pymes_activos || 0) },
          adulto_mayor: { ingresados: Number(p.adulto_mayor_ingresados || 0), activos: Number(p.adulto_mayor_activos || 0) },
        };
      })(),
    });
  } catch (error) {
    console.error('[DASHBOARD-VELSA] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MONITOREO DIARIO
// ─────────────────────────────────────────────────────────────────────────────
async function getMonitoreoDiarioVelsa(req, res) {
  try {
    const hoy       = getFechaEcuador();
    const iniciomes = getPrimerDiaMesEcuador();

    const qMon = (columna) => `
      SELECT
        COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
        COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date) AS real_mes_leads,
        COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date = $2::date AND ${esGestionableExpr('mv.etapa_crm')}) AS real_dia_leads,
        COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date) AS crm_acumulado,
        COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date = $2::date) AS crm_dia,
        COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date = $2::date AND UPPER(mv.etapa_crm) = 'VENTA SUBIDA') AS v_subida_crm_hoy,
        COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date AND ${esGestionableExpr('mv.etapa_crm')}) AS gestionables
      FROM ${MV}
      WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
      GROUP BY 1 ORDER BY real_mes_leads DESC
    `;
    const qJotHoy = (columna) => `
      SELECT
        COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
        COUNT(*)::int AS v_subida_jot_hoy,
        COUNT(*) FILTER (WHERE mv.estado_venta = ${ESTADO_ACTIVO})::int AS activos_jot_hoy,
        COUNT(*) FILTER (WHERE ${VENTA_SERVICIO_VELSA_MV})::int AS venta_servicio_jot_hoy
      FROM ${MV}
      ${JOIN_JF_VELSA_MV}
      WHERE mv.fecha_registro_jotform IS NOT NULL
        AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date = $1::date
      GROUP BY 1
    `;

    const [resSup, resAses, resJotSup, resJotAses] = await Promise.all([
      pool.query(qMon('mv.supervisor'),    [iniciomes, hoy]),
      pool.query(qMon('mv.asesor'),        [iniciomes, hoy]),
      pool.query(qJotHoy('mv.supervisor'), [hoy]),
      pool.query(qJotHoy('mv.asesor'),     [hoy]),
    ]);

    const merge = (filas, jot) => filas.map(r => {
      const j = jot.find(x => x.nombre_grupo === r.nombre_grupo) || {};
      return {
        ...r,
        v_subida_jot_hoy: Number(j.v_subida_jot_hoy||0),
        activos_jot_hoy: Number(j.activos_jot_hoy||0),
        venta_servicio_jot_hoy: Number(j.venta_servicio_jot_hoy||0),
      };
    });

    res.json({ success: true, supervisores: merge(resSup.rows, resJotSup.rows), asesores: merge(resAses.rows, resJotAses.rows) });
  } catch (error) {
    console.error('[MONITOREO-VELSA] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTE 180
// ─────────────────────────────────────────────────────────────────────────────
async function getReporte180Velsa(req, res) {
  try {
    const hoy   = getFechaEcuador();
    const desde = req.query.fechaDesde || hoy;
    const hasta = req.query.fechaHasta || hoy;
    const values  = [desde, hasta];
    const filters = buildFilters(req.query, values);

    const qKPIs = `
      SELECT
        COUNT(*) FILTER (WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date) AS ingresos_jot,
        COUNT(*) FILTER (WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date AND mv.estado_venta = ${ESTADO_ACTIVO}) AS ventas_activas,
        COUNT(*) FILTER (WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date AND ${VENTA_SERVICIO_VELSA_MV}) AS ventas_servicio,
        ROUND(COALESCE(
          COUNT(*) FILTER (WHERE ${esDescarteExpr('mv.etapa_crm')} AND mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE ((mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date OR mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date) AND ${esGestionableExpr('mv.etapa_crm')}),0)
        ,0)*100,2) AS pct_descarte,
        ROUND(COALESCE(
          COUNT(*) FILTER (WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE ((mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date OR mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date) AND ${esGestionableExpr('mv.etapa_crm')}),0)
        ,0)*100,2) AS pct_efectividad,
        ROUND(COALESCE(
          COUNT(*) FILTER (WHERE mv.aplica_descuento ILIKE '%TERCERA EDAD%' AND mv.estado_venta = ${ESTADO_ACTIVO} AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE mv.estado_venta = ${ESTADO_ACTIVO} AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date),0)
        ,0)*100,2) AS pct_tercera_edad
      FROM ${MV}
      ${JOIN_JF_VELSA_MV}
      WHERE (mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date OR (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date) ${filters}
    `;
    const qEmbudoCRM = `
      SELECT COALESCE(mv.etapa_crm,'SIN ETAPA') AS etapa, COUNT(*)::int AS total
      FROM ${MV} WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date ${filters}
      GROUP BY mv.etapa_crm ORDER BY total DESC
    `;
    const qEmbudoJot = `
      SELECT COALESCE(mv.estado_venta,'SIN ESTADO') AS etapa, COUNT(*)::int AS total
      FROM ${MV} WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date ${filters}
      GROUP BY mv.estado_venta ORDER BY total DESC
    `;

    // ─────────────────────────────────────────────────────────────────────
    // PLANES POR CATEGORIA (Hogar / Pymes / Adulto Mayor) - ingresados vs activos
    // Hogar = plan_casa | Pymes = plan_pyme + plan_pyme_corp | Adulto Mayor = plan_hogar_adulto_mayor
    // Usa la misma columna de fecha que "ingresos_jot" (fecha_registro_jotform - 5h)
    // y la misma definicion de "activo" que VENTA_SERVICIO_VELSA_MV (estado_venta ACTIVO).
    // ─────────────────────────────────────────────────────────────────────
    // PERF FIX (2026-06-23): igual que en el dashboard, la MV ya expone las
    // columnas plan_* directamente; se quita JOIN_JF_VELSA_MV (subquery sin
    // filtro de fecha) que sobrecargaba el pool de conexiones.
    const qPlanes = `
      SELECT
        COUNT(*) FILTER (
          WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
          AND mv.plan_casa IS NOT NULL AND TRIM(mv.plan_casa::text) <> ''
        ) AS hogar_ingresados,
        COUNT(*) FILTER (
          WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
          AND mv.estado_venta = ${ESTADO_ACTIVO}
          AND mv.plan_casa IS NOT NULL AND TRIM(mv.plan_casa::text) <> ''
        ) AS hogar_activos,
        COUNT(*) FILTER (
          WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
          AND (
            (mv.plan_pyme IS NOT NULL AND TRIM(mv.plan_pyme::text) <> '') OR
            (mv.plan_pyme_corp IS NOT NULL AND TRIM(mv.plan_pyme_corp::text) <> '')
          )
        ) AS pymes_ingresados,
        COUNT(*) FILTER (
          WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
          AND mv.estado_venta = ${ESTADO_ACTIVO}
          AND (
            (mv.plan_pyme IS NOT NULL AND TRIM(mv.plan_pyme::text) <> '') OR
            (mv.plan_pyme_corp IS NOT NULL AND TRIM(mv.plan_pyme_corp::text) <> '')
          )
        ) AS pymes_activos,
        COUNT(*) FILTER (
          WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
          AND mv.plan_hogar_adulto_mayor IS NOT NULL AND TRIM(mv.plan_hogar_adulto_mayor::text) <> ''
        ) AS adulto_mayor_ingresados,
        COUNT(*) FILTER (
          WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
          AND mv.estado_venta = ${ESTADO_ACTIVO}
          AND mv.plan_hogar_adulto_mayor IS NOT NULL AND TRIM(mv.plan_hogar_adulto_mayor::text) <> ''
        ) AS adulto_mayor_activos
      FROM ${MV}
      WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date ${filters}
    `;

    const [resKPIs, resEmbCRM, resEmbJot, resPlanes] = await Promise.all([
      pool.query(qKPIs,      values),
      pool.query(qEmbudoCRM, values),
      pool.query(qEmbudoJot, values),
      pool.query(qPlanes,    values),
    ]);

    const k = resKPIs.rows[0] || {};
    res.json({
      success: true,
      kpis: {
        ingresos_jot:     Number(k.ingresos_jot     || 0),
        ventas_activas:   Number(k.ventas_activas   || 0),
        ventas_servicio:  Number(k.ventas_servicio  || 0),
        pct_descarte:     Number(k.pct_descarte     || 0),
        pct_efectividad:  Number(k.pct_efectividad  || 0),
        pct_tercera_edad: Number(k.pct_tercera_edad || 0),
      },
      embudoCRM:     resEmbCRM.rows,
      embudoJotform: resEmbJot.rows,
      mapaCalor:     [],
      planesPorCategoria: (() => {
        const p = resPlanes.rows[0] || {};
        return {
          hogar:        { ingresados: Number(p.hogar_ingresados || 0),        activos: Number(p.hogar_activos || 0) },
          pymes:        { ingresados: Number(p.pymes_ingresados || 0),        activos: Number(p.pymes_activos || 0) },
          adulto_mayor: { ingresados: Number(p.adulto_mayor_ingresados || 0), activos: Number(p.adulto_mayor_activos || 0) },
        };
      })(),
    });
  } catch (error) {
    console.error('[REPORTE180-VELSA] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTA / DESCARGA
// ─────────────────────────────────────────────────────────────────────────────
async function getConsultaDescargaVelsa(req, res) {
  try {
    const hoy   = getFechaEcuador();
    const desde = req.query.fechaDesde || hoy;
    const hasta = req.query.fechaHasta || hoy;
    const values  = [desde, hasta];
    const filters = buildFilters(req.query, values);

    const result = await pool.query(`
      SELECT
        mv.id_crm, mv.id_jotform, mv.asesor, mv.supervisor,
        mv.etapa_crm, mv.estado_venta, mv.estado_regularizacion,
        mv.fecha_creacion_crm, mv.fecha_registro_jotform, mv.fecha_activacion,
        mv.forma_pago, mv.aplica_descuento, mv.ciudad, mv.origen,
        jf2.plan_casa, jf2.plan_pyme, jf2.plan_profesional,
        jf2.plan_hogar_adulto_mayor, jf2.plan_pyme_corp, jf2.plan_centro_red_comercial,
        ${VENTA_SERVICIO_VELSA_MV} AS es_venta_servicio
      FROM ${MV}
      ${JOIN_JF_VELSA_MV}
      WHERE (mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
          OR (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date)
      ${filters}
      ORDER BY mv.fecha_creacion_crm DESC LIMIT 10000
    `, values);

    res.json({ success: true, registros: result.rows, total: result.rowCount });
  } catch (error) {
    console.error('[CONSULTA-VELSA] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS MV
// ─────────────────────────────────────────────────────────────────────────────
async function getStatusMaterializedView(req, res) {
  try {
    const result = await pool.query(`
      SELECT schemaname, matviewname, ispopulated,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) AS size
      FROM pg_matviews WHERE matviewname = 'mv_indicadores_velsa_completo'
    `);
    const total = await pool.query(`SELECT COUNT(*) AS total FROM public.mv_indicadores_velsa_completo`);
    res.json({ success: true, status: result.rows[0] || {}, totalRegistros: Number(total.rows[0]?.total || 0) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DETALLE CRM
// ─────────────────────────────────────────────────────────────────────────────
async function getDetalleCRMData(req, res) {
  try {
    const hoy   = getFechaEcuador();
    const desde = req.query.fechaDesde || hoy;
    const hasta = req.query.fechaHasta || hoy;
    const values  = [desde, hasta];
    const filters = buildFilters(req.query, values);

    const result = await pool.query(`
      SELECT
        mv.id_crm AS "ID_CRM", mv.etapa_crm AS "ETAPA_CRM",
        mv.fecha_creacion_crm AS "FECHA_CREACION_CRM",
        mv.asesor AS "ASESOR", mv.supervisor AS "SUPERVISOR_ASIGNADO",
        mv.fecha_modificacion_crm AS "FECHA_MODIFICACION", mv.origen AS "ORIGEN"
      FROM ${MV}
      WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date ${filters}
      ORDER BY mv.fecha_creacion_crm DESC LIMIT 6000
    `, values);

    console.log(`[DETALLE-CRM-VELSA] ${desde}~${hasta} | ${result.rowCount} registros`);
    res.json({ success: true, registros: result.rows, total: result.rowCount });
  } catch (error) {
    console.error('[DETALLE-CRM-VELSA] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVAS
// ─────────────────────────────────────────────────────────────────────────────
async function getActivasVelsa(req, res) {
  try {
    const hoy   = getFechaEcuador();
    const desde = req.query.fechaDesde || hoy;
    const hasta = req.query.fechaHasta || hoy;
    const values  = [desde, hasta];
    const filters = buildFilters(req.query, values);

    const result = await pool.query(`
      SELECT
        COALESCE(mv.supervisor,'SIN ASIGNAR') AS supervisor,
        COALESCE(mv.asesor,'SIN ASIGNAR') AS asesor,
        COUNT(*) FILTER (WHERE mv.estado_venta = ${ESTADO_ACTIVO})::int AS activas,
        COUNT(*) FILTER (WHERE ${VENTA_SERVICIO_VELSA_MV})::int AS venta_servicio,
        COUNT(*)::int AS total_jotform
      FROM ${MV}
      ${JOIN_JF_VELSA_MV}
      WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date ${filters}
      GROUP BY 1,2 ORDER BY activas DESC
    `, values);

    res.json({ success: true, registros: result.rows });
  } catch (error) {
    console.error('[ACTIVAS-VELSA] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKLOG
// ─────────────────────────────────────────────────────────────────────────────
async function getBacklogVelsa(req, res) {
  try {
    const hoy    = getFechaEcuador();
    const values = [req.query.fechaDesde || hoy];
    const filters = buildFilters(req.query, values);

    const result = await pool.query(`
      SELECT
        COALESCE(mv.supervisor,'SIN ASIGNAR') AS supervisor,
        COALESCE(mv.asesor,'SIN ASIGNAR') AS asesor,
        COUNT(DISTINCT mv.id_jotform)::int AS backlog
      FROM ${MV}
      WHERE mv.id_jotform IS NOT NULL
        AND mv.fecha_registro_jotform IS NOT NULL
        AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date < $1::date
        AND mv.estado_venta = ${ESTADO_ACTIVO}
        ${filters}
      GROUP BY 1,2 ORDER BY backlog DESC
    `, values);

    res.json({ success: true, registros: result.rows });
  } catch (error) {
    console.error('[BACKLOG-VELSA] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVACIONES POR DÍA (endpoint independiente — solo usa fecha_activacion_date)
// No modifica ningún KPI ni cálculo existente del dashboard.
// ─────────────────────────────────────────────────────────────────────────────
async function getActivacionesPorDiaVelsa(req, res) {
  try {
    const hoy   = getFechaEcuador();
    const desde = req.query.fechaDesde || hoy;
    const hasta = req.query.fechaHasta || hoy;
    const values = [desde, hasta];

    let filters = '';
    if (req.query.asesor)      { values.push(`%${req.query.asesor}%`);      filters += ` AND mv.asesor ILIKE $${values.length}`; }
    if (req.query.supervisor)  { values.push(`%${req.query.supervisor}%`);  filters += ` AND mv.supervisor ILIKE $${values.length}`; }
    if (req.query.estadoVenta) { values.push(`%${req.query.estadoVenta}%`); filters += ` AND mv.estado_venta ILIKE $${values.length}`; }

    const result = await pool.query(`
      SELECT
        mv.fecha_activacion_date::date::text AS fecha,
        COUNT(*)::int AS activaciones
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.fecha_activacion_date IS NOT NULL
        AND mv.fecha_activacion_date::date BETWEEN $1::date AND $2::date
        ${filters}
      GROUP BY mv.fecha_activacion_date::date
      ORDER BY mv.fecha_activacion_date::date ASC
    `, values);

    res.json({ success: true, rows: result.rows });
  } catch (error) {
    console.error('[ACTIVACIONES-DIA-VELSA]', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  getIndicadoresDashboardVelsa,
  getMonitoreoDiarioVelsa,
  getReporte180Velsa,
  getConsultaDescargaVelsa,
  getStatusMaterializedView,
  getDetalleCRMData,
  getActivasVelsa,
  getBacklogVelsa,
  getActivacionesPorDiaVelsa,
};
