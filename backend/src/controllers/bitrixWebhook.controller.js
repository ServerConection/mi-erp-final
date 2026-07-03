/**
 * BITRIX WEBHOOK CONTROLLER
 * Recibe el webhook saliente que dispara CADA automatización de etapa en
 * Bitrix24 (reemplaza al antiguo bitrix_webhook.php de reportingvidika.online).
 *
 * Es el MISMO endpoint para las 53 etapas de Novonet Y las etapas de Velsa —
 * lo único que cambia entre una automatización y otra son los valores fijos
 * de "etapa" y "empresa" en la URL (tú los escribes una vez al configurar
 * cada automatización, no son placeholders de Bitrix).
 * Ver webhooks_bitrix_etapas_novonet.html / webhooks_bitrix_etapas_velsa.html
 * en la raíz del repo para las URLs ya armadas.
 *
 * Multi-empresa: el mismo ID de negociación puede repetirse entre cuentas
 * Bitrix distintas (Novonet y Velsa son 2 Bitrix separados), por eso la
 * llave de identidad del lead es (empresa, bitrix_id), no solo bitrix_id.
 * Si una automatización no manda "empresa", se asume "novonet" (retro-
 * compatibilidad con las automatizaciones ya configuradas antes de esto).
 *
 * Trazabilidad:
 *   - bitrix_webhook_leads            → 1 fila por lead (empresa+bitrix_id),
 *     UPSERT: la etapa más reciente SIEMPRE reemplaza a la anterior.
 *   - bitrix_webhook_leads_historial  → 1 fila por CADA webhook recibido,
 *     nunca se sobreescribe. Aquí se ve el recorrido completo del lead.
 */

const pool = require('../config/db');

