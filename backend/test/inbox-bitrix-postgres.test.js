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
    await db.query('CREATE TEMP TABLE messages (line_id uuid, direction text, timestamp timestamptz, metadata jsonb, wa_msg_id text)');
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
    await db.query("INSERT INTO messages VALUES ($1,'out',NOW(),$2::jsonb,'wa-recovery')",[conversation.line_id,JSON.stringify({inbox_bitrix_note_id:recovery.id})]);
    await service.tick();
    state=(await db.query('SELECT * FROM inbox_bitrix_notes WHERE id=$1',[recovery.id])).rows[0];
    assert.equal(state.status,'sent');
    assert.equal(state.wa_msg_id,'wa-recovery');
  } finally {
    await db.query('ROLLBACK');
    await db.end();
  }
});
