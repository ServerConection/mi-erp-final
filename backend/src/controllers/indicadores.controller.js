const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// Caché de nivel módulo para consultas estáticas (etapas CRM / Jotform)
// Se refresca cada 5 minutos para no saturar el pool con queries repetitivas
// ─────────────────────────────────────────────────────────────────────────────
let _cacheEtapas    = null;
let _cacheEtapasTTL = 0;
const CACHE_TTL_MS  = 5 * 60 * 1000; // 5 minutos

const getEtapasCache = async () => {
  const ahora = Date.now();
  if (_cacheEtapas && ahora < _cacheEtapasTTL) return _cacheEtapas;

  const [resCRM, resJot] = await Promise.all([
    pool.query(`SELECT DISTINCT mb.b_etapa_de_la_negociacion AS etapa
                FROM public.mestra_bitrix mb
                WHERE mb.b_etapa_de_la_negociacion IS NOT NULL
                  AND TRIM(mb.b_etapa_de_la_negociacion) <> ''
                ORDER BY etapa ASC`),
    pool.query(`SELECT DISTINCT COALESCE(NULLIF(TRIM(mb.j_netlife_estatus_real), ''), 'SIN ESTADO') AS etapa
                FROM public.mestra_bitrix mb
                ORDER BY etapa ASC`),
  ]);

  _cacheEtapas    = { etapasCRM: resCRM.rows.map(r => r.etapa), etapasJotform: resJot.rows.map(r => r.etapa) };
  _cacheEtapasTTL = ahora + CACHE_TTL_MS;
  return _cacheEtapas;
};

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

// ─────────────────────────────────────────────────────────────────────────────
// JOIN LATERAL con fallback de mes:
// 1. Busca el mes exacto de la fecha del registro en empleados
// 2. Si no existe ese mes, usa el código de mes más alto disponible para ese asesor
// 3. Si el asesor no existe en empleados, el LEFT JOIN devuelve NULL (asesor igual aparece)
// Esto garantiza que TODOS los asesores aparecen aunque no tengan registro
// para el mes exacto (ej: solo existen codigo='3' y codigo='4')
// ─────────────────────────────────────────────────────────────────────────────
const joinEmpleadosDedup = `
LEFT JOIN LATERAL (
    SELECT e2.supervisor, e2.codigo, e2.nombre_completo
    FROM public.empleados e2
    WHERE e2.nombre_completo = mb.b_persona_responsable
    ORDER BY
        CASE WHEN e2.codigo = EXTRACT(MONTH FROM COALESCE(
            ${parseFecha('mb.b_cerrado')},
            ${parseFecha('mb.b_creado_el_fecha')}
        ))::text THEN 0 ELSE 1 END,
        e2.codigo::int DESC
    LIMIT 1
) e ON true`;

// ─────────────────────────────────────────────────────────────────────────────
// FILTRO supervisor con el mismo fallback para queries sin JOIN
// ─────────────────────────────────────────────────────────────────────────────
const supervisorExistsFilter = (paramIndex) =>
    `AND EXISTS (
        SELECT 1 FROM (
            SELECT e2.supervisor
            FROM public.empleados e2
            WHERE e2.nombre_completo = mb.b_persona_responsable
            ORDER BY
                CASE WHEN e2.codigo = EXTRACT(MONTH FROM COALESCE(
                    ${parseFecha('mb.b_cerrado')},
                    ${parseFecha('mb.b_creado_el_fecha')}
                ))::text THEN 0 ELSE 1 END,
                e2.codigo::int DESC
            LIMIT 1
        ) _sup
        WHERE _sup.supervisor ILIKE $${paramIndex}
    )`;

// Mapa canal → valores reales de mb.b_origen
const CANAL_ORIGENES_MAP = {
    "ARTS":              ["BASE 593-979083368"],
    "ARTS FACEBOOK":     ["BASE 593-995211968"],
    "ARTS GOOGLE":       ["BASE 593-992827793", "FORMULARIO LANDING 3", "LLAMADA LANDING 3"],
    "REMARKETING":       ["BASE 593-958993371", "BASE 593-984414273", "BASE 593-995967355", "WHATSAPP 593958993371"],
    "VIDIKA GOOGLE":     ["BASE 593-962881280", "BASE 593-987133635", "BASE API 593963463480", "FORMULARIO LANDING 4", "LLAMADA", "LLAMADA LANDING 4"],
    "POR RECOMENDACIÓN": ["POR RECOMENDACIÓN", "REFERIDO PERSONAL", "TIENDA ONLINE"],
};
const CANALES_DISPONIBLES = Object.keys(CANAL_ORIGENES_MAP);

