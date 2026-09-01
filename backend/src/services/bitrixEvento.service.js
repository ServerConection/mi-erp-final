/**
 * EVENTOS EN TIEMPO REAL DE BITRIX24  (ONCRMDEALADD / ONCRMDEALUPDATE)
 * ---------------------------------------------------------------------------
 * POR QUÉ EXISTE (2026-09-01):
 *   Hasta ahora bitrix_webhook_leads dependía de las automatizaciones ("robots")
 *   configuradas dentro de cada etapa. Ese mecanismo tiene un límite de Bitrix
 *   que no se puede sortear: un robot corre la PRIMERA vez que el deal entra a
 *   la etapa. Si el deal ya pasó antes por ahí, si es negociación repetida, o
 *   si lo movió otro robot, el webhook NO dispara y el ERP nunca se entera.
 *   Ese es el caso del deal 570189: cambiaba de etapa en Bitrix y en el ERP
 *   se quedaba congelado.
 *
 *   Los EVENTOS son otro mecanismo, y no tienen ese límite: se registran una
 *   sola vez por API (event.bind) y Bitrix avisa en CADA modificación de CADA
 *   deal, sin importar etapas, robots ni repeticiones.
 *
 *   Resultado: el lead se mueve en el ERP cuando lo movés en Bitrix. Punto.
 *
 * Bitrix solo manda el ID del deal en el evento, así que acá se consulta el
 * estado actual con crm.deal.get y se escribe la etapa REAL.
 */

const pool = require('../config/db');
const { bitrixCallNovonet } = require('./bitrix.service');

const EMPRESA = 'novonet';

const slugify = (valor = '') =>
  String(valor)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase()
    .replace(/[\/]+/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

// ── Cachés (los catálogos casi no cambian; se refrescan cada hora) ───────────
const TTL_MS = 60 * 60 * 1000;
let cacheEtapas  = { data: null, ts: 0 };
let cacheUsuarios = { data: null, ts: 0 };

const etapas = async () => {
  if (cacheEtapas.data && Date.now() - cacheEtapas.ts < TTL_MS) return cacheEtapas.data;
  const mapa = {};
  const cats = (await bitrixCallNovonet('crm.dealcategory.list')).result || [];
  for (const c of [{ ID: 0 }, ...cats]) {
    try {
      const st = (await bitrixCallNovonet('crm.dealcategory.stage.list', { id: c.ID })).result || [];
      st.forEach(s => { mapa[s.STATUS_ID] = s.NAME; });
    } catch (_) { /* categoría sin etapas */ }
  }
  cacheEtapas = { data: mapa, ts: Date.now() };
  return mapa;
};

const usuarios = async () => {
  if (cacheUsuarios.data && Date.now() - cacheUsuarios.ts < TTL_MS) return cacheUsuarios.data;
  const mapa = {};
  try {
    const us = (await bitrixCallNovonet('user.get', { ACTIVE: true })).result || [];
    us.forEach(u => {
      mapa[String(u.ID)] = [u.NAME, u.SECOND_NAME, u.LAST_NAME].filter(Boolean).join(' ').trim();
    });
  } catch (_) { /* si falla, se guarda el ID y listo */ }
  cacheUsuarios = { data: mapa, ts: Date.now() };
  return mapa;
};

// Teléfono del contacto: se consulta SOLO si la fila todavía no tiene uno.
// Así un deal que se mueve 20 veces al día no gasta 20 llamadas extra a Bitrix.
const telefonoDeContacto = async (contactId) => {
  if (!contactId || contactId === '0') return '';
  try {
    const c = (await bitrixCallNovonet('crm.contact.get', { id: contactId })).result;
    const tel = (c && c.PHONE && c.PHONE[0] && c.PHONE[0].VALUE) || '';
    return String(tel).replace(/[^0-9+]/g, '').slice(0, 30);
  } catch (_) { return ''; }
};

/**
 * Procesa un evento de deal: lee el estado actual en Bitrix y lo refleja en la
 * tabla. Es idempotente — si llega el mismo evento dos veces, no pasa nada.
 */
const procesarEventoDeal = async (bitrixId, evento = 'ONCRMDEALUPDATE') => {
  const id = String(bitrixId || '').trim();
  if (!id) return { ok: false, motivo: 'sin id' };

  const r = await bitrixCallNovonet('crm.deal.get', { id });
  const d = r.result;
  if (!d || !d.ID) return { ok: false, motivo: 'deal inexistente en Bitrix' };

  const [mapaEtapas, mapaUsuarios] = await Promise.all([etapas(), usuarios()]);
  const nombreEtapa = mapaEtapas[d.STAGE_ID] || d.STAGE_ID || '';
  const etapa       = slugify(nombreEtapa);
  const responsable = mapaUsuarios[String(d.ASSIGNED_BY_ID)] || String(d.ASSIGNED_BY_ID || '');

  // ¿ya existe la fila y con qué etapa? (para no reescribir de más ni pedir el
  // teléfono cuando ya lo tenemos)
  const previo = await pool.query(
    'SELECT etapa, phone FROM bitrix_webhook_leads WHERE empresa = $1 AND bitrix_id = $2',
    [EMPRESA, id]
  );
  const fila = previo.rows[0];

  let phone = fila && fila.phone ? fila.phone : '';
  if (!phone) phone = await telefonoDeContacto(d.CONTACT_ID);

  const raw = JSON.stringify({
    origen: 'evento_bitrix', evento,
    recibido: new Date().toISOString(),
    stage_id: d.STAGE_ID, category_id: d.CATEGORY_ID, date_modify: d.DATE_MODIFY,
  });

  const params = [
    id, EMPRESA, etapa, 'evento_bitrix', String(nombreEtapa).toUpperCase(),
    phone || null, d.SOURCE_ID || null,
    d.IS_REPEATED_APPROACH === 'Y' ? 'Y' : 'N',
    responsable || null, raw,
  ];

  // A diferencia del webhook de etapas, acá la etapa viene de crm.deal.get:
  // es el estado REAL de Bitrix en este instante, no un valor fijo de una URL.
  await pool.query(
    `INSERT INTO bitrix_webhook_leads
       (bitrix_id, empresa, etapa, event, etapa_bitrix, phone, source, repeated, responsible, raw_query)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (empresa, bitrix_id) DO UPDATE
       SET etapa        = EXCLUDED.etapa,
           etapa_bitrix = EXCLUDED.etapa_bitrix,
           event        = EXCLUDED.event,
           source       = COALESCE(EXCLUDED.source, bitrix_webhook_leads.source),
           repeated     = EXCLUDED.repeated,
           responsible  = COALESCE(EXCLUDED.responsible, bitrix_webhook_leads.responsible),
           phone        = COALESCE(bitrix_webhook_leads.phone, EXCLUDED.phone),
           raw_query    = EXCLUDED.raw_query,
           updated_at   = NOW()`,
    params
  );

  // Historial: solo cuando la etapa REALMENTE cambió. Bitrix dispara
  // ONCRMDEALUPDATE por cualquier edición (un comentario, un campo), y si
  // guardáramos todas, el historial dejaría de servir para ver el recorrido.
  const cambioEtapa = !fila || fila.etapa !== etapa;
  if (cambioEtapa) {
    await pool.query(
      `INSERT INTO bitrix_webhook_leads_historial
         (bitrix_id, empresa, etapa, event, etapa_bitrix, phone, source, repeated, responsible, raw_query)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      params
    );
  }

  return { ok: true, id, etapa, etapaAnterior: fila ? fila.etapa : null, cambioEtapa, nuevo: !fila };
};

module.exports = { procesarEventoDeal, slugify };
