-- ============================================================================
-- CATALOGO_AGENCIAS_VELSA.sql   (2026-08-19)
-- ----------------------------------------------------------------------------
-- Pedido de Redes: poder agrupar los orígenes reales de VELSA (Bitrix/GHL/
-- JotForm, tal como llegan, sin catálogo hasta ahora) bajo el nombre de la
-- AGENCIA de publicidad que los genera — igual que ya existe para NOVONET
-- (ORIGEN_A_CANAL_INV / GRUPO_A_ORIGENES en redes.controller.js), pero acá
-- queda en una tabla editable desde el ERP (pestaña "Agencias" del módulo
-- Redes VELSA) en vez de hardcodeado en el código.
--
-- QUE CREA
--   Tabla velsa_lineas_canal: un registro por ORIGEN (único), con la AGENCIA
--   asignada. Un origen solo puede tener una agencia a la vez; varias
--   orígenes sí pueden compartir la misma agencia (ej: "VIDIKA").
--
-- ES IDEMPOTENTE: se puede correr las veces que haga falta.
-- NO MODIFICA ningún dato de leads existente. Solo crea la tabla catálogo.
-- Las asignaciones se cargan desde la pantalla (pestaña "Agencias"), no
-- aquí — este script solo prepara la tabla.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.velsa_lineas_canal (
    id             serial      PRIMARY KEY,
    origen         text        NOT NULL,
    agencia        text        NOT NULL,
    creado_por     text,
    creado_en      timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_velsa_lineas_canal_origen UNIQUE (origen)
);

CREATE INDEX IF NOT EXISTS idx_velsa_lineas_canal_agencia
    ON public.velsa_lineas_canal (agencia);

COMMIT;

-- ---------------------------------------------------------------------------
-- Verificación rápida (no modifica nada):
-- ---------------------------------------------------------------------------
-- SELECT * FROM public.velsa_lineas_canal ORDER BY agencia, origen;
