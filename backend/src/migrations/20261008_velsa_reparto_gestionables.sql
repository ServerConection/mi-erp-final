-- ============================================================================
-- REPARTO DE GESTIONABLES — VELSA (tablas propias, Novonet no se toca)
-- Base: erp_database (¡no bddgeneral!). Correr a mano en pgAdmin ANTES del deploy.
-- Seguro de re-ejecutar.
--
-- Mismas columnas que las tablas de Novonet, con prefijo velsa_. El reparto de
-- Velsa queda APAGADO hasta que se configure la estación y se encienda en el panel.
-- ============================================================================

-- 1) Cupos por asesor y día (incluye % ATC máximo)
CREATE TABLE IF NOT EXISTS velsa_gestionables_asesores (
    id                       SERIAL PRIMARY KEY,
    nombre_bitrix_asesor     VARCHAR(150) NOT NULL,
    gestionables_permitidos  INTEGER      NOT NULL,
    fecha_carga              DATE         NOT NULL,
    porcentaje_atc_max       INTEGER      NOT NULL DEFAULT 50 CHECK (porcentaje_atc_max BETWEEN 0 AND 100),
    creado_en                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_velsa_gest_asesor_fecha UNIQUE (nombre_bitrix_asesor, fecha_carga)
);
CREATE INDEX IF NOT EXISTS idx_velsa_gest_asesor_fecha ON velsa_gestionables_asesores (nombre_bitrix_asesor, fecha_carga DESC);

-- 2) Log del webhook
CREATE TABLE IF NOT EXISTS velsa_gestionables_webhook_log (
    id                       SERIAL PRIMARY KEY,
    bitrix_id                VARCHAR(30),
    nombre_asesor            VARCHAR(150),
    gestionables_permitidos  INTEGER,
    encontrado               BOOLEAN      NOT NULL DEFAULT FALSE,
    actualizado_en_bitrix    BOOLEAN      NOT NULL DEFAULT FALSE,
    error                    TEXT,
    creado_en                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_velsa_gest_log_bitrix ON velsa_gestionables_webhook_log (bitrix_id, creado_en DESC);

-- 3) Asignaciones (bot / humano)
CREATE TABLE IF NOT EXISTS velsa_gestionables_asignaciones (
    id                 SERIAL PRIMARY KEY,
    fecha              DATE         NOT NULL,
    bitrix_deal_id     VARCHAR(30)  NOT NULL,
    asesor_asignado    VARCHAR(150) NOT NULL,
    bitrix_user_id     INTEGER,
    asesor_original    VARCHAR(150),
    ronda              INTEGER      NOT NULL,
    origen             VARCHAR(10)  NOT NULL DEFAULT 'directo',
    vigente            BOOLEAN      NOT NULL DEFAULT TRUE,
    reasignado_a       VARCHAR(150),
    reasignado_en      TIMESTAMPTZ,
    creado_en          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_velsa_gest_asig_deal_fecha_vigente ON velsa_gestionables_asignaciones (fecha, bitrix_deal_id) WHERE vigente;
CREATE INDEX IF NOT EXISTS idx_velsa_gest_asig_fecha_asesor ON velsa_gestionables_asignaciones (fecha, asesor_asignado);
CREATE INDEX IF NOT EXISTS idx_velsa_gest_asig_fecha_creado ON velsa_gestionables_asignaciones (fecha, creado_en);

-- 4) Cola de la estación
CREATE TABLE IF NOT EXISTS velsa_gestionables_cola (
    id                   SERIAL       PRIMARY KEY,
    bitrix_deal_id       VARCHAR(30)  NOT NULL,
    motivo               VARCHAR(30)  NOT NULL,
    responsable_original VARCHAR(150),
    estado               VARCHAR(15)  NOT NULL DEFAULT 'pendiente',
    asesor_asignado      VARCHAR(150),
    nota                 TEXT,
    creado_en            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    resuelto_en          TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_velsa_gest_cola_pendiente ON velsa_gestionables_cola (bitrix_deal_id) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_velsa_gest_cola_estado_creado ON velsa_gestionables_cola (estado, creado_en);

-- 5) Configuración (una fila) — arranca APAGADO
CREATE TABLE IF NOT EXISTS velsa_gestionables_reparto_config (
    id               INTEGER      PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    activo           BOOLEAN      NOT NULL DEFAULT FALSE,
    solo_en_linea    BOOLEAN      NOT NULL DEFAULT TRUE,
    hora_inicio      VARCHAR(8)   NOT NULL DEFAULT '08:00:00',
    hora_fin         VARCHAR(8)   NOT NULL DEFAULT '22:15:59',
    estacion_nombre  VARCHAR(150) NOT NULL DEFAULT 'BRYAN PINEDA',
    actualizado_por  VARCHAR(150),
    actualizado_en   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
INSERT INTO velsa_gestionables_reparto_config (id, activo, actualizado_por)
VALUES (1, FALSE, 'instalacion') ON CONFLICT (id) DO NOTHING;

-- 6) Historial de encendido/apagado
CREATE TABLE IF NOT EXISTS velsa_gestionables_reparto_eventos (
    id          SERIAL       PRIMARY KEY,
    campo       VARCHAR(30)  NOT NULL,
    valor       BOOLEAN      NOT NULL,
    usuario     VARCHAR(150),
    creado_en   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Verificación
-- SELECT activo, estacion_nombre, hora_inicio, hora_fin FROM velsa_gestionables_reparto_config;
