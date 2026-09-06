const cron=require('node-cron'); const service=require('../nexoIa/nexoIa.service'); let running=false;
// Cuantos borradores se generan por ciclo. El cron corre cada minuto y antes
// procesaba UNO solo, mientras encolarAutomaticas podia encolar hasta 100 en esa
// misma vuelta: la cola crecia cien veces mas rapido de lo que se drenaba y las
// sugerencias salian con horas de retraso. Se drena en lote, con tope para no
// dispararse el gasto (el limite diario por empresa sigue mandando dentro de
// generar(), asi que esto no puede pasarse de cuota).
const LOTE = Math.min(20, Math.max(1, Number(process.env.NEXO_IA_LOTE) || 5));

async function ciclo(){
  if(running)return;
  running=true;
  try{
    await service.encolarAutomaticas();
    await service.encolarBackfill();
    // Se corta apenas la cola queda vacia: en reposo sigue siendo una consulta.
    for(let i=0;i<LOTE;i++){ const hecho=await service.procesarUno(); if(!hecho)break; }
  }catch(e){
    console.error('[NEXO IA]',e.message);
  }finally{
    running=false;
  }
}
// El WORKER (que procesa los borradores pedidos con el boton) y la COLA
// AUTOMATICA son cosas distintas y ahora tienen interruptores separados:
//   NEXO_IA_WORKER=false   -> apaga el procesador (nada se genera, ni manual)
//   NEXO_IA_ENABLED=false  -> solo apaga el encolado automatico (lo revisa
//                             encolarAutomaticas por dentro). El boton sigue.
// Antes NEXO_IA_ENABLED apagaba las dos cosas: al desactivar la generacion
// automatica para ahorrar tokens, los pedidos manuales quedaban en cola para
// siempre porque nadie los procesaba.
function initNexoIa(){if(String(process.env.NEXO_IA_WORKER||'true').toLowerCase()==='false')return null;ciclo();return cron.schedule('* * * * *',ciclo,{timezone:'America/Guayaquil'});}
// La llama el controlador cuando alguien aprieta "Generar respuesta": corre el
// ciclo al instante en vez de esperar al proximo minuto del cron. Si ya hay uno
// corriendo, no hace nada (el guard `running` de ciclo lo evita).
async function despertarNexoIa(){try{await ciclo();}catch(e){console.error('[NEXO IA] despertar:',e.message);}}
module.exports={initNexoIa,ciclo,despertarNexoIa};
