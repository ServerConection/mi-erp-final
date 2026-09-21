const { parentPort,workerData }=require('node:worker_threads');
try {
  let result;
  if(workerData.task==='parse') {
    const {parseFile}=require('./llamadasAnalitica');
    result=workerData.files.map(file=>parseFile({...file,buffer:Buffer.from(file.buffer)}));
    if(result.reduce((n,f)=>n+f.total,0)>200000) throw Object.assign(new Error('Máximo 200.000 filas por carga.'),{status:400});
  } else if(workerData.task==='excel') result=require('./llamadasAnalitica.excel').workbook(workerData.data,workerData.filters);
  else throw new Error('Tarea inválida');
  parentPort.postMessage({result});
} catch(e) {parentPort.postMessage({error:e.message,status:e.status||400});}
