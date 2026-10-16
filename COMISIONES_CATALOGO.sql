-- ============================================================================
-- Catálogo mensual de comisiones (módulo Administración > Comisiones)
-- Ejecutar UNA vez en pgAdmin. No borra ni modifica nada existente.
-- Cada carga de un mes deja la anterior del mismo mes en activo = false.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.comisiones_catalogo (
  id           BIGSERIAL PRIMARY KEY,
  mes          TEXT        NOT NULL,              -- 'AAAA-MM'
  tipo         TEXT        NOT NULL,              -- HOME | TERCERA EDAD | PRO | PYME | GAMER
  velocidad    INTEGER     NOT NULL,              -- Mbps
  n_servicios  INTEGER     NOT NULL DEFAULT 0,    -- contados por los "+"
  plan         TEXT,
  servicios    TEXT,
  nombre_erp   TEXT,
  com_t1       NUMERIC(12,4) NOT NULL,            -- menor a 35 ventas
  com_t2       NUMERIC(12,4),                     -- de 36 a 41
  com_t3       NUMERIC(12,4),                     -- de 42 en adelante
  impulso      NUMERIC(12,4),
  bono_tc      NUMERIC(12,4),
  activo       BOOLEAN     NOT NULL DEFAULT true,
  cargado_por  TEXT,
  cargado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comisiones_catalogo_mes_activo
  ON public.comisiones_catalogo (mes, activo, tipo, velocidad);
