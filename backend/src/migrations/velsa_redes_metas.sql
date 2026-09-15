-- Objetivos mensuales por agencia para Redes VELSA.
CREATE TABLE IF NOT EXISTS public.velsa_redes_metas (
  mes date NOT NULL,
  agencia text NOT NULL,
  meta_leads integer NOT NULL DEFAULT 0,
  meta_ventas integer NOT NULL DEFAULT 0,
  meta_inversion numeric(14,2) NOT NULL DEFAULT 0,
  actualizado_por text,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mes, agencia),
  CHECK (meta_leads >= 0 AND meta_ventas >= 0 AND meta_inversion >= 0)
);
