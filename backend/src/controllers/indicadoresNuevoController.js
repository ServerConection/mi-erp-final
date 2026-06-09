const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// GESTIONABLES: en lugar de mantener una lista blanca de etapas (ETAPAS_GESTIONABLES),
// se identifica un lead como "gestionable" EXCLUYENDO las etapas que matcheen estos
// patrones. Así, si se agregan etapas nuevas al pipeline, no afectan el conteo.
// ─────────────────────────────────────────────────────────────────────────────
const esGestionableExpr = (col) => `(
    ${col} NOT ILIKE '%ATC%'
    AND ${col} NOT ILIKE '%ZONA PELIGROSA%'
    AND ${col} NOT ILIKE '%FUERA DE COBERTURA%'
    AND ${col} NOT ILIKE '%DUPLICADO%'
)`;

// ─── helpers de fecha ───────────────────────────────────────────────────────
const getFechaEcuador = () => {
    const ahora = new Date();
    return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
};

const getPrimerDiaMesEcuador = () => {
    const ahora = new Date();
    const fechaEcuador = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Guayaquil' }));
    return `${fechaEcuador.getFullYear()}-${String(fechaEcuador.getMonth() + 1).padStart(2, '0')}-01`;
};

// parseFecha adaptado a las columnas timestamp de tu vista (normalmente ya vienen en formato válido)
const parseFecha = (col) => `${col}::date`;

// ─── alias de la vista materializada ────────────────────────────────────────
const MV = `public.mv_indicadores_velsa_completo mv`;

// ─── estado activo ──────────────────────────────────────────────────────────
const ESTADO_ACTIVO = `'ACTIVO'`;

// ─── listas de etapas (obtenidas de tu SELECT DISTINCT etapa_crm) ──────────
// Incluyen todos los valores encontrados, excepto vacío, ATC y los descartes explícitos.
const ETAPAS_GESTIONABLES = `(
    'Venta Subida',
    'OPORTUNIDADES SIUPERVISOR',
    'GESTION DIARIA / PENDIENTE CIERRE',
    'CLIENTE CON ACUERDO',
    'CLIENTE 8 HORAS',
    'DOCUMENTOS PENDIENTES',
    'CONTACTO NUEVO',
    'CLIENTE 2 HORAS',
    'CLIENTE 6 HORAS',
    'CLIENTE 12 HORAS',
    'CLIENTE 4 HORAS'
)`;

