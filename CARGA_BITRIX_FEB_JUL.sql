-- ============================================================================
-- CARGA HISTORICA BITRIX NOVONET — FEBRERO a JULIO 2026
--
-- Archivo a importar: bitrix_backfill_ene_ago.csv  (23.462 filas)
-- Ya viene limpio: columnas mapeadas, etapas convertidas a slug y fechas
-- pasadas a UTC. NO hay que tocarlo.
--
-- ⚠️ SUPUESTO DE HORA: el CSV de Bitrix trae las fechas en hora de ECUADOR
--    (formato DD/MM/YYYY HH:MM:SS). Al generarlo se les sumaron 5 horas para
--    guardarlas en UTC, que es como las guarda el webhook.
--    En el PASO 3 hay una consulta para comprobar que quedaron bien.
--
-- ESTRATEGIA: primero staging, se compara, y solo despues se toca la tabla real.
-- Base: bddgeneral
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 1 — Crear la tabla staging (vacia, todo texto salvo las fechas)
-- ────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.stg_bitrix_backfill;

CREATE TABLE public.stg_bitrix_backfill (
    bitrix_id             TEXT,
    empresa               TEXT,
    etapa                 TEXT,
    etapa_bitrix          TEXT,
    event                 TEXT,
    phone                 TEXT,
    source                TEXT,
    city                  TEXT,
    repeated              TEXT,
    responsible           TEXT,
    utm_source            TEXT,
    utm_medium            TEXT,
    utm_campaign          TEXT,
    utm_content           TEXT,
    utm_term              TEXT,
    fecha_venta_subida    TEXT,
    fecha_concretar       TEXT,
    modificado_por        TEXT,
    creado_por            TEXT,
    creado_por_friendly   TEXT,
    pipeline              TEXT,
    comentario            TEXT,
    iniciado_el           TEXT,
    otro_proveedor        TEXT,
    razon_descarte        TEXT,
    innegociable          TEXT,
    volver_a_llamar       TEXT,
    documentos_pendientes TEXT,
    motivo_atc            TEXT,
    id_conversacion       TEXT,
    created_at            TIMESTAMPTZ,
    updated_at            TIMESTAMPTZ
);


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 2 — IMPORTAR EL CSV  (esto NO es SQL, se hace en la interfaz)
--
--   1. En pgAdmin, click derecho sobre la tabla stg_bitrix_backfill
--   2. Import/Export Data...  ->  pestaña General: Import
--   3. Filename: bitrix_backfill_ene_ago.csv
--   4. Format: csv | Encoding: UTF8
--   5. Pestaña Options:  Header = SI  |  Delimiter = ,  |  Quote = "
--   6. Boton OK
--
-- Debe cargar 23.462 filas.
-- ────────────────────────────────────────────────────────────────────────────
SELECT COUNT(*)::int AS filas_importadas FROM public.stg_bitrix_backfill;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 3 — ⚠️ VERIFICAR LA HORA ANTES DE SEGUIR
--
-- Compara, para los leads que estan en las DOS fuentes, la hora del staging
-- contra la del webhook. La diferencia deberia ser 0.
--
--   diferencia = 0h      -> correcto, seguir
--   diferencia = 5h o -5h -> el supuesto de zona horaria esta al reves, AVISAR
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    COUNT(*)::int                                              AS leads_comparables,
    ROUND(AVG(EXTRACT(EPOCH FROM (s.created_at - w.created_at))/3600)::numeric, 2)
                                                               AS diferencia_horas_promedio
FROM public.stg_bitrix_backfill s
JOIN public.bitrix_webhook_leads w
  ON w.bitrix_id = s.bitrix_id AND w.empresa = 'novonet';


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 4 — Ver que va a pasar ANTES de escribir nada
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    COUNT(*)::int                                                        AS total_staging,
    COUNT(*) FILTER (WHERE w.bitrix_id IS NULL)::int                     AS se_van_a_insertar,
    COUNT(*) FILTER (WHERE w.bitrix_id IS NOT NULL)::int                 AS ya_existen_no_se_tocan
FROM public.stg_bitrix_backfill s
LEFT JOIN public.bitrix_webhook_leads w
  ON w.bitrix_id = s.bitrix_id AND w.empresa = 'novonet';


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 5 — RESPALDO antes de escribir
-- ────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.bitrix_webhook_leads_bkp_carga;
CREATE TABLE public.bitrix_webhook_leads_bkp_carga AS
SELECT * FROM public.bitrix_webhook_leads;

SELECT COUNT(*)::int AS filas_respaldadas FROM public.bitrix_webhook_leads_bkp_carga;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 6 — CARGA. Solo INSERTA lo que falta.
--
-- NO actualiza los que ya existen: esos los mantiene el webhook, que es la
-- fuente viva. Asi la carga historica no puede pisar datos buenos.
-- ────────────────────────────────────────────────────────────────────────────
BEGIN;

INSERT INTO public.bitrix_webhook_leads (
    bitrix_id, empresa, etapa, etapa_bitrix, event, phone, source, city,
    repeated, responsible, utm_source, utm_medium, utm_campaign, utm_content,
    utm_term, fecha_venta_subida, fecha_concretar, modificado_por, creado_por,
    creado_por_friendly, pipeline, comentario, iniciado_el, otro_proveedor,
    razon_descarte, innegociable, volver_a_llamar, documentos_pendientes,
    motivo_atc, id_conversacion, raw_query, created_at, updated_at
)
SELECT
    s.bitrix_id, 'novonet', s.etapa, s.etapa_bitrix, s.event, s.phone, s.source,
    s.city, s.repeated, s.responsible, s.utm_source, s.utm_medium, s.utm_campaign,
    s.utm_content, s.utm_term, s.fecha_venta_subida, s.fecha_concretar,
    s.modificado_por, s.creado_por, s.creado_por_friendly, s.pipeline,
    s.comentario, s.iniciado_el, s.otro_proveedor, s.razon_descarte,
    s.innegociable, s.volver_a_llamar, s.documentos_pendientes, s.motivo_atc,
    s.id_conversacion,
    '{"origen":"carga_csv_bitrix_feb_jul_2026"}',   -- marca de origen
    s.created_at, s.updated_at
FROM public.stg_bitrix_backfill s
WHERE NOT EXISTS (
    SELECT 1 FROM public.bitrix_webhook_leads w
    WHERE w.bitrix_id = s.bitrix_id AND w.empresa = 'novonet'
);

COMMIT;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 7 — VERIFICAR el resultado
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    date_trunc('month', created_at AT TIME ZONE 'America/Guayaquil')::date AS mes,
    COUNT(*)::int                                                          AS leads
FROM public.bitrix_webhook_leads
WHERE empresa = 'novonet'
GROUP BY 1
ORDER BY 1;

-- Y lo que ve el dashboard (la vista excluye duplicados)
SELECT
    date_trunc('month', b_creado_el_fecha)::date AS mes,
    COUNT(DISTINCT b_id)::int                    AS leads
FROM public.vw_bitrix_novonet
WHERE b_creado_el_fecha IS NOT NULL
GROUP BY 1
ORDER BY 1;


-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK DE EMERGENCIA — solo si algo salio mal
-- ────────────────────────────────────────────────────────────────────────────
-- DELETE FROM public.bitrix_webhook_leads
-- WHERE raw_query::text LIKE '%carga_csv_bitrix_feb_jul_2026%';
