/**
 * BOLSA LEADS — Bitrix24 NOVONET (pipeline "Bolsa Leads", categoría 43)
 *
 * Toda la pauta entra a "Bolsa Leads". Una automatización de Bitrix llama a
 *   /bitrix_webhook_bolsa_leads.php?token=...&id={{ID}}
 * y aquí se decide a qué empresa va según el patrón del ciclo (por defecto
 * 60/40 en ciclos de 10: N V N V N N V N V N). El deal se mueve al pipeline de
 * esa empresa (NETLIFE NUEVO o VELSA, etapa Contacto nuevo) y, si está
 * activado, se le pasa al repartidor de asesores de esa empresa
 * (gestionablesWebhook.controller.js), que hace su trabajo de siempre.
 *
 * - Bolsa APAGADA → no se toca el lead (se queda en Bolsa Leads).
 * - El ciclo solo avanza cuando la entrega a Bitrix salió bien.
 * - Un mismo lead nunca se entrega dos veces.
 */
const poolErp = require('../config/dbErp');
const { bitrixCallNovonet } = require('../services/bitrix.service');
const { EMPRESAS } = require('../shared/repartoEmpresas');
const { normalizarNombre } = require('../shared/repartoGestionables');
const { siguienteEntrega, resumenPatron, PATRON_DEFECTO } = require('../shared/bolsaLeadsPatron');

const DEFAULT = {
  activo: false, modo: 'proporcion', patron: PATRON_DEFECTO, posicion: 0,
  encadenar_reparto: true, categoria_origen: 43, actualizado_por: null, actualizado_en: null,
};

// Bitrix saturado (QUERY_LIMIT_EXCEEDED): se espera y se reintenta
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const bx = async (method, params) => {
  for (let intento = 1; ; intento++) {
    try { return await bitrixCallNovonet(method, params); }
    catch (err) {
      if (!/QUERY_LIMIT_EXCEEDED|Too many requests/i.test(err?.message || '') || intento >= 5) throw err;
      await esperar(1000 * intento + Math.floor(Math.random() * 500));
    }
  }
};

const leerConfig = async (db = poolErp) => {
  try {
    const r = await db.query('SELECT * FROM bolsa_leads_config WHERE id = 1');
    return { ...DEFAULT, ...(r.rows[0] || {}) };
  } catch (e) {
    console.warn('[bolsaLeads] Sin tabla de configuración (¿se corrió 20261029_bolsa_leads.sql?):', e.message);
    return { ...DEFAULT, sin_tabla: true };
  }
};

