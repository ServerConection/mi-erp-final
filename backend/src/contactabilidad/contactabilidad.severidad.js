// =============================================================================
// Contactabilidad — Severidad operativa
// Un unico lugar define que es CRITICO / GRAVE / ALERTA / OK, para que el
// tablero, las alertas, los filtros y el export digan siempre lo mismo.
// La severidad se calcula en vivo (no se guarda) para que nunca quede vieja.
// =============================================================================

const UMBRALES_DEFECTO = Object.freeze({ alerta: 15, grave: 30, critico: 60 });
const SEVERIDADES = Object.freeze(['CRITICO', 'GRAVE', 'ALERTA', 'OK']);
const ETIQUETAS = Object.freeze({
  CRITICO: 'Crítico',
  GRAVE: 'Grave',
  ALERTA: 'En alerta',
  OK: 'Al día',
});

const entero = (valor, defecto) => {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? Math.floor(numero) : defecto;
};

/**
 * Normaliza los umbrales y garantiza el orden alerta <= grave <= critico.
 * Sin esto, una mala configuracion dejaria severidades inalcanzables.
 */
function normalizarUmbrales(config = {}) {
  const alerta = entero(config.sla_alerta_minutos ?? config.alerta, UMBRALES_DEFECTO.alerta);
  const grave = Math.max(alerta, entero(config.sla_grave_minutos ?? config.grave, UMBRALES_DEFECTO.grave));
  const critico = Math.max(grave, entero(config.sla_critico_minutos ?? config.critico, UMBRALES_DEFECTO.critico));
  return { alerta, grave, critico };
}

/** Minutos que el cliente lleva esperando respuesta; NULL si no espera a nadie. */
function expresionMinutosEspera(alias = 'l') {
  return `CASE WHEN ${alias}.pendiente_por = 'ASESOR' AND ${alias}.ultimo_mensaje_cliente_at IS NOT NULL
    THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - ${alias}.ultimo_mensaje_cliente_at)) / 60)::int
    ELSE NULL END`;
}

/** Expresion SQL de severidad, alineada con clasificar(). */
function expresionSeveridad(alias = 'l', umbrales = UMBRALES_DEFECTO) {
  const { alerta, grave, critico } = normalizarUmbrales(umbrales);
  const minutos = expresionMinutosEspera(alias);
  return `CASE
    WHEN ${alias}.pendiente_por IS DISTINCT FROM 'ASESOR' THEN 'OK'
    WHEN (${minutos}) >= ${critico} THEN 'CRITICO'
    WHEN (${minutos}) >= ${grave} THEN 'GRAVE'
    WHEN (${minutos}) >= ${alerta} THEN 'ALERTA'
    ELSE 'OK' END`;
}

/** Misma regla en JavaScript, para el frontend y las pruebas. */
function clasificar(lead = {}, umbrales = UMBRALES_DEFECTO, ahora = new Date()) {
  const { alerta, grave, critico } = normalizarUmbrales(umbrales);
  if (lead.pendiente_por !== 'ASESOR' || !lead.ultimo_mensaje_cliente_at) {
    return { severidad: 'OK', minutos: null };
  }
  const desde = new Date(lead.ultimo_mensaje_cliente_at);
  if (Number.isNaN(desde.getTime())) return { severidad: 'OK', minutos: null };
  const minutos = Math.floor((ahora.getTime() - desde.getTime()) / 60000);
  if (minutos >= critico) return { severidad: 'CRITICO', minutos };
  if (minutos >= grave) return { severidad: 'GRAVE', minutos };
  if (minutos >= alerta) return { severidad: 'ALERTA', minutos };
  return { severidad: 'OK', minutos };
}

/** Lee los umbrales vigentes; ante cualquier fallo devuelve los de defecto. */
async function obtenerUmbrales(pool) {
  try {
    const { rows } = await pool.query(`
      SELECT sla_alerta_minutos, sla_grave_minutos, sla_critico_minutos,
             ventana_activa_horas
      FROM contactabilidad_config WHERE id = 1
    `);
    const fila = rows[0] || {};
    return { ...normalizarUmbrales(fila), ventana_activa_horas: entero(fila.ventana_activa_horas, 48) };
  } catch {
    return { ...UMBRALES_DEFECTO, ventana_activa_horas: 48 };
  }
}

module.exports = {
  UMBRALES_DEFECTO,
  SEVERIDADES,
  ETIQUETAS,
  normalizarUmbrales,
  expresionMinutosEspera,
  expresionSeveridad,
  clasificar,
  obtenerUmbrales,
};
