-- ═══════════════════════════════════════════════════════════════════
-- LOTES DE LLAMADAS (Automarcador) — vincula negociaciones Bitrix con
-- el teléfono del contacto y permite armar una base filtrada por
-- responsable / fecha / etapa para cargarla al Automarcador externo.
-- Ejecutar una sola vez en la DB principal (bddgeneral, Render).
-- ═══════════════════════════════════════════════════════════════════

-- 1) Agregar contact_id a bitrix_deals (Bitrix sí lo trae en crm.deal.list,
--    pero el sync original no lo guardaba — ver bitrix.service.js)
ALTER TABLE bitrix_deals ADD COLUMN IF NOT EXISTS contact_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_bitrix_deals_contact ON bitrix_deals(contact_id);

-- 2) Lote = una "carga de base" que hace un supervisor con ciertos filtros
CREATE TABLE IF NOT EXISTS llamadas_lotes (
  id              SERIAL PRIMARY KEY,
  nombre          VARCHAR(200) NOT NULL,
  creado_por      INTEGER REFERENCES usuarios(id),
  filtros         JSONB DEFAULT '{}',   -- { responsable_id, desde, hasta, stage_id, category_id }
  total_items     INTEGER DEFAULT 0,
  creado_en       TIMESTAMPTZ DEFAULT NOW()
);

-- 3) Items del lote = cada negociación con su teléfono y el asesor
--    que el supervisor decide que debe hacer esa llamada
CREATE TABLE IF NOT EXISTS llamadas_lote_items (
  id              SERIAL PRIMARY KEY,
  lote_id         INTEGER REFERENCES llamadas_lotes(id) ON DELETE CASCADE,
  deal_id         INTEGER REFERENCES bitrix_deals(id),
  contact_id      INTEGER,
  nombre_cliente  VARCHAR(300),
  telefono        VARCHAR(60),
  etapa           VARCHAR(60),
  asesor_id       INTEGER REFERENCES bitrix_usuarios(id), -- quién hace la llamada (asesor identificado por su ID de Bitrix,
                                                            -- igual que lo reconoce el Automarcador vía agent.js en Bitrix24)
  estado          VARCHAR(30) DEFAULT 'pendiente',    -- pendiente | llamado | descartado
  creado_en       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lli_lote   ON llamadas_lote_items(lote_id);
CREATE INDEX IF NOT EXISTS idx_lli_asesor ON llamadas_lote_items(asesor_id);
CREATE INDEX IF NOT EXISTS idx_lli_deal   ON llamadas_lote_items(deal_id);
