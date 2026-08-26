function crearRequestBitrix({ fetchImpl = fetch, timeoutMs = 30000, reintentos = 3, espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  return async function request(crm, method, params = {}) {
    if (!crm?.webhook) throw new Error(`Webhook no configurado para ${crm?.empresa || 'CRM'}`);
    for (let intento = 0; intento <= reintentos; intento += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${crm.webhook.replace(/\/$/, '')}/${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(params),
          signal: controller.signal,
        });
        if (!response.ok) {
          const temporal = response.status === 429 || response.status >= 500;
          if (temporal && intento < reintentos) {
            await espera(500 * (2 ** intento));
            continue;
          }
          throw new Error(`Bitrix HTTP ${response.status} en ${method}`);
        }
        const payload = await response.json();
        if (payload?.error) throw new Error(`Bitrix ${payload.error} en ${method}`);
        return payload;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new Error(`Bitrix sin respuesta en ${method}`);
  };
}

module.exports = { crearRequestBitrix };
