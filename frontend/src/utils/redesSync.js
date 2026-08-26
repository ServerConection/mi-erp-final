export async function forzarSyncInversion({ apiBase = '', token, fetchImpl = fetch, from, to } = {}) {
  const body = {};
  if (from) body.from = from;
  if (to) body.to = to;
  const response = await fetchImpl(`${apiBase}/api/redes/sync-inversion`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    throw new Error(payload.message || `No fue posible actualizar la inversión (HTTP ${response.status}).`);
  }
  return payload;
}