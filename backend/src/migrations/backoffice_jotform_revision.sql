-- ============================================================
-- Backoffice Jotform — tabla de revisión/auditoría de envíos
-- ============================================================
-- Las fuentes de datos (mestra_bitrix, mv_indicadores_velsa_completo)
-- son tablas/vistas materializadas que no se deben alterar para
-- agregar columnas de estado de revisión. En su lugar, esta tabla
-- liviana guarda el ESTADO DE REVISIÓN por cada registro de Jotform,
-- identificado por (empresa, id_externo).
--
-- id_externo:
--   NOVONET -> mb.j_id (o el id único de fila de mestra_bitrix / b_id)
--   VELSA   -> mv.id (o id único de mv_indicadores_velsa_completo)
-- Ajustar el id_externo real según la columna PK disponible en cada
-- fuente antes de ejecutar en producción.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.backoffice_jotform_revision (
  id              SERIAL PRIMARY KEY,
  empresa         VARCHAR(20)  NOT NULL CHECK (empresa IN ('NOVONET','VELSA')),
  id_externo      VARCHAR(100) NOT NULL,
  estado_revision VARCHAR(20)  NOT NULL DEFAULT 'PENDIENTE'
                   CHECK (estado_revision IN ('PENDIENTE','APROBADO','RECHAZADO')),
  observacion     TEXT,
  revisado_por    VARCHAR(100),
  revisado_en     TIMESTAMP,
  creado_en       TIMESTAMP NOT NULL DEFAULT NOW(),
  actualizado_en  TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (empresa, id_externo)
);

CREATE INDEX IF NOT EXISTS idx_boj_revision_empresa_estado
  ON public.backoffice_jotform_revision (empresa, estado_revision);

CREATE INDEX IF NOT EXISTS idx_boj_revision_id_externo
  ON public.backoffice_jotform_revision (id_externo);

-- Trigger para mantener actualizado_en al día
CREATE OR REPLACE FUNCTION public.fn_boj_revision_set_actualizado_en()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_boj_revision_actualizado_en ON public.backoffice_jotform_revision;
CREATE TRIGGER trg_boj_revision_actualizado_en
  BEFORE UPDATE ON public.backoffice_jotform_revision
  FOR EACH ROW EXECUTE FUNCTION public.fn_boj_revision_set_actualizado_en();
