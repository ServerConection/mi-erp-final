function crearRequestBitrix({ fetchImpl = fetch, timeoutMs = 30000 } = {}) {
  return async function request(crm, method, params = {}) {
    if (!crm?.webhook) throw new Error(`Webhook no configurado para ${crm?.empresa || 'CRM'}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${crm.webhook.replace(/\/$/, '')}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(params),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Bitrix HTTP ${response.status} en ${method}`);
      const payload = await response.json();
      if (payload?.error) throw new Error(`Bitrix ${payload.error} en ${method}`);
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  };
}

module.exports = { crearRequestBitrix };