const ETAPAS_DESCARTE = `(
    'Descarte',
    'FUERA DE COBERTURA',
    'ZONA PELIGROSA'
)`;

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
async function getIndicadoresDashboardNuevo(req, res) {
    try {
        const { asesor, supervisor, fechaDesde, fechaHasta, estadoNetlife, estadoRegularizacion, etapaCRM, etapaJotform } = req.query;

        const hoy = getFechaEcuador();
        const desde = fechaDesde || hoy;
        const hasta = fechaHasta || hoy;

        let values = [desde, hasta];
        let filters = '';

        if (asesor) { values.push(`%${asesor}%`); filters += ` AND mv.asesor ILIKE $${values.length}`; }
        if (supervisor) { values.push(`%${supervisor}%`); filters += ` AND mv.supervisor ILIKE $${values.length}`; }
        if (estadoNetlife) { values.push(`%${estadoNetlife}%`); filters += ` AND mv.estado_venta ILIKE $${values.length}`; }
        if (estadoRegularizacion) { values.push(`%${estadoRegularizacion}%`); filters += ` AND mv.estado_regularizacion ILIKE $${values.length}`; }
        if (etapaCRM) { values.push(`%${etapaCRM}%`); filters += ` AND mv.etapa_crm ILIKE $${values.length}`; }
        if (etapaJotform) { values.push(`%${etapaJotform}%`); filters += ` AND mv.estado_venta ILIKE $${values.length}`; }   // Jotform comparte estado_venta

        // Función generadora de query KPI (por supervisor o asesor)
        const queryKPI = (columna) => {
            const groupCol = columna === 'mv.supervisor' ? 'supervisor' : 'asesor';
            return `
                SELECT
                    COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
                    COUNT(*) FILTER (WHERE ${parseFecha('mv.fecha_creacion_crm')} BETWEEN $1::date AND $2::date) AS leads_totales,
                    COUNT(*) FILTER (
                        WHERE mv.etapa_crm = 'Venta Subida'
                        AND ${parseFecha('mv.fecha_creacion_crm')} BETWEEN $1::date AND $2::date
                    ) AS ventas_crm,
                    ROUND( COALESCE(
                        COUNT(*) FILTER (WHERE ${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date)::numeric
                        / NULLIF(COUNT(*) FILTER (
                            WHERE ${parseFecha('mv.fecha_creacion_crm')} BETWEEN $1::date AND $2::date
                            AND ${esGestionableExpr('mv.etapa_crm')}
                        ), 0)
                    , 0) * 100, 2) AS efectividad_realz,
                    COUNT(*) FILTER (
                        WHERE ${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date
                        AND mv.estado_regularizacion ILIKE '%REGULARIZAR%'
                    ) AS por_regularizar,
                    COUNT(*) FILTER (
                        WHERE (${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date
                            OR ${parseFecha('mv.fecha_creacion_crm')} BETWEEN $1::date AND $2::date)
                        AND ${esGestionableExpr('mv.etapa_crm')}
                    ) AS gestionables,
                    COUNT(*) FILTER (WHERE ${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date) AS ingresos_reales,
                    COUNT(*) FILTER (
                        WHERE ${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date
                        AND mv.estado_venta = ${ESTADO_ACTIVO}
                    ) AS activas,
                    COUNT(*) FILTER (
                        WHERE ${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date
                        AND mv.estado_venta = ${ESTADO_ACTIVO}
                    ) AS real_mes,
                    0 AS crec_vs_ma,
                    COUNT(*) FILTER (
                        WHERE mv.forma_pago ILIKE '%TARJETA DE CREDITO%'
                        AND ${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date
                    ) AS tarjeta_credito,
                    COUNT(*) FILTER (
                        WHERE mv.aplica_descuento ILIKE '%TERCERA EDAD%'
                        AND mv.estado_venta = ${ESTADO_ACTIVO}
                        AND ${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date
                    ) AS tercera_edad,
                    (COUNT(*) FILTER (
                        WHERE mv.etapa_crm IN ${ETAPAS_DESCARTE}
                        AND ${parseFecha('mv.fecha_creacion_crm')} BETWEEN $1::date AND $2::date
                    )::numeric /
                    NULLIF(COUNT(*) FILTER (
                        WHERE (${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date
                            OR ${parseFecha('mv.fecha_creacion_crm')} BETWEEN $1::date AND $2::date)
                        AND ${esGestionableExpr('mv.etapa_crm')}
                    ), 0) * 100)::numeric(10,2) AS descarte,
                    ROUND( COALESCE(
                        COUNT(*) FILTER (WHERE ${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date)::numeric
                        / NULLIF(COUNT(*) FILTER (
                            WHERE (${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date
                                OR ${parseFecha('mv.fecha_creacion_crm')} BETWEEN $1::date AND $2::date)
                            AND ${esGestionableExpr('mv.etapa_crm')}
                        ), 0)
                    , 0) * 100, 2) AS efectividad_real,
                    ROUND(COALESCE(
                        COUNT(*) FILTER (WHERE ${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date AND mv.estado_venta = ${ESTADO_ACTIVO})::numeric
                        / NULLIF(COUNT(*) FILTER (WHERE ${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date), 0)
                    , 0) * 100, 2) AS tasa_instalacion,
                    ROUND(COALESCE(
                        COUNT(*) FILTER (WHERE ${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date AND mv.estado_venta = ${ESTADO_ACTIVO})::numeric
                        / NULLIF(COUNT(*) FILTER (
                            WHERE (${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date
                                OR ${parseFecha('mv.fecha_creacion_crm')} BETWEEN $1::date AND $2::date)
                            AND ${esGestionableExpr('mv.etapa_crm')}
                        ), 0)
                    , 0) * 100, 2) AS efectividad_activas_vs_pauta,
                    ROUND( COALESCE(
                        COUNT(*) FILTER (
                            WHERE ${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date
                            AND mv.estado_venta NOT IN ('PRESERVICIO','DESISTE DEL SERVICIO')
                        )::numeric
                        / NULLIF(COUNT(*) FILTER (
                            WHERE ${parseFecha('mv.fecha_creacion_crm')} BETWEEN $1::date AND $2::date
                            AND ${esGestionableExpr('mv.etapa_crm')}
                        ), 0)
                    , 0) * 100, 2) AS eficiencia
                FROM ${MV}
                WHERE (
                    ${parseFecha('mv.fecha_creacion_crm')} BETWEEN $1::date AND $2::date
                    OR ${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date
                ) ${filters}
                GROUP BY 1
                ORDER BY gestionables DESC
            `;
        };

        // Backlog: activaciones en el período pero registro anterior
        const queryBacklog = (columna) => `
            SELECT
                COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(*)::int AS backlog
            FROM ${MV}
            WHERE mv.estado_venta = ${ESTADO_ACTIVO}
            AND mv.fecha_registro_jotform IS NOT NULL
            AND mv.fecha_registro_jotform::date < $1::date
            AND mv.fecha_activacion IS NOT NULL
            AND mv.fecha_activacion::date BETWEEN $1::date AND $2::date
            ${filters}
            GROUP BY 1
        `;

        // Detalle CRM
        const queryCRM = `
            SELECT
                mv.id_crm AS "ID_CRM",
                mv.etapa_crm AS "ETAPA_CRM",
                mv.fecha_creacion_crm AS "FECHA_CREACION_CRM",
                mv.asesor AS "ASESOR",
                mv.supervisor AS "SUPERVISOR_ASIGNADO",
                mv.fecha_modificacion_crm AS "FECHA_MODIFICACION",
                mv.origen AS "ORIGEN"
            FROM ${MV}
            WHERE ${parseFecha('mv.fecha_creacion_crm')} BETWEEN $1::date AND $2::date ${filters}
            LIMIT 6000
        `;

        // Detalle Jotform
        const queryJotform = `
            SELECT
                mv.fecha_registro_jotform AS "FECHA_CREACION_JOT",
                mv.id_crm AS "ID_CRM",
                mv.estado_venta AS "ESTADO_NETLIFE",
                mv.fecha_activacion AS "FECHA_ACTIVACION",
                mv.estado_regularizacion AS "ESTADO_REGULARIZACION",
                mv.forma_pago AS "FORMA_PAGO",
                mv.asesor AS "ASESOR",
                mv.supervisor AS "SUPERVISOR_ASIGNADO",
                mv.aplica_descuento AS "TERCERA_EDAD"
            FROM ${MV}
            WHERE ${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date ${filters}
            LIMIT 6000
        `;

        // Agregaciones
        const queryEstados = `
            SELECT
                COALESCE(NULLIF(TRIM(mv.estado_venta), ''), 'SIN ESTADO') AS estado,
                COUNT(*)::int AS total
            FROM ${MV}
            WHERE ${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date ${filters}
            GROUP BY 1 ORDER BY total DESC
        `;

        const queryEmbudo = `
            SELECT
                COALESCE(mv.etapa_crm, 'SIN ETAPA') AS etapa,
                COUNT(*)::int AS total
            FROM ${MV}
            WHERE ${parseFecha('mv.fecha_creacion_crm')} BETWEEN $1::date AND $2::date ${filters}
            GROUP BY mv.etapa_crm ORDER BY total DESC
        `;

        const queryPorDia = `
            SELECT
                mv.fecha_registro_jotform::date AS fecha,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE mv.estado_venta = ${ESTADO_ACTIVO})::int AS activos
            FROM ${MV}
            WHERE mv.fecha_registro_jotform IS NOT NULL
            AND ${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date ${filters}
            GROUP BY 1 ORDER BY fecha ASC
        `;

        // Etapas CRM únicas (para filtro)
        const queryEtapasCRM = `
            SELECT DISTINCT mv.etapa_crm AS etapa
            FROM ${MV}
            WHERE mv.etapa_crm IS NOT NULL AND TRIM(mv.etapa_crm) <> ''
            ORDER BY etapa ASC
        `;

        // Métricas globales
        const queryTerceraEdad = `
            SELECT
                COUNT(*) FILTER (WHERE mv.aplica_descuento ILIKE '%TERCERA EDAD%' AND mv.estado_venta = ${ESTADO_ACTIVO}) AS total_tercera_edad,
                COUNT(*) FILTER (WHERE mv.estado_venta = ${ESTADO_ACTIVO}) AS total_activos
            FROM ${MV}
            WHERE ${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date ${filters}
        `;

        const queryTarjeta = `
            SELECT
                COUNT(*) FILTER (WHERE mv.forma_pago ILIKE '%TARJETA DE CREDITO%') AS total_tarjeta,
                COUNT(*) AS total_jotform
            FROM ${MV}
            WHERE ${parseFecha('mv.fecha_registro_jotform')} BETWEEN $1::date AND $2::date ${filters}
        `;

        // ── Ejecutar consultas ────────────────────────────────────────────────
        const [resSup, resAses, resCRM, resNet, resEstados, resEmbudo, resDia, resEtapasCRM, resTerceraEdad, resTarjeta, resBacklogSup, resBacklogAses] = await Promise.all([
            pool.query(queryKPI('mv.supervisor'), values),
            pool.query(queryKPI('mv.asesor'), values),
            pool.query(queryCRM, values),
            pool.query(queryJotform, values),
            pool.query(queryEstados, values),
            pool.query(queryEmbudo, values),
            pool.query(queryPorDia, values),
            pool.query(queryEtapasCRM),
            pool.query(queryTerceraEdad, values),
            pool.query(queryTarjeta, values),
            pool.query(queryBacklog('mv.supervisor'), values),
            pool.query(queryBacklog('mv.asesor'), values),
        ]);

        // ── Merge de backlog ──────────────────────────────────────────────────
        const mergeBacklog = (filas, backlogRows) => {
            return filas.map(row => {
                const bl = backlogRows.find(b => b.nombre_grupo === row.nombre_grupo);
                return { ...row, backlog: bl ? Number(bl.backlog) : 0 };
            });
        };

        const supervisoresConBacklog = mergeBacklog(resSup.rows, resBacklogSup.rows);
        const asesoresConBacklog     = mergeBacklog(resAses.rows, resBacklogAses.rows);

        // ── Calcular porcentajes ──────────────────────────────────────────────
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
        console.log(`[DASHBOARD NUEVO] Supervisores: ${supervisoresConBacklog.length} | Asesores: ${asesoresConBacklog.length} | 3raEdad: ${porcentajeTerceraEdad}% | Tarjeta: ${porcentajeTarjeta}% | Backlog: ${totalBacklogSup}`);

        res.json({
            success: true,
            supervisores: supervisoresConBacklog,
            asesores: asesoresConBacklog,
            dataCRM: resCRM.rows,
            dataNetlife: resNet.rows,
            estadosNetlife: resEstados.rows.map(r => ({ estado: r.estado, total: Number(r.total) })),
            graficoEmbudo: resEmbudo.rows,
            graficoBarrasDia: resDia.rows,
            etapasCRM: resEtapasCRM.rows.map(r => r.etapa),
            porcentajeTerceraEdad,
            porcentajeTarjeta,
        });

    } catch (error) {
        console.error("ERROR DASHBOARD NUEVO:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MONITOREO DIARIO
// ─────────────────────────────────────────────────────────────────────────────
async function getMonitoreoDiarioNuevo(req, res) {
    try {
        const hoy = getFechaEcuador();
        const iniciomes = getPrimerDiaMesEcuador();

        const queryMonitoreo = (columna) => `
            SELECT
                COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date) AS real_mes_leads,
                COUNT(*) FILTER (
                    WHERE mv.fecha_creacion_crm::date = $2::date
                    AND ${esGestionableExpr('mv.etapa_crm')}
                ) AS real_dia_leads,
                COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date) AS crm_acumulado,
                COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date = $2::date) AS crm_dia,
                COUNT(*) FILTER (
                    WHERE mv.fecha_creacion_crm::date = $2::date
                    AND mv.etapa_crm = 'Venta Subida'
                ) AS v_subida_crm_hoy,
                ROUND(COALESCE(
                    COUNT(*) FILTER (
                        WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
                        AND mv.etapa_crm IN ${ETAPAS_DESCARTE}
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
                        AND ${esGestionableExpr('mv.etapa_crm')}
                    ), 0)
                , 0) * 100, 2) AS real_descarte,
                ROUND(COALESCE(
                    COUNT(*) FILTER (
                        WHERE mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date
                        AND mv.forma_pago ILIKE '%TARJETA DE CREDITO%'
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date
                    ), 0)
                , 0) * 100, 2) AS real_tarjeta
            FROM ${MV}
            WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
            GROUP BY 1 ORDER BY real_mes_leads DESC
        `;

        const queryJotHoy = (columna) => `
            SELECT
                COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(*)::int AS v_subida_jot_hoy,
                COUNT(*) FILTER (WHERE mv.estado_venta = ${ESTADO_ACTIVO})::int AS activos_jot_hoy,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE mv.forma_pago ILIKE '%TARJETA DE CREDITO%')::numeric
                    / NULLIF(COUNT(*), 0)
                , 0) * 100, 2) AS real_efectividad
            FROM ${MV}
            WHERE mv.fecha_registro_jotform IS NOT NULL
            AND mv.fecha_registro_jotform::date = $1::date
            GROUP BY 1
        `;

        const [resSup, resAses, resJotSupHoy, resJotAsesHoy] = await Promise.all([
            pool.query(queryMonitoreo('mv.supervisor'), [iniciomes, hoy]),
            pool.query(queryMonitoreo('mv.asesor'),      [iniciomes, hoy]),
            pool.query(queryJotHoy('mv.supervisor'),    [hoy]),
            pool.query(queryJotHoy('mv.asesor'),         [hoy]),
        ]);

        const mergeJot = (filas, jotRows) => {
            return filas.map(row => {
                const jot = jotRows.find(j => j.nombre_grupo === row.nombre_grupo);
                return {
                    ...row,
                    v_subida_jot_hoy: jot ? Number(jot.v_subida_jot_hoy) : 0,
                    activos_jot_hoy:  jot ? Number(jot.activos_jot_hoy)  : 0,
                    real_efectividad: jot ? Number(jot.real_efectividad) : 0,
                };
            });
        };

        const supervisoresFinal = mergeJot(resSup.rows, resJotSupHoy.rows);
        const asesoresFinal     = mergeJot(resAses.rows, resJotAsesHoy.rows);

        console.log(`[MONITOREO NUEVO] Supervisores: ${supervisoresFinal.length} | Asesores: ${asesoresFinal.length}`);

        res.json({ success: true, supervisores: supervisoresFinal, asesores: asesoresFinal });

    } catch (error) {
        console.error("ERROR MONITOREO NUEVO:", error);
        res.status(500).json({ success: false, message: error.message });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTE 180
// ─────────────────────────────────────────────────────────────────────────────
async function getReporte180Nuevo(req, res) {
    try {
        const { asesor, supervisor, fechaDesde, fechaHasta, estadoNetlife, estadoRegularizacion, etapaCRM, etapaJotform } = req.query;

        const hoy = getFechaEcuador();
        const desde = fechaDesde || hoy;
        const hasta = fechaHasta || hoy;

        let values = [desde, hasta];
        let filters = '';
        if (asesor) { values.push(`%${asesor}%`); filters += ` AND mv.asesor ILIKE $${values.length}`; }
        if (supervisor) { values.push(`%${supervisor}%`); filters += ` AND mv.supervisor ILIKE $${values.length}`; }
        if (estadoNetlife) { values.push(`%${estadoNetlife}%`); filters += ` AND mv.estado_venta ILIKE $${values.length}`; }
        if (estadoRegularizacion) { values.push(`%${estadoRegularizacion}%`); filters += ` AND mv.estado_regularizacion ILIKE $${values.length}`; }
        if (etapaCRM) { values.push(`%${etapaCRM}%`); filters += ` AND mv.etapa_crm ILIKE $${values.length}`; }
        if (etapaJotform) { values.push(`%${etapaJotform}%`); filters += ` AND mv.estado_venta ILIKE $${values.length}`; }

        const queryKPIs = `
            SELECT
                COUNT(*) FILTER (WHERE mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date) AS ingresos_jot,
                COUNT(*) FILTER (WHERE mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date AND mv.estado_venta = ${ESTADO_ACTIVO}) AS ventas_activas,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE mv.etapa_crm IN ${ETAPAS_DESCARTE} AND mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date)::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE (mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date
                            OR mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date)
                        AND ${esGestionableExpr('mv.etapa_crm')}
                    ), 0)
                , 0) * 100, 2) AS pct_descarte,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date)::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE (mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date
                            OR mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date)
                        AND ${esGestionableExpr('mv.etapa_crm')}
                    ), 0)
                , 0) * 100, 2) AS pct_efectividad,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE mv.aplica_descuento ILIKE '%TERCERA EDAD%' AND mv.estado_venta = ${ESTADO_ACTIVO} AND mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date)::numeric
                    / NULLIF(COUNT(*) FILTER (WHERE mv.estado_venta = ${ESTADO_ACTIVO} AND mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date), 0)
                , 0) * 100, 2) AS pct_tercera_edad
            FROM ${MV}
            WHERE (mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
                OR mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date) ${filters}
        `;

        const queryEmbudoCRM = `
            SELECT COALESCE(mv.etapa_crm, 'SIN ETAPA') AS etapa, COUNT(*)::int AS total
            FROM ${MV}
            WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date ${filters}
            GROUP BY mv.etapa_crm ORDER BY total DESC
        `;

        const queryEmbudoJotform = `
            SELECT COALESCE(mv.estado_venta, 'SIN ESTADO') AS etapa, COUNT(*)::int AS total
            FROM ${MV}
            WHERE mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date ${filters}
            GROUP BY mv.estado_venta ORDER BY total DESC
        `;

        const queryMapaCalor = `
            SELECT
                mv.fecha_registro_jotform::date::text AS fecha,
                COALESCE(mv.ciudad, 'SIN CIUDAD') AS ciudad,
                COUNT(*)::int AS total
            FROM ${MV}
            WHERE mv.fecha_registro_jotform IS NOT NULL
            AND mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date
            AND mv.ciudad IS NOT NULL AND TRIM(mv.ciudad) != ''
            ${filters}
            GROUP BY 1,2 ORDER BY 1 ASC, 3 DESC
        `;

        const [resKPIs, resEmbCRM, resEmbJot, resMapaCalor] = await Promise.all([
            pool.query(queryKPIs, values),
            pool.query(queryEmbudoCRM, values),
            pool.query(queryEmbudoJotform, values),
            pool.query(queryMapaCalor, values),
        ]);

        const kpis = resKPIs.rows[0] || {};
        console.log(`[REPORTE180 NUEVO] ${desde} a ${hasta}`);

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
        console.error("ERROR REPORTE180 NUEVO:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}

module.exports = {
    getIndicadoresDashboardNuevo,
    getMonitoreoDiarioNuevo,
    getReporte180Nuevo,
};