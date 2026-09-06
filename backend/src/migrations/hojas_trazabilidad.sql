-- ============================================================================
-- Archivos Compartidos — trazabilidad (idempotente, se puede correr N veces)
-- ============================================================================
-- Los datos de auditoría ya existían casi todos; lo que faltaba era:
--   1. Registrar acciones que NO dejaban ningún rastro: descargar el archivo y
--      archivarlo/desarchivarlo. Un archivo podía desaparecer del panel sin
--      que quedara constancia de quién lo sacó.
--   2. Índices para poder consultar el historial CRUZANDO todas las hojas
--      (panel de auditoría). El único índice era por hoja_id, así que filtrar
--      por fecha o por persona obligaba a leer la tabla entera.
-- ============================================================================

BEGIN;

-- ── 1. Acciones nuevas en el CHECK de hoj_historial ─────────────────────────
ALTER TABLE public.hoj_historial DROP CONSTRAINT IF EXISTS chk_hoj_historial_accion;

ALTER TABLE public.hoj_historial ADD CONSTRAINT chk_hoj_historial_accion CHECK (accion IN (
    'CELDA_EDITADA', 'FILA_CREADA', 'FILA_ELIMINADA',
    'COLUMNA_CREADA', 'COLUMNA_EDITADA', 'COLUMNA_ELIMINADA',
    'HOJA_CREADA', 'HOJA_EDITADA', 'PERMISO_OTORGADO', 'PERMISO_REVOCADO',
    'IMPORTACION',
    -- nuevas
    'EXPORTACION', 'HOJA_ARCHIVADA', 'HOJA_DESARCHIVADA'
));

-- ── 2. Índices para el panel de auditoría (cruza todas las hojas) ───────────
CREATE INDEX IF NOT EXISTS idx_hoj_historial_fecha   ON public.hoj_historial(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hoj_historial_usuario ON public.hoj_historial(usuario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hoj_historial_accion  ON public.hoj_historial(accion, created_at DESC);

-- ── 3. Quién archivó y cuándo ───────────────────────────────────────────────
-- El historial ya deja el rastro, pero tenerlo en la fila evita un JOIN para
-- la pregunta más frecuente: "¿quién sacó este archivo del panel?".
ALTER TABLE public.hoj_hojas ADD COLUMN IF NOT EXISTS archivado_por INTEGER REFERENCES public.usuarios(id);
ALTER TABLE public.hoj_hojas ADD COLUMN IF NOT EXISTS archivado_at  TIMESTAMPTZ;

-- ── 4. Filtro por fecha de creación en el panel ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_hoj_hojas_created ON public.hoj_hojas(created_at DESC);

COMMIT;
