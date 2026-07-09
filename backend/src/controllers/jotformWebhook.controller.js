/**
 * JOTFORM WEBHOOK CONTROLLER
 * Recibe el webhook que Jotform dispara cada vez que alguien ENVÍA un
 * formulario (botón submit del form). Mismo patrón que bitrixWebhook.controller.js,
 * pero MULTI-FORMULARIO: cada empresa (NOVONET, VELSA, ...) tiene su propio
 * form de Jotform y su propio par de tablas, porque las preguntas de cada
 * formulario son completamente distintas:
 *
 *   NOVONET (213356674788673) → jotform_submissions / jotform_submissions_historial
 *   VELSA   (251603619851660) → jotform_submissions_velsa / jotform_submissions_velsa_historial
 *
 * En ambos casos:
 *   - tabla base       → 1 fila por submission_id, UPSERT (versión más reciente).
 *   - tabla _historial  → 1 fila por CADA webhook recibido, nunca se sobreescribe.
 *
 * El ruteo a la tabla correcta se hace por "formID" (siempre lo manda Jotform
 * en el payload) contra TABLAS_POR_FORM — no hace falta configurar nada extra
 * al registrar el webhook en Jotform.
 *
 * Vive en "erp_database" (poolErp, ver config/dbErp.js) — NO en bddgeneral.
 *
 * Nota importante (documentada por Jotform): el webhook solo se dispara
 * cuando el formulario se envía desde el botón del form. Un submission
 * creado directamente vía la API de Jotform NO dispara el webhook.
 */

const poolErp = require('../config/dbErp');

// Mapa formID → nombres de tabla. Los nombres son fijos (no vienen del
// request), así que es seguro interpolarlos directo en el SQL más abajo.
const TABLAS_POR_FORM = {
  [process.env.JOTFORM_FORM_ID || '213356674788673']: {
    empresa: 'novonet',
    tabla: 'jotform_submissions',
    historial: 'jotform_submissions_historial',
  },
  [process.env.JOTFORM_FORM_ID_VELSA || '251603619851660']: {
    empresa: 'velsa',
    tabla: 'jotform_submissions_velsa',
    historial: 'jotform_submissions_velsa_historial',
  },
};

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

    const cfg = TABLAS_POR_FORM[formID];
    if (!cfg) {
      console.warn('[jotformWebhook] formID sin tabla configurada:', formID);
      return res.status(400).send('formID no reconocido — agrégalo a TABLAS_POR_FORM');
    }

    let answers = {};
    try {
      answers = rawRequest ? JSON.parse(rawRequest) : {};
    } catch (e) {
      console.warn('[jotformWebhook] rawRequest no es JSON válido, se guarda vacío:', e.message);
    }

    const sqlUpsert = `
      INSERT INTO ${cfg.tabla} (submission_id, form_id, data, submitted_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (submission_id)
      DO UPDATE SET data = EXCLUDED.data, form_id = EXCLUDED.form_id, updated_at = now()
    `;
    const sqlHistorial = `
      INSERT INTO ${cfg.historial} (submission_id, form_id, data)
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

// ── GET /api/jotform-webhook/submissions?empresa=novonet|velsa&limit= — requiere sesión del ERP ──
const listarSubmissions = async (req, res) => {
  try {
    const { empresa = 'novonet', limit = 100 } = req.query;
    const lim = Math.min(Math.max(parseInt(limit) || 100, 1), 500);

    const cfg = Object.values(TABLAS_POR_FORM).find(c => c.empresa === String(empresa).toLowerCase());
    if (!cfg) {
      return res.status(400).json({ success: false, error: 'empresa inválida (novonet|velsa)' });
    }

    const { rows } = await poolErp.query(
      `SELECT * FROM ${cfg.tabla} ORDER BY submitted_at DESC LIMIT $1`,
      [lim]
    );

    return res.json({ success: true, empresa: cfg.empresa, data: rows, count: rows.length });
  } catch (err) {
    console.error('[jotformWebhook] listarSubmissions error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { recibirSubmission, listarSubmissions };
