-- 2026-10-29 — Índice para buscar chats por número.
-- conversations.wa_number no tenía índice: cada búsqueda de chat por número
-- (mensajes entrantes, fusión de LID al arrancar WABOT, Inbox) recorría toda
-- la tabla. Ejecutar UNA vez en pgAdmin, sola (CONCURRENTLY no bloquea la
-- tabla y no puede ir dentro de una transacción).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_wa_number_line
  ON public.conversations (wa_number, line_id);
