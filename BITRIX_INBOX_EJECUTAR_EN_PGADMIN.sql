-- Integración Bitrix en Inbox — ejecutar en pgAdmin (Query Tool)
-- Idempotente: se puede correr varias veces sin problema.

-- ID de negociación (deal) de Bitrix asociado a cada conversación
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS bitrix_deal_id VARCHAR(30);
CREATE INDEX IF NOT EXISTS idx_conversations_bitrix ON conversations(bitrix_deal_id);

-- Verificación: debe listar la columna
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'conversations' AND column_name = 'bitrix_deal_id';
