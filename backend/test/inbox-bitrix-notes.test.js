const test = require('node:test');
const assert = require('node:assert/strict');
const { createInboxBitrixNotes, buildComment, eligibleDeal } = require('../src/services/inboxBitrixNotes.service');

const user = { id: 7, empresa: 'NOVONET', nombreCompleto: 'María Pérez' };
const conversation = { id: 'conv', line_id: 'line', wa_number: '593999999999', bitrix_deal_id: '123', line_empresa: 'NOVONET' };
const env = { BITRIX_NOVONET_URL: 'https://novonet.bitrix24.es/rest/1/test' };
function harness(responses = []) {
  const queries = [], calls = [];
  const db = { query: async (sql, values) => { queries.push({sql, values}); return { rows: sql.startsWith('SELECT c.id') ? [{id:'c'}] : [] }; } };
  const service = createInboxBitrixNotes({ db, env, request: async (method, params) => {
    calls.push({method, params});
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return response || { result: 99 };
  }});
  return { service, queries, calls };
}

test('cliente se identifica como recibido y no atribuye el mensaje al asesor', () => {
  const text=buildComment({id:'incoming',payload:{direction:'in',actor:'Cliente Ana',text:'Necesito información',phone:'5939'},sent_at:'2026-09-09T15:00:00Z'});
  assert.match(text,/Recibido del cliente/);
  assert.match(text,/Cliente: Cliente Ana/);
  assert.doesNotMatch(text,/Asesor:/);
});

test('el ciclo de publicación se programa cada 60 segundos', () => {
  const periods=[];
  const h=createInboxBitrixNotes({db:{query:async()=>({rows:[]})},env,
    schedule:(fn,ms)=>{periods.push(ms);return {unref(){}};},unschedule:()=>{}});
  h.start();h.start();h.stop();
  assert.deepEqual(periods,[60000]);
});

test('persistencia del entrante conserva guardado y encolado en una sola consulta', async () => {
  const h=harness();
  await h.service.persistIncoming({conversationId:'c',lineId:'l',waNumber:'5939',type:'text',text:'Hola',waMsgId:'wa-in',clientName:'Ana'});
  const sql=h.queries.find(q=>q.sql.includes('INSERT INTO messages'))?.sql || '';
  assert.match(sql,/INSERT INTO inbox_bitrix_notes/);
  assert.match(sql,/FROM saved/);
  assert.match(sql,/'NOVONET'/);
  assert.equal(h.calls.length,0,'recibir no llama directamente a Bitrix');
});

test('con la sincronización desactivada se sigue guardando el entrante', async () => {
  const queries=[];
  const h=createInboxBitrixNotes({db:{query:async(sql)=>{queries.push(sql);return {rows:[{id:'message'}]};}},env:{...env,WA_INBOX_BITRIX_NOTES:'false'}});
  const result=await h.persistIncoming({conversationId:'c',lineId:'l',waNumber:'5939',type:'text',text:'Hola',waMsgId:'wa-in'});
  assert.equal(result.rows[0].id,'message');
  assert.equal(queries.length,1);
  assert.doesNotMatch(queries[0],/inbox_bitrix_notes/);
});

test('entrantes no elegibles no dependen de la tabla de notas', async () => {
  const queries=[];
  const h=createInboxBitrixNotes({env,db:{query:async(sql)=>{queries.push(sql);return {rows:[]};}}});
  await h.persistIncoming({conversationId:'c',lineId:'l',waNumber:'5939',type:'text',text:'Hola',waMsgId:'wa-in'});
  assert.equal(queries.length,2);
  assert.ok(queries[1].startsWith('INSERT INTO messages'));
  assert.ok(queries.every(sql=>!sql.includes('inbox_bitrix_notes')));
});

test('solo NOVONET con ID positivo; la empresa de la línea prevalece sobre admin', () => {
  assert.equal(eligibleDeal(conversation, user), '123');
  assert.equal(eligibleDeal({...conversation, line_empresa:'VELSA'}, user), null);
  assert.equal(eligibleDeal({...conversation, bitrix_deal_id:null}, user), null);
  assert.equal(eligibleDeal({...conversation, bitrix_deal_id:'123abc'}, user), null);
  assert.equal(eligibleDeal({...conversation, bitrix_deal_id:'-1'}, user), null);
});

test('prepara una copia durable y congela el ID antes del envío', async () => {
  const h = harness();
  const note = await h.service.prepare({conversation, user, text:'Hola', filename:'oferta.pdf'});
  const insert = h.queries.find(q => q.sql.includes('INSERT INTO inbox_bitrix_notes'));
  assert.ok(note.id);
  assert.match(note.waMsgId, /^3EB0C0DE[A-F0-9]{24}$/);
  const payload = JSON.parse(insert.values[2]);
  assert.equal(insert.values[1], '123');
  assert.equal(payload.actor, 'María Pérez');
  assert.equal(payload.text, 'Hola');
  assert.equal(h.calls.length, 0, 'preparar no escribe en Bitrix ni manda WhatsApp');
});

