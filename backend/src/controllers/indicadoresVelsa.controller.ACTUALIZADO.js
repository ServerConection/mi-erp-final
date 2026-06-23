/**
 * 🔄 CONTROLLER ACTUALIZADO A negociaciones_reporteria + vw_jotform_velsa_netlife_completo
 *
 * ESTRUCTURA:
 * mestra_bitrix (tabla vieja combinada)
 *   ↓
 * negociaciones_reporteria (Bitrix24 sincronizado cada 15 min)
 * LEFT JOIN vw_jotform_velsa_netlife_completo (Jotform/Netlife)
 *
 * MAPEO DE COLUMNAS BITRIX:
 * ─────────────────────────────────────────────────────────
 * mb.b_id                          → nr.id
 * mb.b_persona_responsable         → nr.responsable_nombre
 * mb.b_etapa_de_la_negociacion     → nr.etapa
 * mb.b_creado_el_fecha             → nr.creado_en
 * mb.b_cerrado                     → nr.cerrado (flag: 'Y'/'N')
 * mb.b_modificado_el_fecha/hora    → nr.modificado_en
 * mb.b_origen                      → nr.fuente
 *
 * MAPEO DE COLUMNAS JOTFORM:
 * ─────────────────────────────────────────────────────────
 * mb.j_netlife_estatus_real        → jf.estado_venta_netlife
 * mb.j_fecha_registro_sistema      → jf.fecha_registro_sistema
 * mb.j_estatus_regularizacion      → jf.estado_regularizacion
 * mb.j_forma_pago                  → jf.forma_pago
 * mb.j_aplica_descuento_3ra_edad   → jf.descuento_3era_edad
 * mb.j_ciudad                      → jf.ciudad
 * mb.j_fecha_activacion_netlife    → jf.fecha_activacion
 * mb.j_id_bitrix                   → jf.id_bitrix
 */

const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// VENTA DE SERVICIO: misma condición de "venta activa" (estado_venta_netlife =
// ACTIVO) PERO solo cuenta si al menos uno de los campos de "plan" (jf.*) tiene
// datos reales. Si ninguna columna de plan tiene dato, es un servicio adicional
// (no una venta de producto) y por lo tanto NO se cuenta como venta_servicio.
// ─────────────────────────────────────────────────────────────────────────────
const HAS_PLAN_VELSA_JF = `(
    (jf.plan_casa IS NOT NULL AND TRIM(jf.plan_casa::text) <> '') OR
    (jf.plan_pyme IS NOT NULL AND TRIM(jf.plan_pyme::text) <> '') OR
    (jf.plan_profesional IS NOT NULL AND TRIM(jf.plan_profesional::text) <> '') OR
    (jf.plan_hogar_adulto_mayor IS NOT NULL AND TRIM(jf.plan_hogar_adulto_mayor::text) <> '') OR
    (jf.plan_pyme_corp IS NOT NULL AND TRIM(jf.plan_pyme_corp::text) <> '') OR
    (jf.plan_centro_red_comercial IS NOT NULL AND TRIM(jf.plan_centro_red_comercial::text) <> '')
)`;
const VENTA_SERVICIO_VELSA_JF = `(UPPER(TRIM(jf.estado_venta_netlife)) = 'ACTIVO' AND ${HAS_PLAN_VELSA_JF})`;

// ─────────────────────────────────────────────────────────────────────────────
// Caché de nivel módulo para consultas estáticas (etapas CRM)
// ─────────────────────────────────────────────────────────────────────────────
let _cacheEtapas    = null;
let _cacheEtapasTTL = 0;
const CACHE_TTL_MS  = 5 * 60 * 1000; // 5 minutos

// ─────────────────────────────────────────────────────────────────────────────
// Caché de resultados del dashboard (2 minutos)
// ─────────────────────────────────────────────────────────────────────────────
const _cacheDashboard = new Map();
const CACHE_DASH_TTL_MS = 2 * 60 * 1000; // 2 minutos

const getDashboardCache = (key) => {
    const entry = _cacheDashboard.get(key);
    if (entry && Date.now() < entry.ttl) return entry.data;
    _cacheDashboard.delete(key);
    return null;
};
const setDashboardCache = (key, data) => {
    _cacheDashboard.set(key, { data, ttl: Date.now() + CACHE_DASH_TTL_MS });
    if (_cacheDashboard.size > 100) {
        const ahora = Date.now();
        for (const [k, v] of _cacheDashboard) if (ahora > v.ttl) _cacheDashboard.delete(k);
    }
};

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

