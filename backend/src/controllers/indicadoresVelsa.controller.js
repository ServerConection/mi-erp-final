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

// Manejo de fechas para tabla Jotform (puede estar en múltiples formatos)
const parseFechaJotform = (col) => `CASE WHEN ${col} IS NULL OR TRIM(${col}::text) = '' THEN NULL WHEN ${col}::text ~ '^\\d{4}-\\d{2}-\\d{2}' THEN ${col}::text::date ELSE TO_DATE(SUBSTRING(${col}::text FROM 5 FOR 11), 'Mon DD YYYY') END`;

const ESTADO_ACTIVO = `'ACTIVO'`;

const getIndicadoresDashboardVelsa = async (req, res) => {
    try {
        const { asesor, supervisor, fechaDesde, fechaHasta, estadoNetlife, estadoRegularizacion, etapaCRM, etapaJotform } = req.query;

        const hoy = getFechaEcuador();
        const desde = fechaDesde ? fechaDesde : hoy;
        const hasta = fechaHasta ? fechaHasta : hoy;

        let values = [desde, hasta];
        let filters = "";

        if (asesor) { values.push(`%${asesor}%`); filters += ` AND nr.responsable_nombre ILIKE $${values.length}`; }
        if (supervisor) { values.push(`%${supervisor}%`); filters += ` AND emp.nombre ILIKE $${values.length}`; }
        if (estadoNetlife) { values.push(`%${estadoNetlife}%`); filters += ` AND jf.estado_venta_netlife ILIKE $${values.length}`; }
        if (estadoRegularizacion) { values.push(`%${estadoRegularizacion}%`); filters += ` AND jf.estado_regularizacion ILIKE $${values.length}`; }
        if (etapaCRM) { values.push(`%${etapaCRM}%`); filters += ` AND nr.etapa ILIKE $${values.length}`; }
        if (etapaJotform) { values.push(`%${etapaJotform}%`); filters += ` AND jf.estado_venta_netlife ILIKE $${values.length}`; }

        const ETAPAS_GESTIONABLES = `('VOLVER A LLAMAR','NO INTERESA COSTO DEL PLAN','SEGUIMIENTO SIN CONTACTO','SEGUIMIENTO NEGOCIACION','VENTA SUBIDA','CONTACTO NUEVO','CLIENTE DISCAPACIDAD','CLIENTE DICAPACIDAD','DOCUMENTOS PENDIENTES','CERRAR NEGOCIACION','INNEGOCIABLE','NUNCA CONTESTO','GESTION DIARIA','MANTIENE PROVEEDOR','NO INTERESA COSTO DE INSTALACION','CONTRATA NETLIFE OTRO CANAL','CONTRATO OTRO PROVEEDOR','REFIRIO','RECEPCION DE DOCUMENTOS','RMKT AUTOMÁTICO','SEGUIMIENTO','CONTRATA NETLIFE OTRO DISTRIBUIDOR','INCONTACTABLE','NO INTERESA COSTO DE PLAN','NO INTERESA COSTO DE INSTALACIÓN','OPORTUNIDADES','DUPLICADO','NO VOLVER A CONTACTAR','LEADS NOVONET','POSTVENTA VELSA','RMKT AUTOMATICO')`;
        const ETAPAS_DESCARTE = `('NO INTERESA COSTO PLAN','INNEGOCIABLE','CONTRATO NETLIFE','CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA','OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','VENTA ECUANET DIRECTA','CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO','INCONTACTABLE','NO INTERESA COSTO INSTALACION','CONTRATO NETLIFE OTRO CANAL','CONTRATO OTRO PROVEEDOR')`;

        const queryKPI = (columna) => `
            SELECT
                COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(*) FILTER (WHERE nr.creado_en::date BETWEEN $1::date AND $2::date) AS leads_totales,
                COUNT(*) FILTER (
                    WHERE nr.creado_en::date BETWEEN $1::date AND $2::date
                    AND nr.etapa = 'VENTA SUBIDA'
                ) AS ventas_crm,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date)::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE nr.creado_en::date BETWEEN $1::date AND $2::date
                        AND nr.etapa IN ${ETAPAS_GESTIONABLES}
                    ), 0)
                , 0) * 100, 2) AS efectividad_realz,
                COUNT(*) FILTER (
                    WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND jf.estado_regularizacion = 'POR REGULARIZAR'
                ) AS por_regularizar,
                COUNT(*) FILTER (
                    WHERE (jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                        OR nr.creado_en::date BETWEEN $1::date AND $2::date)
                    AND nr.etapa IN ${ETAPAS_GESTIONABLES}
                ) AS gestionables,
                COUNT(*) FILTER (
                    WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                ) AS ingresos_reales,
                COUNT(*) FILTER (
                    WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND jf.estado_venta_netlife = ${ESTADO_ACTIVO}
                ) AS activas,
                COUNT(*) FILTER (
                    WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND jf.estado_venta_netlife = ${ESTADO_ACTIVO}
                ) AS real_mes,
                COUNT(*) FILTER (
                    WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND jf.estado_venta_netlife = ${ESTADO_ACTIVO}
                ) AS total_activas_calculada,
                0 AS crec_vs_ma,
                COUNT(*) FILTER (
                    WHERE jf.forma_pago ILIKE '%TARJETA DE CREDITO%'
                    AND jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                ) AS tarjeta_credito,
                COUNT(*) FILTER (
                    WHERE jf.descuento_3era_edad ILIKE '%TERCERA EDAD%'
                    AND jf.estado_venta_netlife = ${ESTADO_ACTIVO}
                    AND jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                ) AS tercera_edad,
                (COUNT(*) FILTER (
                    WHERE nr.etapa IN ${ETAPAS_DESCARTE}
                    AND nr.creado_en::date BETWEEN $1::date AND $2::date
                )::numeric /
                NULLIF(COUNT(*) FILTER (
                    WHERE (jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                        OR nr.creado_en::date BETWEEN $1::date AND $2::date)
                    AND nr.etapa IN ${ETAPAS_GESTIONABLES}
                ), 0) * 100)::numeric(10,2) AS descarte,
                COUNT(*) FILTER (
                    WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND jf.estado_venta_netlife NOT IN ('FUERA DE COBERTURA','DESISTE DEL SERVICIO','RECHAZADO')
                    AND jf.estado_regularizacion = 'POR REGULARIZAR'
                ) AS regularizacion,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date)::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE (jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                            OR nr.creado_en::date BETWEEN $1::date AND $2::date)
                        AND nr.etapa IN ${ETAPAS_GESTIONABLES}
                    ), 0)
                , 0) * 100, 2) AS efectividad_real,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date AND jf.estado_venta_netlife = ${ESTADO_ACTIVO})::numeric
                    / NULLIF(COUNT(*) FILTER (WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date), 0)
                , 0) * 100, 2) AS tasa_instalacion,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date AND jf.estado_venta_netlife = ${ESTADO_ACTIVO})::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE (jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                            OR nr.creado_en::date BETWEEN $1::date AND $2::date)
                        AND nr.etapa IN ${ETAPAS_GESTIONABLES}
                    ), 0)
                , 0) * 100, 2) AS efectividad_activas_vs_pauta,
                ROUND(COALESCE(
                    COUNT(*) FILTER (
                        WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                        AND jf.estado_venta_netlife NOT IN ('PRESERVICIO','DESISTE DEL SERVICIO')
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE nr.creado_en::date BETWEEN $1::date AND $2::date
                        AND nr.etapa IN ${ETAPAS_GESTIONABLES}
                    ), 0)
                , 0) * 100, 2) AS eficiencia
            FROM public.negociaciones_reporteria nr
            LEFT JOIN public.vw_jotform_velsa_netlife_completo jf ON nr.id = jf.id_bitrix
            LEFT JOIN employees emp ON nr.responsable_id = emp.id
            WHERE (
                nr.creado_en::date BETWEEN $1::date AND $2::date
                OR jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            ) ${filters}
            GROUP BY 1
            ORDER BY gestionables DESC
        `;

        const queryBacklog = (columna) => `
            SELECT
                COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(*)::int AS backlog
            FROM public.negociaciones_reporteria nr
            LEFT JOIN public.vw_jotform_velsa_netlife_completo jf ON nr.id = jf.id_bitrix
            WHERE jf.estado_venta_netlife = ${ESTADO_ACTIVO}
            AND jf.fecha_registro_sistema IS NOT NULL
            AND TRIM(jf.fecha_registro_sistema::text) != ''
            AND jf.fecha_registro_sistema::date < $1::date
            AND jf.fecha_activacion IS NOT NULL
            AND TRIM(jf.fecha_activacion::text) != ''
            AND jf.fecha_activacion::date >= $1::date
            AND jf.fecha_activacion::date <= $2::date
            ${filters}
            GROUP BY 1
        `;

        const queryCRM = `
            SELECT
                nr.id                              AS "ID_CRM",
                nr.etapa                           AS "ETAPA_CRM",
                nr.creado_en::date                 AS "FECHA_CREACION_CRM",
                nr.responsable_nombre              AS "ASESOR",
                nr.creado_en::time                 AS "HORA_CREACION",
                emp.nombre                         AS "SUPERVISOR_ASIGNADO",
                nr.modificado_en::date             AS "FECHA_MODIFICACION",
                nr.modificado_en::time             AS "HORA_MODIFICACION",
                nr.fuente                          AS "ORIGEN",
                0                                  AS "VENTAS_DIA_JOT",
                nr.comentarios                     AS "TELEFONO",
                jf.ciudad                          AS "CIUDAD",
                jf.estado_venta_netlife            AS "ESTADO_NETLIFE",
                jf.fecha_registro_sistema::date    AS "FECHA_JOT",
                jf.estado_regularizacion           AS "ESTADO_REGULARIZACION",
                jf.observacion                     AS "OBSERVACION_AUDITORIA"
            FROM public.negociaciones_reporteria nr
            LEFT JOIN public.vw_jotform_velsa_netlife_completo jf ON nr.id = jf.id_bitrix
            LEFT JOIN employees emp ON nr.responsable_id = emp.id
            WHERE nr.creado_en::date BETWEEN $1::date AND $2::date
            ${filters}
            LIMIT 6000
        `;

        const queryJotform = `
            SELECT
                jf.fecha_registro_sistema::date    AS "FECHA_CREACION_JOT",
                jf.id_bitrix                       AS "ID_CRM",
                jf.estado_venta_netlife            AS "ESTADO_NETLIFE",
                jf.fecha_activacion                AS "FECHA_ACTIVACION",
                jf.novedades                       AS "NOVEDADES_ATC",
                jf.estado_regularizacion           AS "ESTADO_REGULARIZACION",
                jf.estado_regularizacion           AS "OBSERVACION_REGULARIZADO",
                jf.motivo_regularizacion           AS "MOTIVO_REGULARIZAR",
                jf.observacion                     AS "OBSERVACION_AUDITORIA",
                jf.forma_pago                      AS "FORMA_PAGO",
                nr.responsable_nombre              AS "ASESOR",
                jf.ciudad                          AS "CIUDAD",
                jf.estado_venta_netlife            AS "ESTADO_VENTA_NETLIFE",
                jf.fecha_registro_sistema::date    AS "FECHA_INGRESO_TELCOS",
                jf.fecha_agenda                    AS "FECHA_ASIGNACION_TELCOS",
                jf.fecha_activacion                AS "FECHA_ACTIVACION_TELCOS",
                jf.provincia                       AS "PROVINCIA",
                jf.ciudad                          AS "CIUDAD_JOT",
                jf.observacion                     AS "OBSERVACION_VENTA",
                jf.estado_regularizacion           AS "ESTADO_REGULARIZACION_NOVO",
                jf.motivo_regularizacion           AS "DETALLE_REGULARIZACION"
            FROM public.vw_jotform_velsa_netlife_completo jf
            LEFT JOIN public.negociaciones_reporteria nr ON nr.id = jf.id_bitrix
            WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            ${filters}
            LIMIT 6000
        `;

        const queryEstados = `
            SELECT DISTINCT jf.estado_venta_netlife AS estado,
                            COUNT(*) AS total
            FROM public.vw_jotform_velsa_netlife_completo jf
            GROUP BY jf.estado_venta_netlife
            ORDER BY total DESC
        `;

        const queryGraficoEmbudo = `
            SELECT nr.etapa,
                   COUNT(*) AS total
            FROM public.negociaciones_reporteria nr
            WHERE nr.creado_en::date BETWEEN $1::date AND $2::date
            GROUP BY nr.etapa
            ORDER BY total DESC
        `;

        const queryGraficoBarrasDia = `
            SELECT DATE(nr.creado_en) as fecha,
                   COUNT(*) as total,
                   COUNT(CASE WHEN nr.cerrado = 'Y' THEN 1 END) as cerradas,
                   COUNT(CASE WHEN jf.estado_venta_netlife = ${ESTADO_ACTIVO} THEN 1 END) as activos
            FROM public.negociaciones_reporteria nr
            LEFT JOIN public.vw_jotform_velsa_netlife_completo jf ON nr.id = jf.id_bitrix
            WHERE nr.creado_en::date BETWEEN $1::date AND $2::date
            GROUP BY DATE(nr.creado_en)
            ORDER BY fecha DESC
        `;

        // Ejecutar queries en paralelo
        const [kpiResult, backlogResult, crmData, jotformData, estadosData, embudoData, barrasData] = await Promise.all([
            pool.query(queryKPI('nr.responsable_nombre'), values),
            pool.query(queryBacklog('nr.responsable_nombre'), values),
            pool.query(queryCRM, values),
            pool.query(queryJotform, values),
            pool.query(queryEstados),
            pool.query(queryGraficoEmbudo, values),
            pool.query(queryGraficoBarrasDia, values),
        ]);

        // Compilar respuesta
        const supervisores = kpiResult.rows.map(row => ({
            nombre_grupo: row.nombre_grupo,
            leads_gestionables: row.gestionables,
            leads_totales: row.leads_totales,
            ventas_crm: row.ventas_crm,
            ingresos_reales: row.ingresos_reales,
            activos: row.activas,
            real_mes: row.real_mes,
            backlog: backlogResult.rows.find(b => b.nombre_grupo === row.nombre_grupo)?.backlog || 0,
            total_activas_calculada: row.total_activas_calculada,
            efectividad_real: row.efectividad_real,
            pct_descarte: row.descarte,
            tasa_instalacion: row.tasa_instalacion,
            eficiencia: row.eficiencia,
            tarjeta_credito: row.tarjeta_credito,
            tercera_edad: row.tercera_edad,
            por_regularizar: row.por_regularizar,
            efectividad_activas_vs_pauta: row.efectividad_activas_vs_pauta,
        }));

        const totalTarjeta = supervisores.reduce((a, s) => a + (s.tarjeta_credito || 0), 0);
        const totalTercera = supervisores.reduce((a, s) => a + (s.tercera_edad || 0), 0);
        const totalIngresos = supervisores.reduce((a, s) => a + (s.ingresos_reales || 0), 1);

        res.json({
            success: true,
            supervisores,
            asesores: supervisores,
            dataCRM: crmData.rows,
            dataNetlife: jotformData.rows,
            estadosNetlife: estadosData.rows,
            canales: [...new Set(crmData.rows.map(r => r.ORIGEN).filter(Boolean))],
            etapasCRM: [...new Set(crmData.rows.map(r => r.ETAPA_CRM).filter(Boolean))],
            graficoEmbudo: embudoData.rows,
            graficoBarrasDia: barrasData.rows,
            porcentajeTarjeta: ((totalTarjeta / totalIngresos) * 100).toFixed(1),
            porcentajeTerceraEdad: ((totalTercera / supervisores.reduce((a, s) => a + (s.real_mes || 0), 1)) * 100).toFixed(1),
        });
    } catch (err) {
        console.error('[INDICADORES-VELSA] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

module.exports = {
    getIndicadoresDashboardVelsa,
};
