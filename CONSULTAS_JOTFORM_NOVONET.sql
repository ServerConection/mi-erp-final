-- ============================================================================
-- JOTFORM NOVONET — de donde salen los datos
--
-- NO hay tabla propia de Jotform para Novonet.
-- Todo sale de public.mestra_bitrix, columnas con prefijo j_
--   b_*  = lado Bitrix / CRM
--   j_*  = lado Jotform
--
-- La fecha clave es j_fecha_registro_sistema. Viene como TEXTO en formatos
-- mezclados, por eso SIEMPRE se envuelve en public.parse_fecha_flex().
-- Filtrar con ::date directo devuelve resultados incompletos.
--
-- (jotform_submissions existe pero solo la escriben el webhook y el cron de
--  sync. No alimenta los indicadores.)
--
-- Velsa es distinto: usa vw_jotform_velsa_netlife_completo.
-- Base: bddgeneral
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- J1. Todas las columnas Jotform disponibles
-- ────────────────────────────────────────────────────────────────────────────
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'mestra_bitrix'
  AND column_name LIKE 'j\_%'
ORDER BY ordinal_position;


-- ────────────────────────────────────────────────────────────────────────────
-- J2. Ingresos Jotform del mes (esto es "Ingresos Tot. Jot" en las tarjetas)
-- ────────────────────────────────────────────────────────────────────────────
SELECT COUNT(*)::int AS ingresos_jot_mes
FROM public.mestra_bitrix
WHERE public.parse_fecha_flex(j_fecha_registro_sistema::text)
      BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE;


-- ────────────────────────────────────────────────────────────────────────────
-- J3. Ingresos Jotform por dia
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    public.parse_fecha_flex(j_fecha_registro_sistema::text) AS dia,
    COUNT(*)::int                                          AS ingresos_jot
FROM public.mestra_bitrix
WHERE public.parse_fecha_flex(j_fecha_registro_sistema::text)
      BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE
GROUP BY 1
ORDER BY 1;


-- ────────────────────────────────────────────────────────────────────────────
-- J4. Estados Netlife (alimenta la tarjeta "Etapas Jotform")
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    COALESCE(NULLIF(TRIM(j_netlife_estatus_real), ''), 'SIN ESTADO') AS estado,
    COUNT(*)::int                                                   AS total
FROM public.mestra_bitrix
WHERE public.parse_fecha_flex(j_fecha_registro_sistema::text)
      BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE
GROUP BY 1
ORDER BY total DESC;


-- ────────────────────────────────────────────────────────────────────────────
-- J5. Activaciones por fecha de activacion Netlife
--     OJO: usa j_fecha_activacion_netlife, NO la de registro.
--     Es la fecha en que Netlife activa al cliente.
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    public.parse_fecha_flex(j_fecha_activacion_netlife::text) AS dia_activacion,
    COUNT(*)::int                                            AS activaciones
FROM public.mestra_bitrix
WHERE NULLIF(TRIM(j_fecha_activacion_netlife::text), '') IS NOT NULL
  AND public.parse_fecha_flex(j_fecha_activacion_netlife::text)
      BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE
GROUP BY 1
ORDER BY 1;


-- ────────────────────────────────────────────────────────────────────────────
-- J6. Jotform por asesor y supervisor
--     El supervisor se resuelve contra public.empleados por NOMBRE EXACTO,
--     prefiriendo la fila cuyo codigo = mes del lead.
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    COALESCE(e.supervisor, 'SIN ASIGNAR')  AS supervisor,
    mb.b_persona_responsable               AS asesor,
    COUNT(*)::int                          AS ingresos_jot,
    COUNT(*) FILTER (WHERE UPPER(TRIM(mb.j_netlife_estatus_real)) = 'ACTIVO')::int AS activos
FROM public.mestra_bitrix mb
LEFT JOIN LATERAL (
    SELECT e2.supervisor
    FROM public.empleados e2
    WHERE e2.nombre_completo = mb.b_persona_responsable
    ORDER BY
        CASE WHEN e2.codigo = EXTRACT(MONTH FROM CURRENT_DATE)::text THEN 0 ELSE 1 END,
        e2.codigo::int DESC
    LIMIT 1
) e ON TRUE
WHERE public.parse_fecha_flex(mb.j_fecha_registro_sistema::text)
      BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE
GROUP BY 1, 2
ORDER BY 1, ingresos_jot DESC;


-- ────────────────────────────────────────────────────────────────────────────
-- J7. Ficha completa de un lead (las dos caras: CRM + Jotform)
--     Cambia el ID por el que quieras revisar.
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    b_id, b_etapa_de_la_negociacion, b_creado_el_fecha, b_persona_responsable,
    j_id_bitrix, j_fecha_registro_sistema, j_netlife_estatus_real,
    j_netlife_login, j_fecha_activacion_netlife, j_plan_contratado_final,
    j_forma_pago, j_estatus_regularizacion
FROM public.mestra_bitrix
WHERE b_id = '12345'      -- <<< cambia esto
   OR j_id_bitrix = '12345';


-- ────────────────────────────────────────────────────────────────────────────
-- J8. VELSA — para comparar. Aqui SI hay vista propia.
-- ────────────────────────────────────────────────────────────────────────────
-- SELECT COUNT(*) FROM public.vw_jotform_velsa_netlife_completo;
-- SELECT COUNT(*) FROM public.mv_indicadores_velsa_completo;
