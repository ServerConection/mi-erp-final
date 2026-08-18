-- Corré TODO. pgAdmin se detiene en el primero que falle.
-- Fijate el marcador '===== QUERY n =====' inmediatamente anterior al error.

-- ===== QUERY 0 =====
SELECT DISTINCT mb.b_etapa_de_la_negociacion AS etapa
                FROM public.mestra_bitrix mb
                WHERE mb.b_etapa_de_la_negociacion IS NOT NULL
                  AND TRIM(mb.b_etapa_de_la_negociacion) <> ''
                ORDER BY etapa ASC;

-- ===== QUERY 1 =====
SELECT DISTINCT COALESCE(NULLIF(TRIM(mb.j_netlife_estatus_real), ''), 'SIN ESTADO') AS etapa
                FROM public.mestra_bitrix mb
                ORDER BY etapa ASC;

-- ===== QUERY 2 =====
SELECT b_origen AS origen, COUNT(*)::int AS total
                FROM public.vw_bitrix_novonet
                WHERE NULLIF(TRIM(b_origen), '') IS NOT NULL
                GROUP BY 1
                ORDER BY total DESC, origen ASC;

-- ===== QUERY 3 =====

            WITH _base AS MATERIALIZED (
                SELECT
                    mb.b_id,
                    mb.b_persona_responsable,
                    mb.b_etapa_de_la_negociacion,
                    mb.j_netlife_estatus_real,
                    mb.j_estatus_regularizacion,
                    mb.j_forma_pago,
                    mb.j_aplica_descuento_3ra_edad,
                    mb.b_origen, 
                    e.supervisor,
                    -- Fechas pre-calculadas 1 vez por fila (evita CASE+regex repetido):
                    public.parse_fecha_flex(mb.b_creado_el_fecha::text)        AS _bc_date,
                    public.parse_fecha_flex(mb.b_cerrado::text)                           AS _bcerrado_date,
                    public.parse_fecha_flex(mb.j_fecha_registro_sistema::text)            AS _jf_date,
                    public.parse_fecha_flex(mb.j_fecha_registro_sistema::text) AS _jf_parsed_date,
                    public.parse_fecha_flex(mb.b_modificado_el_fecha::text)    AS _bmod_date,
                    public.parse_fecha_flex(mb.j_fecha_activacion_netlife::text)          AS _jfact_date,
                    (UPPER(TRIM(mb.j_netlife_estatus_real)) = 'ACTIVO' AND (
    (van.plan_casa IS NOT NULL AND TRIM(van.plan_casa::text) <> '') OR
    (van.plan_profesional IS NOT NULL AND TRIM(van.plan_profesional::text) <> '') OR
    (van.plan_pyme IS NOT NULL AND TRIM(van.plan_pyme::text) <> '') OR
    (van.plan_pyme_corp IS NOT NULL AND TRIM(van.plan_pyme_corp::text) <> '') OR
    (van.plan_hogar_adulto_mayor IS NOT NULL AND TRIM(van.plan_hogar_adulto_mayor::text) <> '') OR
    (van.plan_centro_comercial IS NOT NULL AND TRIM(van.plan_centro_comercial::text) <> '')
))                        AS _venta_servicio
                -- MIGRADA a vw_bitrix_novonet: el lado Bitrix sale del webhook
                -- (tiempo real) y el lado Jotform sigue viniendo de mestra_bitrix.
                -- La vista los une con FULL OUTER JOIN, así ninguno de los dos
                -- pierde registros. Motivo: el ETL de mestra_bitrix va atrasado
                -- (6 leads contra 279 del webhook para el mismo día).
                FROM public.vw_bitrix_novonet mb
                
LEFT JOIN LATERAL (
    SELECT e2.supervisor, e2.codigo, e2.nombre_completo
    FROM public.empleados e2
    WHERE e2.nombre_completo = mb.b_persona_responsable
    ORDER BY
        CASE WHEN e2.codigo = EXTRACT(MONTH FROM COALESCE(
            public.parse_fecha_flex(mb.b_cerrado::text),
            public.parse_fecha_flex(mb.b_creado_el_fecha::text)
        ))::text THEN 0 ELSE 1 END,
        e2.codigo::int DESC
    LIMIT 1
) e ON true
                LEFT JOIN (
    SELECT
        id_bitrix,
        MAX(plan_casa)               AS plan_casa,
        MAX(plan_profesional)        AS plan_profesional,
        MAX(plan_pyme)                AS plan_pyme,
        MAX(plan_pyme_corp)          AS plan_pyme_corp,
        MAX(plan_hogar_adulto_mayor) AS plan_hogar_adulto_mayor,
        MAX(plan_centro_comercial)   AS plan_centro_comercial
    FROM public.vista_analisis_novonet
    GROUP BY id_bitrix
) van ON mb.j_id_bitrix::text = van.id_bitrix::text
                WHERE (
                    public.parse_fecha_flex(mb.b_creado_el_fecha::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                    OR public.parse_fecha_flex(mb.j_fecha_registro_sistema::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                    OR public.parse_fecha_flex(mb.j_fecha_activacion_netlife::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                )  AND UPPER(TRIM(mb.b_persona_responsable)) = UPPER(TRIM('ARIANNE BELTRAN RANGEL'))
            )
            SELECT
                COALESCE(supervisor, 'SIN ASIGNAR') AS nombre_grupo
                ,
                -- COUNT(DISTINCT b_id) y no COUNT(*): un lead puede aparecer en
                -- varias filas cuando tiene mas de una venta Jotform asociada
                -- (ej. un cliente con 5 servicios bajo la misma negociacion).
                -- Contar filas lo inflaria. Los conteos del lado Jotform SI usan
                -- COUNT(*), porque ahi cada fila es una venta distinta.
                COUNT(DISTINCT b_id) FILTER (
    WHERE _bc_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
    AND b_etapa_de_la_negociacion <> 'DUPLICADO'   -- ← línea nueva
    AND (b_etapa_de_la_negociacion = 'VENTA SUBIDA' OR UPPER(TRIM(COALESCE(b_origen, ''))) NOT IN ('REMARKETING'))
) AS leads_totales,
                COUNT(DISTINCT b_id) FILTER (
                    WHERE (b_etapa_de_la_negociacion ILIKE '%ATC%' OR b_etapa_de_la_negociacion ILIKE '%SOPORTE%')
                    AND _bc_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                ) AS atc_soporte,
                COUNT(DISTINCT b_id) FILTER (
                    -- CAMBIO (2026-07-28): ventas del CRM por FECHA DE CREACION (_bc_date =
                    -- b_creado_el_fecha) en vez de fecha de cerrado (_bcerrado_date = b_cerrado),
                    -- segun definicion de negocio. Antes: WHERE _bcerrado_date BETWEEN ...
                    WHERE _bc_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                    AND b_etapa_de_la_negociacion = 'VENTA SUBIDA'
                ) AS ventas_crm,
                0 AS ventas_del_dia, -- calculado por self-join externo (ver queryVentasDia*)
                ROUND( COALESCE(
                    COUNT(*) FILTER (WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date)::numeric
                    / NULLIF(COUNT(DISTINCT b_id) FILTER (
                        -- CAMBIO (2026-07-28): denominador de efectividad por FECHA DE CREACION
                        -- (_bc_date) en vez de fecha de cerrado. Antes: WHERE _bcerrado_date BETWEEN ...
                        WHERE _bc_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                        AND (UPPER(TRIM(b_etapa_de_la_negociacion)) NOT IN ('ATC', 'ATC/SOPORTE', 'DUPLICADO', 'DUPLLICADO', 'FUERA DE COBERTURA', 'INNEGOCIABLE', 'ZONA PELIGROSA', 'ZONAS PELIGROSAS', 'POSTVENTA', 'REGULARIZACION', 'REGULARIZACIÓN', 'CONTRATO PARAMOUNT', 'PARAMOUNT SEGUMIENTO POR CERRAR', 'PARAMOUNT SEGUIMIENTO POR CERRAR'))
                    ), 0)
                , 0) * 100, 2) AS efectividad_realz,
                COUNT(*) FILTER (
                    WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                    AND j_estatus_regularizacion = 'POR REGULARIZAR'
                ) AS por_regularizar,
                COUNT(DISTINCT b_id) FILTER (
    -- FIX (2026-06-23): antes este FILTER usaba (_jf_parsed_date OR _bc_date) BETWEEN ...,
    -- una ventana de fecha MAS AMPLIA que la de "leads_totales" (que solo usa _bc_date).
    -- Eso permitia que "gestionables" contara leads cuyo registro Jotform cae en el rango
    -- pero cuya fecha de creacion CRM (_bc_date) NO cae en el rango, esos leads no
    -- entraban en leads_totales, y entonces gestionables > leads_totales (imposible).
    -- Ahora usa la MISMA base de fecha que leads_totales (_bc_date) para garantizar
    -- que gestionables sea siempre un subconjunto de leads_totales.
    WHERE _bc_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
    AND (UPPER(TRIM(b_etapa_de_la_negociacion)) NOT IN ('ATC', 'ATC/SOPORTE', 'DUPLICADO', 'DUPLLICADO', 'FUERA DE COBERTURA', 'INNEGOCIABLE', 'ZONA PELIGROSA', 'ZONAS PELIGROSAS', 'POSTVENTA', 'REGULARIZACION', 'REGULARIZACIÓN', 'CONTRATO PARAMOUNT', 'PARAMOUNT SEGUMIENTO POR CERRAR', 'PARAMOUNT SEGUIMIENTO POR CERRAR'))
    AND (b_etapa_de_la_negociacion = 'VENTA SUBIDA' OR UPPER(TRIM(COALESCE(b_origen, ''))) NOT IN ('REMARKETING'))
) AS gestionables,
                COUNT(*) FILTER (WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date) AS ingresos_reales,
                COUNT(*) FILTER (
                    WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date AND j_netlife_estatus_real = 'ACTIVO'
                ) AS activas,
                COUNT(*) FILTER (
                    WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date AND _venta_servicio
                ) AS venta_servicio,
                -- ── ACTIVAS (definición de gerencia, 2026-08, ajustada 2026-08-13) ──
                -- real_mes  = ACTIVAS TOTALES: todo lo que se activó en el rango
                -- activa_mes= de esas, las que ADEMÁS se REGISTRARON EN JOTFORM
                --             dentro del mismo rango (antes comparaba con la fecha
                --             de creación en el CRM, no con el registro Jotform —
                --             eran fechas distintas y desalineaba el cálculo).
                -- backlog   = TOTALES − MES = activadas en el rango pero registradas
                --             en Jotform en un mes ANTERIOR (se deriva, ya no se
                --             consulta aparte).
                --
                -- OJO: antes el frontend hacía activas = real_mes + backlog, y
                -- como real_mes ya incluía el backlog, se contaba DOBLE.
                COUNT(*) FILTER (
                    WHERE _jfact_date IS NOT NULL
                    AND _jfact_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                    AND j_netlife_estatus_real = 'ACTIVO'
                ) AS real_mes,
                COUNT(*) FILTER (
                    WHERE _jfact_date IS NOT NULL
                    AND _jfact_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                    AND j_netlife_estatus_real = 'ACTIVO'
                    AND _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                ) AS activa_mes,
                COUNT(*) FILTER (
                    WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date AND j_netlife_estatus_real = 'ACTIVO'
                ) AS total_activas_calculada,
                0 AS crec_vs_ma,
                COUNT(*) FILTER (
                    WHERE j_forma_pago = 'TARJETA DE CREDITO.'
                    AND _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                ) AS tarjeta_credito,
                COUNT(*) FILTER (
                    WHERE j_aplica_descuento_3ra_edad = 'SI POR TERCERA EDAD'
                    AND j_netlife_estatus_real = 'ACTIVO'
                    AND _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                ) AS tercera_edad,
                (COUNT(*) FILTER (
                    WHERE (UPPER(TRIM(b_etapa_de_la_negociacion)) IN ('CONTRATO NETLIFE', 'DESCARTE', 'DESISTE DE COMPRA', 'MANTIENE PROVEEDOR', 'NO INTERESA COSTO PLAN', 'NO VOLVER A CONTACTAR', 'OTRO PROVEEDOR', 'DESCARTE REMARKETIZADO', 'CONTRATO NETLIFE POR OTRO CANAL', 'DESCARTE PLAN DE 200', 'NO INTERESA COSTO INSTALACIÓN', 'NO INTERESA COSTO INSTALACION'))
                    AND _bc_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                )::numeric /
                NULLIF(COUNT(*) FILTER (
                    WHERE (_jf_parsed_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date OR _bc_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date)
                    AND (UPPER(TRIM(b_etapa_de_la_negociacion)) NOT IN ('ATC', 'ATC/SOPORTE', 'DUPLICADO', 'DUPLLICADO', 'FUERA DE COBERTURA', 'INNEGOCIABLE', 'ZONA PELIGROSA', 'ZONAS PELIGROSAS', 'POSTVENTA', 'REGULARIZACION', 'REGULARIZACIÓN', 'CONTRATO PARAMOUNT', 'PARAMOUNT SEGUMIENTO POR CERRAR', 'PARAMOUNT SEGUIMIENTO POR CERRAR'))
                ), 0) * 100)::numeric(10,2) AS descarte,
                COUNT(*) FILTER (
                    WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                    AND j_netlife_estatus_real NOT IN ('FUERA DE COBERTURA','DESISTE DEL SERVICIO','RECHAZADO')
                    AND j_estatus_regularizacion = 'POR REGULARIZAR'
                ) AS regularizacion,
                ROUND( COALESCE(
                    COUNT(*) FILTER (WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date)::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE (_jf_parsed_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date OR _bc_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date)
                        AND (UPPER(TRIM(b_etapa_de_la_negociacion)) NOT IN ('ATC', 'ATC/SOPORTE', 'DUPLICADO', 'DUPLLICADO', 'FUERA DE COBERTURA', 'INNEGOCIABLE', 'ZONA PELIGROSA', 'ZONAS PELIGROSAS', 'POSTVENTA', 'REGULARIZACION', 'REGULARIZACIÓN', 'CONTRATO PARAMOUNT', 'PARAMOUNT SEGUMIENTO POR CERRAR', 'PARAMOUNT SEGUIMIENTO POR CERRAR'))
                    ), 0)
                , 0) * 100, 2) AS efectividad_real,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date AND j_netlife_estatus_real = 'ACTIVO')::numeric
                    / NULLIF(COUNT(*) FILTER (WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date), 0)
                , 0) * 100, 2) AS tasa_instalacion,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date AND j_netlife_estatus_real = 'ACTIVO')::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE (_jf_parsed_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date OR _bc_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date)
                        AND (UPPER(TRIM(b_etapa_de_la_negociacion)) NOT IN ('ATC', 'ATC/SOPORTE', 'DUPLICADO', 'DUPLLICADO', 'FUERA DE COBERTURA', 'INNEGOCIABLE', 'ZONA PELIGROSA', 'ZONAS PELIGROSAS', 'POSTVENTA', 'REGULARIZACION', 'REGULARIZACIÓN', 'CONTRATO PARAMOUNT', 'PARAMOUNT SEGUMIENTO POR CERRAR', 'PARAMOUNT SEGUIMIENTO POR CERRAR'))
                    ), 0)
                , 0) * 100, 2) AS efectividad_activas_vs_pauta,
                ROUND( COALESCE(
                    COUNT(*) FILTER (
                        WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                        AND j_netlife_estatus_real NOT IN ('PRESERVICIO','DESISTE DEL SERVICIO')
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE _bc_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                        AND (UPPER(TRIM(b_etapa_de_la_negociacion)) NOT IN ('ATC', 'ATC/SOPORTE', 'DUPLICADO', 'DUPLLICADO', 'FUERA DE COBERTURA', 'INNEGOCIABLE', 'ZONA PELIGROSA', 'ZONAS PELIGROSAS', 'POSTVENTA', 'REGULARIZACION', 'REGULARIZACIÓN', 'CONTRATO PARAMOUNT', 'PARAMOUNT SEGUMIENTO POR CERRAR', 'PARAMOUNT SEGUIMIENTO POR CERRAR'))
                    ), 0)
                , 0) * 100, 2) AS eficiencia
            FROM _base
            GROUP BY 1
            ORDER BY gestionables DESC;

