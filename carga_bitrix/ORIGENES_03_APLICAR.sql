-- ============================================================================
-- ORIGENES_03_APLICAR.sql   (2026-08-18)
-- ----------------------------------------------------------------------------
-- OBJETIVO: que en el ERP se vea el NOMBRE del origen, no el codigo.
--
-- Hace 2 cosas:
--   1) TRADUCE lo que ya esta guardado  (los 45 / 48 / 50 / 51 de hoy)
--   2) DEJA UN TRIGGER para que los leads NUEVOS entren ya con el nombre,
--      sin tener que tocar el webhook ni Bitrix.
--
-- SEGURO:
--   · NO agrega columnas (no toca el esquema, no rompe la replicacion).
--   · El valor original NO se pierde: sigue en la columna raw_query.
--   · Si un codigo no esta en el catalogo, se DEJA COMO ESTA (no lo borra).
--   · Se puede correr las veces que haga falta.
--
-- REQUISITO: haber corrido antes ORIGENES_02_CATALOGO.sql
-- ============================================================================


-- ===========================================================================
-- PASO 1 — ANTES (foto de como esta hoy). Corre esto solo, mira, y sigue.
-- ===========================================================================
SELECT
    w.empresa,
    CASE WHEN BTRIM(w.source) ~ '^[0-9]+$' THEN 'CODIGO' ELSE 'NOMBRE' END AS tipo,
    COUNT(*)::int AS leads
FROM public.bitrix_webhook_leads w
WHERE NULLIF(BTRIM(w.source), '') IS NOT NULL
GROUP BY 1, 2
ORDER BY 1, 2;


-- ===========================================================================
-- PASO 2 — TRADUCIR LO YA GUARDADO
-- Solo toca las filas donde el catalogo SI encuentra un nombre distinto.
-- ===========================================================================
BEGIN;

UPDATE public.bitrix_webhook_leads w
SET    source = public.resolver_origen(w.empresa, w.source)
WHERE  NULLIF(BTRIM(w.source), '') IS NOT NULL
  AND  public.resolver_origen(w.empresa, w.source) IS DISTINCT FROM BTRIM(w.source);

-- Cuantas filas se tradujeron -> lo dice el "UPDATE n" de pgAdmin.
COMMIT;


-- ===========================================================================
-- PASO 3 — TRIGGER: los leads NUEVOS entran ya con el nombre
-- Asi no hay que tocar Bitrix ni el webhook. Si manana Bitrix vuelve a mandar
-- el nombre, el trigger lo deja pasar igual (la funcion devuelve el valor tal
-- cual cuando no es un codigo conocido).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.trg_normalizar_origen()
RETURNS trigger
LANGUAGE plpgsql
AS $trg$
BEGIN
    IF NULLIF(BTRIM(NEW.source), '') IS NOT NULL THEN
        NEW.source := public.resolver_origen(NEW.empresa, NEW.source);
    END IF;
    RETURN NEW;
END;
$trg$;

DROP TRIGGER IF EXISTS bitrix_webhook_leads_origen ON public.bitrix_webhook_leads;

CREATE TRIGGER bitrix_webhook_leads_origen
    BEFORE INSERT OR UPDATE OF source ON public.bitrix_webhook_leads
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_normalizar_origen();


-- ===========================================================================
-- PASO 4 — REFRESCAR LA MV DE VELSA (para que el cambio se vea alla tambien)
-- ===========================================================================
REFRESH MATERIALIZED VIEW public.mv_indicadores_velsa_completo;


-- ===========================================================================
-- PASO 5 — DESPUES: que quedo. Pegame ESTE resultado.
-- Si aparece algo en 'CODIGO SIN NOMBRE' es un origen que Bitrix creo despues
-- y hay que agregarlo al catalogo (te paso el INSERT).
-- ===========================================================================
SELECT
    w.empresa,
    COALESCE(NULLIF(BTRIM(w.source), ''), '(vacio)') AS origen,
    CASE WHEN BTRIM(w.source) ~ '^[0-9]+$'
         THEN 'CODIGO SIN NOMBRE' ELSE 'OK' END      AS estado,
    COUNT(*)::int                                    AS leads,
    MIN(w.created_at)::date                          AS desde,
    MAX(w.created_at)::date                          AS hasta
FROM public.bitrix_webhook_leads w
GROUP BY 1, 2, 3
ORDER BY 1, 3 DESC, 4 DESC;
