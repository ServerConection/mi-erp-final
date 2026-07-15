/**
 * Trae los envíos MÁS RECIENTES directo de la API de Jotform (no del webhook),
 * tal cual los ve la Tabla de Jotform — sirve para revisar si hay columnas o
 * datos que se editaron/agregaron ahí y que el webhook nunca capturó.
 *
 * Uso (desde backend/):
 *   node scripts/listar_submissions_jotform.js 213356674788673          (Novonet)
 *   node scripts/listar_submissions_jotform.js 251603619851660 3        (Velsa, 3 envíos)
 *
 * Usa JOTFORM_API_KEY del .env.
 */

require('dotenv').config();

const JOTFORM_API_KEY = process.env.JOTFORM_API_KEY;
const formId = process.argv[2];
const cuantos = parseInt(process.argv[3]) || 2;

if (!JOTFORM_API_KEY || !formId) {
  console.error('Uso: node scripts/listar_submissions_jotform.js <formID> [cuantos]');
  process.exit(1);
}

async function listarSubmissions() {
  // Trae un lote grande y ordena en el cliente por created_at desc — más
  // confiable que depender de un parámetro de orden del lado de Jotform.
  const url = `https://api.jotform.com/form/${formId}/submissions?apiKey=${JOTFORM_API_KEY}&limit=100`;
  const resp = await fetch(url);
  const json = await resp.json();

  if (json.responseCode !== 200) {
    console.error('Error consultando submissions:', JSON.stringify(json, null, 2));
    process.exit(1);
  }

  const submissions = (json.content || [])
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, cuantos);

  console.log(`\n=== ${submissions.length} envío(s) más reciente(s) del formulario ${formId} (de ${json.content?.length || 0} traídos) ===\n`);
  console.log(JSON.stringify(submissions, null, 2));
}

listarSubmissions().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
