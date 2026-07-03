-- ═══════════════════════════════════════════════════════════════════
-- BITRIX24 WEBHOOK LEADS — receptor push (reemplaza bitrix_webhook.php)
-- Ejecutar en la DB de producción (bddgeneral, Render).
-- Es SEGURO volver a correrlo las veces que haga falta: usa IF NOT EXISTS
-- en todo y agrega columnas/constraints faltantes sin tocar datos existentes,
-- sin importar en qué estado haya quedado un intento anterior.
--
-- 3 tablas:
--   1) bitrix_webhook_etapas          -> catálogo de las 53 etapas de Bitrix
--   2) bitrix_webhook_leads           -> ESTADO ACTUAL (1 fila por lead, se
--                                         actualiza con cada webhook — UPSERT
--                                         por bitrix_id)
--   3) bitrix_webhook_leads_historial -> TRAZABILIDAD (1 fila por CADA
--                                         webhook recibido, nunca se actualiza)
-- ═══════════════════════════════════════════════════════════════════

-- 1) Catálogo de etapas (slug usado en ?etapa=... <-> nombre real en Bitrix)
CREATE TABLE IF NOT EXISTS bitrix_webhook_etapas (
  slug          VARCHAR(80) PRIMARY KEY,
  nombre_bitrix VARCHAR(150) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO bitrix_webhook_etapas (slug, nombre_bitrix) VALUES
  ('atc', 'ATC'),
  ('atc_soporte', 'ATC/SOPORTE'),
  ('cliente_2_horas', 'CLIENTE 2 HORAS'),
  ('cliente_4_horas', 'CLIENTE 4 HORAS'),
  ('cliente_6_horas', 'CLIENTE 6 HORAS'),
  ('cliente_8_horas', 'CLIENTE 8 HORAS'),
  ('cliente_con_acuerdo', 'CLIENTE CON ACUERDO'),
  ('cliente_discapacidad', 'CLIENTE DISCAPACIDAD'),
  ('contacto_nuevo', 'CONTACTO NUEVO'),
  ('contrato_netlife', 'CONTRATO NETLIFE'),
  ('descarte', 'DESCARTE'),
  ('desiste_de_compra', 'DESISTE DE COMPRA'),
  ('documentos_pendientes', 'DOCUMENTOS PENDIENTES'),
  ('duplicado', 'DUPLICADO'),
  ('fuera_de_cobertura', 'FUERA DE COBERTURA'),
  ('gestion_diaria', 'GESTIÓN DIARIA'),
  ('innegociable', 'INNEGOCIABLE'),
  ('mantiene_proveedor', 'MANTIENE PROVEEDOR'),
  ('no_interesa_costo_plan', 'NO INTERESA COSTO PLAN'),
  ('no_volver_a_contactar', 'NO VOLVER A CONTACTAR'),
  ('oportunidades', 'OPORTUNIDADES'),
  ('oportunidades_supervisor', 'OPORTUNIDADES SUPERVISOR'),
  ('otro_asesor_novonet', 'OTRO ASESOR NOVONET'),
  ('otro_proveedor', 'OTRO PROVEEDOR'),
  ('pendiente_cierre', 'PENDIENTE CIERRE'),
  ('postventa_novonet', 'POSTVENTA NOVONET'),
  ('venta_subida', 'VENTA SUBIDA'),
  ('zonas_peligrosas', 'ZONAS PELIGROSAS'),
  ('oportunidades_supervisores_mes_actual', 'OPORTUNIDADES SUPERVISORES MES ACTUAL'),
  ('zona_peligrosa', 'ZONA PELIGROSA'),
  ('volver_a_llamar_no_contesta', 'VOLVER A LLAMAR NO CONTESTA'),
  ('seguimiento_negociacion', 'SEGUIMIENTO NEGOCIACION'),
  ('envio_requisitos_documentos_pendientes', 'ENVIO REQUISITOS/DOCUMENTOS PENDIENTES'),
  ('gestion_diaria_pendiente_cierre', 'GESTION DIARIA/PENDIENTE CIERRE'),
  ('contacto_nuevo_supervisor', 'CONTACTO NUEVO /SUPERVISOR'),
  ('mas_de_15_dias_para_cierre', 'MAS DE 15 DIAS PARA CIERRE'),
  ('descarte_remarketizado', 'DESCARTE REMARKETIZADO'),
  ('no_contesta_15_minutos', 'NO CONTESTA 15 MINUTOS'),
  ('dupllicado', 'DUPLLICADO'),
  ('contrato_netlife_otro_asesor_companero', 'CONTRATO NETLIFE OTRO ASESOR COMPAÑERO'),
  ('contrato_netlife_por_otro_canal', 'CONTRATO NETLIFE POR OTRO CANAL'),
  ('postventa', 'POSTVENTA'),
  ('descarte_plan_de_200', 'DESCARTE PLAN DE 200'),
  ('no_interesa_costo_instalacion', 'NO INTERESA COSTO INSTALACIÓN'),
  ('venta_directa_ecuanet', 'VENTA DIRECTA ECUANET'),
  ('regularizacion', 'REGULARIZACION'),
  ('remarketing_dirario_ariel_curay', 'REMARKETING DIRARIO ARIEL CURAY'),
  ('no_contesta_30_minutos', 'NO CONTESTA 30 MINUTOS'),
  ('urgente_gestion_supervisor', 'URGENTE GESTION SUPERVISOR'),
  ('remarketing', 'REMARKETING'),
  ('contrato_paramount', 'CONTRATO PARAMOUNT'),
  ('paramount_segumiento_por_cerrar', 'PARAMOUNT SEGUMIENTO POR CERRAR'),
  ('no_contesta_60_minutos', 'NO CONTESTA 60 MINUTOS')
ON CONFLICT (slug) DO UPDATE SET nombre_bitrix = EXCLUDED.nombre_bitrix;

-- 2) Estado ACTUAL del lead — 1 fila por bitrix_id, UPSERT en cada webhook
--    (CREATE TABLE con el esquema completo, por si la tabla no existe todavía)
CREATE TABLE IF NOT EXISTS bitrix_webhook_leads (
  id                    SERIAL PRIMARY KEY,
  bitrix_id             VARCHAR(50) UNIQUE NOT NULL,
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
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- 2.1) Si la tabla YA existía con un esquema viejo (sin estas columnas),
--      se completan aquí ANTES de crear índices que las referencian.
ALTER TABLE bitrix_webhook_leads
  ADD COLUMN IF NOT EXISTS etapa                 VARCHAR(80),
  ADD COLUMN IF NOT EXISTS etapa_bitrix           VARCHAR(150),
  ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS fecha_venta_subida     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS fecha_concretar        VARCHAR(50),
  ADD COLUMN IF NOT EXISTS modificado_por         VARCHAR(150),
  ADD COLUMN IF NOT EXISTS creado_por             VARCHAR(150),
  ADD COLUMN IF NOT EXISTS creado_por_friendly    VARCHAR(150),
  ADD COLUMN IF NOT EXISTS pipeline               VARCHAR(150),
  ADD COLUMN IF NOT EXISTS comentario             TEXT,
  ADD COLUMN IF NOT EXISTS iniciado_el            VARCHAR(50),
  ADD COLUMN IF NOT EXISTS otro_proveedor         VARCHAR(150),
  ADD COLUMN IF NOT EXISTS razon_descarte         VARCHAR(255),
  ADD COLUMN IF NOT EXISTS innegociable           VARCHAR(100),
  ADD COLUMN IF NOT EXISTS volver_a_llamar        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS documentos_pendientes  VARCHAR(150),
  ADD COLUMN IF NOT EXISTS motivo_atc             VARCHAR(255),
  ADD COLUMN IF NOT EXISTS id_conversacion        VARCHAR(100);

