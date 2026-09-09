-- Outbox exclusivo de nuevos envíos manuales de Inbox. No importa historial.
CREATE TABLE IF NOT EXISTS inbox_bitrix_notes (
  id UUID PRIMARY KEY,
  deal_id VARCHAR(30) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting_send'
    CHECK (status IN ('waiting_send','pending','processing','retry','sent','failed')),
  wa_msg_id VARCHAR(100),
  bitrix_comment_id VARCHAR(30),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error VARCHAR(100)
);
CREATE INDEX IF NOT EXISTS idx_inbox_bitrix_notes_pending
  ON inbox_bitrix_notes (next_attempt_at, created_at)
  WHERE status IN ('pending','processing','retry');
CREATE INDEX IF NOT EXISTS idx_inbox_bitrix_notes_waiting
  ON inbox_bitrix_notes (created_at) WHERE status='waiting_send';
CREATE INDEX IF NOT EXISTS idx_inbox_bitrix_notes_receipt
  ON inbox_bitrix_notes (wa_msg_id) WHERE status IN ('waiting_send','failed');
