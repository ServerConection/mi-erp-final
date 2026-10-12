const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const leer = relativo => fs.readFileSync(path.join(__dirname, '..', relativo), 'utf8');
const rutas = leer('src/routes/backoffice.routes.js');
const scheduler = leer('src/services/wa_scheduler.service.js');

assert.doesNotMatch(rutas, /require\('\.\.\/services\/email\.service'\)/);
assert.doesNotMatch(rutas, /await enviarBienvenidaWelcome/);
assert.doesNotMatch(scheduler, /require\('\.\/email\.service'\)/);
assert.doesNotMatch(scheduler, /await enviarBienvenidaWelcome/);
assert.match(rutas, /VALUES \(\$1, \$2, 'pending', true, false/);
assert.match(scheduler, /SET status='processing', email_sent=true/);
assert.match(scheduler, /if \(whatsappSent\)/);
console.log('OK Welcome: envío exclusivo por WhatsApp');
