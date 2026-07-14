/**
 * SETUP — Gestionables permitidos (Bitrix24 NOVONET)
 *
 * Este script SOLO se puede correr desde una red con acceso a
 * novonet.bitrix24.es (el sandbox de Claude no tiene acceso a ese dominio,
 * por eso lo corres tú, local o en Render Shell). Es seguro de repetir.
 *
 * Hace 3 cosas:
 *   1. Busca el pipeline (categoría) "NETLIFE NUEVO" y la etapa "CONTACTO NUEVO"
 *      dentro de él, e imprime sus IDs reales.
 *   2. Busca el campo personalizado del deal "Gestionables Permitidos"; si no
 *      existe, lo CREA (tipo entero) con el código UF_CRM_GESTIONABLES.
 *   3. Imprime las 3 líneas que debes copiar a backend/.env (local) y a
 *      Render > Environment (producción).
 *
 * Uso: node scripts/setup_gestionables_bitrix.js
 */
require('dotenv').config();

const WEBHOOK_NOVONET = (process.env.BITRIX_NOVONET_URL || 'https://novonet.bitrix24.es/rest/87387/vcca209sfcjflxp8').replace(/\/$/, '');
const NOMBRE_PIPELINE = process.env.GESTIONABLES_PIPELINE_NAME || 'NETLIFE NUEVO';
const NOMBRE_ETAPA    = process.env.GESTIONABLES_STAGE_NAME || 'CONTACTO NUEVO';
const FIELD_NAME       = 'UF_CRM_GESTIONABLES';

const call = async (method, params = {}) => {
  const qs = new URLSearchParams();
  const flatten = (obj, prefix = '') => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}[${k}]` : k;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        flatten(v, key);
      } else if (Array.isArray(v)) {
        v.forEach((item, i) => qs.append(`${key}[${i}]`, item));
      } else {
        qs.append(key, v);
      }
    }
  };
  flatten(params);
  const url = `${WEBHOOK_NOVONET}/${method}.json?${qs.toString()}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(`[${method}]: ${json.error} — ${json.error_description}`);
  return json;
};

const norm = (s = '') => s.toString().trim().toLowerCase();

(async () => {
  console.log('Conectando a', WEBHOOK_NOVONET, '\n');

  // ── 1. Pipeline (categoría) ────────────────────────────────────────────────
  console.log(`Buscando pipeline "${NOMBRE_PIPELINE}"...`);
  const catRes = await call('crm.category.list', { entityTypeId: 2 });
  const categorias = catRes.result?.categories || catRes.result || [];
  const cat = categorias.find(c => norm(c.name) === norm(NOMBRE_PIPELINE));

  if (!cat) {
    console.log('❌ No se encontró un pipeline con ese nombre exacto. Pipelines disponibles:');
    categorias.forEach(c => console.log(`   [${c.id}] ${c.name}`));
    process.exit(1);
  }
  console.log(`✅ Pipeline encontrado: CATEGORY_ID=${cat.id} ("${cat.name}")\n`);

  // ── 2. Etapa dentro del pipeline ───────────────────────────────────────────
  console.log(`Buscando etapa "${NOMBRE_ETAPA}" dentro del pipeline...`);
  const stRes = await call('crm.dealcategory.stage.list', { id: cat.id });
  const etapas = stRes.result || [];
  const etapa = etapas.find(s => norm(s.NAME) === norm(NOMBRE_ETAPA));

  if (!etapa) {
    console.log('❌ No se encontró esa etapa. Etapas disponibles en este pipeline:');
    etapas.forEach(s => console.log(`   [${s.STATUS_ID}] ${s.NAME}`));
    process.exit(1);
  }
  console.log(`✅ Etapa encontrada: STAGE_ID=${etapa.STATUS_ID} ("${etapa.NAME}")\n`);

  // ── 3. Campo personalizado "Gestionables Permitidos" ──────────────────────
  console.log(`Verificando si existe el campo ${FIELD_NAME}...`);
  const fieldsRes = await call('crm.deal.userfield.list', { filter: { FIELD_NAME } });
  let field = (fieldsRes.result || [])[0];

  if (field) {
    console.log(`✅ Ya existe (ID interno ${field.ID}). No se vuelve a crear.\n`);
  } else {
    console.log('No existe. Creándolo como campo numérico entero...');
    const addRes = await call('crm.deal.userfield.add', {
      FIELD_NAME,
      USER_TYPE_ID: 'integer',
      XML_ID: 'GESTIONABLES_PERMITIDOS',
      MANDATORY: 'N',
      MULTIPLE: 'N',
      SHOW_FILTER: 'Y',
      SHOW_IN_LIST: 'Y',
      EDIT_IN_LIST: 'Y',
      EDIT_FORM_LABEL:  { es: 'Gestionables Permitidos', en: 'Gestionables Permitidos' },
      LIST_COLUMN_LABEL:{ es: 'Gestionables Permitidos', en: 'Gestionables Permitidos' },
      LIST_FILTER_LABEL:{ es: 'Gestionables Permitidos', en: 'Gestionables Permitidos' },
    });
    console.log(`✅ Campo creado. ID interno: ${addRes.result}\n`);
  }

  // ── Resumen final ───────────────────────────────────────────────────────
  console.log('════════════════════════════════════════════════════════════');
  console.log('  Copia estas líneas a backend/.env Y a Render > Environment');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`GESTIONABLES_FIELD_NAME=${FIELD_NAME}`);
  console.log(`GESTIONABLES_CATEGORY_ID=${cat.id}`);
  console.log(`GESTIONABLES_STAGE_ID=${etapa.STATUS_ID}`);
  console.log('════════════════════════════════════════════════════════════');
})().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
