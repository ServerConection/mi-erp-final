-- ============================================================================
-- CATALOGO DE ASESORES VELSA — carga/actualizacion
-- Tabla nueva: public.velsa_asesores_catalogo
-- Uso: fuente de verdad de codigo, nombre, estado y cargo de cada persona de
-- VELSA. Hoy los indicadores de Velsa NO usan ningun catalogo — el nombre del
-- asesor sale directo de Bitrix (negociaciones_reporteria.responsable_nombre,
-- vía mv_indicadores_velsa_completo) y el codigo_asesor sale directo de lo que
-- el asesor escribe en el formulario de Jotform. Por eso alguien sin leads en
-- el rango de fechas consultado simplemente no aparece: no hay un catalogo
-- que "rellene" su fila en cero.
--
-- Este script SOLO crea/actualiza el catalogo. Es seguro de correr varias
-- veces (UPSERT por codigo_asesor). NO modifica negociaciones_reporteria, la
-- vista materializada, ni ningun otro dato existente.
--
-- ACTUALIZADO 2026-08-17 con el export de Bitrix del mismo dia
-- (DEAL_20260817...csv, pipeline VELSA VENTAS NETLIFE): se resolvio el caso
-- de DIEGO BENITEZ SANGO (ver nota al final) porque aparece generando leads
-- reales en agosto (26 en lo que va del mes) bajo ese nombre — confirma que
-- es una persona real y distinta de EDGAR VILLEGAS (4090LK).
--
-- OJO — JEFFERSON BLADIMIR PALOMO SANGUCHO (4067LK) sigue cargado como
-- CESANTE tal cual dice el Excel de RRHH, pero el mismo export de Bitrix lo
-- muestra con 70 leads en agosto — más que varios asesores ACTIVOS. No cambio
-- su estado aca porque es una decision de RRHH, no mia: confirmenme si sigue
-- de baja (y entonces esos leads están mal asignados en Bitrix) o si volvio
-- y el Excel esta desactualizado.
--
-- Ejecutar en pgAdmin sobre la base donde vive mv_indicadores_velsa_completo
-- (bddgeneral).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- PASO 1 — Crear la tabla si no existe
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.velsa_asesores_catalogo (
    codigo_asesor     VARCHAR(20) PRIMARY KEY,
    nombre_completo   TEXT        NOT NULL,
    estado            VARCHAR(20) NOT NULL CHECK (estado IN ('ACTIVO','CESANTE')),
    cargo             VARCHAR(20) NOT NULL CHECK (cargo  IN ('ASESOR','SUPERVISOR')),
    actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.velsa_asesores_catalogo IS
  'Catalogo maestro de asesores/supervisores VELSA (codigo, nombre, estado, cargo). Cargado manualmente desde el Excel de RRHH.';

-- ────────────────────────────────────────────────────────────────────────────
-- PASO 2 — Carga (UPSERT). Transaccional: si algo falla, no queda a medias.
-- 42 filas (41 del Excel + Diego Benitez Sango, resuelto con el export de
-- Bitrix). Queda 1 fila del Excel sin cargar — ver nota al final del script.
-- ────────────────────────────────────────────────────────────────────────────
BEGIN;

INSERT INTO public.velsa_asesores_catalogo (codigo_asesor, nombre_completo, estado, cargo) VALUES
    ('2000LK', 'DARIANA LEONARDI',                     'ACTIVO',  'SUPERVISOR'),
    ('2002LK', 'ALEXANDRA PACHECO',                    'ACTIVO',  'SUPERVISOR'),
    ('4016LK', 'CARLA MICHELLE MUÑOZ GONZALEZ',         'ACTIVO',  'ASESOR'),
    ('4027LK', 'JORGE ERNESTO PAZMIÑO TAPIA',           'ACTIVO',  'ASESOR'),
    ('4039LK', 'KARLA GEOVANNA ARELLANO',               'ACTIVO',  'ASESOR'),
    ('4048LK', 'KATHERINE PAOLA PUCHA BRAVO',           'ACTIVO',  'ASESOR'),
    ('4058LK', 'JACK ALDHAIR VERA BAYAS',               'ACTIVO',  'ASESOR'),
    ('4060LK', 'ANDERSON JAVIER ESPINOZA VITERI',       'ACTIVO',  'ASESOR'),
    ('4068LK', 'GEOVANNY JAVIER MUÑOZ SUAREZ',          'ACTIVO',  'ASESOR'),
    ('4074LK', 'ALISSON ABIGAIL CEPEDA BARROSO',        'ACTIVO',  'ASESOR'),
    ('4077LK', 'BYRON FERNANDO TARCO PILAGUANO',        'ACTIVO',  'ASESOR'),
    ('4078LK', 'MARIBEL PATRICIA MONTEROS BURGOS',      'ACTIVO',  'ASESOR'),
    ('4081LK', 'SEBASTIAN ISRAEL ECHEVERRIA NEPPAS',    'ACTIVO',  'ASESOR'),
    ('4089LK', 'DAVID GUATEMAL',                        'ACTIVO',  'ASESOR'),
    ('4092LK', 'EMILY MONSERRATE FELIX TROYA',          'ACTIVO',  'ASESOR'),
    ('4014LK', 'AMY ELIZABETH SOLORZANO ARTEAGA',       'CESANTE', 'ASESOR'),
    ('4026LK', 'MARITZA ELIZABETH COQUE GUAÑUNA',       'CESANTE', 'ASESOR'),
    ('4028LK', 'CHRISTIAN SANTIAGO JATIVA MORE',        'CESANTE', 'ASESOR'),
    ('4042LK', 'MATEO JOSUE LOPEZ LOPEZ',                'CESANTE', 'ASESOR'),
    ('4043LK', 'SANDRO PAUL JACHO LLUMIQUINGA',          'CESANTE', 'ASESOR'),
    ('4045LK', 'CAMILA SARAI COX AGUILAR',               'CESANTE', 'ASESOR'),
    ('4049LK', 'EDWIN SANTIAGO PANTOJA BENALCAZAR',      'CESANTE', 'ASESOR'),
    ('4052LK', 'ADRIAN OSWALDO DUEÑAS VIZUETE',          'CESANTE', 'ASESOR'),
    ('4055LK', 'LUIS GABRIEL CABRERA GREFA',             'CESANTE', 'ASESOR'),
    ('4059LK', 'ADRIANA ESTEFANIA CARDENAS NUÑEZ',       'CESANTE', 'ASESOR'),
    ('4061LK', 'FELIX ARIEL VASQUEZ MONCAYO',            'CESANTE', 'ASESOR'),
    ('4062LK', 'JENNIFER JUDITH QUELAL PACHACAMA',       'CESANTE', 'ASESOR'),
    ('4065LK', 'PATRICIO ISRAEL SERRANO DARQUEA',        'CESANTE', 'ASESOR'),
    ('4066LK', 'BRIANA ALVAREZ',                         'CESANTE', 'ASESOR'),
    ('4067LK', 'JEFFERSON BLADIMIR PALOMO SANGUCHO',     'CESANTE', 'ASESOR'),
    ('4069LK', 'EDGAR MANUEL ROSERO GUERRERO',           'CESANTE', 'ASESOR'),
    ('4070LK', 'ANDREA CUESTAS',                         'CESANTE', 'ASESOR'),
    ('4072LK', 'RAUL D''ORTIGNACQ',                      'CESANTE', 'ASESOR'),
    ('4075LK', 'ERIKA YAJAIRA GRANDA PINEDA',            'CESANTE', 'ASESOR'),
    ('4076LK', 'DIANA SOFIA ZAMBRANO VAZQUEZ',           'CESANTE', 'ASESOR'),
    ('4079LK', 'SANTIAGO FABIAN MORENO LOPEZ',           'CESANTE', 'ASESOR'),
    ('4080LK', 'JOHNNY STEVEN CARRILLO ROBLES',          'CESANTE', 'ASESOR'),
    ('4084LK', 'ODALIS PAOLA PALLARES NOBLE',            'CESANTE', 'ASESOR'),
    ('4085LK', 'KAREN ABIGAIL SARANGO SARANGO',          'CESANTE', 'ASESOR'),
    ('4087LK', 'CARLA ANDREINA COBOS BENALCAZAR',        'CESANTE', 'ASESOR'),
    ('4088LK', 'VERONICA INES HIDALGO NIETO',            'CESANTE', 'ASESOR'),
    ('4090LK', 'EDGAR OSWALDO VILLEGAS ORDOÑEZ',         'CESANTE', 'ASESOR'),
    ('4093LK', 'DIEGO BENITEZ SANGO',                    'ACTIVO',  'ASESOR')
ON CONFLICT (codigo_asesor) DO UPDATE SET
    nombre_completo = EXCLUDED.nombre_completo,
    estado          = EXCLUDED.estado,
    cargo           = EXCLUDED.cargo,
    actualizado_en  = NOW();

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- PASO 3 — Verificar (debe dar 42 filas: 2 supervisores + 40 asesores)
-- ────────────────────────────────────────────────────────────────────────────
SELECT cargo, estado, COUNT(*)::int AS filas
FROM public.velsa_asesores_catalogo
GROUP BY cargo, estado
ORDER BY cargo, estado;

SELECT * FROM public.velsa_asesores_catalogo ORDER BY cargo DESC, nombre_completo;

-- ============================================================================
-- NOTA — 1 fila del Excel que sigue sin cargarse:
--
--   4071LK  →  nombre viene como "#N/D" y no trae ESTADO. No hay con qué
--              cargarla sin inventar un nombre. Confírmame el nombre real y
--              la agrego en un UPDATE aparte.
--
-- Ya resuelta con el export de Bitrix del 17-ago-2026:
--   4093LK / DIEGO BENITEZ SANGO — el Excel traía en la columna "CODIGO Y
--   NOMBRE" el código 4090LK (de otra persona) en vez de 4093LK. Se cargó con
--   4093LK (el de la columna "CODIGO ASESOR", que es la fuente correcta) y
--   estado ACTIVO, confirmado por 26 leads suyos en Bitrix este agosto.
-- ============================================================================
