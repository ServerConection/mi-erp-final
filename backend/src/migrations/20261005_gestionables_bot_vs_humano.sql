-- ============================================================================
-- REPARTO DE GESTIONABLES — ENTREGAS DEL BOT vs ENTREGAS DE UN HUMANO
-- Base: erp_database (¡no bddgeneral!). Correr a mano en pgAdmin. Seguro de re-ejecutar.
--
-- - origen: 'directo' / 'cola' (bot) o 'humano' (alguien asignó el lead a mano en Bitrix).
-- - vigente: si un humano mueve un lead de Ana a Luis, la fila de Ana queda
--   vigente = false (ya no cuenta en su cupo) y se crea una fila vigente para Luis.
--   Bot + humano vigentes = lo que lleva el asesor contra su permitido.
-- ============================================================================
ALTER TABLE gestionables_asignaciones ADD COLUMN IF NOT EXISTS vigente        BOOLEAN     NOT NULL DEFAULT TRUE;
ALTER TABLE gestionables_asignaciones ADD COLUMN IF NOT EXISTS reasignado_a   VARCHAR(150);
ALTER TABLE gestionables_asignaciones ADD COLUMN IF NOT EXISTS reasignado_en  TIMESTAMPTZ;

-- Antes: 1 fila por lead y día. Ahora: 1 fila VIGENTE por lead y día (las
-- reasignaciones dejan historial).
ALTER TABLE gestionables_asignaciones DROP CONSTRAINT IF EXISTS uq_gestionables_asig_deal_fecha;
CREATE UNIQUE INDEX IF NOT EXISTS uq_gestionables_asig_deal_fecha_vigente
    ON gestionables_asignaciones (fecha, bitrix_deal_id) WHERE vigente;

-- Verificación
-- SELECT origen, vigente, COUNT(*) FROM gestionables_asignaciones
--  WHERE fecha = (NOW() AT TIME ZONE 'America/Guayaquil')::date GROUP BY 1, 2;
