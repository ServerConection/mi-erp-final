function crearRecolector({ crms, procesarCrm, logger = console }) {
  let ejecutando = false;

  async function ejecutarCiclo(rango) {
    if (ejecutando) return { omitido: true, motivo: 'CICLO_EN_CURSO' };
    ejecutando = true;
    const empresas = {};
    try {
      for (const crm of crms) {
        try {
          empresas[crm.empresa] = await procesarCrm(crm, rango);
        } catch (error) {
          empresas[crm.empresa] = { error: error.message };
          logger.error(`[contactabilidad:${crm.empresa}] ${error.message}`);
        }
      }
      const fallidas = Object.values(empresas).filter((item) => item.error).length;
      const estado = fallidas === 0 ? 'COMPLETO' : fallidas === crms.length ? 'FALLIDO' : 'PARCIAL';
      return { estado, empresas };
    } finally {
      ejecutando = false;
    }
  }

  return { ejecutarCiclo, estaEjecutando: () => ejecutando };
}

module.exports = { crearRecolector };
