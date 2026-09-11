-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: SSO del embed "WABOT Inbox" (pestaña WABOT dentro del Deal)
-- ═══════════════════════════════════════════════════════════════════════════
-- Ejecutar UNA vez contra la base de datos del ERP (la misma donde vive la
-- tabla "usuarios"). Crea la tabla de códigos de un solo uso que usa el
-- auto-login: nunca se pasa el JWT real por la URL, solo este código
-- (de 60 segundos de vida) que el frontend canjea por el JWT en
-- POST /api/auth/bitrix-exchange.
--
-- Es seguro correrlo más de una vez (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS bitrix_sso_codes (
  id          BIGSERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  used        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

-- Acelera el canje (búsqueda por code) y la limpieza de vencidos.
CREATE INDEX IF NOT EXISTS idx_bitrix_sso_codes_expires ON bitrix_sso_codes(expires_at);

-- Opcional pero recomendado: limpieza automática de códigos viejos, para que
-- la tabla no crezca indefinidamente (cada apertura de la pestaña WABOT crea
-- una fila). Se puede correr a mano de vez en cuando, o dejarlo así si el
-- volumen es bajo:
--   DELETE FROM bitrix_sso_codes WHERE expires_at < NOW() - INTERVAL '1 day';
