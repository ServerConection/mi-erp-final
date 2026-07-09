/**
 * Lista los campos (preguntas) del formulario de Jotform, con su "name"
 * interno (la llave que aparece dentro del JSON guardado en jotform_submissions.data)
 * y su texto visible. Sirve para armar una tabla/vista ancha (1 columna por pregunta)
 * en vez de dejar todo empacado en el JSONB.
 *
 * Uso (desde backend/):
 *   node scripts/listar_campos_jotform.js                    (usa JOTFORM_FORM_ID del .env)
 *   node scripts/listar_campos_jotform.js 251603619851660    (form ID explícito, ej. Velsa)
 *
 * Usa JOTFORM_API_KEY del .env, y JOTFORM_FORM_ID salvo que pases otro por argumento.
 */

require('dotenv').config();

const JOTFORM_API_KEY = process.env.JOTFORM_API_KEY;
const JOTFORM_FORM_ID = process.argv[2] || process.env.JOTFORM_FORM_ID;

if (!JOTFORM_API_KEY || !JOTFORM_FORM_ID) {
  console.error('Faltan JOTFORM_API_KEY / JOTFORM_FORM_ID (en .env o como argumento)');
  process.exit(1);
}

async function listarCampos() {
  const url = `https://api.jotform.com/form/${JOTFORM_FORM_ID}/questions?apiKey=${JOTFORM_API_KEY}`;
  const resp = await fetch(url);
  const json = await resp.json();

  if (json.responseCode !== 200) {
    console.error('Error consultando campos:', JSON.stringify(json, null, 2));
    process.exit(1);
  }

  const preguntas = Object.values(json.content)
    .filter(q => q.name && q.type !== 'control_button' && q.type !== 'control_head')
    .sort((a, b) => Number(a.order) - Number(b.order));

  console.log('\n=== Campos del formulario', JOTFORM_FORM_ID, '===\n');
  console.log('name'.padEnd(30), '| tipo'.padEnd(22), '| texto visible');
  console.log('-'.repeat(90));
  preguntas.forEach(q => {
    console.log(
      String(q.name).padEnd(30),
      ('| ' + q.type).padEnd(22),
      '| ' + (q.text || '').replace(/<[^>]+>/g, '').slice(0, 60)
    );
  });
  console.log(`\nTotal: ${preguntas.length} campos.\n`);
}

listarCampos().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
