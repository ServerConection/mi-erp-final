-- ============================================================================
-- ASIGNACION ASESOR -> SUPERVISOR (Novonet)
--
-- Tabla: public.empleados  (nombre_completo, supervisor, codigo)
--
-- COMO FUNCIONA:
--   El JOIN con mestra_bitrix es por NOMBRE EXACTO:
--       empleados.nombre_completo = mestra_bitrix.b_persona_responsable
--   Y hay UNA FILA POR ASESOR POR MES: la columna "codigo" es el numero de
--   mes. La consulta de Indicadores prefiere la fila cuyo codigo coincide con
--   el mes del lead (indicadores.controller.js, joinEmpleadosDedup):
--       CASE WHEN e2.codigo = EXTRACT(MONTH FROM fecha)::text THEN 0 ELSE 1 END
--       ORDER BY ... e2.codigo::int DESC
--   Si no hay fila para ese mes, cae a la de codigo mas alto.
--
-- CONSECUENCIA: si el nombre no coincide LETRA POR LETRA con el de Bitrix,
-- el asesor no engancha y sus leads aparecen en "SIN ASIGNAR".
--
-- Corre A1, A2 y A3 y pasame el resultado. Con eso genero el UPDATE correcto.
-- Base: bddgeneral
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- A1. Estructura real de la tabla empleados
-- ────────────────────────────────────────────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'empleados'
ORDER BY ordinal_position;


-- ────────────────────────────────────────────────────────────────────────────
-- A2. ⭐ NOMBRES REALES en Bitrix este mes + a que supervisor enganchan hoy
--
-- Esta es la lista que manda. El UPDATE se tiene que escribir con ESTOS
-- nombres, no con los del Excel.
--
-- Si "supervisor_actual" sale NULL, ese asesor esta cayendo en SIN ASIGNAR.
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    mb.b_persona_responsable                       AS nombre_en_bitrix,
    COUNT(*)::int                                  AS leads_agosto,
    e.supervisor                                   AS supervisor_actual,
    e.codigo                                       AS codigo_mes_usado
FROM public.mestra_bitrix mb
LEFT JOIN LATERAL (
    SELECT e2.supervisor, e2.codigo
    FROM public.empleados e2
    WHERE e2.nombre_completo = mb.b_persona_responsable
    ORDER BY
        CASE WHEN e2.codigo = EXTRACT(MONTH FROM CURRENT_DATE)::text THEN 0 ELSE 1 END,
        e2.codigo::int DESC
    LIMIT 1
) e ON TRUE
WHERE public.parse_fecha_flex(mb.b_creado_el_fecha::text)
      BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE
  AND NULLIF(TRIM(mb.b_persona_responsable), '') IS NOT NULL
GROUP BY 1, 3, 4
ORDER BY leads_agosto DESC;


-- ────────────────────────────────────────────────────────────────────────────
-- A3. Que hay hoy en empleados para el mes 8
-- ────────────────────────────────────────────────────────────────────────────
SELECT nombre_completo, supervisor, codigo
FROM public.empleados
WHERE codigo = '8'
ORDER BY supervisor, nombre_completo;


-- ────────────────────────────────────────────────────────────────────────────
-- A4. Asesores con leads pero SIN supervisor asignado
--     (los que hoy se ven como "SIN ASIGNAR")
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    mb.b_persona_responsable  AS nombre_en_bitrix,
    COUNT(*)::int             AS leads_agosto
FROM public.mestra_bitrix mb
WHERE public.parse_fecha_flex(mb.b_creado_el_fecha::text)
      BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE
  AND NULLIF(TRIM(mb.b_persona_responsable), '') IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.empleados e
      WHERE e.nombre_completo = mb.b_persona_responsable
        AND e.supervisor IS NOT NULL
  )
GROUP BY 1
ORDER BY leads_agosto DESC;


