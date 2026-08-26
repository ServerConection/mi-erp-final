const fechaWebhookExpr = (alias = 'w') => `CASE
  WHEN NULLIF(BTRIM(${alias}.iniciado_el), '') ~ '^\\d{2}/\\d{2}/\\d{4}$'
    THEN TO_DATE(BTRIM(${alias}.iniciado_el), 'DD/MM/YYYY')
  WHEN NULLIF(BTRIM(${alias}.iniciado_el), '') ~ '^\\d{4}-\\d{2}-\\d{2}'
    THEN LEFT(BTRIM(${alias}.iniciado_el), 10)::date
  ELSE (${alias}.created_at AT TIME ZONE 'America/Guayaquil')::date
END`;

const etapaWebhookExpr = (alias = 'w') =>
  `UPPER(BTRIM(COALESCE(NULLIF(${alias}.etapa_bitrix, ''), ${alias}.etapa, '')))`;

const horaWebhookExpr = (alias = 'w') =>
  `EXTRACT(HOUR FROM (${alias}.created_at AT TIME ZONE 'America/Guayaquil'))::int`;

module.exports = { fechaWebhookExpr, etapaWebhookExpr, horaWebhookExpr };
