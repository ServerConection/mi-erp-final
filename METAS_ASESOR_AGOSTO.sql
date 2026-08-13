-- ============================================================================
-- METAS POR ASESOR — NOVONET AGOSTO 2026 (mes = 8)
-- Fuente: dato.xlsx. Alimenta las columnas "Pto" de KPI por Supervisor/Asesor.
-- Los porcentajes son iguales para todos, por eso van como DEFAULT.
-- Nombres = los REALES de la base (todas las variantes de escritura).
-- ============================================================================

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

CREATE INDEX IF NOT EXISTS idx_metas_asesor_periodo
    ON public.metas_asesor (empresa, anio, mes) WHERE activo;

INSERT INTO public.metas_asesor
  (asesor, supervisor, leads_total, leads_gestion, ingresos_jot, activas_totales, empresa, anio, mes)
SELECT v.asesor, v.supervisor, v.lt, v.lg, v.ij, v.at, 'NOVONET', 2026, 8
FROM (VALUES
  ('Erick Leonel Enriquez Ramirez','ANDRES RODRIGUEZ',196.45,108.05,54.02,45.92),
  ('ERICK LEONEL ENRIQUEZ RAMIREZ','ANDRES RODRIGUEZ',196.45,108.05,54.02,45.92),
  ('JOMAIRA CRISTIANA LEITON RIZZO','ANDRES RODRIGUEZ',196.45,108.05,54.02,45.92),
  ('Leonardo Xavier Carlosama Tabango','ANDRES RODRIGUEZ',215.61,118.59,59.29,50.40),
  ('LEONARDO XAVIER CARLOSAMA TABANGO','ANDRES RODRIGUEZ',215.61,118.59,59.29,50.40),
  ('OSCAR SANGUCHO SASIG','ANDRES RODRIGUEZ',196.45,108.05,54.02,45.92),
  ('GERALDINE RIVERA GONZALEZ','ANDRES RODRIGUEZ',196.45,108.05,54.02,45.92),
  ('Christian Ponce Baroja','ANDRES RODRIGUEZ',196.45,108.05,54.02,45.92),
  ('CHRISTIAN PONCE BAROJA','ANDRES RODRIGUEZ',196.45,108.05,54.02,45.92),
  ('GENESIS MARTINEZ OLVERA','ANDRES RODRIGUEZ',167.70,92.24,46.12,39.20),
  ('GEOVANNY PATRICIO CARVAJAL ALMEIDA','ANDRES RODRIGUEZ',167.70,92.24,46.12,39.20),
  ('SARA DANIELA CHIRIBOGA ESPINOZA','ANDRES RODRIGUEZ',167.70,92.24,46.12,39.20),
  ('JESUS ALBERTO NARANJO MACAS','ANDRES RODRIGUEZ',95.83,52.71,26.35,22.40),
  ('GRACE ARIAS NARVAEZ','JAVIER NAVARRETE',196.45,108.05,54.02,45.92),
  ('MONICA PILCO QUINATOA','JAVIER NAVARRETE',196.45,108.05,54.02,45.92),
  ('DIANA VALERIA TABANGO LANDCHIMBA','JAVIER NAVARRETE',95.83,52.71,26.35,22.40),
  ('ARIANNE BELTRAN RANGEL','JAVIER NAVARRETE',196.45,108.05,54.02,45.92),
  ('MONICA QUILLAY GUAMAN','JAVIER NAVARRETE',196.45,108.05,54.02,45.92),
  ('Cristian Gerardo Colimba Caiza','JAVIER NAVARRETE',196.45,108.05,54.02,45.92),
  ('CRISTIAN GERARDO COLIMBA CAIZA','JAVIER NAVARRETE',196.45,108.05,54.02,45.92),
  ('IXCHELL TORRES MARTINEZ','JAVIER NAVARRETE',196.45,108.05,54.02,45.92),
  ('Sherley Chiriboga Cevallos','JAVIER NAVARRETE',167.70,92.24,46.12,39.20),
  ('SHERLEY CHIRIBOGA CEVALLOS','JAVIER NAVARRETE',167.70,92.24,46.12,39.20),
  ('JORGE ANDRES PAREDES ROMAN','JAVIER NAVARRETE',95.83,52.71,26.35,22.40),
  ('DIEGO GEOVANNI BENITEZ SANGO','JAVIER NAVARRETE',95.83,52.71,26.35,22.40),
  ('GERARDO CAJAMARCA','JONATHAN SIMBAÑA',239.57,131.76,65.88,56.00),
  ('DIEGO REYES PADILLA','JONATHAN SIMBAÑA',196.45,108.05,54.02,45.92),
  ('Alexis Geovanny Nagua Torres','JONATHAN SIMBAÑA',196.45,108.05,54.02,45.92),
  ('ALEXIS GEOVANNY NAGUA TORRES','JONATHAN SIMBAÑA',196.45,108.05,54.02,45.92),
  ('Sergio David Almeida Argoti','JONATHAN SIMBAÑA',239.57,131.76,65.88,56.00),
  ('SERGIO DAVID ALMEIDA ARGOTI','JONATHAN SIMBAÑA',239.57,131.76,65.88,56.00),
  ('NATASHA CALERO ESTACIO','JONATHAN SIMBAÑA',172.49,94.87,47.44,40.32),
  ('HILARY AYALA CRIBAN','JONATHAN SIMBAÑA',196.45,108.05,54.02,45.92),
  ('Jenny Fernanda Rodriguez Guaycha','JONATHAN SIMBAÑA',167.70,92.24,46.12,39.20),
  ('JENNY FERNANDA RODRIGUEZ GUAYCHA','JONATHAN SIMBAÑA',167.70,92.24,46.12,39.20),
  ('EDISON CAIZA HIDALGO','JONATHAN SIMBAÑA',167.70,92.24,46.12,39.20),
  ('TATIANA DENNISE IBARRA JACOME','JONATHAN SIMBAÑA',143.74,79.06,39.53,33.60),
  ('MELANY DAYANA QUIMBIULCO CHICAIZA','JONATHAN SIMBAÑA',95.83,52.71,26.35,22.40)
) AS v(asesor, supervisor, lt, lg, ij, at)
ON CONFLICT (empresa, anio, mes, asesor) DO UPDATE SET
    supervisor      = EXCLUDED.supervisor,
    leads_total     = EXCLUDED.leads_total,
    leads_gestion   = EXCLUDED.leads_gestion,
    ingresos_jot    = EXCLUDED.ingresos_jot,
    activas_totales = EXCLUDED.activas_totales;

-- VERIFICACION — esperado: 5246.63 leads, 2885.65 gestionables
SELECT supervisor, COUNT(DISTINCT asesor)::int AS filas,
       ROUND(SUM(leads_total),2) AS leads, ROUND(SUM(leads_gestion),2) AS gestion
FROM public.metas_asesor WHERE anio=2026 AND mes=8
GROUP BY ROLLUP(supervisor) ORDER BY 1 NULLS LAST;
