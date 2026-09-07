/**
 * El Excel de Descarga Jotform debe salir con LAS MISMAS COLUMNAS y en el
 * MISMO ORDEN para Novonet y para Velsa, aunque cada empresa viva en una
 * tabla distinta (mestra_bitrix vs mv_indicadores_velsa_completo).
 *
 * Se ejecuta con:  node backend/test/backofficeJotform.columnas.test.js
 * No necesita base de datos: se intercepta pool.query.
 */
require('dotenv').config();
const assert = require('assert');

const pool = require('../src/config/db');
const { exportExcel, _limpiarCacheColumnas } = require('../src/controllers/backofficeJotform.controller');

// Columnas que fingimos que existen en cada tabla.
const COLUMNAS_FINGIDAS = {
  mestra_bitrix: `b_id j_id_bitrix j_fecha_registro_sistema j_codigo_asesor
    b_persona_responsable j_supervisor b_etapa_de_la_negociacion
    j_netlife_estatus_real j_ciudad j_forma_pago j_aplica_descuento_3ra_edad
    j_estatus_regularizacion j_detalle_regularizacion j_fecha_activacion_netlife
    j_fecha_agenda j_netlife_login b_origen b_creado_el_fecha
    b_modificado_el_fecha j_novedades_atc`,
  mv_indicadores_velsa_completo: `id_crm id_jotform fecha_registro_jotform
    codigo_asesor asesor supervisor etapa_crm estado_venta ciudad forma_pago
    aplica_descuento estado_regularizacion detalle_regularizacion
    fecha_activacion fecha_agenda inicio_sesion_netlife origen
    fecha_creacion_crm fecha_modificacion_crm fecha_ingresa_telcos
    observacion_telcos`,
};

/** Corre exportExcel con la BD simulada y devuelve el SQL del export. */
async function sqlDelExport(empresa, quitar = []) {
  let capturado = null;
  _limpiarCacheColumnas();
  const original = pool.query;
  pool.query = async (texto, params) => {
    if (/information_schema/.test(texto)) {
      const cols = COLUMNAS_FINGIDAS[params[0]].trim().split(/\s+/)
        .filter((c) => !quitar.includes(c));
      return { rows: cols.map((column_name) => ({ column_name })) };
    }
    capturado = texto;
    return { rows: [] };
  };
  const req = { params: { empresa }, query: { desde: '2026-09-01', hasta: '2026-09-05' } };
  const res = { setHeader() {}, send() {}, status() { return this; }, json(x) { throw new Error('respondió error: ' + JSON.stringify(x)); } };
  try {
    await exportExcel(req, res);
  } finally {
    pool.query = original;
  }
  assert.ok(capturado, `no se generó SQL para ${empresa}`);
  return capturado;
}

/** Nombres de columna del SELECT principal, en orden. */
function columnasDe(sql) {
  const lista = sql.slice(sql.indexOf('SELECT'), sql.indexOf('\n      FROM '));
  return [...lista.matchAll(/\bAS\s+([a-z0-9_]+)/gi)].map((m) => m[1]);
}

(async () => {
  // Caché de columnas: cada empresa se consulta con su propia tabla.
  const novonet = columnasDe(await sqlDelExport('novonet'));
  const velsa   = columnasDe(await sqlDelExport('velsa'));

  assert.deepStrictEqual(
    novonet, velsa,
    `Las columnas no coinciden.\n  Novonet: ${novonet.join(', ')}\n  Velsa:   ${velsa.join(', ')}`
  );
  console.log(`✓ Novonet y Velsa exportan las mismas ${novonet.length} columnas, en el mismo orden`);

  // Lo que pidió operación explícitamente.
  for (const obligatoria of ['codigo_asesor', 'supervisor', 'asesor', 'plan_comercial',
                             'categoria_plan', 'plan_casa', 'plan_centro_comercial']) {
    assert.ok(novonet.includes(obligatoria), `falta la columna ${obligatoria}`);
  }
  console.log('✓ Están el código de asesor y las columnas de planes');

  // Velsa no debe seguir sacando el nombre viejo del plan de centro comercial.
  assert.ok(!velsa.includes('plan_centro_red_comercial'),
    'Velsa sigue exportando plan_centro_red_comercial en vez del nombre común');
  console.log('✓ El plan de centro comercial usa un solo nombre en las dos empresas');

  // Red de seguridad: si la tabla todavía no tiene una columna, el archivo no
  // se rompe — esa columna sale vacía pero sigue estando.
  const sinCodigo = await sqlDelExport('novonet', ['j_codigo_asesor']);
  assert.ok(/NULL::text AS codigo_asesor/.test(sinCodigo),
    'una columna inexistente debería salir como NULL, no romper la descarga');
  assert.ok(!/mb\.j_codigo_asesor/.test(sinCodigo),
    'no debe pedirse una columna que no existe en la tabla');
  console.log('✓ Una columna que aún no existe sale vacía en vez de romper el Excel');

  console.log('\nTODO OK');
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
