-- =============================================================================
-- CONTACTABILIDAD BOT AUDITOR — Esquema PostgreSQL idempotente
-- Empresas: NOVONET y VELSA
-- Histórico inicial: 2026-07-01
-- Ejecutar completo en pgAdmin sobre la base bddgeneral.
-- No modifica auditorias, messages ni conversations.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS contactabilidad_config (
  id                         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  intervalo_ingesta_minutos  INTEGER NOT NULL DEFAULT 15 CHECK (intervalo_ingesta_minutos > 0),
  intervalo_tablero_minutos  INTEGER NOT NULL DEFAULT 30 CHECK (intervalo_tablero_minutos > 0),
  alerta_asesor_minutos       INTEGER NOT NULL DEFAULT 30 CHECK (alerta_asesor_minutos > 0),
  fecha_desde                 DATE NOT NULL DEFAULT DATE '2026-07-01',
  actualizado_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_por             VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS contactabilidad_leads (
  empresa                         VARCHAR(20) NOT NULL CHECK (empresa IN ('NOVONET', 'VELSA')),
  id_bitrix                       VARCHAR(50) NOT NULL,
  nombre_cliente                  VARCHAR(255),
  asesor_id                       VARCHAR(50),
  asesor_nombre                   VARCHAR(255),
  origen_id                       VARCHAR(100),
  origen_nombre                   VARCHAR(255),
  fecha_creacion                  TIMESTAMPTZ,
  etapa_id                        VARCHAR(100),
  etapa_nombre                    VARCHAR(255),
  etapa_ingreso_at                TIMESTAMPTZ,
  mensajes_cliente_total          INTEGER NOT NULL DEFAULT 0 CHECK (mensajes_cliente_total >= 0),
  mensajes_asesor_total           INTEGER NOT NULL DEFAULT 0 CHECK (mensajes_asesor_total >= 0),
  mensajes_cliente_etapa          INTEGER NOT NULL DEFAULT 0 CHECK (mensajes_cliente_etapa >= 0),
  mensajes_asesor_etapa           INTEGER NOT NULL DEFAULT 0 CHECK (mensajes_asesor_etapa >= 0),
  primer_mensaje_cliente_at       TIMESTAMPTZ,
  primera_respuesta_asesor_at     TIMESTAMPTZ,
  ultimo_mensaje_cliente_at       TIMESTAMPTZ,
  ultimo_mensaje_asesor_at        TIMESTAMPTZ,
  tiempo_primera_respuesta_seg    BIGINT CHECK (tiempo_primera_respuesta_seg IS NULL OR tiempo_primera_respuesta_seg >= 0),
  tiempo_respuesta_promedio_seg   BIGINT CHECK (tiempo_respuesta_promedio_seg IS NULL OR tiempo_respuesta_promedio_seg >= 0),
  tiempo_respuesta_maximo_seg     BIGINT CHECK (tiempo_respuesta_maximo_seg IS NULL OR tiempo_respuesta_maximo_seg >= 0),
  pendiente_por                   VARCHAR(10) CHECK (pendiente_por IS NULL OR pendiente_por IN ('CLIENTE', 'ASESOR')),
  temperatura                     VARCHAR(10) CHECK (temperatura IS NULL OR temperatura IN ('FRIO', 'TIBIO', 'CALIENTE')),
  ultima_sincronizacion_at        TIMESTAMPTZ,
  creado_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa, id_bitrix)
);

CREATE TABLE IF NOT EXISTS contactabilidad_mensajes (
  id                    BIGSERIAL PRIMARY KEY,
  empresa               VARCHAR(20) NOT NULL CHECK (empresa IN ('NOVONET', 'VELSA')),
  id_bitrix             VARCHAR(50) NOT NULL,
  chat_id               VARCHAR(100) NOT NULL,
  mensaje_externo_id    VARCHAR(255) NOT NULL,
  emisor_tipo           VARCHAR(10) NOT NULL CHECK (emisor_tipo IN ('CLIENTE', 'ASESOR')),
  emisor_id             VARCHAR(100),
  emisor_nombre         VARCHAR(255),
  mensaje_at            TIMESTAMPTZ NOT NULL,
  etapa_id              VARCHAR(100),
  etapa_nombre          VARCHAR(255),
  canal                 VARCHAR(100),
  texto_anonimizado     TEXT,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_contactabilidad_mensaje_lead
    FOREIGN KEY (empresa, id_bitrix)
    REFERENCES contactabilidad_leads (empresa, id_bitrix)
    ON DELETE CASCADE,
  CONSTRAINT uq_contactabilidad_mensaje
    UNIQUE (empresa, chat_id, mensaje_externo_id)
);

