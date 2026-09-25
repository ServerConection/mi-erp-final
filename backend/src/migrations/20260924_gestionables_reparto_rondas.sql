-- ============================================================================
-- REPARTO DE GESTIONABLES POR RONDAS — Base: erp_database
-- Correr a mano en pgAdmin (conectado a erp_database). Seguro de re-ejecutar.
--
-- Cada fila = 1 lead de CONTACTO NUEVO (NETLIFE NUEVO) repartido por el
-- webhook /bitrix_webhook_gestionables.php. De aquí sale cuántos lleva cada
-- asesor HOY (la "ronda"), sin depender del conteo de bitrix_webhook_leads,
-- que puede llegar con retraso.
-- ============================================================================
CREATE TABLE IF NOT EXISTS gestionables_asignaciones (
    id                 SERIAL PRIMARY KEY,
    fecha              DATE         NOT NULL,
    bitrix_deal_id     VARCHAR(30)  NOT NULL,
    asesor_asignado    VARCHAR(150) NOT NULL,
    bitrix_user_id     INTEGER,
    asesor_original    VARCHAR(150),          -- el responsable con el que llegó el lead
    ronda              INTEGER      NOT NULL, -- 1 = su primer lead del día, 2 = segundo...
    creado_en          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    -- Un lead se reparte UNA sola vez por día (si vuelve a entrar a la etapa,
    -- se respeta la asignación ya hecha).
    CONSTRAINT uq_gestionables_asig_deal_fecha UNIQUE (fecha, bitrix_deal_id)
);

CREATE INDEX IF NOT EXISTS idx_gestionables_asig_fecha_asesor
    ON gestionables_asignaciones (fecha, asesor_asignado);

-- Verificación: reparto de hoy por asesor
-- SELECT asesor_asignado, COUNT(*) AS recibidos, MAX(creado_en) AS ultimo
--   FROM gestionables_asignaciones
--  WHERE fecha = (NOW() AT TIME ZONE 'America/Guayaquil')::date
--  GROUP BY 1 ORDER BY 2 DESC;
