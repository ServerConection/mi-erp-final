/** ¿Sigue la venta 48832? Compara local vs Render. Solo lee. */
require('dotenv').config()
const { Pool } = require('pg')
const B='48832', L='md-ambklortizv5'
const BASES=[
 ['LOCAL',{host:process.env.LOCAL_DB_HOST,port:process.env.LOCAL_DB_PORT||5432,
   database:process.env.LOCAL_DB_NAME,user:process.env.LOCAL_DB_USER,password:process.env.LOCAL_DB_PASSWORD}],
 ['RENDER',{host:process.env.DB_HOST,port:process.env.DB_PORT||5432,
   database:process.env.DB_NAME||process.env.DB_DATABASE,user:process.env.DB_USER,
   password:process.env.DB_PASSWORD,ssl:{rejectUnauthorized:false}}],
]
async function ver(n,cfg){
  const p=new Pool({...cfg,statement_timeout:15000})
  console.log(`\n===== ${n} =====`)
  for (const [t,col] of [['vw_jotform_velsa_netlife_completo','id_bitrix_ghl'],
                         ['maestra_velsa_jotform_netlife','id_bitrix_ghl'],
                         ['velsa_netlife_maestra_cons','j_id_bitrix_ghl']]) {
    try{
      const {rows}=await p.query(`SELECT COUNT(*)::int n FROM public."${t}" WHERE "${col}"::text=$1`,[B])
      let extra=''
      if(rows[0].n){
        try{ const {rows:r2}=await p.query(`SELECT inicio_sesion_netlife AS login FROM public."${t}" WHERE "${col}"::text=$1 LIMIT 1`,[B]); extra=' · login: '+(r2[0].login||'(vacío)') }
        catch(e){ try{ const {rows:r3}=await p.query(`SELECT j_inicio_sesion_netlife AS login FROM public."${t}" WHERE "${col}"::text=$1 LIMIT 1`,[B]); extra=' · login: '+(r3[0].login||'(vacío)') }catch(e2){} }
      }
      console.log(`  ${rows[0].n?'✅':'❌'} ${t.padEnd(36)} ${rows[0].n} fila(s)${extra}`)
    }catch(e){ console.log(`  ·  ${t}: ${e.message.slice(0,45)}`) }
  }
  // ultimo sync
  try{
    const {rows}=await p.query(`SELECT MAX(_synced_at) AS ult FROM public.vw_jotform_velsa_netlife_completo`)
    console.log('  último sync de la tabla:', rows[0].ult)
  }catch(e){}
  await p.end()
}
;(async()=>{ for(const [n,c] of BASES) await ver(n,c);
  console.log('\nSi está en RENDER pero no en LOCAL → el sync la borrará otra vez.')
  console.log('Si no está en ninguna → ya la borró.\n') })()
