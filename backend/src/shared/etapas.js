// ─────────────────────────────────────────────────────────────────────────────
// TABLA OFICIAL DE ETAPAS — FUENTE ÚNICA DE VERDAD DEL ERP
// ─────────────────────────────────────────────────────────────────────────────
// Antes cada controlador tenía su PROPIA copia de estas listas (9 copias) y
// ya habían divergido entre sí, por eso las gerencias veían números distintos
// para el mismo indicador según la pantalla. Este módulo centraliza la
// definición: cualquier cambio de reglas se hace SOLO aquí.
//
// Aplica IGUAL para NOVONET y VELSA (las etapas del CRM son las mismas).
// La comparación es SIEMPRE case-insensitive (UPPER + TRIM), así no importa
// si la etapa viene en mayúsculas, minúsculas o mixta.
//
//
// 1) ETAPAS QUE NO SUMAN AL CONTEO DE LEADS (LEADS TOTALES / N LEADS)
//    ------------------------------------------------------------------------
//    Regla de gerencia (2026-08-15): un registro en estas etapas NO es un lead
//    nuevo, es ruido operativo que infla el denominador y desvía todos los
//    porcentajes (efectividad, descarte, CPL, tasa de instalación...):
//      · DUPLICADO      → el mismo cliente ya existe como lead
//      · REGULARIZACION → es un trámite sobre una venta ya existente
//      · REMARKETING    → es re-contacto de una base antigua, no lead nuevo
//    Se incluyen las variantes reales encontradas en los datos (typo
//    "DUPLLICADO" y "REGULARIZACIÓN" con tilde).
//
// 2) ETAPAS NO GESTIONABLES (gestionable = NO)
//    ------------------------------------------------------------------------
//    Todo lo que NO está en esta lista se considera gestionable = SI.
//    Incluye por definición a las 3 etapas del punto (1): si no cuentan como
//    lead, tampoco pueden contar como gestionable — de lo contrario
//    gestionables podría superar a leads totales, que es imposible.
//
// 3) ETAPAS DE DESCARTE (descarte = SI)
//    ------------------------------------------------------------------------
//    Subconjunto de las gestionables. El resto de gestionables es descarte=NO.
// ─────────────────────────────────────────────────────────────────────────────

// ── (1) No suman al conteo de leads ─────────────────────────────────────────
const ETAPAS_NO_SUMAN_LEAD = [
    'DUPLICADO',
    'DUPLLICADO',        // typo real encontrado en los datos del CRM
    'REGULARIZACION',
    'REGULARIZACIÓN',
    'REMARKETING',
];

// ── (2) No gestionables ─────────────────────────────────────────────────────
// BASE = lista sin INNEGOCIABLE. El dashboard NOVONET (indicadores.controller)
// cuenta INNEGOCIABLE COMO GESTIONABLE por decisión de negocio previa, mientras
// que el resto de módulos lo trata como NO gestionable. Se respeta esa
// diferencia con el flag `innegociableEsGestionable` en vez de cambiarla en
// silencio; el día que gerencia unifique el criterio, se cambia el default acá.
const ETAPAS_NO_GESTIONABLES_BASE = [
    'ATC',
    'ATC/SOPORTE',
    'FUERA DE COBERTURA',
    'ZONA PELIGROSA',
    'ZONAS PELIGROSAS',
    'POSTVENTA',         // exacto: NO incluye "POSTVENTA NOVONET", esa SI es gestionable
    'CONTRATO PARAMOUNT',
    'PARAMOUNT SEGUMIENTO POR CERRAR',
    'PARAMOUNT SEGUIMIENTO POR CERRAR',
    'INNEGOCIABLE',
    'DUPLICADO',
    'DUPLLICADO',
    'REMARKETING',
    'REGULARIZACION',
    'REGULARIZACIÓN',

    // Las que no suman como lead tampoco son gestionables:
    ...ETAPAS_NO_SUMAN_LEAD,
];

const ETAPAS_NO_GESTIONABLES = [
    ...ETAPAS_NO_GESTIONABLES_BASE,
    'INNEGOCIABLE',
];

// ── (3) Descarte ────────────────────────────────────────────────────────────
const PATRONES_NO_GESTIONABLES = [
    /^DUPL+ICADO$/,
    /^ATC(?:[ /-]?SOPORTE)?$/,
    /^FUERA DE COBERTURA$/,
    /^ZONAS? PELIGROSAS?$/,
    /^IN+EGOCIABLE$/,
    /^REMARKETING(?:\b.*)?$/,
    /^REGULARIZA/,
];

