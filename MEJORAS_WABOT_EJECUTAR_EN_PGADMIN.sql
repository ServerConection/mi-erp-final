-- ═══════════════════════════════════════════════════════════════
-- Mejoras WaBot Masivos 2026-07 — ejecutar en pgAdmin (Query Tool)
-- Es solo la parte NUEVA de whatsapp_schema.sql. Idempotente:
-- se puede ejecutar varias veces sin problema.
-- ═══════════════════════════════════════════════════════════════

-- Índice compuesto: el CampaignEngine busca "siguiente pendiente" por cada mensaje
CREATE INDEX IF NOT EXISTS idx_recipients_campaign_status ON campaign_recipients(campaign_id, status);

-- Índice para resolver acks de entrega/lectura por wa_msg_id
CREATE INDEX IF NOT EXISTS idx_recipients_wa_msg ON campaign_recipients(wa_msg_id);

-- Auditoría de eventos de campaña (permite métricas por variante / A-B real)
CREATE TABLE IF NOT EXISTS campaign_events (
  id           BIGSERIAL PRIMARY KEY,
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES campaign_recipients(id) ON DELETE SET NULL,
  variant_id   UUID REFERENCES campaign_messages(id) ON DELETE SET NULL,
  event        VARCHAR(20) NOT NULL,  -- sent | failed | delivered | read
  wa_number    VARCHAR(30),
  detail       TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_campaign_events_campaign ON campaign_events(campaign_id, event);
CREATE INDEX IF NOT EXISTS idx_campaign_events_variant  ON campaign_events(variant_id);

-- Verificación: debe devolver 1 fila con la tabla y 4 índices
SELECT 'campaign_events' AS objeto, COUNT(*) AS existe FROM information_schema.tables WHERE table_name='campaign_events'
UNION ALL
SELECT indexname, 1 FROM pg_indexes
WHERE indexname IN ('idx_recipients_campaign_status','idx_recipients_wa_msg','idx_campaign_events_campaign','idx_campaign_events_variant');
