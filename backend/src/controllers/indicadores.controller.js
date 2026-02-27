const pool = require('../config/db');

// ✅ FIX #2: Fecha correcta en Ecuador usando timezone explícita
const getFechaEcuador = () => {
    const ahora = new Date();
    return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' }); // Retorna YYYY-MM-DD
};

const getPrimerDiaMesEcuador = () => {
    const ahora = new Date();
    const fechaEcuador = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Guayaquil' }));
    return `${fechaEcuador.getFullYear()}-${String(fechaEcuador.getMonth() + 1).padStart(2, '0')}-01`;
};

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
        // ✅ FIX #1: etapaJotform ahora filtra el campo correcto (estatus_envio del jotform, no netlife)
        if (etapaJotform) {
            values.push(`%${etapaJotform}%`);
            filters += ` AND mb.j_estatus_envio ILIKE $${values.length}`;
        }

        const ETAPAS_GESTIONABLES = `(
            'CONTACTO NUEVO','DOCUMENTOS PENDIENTES','NO INTERESA COSTO PLAN','VOLVER A LLAMAR',
            'GESTION DIARIA','VENTA SUBIDA','SEGUIMIENTO NEGOCIACIÓN','INNEGOCIABLE','CONTRATO NETLIFE',
            'CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA',
            'OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','OPORTUNIDADES',
            'VENTA ECUANET DIRECTA','VENTA DIRECTA ECUANET','GESTIÓN DIARIA',
            'SEGUIMIENTO NEGOCIACIÓN CON CONTACTO','SEGUIMIENTO SIN CONTACTO',
            'CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO', 'SEGUIMIENTO NEGOCIACIÓN', 
            'DUPLICADO', 'POSTVENTA NOVONET', 'DESCARTE PLAN DE 200', 'DUPLLICADO', 'POSTVENTA', 'SEGUIMIENTO PLAN 200'
        )`;

        const ETAPAS_DESCARTE = `(
            'NO INTERESA COSTO PLAN', 'INNEGOCIABLE', 'CONTRATO NETLIFE', 'CLIENTE DISCAPACIDAD',
            'OTRO ASESOR NOVONET', 'MANTIENE PROVEEDOR', 'DESISTE DE COMPRA', 'OTRO PROVEEDOR',
            'NO VOLVER A CONTACTAR', 'NO INTERESA COSTO INSTALACIÓN', 'VENTA ECUANET DIRECTA',
            'CONTRATO NETLIFE POR OTRO CANAL', 'CONTRATO NETLIFE OTRO ASESOR COMPAÑERO'
        )`;

        const queryKPI = (columna) => `
            SELECT
                COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(*) FILTER (WHERE mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date) AS leads_totales,
                COUNT(*) FILTER (
                    WHERE mb.b_cerrado::date BETWEEN $1::date AND $2::date
                    AND mb.b_etapa_de_la_negociacion = 'VENTA SUBIDA'
                ) AS ventas_crm,
                COUNT(*) FILTER (
                    WHERE (mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date OR mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date)
                    AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_GESTIONABLES}
                ) AS gestionables,
                COUNT(*) FILTER (
                    WHERE ((mb.j_fecha_registro_sistema::timestamp - INTERVAL '6 hours')::date BETWEEN $1::date AND $2::date)
                    AND (mb.j_netlife_estatus_real NOT IN ('FUERA DE COBERTURA','DESISTE DEL SERVICIO','RECHAZADO') OR mb.j_netlife_estatus_real IS NULL OR TRIM(COALESCE(mb.j_netlife_estatus_real,'')) = '')
                ) AS ingresos_reales,
                COUNT(*) FILTER (
                    WHERE ((mb.j_fecha_registro_sistema::timestamp - INTERVAL '6 hours')::date BETWEEN $1::date AND $2::date)
                    AND mb.j_netlife_estatus_real = 'ACTIVO'
                ) AS activas,
                COUNT(*) FILTER (
                    WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND mb.j_netlife_estatus_real = 'ACTIVO'
                    AND mb.b_fecha_venta_subida IS NOT NULL
                ) AS real_mes,
                COUNT(*) FILTER (
                    WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND mb.j_netlife_estatus_real = 'ACTIVO'
                    AND mb.b_fecha_venta_subida IS NULL
                ) AS backlog,
                (
                    COUNT(*) FILTER (WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date AND mb.j_netlife_estatus_real = 'ACTIVO' AND mb.b_fecha_venta_subida IS NOT NULL) +
                    COUNT(*) FILTER (WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date AND mb.j_netlife_estatus_real = 'ACTIVO' AND mb.b_fecha_venta_subida IS NULL)
                ) AS total_activas_calculada,
                0 AS crec_vs_ma,
                (COUNT(*) FILTER (
                    WHERE mb.b_etapa_de_la_negociacion IN ${ETAPAS_DESCARTE}
                    AND mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date
                )::numeric /
                NULLIF(COUNT(*) FILTER (
                    WHERE (mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date OR mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date)
                    AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_GESTIONABLES}
                ), 0) * 100)::numeric(10,2) AS descarte,
                COUNT(*) FILTER (
                    WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND mb.j_netlife_estatus_real NOT IN ('FUERA DE COBERTURA','DESISTE DEL SERVICIO','RECHAZADO')
                    AND mb.j_estatus_regularizacion = 'POR REGULARIZAR'
                ) AS regularizacion,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE ((mb.j_fecha_registro_sistema::timestamp - INTERVAL '6 hours')::date BETWEEN $1::date AND $2::date) AND mb.j_netlife_estatus_real = 'ACTIVO')::numeric
                    / NULLIF(COUNT(*) FILTER (WHERE ((mb.j_fecha_registro_sistema::timestamp - INTERVAL '6 hours')::date BETWEEN $1::date AND $2::date)), 0)
                , 0) * 100, 2) AS tasa_instalacion,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE ((mb.j_fecha_registro_sistema::timestamp - INTERVAL '6 hours')::date BETWEEN $1::date AND $2::date) AND mb.j_netlife_estatus_real = 'ACTIVO')::numeric
                    / NULLIF(COUNT(*) FILTER (WHERE (mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date OR mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date) AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_GESTIONABLES}), 0)
                , 0) * 100, 2) AS efectividad_activas_vs_pauta,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE ((mb.j_fecha_registro_sistema::timestamp - INTERVAL '6 hours')::date BETWEEN $1::date AND $2::date) AND (mb.j_netlife_estatus_real NOT IN ('FUERA DE COBERTURA','DESISTE DEL SERVICIO','RECHAZADO') OR mb.j_netlife_estatus_real IS NULL OR TRIM(COALESCE(mb.j_netlife_estatus_real,'')) = ''))::numeric
                    / NULLIF(COUNT(*) FILTER (WHERE (mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date OR mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date) AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_GESTIONABLES}), 0)
                , 0) * 100, 2) AS eficiencia,
                -- ✅ FIX #4: calcular tarjeta_credito real (forma_pago = TARJETA DE CREDITO)
                ROUND(COALESCE(
                    COUNT(*) FILTER (
                        WHERE ((mb.j_fecha_registro_sistema::timestamp - INTERVAL '6 hours')::date BETWEEN $1::date AND $2::date)
                        AND UPPER(TRIM(COALESCE(mb.j_forma_pago, ''))) ILIKE '%TARJETA%'
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE ((mb.j_fecha_registro_sistema::timestamp - INTERVAL '6 hours')::date BETWEEN $1::date AND $2::date)
                        AND (mb.j_netlife_estatus_real NOT IN ('FUERA DE COBERTURA','DESISTE DEL SERVICIO','RECHAZADO') OR mb.j_netlife_estatus_real IS NULL OR TRIM(COALESCE(mb.j_netlife_estatus_real,'')) = '')
                    ), 0)
                , 0) * 100, 2) AS tarjeta_credito
            FROM mestra_bitrix mb
            LEFT JOIN public.empleados e ON mb.b_persona_responsable = e.nombre_completo
            WHERE 1=1 ${filters}
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
            WHERE mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date ${filters}
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
            WHERE ((mb.j_fecha_registro_sistema::timestamp - INTERVAL '6 hours')::date BETWEEN $1::date AND $2::date) ${filters}
            LIMIT 6000
        `;

        const ESTADOS_ORDEN = [
            'ACTIVO', 'ASIGNADO', 'PREPLANIIFICADO', 'PLANIIFICADO', 'RECHAZADO', 'REPLANIFICADO', 'DESISTE DEL SERVICIO',
            'PRESERVICIO', 'FIN DE GESTION', 'FACTIBLE'
        ];

        // ✅ FIX #5: queryEstados ahora aplica el mismo offset de 6 horas que el resto de queries jotform
        const queryEstados = `
            SELECT
                ${ESTADOS_ORDEN.map(est => `COUNT(*) FILTER (WHERE ((mb.j_fecha_registro_sistema::timestamp - INTERVAL '6 hours')::date BETWEEN $1::date AND $2::date) AND mb.j_netlife_estatus_real = '${est}') AS "${est}"`).join(',')}
            FROM mestra_bitrix mb
            LEFT JOIN public.empleados e ON mb.b_persona_responsable = e.nombre_completo
            WHERE 1=1 ${filters}
        `;

        const queryEmbudo = `
            SELECT
                COALESCE(mb.b_etapa_de_la_negociacion, 'SIN ETAPA') AS etapa,
                COUNT(*)::int AS total
            FROM public.mestra_bitrix mb
            LEFT JOIN public.empleados e ON mb.b_persona_responsable = e.nombre_completo
            WHERE mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date ${filters}
            GROUP BY mb.b_etapa_de_la_negociacion
            ORDER BY total DESC
        `;

        const queryPorDia = `
            SELECT
                mb.b_cerrado::date AS fecha,
                COUNT(*)::int AS total
            FROM public.mestra_bitrix mb
            LEFT JOIN public.empleados e ON mb.b_persona_responsable = e.nombre_completo
            WHERE mb.b_cerrado::date BETWEEN $1::date AND $2::date ${filters}
            GROUP BY mb.b_cerrado::date
            ORDER BY fecha ASC
        `;

        const queryEtapasCRM = `
            SELECT DISTINCT mb.b_etapa_de_la_negociacion AS etapa
            FROM public.mestra_bitrix mb
            WHERE mb.b_etapa_de_la_negociacion IS NOT NULL
            AND TRIM(mb.b_etapa_de_la_negociacion) <> ''
            ORDER BY mb.b_etapa_de_la_negociacion ASC
        `;

        // ✅ FIX #3: query para porcentaje tercera edad
        const queryTerceraEdad = `
            SELECT
                ROUND(COALESCE(
                    COUNT(*) FILTER (
                        WHERE ((mb.j_fecha_registro_sistema::timestamp - INTERVAL '6 hours')::date BETWEEN $1::date AND $2::date)
                        AND UPPER(TRIM(COALESCE(mb.j_aplica_descuento_3ra_edad, ''))) IN ('SI', 'SÍ', 'APLICA', 'S')
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE ((mb.j_fecha_registro_sistema::timestamp - INTERVAL '6 hours')::date BETWEEN $1::date AND $2::date)
                        AND (mb.j_netlife_estatus_real NOT IN ('FUERA DE COBERTURA','DESISTE DEL SERVICIO','RECHAZADO') OR mb.j_netlife_estatus_real IS NULL OR TRIM(COALESCE(mb.j_netlife_estatus_real,'')) = '')
                    ), 0)
                , 0) * 100, 2) AS porcentaje_tercera_edad
            FROM public.mestra_bitrix mb
            LEFT JOIN public.empleados e ON mb.b_persona_responsable = e.nombre_completo
            WHERE 1=1 ${filters}
        `;

        const [resSup, resAses, resCRM, resNet, resEstados, resEmbudo, resDia, resEtapasCRM, resTerceraEdad] = await Promise.all([
            pool.query(queryKPI('e.supervisor'), values),
            pool.query(queryKPI('mb.b_persona_responsable'), values),
            pool.query(queryCRM, values),
            pool.query(queryJotform, values),
            pool.query(queryEstados, values),
            pool.query(queryEmbudo, values),
            pool.query(queryPorDia, values),
            pool.query(queryEtapasCRM),
            pool.query(queryTerceraEdad, values),
        ]);

        const estadosRow = resEstados.rows[0] || {};
        const estadosNetlife = ESTADOS_ORDEN.map(est => ({
            estado: est,
            total: Number(estadosRow[est] || 0),
        }));

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
            // ✅ FIX #3: ahora se devuelve el porcentaje real de tercera edad
            porcentajeTerceraEdad: Number(resTerceraEdad.rows[0]?.porcentaje_tercera_edad || 0),
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

        const ETAPAS_GESTIONABLES = `(
            'CONTACTO NUEVO','DOCUMENTOS PENDIENTES','NO INTERESA COSTO PLAN','VOLVER A LLAMAR',
            'GESTION DIARIA','VENTA SUBIDA','SEGUIMIENTO NEGOCIACIÓN','INNEGOCIABLE','CONTRATO NETLIFE',
            'CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA',
            'OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','OPORTUNIDADES',
            'VENTA ECUANET DIRECTA','VENTA DIRECTA ECUANET','GESTIÓN DIARIA',
            'SEGUIMIENTO NEGOCIACIÓN CON CONTACTO','SEGUIMIENTO SIN CONTACTO',
            'CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO'
        )`;

        const ETAPAS_DESCARTE = `(
            'NO INTERESA COSTO PLAN','INNEGOCIABLE','CONTRATO NETLIFE','CLIENTE DISCAPACIDAD',
            'OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA','OTRO PROVEEDOR',
            'NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','VENTA ECUANET DIRECTA',
            'CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO'
        )`;

        const queryMonitoreo = (columna) => `
            SELECT
                COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,

                -- Leads acumulados del mes
                COUNT(*) FILTER (
                    WHERE mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date
                ) AS real_mes_leads,

                -- Leads creados hoy
                COUNT(*) FILTER (
                    WHERE mb.b_creado_el_fecha::date = $2::date
                ) AS real_dia_leads,

                -- CRM acumulado del mes (registros CRM creados en el mes)
                COUNT(*) FILTER (
                    WHERE mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date
                    AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_GESTIONABLES}
                ) AS crm_acumulado,

                -- CRM creados hoy
                COUNT(*) FILTER (
                    WHERE mb.b_creado_el_fecha::date = $2::date
                    AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_GESTIONABLES}
                ) AS crm_dia,

                -- Ventas subidas en CRM hoy (b_cerrado = hoy y etapa VENTA SUBIDA)
                COUNT(*) FILTER (
                    WHERE mb.b_cerrado::date = $2::date
                    AND mb.b_etapa_de_la_negociacion = 'VENTA SUBIDA'
                ) AS v_subida_crm_hoy,

                -- Ventas subidas en Jotform hoy
                COUNT(*) FILTER (
                    WHERE ((mb.j_fecha_registro_sistema::timestamp - INTERVAL '6 hours')::date = $2::date)
                    AND mb.j_netlife_estatus_real IS NOT NULL
                    AND TRIM(COALESCE(mb.j_netlife_estatus_real, '')) <> ''
                    AND mb.j_netlife_estatus_real NOT IN ('FUERA DE COBERTURA','DESISTE DEL SERVICIO','RECHAZADO')
                ) AS v_subida_jot_hoy,

                -- Efectividad real del mes
                ROUND(COALESCE(
                    COUNT(*) FILTER (
                        WHERE ((mb.j_fecha_registro_sistema::timestamp - INTERVAL '6 hours')::date BETWEEN $1::date AND $2::date)
                        AND mb.j_netlife_estatus_real = 'ACTIVO'
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date
                        AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_GESTIONABLES}
                    ), 0)
                , 0) * 100, 2) AS real_efectividad,

                -- Descarte real del mes
                ROUND(COALESCE(
                    COUNT(*) FILTER (
                        WHERE mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date
                        AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_DESCARTE}
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date
                        AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_GESTIONABLES}
                    ), 0)
                , 0) * 100, 2) AS real_descarte,

                -- ✅ FIX #6: tarjeta real calculada (% de ventas jotform pagadas con tarjeta)
                ROUND(COALESCE(
                    COUNT(*) FILTER (
                        WHERE ((mb.j_fecha_registro_sistema::timestamp - INTERVAL '6 hours')::date BETWEEN $1::date AND $2::date)
                        AND UPPER(TRIM(COALESCE(mb.j_forma_pago, ''))) ILIKE '%TARJETA%'
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE ((mb.j_fecha_registro_sistema::timestamp - INTERVAL '6 hours')::date BETWEEN $1::date AND $2::date)
                        AND mb.j_netlife_estatus_real IS NOT NULL
                        AND TRIM(COALESCE(mb.j_netlife_estatus_real, '')) <> ''
                        AND mb.j_netlife_estatus_real NOT IN ('FUERA DE COBERTURA','DESISTE DEL SERVICIO','RECHAZADO')
                    ), 0)
                , 0) * 100, 2) AS real_tarjeta

            FROM public.mestra_bitrix mb
            LEFT JOIN public.empleados e ON mb.b_persona_responsable = e.nombre_completo
            WHERE mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date
            GROUP BY 1
            ORDER BY real_mes_leads DESC
        `;

        const [resSup, resAses] = await Promise.all([
            pool.query(queryMonitoreo('e.supervisor'), [iniciomes, hoy]),
            pool.query(queryMonitoreo('mb.b_persona_responsable'), [iniciomes, hoy]),
        ]);

        console.log(`[MONITOREO] Supervisores: ${resSup.rows.length} | Asesores: ${resAses.rows.length}`);

        res.json({
            success: true,
            supervisores: resSup.rows,
            asesores: resAses.rows,
        });

    } catch (error) {
        console.error("ERROR MONITOREO:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getIndicadoresDashboard,
    getMonitoreoDiario
};