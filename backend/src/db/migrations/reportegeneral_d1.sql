-- ═══════════════════════════════════════════════════════════════════
-- REPORTEGENERAL_D1 — snapshot del CIERRE DIARIO de bitrix_webhook_leads
-- Ejecutar en la DB "erp_database" (Render). NO va en bddgeneral.
--
-- Qué hace: cada día, el job cierreDiario.cron.js (proceso "workers")
-- copia el estado ACTUAL de bddgeneral.public.bitrix_webhook_leads hacia
-- esta tabla, marcando cada fila con fecha_cierre = el día que cerró.
--
-- A diferencia de bitrix_webhook_leads (1 fila por lead, se sobrescribe)
-- aquí el mismo bitrix_id se repite UNA VEZ POR CADA DÍA que se hizo el
-- cierre — así queda la trazabilidad de cómo estaba el lead en cada corte
-- (ayer, anteayer, etc.), aunque hoy ya lo hayan modificado en Bitrix.
--
-- Es seguro volver a correrlo: usa IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reportegeneral_d1 (
  id                    SERIAL PRIMARY KEY,

  -- Columna clave: el día que se hizo este cierre (23:30 hora Ecuador).
  fecha_cierre          DATE NOT NULL,

  -- Identidad del lead (igual que en bitrix_webhook_leads)
  empresa               VARCHAR(30) NOT NULL DEFAULT 'novonet',
  bitrix_id             VARCHAR(50) NOT NULL,

  -- Copia del estado del lead EN EL MOMENTO DEL CIERRE
  etapa                 VARCHAR(80),
  etapa_bitrix          VARCHAR(150),
  event                 VARCHAR(100),
  phone                 VARCHAR(50),
  source                VARCHAR(150),
  city                  VARCHAR(150),
  repeated              VARCHAR(100),
  responsible           VARCHAR(150),
  utm_source            VARCHAR(150),
  utm_medium            VARCHAR(150),
  utm_campaign          VARCHAR(150),
  utm_content           VARCHAR(150),
  utm_term              VARCHAR(150),
  fecha_venta_subida    VARCHAR(50),
  fecha_concretar       VARCHAR(50),
  modificado_por        VARCHAR(150),
  creado_por            VARCHAR(150),
  creado_por_friendly   VARCHAR(150),
  pipeline              VARCHAR(150),
  comentario            TEXT,
  iniciado_el           VARCHAR(50),
  otro_proveedor        VARCHAR(150),
  razon_descarte        VARCHAR(255),
  innegociable          VARCHAR(100),
  volver_a_llamar       VARCHAR(100),
  documentos_pendientes VARCHAR(150),
  motivo_atc            VARCHAR(255),
  id_conversacion       VARCHAR(100),
  raw_query             JSONB,

  -- created_at/updated_at ORIGINALES del lead en bddgeneral (renombrados
  -- para no confundirlos con snapshot_generado_at, que es de esta tabla)
  lead_created_at       TIMESTAMPTZ,
  lead_updated_at       TIMESTAMPTZ,

  -- Cuándo se generó ESTE snapshot (auditoría del propio job)
  snapshot_generado_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un lead no puede tener 2 snapshots el mismo día -> upsert idempotente
-- si el job se reintenta o se dispara manualmente el mismo día.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'reportegeneral_d1'::regclass
      AND conname = 'reportegeneral_d1_empresa_bitrix_fecha_key'
  ) THEN
    ALTER TABLE reportegeneral_d1
      ADD CONSTRAINT reportegeneral_d1_empresa_bitrix_fecha_key
      UNIQUE (empresa, bitrix_id, fecha_cierre);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rgd1_fecha_cierre ON reportegeneral_d1(fecha_cierre);
CREATE INDEX IF NOT EXISTS idx_rgd1_bitrix_id     ON reportegeneral_d1(bitrix_id);
CREATE INDEX IF NOT EXISTS idx_rgd1_empresa        ON reportegeneral_d1(empresa);
CREATE INDEX IF NOT EXISTS idx_rgd1_etapa           ON reportegeneral_d1(etapa);
