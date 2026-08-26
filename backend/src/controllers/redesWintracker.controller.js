const { syncTodasLasAgencias, fechaEcuador } = require('../services/wintracker.service');

function crearForceSyncHandler({ sync = syncTodasLasAgencias, now = () => new Date() } = {}) {
  let enCurso = false;

  return async function forceSyncInversion(req, res) {
    if (enCurso) {
      return res.status(409).json({ success: false, message: 'Ya existe una actualización de inversión en curso.' });
    }

    const hoy = fechaEcuador(now());
    const to = req.body?.to || hoy;
    const from = req.body?.from || (to.slice(0, 7) + '-01');
    const fechaValida = (valor) => !valor || /^\d{4}-\d{2}-\d{2}$/.test(valor);
    if (!fechaValida(from) || !fechaValida(to)) {
      return res.status(400).json({ success: false, message: 'Las fechas deben usar formato YYYY-MM-DD.' });
    }

    enCurso = true;
    try {
      const resultado = await sync({ from, to });
      const exitos = resultado.resultados.filter((item) => item.ok);
      const fallidos = resultado.resultados.filter((item) => !item.ok);
      const success = exitos.length > 0;
      const status = success ? 200 : 502;
      return res.status(status).json({
        success,
        partial: success && fallidos.length > 0,
        message: success
          ? `Inversión actualizada para ${exitos.length} de ${resultado.agencias} agencia(s).`
          : 'No fue posible actualizar ninguna agencia.',
        ...resultado,
      });
    } catch (error) {
      console.error('[WinTracker manual] Error:', error.message);
      return res.status(502).json({ success: false, message: 'No fue posible consultar WinTracker.' });
    } finally {
      enCurso = false;
    }
  };
}

const forceSyncInversion = crearForceSyncHandler();

module.exports = { crearForceSyncHandler, forceSyncInversion };