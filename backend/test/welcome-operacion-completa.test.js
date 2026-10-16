const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const migration = read('src/migrations/20261012_welcome_operacion_completa.sql');
const routes = read('src/routes/backoffice.routes.js');
const scheduler = read('src/services/wa_scheduler.service.js');
const service = read('src/services/welcomeWhatsapp.service.js');

for (const code of ['WELCOME_A','WELCOME_B','WELCOME_C','WELCOME_D','WELCOME_E']) assert.match(migration, new RegExp(code));
assert.match(migration, /welcome_config/);
assert.match(migration, /response_status/);
assert.match(routes, /welcome\/pausar/);
assert.match(routes, /welcome\/reanudar/);
assert.match(routes, /welcome\/respuestas/);
assert.match(scheduler, /_classifyWelcomeResponses/);
assert.match(scheduler, /LIMIT 1/);
assert.match(service, /reemplazarVariablesWelcome/);

console.log('OK Welcome: operacion, variantes, respuestas y horario');
