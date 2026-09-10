-- ============================================================================
-- WABOT-BITRIX — migración base (idempotente, se puede correr varias veces)
-- ============================================================================
-- Cubre dos cosas:
--   1. Opción B: sacar el estado de sesión de Baileys del disco y ponerlo en
--      Postgres, para que erp-wabot deje de estar clavado en numInstances:1.
--   2. El conector de Canales Abiertos de Bitrix24 (OAuth + mapeo de chats).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. Estado de sesión de Baileys en Postgres ──────────────────────────────
-- Reemplaza a useMultiFileAuthState (carpeta en /var/data/auth_sessions).
-- Una fila por clave: 'creds' + una por cada clave de Signal.
-- data va como TEXT, no JSONB: el contenido lleva Buffers serializados con
-- BufferJSON de Baileys y jsonb los desarmaría.
CREATE TABLE IF NOT EXISTS wa_auth_state (
  line_id    UUID        NOT NULL,
  key_id     TEXT        NOT NULL,
  data       TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (line_id, key_id)
);
CREATE INDEX IF NOT EXISTS idx_wa_auth_state_line ON wa_auth_state(line_id);

-- ── 2. Lease por línea (leader election) ────────────────────────────────────
-- Con el estado en Postgres varias instancias PODRÍAN levantar la misma
-- sesión a la vez, y dos sockets con las mismas credenciales es justo lo que
-- WhatsApp lee como robo de sesión. Este lease garantiza un solo dueño:
-- se renueva por heartbeat y se puede robar solo si venció.
CREATE TABLE IF NOT EXISTS wa_line_locks (
  line_id    UUID        PRIMARY KEY,
  owner      TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_line_locks_exp ON wa_line_locks(expires_at);

-- ── 3. OAuth de la aplicación local de Bitrix24 ─────────────────────────────
-- imconnector.* NO funciona con webhooks entrantes: devuelve WRONG_AUTH_TYPE
-- ("Application context required"). Hace falta app local con OAuth.
CREATE TABLE IF NOT EXISTS bitrix_oauth_tokens (
  portal        TEXT        PRIMARY KEY,
  access_token  TEXT        NOT NULL,
  refresh_token TEXT        NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  member_id     TEXT,
  scope         TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Línea ↔ canal abierto ↔ campaña ──────────────────────────────────────
-- open_line_id: a qué canal abierto de Bitrix entrega esta línea.
--   OJO: 30 líneas de WhatsApp NO necesitan 30 canales abiertos. Un mismo
--   conector se activa en varios canales, y todas las líneas pueden entregar
--   al mismo canal. Se usan canales distintos solo cuando querés colas o
--   reglas de asignación distintas (ej. ARTS vs VIDIKA).
-- origen: cruza con novonet_lineas_canal para saber de qué campaña vino.
ALTER TABLE lines ADD COLUMN IF NOT EXISTS open_line_id INT;
ALTER TABLE lines ADD COLUMN IF NOT EXISTS origen       VARCHAR(160);
ALTER TABLE lines ADD COLUMN IF NOT EXISTS shard        SMALLINT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_lines_shard  ON lines(shard);
CREATE INDEX IF NOT EXISTS idx_lines_origen ON lines(origen);

-- ── 5. Mapeo de conversación ↔ chat de Bitrix ───────────────────────────────
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS bitrix_chat_id  VARCHAR(60);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS bitrix_deal_id  VARCHAR(30);
CREATE INDEX IF NOT EXISTS idx_conv_bitrix_chat ON conversations(bitrix_chat_id);
CREATE INDEX IF NOT EXISTS idx_conv_bitrix_deal ON conversations(bitrix_deal_id);

-- Correlación de ids: el id que le dimos a Bitrix vs el id de WhatsApp.
-- Sin esto no se puede marcar entregado ni evitar reenviar en un reintento.
CREATE TABLE IF NOT EXISTS bitrix_message_map (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  wa_msg_id       VARCHAR(100),
  bitrix_msg_id   VARCHAR(100),
  direction       VARCHAR(10) NOT NULL CHECK (direction IN ('in','out')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_bitrix_map_wa  ON bitrix_message_map(wa_msg_id)     WHERE wa_msg_id IS NOT NULL;
CREATE INDEX        IF NOT EXISTS idx_bitrix_map_bx ON bitrix_message_map(bitrix_msg_id);

-- ── Verificación ────────────────────────────────────────────────────────────
SELECT 'wa_auth_state'       AS tabla, COUNT(*) FROM wa_auth_state
UNION ALL SELECT 'wa_line_locks',       COUNT(*) FROM wa_line_locks
UNION ALL SELECT 'bitrix_oauth_tokens', COUNT(*) FROM bitrix_oauth_tokens
UNION ALL SELECT 'bitrix_message_map',  COUNT(*) FROM bitrix_message_map;
