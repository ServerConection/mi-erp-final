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

const getIndicadoresDashboard = async (req, res) => {
    try {
        const { asesor, supervisor, fechaDesde, fechaHasta, estadoNetlife, estadoRegularizacion, etapaCRM, etapaJotform } = req.query;

        const hoy = getFechaEcuador();
        const desde = fechaDesde ? fechaDesde : hoy;
        const hasta = fechaHasta ? fechaHasta : hoy;

        let values = [desde, hasta];
        let filters = "";

        if (asesor) {
            values.push(`%${asesor}%`);
            filters += ` AND mb.b_persona_responsable ILIKE $${values.length}`;
        }
        if (supervisor) {
            values.push(`%${supervisor}%`);
            filters += ` AND e.supervisor ILIKE $${values.length}`;
        }
        if (estadoNetlife) {
            values.push(`%${estadoNetlife}%`);
            filters += ` AND mb.j_netlife_estatus_real ILIKE $${values.length}`;
        }
        if (estadoRegularizacion) {
            values.push(`%${estadoRegularizacion}%`);
            filters += ` AND mb.j_estatus_regularizacion ILIKE $${values.length}`;
        }
        if (etapaCRM) {
            values.push(`%${etapaCRM}%`);
            filters += ` AND mb.b_etapa_de_la_negociacion ILIKE $${values.length}`;
        }
        if (etapaJotform) {
            values.push(`%${etapaJotform}%`);
            filters += ` AND mb.j_netlife_estatus_real ILIKE $${values.length}`;
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
                COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(*) FILTER (WHERE ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date) AS leads_totales,
                COUNT(*) FILTER (
                    WHERE mb.b_cerrado::date BETWEEN $1::date AND $2::date
                    AND mb.b_etapa_de_la_negociacion = 'VENTA SUBIDA'
                ) AS ventas_crm,
                ROUND( COALESCE( COUNT(*) FILTER ( WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date )::numeric / NULLIF( COUNT(*) FILTER ( WHERE mb.b_cerrado::date BETWEEN $1::date AND $2::date AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_GESTIONABLES} ), 0), 0 ) * 100, 2) AS efectividad_realz,
                COUNT(*) FILTER (
                    WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND mb.j_estatus_regularizacion = 'POR REGULARIZAR'
                ) AS por_regularizar,
                COUNT(*) FILTER (
                    WHERE (${parseFecha('mb.j_fecha_registro_sistema')} BETWEEN $1::date AND $2::date OR ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date)
                    AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_GESTIONABLES}
                ) AS gestionables,
                COUNT(*) FILTER (
                    WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                ) AS ingresos_reales,
                COUNT(*) FILTER (
                    WHERE mb.j_año_activacion_netlife = '2026' AND mb.j_mes_activacion_netlife = 'Febrero'
                ) AS activas,
                COUNT(*) FILTER (
                    WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND mb.j_netlife_estatus_real = 'ACTIVO'
                ) AS real_mes,
                COUNT(*) FILTER (
    WHERE mb.j_fecha_activacion_netlife::date >= $1::date
   
    AND mb.j_netlife_estatus_real = 'ACTIVO'
    AND mb.j_fecha_registro_sistema::date < $1::date
) AS backlog,
                (
                    COUNT(*) FILTER (WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date AND mb.j_año_activacion_netlife = '2026' AND mb.j_mes_activacion_netlife = 'Marzo' AND mb.b_fecha_venta_subida IS NOT NULL) +
                    COUNT(*) FILTER (WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date AND mb.j_año_activacion_netlife = '2026' AND mb.j_mes_activacion_netlife = 'Marzo' AND mb.b_fecha_venta_subida IS NULL)
                ) AS total_activas_calculada,
                0 AS crec_vs_ma,
                COUNT(*) FILTER (
                    WHERE mb.j_forma_pago = 'TARJETA DE CREDITO.'
                    AND mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                ) AS tarjeta_credito,
                COUNT(*) FILTER (
                    WHERE mb.j_aplica_descuento_3ra_edad = 'SI POR TERCERA EDAD'
                    AND mb.j_netlife_estatus_real = 'ACTIVO'
                    AND mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                ) AS tercera_edad,
                (COUNT(*) FILTER (
                    WHERE mb.b_etapa_de_la_negociacion IN ${ETAPAS_DESCARTE}
                    AND ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date
                )::numeric /
                NULLIF(COUNT(*) FILTER (
                    WHERE (${parseFecha('mb.j_fecha_registro_sistema')} BETWEEN $1::date AND $2::date OR ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date)
                    AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_GESTIONABLES}
                ), 0) * 100)::numeric(10,2) AS descarte,
                COUNT(*) FILTER (
                    WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND mb.j_netlife_estatus_real NOT IN ('FUERA DE COBERTURA','DESISTE DEL SERVICIO','RECHAZADO')
                    AND mb.j_estatus_regularizacion = 'POR REGULARIZAR'
                ) AS regularizacion,
                ROUND( COALESCE( COUNT(*) FILTER ( WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date )::numeric / NULLIF( COUNT(*) FILTER ( WHERE (${parseFecha('mb.j_fecha_registro_sistema')} BETWEEN $1::date AND $2::date OR ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date) AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_GESTIONABLES} ), 0), 0 ) * 100, 2) AS efectividad_real,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date AND mb.j_netlife_estatus_real = 'ACTIVO')::numeric
                    / NULLIF(COUNT(*) FILTER (WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date), 0)
                , 0) * 100, 2) AS tasa_instalacion,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date AND mb.j_netlife_estatus_real = 'ACTIVO')::numeric
                    / NULLIF(COUNT(*) FILTER (WHERE (${parseFecha('mb.j_fecha_registro_sistema')} BETWEEN $1::date AND $2::date OR ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date) AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_GESTIONABLES}), 0)
                , 0) * 100, 2) AS efectividad_activas_vs_pauta,
                ROUND( COALESCE( COUNT(*) FILTER ( WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date )::numeric / NULLIF( COUNT(*) FILTER ( WHERE ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_GESTIONABLES} ), 0), 0 ) * 100, 2) AS eficiencia
            FROM mestra_bitrix mb
            LEFT JOIN public.empleados e ON mb.b_persona_responsable = e.nombre_completo
            WHERE (
                ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date
                OR mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            ) ${filters}
            GROUP BY 1
            ORDER BY gestionables DESC
        `;

        const queryCRM = `
            SELECT
                mb.b_id AS "ID_CRM",
                mb.b_etapa_de_la_negociacion AS "ETAPA_CRM",
                mb.b_creado_el_fecha AS "FECHA_CREACION_CRM",
                mb.b_persona_responsable AS "ASESOR",
                mb.b_creado_el_hora AS "HORA_CREACION",
                e.supervisor AS "SUPERVISOR_ASIGNADO",
                mb.b_modificado_el_fecha AS "FECHA_MODIFICACION",
                mb.b_modificado_el_hora AS "HORA_MODIFICACION",
                mb.b_origen AS "ORIGEN"
            FROM mestra_bitrix mb
            LEFT JOIN public.empleados e ON mb.b_persona_responsable = e.nombre_completo
            WHERE ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date ${filters}
            LIMIT 6000
        `;

        const queryJotform = `
            SELECT
                mb.j_fecha_registro_sistema AS "FECHACREACION_JOT",
                mb.j_id_bitrix AS "ID_CRM",
                mb.j_netlife_estatus_real AS "ESTADO_NETLIFE",
                mb.j_fecha_activacion_netlife AS "FECHA_ACTIVACION",
                mb.j_novedades_atc AS "NOVEDADES_ATC",
                mb.j_estatus_regularizacion AS "ESTADO_REGULARIZACION",
                mb.j_detalle_regularizacion AS "MOTIVO_REGULARIZAR",
                mb.j_forma_pago AS "FORMA_PAGO",
                mb.b_persona_responsable AS "ASESOR",
                e.supervisor AS "SUPERVISOR_ASIGNADO"
            FROM mestra_bitrix mb
            LEFT JOIN public.empleados e ON mb.b_persona_responsable = e.nombre_completo
            WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date ${filters}
            LIMIT 6000
        `;

        const ESTADOS_ORDEN = [
            'ACTIVO','ASIGNADO','PREPLANIIFICADO','PLANIIFICADO','RECHAZADO','REPLANIFICADO',
            'DESISTE DEL SERVICIO','PRESERVICIO','FIN DE GESTION','FACTIBLE'
        ];

        const queryEstados = `
            SELECT
                ${ESTADOS_ORDEN.map(est => `COUNT(*) FILTER (WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date AND mb.j_netlife_estatus_real = '${est}') AS "${est}"`).join(',')}
            FROM mestra_bitrix mb
            LEFT JOIN public.empleados e ON mb.b_persona_responsable = e.nombre_completo
            WHERE (
                ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date
                OR mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            ) ${filters}
        `;

        const queryEmbudo = `
            SELECT
                COALESCE(mb.b_etapa_de_la_negociacion, 'SIN ETAPA') AS etapa,
                COUNT(*)::int AS total
            FROM public.mestra_bitrix mb
            LEFT JOIN public.empleados e ON mb.b_persona_responsable = e.nombre_completo
            WHERE ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date ${filters}
            GROUP BY mb.b_etapa_de_la_negociacion
            ORDER BY total DESC
        `;

        const queryPorDia = `
            SELECT
                mb.j_fecha_registro_sistema::date AS fecha,
                COUNT(*)::int AS total
            FROM public.mestra_bitrix mb
            LEFT JOIN public.empleados e ON mb.b_persona_responsable = e.nombre_completo
            WHERE mb.j_fecha_registro_sistema IS NOT NULL
            AND mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            ${filters}
            GROUP BY 1
            ORDER BY fecha ASC
        `;

        const queryEtapasCRM = `
            SELECT DISTINCT mb.b_etapa_de_la_negociacion AS etapa
            FROM public.mestra_bitrix mb
            WHERE mb.b_etapa_de_la_negociacion IS NOT NULL
            AND TRIM(mb.b_etapa_de_la_negociacion) <> ''
            ORDER BY etapa ASC
        `;

        const queryTerceraEdad = `
            SELECT
                COUNT(*) FILTER (
                    WHERE mb.j_aplica_descuento_3ra_edad = 'SI POR TERCERA EDAD'
                    AND mb.j_netlife_estatus_real = 'ACTIVO'
                ) AS total_tercera_edad,
                COUNT(*) FILTER (
                    WHERE mb.j_netlife_estatus_real = 'ACTIVO'
                ) AS total_activos
            FROM public.mestra_bitrix mb
            LEFT JOIN public.empleados e ON mb.b_persona_responsable = e.nombre_completo
            WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            ${filters}
        `;

        const queryTarjeta = `
            SELECT
                COUNT(*) FILTER (
                    WHERE mb.j_forma_pago = 'TARJETA DE CREDITO.'
                ) AS total_tarjeta,
                COUNT(*) AS total_jotform
            FROM public.mestra_bitrix mb
            LEFT JOIN public.empleados e ON mb.b_persona_responsable = e.nombre_completo
            WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            ${filters}
        `;

        const [resSup, resAses, resCRM, resNet, resEstados, resEmbudo, resDia, resEtapasCRM, resTerceraEdad, resTarjeta] = await Promise.all([
            pool.query(queryKPI('e.supervisor'), values),
            pool.query(queryKPI('mb.b_persona_responsable'), values),
            pool.query(queryCRM, values),
            pool.query(queryJotform, values),
            pool.query(queryEstados, values),
            pool.query(queryEmbudo, values),
            pool.query(queryPorDia, values),
            pool.query(queryEtapasCRM),
            pool.query(queryTerceraEdad, values),
            pool.query(queryTarjeta, values),
        ]);

        const estadosRow = resEstados.rows[0] || {};
        const estadosNetlife = ESTADOS_ORDEN.map(est => ({
            estado: est,
            total: Number(estadosRow[est] || 0),
        }));

        const rowTercera = resTerceraEdad.rows[0] || {};
        const totalTerceraEdad = Number(rowTercera.total_tercera_edad || 0);
        const totalActivosTercera = Number(rowTercera.total_activos || 0);
        const porcentajeTerceraEdad = totalActivosTercera > 0
            ? Number(((totalTerceraEdad / totalActivosTercera) * 100).toFixed(2))
            : 0;

        const rowTarjeta = resTarjeta.rows[0] || {};
        const totalTarjeta = Number(rowTarjeta.total_tarjeta || 0);
        const totalJotformTarjeta = Number(rowTarjeta.total_jotform || 0);
        const porcentajeTarjeta = totalJotformTarjeta > 0
            ? Number(((totalTarjeta / totalJotformTarjeta) * 100).toFixed(2))
            : 0;

        console.log(`[DASHBOARD] Supervisores: ${resSup.rows.length} | Barras: ${resDia.rows.length} | 3ra Edad: ${porcentajeTerceraEdad}% | Tarjeta: ${porcentajeTarjeta}%`);

        res.json({
            success: true,
            supervisores: resSup.rows,
            asesores: resAses.rows,
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
        console.error("ERROR DASHBOARD:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

const getMonitoreoDiario = async (req, res) => {
    try {
        const hoy = getFechaEcuador();
        const iniciomes = getPrimerDiaMesEcuador();

        console.log(`[MONITOREO] Consultando desde ${iniciomes} hasta ${hoy}`);

        const ETAPAS_GESTIONABLES = "('CONTACTO NUEVO','DOCUMENTOS PENDIENTES','NO INTERESA COSTO PLAN','VOLVER A LLAMAR','GESTION DIARIA','VENTA SUBIDA','SEGUIMIENTO NEGOCIACIÓN','INNEGOCIABLE','CONTRATO NETLIFE','CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA','OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','OPORTUNIDADES','VENTA ECUANET DIRECTA','VENTA DIRECTA ECUANET','GESTIÓN DIARIA','SEGUIMIENTO NEGOCIACIÓN CON CONTACTO','SEGUIMIENTO SIN CONTACTO','CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO','DESCARTE PLAN DE 200','SEGUIMIENTO PLAN 200')";

        const ETAPAS_DESCARTE = "('NO INTERESA COSTO PLAN','INNEGOCIABLE','CONTRATO NETLIFE','CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA','OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','VENTA ECUANET DIRECTA','CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO')";

        const queryMonitoreo = (columna) => `
            SELECT
                COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,

                COUNT(DISTINCT mb.b_id) FILTER (
                    WHERE mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date
                ) AS real_mes_leads,

                COUNT(DISTINCT mb.b_id) FILTER (
                    WHERE ${parseFecha('mb.b_cerrado')} = $2::date
                    AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_GESTIONABLES}
                ) AS real_dia_leads,

                COUNT(DISTINCT mb.b_id) FILTER (
                    WHERE mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date
                ) AS crm_acumulado,

                COUNT(DISTINCT mb.b_id) FILTER (
                    WHERE ${parseFecha('mb.b_cerrado')} = $2::date
                ) AS crm_dia,

                COUNT(DISTINCT mb.b_id) FILTER (
                    WHERE ${parseFecha('mb.b_cerrado')} = $2::date
                    AND mb.b_etapa_de_la_negociacion = 'VENTA SUBIDA'
                ) AS v_subida_crm_hoy,

                ROUND(COALESCE(
                    COUNT(DISTINCT mb.b_id) FILTER (
                        WHERE mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date
                        AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_DESCARTE}
                    )::numeric
                    / NULLIF(COUNT(DISTINCT mb.b_id) FILTER (
                        WHERE mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date
                        AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_GESTIONABLES}
                    ), 0)
                , 0) * 100, 2) AS real_descarte,

                ROUND(COALESCE(
                    COUNT(DISTINCT mb.b_id) FILTER (
                        WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                        AND mb.j_forma_pago = 'TARJETA DE CREDITO.'
                    )::numeric
                    / NULLIF(COUNT(DISTINCT mb.b_id) FILTER (
                        WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    ), 0)
                , 0) * 100, 2) AS real_tarjeta

            FROM public.mestra_bitrix mb
            LEFT JOIN public.empleados e ON mb.b_persona_responsable = e.nombre_completo
            WHERE (
                mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date
                OR ${parseFecha('mb.b_cerrado')} BETWEEN $1::date AND $2::date
            )
            GROUP BY 1
            ORDER BY real_mes_leads DESC
        `;

        const queryJotHoy = (columna) => `
            SELECT
                COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(*)::int AS v_subida_jot_hoy,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE mb.j_forma_pago = 'TARJETA DE CREDITO.')::numeric
                    / NULLIF(COUNT(*), 0)
                , 0) * 100, 2) AS real_efectividad
            FROM public.mestra_bitrix mb
            LEFT JOIN public.empleados e ON mb.b_persona_responsable = e.nombre_completo
            WHERE mb.j_fecha_registro_sistema IS NOT NULL
            AND TRIM(mb.j_fecha_registro_sistema) != ''
            AND TRIM(mb.j_fecha_registro_sistema) = $1
            GROUP BY 1
        `;

        const [resSup, resAses, resJotSupHoy, resJotAsesHoy] = await Promise.all([
            pool.query(queryMonitoreo('e.supervisor'), [iniciomes, hoy]),
            pool.query(queryMonitoreo('mb.b_persona_responsable'), [iniciomes, hoy]),
            pool.query(queryJotHoy('e.supervisor'), [hoy]),
            pool.query(queryJotHoy('mb.b_persona_responsable'), [hoy]),
        ]);

        const mergeJot = (filas, jotRows) => {
            return filas.map(row => {
                const jot = jotRows.find(j => j.nombre_grupo === row.nombre_grupo);
                return {
                    ...row,
                    v_subida_jot_hoy: jot ? Number(jot.v_subida_jot_hoy) : 0,
                    real_efectividad: jot ? Number(jot.real_efectividad) : 0,
                };
            });
        };

        const supervisoresFinal = mergeJot(resSup.rows, resJotSupHoy.rows);
        const asesoresFinal = mergeJot(resAses.rows, resJotAsesHoy.rows);

        console.log(`[MONITOREO] Supervisores: ${supervisoresFinal.length} | Asesores: ${asesoresFinal.length}`);
        console.log(`[MONITOREO DEBUG] Hoy: ${hoy} | Inicio mes: ${iniciomes}`);
        if (supervisoresFinal.length > 0) {
            console.log(`[MONITOREO DEBUG] Primer sup => real_dia_leads: ${supervisoresFinal[0].real_dia_leads} | v_subida_jot_hoy: ${supervisoresFinal[0].v_subida_jot_hoy}`);
        }

        res.json({
            success: true,
            supervisores: supervisoresFinal,
            asesores: asesoresFinal,
        });

    } catch (error) {
        console.error("ERROR MONITOREO:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const getReporte180 = async (req, res) => {
    try {
        const { asesor, supervisor, fechaDesde, fechaHasta, estadoNetlife, estadoRegularizacion, etapaCRM, etapaJotform } = req.query;

        const hoy = getFechaEcuador();
        const desde = fechaDesde ? fechaDesde : hoy;
        const hasta = fechaHasta ? fechaHasta : hoy;

        let values = [desde, hasta];
        let filters = "";

        if (asesor) {
            values.push(`%${asesor}%`);
            filters += ` AND mb.b_persona_responsable ILIKE $${values.length}`;
        }
        if (supervisor) {
            values.push(`%${supervisor}%`);
            filters += ` AND e.supervisor ILIKE $${values.length}`;
        }
        if (estadoNetlife) {
            values.push(`%${estadoNetlife}%`);
            filters += ` AND mb.j_netlife_estatus_real ILIKE $${values.length}`;
        }
        if (estadoRegularizacion) {
            values.push(`%${estadoRegularizacion}%`);
            filters += ` AND mb.j_estatus_regularizacion ILIKE $${values.length}`;
        }
        if (etapaCRM) {
            values.push(`%${etapaCRM}%`);
            filters += ` AND mb.b_etapa_de_la_negociacion ILIKE $${values.length}`;
        }
        if (etapaJotform) {
            values.push(`%${etapaJotform}%`);
            filters += ` AND mb.j_netlife_estatus_real ILIKE $${values.length}`;
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
                    WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                ) AS ingresos_jot,
                COUNT(*) FILTER (
                    WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND mb.j_netlife_estatus_real = 'ACTIVO'
                ) AS ventas_activas,
                ROUND(COALESCE(
                    COUNT(*) FILTER (
                        WHERE mb.b_etapa_de_la_negociacion IN ${ETAPAS_DESCARTE}
                        AND ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE (${parseFecha('mb.j_fecha_registro_sistema')} BETWEEN $1::date AND $2::date OR ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date)
                        AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_GESTIONABLES}
                    ), 0)
                , 0) * 100, 2) AS pct_descarte,
                ROUND(COALESCE(
                    COUNT(*) FILTER (
                        WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE (${parseFecha('mb.j_fecha_registro_sistema')} BETWEEN $1::date AND $2::date OR ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date)
                        AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_GESTIONABLES}
                    ), 0)
                , 0) * 100, 2) AS pct_efectividad,
                ROUND(COALESCE(
                    COUNT(*) FILTER (
                        WHERE mb.j_aplica_descuento_3ra_edad = 'SI POR TERCERA EDAD'
                        AND mb.j_netlife_estatus_real = 'ACTIVO'
                        AND mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE mb.j_netlife_estatus_real = 'ACTIVO'
                        AND mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    ), 0)
                , 0) * 100, 2) AS pct_tercera_edad
            FROM public.mestra_bitrix mb
            LEFT JOIN public.empleados e ON mb.b_persona_responsable = e.nombre_completo
            WHERE (
                ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date
                OR mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            ) ${filters}
        `;

        const queryEmbудоCRM = `
            SELECT
                COALESCE(mb.b_etapa_de_la_negociacion, 'SIN ETAPA') AS etapa,
                COUNT(*)::int AS total
            FROM public.mestra_bitrix mb
            LEFT JOIN public.empleados e ON mb.b_persona_responsable = e.nombre_completo
            WHERE ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date ${filters}
            GROUP BY mb.b_etapa_de_la_negociacion
            ORDER BY total DESC
        `;

        const queryEmbudoJotform = `
            SELECT
                COALESCE(mb.j_netlife_estatus_real, 'SIN ESTADO') AS etapa,
                COUNT(*)::int AS total
            FROM public.mestra_bitrix mb
            LEFT JOIN public.empleados e ON mb.b_persona_responsable = e.nombre_completo
            WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date ${filters}
            GROUP BY mb.j_netlife_estatus_real
            ORDER BY total DESC
        `;

        const queryMapaCalor = `
            SELECT
                TRIM(mb.j_fecha_registro_sistema) AS fecha,
                COALESCE(TRIM(mb.j_ciudad), 'SIN CIUDAD') AS ciudad,
                COUNT(*)::int AS total
            FROM public.mestra_bitrix mb
            LEFT JOIN public.empleados e ON mb.b_persona_responsable = e.nombre_completo
            WHERE mb.j_fecha_registro_sistema IS NOT NULL
            AND TRIM(mb.j_fecha_registro_sistema) != ''
            AND mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            AND mb.j_ciudad IS NOT NULL
            AND TRIM(mb.j_ciudad) != ''
            ${filters}
            GROUP BY 1, 2
            ORDER BY 1 ASC, 3 DESC
        `;

        const [resKPIs, resEmbCRM, resEmbJot, resMapaCalor] = await Promise.all([
            pool.query(queryKPIs, values),
            pool.query(queryEmbудоCRM, values),
            pool.query(queryEmbudoJotform, values),
            pool.query(queryMapaCalor, values),
        ]);

        const kpis = resKPIs.rows[0] || {};

        console.log(`[REPORTE180] Ejecutado desde ${desde} hasta ${hasta}`);

        res.json({
            success: true,
            kpis: {
                ingresos_jot: Number(kpis.ingresos_jot || 0),
                ventas_activas: Number(kpis.ventas_activas || 0),
                pct_descarte: Number(kpis.pct_descarte || 0),
                pct_efectividad: Number(kpis.pct_efectividad || 0),
                pct_tercera_edad: Number(kpis.pct_tercera_edad || 0),
            },
            embudoCRM: resEmbCRM.rows,
            embudoJotform: resEmbJot.rows,
            mapaCalor: resMapaCalor.rows,
        });

    } catch (error) {
        console.error("ERROR REPORTE180:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    getIndicadoresDashboard,
    getMonitoreoDiario,
    getReporte180
};