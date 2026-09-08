-- ============================================================================
-- CATALOGO DE ASESORES VELSA — POR MES
-- ============================================================================
-- Para que un reporte de agosto siga mostrando el supervisor que ese asesor
-- tenia en agosto, aunque hoy lo hayan cambiado de equipo. Una fila por asesor
-- y por mes; el periodo es el primer dia del mes (2026-09-01 = septiembre 2026).
--
-- Cada mes se vuelve a correr este mismo archivo con el catalogo nuevo: solo
-- cambian la fecha del periodo y el bloque de datos. Es idempotente: correrlo
-- dos veces no duplica nada.
--
-- Es el equivalente Velsa de lo que public.empleados ya hace para Novonet.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.catalogo_asesores_velsa (
  periodo           date NOT NULL,   -- primer dia del mes al que aplica
  codigo_asesor     text NOT NULL,   -- 4058LK — la misma llave que trae Jotform
  nombre_asesor     text,
  estado            text,            -- ACTIVO / CESANTE
  cargo             text,            -- ASESOR / SUPERVISOR / BACK
  codigo_supervisor text,
  nombre_supervisor text,
  actualizado_en    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (periodo, codigo_asesor)
);

CREATE INDEX IF NOT EXISTS idx_cat_asesores_velsa_codigo
  ON public.catalogo_asesores_velsa (codigo_asesor);

-- ── Supervisor de un asesor en una fecha dada ───────────────────────────────
-- Usa el catalogo del mes de esa fecha; si ese mes no se cargo, cae al ultimo
-- catalogo anterior. Si no hay ninguno devuelve NULL (no inventa un supervisor).
CREATE OR REPLACE FUNCTION public.supervisor_velsa(p_codigo text, p_fecha date)
RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT c.nombre_supervisor
  FROM public.catalogo_asesores_velsa c
  WHERE upper(btrim(c.codigo_asesor)) = upper(btrim(p_codigo))
    AND c.periodo <= date_trunc('month', p_fecha)::date
  ORDER BY c.periodo DESC
  LIMIT 1;
$$;


