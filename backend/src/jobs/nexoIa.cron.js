const cron=require('node-cron'); const service=require('../nexoIa/nexoIa.service'); let running=false;
async function ciclo(){if(running)return;running=true;try{await service.encolarAutomaticas();await service.encolarBackfill();await service.procesarUno();}catch(e){console.error('[NEXO IA]',e.message);}finally{running=false;}}
// El WORKER (que procesa los borradores pedidos con el boton) y la COLA
// AUTOMATICA son cosas distintas y ahora tienen interruptores separados:
//   NEXO_IA_WORKER=false   -> apaga el procesador (nada se genera, ni manual)
//   NEXO_IA_ENABLED=false  -> solo apaga el encolado automatico (lo revisa
//                             encolarAutomaticas por dentro). El boton sigue.
// Antes NEXO_IA_ENABLED apagaba las dos cosas: al desactivar la generacion
// automatica para ahorrar tokens, los pedidos manuales quedaban en cola para
// siempre porque nadie los procesaba.
function initNexoIa(){if(String(process.env.NEXO_IA_WORKER||'true').toLowerCase()==='false')return null;ciclo();return cron.schedule('* * * * *',ciclo,{timezone:'America/Guayaquil'});}
module.exports={initNexoIa,ciclo};
