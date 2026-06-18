-- ============================================================
-- Cumplimiento de Leads (NOVONET) — tabla de metas por asesor
-- ============================================================
-- mestra_bitrix (Bitrix + Jotform NOVONET ya cruzados) tiene TODO lo
-- necesario para el reporte EXCEPTO la "meta/objetivo de gestionables"
-- por asesor: ese dato es un parámetro de negocio mensual que el Excel
-- original mantenía a mano (hoja "Hoja4", columna META ASESORES) y que
-- no existe en ninguna tabla de la base. Esta tabla lo reemplaza con
-- un registro editable desde el ERP (sin tocar mestra_bitrix).
--
-- Vínculo con mestra_bitrix: por NOMBRE normalizado
-- (UPPER(TRIM(asesor)) = UPPER(TRIM(mb.b_persona_responsable))),
-- porque mestra_bitrix no guarda el código de ejecutivo.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.asesores_metas (
  id                SERIAL PRIMARY KEY,
  codigo_ejecutivo  VARCHAR(20)  NOT NULL,
  asesor            VARCHAR(150) NOT NULL,
  supervisor        VARCHAR(150),
  meta_gestionables INT          NOT NULL DEFAULT 0,
  activo            BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en         TIMESTAMP    NOT NULL DEFAULT NOW(),
  actualizado_en    TIMESTAMP    NOT NULL DEFAULT NOW(),
  UNIQUE (codigo_ejecutivo)
);

CREATE INDEX IF NOT EXISTS idx_asesores_metas_asesor
  ON public.asesores_metas (UPPER(TRIM(asesor)));

CREATE OR REPLACE FUNCTION public.fn_asesores_metas_set_actualizado_en()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_asesores_metas_actualizado_en ON public.asesores_metas;
CREATE TRIGGER trg_asesores_metas_actualizado_en
  BEFORE UPDATE ON public.asesores_metas
  FOR EACH ROW EXECUTE FUNCTION public.fn_asesores_metas_set_actualizado_en();

-- Seed: únicamente las filas del Excel origen que traían un código y una
-- meta numérica válidos (el resto del roster del Excel tenía "META ASESORES"
-- vacío o el asesor marcado como "cesante"). Las demás metas quedan en 0
-- y se completan desde la UI del módulo.
INSERT INTO public.asesores_metas (codigo_ejecutivo, asesor, supervisor, meta_gestionables) VALUES
  ('4507', 'JORGE LUIS SHARUPI ENTZA',            'ADRIANA SALVATORE CORONA',          40),
  ('4504', 'HEIDY CAMILA UMATAMBO MORALES',        'ADRIANA SALVATORE CORONA',          38),
  ('4505', 'CRISTINA JEANNETH BARRENO MADRID',     'ADRIANA SALVATORE CORONA',          35),
  ('4503', 'DAVID ALBERTO GUATEMAL LECHON',        'ADRIANA SALVATORE CORONA',          40),
  ('4493', 'CHRISTIAN PONCE BAROJA',                'ANDRES SEBASTIAN RODRIGUEZ JACOME', 50),
  ('4341', 'HILARY AIDE AYALA CRIBAN',              'ANDRES SEBASTIAN RODRIGUEZ JACOME', 45),
  ('4285', 'NATASHA MARCELA CALERO ESTACIO',        'ANDRES SEBASTIAN RODRIGUEZ JACOME', 40),
  ('4364', 'JOMAIRA CRISTINA LEITON RIZZO',         'ANDRES SEBASTIAN RODRIGUEZ JACOME', 45),
  ('4279', 'SHERLEY STEFANNY CHIRIBOGA CEVALLOS',   'ANDRES SEBASTIAN RODRIGUEZ JACOME', 45),
  ('4302', 'GENESIS CORALIA MARTINEZ OLVERA',       'ANDRES SEBASTIAN RODRIGUEZ JACOME', 20),
  ('4392', 'CRISTIAN GERARDO COLIMBA CAIZA',        'ANDRES SEBASTIAN RODRIGUEZ JACOME', 0),
  ('4468', 'MELANY SARIBEL CHAMORRO CORREA',        'ANDRES SEBASTIAN RODRIGUEZ JACOME', 398)
ON CONFLICT (codigo_ejecutivo) DO NOTHING;
