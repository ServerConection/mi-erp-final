const {Worker}=require('node:worker_threads');
const path=require('node:path');
function runJob(workerData) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(path.join(__dirname,'llamadasAnalitica.worker.js'),{workerData,resourceLimits:{maxOldGenerationSizeMb:384}});
    const timer=setTimeout(()=>{worker.terminate();reject(Object.assign(new Error('Proceso excedió 90 segundos. Reduce el archivo o período.'),{status:413}));},90000);
    worker.once('message',msg=>{clearTimeout(timer);if(msg.error)reject(Object.assign(new Error(msg.error),{status:msg.status}));else resolve(msg.result);});
    worker.once('error',()=>{clearTimeout(timer);reject(Object.assign(new Error('No se pudo procesar el archivo. Reduce el tamaño e intenta de nuevo.'),{status:413}));});
    worker.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(Object.assign(new Error('Proceso de archivo interrumpido.'),{status:413}));});
  });
}
module.exports={runJob};
