/**
 * RECEPTOR DE EVENTOS EN TIEMPO REAL DE BITRIX24
 *
 * Bitrix hace POST acá en CADA alta/modificación de un deal (ONCRMDEALADD /
 * ONCRMDEALUPDATE), registrado con scripts/registrar_evento_bitrix.js.
 * A diferencia de /bitrix_webhook.php (que depende de las automatizaciones de
 * cada etapa y no dispara si el robot ya corrió), este avisa SIEMPRE.
 *
 * Formato que manda Bitrix (application/x-www-form-urlencoded):
 *   event=ONCRMDEALUPDATE
 *   data[FIELDS][ID]=570189
 *   auth[application_token]=...
 *
 * Regla de oro: responder 200 RÁPIDO. Bitrix reintenta y termina desactivando
 * el handler si tarda. Por eso se contesta al instante y el trabajo pesado
 * (consultar crm.deal.get y escribir en la base) va en segundo plano, con una
 * cola en serie para no pasarse del rate limit de Bitrix (2 req/s).
 */

const { procesarEventoDeal } = require('../services/bitrixEvento.service');

// ── Cola en serie ────────────────────────────────────────────────────────────
// Si un supervisor mueve 40 leads de golpe, Bitrix manda 40 eventos casi
// simultáneos. Procesarlos en paralelo haría que Bitrix nos corte por rate
// limit; en serie con una pausa chica entran todos, apenas unos segundos
// después. Se descartan IDs repetidos que ya estén esperando: si el mismo deal
// se editó 3 veces en 2 segundos, alcanza con leerlo una vez al final.
const cola = [];
const enCola = new Set();
let procesando = false;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const drenar = async () => {
  if (procesando) return;
  procesando = true;
  while (cola.length) {
    const { id, evento } = cola.shift();
    enCola.delete(id);
    try {
      const r = await procesarEventoDeal(id, evento);
      if (r.ok && r.cambioEtapa) {
        console.log(`✅ [bitrixEvento] ${id}: ${r.etapaAnterior || '(nuevo)'} → ${r.etapa}`);
      } else if (!r.ok) {
        console.warn(`⚠️  [bitrixEvento] ${id}: ${r.motivo}`);
      }
    } catch (e) {
      console.error(`💥 [bitrixEvento] ${id}:`, e.message);
    }
    await sleep(600); // rate limit Bitrix
  }
  procesando = false;
};

const encolar = (id, evento) => {
  const key = String(id);
  if (enCola.has(key)) return; // ya hay uno pendiente para este deal
  enCola.add(key);
  cola.push({ id: key, evento });
  setImmediate(drenar);
};

const recibirEvento = async (req, res) => {
  try {
    // El token va en la URL del handler (la definimos nosotros al registrarlo
    // con event.bind), igual que en /bitrix_webhook.php.
    const tokenEsperado = process.env.BITRIX_WEBHOOK_TOKEN;
    if (tokenEsperado && req.query.token !== tokenEsperado) {
      console.warn('[bitrixEvento] 401 token invalido. params:', Object.keys(req.query).join(','));
      return res.status(401).send('No autorizado');
    }

    const body   = req.body || {};
    const evento = body.event || req.query.event || 'ONCRMDEALUPDATE';
    const id =
      (body.data && body.data.FIELDS && body.data.FIELDS.ID) ||
      body['data[FIELDS][ID]'] ||
      req.query.id || '';

    if (!id) {
      console.warn('[bitrixEvento] evento sin ID de deal:', JSON.stringify(body).slice(0, 300));
      return res.status(200).send('OK (sin id)');
    }

    encolar(id, evento);
    return res.status(200).send('OK'); // se responde ya; el resto va en background
  } catch (err) {
    console.error('[bitrixEvento] recibirEvento error:', err.message);
    return res.status(200).send('OK'); // 200 igual: un 500 hace que Bitrix reintente y desactive el handler
  }
};

// Reproceso manual de un deal puntual, para probar sin tocar Bitrix:
//   GET /api/bitrix-evento/reprocesar?id=570189   (requiere sesión del ERP)
const reprocesar = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ success: false, error: 'id es requerido' });
    const r = await procesarEventoDeal(id, 'MANUAL');
    return res.json({ success: true, resultado: r });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { recibirEvento, reprocesar };
