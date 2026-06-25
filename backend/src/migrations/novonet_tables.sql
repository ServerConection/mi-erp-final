-- ═══════════════════════════════════════════════════════════════════
-- BITRIX24 INTEGRATION TABLES — NOVONET CRM
-- Tablas separadas de bitrix_usuarios / bitrix_deals (que son SOLO VELSA)
-- para no tocar nada de lo que ya depende de esas tablas.
-- El Automarcador (módulo de llamadas) usa SOLO estas tablas NOVONET.
-- Ejecutar una sola vez en la DB (bddgeneral).
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bitrix_categorias_novonet (
  id            INTEGER PRIMARY KEY,
  nombre        VARCHAR(200) NOT NULL,
  sort          INTEGER DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bitrix_etapas_novonet (
  status_id     VARCHAR(60) PRIMARY KEY,
  category_id   INTEGER REFERENCES bitrix_categorias_novonet(id) ON DELETE CASCADE,
  nombre        VARCHAR(200) NOT NULL,
  sort          INTEGER DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bitrix_usuarios_novonet (
  id              INTEGER PRIMARY KEY,
  nombre_completo VARCHAR(200),
  activo          BOOLEAN DEFAULT true,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bitrix_deals_novonet (
  id                    INTEGER PRIMARY KEY,
  titulo                VARCHAR(500),
  category_id           INTEGER,
  stage_id              VARCHAR(60),
  asesor_id             INTEGER,
  contact_id            INTEGER,
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

CREATE INDEX IF NOT EXISTS idx_bitrix_deals_novonet_fecha     ON bitrix_deals_novonet(fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_bitrix_deals_novonet_category  ON bitrix_deals_novonet(category_id);
CREATE INDEX IF NOT EXISTS idx_bitrix_deals_novonet_stage     ON bitrix_deals_novonet(stage_id);
CREATE INDEX IF NOT EXISTS idx_bitrix_deals_novonet_asesor    ON bitrix_deals_novonet(asesor_id);
CREATE INDEX IF NOT EXISTS idx_bitrix_deals_novonet_contact   ON bitrix_deals_novonet(contact_id);