-- ===== QUERY 4 =====

            WITH _base AS MATERIALIZED (
                SELECT
                    mb.b_id,
                    mb.b_persona_responsable,
                    mb.b_etapa_de_la_negociacion,
                    mb.j_netlife_estatus_real,
                    mb.j_estatus_regularizacion,
                    mb.j_forma_pago,
                    mb.j_aplica_descuento_3ra_edad,
                    mb.b_origen, 
                    e.supervisor,
                    -- Fechas pre-calculadas 1 vez por fila (evita CASE+regex repetido):
                    public.parse_fecha_flex(mb.b_creado_el_fecha::text)        AS _bc_date,
                    public.parse_fecha_flex(mb.b_cerrado::text)                           AS _bcerrado_date,
                    public.parse_fecha_flex(mb.j_fecha_registro_sistema::text)            AS _jf_date,
                    public.parse_fecha_flex(mb.j_fecha_registro_sistema::text) AS _jf_parsed_date,
                    public.parse_fecha_flex(mb.b_modificado_el_fecha::text)    AS _bmod_date,
                    public.parse_fecha_flex(mb.j_fecha_activacion_netlife::text)          AS _jfact_date,
                    (UPPER(TRIM(mb.j_netlife_estatus_real)) = 'ACTIVO' AND (
    (van.plan_casa IS NOT NULL AND TRIM(van.plan_casa::text) <> '') OR
    (van.plan_profesional IS NOT NULL AND TRIM(van.plan_profesional::text) <> '') OR
    (van.plan_pyme IS NOT NULL AND TRIM(van.plan_pyme::text) <> '') OR
    (van.plan_pyme_corp IS NOT NULL AND TRIM(van.plan_pyme_corp::text) <> '') OR
    (van.plan_hogar_adulto_mayor IS NOT NULL AND TRIM(van.plan_hogar_adulto_mayor::text) <> '') OR
    (van.plan_centro_comercial IS NOT NULL AND TRIM(van.plan_centro_comercial::text) <> '')
))                        AS _venta_servicio
                -- MIGRADA a vw_bitrix_novonet: el lado Bitrix sale del webhook
                -- (tiempo real) y el lado Jotform sigue viniendo de mestra_bitrix.
                -- La vista los une con FULL OUTER JOIN, así ninguno de los dos
                -- pierde registros. Motivo: el ETL de mestra_bitrix va atrasado
                -- (6 leads contra 279 del webhook para el mismo día).
                FROM public.vw_bitrix_novonet mb
                
LEFT JOIN LATERAL (
    SELECT e2.supervisor, e2.codigo, e2.nombre_completo
    FROM public.empleados e2
    WHERE e2.nombre_completo = mb.b_persona_responsable
    ORDER BY
        CASE WHEN e2.codigo = EXTRACT(MONTH FROM COALESCE(
            public.parse_fecha_flex(mb.b_cerrado::text),
            public.parse_fecha_flex(mb.b_creado_el_fecha::text)
        ))::text THEN 0 ELSE 1 END,
        e2.codigo::int DESC
    LIMIT 1
) e ON true
                LEFT JOIN (
    SELECT
        id_bitrix,
        MAX(plan_casa)               AS plan_casa,
        MAX(plan_profesional)        AS plan_profesional,
        MAX(plan_pyme)                AS plan_pyme,
        MAX(plan_pyme_corp)          AS plan_pyme_corp,
        MAX(plan_hogar_adulto_mayor) AS plan_hogar_adulto_mayor,
        MAX(plan_centro_comercial)   AS plan_centro_comercial
    FROM public.vista_analisis_novonet
    GROUP BY id_bitrix
) van ON mb.j_id_bitrix::text = van.id_bitrix::text
                WHERE (
                    public.parse_fecha_flex(mb.b_creado_el_fecha::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                    OR public.parse_fecha_flex(mb.j_fecha_registro_sistema::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                    OR public.parse_fecha_flex(mb.j_fecha_activacion_netlife::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                )  AND UPPER(TRIM(mb.b_persona_responsable)) = UPPER(TRIM('ARIANNE BELTRAN RANGEL'))
            )
            SELECT
                COALESCE(b_persona_responsable, 'SIN ASIGNAR') AS nombre_grupo
                , COALESCE(supervisor, 'SIN ASIGNAR') AS sup_nombre,
                -- COUNT(DISTINCT b_id) y no COUNT(*): un lead puede aparecer en
                -- varias filas cuando tiene mas de una venta Jotform asociada
                -- (ej. un cliente con 5 servicios bajo la misma negociacion).
                -- Contar filas lo inflaria. Los conteos del lado Jotform SI usan
                -- COUNT(*), porque ahi cada fila es una venta distinta.
                COUNT(DISTINCT b_id) FILTER (
    WHERE _bc_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
    AND b_etapa_de_la_negociacion <> 'DUPLICADO'   -- ← línea nueva
    AND (b_etapa_de_la_negociacion = 'VENTA SUBIDA' OR UPPER(TRIM(COALESCE(b_origen, ''))) NOT IN ('REMARKETING'))
) AS leads_totales,
                COUNT(DISTINCT b_id) FILTER (
                    WHERE (b_etapa_de_la_negociacion ILIKE '%ATC%' OR b_etapa_de_la_negociacion ILIKE '%SOPORTE%')
                    AND _bc_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                ) AS atc_soporte,
                COUNT(DISTINCT b_id) FILTER (
                    -- CAMBIO (2026-07-28): ventas del CRM por FECHA DE CREACION (_bc_date =
                    -- b_creado_el_fecha) en vez de fecha de cerrado (_bcerrado_date = b_cerrado),
                    -- segun definicion de negocio. Antes: WHERE _bcerrado_date BETWEEN ...
                    WHERE _bc_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                    AND b_etapa_de_la_negociacion = 'VENTA SUBIDA'
                ) AS ventas_crm,
                0 AS ventas_del_dia, -- calculado por self-join externo (ver queryVentasDia*)
                ROUND( COALESCE(
                    COUNT(*) FILTER (WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date)::numeric
                    / NULLIF(COUNT(DISTINCT b_id) FILTER (
                        -- CAMBIO (2026-07-28): denominador de efectividad por FECHA DE CREACION
                        -- (_bc_date) en vez de fecha de cerrado. Antes: WHERE _bcerrado_date BETWEEN ...
                        WHERE _bc_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                        AND (UPPER(TRIM(b_etapa_de_la_negociacion)) NOT IN ('ATC', 'ATC/SOPORTE', 'DUPLICADO', 'DUPLLICADO', 'FUERA DE COBERTURA', 'INNEGOCIABLE', 'ZONA PELIGROSA', 'ZONAS PELIGROSAS', 'POSTVENTA', 'REGULARIZACION', 'REGULARIZACIÓN', 'CONTRATO PARAMOUNT', 'PARAMOUNT SEGUMIENTO POR CERRAR', 'PARAMOUNT SEGUIMIENTO POR CERRAR'))
                    ), 0)
                , 0) * 100, 2) AS efectividad_realz,
                COUNT(*) FILTER (
                    WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                    AND j_estatus_regularizacion = 'POR REGULARIZAR'
                ) AS por_regularizar,
                COUNT(DISTINCT b_id) FILTER (
    -- FIX (2026-06-23): antes este FILTER usaba (_jf_parsed_date OR _bc_date) BETWEEN ...,
    -- una ventana de fecha MAS AMPLIA que la de "leads_totales" (que solo usa _bc_date).
    -- Eso permitia que "gestionables" contara leads cuyo registro Jotform cae en el rango
    -- pero cuya fecha de creacion CRM (_bc_date) NO cae en el rango, esos leads no
    -- entraban en leads_totales, y entonces gestionables > leads_totales (imposible).
    -- Ahora usa la MISMA base de fecha que leads_totales (_bc_date) para garantizar
    -- que gestionables sea siempre un subconjunto de leads_totales.
    WHERE _bc_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
    AND (UPPER(TRIM(b_etapa_de_la_negociacion)) NOT IN ('ATC', 'ATC/SOPORTE', 'DUPLICADO', 'DUPLLICADO', 'FUERA DE COBERTURA', 'INNEGOCIABLE', 'ZONA PELIGROSA', 'ZONAS PELIGROSAS', 'POSTVENTA', 'REGULARIZACION', 'REGULARIZACIÓN', 'CONTRATO PARAMOUNT', 'PARAMOUNT SEGUMIENTO POR CERRAR', 'PARAMOUNT SEGUIMIENTO POR CERRAR'))
    AND (b_etapa_de_la_negociacion = 'VENTA SUBIDA' OR UPPER(TRIM(COALESCE(b_origen, ''))) NOT IN ('REMARKETING'))
) AS gestionables,
                COUNT(*) FILTER (WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date) AS ingresos_reales,
                COUNT(*) FILTER (
                    WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date AND j_netlife_estatus_real = 'ACTIVO'
                ) AS activas,
                COUNT(*) FILTER (
                    WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date AND _venta_servicio
                ) AS venta_servicio,
                -- ── ACTIVAS (definición de gerencia, 2026-08, ajustada 2026-08-13) ──
                -- real_mes  = ACTIVAS TOTALES: todo lo que se activó en el rango
                -- activa_mes= de esas, las que ADEMÁS se REGISTRARON EN JOTFORM
                --             dentro del mismo rango (antes comparaba con la fecha
                --             de creación en el CRM, no con el registro Jotform —
                --             eran fechas distintas y desalineaba el cálculo).
                -- backlog   = TOTALES − MES = activadas en el rango pero registradas
                --             en Jotform en un mes ANTERIOR (se deriva, ya no se
                --             consulta aparte).
                --
                -- OJO: antes el frontend hacía activas = real_mes + backlog, y
                -- como real_mes ya incluía el backlog, se contaba DOBLE.
                COUNT(*) FILTER (
                    WHERE _jfact_date IS NOT NULL
                    AND _jfact_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                    AND j_netlife_estatus_real = 'ACTIVO'
                ) AS real_mes,
                COUNT(*) FILTER (
                    WHERE _jfact_date IS NOT NULL
                    AND _jfact_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                    AND j_netlife_estatus_real = 'ACTIVO'
                    AND _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                ) AS activa_mes,
                COUNT(*) FILTER (
                    WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date AND j_netlife_estatus_real = 'ACTIVO'
                ) AS total_activas_calculada,
                0 AS crec_vs_ma,
                COUNT(*) FILTER (
                    WHERE j_forma_pago = 'TARJETA DE CREDITO.'
                    AND _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                ) AS tarjeta_credito,
                COUNT(*) FILTER (
                    WHERE j_aplica_descuento_3ra_edad = 'SI POR TERCERA EDAD'
                    AND j_netlife_estatus_real = 'ACTIVO'
                    AND _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                ) AS tercera_edad,
                (COUNT(*) FILTER (
                    WHERE (UPPER(TRIM(b_etapa_de_la_negociacion)) IN ('CONTRATO NETLIFE', 'DESCARTE', 'DESISTE DE COMPRA', 'MANTIENE PROVEEDOR', 'NO INTERESA COSTO PLAN', 'NO VOLVER A CONTACTAR', 'OTRO PROVEEDOR', 'DESCARTE REMARKETIZADO', 'CONTRATO NETLIFE POR OTRO CANAL', 'DESCARTE PLAN DE 200', 'NO INTERESA COSTO INSTALACIÓN', 'NO INTERESA COSTO INSTALACION'))
                    AND _bc_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                )::numeric /
                NULLIF(COUNT(*) FILTER (
                    WHERE (_jf_parsed_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date OR _bc_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date)
                    AND (UPPER(TRIM(b_etapa_de_la_negociacion)) NOT IN ('ATC', 'ATC/SOPORTE', 'DUPLICADO', 'DUPLLICADO', 'FUERA DE COBERTURA', 'INNEGOCIABLE', 'ZONA PELIGROSA', 'ZONAS PELIGROSAS', 'POSTVENTA', 'REGULARIZACION', 'REGULARIZACIÓN', 'CONTRATO PARAMOUNT', 'PARAMOUNT SEGUMIENTO POR CERRAR', 'PARAMOUNT SEGUIMIENTO POR CERRAR'))
                ), 0) * 100)::numeric(10,2) AS descarte,
                COUNT(*) FILTER (
                    WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                    AND j_netlife_estatus_real NOT IN ('FUERA DE COBERTURA','DESISTE DEL SERVICIO','RECHAZADO')
                    AND j_estatus_regularizacion = 'POR REGULARIZAR'
                ) AS regularizacion,
                ROUND( COALESCE(
                    COUNT(*) FILTER (WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date)::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE (_jf_parsed_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date OR _bc_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date)
                        AND (UPPER(TRIM(b_etapa_de_la_negociacion)) NOT IN ('ATC', 'ATC/SOPORTE', 'DUPLICADO', 'DUPLLICADO', 'FUERA DE COBERTURA', 'INNEGOCIABLE', 'ZONA PELIGROSA', 'ZONAS PELIGROSAS', 'POSTVENTA', 'REGULARIZACION', 'REGULARIZACIÓN', 'CONTRATO PARAMOUNT', 'PARAMOUNT SEGUMIENTO POR CERRAR', 'PARAMOUNT SEGUIMIENTO POR CERRAR'))
                    ), 0)
                , 0) * 100, 2) AS efectividad_real,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date AND j_netlife_estatus_real = 'ACTIVO')::numeric
                    / NULLIF(COUNT(*) FILTER (WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date), 0)
                , 0) * 100, 2) AS tasa_instalacion,
                ROUND(COALESCE(
                    COUNT(*) FILTER (WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date AND j_netlife_estatus_real = 'ACTIVO')::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE (_jf_parsed_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date OR _bc_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date)
                        AND (UPPER(TRIM(b_etapa_de_la_negociacion)) NOT IN ('ATC', 'ATC/SOPORTE', 'DUPLICADO', 'DUPLLICADO', 'FUERA DE COBERTURA', 'INNEGOCIABLE', 'ZONA PELIGROSA', 'ZONAS PELIGROSAS', 'POSTVENTA', 'REGULARIZACION', 'REGULARIZACIÓN', 'CONTRATO PARAMOUNT', 'PARAMOUNT SEGUMIENTO POR CERRAR', 'PARAMOUNT SEGUIMIENTO POR CERRAR'))
                    ), 0)
                , 0) * 100, 2) AS efectividad_activas_vs_pauta,
                ROUND( COALESCE(
                    COUNT(*) FILTER (
                        WHERE _jf_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                        AND j_netlife_estatus_real NOT IN ('PRESERVICIO','DESISTE DEL SERVICIO')
                    )::numeric
                    / NULLIF(COUNT(*) FILTER (
                        WHERE _bc_date BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                        AND (UPPER(TRIM(b_etapa_de_la_negociacion)) NOT IN ('ATC', 'ATC/SOPORTE', 'DUPLICADO', 'DUPLLICADO', 'FUERA DE COBERTURA', 'INNEGOCIABLE', 'ZONA PELIGROSA', 'ZONAS PELIGROSAS', 'POSTVENTA', 'REGULARIZACION', 'REGULARIZACIÓN', 'CONTRATO PARAMOUNT', 'PARAMOUNT SEGUMIENTO POR CERRAR', 'PARAMOUNT SEGUIMIENTO POR CERRAR'))
                    ), 0)
                , 0) * 100, 2) AS eficiencia
            FROM _base
            GROUP BY 1, 2
            ORDER BY gestionables DESC;

