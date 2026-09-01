-- ============================================================================
-- DIAGNOSTICO: deals que existen en Bitrix pero NO en bitrix_webhook_leads
-- Caso testigo: 570189 (no aparece)  vs  573473 (si aparece)
-- Ejecutar en pgAdmin sobre bddgeneral. Todo es SOLO LECTURA.
-- ============================================================================

-- 1) ¿Existe el lead? (esperado: 0 filas para 570189, 1 para 573473)
SELECT bitrix_id, empresa, etapa, etapa_bitrix, phone, source, repeated, updated_at
FROM bitrix_webhook_leads
WHERE bitrix_id IN ('570189','573473');

-- 2) LA PREGUNTA CLAVE: ¿el webhook llegó alguna vez y fue rechazado,
--    o nunca llegó? El historial guarda TODO evento recibido.
--      · filas > 0  -> el webhook SI llegó, el problema es el UPSERT
--      · 0 filas    -> el webhook NUNCA llegó (problema en Bitrix o en la URL)
SELECT id, bitrix_id, empresa, etapa, event, phone, created_at
FROM bitrix_webhook_leads_historial
WHERE bitrix_id = '570189'
ORDER BY id DESC;

-- 3) ¿Llegó pero SIN id? (URL cortada: el controller guarda con bitrix_id NULL)
SELECT id, empresa, etapa, phone, created_at, raw_query
FROM bitrix_webhook_leads_historial
WHERE bitrix_id IS NULL
ORDER BY id DESC
LIMIT 30;

-- 4) ¿Llegó identificado por teléfono aunque sin id?
SELECT id, bitrix_id, etapa, phone, created_at
FROM bitrix_webhook_leads_historial
WHERE phone LIKE '%986719197%'
ORDER BY id DESC
LIMIT 20;

-- 5) ¿Hubo actividad del webhook alrededor de las 10:15 de hoy?
--    (si el robot de Venta Subida hubiera disparado, se vería aquí)
SELECT id, bitrix_id, empresa, etapa, created_at
FROM bitrix_webhook_leads_historial
WHERE created_at::date = CURRENT_DATE
ORDER BY id DESC
LIMIT 50;

-- 6) TAMAÑO DEL PROBLEMA: teléfonos que llegaron con varios números
--    (contactos con teléfonos duplicados/mergeados en Bitrix)
SELECT count(*) AS leads_con_phone_multiple
FROM bitrix_webhook_leads
WHERE phone LIKE '%,%' OR phone LIKE '% %';

SELECT bitrix_id, etapa, phone, updated_at
FROM bitrix_webhook_leads
WHERE phone LIKE '%,%'
ORDER BY updated_at DESC
LIMIT 30;

-- 7) Leads "huérfanos": entraron una vez y nunca más se actualizaron
--    (síntoma de automatizaciones que dejaron de disparar)
SELECT etapa, count(*) AS total, max(updated_at) AS ultimo
FROM bitrix_webhook_leads
WHERE empresa = 'novonet'
GROUP BY etapa
ORDER BY ultimo DESC NULLS LAST;

-- 8) Volumen diario de eventos: si un día cae a cero o baja de golpe,
--    ahí se rompió una automatización.
SELECT created_at::date AS dia, count(*) AS eventos, count(DISTINCT bitrix_id) AS leads
FROM bitrix_webhook_leads_historial
WHERE created_at >= CURRENT_DATE - 30
GROUP BY 1
ORDER BY 1 DESC;
