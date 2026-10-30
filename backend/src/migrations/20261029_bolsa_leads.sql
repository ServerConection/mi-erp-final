-- ============================================================================
-- BOLSA LEADS — distribución de la pauta entre NOVONET y VELSA
-- Base: erp_database (¡no bddgeneral!). Correr a mano en pgAdmin ANTES del deploy.
-- Seguro de re-ejecutar. No toca ninguna tabla existente.
-- Arranca APAGADA: se enciende desde el módulo "Bolsa Leads" del ERP.
-- ============================================================================

-- 1) Configuración (una sola fila, id = 1)
CREATE TABLE IF NOT EXISTS bolsa_leads_config (
    id                 INTEGER      PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    activo             BOOLEAN      NOT NULL DEFAULT FALSE,
    modo               VARCHAR(20)  NOT NULL DEFAULT 'proporcion'
                       CHECK (modo IN ('proporcion', 'solo_novonet', 'solo_velsa')),
    patron             VARCHAR(50)  NOT NULL DEFAULT 'NVNVNNVNVN' CHECK (patron ~ '^[NV]{1,50}$'),
    posicion           INTEGER      NOT NULL DEFAULT 0,   -- casilla del ciclo que toca (0 = la 1)
    encadenar_reparto  BOOLEAN      NOT NULL DEFAULT TRUE, -- al entregar, llamar al repartidor de la empresa
    categoria_origen   INTEGER      NOT NULL DEFAULT 43,   -- pipeline "Bolsa Leads" en Bitrix
    actualizado_por    VARCHAR(150),
    actualizado_en     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
INSERT INTO bolsa_leads_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 2) Cada lead que pasó por la bolsa (entregado / error / omitido)
CREATE TABLE IF NOT EXISTS bolsa_leads_entregas (
    id                 SERIAL       PRIMARY KEY,
    bitrix_deal_id     VARCHAR(30)  NOT NULL,
    empresa            VARCHAR(20),                       -- novonet | velsa
    casilla            INTEGER,                           -- 1..N del ciclo (NULL en modo "solo una empresa")
    modo               VARCHAR(20),
    estado             VARCHAR(20)  NOT NULL,             -- entregado | error | omitido
    detalle            TEXT,
    reparto_resultado  TEXT,                              -- respuesta del repartidor de asesores
    origen             VARCHAR(20)  NOT NULL DEFAULT 'webhook', -- webhook | manual | pendientes
    creado_en          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bolsa_leads_entregado
    ON bolsa_leads_entregas (bitrix_deal_id) WHERE estado = 'entregado';
CREATE INDEX IF NOT EXISTS idx_bolsa_leads_fecha ON bolsa_leads_entregas (creado_en DESC);

-- 3) Quién cambió qué en la configuración
CREATE TABLE IF NOT EXISTS bolsa_leads_eventos (
    id         SERIAL       PRIMARY KEY,
    campo      VARCHAR(40)  NOT NULL,
    valor      TEXT,
    usuario    VARCHAR(150),
    creado_en  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
