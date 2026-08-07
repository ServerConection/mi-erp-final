-- ============================================================================
-- ¿SE PUEDE REEMPLAZAR mestra_bitrix POR bitrix_webhook_leads?
--
-- Objetivo: que los indicadores de Novonet lean del webhook (tiempo real,
-- fechas tipadas, etapas completas) en vez del ETL mestra_bitrix.
--
-- Estas consultas miden si la migracion es viable y con que alcance.
-- Corre M1-M4 en bddgeneral, y M5-M6 en erp_database.
-- ============================================================================


-- ####################  EN bddgeneral  ####################

-- ────────────────────────────────────────────────────────────────────────────
-- M1. ¿Desde cuando hay datos y cuantos por mes?
--     Compara la cobertura historica de las dos fuentes.
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'webhook' AS fuente,
       date_trunc('month', fecha_ecuador)::date AS mes,
       COUNT(*)::int                            AS leads
FROM public.bitrix_webhook_leads
WHERE empresa = 'novonet'
GROUP BY 2
UNION ALL
SELECT 'mestra_bitrix',
       date_trunc('month', public.parse_fecha_flex(b_creado_el_fecha::text))::date,
       COUNT(*)::int
FROM public.mestra_bitrix
WHERE public.parse_fecha_flex(b_creado_el_fecha::text) IS NOT NULL
GROUP BY 2
ORDER BY mes DESC, fuente;


-- ────────────────────────────────────────────────────────────────────────────
-- M2. ⭐ COBERTURA — ¿el webhook tiene TODOS los leads?
--
-- El webhook solo registra leads que dispararon una automatizacion de etapa.
-- Un lead creado que nunca se movio podria NO estar.
--
-- Si "solo_en_mestra" es alto, el webhook NO sirve como fuente unica.
-- ────────────────────────────────────────────────────────────────────────────
WITH mes AS (
    SELECT date_trunc('month', CURRENT_DATE)::date AS ini, CURRENT_DATE AS fin
)
SELECT
    (SELECT COUNT(*) FROM public.mestra_bitrix mb, mes
      WHERE public.parse_fecha_flex(mb.b_creado_el_fecha::text) BETWEEN mes.ini AND mes.fin)::int
        AS en_mestra,
    (SELECT COUNT(*) FROM public.bitrix_webhook_leads w, mes
      WHERE w.empresa='novonet' AND w.fecha_ecuador BETWEEN mes.ini AND mes.fin)::int
        AS en_webhook,
    (SELECT COUNT(*) FROM public.mestra_bitrix mb, mes
      WHERE public.parse_fecha_flex(mb.b_creado_el_fecha::text) BETWEEN mes.ini AND mes.fin
        AND NOT EXISTS (SELECT 1 FROM public.bitrix_webhook_leads w
                        WHERE w.bitrix_id = mb.b_id AND w.empresa='novonet'))::int
        AS solo_en_mestra,
    (SELECT COUNT(*) FROM public.bitrix_webhook_leads w, mes
      WHERE w.empresa='novonet' AND w.fecha_ecuador BETWEEN mes.ini AND mes.fin
        AND NOT EXISTS (SELECT 1 FROM public.mestra_bitrix mb
                        WHERE mb.b_id = w.bitrix_id))::int
        AS solo_en_webhook;


-- ────────────────────────────────────────────────────────────────────────────
-- M3. Etapas del webhook vs etapas de mestra (agosto)
--     Confirma que el webhook trae las 5 que hoy caen en SIN ETAPA.
-- ────────────────────────────────────────────────────────────────────────────
SELECT etapa_bitrix, etapa AS slug, COUNT(*)::int AS leads
FROM public.bitrix_webhook_leads
WHERE empresa = 'novonet'
  AND fecha_ecuador BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE
GROUP BY 1, 2
ORDER BY leads DESC;


-- ────────────────────────────────────────────────────────────────────────────
-- M4. ¿Los nombres de "responsible" enganchan con empleados?
--     Si "sin_supervisor" es alto, hay que normalizar nombres igual que ahora.
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    w.responsible                                  AS asesor_webhook,
    COUNT(*)::int                                  AS leads,
    COALESCE(e.supervisor, '>>> SIN SUPERVISOR')   AS supervisor
FROM public.bitrix_webhook_leads w
LEFT JOIN LATERAL (
    SELECT e2.supervisor FROM public.empleados e2
    WHERE e2.nombre_completo = w.responsible
    ORDER BY CASE WHEN e2.codigo = EXTRACT(MONTH FROM CURRENT_DATE)::text THEN 0 ELSE 1 END,
             e2.codigo::int DESC
    LIMIT 1
) e ON TRUE
WHERE w.empresa = 'novonet'
  AND w.fecha_ecuador BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE
GROUP BY 1, 3
ORDER BY leads DESC;


-- ####################  EN erp_database  ####################
-- (misma conexion, cambia la base en el desplegable de pgAdmin)

-- ────────────────────────────────────────────────────────────────────────────
-- M5. ⭐ ¿Que tablas existen realmente en erp_database?
--
-- Esto decide todo. Si solo estan las 2 del webhook, NO se puede mover el
-- pool principal: empleados, jotform y el resto no estarian.
-- ────────────────────────────────────────────────────────────────────────────
SELECT table_name,
       (SELECT COUNT(*) FROM information_schema.columns c
        WHERE c.table_name = t.table_name AND c.table_schema='public') AS columnas
FROM information_schema.tables t
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;


-- ────────────────────────────────────────────────────────────────────────────
-- M6. ¿La replica en erp_database esta al dia?
--     Compara contra el conteo de M2 en bddgeneral.
-- ────────────────────────────────────────────────────────────────────────────
SELECT COUNT(*)::int    AS leads_novonet_mes,
       MAX(updated_at)  AS ultima_escritura
FROM public.bitrix_webhook_leads
WHERE empresa = 'novonet'
  AND fecha_ecuador BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE;
