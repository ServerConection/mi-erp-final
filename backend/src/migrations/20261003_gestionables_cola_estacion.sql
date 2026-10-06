-- ============================================================================
-- REPARTO DE GESTIONABLES — HORARIO + COLA DE LA ESTACIÓN
-- Base: erp_database (¡no bddgeneral!). Correr a mano en pgAdmin. Seguro de re-ejecutar.
--
-- Fuera del horario laboral, o cuando nadie puede recibir (nadie en línea o
-- todos en su límite), el lead se asigna a la "estación" (por defecto
-- BRYAN PINEDA) y queda en gestionables_cola. Desde las 08:00 la cola se
-- entrega por rondas a medida que los asesores se conectan.
-- ============================================================================

-- 1) Horario y estación configurables (una sola fila, ya existe)
ALTER TABLE gestionables_reparto_config ADD COLUMN IF NOT EXISTS hora_inicio     VARCHAR(8)   NOT NULL DEFAULT '08:00:00';
ALTER TABLE gestionables_reparto_config ADD COLUMN IF NOT EXISTS hora_fin        VARCHAR(8)   NOT NULL DEFAULT '22:15:59';
ALTER TABLE gestionables_reparto_config ADD COLUMN IF NOT EXISTS estacion_nombre VARCHAR(150) NOT NULL DEFAULT 'BRYAN PINEDA';

-- 2) Cola de leads en la estación
CREATE TABLE IF NOT EXISTS gestionables_cola (
    id                SERIAL       PRIMARY KEY,
    bitrix_deal_id    VARCHAR(30)  NOT NULL,
    motivo            VARCHAR(30)  NOT NULL,   -- fuera_de_horario | nadie_en_linea | todos_al_limite | cola_en_espera
    responsable_original VARCHAR(150),
    estado            VARCHAR(15)  NOT NULL DEFAULT 'pendiente', -- pendiente | entregado | descartado
    asesor_asignado   VARCHAR(150),
    nota              TEXT,
    creado_en         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    resuelto_en       TIMESTAMPTZ
);
-- Un deal solo puede estar UNA vez pendiente en la cola.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gestionables_cola_pendiente
    ON gestionables_cola (bitrix_deal_id) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_gestionables_cola_estado_creado
    ON gestionables_cola (estado, creado_en);

-- 3) Marcar si una asignación vino directo o desde la cola de la estación
ALTER TABLE gestionables_asignaciones ADD COLUMN IF NOT EXISTS origen VARCHAR(10) NOT NULL DEFAULT 'directo';

-- Verificación
-- SELECT hora_inicio, hora_fin, estacion_nombre FROM gestionables_reparto_config;
-- SELECT estado, COUNT(*) FROM gestionables_cola GROUP BY 1;
