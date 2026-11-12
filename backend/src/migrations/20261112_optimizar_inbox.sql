-- Evita ordenar todos los mensajes al obtener el último de cada chat.
-- Es idempotente y seguro para ejecutar más de una vez.
DROP INDEX IF EXISTS public.idx_messages_conv_ts_inbox;
CREATE INDEX idx_messages_conv_ts_inbox
  ON public.messages(conversation_id, timestamp DESC);

ANALYZE public.messages;
