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
const poolErp = require('../config/dbErp');

// Replica una escritura en "erp_database" (el nuevo desarrollo), en el MISMO
// servidor Postgres. Best-effort: si esa base falla, no existe todavía, o
// simplemente no tiene las tablas creadas, se registra el error en consola
// pero NUNCA se propaga — el webhook de Bitrix siempre responde según lo que
// pasó en la base principal (bddgeneral), sin tocar URLs ni token.
const replicarEnErp = async (sql, params) => {
  try {
    await poolErp.query(sql, params);
  } catch (err) {
    console.error('[bitrixWebhook] Aviso: no se pudo replicar en erp_database (no afecta el webhook):', err.message);
  }
};

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

// FIX (2026-09-01, leads que nunca llegaban a bitrix_webhook_leads):
// Bitrix arma la URL del webhook por sustitucion literal de texto, SIN
// URL-encodear. Si un contacto tiene varios telefonos, el placeholder
// {{Contacto: Telefono (texto)}} se expande a
//   "+593986719197, +59324759410, +593994695838, ..."
// y ese espacio parte la URL: todo lo que iba DESPUES de phone= (incluidos
// id= y token=) se pierde -> el webhook responde 401 y el lead nunca se
// guarda. Mismo problema con comentario, ciudad, responsable, etc.
//
// Se ataca en dos frentes:
//   a) en las URLs de las automatizaciones, token/id/etapa van PRIMERO y los
//      campos de texto libre al final (ver webhooks_bitrix_etapas*.html);
//   b) aqui: se tolera el token por header/body, se normaliza el telefono a
//      un solo numero y se deja rastro en log cuando llega algo mutilado.

// Devuelve UN solo telefono normalizado. Bitrix puede mandar varios
// separados por coma; nos quedamos con el primero (el principal del contacto).
const normalizarTelefono = (valor = '') => {
  const crudo = String(valor || '').trim();
  if (!crudo) return '';
  const primero = crudo.split(',')[0].trim();
  const soloDigitos = primero.replace(/[^0-9+]/g, '');
  return soloDigitos || primero;
};

