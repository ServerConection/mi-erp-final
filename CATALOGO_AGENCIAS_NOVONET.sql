-- ============================================================================
-- CATALOGO_AGENCIAS_NOVONET.sql   (2026-08-20)
-- ----------------------------------------------------------------------------
-- Mismo pedido que ya se resolvió para VELSA (ver CATALOGO_AGENCIAS_VELSA.sql
-- y backend/src/controllers/redesVelsa.controller.js), ahora espejado para
-- NOVONET: poder agrupar los orígenes reales de Bitrix (public.mestra_bitrix,
-- columna b_origen) bajo el nombre de la AGENCIA de publicidad que los
-- genera, editable desde el ERP (pestaña "Agencias" del módulo Redes) en vez
-- de depender solo del mapeo fijo ORIGEN_A_CANAL_INV / GRUPO_A_ORIGENES que
-- ya existe en redes.controller.js (ese mapeo NO se toca ni se borra — sigue
-- siendo la fuente de "Metas vs Logros" y del Forecast).
--
-- QUE CREA
--   1) novonet_lineas_canal: un registro por ORIGEN (único), con la AGENCIA
--      asignada. Un origen solo puede tener una agencia a la vez; varios
--      orígenes sí pueden compartir la misma agencia (ej: "ARTS").
--   2) novonet_inversion_redes: inversión/pauta por fecha + origen. Se llena
--      manualmente desde la pestaña "Agencias" O automáticamente por el sync
--      de WinTracker (columna "fuente" distingue 'manual' de
--      'wintracker_api' — ver WINTRACKER_SYNC_SETUP.sql y
--      backend/src/services/wintracker.service.js).
--
-- ES IDEMPOTENTE: se puede correr las veces que haga falta.
-- NO MODIFICA ningún dato de leads existente. Solo crea las tablas catálogo.
-- Las asignaciones se cargan desde la pantalla (pestaña "Agencias"), no aquí
-- — este script solo prepara las tablas.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.novonet_lineas_canal (
    id             serial      PRIMARY KEY,
    origen         text        NOT NULL,
    agencia        text        NOT NULL,
    creado_por     text,
    creado_en      timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_novonet_lineas_canal_origen UNIQUE (origen)
);

CREATE INDEX IF NOT EXISTS idx_novonet_lineas_canal_agencia
    ON public.novonet_lineas_canal (agencia);

CREATE TABLE IF NOT EXISTS public.novonet_inversion_redes (
    id          serial      PRIMARY KEY,
    fecha       date        NOT NULL,
    origen      text        NOT NULL,
    monto_usd   numeric     NOT NULL DEFAULT 0,
    fuente      text        NOT NULL DEFAULT 'manual',
    creado_por  text,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_novonet_inversion_redes_fecha_origen UNIQUE (fecha, origen)
);

CREATE INDEX IF NOT EXISTS idx_novonet_inversion_redes_fecha
    ON public.novonet_inversion_redes (fecha);

COMMIT;

-- ---------------------------------------------------------------------------
-- Verificación rápida (no modifica nada):
-- ---------------------------------------------------------------------------
-- SELECT * FROM public.novonet_lineas_canal ORDER BY agencia, origen;
-- SELECT * FROM public.novonet_inversion_redes ORDER BY fecha DESC LIMIT 20;
