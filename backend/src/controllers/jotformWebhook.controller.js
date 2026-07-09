/**
 * JOTFORM WEBHOOK CONTROLLER
 * Recibe el webhook que Jotform dispara cada vez que alguien ENVÍA el
 * formulario (botón submit del form). Mismo patrón que bitrixWebhook.controller.js:
 *
 *   - jotform_submissions            → 1 fila por submission_id, UPSERT
 *     (la versión más reciente del envío siempre reemplaza a la anterior).
 *   - jotform_submissions_historial  → 1 fila por CADA webhook recibido,
 *     nunca se sobreescribe. Aquí se ve el recorrido completo si Jotform
 *     reintenta o si el mismo submission llega más de una vez.
 *
 * Vive en "erp_database" (poolErp, ver config/dbErp.js) — NO en bddgeneral.
 *
 * Nota importante (documentada por Jotform): el webhook solo se dispara
 * cuando el formulario se envía desde el botón del form. Un submission
 * creado directamente vía la API de Jotform NO dispara el webhook.
 */

const poolErp = require('../config/dbErp');

const recibirSubmission = async (req, res) => {
  try {
    // SEGURIDAD: token compartido en query string, mismo mecanismo que
    // BITRIX_WEBHOOK_TOKEN — se define en la URL que registras en Jotform,
    // ej. https://tu-backend.onrender.com/jotform_webhook.php?token=xxxx
    const tokenEsperado = process.env.JOTFORM_WEBHOOK_TOKEN;
    if (tokenEsperado && req.query.token !== tokenEsperado) {
      return res.status(401).send('No autorizado');
    }

    // Jotform manda multipart/form-data (parseado por multer en la ruta):
    //   formID, submissionID, rawRequest (JSON string con todas las respuestas)
    const { formID, submissionID, rawRequest } = req.body;

    if (!submissionID || !formID) {
      console.warn('[jotformWebhook] Payload sin formID/submissionID:', req.body);
      return res.status(400).send('Falta formID o submissionID');
    }

    let answers = {};
    try {
      answers = rawRequest ? JSON.parse(rawRequest) : {};
    } catch (e) {
      console.warn('[jotformWebhook] rawRequest no es JSON válido, se guarda vacío:', e.message);
    }

    const sqlUpsert = `
      INSERT INTO jotform_submissions (submission_id, form_id, data, submitted_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (submission_id)
      DO UPDATE SET data = EXCLUDED.data, form_id = EXCLUDED.form_id, updated_at = now()
    `;
    const sqlHistorial = `
      INSERT INTO jotform_submissions_historial (submission_id, form_id, data)
      VALUES ($1, $2, $3)
    `;
    const params = [submissionID, formID, answers];

    await poolErp.query(sqlUpsert, params);
    await poolErp.query(sqlHistorial, params);

    // Jotform espera una respuesta rápida (timeout de 30s)
    return res.status(200).send('OK');
  } catch (err) {
    console.error('[jotformWebhook] recibirSubmission error:', err.message);
    return res.status(500).send('Error interno');
  }
};

// ── GET /api/jotform-webhook/submissions?formId=&limit= — requiere sesión del ERP ──
const listarSubmissions = async (req, res) => {
  try {
    const { formId, limit = 100 } = req.query;
    const lim = Math.min(Math.max(parseInt(limit) || 100, 1), 500);

    const { rows } = formId
      ? await poolErp.query(
          'SELECT * FROM jotform_submissions WHERE form_id = $1 ORDER BY submitted_at DESC LIMIT $2',
          [formId, lim]
        )
      : await poolErp.query(
          'SELECT * FROM jotform_submissions ORDER BY submitted_at DESC LIMIT $1',
          [lim]
        );

    return res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    console.error('[jotformWebhook] listarSubmissions error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { recibirSubmission, listarSubmissions };
