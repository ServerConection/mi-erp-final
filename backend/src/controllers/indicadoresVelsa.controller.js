const pool = require('../config/db');

const getFechaEcuador = () => {
    const ahora = new Date();
    return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
};

const getPrimerDiaMesEcuador = () => {
    const ahora = new Date();
    const fechaEcuador = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Guayaquil' }));
    return `${fechaEcuador.getFullYear()}-${String(fechaEcuador.getMonth() + 1).padStart(2, '0')}-01`;
};

const parseFecha = (col) => `CASE WHEN ${col} IS NULL OR TRIM(${col}::text) = '' THEN NULL WHEN ${col}::text ~ '^\\d{4}-\\d{2}-\\d{2}' THEN ${col}::text::date ELSE TO_DATE(SUBSTRING(${col}::text FROM 5 FOR 11), 'Mon DD YYYY') END`;
const dedupVN = `public.velsa_netlife_maestra_cons vn`;

// FIX: los valores reales de t2_estado_venta_netlife son texto directo (no catálogo codificado)
// ACTIVO = 'ACTIVO', confirmado en BD
const ESTADO_ACTIVO = `'ACTIVO'`;

// ─────────────────────────────────────────────────────────────────────────────
// Caché de etapas CRM + canales de Velsa (5 minutos)
// Equivalente al getEtapasCache() de Novonet — evita 2 full-scans por request
// ─────────────────────────────────────────────────────────────────────────────
let _cacheEtapasVelsa    = null;
let _cacheEtapasVelsaTTL = 0;
const CACHE_TTL_MS       = 5 * 60 * 1000; // 5 minutos

const getEtapasVelsaCache = async () => {
    const ahora = Date.now();
    if (_cacheEtapasVelsa && ahora < _cacheEtapasVelsaTTL) return _cacheEtapasVelsa;

    const [resEtapas, resCanales] = await Promise.all([
        pool.query(`SELECT DISTINCT vn.t1_pipeline_stage_id AS etapa
                    FROM public.velsa_netlife_maestra_cons vn
                    WHERE vn.t1_pipeline_stage_id IS NOT NULL
                      AND TRIM(vn.t1_pipeline_stage_id) <> ''
                    ORDER BY etapa ASC`),
        pool.query(`SELECT DISTINCT vn.t1_relation_tags AS canal
                    FROM public.velsa_netlife_maestra_cons vn
                    WHERE vn.t1_relation_tags IS NOT NULL
                      AND TRIM(vn.t1_relation_tags) <> ''
                    ORDER BY canal ASC
                    LIMIT 50`),
    ]);

    _cacheEtapasVelsa    = {
        etapasCRM: resEtapas.rows.map(r => r.etapa),
        canales:   resCanales.rows.map(r => r.canal),
    };
    _cacheEtapasVelsaTTL = ahora + CACHE_TTL_MS;
    return _cacheEtapasVelsa;
};

// ─────────────────────────────────────────────────────────────────────────────
// Caché de resultados del dashboard Velsa (2 minutos por combinación de params)
// ─────────────────────────────────────────────────────────────────────────────
const _cacheDashboardVelsa = new Map();
const CACHE_DASH_TTL_MS    = 2 * 60 * 1000; // 2 minutos

const getDashboardVelsaCache = (key) => {
    const entry = _cacheDashboardVelsa.get(key);
    if (entry && Date.now() < entry.ttl) return entry.data;
    _cacheDashboardVelsa.delete(key);
    return null;
};
const setDashboardVelsaCache = (key, data) => {
    _cacheDashboardVelsa.set(key, { data, ttl: Date.now() + CACHE_DASH_TTL_MS });
    if (_cacheDashboardVelsa.size > 100) {
        const ahora = Date.now();
        for (const [k, v] of _cacheDashboardVelsa) if (ahora > v.ttl) _cacheDashboardVelsa.delete(k);
    }
};