CREATE TABLE IF NOT EXISTS contactabilidad_etapas (
  id                       BIGSERIAL PRIMARY KEY,
  empresa                  VARCHAR(20) NOT NULL CHECK (empresa IN ('NOVONET', 'VELSA')),
  id_bitrix                VARCHAR(50) NOT NULL,
  etapa_id                 VARCHAR(100) NOT NULL,
  etapa_nombre             VARCHAR(255),
  ingreso_at               TIMESTAMPTZ NOT NULL,
  salida_at                TIMESTAMPTZ,
  mensajes_cliente         INTEGER NOT NULL DEFAULT 0 CHECK (mensajes_cliente >= 0),
  mensajes_asesor          INTEGER NOT NULL DEFAULT 0 CHECK (mensajes_asesor >= 0),
  creado_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_contactabilidad_etapa_lead
    FOREIGN KEY (empresa, id_bitrix)
    REFERENCES contactabilidad_leads (empresa, id_bitrix)
    ON DELETE CASCADE,
  CONSTRAINT chk_contactabilidad_etapa_fechas
    CHECK (salida_at IS NULL OR salida_at >= ingreso_at),
  CONSTRAINT uq_contactabilidad_periodo_etapa
    UNIQUE (empresa, id_bitrix, etapa_id, ingreso_at)
);

CREATE TABLE IF NOT EXISTS contactabilidad_snapshots (
  id                         BIGSERIAL PRIMARY KEY,
  empresa                    VARCHAR(20) NOT NULL CHECK (empresa IN ('NOVONET', 'VELSA')),
  id_bitrix                  VARCHAR(50) NOT NULL,
  snapshot_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  etapa_id                   VARCHAR(100),
  origen_nombre              VARCHAR(255),
  asesor_id                  VARCHAR(50),
  mensajes_cliente_total     INTEGER NOT NULL DEFAULT 0 CHECK (mensajes_cliente_total >= 0),
  mensajes_asesor_total      INTEGER NOT NULL DEFAULT 0 CHECK (mensajes_asesor_total >= 0),
  pendiente_por              VARCHAR(10) CHECK (pendiente_por IS NULL OR pendiente_por IN ('CLIENTE', 'ASESOR')),
  temperatura                VARCHAR(10) CHECK (temperatura IS NULL OR temperatura IN ('FRIO', 'TIBIO', 'CALIENTE')),
  CONSTRAINT fk_contactabilidad_snapshot_lead
    FOREIGN KEY (empresa, id_bitrix)
    REFERENCES contactabilidad_leads (empresa, id_bitrix)
    ON DELETE CASCADE,
  CONSTRAINT uq_contactabilidad_snapshot
    UNIQUE (empresa, id_bitrix, snapshot_at)
);

CREATE TABLE IF NOT EXISTS contactabilidad_sync_runs (
  id                    BIGSERIAL PRIMARY KEY,
  empresa               VARCHAR(20) NOT NULL CHECK (empresa IN ('NOVONET', 'VELSA')),
  iniciado_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalizado_at         TIMESTAMPTZ,
  estado                VARCHAR(10) NOT NULL DEFAULT 'ACTIVO'
                          CHECK (estado IN ('ACTIVO', 'COMPLETO', 'PARCIAL', 'FALLIDO')),
  leads_leidos          INTEGER NOT NULL DEFAULT 0 CHECK (leads_leidos >= 0),
  leads_actualizados    INTEGER NOT NULL DEFAULT 0 CHECK (leads_actualizados >= 0),
  mensajes_leidos       INTEGER NOT NULL DEFAULT 0 CHECK (mensajes_leidos >= 0),
  mensajes_insertados   INTEGER NOT NULL DEFAULT 0 CHECK (mensajes_insertados >= 0),
  mensajes_omitidos     INTEGER NOT NULL DEFAULT 0 CHECK (mensajes_omitidos >= 0),
  error_resumen         TEXT,
  CONSTRAINT chk_contactabilidad_sync_fechas
    CHECK (finalizado_at IS NULL OR finalizado_at >= iniciado_at)
);

