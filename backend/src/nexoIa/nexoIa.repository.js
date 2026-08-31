function crearRepositorio(pool){
  return {
    async insertar(j){ const q=await pool.query(`INSERT INTO nexo_ia_jobs (empresa,id_bitrix,mensaje_disparador_id,tipo,instruccion,prioridad,config_version,ejecutar_despues) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,NOW())) ON CONFLICT (empresa,id_bitrix,mensaje_disparador_id,tipo,config_version) DO NOTHING RETURNING *`,[j.empresa,j.id_bitrix,j.mensaje_disparador_id,j.tipo,String(j.instruccion||'').slice(0,500),j.prioridad,j.config_version,j.ejecutar_despues||null]); return q.rows[0]||null; },
    async reclamar(workerId){ const c=await pool.connect(); try{await c.query('BEGIN'); const q=await c.query(`SELECT * FROM nexo_ia_jobs WHERE estado='PENDIENTE' AND ejecutar_despues<=NOW() ORDER BY prioridad DESC, ejecutar_despues, creado_at FOR UPDATE SKIP LOCKED LIMIT 1`); if(!q.rows[0]){await c.query('COMMIT');return null;} const u=await c.query(`UPDATE nexo_ia_jobs SET estado='GENERANDO',intentos=intentos+1,bloqueado_por=$2,bloqueado_at=NOW(),actualizado_at=NOW() WHERE id=$1 RETURNING *`,[q.rows[0].id,workerId]); await c.query('COMMIT'); return u.rows[0];}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();} },
  };
}
module.exports={crearRepositorio};
