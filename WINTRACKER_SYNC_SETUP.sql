-- ============================================================================
-- WINTRACKER_SYNC_SETUP.sql   (2026-08-20)
-- ----------------------------------------------------------------------------
-- Prepara la base para que el sync automático de WinTracker (Vidika) —
-- backend/src/services/wintracker.service.js — pueda guardar la inversión
-- diaria que trae la API (GET /api/v1/netlife.php?agency=...) dentro de las
-- MISMAS tablas de "Agencias" que ya existen para cada empresa, sin crear
-- tablas nuevas ni tocar el resto del dato.
--
-- CÓMO FUNCIONA
--   El monto que devuelve WinTracker viene YA TOTALIZADO por agencia (no por
--   origen/línea individual de Bitrix). Para que encaje en el mismo esquema
--   origen -> agencia que ya existe, cada agencia sincronizada por API se
--   representa con un "origen sintético" reservado (no es un origen real de
--   Bitrix/GHL, nunca va a aparecer solo escribiéndolo a mano):
--     - ARTS  (NOVONET) -> origen sintético '__WINTRACKER_ARTS__'
--     - VELSA (VELSA)   -> origen sintético '__WINTRACKER_VELSA__'
--   Cada uno se preasigna a su agencia en el catálogo correspondiente. El
--   servicio de sync solo hace UPSERT sobre la fila de inversión de ese
--   origen sintético (por fecha) — el resto del catálogo (orígenes reales,
--   asignaciones manuales) no se toca.
--
--   Vidika (agencia por defecto de WinTracker) queda pendiente: no se
--   sincroniza todavía porque no tenemos su apikey — cuando llegue, agregar
--   su entrada en AGENCIAS dentro de wintracker.service.js y, si aplica, un
--   INSERT similar a los de abajo.
--
-- ES IDEMPOTENTE: se puede correr las veces que haga falta.
-- REQUIERE haber corrido antes CATALOGO_AGENCIAS_NOVONET.sql (VELSA ya tiene
-- su tabla desde CATALOGO_AGENCIAS_VELSA.sql).
-- ============================================================================

BEGIN;

-- Columna "fuente" en velsa_inversion_redes (novonet_inversion_redes ya nace
-- con ella). Nullable-safe: default 'manual' para las filas que ya existían.
ALTER TABLE public.velsa_inversion_redes
    ADD COLUMN IF NOT EXISTS fuente text NOT NULL DEFAULT 'manual';

-- Orígenes sintéticos reservados para el sync automático.
INSERT INTO public.novonet_lineas_canal (origen, agencia, creado_por)
VALUES ('__WINTRACKER_ARTS__', 'ARTS', 'sistema-wintracker')
ON CONFLICT (origen) DO NOTHING;

INSERT INTO public.velsa_lineas_canal (origen, agencia, creado_por)
VALUES ('__WINTRACKER_VELSA__', 'VELSA', 'sistema-wintracker')
ON CONFLICT (origen) DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- Verificación rápida (no modifica nada):
-- ---------------------------------------------------------------------------
-- SELECT * FROM public.novonet_lineas_canal WHERE origen LIKE '__WINTRACKER%';
-- SELECT * FROM public.velsa_lineas_canal   WHERE origen LIKE '__WINTRACKER%';
