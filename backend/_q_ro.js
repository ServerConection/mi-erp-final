require('dotenv').config();
const {Client}=require('pg');
(async()=>{const c=new Client({host:process.env.DB_HOST,port:process.env.DB_PORT,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000,statement_timeout:120000});
await c.connect();await c.query('SET default_transaction_read_only = on');
const r=await c.query(process.argv[2]);console.log(JSON.stringify(r.rows,null,0));await c.end();})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
