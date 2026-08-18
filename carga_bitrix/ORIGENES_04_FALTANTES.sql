-- ============================================================================
-- ORIGENES_04_FALTANTES.sql   (2026-08-18)
-- ----------------------------------------------------------------------------
-- QUEDAN 29 CODIGOS SIN NOMBRE (4775 leads).
-- Estos codigos NO existen en el catalogo de origenes de Bitrix (crm.status.list
-- devolvio 46 y ninguno coincide). Son origenes que se BORRARON o RENOMBRARON
-- en Bitrix: los leads siguen apuntando al codigo viejo pero el nombre ya no
-- existe, por eso Bitrix tampoco los puede resolver.
--
-- Se parten en dos grupos:
--   · 2, 3, 4, 6, 7, 22  -> son de 2025 (4.398 leads). Epoca vieja.
--   · 32 al 64           -> arrancan TODOS el 23/06/2026 (377 leads).
--     Ese dia se reconectaron los canales de Wazzup y se crearon canales
--     nuevos; los viejos quedaron huerfanos.
--
-- COMO LOS NOMBRAS (5 minutos):
--   PASO A) Corre la CONSULTA 1 de abajo: te da 3 ID de negociacion por cada
--           codigo.
--   PASO B) Abre cualquiera de esos ID en Bitrix y mira el campo "Origen".
--   PASO C) Escribe ese nombre en el INSERT del PASO 2 y corre el bloque.
--
-- Si un codigo ya no te interesa, dejalo con 'SIN ORIGEN' y listo.
-- ============================================================================


-- ===========================================================================
-- CONSULTA 1 — 3 ejemplos de negociacion por cada codigo sin nombre
-- Con estos ID los buscas en Bitrix y ves el nombre real del origen.
-- ===========================================================================
SELECT
    BTRIM(w.source)                                   AS codigo,
    COUNT(*)::int                                     AS leads,
    MIN(w.created_at)::date                           AS desde,
    MAX(w.created_at)::date                           AS hasta,
    (array_agg(w.bitrix_id ORDER BY w.created_at DESC))[1:3] AS ejemplos_id_bitrix
FROM public.bitrix_webhook_leads w
WHERE w.empresa = 'novonet'
  AND BTRIM(w.source) IN ('2', '3', '6', '48', '41', '50', '56', '37', '36', '54', '53', '40', '42', '60', '58', '44', '59', '55', '52', '35', '7', '46', '38', '45', '32', '22', '4', '64', '47')
GROUP BY 1
ORDER BY 2 DESC;


-- ===========================================================================
-- PASO 2 — LLENA LOS NOMBRES Y CORRE ESTE BLOQUE
-- Reemplaza ESCRIBE_AQUI_EL_NOMBRE por el nombre real de cada uno.
-- Los que no sepas, dejalos en 'SIN ORIGEN'.
-- ===========================================================================
INSERT INTO public.bitrix_origenes (empresa, source_id, status_id, nombre, es_sistema)
VALUES
  ('novonet', '2', '2', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 2507 leads · 2025-05-30 a 2026-06-22
  ('novonet', '3', '3', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 1125 leads · 2025-05-30 a 2026-07-16
  ('novonet', '6', '6', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 753 leads · 2025-05-30 a 2026-06-03
  ('novonet', '48', '48', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 31 leads · 2026-06-23 a 2026-07-30
  ('novonet', '41', '41', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 30 leads · 2026-06-23 a 2026-07-10
  ('novonet', '50', '50', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 28 leads · 2026-06-23 a 2026-08-02
  ('novonet', '56', '56', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 27 leads · 2026-06-24 a 2026-07-21
  ('novonet', '37', '37', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 26 leads · 2026-06-23 a 2026-07-20
  ('novonet', '36', '36', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 25 leads · 2026-06-23 a 2026-07-30
  ('novonet', '54', '54', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 23 leads · 2026-06-23 a 2026-07-23
  ('novonet', '53', '53', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 23 leads · 2026-06-23 a 2026-07-23
  ('novonet', '40', '40', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 20 leads · 2026-06-23 a 2026-07-29
  ('novonet', '42', '42', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 19 leads · 2026-06-26 a 2026-07-23
  ('novonet', '60', '60', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 16 leads · 2026-06-23 a 2026-07-22
  ('novonet', '58', '58', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 14 leads · 2026-06-24 a 2026-07-23
  ('novonet', '44', '44', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 13 leads · 2026-06-24 a 2026-07-20
  ('novonet', '59', '59', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 13 leads · 2026-06-24 a 2026-07-24
  ('novonet', '55', '55', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 13 leads · 2026-06-25 a 2026-07-31
  ('novonet', '52', '52', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 12 leads · 2026-06-23 a 2026-07-24
  ('novonet', '35', '35', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 12 leads · 2026-06-26 a 2026-08-01
  ('novonet', '7', '7', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 9 leads · 2025-05-31 a 2026-05-04
  ('novonet', '46', '46', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 9 leads · 2026-07-01 a 2026-07-22
  ('novonet', '38', '38', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 8 leads · 2026-06-24 a 2026-08-03
  ('novonet', '45', '45', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 8 leads · 2026-06-25 a 2026-07-23
  ('novonet', '32', '32', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 5 leads · 2026-05-06 a 2026-06-03
  ('novonet', '22', '22', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 2 leads · 2025-07-05 a 2025-11-10
  ('novonet', '4', '4', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 2 leads · 2025-06-16 a 2025-08-04
  ('novonet', '64', '64', 'ESCRIBE_AQUI_EL_NOMBRE', false),   -- 1 leads · 2026-07-16 a 2026-07-16
  ('novonet', '47', '47', 'ESCRIBE_AQUI_EL_NOMBRE', false)   -- 1 leads · 2026-06-26 a 2026-06-26
ON CONFLICT (empresa, source_id) DO UPDATE
SET nombre      = EXCLUDED.nombre,
    actualizado = now();


-- ===========================================================================
-- PASO 3 — aplicar los nombres nuevos a los leads ya guardados
-- ===========================================================================
UPDATE public.bitrix_webhook_leads w
SET    source = public.resolver_origen(w.empresa, w.source)
WHERE  NULLIF(BTRIM(w.source), '') IS NOT NULL
  AND  public.resolver_origen(w.empresa, w.source) IS DISTINCT FROM BTRIM(w.source);

REFRESH MATERIALIZED VIEW public.mv_indicadores_velsa_completo;


-- ===========================================================================
-- PASO 4 — verificar: no deberia quedar ningun codigo suelto
-- ===========================================================================
SELECT w.empresa,
       COALESCE(NULLIF(BTRIM(w.source), ''), '(vacio)') AS origen,
       COUNT(*)::int                                    AS leads
FROM public.bitrix_webhook_leads w
GROUP BY 1, 2
ORDER BY 1, 3 DESC;
