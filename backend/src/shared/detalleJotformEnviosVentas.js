// ─────────────────────────────────────────────────────────────────────────────
// DETALLE BASE JOTFORM (NETLIFE) — fuente única: public.envios_ventas
// ─────────────────────────────────────────────────────────────────────────────
// 2026-10-06 (a pedido): la tabla azul/naranja "DETALLE BASE JOTFORM (NETLIFE)"
// de Indicadores NOVONET e Indicadores VELSA deja de leer vistas
// (mestra_bitrix → mestra_bitrix_ev / mv_indicadores_velsa_completo) y lee
// DIRECTO de envios_ventas, donde ya viven todas las ventas (histórico Jotform
// migrado + ventas nuevas del ERP). Se diferencia la empresa por
// distribuidor_autorizado. Lo que envios_ventas no tiene (etapa, fecha de
// creación, responsable y origen de Bitrix) se trae con LEFT JOIN a
// bitrix_webhook_leads (1 fila por empresa+bitrix_id, no duplica).
//
// Ventaja: lo que se edite en envios_ventas se ve al instante (sin esperar el
// refresco de las vistas materializadas).
//
// La subconsulta expone los nombres de columna que ya usan los filtros de cada
// controlador (mb.j_* / mb.b_* en Novonet, mv.* en Velsa) para no reescribirlos.
//
// Mapeo de campos confirmado por Bryan:
//   EMPAQUETADO                  → envios_ventas.servicios_digitales
//   SERVICIO ADICIONAL FACTURADO → envios_ventas.tipo_contrato
// ─────────────────────────────────────────────────────────────────────────────

const EMPRESAS = {
  novonet: { distribuidor: 'NOVONET', origenJotform: 'JOTFORM_NOVONET' },
  velsa:   { distribuidor: 'VELSA',   origenJotform: 'JOTFORM_VELSA' },
};

/**
 * Subconsulta (tabla derivada) sobre envios_ventas para una empresa.
 * @param {'novonet'|'velsa'} empresa
 * @param {string} alias  alias de la tabla derivada ('mb' Novonet, 'mv' Velsa)
 */
