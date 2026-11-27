/**
 * AUTOMARCADOR BITRIX — lado asesor.
 *
 * Bitrix abre /api/llamadas/bitrix-dialer/app dentro de una app local NUEVA
 * ("Automarcador"), separada de la app WABOT/LLAMAR que ya existe. La página
 * usa el SDK BX24 para:
 *   1) pedir al ERP el siguiente número del asesor,
 *   2) marcar con el teléfono de Bitrix del asesor (BX24.im.phoneTo),
 *   3) leer el registro de la llamada (voximplant.statistic.get) y avisar al ERP,
 *   4) pasar solo al siguiente número.
 *
 * Autenticación: el token de la sesión de Bitrix del asesor (BX24.getAuth)
 * viaja en el header X-Bitrix-Auth; el backend lo valida contra el portal con
 * user.current y busca al usuario ERP por correo (igual que LLAMAR).
 */
const svc = require('../services/automarcadorBitrix.service')
const { crearRegistroLlamadas, resultadoDeFila } = require('../services/automarcadorBitrixRegistro.service')

const CACHE_MS = 5 * 60 * 1000

const esperar = (ms) => new Promise(ok => setTimeout(ok, ms))
const esLimiteBitrix = (err) => /too many requests|query_limit_exceeded|operation_time_limit/i.test(String(err?.message || ''))

function crearDialerController({ bitrixApp, db, portalUrl, now = () => Date.now(), pausaReintentoMs = 1500, registro = crearRegistroLlamadas() }) {
  const cache = new Map() // token -> { usuarioId, nombre, exp }

  // Bitrix limita las peticiones REST del portal; si responde "Too many
  // requests" se reintenta con espera creciente antes de rechazar la sesión.
  async function usuarioBitrix(token) {
    for (let intento = 1; ; intento++) {
      try { return await bitrixApp.usuarioActualPorAuthId(token) }
      catch (err) {
        if (!esLimiteBitrix(err) || intento >= 4) throw err
        await esperar(pausaReintentoMs * intento)
      }
    }
  }

  async function autenticar(req, res, next) {
    const token = String(req.get('x-bitrix-auth') || '').trim()
    if (!token || token.length > 512) return res.status(401).json({ success: false, error: 'Abre el Automarcador desde Bitrix' })
    try {
      const hit = cache.get(token)
      if (hit && hit.exp > now()) { req.asesor = hit; return next() }
      const bx = await usuarioBitrix(token)
      const email = String(bx?.EMAIL || '').trim().toLowerCase()
      if (!email) return res.status(403).json({ success: false, error: 'Tu usuario de Bitrix no tiene correo' })
      const r = await db.query(
        `SELECT id, TRIM(CONCAT(nombres, ' ', apellidos)) AS nombre FROM usuarios
          WHERE LOWER(correo) = $1 AND activo = 'SI' LIMIT 2`, [email])
      if (r.rows.length !== 1) return res.status(403).json({ success: false, error: 'No tienes un usuario activo en el ERP con tu correo de Bitrix' })
      const asesor = { usuarioId: Number(r.rows[0].id), nombre: r.rows[0].nombre, bitrixId: String(bx.ID || ''), exp: now() + CACHE_MS }
      if (cache.size > 2000) cache.clear()
      cache.set(token, asesor)
      req.asesor = asesor
      return next()
    } catch (err) {
      console.error('[AUTOMARCADOR-BX] auth:', err.message)
      if (esLimiteBitrix(err)) return res.status(503).json({ success: false, ocupado: true, error: 'Bitrix está ocupado, reintentando…' })
      return res.status(401).json({ success: false, error: 'Sesión de Bitrix inválida, recarga la app' })
    }
  }

  const responder = (fn) => async (req, res) => {
    try { res.json({ success: true, data: await fn(req) }) }
    catch (err) {
      if (!err.status) console.error('[AUTOMARCADOR-BX]', err.message)
      res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Error interno del servidor' })
    }
  }

  function cabecerasEmbed(res) {
    let origen = ''
    try { origen = new URL(portalUrl).origin } catch (_) { /* sin portal configurado */ }
    res.removeHeader('X-Frame-Options')
    res.removeHeader('Content-Security-Policy-Report-Only')
    res.set('Content-Security-Policy', `frame-ancestors 'self' ${origen || "'none'"}`)
    res.set('Cache-Control', 'no-store')
    res.set('Content-Type', 'text/html; charset=utf-8')
  }

  function app(req, res) { cabecerasEmbed(res); res.send(PAGINA_APP) }
  function install(req, res) { cabecerasEmbed(res); res.send(PAGINA_INSTALL) }

  return {
    autenticar, app, install,
    cola: responder(req => svc.resumenAsesor(req.asesor.usuarioId, db).then(r => ({ ...r, asesor: req.asesor.nombre }))),
    siguiente: responder(req => svc.siguiente(req.asesor.usuarioId, db)),
    resultado: responder(req => svc.registrarResultado(req.asesor.usuarioId, req.body || {}, db)),
    tipificar: responder(req => svc.tipificar(req.asesor.usuarioId, req.body || {}, db)),
    // La página pregunta aquí si la llamada ya terminó; el ERP lo resuelve con
    // el registro compartido (una consulta a Bitrix para todos los asesores).
    estado: responder(async (req) => {
      if (!registro.configurado()) return { terminada: false, automatico: false }
      const item = await svc.itemEnLlamada(req.asesor.usuarioId, req.body?.item_id, db)
      if (!item) return { terminada: true, estado: null }
      const fila = await registro.buscar({ bitrixUserId: req.asesor.bitrixId, telefono: item.telefono, desde: item.ultimo_intento })
      if (!fila) return { terminada: false, automatico: true }
      const res = resultadoDeFila(fila)
      await svc.registrarResultado(req.asesor.usuarioId, { item_id: item.id, estado: res.estado, duracion: res.duracion }, db)
      return { terminada: true, ...res }
    }),
  }
}

