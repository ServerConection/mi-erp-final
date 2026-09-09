const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const controllerPath = path.resolve(__dirname,'../src/controllers/wa_conversations.controller.js');
const dbPath = path.resolve(__dirname,'../src/config/db.js');
const notesPath = path.resolve(__dirname,'../src/services/inboxBitrixNotes.service.js');
const actualNotes = require(notesPath);

function setup({sendFails=false,prepareFails=false,confirmFails=false,invalidDeal=false}={}) {
  const events=[];
  const conv={id:'c',line_id:'l',wa_number:'5939',bitrix_deal_id:'123',line_empresa:'NOVONET',line_created_by:7};
  const notes={
    prepare:async()=>{events.push('prepare');if(prepareFails)throw Error('database unavailable');return {id:'note'};},
    confirm:async()=>{events.push('confirm');if(confirmFails)throw Error('database unavailable');},
    fail:async()=>{events.push('fail');},
    validateDeal:async()=>{events.push('validate');if(invalidDeal)throw Error('Negociación no encontrada');},
  };
  require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{query:async(sql)=>{
    if(sql.includes('UPDATE conversations'))events.push('update');
    return {rows:[conv]};
  }}};
  require.cache[notesPath]={id:notesPath,filename:notesPath,loaded:true,exports:{...actualNotes,getInboxBitrixNotes:()=>notes}};
  delete require.cache[controllerPath];
  const controller=require(controllerPath);
  const bm={getStatus:()=> 'connected',sendText:async(...args)=>{
    events.push(['send',args[3]]);
    if(sendFails)throw Error('send failed');
    return {key:{id:'wa1'}};
  }};
  const req={params:{id:'c'},body:{text:'Hola',bitrix_id:'123'},user:{id:7,empresa:'NOVONET',perfil:'ASESOR'},app:{get:()=>bm}};
  const res={statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};
  return {controller,req,res,events,cleanup(){delete require.cache[controllerPath];delete require.cache[dbPath];delete require.cache[notesPath];}};
}
test('prepara antes de enviar y confirma después; pasa referencia al guardado WhatsApp',async()=>{
  const h=setup();try{
    await h.controller.sendMessage(h.req,h.res);
    assert.deepEqual(h.events,['prepare',['send',{inboxNoteId:'note',messageId:undefined}],'confirm']);
    assert.equal(h.res.body.success,true);
  }finally{h.cleanup();}
});
test('fallo WhatsApp no genera un comentario de envío exitoso',async()=>{
  const h=setup({sendFails:true});try{
    await h.controller.sendMessage(h.req,h.res);
    assert.ok(h.events.includes('fail'));
    assert.ok(!h.events.includes('confirm'));
    assert.equal(h.res.body.success,false);
  }finally{h.cleanup();}
});
test('si no se puede guardar la intención durable no se envía WhatsApp',async()=>{
  const h=setup({prepareFails:true});try{
    await h.controller.sendMessage(h.req,h.res);
    assert.deepEqual(h.events,['prepare']);
    assert.equal(h.res.body.success,false);
  }finally{h.cleanup();}
});
test('fallo al confirmar la copia no invita a reenviar un WhatsApp ya enviado',async()=>{
  const h=setup({confirmFails:true});try{
    await h.controller.sendMessage(h.req,h.res);
    assert.equal(h.res.body.success,true);
    assert.ok(!h.events.includes('fail'));
  }finally{h.cleanup();}
});
test('un ID inválido no reemplaza el vínculo previo',async()=>{
  const h=setup({invalidDeal:true});try{
    await h.controller.setBitrixId(h.req,h.res);
    assert.deepEqual(h.events,['validate']);
    assert.equal(h.res.body.success,false);
  }finally{h.cleanup();}
});
