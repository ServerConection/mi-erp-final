const pool = require('../config/db');

const getFechaEcuador = () => {
    const ahora = new Date();
    return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
};

const parseFecha = (col) => `CASE WHEN ${col} IS NULL OR TRIM(${col}::text) = '' THEN NULL WHEN ${col}::text ~ '^\\d{4}-\\d{2}-\\d{2}' THEN ${col}::text::date ELSE TO_DATE(SUBSTRING(${col}::text FROM 5 FOR 11), 'Mon DD YYYY') END`;

// Función para calcular semanas desde inicio de mes
const getSemanasDelMes = (fecha) => {
    const date = new Date(fecha);
    const primerDia = new Date(date.getFullYear(), date.getMonth(), 1);
    const ultimoDia = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    const semanas = [];
    let actualDate = new Date(primerDia);
    let numSemana = 1;

    while (actualDate <= ultimoDia) {
        const inicioSemana = new Date(actualDate);
        const finSemana = new Date(actualDate);
        finSemana.setDate(finSemana.getDate() + 6);

        if (finSemana > ultimoDia) {
            finSemana.setDate(ultimoDia.getDate());
        }

        semanas.push({
            numSemana,
            inicio: inicioSemana.toLocaleDateString('en-CA'),
            fin: finSemana.toLocaleDateString('en-CA')
        });

        actualDate.setDate(actualDate.getDate() + 7);
        numSemana++;
    }

    return semanas;
};