CREATE TABLE IF NOT EXISTS contactabilidad_alertas (
  id                    BIGSERIAL PRIMARY KEY,
  empresa               VARCHAR(20) NOT NULL CHECK (empresa IN ('NOVONET', 'VELSA')),
  id_bitrix             VARCHAR(50) NOT NULL,
  tipo                  VARCHAR(50) NOT NULL CHECK (tipo IN ('ASESOR_SIN_RESPONDER')),
  abierta_at            TIMESTAMPTZ NOT NULL,
  cerrada_at            TIMESTAMPTZ,
  estado                VARCHAR(10) NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA', 'CERRADA')),
  umbral_minutos        INTEGER NOT NULL CHECK (umbral_minutos > 0),
  detalle               JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT fk_contactabilidad_alerta_lead
    FOREIGN KEY (empresa, id_bitrix)
    REFERENCES contactabilidad_leads (empresa, id_bitrix)
    ON DELETE CASCADE,
  CONSTRAINT chk_contactabilidad_alerta_fechas
    CHECK (cerrada_at IS NULL OR cerrada_at >= abierta_at)
);

CREATE INDEX IF NOT EXISTS idx_contactabilidad_leads_etapa
  ON contactabilidad_leads (empresa, etapa_id);
CREATE INDEX IF NOT EXISTS idx_contactabilidad_leads_origen
  ON contactabilidad_leads (empresa, origen_nombre);
CREATE INDEX IF NOT EXISTS idx_contactabilidad_leads_asesor
  ON contactabilidad_leads (empresa, asesor_id);
CREATE INDEX IF NOT EXISTS idx_contactabilidad_leads_creacion
  ON contactabilidad_leads (empresa, fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_contactabilidad_leads_pendiente
  ON contactabilidad_leads (empresa, pendiente_por, ultimo_mensaje_cliente_at DESC);
CREATE INDEX IF NOT EXISTS idx_contactabilidad_mensajes_lead_fecha
  ON contactabilidad_mensajes (empresa, id_bitrix, mensaje_at);
CREATE INDEX IF NOT EXISTS idx_contactabilidad_mensajes_emisor
  ON contactabilidad_mensajes (empresa, emisor_tipo, mensaje_at DESC);
CREATE INDEX IF NOT EXISTS idx_contactabilidad_etapas_abiertas
  ON contactabilidad_etapas (empresa, etapa_id, ingreso_at DESC)
  WHERE salida_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_contactabilidad_etapa_abierta
  ON contactabilidad_etapas (empresa, id_bitrix)
  WHERE salida_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contactabilidad_snapshots_fecha
  ON contactabilidad_snapshots (empresa, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_contactabilidad_sync_empresa_fecha
  ON contactabilidad_sync_runs (empresa, iniciado_at DESC);
CREATE INDEX IF NOT EXISTS idx_contactabilidad_alertas_abiertas
  ON contactabilidad_alertas (empresa, abierta_at DESC)
  WHERE estado = 'ABIERTA';
CREATE UNIQUE INDEX IF NOT EXISTS uq_contactabilidad_alerta_abierta
  ON contactabilidad_alertas (empresa, id_bitrix, tipo)
  WHERE estado = 'ABIERTA';

INSERT INTO contactabilidad_config
  (id, intervalo_ingesta_minutos, intervalo_tablero_minutos, alerta_asesor_minutos, fecha_desde)
VALUES (1, 15, 30, 30, DATE '2026-07-01')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE contactabilidad_config IS 'Configuración única del recolector y tablero de Contactabilidad';
COMMENT ON TABLE contactabilidad_leads IS 'Estado consolidado por empresa y negociación Bitrix';
COMMENT ON TABLE contactabilidad_mensajes IS 'Mensajes Bitrix deduplicados; no guarda teléfono ni texto original';
COMMENT ON COLUMN contactabilidad_mensajes.texto_anonimizado IS 'Contenido opcional sin datos personales para análisis semántico';
COMMENT ON TABLE contactabilidad_etapas IS 'Periodos históricos de permanencia del lead en cada etapa';
COMMENT ON TABLE contactabilidad_snapshots IS 'Resumen periódico para tendencias históricas';
COMMENT ON TABLE contactabilidad_sync_runs IS 'Bitácora de ciclos del recolector Bitrix';
COMMENT ON TABLE contactabilidad_alertas IS 'Alertas operativas; no ejecutan envíos ni reasignaciones';

COMMIT;

