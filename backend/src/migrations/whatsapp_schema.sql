-- ============================================================
-- MÓDULO WHATSAPP — Migración ERP (idempotente)
-- Ejecutar: node src/migrations/run_whatsapp.js
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS bots (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(120) NOT NULL,
  description TEXT,
  flow_json   JSONB DEFAULT '{"nodes":[],"edges":[]}',
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lines (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           VARCHAR(120) NOT NULL,
  phone_number   VARCHAR(30),
  status         VARCHAR(20) DEFAULT 'disconnected',
  bot_id         UUID REFERENCES bots(id) ON DELETE SET NULL,
  proxy_enabled  BOOLEAN DEFAULT false,
  proxy_config   JSONB DEFAULT '{}',
  auth_path      VARCHAR(255),
  last_connected TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lid_mappings (
  lid_number  VARCHAR(40) PRIMARY KEY,
  real_number VARCHAR(40) NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wa_number  VARCHAR(30) NOT NULL,
  name       VARCHAR(120),
  email      VARCHAR(160),
  line_id    UUID REFERENCES lines(id) ON DELETE SET NULL,
  tags       TEXT[] DEFAULT '{}',
  metadata   JSONB DEFAULT '{}',
  is_blocked BOOLEAN DEFAULT false,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(wa_number, line_id)
);
CREATE INDEX IF NOT EXISTS idx_contacts_line ON contacts(line_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING GIN(tags);

CREATE TABLE IF NOT EXISTS contact_lists (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(160) NOT NULL,
  description TEXT,
  color       VARCHAR(16) DEFAULT '#22c55e',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_list_items (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id   UUID NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  wa_number VARCHAR(30) NOT NULL,
  name      VARCHAR(120),
  variables JSONB DEFAULT '{}',
  added_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(list_id, wa_number)
);
CREATE INDEX IF NOT EXISTS idx_list_items_list ON contact_list_items(list_id);

CREATE TABLE IF NOT EXISTS templates (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           VARCHAR(160) NOT NULL,
  category       VARCHAR(60) DEFAULT 'general',
  body           TEXT NOT NULL,
  media_url      VARCHAR(500),
  media_type     VARCHAR(20),
  media_filename VARCHAR(255),
  variables      TEXT[] DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             VARCHAR(160) NOT NULL,
  line_id          UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
  template_id      UUID REFERENCES templates(id) ON DELETE SET NULL,
  list_id          UUID REFERENCES contact_lists(id) ON DELETE SET NULL,
  body             TEXT,
  media_url        VARCHAR(500),
  media_type       VARCHAR(20),
  media_filename   VARCHAR(255),
  status           VARCHAR(20) DEFAULT 'draft',
  scheduled_at     TIMESTAMPTZ,
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  min_delay_secs   INT DEFAULT 8,
  max_delay_secs   INT DEFAULT 20,
  batch_size       INT DEFAULT 50,
  batch_pause_secs INT DEFAULT 120,
  total_recipients INT DEFAULT 0,
  sent_count       INT DEFAULT 0,
  failed_count     INT DEFAULT 0,
  delivered_count  INT DEFAULT 0,
  read_count       INT DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_line   ON campaigns(line_id);

CREATE TABLE IF NOT EXISTS campaign_messages (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  label        VARCHAR(80),
  message_text TEXT,
  media_url    VARCHAR(500),
  media_type   VARCHAR(20),
  media_caption TEXT,
  sort_order   INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_camp_msgs_campaign ON campaign_messages(campaign_id);

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  message_id   UUID REFERENCES campaign_messages(id) ON DELETE SET NULL,
  wa_number    VARCHAR(30) NOT NULL,
  name         VARCHAR(120),
  variables    JSONB DEFAULT '{}',
  status       VARCHAR(20) DEFAULT 'pending',
  wa_msg_id    VARCHAR(100),
  error        TEXT,
  sent_at      TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at      TIMESTAMPTZ,
  attempts     INT DEFAULT 0,
  UNIQUE(campaign_id, wa_number)
);
CREATE INDEX IF NOT EXISTS idx_recipients_campaign ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_recipients_status   ON campaign_recipients(status);

CREATE TABLE IF NOT EXISTS conversations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  line_id         UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  wa_number       VARCHAR(30) NOT NULL,
  bot_id          UUID REFERENCES bots(id) ON DELETE SET NULL,
  status          VARCHAR(20) DEFAULT 'active',
  current_node_id VARCHAR(100),
  context_data    JSONB DEFAULT '{}',
  unread_count    INT DEFAULT 0,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  last_msg_at     TIMESTAMPTZ DEFAULT NOW(),
  closed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_conversations_line    ON conversations(line_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status  ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_lastmsg ON conversations(last_msg_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  line_id         UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
  wa_number       VARCHAR(30) NOT NULL,
  direction       VARCHAR(10) NOT NULL CHECK (direction IN ('in','out')),
  type            VARCHAR(20) DEFAULT 'text',
  content         TEXT,
  media_url       VARCHAR(500),
  media_mime      VARCHAR(100),
  node_id         VARCHAR(100),
  node_type       VARCHAR(50),
  wa_msg_id       VARCHAR(100),
  campaign_id     UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  status          VARCHAR(20) DEFAULT 'sent',
  metadata        JSONB DEFAULT '{}',
  timestamp       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_line         ON messages(line_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp    ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_campaign     ON messages(campaign_id);

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  line_id      UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
  wa_number    VARCHAR(30) NOT NULL,
  body         TEXT NOT NULL,
  media_url    VARCHAR(500),
  media_type   VARCHAR(20),
  scheduled_at TIMESTAMPTZ NOT NULL,
  status       VARCHAR(20) DEFAULT 'pending',
  error        TEXT,
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_status ON scheduled_messages(status, scheduled_at);

-- Triggers updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN CREATE TRIGGER trg_bots_updated      BEFORE UPDATE ON bots          FOR EACH ROW EXECUTE FUNCTION update_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_lines_updated     BEFORE UPDATE ON lines         FOR EACH ROW EXECUTE FUNCTION update_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_lists_updated     BEFORE UPDATE ON contact_lists FOR EACH ROW EXECUTE FUNCTION update_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_templates_updated BEFORE UPDATE ON templates     FOR EACH ROW EXECUTE FUNCTION update_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_campaigns_updated BEFORE UPDATE ON campaigns     FOR EACH ROW EXECUTE FUNCTION update_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════
-- Mejoras 2026-07 (aditivas — seguras de re-ejecutar)
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
