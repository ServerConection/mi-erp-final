// ─────────────────────────────────────────────────────────────────────────────
// FUENTE JOTFORM NOVONET — reemplazo directo de las columnas j_* de mestra_bitrix
// ─────────────────────────────────────────────────────────────────────────────
// 2026-10-28: Indicadores NOVONET deja de leer el lado Jotform desde
// public.mestra_bitrix (vista materializada con refresco cada 10 min) y lee
// DIRECTO de public.envios_ventas (tiempo real).
//
// Replica EXACTAMENTE las reglas de mestra_bitrix_ev (COMPAT_INDICADORES_EV.sql):
//   - distribuidor NOVONET, origen JOTFORM_NOVONET o ERP, sin BORRADOR
//   - fecha de registro en hora local (histórico Jotform ya viene local)
//   - fecha de activación normalizada con parse_fecha_flex
//   - forma de pago "TARJETA DE CREDITO." y 3ra edad "SI POR TERCERA EDAD"
// Validado con PARIDAD_INDICADORES_SIN_MESTRA_PASO1/2.sql: 43.767 de 43.767
// ventas coinciden; las 3 diferencias eran datos más nuevos en envios_ventas.
//
// Devuelve una tabla derivada con los mismos nombres de columna (j_*) que usa
// indicadores.controller.js, para cambiar solo el FROM sin tocar los cálculos.
// ─────────────────────────────────────────────────────────────────────────────

const txt = col => `(to_jsonb(${col}) #>> '{}')`;

function fuenteJotNovonet() {
  return `(
    SELECT
        'EV-' || ev.id                                              AS id_unificado,
        ${txt('ev.id_bitrix')}                                      AS j_id_bitrix,
        -- b_id: en mestra_bitrix las filas de venta tienen b_id = id Bitrix de la venta
        -- (lo usa dealNovonet() en el filtro de canal/origen).
        ${txt('ev.id_bitrix')}                                      AS b_id,
        to_char(ev.ts_local, 'YYYY-MM-DD HH24:MI:SS')               AS j_fecha_registro_sistema,
        COALESCE(ev.f_act::text, ev.fecha_activacion_netlife::text) AS j_fecha_activacion_netlife,
        ${txt('ev.netlife_estatus_real')}                           AS j_netlife_estatus_real,
        ${txt('ev.estatus_regularizacion')}                         AS j_estatus_regularizacion,
        ${txt('ev.detalle_regularizacion')}                         AS j_detalle_regularizacion,
        CASE WHEN TRANSLATE(UPPER(BTRIM(ev.forma_pago)),'ÁÉÍÓÚ.','AEIOU') = 'TARJETA DE CREDITO'
             THEN 'TARJETA DE CREDITO.' ELSE ${txt('ev.forma_pago')} END AS j_forma_pago,
        CASE WHEN UPPER(ev.aplica_descuento_3ra_edad) IN ('SÍ','SI')
             THEN 'SI POR TERCERA EDAD' ELSE ${txt('ev.aplica_descuento_3ra_edad')} END AS j_aplica_descuento_3ra_edad,
        ${txt('ev.netlife_login')}                                  AS j_netlife_login,
        ${txt('ev.ciudad')}                                         AS j_ciudad,
        ${txt('ev.novedades_atc')}                                  AS j_novedades_atc,
        ${txt('ev.fecha_agenda')}                                   AS j_fecha_agenda
    FROM (
        SELECT e.*,
               CASE WHEN e.origen_dato = 'JOTFORM_NOVONET'
                    THEN NULLIF(e.fecha_registro_sistema, '')::timestamp
                    ELSE (NULLIF(e.fecha_registro_sistema, '')::timestamptz AT TIME ZONE 'America/Guayaquil')
               END                                                  AS ts_local,
               public.parse_fecha_flex(e.fecha_activacion_netlife)  AS f_act
        FROM public.envios_ventas e
        WHERE e.distribuidor_autorizado = 'NOVONET'
          AND e.origen_dato IN ('JOTFORM_NOVONET', 'ERP')
          AND e.estatus_envio IS DISTINCT FROM 'BORRADOR'
    ) ev
  )`;
}

module.exports = { fuenteJotNovonet };
