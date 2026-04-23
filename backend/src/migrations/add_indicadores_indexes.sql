-- ============================================================
-- MIGRACIÓN: Índices de rendimiento — Módulo Indicadores ERP
-- ============================================================
-- Propósito: reducir el tiempo de respuesta de los endpoints
--   /api/indicadores/dashboard            (~1-1.5 min → objetivo <10 seg)
--   /api/indicadores-velsa/dashboard      (~1-1.5 min → objetivo <10 seg)
--
-- Cómo ejecutar (desde psql o DBeaver):
--   psql -U <user> -d <dbname> -f add_indicadores_indexes.sql
--
-- Notas importantes:
--   • CONCURRENTLY permite crear el índice sin bloquear la tabla en producción.
--   • IF NOT EXISTS evita error si ya existe el índice.
--   • Los índices funcionales ((col::date)) son usados por PostgreSQL cuando
--     la query hace: col::date BETWEEN $1 AND $2
--   • Ejecutar en horario de bajo tráfico si la tabla es grande (>500k filas).
--   • Verificar con EXPLAIN ANALYZE (ejemplos al final del archivo).
-- ============================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 1: TABLA public.mestra_bitrix  (módulo Novonet)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1A. Índice funcional en fecha de creación CRM (filtro de rango principal)
--     Usado en: WHERE b_creado_el_fecha::date BETWEEN $1 AND $2
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_b_creado_date
    ON public.mestra_bitrix ((b_creado_el_fecha::date))
    WHERE b_creado_el_fecha IS NOT NULL
      AND b_creado_el_fecha::text ~ '^\d{4}-\d{2}-\d{2}';

-- 1B. Índice funcional en fecha de registro Jotform (segundo filtro más frecuente)
--     Usado en: WHERE j_fecha_registro_sistema::date BETWEEN $1 AND $2
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_j_fecha_registro_date
    ON public.mestra_bitrix ((j_fecha_registro_sistema::date))
    WHERE j_fecha_registro_sistema IS NOT NULL
      AND j_fecha_registro_sistema::text ~ '^\d{4}-\d{2}-\d{2}';

-- 1C. Índice funcional en fecha de cierre CRM (usado en backlog + monitoreo)
--     Usado en: WHERE b_cerrado::date BETWEEN $1 AND $2
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_b_cerrado_date
    ON public.mestra_bitrix ((b_cerrado::date))
    WHERE b_cerrado IS NOT NULL
      AND b_cerrado::text ~ '^\d{4}-\d{2}-\d{2}';

-- 1D. Índice funcional en fecha de activación Netlife (usado en queryBacklog)
--     Usado en: WHERE j_fecha_activacion_netlife::date >= $1 AND ... <= $2
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_j_fecha_activacion_date
    ON public.mestra_bitrix ((j_fecha_activacion_netlife::date))
    WHERE j_fecha_activacion_netlife IS NOT NULL
      AND j_fecha_activacion_netlife::text ~ '^\d{4}-\d{2}-\d{2}';

-- 1E. Índice en etapa de negociación CRM (filtro IN + GROUP BY)
--     Usado en: WHERE b_etapa_de_la_negociacion IN (...) / GROUP BY
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_b_etapa
    ON public.mestra_bitrix (b_etapa_de_la_negociacion);

-- 1F. Índice en estado Netlife (filtro + GROUP BY)
--     Usado en: WHERE j_netlife_estatus_real = 'ACTIVO' / IN / GROUP BY
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_j_estado_netlife
    ON public.mestra_bitrix (j_netlife_estatus_real);

-- 1G. Índice en asesor/responsable (filtro ILIKE + JOIN LATERAL)
--     Para ILIKE con wildcard inicial (%texto%) se recomienda pg_trgm (ver nota).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_persona_responsable
    ON public.mestra_bitrix (b_persona_responsable);

-- 1H. Índice en estado de regularización (filtro frecuente)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_j_estatus_regularizacion
    ON public.mestra_bitrix (j_estatus_regularizacion);

-- 1I. Índice en origen/canal de pauta (filtro IN por canal)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_b_origen
    ON public.mestra_bitrix (b_origen);

-- 1J. Índice compuesto: (estado_netlife, fecha_jot) — patrón más frecuente en KPIs
--     Cubre: WHERE j_netlife_estatus_real = 'ACTIVO' AND j_fecha_registro_sistema::date BETWEEN ...
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_estado_fecha_jot
    ON public.mestra_bitrix (j_netlife_estatus_real, (j_fecha_registro_sistema::date))
    WHERE j_fecha_registro_sistema IS NOT NULL
      AND j_fecha_registro_sistema::text ~ '^\d{4}-\d{2}-\d{2}';


-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 2: TABLA public.empleados  (JOIN LATERAL en Novonet)
-- ─────────────────────────────────────────────────────────────────────────────

-- 2A. El JOIN LATERAL busca empleados por nombre_completo → índice clave
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_emp_nombre_completo
    ON public.empleados (nombre_completo);

-- 2B. Índice compuesto (nombre + codigo) para el ORDER BY dentro del LATERAL
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_emp_nombre_codigo
    ON public.empleados (nombre_completo, codigo);


