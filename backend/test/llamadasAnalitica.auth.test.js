const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const jwt=require('jsonwebtoken');
const {createRouter}=require('../src/routes/llamadasAnalitica.routes');
test('real JWT middleware uses database role instead of administrator claim in token',async()=>{
  const dbPath=require.resolve('../src/config/db');const previous=require.cache[dbPath];
  const roles={1:'USUARIO',2:'ASESOR',3:'SUPERVISOR',4:'ADMINISTRADOR'};
  require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{query:async(_sql,[id])=>({rows:[{id,usuario:'test',perfil:roles[id],activo:'SI'}]})}};
  const previousSecret=process.env.JWT_SECRET;process.env.JWT_SECRET='test-only-llamadas-auth-key';
  const {verificarToken}=require('../src/middleware/auth');
  const app=express();app.use(createRouter({pool:{},verify:verificarToken,repo:{dashboard:async()=>({ok:true})}}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    for(const id of [1,2,3,4]){
      const token=jwt.sign({id,perfil:'ADMINISTRADOR'},process.env.JWT_SECRET);
      const options={headers:{Authorization:'Bearer '+token}};
      assert.equal((await fetch(base+'/dashboard',options)).status,id<3?403:200);
      assert.equal((await fetch(base+'/importar',{...options,method:'POST'})).status,id===4?400:403);
    }
    assert.equal((await fetch(base+'/dashboard',{headers:{Authorization:'Bearer invalid'}})).status,401);
  } finally {
    await new Promise(r=>server.close(r));
    if(previous)require.cache[dbPath]=previous;else delete require.cache[dbPath];
    if(previousSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret;
  }
});
