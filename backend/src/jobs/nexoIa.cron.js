const cron=require('node-cron'); const service=require('../nexoIa/nexoIa.service'); let running=false;
async function ciclo(){if(running)return;running=true;try{await service.encolarAutomaticas();await service.encolarBackfill();await service.procesarUno();}catch(e){console.error('[NEXO IA]',e.message);}finally{running=false;}}
function initNexoIa(){if(String(process.env.NEXO_IA_ENABLED).toLowerCase()!=='true')return null;ciclo();return cron.schedule('* * * * *',ciclo,{timezone:'America/Guayaquil'});}
module.exports={initNexoIa,ciclo};
