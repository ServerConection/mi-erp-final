-- ============================================================================
-- ASIGNACION ASESOR -> SUPERVISOR — NOVONET, AGOSTO 2026 (codigo = '8')
--
-- Tabla: public.empleados (nombre_completo, supervisor, codigo)
-- El JOIN con los leads es por NOMBRE EXACTO, por eso se registra CADA
-- variante de escritura encontrada en la base:
--   webhook  -> a veces en Mixed Case  ("Erick Leonel Enriquez Ramirez")
--   mestra   -> a veces en MAYUSCULA   ("ERICK LEONEL ENRIQUEZ RAMIREZ")
-- Son 33 asesores en 41 filas.
--
-- Nombres corregidos respecto al Excel (asi estan en la BASE, no en el Excel):
--   DIANA VALERIA TABANGO LANDCHIMBA   (con D)
--   TATIANA DENNISE IBARRA JACOME      (una sola N)
--   AHILYN BELEN VALDIVIEZO RODRIGUEZ  (con Z)
--   JOMAIRA CRISTIANA LEITON RIZZO     (CRISTIANA, no CRISTINA)
--   GERALDINE RIVERA GONZALEZ          (sin DAYANA)
--   GENESIS MARTINEZ OLVERA            (sin CORALIA)
--
-- Ejecutar en pgAdmin sobre bddgeneral.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 1 — Revisar la estructura antes de insertar
-- Si hay columnas NOT NULL ademas de las 3 que uso, avisar antes de seguir.
-- ────────────────────────────────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='empleados'
ORDER BY ordinal_position;

-- Supervisores que ya existen, para respetar la convencion de nombres
SELECT DISTINCT supervisor FROM public.empleados WHERE supervisor IS NOT NULL ORDER BY 1;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 2 — Cargar la asignacion
-- Transaccional: si algo falla, no queda a medias.
-- Primero borra las filas de agosto de ESTOS nombres, luego inserta.
-- No toca a nadie mas (ni Velsa ni otros meses).
-- ────────────────────────────────────────────────────────────────────────────
BEGIN;

