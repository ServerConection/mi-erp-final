-- ============================================================================
-- ORIGENES_01_DIAGNOSTICO.sql   (2026-08-18)
-- ----------------------------------------------------------------------------
-- PROBLEMA: en Indicadores D-1 los origenes de NOVONET ahora salen como
-- numeros (45, 48, 50, 51...) en vez del nombre. Eso pasa porque el webhook
-- guarda en bitrix_webhook_leads.source lo que Bitrix manda en {{Origen}},
-- y la automatizacion de Bitrix empezo a mandar el ID interno del origen
-- (SOURCE_ID) en vez del nombre imprimible.
--
-- Tu export "ORIGENES NOVO.xlsx" trae 104 negociaciones (ID 566137-566343)
-- que SI tienen el nombre. Son justo las mas recientes, o sea las mismas que
-- en el ERP ya tienen numero. Cruzandolas sale el diccionario numero->nombre.
--
-- CORRE ESTA CONSULTA Y PEGAME EL RESULTADO. No modifica nada.
-- ============================================================================

WITH bitrix(id, origen_nombre) AS (VALUES
  (566137, 'API 484'),
  (566139, 'WAZZUP: WhatsApp - API 963999000'),
  (566141, 'API 484'),
  (566143, 'Base 593-962881280'),
  (566145, 'WAZZUP: WhatsApp - API 963999000'),
  (566147, 'BASE API 593963463480'),
  (566149, 'WAZZUP: WhatsApp - API 963999000'),
  (566151, 'Fomulario Landing 3'),
  (566153, 'WAZZUP: WhatsApp - API 963999000'),
  (566155, 'WAZZUP: WhatsApp - API 963999000'),
  (566157, 'API 484'),
  (566159, 'WAZZUP: WhatsApp - API 963999000'),
  (566161, 'Base 593-962881280'),
  (566163, 'BASE API 593963463480'),
  (566165, 'WAZZUP: WhatsApp - API 963999000'),
  (566167, 'WAZZUP: WhatsApp - API 963999000'),
  (566169, 'Base 593-962881280'),
  (566171, 'BASE API 593963463480'),
  (566173, 'WAZZUP: WhatsApp - API 963999000'),
  (566175, 'API 484'),
  (566177, 'WAZZUP: WhatsApp - API 963999000'),
  (566179, 'BASE API 593963463480'),
  (566181, 'BASE API 593963463480'),
  (566183, 'BASE API 593963463480'),
  (566185, 'BASE API 593963463480'),
  (566187, 'API 484'),
  (566189, 'WAZZUP: WhatsApp - API 963999000'),
  (566191, 'API 484'),
  (566193, 'Fomulario Landing 3'),
  (566195, 'BASE API 593963463480'),
  (566197, 'BASE API 593963463480'),
  (566199, 'WAZZUP: WhatsApp - API 963999000'),
  (566201, 'WAZZUP: WhatsApp - API 963999000'),
  (566203, 'API 484'),
  (566205, 'API 484'),
  (566207, 'API 484'),
  (566209, 'WAZZUP: WhatsApp - API 963999000'),
  (566211, 'API 484'),
  (566213, 'WAZZUP: WhatsApp - API 963999000'),
  (566215, 'API 484'),
  (566217, 'WAZZUP: WhatsApp - API 963999000'),
  (566219, 'Fomulario Landing 3'),
  (566221, 'WAZZUP: WhatsApp - API 963999000'),
  (566223, 'BASE API 593963463480'),
  (566225, 'Base 593-962881280'),
  (566227, 'WAZZUP: WhatsApp - API 963999000'),
  (566229, 'API 484'),
  (566231, 'Base 593-962881280'),
  (566233, 'BASE API 593963463480'),
  (566235, 'BASE API 593963463480'),
  (566237, 'API 484'),
  (566239, 'API 484'),
  (566241, 'API 484'),
  (566243, 'API 484'),
  (566245, 'API 484'),
  (566247, 'WAZZUP: WhatsApp - API 963999000'),
  (566249, 'Base 593-962881280'),
  (566251, 'API 484'),
  (566253, 'BASE API 593963463480'),
  (566255, 'BASE API 593963463480'),
  (566257, 'WAZZUP: WhatsApp - API 963999000'),
  (566259, 'WAZZUP: WhatsApp - API 963999000'),
  (566261, 'BASE API 593963463480'),
  (566263, 'BASE API 593963463480'),
  (566265, 'WAZZUP: WhatsApp - API 963999000'),
  (566267, 'API 484'),
  (566269, 'Fomulario Landing 3'),
  (566271, 'API 484'),
  (566273, 'Base 593-962881280'),
  (566275, 'WAZZUP: WhatsApp - API 963999000'),
  (566277, 'API 484'),
  (566279, 'API 484'),
  (566281, 'API 484'),
  (566283, 'API 484'),
  (566285, 'API 484'),
  (566287, 'BASE API 593963463480'),
  (566289, 'BASE API 593963463480'),
  (566291, 'API 484'),
  (566293, 'WAZZUP: WhatsApp - API 963999000'),
  (566295, 'WAZZUP: WhatsApp - API 963999000'),
  (566297, 'BASE API 593963463480'),
  (566299, 'API 484'),
  (566301, 'API 484'),
  (566303, 'BASE API 593963463480'),
  (566305, 'Base 593-962881280'),
  (566307, 'Formulario Landing 4'),
  (566309, 'BASE API 593963463480'),
  (566311, 'WAZZUP: WhatsApp - API 963999000'),
  (566313, 'BASE API 593963463480'),
  (566315, 'BASE API 593963463480'),
  (566317, 'Base 593-962881280'),
  (566319, 'BASE API 593963463480'),
  (566321, 'BASE API 593963463480'),
  (566323, 'Base 593-962881280'),
  (566325, 'API 484'),
  (566327, 'BASE API 593963463480'),
  (566329, 'BASE API 593963463480'),
  (566331, 'API 484'),
  (566333, 'BASE API 593963463480'),
  (566335, 'API 484'),
  (566337, 'API 484'),
  (566339, 'API 484'),
  (566341, 'BASE API 593963463480'),
  (566343, 'BASE API 593963463480')
)
SELECT
  w.source                          AS codigo_en_erp,
  b.origen_nombre                   AS nombre_en_bitrix,
  COUNT(*)::int                     AS cuantos,
  MIN(w.bitrix_id)::text            AS ejemplo_id
