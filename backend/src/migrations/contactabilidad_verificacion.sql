-- =============================================================================
-- CONTACTABILIDAD BOT AUDITOR — Verificación no destructiva para pgAdmin
-- Ejecutar DESPUÉS de contactabilidad.sql sobre la misma base bddgeneral.
-- =============================================================================

-- 1. Deben aparecer exactamente las siete tablas del módulo.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'contactabilidad_config',
    'contactabilidad_leads',
    'contactabilidad_mensajes',
    'contactabilidad_etapas',
    'contactabilidad_snapshots',
    'contactabilidad_sync_runs',
    'contactabilidad_alertas'
  )
ORDER BY table_name;

-- 2. Resultado esperado: 15 | 30 | 30 | 2026-07-01.
SELECT id,
       intervalo_ingesta_minutos,
       intervalo_tablero_minutos,
       alerta_asesor_minutos,
       fecha_desde,
       actualizado_at,
       actualizado_por
FROM contactabilidad_config
WHERE id = 1;

-- 3. Índices creados para filtros, deduplicación y estados abiertos.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename LIKE 'contactabilidad_%'
ORDER BY tablename, indexname;

-- 4. Claves primarias, foráneas, CHECK y restricciones únicas.
SELECT conrelid::regclass AS tabla,
       conname,
       contype,
       pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND conrelid::regclass::text LIKE 'contactabilidad_%'
ORDER BY conrelid::regclass::text, conname;

-- 5. Antes de implementar el recolector, todos deben valer cero.
SELECT
  (SELECT COUNT(*) FROM contactabilidad_leads) AS leads,
  (SELECT COUNT(*) FROM contactabilidad_mensajes) AS mensajes,
  (SELECT COUNT(*) FROM contactabilidad_etapas) AS etapas,
  (SELECT COUNT(*) FROM contactabilidad_snapshots) AS snapshots,
  (SELECT COUNT(*) FROM contactabilidad_sync_runs) AS sincronizaciones,
  (SELECT COUNT(*) FROM contactabilidad_alertas) AS alertas;

