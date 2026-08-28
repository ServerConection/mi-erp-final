// FIX (2026-08-28): antes esta expresion priorizaba `iniciado_el` (placeholder
// de Bitrix) y solo caia a created_at como ultimo recurso. `iniciado_el` NO es
// la fecha de creacion del lead: el UPSERT del webhook lo sobreescribe en cada
// evento y ademas viene desfasado (9803 filas de novonet con iniciado_el > la
// fecha real de created_at, a todas horas del dia). Eso inflaba el conteo del
// dia en curso: el 2026-08-28 el endpoint devolvia 74 leads cuando solo habia
// 5 creados ese dia — los otros 71 eran del 27 con iniciado_el = 28/08/2026.
// created_at es confiable incluso en las filas cargadas por backfill (ver
// BACKFILL_BITRIX_NOVONET_20260815.sql: se cargo con la fecha REAL de Bitrix).
const fechaWebhookExpr = (alias = 'w') =>
  `(${alias}.created_at AT TIME ZONE 'America/Guayaquil')::date`;

const etapaWebhookExpr = (alias = 'w') =>
  `UPPER(BTRIM(COALESCE(NULLIF(${alias}.etapa_bitrix, ''), ${alias}.etapa, '')))`;

const horaWebhookExpr = (alias = 'w') =>
  `EXTRACT(HOUR FROM (${alias}.created_at AT TIME ZONE 'America/Guayaquil'))::int`;

module.exports = { fechaWebhookExpr, etapaWebhookExpr, horaWebhookExpr };
