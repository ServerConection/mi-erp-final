-- ============================================================================
-- REPARTO DE GESTIONABLES — SEMILLERO (pipeline 41, tablas propias)
-- Correr en **erp_database**. Seguro de volver a correr.
-- Copia la estructura de las tablas de Velsa (mismas columnas, índices y
-- restricciones), con su propia secuencia de IDs. No toca Novonet ni Velsa.
-- El reparto de Semillero queda APAGADO hasta encenderlo en su panel.
-- ============================================================================
DO $$
DECLARE
  t   text;
  seq text;
BEGIN
  FOREACH t IN ARRAY ARRAY['gestionables_asesores', 'gestionables_webhook_log', 'gestionables_asignaciones',
                           'gestionables_cola', 'gestionables_reparto_config', 'gestionables_reparto_eventos'] LOOP
    IF to_regclass('semillero_' || t) IS NULL THEN
      EXECUTE format('CREATE TABLE %I (LIKE %I INCLUDING ALL)', 'semillero_' || t, 'velsa_' || t);
      -- La columna id copiada apunta a la secuencia de Velsa: se le da una propia
      IF EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'semillero_' || t AND column_name = 'id'
                    AND column_default LIKE 'nextval(%') THEN
        seq := 'semillero_' || t || '_id_seq';
        EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I OWNED BY %I.id', seq, 'semillero_' || t);
        EXECUTE format('ALTER TABLE %I ALTER COLUMN id SET DEFAULT nextval(%L)', 'semillero_' || t, seq);
      END IF;
    END IF;
  END LOOP;
END $$;

-- Configuración inicial (solo la primera vez): la de Velsa (horario, etc.), pero APAGADO
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM semillero_gestionables_reparto_config WHERE id = 1) THEN
    INSERT INTO semillero_gestionables_reparto_config
    SELECT * FROM velsa_gestionables_reparto_config WHERE id = 1;
    UPDATE semillero_gestionables_reparto_config
       SET activo = FALSE, estacion_nombre = 'BRYAN PINEDA',
           actualizado_por = 'instalacion', actualizado_en = NOW()
     WHERE id = 1;
  END IF;
END $$;

-- Verificación: 6 tablas y la configuración apagada
SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'semillero_gestionables_%' ORDER BY 1;
SELECT activo, estacion_nombre, hora_inicio, hora_fin FROM semillero_gestionables_reparto_config;