-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 3: TABLA public.velsa_netlife_maestra_cons  (módulo Velsa)
-- ─────────────────────────────────────────────────────────────────────────────

-- 3A. Índice funcional en fecha de creación GHL (primer filtro principal)
--     Usado en: WHERE t1_hgl_created_at_fecha::date BETWEEN $1 AND $2
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vn_t1_hgl_created_date
    ON public.velsa_netlife_maestra_cons ((t1_hgl_created_at_fecha::date))
    WHERE t1_hgl_created_at_fecha IS NOT NULL;

-- 3B. Índice funcional en fecha Jotform Velsa (segundo filtro principal)
--     Usado en: WHERE t2_jot_created_at_fecha::date BETWEEN $1 AND $2
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vn_t2_jot_created_date
    ON public.velsa_netlife_maestra_cons ((t2_jot_created_at_fecha::date))
    WHERE t2_jot_created_at_fecha IS NOT NULL;

-- 3C. Índice en etapa CRM Velsa (filtro IN + GROUP BY)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vn_t1_pipeline_stage
    ON public.velsa_netlife_maestra_cons (t1_pipeline_stage_id);

-- 3D. Índice en estado de venta Netlife Velsa
--     Usado en: WHERE t2_estado_venta_netlife = 'ACTIVO'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vn_t2_estado_venta
    ON public.velsa_netlife_maestra_cons (t2_estado_venta_netlife);

-- 3E. Índice en asesor asignado Velsa
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vn_t1_assigned_to
    ON public.velsa_netlife_maestra_cons (t1_assigned_to);

-- 3F. Índice en supervisor asignado Velsa
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vn_supervisor_asignado
    ON public.velsa_netlife_maestra_cons (supervisor_asignado);

-- 3G. Índice en fecha activación telcos (usado en queryBacklog Velsa)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vn_t2_fecha_activacion
    ON public.velsa_netlife_maestra_cons ((t2_fecha_activacion_telcos::date))
    WHERE t2_fecha_activacion_telcos IS NOT NULL;

-- 3H. Índice en regularizado (filtro frecuente)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vn_t2_regularizado
    ON public.velsa_netlife_maestra_cons (t2_regularizado);

-- 3I. Índice compuesto: (estado, fecha_jot) — patrón más frecuente en KPIs Velsa
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vn_estado_fecha_jot
    ON public.velsa_netlife_maestra_cons (t2_estado_venta_netlife, (t2_jot_created_at_fecha::date))
    WHERE t2_jot_created_at_fecha IS NOT NULL;

-- 3J. Índice en canal/tags de campaña Velsa
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vn_t1_relation_tags
    ON public.velsa_netlife_maestra_cons (t1_relation_tags);


-- ============================================================
-- NOTA SOBRE ILIKE CON WILDCARD INICIAL (%texto%)
-- ============================================================
-- Los filtros tipo: WHERE col ILIKE '%Juan%'
-- NO pueden usar un índice B-tree estándar.
-- Para habilitarlo, instalar pg_trgm y crear índice GIN:
--
--   CREATE EXTENSION IF NOT EXISTS pg_trgm;
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_persona_trgm
--       ON public.mestra_bitrix USING gin (b_persona_responsable gin_trgm_ops);
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vn_assigned_trgm
--       ON public.velsa_netlife_maestra_cons USING gin (t1_assigned_to gin_trgm_ops);
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vn_supervisor_trgm
--       ON public.velsa_netlife_maestra_cons USING gin (supervisor_asignado gin_trgm_ops);
--
-- Verificar que pg_trgm está disponible:
--   SELECT * FROM pg_available_extensions WHERE name = 'pg_trgm';
-- ============================================================


-- ============================================================
-- VERIFICACIÓN CON EXPLAIN ANALYZE
-- ============================================================
-- Después de crear los índices, verificar que PostgreSQL los usa:
--
-- 1. Query KPI por fecha (debe mostrar "Index Scan" o "Bitmap Index Scan"):
/*
EXPLAIN ANALYZE
SELECT COUNT(*) FILTER (WHERE j_fecha_registro_sistema::date BETWEEN '2026-04-01' AND '2026-04-22')
FROM public.mestra_bitrix;
*/
--
-- 2. Query con etapa (debe mostrar uso de idx_mb_b_etapa):
/*
EXPLAIN ANALYZE
SELECT COUNT(*), b_etapa_de_la_negociacion
FROM public.mestra_bitrix
WHERE b_etapa_de_la_negociacion IN ('VENTA SUBIDA','CONTACTO NUEVO')
GROUP BY b_etapa_de_la_negociacion;
*/
--
-- 3. Query Velsa por fecha:
/*
EXPLAIN ANALYZE
SELECT COUNT(*) FILTER (WHERE t2_jot_created_at_fecha::date BETWEEN '2026-04-01' AND '2026-04-22')
FROM public.velsa_netlife_maestra_cons;
*/
--
-- 4. Listar todos los índices creados:
/*
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('mestra_bitrix', 'velsa_netlife_maestra_cons', 'empleados')
  AND schemaname = 'public'
ORDER BY tablename, indexname;
*/
-- ============================================================
