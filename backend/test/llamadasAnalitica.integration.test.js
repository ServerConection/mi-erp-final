const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Pool}=require('pg');
const express=require('express');
const XLSX=require('xlsx');
const {parseFile,summarize}=require('../src/services/llamadasAnalitica');
const repo=require('../src/services/llamadasAnalitica.repository');
const {createRouter}=require('../src/routes/llamadasAnalitica.routes');
const header='Fecha,Nombre Agente,Destino,Duracion,Segundos Facturados,Disposicion,Costo\n';
const row='2026-09-01 09:20:00,ANA,0991234567,30,20,ANSWERED,0';
const make=(text,name='outbound_Netlife_20260701_20260919.csv')=>parseFile({originalname:name,buffer:Buffer.from(text)});
test('PostgreSQL + HTTP end-to-end in disposable local database', {skip:!process.env.LLAMADAS_TEST_DATABASE_URL}, async t=>{
  const url=new URL(process.env.LLAMADAS_TEST_DATABASE_URL);
  assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55439');assert.equal(url.username,'llamadas_test');
  const pool=new Pool({connectionString:url.toString()});
  const app=express();
  // Test-only identity fixture. Production mounts real verificarToken.
  app.use('/api/llamadas/analitica',createRouter({pool,verify:(req,res,next)=>{
    const perfil=req.headers['x-test-role'];if(!perfil)return res.status(401).json({error:'Unauthorized'});
    req.user={perfil,id:1,usuario:'test'};next();
  }}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}/api/llamadas/analitica`;
  const call=(p,role,opts={})=>fetch(base+p,{...opts,headers:{...opts.headers,...(role?{'x-test-role':role}:{})}});
  try {
    await pool.query(fs.readFileSync(path.join(__dirname,'../src/migrations/20260919_llamadas_analitica.sql'),'utf8'));
    await pool.query('TRUNCATE llamadas_cdr,llamadas_cdr_cargas RESTART IDENTITY');
    await t.test('anonymous and both advisor roles are denied for reads, exports and uploads',async()=>{
      for(const role of [null,'ASESOR','USUARIO'])for(const route of ['/dashboard','/export.xlsx','/importar']){
        const r=await call(route,role,route==='/importar'?{method:'POST'}:{});assert.equal(r.status,role?403:401);
      }
      for(const role of ['SUPERVISOR','ANALISTA','GERENCIA','CONSULTOR','TV']){
        assert.equal((await call('/dashboard',role)).status,200);
        assert.equal((await call('/importar',role,{method:'POST'})).status,403);
      }
    });
    await t.test('empty SQL metrics match empty state',async()=>{
      const d=await repo.dashboard(pool,{});assert.equal(d.resumen.total,0);assert.equal(d.resumen.esperaMedia,null);assert.deepEqual(d.detalle,[]);
    });
    await t.test('real multipart worker import accepts eight files and deduplicates aliases',async()=>{
      const form=new FormData();for(let i=0;i<8;i++)form.append('archivos',new Blob([header+row],{type:'text/csv'}),(i%2?'cdr_':'')+'outbound_Netlife_20260701_20260919.csv');
      const r=await call('/importar','ADMINISTRADOR',{method:'POST',body:form});const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));
      assert.equal(body.archivos.reduce((n,f)=>n+f.insertadas,0),1);assert.equal(body.archivos.reduce((n,f)=>n+f.repetidas,0),7);
    });
    await t.test('overlapping daily files only add new observations; rejected rows accounted',async()=>{
      const a=make(header+row+'\n'+row.replace('09:20:00','10:20:00')+'\n'+row.replace('09-01','02-30'));
      const result=await repo.importBatch(pool,[a],{id:1,usuario:'test'});
      assert.equal(result[0].insertadas,1);assert.equal(result[0].repetidas,1);assert.equal(result[0].rechazadas,1);
    });
    await t.test('failed batch rolls back calls and audit records atomically',async()=>{
      const before=(await pool.query('SELECT count(*)::int AS n FROM llamadas_cdr_cargas')).rows[0].n;
      const a=make(header+row.replace('09:20:00','11:20:00')); const b=make(header+row.replace('09:20:00','12:20:00'));b.rows[0].duracion=-1;
      await assert.rejects(repo.importBatch(pool,[a,b],{id:1,usuario:'test'}));
      assert.equal((await repo.dashboard(pool,{})).resumen.total,2);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM llamadas_cdr_cargas')).rows[0].n,before);
    });
    await t.test('date end inclusive, brand/status filters and SQL injection are safe',async()=>{
      assert.equal((await repo.dashboard(pool,{desde:'2026-09-01',hasta:'2026-09-01'})).resumen.total,2);
      assert.equal((await repo.dashboard(pool,{empresa:'ECUANET'})).resumen.total,0);
      assert.equal((await repo.dashboard(pool,{agente:"' OR 1=1 --"})).resumen.total,0);
      assert.equal((await call('/dashboard?desde=2026-02-30','ADMINISTRADOR')).status,400);
    });
    await t.test('XLSX worker export roundtrips complete data, methodology and text phones',async()=>{
      const r=await call('/export.xlsx','SUPERVISOR');assert.equal(r.status,200);
      const wb=XLSX.read(Buffer.from(await r.arrayBuffer()),{type:'buffer'});
      assert.equal(wb.SheetNames.length,11);assert.ok(wb.Sheets['Metodología']);
      const rows=XLSX.utils.sheet_to_json(wb.Sheets.Detalle);assert.equal(rows.length,2);assert.equal(typeof rows[0]['Teléfono'],'string');
    });
    if(process.env.LLAMADAS_TEST_CSV_DIR) await t.test('all eight user CSVs reconcile against SQL and repeat loads insert zero',async()=>{
      await pool.query('TRUNCATE llamadas_cdr,llamadas_cdr_cargas RESTART IDENTITY');
      const dir=process.env.LLAMADAS_TEST_CSV_DIR;
      const names=fs.readdirSync(dir).filter(n=>/^(cdr_)?(inbound|outbound)_(Netlife|Ecuanet)_20260701_20260919\.csv$/.test(n));assert.equal(names.length,8);
      const files=names.map(n=>parseFile({originalname:n,buffer:fs.readFileSync(path.join(dir,n))}));
      const result=await repo.importBatch(pool,files,{id:1,usuario:'test'});
      assert.equal(result.reduce((n,f)=>n+f.rechazadas,0),0);
      assert.equal(result.reduce((n,f)=>n+f.insertadas,0),54857);
      assert.equal(result.reduce((n,f)=>n+f.repetidas,0),54857);
      const d=await repo.dashboard(pool,{}),unique=new Map(files.flatMap(f=>f.rows).map(r=>[r.huella,r]));
      const expected=summarize([...unique.values()]);
      for(const key of ['total','contestadas','telefonos','telefonosContestados','segundosFacturados','duracion','numerosAtipicos'])assert.equal(d.resumen[key],expected.resumen[key],key);
      assert.equal(d.resumen.numerosAtipicos,10);
      assert.ok(Math.abs(d.resumen.esperaMedia-expected.resumen.esperaMedia)<1e-9);
      assert.equal(d.detalle.length,100);assert.equal(d.cobertura.length,4);
      for(const k of ['diario','horas','agentes','mapa','estados','empresas'])assert.equal(d[k].reduce((n,g)=>n+g.total,0),54857,k);
      const repeat=await repo.importBatch(pool,files,{id:1,usuario:'test'});assert.equal(repeat.reduce((n,f)=>n+f.insertadas,0),0);
      console.log('Real CSV totals:',JSON.stringify(d.resumen));
    });
  }finally{await new Promise(r=>server.close(r));await pool.end();}
});
