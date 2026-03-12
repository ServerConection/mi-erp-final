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

const dedupVN = `(
    SELECT DISTINCT ON (id_unificado) *
    FROM public.velsa_netlife_maestra_cons
    ORDER BY id_unificado, t1_hgl_updated_at_fecha DESC NULLS LAST
) vn`;

const getIndicadoresDashboardVelsa = async (req, res) => {
    try {
        const { asesor, supervisor, fechaDesde, fechaHasta, estadoNetlife, estadoRegularizacion, etapaCRM, etapaJotform } = req.query;

        const hoy = getFechaEcuador();
        const desde = fechaDesde ? fechaDesde : hoy;
        const hasta = fechaHasta ? fechaHasta : hoy;

        let values = [desde, hasta];
        let filters = "";

        if (asesor) {
            values.push(`%${asesor}%`);
            filters += ` AND vn.t1_assigned_to ILIKE $${values.length}`;
        }
        if (supervisor) {
            values.push(`%${supervisor}%`);
            filters += ` AND vn.supervisor_asignado ILIKE $${values.length}`;
        }
        if (estadoNetlife) {
            values.push(`%${estadoNetlife}%`);
            filters += ` AND vn.t2_estado_venta_netlife ILIKE $${values.length}`;
        }
        if (estadoRegularizacion) {
            values.push(`%${estadoRegularizacion}%`);
            filters += ` AND vn.t2_regularizado ILIKE $${values.length}`;
        }
        if (etapaCRM) {
            values.push(`%${etapaCRM}%`);
            filters += ` AND vn.t1_pipeline_stage_id ILIKE $${values.length}`;
        }
        if (etapaJotform) {
            values.push(`%${etapaJotform}%`);
            filters += ` AND vn.t2_estado_venta_netlife ILIKE $${values.length}`;
        }

        const ETAPAS_GESTIONABLES = `(
            'CONTACTO NUEVO','DOCUMENTOS PENDIENTES','NO INTERESA COSTO PLAN','VOLVER A LLAMAR',
            'GESTION DIARIA','VENTA SUBIDA','SEGUIMIENTO NEGOCIACIÓN','INNEGOCIABLE','CONTRATO NETLIFE',
            'CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA',
            'OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','OPORTUNIDADES',
            'VENTA ECUANET DIRECTA','VENTA DIRECTA ECUANET','GESTIÓN DIARIA',
            'SEGUIMIENTO NEGOCIACIÓN CON CONTACTO','SEGUIMIENTO SIN CONTACTO',
            'CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO',
            'SEGUIMIENTO NEGOCIACIÓN','DESCARTE PLAN DE 200',
            'SEGUIMIENTO PLAN 200'
        )`;

        const ETAPAS_DESCARTE = `(
            'NO INTERESA COSTO PLAN','INNEGOCIABLE','CONTRATO NETLIFE','CLIENTE DISCAPACIDAD',
            'OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA','OTRO PROVEEDOR',
            'NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','VENTA ECUANET DIRECTA',
            'CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO'
        )`;

        const queryKPI = (columna) => `
SELECT
    COALESCE(NULLIF(TRIM(${columna}::text), ''), 'SIN ASIGNAR') AS nombre_grupo,

    COUNT(DISTINCT vn.id_unificado) FILTER (
        WHERE ${parseFecha('vn.t1_hgl_created_at_fecha')} BETWEEN $1::date AND $2::date
    ) AS leads_totales,

    COUNT(DISTINCT vn.id_unificado) FILTER (
        WHERE vn.t1_hgl_created_at_fecha::date BETWEEN $1::date AND $2::date
        AND vn.t1_pipeline_stage_id = 'VENTA SUBIDA'
    ) AS ventas_crm,

    ROUND(
        COALESCE(
            COUNT(DISTINCT vn.id_unificado) FILTER (
                WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
            )::numeric
            /
            NULLIF(
                COUNT(DISTINCT vn.id_unificado) FILTER (
                    WHERE vn.t1_hgl_created_at_fecha::date BETWEEN $1::date AND $2::date
                    AND vn.t1_pipeline_stage_id IN ${ETAPAS_GESTIONABLES}
                ),
                0
            ),
            0
        ) * 100,
        2
    ) AS efectividad_realz,

    COUNT(DISTINCT vn.id_unificado) FILTER (
        WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
        AND vn.t2_regularizado = 'POR REGULARIZAR'
    ) AS por_regularizar,

    COUNT(DISTINCT vn.id_unificado) FILTER (
        WHERE (
            ${parseFecha('vn.t2_jot_created_at_fecha')} BETWEEN $1::date AND $2::date
            OR ${parseFecha('vn.t1_hgl_created_at_fecha')} BETWEEN $1::date AND $2::date
        )
        AND vn.t1_pipeline_stage_id IN ${ETAPAS_GESTIONABLES}
    ) AS gestionables,

    COUNT(DISTINCT vn.id_unificado) FILTER (
        WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
    ) AS ingresos_reales,

    COUNT(DISTINCT vn.id_unificado) FILTER (
        WHERE EXTRACT(YEAR FROM vn.t2_fecha_activacion_telcos::date) = 2026
        AND TRIM(TO_CHAR(vn.t2_fecha_activacion_telcos::date, 'Month')) ILIKE 'March'
    ) AS activas,

    COUNT(DISTINCT vn.id_unificado) FILTER (
        WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
        AND vn.t2_estado_venta_netlife = 'ACTIVO'
        AND vn.t1_hgl_updated_at_fecha IS NOT NULL
    ) AS real_mes,

    (
        COUNT(DISTINCT vn.id_unificado) FILTER (
            WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
            AND EXTRACT(YEAR FROM vn.t2_fecha_activacion_telcos::date) = 2026
            AND TRIM(TO_CHAR(vn.t2_fecha_activacion_telcos::date, 'Month')) ILIKE 'March'
            AND vn.t1_hgl_updated_at_fecha IS NOT NULL
        )
        +
        COUNT(DISTINCT vn.id_unificado) FILTER (
            WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
            AND EXTRACT(YEAR FROM vn.t2_fecha_activacion_telcos::date) = 2026
            AND TRIM(TO_CHAR(vn.t2_fecha_activacion_telcos::date, 'Month')) ILIKE 'March'
            AND vn.t1_hgl_updated_at_fecha IS NULL
        )
    ) AS total_activas_calculada,

    0 AS crec_vs_ma,
    0 AS backlog,

    COUNT(DISTINCT vn.id_unificado) FILTER (
        WHERE vn.t2_forma_pago = 'TARJETA DE CREDITO.'
        AND vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
    ) AS tarjeta_credito,

    COUNT(DISTINCT vn.id_unificado) FILTER (
        WHERE vn.t2_aplica_descuento ILIKE '%TERCERA EDAD%'
        AND vn.t2_estado_venta_netlife ILIKE '%ACTIVO%'
        AND vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
    ) AS tercera_edad,

    (
        COUNT(DISTINCT vn.id_unificado) FILTER (
            WHERE vn.t1_pipeline_stage_id IN ${ETAPAS_DESCARTE}
            AND ${parseFecha('vn.t1_hgl_created_at_fecha')} BETWEEN $1::date AND $2::date
        )::numeric
        /
        NULLIF(
            COUNT(DISTINCT vn.id_unificado) FILTER (
                WHERE (
                    ${parseFecha('vn.t2_jot_created_at_fecha')} BETWEEN $1::date AND $2::date
                    OR ${parseFecha('vn.t1_hgl_created_at_fecha')} BETWEEN $1::date AND $2::date
                )
                AND vn.t1_pipeline_stage_id IN ${ETAPAS_GESTIONABLES}
            ),
            0
        ) * 100
    )::numeric(10,2) AS descarte,

    COUNT(DISTINCT vn.id_unificado) FILTER (
        WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
        AND vn.t2_estado_venta_netlife NOT IN ('FUERA DE COBERTURA','DESISTE DEL SERVICIO','RECHAZADO')
        AND vn.t2_regularizado = 'POR REGULARIZAR'
    ) AS regularizacion,

    ROUND(
        COALESCE(
            COUNT(DISTINCT vn.id_unificado) FILTER (
                WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
            )::numeric
            /
            NULLIF(
                COUNT(DISTINCT vn.id_unificado) FILTER (
                    WHERE (
                        ${parseFecha('vn.t2_jot_created_at_fecha')} BETWEEN $1::date AND $2::date
                        OR ${parseFecha('vn.t1_hgl_created_at_fecha')} BETWEEN $1::date AND $2::date
                    )
                    AND vn.t1_pipeline_stage_id IN ${ETAPAS_GESTIONABLES}
                ),
                0
            ),
            0
        ) * 100,
        2
    ) AS efectividad_real,

    ROUND(
        COALESCE(
            COUNT(DISTINCT vn.id_unificado) FILTER (
                WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
                AND vn.t2_estado_venta_netlife = 'ACTIVO'
            )::numeric
            /
            NULLIF(
                COUNT(DISTINCT vn.id_unificado) FILTER (
                    WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
                ),
                0
            ),
            0
        ) * 100,
        2
    ) AS tasa_instalacion,

    ROUND(
        COALESCE(
            COUNT(DISTINCT vn.id_unificado) FILTER (
                WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
                AND vn.t2_estado_venta_netlife = 'ACTIVO'
            )::numeric
            /
            NULLIF(
                COUNT(DISTINCT vn.id_unificado) FILTER (
                    WHERE (
                        ${parseFecha('vn.t2_jot_created_at_fecha')} BETWEEN $1::date AND $2::date
                        OR ${parseFecha('vn.t1_hgl_created_at_fecha')} BETWEEN $1::date AND $2::date
                    )
                    AND vn.t1_pipeline_stage_id IN ${ETAPAS_GESTIONABLES}
                ),
                0
            ),
            0
        ) * 100,
        2
    ) AS efectividad_activas_vs_pauta,

    ROUND(
        COALESCE(
            COUNT(DISTINCT vn.id_unificado) FILTER (
                WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
                AND vn.t2_estado_venta_netlife NOT IN ('PRESERVICIO','DESISTE DEL SERVICIO')
            )::numeric
            /
            NULLIF(
                COUNT(DISTINCT vn.id_unificado) FILTER (
                    WHERE ${parseFecha('vn.t1_hgl_created_at_fecha')} BETWEEN $1::date AND $2::date
                    AND vn.t1_pipeline_stage_id IN ${ETAPAS_GESTIONABLES}
                ),
                0
            ),
            0
        ) * 100,
        2
    ) AS eficiencia

FROM ${dedupVN}
WHERE (
    ${parseFecha('vn.t1_hgl_created_at_fecha')} BETWEEN $1::date AND $2::date
    OR vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
)
${filters}
GROUP BY 1
ORDER BY gestionables DESC
`;

        const queryBacklog = (columna) => `
            SELECT
                COALESCE(NULLIF(TRIM(${columna}::text), ''), 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(*)::int AS backlog
            FROM ${dedupVN}
            WHERE vn.t2_estado_venta_netlife = 'ACTIVO'
            AND vn.t2_jot_created_at_fecha IS NOT NULL
            AND TRIM(vn.t2_jot_created_at_fecha::text) != ''
            AND vn.t2_jot_created_at_fecha::date < $1::date
            AND vn.t2_fecha_activacion_telcos IS NOT NULL
            AND TRIM(vn.t2_fecha_activacion_telcos::text) != ''
            AND vn.t2_fecha_activacion_telcos::date >= $1::date
            AND vn.t2_fecha_activacion_telcos::date <= $2::date
            ${filters}
            GROUP BY 1
        `;

        const queryCRM = `
            SELECT
                vn.id_unificado                  AS "ID_CRM",
                vn.t1_pipeline_stage_id          AS "ETAPA_CRM",
                vn.t1_hgl_created_at_fecha        AS "FECHA_CREACION_CRM",
                vn.t1_assigned_to                 AS "ASESOR",
                vn.t1_hgl_created_at_hora         AS "HORA_CREACION",
                vn.supervisor_asignado            AS "SUPERVISOR_ASIGNADO",
                vn.t1_hgl_updated_at_fecha        AS "FECHA_MODIFICACION",
                vn.t1_hgl_updated_at_hora         AS "HORA_MODIFICACION",
                vn.t1_relation_tags               AS "ORIGEN",
                vn.ventasdiajot                   AS "VENTAS_DIA_JOT",
                vn.t1_phone                       AS "TELEFONO",
                vn.t2_ciudad                      AS "CIUDAD",
                vn.t2_estado_venta_netlife        AS "ESTADO_NETLIFE",
                vn.t2_jot_created_at_fecha        AS "FECHA_JOT",
                vn.t2_regularizado                AS "ESTADO_REGULARIZACION"
            FROM ${dedupVN}
            WHERE ${parseFecha('vn.t1_hgl_created_at_fecha')} BETWEEN $1::date AND $2::date
            ${filters}
        `;

        const queryJotform = `
            SELECT
                vn.t2_jot_created_at_fecha        AS "FECHA_CREACION_JOT",
                vn.t2_id_bitrix_ghl               AS "ID_CRM",
                vn.t2_estado_venta_netlife        AS "ESTADO_NETLIFE",
                vn.t2_fecha_activacion_telcos     AS "FECHA_ACTIVACION",
                vn.t2_clausulas                   AS "NOVEDADES_ATC",
                vn.t2_regularizado                AS "ESTADO_REGULARIZACION",
                vn.t2_estado_regularizacion_novo  AS "MOTIVO_REGULARIZAR",
                vn.t2_forma_pago                  AS "FORMA_PAGO",
                vn.t1_assigned_to                 AS "ASESOR",
                vn.supervisor_asignado            AS "SUPERVISOR_ASIGNADO",
                vn.t1_phone                       AS "TELF",
                vn.t2_inicio_sesion_netlife        AS "LOGIN",
                vn.t2_ciudad                      AS "CIUDAD",
                vn.t2_aplica_descuento            AS "TERCERA_EDAD",
                vn.t1_pipeline_stage_id           AS "ETAPA_CRM"
            FROM ${dedupVN}
            WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
            ${filters}
        `;

        // ✅ CORRECCIÓN: query dinámica — devuelve TODOS los estados reales, no pivot fijo
        const queryEstados = `
            SELECT
                COALESCE(NULLIF(TRIM(vn.t2_estado_venta_netlife::text), ''), 'SIN ESTADO') AS estado,
                COUNT(DISTINCT vn.id_unificado)::int AS total
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

        const queryEtapasCRM = `
            SELECT DISTINCT vn.t1_pipeline_stage_id AS etapa
            FROM ${dedupVN}
            WHERE vn.t1_pipeline_stage_id IS NOT NULL
            AND TRIM(vn.t1_pipeline_stage_id) <> ''
            ORDER BY etapa ASC
        `;

        const queryTerceraEdad = `
            SELECT
                COUNT(*) FILTER (
                    WHERE vn.t2_aplica_descuento ILIKE '%TERCERA EDAD%'
                    AND vn.t2_estado_venta_netlife ILIKE '%ACTIVO%'
                ) AS total_tercera_edad,
                COUNT(*) FILTER (
                    WHERE vn.t2_estado_venta_netlife ILIKE '%ACTIVO%'
                ) AS total_activos
            FROM ${dedupVN}
            WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
            ${filters}
        `;

        const queryTarjeta = `
            SELECT
                COUNT(*) FILTER (
                    WHERE vn.t2_forma_pago ILIKE '%TARJETA DE CREDITO%'
                ) AS total_tarjeta,
                COUNT(*) AS total_jotform
            FROM ${dedupVN}
            WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
            ${filters}
        `;

        const [resSup, resAses, resCRM, resNet, resEstados, resEmbudo, resDia, resEtapasCRM, resTerceraEdad, resTarjeta, resBacklogSup, resBacklogAses] = await Promise.all([
            pool.query(queryKPI('vn.supervisor_asignado'), values),
            pool.query(queryKPI('vn.t1_assigned_to'), values),
            pool.query(queryCRM, values),
            pool.query(queryJotform, values),
            pool.query(queryEstados, values),
            pool.query(queryEmbudo, values),
            pool.query(queryPorDia, values),
            pool.query(queryEtapasCRM),
            pool.query(queryTerceraEdad, values),
            pool.query(queryTarjeta, values),
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

        // ✅ CORRECCIÓN: procesamiento dinámico — ya no mapea pivot fijo
        const estadosNetlife = resEstados.rows.map(row => ({
            estado: row.estado,
            total:  Number(row.total || 0),
        }));

        const rowTercera          = resTerceraEdad.rows[0] || {};
        const totalTerceraEdad    = Number(rowTercera.total_tercera_edad || 0);
        const totalActivosTercera = Number(rowTercera.total_activos || 0);
        const porcentajeTerceraEdad = totalActivosTercera > 0
            ? Number(((totalTerceraEdad / totalActivosTercera) * 100).toFixed(2))
            : 0;

        const rowTarjeta          = resTarjeta.rows[0] || {};
        const totalTarjeta        = Number(rowTarjeta.total_tarjeta || 0);
        const totalJotformTarjeta = Number(rowTarjeta.total_jotform || 0);
        const porcentajeTarjeta   = totalJotformTarjeta > 0
            ? Number(((totalTarjeta / totalJotformTarjeta) * 100).toFixed(2))
            : 0;

        const totalBacklogSup = supervisoresConBacklog.reduce((a, r) => a + Number(r.backlog || 0), 0);
        console.log(`[DASHBOARD VELSA] Supervisores: ${supervisoresConBacklog.length} | Barras: ${resDia.rows.length} | 3ra Edad: ${porcentajeTerceraEdad}% | Tarjeta: ${porcentajeTarjeta}% | Backlog Total: ${totalBacklogSup}`);

        res.json({
            success: true,
            supervisores: supervisoresConBacklog,
            asesores: asesoresConBacklog,
            dataCRM: resCRM.rows,
            dataNetlife: resNet.rows,
            estadosNetlife,
            graficoEmbudo: resEmbudo.rows,
            graficoBarrasDia: resDia.rows,
            etapasCRM: resEtapasCRM.rows.map(r => r.etapa),
            porcentajeTerceraEdad,
            porcentajeTarjeta,
        });

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
        const hoy        = getFechaEcuador();
        const iniciomes  = getPrimerDiaMesEcuador();

        console.log(`[MONITOREO VELSA] Consultando desde ${iniciomes} hasta ${hoy}`);

        const ETAPAS_GESTIONABLES = "('CONTACTO NUEVO','DOCUMENTOS PENDIENTES','NO INTERESA COSTO PLAN','VOLVER A LLAMAR','GESTION DIARIA','VENTA SUBIDA','SEGUIMIENTO NEGOCIACIÓN','INNEGOCIABLE','CONTRATO NETLIFE','CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA','OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','OPORTUNIDADES','VENTA ECUANET DIRECTA','VENTA DIRECTA ECUANET','GESTIÓN DIARIA','SEGUIMIENTO NEGOCIACIÓN CON CONTACTO','SEGUIMIENTO SIN CONTACTO','CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO','DESCARTE PLAN DE 200','SEGUIMIENTO PLAN 200')";

        const ETAPAS_DESCARTE = "('NO INTERESA COSTO PLAN','INNEGOCIABLE','CONTRATO NETLIFE','CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA','OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','VENTA ECUANET DIRECTA','CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO')";

        const queryMonitoreo = (columna) => `
            SELECT
                COALESCE(NULLIF(TRIM(${columna}::text), ''), 'SIN ASIGNAR') AS nombre_grupo,

                COUNT(DISTINCT vn.id_unificado) FILTER (
                    WHERE vn.t1_hgl_created_at_fecha::date BETWEEN $1::date AND $2::date
                ) AS real_mes_leads,

                COUNT(DISTINCT vn.id_unificado) FILTER (
                    WHERE ${parseFecha('vn.t1_hgl_created_at_fecha')} = $2::date
                    AND vn.t1_pipeline_stage_id IN ${ETAPAS_GESTIONABLES}
                ) AS real_dia_leads,

                COUNT(DISTINCT vn.id_unificado) FILTER (
                    WHERE vn.t1_hgl_created_at_fecha::date BETWEEN $1::date AND $2::date
                ) AS crm_acumulado,

                COUNT(DISTINCT vn.id_unificado) FILTER (
                    WHERE ${parseFecha('vn.t1_hgl_created_at_fecha')} = $2::date
                ) AS crm_dia,

                COUNT(DISTINCT vn.id_unificado) FILTER (
                    WHERE ${parseFecha('vn.t1_hgl_created_at_fecha')} = $2::date
                    AND vn.t1_pipeline_stage_id = 'VENTA SUBIDA'
                ) AS v_subida_crm_hoy,

                ROUND(COALESCE(
                    COUNT(DISTINCT vn.id_unificado) FILTER (
                        WHERE vn.t1_hgl_created_at_fecha::date BETWEEN $1::date AND $2::date
                        AND vn.t1_pipeline_stage_id IN ${ETAPAS_DESCARTE}
                    )::numeric
                    / NULLIF(COUNT(DISTINCT vn.id_unificado) FILTER (
                        WHERE vn.t1_hgl_created_at_fecha::date BETWEEN $1::date AND $2::date
                        AND vn.t1_pipeline_stage_id IN ${ETAPAS_GESTIONABLES}
                    ), 0)
                , 0) * 100, 2) AS real_descarte,

                ROUND(COALESCE(
                    COUNT(DISTINCT vn.id_unificado) FILTER (
                        WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
                        AND vn.t2_forma_pago ILIKE '%TARJETA DE CREDITO%'
                    )::numeric
                    / NULLIF(COUNT(DISTINCT vn.id_unificado) FILTER (
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

        const queryJotHoyFinal = (columna) => `
            SELECT
                COALESCE(NULLIF(TRIM(${columna}::text), ''), 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(*)::int AS v_subida_jot_hoy,
                0::numeric AS real_efectividad
            FROM ${dedupVN}
            WHERE vn.t2_jot_created_at_fecha IS NOT NULL
            AND TRIM(vn.t2_jot_created_at_fecha::text) != ''
            AND vn.t2_jot_created_at_fecha::date = $1::date
            GROUP BY 1
        `;

        const [resSup, resAses, resJotSupHoy, resJotAsesHoy] = await Promise.all([
            pool.query(queryMonitoreo('vn.supervisor_asignado'), [iniciomes, hoy]),
            pool.query(queryMonitoreo('vn.t1_assigned_to'),      [iniciomes, hoy]),
            pool.query(queryJotHoyFinal('vn.supervisor_asignado'), [hoy]),
            pool.query(queryJotHoyFinal('vn.t1_assigned_to'),      [hoy]),
        ]);

        const mergeJot = (filas, jotRows) => {
            return filas.map(row => {
                const jot = jotRows.find(j => j.nombre_grupo === row.nombre_grupo);
                return {
                    ...row,
                    v_subida_jot_hoy: jot ? Number(jot.v_subida_jot_hoy) : 0,
                    real_efectividad: jot ? Number(jot.real_efectividad)  : 0,
                };
            });
        };

        const supervisoresFinal = mergeJot(resSup.rows, resJotSupHoy.rows);
        const asesoresFinal     = mergeJot(resAses.rows, resJotAsesHoy.rows);

        console.log(`[MONITOREO VELSA] Supervisores: ${supervisoresFinal.length} | Asesores: ${asesoresFinal.length}`);
        console.log(`[MONITOREO VELSA DEBUG] Hoy: ${hoy} | Inicio mes: ${iniciomes}`);
        if (supervisoresFinal.length > 0) {
            console.log(`[MONITOREO VELSA DEBUG] Primer sup => real_dia_leads: ${supervisoresFinal[0].real_dia_leads} | v_subida_jot_hoy: ${supervisoresFinal[0].v_subida_jot_hoy}`);
        }

        res.json({
            success: true,
            supervisores: supervisoresFinal,
            asesores: asesoresFinal,
        });

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

        if (asesor) {
            values.push(`%${asesor}%`);
            filters += ` AND vn.t1_assigned_to ILIKE $${values.length}`;
        }
        if (supervisor) {
            values.push(`%${supervisor}%`);
            filters += ` AND vn.supervisor_asignado ILIKE $${values.length}`;
        }
        if (estadoNetlife) {
            values.push(`%${estadoNetlife}%`);
            filters += ` AND vn.t2_estado_venta_netlife ILIKE $${values.length}`;
        }
        if (estadoRegularizacion) {
            values.push(`%${estadoRegularizacion}%`);
            filters += ` AND vn.t2_regularizado ILIKE $${values.length}`;
        }
        if (etapaCRM) {
            values.push(`%${etapaCRM}%`);
            filters += ` AND vn.t1_pipeline_stage_id ILIKE $${values.length}`;
        }
        if (etapaJotform) {
            values.push(`%${etapaJotform}%`);
            filters += ` AND vn.t2_estado_venta_netlife ILIKE $${values.length}`;
        }

        const ETAPAS_GESTIONABLES = `(
            'CONTACTO NUEVO','DOCUMENTOS PENDIENTES','NO INTERESA COSTO PLAN','VOLVER A LLAMAR',
            'GESTION DIARIA','VENTA SUBIDA','SEGUIMIENTO NEGOCIACIÓN','INNEGOCIABLE','CONTRATO NETLIFE',
            'CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA',
            'OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','OPORTUNIDADES',
            'VENTA ECUANET DIRECTA','VENTA DIRECTA ECUANET','GESTIÓN DIARIA',
            'SEGUIMIENTO NEGOCIACIÓN CON CONTACTO','SEGUIMIENTO SIN CONTACTO',
            'CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO',
            'SEGUIMIENTO NEGOCIACIÓN','DESCARTE PLAN DE 200',
            'SEGUIMIENTO PLAN 200'
        )`;

        const ETAPAS_DESCARTE = `(
            'NO INTERESA COSTO PLAN','INNEGOCIABLE','CONTRATO NETLIFE','CLIENTE DISCAPACIDAD',
            'OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA','OTRO PROVEEDOR',
            'NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','VENTA ECUANET DIRECTA',
            'CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO'
        )`;

        const queryKPIs = `
            SELECT
                COUNT(*) FILTER (
                    WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
                ) AS ingresos_jot,
                COUNT(*) FILTER (
                    WHERE vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
                    AND vn.t2_estado_venta_netlife ILIKE '%ACTIVO%'
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
                -- ✅ CORRECCIÓN: campo correcto t2_aplica_descuento
                ROUND(COALESCE(
                    COUNT(*) FILTER (
                        WHERE vn.t2_aplica_descuento ILIKE '%TERCERA EDAD%'
                        AND vn.t2_estado_venta_netlife ILIKE '%ACTIVO%'
                        AND vn.t2_jot_created_at_fecha::date BETWEEN $1::date AND $2::date
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE vn.t2_estado_venta_netlife ILIKE '%ACTIVO%'
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
                ingresos_jot:      Number(kpis.ingresos_jot      || 0),
                ventas_activas:    Number(kpis.ventas_activas    || 0),
                pct_descarte:      Number(kpis.pct_descarte      || 0),
                pct_efectividad:   Number(kpis.pct_efectividad   || 0),
                pct_tercera_edad:  Number(kpis.pct_tercera_edad  || 0),
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

module.exports = {
    getIndicadoresDashboardVelsa,
    getMonitoreoDiarioVelsa,
    getReporte180Velsa
};