function fuenteDetalleJotform(empresa, alias) {
  const cfg = EMPRESAS[empresa];
  if (!cfg) throw new Error(`Empresa inválida: ${empresa}`);
  if (!/^[a-z_]+$/.test(alias)) throw new Error(`Alias inválido: ${alias}`);
  return `(
    SELECT
        e.id                                                   AS ev_id,
        -- Fecha de registro en hora local (mismo criterio que la migración):
        -- el histórico Jotform Novonet ya está en hora local; el resto se
        -- guardó con zona horaria.
        CASE WHEN e.origen_dato = '${cfg.origenJotform}' AND '${empresa}' = 'novonet'
             THEN NULLIF(e.fecha_registro_sistema, '')::timestamp
             ELSE (NULLIF(e.fecha_registro_sistema, '')::timestamptz AT TIME ZONE 'America/Guayaquil')
        END                                                    AS ts_local,
        NULLIF(BTRIM(e.id_bitrix::text), '')                   AS id_bitrix,
        e.codigo_asesor                                        AS codigo_asesor,
        COALESCE(NULLIF(BTRIM(to_jsonb(e) ->> 'usuario'), ''), u.usuario) AS asesor_usuario,
        e.netlife_login                                        AS netlife_login,
        e.netlife_estatus_real                                 AS netlife_estatus_real,
        e.fecha_ingreso_telcos::text                           AS fecha_ingreso_telcos,
        e.fecha_activacion_netlife                             AS fecha_activacion_netlife,
        public.parse_fecha_flex(e.fecha_activacion_netlife::text) AS f_act,
        e.estatus_regularizacion                               AS estatus_regularizacion,
        e.detalle_regularizacion                               AS detalle_regularizacion,
        e.novedades_atc                                        AS novedades_atc,
        COALESCE(NULLIF(BTRIM(e.plan_contratado), ''), e.plan_contratado_final) AS tipo_plan,
        to_jsonb(e) ->> 'velocidad_plan'                       AS velocidad,
        e.servicios_digitales                                  AS empaquetado,
        e.tipo_contrato                                        AS servicio_adicional,
        e.forma_pago                                           AS forma_pago,
        e.aplica_descuento_3ra_edad                            AS aplica_descuento_3ra_edad,
        e.fecha_agenda::text                                   AS fecha_agenda,
        e.observacion_venta_original                           AS observacion_venta,
        bw0.etapa_bitrix                                       AS etapa_bitrix,
        (bw0.created_at AT TIME ZONE 'America/Guayaquil')      AS creado_bitrix,
        COALESCE(NULLIF(TRIM(to_jsonb(bw0) ->> 'created_at_ecuador'), ''),
                 to_char(bw0.created_at AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI:SS')) AS creado_bitrix_txt,
        COALESCE(NULLIF(BTRIM(bw0.responsible), ''),
                 CASE WHEN e.origen_dato = 'ERP' THEN NULLIF(BTRIM(e.nombre_atc), '') END) AS responsable,
        NULLIF(BTRIM(bw0.source), '')                          AS origen_bitrix,
        e.supervisor                                           AS supervisor_venta,

        -- ── Nombres que usan los filtros de Novonet (alias mb) ──
        NULLIF(BTRIM(e.id_bitrix::text), '')                   AS j_id_bitrix,
        e.netlife_estatus_real                                 AS j_netlife_estatus_real,
        e.estatus_regularizacion                               AS j_estatus_regularizacion,
        e.fecha_activacion_netlife                             AS j_fecha_activacion_netlife,
        bw0.bitrix_id                                          AS b_id,
        bw0.etapa_bitrix                                       AS b_etapa_de_la_negociacion,
        COALESCE(NULLIF(BTRIM(bw0.responsible), ''),
                 CASE WHEN e.origen_dato = 'ERP' THEN NULLIF(BTRIM(e.nombre_atc), '') END) AS b_persona_responsable,
        (bw0.created_at AT TIME ZONE 'America/Guayaquil')::date AS b_creado_el_fecha,
        NULL::text                                             AS b_cerrado,
        NULLIF(BTRIM(bw0.source), '')                          AS b_origen,

        -- ── Nombres que usan los filtros de Velsa (alias mv) ──
        COALESCE(NULLIF(BTRIM(bw0.responsible), ''),
                 CASE WHEN e.origen_dato = 'ERP' THEN NULLIF(BTRIM(e.nombre_atc), '') END) AS asesor,
        e.supervisor                                           AS supervisor,
        NULLIF(BTRIM(e.id_bitrix::text), '')                   AS id_crm,
        NULLIF(BTRIM(e.id_bitrix::text), '')                   AS id_jotform,
        bw0.etapa_bitrix                                       AS etapa_crm,
        NULLIF(BTRIM(bw0.source), '')                          AS origen,
        e.netlife_estatus_real                                 AS estado_venta,
        e.estatus_regularizacion                               AS estado_regularizacion,
        public.parse_fecha_flex(e.fecha_activacion_netlife::text) AS fecha_activacion,
        CASE WHEN e.origen_dato = '${cfg.origenJotform}' AND '${empresa}' = 'novonet'
             THEN NULLIF(e.fecha_registro_sistema, '')::timestamp
             ELSE (NULLIF(e.fecha_registro_sistema, '')::timestamptz AT TIME ZONE 'America/Guayaquil')
        END                                                    AS fecha_registro_jotform,
        (bw0.created_at AT TIME ZONE 'America/Guayaquil')      AS fecha_creacion_crm
    FROM public.envios_ventas e
    LEFT JOIN public.usuarios u
           ON u.id = e.usuario_id
    LEFT JOIN public.bitrix_webhook_leads bw0
           ON bw0.empresa = '${empresa}'
          AND BTRIM(bw0.bitrix_id::text) = BTRIM(e.id_bitrix::text)
    WHERE e.distribuidor_autorizado = '${cfg.distribuidor}'
      AND e.origen_dato IN ('${cfg.origenJotform}', 'ERP')
      AND e.estatus_envio IS DISTINCT FROM 'BORRADOR'
  ) ${alias}`;
}

/**
 * Columnas de la tabla (pantalla + Excel). MISMO orden en Novonet y Velsa.
 * Las claves son las que el frontend (Indicadores.jsx / IndicadoresVelsa.jsx,
 * normalizarFilaDetalleJotform + etiquetasJotform) traduce a los títulos
 * visibles: ETAPA → "ETAPA BITRIX", ASESOR → "ASESOR RESPONSABLE BITRIX", etc.
 * Sin espacios en las claves — ver backend/test/detalleJotform.columnas.test.js.
 */
