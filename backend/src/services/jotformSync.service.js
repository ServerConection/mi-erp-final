/**
 * SINCRONIZACIÓN JOTFORM (polling)
 * ─────────────────────────────────────────────────────────────────────
 * El webhook (jotformWebhook.controller.js) captura el envío tal cual
 * estaba AL MOMENTO de enviarse. Pero el equipo interno sigue editando
 * la fila directo en la Tabla de Jotform después (auditoría, estados,
 * comentarios, "biometrico", "netlifeEstatus", etc.) — eso el webhook
 * jamás lo ve. Este servicio llama a la API de Submissions de Jotform
 * (la misma data que respalda la Tabla) y sincroniza el estado completo.
 *
 * Normaliza cada envío al mismo formato plano "qID_nombreCampo" que ya
 * usa el webhook, así jotform_submissions_wide / jotform_submissions_velsa_wide
 * funcionan igual sin importar si el dato llegó por webhook o por este sync.
 *
 * UPSERT inteligente: solo escribe (y solo deja rastro en el historial)
 * si algo REALMENTE cambió — comparación hecha por Postgres mismo con
 * "WHERE data IS DISTINCT FROM EXCLUDED.data", no hay que traer la fila
 * antes para comparar en JS.
 */

const poolErp = require('../config/dbErp');

const JOTFORM_API_KEY = process.env.JOTFORM_API_KEY;

// Mismo mapa que backend/src/controllers/jotformWebhook.controller.js —
// si agregas un formulario nuevo, agrégalo en AMBOS lugares.
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

// answers: { "4": { name:"codigoDel", type:"control_textbox", answer:"4511" }, ... }
// → { "q4_codigoDel": "4511", ... }  (mismo formato que produce el webhook)
function normalizarAnswers(answers) {
  const plano = {};
  for (const [qid, campo] of Object.entries(answers || {})) {
    if (!campo || campo.type === 'control_button' || campo.type === 'control_head') continue;
    if (campo.answer === undefined || campo.answer === '') continue; // sin respuesta, no ensuciar el JSON
    plano[`q${qid}_${campo.name}`] = campo.answer;
  }
  return plano;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Llama a la API de Jotform con reintentos suaves — si Jotform devuelve algo
// que no es JSON (página de error HTML, hiccup temporal, bloqueo pasajero),
// NO truena de inmediato: espera y reintenta un par de veces antes de rendirse.
// Nunca dispara los reintentos en ráfaga (2s, 6s, 15s de espera creciente),
// así que ni en el peor caso se satura la API.
async function fetchJotformJSON(url, { reintentos = 3, contexto = '' } = {}) {
  const ESPERAS_MS = [2000, 6000, 15000];
  let ultimoError;

  for (let intento = 0; intento <= reintentos; intento++) {
    try {
      const resp = await fetch(url);
      const texto = await resp.text();

      let json;
      try {
        json = JSON.parse(texto);
      } catch {
        throw new Error(
          `Respuesta no-JSON de Jotform (status ${resp.status})${contexto ? ` [${contexto}]` : ''}: ${texto.slice(0, 200)}`
        );
      }

      if (json.responseCode !== 200) {
        throw new Error(`Jotform API error${contexto ? ` [${contexto}]` : ''}: ${json.message || JSON.stringify(json)}`);
      }
      return json;
    } catch (err) {
      ultimoError = err;
      if (intento < reintentos) {
        const espera = ESPERAS_MS[Math.min(intento, ESPERAS_MS.length - 1)];
        console.warn(`[jotformSync] Intento ${intento + 1}/${reintentos + 1} falló${contexto ? ` [${contexto}]` : ''}: ${err.message} — reintentando en ${espera / 1000}s`);
        await esperar(espera);
      }
    }
  }
  throw ultimoError;
}

async function traerTodosLosSubmissions(formId) {
  const LIMITE = 1000;
  let offset = 0;
  let todos = [];
  // Jotform pagina de a LIMITE; seguimos pidiendo hasta que un lote venga incompleto.
  while (true) {
    const url = `https://api.jotform.com/form/${formId}/submissions?apiKey=${JOTFORM_API_KEY}&limit=${LIMITE}&offset=${offset}`;
    const json = await fetchJotformJSON(url, { contexto: `submissions form ${formId} offset ${offset}` });
    const lote = json.content || [];
    todos = todos.concat(lote);
    if (lote.length < LIMITE) break;
    offset += LIMITE;
    await esperar(500); // respiro entre páginas, por si acaso hay más de 1000 envíos
  }
  return todos;
}

async function sincronizarFormulario(formId) {
  const cfg = TABLAS_POR_FORM[formId];
  if (!cfg) throw new Error(`formID ${formId} sin tabla configurada en TABLAS_POR_FORM`);

  const submissions = await traerTodosLosSubmissions(formId);
  let actualizados = 0;
  let sinCambios = 0;

  for (const sub of submissions) {
    const data = normalizarAnswers(sub.answers);

    // submitted_at solo se fija al INSERTAR (fila nueva que el webhook nunca
    // capturó); en un UPDATE se deja intacto el valor original del webhook.
    // sub.created_at viene como "YYYY-MM-DD HH:mm:ss" en hora de la cuenta
    // (Ecuador) — se interpreta como tal y Postgres lo pasa a UTC.
    const { rows } = await poolErp.query(
      `INSERT INTO ${cfg.tabla} (submission_id, form_id, data, submitted_at)
       VALUES ($1, $2, $3, ($4::timestamp AT TIME ZONE 'America/Guayaquil'))
       ON CONFLICT (submission_id) DO UPDATE
         SET data = EXCLUDED.data, form_id = EXCLUDED.form_id, updated_at = now()
         WHERE ${cfg.tabla}.data IS DISTINCT FROM EXCLUDED.data
       RETURNING id`,
      [sub.id, formId, data, sub.created_at]
    );

    if (rows.length > 0) {
      actualizados++;
      await poolErp.query(
        `INSERT INTO ${cfg.historial} (submission_id, form_id, data) VALUES ($1, $2, $3)`,
        [sub.id, formId, data]
      );
    } else {
      sinCambios++;
    }
  }

  return { empresa: cfg.empresa, formId, total: submissions.length, actualizados, sinCambios };
}

async function sincronizarTodos() {
  const resultados = [];
  const formIds = Object.keys(TABLAS_POR_FORM);
  for (let i = 0; i < formIds.length; i++) {
    const formId = formIds[i];
    try {
      resultados.push(await sincronizarFormulario(formId));
    } catch (err) {
      console.error(`[jotformSync] Error sincronizando form ${formId}:`, err.message);
      resultados.push({ formId, error: err.message });
    }
    if (i < formIds.length - 1) await esperar(1500); // respiro entre un formulario y otro
  }
  return resultados;
}

module.exports = { sincronizarFormulario, sincronizarTodos, normalizarAnswers, TABLAS_POR_FORM };
