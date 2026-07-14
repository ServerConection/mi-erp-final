-- ============================================================================
-- GESTIONABLES ASESORES — cupo diario de "gestionables permitidos" por asesor
-- Base: erp_database (mismo servidor Postgres de Render que bddgeneral)
--
-- Se carga por script (uno o varios registros por asesor y día). El backend
-- lee de aquí el cupo más reciente <= hoy para un asesor cuando Bitrix24
-- reporta que una negociación entró a la etapa CONTACTO NUEVO del pipeline
-- NETLIFE NUEVO, y lo escribe en el campo personalizado del deal.
--
-- Seguro de volver a correr: usa IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- ============================================================================

CREATE TABLE IF NOT EXISTS gestionables_asesores (
    id                       SERIAL PRIMARY KEY,
    nombre_bitrix_asesor     VARCHAR(150) NOT NULL,
    gestionables_permitidos  INTEGER      NOT NULL,
    fecha_carga              DATE         NOT NULL,
    creado_en                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Un asesor solo puede tener UNA carga por día (el script que carga los
    -- datos puede volver a correr sin duplicar filas).
    CONSTRAINT uq_gestionables_asesor_fecha UNIQUE (nombre_bitrix_asesor, fecha_carga)
);

-- Acelera la consulta "último cupo <= hoy para este asesor" que hace el webhook.
CREATE INDEX IF NOT EXISTS idx_gestionables_asesor_fecha
    ON gestionables_asesores (nombre_bitrix_asesor, fecha_carga DESC);

-- Registros de ejemplo (no rompe nada si ya existen: ON CONFLICT DO NOTHING).
INSERT INTO gestionables_asesores (nombre_bitrix_asesor, gestionables_permitidos, fecha_carga)
VALUES
    ('GRACE ARIAS NARVAEZ',              3, '2026-07-13'),
    ('JOMAIRA CRISTIANA LEITON RIZZO',   4, '2026-07-13')
ON CONFLICT (nombre_bitrix_asesor, fecha_carga) DO NOTHING;

-- ============================================================================
-- Tabla de trazabilidad: cada vez que Bitrix dispara el webhook de
-- "gestionables", queda 1 fila acá (encontrado o no, y qué se escribió).
-- Igual que bitrix_webhook_leads_historial: nunca se sobreescribe.
-- ============================================================================
CREATE TABLE IF NOT EXISTS gestionables_webhook_log (
    id                       SERIAL PRIMARY KEY,
    bitrix_id                VARCHAR(30)  NOT NULL,
    nombre_asesor            VARCHAR(150),
    gestionables_permitidos  INTEGER,
    encontrado               BOOLEAN      NOT NULL DEFAULT FALSE,
    actualizado_en_bitrix    BOOLEAN      NOT NULL DEFAULT FALSE,
    error                    TEXT,
    creado_en                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gestionables_log_bitrix_id
    ON gestionables_webhook_log (bitrix_id, creado_en DESC);
