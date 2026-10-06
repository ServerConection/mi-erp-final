-- ============================================================================
-- PANEL "REPARTO DE GESTIONABLES" — Base: erp_database
-- Correr a mano en pgAdmin (conectado a erp_database). Seguro de re-ejecutar.
--
-- 1) gestionables_reparto_config: interruptores del reparto que se manejan
--    desde el panel del ERP (encender/apagar, solo asesores en línea).
-- 2) gestionables_reparto_eventos: historial de quién cambió qué y cuándo.
-- ============================================================================
CREATE TABLE IF NOT EXISTS gestionables_reparto_config (
    id               INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- una sola fila
    activo           BOOLEAN     NOT NULL DEFAULT TRUE,
    solo_en_linea    BOOLEAN     NOT NULL DEFAULT TRUE,
    actualizado_por  VARCHAR(150),
    actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO gestionables_reparto_config (id, activo, solo_en_linea, actualizado_por)
VALUES (1, TRUE, TRUE, 'instalacion')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS gestionables_reparto_eventos (
    id          SERIAL       PRIMARY KEY,
    campo       VARCHAR(30)  NOT NULL,   -- 'activo' | 'solo_en_linea'
    valor       BOOLEAN      NOT NULL,
    usuario     VARCHAR(150),
    creado_en   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Acelera el reporte por hora del panel.
CREATE INDEX IF NOT EXISTS idx_gestionables_asig_fecha_creado
    ON gestionables_asignaciones (fecha, creado_en);