WITH asignacion(nombre_completo, supervisor) AS (VALUES
    -- ══ TITANES — SUPERVISOR: ANDRES RODRIGUEZ ══════════════════════════
    ('Erick Leonel Enriquez Ramirez',        'ANDRES RODRIGUEZ'),
    ('ERICK LEONEL ENRIQUEZ RAMIREZ',        'ANDRES RODRIGUEZ'),
    ('JOMAIRA CRISTIANA LEITON RIZZO',       'ANDRES RODRIGUEZ'),
    ('Leonardo Xavier Carlosama Tabango',    'ANDRES RODRIGUEZ'),
    ('LEONARDO XAVIER CARLOSAMA TABANGO',    'ANDRES RODRIGUEZ'),
    ('OSCAR SANGUCHO SASIG',                 'ANDRES RODRIGUEZ'),
    ('GERALDINE RIVERA GONZALEZ',            'ANDRES RODRIGUEZ'),
    ('Christian Ponce Baroja',               'ANDRES RODRIGUEZ'),
    ('CHRISTIAN PONCE BAROJA',               'ANDRES RODRIGUEZ'),
    ('GENESIS MARTINEZ OLVERA',              'ANDRES RODRIGUEZ'),
    ('GEOVANNY PATRICIO CARVAJAL ALMEIDA',   'ANDRES RODRIGUEZ'),
    ('SARA DANIELA CHIRIBOGA ESPINOZA',      'ANDRES RODRIGUEZ'),
    ('JESUS ALBERTO NARANJO MACAS',          'ANDRES RODRIGUEZ'),
    ('ALEXANDER ISMAEL NIETO GUAMAN',        'ANDRES RODRIGUEZ'),

    -- ══ AGUILAS — SUPERVISOR: JAVIER NAVARRETE ══════════════════════════
    ('GRACE ARIAS NARVAEZ',                  'JAVIER NAVARRETE'),
    ('MONICA PILCO QUINATOA',                'JAVIER NAVARRETE'),
    ('DIANA VALERIA TABANGO LANDCHIMBA',     'JAVIER NAVARRETE'),
    ('ARIANNE BELTRAN RANGEL',               'JAVIER NAVARRETE'),
    ('MONICA QUILLAY GUAMAN',                'JAVIER NAVARRETE'),
    ('Cristian Gerardo Colimba Caiza',       'JAVIER NAVARRETE'),
    ('CRISTIAN GERARDO COLIMBA CAIZA',       'JAVIER NAVARRETE'),
    ('IXCHELL TORRES MARTINEZ',              'JAVIER NAVARRETE'),
    ('Sherley Chiriboga Cevallos',           'JAVIER NAVARRETE'),
    ('SHERLEY CHIRIBOGA CEVALLOS',           'JAVIER NAVARRETE'),
    ('JORGE ANDRES PAREDES ROMAN',           'JAVIER NAVARRETE'),
    ('JENYFFER ALEJANDRA VELASTEGUI PILCA',  'JAVIER NAVARRETE'),

    -- ══ DRAGONES — SUPERVISOR: JONATHAN SIMBAÑA ═════════════════════════
    ('GERARDO CAJAMARCA',                    'JONATHAN SIMBAÑA'),
    ('DIEGO REYES PADILLA',                  'JONATHAN SIMBAÑA'),
    ('Alexis Geovanny Nagua Torres',         'JONATHAN SIMBAÑA'),
    ('ALEXIS GEOVANNY NAGUA TORRES',         'JONATHAN SIMBAÑA'),
    ('Sergio David Almeida Argoti',          'JONATHAN SIMBAÑA'),
    ('SERGIO DAVID ALMEIDA ARGOTI',          'JONATHAN SIMBAÑA'),
    ('NATASHA CALERO ESTACIO',               'JONATHAN SIMBAÑA'),
    ('HILARY AYALA CRIBAN',                  'JONATHAN SIMBAÑA'),
    ('Jenny Fernanda Rodriguez Guaycha',     'JONATHAN SIMBAÑA'),
    ('JENNY FERNANDA RODRIGUEZ GUAYCHA',     'JONATHAN SIMBAÑA'),
    ('EDISON CAIZA HIDALGO',                 'JONATHAN SIMBAÑA'),
    ('TATIANA DENNISE IBARRA JACOME',        'JONATHAN SIMBAÑA'),
    ('MELANY DAYANA QUIMBIULCO CHICAIZA',    'JONATHAN SIMBAÑA'),
    ('MARCO IVAN BURI VERA',                 'JONATHAN SIMBAÑA'),
    ('AHILYN BELEN VALDIVIEZO RODRIGUEZ',    'JONATHAN SIMBAÑA')
),
borrado AS (
    DELETE FROM public.empleados e
    USING asignacion a
    WHERE e.nombre_completo = a.nombre_completo
      AND e.codigo = '8'
    RETURNING 1
)
INSERT INTO public.empleados (nombre_completo, supervisor, codigo)
SELECT nombre_completo, supervisor, '8' FROM asignacion;

COMMIT;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 3 — VERIFICAR
-- Debe dar 41 filas: 14 Andres, 12 Javier, 15 Jonathan
-- ────────────────────────────────────────────────────────────────────────────
SELECT supervisor, COUNT(*)::int AS filas
FROM public.empleados
WHERE codigo = '8'
GROUP BY 1 ORDER BY 1;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 4 — Quien sigue SIN supervisor en agosto
-- "Novonet Ecuador" es el mas grande (2.911 leads entre sus 2 escrituras).
-- Es una cuenta generica, no un asesor: decidir que hacer con ella.
-- ────────────────────────────────────────────────────────────────────────────
SELECT w.responsible AS sin_asignar, COUNT(*)::int AS leads
FROM public.bitrix_webhook_leads w
WHERE w.empresa = 'novonet'
  AND (w.created_at AT TIME ZONE 'America/Guayaquil')::date
      BETWEEN '2026-08-01' AND '2026-08-31'
  AND NULLIF(TRIM(w.responsible),'') IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.empleados e
      WHERE e.nombre_completo = w.responsible AND e.codigo = '8'
  )
GROUP BY 1
ORDER BY leads DESC;