const normalizarEtapa = (etapa) => String(etapa ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

const esEtapaGestionable = (etapa) => {
    const normalizada = normalizarEtapa(etapa);
    if (!normalizada) return false;
    if (PATRONES_NO_GESTIONABLES.some(patron => patron.test(normalizada))) return false;
    return !ETAPAS_NO_GESTIONABLES.some(item => normalizarEtapa(item) === normalizada);
};
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

// ─────────────────────────────────────────────────────────────────────────────
// ORÍGENES QUE NO SUMAN A REPORTE
// El único origen que no suma es el literal "REMARKETING" (match exacto).
// Los orígenes que pertenecen al GRUPO remarketing (BASE 593-958993371, etc.)
// SÍ suman. Esto es independiente de la ETAPA "REMARKETING" de arriba.
// ─────────────────────────────────────────────────────────────────────────────
const ORIGENES_NO_SUMAN_REPORTE = [
    'REMARKETING',
];

// ── Helpers SQL ─────────────────────────────────────────────────────────────
const sqlListaUpper = (arr) =>
    `(${arr.map(e => `'${String(e).toUpperCase().replace(/'/g, "''")}'`).join(', ')})`;
const normalizarEtapaSql = (col) =>
    `REGEXP_REPLACE(TRANSLATE(UPPER(TRIM(COALESCE(${col}, ''))), ` +
    `'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '\\s+', ' ', 'g')`;

/**
 * Cuenta como LEAD TOTAL ⇔ la etapa NO está en ETAPAS_NO_SUMAN_LEAD.
 * Un registro sin etapa (NULL / vacío) SÍ cuenta como lead.
 */
const esLeadTotalExpr = (col) =>
    `(UPPER(TRIM(COALESCE(${col}, ''))) NOT IN ${sqlListaUpper(ETAPAS_NO_SUMAN_LEAD)})`;

/**
 * gestionable = SI ⇔ la etapa NO está en la lista de no gestionables.
 * @param {string}  col
 * @param {object}  [opts]
 * @param {boolean} [opts.tolerarNull=false] true = un registro sin etapa cuenta
 *        como gestionable (comportamiento de cumplimientoLeads).
 */
const esGestionableExpr = (col, opts = {}) => {
    const { tolerarNull = false } = opts;
    const lista = ETAPAS_NO_GESTIONABLES;
    const etapa = normalizarEtapaSql(col);
    const exactas = lista.filter(item => ![
        'DUPLICADO', 'DUPLLICADO', 'REGULARIZACION', 'REGULARIZACIÓN',
        'REMARKETING', 'ATC', 'ATC/SOPORTE', 'FUERA DE COBERTURA',
        'ZONA PELIGROSA', 'ZONAS PELIGROSAS', 'INNEGOCIABLE',
    ].includes(item));
    const base = [
        `${etapa} !~ '^DUPL+ICADO$'`,
        `${etapa} !~ '^ATC([ /-]?SOPORTE)?$'`,
        `${etapa} <> 'FUERA DE COBERTURA'`,
        `${etapa} !~ '^ZONAS? PELIGROSAS?$'`,
        `${etapa} !~ '^IN+EGOCIABLE$'`,
        `${etapa} !~ '^REMARKETING( .*)?$'`,
        `${etapa} !~ '^REGULARIZA'`,
        `${etapa} NOT IN ${sqlListaUpper(exactas)}`,
    ].join(' AND ');
    return tolerarNull ? `(${col} IS NULL OR (${base}))` : `(${col} IS NOT NULL AND ${base})`;
};

/** descarte = SI ⇔ la etapa está en la lista blanca de descarte. */
const esDescarteExpr = (col) =>
    `(UPPER(TRIM(${col})) IN ${sqlListaUpper(ETAPAS_DESCARTE_SI)})`;

/**
 * suma_a_reporte = SI ⇔ el origen NO está excluido.
 * VENTA SUBIDA siempre suma, sin importar el origen (regla de negocio previa).
 */
const sumaReporteExpr = (origenCol, etapaCol) =>
    `(${etapaCol} = 'VENTA SUBIDA' OR UPPER(TRIM(COALESCE(${origenCol}, ''))) NOT IN ${sqlListaUpper(ORIGENES_NO_SUMAN_REPORTE)})`;

/**
 * Porcentaje de descarte para las tarjetas de Indicadores. Numerador y
 * denominador usan IDs únicos, fecha de creación CRM y la misma población
 * reportable, igual que el total visible de gestionables.
 */
const esDescarteExactoExpr = (col) => `(UPPER(TRIM(${col})) = 'DESCARTE')`;