// Normaliza "etapa"/"empresa" para que coincidan con los slugs esperados
// aunque alguien pegue el nombre con espacios/acentos/mayúsculas por error.
const slugify = (valor = '') =>
  String(valor)
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quitar acentos
    .trim()
    .toLowerCase()
    .replace(/[\/]+/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

// Campos que vienen de placeholders de Bitrix (todos opcionales, default '').
// Nota: {{Contacto: Teléfono (texto)}} y {{Origen}} ya se capturan como
// phone/source; {{Negociación repetida > printable}} reemplaza al viejo
// {{Negociación repetida}} bajo el mismo query param "repeated".
const CAMPOS_BITRIX = [
  'event', 'phone', 'source', 'city', 'repeated', 'responsible',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'etapa_bitrix', 'fecha_venta_subida', 'fecha_concretar', 'modificado_por',
  'creado_por', 'creado_por_friendly', 'pipeline', 'comentario', 'iniciado_el',
  'otro_proveedor', 'razon_descarte', 'innegociable', 'volver_a_llamar',
  'documentos_pendientes', 'motivo_atc', 'id_conversacion',
];

const recibirLead = async (req, res) => {
  try {
    // SEGURIDAD: token compartido en query string (Bitrix no permite headers
    // custom en el nodo de automatización, así que se valida por query param).
    const tokenEsperado = process.env.BITRIX_WEBHOOK_TOKEN;
    if (tokenEsperado && req.query.token !== tokenEsperado) {
      return res.status(401).send('No autorizado');
    }

    const id      = req.query.id || '';
    const etapa   = slugify(req.query.etapa || '');
    const empresa = slugify(req.query.empresa || '') || 'novonet'; // retro-compatibilidad

    // Valores de todos los campos Bitrix, en el mismo orden que CAMPOS_BITRIX
    const valores = CAMPOS_BITRIX.map(campo => req.query[campo] || '');

    const columnas = ['bitrix_id', 'empresa', 'etapa', ...CAMPOS_BITRIX, 'raw_query'];
    const placeholders = columnas.map((_, i) => `$${i + 1}`).join(',');

    // Sin ID de Bitrix no hay forma de dar trazabilidad al lead (es la llave
    // que identifica al mismo lead en distintas etapas) — igual se guarda en
    // el historial para no perder el evento, pero no se puede hacer UPSERT.
    if (!id) {
      await pool.query(
        `INSERT INTO bitrix_webhook_leads_historial (${columnas.join(',')}) VALUES (${placeholders})`,
        [null, empresa, etapa, ...valores, JSON.stringify(req.query)]
      );
      console.warn('[bitrixWebhook] Webhook sin ID recibido — solo se guardó en historial. empresa:', empresa, 'etapa:', etapa);
      return res.status(200).send('OK (sin ID, no se pudo actualizar estado actual)');
    }

    const paramsUpsert = [id, empresa, etapa, ...valores, JSON.stringify(req.query)];
    const setClause = ['etapa', ...CAMPOS_BITRIX, 'raw_query']
      .map(c => `${c} = EXCLUDED.${c}`)
      .concat(['updated_at = NOW()'])
      .join(', ');

    await pool.transaction(async (client) => {
      // 1) Estado ACTUAL — la etapa nueva reemplaza a la anterior para este
      //    lead (identificado por empresa + bitrix_id, no solo bitrix_id,
      //    porque Novonet y Velsa son 2 Bitrix distintos y pueden repetir IDs)
      await client.query(
        `INSERT INTO bitrix_webhook_leads (${columnas.join(',')})
         VALUES (${placeholders})
         ON CONFLICT (empresa, bitrix_id) DO UPDATE SET ${setClause}`,
        paramsUpsert
      );

      // 2) Historial — queda 1 fila más, nunca se toca lo anterior
      await client.query(
        `INSERT INTO bitrix_webhook_leads_historial (${columnas.join(',')}) VALUES (${placeholders})`,
        paramsUpsert
      );
    });

    return res.status(200).send('OK');
  } catch (err) {
    console.error('[bitrixWebhook] recibirLead error:', err.message);
    return res.status(500).send('Error interno');
  }
};

// ── GET /api/bitrix-webhook/leads — estado actual de todos los leads ─────────
const listarLeads = async (req, res) => {
  try {
    const { limit = 50, offset = 0, etapa = null, empresa = null } = req.query;
    const params = [];
    const conds = [];
    if (empresa) { params.push(slugify(empresa)); conds.push(`empresa = $${params.length}`); }
    if (etapa)   { params.push(slugify(etapa));   conds.push(`etapa = $${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(parseInt(limit), parseInt(offset));

    const r = await pool.query(
      `SELECT *,
              to_char(created_at AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI:SS') AS created_at,
              to_char(updated_at AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI:SS') AS updated_at
       FROM bitrix_webhook_leads
       ${where}
       ORDER BY updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return res.json({ success: true, data: r.rows, count: r.rows.length });
  } catch (err) {
    console.error('[bitrixWebhook] listarLeads error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ── GET /api/bitrix-webhook/historial?bitrix_id=123 — recorrido de un lead ───
const historialLead = async (req, res) => {
  try {
    const { bitrix_id, empresa = null } = req.query;
    if (!bitrix_id) {
      return res.status(400).json({ success: false, error: 'bitrix_id es requerido' });
    }
    // empresa es opcional pero recomendado: el mismo bitrix_id puede existir
    // en Novonet y en Velsa a la vez (son 2 Bitrix distintos).
    const params = [bitrix_id];
    let where = 'WHERE bitrix_id = $1';
    if (empresa) { params.push(slugify(empresa)); where += ` AND empresa = $${params.length}`; }

    const r = await pool.query(
      `SELECT *,
              to_char(created_at AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI:SS') AS created_at
       FROM bitrix_webhook_leads_historial
       ${where}
       ORDER BY created_at ASC`,
      params
    );
    return res.json({ success: true, bitrix_id, empresa: empresa || null, recorrido: r.rows, count: r.rows.length });
  } catch (err) {
    console.error('[bitrixWebhook] historialLead error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { recibirLead, listarLeads, historialLead };
