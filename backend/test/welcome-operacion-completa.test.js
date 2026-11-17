const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const migration = read('src/migrations/20261012_welcome_operacion_completa.sql');
const variantesPdf = read('src/migrations/20261116_welcome_variantes_pdf.sql');
const conversationUuid = read('src/migrations/20261117_welcome_conversation_uuid.sql');
const routes = read('src/routes/backoffice.routes.js');
const scheduler = read('src/services/wa_scheduler.service.js');
const service = read('src/services/welcomeWhatsapp.service.js');

for (const code of ['WELCOME_A','WELCOME_B','WELCOME_C','WELCOME_D','WELCOME_E']) assert.match(migration, new RegExp(code));
for (const code of ['WELCOME_A','WELCOME_B','WELCOME_C','WELCOME_D','WELCOME_E']) assert.match(variantesPdf, new RegExp(code));
assert.doesNotMatch(variantesPdf, /Sr\.\/Sra\. Cliente/);
assert.doesNotMatch(variantesPdf, /Estimado\/a cliente/i);
assert.equal((variantesPdf.match(/\{\{nombre\}\}/g) || []).length, 5);
assert.match(variantesPdf, /ON CONFLICT \(code\) DO UPDATE/);
assert.match(variantesPdf, /📌 Facturación y pago:\n1️⃣ El servicio/);
assert.match(variantesPdf, /📱 Netlife Access\n/);
assert.match(scheduler, /prepararWhatsappBienvenida\(registro, tarea\.variant_id\)/);
assert.match(routes, /mezclarVariantesWelcome/);
assert.match(routes, /const varianteId = siguienteVarianteId\(\)/);
assert.doesNotMatch(routes, /indice % variante\.rows\.length/);
assert.match(service, /randomInt\(resultado\.rows\.length\)/);
assert.match(migration, /welcome_config/);
assert.match(migration, /response_status/);
assert.match(routes, /welcome\/pausar/);
assert.match(routes, /welcome\/reanudar/);
assert.match(routes, /welcome\/respuestas/);
assert.match(routes, /COALESCE\(wn\.conversation_id::text,chat\.conversation_id::text\)/);
assert.match(conversationUuid, /ALTER COLUMN conversation_id TYPE uuid/);
assert.match(scheduler, /conversation_id=COALESCE\(conversation_id,\$4\)/);
assert.match(scheduler, /_classifyWelcomeResponses/);
assert.match(scheduler, /LIMIT 1/);
assert.match(service, /reemplazarVariablesWelcome/);

console.log('OK Welcome: operacion, variantes, respuestas y horario');
