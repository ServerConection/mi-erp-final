require('dotenv').config({path: process.cwd()+'/.env'});
const {Pool}=require('pg');
const p=new Pool({host:process.env.DB_HOST,port:process.env.DB_PORT,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
(async()=>{try{
const q=process.argv[2];
const r=await p.query(q);console.log(JSON.stringify(r.rows,null,0));
}catch(e){console.log('ERR',e.message)}await p.end()})();