const getIndicadoresDashboard = async (req, res) => {
    try {
        const { asesor, supervisor, fechaDesde, fechaHasta, estadoNetlife, estadoRegularizacion, etapaCRM, etapaJotform, canal } = req.query;

        const hoy = getFechaEcuador();
        const desde = fechaDesde ? fechaDesde : hoy;
        const hasta = fechaHasta ? fechaHasta : hoy;

        let values = [desde, hasta];
        let filtersJoin = "";
        let filtersNoJoin = "";

        if (asesor) {
            values.push(`%${asesor}%`);
            filtersJoin    += ` AND mb.b_persona_responsable ILIKE $${values.length}`;
            filtersNoJoin  += ` AND mb.b_persona_responsable ILIKE $${values.length}`;
        }
        if (supervisor) {
            values.push(`%${supervisor}%`);
            filtersJoin   += ` AND e.supervisor ILIKE $${values.length}`;
            filtersNoJoin += ` ${supervisorExistsFilter(values.length)}`;
        }
        if (estadoNetlife) {
            values.push(`%${estadoNetlife}%`);
            filtersJoin   += ` AND mb.j_netlife_estatus_real ILIKE $${values.length}`;
            filtersNoJoin += ` AND mb.j_netlife_estatus_real ILIKE $${values.length}`;
        }
        if (estadoRegularizacion) {
            values.push(`%${estadoRegularizacion}%`);
            filtersJoin   += ` AND mb.j_estatus_regularizacion ILIKE $${values.length}`;
            filtersNoJoin += ` AND mb.j_estatus_regularizacion ILIKE $${values.length}`;
        }
        if (etapaCRM) {
            values.push(`%${etapaCRM}%`);
            filtersJoin   += ` AND mb.b_etapa_de_la_negociacion ILIKE $${values.length}`;
            filtersNoJoin += ` AND mb.b_etapa_de_la_negociacion ILIKE $${values.length}`;
        }
        if (etapaJotform) {
            values.push(`%${etapaJotform}%`);
            filtersJoin   += ` AND mb.j_netlife_estatus_real ILIKE $${values.length}`;
            filtersNoJoin += ` AND mb.j_netlife_estatus_real ILIKE $${values.length}`;
        }
        // Filtro por canal de pauta → convierte a lista de b_origen
        if (canal && CANAL_ORIGENES_MAP[canal]) {
            const origenesCanal = CANAL_ORIGENES_MAP[canal];
            const startIdx = values.length + 1;
            const placeholders = origenesCanal.map((_, i) => `$${startIdx + i}`).join(', ');
            values.push(...origenesCanal);
            filtersJoin   += ` AND mb.b_origen IN (${placeholders})`;
            filtersNoJoin += ` AND mb.b_origen IN (${placeholders})`;
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
                    WHERE (mb.b_etapa_de_la_negociacion ILIKE '%ATC%' OR mb.b_etapa_de_la_negociacion ILIKE '%SOPORTE%')
                    AND ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date
                ) AS atc_soporte,
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
                    WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND mb.j_netlife_estatus_real = 'ACTIVO'
                ) AS activas,
                COUNT(*) FILTER (
                    WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND mb.j_netlife_estatus_real = 'ACTIVO'
                ) AS real_mes,
                COUNT(*) FILTER (
                    WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND mb.j_netlife_estatus_real = 'ACTIVO'
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
                ROUND( COALESCE( COUNT(*) FILTER ( WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date AND mb.j_netlife_estatus_real NOT IN ('PRESERVICIO','DESISTE DEL SERVICIO') )::numeric / NULLIF( COUNT(*) FILTER ( WHERE ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_GESTIONABLES} ), 0), 0 ) * 100, 2) AS eficiencia
            FROM mestra_bitrix mb
            ${joinEmpleadosDedup}
            WHERE (
                ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date
                OR mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            ) ${filtersJoin}
            GROUP BY 1
            ORDER BY gestionables DESC
        `;

        const queryBacklog = (columna) => `
            SELECT
                COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(*)::int AS backlog
            FROM public.mestra_bitrix mb
            ${joinEmpleadosDedup}
            WHERE mb.j_netlife_estatus_real = 'ACTIVO'
            AND mb.j_fecha_registro_sistema IS NOT NULL
            AND TRIM(mb.j_fecha_registro_sistema::text) != ''
            AND mb.j_fecha_registro_sistema::date < $1::date
            AND mb.j_fecha_activacion_netlife IS NOT NULL
            AND TRIM(mb.j_fecha_activacion_netlife::text) != ''
            AND mb.j_fecha_activacion_netlife::date >= $1::date
            AND mb.j_fecha_activacion_netlife::date <= $2::date
            ${filtersJoin}
            GROUP BY 1
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
            ${joinEmpleadosDedup}
            WHERE ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date ${filtersJoin}
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
                mb.j_netlife_login AS "LOGIN",
                mb.b_persona_responsable AS "ASESOR",
                e.supervisor AS "SUPERVISOR_ASIGNADO"
            FROM mestra_bitrix mb
            ${joinEmpleadosDedup}
            WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date ${filtersJoin}
            LIMIT 6000
        `;

        const queryEstados = `
            SELECT
                COALESCE(NULLIF(TRIM(mb.j_netlife_estatus_real), ''), 'SIN ESTADO') AS estado,
                COUNT(*)::int AS total
            FROM public.mestra_bitrix mb
            WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            ${filtersNoJoin}
            GROUP BY 1
            ORDER BY total DESC
        `;

        const queryEmbudo = `
            SELECT
                COALESCE(mb.b_etapa_de_la_negociacion, 'SIN ETAPA') AS etapa,
                COUNT(*)::int AS total
            FROM public.mestra_bitrix mb
            WHERE ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date ${filtersNoJoin}
            GROUP BY mb.b_etapa_de_la_negociacion
            ORDER BY total DESC
        `;

        const queryPorDia = `
            SELECT
                mb.j_fecha_registro_sistema::date AS fecha,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (
                    WHERE mb.j_netlife_estatus_real = 'ACTIVO'
                )::int AS activos
            FROM public.mestra_bitrix mb
            WHERE mb.j_fecha_registro_sistema IS NOT NULL
            AND mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            ${filtersNoJoin}
            GROUP BY 1
            ORDER BY fecha ASC
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
            WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            ${filtersNoJoin}
        `;

        const queryTarjeta = `
            SELECT
                COUNT(*) FILTER (
                    WHERE mb.j_forma_pago = 'TARJETA DE CREDITO.'
                ) AS total_tarjeta,
                COUNT(*) AS total_jotform
            FROM public.mestra_bitrix mb
            WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            ${filtersNoJoin}
        `;

        // ── Lote 1: KPIs + agregaciones (7 queries) ─ Lote 2: tablas + etapas caché ──
        // Dividir en 2 lotes para no agotar el pool (max 15 conexiones)
        const [etapasCache, [resSup, resAses, resEstados, resEmbudo, resDia, resTerceraEdad, resTarjeta]] = await Promise.all([
            getEtapasCache(),
            Promise.all([
                pool.query(queryKPI('e.supervisor'), values),
                pool.query(queryKPI('mb.b_persona_responsable'), values),
                pool.query(queryEstados, values),
                pool.query(queryEmbudo, values),
                pool.query(queryPorDia, values),
                pool.query(queryTerceraEdad, values),
                pool.query(queryTarjeta, values),
            ]),
        ]);

        // Lote 2: tablas detalle + backlogs (espera al lote 1 para no saturar el pool)
        const [resCRM, resNet, resBacklogSup, resBacklogAses] = await Promise.all([
            pool.query(queryCRM, values),
            pool.query(queryJotform, values),
            pool.query(queryBacklog('e.supervisor'), values),
            pool.query(queryBacklog('mb.b_persona_responsable'), values),
        ]);

        const mergeBacklog = (filas, backlogRows) => {
            return filas.map(row => {
                const bl = backlogRows.find(b => b.nombre_grupo === row.nombre_grupo);
                return { ...row, backlog: bl ? Number(bl.backlog) : 0 };
            });
        };

        const supervisoresConBacklog = mergeBacklog(resSup.rows, resBacklogSup.rows);
        const asesoresConBacklog = mergeBacklog(resAses.rows, resBacklogAses.rows);

        const estadosNetlife = resEstados.rows.map(r => ({
            estado: r.estado,
            total: Number(r.total || 0),
        }));

        const graficoEmbudo = resEmbudo.rows.map(r => ({
            name:  r.etapa,
            value: Number(r.total || 0),
            etapa: r.etapa,
            total: Number(r.total || 0),
        }));

        const rowTercera = resTerceraEdad.rows[0] || {};
        const totalTerceraEdad = Number(rowTercera.total_tercera_edad || 0);
        const totalActivosTercera = Number(rowTercera.total_activos || 0);
        const porcentajeTerceraEdad = totalActivosTercera > 0
            ? Number(((totalTerceraEdad / totalActivosTercera) * 100).toFixed(2)) : 0;

        const rowTarjeta = resTarjeta.rows[0] || {};
        const totalTarjeta = Number(rowTarjeta.total_tarjeta || 0);
        const totalJotformTarjeta = Number(rowTarjeta.total_jotform || 0);
        const porcentajeTarjeta = totalJotformTarjeta > 0
            ? Number(((totalTarjeta / totalJotformTarjeta) * 100).toFixed(2)) : 0;

        const totalBacklogSup = supervisoresConBacklog.reduce((a, r) => a + Number(r.backlog || 0), 0);
        console.log(`[DASHBOARD] Supervisores: ${supervisoresConBacklog.length} | Asesores: ${asesoresConBacklog.length} | Barras: ${resDia.rows.length} | 3ra Edad: ${porcentajeTerceraEdad}% | Tarjeta: ${porcentajeTarjeta}% | Backlog Total: ${totalBacklogSup}`);

        res.json({
            success: true,
            supervisores: supervisoresConBacklog,
            asesores: asesoresConBacklog,
            dataCRM: resCRM.rows,
            dataNetlife: resNet.rows,
            estadosNetlife,
            graficoEmbudo,
            graficoBarrasDia: resDia.rows,
            etapasCRM: etapasCache.etapasCRM,
            etapasJotform: etapasCache.etapasJotform,
            porcentajeTerceraEdad,
            porcentajeTarjeta,
            canales: CANALES_DISPONIBLES,
        });

    } catch (error) {
        console.error("ERROR DASHBOARD:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

const getMonitoreoDiario = async (req, res) => {
    try {
        const { asesor, supervisor } = req.query;

        const hoy = getFechaEcuador();
        const iniciomes = getPrimerDiaMesEcuador();

        console.log(`[MONITOREO] Consultando desde ${iniciomes} hasta ${hoy}`);

        const ETAPAS_GESTIONABLES = "('CONTACTO NUEVO','DOCUMENTOS PENDIENTES','NO INTERESA COSTO PLAN','VOLVER A LLAMAR','GESTION DIARIA','VENTA SUBIDA','SEGUIMIENTO NEGOCIACIÓN','INNEGOCIABLE','CONTRATO NETLIFE','CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA','OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','OPORTUNIDADES','VENTA ECUANET DIRECTA','VENTA DIRECTA ECUANET','GESTIÓN DIARIA','SEGUIMIENTO NEGOCIACIÓN CON CONTACTO','SEGUIMIENTO SIN CONTACTO','CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO','DESCARTE PLAN DE 200','SEGUIMIENTO PLAN 200')";
        const ETAPAS_DESCARTE = "('NO INTERESA COSTO PLAN','INNEGOCIABLE','CONTRATO NETLIFE','CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA','OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','VENTA ECUANET DIRECTA','CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO')";

        // JOIN con fallback igual que en dashboard
        const joinMonitoreo = `
LEFT JOIN LATERAL (
    SELECT e2.supervisor, e2.codigo, e2.nombre_completo
    FROM public.empleados e2
    WHERE e2.nombre_completo = mb.b_persona_responsable
    ORDER BY
        CASE WHEN e2.codigo = EXTRACT(MONTH FROM COALESCE(
            ${parseFecha('mb.b_cerrado')},
            ${parseFecha('mb.b_creado_el_fecha')}
        ))::text THEN 0 ELSE 1 END,
        e2.codigo::int DESC
    LIMIT 1
) e ON true`;

        let values = [iniciomes, hoy];
        let filtersJoin = "";
        let filtersNoJoin = "";

        if (asesor) {
            values.push(`%${asesor}%`);
            filtersJoin   += ` AND mb.b_persona_responsable ILIKE $${values.length}`;
            filtersNoJoin += ` AND mb.b_persona_responsable ILIKE $${values.length}`;
        }
        if (supervisor) {
            values.push(`%${supervisor}%`);
            filtersJoin   += ` AND e.supervisor ILIKE $${values.length}`;
            filtersNoJoin += ` AND EXISTS (
                SELECT 1 FROM (
                    SELECT e2.supervisor
                    FROM public.empleados e2
                    WHERE e2.nombre_completo = mb.b_persona_responsable
                    ORDER BY
                        CASE WHEN e2.codigo = EXTRACT(MONTH FROM COALESCE(
                            ${parseFecha('mb.b_cerrado')},
                            ${parseFecha('mb.b_creado_el_fecha')}
                        ))::text THEN 0 ELSE 1 END,
                        e2.codigo::int DESC
                    LIMIT 1
                ) _sup
                WHERE _sup.supervisor ILIKE $${values.length}
            )`;
        }

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
            ${joinMonitoreo}
            WHERE (
                mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date
                OR ${parseFecha('mb.b_cerrado')} BETWEEN $1::date AND $2::date
            ) ${filtersJoin}
            GROUP BY 1
            ORDER BY real_mes_leads DESC
        `;

        const valuesJotHoy = [hoy];
        let filtersJotHoy = "";
        let jotHoyParamOffset = 1;

        if (asesor) {
            valuesJotHoy.push(`%${asesor}%`);
            jotHoyParamOffset++;
            filtersJotHoy += ` AND mb.b_persona_responsable ILIKE $${jotHoyParamOffset}`;
        }
        if (supervisor) {
            valuesJotHoy.push(`%${supervisor}%`);
            jotHoyParamOffset++;
            filtersJotHoy += ` AND e.supervisor ILIKE $${jotHoyParamOffset}`;
        }

        const queryJotHoy = (columna) => `
            SELECT
                COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(*)::int AS v_subida_jot_hoy,
                COUNT(*) FILTER (WHERE mb.j_netlife_estatus_real = 'ACTIVO')::int AS activos_jot_hoy,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE mb.j_forma_pago = 'TARJETA DE CREDITO.')::numeric
                    / NULLIF(COUNT(*), 0)
                , 0) * 100, 2) AS real_efectividad
            FROM public.mestra_bitrix mb
            ${joinMonitoreo}
            WHERE mb.j_fecha_registro_sistema IS NOT NULL
            AND TRIM(mb.j_fecha_registro_sistema) != ''
            AND TRIM(mb.j_fecha_registro_sistema) = $1
            ${filtersJotHoy}
            GROUP BY 1
        `;

        const [resSup, resAses, resJotSupHoy, resJotAsesHoy] = await Promise.all([
            pool.query(queryMonitoreo('e.supervisor'), values),
            pool.query(queryMonitoreo('mb.b_persona_responsable'), values),
            pool.query(queryJotHoy('e.supervisor'), valuesJotHoy),
            pool.query(queryJotHoy('mb.b_persona_responsable'), valuesJotHoy),
        ]);

        const mergeJot = (filas, jotRows) => {
            return filas.map(row => {
                const jot = jotRows.find(j => j.nombre_grupo === row.nombre_grupo);
                return {
                    ...row,
                    v_subida_jot_hoy:  jot ? Number(jot.v_subida_jot_hoy)  : 0,
                    activos_jot_hoy:   jot ? Number(jot.activos_jot_hoy)   : 0,
                    real_efectividad:  jot ? Number(jot.real_efectividad)   : 0,
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
        let filtersNoJoin = "";

        if (asesor) {
            values.push(`%${asesor}%`);
            filtersNoJoin += ` AND mb.b_persona_responsable ILIKE $${values.length}`;
        }
        if (supervisor) {
            values.push(`%${supervisor}%`);
            filtersNoJoin += ` AND EXISTS (
                SELECT 1 FROM (
                    SELECT e2.supervisor
                    FROM public.empleados e2
                    WHERE e2.nombre_completo = mb.b_persona_responsable
                    ORDER BY
                        CASE WHEN e2.codigo = EXTRACT(MONTH FROM COALESCE(
                            ${parseFecha('mb.b_cerrado')},
                            ${parseFecha('mb.b_creado_el_fecha')}
                        ))::text THEN 0 ELSE 1 END,
                        e2.codigo::int DESC
                    LIMIT 1
                ) _sup
                WHERE _sup.supervisor ILIKE $${values.length}
            )`;
        }
        if (estadoNetlife) {
            values.push(`%${estadoNetlife}%`);
            filtersNoJoin += ` AND mb.j_netlife_estatus_real ILIKE $${values.length}`;
        }
        if (estadoRegularizacion) {
            values.push(`%${estadoRegularizacion}%`);
            filtersNoJoin += ` AND mb.j_estatus_regularizacion ILIKE $${values.length}`;
        }
        if (etapaCRM) {
            values.push(`%${etapaCRM}%`);
            filtersNoJoin += ` AND mb.b_etapa_de_la_negociacion ILIKE $${values.length}`;
        }
        if (etapaJotform) {
            values.push(`%${etapaJotform}%`);
            filtersNoJoin += ` AND mb.j_netlife_estatus_real ILIKE $${values.length}`;
        }

        const ETAPAS_GESTIONABLES = `(
            'CONTACTO NUEVO','DOCUMENTOS PENDIENTES','NO INTERESA COSTO PLAN','VOLVER A LLAMAR',
            'GESTION DIARIA','VENTA SUBIDA','SEGUIMIENTO NEGOCIACIÓN','INNEGOCIABLE','CONTRATO NETLIFE',
            'CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA',
            'OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','OPORTUNIDADES',
            'VENTA ECUANET DIRECTA','VENTA DIRECTA ECUANET','GESTIÓN DIARIA',
            'SEGUIMIENTO NEGOCIACIÓN CON CONTACTO','SEGUIMIENTO SIN CONTACTO',
            'CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO',
            'SEGUIMIENTO NEGOCIACIÓN','DESCARTE PLAN DE 200','SEGUIMIENTO PLAN 200'
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
            WHERE (
                ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date
                OR mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            ) ${filtersNoJoin}
        `;

        const queryEmbudoCRM = `
            SELECT
                COALESCE(mb.b_etapa_de_la_negociacion, 'SIN ETAPA') AS etapa,
                COUNT(*)::int AS total
            FROM public.mestra_bitrix mb
            WHERE ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date ${filtersNoJoin}
            GROUP BY mb.b_etapa_de_la_negociacion
            ORDER BY total DESC
        `;

        const queryEmbudoJotform = `
            SELECT
                COALESCE(mb.j_netlife_estatus_real, 'SIN ESTADO') AS etapa,
                COUNT(*)::int AS total
            FROM public.mestra_bitrix mb
            WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date ${filtersNoJoin}
            GROUP BY mb.j_netlife_estatus_real
            ORDER BY total DESC
        `;

        const queryMapaCalor = `
            SELECT
                TRIM(mb.j_fecha_registro_sistema) AS fecha,
                COALESCE(TRIM(mb.j_ciudad), 'SIN CIUDAD') AS ciudad,
                COUNT(*)::int AS total
            FROM public.mestra_bitrix mb
            WHERE mb.j_fecha_registro_sistema IS NOT NULL
            AND TRIM(mb.j_fecha_registro_sistema) != ''
            AND mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            AND mb.j_ciudad IS NOT NULL
            AND TRIM(mb.j_ciudad) != ''
            ${filtersNoJoin}
            GROUP BY 1, 2
            ORDER BY 1 ASC, 3 DESC
        `;

        const [resKPIs, resEmbCRM, resEmbJot, resMapaCalor] = await Promise.all([
            pool.query(queryKPIs, values),
            pool.query(queryEmbudoCRM, values),
            pool.query(queryEmbudoJotform, values),
            pool.query(queryMapaCalor, values),
        ]);

        const kpis = resKPIs.rows[0] || {};

        const embudoCRM = resEmbCRM.rows.map(r => ({
            name:  r.etapa,
            value: Number(r.total || 0),
            etapa: r.etapa,
            total: Number(r.total || 0),
        }));

        const embudoJotform = resEmbJot.rows.map(r => ({
            name:  r.etapa,
            value: Number(r.total || 0),
            etapa: r.etapa,
            total: Number(r.total || 0),
        }));

        console.log(`[REPORTE180] Ejecutado desde ${desde} hasta ${hasta}`);

        res.json({
            success: true,
            kpis: {
                ingresos_jot:     Number(kpis.ingresos_jot || 0),
                ventas_activas:   Number(kpis.ventas_activas || 0),
                pct_descarte:     Number(kpis.pct_descarte || 0),
                pct_efectividad:  Number(kpis.pct_efectividad || 0),
                pct_tercera_edad: Number(kpis.pct_tercera_edad || 0),
            },
            embudoCRM,
            embudoJotform,
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