/* calls-service · front (JS puro, sin build) */
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const h = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = n => Number(n || 0).toLocaleString('es-EC');
const fmtPct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');
const fmtMoney = (n, cur = 'USD') => `${cur === 'USD' ? '$' : cur + ' '}${Number(n || 0).toFixed(Number(n) < 1 ? 4 : 2)}`;
const fmtDur = s => { s = Math.round(s || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtDate = d => (d ? new Date(d).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' }) : '');
const today = () => new Date().toLocaleDateString('en-CA');
const daysAgo = n => new Date(Date.now() - n * 864e5).toLocaleDateString('en-CA');

const STATUS = {
  initiated: ['Marcando…', 'info'], ringing: ['Timbrando', 'info'], accepted: ['En llamada', 'ok'],
  completed: ['Completada', 'ok'], no_answer: ['No contestó', 'warn'], rejected: ['Rechazada', 'bad'],
  missed: ['Perdida', 'bad'], failed: ['Falló', 'bad'],
};
const statusChip = s => `<span class="chip ${STATUS[s]?.[1] || ''}">${h(STATUS[s]?.[0] || s)}</span>`;

// El ERP abre este módulo en un iframe con #token=<JWT del ERP>&to=&name=&ref=
const HASH = new URLSearchParams(location.hash.slice(1));
const SEARCH = new URLSearchParams(location.search);
if (HASH.get('token')) {
  try { sessionStorage.setItem('cs_token', HASH.get('token')); } catch { /* sin storage */ }
  history.replaceState(null, '', location.pathname); // no dejar el token visible en la URL
}
const PREFILL = { to: HASH.get('to') || SEARCH.get('to') || '', name: HASH.get('name') || SEARCH.get('name') || '', ref: HASH.get('ref') || SEARCH.get('ref') || '' };
const EMBEDDED = window.top !== window.self;

const S = {
  token: HASH.get('token') || (() => { try { return sessionStorage.getItem('cs_token'); } catch { return null; } })(),
  me: null, view: 'phone', settings: { outcomes: [], general: {} }, accounts: [],
  call: null, // { logId, waId, phone, name, dir, state, startedAt, connectedAt, timer }
  pending: null, // llamada terminada esperando tipificación
  incoming: null, es: null, pc: null, stream: null, muted: false,
};

/* ---------------- utilidades ---------------- */
function toast(msg, err = false) {
  const d = document.createElement('div');
  d.textContent = msg; if (err) d.className = 'err';
  $('#toast').appendChild(d); setTimeout(() => d.remove(), err ? 7000 : 3500);
}

async function api(path, opts = {}) {
  const r = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: `Bearer ${S.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && S.token) { sessionLost(data.error); throw new Error(data.error || 'Sesión expirada'); }
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}

const isStaff = () => S.me && S.me.role !== 'asesor';
const isAdmin = () => S.me && S.me.role === 'admin';
const qs = o => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)).toString();

/* ---------------- arranque / sesión ---------------- */
async function boot() {
  if (!S.token) return renderNoSession('Abre este módulo desde el ERP (menú WhatsApp → Llamadas WA).');
  try { S.me = await api('/api/me'); } catch (e) { return renderNoSession(e.message); }
  [S.settings, S.accounts] = await Promise.all([api('/api/config/settings'), api('/api/calls/accounts')]);
  connectStream();
  renderShell();
}

function renderNoSession(msg) {
  if (S.es) S.es.close();
  S.me = null;
  $('#root').innerHTML = `<div class="login"><div class="card" style="text-align:center">
    <div style="font-size:42px">☎</div><h2>Llamadas WhatsApp</h2>
    <p class="muted">${h(msg)}</p>
    ${EMBEDDED ? '<button class="btn primary" onclick="location.reload()">Reintentar</button>' : ''}</div></div>`;
}

function sessionLost(msg) {
  S.token = null;
  try { sessionStorage.removeItem('cs_token'); } catch { /* */ }
  hangupLocal(); renderNoSession(msg || 'Tu sesión del ERP expiró. Vuelve a ingresar al ERP.');
}

/* ---------------- shell ---------------- */
const NAV = [
  ['phone', '📞', 'Llamar', () => true],
  ['dashboard', '📊', 'Dashboard', () => true],
  ['history', '🗂️', 'Historial', () => true],
  ['config', '⚙️', 'Configuración', isStaff],
];

function renderShell() {
  $('#root').innerHTML = `
  <div class="app ${EMBEDDED ? 'embedded' : ''}">
    <aside class="side">
      <div class="logo"><i>☎</i> Llamadas WA</div>
      ${NAV.filter(n => n[3]()).map(n => `<button class="nav ${S.view === n[0] ? 'on' : ''}" data-v="${n[0]}">${n[1]} ${n[2]}</button>`).join('')}
      <div class="me"><b>${h(S.me.name)}</b><br><span class="small">${h(S.me.perfil)} · ${h(S.me.empresa)}</span></div>
    </aside>
    <main class="main" id="view"></main>
  </div>`;
  $$('.nav').forEach(b => (b.onclick = () => { S.view = b.dataset.v; renderShell(); }));
  ({ phone: viewPhone, dashboard: viewDashboard, history: viewHistory, config: viewConfig })[S.view]();
  if (S.incoming) renderIncoming();
}

/* ---------------- tiempo real ---------------- */
function connectStream() {
  if (S.es) S.es.close();
  S.es = new EventSource(`/api/stream?token=${encodeURIComponent(S.token)}`);
  S.es.addEventListener('answer', async e => {
    const d = JSON.parse(e.data);
    if (!S.call || d.wa_call_id !== S.call.waId || !S.pc || S.pc.currentRemoteDescription || !d.sdp) return;
    try { await S.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp }); } catch (err) { toast('Audio: ' + err.message, true); }
  });
  S.es.addEventListener('status', e => {
    const d = JSON.parse(e.data);
    if (!S.call || d.wa_call_id !== S.call.waId) return;
    setCallState(d.status);
  });
  S.es.addEventListener('ended', e => {
    const d = JSON.parse(e.data);
    if (S.incoming && S.incoming.wa_call_id === d.wa_call_id) { S.incoming = null; $('#ringModal')?.remove(); }
    if (S.call && d.wa_call_id === S.call.waId) finishCall(d.status, d.duration);
  });
  S.es.addEventListener('incoming', e => {
    const d = JSON.parse(e.data);
    if (S.call) return; // ocupado: otro asesor la toma
    S.incoming = d; renderIncoming(); ringTone(true);
    if (Notification?.permission === 'granted') new Notification('Llamada entrante WhatsApp', { body: d.name || d.phone });
  });
  S.es.addEventListener('claimed', e => {
    const d = JSON.parse(e.data);
    if (S.incoming && S.incoming.wa_call_id === d.wa_call_id) { S.incoming = null; $('#ringModal')?.remove(); ringTone(false); }
  });
}

let ringCtx = null;
function ringTone(on) {
  try {
    if (!on) { ringCtx?.close(); ringCtx = null; return; }
    if (ringCtx) return;
    ringCtx = new AudioContext();
    const o = ringCtx.createOscillator(), g = ringCtx.createGain();
    o.frequency.value = 440; o.connect(g); g.connect(ringCtx.destination); g.gain.value = 0;
    o.start();
    let t = ringCtx.currentTime;
    for (let i = 0; i < 30; i++) { g.gain.setValueAtTime(0.08, t + i * 2); g.gain.setValueAtTime(0, t + i * 2 + 0.8); }
  } catch { /* sin audio */ }
}

/* ---------------- WebRTC ---------------- */
// Deja solo Opus + telephone-event y quita candidatos mDNS (.local), igual que en el Call Lab
function cleanSdp(sdp, codecs = true) {
  const lines = sdp.split('\r\n');
  const keep = new Set();
  for (const l of lines) { const m = l.match(/^a=rtpmap:(\d+) (opus\/48000|telephone-event\/8000)/i); if (m) keep.add(m[1]); }
  return lines.filter(l => {
    if (/^a=candidate:.*\.local /.test(l)) return false;
    if (!codecs) return true;
    const m = l.match(/^a=(rtpmap|fmtp|rtcp-fb):(\d+)/);
    return !(m && !keep.has(m[2]));
  }).map(l => {
    if (codecs && l.startsWith('m=audio')) { const p = l.split(' '); return p.slice(0, 3).concat(p.slice(3).filter(pt => keep.has(pt))).join(' '); }
    return l;
  }).join('\r\n');
}

async function newPeer() {
  S.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  S.pc.ontrack = e => { $('#remoteAudio').srcObject = e.streams[0]; };
  S.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  S.stream.getTracks().forEach(t => S.pc.addTrack(t, S.stream));
}

function waitIce() {
  return new Promise(r => {
    if (S.pc.iceGatheringState === 'complete') return r();
    const t = setTimeout(r, 3000);
    S.pc.onicegatheringstatechange = () => { if (S.pc.iceGatheringState === 'complete') { clearTimeout(t); r(); } };
  });
}

function hangupLocal() {
  S.stream?.getTracks().forEach(t => t.stop());
  S.pc?.close();
  S.pc = null; S.stream = null; S.muted = false;
  if (S.call?.timer) clearInterval(S.call.timer);
}

/* ---------------- vista: Llamar ---------------- */
function viewPhone() {
  const c = S.call;
  $('#view').innerHTML = `
  <div class="top"><div><h2>Llamar</h2><span class="muted">Llamadas de voz por WhatsApp Business</span></div>
    <span class="chip ${!S.me.habilitado ? 'warn' : S.accounts.length ? 'ok' : 'bad'}">${!S.me.habilitado ? '● No habilitado para llamar' : S.accounts.length ? '● Cuenta conectada' : '● Sin cuenta asignada'}</span></div>
  ${S.me.habilitado ? '' : '<div class="card" style="margin-bottom:16px;border-color:#fedf89;background:#fffaeb">Aún no estás habilitado para hacer llamadas. Pide al administrador que te active en <b>Configuración → Asesores</b>.</div>'}
  <div class="grid g2">
    <div class="card phone">
      ${isStaff() && S.accounts.length > 1 ? `<label class="f">Cuenta / línea<select id="acc">${S.accounts.map(a => `<option value="${a.id}">${h(a.name)} ${h(a.display_phone || '')}</option>`).join('')}</select></label>` : ''}
      <label class="f">Número del cliente (con código de país)<input id="to" class="dial" inputmode="tel" placeholder="593 9XXXXXXXX" value="${h(c?.phone || PREFILL.to)}" ${c ? 'disabled' : ''}></label>
      <div class="row">
        <label class="f grow">Nombre del cliente<input id="cname" value="${h(c?.name || PREFILL.name)}" ${c ? 'disabled' : ''}></label>
        <label class="f grow">Ref. CRM (trato/lead)<input id="cref" value="${h(c?.ref || PREFILL.ref)}" ${c ? 'disabled' : ''}></label>
      </div>
      <div class="callstate" id="cstate">${callStateHtml()}</div>
      <div class="callbtns">
        ${c
          ? `<button class="btn" id="mute">${S.muted ? '🎙️ Activar mic' : '🔇 Silenciar'}</button><button class="btn danger" id="hang">Colgar</button>`
          : `<button class="btn" id="perm" ${S.me.habilitado ? '' : 'disabled'}>🔐 Permiso</button><button class="btn primary" id="call" ${S.me.habilitado ? '' : 'disabled'}>📞 Llamar</button>`}
      </div>
      <p class="small muted" style="margin:0">Para llamar, el cliente debe haber aceptado recibir llamadas. Si no, usa <b>Permiso</b> para enviarle la solicitud por WhatsApp.</p>
    </div>
    <div class="grid" style="align-content:start">
      <div class="card ${S.pending ? '' : 'hidden'}" id="typing">${typingHtml()}</div>
      <div class="card"><h3>Mi día <span class="small muted">${today()}</span></h3><div class="grid kpis" id="myKpis"></div></div>
      <div class="card"><h3>Últimas llamadas</h3><div id="recent" class="tablewrap" style="max-height:340px"></div></div>
    </div>
  </div>`;
  if (c) { $('#hang').onclick = hangup; $('#mute').onclick = toggleMute; }
  else { $('#call').onclick = startCall; $('#perm').onclick = permissionFlow; }
  bindTyping();
  loadMyDay();
}

function callStateHtml() {
  const c = S.call;
  if (!c) return `<div class="muted">Listo para llamar</div>`;
  const secs = c.connectedAt ? (Date.now() - c.connectedAt) / 1000 : 0;
  return `<div>${statusChip(c.state)} ${c.dir === 'inbound' ? '<span class="chip">Entrante</span>' : ''}</div>
    <div class="big" id="clock">${fmtDur(secs)}</div><div class="muted">${h(c.name || '')} ${h(c.phone)}</div>`;
}

function setCallState(state) {
  if (!S.call) return;
  S.call.state = state;
  if (state === 'accepted' && !S.call.connectedAt) S.call.connectedAt = Date.now();
  const el = $('#cstate'); if (el) el.innerHTML = callStateHtml();
}

function startTimer() {
  S.call.timer = setInterval(() => {
    const el = $('#clock');
    if (el && S.call?.connectedAt) el.textContent = fmtDur((Date.now() - S.call.connectedAt) / 1000);
  }, 1000);
}

async function startCall() {
  const to = $('#to').value.replace(/\D/g, '');
  if (to.length < 10) return toast('Escribe el número completo con código de país (ej. 5939…)', true);
  if (!S.accounts.length) return toast('No tienes una cuenta de WhatsApp asignada', true);
  const accountId = $('#acc')?.value;
  S.call = { phone: to, name: $('#cname').value.trim(), ref: $('#cref').value.trim(), dir: 'outbound', state: 'initiated' };
  viewPhone();
  try {
    await newPeer();
    await S.pc.setLocalDescription(await S.pc.createOffer());
    await waitIce();
    const r = await api('/api/calls/outbound', { method: 'POST', body: {
      to, name: S.call.name, external_ref: S.call.ref, account_id: accountId, sdp: cleanSdp(S.pc.localDescription.sdp),
    } });
    S.call.waId = r.call.wa_call_id; S.call.logId = r.call.id;
    startTimer();
  } catch (e) {
    toast(e.message, true); hangupLocal(); S.call = null; viewPhone();
  }
}

async function hangup() {
  const c = S.call; if (!c) return;
  if (c.waId) api(`/api/calls/${encodeURIComponent(c.waId)}/terminate`, { method: 'POST' }).catch(() => {});
  // si Meta no confirma en 4 s, cerramos local igual
  setTimeout(() => { if (S.call === c) finishCall(c.connectedAt ? 'completed' : 'no_answer', c.connectedAt ? (Date.now() - c.connectedAt) / 1000 : 0); }, 4000);
}

function toggleMute() {
  S.muted = !S.muted;
  S.stream?.getAudioTracks().forEach(t => (t.enabled = !S.muted));
  $('#mute').textContent = S.muted ? '🎙️ Activar mic' : '🔇 Silenciar';
}

function finishCall(status, duration) {
  const c = S.call; if (!c) return;
  hangupLocal();
  S.call = null;
  if (c.logId) S.pending = { logId: c.logId, phone: c.phone, name: c.name, status, duration, outcome: status === 'no_answer' ? 'no_contesta' : '' };
  toast(`Llamada finalizada: ${STATUS[status]?.[0] || status}`);
  if (S.view === 'phone') viewPhone();
}

function typingHtml() {
  const p = S.pending; if (!p) return '';
  return `<h3>Tipificar llamada ${statusChip(p.status)}</h3>
    <p class="muted" style="margin-top:0">${h(p.name || '')} ${h(p.phone)} · ${fmtDur(p.duration)}</p>
    <div class="outcomes">${S.settings.outcomes.map(o => `<button class="btn sm ${p.outcome === o.key ? 'sel' : ''}" data-o="${h(o.key)}">${h(o.label)}</button>`).join('')}</div>
    <label class="f" style="margin-top:10px">Notas<textarea id="tnotes" placeholder="Qué pidió el cliente, objeciones, próximo paso…"></textarea></label>
    <div class="row" style="margin-top:10px"><button class="btn primary" id="tsave">Guardar</button><button class="btn ghost" id="tskip">Después</button></div>`;
}

function bindTyping() {
  if (!S.pending) return;
  $$('#typing [data-o]').forEach(b => (b.onclick = () => { S.pending.outcome = b.dataset.o; $$('#typing [data-o]').forEach(x => x.classList.toggle('sel', x === b)); }));
  $('#tskip').onclick = () => { S.pending = null; viewPhone(); };
  $('#tsave').onclick = async () => {
    if (!S.pending.outcome) return toast('Elige un resultado', true);
    try {
      await api(`/api/calls/log/${S.pending.logId}`, { method: 'PATCH', body: { outcome: S.pending.outcome, notes: $('#tnotes').value } });
      toast('Tipificación guardada'); S.pending = null; viewPhone();
    } catch (e) { toast(e.message, true); }
  };
}

async function loadMyDay() {
  try {
    const f = { from: today(), to: today(), agent_id: S.me.id };
    const [a, rows] = await Promise.all([api(`/api/analytics?${qs(f)}`), api(`/api/calls?${qs({ ...f, limit: 15 })}`)]);
    const t = a.totals;
    $('#myKpis').innerHTML = [
      ['Llamadas', fmtN(t.calls)], ['Contactadas', `${fmtN(t.answered)} · ${fmtPct(t.outbound_answered, t.outbound)}`],
      ['Hablado', fmtDur(t.talk_sec)], ['Ventas', fmtN(t.sales)],
    ].map(([l, v]) => `<div class="kpi"><div class="l">${l}</div><div class="v" style="font-size:20px">${v}</div></div>`).join('');
    $('#recent').innerHTML = rows.length ? `<table><tbody>${rows.map(r => `
      <tr><td>${r.direction === 'inbound' ? '↙️' : '↗️'} <b>${h(r.contact_name || r.phone)}</b><br><span class="small muted">${h(r.phone)} · ${fmtDate(r.started_at)}</span></td>
      <td>${statusChip(r.status)}<br><span class="small muted">${h(outcomeLabel(r.outcome))}</span></td>
      <td class="num">${fmtDur(r.duration_sec)}</td>
      <td class="right"><button class="btn sm" data-redial="${h(r.phone)}" data-n="${h(r.contact_name || '')}" ${S.call ? 'disabled' : ''}>Rellamar</button></td></tr>`).join('')}</tbody></table>`
      : '<p class="muted" style="padding:12px">Aún no hay llamadas hoy.</p>';
    $$('[data-redial]').forEach(b => (b.onclick = () => { $('#to').value = b.dataset.redial; $('#cname').value = b.dataset.n; }));
  } catch (e) { /* silencioso */ }
}

const outcomeLabel = k => (k ? S.settings.outcomes.find(o => o.key === k)?.label || k : '');

async function permissionFlow() {
  const to = $('#to').value.replace(/\D/g, '');
  if (to.length < 10) return toast('Escribe el número primero', true);
  const account_id = $('#acc')?.value;
  try {
    const r = await api(`/api/calls/permission?${qs({ to, account_id })}`);
    const st = r?.permission?.status;
    if (st === 'granted') return toast('✅ El cliente ya dio permiso. Puedes llamar.');
    const ok = confirm(`Permiso actual: ${st || 'sin permiso'}.\n¿Enviar solicitud de permiso de llamada por WhatsApp a ${to}?`);
    if (!ok) return;
    await api('/api/calls/permission', { method: 'POST', body: { to, account_id } });
    toast('Solicitud enviada. Cuando el cliente acepte, podrás llamar.');
  } catch (e) { toast(e.message, true); }
}

/* entrante */
function renderIncoming() {
  $('#ringModal')?.remove();
  const d = S.incoming; if (!d) return;
  const m = document.createElement('div');
  m.className = 'modal'; m.id = 'ringModal';
  m.innerHTML = `<div class="card ring"><div class="ico pulse">📲</div>
    <h2>${h(d.name || 'Cliente')}</h2><p class="muted">${h(d.phone)} · ${h(d.account || '')}</p>
    <div class="callbtns"><button class="btn danger" id="ringRej">Rechazar</button><button class="btn primary" id="ringAcc">Contestar</button></div></div>`;
  document.body.appendChild(m);
  $("#ringRej").onclick = async () => {
    ringTone(false); m.remove(); const id = d.wa_call_id; S.incoming = null;
    api(`/api/calls/${encodeURIComponent(id)}/reject`, { method: 'POST' }).catch(e => toast(e.message, true));
  };
  $("#ringAcc").onclick = () => answerIncoming(d);
}

async function answerIncoming(d) {
  ringTone(false); $('#ringModal')?.remove(); S.incoming = null;
  S.call = { phone: d.phone, name: d.name, dir: 'inbound', state: 'initiated', waId: d.wa_call_id, logId: d.log_id };
  S.view = 'phone'; renderShell();
  try {
    await newPeer();
    await S.pc.setRemoteDescription({ type: 'offer', sdp: d.sdp });
    await S.pc.setLocalDescription(await S.pc.createAnswer());
    await waitIce();
    await api(`/api/calls/${encodeURIComponent(d.wa_call_id)}/accept`, { method: 'POST', body: { sdp: cleanSdp(S.pc.localDescription.sdp, false) } });
    setCallState('accepted'); startTimer();
  } catch (e) { toast(e.message, true); hangupLocal(); S.call = null; viewPhone(); }
}

/* ---------------- vista: Dashboard ---------------- */
const F = { from: daysAgo(6), to: today(), agent_id: '', account_id: '' };

async function filtersHtml() {
  let agents = [];
  if (isStaff()) agents = await api('/api/config/agents?solo_habilitados=1').catch(() => []);
  return `<div class="row">
    <label class="f">Desde<input type="date" id="ff" value="${F.from}"></label>
    <label class="f">Hasta<input type="date" id="ft" value="${F.to}"></label>
    ${isStaff() ? `<label class="f">Asesor<select id="fa"><option value="">Todos</option>${agents.map(a => `<option value="${a.id}" ${String(F.agent_id) === String(a.id) ? 'selected' : ''}>${h(a.name)}</option>`).join('')}</select></label>` : ''}
    ${isStaff() && S.accounts.length > 1 ? `<label class="f">Cuenta<select id="fc"><option value="">Todas</option>${S.accounts.map(a => `<option value="${a.id}" ${String(F.account_id) === String(a.id) ? 'selected' : ''}>${h(a.name)}</option>`).join('')}</select></label>` : ''}
    <div class="row" style="align-self:flex-end;gap:4px">
      <button class="btn sm" data-r="0">Hoy</button><button class="btn sm" data-r="6">7 días</button><button class="btn sm" data-r="29">30 días</button>
    </div></div>`;
}

function bindFilters(reload) {
  const read = () => { F.from = $('#ff').value; F.to = $('#ft').value; F.agent_id = $('#fa')?.value || ''; F.account_id = $('#fc')?.value || ''; reload(); };
  ['#ff', '#ft', '#fa', '#fc'].forEach(s => { if ($(s)) $(s).onchange = read; });
  $$('[data-r]').forEach(b => (b.onclick = () => { $('#ff').value = daysAgo(+b.dataset.r); $('#ft').value = today(); read(); }));
}

async function viewDashboard() {
  $('#view').innerHTML = `<div class="top"><div><h2>Dashboard comercial</h2><span class="muted">Contactabilidad, productividad, conversión y costo</span></div></div>
    <div class="card" style="margin-bottom:16px" id="filters"></div><div id="dash"><p class="muted">Cargando…</p></div>`;
  $('#filters').innerHTML = await filtersHtml();
  const load = async () => {
    try { renderDash(await api(`/api/analytics?${qs(F)}`)); } catch (e) { $('#dash').innerHTML = `<p class="chip bad">${h(e.message)}</p>`; }
  };
  bindFilters(load); load();
}

function renderDash(a) {
  const t = a.totals;
  const cur = 'USD';
  const kpi = (l, v, s = '') => `<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  const maxDay = Math.max(1, ...a.by_day.map(d => d.calls));
  const hours = Array.from({ length: 24 }, (_, i) => a.by_hour.find(x => x.hour === i) || { hour: i, calls: 0, answered: 0, sales: 0 });
  const totalOut = a.by_outcome.reduce((s, o) => s + o.n, 0) || 1;

  $('#dash').innerHTML = `
  <div class="grid kpis" style="margin-bottom:16px">
    ${kpi('Llamadas', fmtN(t.calls), `${fmtN(t.outbound)} salientes · ${fmtN(t.inbound)} entrantes`)}
    ${kpi('Tasa de contacto', fmtPct(t.outbound_answered, t.outbound), `${fmtN(t.outbound_answered)} de ${fmtN(t.outbound)} salientes contestadas`)}
    ${kpi('Duración promedio', fmtDur(t.avg_sec), `${fmtN(Math.round(t.talk_sec / 60))} min hablados`)}
    ${kpi('Ventas', fmtN(t.sales), `Conversión ${fmtPct(t.sales, t.answered)} sobre contactadas`)}
    ${kpi('Gestión positiva', fmtN(t.positive), fmtPct(t.positive, t.answered) + ' de contactadas')}
    ${kpi('Costo estimado', fmtMoney(t.cost, cur), `${fmtN(t.pulses / 10)} min facturables`)}
    ${kpi('Costo por contacto', t.outbound_answered ? fmtMoney(t.cost / t.outbound_answered, cur) : '—', t.sales ? `Costo por venta ${fmtMoney(t.cost / t.sales, cur)}` : 'Sin ventas aún')}
    ${kpi('Sin tipificar', fmtN(t.untyped), t.untyped ? '⚠️ Llamadas contestadas sin resultado' : '✅ Todo tipificado')}
    ${kpi('Entrantes perdidas', fmtN(t.inbound_missed), `${fmtN(a.online_agents)} asesores conectados ahora`)}
  </div>

  <div class="card" style="margin-bottom:16px"><h3>💡 Lectura rápida</h3><ul class="insights">${insights(a).map(i => `<li>${i}</li>`).join('')}</ul></div>

  <div class="grid g2" style="margin-bottom:16px">
    <div class="card"><h3>Llamadas por día <span class="legend"><span><i style="background:#d0d5dd"></i>Intentos</span><span><i style="background:var(--brand)"></i>Contestadas</span></span></h3>
      ${a.by_day.length ? `<div class="bars">${a.by_day.map(d => `<div class="col" data-tip="${d.day}\n${d.calls} llamadas · ${d.answered} contestadas · ${d.sales} ventas">
        <div class="b" style="height:${((d.calls - d.answered) / maxDay) * 100}%"></div><div class="b a" style="height:${(d.answered / maxDay) * 100}%;border-radius:0"></div></div>`).join('')}</div>
        <div class="xlab">${a.by_day.map(d => `<span>${d.day.slice(5)}</span>`).join('')}</div>` : '<p class="muted">Sin datos</p>'}
    </div>
    <div class="card"><h3>Mejor hora para llamar <span class="small muted">% contacto por hora</span></h3>
      <div class="heat">${hours.map(x => { const r = x.calls ? x.answered / x.calls : 0; return `<div title="${x.hour}:00 · ${x.calls} llamadas · ${fmtPct(x.answered, x.calls)} contacto" style="background:${x.calls ? `rgba(15,157,88,${0.15 + r * 0.85})` : '#f2f4f7'};color:${x.calls ? '#fff' : '#98a2b3'}">${x.hour}</div>`; }).join('')}</div>
      <p class="small muted">Más verde = más clientes contestan a esa hora. Gris = sin llamadas.</p>
      <h3 style="margin-top:14px">Resultados</h3>
      ${a.by_outcome.map(o => `<div class="hbar"><span>${h(o.outcome === 'sin_tipificar' ? 'Sin tipificar' : outcomeLabel(o.outcome))}</span><div class="t"><i style="width:${(o.n / totalOut) * 100}%;${o.outcome === 'sin_tipificar' ? 'background:#f79009' : ''}"></i></div><span class="right">${o.n}</span></div>`).join('') || '<p class="muted">Sin datos</p>'}
    </div>
  </div>

  <div class="card"><h3>Ranking de asesores</h3><div class="tablewrap"><table>
    <thead><tr><th>Asesor</th><th class="num">Llamadas</th><th class="num">Contactadas</th><th class="num">% contacto</th><th class="num">Min hablados</th><th class="num">Prom.</th><th class="num">Ventas</th><th class="num">Conversión</th><th class="num">Sin tipificar</th><th class="num">Costo</th></tr></thead>
    <tbody>${a.by_agent.map(r => `<tr><td><b>${h(r.agent)}</b></td><td class="num">${fmtN(r.calls)}</td><td class="num">${fmtN(r.answered)}</td>
      <td class="num">${fmtPct(r.outbound_answered, r.outbound)}</td><td class="num">${fmtN(Math.round(r.talk_sec / 60))}</td><td class="num">${fmtDur(r.avg_sec)}</td>
      <td class="num"><b>${fmtN(r.sales)}</b></td><td class="num">${fmtPct(r.sales, r.answered)}</td>
      <td class="num">${r.untyped ? `<span class="chip warn">${r.untyped}</span>` : '0'}</td><td class="num">${fmtMoney(r.cost, cur)}</td></tr>`).join('') || '<tr><td colspan="10" class="muted">Sin datos</td></tr>'}</tbody>
  </table></div></div>`;
}

// Conclusiones automáticas para el supervisor
function insights(a) {
  const t = a.totals, out = [];
  if (!t.calls) return ['Aún no hay llamadas en el rango elegido.'];
  const hrs = a.by_hour.filter(x => x.calls >= 3).map(x => ({ ...x, r: x.answered / x.calls })).sort((x, y) => y.r - x.r);
  if (hrs.length) out.push(`La mejor franja es <b>${hrs[0].hour}:00–${hrs[0].hour + 1}:00</b> con ${fmtPct(hrs[0].answered, hrs[0].calls)} de contacto${hrs.length > 1 ? `; la peor, ${hrs.at(-1).hour}:00 (${fmtPct(hrs.at(-1).answered, hrs.at(-1).calls)})` : ''}.`);
  const cr = t.outbound ? t.outbound_answered / t.outbound : 0;
  if (t.outbound >= 10) out.push(cr < 0.35 ? `Contactabilidad baja (${fmtPct(t.outbound_answered, t.outbound)}): revisa permisos de llamada y horarios.` : `Contactabilidad saludable (${fmtPct(t.outbound_answered, t.outbound)}).`);
  if (t.untyped) out.push(`Hay <b>${t.untyped}</b> llamadas contestadas sin tipificar: sin eso no se mide conversión real.`);
  const best = [...a.by_agent].filter(r => r.answered >= 3).sort((x, y) => y.sales / y.answered - x.sales / x.answered)[0];
  if (best && best.sales) out.push(`Mejor conversión: <b>${h(best.agent)}</b> (${fmtPct(best.sales, best.answered)}). Vale la pena replicar su guion.`);
  if (t.sales) out.push(`Cada venta cuesta en promedio <b>${fmtMoney(t.cost / t.sales)}</b> en minutos de WhatsApp.`);
  if (t.inbound_missed) out.push(`Se perdieron <b>${t.inbound_missed}</b> llamadas entrantes: conviene tener asesores conectados en esas horas.`);
  return out;
}

/* ---------------- vista: Historial ---------------- */
async function viewHistory() {
  $('#view').innerHTML = `<div class="top"><div><h2>Historial de llamadas</h2></div><button class="btn" id="csv">⬇️ Exportar CSV</button></div>
    <div class="card" style="margin-bottom:16px"><div id="filters"></div>
      <div class="row" style="margin-top:10px"><label class="f">Teléfono<input id="fp" placeholder="Buscar número"></label>
      <label class="f">Resultado<select id="fo"><option value="">Todos</option>${S.settings.outcomes.map(o => `<option value="${h(o.key)}">${h(o.label)}</option>`).join('')}</select></label>
      <label class="f">Tipo<select id="fd"><option value="">Todas</option><option value="outbound">Salientes</option><option value="inbound">Entrantes</option></select></label></div></div>
    <div class="card"><div class="tablewrap" id="hist"></div></div>`;
  $('#filters').innerHTML = await filtersHtml();
  const extra = () => ({ phone: $('#fp').value, outcome: $('#fo').value, direction: $('#fd').value });
  const load = async () => {
    const rows = await api(`/api/calls?${qs({ ...F, ...extra(), limit: 1000 })}`);
    $('#hist').innerHTML = `<table><thead><tr><th>Fecha</th><th>Cliente</th><th>Asesor</th><th>Estado</th><th class="num">Duración</th><th class="num">Costo</th><th>Resultado</th><th>Notas</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${fmtDate(r.started_at)}<br><span class="small muted">${r.direction === 'inbound' ? 'Entrante' : 'Saliente'} · ${h(r.account_name || '')}</span></td>
        <td><b>${h(r.contact_name || '')}</b><br>${h(r.phone)}${r.external_ref ? `<br><span class="small muted">Ref ${h(r.external_ref)}</span>` : ''}</td>
        <td>${h(r.agent_name || '—')}</td><td>${statusChip(r.status)}${r.error ? `<br><span class="small" style="color:var(--red)">${h(r.error)}</span>` : ''}</td>
        <td class="num">${fmtDur(r.duration_sec)}</td><td class="num">${fmtMoney(r.cost)}</td>
        <td><select data-out="${r.id}"><option value="">—</option>${S.settings.outcomes.map(o => `<option value="${h(o.key)}" ${r.outcome === o.key ? 'selected' : ''}>${h(o.label)}</option>`).join('')}</select></td>
        <td class="small" style="max-width:260px">${h(r.notes || '')}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Sin llamadas</td></tr>'}</tbody></table>`;
    $$('[data-out]').forEach(s => (s.onchange = () => api(`/api/calls/log/${s.dataset.out}`, { method: 'PATCH', body: { outcome: s.value } }).then(() => toast('Actualizado')).catch(e => toast(e.message, true))));
  };
  bindFilters(load);
  ['#fp', '#fo', '#fd'].forEach(s => ($(s).onchange = load));
  $('#csv').onclick = async () => {
    const r = await fetch(`/api/calls/export.csv?${qs({ ...F, ...extra() })}`, { headers: { Authorization: `Bearer ${S.token}` } });
    if (!r.ok) return toast('No se pudo exportar', true);
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = `llamadas_${F.from}_${F.to}.csv`; a.click();
  };
  load().catch(e => toast(e.message, true));
}

/* ---------------- vista: Configuración ---------------- */
let cfgTab = 'accounts';
function viewConfig() {
  $('#view').innerHTML = `<div class="top"><div><h2>Configuración</h2><span class="muted">Cuentas de WhatsApp, asesores y parámetros comerciales</span></div></div>
    <div class="tabs">${[['accounts', 'Cuentas WhatsApp'], ['agents', 'Asesores'], ['params', 'Tipificación y textos']].map(([k, l]) => `<button class="tab ${cfgTab === k ? 'on' : ''}" data-t="${k}">${l}</button>`).join('')}</div>
    <div id="cfg"></div>`;
  $$('[data-t]').forEach(b => (b.onclick = () => { cfgTab = b.dataset.t; viewConfig(); }));
  ({ accounts: cfgAccounts, agents: cfgAgents, params: cfgParams })[cfgTab]().catch(e => toast(e.message, true));
}

async function cfgAccounts() {
  const { accounts, webhook_url } = await api('/api/config/accounts');
  $('#cfg').innerHTML = `
  <div class="grid g2">
    <div class="grid" style="align-content:start">
      ${accounts.map(a => `<div class="acc card">
        <div class="row"><h3 class="grow" style="margin:0">${h(a.name)}</h3><span class="chip ${a.active ? 'ok' : 'bad'}">${a.active ? 'Activa' : 'Inactiva'}</span></div>
        <div class="kv">
          <b>Número</b><span>${h(a.display_phone || '— (usa Probar conexión)')}</span>
          <b>Nombre verificado</b><span>${h(a.verified_name || '—')}</span>
          <b>Phone Number ID</b><span>${h(a.phone_number_id)}</span>
          <b>WABA ID</b><span>${h(a.waba_id || '—')}</span>
          <b>Token</b><span>${h(a.token_hint)} <span class="small muted">(cifrado)</span></span>
          <b>App Secret</b><span>${a.has_app_secret ? '✅ firma de webhook validada' : '<span class="chip warn">No configurado</span>'}</span>
          <b>Tarifa</b><span>${a.rate_per_min} ${h(a.currency)}/min</span>
          <b>Verify token</b><span><code class="copy" data-copy="${h(a.verify_token)}">${h(a.verify_token)}</code></span>
        </div>
        <div id="test-${a.id}" class="small"></div>
        ${isAdmin() ? `<div class="row">
          <button class="btn sm" data-test="${a.id}">🔌 Probar conexión</button>
          <button class="btn sm" data-enable="${a.id}">📞 Activar llamadas</button>
          <button class="btn sm" data-edit="${a.id}">✏️ Editar</button>
          <button class="btn sm" data-toggle="${a.id}" data-active="${a.active}">${a.active ? 'Desactivar' : 'Activar'}</button></div>` : ''}
      </div>`).join('') || '<div class="card"><p class="muted">Aún no hay cuentas vinculadas.</p></div>'}
      <div class="card"><h3>Webhook para Meta</h3>
        <p class="small muted" style="margin-top:0">Pega esto en Meta Developers → tu App → WhatsApp → Configuración → Webhook. Suscribe el campo <b>calls</b>.</p>
        <div class="kv"><b>URL de devolución</b><span><code class="copy" data-copy="${h(webhook_url)}">${h(webhook_url)}</code></span>
        <b>Token de verificación</b><span>El <i>verify token</i> de la cuenta (arriba)</span></div>
      </div>
    </div>
    ${isAdmin() ? `<div class="card" id="accForm">${accountFormHtml()}</div>` : ''}
  </div>`;
  $$('[data-copy]').forEach(c => (c.onclick = () => navigator.clipboard.writeText(c.dataset.copy).then(() => toast('Copiado'))));
  $$('[data-test]').forEach(b => (b.onclick = async () => {
    const box = $(`#test-${b.dataset.test}`); box.innerHTML = 'Probando…';
    try {
      const r = await api(`/api/config/accounts/${b.dataset.test}/test`, { method: 'POST' });
      const c = r.calling;
      box.innerHTML = `<span class="chip ok">✅ Conectado</span> ${h(r.info.verified_name)} · ${h(r.info.display_phone_number)} · calidad <b>${h(r.info.quality_rating || '—')}</b><br>
        Llamadas: ${c ? `<span class="chip ${c.status === 'ENABLED' ? 'ok' : 'warn'}">${h(c.status)}</span>` : `<span class="chip warn">${h(r.callingError || 'sin datos')}</span>`}`;
      S.accounts = await api('/api/calls/accounts');
    } catch (e) { box.innerHTML = `<span class="chip bad">❌ ${h(e.message)}</span>`; }
  }));
  $$('[data-enable]').forEach(b => (b.onclick = async () => {
    if (!confirm('Esto activa la Calling API en el número (ícono de llamada visible para clientes). ¿Continuar?')) return;
    try { await api(`/api/config/accounts/${b.dataset.enable}/enable-calling`, { method: 'POST' }); toast('Llamadas activadas en el número'); }
    catch (e) { toast(e.message, true); }
  }));
  $$('[data-edit]').forEach(b => (b.onclick = () => { $('#accForm').innerHTML = accountFormHtml(accounts.find(a => a.id == b.dataset.edit)); bindAccountForm(); $('#accForm').scrollIntoView({ behavior: 'smooth' }); }));
  $$('[data-toggle]').forEach(b => (b.onclick = async () => {
    try { await api(`/api/config/accounts/${b.dataset.toggle}`, { method: 'PUT', body: { active: b.dataset.active !== 'true' } }); S.accounts = await api('/api/calls/accounts'); cfgAccounts(); }
    catch (e) { toast(e.message, true); }
  }));
  if (isAdmin()) bindAccountForm();
}

function accountFormHtml(a) {
  const ed = !!a;
  return `<h3>${ed ? `Editar: ${h(a.name)}` : 'Vincular cuenta de WhatsApp'}</h3>
  ${ed ? '' : `<ol class="steps small muted">
    <li>En <b>business.facebook.com</b> → Configuración del negocio → <b>Usuarios del sistema</b>: crea uno (Admin) y asígnale la App y la cuenta de WhatsApp de la empresa.</li>
    <li>Genera un <b>token permanente</b> con permisos <code>whatsapp_business_messaging</code> y <code>whatsapp_business_management</code>.</li>
    <li>En Meta Developers → App → WhatsApp → <b>Configuración de la API</b>: copia el <b>Phone Number ID</b> y el <b>WABA ID</b>.</li>
    <li>App Secret: App → Configuración → Básica (recomendado para validar el webhook).</li>
    <li>Guarda, pulsa <b>Probar conexión</b>, configura el webhook y luego <b>Activar llamadas</b>.</li></ol>`}
  <form id="af" class="grid" style="gap:10px">
    <label class="f">Nombre interno<input name="name" required value="${h(a?.name || '')}" placeholder="Ej. NOVONET principal"></label>
    ${ed ? '' : '<label class="f">Phone Number ID<input name="phone_number_id" required inputmode="numeric"></label>'}
    <label class="f">WABA ID (cuenta de WhatsApp Business)<input name="waba_id" value="${h(a?.waba_id || '')}"></label>
    <label class="f">Access Token ${ed ? '<span class="muted">(vacío = no cambiar)</span>' : ''}<input name="token" type="password" autocomplete="off" ${ed ? '' : 'required'}></label>
    <label class="f">App Secret ${ed ? '<span class="muted">(vacío = no cambiar)</span>' : '<span class="muted">(opcional)</span>'}<input name="app_secret" type="password" autocomplete="off"></label>
    <div class="row">
      <label class="f grow">Tarifa por minuto<input name="rate_per_min" type="number" step="0.00001" value="${a?.rate_per_min ?? 0.01392}"></label>
      <label class="f">Moneda<input name="currency" value="${h(a?.currency || 'USD')}" style="width:80px"></label>
      <label class="f">Versión API<input name="api_version" value="${h(a?.api_version || 'v25.0')}" style="width:90px"></label>
    </div>
    <p class="small muted" style="margin:0">El token se guarda cifrado y nunca vuelve a mostrarse. Tarifa Ecuador ≈ 0.01392 USD/min (Resto de Latinoamérica); confírmala en la tabla de Meta.</p>
    <div class="row">${ed ? `<input type="hidden" name="id" value="${a.id}"><button type="button" class="btn ghost" id="afCancel">Cancelar</button>` : ''}<button class="btn primary">${ed ? 'Guardar cambios' : 'Vincular cuenta'}</button></div>
  </form>`;
}

function bindAccountForm() {
  const f = $('#af'); if (!f) return;
  $('#afCancel') && ($('#afCancel').onclick = () => cfgAccounts());
  f.onsubmit = async e => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(f));
    Object.keys(b).forEach(k => b[k] === '' && delete b[k]);
    try {
      if (b.id) await api(`/api/config/accounts/${b.id}`, { method: 'PUT', body: b });
      else await api('/api/config/accounts', { method: 'POST', body: b });
      toast('Cuenta guardada. Ahora pulsa “Probar conexión”.');
      S.accounts = await api('/api/calls/accounts');
      cfgAccounts();
    } catch (err) { toast(err.message, true); }
  };
}

async function cfgAgents() {
  const { accounts } = await api('/api/config/accounts');
  $('#cfg').innerHTML = `<div class="card">
    <h3>Usuarios del ERP habilitados para llamar <span class="chip" id="nhab"></span></h3>
    <p class="small muted" style="margin-top:0">Los asesores entran con su usuario del ERP. Aquí defines quién puede llamar y desde qué cuenta (línea). Piloto recomendado: 2 asesores.</p>
    <div class="row" style="margin-bottom:12px">
      <label class="f grow">Buscar<input id="as" placeholder="Nombre o usuario"></label>
      <label class="f">Empresa<select id="ae"><option value="">Todas</option><option>NOVONET</option><option>VELSA</option></select></label>
      <label class="f">Mostrar<select id="ah"><option value="">Todos</option><option value="1">Solo habilitados</option></select></label>
    </div>
    <div class="tablewrap" id="atable"></div></div>`;
  const accOpts = sel => `<option value="">— Sin cuenta —</option>${accounts.filter(a => a.active).map(a => `<option value="${a.id}" ${String(sel) === String(a.id) ? 'selected' : ''}>${h(a.name)}</option>`).join('')}`;
  const load = async () => {
    const rows = await api(`/api/config/agents?${qs({ search: $('#as').value, empresa: $('#ae').value, solo_habilitados: $('#ah').value })}`);
    $('#nhab').textContent = `${rows.filter(r => r.habilitado).length} habilitados`;
    $('#atable').innerHTML = `<table><thead><tr><th>Usuario</th><th>Perfil</th><th>Empresa</th><th>Puede llamar</th><th>Cuenta WhatsApp</th></tr></thead><tbody>
      ${rows.map(g => `<tr><td><b>${h(g.name || g.username)}</b><br><span class="small muted">${h(g.username)}</span></td>
        <td>${h(g.perfil)}</td><td>${h(g.empresa)}</td>
        <td><label class="row" style="gap:6px"><input type="checkbox" data-hab="${g.id}" ${g.habilitado ? 'checked' : ''} ${isAdmin() ? '' : 'disabled'}> ${g.habilitado ? '<span class="chip ok">Sí</span>' : '<span class="chip">No</span>'}</label></td>
        <td><select data-acc="${g.id}" ${isAdmin() ? '' : 'disabled'}>${accOpts(g.account_id || (g.habilitado ? '' : accounts[0]?.id))}</select></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Sin resultados</td></tr>'}
      </tbody></table>`;
    const save = id => api(`/api/config/agents/${id}`, { method: 'PUT', body: { habilitado: $(`[data-hab="${id}"]`).checked, account_id: $(`[data-acc="${id}"]`).value || null } })
      .then(() => { toast('Guardado'); load(); }).catch(e => toast(e.message, true));
    $$('[data-hab]').forEach(c => (c.onchange = () => {
      if (c.checked && !$(`[data-acc="${c.dataset.hab}"]`).value) { c.checked = false; return toast('Primero elige la cuenta de WhatsApp', true); }
      save(c.dataset.hab);
    }));
    $$('[data-acc]').forEach(s => (s.onchange = () => { if ($(`[data-hab="${s.dataset.acc}"]`).checked) save(s.dataset.acc); }));
  };
  let t; $('#as').oninput = () => { clearTimeout(t); t = setTimeout(load, 300); };
  $('#ae').onchange = load; $('#ah').onchange = load;
  load().catch(e => toast(e.message, true));
}

async function cfgParams() {
  const s = await api('/api/config/settings');
  const ro = isAdmin() ? '' : 'disabled';
  $('#cfg').innerHTML = `<div class="grid g2">
    <div class="card"><h3>Resultados de llamada (tipificación)</h3>
      <p class="small muted" style="margin-top:0">“Positivo” cuenta como gestión positiva en el dashboard. La clave <code>venta</code> se usa para medir conversión.</p>
      <div id="olist">${s.outcomes.map(o => outcomeRow(o, ro)).join('')}</div>
      ${isAdmin() ? '<div class="row"><button class="btn sm" id="oadd">+ Agregar</button><button class="btn primary sm" id="osave">Guardar</button></div>' : ''}
    </div>
    <div class="card"><h3>Mensaje de solicitud de permiso</h3>
      <p class="small muted" style="margin-top:0">Texto que recibe el cliente junto al botón para autorizar llamadas.</p>
      <textarea id="ptext" ${ro} maxlength="1024">${h(s.general?.permission_text || '')}</textarea>
      ${isAdmin() ? '<button class="btn primary sm" id="psave" style="margin-top:10px">Guardar</button>' : ''}
      <h3 style="margin-top:18px">Integración con ERP / Bitrix</h3>
      <p class="small muted">Para un botón “LLAMAR” en el ERP, abre esta URL con los datos del cliente:</p>
      <code class="copy">${h(location.origin)}/?to=5939XXXXXXXX&amp;name=Juan%20Perez&amp;ref=ID_TRATO</code>
    </div></div>`;
  if (!isAdmin()) return;
  $('#oadd').onclick = () => $('#olist').insertAdjacentHTML('beforeend', outcomeRow({ key: '', label: '', positive: false }, ''));
  $('#olist').onclick = e => { if (e.target.dataset.del !== undefined) e.target.closest('.row').remove(); };
  $('#osave').onclick = async () => {
    const outcomes = $$('#olist .row').map(r => ({ key: r.querySelector('[name=key]').value, label: r.querySelector('[name=label]').value, positive: r.querySelector('[name=positive]').checked }));
    try { S.settings = await api('/api/config/settings', { method: 'PUT', body: { outcomes } }); toast('Guardado'); cfgParams(); } catch (e) { toast(e.message, true); }
  };
  $('#psave').onclick = async () => {
    try { S.settings = await api('/api/config/settings', { method: 'PUT', body: { general: { permission_text: $('#ptext').value } } }); toast('Guardado'); } catch (e) { toast(e.message, true); }
  };
}

const outcomeRow = (o, ro) => `<div class="row" style="margin-bottom:8px">
  <input name="label" value="${h(o.label)}" placeholder="Nombre visible" class="grow" ${ro}>
  <input name="key" value="${h(o.key)}" placeholder="clave" style="width:130px" ${ro}>
  <label class="small"><input type="checkbox" name="positive" ${o.positive ? 'checked' : ''} ${ro}> Positivo</label>
  ${ro ? '' : '<button class="btn sm ghost" data-del>✕</button>'}</div>`;

/* pedir permiso de notificaciones para entrantes */
if (window.Notification && Notification.permission === 'default') document.addEventListener('click', () => Notification.requestPermission(), { once: true });
window.addEventListener('beforeunload', e => { if (S.call) { e.preventDefault(); e.returnValue = ''; } });

boot();
