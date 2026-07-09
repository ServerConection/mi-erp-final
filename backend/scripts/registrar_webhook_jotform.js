/**
 * REGISTRA (UNA SOLA VEZ) el webhook de Jotform apuntando a este backend.
 *
 * Uso (desde backend/), con el backend YA desplegado en Render:
 *   node scripts/registrar_webhook_jotform.js https://tu-backend.onrender.com
 *
 * Qué hace:
 *   Llama a la API de Jotform (POST /form/{formID}/webhooks) para decirle
 *   "avisa a esta URL cada vez que alguien envíe el formulario". Usa
 *   JOTFORM_API_KEY, JOTFORM_FORM_ID y JOTFORM_WEBHOOK_TOKEN del .env.
 *
 * Requisitos:
 *   - Node >=20 (usa fetch nativo, sin dependencias nuevas).
 *   - Que la migración backend/src/db/migrations/jotform_webhook_leads.sql
 *     ya se haya corrido en pgAdmin contra "erp_database".
 *
 * Nota (documentada por Jotform): el webhook solo se dispara cuando el
 * formulario se envía desde el botón del form, no cuando un submission
 * se crea vía la propia API de Jotform.
 */

require('dotenv').config();

const backendUrl = process.argv[2];
const { JOTFORM_API_KEY, JOTFORM_FORM_ID, JOTFORM_WEBHOOK_TOKEN } = process.env;

if (!backendUrl) {
  console.error('Uso: node scripts/registrar_webhook_jotform.js https://tu-backend.onrender.com');
  process.exit(1);
}
if (!JOTFORM_API_KEY || !JOTFORM_FORM_ID) {
  console.error('Faltan JOTFORM_API_KEY / JOTFORM_FORM_ID en backend/.env');
  process.exit(1);
}

const webhookURL = `${backendUrl.replace(/\/$/, '')}/jotform_webhook.php${JOTFORM_WEBHOOK_TOKEN ? `?token=${JOTFORM_WEBHOOK_TOKEN}` : ''}`;

async function registrarWebhook() {
  const url = `https://api.jotform.com/form/${JOTFORM_FORM_ID}/webhooks?apiKey=${JOTFORM_API_KEY}`;
  const body = new URLSearchParams({ webhookURL });

  const resp = await fetch(url, { method: 'POST', body });
  const json = await resp.json();
  console.log('Respuesta de Jotform:', JSON.stringify(json, null, 2));

  if (json.responseCode !== 200) {
    console.error('El registro pudo haber fallado — revisa el mensaje de arriba.');
    process.exit(1);
  }
  console.log(`\nWebhook registrado correctamente: ${webhookURL}`);
}

registrarWebhook().catch((err) => {
  console.error('Error registrando el webhook:', err.message);
  process.exit(1);
});