const registrar = async (db, f) => {
  try {
    await db.query(
      `INSERT INTO bolsa_leads_entregas (bitrix_deal_id, empresa, casilla, modo, estado, detalle, origen)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [f.dealId, f.empresa || null, f.casilla ?? null, f.modo || null, f.estado, f.detalle || null, f.origen || 'webhook']
    ).then((r) => (f.id = r.rows[0].id));
  } catch (e) {
    console.error('[bolsaLeads] No se pudo guardar el registro:', e.message);
  }
  return f.id || null;
};

// ── Pipeline + etapa "Contacto nuevo" de cada empresa (con caché) ───────────
const destinoCache = {};
const resolverDestino = async (empresa) => {
  if (destinoCache[empresa]) return destinoCache[empresa];
  const E = EMPRESAS[empresa];
  let categoria = E.categoryId ? String(E.categoryId) : (/^C(\d+):/.exec(E.stageId || '') || [])[1] || null;
  if (!categoria) {
    const res = await bx('crm.category.list', { entityTypeId: 2 });
    const cats = res.result?.categories || [];
    const cat = cats.find((c) => normalizarNombre(c.name) === normalizarNombre(E.pipeline));
    if (!cat) throw new Error(`No se encontró el pipeline ${E.pipeline} en Bitrix`);
    categoria = String(cat.id);
  }
  let etapa = E.stageId || null;
  if (!etapa) {
    const res = await bx('crm.dealcategory.stage.list', { id: categoria });
    const st = (res.result || []).find((s) => normalizarNombre(s.NAME) === normalizarNombre(E.etapa || 'CONTACTO NUEVO'));
    if (!st) throw new Error(`No se encontró la etapa ${E.etapa} en el pipeline ${E.pipeline}`);
    etapa = st.STATUS_ID;
  }
  return (destinoCache[empresa] = { categoria, etapa });
};

// ── Pasar el lead al repartidor de asesores de la empresa ───────────────────
const pasarAlRepartidor = async (empresa, dealId) => {
  const { reparto } = require('./gestionablesWebhook.controller');
  const out = { code: 200, body: '' };
  const res = {
    status(c) { out.code = c; return this; },
    send(b) { out.body = String(b ?? ''); return this; },
    json(b) { out.body = JSON.stringify(b); return this; },
  };
  await reparto(empresa).recibirGestionable(
    { query: { id: String(dealId), token: process.env.BITRIX_WEBHOOK_TOKEN || '', nombre_asesor: '' } }, res
  );
  if (out.code === 400 && /nombre_asesor/i.test(out.body)) return 'Reparto de asesores apagado: queda con su responsable actual';
  return out.code === 200 ? out.body : `Error del repartidor (${out.code}): ${out.body}`;
};

// ── Entregar UN lead ─────────────────────────────────────────────────────────
// Devuelve { estado: 'entregado'|'omitido'|'error', empresa?, casilla?, detalle }
const distribuir = async (dealId, { origen = 'webhook', forzar = false } = {}) => {
  const cfg0 = await leerConfig();
  if (cfg0.sin_tabla) return { estado: 'error', detalle: 'Falta correr la migración 20261029_bolsa_leads.sql' };
  if (!cfg0.activo && !forzar) {
    await registrar(poolErp, { dealId, estado: 'omitido', detalle: 'Bolsa Leads apagada: el lead se queda en Bolsa Leads', origen });
    return { estado: 'omitido', detalle: 'Bolsa apagada' };
  }

  // ¿Sigue en Bolsa Leads? (Bitrix puede disparar 2 veces o alguien ya lo movió)
  const deal = (await bx('crm.deal.get', { id: dealId })).result;
  if (!deal) {
    await registrar(poolErp, { dealId, estado: 'omitido', detalle: 'El lead no existe en Bitrix', origen });
    return { estado: 'omitido', detalle: 'No existe' };
  }
  if (String(deal.CATEGORY_ID) !== String(cfg0.categoria_origen)) {
    return { estado: 'omitido', detalle: `Ya no está en Bolsa Leads (pipeline ${deal.CATEGORY_ID})` };
  }

  const client = await poolErp.connect();
  let r;
  try {
    await client.query('BEGIN');
    // Candado: dos leads al mismo tiempo nunca toman la misma casilla del ciclo
    const cfg = { ...DEFAULT, ...(await client.query('SELECT * FROM bolsa_leads_config WHERE id = 1 FOR UPDATE')).rows[0] };
    const ya = await client.query(
      `SELECT empresa FROM bolsa_leads_entregas WHERE bitrix_deal_id = $1 AND estado = 'entregado' LIMIT 1`, [String(dealId)]
    );
    if (ya.rows.length) {
      await client.query('COMMIT');
      return { estado: 'omitido', empresa: ya.rows[0].empresa, detalle: 'Ya fue entregado antes' };
    }

    const sig = siguienteEntrega({ patron: cfg.patron, posicion: cfg.posicion, modo: cfg.modo });
    const destino = await resolverDestino(sig.empresa);
    // crm.deal.update no permite cambiar de pipeline; crm.item.update sí
    const upd = await bx('crm.item.update', {
      entityTypeId: 2, id: dealId, fields: { categoryId: destino.categoria, stageId: destino.etapa },
    });
    const item = upd.result?.item;
    if (!item || String(item.categoryId) !== String(destino.categoria)) {
      throw new Error(`Bitrix no movió el lead al pipeline ${EMPRESAS[sig.empresa].pipeline}`);
    }

    await client.query('UPDATE bolsa_leads_config SET posicion = $1 WHERE id = 1', [sig.siguiente]);
    const ins = await client.query(
      `INSERT INTO bolsa_leads_entregas (bitrix_deal_id, empresa, casilla, modo, estado, detalle, origen)
       VALUES ($1,$2,$3,$4,'entregado',$5,$6) RETURNING id`,
      [String(dealId), sig.empresa, sig.slot, cfg.modo, `Movido a ${EMPRESAS[sig.empresa].pipeline} / Contacto nuevo`, origen]
    );
    await client.query('COMMIT');
    r = { estado: 'entregado', empresa: sig.empresa, casilla: sig.slot, id: ins.rows[0].id, encadenar: cfg.encadenar_reparto };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`[bolsaLeads] Deal ${dealId} error:`, err.message);
    await registrar(poolErp, { dealId, estado: 'error', detalle: err.message, origen });
    return { estado: 'error', detalle: err.message };
  } finally {
    client.release();
  }

  console.log(`[bolsaLeads] Deal ${dealId} → ${EMPRESAS[r.empresa].etiqueta}${r.casilla ? ` (casilla ${r.casilla})` : ''}`);
  if (r.encadenar) {
    let resultado;
    try { resultado = await pasarAlRepartidor(r.empresa, dealId); }
    catch (e) { resultado = `Error del repartidor: ${e.message}`; }
    await poolErp.query('UPDATE bolsa_leads_entregas SET reparto_resultado = $2 WHERE id = $1', [r.id, resultado]).catch(() => {});
    r.reparto = resultado;
  }
  return r;
};

// ── Leads que se quedaron en Bolsa Leads (p. ej. mientras estaba apagada) ───
let pendientesEnCurso = false;
const distribuirPendientes = async ({ limite = 50 } = {}) => {
  if (pendientesEnCurso) return { procesados: 0, motivo: 'ya hay una pasada en curso' };
  pendientesEnCurso = true;
  try {
    const cfg = await leerConfig();
    if (!cfg.activo) return { procesados: 0, motivo: 'Bolsa Leads está apagada' };
    const json = await bx('crm.deal.list', {
      filter: { CATEGORY_ID: cfg.categoria_origen }, select: ['ID'], order: { DATE_CREATE: 'ASC' },
    });
    const ids = (json.result || []).slice(0, limite).map((d) => String(d.ID));
    const resumen = { procesados: 0, novonet: 0, velsa: 0, errores: 0, total_en_bolsa: json.total ?? ids.length };
    for (const id of ids) {
      const r = await distribuir(id, { origen: 'pendientes' });
      resumen.procesados++;
      if (r.estado === 'entregado') resumen[r.empresa]++;
      if (r.estado === 'error') resumen.errores++;
    }
    return resumen;
  } finally {
    pendientesEnCurso = false;
  }
};

// ── Webhook de Bitrix ────────────────────────────────────────────────────────
const recibirBolsaLead = async (req, res) => {
  const dealId = String(req.query.id || req.body?.id || '').trim();
  const tokenEsperado = process.env.BITRIX_WEBHOOK_TOKEN;
  if (tokenEsperado && req.query.token !== tokenEsperado) return res.status(401).send('No autorizado');
  if (!/^\d+$/.test(dealId)) return res.status(400).send('Falta id');
  try {
    const r = await distribuir(dealId);
    return res.status(200).send(r.estado === 'entregado' ? `OK → ${EMPRESAS[r.empresa].etiqueta}` : `OK (${r.detalle})`);
  } catch (err) {
    console.error('[bolsaLeads] webhook error:', err.message);
    await registrar(poolErp, { dealId, estado: 'error', detalle: err.message });
    return res.status(500).send('Error interno');
  }
};

module.exports = { recibirBolsaLead, distribuir, distribuirPendientes, leerConfig, resumenPatron };
