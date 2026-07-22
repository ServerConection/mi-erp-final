-- ============================================================
-- MIGRACIÓN: FIX DEFINITIVO — Timeout del Dashboard de Indicadores
-- Fecha: 2026-07-22
-- ============================================================
-- INSTRUCCIONES PGADMIN (importante):
--   • PARTE A: seleccionar todo el bloque A y ejecutar con F5.
--   • PARTE B: cada CREATE INDEX se ejecuta UNO POR UNO
--     (seleccionas/subrayas UNA línea CREATE INDEX y presionas F5,
--      esperas a que termine, y pasas al siguiente).
--     Motivo: CREATE INDEX CONCURRENTLY no puede correr dentro de
--     una transacción, y pgAdmin envuelve los scripts multi-statement
--     en una sola transacción.
--   • PARTE C: seleccionar el bloque y F5.
-- ============================================================


-- ╔═══════════════════════════════════════════════════════════╗
-- ║ PARTE A — Ejecutar TODO este bloque junto (selección + F5) ║
-- ╚═══════════════════════════════════════════════════════════╝

-- A1. Función IMMUTABLE de parseo de fechas (misma lógica que
--     parseFecha() del backend; NULL ante datos basura)
CREATE OR REPLACE FUNCTION public.parse_fecha_flex(valor text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
BEGIN
    IF valor IS NULL OR TRIM(valor) = '' THEN
        RETURN NULL;
    END IF;
    IF valor ~ '^\d{4}-\d{2}-\d{2}' THEN
        RETURN SUBSTRING(valor FROM 1 FOR 10)::date;
    END IF;
    RETURN TO_DATE(SUBSTRING(valor FROM 5 FOR 11), 'Mon DD YYYY');
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- A2. Extensión para búsquedas ILIKE '%texto%'
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- A3. Fix notificaciones_alertas ("value too long for varchar(200)")
ALTER TABLE IF EXISTS public.notificaciones_alertas
    ALTER COLUMN supervisor TYPE text,
    ALTER COLUMN asesor     TYPE text,
    ALTER COLUMN condicion  TYPE text;

-- A4. Verificación rápida de la función (debe devolver 3 filas con fechas y NULL)
SELECT public.parse_fecha_flex('2026-07-22 10:00:00')      AS iso,
       public.parse_fecha_flex('Mon Jul 22 2026 10:00:00') AS texto,
       public.parse_fecha_flex('basura')                   AS invalido;

-- ══ FIN PARTE A ══


-- ╔═══════════════════════════════════════════════════════════╗
-- ║ PARTE B — Ejecutar UNA LÍNEA A LA VEZ (selección + F5)     ║
-- ║ Espera a que cada una termine antes de la siguiente.       ║
-- ║ Pueden tardar 1-3 min c/u. NO bloquean la tabla.            ║
-- ╚═══════════════════════════════════════════════════════════╝

-- B1. Fecha creación CRM (filtro principal del dashboard)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_pf_b_creado ON public.mestra_bitrix (public.parse_fecha_flex(b_creado_el_fecha::text));

-- B2. Fecha registro Jotform (el filtro más usado de todos)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_pf_j_registro ON public.mestra_bitrix (public.parse_fecha_flex(j_fecha_registro_sistema::text));

-- B3. Fecha activación Netlife (backlog + activaciones por día)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_pf_j_activacion ON public.mestra_bitrix (public.parse_fecha_flex(j_fecha_activacion_netlife::text));

-- B4. Compuesto (estado, fecha registro) — patrón "ACTIVO en el rango"
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_estado_pf_registro ON public.mestra_bitrix (j_netlife_estatus_real, public.parse_fecha_flex(j_fecha_registro_sistema::text));

-- B5. Self-join ventas del día (lado CRM)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_b_id_text ON public.mestra_bitrix ((b_id::text));

-- B6. Self-join ventas del día (lado Jotform)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_j_id_bitrix_text ON public.mestra_bitrix ((j_id_bitrix::text));

-- B7. Etapa de negociación
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_b_etapa ON public.mestra_bitrix (b_etapa_de_la_negociacion);

-- B8. Estado Netlife
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_j_estado_netlife ON public.mestra_bitrix (j_netlife_estatus_real);

-- B9. Asesor/responsable
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_persona_responsable ON public.mestra_bitrix (b_persona_responsable);

-- B10. Origen/canal
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_b_origen ON public.mestra_bitrix (b_origen);

-- B11. JOIN LATERAL a empleados
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_emp_nombre_codigo ON public.empleados (nombre_completo, codigo);

-- B12. Filtros ILIKE '%asesor%'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_persona_trgm ON public.mestra_bitrix USING gin (b_persona_responsable gin_trgm_ops);

-- ══ FIN PARTE B ══


-- ╔═══════════════════════════════════════════════════════════╗
-- ║ PARTE C — Ejecutar este bloque junto (selección + F5)      ║
-- ╚═══════════════════════════════════════════════════════════╝

-- C1. Refrescar estadísticas del planner
ANALYZE public.mestra_bitrix;
ANALYZE public.empleados;

-- C2. Verificación final: deben aparecer los 12 índices nuevos
SELECT indexname FROM pg_indexes
WHERE tablename IN ('mestra_bitrix', 'empleados')
  AND (indexname LIKE 'idx_mb_%' OR indexname LIKE 'idx_emp_%')
ORDER BY indexname;

-- C3. El planner debe usar el índice (buscar "Bitmap Index Scan" o "Index Scan"
--     en el resultado, NO "Seq Scan"):
EXPLAIN ANALYZE
SELECT COUNT(*) FROM public.mestra_bitrix
WHERE public.parse_fecha_flex(j_fecha_registro_sistema::text)
      BETWEEN '2026-07-01' AND '2026-07-22';

-- ══ FIN ══
