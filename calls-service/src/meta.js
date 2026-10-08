// Cliente de la Graph API de Meta por cuenta (el token se descifra solo al momento de usarlo)
const { decrypt } = require('./security');

async function graph(account, method, path, body) {
  const url = `https://graph.facebook.com/${account.api_version || 'v25.0'}/${path}`;
  const r = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    method,
    headers: {
      Authorization: `Bearer ${decrypt(account.token_enc)}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(e => {
    const err = new Error(`No se pudo conectar con Meta (${e.name === 'TimeoutError' ? 'tiempo agotado' : e.message})`);
    err.status = 502;
    throw err;
  });
  let data;
  try { data = await r.json(); } catch { data = {}; }
  if (!r.ok) {
    const msg = data?.error?.error_user_msg || data?.error?.message || `HTTP ${r.status}`;
    const err = new Error(`Meta: ${msg}`);
    err.status = 502; // no reutilizar 401/403 de Meta: el front los interpretaría como sesión vencida
    err.metaStatus = r.status;
    err.meta = data?.error;
    throw err;
  }
  return data;
}

const P = a => a.phone_number_id;

module.exports = {
  phoneInfo: a => graph(a, 'GET', `${P(a)}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,throughput`),
  getCallSettings: a => graph(a, 'GET', `${P(a)}/settings`),
  enableCalling: a => graph(a, 'POST', `${P(a)}/settings`, {
    calling: { status: 'ENABLED', call_icon_visibility: 'DEFAULT', callback_permission_status: 'ENABLED' },
  }),
  checkPermission: (a, waId) => graph(a, 'GET', `${P(a)}/call_permissions?user_wa_id=${encodeURIComponent(waId)}`),
  requestPermission: (a, to, text) => graph(a, 'POST', `${P(a)}/messages`, {
    messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'interactive',
    interactive: { type: 'call_permission_request', action: { name: 'call_permission_request' }, body: { text } },
  }),
  connect: (a, to, sdp) => graph(a, 'POST', `${P(a)}/calls`, {
    messaging_product: 'whatsapp', to, action: 'connect', session: { sdp_type: 'offer', sdp },
  }),
  preAccept: (a, callId, sdp) => graph(a, 'POST', `${P(a)}/calls`, {
    messaging_product: 'whatsapp', call_id: callId, action: 'pre_accept', session: { sdp_type: 'answer', sdp },
  }),
  accept: (a, callId, sdp) => graph(a, 'POST', `${P(a)}/calls`, {
    messaging_product: 'whatsapp', call_id: callId, action: 'accept', session: { sdp_type: 'answer', sdp },
  }),
  reject: (a, callId) => graph(a, 'POST', `${P(a)}/calls`, { messaging_product: 'whatsapp', call_id: callId, action: 'reject' }),
  terminate: (a, callId) => graph(a, 'POST', `${P(a)}/calls`, { messaging_product: 'whatsapp', call_id: callId, action: 'terminate' }),
};
