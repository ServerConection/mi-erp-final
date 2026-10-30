-- 2026-10-27 — mestra_bitrix pasa de VISTA a VISTA MATERIALIZADA con índices.
-- Motivo: la vista (mestra_bitrix_ev + vw_ev_live_mestra) no admite índices;
-- cada consulta de Indicadores tardaba ~40 s y saturaba el CPU (4 CPU al 100%).
-- La vista original se conserva como public.mestra_bitrix_vista.
-- El refresco lo hace backend/src/jobs/refreshMestraBitrix.cron.js (cada 10 min).
--
-- REVERTIR (no borra datos de origen):
--   DROP MATERIALIZED VIEW public.mestra_bitrix;
--   ALTER VIEW public.mestra_bitrix_vista RENAME TO mestra_bitrix;

BEGIN;
ALTER VIEW public.mestra_bitrix RENAME TO mestra_bitrix_vista;
CREATE MATERIALIZED VIEW public.mestra_bitrix AS SELECT * FROM public.mestra_bitrix_vista;
COMMIT;

-- Índice único: permite REFRESH ... CONCURRENTLY (no bloquea lecturas).
CREATE UNIQUE INDEX IF NOT EXISTS uq_mb_id_unificado ON public.mestra_bitrix (id_unificado);

CREATE INDEX IF NOT EXISTS idx_mb_pf_b_creado ON public.mestra_bitrix (public.parse_fecha_flex(b_creado_el_fecha::text));
CREATE INDEX IF NOT EXISTS idx_mb_pf_j_registro ON public.mestra_bitrix (public.parse_fecha_flex(j_fecha_registro_sistema::text));
CREATE INDEX IF NOT EXISTS idx_mb_pf_j_activacion ON public.mestra_bitrix (public.parse_fecha_flex(j_fecha_activacion_netlife::text));
CREATE INDEX IF NOT EXISTS idx_mb_estado_pf_registro ON public.mestra_bitrix (j_netlife_estatus_real, public.parse_fecha_flex(j_fecha_registro_sistema::text));
CREATE INDEX IF NOT EXISTS idx_mb_b_id_text ON public.mestra_bitrix ((b_id::text));
CREATE INDEX IF NOT EXISTS idx_mb_j_id_bitrix_text ON public.mestra_bitrix ((j_id_bitrix::text));
CREATE INDEX IF NOT EXISTS idx_mb_b_etapa ON public.mestra_bitrix (b_etapa_de_la_negociacion);
CREATE INDEX IF NOT EXISTS idx_mb_j_estado_netlife ON public.mestra_bitrix (j_netlife_estatus_real);
CREATE INDEX IF NOT EXISTS idx_mb_persona_responsable ON public.mestra_bitrix (b_persona_responsable);
CREATE INDEX IF NOT EXISTS idx_mb_b_origen ON public.mestra_bitrix (b_origen);
ANALYZE public.mestra_bitrix;
