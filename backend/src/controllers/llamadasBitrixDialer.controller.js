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
*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#263238;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:560px;margin:24px auto;padding:0 16px}.card{background:#fff;border:1px solid #dfe6ec;border-radius:16px;padding:22px;box-shadow:0 8px 24px rgba(38,50,56,.06);margin-bottom:14px}
h1{font-size:20px;margin:0 0 4px}.muted{color:#78909c;font-size:13px}.stats{display:flex;gap:10px;margin-top:14px}
.stat{flex:1;text-align:center;background:#f5f7fa;border-radius:10px;padding:10px}.stat b{display:block;font-size:22px}
.actual{font-size:22px;font-weight:700;margin:6px 0}.estado{font-size:14px;color:#1687d9;font-weight:600}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}button{border:0;border-radius:9px;padding:11px 16px;font-size:14px;font-weight:700;cursor:pointer}
.go{background:#16a34a;color:#fff}.stop{background:#dc2626;color:#fff}.sec{background:#eef2f5;color:#455a64}button:disabled{opacity:.45;cursor:default}
.err{color:#c62828;font-size:13px;margin-top:10px}.hidden{display:none}.tipo{background:#eef2f5;color:#263238;font-weight:600}.tipo.sel{background:#1687d9;color:#fff}
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
  var API='/api/llamadas/bitrix-dialer/', corriendo=false, actual=null, sondeo=null, ultimo=null, cuenta=null;
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
  function refrescar(){ return api('cola').then(function(d){ $('quien').textContent='Asesor: '+(d.asesor||''); $('pend').textContent=d.pendientes; $('ok').textContent=d.contestadas_hoy; $('nc').textContent=d.no_contesta_hoy; $('btnIniciar').disabled=corriendo||!d.pendientes; }).catch(function(e){ error(e.message); }); }

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
      if(!item){ corriendo=false; $('btnDetener').classList.add('hidden'); $('cardActual').classList.add('hidden'); error('No tienes más números pendientes.'); return refrescar(); }
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
  $('btnDetener').onclick=function(){ corriendo=false; this.classList.add('hidden'); if(cuenta){ pararCuenta(); $('cuenta').textContent='Detenido. Puedes tipificar igual.'; } $('estado').textContent=actual?'Se detendrá al terminar esta llamada.':'Detenido.'; refrescar(); };
  Array.prototype.forEach.call(document.querySelectorAll('#manual button'),function(b){ b.onclick=function(){ terminar(b.getAttribute('data-r'),0); }; });
  BX24.init(function(){
    BX24.fitWindow && BX24.fitWindow();
    refrescar();
  });
})();
</script></body></html>`

module.exports = { crearDialerController, PAGINA_APP, PAGINA_INSTALL }