const SDK = '<script src="https://api.bitrix24.com/api/v1/"></script>'
const TIPOS_HTML = svc.TIPIFICACIONES
  .map((t) => `<button class="tipo" data-t="${t}">${t}</button>`).join('')

const PAGINA_INSTALL = `<!doctype html><html lang="es"><head><meta charset="utf-8">${SDK}</head>
<body style="font-family:system-ui;padding:24px">Instalando Automarcador…
<script>BX24.init(function(){ BX24.installFinish(); });</script></body></html>`

const PAGINA_APP = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">${SDK}
<title>Automarcador</title>
<style>
*{box-sizing:border-box}
:root{--navy:#17233c;--blue:#2563eb;--blue-soft:#eff6ff;--slate:#64748b;--line:#e2e8f0;--canvas:#f3f6fb}
body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% 0,#fff 0,#f7f9fc 38%,var(--canvas) 100%);color:var(--navy);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
button,select{font:inherit}.wrap{width:min(760px,calc(100% - 32px));margin:32px auto;padding-bottom:32px}
.card{position:relative;overflow:hidden;background:rgba(255,255,255,.96);border:1px solid rgba(203,213,225,.82);border-radius:20px;padding:24px 26px;box-shadow:0 14px 38px rgba(15,23,42,.07),0 2px 6px rgba(15,23,42,.03);margin-bottom:16px}
.card:first-child:before{content:"";position:absolute;inset:0 0 auto;height:4px;background:linear-gradient(90deg,#2563eb,#7c3aed,#ec4899)}
h1{display:flex;align-items:center;gap:10px;font-size:22px;line-height:1.2;letter-spacing:-.35px;margin:2px 0 5px;color:#0f172a}
h1:before{content:"";width:38px;height:38px;flex:0 0 38px;border-radius:12px;background:#eff6ff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%232563eb' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92z'/%3E%3C/svg%3E") center/20px no-repeat}
.muted{color:var(--slate);font-size:13px;line-height:1.45}#quien{margin-left:48px;text-transform:uppercase;letter-spacing:.055em;font-size:11px;font-weight:650}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:22px}
.stat{position:relative;text-align:left;background:#f8fafc;border:1px solid #edf2f7;border-radius:14px;padding:15px 16px}.stat:after{content:"";position:absolute;top:16px;right:16px;width:8px;height:8px;border-radius:50%;background:#cbd5e1}.stat:nth-child(2):after{background:#22c55e}.stat:nth-child(3):after{background:#f59e0b}
.stat b{display:block;font-size:26px;line-height:1.05;margin-bottom:6px;color:#0f172a;font-variant-numeric:tabular-nums}.stat .muted{font-size:12px}
.actual{font-size:24px;font-weight:750;letter-spacing:-.35px;margin:7px 0 3px;color:#0f172a;overflow-wrap:anywhere}.estado{display:inline-flex;align-items:center;gap:7px;font-size:13px;color:#1d4ed8;font-weight:700;margin-top:4px}.estado:not(:empty):before{content:"";width:7px;height:7px;border-radius:50%;background:#3b82f6;box-shadow:0 0 0 4px #dbeafe}
.row{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:18px}button{border:1px solid transparent;border-radius:10px;padding:11px 17px;font-size:13px;font-weight:720;line-height:1.2;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease,background .15s ease,border-color .15s ease}
button:hover:not(:disabled){transform:translateY(-1px)}button:focus-visible,select:focus-visible{outline:3px solid rgba(37,99,235,.22);outline-offset:2px}
.go{background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;box-shadow:0 6px 14px rgba(22,163,74,.18)}.go:hover:not(:disabled){box-shadow:0 8px 18px rgba(22,163,74,.25)}
.stop{background:#fff1f2;color:#be123c;border-color:#fecdd3}.stop:hover:not(:disabled){background:#ffe4e6}.sec{background:#f8fafc;color:#334155;border-color:var(--line)}.sec:hover:not(:disabled){background:#fff;border-color:#94a3b8;box-shadow:0 4px 10px rgba(15,23,42,.06)}button:disabled{opacity:.45;cursor:default}
label.muted{display:flex;align-items:center;gap:7px;margin-left:auto}select{appearance:none;min-width:58px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;padding:7px 25px 7px 9px;color:#334155;font-size:12px;font-weight:700;background-image:linear-gradient(45deg,transparent 50%,#64748b 50%),linear-gradient(135deg,#64748b 50%,transparent 50%);background-position:calc(100% - 13px) 50%,calc(100% - 9px) 50%;background-size:4px 4px,4px 4px;background-repeat:no-repeat}
.err{color:#b42318;background:#fff1f0;border-radius:10px;font-size:13px;font-weight:600;margin-top:12px;padding:0}.err:not(:empty){border:1px solid #ffccc7;padding:10px 12px}.hidden{display:none!important}
#cardActual,#cardTipo{animation:entrada .25s ease-out}.tipo{background:#f8fafc;color:#334155;border-color:var(--line);font-weight:650}.tipo:hover:not(:disabled){background:var(--blue-soft);border-color:#bfdbfe;color:#1d4ed8}.tipo.sel{background:var(--blue);border-color:var(--blue);color:#fff;box-shadow:0 5px 12px rgba(37,99,235,.2)}
#cardTipo>.muted:first-child,#cardActual>.muted:first-child{font-size:11px;font-weight:750;letter-spacing:.07em;text-transform:uppercase;color:#64748b}#tipos{gap:8px;margin-top:14px}#tipos .tipo{padding:10px 14px}
@keyframes entrada{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
@media(max-width:620px){.wrap{width:min(100% - 20px,760px);margin:14px auto}.card{border-radius:16px;padding:20px 18px}.stats{grid-template-columns:1fr}.stat{display:flex;align-items:center;justify-content:space-between;padding:12px 14px}.stat b{margin:0;order:2;font-size:23px}.stat:after{display:none}#quien{margin-left:0;margin-top:10px}label.muted{width:100%;margin:4px 0 0}.actual{font-size:20px}button{flex-grow:1}.tipo{flex-grow:0}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style></head><body><div class="wrap">
<div class="card"><h1>📞 Automarcador</h1><div class="muted" id="quien">Conectando con Bitrix…</div>
<div class="stats"><div class="stat"><b id="pend">–</b><span class="muted">Pendientes</span></div>
<div class="stat"><b id="ok">–</b><span class="muted">Contestadas hoy</span></div>
<div class="stat"><b id="nc">–</b><span class="muted">No contestaron hoy</span></div></div>
<div class="row"><button class="go" id="btnIniciar" disabled>▶ Iniciar</button><button class="stop hidden" id="btnDetener">■ Detener</button>
<label class="muted" style="align-self:center">Tiempo para tipificar <select id="pausa"><option selected>15</option><option>20</option><option>30</option></select> s</label></div>
<div class="err" id="err"></div></div>
<div class="card hidden" id="cardActual"><div class="muted">Llamada actual</div><div class="actual" id="cliente"></div>
<div class="muted" id="deal"></div><div class="estado" id="estado"></div>
<div class="row" id="manual"><button class="sec" data-r="contestada">✔ Contestó</button><button class="sec" data-r="no_contesta">✖ No contestó</button><button class="sec" data-r="omitida">⏭ Saltar</button></div></div>
<div class="card hidden" id="cardTipo"><div class="muted">Tipifica la llamada con <b id="tipoCliente"></b></div>
<div class="row" id="tipos">${TIPOS_HTML}</div>
<div class="row"><span class="estado" id="cuenta"></span><button class="go hidden" id="btnYa">▶ Llamar ya</button></div></div>
</div>
<script>
(function(){
  var API='/api/llamadas/bitrix-dialer/', corriendo=false, actual=null, sondeo=null, ultimo=null, cuenta=null, espera=null;
  var $=function(id){return document.getElementById(id)};
  function error(m){ $('err').textContent=m||''; }
  function token(){ return new Promise(function(ok){ var a=BX24.getAuth(); if(a&&a.access_token) return ok(a.access_token); BX24.refreshAuth(function(n){ ok(n&&n.access_token); }); }); }
  function api(ruta, cuerpo, intento){
    return token().then(function(t){ return fetch(API+ruta,{method:cuerpo?'POST':'GET',headers:{'Content-Type':'application/json','X-Bitrix-Auth':t},body:cuerpo?JSON.stringify(cuerpo):undefined}); })
      .then(function(r){ return r.json(); }).then(function(j){
        if(!j.success && j.ocupado && (intento||0)<5){ error(j.error); return new Promise(function(ok){ setTimeout(ok, 3000*((intento||0)+1)); }).then(function(){ return api(ruta, cuerpo, (intento||0)+1); }); }
        if(!j.success) throw new Error(j.error||'Error'); error(''); return j.data; });
  }
  function bx(metodo, params){ return new Promise(function(ok,ko){ BX24.callMethod(metodo, params, function(r){ r.error()?ko(new Error(r.error().ex?r.error().ex.error_description:String(r.error()))):ok(r.data()); }); }); }
  function refrescar(){ return api('cola').then(function(d){ $('quien').textContent='Asesor: '+(d.asesor||''); $('pend').textContent=d.pendientes; $('ok').textContent=d.contestadas_hoy; $('nc').textContent=d.no_contesta_hoy; $('btnIniciar').disabled=corriendo; }).catch(function(e){ error(e.message); }); }

  function pararCuenta(){ clearInterval(cuenta); cuenta=null; $('btnYa').classList.add('hidden'); $('cuenta').textContent=''; }
  // Al colgar: se muestran las tipificaciones y una cuenta regresiva antes de la siguiente llamada.
  function panelTipificar(item){
    ultimo=item; pararCuenta();
    $('tipoCliente').textContent=item.nombre_cliente||(item.deal_id?('Negociación #'+item.deal_id):'el cliente');
    Array.prototype.forEach.call(document.querySelectorAll('#tipos button'),function(b){ b.classList.remove('sel'); });
    $('cardTipo').classList.remove('hidden');
    if(!corriendo){ $('cuenta').textContent='Detenido. Puedes tipificar igual.'; return; }
    var s=parseInt($('pausa').value,10)||15;
    $('btnYa').classList.remove('hidden');
    $('cuenta').textContent='Siguiente llamada en '+s+' s';
    cuenta=setInterval(function(){
      s-=1;
      if(s>0){ $('cuenta').textContent='Siguiente llamada en '+s+' s'; return; }
      pararCuenta(); if(corriendo) llamar();
    },1000);
  }
  function terminar(resultado, dur, yaRegistrado){
    if(!actual) return;
    clearInterval(sondeo); sondeo=null;
    var item=actual; actual=null;
    $('cardActual').classList.add('hidden');
    (yaRegistrado ? Promise.resolve() : api('resultado',{item_id:item.id, estado:resultado, duracion:dur||0}).catch(function(e){ error(e.message); }))
      .then(refrescar).then(function(){ panelTipificar(item); });
  }
  function revisarRegistro(){
    if(!actual) return;
    var item=actual;
    api('estado',{item_id:item.id}).then(function(d){
      if(actual!==item) return;
      if(d.terminada){ terminar(d.estado, d.duracion, true); return; }
      if(d.automatico===false) $('estado').textContent='En llamada… (al colgar, marca el resultado abajo)';
    }).catch(function(){});
  }
  function llamar(){
    error('');
    api('siguiente',{}).then(function(item){
      if(!item){ if(corriendo){ $('cardActual').classList.add('hidden'); error('En espera de llamadas… (quédate aquí; marcará solo cuando llegue una)'); clearTimeout(espera); espera=setTimeout(llamar, 5000); return refrescar(); } $('btnDetener').classList.add('hidden'); $('cardActual').classList.add('hidden'); error('Detenido.'); return refrescar(); }
      actual=item; pararCuenta(); $('cardTipo').classList.add('hidden');
      $('cardActual').classList.remove('hidden');
      $('cliente').textContent=item.nombre_cliente||'Cliente';
      $('deal').textContent=item.deal_id?('Negociación #'+item.deal_id):'';
      $('estado').textContent='Marcando…';
      BX24.im.phoneTo('+'+item.telefono);
      clearInterval(sondeo); sondeo=setInterval(revisarRegistro, 6000);
      refrescar();
    }).catch(function(e){ corriendo=false; error(e.message); $('btnDetener').classList.add('hidden'); refrescar(); });
  }
  $('btnIniciar').onclick=function(){ corriendo=true; this.disabled=true; $('btnDetener').classList.remove('hidden'); if(!actual) llamar(); else $('estado').textContent='Seguirá al terminar esta llamada.'; };
  $('btnYa').onclick=function(){ pararCuenta(); if(corriendo&&!actual) llamar(); };
  Array.prototype.forEach.call(document.querySelectorAll('#tipos button'),function(b){ b.onclick=function(){
    if(!ultimo) return;
    var t=b.getAttribute('data-t');
    api('tipificar',{item_id:ultimo.id, tipificacion:t}).then(function(){
      Array.prototype.forEach.call(document.querySelectorAll('#tipos button'),function(x){ x.classList.toggle('sel', x===b); });
    }).catch(function(e){ error(e.message); });
  }; });
  $('btnDetener').onclick=function(){ corriendo=false; clearTimeout(espera); this.classList.add('hidden'); if(cuenta){ pararCuenta(); $('cuenta').textContent='Detenido. Puedes tipificar igual.'; } $('estado').textContent=actual?'Se detendrá al terminar esta llamada.':'Detenido.'; refrescar(); };
  Array.prototype.forEach.call(document.querySelectorAll('#manual button'),function(b){ b.onclick=function(){ terminar(b.getAttribute('data-r'),0); }; });
  BX24.init(function(){
    BX24.fitWindow && BX24.fitWindow();
    refrescar();
    setInterval(function(){ if(!actual && !corriendo) refrescar(); }, 5000);
  });
})();
</script></body></html>`

module.exports = { crearDialerController, PAGINA_APP, PAGINA_INSTALL }