-- ============================================================================
-- CARGA DEL MES — SEPTIEMBRE 2026  (51 asesores)
-- ============================================================================
-- Observaciones del archivo recibido (se cargan tal cual, no se corrigieron):
--   · 4093LK: el nombre del archivo empieza con 4090LK; se respeta 4093LK de la columna CODIGO ASESOR
--   · 4071LK: el archivo no trae nombre (#N/A)
--   · 4071LK: sin ESTADO en el archivo

BEGIN;

WITH datos(codigo_asesor, nombre_asesor, estado, cargo, codigo_supervisor, nombre_supervisor) AS (
  VALUES
  ('2000LK',  'DARIANA LEONARDI',                            'ACTIVO',  'SUPERVISOR', '2000LK',  'DARIANA LEONARDI'),
  ('2002LK',  'ALEXANDRA PACHECO',                           'ACTIVO',  'SUPERVISOR', '2002LK',  'ALEXANDRA PACHECO'),
  ('4016LK',  'CARLA MICHELLE MUÑOZ GONZALEZ',               'ACTIVO',  'ASESOR',     '2000LK',  'DARIANA LEONARDI'),
  ('4027LK',  'JORGE ERNESTO PAZMIÑO TAPIA',                 'ACTIVO',  'ASESOR',     '2000LK',  'DARIANA LEONARDI'),
  ('4039LK',  'KARLA GEOVANNA ARELLANO',                     'ACTIVO',  'ASESOR',     '2000LK',  'DARIANA LEONARDI'),
  ('4048LK',  'KATHERINE PAOLA PUCHA BRAVO',                 'ACTIVO',  'ASESOR',     '2000LK',  'DARIANA LEONARDI'),
  ('4058LK',  'JACK ALDHAIR VERA BAYAS',                     'ACTIVO',  'ASESOR',     '2000LK',  'DARIANA LEONARDI'),
  ('4060LK',  'ANDERSON JAVIER ESPINOZA VITERI',             'ACTIVO',  'ASESOR',     '2000LK',  'DARIANA LEONARDI'),
  ('4068LK',  'GEOVANNY JAVIER MUÑOZ SUAREZ',                'ACTIVO',  'ASESOR',     '2002LK',  'ALEXANDRA PACHECO'),
  ('4074LK',  'ALISSON ABIGAIL CEPEDA BARROSO',              'ACTIVO',  'ASESOR',     '2002LK',  'ALEXANDRA PACHECO'),
  ('4077LK',  'BYRON FERNANDO TARCO PILAGUANO',              'ACTIVO',  'ASESOR',     '2002LK',  'ALEXANDRA PACHECO'),
  ('4078LK',  'MARIBEL PATRICIA MONTEROS BURGOS',            'ACTIVO',  'ASESOR',     '2002LK',  'ALEXANDRA PACHECO'),
  ('4081LK',  'SEBASTIAN ISRAEL ECHEVERRIA NEPPAS',          'ACTIVO',  'ASESOR',     '2000LK',  'DARIANA LEONARDI'),
  ('4089LK',  'DAVID GUATEMAL',                              'ACTIVO',  'ASESOR',     '2002LK',  'ALEXANDRA PACHECO'),
  ('4092LK',  'EMILY MONSERRATE FELIX TROYA',                'ACTIVO',  'ASESOR',     '2002LK',  'ALEXANDRA PACHECO'),
  ('4014LK',  'AMY ELIZABETH SOLORZANO ARTEAGA',             'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4026LK',  'MARITZA ELIZABETH COQUE GUAÑUNA',             'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4028LK',  'CHRISTIAN SANTIAGO JATIVA MORE',              'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4042LK',  'MATEO JOSUE LOPEZ LOPEZ',                     'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4043LK',  'SANDRO PAUL JACHO LLUMIQUINGA',               'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4045LK',  'CAMILA SARAI COX AGUILAR',                    'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4049LK',  'EDWIN SANTIAGO PANTOJA BENALCAZAR',           'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4052LK',  'ADRIAN OSWALDO DUEÑAS VIZUETE',               'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4055LK',  'LUIS GABRIEL CABRERA GREFA',                  'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4059LK',  'ADRIANA ESTEFANIA CARDENAS NUÑEZ',            'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4061LK',  'FELIX ARIEL VASQUEZ MONCAYO',                 'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4062LK',  'JENNIFER JUDITH QUELAL PACHACAMA',            'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4065LK',  'PATRICIO ISRAEL SERRANO DARQUEA',             'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4066LK',  'BRIANA ALVAREZ',                              'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4067LK',  'JEFFERSON BLADIMIR PALOMO SANGUCHO',          'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4069LK',  'EDGAR MANUEL ROSERO GUERRERO',                'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4070LK',  'ANDREA CUESTAS',                              'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4072LK',  'RAUL D´ORTIGNACQ',                            'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4075LK',  'ERIKA YAJAIRA GRANDA PINEDA',                 'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4076LK',  'DIANA SOFIA ZAMBRANO VAZQUEZ',                'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4079LK',  'SANTIAGO FABIAN MORENO LOPEZ',                'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4080LK',  'JOHNNY STEVEN CARRILLO ROBLES',               'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4084LK',  'ODALIS PAOLA PALLARES NOBLE',                 'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4085LK',  'KAREN ABIGAIL SARANGO SARANGO',               'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4087LK',  'CARLA ANDREINA COBOS BENALCÁZAR',             'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4088LK',  'VERÓNICA INÉS HIDALGO NIETO',                 'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4090LK',  'EDGAR OSWALDO VILLEGAS ORDOÑEZ',              'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4093LK',  'DIEGO BENITEZ SANGO',                         'CESANTE', 'ASESOR',     NULL,      NULL),
  ('4071LK',  NULL,                                          NULL,      'ASESOR',     NULL,      NULL),
  ('4095LK',  'DAMIAN VIERA',                                'ACTIVO',  'ASESOR',     '2002LK',  'ALEXANDRA PACHECO'),
  ('4094LK',  'ROSSANNA MARIBEL ALVARADO CRUZ',              'ACTIVO',  'ASESOR',     '2000LK',  'DARIANA LEONARDI'),
  ('4096LK',  'KARINA MARICELA TORRES AMAGUAÑA',             'ACTIVO',  'ASESOR',     '2000LK',  'DARIANA LEONARDI'),
  ('3002LK',  'CRISTIAN PASTUÑA',                            'ACTIVO',  'BACK',       NULL,      NULL),
  ('4097LK',  'BYRON FERNANDO VISTIN CUÑEZ',                 'ACTIVO',  'ASESOR',     '2002LK',  'ALEXANDRA PACHECO'),
  ('4099LK',  'CRISTIAN DAVID ROJAS AGUILA',                 'ACTIVO',  'ASESOR',     '2000LK',  'DARIANA LEONARDI'),
  ('4098LK',  'MELANY MAYERLI GUAÑO SANTIN',                 'ACTIVO',  'ASESOR',     '2002LK',  'ALEXANDRA PACHECO')
)
INSERT INTO public.catalogo_asesores_velsa
  (periodo, codigo_asesor, nombre_asesor, estado, cargo, codigo_supervisor, nombre_supervisor)
SELECT '2026-09-01'::date, d.* FROM datos d
ON CONFLICT (periodo, codigo_asesor) DO UPDATE SET
  nombre_asesor     = EXCLUDED.nombre_asesor,
  estado            = EXCLUDED.estado,
  cargo             = EXCLUDED.cargo,
  codigo_supervisor = EXCLUDED.codigo_supervisor,
  nombre_supervisor = EXCLUDED.nombre_supervisor,
  actualizado_en    = now();

COMMIT;


-- ── VERIFICAR — debe dar 51 filas (28 CESANTE, 22 ACTIVO, 1 sin estado) ──
SELECT COALESCE(estado, 'SIN ESTADO') AS estado, COUNT(*)::int AS filas
FROM public.catalogo_asesores_velsa
WHERE periodo = '2026-09-01'
GROUP BY 1 ORDER BY 2 DESC;

-- Los equipos del mes
SELECT nombre_supervisor, COUNT(*)::int AS asesores
FROM public.catalogo_asesores_velsa
WHERE periodo = '2026-09-01' AND estado = 'ACTIVO' AND cargo = 'ASESOR'
GROUP BY 1 ORDER BY 1;
