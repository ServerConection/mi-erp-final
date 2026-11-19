require('dotenv').config({path: process.cwd()+'/.env'});
const {Pool}=require(process.cwd()+'/node_modules/pg');
const p=new Pool({host:process.env.DB_HOST,port:process.env.DB_PORT,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
p.query(`select n, to_regclass('public.'||n) is not null as existe from unnest(array['mestra_bitrix','empleados','vw_bitrix_novonet','vw_jotform_velsa_netlife_completo','negociaciones_reporteria','vista_analisis_novonet','bitrix_webhook_leads']) n`).then(r=>{console.table(r.rows);p.end()}).catch(e=>{console.log('ERR',e.message);p.end()});
