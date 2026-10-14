CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS wa_presentation_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  message_text TEXT,
  media_url VARCHAR(500),
  media_type VARCHAR(20),
  media_filename VARCHAR(255),
  position INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wa_presentation_variant_content CHECK (
    NULLIF(BTRIM(message_text), '') IS NOT NULL OR NULLIF(BTRIM(media_url), '') IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_wa_presentation_variants_user
  ON wa_presentation_variants(user_id, is_active, position, created_at);

CREATE TABLE IF NOT EXISTS wa_presentation_rotation (
  user_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  next_index INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO wa_presentation_variants
  (user_id, name, message_text, media_url, media_type, media_filename, position, is_active)
SELECT p.user_id, 'Presentación 1', p.message_text, p.media_url, p.media_type,
       p.media_filename, 0, TRUE
FROM wa_presentations p
WHERE (NULLIF(BTRIM(p.message_text), '') IS NOT NULL OR NULLIF(BTRIM(p.media_url), '') IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM wa_presentation_variants v WHERE v.user_id = p.user_id);
