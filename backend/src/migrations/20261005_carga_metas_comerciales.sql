-- ============================================================================
-- CARGA MENSUAL DE METAS COMERCIALES (Excel de gerencia) — 2026-10-05
-- ============================================================================
-- Ejecutar UNA vez en pgAdmin sobre bddgeneral.
--
-- 100% ADITIVO: solo crea tablas nuevas y agrega columnas opcionales a
-- metas_asesor. No borra, no renombra y no modifica ningun dato existente.
-- Es seguro correrlo dos veces (IF NOT EXISTS en todo).
--
-- Que alimenta el modulo "Carga de Metas" (ya existente, no cambia):
--   metas_asesor             -> columnas Pto de KPI por Supervisor/Asesor (Reporte D-1)
--   empleados                -> supervisor de cada asesor NOVONET (codigo = mes)
--   catalogo_asesores_velsa  -> supervisor de cada asesor VELSA (por codigo y periodo)
-- Tablas NUEVAS:
--   metas_cargas         -> bitacora de cada carga + foto de lo que habia antes
--   asesor_alias_bitrix  -> "como se llama en Bitrix" cada asesor del Excel + su codigo
--   metas_supervisor     -> meta de cada equipo (fila de subtotal del Excel)
--   metas_empresa        -> meta total de la empresa (fila TOTAL del Excel)
-- ============================================================================

BEGIN;

-- 1. Bitacora de cargas ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.metas_cargas (
  id               SERIAL PRIMARY KEY,
  empresa          TEXT        NOT NULL,            -- NOVONET | VELSA
  anio             INT         NOT NULL,
  mes              INT         NOT NULL,
  archivo          TEXT,
  hoja             TEXT,
  estado           TEXT        NOT NULL DEFAULT 'PREVIEW',  -- PREVIEW | APLICADA
  usuario_id       INT,
  usuario_nombre   TEXT,
  payload          JSONB,      -- lo leido del Excel + resultado del cruce
  resumen          JSONB,      -- que se escribio al aplicar
  snapshot_previo  JSONB,      -- como estaban las tablas ANTES de aplicar (para revertir)
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  aplicado_en      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_metas_cargas_periodo
  ON public.metas_cargas (empresa, anio, mes, estado);

-- 2. Alias: nombre del Excel -> nombre real en Bitrix (+ codigo de vendedor) --
CREATE TABLE IF NOT EXISTS public.asesor_alias_bitrix (
  id             SERIAL PRIMARY KEY,
  empresa        TEXT        NOT NULL,
  codigo_asesor  TEXT,                    -- codigo de vendedor del Excel (4486, 4068LK)
  nombre_excel   TEXT        NOT NULL,
  clave_excel    TEXT        NOT NULL,    -- nombre del Excel normalizado (sin tildes, mayusculas)
  nombre_bitrix  TEXT        NOT NULL,    -- tal cual aparece en Bitrix
  origen         TEXT        NOT NULL DEFAULT 'auto',   -- auto | manual
  activo         BOOLEAN     NOT NULL DEFAULT TRUE,
  creado_por     TEXT,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_asesor_alias_bitrix UNIQUE (empresa, clave_excel, nombre_bitrix)
);
CREATE INDEX IF NOT EXISTS idx_asesor_alias_codigo
  ON public.asesor_alias_bitrix (empresa, UPPER(BTRIM(codigo_asesor))) WHERE activo;

-- 3. Meta por supervisor (equipo) --------------------------------------------
CREATE TABLE IF NOT EXISTS public.metas_supervisor (
  id                  SERIAL PRIMARY KEY,
  empresa             TEXT NOT NULL,
  anio                INT  NOT NULL,
  mes                 INT  NOT NULL,
  supervisor          TEXT NOT NULL,
  codigo_supervisor   TEXT,
  num_asesores        INT,
  leads_total         NUMERIC(12,2) DEFAULT 0,
  leads_gestion       NUMERIC(12,2) DEFAULT 0,
  ingresos_jot        NUMERIC(12,2) DEFAULT 0,
  activas_totales     NUMERIC(12,2) DEFAULT 0,
  pct_efect_leads     NUMERIC(6,4),
  pct_efect_gestion   NUMERIC(6,4),
  pct_descarte        NUMERIC(6,4),
  pct_tasa_activacion NUMERIC(6,4),
  carga_id            INT,
  activo              BOOLEAN NOT NULL DEFAULT TRUE,
  actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_metas_supervisor UNIQUE (empresa, anio, mes, supervisor)
);

-- 4. Meta total por empresa --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.metas_empresa (
  id                  SERIAL PRIMARY KEY,
  empresa             TEXT NOT NULL,
  anio                INT  NOT NULL,
  mes                 INT  NOT NULL,
  leads_total         NUMERIC(12,2) DEFAULT 0,
  leads_gestion       NUMERIC(12,2) DEFAULT 0,
  ingresos_jot        NUMERIC(12,2) DEFAULT 0,
  activas_totales     NUMERIC(12,2) DEFAULT 0,
  pct_efect_leads     NUMERIC(6,4),
  pct_efect_gestion   NUMERIC(6,4),
  pct_descarte        NUMERIC(6,4),
  pct_tasa_activacion NUMERIC(6,4),
  pct_tarjeta         NUMERIC(6,4),
  pct_tercera_edad    NUMERIC(6,4),
  pct_planes_150_200  NUMERIC(6,4),
  dias_habiles        INT DEFAULT 26,
  carga_id            INT,
  actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_metas_empresa UNIQUE (empresa, anio, mes)
);

-- 5. metas_asesor: se asegura que exista (misma estructura original) --------
CREATE TABLE IF NOT EXISTS public.metas_asesor (
    id                 SERIAL PRIMARY KEY,
    empresa            TEXT NOT NULL DEFAULT 'NOVONET',
    anio               INT  NOT NULL,
    mes                INT  NOT NULL,
    asesor             TEXT NOT NULL,
    supervisor         TEXT,
    leads_total        NUMERIC(12,2) DEFAULT 0,
    leads_gestion      NUMERIC(12,2) DEFAULT 0,
    ingresos_jot       NUMERIC(12,2) DEFAULT 0,
    activas_totales    NUMERIC(12,2) DEFAULT 0,
    pct_efect_leads    NUMERIC(6,4)  DEFAULT 0.23,
    pct_efect_gestion  NUMERIC(6,4)  DEFAULT 0.50,
    pct_descarte       NUMERIC(6,4)  DEFAULT 0.27,
    pct_tasa_activacion NUMERIC(6,4) DEFAULT 0.85,
    pct_tarjeta        NUMERIC(6,4)  DEFAULT 0.35,
    pct_tercera_edad   NUMERIC(6,4)  DEFAULT 0.15,
    pct_planes_150_200 NUMERIC(6,4)  DEFAULT 0.15,
    activo             BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_metas_asesor UNIQUE (empresa, anio, mes, asesor)
);

-- Columnas nuevas OPCIONALES (nullable): el KPI Comercial no las lee, no le afectan
ALTER TABLE public.metas_asesor ADD COLUMN IF NOT EXISTS codigo_asesor  TEXT;
ALTER TABLE public.metas_asesor ADD COLUMN IF NOT EXISTS carga_id       INT;
ALTER TABLE public.metas_asesor ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ;

COMMIT;

-- ── VERIFICAR (solo lectura) — deben salir las 4 tablas nuevas ─────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('metas_cargas','asesor_alias_bitrix','metas_supervisor','metas_empresa','metas_asesor')
ORDER BY 1;
