-- Ejecutar fuera de una transacción. CONCURRENTLY permite continuar las cargas.
-- La expresión del origen coincide con shared/origenIndicadores.js.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bwl_empresa_origen_deal_indicadores
ON public.bitrix_webhook_leads (
  empresa,
  UPPER(REGEXP_REPLACE(BTRIM(source), '[[:space:]]+', ' ', 'g')),
  BTRIM(bitrix_id::text)
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_jot_fecha_deal_indicadores
ON public.mestra_bitrix (
  public.parse_fecha_flex(j_fecha_registro_sistema::text), BTRIM(j_id_bitrix::text)
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb_activacion_fecha_deal_indicadores
ON public.mestra_bitrix (
  public.parse_fecha_flex(j_fecha_activacion_netlife::text), BTRIM(j_id_bitrix::text)
);