test('reintenta confirmación tras pérdida simultánea del recibo y actualización de cola', async () => {
  let outage=true;
  const updates=[];
  const db={query:async(sql,values)=>{
    if(sql.includes("SET status='pending'") && outage)throw Error('offline');
    updates.push({sql,values});return {rows:[]};
  }};
  const s=createInboxBitrixNotes({db,env,logger:{warn(){}}});
  await assert.rejects(s.confirm({id:'note'},'wa-id'));
  outage=false;
  await s.tick();
  assert.ok(updates.some(q=>q.values?.[0]==='note' && q.sql.includes("SET status='pending'")));
});

test('un acuse después del reinicio reconcilia por ID WhatsApp persistido antes del envío', async () => {
  const h=harness();
  await h.service.recordReceipt('line','3EB0C0DE'+'A'.repeat(24));
  assert.ok(h.queries.some(q=>q.sql.includes('wa_msg_id=$2') && q.values?.[0]==='line'));
  const n=h.queries.length;
  await h.service.recordReceipt('line','ordinary-message');
  assert.equal(h.queries.length,n);
});

test('sin vínculo no crea trabajo; falta de credencial no produce envíos silenciosos', async () => {
  const h = harness();
  assert.equal(await h.service.prepare({conversation:{...conversation,bitrix_deal_id:null},user,text:'Hola'}), null);
  assert.equal(h.queries.length,0);
  const s = createInboxBitrixNotes({db:{query:async()=>({rows:[]})},env:{}});
  await assert.rejects(s.prepare({conversation,user,text:'Hola'}), /BITRIX_NOTES_NOT_CONFIGURED/);
});

test('el comentario identifica envío, asesor, hora, adjunto y referencia única', () => {
  const text = buildComment({id:'abc', payload:{actor:'María',phone:'5939',text:'Buenos días',filename:'oferta.pdf'},sent_at:'2026-09-09T15:00:00Z'});
  assert.match(text, /María/);
  assert.match(text, /Buenos días/);
  assert.match(text, /oferta.pdf/);
  assert.match(text, /10:00/);
  assert.ok(text.endsWith('Referencia Inbox: abc'));
});

test('publica exclusivamente comentario interno en la negociación capturada', async () => {
  const h = harness([{result:99}]);
  await h.service.deliver({id:'abc',deal_id:'123',attempts:1,payload:{text:'Hola'},sent_at:new Date()});
  assert.deepEqual(h.calls.map(c=>c.method), ['crm.timeline.comment.add']);
  assert.equal(h.calls[0].params.fields.ENTITY_TYPE,'deal');
  assert.equal(h.calls[0].params.fields.ENTITY_ID,'123');
  assert.ok(h.queries.some(q=>q.sql.includes("status='sent'")));
});

test('reintento tras respuesta perdida encuentra el comentario sin duplicarlo', async () => {
  const h = harness([{result:[{ID:'77',COMMENT:'Hola\nReferencia Inbox: abc'}]}]);
  await h.service.deliver({id:'abc',deal_id:'123',attempts:2,payload:{text:'Hola'},sent_at:new Date()});
  assert.deepEqual(h.calls.map(c=>c.method), ['crm.timeline.comment.list']);
  assert.ok(h.queries.some(q=>q.values?.includes('77')));
});

test('recorre páginas al reconciliar una respuesta ambigua', async () => {
  const h = harness([{result:[{ID:1,COMMENT:'otro'}],next:50},{result:[{ID:77,COMMENT:'Referencia Inbox: abc'}]}]);
  await h.service.deliver({id:'abc',deal_id:'123',attempts:2,payload:{},sent_at:new Date()});
  assert.equal(h.calls.length,2);
  assert.equal(h.calls[1].params.start,50);
});

test('error de Bitrix persiste reintento sin propagar fallo ni reenviar WhatsApp', async () => {
  const h = harness([new Error('timeout')]);
  await h.service.deliver({id:'abc',deal_id:'123',attempts:1,payload:{},sent_at:new Date()});
  assert.ok(h.queries.some(q=>q.sql.includes("status='retry'")));
  assert.equal(h.calls.length,1);
});

test('valida el ID real antes de asociar y rechaza otro portal', async () => {
  const h = harness([{result:{ID:'123'}}]);
  await h.service.validateDeal('123');
  assert.equal(h.calls[0].method,'crm.deal.get');
  await assert.rejects(h.service.validateDeal('123abc'), /ID/);
  const s = createInboxBitrixNotes({db:{query:async()=>({rows:[]})},env:{BITRIX_NOVONET_URL:'https://other.bitrix24.es/rest/1/test'}});
  await assert.rejects(s.validateDeal('123'), /BITRIX_NOTES_NOT_CONFIGURED/);
});
