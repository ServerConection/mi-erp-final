const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {createInboxBitrixNotes} = require('../src/services/inboxBitrixNotes.service');

test('PostgreSQL: cola durable, reintento, exclusión de no enviados y recuperación', {skip:!process.env.TEST_DATABASE_URL}, async () => {
  const {Client}=require('pg');
  const db=new Client({connectionString:process.env.TEST_DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL statement_timeout='10s'");
    // Temporary tables shadow production names only for this connection.
    // All changes roll back, and no real message or CRM entity is modified.
    const sql=fs.readFileSync(path.join(__dirname,'../src/migrations/inbox_bitrix_notes.sql'),'utf8');
    await db.query(sql.replace('CREATE TABLE IF NOT EXISTS','CREATE TEMP TABLE IF NOT EXISTS'));
    await db.query(`CREATE TEMP TABLE messages (id uuid DEFAULT gen_random_uuid(), conversation_id uuid, line_id uuid, wa_number text, direction text, type text, content text, timestamp timestamptz, metadata jsonb, wa_msg_id text, dedupe_key text, media_url text);
      CREATE UNIQUE INDEX test_incoming_dedupe ON messages(line_id,dedupe_key) WHERE dedupe_key IS NOT NULL;
      CREATE TEMP TABLE conversations (id uuid, line_id uuid, bitrix_deal_id text);
      CREATE TEMP TABLE lines (id uuid, created_by integer);
      CREATE TEMP TABLE usuarios (id integer, empresa text)`);
    const calls=[];
    let broken=true;
    const service=createInboxBitrixNotes({db,env:{BITRIX_NOVONET_URL:'https://novonet.bitrix24.es/rest/1/test'},logger:{warn(){}},request:async(method,params)=>{
      calls.push(method);
      if(broken)throw Error('offline');
      return method.endsWith('.list') ? {result:[]} : {result:456};
    }});
    const conversation={id:randomUUID(),line_id:randomUUID(),wa_number:'593000000000',line_empresa:'NOVONET',bitrix_deal_id:'123'};
    const user={id:1,empresa:'NOVONET',nombreCompleto:'Prueba automatizada'};
    const first=await service.prepare({conversation,user,text:'Prueba aislada'});
    await service.tick();
    assert.equal(calls.length,0,'waiting_send never publishes');
    await service.confirm(first,'wa-test');
    await service.tick();
    let state=(await db.query('SELECT * FROM inbox_bitrix_notes WHERE id=$1',[first.id])).rows[0];
    assert.equal(state.status,'retry');
    assert.equal(state.attempts,1);
    broken=false;
    await db.query('UPDATE inbox_bitrix_notes SET next_attempt_at=NOW() WHERE id=$1',[first.id]);
    await service.tick();
    state=(await db.query('SELECT * FROM inbox_bitrix_notes WHERE id=$1',[first.id])).rows[0];
    assert.equal(state.status,'sent');
    assert.equal(state.bitrix_comment_id,'456');
    const count=calls.length;
    await service.tick();
    assert.equal(calls.length,count,'a sent job is not claimed again');
    const failed=await service.prepare({conversation,user,text:'Falló WhatsApp'});
    await service.fail(failed);
    await service.tick();
    assert.equal(calls.length,count,'failed sends are not mirrored');
    const recovery=await service.prepare({conversation,user,text:'Aceptado antes del reinicio'});
    await db.query("UPDATE inbox_bitrix_notes SET created_at=NOW()-INTERVAL '3 minutes' WHERE id=$1",[recovery.id]);
    await db.query("INSERT INTO messages (line_id,direction,timestamp,metadata,wa_msg_id) VALUES ($1,'out',NOW(),$2::jsonb,'wa-recovery')",[conversation.line_id,JSON.stringify({inbox_bitrix_note_id:recovery.id})]);
    await service.tick();
    state=(await db.query('SELECT * FROM inbox_bitrix_notes WHERE id=$1',[recovery.id])).rows[0];
    assert.equal(state.status,'sent');
    assert.equal(state.wa_msg_id,'wa-recovery');
    await db.query('INSERT INTO usuarios VALUES (1,\'NOVONET\')');
    await db.query('INSERT INTO lines VALUES ($1,1)',[conversation.line_id]);
    await db.query('INSERT INTO conversations VALUES ($1,$2,\'123\')',[conversation.id,conversation.line_id]);
    const incoming={conversationId:conversation.id,lineId:conversation.line_id,waNumber:'593000000000',type:'text',text:'Consulta',waMsgId:'client-1',clientName:'Cliente prueba',messageAt:new Date()};
    const saved=await service.persistIncoming(incoming);
    const incomingId=saved.rows[0].id;
    state=(await db.query('SELECT * FROM inbox_bitrix_notes WHERE id=$1',[incomingId])).rows[0];
    assert.equal(state.status,'pending');
    assert.equal(state.payload.direction,'in');
    assert.equal(state.deal_id,'123');
    assert.equal((await service.persistIncoming(incoming)).rows.length,0,'duplicate receipt creates no message or note');
    await db.query("UPDATE conversations SET bitrix_deal_id='456'");
    assert.equal((await db.query('SELECT deal_id FROM inbox_bitrix_notes WHERE id=$1',[incomingId])).rows[0].deal_id,'123','queued destination is immutable');
    await db.query('UPDATE conversations SET bitrix_deal_id=NULL');
    const unlinked=await service.persistIncoming({...incoming,waMsgId:'client-2'});
    assert.equal(unlinked.rows.length,1);
    assert.equal((await db.query('SELECT id FROM inbox_bitrix_notes WHERE id=$1',[unlinked.rows[0].id])).rows.length,0);
    await db.query("UPDATE conversations SET bitrix_deal_id='123'");
    await db.query("UPDATE usuarios SET empresa='VELSA'");
    const other=await service.persistIncoming({...incoming,waMsgId:'client-3'});
    assert.equal((await db.query('SELECT id FROM inbox_bitrix_notes WHERE id=$1',[other.rows[0].id])).rows.length,0);
    await service.tick();
    assert.equal((await db.query('SELECT status FROM inbox_bitrix_notes WHERE id=$1',[incomingId])).rows[0].status,'sent');
  } finally {
    await db.query('ROLLBACK');
    await db.end();
  }
});