-- ===== QUERY 5 =====

            SELECT estado, SUM(total)::int AS total
            FROM (
                SELECT
                    COALESCE(NULLIF(TRIM(mb.j_netlife_estatus_real), ''), 'SIN ESTADO') AS estado,
                    COUNT(*) AS total
                FROM public.mestra_bitrix mb
                WHERE public.parse_fecha_flex(mb.j_fecha_registro_sistema::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                AND COALESCE(NULLIF(TRIM(mb.j_netlife_estatus_real), ''), 'SIN ESTADO') <> 'ACTIVO'
                 AND UPPER(TRIM(mb.b_persona_responsable)) = UPPER(TRIM('ARIANNE BELTRAN RANGEL'))
                GROUP BY 1

                UNION ALL

                SELECT
                    'ACTIVO' AS estado,
                    COUNT(*) AS total
                FROM public.mestra_bitrix mb
                WHERE mb.j_netlife_estatus_real = 'ACTIVO'
                AND public.parse_fecha_flex(mb.j_fecha_activacion_netlife::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                 AND UPPER(TRIM(mb.b_persona_responsable)) = UPPER(TRIM('ARIANNE BELTRAN RANGEL'))
            ) sub
            GROUP BY estado
            ORDER BY total DESC;

-- ===== QUERY 6 =====

            SELECT
                COALESCE(mb.b_etapa_de_la_negociacion, 'SIN ETAPA') AS etapa,
                COUNT(*)::int AS total
            FROM public.vw_bitrix_novonet mb
            WHERE mb.b_creado_el_fecha BETWEEN '2026-08-01'::date AND '2026-08-14'::date  AND UPPER(TRIM(mb.b_persona_responsable)) = UPPER(TRIM('ARIANNE BELTRAN RANGEL'))
            GROUP BY mb.b_etapa_de_la_negociacion
            ORDER BY total DESC;

-- ===== QUERY 7 =====

            SELECT
                public.parse_fecha_flex(mb.j_fecha_registro_sistema::text) AS fecha,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (
                    WHERE mb.j_netlife_estatus_real = 'ACTIVO'
                )::int AS activos
            FROM public.mestra_bitrix mb
            WHERE mb.j_fecha_registro_sistema IS NOT NULL
            AND public.parse_fecha_flex(mb.j_fecha_registro_sistema::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
             AND UPPER(TRIM(mb.b_persona_responsable)) = UPPER(TRIM('ARIANNE BELTRAN RANGEL'))
            GROUP BY 1
            ORDER BY fecha ASC;

-- ===== QUERY 8 =====

            SELECT
                COUNT(*) FILTER (
                    WHERE mb.j_aplica_descuento_3ra_edad = 'SI POR TERCERA EDAD'
                    AND mb.j_netlife_estatus_real = 'ACTIVO'
                ) AS total_tercera_edad,
                COUNT(*) FILTER (
                    WHERE mb.j_netlife_estatus_real = 'ACTIVO'
                ) AS total_activos,
                COUNT(*) FILTER (
                    WHERE mb.j_forma_pago = 'TARJETA DE CREDITO.'
                ) AS total_tarjeta,
                COUNT(*) AS total_jotform
            FROM public.mestra_bitrix mb
            WHERE public.parse_fecha_flex(mb.j_fecha_registro_sistema::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
             AND UPPER(TRIM(mb.b_persona_responsable)) = UPPER(TRIM('ARIANNE BELTRAN RANGEL'));

-- ===== QUERY 9 =====

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
            FROM public.vw_bitrix_novonet mb
            
LEFT JOIN LATERAL (
    SELECT e2.supervisor, e2.codigo, e2.nombre_completo
    FROM public.empleados e2
    WHERE e2.nombre_completo = mb.b_persona_responsable
    ORDER BY
        CASE WHEN e2.codigo = EXTRACT(MONTH FROM COALESCE(
            public.parse_fecha_flex(mb.b_cerrado::text),
            public.parse_fecha_flex(mb.b_creado_el_fecha::text)
        ))::text THEN 0 ELSE 1 END,
        e2.codigo::int DESC
    LIMIT 1
) e ON true
            WHERE mb.b_creado_el_fecha BETWEEN '2026-08-01'::date AND '2026-08-14'::date  AND UPPER(TRIM(mb.b_persona_responsable)) = UPPER(TRIM('ARIANNE BELTRAN RANGEL'))
            LIMIT 6000;

-- ===== QUERY 10 =====

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
                mb.j_fecha_agenda AS "FECHA AGENDAMIENTO",
                -- ASESOR: se toma del webhook (bitrix_webhook_leads.responsible)
                -- y solo cae al histórico si el webhook no tiene dato. Ver
                -- ASESOR_RESUELTO arriba. Antes: mb.b_persona_responsable (='REVISAR').
                
        COALESCE(
            NULLIF(BTRIM(bwl.responsible), ''),
            CASE WHEN UPPER(BTRIM(mb.b_persona_responsable)) = 'REVISAR'
                 THEN NULL
                 ELSE NULLIF(BTRIM(mb.b_persona_responsable), '')
            END,
            'REVISAR'
        ) AS "ASESOR",
                COALESCE(esup.supervisor, e.supervisor) AS "SUPERVISOR_ASIGNADO"
            FROM mestra_bitrix mb
            
LEFT JOIN LATERAL (
    SELECT e2.supervisor, e2.codigo, e2.nombre_completo
    FROM public.empleados e2
    WHERE e2.nombre_completo = mb.b_persona_responsable
    ORDER BY
        CASE WHEN e2.codigo = EXTRACT(MONTH FROM COALESCE(
            public.parse_fecha_flex(mb.b_cerrado::text),
            public.parse_fecha_flex(mb.b_creado_el_fecha::text)
        ))::text THEN 0 ELSE 1 END,
        e2.codigo::int DESC
    LIMIT 1
) e ON true
            
LEFT JOIN public.bitrix_webhook_leads bwl
       ON BTRIM(bwl.bitrix_id::text) = BTRIM(mb.j_id_bitrix::text)
      AND bwl.empresa = 'novonet'
            
LEFT JOIN LATERAL (
    SELECT e3.supervisor
    FROM public.empleados e3
    WHERE UPPER(BTRIM(e3.nombre_completo)) = UPPER(BTRIM(
        COALESCE(
            NULLIF(BTRIM(bwl.responsible), ''),
            CASE WHEN UPPER(BTRIM(mb.b_persona_responsable)) = 'REVISAR'
                 THEN NULL
                 ELSE NULLIF(BTRIM(mb.b_persona_responsable), '')
            END,
            'REVISAR'
        )))
    ORDER BY e3.codigo::int DESC
    LIMIT 1
) esup ON true
            WHERE public.parse_fecha_flex(mb.j_fecha_registro_sistema::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
             AND UPPER(TRIM(mb.b_persona_responsable)) = UPPER(TRIM('ARIANNE BELTRAN RANGEL'))
            LIMIT 6000;

-- ===== QUERY 11 =====

            SELECT
                COALESCE(e.supervisor, 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(*)::int AS backlog
            FROM public.mestra_bitrix mb
            
LEFT JOIN LATERAL (
    SELECT e2.supervisor, e2.codigo, e2.nombre_completo
    FROM public.empleados e2
    WHERE e2.nombre_completo = mb.b_persona_responsable
    ORDER BY
        CASE WHEN e2.codigo = EXTRACT(MONTH FROM COALESCE(
            public.parse_fecha_flex(mb.b_cerrado::text),
            public.parse_fecha_flex(mb.b_creado_el_fecha::text)
        ))::text THEN 0 ELSE 1 END,
        e2.codigo::int DESC
    LIMIT 1
) e ON true
            WHERE mb.j_netlife_estatus_real = 'ACTIVO'
            AND mb.j_fecha_activacion_netlife IS NOT NULL
            AND TRIM(mb.j_fecha_activacion_netlife::text) != ''
            AND public.parse_fecha_flex(mb.j_fecha_activacion_netlife::text) >= '2026-08-01'::date
            AND public.parse_fecha_flex(mb.j_fecha_activacion_netlife::text) <= '2026-08-14'::date
            AND public.parse_fecha_flex(mb.j_fecha_registro_sistema::text) < '2026-08-01'::date
             AND UPPER(TRIM(mb.b_persona_responsable)) = UPPER(TRIM('ARIANNE BELTRAN RANGEL'))
            GROUP BY 1;

-- ===== QUERY 12 =====

            SELECT
                COALESCE(mb.b_persona_responsable, 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(*)::int AS backlog
            FROM public.mestra_bitrix mb
            
LEFT JOIN LATERAL (
    SELECT e2.supervisor, e2.codigo, e2.nombre_completo
    FROM public.empleados e2
    WHERE e2.nombre_completo = mb.b_persona_responsable
    ORDER BY
        CASE WHEN e2.codigo = EXTRACT(MONTH FROM COALESCE(
            public.parse_fecha_flex(mb.b_cerrado::text),
            public.parse_fecha_flex(mb.b_creado_el_fecha::text)
        ))::text THEN 0 ELSE 1 END,
        e2.codigo::int DESC
    LIMIT 1
) e ON true
            WHERE mb.j_netlife_estatus_real = 'ACTIVO'
            AND mb.j_fecha_activacion_netlife IS NOT NULL
            AND TRIM(mb.j_fecha_activacion_netlife::text) != ''
            AND public.parse_fecha_flex(mb.j_fecha_activacion_netlife::text) >= '2026-08-01'::date
            AND public.parse_fecha_flex(mb.j_fecha_activacion_netlife::text) <= '2026-08-14'::date
            AND public.parse_fecha_flex(mb.j_fecha_registro_sistema::text) < '2026-08-01'::date
             AND UPPER(TRIM(mb.b_persona_responsable)) = UPPER(TRIM('ARIANNE BELTRAN RANGEL'))
            GROUP BY 1;

-- ===== QUERY 13 =====

            SELECT
                public.parse_fecha_flex(mb.j_fecha_activacion_netlife::text) AS fecha,
                COUNT(*)::int AS activaciones
            FROM public.mestra_bitrix mb
            WHERE mb.j_fecha_activacion_netlife IS NOT NULL
            AND TRIM(mb.j_fecha_activacion_netlife::text) != ''
            AND public.parse_fecha_flex(mb.j_fecha_activacion_netlife::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
             AND UPPER(TRIM(mb.b_persona_responsable)) = UPPER(TRIM('ARIANNE BELTRAN RANGEL'))
            GROUP BY 1
            ORDER BY fecha ASC;

-- ===== QUERY 14 =====

            SELECT
                COALESCE(e.supervisor, 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(DISTINCT mb_jot.j_id_bitrix)::int AS ventas_del_dia
            FROM public.mestra_bitrix mb_jot
            -- El lado CRM sale del WEBHOOK (vw_bitrix_novonet), no de
            -- mestra_bitrix: el ETL va atrasado y hoy tiene 6 leads contra
            -- 279 del webhook, por eso estas métricas daban 0.
            -- El lado JOT sigue en mestra_bitrix, que es su fuente.
            JOIN public.vw_bitrix_novonet mb_crm
                ON mb_crm.b_id::text = mb_jot.j_id_bitrix::text
            LEFT JOIN LATERAL (
                SELECT e2.supervisor FROM public.empleados e2
                WHERE e2.nombre_completo = mb_crm.b_persona_responsable
                ORDER BY e2.codigo::int DESC LIMIT 1
            ) e ON true
            WHERE public.parse_fecha_flex(mb_jot.j_fecha_registro_sistema::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
            AND mb_crm.b_etapa_de_la_negociacion = 'VENTA SUBIDA'
            AND mb_crm.b_creado_el_fecha = public.parse_fecha_flex(mb_jot.j_fecha_registro_sistema::text)
            GROUP BY 1;

-- ===== QUERY 15 =====

            SELECT
                mb_crm.b_persona_responsable AS nombre_grupo,
                COUNT(DISTINCT mb_jot.j_id_bitrix)::int AS ventas_del_dia
            FROM public.mestra_bitrix mb_jot
            -- El lado CRM sale del WEBHOOK (vw_bitrix_novonet), no de
            -- mestra_bitrix: el ETL va atrasado y hoy tiene 6 leads contra
            -- 279 del webhook, por eso estas métricas daban 0.
            -- El lado JOT sigue en mestra_bitrix, que es su fuente.
            JOIN public.vw_bitrix_novonet mb_crm
                ON mb_crm.b_id::text = mb_jot.j_id_bitrix::text
            WHERE public.parse_fecha_flex(mb_jot.j_fecha_registro_sistema::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
            AND mb_crm.b_etapa_de_la_negociacion = 'VENTA SUBIDA'
            AND mb_crm.b_creado_el_fecha = public.parse_fecha_flex(mb_jot.j_fecha_registro_sistema::text)
            AND mb_crm.b_persona_responsable IS NOT NULL
            GROUP BY 1;

-- ===== QUERY 16 =====

            SELECT
                COALESCE(e.supervisor, 'SIN ASIGNAR') AS nombre_grupo,
                COUNT(DISTINCT mb_jot.j_id_bitrix)::int AS ingresos_del_dia
            FROM public.mestra_bitrix mb_jot
            -- El lado CRM sale del WEBHOOK (vw_bitrix_novonet), no de
            -- mestra_bitrix: el ETL va atrasado y hoy tiene 6 leads contra
            -- 279 del webhook, por eso estas métricas daban 0.
            -- El lado JOT sigue en mestra_bitrix, que es su fuente.
            JOIN public.vw_bitrix_novonet mb_crm
                ON mb_crm.b_id::text = mb_jot.j_id_bitrix::text
            LEFT JOIN LATERAL (
                SELECT e2.supervisor FROM public.empleados e2
                WHERE e2.nombre_completo = mb_crm.b_persona_responsable
                ORDER BY e2.codigo::int DESC LIMIT 1
            ) e ON true
            WHERE public.parse_fecha_flex(mb_jot.j_fecha_registro_sistema::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
            AND mb_crm.b_creado_el_fecha = public.parse_fecha_flex(mb_jot.j_fecha_registro_sistema::text)
            GROUP BY 1;

-- ===== QUERY 17 =====

            SELECT
                mb_crm.b_persona_responsable AS nombre_grupo,
                COUNT(DISTINCT mb_jot.j_id_bitrix)::int AS ingresos_del_dia
            FROM public.mestra_bitrix mb_jot
            -- El lado CRM sale del WEBHOOK (vw_bitrix_novonet), no de
            -- mestra_bitrix: el ETL va atrasado y hoy tiene 6 leads contra
            -- 279 del webhook, por eso estas métricas daban 0.
            -- El lado JOT sigue en mestra_bitrix, que es su fuente.
            JOIN public.vw_bitrix_novonet mb_crm
                ON mb_crm.b_id::text = mb_jot.j_id_bitrix::text
            WHERE public.parse_fecha_flex(mb_jot.j_fecha_registro_sistema::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
            AND mb_crm.b_creado_el_fecha = public.parse_fecha_flex(mb_jot.j_fecha_registro_sistema::text)
            AND mb_crm.b_persona_responsable IS NOT NULL
            GROUP BY 1;

-- ===== QUERY 18 =====

            SELECT
                COUNT(*) FILTER (
                    WHERE public.parse_fecha_flex(mb.j_fecha_registro_sistema::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                    AND van.plan_casa IS NOT NULL AND TRIM(van.plan_casa::text) <> ''
                ) AS hogar_ingresados,
                COUNT(*) FILTER (
                    WHERE public.parse_fecha_flex(mb.j_fecha_registro_sistema::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                    AND UPPER(TRIM(mb.j_netlife_estatus_real)) = 'ACTIVO'
                    AND van.plan_casa IS NOT NULL AND TRIM(van.plan_casa::text) <> ''
                ) AS hogar_activos,
                COUNT(*) FILTER (
                    WHERE public.parse_fecha_flex(mb.j_fecha_registro_sistema::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                    AND (
                        (van.plan_pyme IS NOT NULL AND TRIM(van.plan_pyme::text) <> '') OR
                        (van.plan_pyme_corp IS NOT NULL AND TRIM(van.plan_pyme_corp::text) <> '')
                    )
                ) AS pymes_ingresados,
                COUNT(*) FILTER (
                    WHERE public.parse_fecha_flex(mb.j_fecha_registro_sistema::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                    AND UPPER(TRIM(mb.j_netlife_estatus_real)) = 'ACTIVO'
                    AND (
                        (van.plan_pyme IS NOT NULL AND TRIM(van.plan_pyme::text) <> '') OR
                        (van.plan_pyme_corp IS NOT NULL AND TRIM(van.plan_pyme_corp::text) <> '')
                    )
                ) AS pymes_activos,
                COUNT(*) FILTER (
                    WHERE public.parse_fecha_flex(mb.j_fecha_registro_sistema::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                    AND van.plan_hogar_adulto_mayor IS NOT NULL AND TRIM(van.plan_hogar_adulto_mayor::text) <> ''
                ) AS adulto_mayor_ingresados,
                COUNT(*) FILTER (
                    WHERE public.parse_fecha_flex(mb.j_fecha_registro_sistema::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date
                    AND UPPER(TRIM(mb.j_netlife_estatus_real)) = 'ACTIVO'
                    AND van.plan_hogar_adulto_mayor IS NOT NULL AND TRIM(van.plan_hogar_adulto_mayor::text) <> ''
                ) AS adulto_mayor_activos
            FROM public.mestra_bitrix mb
            LEFT JOIN (
    SELECT
        id_bitrix,
        MAX(plan_casa)               AS plan_casa,
        MAX(plan_profesional)        AS plan_profesional,
        MAX(plan_pyme)                AS plan_pyme,
        MAX(plan_pyme_corp)          AS plan_pyme_corp,
        MAX(plan_hogar_adulto_mayor) AS plan_hogar_adulto_mayor,
        MAX(plan_centro_comercial)   AS plan_centro_comercial
    FROM public.vista_analisis_novonet
    GROUP BY id_bitrix
) van ON mb.j_id_bitrix::text = van.id_bitrix::text
            WHERE public.parse_fecha_flex(mb.j_fecha_registro_sistema::text) BETWEEN '2026-08-01'::date AND '2026-08-14'::date  AND UPPER(TRIM(mb.b_persona_responsable)) = UPPER(TRIM('ARIANNE BELTRAN RANGEL'));

-- ===== QUERY 19 =====

            SELECT
                mb.j_id_bitrix AS "ID_CRM",
                -- ASESOR resuelto desde el webhook (mismo criterio que queryJotform)
                
        COALESCE(
            NULLIF(BTRIM(bwl.responsible), ''),
            CASE WHEN UPPER(BTRIM(mb.b_persona_responsable)) = 'REVISAR'
                 THEN NULL
                 ELSE NULLIF(BTRIM(mb.b_persona_responsable), '')
            END,
            'REVISAR'
        ) AS "ASESOR",
                COALESCE(esup.supervisor, e.supervisor) AS "SUPERVISOR_ASIGNADO",
                mb.j_fecha_registro_sistema AS "FECHACREACION_JOT",
                mb.j_fecha_activacion_netlife AS "FECHA_ACTIVACION",
                mb.j_netlife_estatus_real AS "ESTADO_NETLIFE",
                mb.j_forma_pago AS "FORMA_PAGO",
                mb.j_netlife_login AS "LOGIN",
                mb.j_estatus_regularizacion AS "ESTADO_REGULARIZACION"
            FROM public.mestra_bitrix mb
            
LEFT JOIN LATERAL (
    SELECT e2.supervisor, e2.codigo, e2.nombre_completo
    FROM public.empleados e2
    WHERE e2.nombre_completo = mb.b_persona_responsable
    ORDER BY
        CASE WHEN e2.codigo = EXTRACT(MONTH FROM COALESCE(
            public.parse_fecha_flex(mb.b_cerrado::text),
            public.parse_fecha_flex(mb.b_creado_el_fecha::text)
        ))::text THEN 0 ELSE 1 END,
        e2.codigo::int DESC
    LIMIT 1
) e ON true
            
LEFT JOIN public.bitrix_webhook_leads bwl
       ON BTRIM(bwl.bitrix_id::text) = BTRIM(mb.j_id_bitrix::text)
      AND bwl.empresa = 'novonet'
            
LEFT JOIN LATERAL (
    SELECT e3.supervisor
    FROM public.empleados e3
    WHERE UPPER(BTRIM(e3.nombre_completo)) = UPPER(BTRIM(
        COALESCE(
            NULLIF(BTRIM(bwl.responsible), ''),
            CASE WHEN UPPER(BTRIM(mb.b_persona_responsable)) = 'REVISAR'
                 THEN NULL
                 ELSE NULLIF(BTRIM(mb.b_persona_responsable), '')
            END,
            'REVISAR'
        )))
    ORDER BY e3.codigo::int DESC
    LIMIT 1
) esup ON true
            WHERE mb.j_netlife_estatus_real = 'ACTIVO'
              AND mb.j_fecha_activacion_netlife IS NOT NULL
              AND TRIM(mb.j_fecha_activacion_netlife::text) != ''
              AND public.parse_fecha_flex(mb.j_fecha_activacion_netlife::text) >= date_trunc('month', CURRENT_DATE)::date
              AND public.parse_fecha_flex(mb.j_fecha_activacion_netlife::text) <  (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
              -- FIX (bind mismatch): esta query no usa '2026-08-01'/'2026-08-14' para el rango de fechas
              -- (usa CURRENT_DATE a propósito), pero se ejecuta con pool.query(query, values)
              -- y "values" siempre trae [desde, hasta] como '2026-08-01'/'2026-08-14', más lo que agregue
              -- filtersJoin numerado desde 'ARIANNE BELTRAN RANGEL' en adelante. Sin esta línea, cuando no hay
              -- filtros activos la query queda con 0 placeholders y Postgres revienta con
              -- "bind message supplies 2 parameters, but prepared statement requires 0"
              -- (tumbaba TODO el dashboard de Indicadores). Esta condición es un no-op:
              -- '2026-08-01' y '2026-08-14' siempre son fechas válidas (desde/hasta ya vienen con default),
              -- solo existe para que el conteo de placeholders cuadre con "values".
              AND '2026-08-01'::date IS NOT NULL AND '2026-08-14'::date IS NOT NULL
               AND UPPER(TRIM(mb.b_persona_responsable)) = UPPER(TRIM('ARIANNE BELTRAN RANGEL'))
            ORDER BY public.parse_fecha_flex(mb.j_fecha_activacion_netlife::text) DESC
            LIMIT 3000;
