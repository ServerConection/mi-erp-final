/**
 * DESCUBRIMIENTO DE CAMPOS BITRIX24
 * Jala UN deal real de Cat:8 y muestra todos los campos UF_CRM disponibles.
 * Desde la carpeta backend: node bitrix-discover-fields.js
 *
 * Úsalo ANTES de mapear campos custom en el servicio de sync.
 */
require('dotenv').config();

const WEBHOOK = process.env.BITRIX_WEBHOOK;

const bitrixCall = async (method, params = {}) => {
  if (!WEBHOOK) throw new Error('BITRIX_WEBHOOK no configurado en .env');

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

  const url = `${WEBHOOK}/${method}.json?${qs.toString()}`;
  const res  = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(`Bitrix [${method}]: ${json.error}`);
  return json;
};

(async () => {
  console.log('🔍 Descubriendo campos de deals Cat:8 en Bitrix24...\n');

  // 1. Jalar 1 deal de Cat:8 con TODOS los campos
  const json = await bitrixCall('crm.deal.list', {
    filter: { CATEGORY_ID: 8 },
    order:  { DATE_MODIFY: 'DESC' },
    select: ['*', 'UF_*'],
    start:  0,
  });

  const deal = (json.result || [])[0];
  if (!deal) {
    console.log('❌ No se encontraron deals en Cat:8');
    process.exit(1);
  }

  console.log(`✅ Deal encontrado: ID=${deal.ID} — "${deal.TITLE}"`);
  console.log(`   Stage: ${deal.STAGE_ID}  |  Asesor: ${deal.ASSIGNED_BY_ID}\n`);

  // 2. Separar campos estándar de campos custom (UF_)
  const standard = {};
  const custom   = {};

  for (const [k, v] of Object.entries(deal)) {
    if (k.startsWith('UF_')) {
      custom[k] = v;
    } else {
      standard[k] = v;
    }
  }

  // 3. Mostrar campos estándar con valor
  console.log('─── CAMPOS ESTÁNDAR ──────────────────────────────────────────');
  for (const [k, v] of Object.entries(standard)) {
    if (v !== null && v !== '' && v !== undefined) {
      console.log(`  ${k.padEnd(30)} = ${JSON.stringify(v)}`);
    }
  }

  // 4. Mostrar todos los campos UF_ (con y sin valor)
  console.log('\n─── CAMPOS CUSTOM (UF_*) ─────────────────────────────────────');
  const ufEntries = Object.entries(custom).sort(([a], [b]) => a.localeCompare(b));
  if (ufEntries.length === 0) {
    console.log('  (ninguno disponible — verifica permisos del webhook)');
  } else {
    for (const [k, v] of ufEntries) {
      const vStr = v !== null && v !== '' ? JSON.stringify(v) : '(vacío)';
      console.log(`  ${k.padEnd(40)} = ${vStr}`);
    }
  }

  console.log(`\n📋 Total campos estándar: ${Object.keys(standard).length}`);
  console.log(`📋 Total campos custom:   ${Object.keys(custom).length}`);
  console.log('\n💡 Usa estos nombres UF_* en el mapeo de bitrix.service.js');

  // 5. También jalar definición de campos via crm.deal.fields
  console.log('\n─── DEFINICIÓN OFICIAL DE CAMPOS (crm.deal.fields) ───────────');
  try {
    const fieldsJson = await bitrixCall('crm.deal.fields', {});
    const fields = fieldsJson.result || {};
    const ufFields = Object.entries(fields)
      .filter(([k]) => k.startsWith('UF_'))
      .sort(([a], [b]) => a.localeCompare(b));

    if (ufFields.length === 0) {
      console.log('  (no se obtuvieron definiciones UF_)');
    } else {
      for (const [k, meta] of ufFields) {
        const titulo = meta.title || meta.listLabel || '';
        console.log(`  ${k.padEnd(40)} → "${titulo}" [${meta.type}]`);
      }
    }
    console.log(`\n📋 Total campos UF_ definidos: ${ufFields.length}`);
  } catch (e) {
    console.log('  (error obteniendo definiciones:', e.message, ')');
  }

  process.exit(0);
})();
