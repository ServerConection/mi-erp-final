-- ============================================================================
-- fix_origen_etapa_jotform_deal_id_20260914.sql
-- ----------------------------------------------------------------------------
-- Soporte de índices para el fix de "ORIGEN no cascadea a los registros
-- Jotform" (Indicadores NOVONET y VELSA).
--
-- QUÉ CAMBIÓ EN EL CÓDIGO (backend/src/controllers/*.js), NO en la BD:
--   - NOVONET (indicadores.controller.js): el detalle "DETALLE BASE JOTFORM
--     (NETLIFE)" y el filtro de canal/origen ahora resuelven ORIGEN y ETAPA
--     por Deal ID (mb.j_id_bitrix) contra public.vw_bitrix_novonet (la vista
--     ya existente sobre bitrix_webhook_leads, en tiempo real), en vez de leer
--     directo de mestra_bitrix (tabla vieja de sync por lotes, documentada
--     como incompleta).
--   - VELSA (indicadoresVelsaMaterialized.controller.js): el detalle "Detalle
--     base Jotform Velsa" y el filtro de origen ahora resuelven ORIGEN y
--     ETAPA por Deal ID (mv.id_crm / mv.id_jotform) contra
--     public.bitrix_webhook_leads (empresa='velsa'), en vez de depender solo
--     de mv.origen / mv.etapa_crm (que vienen de negociaciones_reporteria,
--     sync por lotes).
--   - Deliberadamente NO se tocó la vista materializada mv_indicadores_velsa_
--     completo: recrearla requiere DROP ... CASCADE y esa MV tiene vistas
--     dependientes (ver enable_mv_velsa_concurrent_refresh.sql) que un CASCADE
--     borraría. El fix se hizo 100% a nivel de consulta (LEFT JOIN adicional),
--     así que basta con reiniciar/redeployar el backend — NO hace falta
--     recrear ninguna vista ni materializada.
--
-- QUÉ SÍ HACE FALTA CORRER (este archivo): índices de soporte para que las
-- nuevas condiciones (JOIN/EXISTS por Deal ID contra bitrix_webhook_leads, y
-- filtro por origen) no hagan sequential scan. Todo con IF NOT EXISTS: es
-- seguro correrlo más de una vez y no bloquea (no son CONCURRENTLY porque
-- bitrix_webhook_leads es una tabla chica de leads, no la MV).
-- ============================================================================

-- Ya existe idx_bwl_bitrix_id (bitrix_id) y la UNIQUE (empresa, bitrix_id) —
-- cubren el JOIN/EXISTS por Deal ID. Lo que faltaba es un índice sobre
-- `source` (el origen ya normalizado) para el filtro IN (...):
CREATE INDEX IF NOT EXISTS idx_bwl_source
    ON public.bitrix_webhook_leads (source);

-- Combinado con empresa, para las consultas que ya filtran por las dos
-- columnas juntas (ej. el catálogo de orígenes de Velsa, qOrigenes):
CREATE INDEX IF NOT EXISTS idx_bwl_empresa_source
    ON public.bitrix_webhook_leads (empresa, source);

-- Fallback opcional: sigue habiendo lugares que leen mb.b_origen directo de
-- mestra_bitrix (como respaldo cuando el deal no está en el webhook). No
-- tenía ningún índice sobre esa columna.
CREATE INDEX IF NOT EXISTS idx_mb_b_origen
    ON public.mestra_bitrix (b_origen);

-- ----------------------------------------------------------------------------
-- Verificación rápida después de aplicar (opcional): confirma que los índices
-- quedaron creados.
-- ----------------------------------------------------------------------------
-- SELECT indexname FROM pg_indexes
--  WHERE tablename IN ('bitrix_webhook_leads', 'mestra_bitrix')
--    AND indexname IN ('idx_bwl_source', 'idx_bwl_empresa_source', 'idx_mb_b_origen');
