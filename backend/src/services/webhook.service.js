/**
 * Webhook Service — usado por FlowEngine (webhookNode)
 * Hace llamadas HTTP salientes con timeout y devuelve el JSON de respuesta.
 */
const TIMEOUT_MS = 15000;

async function call({ url, method = 'POST', headers = {}, payload = null }) {
  if (!url) throw new Error('webhook.call: url requerida');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const opts = {
      method: (method || 'POST').toUpperCase(),
      headers: { 'Content-Type': 'application/json', ...headers },
      signal: controller.signal,
    };
    if (payload && opts.method !== 'GET' && opts.method !== 'HEAD') {
      opts.body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    }

    const res = await fetch(url, opts);
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`Webhook ${opts.method} ${url} → HTTP ${res.status}`);
    }

    try { return JSON.parse(text); } catch { return text || null; }
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { call };
