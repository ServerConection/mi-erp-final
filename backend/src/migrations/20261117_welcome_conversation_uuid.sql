-- El Inbox identifica sus conversaciones con UUID. La columna Welcome fue
-- creada originalmente como bigint y no podía almacenar esos identificadores.
DO $$
DECLARE
  tipo_actual text;
BEGIN
  SELECT data_type INTO tipo_actual
  FROM information_schema.columns
  WHERE table_schema='public'
    AND table_name='welcome_notifications'
    AND column_name='conversation_id';

  IF tipo_actual IS NOT NULL AND tipo_actual <> 'uuid' THEN
    ALTER TABLE public.welcome_notifications
      ALTER COLUMN conversation_id TYPE uuid
      USING (
        CASE
          WHEN conversation_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN conversation_id::text::uuid
          ELSE NULL
        END
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_welcome_notifications_conversation
  ON public.welcome_notifications(conversation_id)
  WHERE conversation_id IS NOT NULL;
