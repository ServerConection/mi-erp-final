-- Cola transaccional para avisos automáticos al ENTRAR a la etapa ATC.
-- Idempotente: puede ejecutarse en cada arranque de Ingesta y WaBot.
CREATE SEQUENCE IF NOT EXISTS public.atc_notification_rotation_seq START 1;

CREATE TABLE IF NOT EXISTS public.atc_notification_templates (
  id          BIGSERIAL PRIMARY KEY,
  template_key VARCHAR(40) NOT NULL UNIQUE,
  body        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT atc_template_body_not_blank CHECK (BTRIM(body) <> ''),
  CONSTRAINT atc_template_sort_positive CHECK (sort_order > 0)
);

CREATE TABLE IF NOT EXISTS public.atc_notification_queue (
  id                    BIGSERIAL PRIMARY KEY,
  empresa               VARCHAR(20) NOT NULL,
  bitrix_id             VARCHAR(50) NOT NULL,
  transition_number     INTEGER NOT NULL,
  previous_stage        VARCHAR(80),
  phone_raw             VARCHAR(80),
  phone_normalized      VARCHAR(20),
  template_id           BIGINT NOT NULL REFERENCES public.atc_notification_templates(id),
  template_key          VARCHAR(40) NOT NULL,
  message_body          TEXT NOT NULL,
  -- Sin FK intencionalmente: Ingesta puede arrancar antes de que el módulo
  -- WhatsApp cree `lines`. El worker valida la línea antes de cada envío.
  line_id               UUID,
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts              INTEGER NOT NULL DEFAULT 0,
  next_attempt_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_started_at TIMESTAMPTZ,
  sent_at               TIMESTAMPTZ,
  wa_message_id         VARCHAR(160),
  last_error            VARCHAR(500),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT atc_queue_empresa CHECK (empresa IN ('novonet', 'velsa')),
  CONSTRAINT atc_queue_status CHECK (status IN ('pending', 'processing', 'retry', 'sent', 'failed')),
  CONSTRAINT atc_queue_transition_positive CHECK (transition_number > 0),
  CONSTRAINT atc_queue_unique_transition UNIQUE (empresa, bitrix_id, transition_number)
);

CREATE INDEX IF NOT EXISTS idx_atc_notification_queue_pending
  ON public.atc_notification_queue (next_attempt_at, id)
  WHERE status IN ('pending', 'retry');

CREATE INDEX IF NOT EXISTS idx_atc_notification_queue_deal
  ON public.atc_notification_queue (empresa, bitrix_id, created_at DESC);

