-- ═══════════════════════════════════════════════════════════════════
-- BITRIX24 INTEGRATION TABLES — VELSA CRM
-- Ejecutar una sola vez en la DB de producción
-- ═══════════════════════════════════════════════════════════════════

-- Catálogo de pipelines (categorías)
CREATE TABLE IF NOT EXISTS bitrix_categorias (
  id            INTEGER PRIMARY KEY,
  nombre        VARCHAR(200) NOT NULL,
  sort          INTEGER DEFAULT 0,
  es_default    BOOLEAN DEFAULT false,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Catálogo de etapas por pipeline
CREATE TABLE IF NOT EXISTS bitrix_etapas (
  status_id     VARCHAR(60) PRIMARY KEY,
  category_id   INTEGER REFERENCES bitrix_categorias(id) ON DELETE CASCADE,
  nombre        VARCHAR(200) NOT NULL,
  sort          INTEGER DEFAULT 0,
  es_ganado     BOOLEAN DEFAULT false,
  es_perdido    BOOLEAN DEFAULT false,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Catálogo de usuarios / asesores
CREATE TABLE IF NOT EXISTS bitrix_usuarios (
  id              INTEGER PRIMARY KEY,
  nombre_completo VARCHAR(200),
  email           VARCHAR(200),
  departamentos   JSONB DEFAULT '[]',
  activo          BOOLEAN DEFAULT true,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Deals (tabla principal)
CREATE TABLE IF NOT EXISTS bitrix_deals (
  id                    INTEGER PRIMARY KEY,
  titulo                VARCHAR(500),
  category_id           INTEGER,
  stage_id              VARCHAR(60),
  asesor_id             INTEGER,
  source_id             VARCHAR(100),
  fecha_creacion        TIMESTAMPTZ,
  fecha_modificacion    TIMESTAMPTZ,
  fecha_cierre          TIMESTAMPTZ,
  cerrado               BOOLEAN DEFAULT false,
  ganado                BOOLEAN DEFAULT false,
  perdido               BOOLEAN DEFAULT false,
  monto                 NUMERIC(15,2) DEFAULT 0,
  moneda                VARCHAR(10) DEFAULT 'USD',
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bitrix_deals_fecha     ON bitrix_deals(fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_bitrix_deals_category  ON bitrix_deals(category_id);
CREATE INDEX IF NOT EXISTS idx_bitrix_deals_stage     ON bitrix_deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_bitrix_deals_asesor    ON bitrix_deals(asesor_id);
CREATE INDEX IF NOT EXISTS idx_bitrix_deals_ganado    ON bitrix_deals(ganado);

-- Log de sincronizaciones
CREATE TABLE IF NOT EXISTS bitrix_sync_log (
  id                  SERIAL PRIMARY KEY,
  tipo                VARCHAR(50) DEFAULT 'full',   -- 'full' | 'incremental'
  iniciado_en         TIMESTAMPTZ DEFAULT NOW(),
  completado_en       TIMESTAMPTZ,
  deals_procesados    INTEGER DEFAULT 0,
  deals_nuevos        INTEGER DEFAULT 0,
  deals_actualizados  INTEGER DEFAULT 0,
  error               TEXT,
  exito               BOOLEAN DEFAULT false
);

-- Precargar catálogo de etapas VELSA VENTAS NETLIFE (Cat:8)
INSERT INTO bitrix_categorias (id, nombre, sort, es_default) VALUES
  (0, 'LEADS FB',             0,  true),
  (4, 'NETLIFE - VELSA',      10, false),
  (6, 'ECUANET - VELSA',      20, false),
  (8, 'VELSA VENTAS NETLIFE', 30, false)
ON CONFLICT (id) DO UPDATE SET nombre=EXCLUDED.nombre, updated_at=NOW();

INSERT INTO bitrix_etapas (status_id, category_id, nombre, sort, es_ganado, es_perdido) VALUES
  ('C8:NEW',              8, 'CONTACTO NUEVO',          100,  false, false),
  ('C8:UC_BMJ7AX',        8, 'CLIENTE CON ACUERDO',     200,  false, false),
  ('C8:UC_M5PCP4',        8, 'PENDIENTE CIERRE',        300,  false, false),
  ('C8:PREPARATION',      8, 'CLIENTE 2 HORAS',         400,  false, false),
  ('C8:PREPAYMENT_INVOICE',8,'CLIENTE 4 HORAS',         500,  false, false),
  ('C8:EXECUTING',        8, 'CLIENTE 6 HORAS',         600,  false, false),
  ('C8:FINAL_INVOICE',    8, 'CLIENTE 8 HORAS',         700,  false, false),
  ('C8:UC_PNTKY7',        8, 'CLIENTE 12 HORAS',        800,  false, false),
  ('C8:UC_TI17A3',        8, 'OPORTUNIDADES SUPERVISOR',900,  false, false),
  ('C8:UC_Q9LSSI',        8, 'ATC',                     1000, false, false),
  ('C8:UC_023RNI',        8, 'ZONA PELIGROSA',          1100, false, false),
  ('C8:UC_CB4X0H',        8, 'FUERA DE COBERTURA',      1200, false, false),
  ('C8:WON',              8, 'VENTA SUBIDA',            1300, true,  false),
  ('C8:LOSE',             8, 'DESCARTE',                1400, false, true)
ON CONFLICT (status_id) DO UPDATE SET nombre=EXCLUDED.nombre, updated_at=NOW();

-- Precargar usuarios
INSERT INTO bitrix_usuarios (id, nombre_completo, departamentos) VALUES
  (1,     '1000 ACLOP ECUADOR',      '[1]'),
  (14,    '1001 Alejandra Pazmiño',  '[1]'),
  (11552, 'Gerencia Comercial',      '[14]'),
  (34330, 'BRYAN PINEDA',            '[106]'),
  (34344, 'ALISON CEPEDA',           '[1,108]'),
  (34346, 'Erika Granda',            '[1,20]'),
  (34348, 'Fernando Tarco',          '[1,108]'),
  (34350, 'Geovanny Muñoz',          '[1,108]'),
  (34352, 'Jefferson Palomo',        '[1,20]'),
  (34354, 'Carla Muñoz',             '[1,108]'),
  (34356, 'Cristian Jativa',         '[1,20]'),
  (34358, 'Edgar Rosero',            '[1,20]'),
  (34360, 'Katherine Pucha',         '[1,20]'),
  (34362, 'Anderson Espinoza',       '[1,108]'),
  (34364, 'Karla Arellano',          '[1,20]'),
  (34366, 'Jack Vera',               '[1,108]'),
  (34368, 'Maribel Monteros',        '[1,20]'),
  (34370, 'Sebastian Echevarria',    '[1,108]'),
  (34372, 'Odalis Pallares',         '[1,108]'),
  (34374, 'Karen Sarango',           '[1,20]'),
  (34376, 'Carla Cobos',             '[1,108]'),
  (34378, 'Veronica Hidalgo',        '[1,108]'),
  (34380, 'Emily Felix',             '[1,20]'),
  (34382, 'David Briones',           '[1]'),
  (34384, 'Andres Quiroz',           '[1,14]'),
  (34386, 'Alexandra Pacheco',       '[1,14]'),
  (34468, 'Adriana Salvatore',       '[1]'),
  (34852, 'Bryan Pineda',            '[1]')
ON CONFLICT (id) DO UPDATE SET nombre_completo=EXCLUDED.nombre_completo, updated_at=NOW();