const getIndicadoresDashboardVelsa = async (req, res) => {
    try {
        const { asesor, supervisor, fechaDesde, fechaHasta, estadoNetlife, estadoRegularizacion, etapaCRM, etapaJotform, canal } = req.query;

        const hoy = getFechaEcuador();
        const desde = fechaDesde ? fechaDesde : hoy;
        const hasta = fechaHasta ? fechaHasta : hoy;

        // ── Caché de resultado: retorno inmediato si los mismos params ya fueron consultados ──
        const cacheKey = JSON.stringify({ asesor, supervisor, desde, hasta, estadoNetlife, estadoRegularizacion, etapaCRM, etapaJotform, canal });
        const cached = getDashboardVelsaCache(cacheKey);
        if (cached) {
            console.log(`[DASHBOARD VELSA] Cache hit → ${desde}~${hasta} asesor=${asesor||''} sup=${supervisor||''}`);
            return res.json(cached);
        }

        let values = [desde, hasta];
        let filters = "";

        if (asesor) { values.push(`%${asesor}%`); filters += ` AND vn.t1_assigned_to ILIKE $${values.length}`; }
        if (supervisor) { values.push(`%${supervisor}%`); filters += ` AND vn.supervisor_asignado ILIKE $${values.length}`; }
        if (estadoNetlife) { values.push(`%${estadoNetlife}%`); filters += ` AND vn.t2_estado_venta_netlife ILIKE $${values.length}`; }
        if (estadoRegularizacion) { values.push(`%${estadoRegularizacion}%`); filters += ` AND vn.t2_regularizado ILIKE $${values.length}`; }
        if (etapaCRM) { values.push(`%${etapaCRM}%`); filters += ` AND vn.t1_pipeline_stage_id ILIKE $${values.length}`; }
        if (etapaJotform) { values.push(`%${etapaJotform}%`); filters += ` AND vn.t2_estado_venta_netlife ILIKE $${values.length}`; }
        // Filtro por campaña/origen (campo t1_relation_tags en velsa_netlife_maestra_cons)
        // También incluye filas JOT cuyo t2_id_bitrix_ghl apunta al id_unificado del deal correcto,
        // para que los indicadores JOT no queden en 0 al filtrar por campaña.
        if (canal) {
            values.push(`%${canal}%`);
            const canalIdx = values.length;
            filters += ` AND (
                vn.t1_relation_tags ILIKE $${canalIdx}
                OR vn.t2_id_bitrix_ghl::text IN (
                    SELECT vn2.id_unificado::text
                    FROM velsa_netlife_maestra_cons vn2
                    WHERE vn2.t1_relation_tags ILIKE $${canalIdx}
                      AND vn2.id_unificado IS NOT NULL
                )
            )`;
        }

        const ETAPAS_GESTIONABLES = `('VOLVER A LLAMAR','NO INTERESA COSTO DEL PLAN','SEGUIMIENTO SIN CONTACTO','SEGUIMIENTO NEGOCIACION','VENTA SUBIDA','CONTACTO NUEVO','CLIENTE DISCAPACIDAD','CLIENTE DICAPACIDAD','DOCUMENTOS PENDIENTES','CERRAR NEGOCIACION','INNEGOCIABLE','NUNCA CONTESTO','GESTION DIARIA','MANTIENE PROVEEDOR','NO INTERESA COSTO DE INSTALACION','CONTRATA NETLIFE OTRO CANAL','CONTRATO OTRO PROVEEDOR','REFIRIO','RECEPCION DE DOCUMENTOS','RMKT AUTOMÁTICO','SEGUIMIENTO','CONTRATA NETLIFE OTRO DISTRIBUIDOR','INCONTACTABLE','NO INTERESA COSTO DE PLAN','NO INTERESA COSTO DE INSTALACIÓN','OPORTUNIDADES','DUPLICADO','NO VOLVER A CONTACTAR','LEADS NOVONET','POSTVENTA VELSA','RMKT AUTOMATICO')`;
        const ETAPAS_DESCARTE = `('NO INTERESA COSTO PLAN','INNEGOCIABLE','CONTRATO NETLIFE','CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA','OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','VENTA ECUANET DIRECTA','CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO','INCONTACTABLE','NO INTERESA COSTO INSTALACION','CONTRATO NETLIFE OTRO CANAL','CONTRATO OTRO PROVEEDOR')`;

        // ── Optimización CTE MATERIALIZED ────────────────────────────────────────
        // parseFecha (CASE+regex) antes se evaluaba 10-12 veces por fila.
        // Con MATERIALIZED CTE se evalúa 1 vez; el SELECT exterior usa aliases.
        const queryKPI = (columna) => {
            const groupCol = columna === 'vn.supervisor_asignado' ? 'supervisor_asignado' : 't1_assigned_to';
            return `
            WITH _base AS MATERIALIZED (
                SELECT
                    vn.supervisor_asignado,
                    vn.t1_assigned_to,
                    vn.t1_pipeline_stage_id,
                    vn.t2_estado_venta_netlife,
                    vn.t2_regularizado,
                    vn.t2_forma_pago,
                    vn.t2_aplica_descuento,
                    -- Fechas pre-calculadas 1 vez por fila:
                    ${parseFecha('vn.t1_hgl_created_at_fecha')}  AS _hgl_date,
                    vn.t2_jot_created_at_fecha::date              AS _jf_date
                FROM ${dedupVN}
                WHERE (
                    ${parseFecha('vn.t1_hgl_created_at_fecha')} BETWEEN $1::date AND $2::date
                    OR vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
                ) ${filters}
            )
            SELECT
                COALESCE(${groupCol}, 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(*) FILTER (WHERE _hgl_date BETWEEN $1::date AND $2::date) AS leads_totales,
                COUNT(*) FILTER (
                    WHERE _hgl_date BETWEEN $1::date AND $2::date
                    AND t1_pipeline_stage_id = 'VENTA SUBIDA'
                ) AS ventas_crm,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE _jf_date BETWEEN $1::date AND $2::date)::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE _hgl_date BETWEEN $1::date AND $2::date
                        AND t1_pipeline_stage_id IN ${ETAPAS_GESTIONABLES}
                    ), 0)
                , 0) * 100, 2) AS efectividad_realz,
                COUNT(*) FILTER (
                    WHERE _jf_date BETWEEN $1::date AND $2::date
                    AND t2_regularizado = 'POR REGULARIZAR'
                ) AS por_regularizar,
                COUNT(*) FILTER (
                    WHERE (_jf_date BETWEEN $1::date AND $2::date OR _hgl_date BETWEEN $1::date AND $2::date)
                    AND t1_pipeline_stage_id IN ${ETAPAS_GESTIONABLES}
                ) AS gestionables,
                COUNT(*) FILTER (WHERE _jf_date BETWEEN $1::date AND $2::date) AS ingresos_reales,
                COUNT(*) FILTER (
                    WHERE _jf_date BETWEEN $1::date AND $2::date
                    AND t2_estado_venta_netlife = ${ESTADO_ACTIVO}
                ) AS activas,
                COUNT(*) FILTER (
                    WHERE _jf_date BETWEEN $1::date AND $2::date
                    AND t2_estado_venta_netlife = ${ESTADO_ACTIVO}
                ) AS real_mes,
                COUNT(*) FILTER (
                    WHERE _jf_date BETWEEN $1::date AND $2::date
                    AND t2_estado_venta_netlife = ${ESTADO_ACTIVO}
                ) AS total_activas_calculada,
                0 AS crec_vs_ma,
                COUNT(*) FILTER (
                    WHERE t2_forma_pago ILIKE '%TARJETA DE CREDITO%'
                    AND _jf_date BETWEEN $1::date AND $2::date
                ) AS tarjeta_credito,
                COUNT(*) FILTER (
                    WHERE t2_aplica_descuento ILIKE '%TERCERA EDAD%'
                    AND t2_estado_venta_netlife = ${ESTADO_ACTIVO}
                    AND _jf_date BETWEEN $1::date AND $2::date
                ) AS tercera_edad,
                (COUNT(*) FILTER (
                    WHERE t1_pipeline_stage_id IN ${ETAPAS_DESCARTE}
                    AND _hgl_date BETWEEN $1::date AND $2::date
                )::numeric /
                NULLIF(COUNT(*) FILTER (
                    WHERE (_jf_date BETWEEN $1::date AND $2::date OR _hgl_date BETWEEN $1::date AND $2::date)
                    AND t1_pipeline_stage_id IN ${ETAPAS_GESTIONABLES}
                ), 0) * 100)::numeric(10,2) AS descarte,
                COUNT(*) FILTER (
                    WHERE _jf_date BETWEEN $1::date AND $2::date
                    AND t2_estado_venta_netlife NOT IN ('FUERA DE COBERTURA','DESISTE DEL SERVICIO','RECHAZADO')
                    AND t2_regularizado = 'POR REGULARIZAR'
                ) AS regularizacion,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE _jf_date BETWEEN $1::date AND $2::date)::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE (_jf_date BETWEEN $1::date AND $2::date OR _hgl_date BETWEEN $1::date AND $2::date)
                        AND t1_pipeline_stage_id IN ${ETAPAS_GESTIONABLES}
                    ), 0)
                , 0) * 100, 2) AS efectividad_real,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE _jf_date BETWEEN $1::date AND $2::date AND t2_estado_venta_netlife = ${ESTADO_ACTIVO})::numeric
                    / NULLIF(COUNT(*) FILTER (WHERE _jf_date BETWEEN $1::date AND $2::date), 0)
                , 0) * 100, 2) AS tasa_instalacion,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE _jf_date BETWEEN $1::date AND $2::date AND t2_estado_venta_netlife = ${ESTADO_ACTIVO})::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE (_jf_date BETWEEN $1::date AND $2::date OR _hgl_date BETWEEN $1::date AND $2::date)
                        AND t1_pipeline_stage_id IN ${ETAPAS_GESTIONABLES}
                    ), 0)
                , 0) * 100, 2) AS efectividad_activas_vs_pauta,
                ROUND(COALESCE(
                    COUNT(*) FILTER (
                        WHERE _jf_date BETWEEN $1::date AND $2::date
                        AND t2_estado_venta_netlife NOT IN ('PRESERVICIO','DESISTE DEL SERVICIO')
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE _hgl_date BETWEEN $1::date AND $2::date
                        AND t1_pipeline_stage_id IN ${ETAPAS_GESTIONABLES}
                    ), 0)
                , 0) * 100, 2) AS eficiencia
            FROM _base
            GROUP BY 1
            ORDER BY gestionables DESC
            `;
        };

        // Backlog = activaciones ACTIVO dentro del rango de fechas seleccionado,
        // PERO cuya orden fue creada ANTES del inicio del período (fecha_desde).
        // Esto garantiza que solo se cuentan órdenes pendientes pre-período que se activaron
        // durante [fecha_desde, fecha_hasta], evitando inflación con activaciones del mismo período.
        const queryBacklog = (columna) => `
            SELECT
                COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(*)::int AS backlog
            FROM ${dedupVN}
            WHERE vn.t2_estado_venta_netlife = ${ESTADO_ACTIVO}
            AND vn.t2_fecha_activacion_telcos IS NOT NULL
            AND TRIM(vn.t2_fecha_activacion_telcos::text) != ''
            AND vn.t2_fecha_activacion_telcos::date >= $1::date
            AND vn.t2_fecha_activacion_telcos::date <= $2::date
            AND vn.t2_jot_created_at_fecha::date < $1::date
            ${filters}
            GROUP BY 1
        `;

        const queryCRM = `
            SELECT
                vn.id_unificado                  AS "ID_CRM",
                vn.t1_pipeline_stage_id          AS "ETAPA_CRM",
                vn.t1_hgl_created_at_fecha       AS "FECHA_CREACION_CRM",
                vn.t1_assigned_to                AS "ASESOR",
                vn.t1_hgl_created_at_hora        AS "HORA_CREACION",
                vn.supervisor_asignado           AS "SUPERVISOR_ASIGNADO",
                vn.t1_hgl_updated_at_fecha       AS "FECHA_MODIFICACION",
                vn.t1_hgl_updated_at_hora        AS "HORA_MODIFICACION",
                vn.t1_relation_tags              AS "ORIGEN",
                vn.ventasdiajot                  AS "VENTAS_DIA_JOT",
                vn.t1_phone                      AS "TELEFONO",
                vn.t2_ciudad                     AS "CIUDAD",
                vn.t2_estado_venta_netlife       AS "ESTADO_NETLIFE",
                vn.t2_jot_created_at_fecha       AS "FECHA_JOT",
                vn.t2_regularizado               AS "ESTADO_REGULARIZACION",
                vn.t2_observacion_auditoria      AS "OBSERVACION_AUDITORIA"
            FROM ${dedupVN}
            WHERE ${parseFecha('vn.t1_hgl_created_at_fecha')} BETWEEN $1::date AND $2::date
            ${filters}
            LIMIT 6000
        `;

        const queryJotform = `
            SELECT
                vn.t2_jot_created_at_fecha       AS "FECHA_CREACION_JOT",
                vn.t2_id_bitrix_ghl              AS "ID_CRM",
                vn.t2_estado_venta_netlife       AS "ESTADO_NETLIFE",
                vn.t2_fecha_activacion_telcos    AS "FECHA_ACTIVACION",
                vn.t2_clausulas                  AS "NOVEDADES_ATC",
                vn.t2_regularizado               AS "ESTADO_REGULARIZACION",
                vn.t2_regularizado       AS "OBSERVACION_REGULARIZADO",
                vn.t2_estado_regularizacion_novo AS "MOTIVO_REGULARIZAR",
                vn.t2_observacion_auditoria      AS "OBSERVACION_AUDITORIA",
                vn.t2_forma_pago                 AS "FORMA_PAGO",
                vn.t1_assigned_to                AS "ASESOR",
                vn.supervisor_asignado           AS "SUPERVISOR_ASIGNADO",
                vn.t1_phone                      AS "TELF",
                vn.t2_inicio_sesion_netlife      AS "LOGIN",
                vn.t2_ciudad                     AS "CIUDAD",
                vn.t2_aplica_descuento           AS "TERCERA_EDAD",
                vn.t1_pipeline_stage_id          AS "ETAPA_CRM"
            FROM ${dedupVN}
            WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
            ${filters}
            LIMIT 6000
        `;

        const queryEstados = `
            SELECT
                COALESCE(NULLIF(TRIM(vn.t2_estado_venta_netlife::text), ''), 'SIN ESTADO') AS estado,
                COUNT(*)::int AS total
            FROM ${dedupVN}
            WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
            ${filters}
            GROUP BY 1
            ORDER BY total DESC
        `;

        const queryEmbudo = `
            SELECT
                COALESCE(vn.t1_pipeline_stage_id, 'SIN ETAPA') AS etapa,
                COUNT(*)::int AS total
            FROM ${dedupVN}
            WHERE ${parseFecha('vn.t1_hgl_created_at_fecha')} BETWEEN $1::date AND $2::date
            ${filters}
            GROUP BY vn.t1_pipeline_stage_id
            ORDER BY total DESC
        `;

        const queryPorDia = `
            SELECT
                vn.t2_jot_created_at_fecha::date AS fecha,
                COUNT(*)::int AS total
            FROM ${dedupVN}
            WHERE vn.t2_jot_created_at_fecha IS NOT NULL
            AND vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
            ${filters}
            GROUP BY 1
            ORDER BY fecha ASC
        `;

        // ── Optimización: TerceraEdad + Tarjeta en un solo scan de tabla ──────────────
        // Antes eran 2 queries separadas con el mismo WHERE → ahora 1 sola query
        const queryMetasGlobales = `
            SELECT
                COUNT(*) FILTER (
                    WHERE vn.t2_aplica_descuento ILIKE '%TERCERA EDAD%'
                    AND vn.t2_estado_venta_netlife = ${ESTADO_ACTIVO}
                ) AS total_tercera_edad,
                COUNT(*) FILTER (
                    WHERE vn.t2_estado_venta_netlife = ${ESTADO_ACTIVO}
                ) AS total_activos,
                COUNT(*) FILTER (
                    WHERE vn.t2_forma_pago ILIKE '%TARJETA DE CREDITO%'
                ) AS total_tarjeta,
                COUNT(*) AS total_jotform
            FROM ${dedupVN}
            WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
            ${filters}
        `;
        // Nota: queryEtapasCRM y queryCanales ahora vienen del caché (getEtapasVelsaCache)

        // ── Lote 1: KPIs + agregaciones ligeras (6 queries) + caché de etapas ──────
        // Equivalente al patrón de Novonet: 2 lotes para no saturar el pool (max 15).
        // etapasCRM y canales vienen del caché → 0 queries adicionales si está en TTL.
        const [etapasCache, [resSup, resAses, resEstados, resEmbudo, resDia, resMetasGlobales]] = await Promise.all([
            getEtapasVelsaCache(),
            Promise.all([
                pool.query(queryKPI('vn.supervisor_asignado'), values),
                pool.query(queryKPI('vn.t1_assigned_to'), values),
                pool.query(queryEstados, values),
                pool.query(queryEmbudo, values),
                pool.query(queryPorDia, values),
                pool.query(queryMetasGlobales, values),
            ]),
        ]);

        // ── Lote 2: tablas de detalle + backlogs (4 queries) ──────────────────────
        const [resCRM, resNet, resBacklogSup, resBacklogAses] = await Promise.all([
            pool.query(queryCRM, values),
            pool.query(queryJotform, values),
            pool.query(queryBacklog('vn.supervisor_asignado'), values),
            pool.query(queryBacklog('vn.t1_assigned_to'), values),
        ]);

        const mergeBacklog = (filas, backlogRows) => {
            return filas.map(row => {
                const bl = backlogRows.find(b => b.nombre_grupo === row.nombre_grupo);
                return { ...row, backlog: bl ? Number(bl.backlog) : 0 };
            });
        };

        const supervisoresConBacklog = mergeBacklog(resSup.rows, resBacklogSup.rows);
        const asesoresConBacklog     = mergeBacklog(resAses.rows, resBacklogAses.rows);

        const estadosNetlife = resEstados.rows.map(r => ({ estado: r.estado, total: Number(r.total || 0) }));

        // ── Desempaquetar la query consolidada de metas globales ────────────────
        const rowMetas            = resMetasGlobales.rows[0] || {};
        const totalTerceraEdad    = Number(rowMetas.total_tercera_edad || 0);
        const totalActivosTercera = Number(rowMetas.total_activos       || 0);
        const totalTarjeta        = Number(rowMetas.total_tarjeta       || 0);
        const totalJotformTarjeta = Number(rowMetas.total_jotform       || 0);

        const porcentajeTerceraEdad = totalActivosTercera > 0
            ? Number(((totalTerceraEdad / totalActivosTercera) * 100).toFixed(2)) : 0;
        const porcentajeTarjeta = totalJotformTarjeta > 0
            ? Number(((totalTarjeta / totalJotformTarjeta) * 100).toFixed(2)) : 0;

        const totalBacklogSup = supervisoresConBacklog.reduce((a, r) => a + Number(r.backlog || 0), 0);
        console.log(`[DASHBOARD VELSA] Supervisores: ${supervisoresConBacklog.length} | Barras: ${resDia.rows.length} | 3ra Edad: ${porcentajeTerceraEdad}% | Tarjeta: ${porcentajeTarjeta}% | Backlog Total: ${totalBacklogSup}`);

        const resultado = {
            success: true,
            supervisores: supervisoresConBacklog,
            asesores: asesoresConBacklog,
            dataCRM: resCRM.rows,
            dataNetlife: resNet.rows,
            estadosNetlife,
            graficoEmbudo: resEmbudo.rows,
            graficoBarrasDia: resDia.rows,
            etapasCRM: etapasCache.etapasCRM,   // viene del caché (sin query adicional)
            porcentajeTerceraEdad,
            porcentajeTarjeta,
            canales: etapasCache.canales,        // viene del caché (sin query adicional)
        };

        // Guardar en caché para solicitudes idénticas en los próximos 2 minutos
        setDashboardVelsaCache(cacheKey, resultado);
        res.json(resultado);

    } catch (error) {
        console.error("ERROR DASHBOARD VELSA:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ======================================================
// MONITOREO DIARIO
// ======================================================
const getMonitoreoDiarioVelsa = async (req, res) => {
    try {
        const hoy       = getFechaEcuador();
        const iniciomes = getPrimerDiaMesEcuador();

        console.log(`[MONITOREO VELSA] Consultando desde ${iniciomes} hasta ${hoy}`);

        const ETAPAS_GESTIONABLES = `('VOLVER A LLAMAR','NO INTERESA COSTO DEL PLAN','SEGUIMIENTO SIN CONTACTO','SEGUIMIENTO NEGOCIACION','VENTA SUBIDA','CONTACTO NUEVO','CLIENTE DISCAPACIDAD','CLIENTE DICAPACIDAD','DOCUMENTOS PENDIENTES','CERRAR NEGOCIACION','INNEGOCIABLE','NUNCA CONTESTO','GESTION DIARIA','MANTIENE PROVEEDOR','NO INTERESA COSTO DE INSTALACION','CONTRATA NETLIFE OTRO CANAL','CONTRATO OTRO PROVEEDOR','REFIRIO','RECEPCION DE DOCUMENTOS','RMKT AUTOMÁTICO','SEGUIMIENTO','CONTRATA NETLIFE OTRO DISTRIBUIDOR','INCONTACTABLE','NO INTERESA COSTO DE PLAN','NO INTERESA COSTO DE INSTALACIÓN','OPORTUNIDADES','DUPLICADO','NO VOLVER A CONTACTAR','LEADS NOVONET','POSTVENTA VELSA','RMKT AUTOMATICO')`;
        const ETAPAS_DESCARTE = `('NO INTERESA COSTO PLAN','INNEGOCIABLE','CONTRATO NETLIFE','CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA','OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','VENTA ECUANET DIRECTA','CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO','INCONTACTABLE','NO INTERESA COSTO INSTALACION','CONTRATO NETLIFE OTRO CANAL','CONTRATO OTRO PROVEEDOR')`;

        const queryMonitoreo = (columna) => `
            SELECT
                COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(*) FILTER (
                    WHERE vn.t1_hgl_created_at_fecha::date BETWEEN $1::date AND $2::date
                ) AS real_mes_leads,
                COUNT(*) FILTER (
                    WHERE ${parseFecha('vn.t1_hgl_created_at_fecha')} = $2::date
                    AND vn.t1_pipeline_stage_id IN ${ETAPAS_GESTIONABLES}
                ) AS real_dia_leads,
                COUNT(*) FILTER (
                    WHERE vn.t1_hgl_created_at_fecha::date BETWEEN $1::date AND $2::date
                ) AS crm_acumulado,
                COUNT(*) FILTER (
                    WHERE ${parseFecha('vn.t1_hgl_created_at_fecha')} = $2::date
                ) AS crm_dia,
                COUNT(*) FILTER (
                    WHERE ${parseFecha('vn.t1_hgl_created_at_fecha')} = $2::date
                    AND vn.t1_pipeline_stage_id = 'VENTA SUBIDA'
                ) AS v_subida_crm_hoy,
                ROUND(COALESCE(
                    COUNT(*) FILTER (
                        WHERE vn.t1_hgl_created_at_fecha::date BETWEEN $1::date AND $2::date
                        AND vn.t1_pipeline_stage_id IN ${ETAPAS_DESCARTE}
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE vn.t1_hgl_created_at_fecha::date BETWEEN $1::date AND $2::date
                        AND vn.t1_pipeline_stage_id IN ${ETAPAS_GESTIONABLES}
                    ), 0)
                , 0) * 100, 2) AS real_descarte,
                ROUND(COALESCE(
                    COUNT(*) FILTER (
                        WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
                        AND vn.t2_forma_pago ILIKE '%TARJETA DE CREDITO%'
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
                    ), 0)
                , 0) * 100, 2) AS real_tarjeta
            FROM ${dedupVN}
            WHERE (
                vn.t1_hgl_created_at_fecha::date BETWEEN $1::date AND $2::date
                OR ${parseFecha('vn.t1_hgl_created_at_fecha')} BETWEEN $1::date AND $2::date
            )
            GROUP BY 1
            ORDER BY real_mes_leads DESC
        `;

        const queryJotHoy = (columna) => `
            SELECT
                COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(*)::int AS v_subida_jot_hoy,
                COUNT(*) FILTER (WHERE vn.t2_estado_venta_netlife = 'ACTIVO')::int AS activos_jot_hoy,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE vn.t2_forma_pago ILIKE '%TARJETA DE CREDITO%')::numeric
                    / NULLIF(COUNT(*), 0)
                , 0) * 100, 2) AS real_efectividad
            FROM ${dedupVN}
            WHERE vn.t2_jot_created_at_fecha IS NOT NULL
            AND TRIM(vn.t2_jot_created_at_fecha::text) != ''
            AND vn.t2_jot_created_at_fecha::date = $1::date
            GROUP BY 1
        `;

        const [resSup, resAses, resJotSupHoy, resJotAsesHoy] = await Promise.all([
            pool.query(queryMonitoreo('vn.supervisor_asignado'), [iniciomes, hoy]),
            pool.query(queryMonitoreo('vn.t1_assigned_to'),      [iniciomes, hoy]),
            pool.query(queryJotHoy('vn.supervisor_asignado'),    [hoy]),
            pool.query(queryJotHoy('vn.t1_assigned_to'),         [hoy]),
        ]);

        const mergeJot = (filas, jotRows) => {
            return filas.map(row => {
                const jot = jotRows.find(j => j.nombre_grupo === row.nombre_grupo);
                return { ...row, v_subida_jot_hoy: jot ? Number(jot.v_subida_jot_hoy) : 0, activos_jot_hoy: jot ? Number(jot.activos_jot_hoy) : 0, real_efectividad: jot ? Number(jot.real_efectividad) : 0 };
            });
        };

        const supervisoresFinal = mergeJot(resSup.rows, resJotSupHoy.rows);
        const asesoresFinal     = mergeJot(resAses.rows, resJotAsesHoy.rows);

        console.log(`[MONITOREO VELSA] Supervisores: ${supervisoresFinal.length} | Asesores: ${asesoresFinal.length}`);

        res.json({ success: true, supervisores: supervisoresFinal, asesores: asesoresFinal });

    } catch (error) {
        console.error("ERROR MONITOREO VELSA:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ======================================================
// REPORTE 180°
// ======================================================
const getReporte180Velsa = async (req, res) => {
    try {
        const { asesor, supervisor, fechaDesde, fechaHasta, estadoNetlife, estadoRegularizacion, etapaCRM, etapaJotform } = req.query;

        const hoy   = getFechaEcuador();
        const desde = fechaDesde ? fechaDesde : hoy;
        const hasta = fechaHasta ? fechaHasta : hoy;

        let values  = [desde, hasta];
        let filters = "";

        if (asesor) { values.push(`%${asesor}%`); filters += ` AND vn.t1_assigned_to ILIKE $${values.length}`; }
        if (supervisor) { values.push(`%${supervisor}%`); filters += ` AND vn.supervisor_asignado ILIKE $${values.length}`; }
        if (estadoNetlife) { values.push(`%${estadoNetlife}%`); filters += ` AND vn.t2_estado_venta_netlife ILIKE $${values.length}`; }
        if (estadoRegularizacion) { values.push(`%${estadoRegularizacion}%`); filters += ` AND vn.t2_regularizado ILIKE $${values.length}`; }
        if (etapaCRM) { values.push(`%${etapaCRM}%`); filters += ` AND vn.t1_pipeline_stage_id ILIKE $${values.length}`; }
        if (etapaJotform) { values.push(`%${etapaJotform}%`); filters += ` AND vn.t2_estado_venta_netlife ILIKE $${values.length}`; }

        const ETAPAS_GESTIONABLES = `('VOLVER A LLAMAR','NO INTERESA COSTO DEL PLAN','SEGUIMIENTO SIN CONTACTO','SEGUIMIENTO NEGOCIACION','VENTA SUBIDA','CONTACTO NUEVO','CLIENTE DISCAPACIDAD','CLIENTE DICAPACIDAD','DOCUMENTOS PENDIENTES','CERRAR NEGOCIACION','INNEGOCIABLE','NUNCA CONTESTO','GESTION DIARIA','MANTIENE PROVEEDOR','NO INTERESA COSTO DE INSTALACION','CONTRATA NETLIFE OTRO CANAL','CONTRATO OTRO PROVEEDOR','REFIRIO','RECEPCION DE DOCUMENTOS','RMKT AUTOMÁTICO','SEGUIMIENTO','CONTRATA NETLIFE OTRO DISTRIBUIDOR','INCONTACTABLE','NO INTERESA COSTO DE PLAN','NO INTERESA COSTO DE INSTALACIÓN','OPORTUNIDADES','DUPLICADO','NO VOLVER A CONTACTAR','LEADS NOVONET','POSTVENTA VELSA','RMKT AUTOMATICO')`;
        const ETAPAS_DESCARTE = `('NO INTERESA COSTO PLAN','INNEGOCIABLE','CONTRATO NETLIFE','CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA','OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','VENTA ECUANET DIRECTA','CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO','INCONTACTABLE','NO INTERESA COSTO INSTALACION','CONTRATO NETLIFE OTRO CANAL','CONTRATO OTRO PROVEEDOR')`;

        const queryKPIs = `
            SELECT
                COUNT(*) FILTER (
                    WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
                ) AS ingresos_jot,
                COUNT(*) FILTER (
                    WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
                    AND vn.t2_estado_venta_netlife = ${ESTADO_ACTIVO}
                ) AS ventas_activas,
                ROUND(COALESCE(
                    COUNT(*) FILTER (
                        WHERE vn.t1_pipeline_stage_id IN ${ETAPAS_DESCARTE}
                        AND ${parseFecha('vn.t1_hgl_created_at_fecha')} BETWEEN $1::date AND $2::date
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE (${parseFecha('vn.t2_jot_created_at_fecha')} BETWEEN $1::date AND $2::date
                            OR ${parseFecha('vn.t1_hgl_created_at_fecha')} BETWEEN $1::date AND $2::date)
                        AND vn.t1_pipeline_stage_id IN ${ETAPAS_GESTIONABLES}
                    ), 0)
                , 0) * 100, 2) AS pct_descarte,
                ROUND(COALESCE(
                    COUNT(*) FILTER (
                        WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE (${parseFecha('vn.t2_jot_created_at_fecha')} BETWEEN $1::date AND $2::date
                            OR ${parseFecha('vn.t1_hgl_created_at_fecha')} BETWEEN $1::date AND $2::date)
                        AND vn.t1_pipeline_stage_id IN ${ETAPAS_GESTIONABLES}
                    ), 0)
                , 0) * 100, 2) AS pct_efectividad,
                ROUND(COALESCE(
                    COUNT(*) FILTER (
                        WHERE vn.t2_aplica_descuento ILIKE '%TERCERA EDAD%'
                        AND vn.t2_estado_venta_netlife = ${ESTADO_ACTIVO}
                        AND vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE vn.t2_estado_venta_netlife = ${ESTADO_ACTIVO}
                        AND vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
                    ), 0)
                , 0) * 100, 2) AS pct_tercera_edad
            FROM ${dedupVN}
            WHERE (
                ${parseFecha('vn.t1_hgl_created_at_fecha')} BETWEEN $1::date AND $2::date
                OR vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
            ) ${filters}
        `;

        const queryEmbudoCRM = `
            SELECT
                COALESCE(vn.t1_pipeline_stage_id, 'SIN ETAPA') AS etapa,
                COUNT(*)::int AS total
            FROM ${dedupVN}
            WHERE ${parseFecha('vn.t1_hgl_created_at_fecha')} BETWEEN $1::date AND $2::date
            ${filters}
            GROUP BY vn.t1_pipeline_stage_id
            ORDER BY total DESC
        `;

        const queryEmbudoJotform = `
            SELECT
                COALESCE(vn.t2_estado_venta_netlife, 'SIN ESTADO') AS etapa,
                COUNT(*)::int AS total
            FROM ${dedupVN}
            WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
            ${filters}
            GROUP BY vn.t2_estado_venta_netlife
            ORDER BY total DESC
        `;

        const queryMapaCalor = `
            SELECT
                TRIM(vn.t2_jot_created_at_fecha::text) AS fecha,
                COALESCE(TRIM(vn.t2_ciudad), 'SIN CIUDAD') AS ciudad,
                COUNT(*)::int AS total
            FROM ${dedupVN}
            WHERE vn.t2_jot_created_at_fecha IS NOT NULL
            AND TRIM(vn.t2_jot_created_at_fecha::text) != ''
            AND vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
            AND vn.t2_ciudad IS NOT NULL
            AND TRIM(vn.t2_ciudad) != ''
            ${filters}
            GROUP BY 1, 2
            ORDER BY 1 ASC, 3 DESC
        `;

        const [resKPIs, resEmbCRM, resEmbJot, resMapaCalor] = await Promise.all([
            pool.query(queryKPIs,          values),
            pool.query(queryEmbudoCRM,     values),
            pool.query(queryEmbudoJotform, values),
            pool.query(queryMapaCalor,     values),
        ]);

        const kpis = resKPIs.rows[0] || {};
        console.log(`[REPORTE180 VELSA] Ejecutado desde ${desde} hasta ${hasta}`);

        res.json({
            success: true,
            kpis: {
                ingresos_jot:     Number(kpis.ingresos_jot     || 0),
                ventas_activas:   Number(kpis.ventas_activas   || 0),
                pct_descarte:     Number(kpis.pct_descarte     || 0),
                pct_efectividad:  Number(kpis.pct_efectividad  || 0),
                pct_tercera_edad: Number(kpis.pct_tercera_edad || 0),
            },
            embudoCRM:     resEmbCRM.rows,
            embudoJotform: resEmbJot.rows,
            mapaCalor:     resMapaCalor.rows,
        });

    } catch (error) {
        console.error("ERROR REPORTE180 VELSA:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTA Y DESCARGA — vw_jotform_velsa_netlife_completo
// ─────────────────────────────────────────────────────────────────────────────
const getConsultaDescargaVelsa = async (req, res) => {
    try {
        const { fechaDesde, fechaHasta } = req.query;
        if (!fechaDesde || !fechaHasta) {
            return res.status(400).json({ success: false, error: 'Parámetros fechaDesde y fechaHasta requeridos' });
        }

        const result = await pool.query(`
            SELECT
                created_at,
                id_bitrix_ghl,
                codigo_asesor,
                plan_casa,
                plan_profesional,
                plan_pyme,
                plan_hogar_adulto_mayor,
                aplica_descuento,
                servicio_normales,
                inicio_sesion_netlife,
                estado_venta_netlife,
                forma_pago,
                ingreso_telcos_vendedores,
                fecha_agenda,
                fecha_activacion_telcos,
                provincia,
                ciudad,
                observacion_venta,
                estado_regularizacion_novo,
                detalle_regularizacion
            FROM vw_jotform_velsa_netlife_completo
            WHERE created_at::date BETWEEN $1 AND $2
            ORDER BY created_at ASC
            LIMIT 100000
        `, [fechaDesde, fechaHasta]);

        res.json({
            success: true,
            total: result.rows.length,
            rows: result.rows
        });
    } catch (error) {
        console.error("ERROR CONSULTA DESCARGA VELSA:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    getIndicadoresDashboardVelsa,
    getMonitoreoDiarioVelsa,
    getReporte180Velsa,
    getConsultaDescargaVelsa
};