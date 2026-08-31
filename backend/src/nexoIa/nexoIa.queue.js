const crypto=require('node:crypto');
function crearCola(repo){
  return {
    async encolar(j){ const prioridad=j.tipo==='RESPUESTA_AL_CLIENTE'?100:j.tipo==='SEGUIMIENTO_COMERCIAL'?80:10; const clave=crypto.createHash('sha256').update([j.empresa,j.id_bitrix,j.mensaje_disparador_id,j.tipo,j.config_version].join('|')).digest('hex'); return repo.insertar({...j,prioridad,clave}); },
    siguiente(workerId='nexo-worker'){ return repo.reclamar(workerId); }
  };
}
module.exports={crearCola};
