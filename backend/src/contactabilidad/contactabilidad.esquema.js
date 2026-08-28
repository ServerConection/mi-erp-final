// =============================================================================
// Contactabilidad — Deteccion de esquema
//
// Por que existe: el modulo evoluciona con migraciones, pero el backend puede
// desplegarse ANTES de que el DBA ejecute el SQL. Sin esta comprobacion, una
// consulta que menciona una columna todavia inexistente tumba el tablero que ya
// funcionaba. Aqui se pregunta al catalogo de Postgres que existe realmente y
// las consultas se arman en consecuencia.
//
// Resultado: sin migracion el tablero sigue vivo (sin las columnas nuevas);
// con migracion aparece todo, sin reiniciar nada.
// =============================================================================

const CACHE_MS = 60_000;

// Lo que el modulo sabe usar si esta disponible.
const CAPACIDADES_COMPLETAS = Object.freeze({
  chat_id: true,
  origen_ultimo_dato: true,
  eventos_inbox: true,
  vistas: true,
  sla: true,
});

const SIN_MIGRACION = Object.freeze({
  chat_id: false,
  origen_ultimo_dato: false,
  eventos_inbox: false,
  vistas: false,
  sla: false,
});

let cache = { valor: null, at: 0 };

async function consultar(pool) {
  const [columnas, tablas] = await Promise.all([
    pool.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND ((table_name = 'contactabilidad_leads'
              AND column_name IN ('chat_id','origen_ultimo_dato'))
          OR (table_name = 'contactabilidad_config'
              AND column_name = 'sla_critico_minutos'))
    `),
    pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name IN ('contactabilidad_eventos_inbox','contactabilidad_vistas')
    `),
  ]);

  const cols = new Set(columnas.rows.map((r) => `${r.table_name}.${r.column_name}`));
  const tabs = new Set(tablas.rows.map((r) => r.table_name));

  return {
    chat_id: cols.has('contactabilidad_leads.chat_id'),
    origen_ultimo_dato: cols.has('contactabilidad_leads.origen_ultimo_dato'),
    sla: cols.has('contactabilidad_config.sla_critico_minutos'),
    eventos_inbox: tabs.has('contactabilidad_eventos_inbox'),
    vistas: tabs.has('contactabilidad_vistas'),
  };
}

/**
 * Capacidades vigentes, con cache corta para no consultar el catalogo en cada
 * request. Si la propia comprobacion falla, se asume el esquema minimo: es
 * preferible un tablero con menos columnas que un tablero caido.
 */
async function obtenerCapacidades(pool) {
  if (cache.valor && Date.now() - cache.at < CACHE_MS) return cache.valor;
  try {
    const valor = await consultar(pool);
    cache = { valor, at: Date.now() };
    return valor;
  } catch {
    return SIN_MIGRACION;
  }
}

/** Solo para pruebas. */
function reiniciarCache() { cache = { valor: null, at: 0 }; }

/**
 * Devuelve la columna si existe, o un NULL tipado con el mismo alias.
 * Asi el contrato de la respuesta no cambia segun el estado de la migracion.
 */
const columnaOpcional = (disponible, expresion, alias, tipo = 'text') =>
  (disponible ? `${expresion} AS ${alias}` : `NULL::${tipo} AS ${alias}`);

module.exports = {
  obtenerCapacidades, reiniciarCache, columnaOpcional,
  CAPACIDADES_COMPLETAS, SIN_MIGRACION,
};
