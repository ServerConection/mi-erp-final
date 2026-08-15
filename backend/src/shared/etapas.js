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
    // Las que no suman como lead tampoco son gestionables:
    ...ETAPAS_NO_SUMAN_LEAD,
];

const ETAPAS_NO_GESTIONABLES = [
    ...ETAPAS_NO_GESTIONABLES_BASE,
    'INNEGOCIABLE',
];

// ── (3) Descarte ────────────────────────────────────────────────────────────
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
 * @param {boolean} [opts.innegociableEsGestionable=false] true solo para el
 *        dashboard NOVONET, que históricamente cuenta INNEGOCIABLE como gestionable.
 * @param {boolean} [opts.tolerarNull=false] true = un registro sin etapa cuenta
 *        como gestionable (comportamiento de cumplimientoLeads).
 */
const esGestionableExpr = (col, opts = {}) => {
    const { innegociableEsGestionable = false, tolerarNull = false } = opts;
    const lista = innegociableEsGestionable
        ? ETAPAS_NO_GESTIONABLES_BASE
        : ETAPAS_NO_GESTIONABLES;
    const base = `UPPER(TRIM(${col})) NOT IN ${sqlListaUpper(lista)}`;
    return tolerarNull ? `(${col} IS NULL OR (${base}))` : `(${base})`;
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

module.exports = {
    ETAPAS_NO_SUMAN_LEAD,
    ETAPAS_NO_GESTIONABLES_BASE,
    ETAPAS_NO_GESTIONABLES,
    ETAPAS_DESCARTE_SI,
    ORIGENES_NO_SUMAN_REPORTE,
    sqlListaUpper,
    esLeadTotalExpr,
    esGestionableExpr,
    esDescarteExpr,
    sumaReporteExpr,
};
