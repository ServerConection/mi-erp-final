const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
test('Baileys conserva ID preasignado, recibo durable y recupera acuse del servidor',async()=>{
  const dbPath=path.resolve(__dirname,'../src/config/db.js');
  const notesPath=path.resolve(__dirname,'../src/services/inboxBitrixNotes.service.js');
  const managerPath=path.resolve(__dirname,'../src/services/BaileysManager.js');
  const inserts=[],receipts=[],sent=[];
  require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{query:async(sql,args)=>{inserts.push({sql,args});return {rows:[]};}}};
  require.cache[notesPath]={id:notesPath,filename:notesPath,loaded:true,exports:{getInboxBitrixNotes:()=>({recordReceipt:async(...args)=>receipts.push(args)})}};
  delete require.cache[managerPath];
  try{
    const Manager=require(managerPath);
    const bm=new Manager({emit(){}});
    bm.instances.l={status:'connected',sock:{sendMessage:async(jid,body,options)=>{sent.push(options);return {key:{id:options.messageId}};}}};
    bm._resolveSendJid=async()=> '5939@s.whatsapp.net';
    bm._simulateTyping=async()=>{};
    bm._markSentByErp=()=>{};
    bm._getOrCreateConversation=async()=>({id:'c'});
    bm._emitInbox=async()=>{};
    const messageId='3EB0C0DE'+'A'.repeat(24);
    await bm.sendText('l','5939','Hola',{inboxNoteId:'note',messageId});
    await bm.sendMedia('l','5939',{type:'document',buffer:Buffer.from('test'),filename:'prueba.pdf',inboxNoteId:'note2',messageId});
    assert.deepEqual(sent,[{messageId},{messageId}]);
    const rows=inserts.filter(q=>q.sql.includes('INSERT INTO messages'));
    assert.equal(JSON.parse(rows[0].args[7]).inbox_bitrix_note_id,'note');
    assert.equal(JSON.parse(rows[1].args[7]).inbox_bitrix_note_id,'note2');
    await bm._handleDeliveryAck('l',messageId,2);
    assert.deepEqual(receipts,[['l',messageId]]);
  }finally{delete require.cache[managerPath];delete require.cache[dbPath];delete require.cache[notesPath];}
});