const getComparativaSupervisores = async (req, res) => {
    try {
        const { supervisor, fechaDesde, fechaHasta } = req.query;

        const hoy = getFechaEcuador();
        const desde = fechaDesde || hoy;
        const hasta = fechaHasta || hoy;

        let values = [desde, hasta];
        let filterSupervisor = '';

        if (supervisor) {
            values.push(`%${supervisor}%`);
            filterSupervisor = ` AND e.supervisor ILIKE $${values.length}`;
        }

        // QUERY 1: Comparativa de supervisores - Casos asignados vs gestionables vs ingresos JOT
        const queryComparativa = `
            SELECT
                e.supervisor AS supervisor,
                COUNT(DISTINCT mb.b_id) FILTER (
                    WHERE ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date
                ) AS casos_asignados,
                COUNT(DISTINCT mb.b_id) FILTER (
                    WHERE ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date
                    AND mb.b_etapa_de_la_negociacion IN (
                        'CONTACTO NUEVO','DOCUMENTOS PENDIENTES','NO INTERESA COSTO PLAN','VOLVER A LLAMAR',
                        'GESTION DIARIA','VENTA SUBIDA','SEGUIMIENTO NEGOCIACIÓN','INNEGOCIABLE','CONTRATO NETLIFE',
                        'CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA',
                        'OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','OPORTUNIDADES',
                        'VENTA ECUANET DIRECTA','VENTA DIRECTA ECUANET','GESTIÓN DIARIA',
                        'SEGUIMIENTO NEGOCIACIÓN CON CONTACTO','SEGUIMIENTO SIN CONTACTO',
                        'CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO',
                        'SEGUIMIENTO NEGOCIACIÓN','DESCARTE PLAN DE 200','SEGUIMIENTO PLAN 200'
                    )
                ) AS casos_gestionables,
                COUNT(DISTINCT mb.j_id_bitrix) FILTER (
                    WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                ) AS ingresos_jot,
                COUNT(DISTINCT mb.j_id_bitrix) FILTER (
                    WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND mb.j_netlife_estatus_real = 'ACTIVO'
                ) AS activas,
                ROUND(
                    COUNT(DISTINCT mb.j_id_bitrix) FILTER (
                        WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                        AND mb.j_netlife_estatus_real = 'ACTIVO'
                    )::numeric /
                    NULLIF(COUNT(DISTINCT mb.j_id_bitrix) FILTER (
                        WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    ), 0) * 100, 2
                ) AS tasa_instalacion,
                COUNT(DISTINCT mb.j_id_bitrix) FILTER (
                    WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND mb.j_netlife_estatus_real = 'ACTIVO'
                    AND mb.j_forma_pago = 'TARJETA DE CREDITO.'
                ) AS activas_tarjeta_credito
            FROM mestra_bitrix mb
            LEFT JOIN public.empleados e
                ON mb.b_persona_responsable = e.nombre_completo
                AND e.codigo = EXTRACT(MONTH FROM COALESCE(
                    ${parseFecha('mb.b_cerrado')},
                    ${parseFecha('mb.b_creado_el_fecha')}
                ))::text
            WHERE (
                ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date
                OR mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            ) ${filterSupervisor}
            GROUP BY e.supervisor
            ORDER BY ingresos_jot DESC
        `;

        // QUERY 2: Ingresos JOT por semana vs Activas
        const queryIngresosSemanales = `
            SELECT
                DATE_TRUNC('week', mb.j_fecha_registro_sistema::date)::date AS semana_inicio,
                EXTRACT(WEEK FROM mb.j_fecha_registro_sistema::date) AS num_semana,
                COUNT(DISTINCT mb.j_id_bitrix) AS ingresos_jot,
                COUNT(DISTINCT mb.j_id_bitrix) FILTER (
                    WHERE mb.j_netlife_estatus_real = 'ACTIVO'
                ) AS activas,
                ROUND(
                    COUNT(DISTINCT mb.j_id_bitrix) FILTER (
                        WHERE mb.j_netlife_estatus_real = 'ACTIVO'
                    )::numeric /
                    NULLIF(COUNT(DISTINCT mb.j_id_bitrix), 0) * 100, 2
                ) AS tasa_instalacion
            FROM mestra_bitrix mb
            LEFT JOIN public.empleados e
                ON mb.b_persona_responsable = e.nombre_completo
                AND e.codigo = EXTRACT(MONTH FROM COALESCE(
                    ${parseFecha('mb.b_cerrado')},
                    ${parseFecha('mb.b_creado_el_fecha')}
                ))::text
            WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date ${filterSupervisor}
            GROUP BY DATE_TRUNC('week', mb.j_fecha_registro_sistema::date), EXTRACT(WEEK FROM mb.j_fecha_registro_sistema::date)
            ORDER BY semana_inicio ASC
        `;

        // QUERY 3: Ingresos JOT por día (para desglose de semana)
        const queryIngresosDiarios = `
            SELECT
                mb.j_fecha_registro_sistema::date AS fecha,
                TO_CHAR(mb.j_fecha_registro_sistema::date, 'Day') AS dia_semana,
                COUNT(DISTINCT mb.j_id_bitrix) AS ingresos_jot,
                COUNT(DISTINCT mb.j_id_bitrix) FILTER (
                    WHERE mb.j_netlife_estatus_real = 'ACTIVO'
                ) AS activas
            FROM mestra_bitrix mb
            LEFT JOIN public.empleados e
                ON mb.b_persona_responsable = e.nombre_completo
                AND e.codigo = EXTRACT(MONTH FROM COALESCE(
                    ${parseFecha('mb.b_cerrado')},
                    ${parseFecha('mb.b_creado_el_fecha')}
                ))::text
            WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date ${filterSupervisor}
            GROUP BY mb.j_fecha_registro_sistema::date, TO_CHAR(mb.j_fecha_registro_sistema::date, 'Day')
            ORDER BY fecha ASC
        `;

        // QUERY 4: Métricas adicionales por supervisor
        const queryMetricasAdicionales = `
            SELECT
                e.supervisor AS supervisor,
                COUNT(DISTINCT mb.j_id_bitrix) FILTER (
                    WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND mb.j_netlife_estatus_real = 'ACTIVO'
                    AND mb.j_aplica_descuento_3ra_edad = 'SI POR TERCERA EDAD'
                ) AS activas_tercera_edad,
                COUNT(DISTINCT mb.j_id_bitrix) FILTER (
                    WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND mb.j_estatus_regularizacion = 'POR REGULARIZAR'
                ) AS por_regularizar,
                COUNT(DISTINCT mb.j_id_bitrix) FILTER (
                    WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND mb.j_forma_pago = 'TARJETA DE CREDITO.'
                ) AS pagos_tarjeta
            FROM mestra_bitrix mb
            LEFT JOIN public.empleados e
                ON mb.b_persona_responsable = e.nombre_completo
                AND e.codigo = EXTRACT(MONTH FROM COALESCE(
                    ${parseFecha('mb.b_cerrado')},
                    ${parseFecha('mb.b_creado_el_fecha')}
                ))::text
            WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date ${filterSupervisor}
            GROUP BY e.supervisor
            ORDER BY supervisor ASC
        `;

        const [resComparativa, resSemanales, resDiarios, resMetricas] = await Promise.all([
            pool.query(queryComparativa, values),
            pool.query(queryIngresosSemanales, values),
            pool.query(queryIngresosDiarios, values),
            pool.query(queryMetricasAdicionales, values)
        ]);

        // Formatear datos
        const supervisoresComparativa = resComparativa.rows.map(r => ({
            supervisor: r.supervisor || 'SIN ASIGNAR',
            casos_asignados: Number(r.casos_asignados || 0),
            casos_gestionables: Number(r.casos_gestionables || 0),
            ingresos_jot: Number(r.ingresos_jot || 0),
            activas: Number(r.activas || 0),
            tasa_instalacion: Number(r.tasa_instalacion || 0),
            activas_tarjeta_credito: Number(r.activas_tarjeta_credito || 0)
        }));

        const ingresosSemanales = resSemanales.rows.map(r => ({
            semana_inicio: r.semana_inicio,
            num_semana: Number(r.num_semana || 0),
            ingresos_jot: Number(r.ingresos_jot || 0),
            activas: Number(r.activas || 0),
            tasa_instalacion: Number(r.tasa_instalacion || 0)
        }));

        const ingresosDiarios = resDiarios.rows.map(r => ({
            fecha: r.fecha,
            dia_semana: r.dia_semana,
            ingresos_jot: Number(r.ingresos_jot || 0),
            activas: Number(r.activas || 0)
        }));

        const metricasAdicionales = resMetricas.rows.map(r => ({
            supervisor: r.supervisor || 'SIN ASIGNAR',
            activas_tercera_edad: Number(r.activas_tercera_edad || 0),
            por_regularizar: Number(r.por_regularizar || 0),
            pagos_tarjeta: Number(r.pagos_tarjeta || 0)
        }));

        res.json({
            success: true,
            supervisoresComparativa,
            ingresosSemanales,
            ingresosDiarios,
            metricasAdicionales,
            resumen: {
                total_supervisores: supervisoresComparativa.length,
                total_casos_asignados: supervisoresComparativa.reduce((a, r) => a + r.casos_asignados, 0),
                total_casos_gestionables: supervisoresComparativa.reduce((a, r) => a + r.casos_gestionables, 0),
                total_ingresos_jot: supervisoresComparativa.reduce((a, r) => a + r.ingresos_jot, 0),
                total_activas: supervisoresComparativa.reduce((a, r) => a + r.activas, 0)
            }
        });

    } catch (error) {
        console.error("ERROR COMPARATIVA:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    getComparativaSupervisores
};