FROM public.bitrix_webhook_leads w
JOIN bitrix b ON b.id = w.bitrix_id::bigint
WHERE w.empresa = 'novonet'
GROUP BY 1, 2
ORDER BY 3 DESC, 1;

-- ----------------------------------------------------------------------------
-- CONSULTA 2 — que hay hoy en la tabla (para ver el tamano del problema)
-- ----------------------------------------------------------------------------
SELECT
  CASE WHEN w.source ~ '^[0-9]+$' THEN 'NUMERO (roto)' ELSE 'NOMBRE (ok)' END AS tipo,
  COALESCE(NULLIF(TRIM(w.source), ''), '(vacio)')                             AS valor,
  COUNT(*)::int                                                               AS total,
  MIN(w.created_at)::date                                                     AS desde,
  MAX(w.created_at)::date                                                     AS hasta
FROM public.bitrix_webhook_leads w
WHERE w.empresa = 'novonet'
GROUP BY 1, 2
ORDER BY 1, 3 DESC;

-- ----------------------------------------------------------------------------
-- CONSULTA 3 — desde que dia se rompio (cuando empezaron a llegar numeros)
-- ----------------------------------------------------------------------------
SELECT
  w.created_at::date                                              AS dia,
  COUNT(*) FILTER (WHERE w.source ~ '^[0-9]+$')::int               AS con_numero,
  COUNT(*) FILTER (WHERE NOT (w.source ~ '^[0-9]+$')
                     AND NULLIF(TRIM(w.source),'') IS NOT NULL)::int AS con_nombre
FROM public.bitrix_webhook_leads w
WHERE w.empresa = 'novonet'
  AND w.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1;

-- ----------------------------------------------------------------------------
-- CONSULTA 4 — VELSA: que origenes tiene hoy (para armar su filtro)
-- ----------------------------------------------------------------------------
SELECT
  COALESCE(NULLIF(TRIM(w.source), ''), '(vacio)') AS origen,
  COUNT(*)::int                                   AS total
FROM public.bitrix_webhook_leads w
WHERE w.empresa = 'velsa'
GROUP BY 1
ORDER BY 2 DESC;
