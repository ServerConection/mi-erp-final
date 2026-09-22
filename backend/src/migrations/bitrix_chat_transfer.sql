-- ============================================================================
-- BOT DE TRANSFERENCIA DE CHAT (Canal Abierto -> Responsable del Trato/Lead)
-- ============================================================================
-- Migración APARTE y AISLADA de wabot_bitrix.sql a propósito: esta app local
-- de Bitrix24 ("Chat Transfer Bot") es un desarrollo completamente separado
-- de WABOT-BITRIX y no debe compartir tabla ni tokens con él.
-- Ver src/services/bitrixChatTransferApp.service.js
-- ============================================================================

CREATE TABLE IF NOT EXISTS bitrix_chat_transfer_oauth_tokens (
  portal        TEXT        PRIMARY KEY,
  access_token  TEXT        NOT NULL,
  refresh_token TEXT        NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  member_id     TEXT,
  scope         TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