function columnasDetalleJotform(alias, { asesorExpr, supervisorExpr }) {
  const a = alias;
  return `
    ${a}.id_bitrix                                   AS "ID_CRM",
    ${a}.id_bitrix                                   AS "ID_JOT",
    ${a}.etapa_bitrix                                AS "ETAPA",
    ${a}.creado_bitrix_txt                           AS "FECHA_CREACION",
    ${asesorExpr}                                    AS "ASESOR",
    ${supervisorExpr}                                AS "SUPERVISOR_ASIGNADO",
    ${a}.origen_bitrix                               AS "ORIGEN",
    to_char(${a}.ts_local, 'YYYY-MM-DD HH24:MI:SS')  AS "FECHA_CREACION_JOT",
    ${a}.codigo_asesor                               AS "COD_ASESOR_JOT",
    COALESCE(${a}.asesor_usuario, ujot.asesor_usuario) AS "ASESOR_USUARIO",
    ${a}.netlife_login                               AS "LOGIN",
    COALESCE(NULLIF(TRIM(${a}.netlife_estatus_real), ''), 'SIN ESTADO') AS "ESTADO_NETLIFE",
    ${a}.fecha_ingreso_telcos                        AS "INGRESO_TELCOS",
    COALESCE(${a}.f_act::text, ${a}.fecha_activacion_netlife::text) AS "FECHA_ACTIVACION",
    ${a}.estatus_regularizacion                      AS "ESTADO_REGULARIZACION",
    ${a}.detalle_regularizacion                      AS "OBSERV_REGULARIZACION",
    ${a}.novedades_atc                               AS "NOVEDADES_ATC",
    ${a}.tipo_plan                                   AS "TIPO_PLAN",
    ${a}.velocidad                                   AS "VELOCIDAD",
    ${a}.empaquetado                                 AS "EMPAQUETADO",
    ${a}.servicio_adicional                          AS "SERVICIO_ADICIONAL_FACTURADO",
    ${a}.forma_pago                                  AS "FORMA_PAGO",
    ${a}.aplica_descuento_3ra_edad                   AS "APLICA_DESCUENTO",
    ${a}.fecha_agenda                                AS "FECHA_AGENDA",
    ${a}.observacion_venta                           AS "OBSERVACION"`;
}

/**
 * JOINs de respaldo (van DESPUÉS del FROM, así solo corren sobre las filas ya
 * filtradas por fecha):
 *   ujot → usuario ERP por código de vendedor (histórico Jotform sin usuario_id)
 *   ejot → supervisor de ese usuario en empleados
 *   eresp → supervisor del responsable Bitrix en empleados
 */
function joinsDetalleJotform(alias, empresa) {
  const cfg = EMPRESAS[empresa];
  if (!cfg) throw new Error(`Empresa inválida: ${empresa}`);
  const a = alias;
  return `
    LEFT JOIN LATERAL (
        SELECT COALESCE(NULLIF(BTRIM(u.usuario), ''),
                        NULLIF(BTRIM(CONCAT_WS(' ', u.nombres, u.apellidos)), '')) AS asesor_usuario,
               NULLIF(BTRIM(CONCAT_WS(' ', u.nombres, u.apellidos)), '')        AS nombre_completo
        FROM public.usuarios u
        WHERE NULLIF(BTRIM(${a}.codigo_asesor), '') IS NOT NULL
          AND (UPPER(BTRIM(COALESCE(u.codigo_vendedor, ''))) = UPPER(BTRIM(${a}.codigo_asesor))
               OR UPPER(BTRIM(COALESCE(u.usuario, ''))) = UPPER(BTRIM(${a}.codigo_asesor)))
          AND UPPER(BTRIM(COALESCE(u.empresa, ''))) LIKE '%${cfg.distribuidor}%'
        ORDER BY u.activo DESC, u.id DESC
        LIMIT 1
    ) ujot ON true
    LEFT JOIN LATERAL (
        SELECT e4.supervisor
        FROM public.empleados e4
        WHERE UPPER(BTRIM(e4.nombre_completo)) = UPPER(BTRIM(ujot.nombre_completo))
        ORDER BY e4.codigo::int DESC
        LIMIT 1
    ) ejot ON true
    LEFT JOIN LATERAL (
        SELECT e5.supervisor
        FROM public.empleados e5
        WHERE UPPER(BTRIM(e5.nombre_completo)) = UPPER(BTRIM(${a}.responsable))
        ORDER BY e5.codigo::int DESC
        LIMIT 1
    ) eresp ON true`;
}

module.exports = { fuenteDetalleJotform, columnasDetalleJotform, joinsDetalleJotform };