-- 2.2) Asegura la restricción UNIQUE en bitrix_id (necesaria para el UPSERT
--      "ON CONFLICT (bitrix_id)"). Si la tabla se creó antes sin ella, se
--      agrega aquí; si ya existe, no hace nada (evita el error 42P07/42710).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'bitrix_webhook_leads'::regclass
      AND c.contype IN ('u', 'p')
      AND a.attname = 'bitrix_id'
  ) THEN
    ALTER TABLE bitrix_webhook_leads ADD CONSTRAINT bitrix_webhook_leads_bitrix_id_key UNIQUE (bitrix_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bwl_phone      ON bitrix_webhook_leads(phone);
CREATE INDEX IF NOT EXISTS idx_bwl_etapa      ON bitrix_webhook_leads(etapa);
CREATE INDEX IF NOT EXISTS idx_bwl_created_at ON bitrix_webhook_leads(created_at);

-- 3) Historial — 1 fila por CADA webhook recibido (trazabilidad completa)
CREATE TABLE IF NOT EXISTS bitrix_webhook_leads_historial (
  id                    SERIAL PRIMARY KEY,
  bitrix_id             VARCHAR(50),
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
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bitrix_webhook_leads_historial
  ADD COLUMN IF NOT EXISTS etapa                 VARCHAR(80),
  ADD COLUMN IF NOT EXISTS etapa_bitrix           VARCHAR(150),
  ADD COLUMN IF NOT EXISTS fecha_venta_subida     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS fecha_concretar        VARCHAR(50),
  ADD COLUMN IF NOT EXISTS modificado_por         VARCHAR(150),
  ADD COLUMN IF NOT EXISTS creado_por             VARCHAR(150),
  ADD COLUMN IF NOT EXISTS creado_por_friendly    VARCHAR(150),
  ADD COLUMN IF NOT EXISTS pipeline               VARCHAR(150),
  ADD COLUMN IF NOT EXISTS comentario             TEXT,
  ADD COLUMN IF NOT EXISTS iniciado_el            VARCHAR(50),
  ADD COLUMN IF NOT EXISTS otro_proveedor         VARCHAR(150),
  ADD COLUMN IF NOT EXISTS razon_descarte         VARCHAR(255),
  ADD COLUMN IF NOT EXISTS innegociable           VARCHAR(100),
  ADD COLUMN IF NOT EXISTS volver_a_llamar        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS documentos_pendientes  VARCHAR(150),
  ADD COLUMN IF NOT EXISTS motivo_atc             VARCHAR(255),
  ADD COLUMN IF NOT EXISTS id_conversacion        VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_bwlh_bitrix_id  ON bitrix_webhook_leads_historial(bitrix_id);
CREATE INDEX IF NOT EXISTS idx_bwlh_created_at ON bitrix_webhook_leads_historial(created_at);
CREATE INDEX IF NOT EXISTS idx_bwlh_etapa      ON bitrix_webhook_leads_historial(etapa);
