const express=require('express');
const multer=require('multer');
const {invalid,validateFilters}=require('../services/llamadasAnalitica');
const repository=require('../services/llamadasAnalitica.repository');
const {runJob}=require('../services/llamadasAnalitica.jobs');
function allowRead(req,res,next) {
  const role=String(req.user?.perfil||'').trim().toUpperCase();
  if(!role || ['ASESOR','USUARIO'].includes(role)) return res.status(403).json({error:'Los asesores no tienen acceso a Llamadas.'});
  next();
}
function allowUpload(req,res,next) {
  if(String(req.user?.perfil||'').trim().toUpperCase()!=='ADMINISTRADOR') return res.status(403).json({error:'Solo el administrador puede cargar archivos.'});
  next();
}
function createRouter({pool,verify,repo=repository,job=runJob}) {
  const router=express.Router();let importing=false,exportsActive=0;
  router.use(verify,allowRead);
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:8,fields:0,parts:9},fileFilter:(_req,file,cb)=>cb(/\.csv$/i.test(file.originalname)?null:invalid('Carga archivos CSV en el formato del proveedor.'),true)}).array('archivos',8);
  router.get('/dashboard',async(req,res,next)=>{try{res.json(await repo.dashboard(pool,req.query));}catch(e){next(e);}});
  router.post('/importar',allowUpload,(req,res,next)=>{
    if(importing) return res.status(409).json({error:'Hay otra carga en curso. Espera e intenta nuevamente.'});
    importing=true;
    upload(req,res,async error=>{
      try {
        if(error)throw error;
        if(!req.files?.length)throw invalid('Selecciona al menos un CSV.');
        const files=await job({task:'parse',files:req.files.map(f=>({originalname:f.originalname,buffer:f.buffer}))});
        res.json({archivos:await repo.importBatch(pool,files,req.user)});
      } catch(e){next(e);} finally{importing=false;}
    });
  });
  router.get('/export.xlsx',async(req,res,next)=>{
    if(exportsActive>=1)return res.status(429).json({error:'Hay una exportación en curso. Intenta nuevamente en unos segundos.'});
    exportsActive++;
    try {
      const filters=validateFilters(req.query),data=await repo.dashboard(pool,req.query,true);
      const bytes=await job({task:'excel',data,filters});
      res.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition','attachment; filename="llamadas-360.xlsx"');
      res.send(Buffer.from(bytes));
    } catch(e){next(e);} finally{exportsActive--;}
  });
  router.use((error,_req,res,_next)=>{
    if(error.code==='42P01')return res.status(503).json({error:'Llamadas requiere aplicar la migración 20260919_llamadas_analitica.sql.'});
    if(error instanceof multer.MulterError)return res.status(400).json({error:'Carga inválida: máximo 8 CSV de 10 MB cada uno, sin campos adicionales.'});
    const status=error.status||500;
    if(status===500)console.error('[llamadas-analitica]',error.code||error.name);
    res.status(status).json({error:status===500?'No se pudo completar la operación. Intenta nuevamente.':error.message});
  });
  return router;
}
module.exports={createRouter,allowRead,allowUpload};
