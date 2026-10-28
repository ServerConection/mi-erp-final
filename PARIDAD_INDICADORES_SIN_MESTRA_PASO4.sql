-- PASO 4 — SOLO LECTURA. ¿De qué tablas saca mestra_bitrix_ev los datos Bitrix (b_*)?
-- Necesario para replicar EXACTO el asesor (b_persona_responsable) de cada venta.
SELECT DISTINCT dep.relname AS mv, src_ns.nspname AS esquema, src.relname AS tabla_origen, src.relkind AS tipo
FROM pg_depend d
JOIN pg_rewrite r  ON r.oid = d.objid
JOIN pg_class dep  ON dep.oid = r.ev_class
JOIN pg_class src  ON src.oid = d.refobjid
JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
WHERE dep.relname IN ('mestra_bitrix_ev', 'vw_ev_live_mestra', 'mestra_bitrix_vista')
  AND src.oid <> dep.oid
ORDER BY 1, 3;
