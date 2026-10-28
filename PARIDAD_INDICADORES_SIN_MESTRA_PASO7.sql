-- PASO 7 — SOLO LECTURA. Detalle de las 19 ventas que difieren.
-- opciones_asesor_bkp = cuántos asesores distintos tiene esa negociación en el histórico.
WITH ids(id_unificado) AS (VALUES
 ('EV-165637'),('EV-67428'),('EV-202592'),('EV-67445'),('EV-30304'),('EV-213488'),('EV-165250'),
 ('EV-165496'),('EV-165601'),('EV-215098'),('EV-30307'),('EV-166027'),('EV-165501'),('EV-165600'),
 ('EV-67436'),('EV-165940'),('EV-165191'),('EV-200873'),('EV-165987'))
SELECT i.id_unificado,
       a.b_id AS b_id_actual, n.b_id AS b_id_nueva,
       a.b_persona_responsable AS asesor_actual, n.b_persona_responsable AS asesor_nueva,
       (SELECT COUNT(DISTINCT NULLIF(BTRIM(bk.b_persona_responsable),''))
          FROM public.mestra_bitrix_jotform_bkp bk WHERE BTRIM(bk.b_id) = BTRIM(n.j_id_bitrix)) AS opciones_asesor_bkp,
       a.b_etapa_de_la_negociacion AS etapa_actual, n.b_etapa_de_la_negociacion AS etapa_nueva,
       a.b_creado_el_fecha::text AS creado_actual, n.b_creado_el_fecha::text AS creado_nueva,
       a.j_netlife_estatus_real AS estatus_actual, n.j_netlife_estatus_real AS estatus_nueva
FROM ids i
LEFT JOIN public.mestra_bitrix a ON a.id_unificado = i.id_unificado
LEFT JOIN public.vw_mestra_novonet_live n ON n.id_unificado = i.id_unificado
ORDER BY i.id_unificado;