-- ────────────────────────────────────────────────────────────────────────────
-- A5. Buscador de coincidencias aproximadas
--
-- Cruza los nombres del Excel contra los de Bitrix ignorando segundos nombres.
-- Sirve para confirmar que "GERARDO CAJAMARCA" (Bitrix) es el mismo que
-- "GERARDO MARIANO CAJAMARCA VACA" (Excel).
-- ────────────────────────────────────────────────────────────────────────────
WITH del_excel(nombre_excel, supervisor) AS (VALUES
    ('ERICK LEONEL ENRIQUEZ RAMIREZ',      'ANDRES RODRIGUEZ'),
    ('JOMAIRA CRISTINA LEITON RIZZO',      'ANDRES RODRIGUEZ'),
    ('LEONARDO XAVIER CARLOSAMA TABANGO',  'ANDRES RODRIGUEZ'),
    ('OSCAR DANILO SANGUCHO SASIG',        'ANDRES RODRIGUEZ'),
    ('DAYANA GERALDINE RIVERA GONZALEZ',   'ANDRES RODRIGUEZ'),
    ('CHRISTIAN PONCE BAROJA',             'ANDRES RODRIGUEZ'),
    ('GENESIS CORALIA MARTINEZ OLVERA',    'ANDRES RODRIGUEZ'),
    ('GEOVANNY CARVAJAL',                  'ANDRES RODRIGUEZ'),
    ('SARA DANIELA CHIRIBOGA ESPINOZA',    'ANDRES RODRIGUEZ'),
    ('JESUS NARANJO',                      'ANDRES RODRIGUEZ'),
    ('GRACE SILVANA ARIAS NARVAEZ',        'JAVIER NAVARRETE'),
    ('MONICA ALEXANDRA PILCO QUINATOA',    'JAVIER NAVARRETE'),
    ('DIANA VALERIA TABANGO LANCHIMBA',    'JAVIER NAVARRETE'),
    ('ARIANNE EMPERATRIZ BELTRAN RANGEL',  'JAVIER NAVARRETE'),
    ('MONICA SOLEDAD QUILLAY GUAMAN',      'JAVIER NAVARRETE'),
    ('CRISTIAN GERARDO COLIMBA CAIZA',     'JAVIER NAVARRETE'),
    ('IXCHELL KRISTAL TORRES MARTINEZ',    'JAVIER NAVARRETE'),
    ('SHERLEY STEFANNY CHIRIBOGA CEVALLOS','JAVIER NAVARRETE'),
    ('JORGE PAREDES',                      'JAVIER NAVARRETE'),
    ('DIEGO BENITEZ',                      'JAVIER NAVARRETE'),
    ('GERARDO MARIANO CAJAMARCA VACA',     'JONATAN SIMBAÑA'),
    ('DIEGO XAVIER REYES PADILLA',         'JONATAN SIMBAÑA'),
    ('ALEXIS NAGUA',                       'JONATAN SIMBAÑA'),
    ('SERGIO DAVID ALMEIDA ARGOTI',        'JONATAN SIMBAÑA'),
    ('NATASHA MARCELA CALERO ESTACIO',     'JONATAN SIMBAÑA'),
    ('HILARY AIDE AYALA CRIBAN',           'JONATAN SIMBAÑA'),
    ('JENNY FERNANDA RODRIGUEZ GUAYCHA',   'JONATAN SIMBAÑA'),
    ('EDISON JOSHUA CAIZA HIDALGO',        'JONATAN SIMBAÑA'),
    ('TATIANNA DENNISE IBARRA JACOME',     'JONATAN SIMBAÑA'),
    ('MELANY QUIMBIULCO',                  'JONATAN SIMBAÑA')
),
en_bitrix AS (
    SELECT DISTINCT TRIM(b_persona_responsable) AS nombre_bitrix
    FROM public.mestra_bitrix
    WHERE public.parse_fecha_flex(b_creado_el_fecha::text)
          BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE
      AND NULLIF(TRIM(b_persona_responsable), '') IS NOT NULL
)
SELECT
    x.nombre_excel,
    x.supervisor,
    b.nombre_bitrix,
    CASE WHEN x.nombre_excel = b.nombre_bitrix THEN 'EXACTO'
         WHEN b.nombre_bitrix IS NULL          THEN 'SIN COINCIDENCIA'
         ELSE                                       'APROXIMADO - REVISAR'
    END AS tipo_match
FROM del_excel x
LEFT JOIN en_bitrix b
  -- coincide si comparten primer nombre Y primer apellido reconocible
  ON  split_part(x.nombre_excel, ' ', 1) = split_part(b.nombre_bitrix, ' ', 1)
  AND b.nombre_bitrix ILIKE '%' || split_part(reverse(x.nombre_excel), ' ', 1) || '%'
      IS NOT FALSE
  AND (
        b.nombre_bitrix ILIKE '%' || split_part(x.nombre_excel, ' ', 2) || '%'
     OR b.nombre_bitrix ILIKE '%' || split_part(x.nombre_excel, ' ', 3) || '%'
      )
ORDER BY tipo_match, x.supervisor, x.nombre_excel;
