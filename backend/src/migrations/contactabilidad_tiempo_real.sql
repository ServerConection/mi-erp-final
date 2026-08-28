-- =============================================================================
-- CONTACTABILIDAD — Tiempo real, severidad y filtros operativos
-- Idempotente. Ejecutar en pgAdmin sobre bddgeneral DESPUES de contactabilidad.sql
-- No borra datos ni toca tablas ajenas al modulo.
-- =============================================================================

BEGIN;

-- 1) Umbrales de severidad configurables (minutos sin respuesta del asesor).
ALTER TABLE contactabilidad_config
  ADD COLUMN IF NOT EXISTS sla_alerta_minutos  INTEGER NOT NULL DEFAULT 15 CHECK (sla_alerta_minutos  > 0),
  ADD COLUMN IF NOT EXISTS sla_grave_minutos   INTEGER NOT NULL DEFAULT 30 CHECK (sla_grave_minutos   > 0),
  ADD COLUMN IF NOT EXISTS sla_critico_minutos INTEGER NOT NULL DEFAULT 60 CHECK (sla_critico_minutos > 0),
  ADD COLUMN IF NOT EXISTS tiempo_real_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ventana_activa_horas INTEGER NOT NULL DEFAULT 48 CHECK (ventana_activa_horas > 0);

ALTER TABLE contactabilidad_config
  DROP CONSTRAINT IF EXISTS chk_contactabilidad_sla_orden;
ALTER TABLE contactabilidad_config
  ADD CONSTRAINT chk_contactabilidad_sla_orden
  CHECK (sla_alerta_minutos <= sla_grave_minutos AND sla_grave_minutos <= sla_critico_minutos);

-- 2) chat_id en el lead: permite refrescar un chat puntual sin recorrer Bitrix entero
--    y resolver el lead cuando llega un evento de mensaje por webhook.
ALTER TABLE contactabilidad_leads
  ADD COLUMN IF NOT EXISTS chat_id            VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ultimo_evento_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS origen_ultimo_dato VARCHAR(15)
    CHECK (origen_ultimo_dato IS NULL OR origen_ultimo_dato IN ('CRON','WEBHOOK','MANUAL','BACKFILL'));

CREATE INDEX IF NOT EXISTS idx_contactabilidad_leads_chat
  ON contactabilidad_leads (empresa, chat_id)
  WHERE chat_id IS NOT NULL;

-- Cola de trabajo del cron corto: leads "vivos" ordenados por ultima actividad.
CREATE INDEX IF NOT EXISTS idx_contactabilidad_leads_actividad
  ON contactabilidad_leads (empresa, ultimo_mensaje_cliente_at DESC NULLS LAST, ultimo_mensaje_asesor_at DESC NULLS LAST);

-- Semaforo operativo: pendientes del asesor ordenados por antiguedad de espera.
CREATE INDEX IF NOT EXISTS idx_contactabilidad_leads_espera
  ON contactabilidad_leads (empresa, ultimo_mensaje_cliente_at)
  WHERE pendiente_por = 'ASESOR';

-- 3) Trazabilidad del origen de cada ciclo (cron largo, cron corto, webhook, manual).
ALTER TABLE contactabilidad_sync_runs
  ADD COLUMN IF NOT EXISTS origen VARCHAR(15) NOT NULL DEFAULT 'CRON'
    CHECK (origen IN ('CRON','CRON_CORTO','WEBHOOK','MANUAL','BACKFILL')),
  ADD COLUMN IF NOT EXISTS disparado_por VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_contactabilidad_sync_origen
  ON contactabilidad_sync_runs (origen, iniciado_at DESC);

-- 4) Inbox de eventos Bitrix: idempotencia real del webhook.
--    Un mismo evento reenviado por Bitrix no duplica mensajes ni recalculos.
CREATE TABLE IF NOT EXISTS contactabilidad_eventos_inbox (
  id             BIGSERIAL PRIMARY KEY,
  empresa        VARCHAR(20) NOT NULL CHECK (empresa IN ('NOVONET', 'VELSA')),
  evento         VARCHAR(120) NOT NULL,
  huella         VARCHAR(200) NOT NULL,
  chat_id        VARCHAR(100),
  id_bitrix      VARCHAR(50),
  estado         VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE'
                   CHECK (estado IN ('PENDIENTE','PROCESADO','IGNORADO','FALLIDO')),
  intentos       SMALLINT NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  error_detalle  TEXT,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  recibido_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  procesado_at   TIMESTAMPTZ,
  CONSTRAINT uq_contactabilidad_evento UNIQUE (empresa, evento, huella)
);

CREATE INDEX IF NOT EXISTS idx_contactabilidad_eventos_pendientes
  ON contactabilidad_eventos_inbox (recibido_at)
  WHERE estado IN ('PENDIENTE','FALLIDO');

CREATE INDEX IF NOT EXISTS idx_contactabilidad_eventos_chat
  ON contactabilidad_eventos_inbox (empresa, chat_id, recibido_at DESC);

-- 5) Vistas guardadas del tablero (presets compartibles por usuario).
CREATE TABLE IF NOT EXISTS contactabilidad_vistas (
  id            BIGSERIAL PRIMARY KEY,
  usuario       VARCHAR(255) NOT NULL,
  nombre        VARCHAR(120) NOT NULL,
  filtros       JSONB NOT NULL DEFAULT '{}'::jsonb,
  compartida    BOOLEAN NOT NULL DEFAULT FALSE,
  creado_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_contactabilidad_vista UNIQUE (usuario, nombre)
);

CREATE INDEX IF NOT EXISTS idx_contactabilidad_vistas_compartidas
  ON contactabilidad_vistas (compartida, nombre)
  WHERE compartida = TRUE;

-- 6) Backfill: chat_id de los mensajes ya ingeridos hacia el lead.
UPDATE contactabilidad_leads l
SET chat_id = m.chat_id
FROM (
  SELECT DISTINCT ON (empresa, id_bitrix) empresa, id_bitrix, chat_id
  FROM contactabilidad_mensajes
  ORDER BY empresa, id_bitrix, mensaje_at DESC
) m
WHERE l.empresa = m.empresa AND l.id_bitrix = m.id_bitrix
  AND l.chat_id IS DISTINCT FROM m.chat_id;

COMMENT ON TABLE contactabilidad_eventos_inbox IS 'Eventos Bitrix recibidos por webhook; la unicidad (empresa,evento,huella) garantiza idempotencia';
COMMENT ON TABLE contactabilidad_vistas IS 'Filtros guardados del tablero de Contactabilidad';
COMMENT ON COLUMN contactabilidad_leads.chat_id IS 'Chat de Open Lines asociado; permite refresco puntual sin recorrer todo el CRM';
COMMENT ON COLUMN contactabilidad_leads.origen_ultimo_dato IS 'Que actualizo por ultima vez el lead: CRON, WEBHOOK, MANUAL o BACKFILL';

COMMIT;
