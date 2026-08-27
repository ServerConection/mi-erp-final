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
    esDescarteExactoExpr,
    descarteIndicadoresExpr,
    ETAPAS_NO_GESTIONABLES,

    esPorRegularizarExpr
} = require('../shared/etapas');

const getFechaEcuador = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

const getPrimerDiaMesEcuador = () => {
  const f = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guayaquil' }));
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-01`;
};

const MV = `public.mv_indicadores_velsa_completo mv`;
const ESTADO_ACTIVO = `'ACTIVO'`;

// ─────────────────────────────────────────────────────────────────────────────
// CACHÉ EN MEMORIA ALINEADO AL CICLO DE 10 MINUTOS
// La data llega por lotes (sync Bitrix/GHL/JotForm) y solo cambia en cada
// "corte" de ~10 min. Cachear por ventana evita re-ejecutar las consultas
// pesadas contra la MV en cada clic/filtro (antes Velsa NO tenía caché y pegaba
// a la MV en cada request). Todo el caché expira junto en el próximo corte, así
// que nunca se sirve data de un ciclo viejo.
// ─────────────────────────────────────────────────────────────────────────────
const _cacheVelsa = new Map();

// ms hasta el próximo corte de datos: minutos terminados en 1 (:01,:11,:21,...)
const msHastaProximoCorte = () => {
  const now = new Date();
  const cut = new Date(now);
  cut.setSeconds(0, 0);
  do { cut.setMinutes(cut.getMinutes() + 1); } while (cut.getMinutes() % 10 !== 1);
  return cut.getTime() - now.getTime();
};

const getCacheVelsa = (key) => {
  const entry = _cacheVelsa.get(key);
  if (entry && Date.now() < entry.ttl) return entry.data;
  if (entry) _cacheVelsa.delete(key);
  return null;
};
const setCacheVelsa = (key, data) => {
  _cacheVelsa.set(key, { data, ttl: Date.now() + msHastaProximoCorte() });
  if (_cacheVelsa.size > 200) {
    const ahora = Date.now();
    for (const [k, v] of _cacheVelsa) if (ahora > v.ttl) _cacheVelsa.delete(k);
  }
};
const clearCacheVelsa = () => { const n = _cacheVelsa.size; _cacheVelsa.clear(); return n; };

// ─────────────────────────────────────────────────────────────────────────────
// VENTA DE SERVICIO / PLANES
// ─────────────────────────────────────────────────────────────────────────────
// FIX (2026-08-17) — LOS PLANES SALÍAN SIEMPRE EN 0.
// Antes esto era un LEFT JOIN a vw_jotform_velsa_netlife_completo con la
// condición:  mv.id_jotform = jf2.id_negociacion_bitrix
// Ese ON estaba mal por DOS motivos independientes:
//   1) id_negociacion_bitrix está 100% NULL en la vista Velsa (la llave real
//      hacia Bitrix es id_bitrix_ghl), así que el JOIN nunca casaba: TODAS las
//      columnas jf2.plan_* quedaban NULL.
//   2) mv.id_jotform es el id de la FILA de Jotform (jf.id), no un id de
//      Bitrix, con lo que ni con la llave correcta habría casado.
// Resultado: HAS_PLAN_VELSA_MV era siempre falso → venta_servicio = 0 y las
// tarjetas/tabla de planes (400 - 2000 Mbps) salían vacías.
//
// La MV mv_indicadores_velsa_completo YA trae las columnas plan_* propagadas
// desde Jotform (ver VELSA_MV_WEBHOOK_V2.sql, líneas jf.plan_casa, jf.plan_pyme,
// …), así que no hace falta ningún JOIN: se leen directo de mv. Eso además
// elimina una subquery sobre la vista completa en cada request del dashboard.
const JOIN_JF_VELSA_MV = ``;

const HAS_PLAN_VELSA_MV = `(
    (mv.plan_casa IS NOT NULL AND TRIM(mv.plan_casa::text) <> '') OR
    (mv.plan_pyme IS NOT NULL AND TRIM(mv.plan_pyme::text) <> '') OR
    (mv.plan_profesional IS NOT NULL AND TRIM(mv.plan_profesional::text) <> '') OR
    (mv.plan_hogar_adulto_mayor IS NOT NULL AND TRIM(mv.plan_hogar_adulto_mayor::text) <> '') OR
    (mv.plan_pyme_corp IS NOT NULL AND TRIM(mv.plan_pyme_corp::text) <> '') OR
    (mv.plan_centro_red_comercial IS NOT NULL AND TRIM(mv.plan_centro_red_comercial::text) <> '')
)`;
const VENTA_SERVICIO_VELSA_MV = `(UPPER(TRIM(mv.estado_venta)) = 'ACTIVO' AND ${HAS_PLAN_VELSA_MV})`;


// ── Normalización de nombre de asesor/supervisor (FIX 2026-08-27) ──────────
// Bitrix no usa catálogo de empleados: mv.asesor/mv.supervisor llegan como
// texto libre. Dos problemas detectados en pantalla real:
//   1) Variantes de espacios/caracteres invisibles ("Alexandra Pacheco"
//      aparecía 3 veces en el dropdown de asesor siendo la misma persona).
//   2) Nombre corto vs nombre legal completo ("Karina Torres" vs
//      "KARINA MARICELA TORRES AMAGUANA", "Rossanna Alvarado" vs
//      "ROSSANNA MARIBEL ALVARADO CRUZ", "Damian Viera" vs
//      "DAMIAN ARIEL VIERA JACOME") — mismo asesor, dos filas en el
//      desglose, métricas partidas y no confiables.
// Colapsa espacios y mapea los alias confirmados a un nombre canónico único.
// Agregar aquí nuevos pares apenas se detecten (agregar el WHEN en MAYÚSCULAS).
function normalizarAsesorSQL(campo) {
  const limpio = `REGEXP_REPLACE(BTRIM(REPLACE(REPLACE(REPLACE(${campo}::text, CHR(160), ' '), CHR(8203), ''), CHR(65279), '')), '\\s+', ' ', 'g')`;
  return `
    CASE UPPER(${limpio})
      WHEN 'KARINA TORRES' THEN 'Karina Torres'
      WHEN 'KARINA MARICELA TORRES AMAGUANA' THEN 'Karina Torres'
      WHEN 'ROSSANNA ALVARADO' THEN 'Rossanna Alvarado'
      WHEN 'ROSSANNA MARIBEL ALVARADO CRUZ' THEN 'Rossanna Alvarado'
      WHEN 'DAMIAN VIERA' THEN 'Damian Viera'
      WHEN 'DAMIAN ARIEL VIERA JACOME' THEN 'Damian Viera'
      ELSE ${limpio}
    END`;
}

// ── Filtros dinámicos ─────────────────────────────────────────────────────────
function buildFilters(q, values) {
  let f = '';
  const { asesor, supervisor, estadoNetlife, estadoRegularizacion, etapaCRM, etapaJotform, idBitrix, gestionables, fechaActivacionDesde, fechaActivacionHasta, origen } = q;
  // Match EXACTO (case-insensitive) para asesor. Antes usaba ILIKE '%valor%'
  // (coincidencia PARCIAL): al seleccionar un asesor, también podían aparecer
  // registros de OTRO asesor cuyo nombre compartiera una porción de texto con
  // el seleccionado, mezclando datos entre asesores. Mismo fix aplicado en
  // indicadores.controller.js (dashboard NOVONET).
  if (asesor)               { values.push(asesor);                     f += ` AND (${normalizarAsesorSQL('mv.asesor')}) = $${values.length}`; }
  if (supervisor)           { values.push(`%${supervisor}%`);           f += ` AND mv.supervisor ILIKE $${values.length}`; }
  if (estadoNetlife)        { values.push(`%${estadoNetlife}%`);        f += ` AND mv.estado_venta ILIKE $${values.length}`; }
  if (estadoRegularizacion) { values.push(`%${estadoRegularizacion}%`); f += ` AND mv.estado_regularizacion ILIKE $${values.length}`; }
  if (etapaCRM)             { values.push(`%${etapaCRM}%`);             f += ` AND mv.etapa_crm ILIKE $${values.length}`; }
  if (etapaJotform)         { values.push(`%${etapaJotform}%`);         f += ` AND mv.estado_venta ILIKE $${values.length}`; }
  if (idBitrix)             { values.push(idBitrix.toString());         f += ` AND (mv.id_crm::text = $${values.length} OR mv.id_jotform::text = $${values.length})`; }
  // ORIGEN (2026-08-18) — Velsa no tenia este filtro y Novonet si.
  // Match EXACTO case-insensitive: los origenes vienen de un catalogo cerrado
  // (mv.origen = bitrix_webhook_leads.source), no de texto libre. Con ILIKE
  // parcial, elegir "Whatsapp 1" tambien traia "Whatsapp 1 - 987001032".
  // Acepta varios separados por coma, igual que el multi-select del front.
  if (origen) {
    const lista = String(origen).split(',').map(v => v.trim()).filter(Boolean);
    if (lista.length) {
      const ph = lista.map(v => { values.push(v); return `UPPER(TRIM($${values.length}))`; }).join(', ');
      f += ` AND UPPER(TRIM(COALESCE(mv.origen, ''))) IN (${ph})`;
    }
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// EXPRESIONES DE FECHA — alineadas con indicadores.controller.js (NOVONET)
// ─────────────────────────────────────────────────────────────────────────────
// La MV guarda fecha_registro_jotform en UTC; NOVONET ya la recibe en hora
// local. El -5h la normaliza a America/Guayaquil para que las dos empresas
// corten el día en el mismo instante.
const JF_DATE  = `(mv.fecha_registro_jotform - INTERVAL '5 hours')::date`;
const CRM_DATE = `mv.fecha_creacion_crm::date`;

// (2026-08-19) Se eliminó GEST_AMPLIO — el denominador "gestionables" en
// ventana AMPLIA (registro Jotform O creación CRM) que usaban descarte /
// efectividad_real / efectividad_activas_vs_pauta. Daba un número distinto
// al de la columna "gestionables" (esa siempre usó solo fecha de creación
// CRM, igual que las tarjetas). Pedido explícito: las tablas deben medir
// igual que las tarjetas. Unificado al denominador angosto (solo CRM_DATE)
// en las 3 fórmulas de abajo. Ver REVISION_VELSA_VS_NOVONET.md sección 4a
// para el detalle de dónde salió la inconsistencia. NOVONET no se toca.

// ── Query KPI por columna de agrupación ──────────────────────────────────────
// ESTRUCTURA ESPEJO DE NOVONET (indicadores.controller.js · queryKPI).
// Cada indicador de abajo calcula EXACTAMENTE lo mismo que su equivalente
// Novonet; lo único que cambia son las tablas de origen.
const queryKPI = (columna, filters) => {
  // FIX (2026-08-18) — mismo bug que Novonet tenía antes de su fix: si el
  // mismo asesor/supervisor llega con espacios extra en mv.asesor/mv.supervisor
  // (ej. "OSCAR SANGUCHO SASIG " vs "OSCAR SANGUCHO SASIG"), el GROUP BY los
  // trata como dos grupos distintos → una tarjeta "fantasma" casi vacía en el
  // ranking. BTRIM + NULLIF normaliza antes de agrupar (ver indicadores.controller.js,
  // queryKPI, NOVONET).
  // También se agrega sup_nombre cuando se agrupa por asesor: antes esta query
  // no devolvía el supervisor del asesor en NINGÚN caso, así que el frontend
  // (VistaAsesorVelsa.jsx, AsesorCard) siempre mostraba "Sin supervisor" —
  // leía row.supervisor, un campo que esta consulta nunca generó.
  const esSupervisor = columna === 'mv.supervisor';
  const extraSelect  = esSupervisor ? '' : `, COALESCE(NULLIF(${normalizarAsesorSQL('mv.supervisor')}, ''), 'SIN ASIGNAR') AS sup_nombre`;
  const extraGroup   = esSupervisor ? '' : ', 2';
  return `
  SELECT
    COALESCE(NULLIF(${normalizarAsesorSQL(columna)}, ''), 'SIN ASIGNAR') AS nombre_grupo
    ${extraSelect},
    -- ── LEADS TOTALES ────────────────────────────────────────────────────
    -- COUNT(DISTINCT id del lado CRM) + excluye las etapas DUPLICADO /
    -- REMARKETING / REGULARIZACION. NO se filtra por ORIGEN: leads totales
    -- trae TODO lo que entra; los filtros de origen se aplican en el D-1.
    -- COUNT(DISTINCT mv.id_crm) y NO COUNT(*): la MV hace FULL OUTER JOIN
    -- contra vw_jotform_velsa_netlife_completo, que tiene VARIAS filas por
    -- negociación cuando el cliente contrató más de un servicio. Con COUNT(*)
    -- ese lead se contaba 2, 3 o 5 veces. Novonet ya usaba COUNT(DISTINCT b_id)
    -- por exactamente este motivo.
    COUNT(DISTINCT mv.id_crm) FILTER (
      WHERE ${CRM_DATE} BETWEEN $1::date AND $2::date
      AND ${esLeadTotalExpr('mv.etapa_crm')}
    ) AS leads_totales,
    -- ── GESTIONABLES ─────────────────────────────────────────────────────
    -- Misma base de fecha que leads_totales para que sea siempre un
    -- subconjunto suyo (idéntico a Novonet).
    COUNT(DISTINCT mv.id_crm) FILTER (
      WHERE ${CRM_DATE} BETWEEN $1::date AND $2::date
      AND ${esGestionableExpr('mv.etapa_crm')}
    ) AS gestionables,
    COUNT(DISTINCT mv.id_crm) FILTER (
      WHERE UPPER(TRIM(mv.etapa_crm)) = 'VENTA SUBIDA'
      AND ${CRM_DATE} BETWEEN $1::date AND $2::date
    ) AS ventas_crm,
    -- ── VENTAS DEL DÍA ───────────────────────────────────────────────────
    -- Criterio NOVONET: lead en VENTA SUBIDA cuya fecha de creación en el CRM
    -- coincide con la fecha de registro en Jotform.
    -- Antes Velsa comparaba fecha_creacion_crm = fecha_modificacion_crm, que es
    -- otra cosa (mide leads que no se volvieron a tocar, no ventas del día).
    COUNT(DISTINCT mv.id_crm) FILTER (
      WHERE UPPER(TRIM(mv.etapa_crm)) = 'VENTA SUBIDA'
      AND ${JF_DATE} BETWEEN $1::date AND $2::date
      AND ${CRM_DATE} = ${JF_DATE}
    ) AS ventas_del_dia,
    COUNT(*) FILTER (WHERE ${JF_DATE} BETWEEN $1::date AND $2::date) AS ingresos_reales,
    COUNT(*) FILTER (
      WHERE ${JF_DATE} BETWEEN $1::date AND $2::date
      AND ${CRM_DATE} = ${JF_DATE}
    ) AS ingresos_del_dia,
    -- POR REGULARIZAR (existe en Novonet, faltaba en Velsa)
    COUNT(*) FILTER (
      WHERE ${JF_DATE} BETWEEN $1::date AND $2::date
      AND ${esPorRegularizarExpr('mv.estado_regularizacion')}
    ) AS por_regularizar,
    -- ACTIVAS por FECHA DE REGISTRO JOTFORM (equivalente a "activas" de Novonet;
    -- distinto de real_mes, que va por fecha de activación).
    COUNT(*) FILTER (
      WHERE ${JF_DATE} BETWEEN $1::date AND $2::date
      AND mv.estado_venta = ${ESTADO_ACTIVO}
    ) AS activas,
    COUNT(*) FILTER (
      WHERE ${JF_DATE} BETWEEN $1::date AND $2::date
      AND mv.estado_venta = ${ESTADO_ACTIVO}
    ) AS total_activas_calculada,
    -- ── ACTIVAS (definición de gerencia, 2026-08, ajustada 2026-08-13) ────
    -- real_mes   = ACTIVAS TOTALES: todo lo activado en el rango
    -- activa_mes = de esas, las que ADEMÁS se REGISTRARON EN JOTFORM dentro
    --              del mismo rango (antes comparaba con fecha_creacion_crm,
    --              no con fecha_registro_jotform — desalineaba el cálculo).
    -- backlog    = TOTALES − MES = activadas en el rango pero registradas en
    --              Jotform en un mes ANTERIOR (se deriva, ya no se consulta aparte).
    COUNT(*) FILTER (
      WHERE mv.fecha_activacion IS NOT NULL
      AND mv.fecha_activacion::date BETWEEN $1::date AND $2::date
      AND mv.estado_venta = ${ESTADO_ACTIVO}
    ) AS real_mes,
    COUNT(*) FILTER (
      WHERE mv.fecha_activacion IS NOT NULL
      AND mv.fecha_activacion::date BETWEEN $1::date AND $2::date
      AND mv.estado_venta = ${ESTADO_ACTIVO}
      AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
    ) AS activa_mes,
    COUNT(*) FILTER (
      WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
      AND ${VENTA_SERVICIO_VELSA_MV}
    ) AS venta_servicio,
    COUNT(DISTINCT mv.id_crm) FILTER (
      WHERE ${esDescarteExactoExpr('mv.etapa_crm')}
      AND ${CRM_DATE} BETWEEN $1::date AND $2::date
    ) AS descarte_count,
    COUNT(*) FILTER (
      WHERE mv.forma_pago ILIKE '%TARJETA DE CREDITO%'
      AND ${JF_DATE} BETWEEN $1::date AND $2::date
    ) AS tarjeta_credito,
    COUNT(*) FILTER (
      WHERE mv.aplica_descuento ILIKE '%TERCERA EDAD%'
      AND mv.estado_venta = ${ESTADO_ACTIVO}
      AND ${JF_DATE} BETWEEN $1::date AND $2::date
    ) AS tercera_edad,
    -- REGULARIZACION: criterio NOVONET — excluye los estados que no aplican.
    -- Antes Velsa contaba cualquier '%REGULARIZAR%' sin excluirlos.
    COUNT(*) FILTER (
      WHERE ${JF_DATE} BETWEEN $1::date AND $2::date
      AND UPPER(TRIM(mv.estado_venta)) NOT IN ('FUERA DE COBERTURA','DESISTE DEL SERVICIO','RECHAZADO')
      AND ${esPorRegularizarExpr('mv.estado_regularizacion')}
    ) AS regularizacion,

    -- ── PORCENTAJES ──────────────────────────────────────────────────────
    -- Se calculan en SQL con las MISMAS fórmulas que Novonet. Antes se
    -- calculaban en JS (mergeBacklog) con denominadores distintos, y por eso
    -- los % de Velsa nunca cuadraban con los de Novonet.
    ROUND( COALESCE(
      COUNT(*) FILTER (WHERE ${JF_DATE} BETWEEN $1::date AND $2::date)::numeric
      / NULLIF(COUNT(DISTINCT mv.id_crm) FILTER (
          WHERE ${CRM_DATE} BETWEEN $1::date AND $2::date
          AND ${esGestionableExpr('mv.etapa_crm')}
        ), 0)
    , 0) * 100, 2) AS efectividad_realz,

    -- FIX (2026-08-19): estos 3 dividían por GEST_AMPLIO (ventana ancha:
    -- creación CRM O registro Jotform) mientras que la columna "gestionables"
    -- de esta misma fila (arriba) y las tarjetas usan solo fecha de creación
    -- CRM (ventana angosta). Quedaba un descarte %/efectividad calculado
    -- sobre un denominador distinto al "gestionables" que se ve en pantalla.
    -- Unificado al mismo denominador angosto que ya usan efectividad_realz
    -- y eficiencia (líneas de arriba/abajo) — pedido explícito: tablas deben
    -- medir igual que las tarjetas en ambas empresas.
    ${descarteIndicadoresExpr({
      idCol: 'mv.id_crm',
      etapaCol: 'mv.etapa_crm',
      fechaCol: CRM_DATE,
    })} AS descarte,

    ROUND( COALESCE(
      COUNT(*) FILTER (WHERE ${JF_DATE} BETWEEN $1::date AND $2::date)::numeric
      / NULLIF(COUNT(DISTINCT mv.id_crm) FILTER (
          WHERE ${CRM_DATE} BETWEEN $1::date AND $2::date
          AND ${esGestionableExpr('mv.etapa_crm')}
        ), 0)
    , 0) * 100, 2) AS efectividad_real,

    ROUND( COALESCE(
      COUNT(*) FILTER (WHERE ${JF_DATE} BETWEEN $1::date AND $2::date AND mv.estado_venta = ${ESTADO_ACTIVO})::numeric
      / NULLIF(COUNT(*) FILTER (WHERE ${JF_DATE} BETWEEN $1::date AND $2::date), 0)
    , 0) * 100, 2) AS tasa_instalacion,

    ROUND( COALESCE(
      COUNT(*) FILTER (WHERE ${JF_DATE} BETWEEN $1::date AND $2::date AND mv.estado_venta = ${ESTADO_ACTIVO})::numeric
      / NULLIF(COUNT(DISTINCT mv.id_crm) FILTER (
          WHERE ${CRM_DATE} BETWEEN $1::date AND $2::date
          AND ${esGestionableExpr('mv.etapa_crm')}
        ), 0)
    , 0) * 100, 2) AS efectividad_activas_vs_pauta,

    ROUND( COALESCE(
      COUNT(*) FILTER (
        WHERE ${JF_DATE} BETWEEN $1::date AND $2::date
        AND UPPER(TRIM(mv.estado_venta)) NOT IN ('PRESERVICIO','DESISTE DEL SERVICIO')
      )::numeric
      / NULLIF(COUNT(DISTINCT mv.id_crm) FILTER (
          WHERE ${CRM_DATE} BETWEEN $1::date AND $2::date
          AND ${esGestionableExpr('mv.etapa_crm')}
        ), 0)
    , 0) * 100, 2) AS eficiencia
  FROM ${MV}
  ${JOIN_JF_VELSA_MV}
  WHERE (
    ${CRM_DATE} BETWEEN $1::date AND $2::date
    OR ${JF_DATE} BETWEEN $1::date AND $2::date
    OR mv.fecha_activacion::date BETWEEN $1::date AND $2::date
  ) ${filters}
  GROUP BY 1${extraGroup} ORDER BY gestionables DESC
`;
};

// ── Query Backlog — solo usa $1 (desde) ──────────────────────────────────────
// Mismo fix de normalización que queryKPI (BTRIM/NULLIF) para que no genere
// grupos "fantasma" por espacios extra en mv.asesor/mv.supervisor.
const queryBacklog = (columna, filters) => `
  SELECT
    COALESCE(NULLIF(${normalizarAsesorSQL(columna)}, ''), 'SIN ASIGNAR') AS nombre_grupo,
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
  return kpiRows.map(r => {
    const jot   = Number(r.ingresos_reales || 0);
    const activ = Number(r.real_mes       || 0);
    const vdia  = Number(r.ventas_del_dia || 0);
    // BACKLOG = ACTIVAS TOTALES − ACTIVA MES. Antes venía de una consulta
    // aparte que filtraba por fecha de registro Jotform previa al período,
    // criterio distinto que hacía que Mes + Backlog no cuadrara con Totales.
    const bk    = Math.max(0, activ - Number(r.activa_mes || 0));
    // Los PORCENTAJES ya NO se calculan aquí: vienen del SQL con las mismas
    // fórmulas que Novonet. Recalcularlos en JS con otros denominadores era la
    // causa de que Velsa y Novonet nunca cuadraran.
    return {
      ...r,
      backlog:                      bk,
      // VENTAS DEL DÍA (JOTFORM) — mismo campo que Novonet expone en
      // mergeVentasDia. La tarjeta "V. DÍA FORM" del dashboard lee
      // ventas_dia_form; Velsa nunca lo devolvía y por eso salía siempre 0.
      ventas_dia_form:              vdia,
      // V. SEGUIMIENTO = INGRESOS JOT − VENTAS DEL DÍA
      venta_seguimiento:            Math.max(0, jot - vdia),
      descarte:                     Number(r.descarte                     || 0),
      efectividad_real:             Number(r.efectividad_real             || 0),
      efectividad_realz:            Number(r.efectividad_realz            || 0),
      tasa_instalacion:             Number(r.tasa_instalacion             || 0),
      eficiencia:                   Number(r.eficiencia                   || 0),
      efectividad_activas_vs_pauta: Number(r.efectividad_activas_vs_pauta || 0),
      total_activas_calculada:      Number(r.total_activas_calculada      || 0),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
async function getIndicadoresDashboardVelsa(req, res) {
  // ── FILTRO POR USUARIO LOGUEADO (seguridad) ───────────────────────────────
  // Si el usuario autenticado tiene perfil ASESOR, se IGNORA cualquier
  // "asesor" que venga en la query string y se fuerza su propio nombre. Así
  // un asesor nunca puede ver datos de otro asesor manipulando la URL o el
  // filtro. Supervisores/administradores/analistas/gerentes no se ven afectados.
  const esPerfilAsesor = !!(req.user && req.user.perfil === 'ASESOR');
  const qEffective = { ...req.query };
  if (esPerfilAsesor) qEffective.asesor = req.user.nombreCompleto || '__SIN_NOMBRE__';

  const cacheKey = 'dashboard:' + JSON.stringify({ q: qEffective, uid: esPerfilAsesor ? req.user.id : null });
  const cached = getCacheVelsa(cacheKey);
  if (cached) return res.json(cached);
  try {
    const hoy   = getFechaEcuador();
    const desde = qEffective.fechaDesde || hoy;
    const hasta = qEffective.fechaHasta || hoy;

    const valuesMain = [desde, hasta];
    const filters    = buildFilters(qEffective, valuesMain);

    const valuesBk  = [desde, hasta];
    const filtersBk = buildFilters(qEffective, valuesBk);

    // ── UNIFICADO con ACTIVAS TOTAL (real_mes) — ajustado 2026-08-13 ──────
    // Mismo ajuste que en Novonet: el renglón "ACTIVO" ahora usa fecha de
    // ACTIVACIÓN (igual que real_mes) en vez de fecha de registro en
    // Jotform, para que esta tarjeta y "ACTIVAS TOTAL" siempre coincidan.
    // El resto de estados se mantiene por fecha de registro.
    const qEstados = `
      SELECT estado, SUM(total)::int AS total
      FROM (
        SELECT COALESCE(NULLIF(TRIM(mv.estado_venta),''),'SIN ESTADO') AS estado, COUNT(*) AS total
        FROM ${MV}
        WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
        AND COALESCE(NULLIF(TRIM(mv.estado_venta),''),'SIN ESTADO') <> ${ESTADO_ACTIVO}
        ${filters}
        GROUP BY 1

        UNION ALL

        SELECT ${ESTADO_ACTIVO} AS estado, COUNT(*) AS total
        FROM ${MV}
        WHERE mv.estado_venta = ${ESTADO_ACTIVO}
        AND mv.fecha_activacion IS NOT NULL
        AND mv.fecha_activacion::date BETWEEN $1::date AND $2::date
        ${filters}
      ) sub
      GROUP BY estado
      -- FIX (2026-08-18): igual que en Novonet — la rama ACTIVO del UNION ALL
      -- siempre devuelve una fila (sin GROUP BY), aunque el conteo sea 0. El
      -- HAVING la descarta cuando un filtro no tiene ningun dato Jotform en el
      -- rango, para que el frontend muestre "SIN DATOS" en vez de una tarjeta
      -- fantasma "ACTIVO: 0".
      HAVING SUM(total) > 0
      ORDER BY total DESC
    `;
    // FIX (2026-08-19): COUNT(*) -> COUNT(DISTINCT mv.id_crm). Mismo bug que
    // se corrigió hoy en Novonet (queryEmbudo, commit 3cee6a0): la MV hace
    // FULL OUTER JOIN contra Jotform, que trae varias filas por negociación
    // cuando el cliente contrató más de un servicio. COUNT(*) contaba esa
    // negociación 2 o 3 veces en el embudo, aunque etapa_crm es un campo del
    // lado CRM (uno solo por negociación) — por eso el embudo daba más que
    // la tarjeta "Ventas Ingreso CRM" (399 vs 391).
    //
    // FIX (2026-08-20): el GROUP BY usaba mv.etapa_crm crudo (sin normalizar),
    // así que "Gestión Diaria" y "gestión diaria " (mayúscula/espacio distinto)
    // caían en dos filas separadas y el embudo mostraba la misma etapa
    // duplicada. shared/etapas.js ya deja la regla clara: la comparación de
    // etapas SIEMPRE es UPPER+TRIM en todo el resto del ERP; el embudo de
    // Novonet no tenía este problema porque vw_bitrix_novonet ya normaliza
    // la etapa en la vista. Acá se normaliza en la query.
    const qEmbudo = `
      SELECT UPPER(TRIM(COALESCE(mv.etapa_crm,'SIN ETAPA'))) AS etapa, COUNT(DISTINCT mv.id_crm)::int AS total
      FROM ${MV}
      WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date ${filters}
      GROUP BY UPPER(TRIM(COALESCE(mv.etapa_crm,'SIN ETAPA'))) ORDER BY total DESC
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
    // ORIGENES REALES presentes en la data de Velsa (2026-08-18).
    // Mismo criterio que Novonet: no se hardcodea ninguna lista, se leen los
    // valores que de verdad existen y se ordenan por volumen para que el
    // usuario vea primero los canales que mas leads traen.
    // FIX (2026-08-27, leads reales): mv_indicadores_velsa_completo hace FULL
    // OUTER JOIN con el lado Jotform y puede repetir un lead N veces. Ademas su
    // lado CRM sale de negociaciones_reporteria (sync cada 15 min), no del
    // webhook. bitrix_webhook_leads (empresa='velsa') es 1 fila por lead y es
    // la fuente viva -> para un conteo puro de origen no hace falta el JOIN.
    const qOrigenes = `
      SELECT source AS origen, COUNT(*)::int AS total
      FROM public.bitrix_webhook_leads
      WHERE empresa = 'velsa'
        AND NULLIF(TRIM(source), '') IS NOT NULL
        AND ${esLeadTotalExpr('etapa_bitrix')}
      GROUP BY 1
      ORDER BY total DESC, origen ASC
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
  -- FIX 2026-08-18: antes "SUPERVISOR" — el modal ClienteModal (frontend)
  -- busca la clave "SUPERVISOR_ASIGNADO" (mismo nombre que usa qVentasActivasMes
  -- más abajo); con el alias viejo el modal SIEMPRE mostraba "Sin supervisor"
  -- para clientes abiertos desde la tabla "Detalle base Jotform Velsa", aunque
  -- el dato sí venía en la fila bajo la clave equivocada.
  mv.supervisor AS "SUPERVISOR_ASIGNADO",
  mv.origen AS "ORIGEN",
  -- FIX 2026-08-18: faltaba esta columna (el modal la busca como
  -- "FECHA_CREACION_JOT", igual que qVentasActivasMes) — sin ella, el modal
  -- no mostraba la fecha de registro Jotform para clientes de esta tabla.
  mv.fecha_registro_jotform AS "FECHA_CREACION_JOT",
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

    // ── VENTAS ACTIVAS (NUEVO) — mes en curso, por FECHA DE ACTIVACIÓN ────────
    // Detalle (no solo conteo) de las ventas cuya FECHA DE ACTIVACIÓN cae
    // dentro del mes calendario actual, sin importar cuándo se creó el
    // registro (fecha de creación/registro Jotform). Reutiliza `filters`
    // (asesor/supervisor/etc, ya calculados arriba con qEffective) y
    // `valuesMain`, para respetar la misma selección/forzado de asesor.
    const qVentasActivasMes = `
      SELECT
        mv.id_crm AS "ID_CRM",
        mv.asesor AS "ASESOR",
        mv.supervisor AS "SUPERVISOR_ASIGNADO",
        mv.fecha_registro_jotform AS "FECHA_CREACION_JOT",
        mv.fecha_activacion AS "FECHA_ACTIVACION",
        mv.estado_venta AS "ESTADO_NETLIFE",
        mv.forma_pago AS "FORMA_PAGO",
        mv.estado_regularizacion AS "ESTADO_REGULARIZACION"
      FROM ${MV}
      WHERE mv.estado_venta = ${ESTADO_ACTIVO}
        AND mv.fecha_activacion IS NOT NULL
        AND mv.fecha_activacion::date >= date_trunc('month', CURRENT_DATE)::date
        AND mv.fecha_activacion::date <  (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
        -- FIX (bind mismatch, mismo bug que en Novonet): esta query no usa $1/$2
        -- para fechas (usa CURRENT_DATE a propósito), pero se ejecuta con
        -- pool.query(query, valuesMain) que siempre trae [desde, hasta]. Sin esto,
        -- sin filtros activos la query queda con 0 placeholders y truena con
        -- "bind message supplies 2 parameters, but prepared statement requires 0".
        AND $1::date IS NOT NULL AND $2::date IS NOT NULL
        ${filters}
      ORDER BY mv.fecha_activacion DESC
      LIMIT 3000
    `;

    // ── BACKLOG (NUEVO, 2026-08-18) — detalle fila por fila, mismo criterio que
    // Novonet (indicadores.controller.js, queryBacklogDetalle). Mismo universo
    // que qVentasActivasMes (activada este mes por fecha de ACTIVACIÓN), pero
    // SOLO la porción que la tarjeta KPI ya reporta como "backlog": registrada
    // en Jotform en un mes ANTERIOR al de activación (ver activa_mes/real_mes
    // en queryKPI arriba: backlog = real_mes − activa_mes). Reutiliza `filters`
    // y `valuesMain`, igual que qVentasActivasMes.
    const qBacklogDetalle = `
      SELECT
        mv.id_crm AS "ID_CRM",
        mv.asesor AS "ASESOR",
        mv.supervisor AS "SUPERVISOR_ASIGNADO",
        mv.fecha_registro_jotform AS "FECHA_CREACION_JOT",
        mv.fecha_activacion AS "FECHA_ACTIVACION",
        mv.estado_venta AS "ESTADO_NETLIFE",
        mv.forma_pago AS "FORMA_PAGO",
        mv.estado_regularizacion AS "ESTADO_REGULARIZACION"
      FROM ${MV}
      WHERE mv.estado_venta = ${ESTADO_ACTIVO}
        AND mv.fecha_activacion IS NOT NULL
        AND mv.fecha_activacion::date >= date_trunc('month', CURRENT_DATE)::date
        AND mv.fecha_activacion::date <  (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
        -- BACKLOG: registrada en Jotform ANTES del mes en curso (misma
        -- normalización -5h que JF_DATE, arriba).
        AND mv.fecha_registro_jotform IS NOT NULL
        AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date < date_trunc('month', CURRENT_DATE)::date
        AND $1::date IS NOT NULL AND $2::date IS NOT NULL
        ${filters}
      ORDER BY mv.fecha_activacion DESC
      LIMIT 3000
    `;

    // ── POR REGULARIZAR (NUEVO, 2026-08-18) — worklist urgente, SIN filtro de
    // fecha, mismo criterio y mismo lugar que Novonet (indicadores.controller.js,
    // queryRegularizaciones). A diferencia de "Detalle Jotform Velsa" (atado al
    // Período) esta tabla es una lista de pendientes: todo lo que HOY está en
    // estatus POR REGULARIZAR (esPorRegularizarExpr, fuente única de verdad en
    // shared/etapas.js — mismo criterio que ya usa queryKPI arriba), sin
    // importar cuándo se registró o activó. Respeta asesor/supervisor/etc. vía
    // `filters` (las mismas que usa qVentasActivasMes).
    const qPorRegularizar = `
      SELECT
        mv.id_crm AS "ID_CRM",
        mv.asesor AS "ASESOR",
        mv.supervisor AS "SUPERVISOR_ASIGNADO",
        mv.fecha_registro_jotform AS "FECHA_CREACION_JOT",
        mv.fecha_activacion AS "FECHA_ACTIVACION",
        mv.estado_venta AS "ESTADO_NETLIFE",
        mv.estado_regularizacion AS "ESTADO_REGULARIZACION",
        mv.detalle_regularizacion AS "MOTIVO_REGULARIZAR",
        mv.forma_pago AS "FORMA_PAGO",
        mv.inicio_sesion_netlife AS "LOGIN"
      FROM ${MV}
      WHERE ${esPorRegularizarExpr('mv.estado_regularizacion')}
        -- mismo no-op de conteo de placeholders que qVentasActivasMes: esta
        -- query no acota por $1/$2, pero se ejecuta con "valuesMain" (que
        -- siempre trae [desde, hasta] como $1/$2 + filters).
        AND $1::date IS NOT NULL AND $2::date IS NOT NULL
        ${filters}
      ORDER BY mv.fecha_registro_jotform DESC
      LIMIT 3000
    `;

    const [
      resSup, resAses, resBkSup, resBkAses,
      resEstados, resEmbudo, resDia,
      resEtapasCRM, resEtapasJot, resTercera, resTarjeta,
      resNetlife, resActivacionesDia, resPlanesDash, resVentasActivasMes,
      resOrigenes, resPorRegularizar, resBacklogDetalle,
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
      pool.query(qVentasActivasMes, valuesMain),
      pool.query(qOrigenes),
      pool.query(qPorRegularizar, valuesMain),
      pool.query(qBacklogDetalle, valuesMain),
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

    const payload = {
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
      origenes:              resOrigenes.rows.map(r => r.origen),
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
      // NUEVO: detalle de ventas activas del mes en curso (por fecha de
      // activación, no por fecha de creación) — ver qVentasActivasMes.
      ventasActivas: resVentasActivasMes.rows,
      ventasActivasTotal: resVentasActivasMes.rowCount,
      // NUEVO: worklist de "por regularizar" — ver qPorRegularizar.
      regularizaciones: resPorRegularizar.rows,
      regularizacionesTotal: resPorRegularizar.rowCount,
      // NUEVO: detalle fila por fila del backlog — ver qBacklogDetalle.
      backlogDetalle: resBacklogDetalle.rows,
      backlogDetalleTotal: resBacklogDetalle.rowCount,
    };
    setCacheVelsa(cacheKey, payload);
    res.json(payload);
  } catch (error) {
    console.error('[DASHBOARD-VELSA] Error:', error);
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MONITOREO DIARIO
// ─────────────────────────────────────────────────────────────────────────────
async function getMonitoreoDiarioVelsa(req, res) {
  const cacheKey = 'monitoreo:' + JSON.stringify(req.query);
  const cached = getCacheVelsa(cacheKey);
  if (cached) return res.json(cached);
  try {
    const hoy       = getFechaEcuador();
    const iniciomes = getPrimerDiaMesEcuador();

    const qMon = (columna) => `
      SELECT
        COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
        COUNT(DISTINCT mv.id_crm) FILTER (WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date) AS real_mes_leads,
        COUNT(DISTINCT mv.id_crm) FILTER (WHERE mv.fecha_creacion_crm::date = $2::date AND ${esGestionableExpr('mv.etapa_crm')}) AS real_dia_leads,
        COUNT(DISTINCT mv.id_crm) FILTER (WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date) AS crm_acumulado,
        COUNT(DISTINCT mv.id_crm) FILTER (WHERE mv.fecha_creacion_crm::date = $2::date) AS crm_dia,
        COUNT(DISTINCT mv.id_crm) FILTER (WHERE mv.fecha_creacion_crm::date = $2::date AND UPPER(mv.etapa_crm) = 'VENTA SUBIDA') AS v_subida_crm_hoy,
        COUNT(DISTINCT mv.id_crm) FILTER (WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date AND ${esGestionableExpr('mv.etapa_crm')}) AS gestionables
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

    const payload = { success: true, supervisores: merge(resSup.rows, resJotSup.rows), asesores: merge(resAses.rows, resJotAses.rows) };
    setCacheVelsa(cacheKey, payload);
    res.json(payload);
  } catch (error) {
    console.error('[MONITOREO-VELSA] Error:', error);
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTE 180
// ─────────────────────────────────────────────────────────────────────────────
async function getReporte180Velsa(req, res) {
  const cacheKey = 'reporte180:' + JSON.stringify(req.query);
  const cached = getCacheVelsa(cacheKey);
  if (cached) return res.json(cached);
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
        -- FIX (2026-08-19): denominador unificado a solo fecha de creación CRM
        -- (antes: creación CRM O registro Jotform). Mismo criterio de queryKPI
        -- y de las tarjetas. NOVONET no se toca.
        ROUND(COALESCE(
          COUNT(DISTINCT mv.id_crm) FILTER (WHERE ${esDescarteExactoExpr('mv.etapa_crm')} AND mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date)::numeric
          / NULLIF(COUNT(DISTINCT mv.id_crm) FILTER (WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date AND ${esGestionableExpr('mv.etapa_crm')}),0)
        ,0)*100,2) AS pct_descarte,
        ROUND(COALESCE(
          COUNT(*) FILTER (WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date)::numeric
          / NULLIF(COUNT(DISTINCT mv.id_crm) FILTER (WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date AND ${esGestionableExpr('mv.etapa_crm')}),0)
        ,0)*100,2) AS pct_efectividad,
        ROUND(COALESCE(
          COUNT(*) FILTER (WHERE mv.aplica_descuento ILIKE '%TERCERA EDAD%' AND mv.estado_venta = ${ESTADO_ACTIVO} AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE mv.estado_venta = ${ESTADO_ACTIVO} AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date),0)
        ,0)*100,2) AS pct_tercera_edad
      FROM ${MV}
      ${JOIN_JF_VELSA_MV}
      WHERE (mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date OR (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date) ${filters}
    `;
    // FIX (2026-08-19): mismo bug y mismo arreglo que qEmbudo de arriba y que
    // queryEmbudoCRM de Novonet (commit 68a823b) — etapa_crm es del lado CRM,
    // se dedupe por id_crm. qEmbudoJot (abajo) NO se toca: estado_venta es un
    // campo del lado Jotform, y ahí sí interesa contar cada servicio/registro
    // por separado (igual que ingresos_jot y el resto de métricas Jotform de
    // este archivo, que ya usan COUNT(*) a propósito).
    //
    // FIX (2026-08-20): mismo arreglo de normalización (UPPER+TRIM) que
    // qEmbudo — ver la nota completa ahí. Se aplica igual a estado_venta en
    // qEmbudoJot: es el mismo tipo de columna de texto libre y le pasa lo
    // mismo si llega con distinto uso de mayúsculas o un espacio de más.
    const qEmbudoCRM = `
      SELECT UPPER(TRIM(COALESCE(mv.etapa_crm,'SIN ETAPA'))) AS etapa, COUNT(DISTINCT mv.id_crm)::int AS total
      FROM ${MV} WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date ${filters}
      GROUP BY UPPER(TRIM(COALESCE(mv.etapa_crm,'SIN ETAPA'))) ORDER BY total DESC
    `;
    const qEmbudoJot = `
      SELECT UPPER(TRIM(COALESCE(mv.estado_venta,'SIN ESTADO'))) AS etapa, COUNT(*)::int AS total
      FROM ${MV} WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date ${filters}
      GROUP BY UPPER(TRIM(COALESCE(mv.estado_venta,'SIN ESTADO'))) ORDER BY total DESC
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
    const payload = {
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
    };
    setCacheVelsa(cacheKey, payload);
    res.json(payload);
  } catch (error) {
    console.error('[REPORTE180-VELSA] Error:', error);
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
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
        mv.plan_casa, mv.plan_pyme, mv.plan_profesional,
        mv.plan_hogar_adulto_mayor, mv.plan_pyme_corp, mv.plan_centro_red_comercial,
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
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
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
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DETALLE CRM
// ─────────────────────────────────────────────────────────────────────────────
async function getDetalleCRMData(req, res) {
  const cacheKey = 'detalle-crm:' + JSON.stringify(req.query);
  const cached = getCacheVelsa(cacheKey);
  if (cached) return res.json(cached);
  try {
    const hoy   = getFechaEcuador();
    const desde = req.query.fechaDesde || hoy;
    const hasta = req.query.fechaHasta || hoy;
    const values  = [desde, hasta];
    const filters = buildFilters(req.query, values);

    // FIX (2026-08-27, leads reales): mismo bug que qOrigenes -- esta query
    // comparte "filters" con queries del lado Jotform, asi que no se cambia el
    // FROM (romperia esos filtros); se deduplica con DISTINCT en su lugar.
    // FIX (2026-08-27, data completa): se quita LIMIT 6000 a pedido - este es
    // el export "Detalle CRM" (lado Bitrix); no debe truncarse silenciosamente
    // en rangos de fecha grandes.
    const result = await pool.query(`
      SELECT DISTINCT
        mv.id_crm AS "ID_CRM", mv.etapa_crm AS "ETAPA_CRM",
        mv.fecha_creacion_crm AS "FECHA_CREACION_CRM",
        mv.asesor AS "ASESOR", mv.supervisor AS "SUPERVISOR_ASIGNADO",
        mv.fecha_modificacion_crm AS "FECHA_MODIFICACION", mv.origen AS "ORIGEN"
      FROM ${MV}
      WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date ${filters}
      ORDER BY mv.fecha_creacion_crm DESC
    `, values);

    console.log(`[DETALLE-CRM-VELSA] ${desde}~${hasta} | ${result.rowCount} registros`);
    const payload = { success: true, registros: result.rows, total: result.rowCount };
    setCacheVelsa(cacheKey, payload);
    res.json(payload);
  } catch (error) {
    console.error('[DETALLE-CRM-VELSA] Error:', error);
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
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
        COALESCE(NULLIF(${normalizarAsesorSQL('mv.supervisor')}, ''), 'SIN ASIGNAR') AS supervisor,
        COALESCE(NULLIF(${normalizarAsesorSQL('mv.asesor')}, ''), 'SIN ASIGNAR') AS asesor,
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
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
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
        COALESCE(NULLIF(${normalizarAsesorSQL('mv.supervisor')}, ''), 'SIN ASIGNAR') AS supervisor,
        COALESCE(NULLIF(${normalizarAsesorSQL('mv.asesor')}, ''), 'SIN ASIGNAR') AS asesor,
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
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
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
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FORZAR REFRESH (LIVIANO) — botón "Forzar Refresh" del frontend.
// ⚠️ IMPORTANTE: NO ejecuta REFRESH MATERIALIZED VIEW. Ese refresh es pesado
// (>90 s, bloquea la MV y tumbó la BD en el pasado — por eso su cron está
// desactivado en server.js). La MV la refresca el pipeline de sincronización
// (Bitrix/GHL/JotForm) fuera de la app.
//
// Lo que SÍ hace este botón: vacía el caché en memoria del servidor para que la
// próxima consulta lea la MV al instante (saltándose la ventana de 10 min). Es
// una operación de milisegundos y no genera carga en la BD.
// ─────────────────────────────────────────────────────────────────────────────
async function forceRefreshVelsa(req, res) {
  try {
    const limpiadas = clearCacheVelsa();
    console.log(`[FORCE-REFRESH-VELSA] Caché limpiado (${limpiadas} entradas)`);
    res.json({ success: true, cacheLimpiado: limpiadas });
  } catch (error) {
    console.error('[FORCE-REFRESH-VELSA] ❌', error.message);
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
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
  forceRefreshVelsa,
};