// El token puede venir por query (como siempre), por header o por body. Asi
// una URL que se corto por un espacio todavia tiene chance de autenticarse
// si se reconfigura la automatizacion, sin romper las que ya funcionan.
const tokenRecibido = (req) =>
  req.query.token ||
  req.headers['x-webhook-token'] ||
  (req.body && req.body.token) ||
  '';

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
    if (tokenEsperado && tokenRecibido(req) !== tokenEsperado) {
      // Se loguea el evento/etapa para poder detectar automatizaciones cuya
      // URL se esta cortando (llegan sin token y sin id) en vez de perderlas
      // en silencio con un 401 mudo.
      console.warn('[bitrixWebhook] 401 token invalido o ausente. etapa:', req.query.etapa || '(sin etapa)', '| params recibidos:', Object.keys(req.query).join(','));
      return res.status(401).send('No autorizado');
    }

    const id      = req.query.id || '';
    const empresa = slugify(req.query.empresa || '') || 'novonet'; // retro-compatibilidad

    // FIX (2026-09-01, etapas partidas en dos por renombres en Bitrix):
    // En la URL de cada automatización, "etapa" es un valor FIJO escrito a mano
    // al configurarla, mientras que "etapa_bitrix" es el placeholder dinámico
    // {{Etapa (texto)}} que Bitrix rellena con el nombre REAL de la etapa.
    // Si alguien renombra la etapa en Bitrix (ej. "Gestión Diaria" pasó a ser
    // "Gestion Diaria/Pendiente Cierre"), el valor fijo queda viejo PARA
    // SIEMPRE y nadie se entera: la misma etapa entra a la tabla con dos slugs
    // distintos y los reportes la cuentan partida. Pasó con 125 leads en agosto.
    //
    // Por eso la etapa se deriva del nombre REAL que manda Bitrix, y el valor
    // fijo de la URL queda solo como respaldo si el placeholder viene vacío.
    // Así los renombres se auto-corrigen sin tocar las 53 automatizaciones.
    const etapaFija = slugify(req.query.etapa || '');
    const etapaReal = slugify(req.query.etapa_bitrix || '');
    const etapa     = etapaReal || etapaFija;

    if (etapaReal && etapaFija && etapaReal !== etapaFija) {
      // No es un error: es una automatización cuya URL quedó desactualizada.
      // Se corrige sola acá, pero conviene arreglar la URL en Bitrix para que
      // "event" (que sigue siendo el valor fijo) tampoco quede mintiendo.
      console.warn(`[bitrixWebhook] Etapa renombrada en Bitrix: la URL dice "${etapaFija}" pero la etapa real es "${etapaReal}". Se guarda la real. Revisar esa automatización. bitrix_id: ${id || '(sin id)'}`);
    }

    // Valores de todos los campos Bitrix, en el mismo orden que CAMPOS_BITRIX
    // etapa_bitrix se guarda SIEMPRE en MAYUSCULAS. Bitrix la manda en
    // "Titulo" y las cargas masivas usan el catalogo en MAYUSCULA: sin
    // normalizar, la misma etapa aparece partida en dos al agrupar.
    const valores = CAMPOS_BITRIX.map(campo => {
      const v = req.query[campo] || '';
      if (campo === 'etapa_bitrix') return String(v).trim().toUpperCase();
      if (campo === 'phone') return normalizarTelefono(v);
      return v;
    });

    // Aviso temprano: si el telefono llego con varios numeros, la URL venia
    // con espacios y es MUY probable que se hayan perdido parametros del
    // final. Queda registrado para poder auditarlo despues.
    if (String(req.query.phone || '').includes(',')) {
      console.warn('[bitrixWebhook] phone con multiples numeros (contacto con telefonos duplicados en Bitrix). bitrix_id:', req.query.id || '(sin id)', '| phone crudo:', req.query.phone);
    }

    const columnas = ['bitrix_id', 'empresa', 'etapa', ...CAMPOS_BITRIX, 'raw_query'];
    const placeholders = columnas.map((_, i) => `$${i + 1}`).join(',');

    // Sin ID de Bitrix no hay forma de dar trazabilidad al lead (es la llave
    // que identifica al mismo lead en distintas etapas) — igual se guarda en
    // el historial para no perder el evento, pero no se puede hacer UPSERT.
    if (!id) {
      const sqlHistorialSinId = `INSERT INTO bitrix_webhook_leads_historial (${columnas.join(',')}) VALUES (${placeholders})`;
      const paramsHistorialSinId = [null, empresa, etapa, ...valores, JSON.stringify(req.query)];
      await pool.query(sqlHistorialSinId, paramsHistorialSinId);
      await replicarEnErp(sqlHistorialSinId, paramsHistorialSinId);
      console.warn('[bitrixWebhook] Webhook sin ID recibido — solo se guardó en historial. empresa:', empresa, 'etapa:', etapa);
      return res.status(200).send('OK (sin ID, no se pudo actualizar estado actual)');
    }

    const paramsUpsert = [id, empresa, etapa, ...valores, JSON.stringify(req.query)];

    // FIX (2026-08-27, race condition de creacion): al crear un lead, Bitrix
    // dispara varias automatizaciones casi al mismo tiempo (ej. "Contacto
    // Nuevo" y la etapa real como "ATC" con el MISMISIMO segundo). No llegan
    // garantizadas en orden -- si "contacto_nuevo" llega DESPUES en nuestro
    // servidor, pisaba la etapa correcta y el lead quedaba mal en el estado
    // actual. "Contacto Nuevo" es SIEMPRE la primera etapa de un lead: si el
    // lead ya tiene otra etapa guardada, un webhook de "contacto_nuevo" que
    // llega despues es ese evento duplicado/tardio de la creacion, no un
    // retroceso real -- se ignora SOLO para etapa/etapa_bitrix, el resto de
    // columnas (telefono, responsable, utm, etc.) se sigue actualizando
    // normal. El historial NUNCA se toca -- ahi queda registrado tal cual
    // llego, sin filtrar nada.
    const COLUMNAS_PROTEGIDAS_DE_CONTACTO_NUEVO = ['etapa', 'etapa_bitrix'];
    const setClause = ['etapa', ...CAMPOS_BITRIX, 'raw_query']
      .map(c => {
        if (COLUMNAS_PROTEGIDAS_DE_CONTACTO_NUEVO.includes(c)) {
          return `${c} = CASE
            WHEN EXCLUDED.etapa = 'contacto_nuevo'
             AND bitrix_webhook_leads.etapa IS NOT NULL
             AND bitrix_webhook_leads.etapa <> 'contacto_nuevo'
            THEN bitrix_webhook_leads.${c}
            ELSE EXCLUDED.${c}
          END`;
        }
        return `${c} = EXCLUDED.${c}`;
      })
      .concat(['updated_at = NOW()'])
      .join(', ');

    const sqlUpsertLead = `INSERT INTO bitrix_webhook_leads (${columnas.join(',')})
       VALUES (${placeholders})
       ON CONFLICT (empresa, bitrix_id) DO UPDATE SET ${setClause}`;
    const sqlInsertHistorial = `INSERT INTO bitrix_webhook_leads_historial (${columnas.join(',')}) VALUES (${placeholders})`;

    await pool.transaction(async (client) => {
      // 1) Estado ACTUAL — la etapa nueva reemplaza a la anterior para este
      //    lead (identificado por empresa + bitrix_id, no solo bitrix_id,
      //    porque Novonet y Velsa son 2 Bitrix distintos y pueden repetir IDs)
      await client.query(sqlUpsertLead, paramsUpsert);

      // 2) Historial — queda 1 fila más, nunca se toca lo anterior
      await client.query(sqlInsertHistorial, paramsUpsert);
    });

    // 3) Replica best-effort en erp_database (nuevo desarrollo) — no bloquea
    //    ni afecta la respuesta del webhook si esta base falla o no existe.
    await replicarEnErp(sqlUpsertLead, paramsUpsert);
    await replicarEnErp(sqlInsertHistorial, paramsUpsert);

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
    return res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) });
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
    return res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) });
  }
};

module.exports = { recibirLead, listarLeads, historialLead };
