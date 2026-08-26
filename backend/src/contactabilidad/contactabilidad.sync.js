const fecha = (value) => value.toISOString().slice(0, 10);

function crearSincronizadorContactabilidad({ pool, crms, procesarCrm, recalcular, fechaDesde, ahora = () => new Date(), logger = console }) {
  let ejecutando = false;

  async function ejecutar() {
    if (ejecutando) return { omitido: true, motivo: 'CICLO_EN_CURSO' };
    ejecutando = true;
    const resultados = {};
    try {
      const hoy = ahora();
      const hasta = fecha(hoy);
      for (const crm of crms) {
        let runId;
        try {
          const previo = await pool.query(`
            SELECT EXISTS (
              SELECT 1 FROM contactabilidad_sync_runs
              WHERE empresa = $1 AND estado = 'COMPLETO'
            ) AS completo
          `, [crm.empresa]);
          const historicoCompleto = previo.rows[0]?.completo === true;
          const inicioIncremental = new Date(hoy);
          inicioIncremental.setUTCDate(inicioIncremental.getUTCDate() - 2);
          const rango = historicoCompleto
            ? { desde: fecha(inicioIncremental), hasta, campoFecha: 'DATE_MODIFY', soloNuevos: false }
            : { desde: fechaDesde, hasta, campoFecha: 'DATE_CREATE', soloNuevos: true };

          const inicio = await pool.query(`
            INSERT INTO contactabilidad_sync_runs (empresa, estado)
            VALUES ($1, 'ACTIVO') RETURNING id
          `, [crm.empresa]);
          runId = inicio.rows[0].id;
          const resultado = await procesarCrm(crm, rango);
          const estado = resultado.errores > 0 ? 'PARCIAL' : 'COMPLETO';
          await pool.query(`
            UPDATE contactabilidad_sync_runs
            SET finalizado_at = NOW(), estado = $2, leads_leidos = $3,
                leads_actualizados = $3, mensajes_leidos = $4,
                mensajes_insertados = $4, error_resumen = $5
            WHERE id = $1
          `, [runId, estado, resultado.leads || 0, resultado.mensajes || 0,
            resultado.errores ? `${resultado.errores} lead(s) pendientes de reintento` : null]);
          resultados[crm.empresa] = { ...resultado, estado, rango };
        } catch (error) {
          if (runId) await pool.query(`
            UPDATE contactabilidad_sync_runs
            SET finalizado_at = NOW(), estado = 'FALLIDO', error_resumen = $2
            WHERE id = $1
          `, [runId, error.message]).catch(() => {});
          resultados[crm.empresa] = { estado: 'FALLIDO', error: error.message };
          logger.error(`[contactabilidad:${crm.empresa}] ${error.message}`);
        }
      }
      await recalcular(pool);
      return resultados;
    } finally {
      ejecutando = false;
    }
  }

  return { ejecutar, estaEjecutando: () => ejecutando };
}

module.exports = { crearSincronizadorContactabilidad };
