/**
 * REGISTRA (UNA SOLA VEZ) el webhook de Jotform apuntando a este backend.
 *
 * Uso (desde backend/), con el backend YA desplegado en Render:
 *   node scripts/registrar_webhook_jotform.js https://tu-backend.onrender.com
 *   node scripts/registrar_webhook_jotform.js https://tu-backend.onrender.com 251603619851660  (ej. Velsa)
 *
 * Qué hace:
 *   Llama a la API de Jotform (POST /form/{formID}/webhooks) para decirle
 *   "avisa a esta URL cada vez que alguien envíe el formulario". Usa
 *   JOTFORM_API_KEY y JOTFORM_WEBHOOK_TOKEN del .env, y JOTFORM_FORM_ID
 *   salvo que pases otro form ID como segundo argumento.
 *
 * Requisitos:
 *   - Node >=20 (usa fetch nativo, sin dependencias nuevas).
 *   - Que la migración de tablas correspondiente ya se haya corrido en
 *     pgAdmin contra "erp_database" (jotform_webhook_leads.sql para
 *     NOVONET, jotform_webhook_leads_velsa.sql para VELSA).
 *   - Que ese formID esté agregado en TABLAS_POR_FORM
 *     (backend/src/controllers/jotformWebhook.controller.js), si no,
 *     el webhook llega pero el backend lo rechaza con 400.
 *
 * Nota (documentada por Jotform): el webhook solo se dispara cuando el
 * formulario se envía desde el botón del form, no cuando un submission
 * se crea vía la propia API de Jotform.
 */

require('dotenv').config();

const backendUrl = process.argv[2];
const formId = process.argv[3] || process.env.JOTFORM_FORM_ID;
const { JOTFORM_API_KEY, JOTFORM_WEBHOOK_TOKEN } = process.env;

if (!backendUrl) {
  console.error('Uso: node scripts/registrar_webhook_jotform.js https://tu-backend.onrender.com [formID]');
  process.exit(1);
}
if (!JOTFORM_API_KEY || !formId) {
  console.error('Faltan JOTFORM_API_KEY / JOTFORM_FORM_ID (en .env o como segundo argumento)');
  process.exit(1);
}

const webhookURL = `${backendUrl.replace(/\/$/, '')}/jotform_webhook.php${JOTFORM_WEBHOOK_TOKEN ? `?token=${JOTFORM_WEBHOOK_TOKEN}` : ''}`;

async function registrarWebhook() {
  const url = `https://api.jotform.com/form/${formId}/webhooks?apiKey=${JOTFORM_API_KEY}`;
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
