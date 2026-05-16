-- ════════════════════════════════════════════════════════════════════════════════
-- Módulo FORECAST — Objetivos de campañas
-- Ejecutar UNA sola vez en la BD
-- ════════════════════════════════════════════════════════════════════════════════

-- Tabla de objetivos por campaña / mes / empresa
CREATE TABLE IF NOT EXISTS public.forecast_objetivos (
  id                  SERIAL         PRIMARY KEY,
  empresa             VARCHAR(20)    NOT NULL DEFAULT 'NOVONET',
  campana             VARCHAR(60)    NOT NULL,
  mes                 SMALLINT       NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio                SMALLINT       NOT NULL CHECK (anio >= 2024),

  -- Inversión y CPL/CPA objetivo
  inversion_mensual   NUMERIC(12,2),
  cpl_objetivo        NUMERIC(8,2),
  cpa_objetivo        NUMERIC(8,2),
  leads_objetivo      INT,
  ventas_objetivo     INT,

  -- Ratios objetivo (0.0 – 1.0)
  ratio_atc           NUMERIC(5,4)   DEFAULT 0,
  ratio_fc_zp         NUMERIC(5,4)   DEFAULT 0,
  ratio_innegociable  NUMERIC(5,4)   DEFAULT 0,
  ratio_gestionable   NUMERIC(5,4)   DEFAULT 0,
  ratio_efectividad   NUMERIC(5,4)   DEFAULT 0,
  ratio_activacion    NUMERIC(5,4)   DEFAULT 0,

  creado_en           TIMESTAMPTZ    DEFAULT NOW(),
  modificado_en       TIMESTAMPTZ    DEFAULT NOW(),

  UNIQUE (empresa, campana, mes, anio)
);

-- Trigger para actualizar modificado_en automáticamente
CREATE OR REPLACE FUNCTION public.fn_update_forecast_ts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.modificado_en = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_forecast_objetivos_ts ON public.forecast_objetivos;
CREATE TRIGGER trg_forecast_objetivos_ts
  BEFORE UPDATE ON public.forecast_objetivos
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_forecast_ts();

-- ────────────────────────────────────────────────────────────────────────────────
-- Seed: objetivos iniciales NOVONET (mayo 2026) — datos del Excel
-- Ejecutar para pre-cargar los valores del análisis
-- ────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.forecast_objetivos
  (empresa, campana, mes, anio, inversion_mensual, cpl_objetivo, cpa_objetivo,
   ratio_atc, ratio_fc_zp, ratio_innegociable, ratio_gestionable, ratio_efectividad, ratio_activacion,
   leads_objetivo, ventas_objetivo)
VALUES
  -- ARTS FACEBOOK (suma 1968 + 484: $94/día × 31 × 2 ≈ $5,828/mes, CPL $2.50)
  ('NOVONET', 'ARTS FACEBOOK', 5, 2026, 5828.00, 2.50, 25.00,
   0.4300, 0.0600, 0.0600, 0.4500, 0.2700, 0.8900,
   2331, 315),
  -- ARTS GOOGLE ($250/día × 31 ≈ $7,750, CPL $3.60)
  ('NOVONET', 'ARTS GOOGLE', 5, 2026, 7750.00, 3.60, 30.00,
   0.2500, 0.0500, 0.0500, 0.3500, 0.4000, 0.8500,
   2153, 301),
  -- VIDIKA GOOGLE ($19,000/mes, CPL ~$5.54)
  ('NOVONET', 'VIDIKA GOOGLE', 5, 2026, 19000.00, 5.54, 45.00,
   0.2200, 0.0600, 0.0600, 0.3800, 0.3500, 0.8200,
   3430, 267),
  -- REMARKETING
  ('NOVONET', 'REMARKETING', 5, 2026, 2000.00, 3.00, 28.00,
   0.3000, 0.0500, 0.0500, 0.4000, 0.3000, 0.8500,
   667, 80)
ON CONFLICT (empresa, campana, mes, anio) DO NOTHING;