const descarteIndicadoresExpr = ({ idCol, etapaCol, fechaCol, origenCol }) => {
    const filtroReporte = origenCol ? `AND ${sumaReporteExpr(origenCol, etapaCol)}` : '';
    return `
    (COUNT(DISTINCT ${idCol}) FILTER (
        WHERE ${esDescarteExactoExpr(etapaCol)}
          AND ${fechaCol} BETWEEN $1::date AND $2::date
          ${filtroReporte}
    )::numeric /
    NULLIF(COUNT(DISTINCT ${idCol}) FILTER (
        WHERE ${fechaCol} BETWEEN $1::date AND $2::date
          AND ${esGestionableExpr(etapaCol)}
          ${filtroReporte}
    ), 0) * 100)::numeric(10,2)`;
};
// ── (4) REGULARIZACIÓN ──────────────────────────────────────────────────────
// Un registro está POR REGULARIZAR ⇔ su ESTATUS DE REGULARIZACIÓN es
// exactamente "POR REGULARIZAR".
//
// FIX (2026-08-18) — había TRES criterios distintos conviviendo en el código,
// y por eso el mismo indicador daba números distintos según la pantalla:
//   · indicadores / comparativa : = 'POR REGULARIZAR'   (exacto, SIN upper ni
//     trim → se perdía todo lo que viniera como "Por Regularizar" o con un
//     espacio al final. Este era el bug de NOVONET.)
//   · redes / monitoreo         : ILIKE '%POR REGULARIZAR%'  (parcial → también
//     matchearía cualquier valor futuro que CONTENGA ese texto.)
//   · kpiComercial / velsa      : UPPER(TRIM(...)) = ...   (el correcto)
//
// Se unifica en el criterio correcto: comparación EXACTA pero insensible a
// mayúsculas y espacios, igual que se hace con las etapas.
const ESTADO_POR_REGULARIZAR = 'POR REGULARIZAR';

/**
 * FIX (2026-08-18b) — el campo de Jotform llega envuelto como un array-string
 * literal: en vez de guardar  POR REGULARIZAR  guarda  ["POR REGULARIZAR"]
 * (corchetes + comillas incluidos en el texto). Con el match EXACTO de arriba
 * esto daba SIEMPRE 0 resultados (confirmado: la tabla "Por regularizar"
 * mostraba 0 pendientes con datos reales de sobra). TRIM(BOTH '[]"' FROM ...)
 * pela corchetes y comillas de ambos extremos ANTES de comparar — si el dato
 * viene limpio (sin corchetes) no cambia nada, así que es seguro para
 * registros viejos y nuevos por igual.
 */
const _sinCorchetesExpr = (col) =>
    `TRIM(BOTH '[]"' FROM UPPER(TRIM(COALESCE(${col}, ''))))`;

/** por_regularizar = SI ⇔ el estatus de regularización es POR REGULARIZAR. */
const esPorRegularizarExpr = (col) =>
    `(${_sinCorchetesExpr(col)} = '${ESTADO_POR_REGULARIZAR}')`;

// Estados de venta que ANULAN la regularización: aunque el registro esté
// marcado POR REGULARIZAR, ya no aplica porque la venta se cayó.
const ESTADOS_ANULAN_REGULARIZACION = [
    'FUERA DE COBERTURA',
    'DESISTE DEL SERVICIO',
    'RECHAZADO',
];

/**
 * regularización "neta": POR REGULARIZAR y además la venta sigue viva.
 * Es la que se muestra en la columna REGU. de la tabla KPI.
 */
const esRegularizacionNetaExpr = (colEstatus, colEstadoVenta) =>
    `(${esPorRegularizarExpr(colEstatus)} AND UPPER(TRIM(COALESCE(${colEstadoVenta}, ''))) NOT IN ${sqlListaUpper(ESTADOS_ANULAN_REGULARIZACION)})`;

module.exports = {
    ETAPAS_NO_SUMAN_LEAD,
    ETAPAS_NO_GESTIONABLES_BASE,
    ETAPAS_NO_GESTIONABLES,
    ETAPAS_DESCARTE_SI,
    ORIGENES_NO_SUMAN_REPORTE,
    sqlListaUpper,
    esLeadTotalExpr,
    normalizarEtapa,
    esEtapaGestionable,
    normalizarEtapaSql,
    esGestionableExpr,
    esDescarteExpr,
    sumaReporteExpr,
    esDescarteExactoExpr,
    descarteIndicadoresExpr,
    ESTADO_POR_REGULARIZAR,
    ESTADOS_ANULAN_REGULARIZACION,
    esPorRegularizarExpr,
    esRegularizacionNetaExpr,
};