const getEtapasCache = async () => {
  const ahora = Date.now();
  if (_cacheEtapas && ahora < _cacheEtapasTTL) return _cacheEtapas;

  // ACTUALIZADO: Leer de negociaciones_reporteria en lugar de mestra_bitrix
  const resCRM = await pool.query(`
    SELECT DISTINCT nr.etapa
    FROM public.negociaciones_reporteria nr
    WHERE nr.etapa IS NOT NULL
      AND TRIM(nr.etapa) <> ''
    ORDER BY etapa ASC
  `);

  _cacheEtapas    = { etapasCRM: resCRM.rows.map(r => r.etapa), etapasJotform: [] };
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
// JOIN CON EMPLEADOS (igual lógica, pero ahora sobre negociaciones_reporteria)
// ─────────────────────────────────────────────────────────────────────────────
const joinEmpleadosDedup = `
LEFT JOIN LATERAL (
    SELECT e2.supervisor, e2.codigo, e2.nombre_completo
    FROM public.empleados e2
    WHERE e2.nombre_completo = nr.responsable_nombre
    ORDER BY
        CASE WHEN e2.codigo = EXTRACT(MONTH FROM COALESCE(
            nr.modificado_en,
            nr.creado_en
        ))::text THEN 0 ELSE 1 END,
        e2.codigo::int DESC
    LIMIT 1
) e ON true`;

const supervisorExistsFilter = (paramIndex) =>
    `AND EXISTS (
        SELECT 1 FROM (
            SELECT e2.supervisor
            FROM public.empleados e2
            WHERE e2.nombre_completo = nr.responsable_nombre
            ORDER BY
                CASE WHEN e2.codigo = EXTRACT(MONTH FROM COALESCE(
                    nr.modificado_en,
                    nr.creado_en
                ))::text THEN 0 ELSE 1 END,
                e2.codigo::int DESC
            LIMIT 1
        ) _sup
        WHERE _sup.supervisor ILIKE $${paramIndex}
    )`;

// Mapa canal → valores reales de nr.fuente
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

        const cacheKey = JSON.stringify({ asesor, supervisor, desde, hasta, estadoNetlife, estadoRegularizacion, etapaCRM, etapaJotform, canal });
        const cached = getDashboardCache(cacheKey);
        if (cached) {
            console.log(`[DASHBOARD] Cache hit → ${desde}~${hasta} asesor=${asesor||''} sup=${supervisor||''}`);
            return res.json(cached);
        }

        let values = [desde, hasta];
        let filtersJoin = "";
        let filtersNoJoin = "";

        if (asesor) {
            values.push(`%${asesor}%`);
            filtersJoin    += ` AND nr.responsable_nombre ILIKE $${values.length}`;
            filtersNoJoin  += ` AND nr.responsable_nombre ILIKE $${values.length}`;
        }
        if (supervisor) {
            values.push(`%${supervisor}%`);
            filtersJoin   += ` AND e.supervisor ILIKE $${values.length}`;
            filtersNoJoin += ` ${supervisorExistsFilter(values.length)}`;
        }
        if (etapaCRM) {
            values.push(`%${etapaCRM}%`);
            filtersJoin   += ` AND nr.etapa ILIKE $${values.length}`;
            filtersNoJoin += ` AND nr.etapa ILIKE $${values.length}`;
        }
        // ⚠️ CAMPOS NETLIFE COMENTADOS (no existen en Bitrix24)
        // if (estadoNetlife) { ... }
        // if (estadoRegularizacion) { ... }
        // if (etapaJotform) { ... }

        if (canal && CANAL_ORIGENES_MAP[canal]) {
            const origenesCanal = CANAL_ORIGENES_MAP[canal];
            const startIdx = values.length + 1;
            const placeholders = origenesCanal.map((_, i) => `$${startIdx + i}`).join(', ');
            values.push(...origenesCanal);
            const origenFilter = `(
                nr.fuente IN (${placeholders})
                OR nr.id::text IN (
                    SELECT nr2.id::text
                    FROM negociaciones_reporteria nr2
                    WHERE nr2.fuente IN (${placeholders})
                      AND nr2.id IS NOT NULL
                )
            )`;
            filtersJoin   += ` AND ${origenFilter}`;
            filtersNoJoin += ` AND ${origenFilter}`;
        }

        // ETAPAS GESTIONABLES (igual que antes)
        const ETAPAS_GESTIONABLES = `(
            'CONTACTO NUEVO','DOCUMENTOS PENDIENTES','NO INTERESA COSTO PLAN','VOLVER A LLAMAR',
            'GESTION DIARIA','VENTA SUBIDA','SEGUIMIENTO NEGOCIACIÓN','INNEGOCIABLE','CONTRATO NETLIFE',
            'CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA',
            'OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','OPORTUNIDADES',
            'VENTA ECUANET DIRECTA','VENTA DIRECTA ECUANET','GESTIÓN DIARIA',
            'SEGUIMIENTO NEGOCIACIÓN CON CONTACTO','SEGUIMIENTO SIN CONTACTO',
            'CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO',
            'SEGUIMIENTO NEGOCIACIÓN','DESCARTE PLAN DE 200','SEGUIMIENTO PLAN 200',
            'CLIENTE 4 HORAS','CLIENTE 2 HORAS','CLIENTE 6 HORAS','CLIENTE 8 HORAS',
            'CLIENTE CON ACUERDO','OPORTUNIDADES SUPERVISOR','PENDIENTE CIERRE', 'POSTVENTA NOVONET', 'DESCARTE','CLIENTE 2 HORAS',
    'CLIENTE 4 HORAS',
    'CLIENTE 6 HORAS',
    'CLIENTE 8 HORAS',
    'CLIENTE 12 HORAS',
    'CLIENTE CON ACUERDO',
    'CONTACTO NUEVO',
    'DESCARTE',
    'DOCUMENTOS PENDIENTES',
    'GESTION DIARIA / PENDIENTE CIERRE',
    'OPORTUNIDADES SUPERVISOR',
    'VENTA SUBIDA',
    'Venta Subida',
    'Descarte'
        )`;

        const ETAPAS_DESCARTE = `(
            'NO INTERESA COSTO PLAN','INNEGOCIABLE','CONTRATO NETLIFE','CLIENTE DISCAPACIDAD',
            'OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA','OTRO PROVEEDOR',
            'NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','VENTA ECUANET DIRECTA',
            'CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO',
            'FUERA DE COBERTURA','DESCARTE'
        )`;

        const queryKPI = (columna) => {
            const groupCol     = columna === 'e.supervisor' ? 'supervisor' : 'responsable_nombre';
            const esSupervisor = columna === 'e.supervisor';
            const extraSelect  = esSupervisor ? '' : ", COALESCE(supervisor, 'SIN ASIGNAR') AS sup_nombre";
            const extraGroup   = esSupervisor ? '' : ', 2';
            const HAS_PLAN_BASE = `(
                (plan_casa IS NOT NULL AND TRIM(plan_casa::text) <> '') OR
                (plan_pyme IS NOT NULL AND TRIM(plan_pyme::text) <> '') OR
                (plan_profesional IS NOT NULL AND TRIM(plan_profesional::text) <> '') OR
                (plan_hogar_adulto_mayor IS NOT NULL AND TRIM(plan_hogar_adulto_mayor::text) <> '') OR
                (plan_pyme_corp IS NOT NULL AND TRIM(plan_pyme_corp::text) <> '') OR
                (plan_centro_red_comercial IS NOT NULL AND TRIM(plan_centro_red_comercial::text) <> '')
            )`;
            const VENTA_SERVICIO_BASE = `(UPPER(TRIM(estado_venta_netlife)) = 'ACTIVO' AND ${HAS_PLAN_BASE})`;
            return `
            WITH _base AS MATERIALIZED (
                SELECT
                    nr.responsable_nombre,
                    nr.etapa,
                    nr.cerrado,
                    e.supervisor,
                    nr.creado_en::date AS _bc_date,
                    nr.modificado_en::date AS _bcerrado_date,
                    jf.fecha_registro_sistema::date AS _jf_date,
                    jf.estado_venta_netlife,
                    jf.estado_regularizacion,
                    jf.forma_pago,
                    jf.descuento_3era_edad,
                    jf.plan_casa,
                    jf.plan_pyme,
                    jf.plan_profesional,
                    jf.plan_hogar_adulto_mayor,
                    jf.plan_pyme_corp,
                    jf.plan_centro_red_comercial
                FROM negociaciones_reporteria nr
                ${joinEmpleadosDedup}
                LEFT JOIN vw_jotform_velsa_netlife_completo jf ON nr.id = jf.id_bitrix
                WHERE (
                    nr.creado_en::date BETWEEN $1::date AND $2::date
                    OR nr.modificado_en::date BETWEEN $1::date AND $2::date
                    OR jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                ) ${filtersJoin}
            )
            SELECT
                COALESCE(${groupCol}, 'SIN ASIGNAR') AS nombre_grupo
                ${extraSelect},
                COUNT(*) FILTER (WHERE _bc_date BETWEEN $1::date AND $2::date) AS leads_totales,
                COUNT(*) FILTER (
                    WHERE (etapa ILIKE '%ATC%' OR etapa ILIKE '%SOPORTE%')
                    AND _bc_date BETWEEN $1::date AND $2::date
                ) AS atc_soporte,
                COUNT(*) FILTER (
                    WHERE _bcerrado_date BETWEEN $1::date AND $2::date
                    AND etapa = 'VENTA SUBIDA'
                ) AS ventas_crm,
                0 AS ventas_del_dia, -- calculado por self-join externo (ver queryVentasDia*)
                ROUND( COALESCE(
                    COUNT(*) FILTER (WHERE _jf_date BETWEEN $1::date AND $2::date)::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE _bcerrado_date BETWEEN $1::date AND $2::date
                        AND ${esGestionableExpr('etapa')}
                    ), 0)
                , 0) * 100, 2) AS efectividad_realz,
                COUNT(*) FILTER (
                    WHERE _jf_date BETWEEN $1::date AND $2::date
                    AND estado_regularizacion = 'POR REGULARIZAR'
                ) AS por_regularizar,
                COUNT(*) FILTER (
                    WHERE (_bc_date BETWEEN $1::date AND $2::date OR _bcerrado_date BETWEEN $1::date AND $2::date)
                    AND ${esGestionableExpr('etapa')}
                ) AS gestionables,
                COUNT(*) FILTER (WHERE _jf_date BETWEEN $1::date AND $2::date) AS ingresos_reales,
                COUNT(*) FILTER (
                    WHERE _jf_date BETWEEN $1::date AND $2::date AND estado_venta_netlife = 'ACTIVO'
                ) AS activas,
                COUNT(*) FILTER (
                    WHERE _jf_date BETWEEN $1::date AND $2::date AND ${VENTA_SERVICIO_BASE}
                ) AS venta_servicio,
                COUNT(*) FILTER (
                    WHERE _jf_date BETWEEN $1::date AND $2::date AND estado_venta_netlife = 'ACTIVO'
                ) AS real_mes,
                COUNT(*) FILTER (
                    WHERE _jf_date BETWEEN $1::date AND $2::date AND estado_venta_netlife = 'ACTIVO'
                ) AS total_activas_calculada,
                0 AS crec_vs_ma,
                COUNT(*) FILTER (
                    WHERE forma_pago = 'TARJETA DE CREDITO.'
                    AND _jf_date BETWEEN $1::date AND $2::date
                ) AS tarjeta_credito,
                COUNT(*) FILTER (
                    WHERE descuento_3era_edad = 'SI POR TERCERA EDAD'
                    AND estado_venta_netlife = 'ACTIVO'
                    AND _jf_date BETWEEN $1::date AND $2::date
                ) AS tercera_edad,
                (COUNT(*) FILTER (
                    WHERE etapa IN ${ETAPAS_DESCARTE}
                    AND _bc_date BETWEEN $1::date AND $2::date
                )::numeric /
                NULLIF(COUNT(*) FILTER (
                    WHERE (_bc_date BETWEEN $1::date AND $2::date OR _bcerrado_date BETWEEN $1::date AND $2::date)
                    AND ${esGestionableExpr('etapa')}
                ), 0) * 100)::numeric(10,2) AS descarte,
                COUNT(*) FILTER (
                    WHERE _jf_date BETWEEN $1::date AND $2::date
                    AND estado_venta_netlife NOT IN ('FUERA DE COBERTURA','DESISTE DEL SERVICIO','RECHAZADO')
                    AND estado_regularizacion = 'POR REGULARIZAR'
                ) AS regularizacion,
                ROUND( COALESCE(
                    COUNT(*) FILTER (WHERE _jf_date BETWEEN $1::date AND $2::date)::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE (_bc_date BETWEEN $1::date AND $2::date OR _bcerrado_date BETWEEN $1::date AND $2::date)
                        AND ${esGestionableExpr('etapa')}
                    ), 0)
                , 0) * 100, 2) AS efectividad_real,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE _jf_date BETWEEN $1::date AND $2::date AND estado_venta_netlife = 'ACTIVO')::numeric
                    / NULLIF(COUNT(*) FILTER (WHERE _jf_date BETWEEN $1::date AND $2::date), 0)
                , 0) * 100, 2) AS tasa_instalacion,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE _jf_date BETWEEN $1::date AND $2::date AND estado_venta_netlife = 'ACTIVO')::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE (_bc_date BETWEEN $1::date AND $2::date OR _bcerrado_date BETWEEN $1::date AND $2::date)
                        AND ${esGestionableExpr('etapa')}
                    ), 0)
                , 0) * 100, 2) AS efectividad_activas_vs_pauta,
                ROUND( COALESCE(
                    COUNT(*) FILTER (
                        WHERE _jf_date BETWEEN $1::date AND $2::date
                        AND estado_venta_netlife NOT IN ('PRESERVICIO','DESISTE DEL SERVICIO')
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE _bc_date BETWEEN $1::date AND $2::date
                        AND ${esGestionableExpr('etapa')}
                    ), 0)
                , 0) * 100, 2) AS eficiencia
            FROM _base
            GROUP BY 1${extraGroup}
            ORDER BY gestionables DESC
            `;
        };

        // ── VENTAS DEL DÍA VELSA: nr.creado_en + VENTA SUBIDA + JOT mismo día ──
        const queryVentasDiaAsesor = `
            SELECT
                nr.responsable_nombre AS nombre_grupo,
                COUNT(DISTINCT jf.id_bitrix)::int AS ventas_del_dia
            FROM public.vw_jotform_velsa_netlife_completo jf
            JOIN public.negociaciones_reporteria nr ON nr.id = jf.id_bitrix
            WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            AND nr.etapa = 'VENTA SUBIDA'
            AND nr.creado_en::date = jf.fecha_registro_sistema::date
            AND nr.responsable_nombre IS NOT NULL
            GROUP BY 1
        `;
        const queryVentasDiaSup = `
            SELECT
                COALESCE(e.supervisor, 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(DISTINCT jf.id_bitrix)::int AS ventas_del_dia
            FROM public.vw_jotform_velsa_netlife_completo jf
            JOIN public.negociaciones_reporteria nr ON nr.id = jf.id_bitrix
            LEFT JOIN LATERAL (
                SELECT e2.supervisor FROM public.empleados e2
                WHERE e2.nombre_completo = nr.responsable_nombre
                ORDER BY e2.codigo::int DESC LIMIT 1
            ) e ON true
            WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            AND nr.etapa = 'VENTA SUBIDA'
            AND nr.creado_en::date = jf.fecha_registro_sistema::date
            GROUP BY 1
        `;

        const queryBacklog = (columna) => `
            SELECT
                COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(*)::int AS backlog
            FROM public.negociaciones_reporteria nr
            ${joinEmpleadosDedup}
            LEFT JOIN vw_jotform_velsa_netlife_completo jf ON nr.id = jf.id_bitrix
            WHERE jf.estado_venta_netlife = 'ACTIVO'
            AND jf.fecha_activacion::date >= $1::date
            AND jf.fecha_activacion::date <= $2::date
            AND jf.fecha_registro_sistema::date < $1::date
            ${filtersJoin}
            GROUP BY 1
        `;

        const queryCRM = `
            SELECT
                nr.id AS "ID_CRM",
                nr.etapa AS "ETAPA_CRM",
                nr.creado_en::date AS "FECHA_CREACION_CRM",
                nr.responsable_nombre AS "ASESOR",
                EXTRACT(HOUR FROM nr.creado_en)::text AS "HORA_CREACION",
                e.supervisor AS "SUPERVISOR_ASIGNADO",
                nr.modificado_en::date AS "FECHA_MODIFICACION",
                EXTRACT(HOUR FROM nr.modificado_en)::text AS "HORA_MODIFICACION",
                nr.fuente AS "ORIGEN"
            FROM negociaciones_reporteria nr
            ${joinEmpleadosDedup}
            WHERE nr.creado_en::date BETWEEN $1::date AND $2::date ${filtersJoin}
            LIMIT 6000
        `;

        const queryJotform = `
            SELECT
                jf.fecha_registro_sistema AS "FECHACREACION_JOT",
                jf.id_bitrix AS "ID_CRM",
                jf.estado_venta_netlife AS "ESTADO_NETLIFE",
                jf.fecha_activacion AS "FECHA_ACTIVACION",
                jf.novedades_atc AS "NOVEDADES_ATC",
                jf.estado_regularizacion AS "ESTADO_REGULARIZACION",
                jf.detalle_regularizacion AS "MOTIVO_REGULARIZAR",
                jf.forma_pago AS "FORMA_PAGO",
                jf.login_netlife AS "LOGIN",
                nr.responsable_nombre AS "ASESOR",
                e.supervisor AS "SUPERVISOR_ASIGNADO"
            FROM vw_jotform_velsa_netlife_completo jf
            LEFT JOIN negociaciones_reporteria nr ON jf.id_bitrix = nr.id
            LEFT JOIN LATERAL (
                SELECT e2.supervisor
                FROM public.empleados e2
                WHERE e2.nombre_completo = nr.responsable_nombre
                ORDER BY e2.codigo::int DESC
                LIMIT 1
            ) e ON true
            WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date ${filtersJoin}
            LIMIT 6000
        `;

        const queryEstados = `
            SELECT
                COALESCE(NULLIF(TRIM(jf.estado_venta_netlife), ''), 'SIN ESTADO') AS estado,
                COUNT(*)::int AS total
            FROM public.vw_jotform_velsa_netlife_completo jf
            WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            ${filtersNoJoin}
            GROUP BY 1
            ORDER BY total DESC
        `;

        const queryEmbudo = `
            SELECT
                COALESCE(nr.etapa, 'SIN ETAPA') AS etapa,
                COUNT(*)::int AS total
            FROM public.negociaciones_reporteria nr
            WHERE nr.creado_en::date BETWEEN $1::date AND $2::date ${filtersNoJoin}
            GROUP BY nr.etapa
            ORDER BY total DESC
        `;

        const queryPorDia = `
            SELECT
                nr.creado_en::date AS fecha,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (
                    WHERE nr.cerrado = 'N'
                )::int AS activos
            FROM public.negociaciones_reporteria nr
            WHERE nr.creado_en::date BETWEEN $1::date AND $2::date
            ${filtersNoJoin}
            GROUP BY 1
            ORDER BY fecha ASC
        `;

        const queryMetasGlobales = `
            SELECT
                COUNT(*) FILTER (
                    WHERE jf.descuento_3era_edad = 'SI POR TERCERA EDAD'
                    AND jf.estado_venta_netlife = 'ACTIVO'
                ) AS total_tercera_edad,
                COUNT(*) FILTER (
                    WHERE jf.estado_venta_netlife = 'ACTIVO'
                ) AS total_activos,
                COUNT(*) FILTER (
                    WHERE jf.forma_pago = 'TARJETA DE CREDITO.'
                ) AS total_tarjeta,
                COUNT(*) AS total_jotform
            FROM public.vw_jotform_velsa_netlife_completo jf
            WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            ${filtersNoJoin}
        `;

        const [etapasCache, [resSup, resAses, resEstados, resEmbudo, resDia, resMetasGlobales]] = await Promise.all([
            getEtapasCache(),
            Promise.all([
                pool.query(queryKPI('e.supervisor'), values),
                pool.query(queryKPI('nr.responsable_nombre'), values),
                pool.query(queryEstados, values),
                pool.query(queryEmbudo, values),
                pool.query(queryPorDia, values),
                pool.query(queryMetasGlobales, values),
            ]),
        ]);

        const dateValues = [desde, hasta];
        const [resCRM, resNet, resBacklogSup, resBacklogAses, resVDASup, resVDAsesor] = await Promise.all([
            pool.query(queryCRM, values),
            pool.query(queryJotform, values),
            pool.query(queryBacklog('e.supervisor'), values),
            pool.query(queryBacklog('nr.responsable_nombre'), values),
            pool.query(queryVentasDiaSup, dateValues),
            pool.query(queryVentasDiaAsesor, dateValues),
        ]);

        const mergeBacklog = (filas, backlogRows) => {
            return filas.map(row => {
                const bl = backlogRows.find(b => b.nombre_grupo === row.nombre_grupo);
                return { ...row, backlog: bl ? Number(bl.backlog) : 0 };
            });
        };

        const mergeVentasDia = (filas, vdRows) => filas.map(row => {
            const vd = vdRows.find(v => v.nombre_grupo === row.nombre_grupo);
            const ventas_del_dia_real = vd ? Number(vd.ventas_del_dia) : 0;
            return {
                ...row,
                ventas_del_dia:    ventas_del_dia_real,
                ventas_dia_form:   ventas_del_dia_real,
                venta_seguimiento: Math.max(0, Number(row.ingresos_reales || 0) - ventas_del_dia_real),
            };
        });

        const supervisoresConBacklog = mergeVentasDia(mergeBacklog(resSup.rows, resBacklogSup.rows), resVDASup.rows);
        const asesoresConBacklog     = mergeVentasDia(mergeBacklog(resAses.rows, resBacklogAses.rows), resVDAsesor.rows);

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

        const rowMetas = resMetasGlobales.rows[0] || {};
        const totalTerceraEdad    = 0; // No disponible en Bitrix
        const totalActivosTercera = 0;
        const totalTarjeta        = 0; // No disponible en Bitrix
        const totalJotformTarjeta = Number(rowMetas.total_jotform || 0);

        const porcentajeTerceraEdad = 0;
        const porcentajeTarjeta = 0;

        const totalBacklogSup = supervisoresConBacklog.reduce((a, r) => a + Number(r.backlog || 0), 0);
        console.log(`[DASHBOARD] Supervisores: ${supervisoresConBacklog.length} | Asesores: ${asesoresConBacklog.length} | Backlog Total: ${totalBacklogSup}`);

        const resultado = {
            success: true,
            supervisores: supervisoresConBacklog,
            asesores: asesoresConBacklog,
            dataCRM: resCRM.rows,
            dataNetlife: resNet.rows,
            estadosNetlife,
            graficoEmbudo,
            graficoBarrasDia: resDia.rows,
            etapasCRM: etapasCache.etapasCRM,
            etapasJotform: [],
            porcentajeTerceraEdad,
            porcentajeTarjeta,
            canales: CANALES_DISPONIBLES,
        };

        setDashboardCache(cacheKey, resultado);
        res.json(resultado);

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

        const ETAPAS_GESTIONABLES = "('CONTACTO NUEVO','DOCUMENTOS PENDIENTES','NO INTERESA COSTO PLAN','VOLVER A LLAMAR','GESTION DIARIA','VENTA SUBIDA','SEGUIMIENTO NEGOCIACIÓN','INNEGOCIABLE','CONTRATO NETLIFE','CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA','OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','OPORTUNIDADES','VENTA ECUANET DIRECTA','VENTA DIRECTA ECUANET','GESTIÓN DIARIA','SEGUIMIENTO NEGOCIACIÓN CON CONTACTO','SEGUIMIENTO SIN CONTACTO','CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO','DESCARTE PLAN DE 200','SEGUIMIENTO PLAN 200','CLIENTE 4 HORAS','CLIENTE 2 HORAS','CLIENTE 6 HORAS','CLIENTE 8 HORAS','CLIENTE CON ACUERDO','OPORTUNIDADES SUPERVISOR','PENDIENTE CIERRE','CLIENTE 2 HORAS',
    'CLIENTE 4 HORAS',
    'CLIENTE 6 HORAS',
    'CLIENTE 8 HORAS',
    'CLIENTE 12 HORAS',
    'CLIENTE CON ACUERDO',
    'CONTACTO NUEVO',
    'DESCARTE',
    'DOCUMENTOS PENDIENTES',
    'GESTION DIARIA / PENDIENTE CIERRE',
    'OPORTUNIDADES SUPERVISOR',
    'VENTA SUBIDA',
    'Venta Subida',
    'Descarte')";

        const ETAPAS_DESCARTE = "('NO INTERESA COSTO PLAN','INNEGOCIABLE','CONTRATO NETLIFE','CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA','OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','VENTA ECUANET DIRECTA','CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO','FUERA DE COBERTURA','DESCARTE')";

        const joinMonitoreo = `
LEFT JOIN LATERAL (
    SELECT e2.supervisor, e2.codigo, e2.nombre_completo
    FROM public.empleados e2
    WHERE e2.nombre_completo = nr.responsable_nombre
    ORDER BY
        CASE WHEN e2.codigo = EXTRACT(MONTH FROM COALESCE(
            nr.modificado_en,
            nr.creado_en
        ))::text THEN 0 ELSE 1 END,
        e2.codigo::int DESC
    LIMIT 1
) e ON true`;

        let values = [iniciomes, hoy];
        let filtersJoin = "";
        let filtersNoJoin = "";

        if (asesor) {
            values.push(`%${asesor}%`);
            filtersJoin   += ` AND nr.responsable_nombre ILIKE $${values.length}`;
            filtersNoJoin += ` AND nr.responsable_nombre ILIKE $${values.length}`;
        }
        if (supervisor) {
            values.push(`%${supervisor}%`);
            filtersJoin   += ` AND e.supervisor ILIKE $${values.length}`;
            filtersNoJoin += ` AND EXISTS (
                SELECT 1 FROM (
                    SELECT e2.supervisor
                    FROM public.empleados e2
                    WHERE e2.nombre_completo = nr.responsable_nombre
                    ORDER BY
                        CASE WHEN e2.codigo = EXTRACT(MONTH FROM COALESCE(
                            nr.modificado_en,
                            nr.creado_en
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
                COUNT(DISTINCT nr.id) FILTER (
                    WHERE nr.creado_en::date BETWEEN $1::date AND $2::date
                ) AS real_mes_leads,
                COUNT(DISTINCT nr.id) FILTER (
                    WHERE nr.modificado_en::date = $2::date
                    AND ${esGestionableExpr('nr.etapa')}
                ) AS real_dia_leads,
                COUNT(DISTINCT nr.id) FILTER (
                    WHERE nr.creado_en::date BETWEEN $1::date AND $2::date
                ) AS crm_acumulado,
                COUNT(DISTINCT nr.id) FILTER (
                    WHERE nr.creado_en::date BETWEEN $1::date AND $2::date
                ) AS crm_dia,
                COUNT(DISTINCT nr.id) FILTER (
                    WHERE nr.modificado_en::date = $2::date
                    AND nr.etapa = 'VENTA SUBIDA'
                ) AS v_subida_crm_hoy,
                ROUND(COALESCE(
                    COUNT(DISTINCT nr.id) FILTER (
                        WHERE nr.creado_en::date BETWEEN $1::date AND $2::date
                        AND nr.etapa IN ${ETAPAS_DESCARTE}
                    )::numeric
                    / NULLIF(COUNT(DISTINCT nr.id) FILTER (
                        WHERE nr.creado_en::date BETWEEN $1::date AND $2::date
                        AND ${esGestionableExpr('nr.etapa')}
                    ), 0)
                , 0) * 100, 2) AS real_descarte,
                ROUND(COALESCE(
                    COUNT(DISTINCT jf.id_bitrix) FILTER (
                        WHERE jf.fecha_registro_sistema::date = $2::date
                        AND jf.forma_pago = 'TARJETA DE CREDITO.'
                    )::numeric
                    / NULLIF(COUNT(DISTINCT jf.id_bitrix) FILTER (
                        WHERE jf.fecha_registro_sistema::date = $2::date
                    ), 0)
                , 0) * 100, 2) AS real_tarjeta
                ,
                COUNT(DISTINCT jf.id_bitrix) FILTER (
                    WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND ${VENTA_SERVICIO_VELSA_JF}
                ) AS real_venta_servicio
            FROM public.negociaciones_reporteria nr
            ${joinMonitoreo}
            LEFT JOIN vw_jotform_velsa_netlife_completo jf ON nr.id = jf.id_bitrix
            WHERE (
                nr.creado_en::date BETWEEN $1::date AND $2::date
                OR nr.modificado_en::date BETWEEN $1::date AND $2::date
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
            filtersJotHoy += ` AND nr.responsable_nombre ILIKE $${jotHoyParamOffset}`;
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
                COUNT(*) FILTER (WHERE jf.estado_venta_netlife = 'ACTIVO')::int AS activos_jot_hoy,
                COUNT(*) FILTER (WHERE ${VENTA_SERVICIO_VELSA_JF})::int AS venta_servicio_jot_hoy,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE jf.forma_pago = 'TARJETA DE CREDITO.')::numeric
                    / NULLIF(COUNT(*), 0)
                , 0) * 100, 2) AS real_efectividad
            FROM public.vw_jotform_velsa_netlife_completo jf
            LEFT JOIN negociaciones_reporteria nr ON jf.id_bitrix = nr.id
            LEFT JOIN LATERAL (
                SELECT e2.supervisor
                FROM public.empleados e2
                WHERE e2.nombre_completo = nr.responsable_nombre
                ORDER BY e2.codigo::int DESC
                LIMIT 1
            ) e ON true
            WHERE jf.fecha_registro_sistema::date = $1
            ${filtersJotHoy}
            GROUP BY 1
        `;

        const [resSup, resAses, resJotSupHoy, resJotAsesHoy] = await Promise.all([
            pool.query(queryMonitoreo('e.supervisor'), values),
            pool.query(queryMonitoreo('nr.responsable_nombre'), values),
            pool.query(queryJotHoy('e.supervisor'), valuesJotHoy),
            pool.query(queryJotHoy('nr.responsable_nombre'), valuesJotHoy),
        ]);

        const mergeJot = (filas, jotRows) => {
            return filas.map(row => {
                const jot = jotRows.find(j => j.nombre_grupo === row.nombre_grupo);
                return {
                    ...row,
                    v_subida_jot_hoy:      jot ? Number(jot.v_subida_jot_hoy)      : 0,
                    activos_jot_hoy:       jot ? Number(jot.activos_jot_hoy)       : 0,
                    venta_servicio_jot_hoy: jot ? Number(jot.venta_servicio_jot_hoy) : 0,
                    real_efectividad:      jot ? Number(jot.real_efectividad)      : 0,
                };
            });
        };

        const supervisoresFinal = mergeJot(resSup.rows, resJotSupHoy.rows);
        const asesoresFinal = mergeJot(resAses.rows, resJotAsesHoy.rows);

        console.log(`[MONITOREO] Supervisores: ${supervisoresFinal.length} | Asesores: ${asesoresFinal.length}`);

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
            filtersNoJoin += ` AND nr.responsable_nombre ILIKE $${values.length}`;
        }
        if (supervisor) {
            values.push(`%${supervisor}%`);
            filtersNoJoin += ` AND EXISTS (
                SELECT 1 FROM (
                    SELECT e2.supervisor
                    FROM public.empleados e2
                    WHERE e2.nombre_completo = nr.responsable_nombre
                    ORDER BY
                        CASE WHEN e2.codigo = EXTRACT(MONTH FROM COALESCE(
                            nr.modificado_en,
                            nr.creado_en
                        ))::text THEN 0 ELSE 1 END,
                        e2.codigo::int DESC
                    LIMIT 1
                ) _sup
                WHERE _sup.supervisor ILIKE $${values.length}
            )`;
        }
        if (etapaCRM) {
            values.push(`%${etapaCRM}%`);
            filtersNoJoin += ` AND nr.etapa ILIKE $${values.length}`;
        }

        const ETAPAS_GESTIONABLES = `(
            'CONTACTO NUEVO','DOCUMENTOS PENDIENTES','NO INTERESA COSTO PLAN','VOLVER A LLAMAR',
            'GESTION DIARIA','VENTA SUBIDA','SEGUIMIENTO NEGOCIACIÓN','INNEGOCIABLE','CONTRATO NETLIFE',
            'CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA',
            'OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','OPORTUNIDADES',
            'VENTA ECUANET DIRECTA','VENTA DIRECTA ECUANET','GESTIÓN DIARIA',
            'SEGUIMIENTO NEGOCIACIÓN CON CONTACTO','SEGUIMIENTO SIN CONTACTO',
            'CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO',
            'SEGUIMIENTO NEGOCIACIÓN','DESCARTE PLAN DE 200','SEGUIMIENTO PLAN 200',
            'CLIENTE 4 HORAS','CLIENTE 2 HORAS','CLIENTE 6 HORAS','CLIENTE 8 HORAS',
            'CLIENTE CON ACUERDO','OPORTUNIDADES SUPERVISOR','PENDIENTE CIERRE'
        )`;

        const ETAPAS_DESCARTE = `(
            'NO INTERESA COSTO PLAN','INNEGOCIABLE','CONTRATO NETLIFE','CLIENTE DISCAPACIDAD',
            'OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA','OTRO PROVEEDOR',
            'NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','VENTA ECUANET DIRECTA',
            'CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO',
            'FUERA DE COBERTURA','DESCARTE'
        )`;

        const queryKPIs = `
            SELECT
                COUNT(*) FILTER (
                    WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                ) AS ingresos_jot,
                COUNT(*) FILTER (
                    WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND jf.estado_venta_netlife = 'ACTIVO'
                ) AS ventas_activas,
                COUNT(*) FILTER (
                    WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    AND ${VENTA_SERVICIO_VELSA_JF}
                ) AS ventas_servicio,
                ROUND(COALESCE(
                    COUNT(*) FILTER (
                        WHERE nr.etapa IN ${ETAPAS_DESCARTE}
                        AND nr.creado_en::date BETWEEN $1::date AND $2::date
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE (jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date OR nr.creado_en::date BETWEEN $1::date AND $2::date)
                        AND ${esGestionableExpr('nr.etapa')}
                    ), 0)
                , 0) * 100, 2) AS pct_descarte,
                ROUND(COALESCE(
                    COUNT(*) FILTER (
                        WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE (jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date OR nr.creado_en::date BETWEEN $1::date AND $2::date)
                        AND ${esGestionableExpr('nr.etapa')}
                    ), 0)
                , 0) * 100, 2) AS pct_efectividad,
                ROUND(COALESCE(
                    COUNT(*) FILTER (
                        WHERE jf.descuento_3era_edad = 'SI POR TERCERA EDAD'
                        AND jf.estado_venta_netlife = 'ACTIVO'
                        AND jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE jf.estado_venta_netlife = 'ACTIVO'
                        AND jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
                    ), 0)
                , 0) * 100, 2) AS pct_tercera_edad
            FROM public.vw_jotform_velsa_netlife_completo jf
            LEFT JOIN negociaciones_reporteria nr ON jf.id_bitrix = nr.id
            WHERE (
                nr.creado_en::date BETWEEN $1::date AND $2::date
                OR jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            ) ${filtersNoJoin}
        `;

        const queryEmbudoCRM = `
            SELECT
                COALESCE(nr.etapa, 'SIN ETAPA') AS etapa,
                COUNT(*)::int AS total
            FROM public.negociaciones_reporteria nr
            WHERE nr.creado_en::date BETWEEN $1::date AND $2::date ${filtersNoJoin}
            GROUP BY nr.etapa
            ORDER BY total DESC
        `;

        const queryMapaCalor = `
            SELECT
                jf.fecha_registro_sistema::date AS fecha,
                COALESCE(NULLIF(TRIM(jf.ciudad), ''), 'SIN CIUDAD') AS ciudad,
                COUNT(*)::int AS total
            FROM public.vw_jotform_velsa_netlife_completo jf
            WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            ${filtersNoJoin}
            GROUP BY 1, 2
            ORDER BY 1 ASC, 3 DESC
        `;

        const [resKPIs, resEmbCRM, resMapaCalor] = await Promise.all([
            pool.query(queryKPIs, values),
            pool.query(queryEmbudoCRM, values),
            pool.query(queryMapaCalor, values),
        ]);

        const kpis = resKPIs.rows[0] || {};

        const embudoCRM = resEmbCRM.rows.map(r => ({
            name:  r.etapa,
            value: Number(r.total || 0),
            etapa: r.etapa,
            total: Number(r.total || 0),
        }));

        const embudoJotform = [];

        console.log(`[REPORTE180] Ejecutado desde ${desde} hasta ${hasta}`);

        res.json({
            success: true,
            kpis: {
                ingresos_jot:     Number(kpis.ingresos_jot || 0),
                ventas_activas:   Number(kpis.ventas_activas || 0),
                ventas_servicio:  Number(kpis.ventas_servicio || 0),
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

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTA Y DESCARGA — desde vw_jotform_velsa_netlife_completo
// ─────────────────────────────────────────────────────────────────────────────
const getConsultaDescargaNovonet = async (req, res) => {
    try {
        const { fechaDesde, fechaHasta } = req.query;
        if (!fechaDesde || !fechaHasta) {
            return res.status(400).json({ success: false, error: 'Parámetros fechaDesde y fechaHasta requeridos' });
        }

        const result = await pool.query(`
            SELECT
                jf.fecha_registro_sistema AS created_at,
                jf.id_bitrix AS id_bitrix,
                jf.codigo_asesor,
                jf.plan_casa,
                jf.plan_profesional,
                jf.plan_pyme,
                jf.plan_hogar_adulto_mayor,
                jf.plan_pyme_corp,
                jf.plan_centro_red_comercial,
                jf.descuento_3era_edad,
                jf.servicio_empaquetado,
                jf.login_netlife,
                jf.estatus_netlife,
                jf.forma_pago,
                jf.fecha_ingreso_telcos,
                jf.fecha_activacion,
                jf.provincia,
                jf.ciudad,
                jf.nombre_empresa,
                jf.estado_regularizacion,
                jf.novedades_atc,
                ${VENTA_SERVICIO_VELSA_JF} AS es_venta_servicio
            FROM vw_jotform_velsa_netlife_completo jf
            WHERE jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            ORDER BY jf.fecha_registro_sistema ASC
            LIMIT 100000
        `, [fechaDesde, fechaHasta]);

        res.json({
            success: true,
            total: result.rows.length,
            rows: result.rows
        });
    } catch (error) {
        console.error("ERROR CONSULTA DESCARGA NOVONET:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    getIndicadoresDashboard,
    getMonitoreoDiario,
    getReporte180,
    getConsultaDescargaNovonet
};
