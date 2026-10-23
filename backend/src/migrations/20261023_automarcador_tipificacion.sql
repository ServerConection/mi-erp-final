-- Automarcador Bitrix: tipificación de llamadas (2026-10-23).
-- El backend lo aplica solo al arrancar; queda como referencia para pgAdmin.
ALTER TABLE automarcador_bx_items ADD COLUMN IF NOT EXISTS tipificacion VARCHAR(40);
ALTER TABLE automarcador_bx_items ADD COLUMN IF NOT EXISTS tipificado_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_automarcador_bx_items_fecha ON automarcador_bx_items (ultimo_intento);
