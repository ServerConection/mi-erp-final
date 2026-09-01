function crearRunnerNexo({
  service = require('../nexoIa/nexoIa.service'), schedule,
  setIntervalFn = setInterval, clearIntervalFn = clearInterval, env = process.env,
} = {}) {
  let procesando = false; let manteniendo = false; let intervalo = null; let tareaMantenimiento = null;
  const habilitado = () => String(env.NEXO_IA_ENABLED).toLowerCase() === 'true';

  async function despertar() {
    if (!habilitado() || procesando) return null;
    procesando = true;
    try { return await service.procesarUno(); }
    catch (error) { console.error('[NEXO IA worker]', error.message); return null; }
    finally { procesando = false; }
  }

  async function mantenimiento() {
    if (!habilitado() || manteniendo) return;
    manteniendo = true;
    try { await service.encolarAutomaticas(); await service.encolarBackfill(); }
    catch (error) { console.error('[NEXO IA mantenimiento]', error.message); }
    finally { manteniendo = false; }
    await despertar();
  }

  function iniciar() {
    if (!habilitado()) return null;
    void mantenimiento();
    void despertar();
    intervalo = setIntervalFn(() => { void despertar(); }, 5000);
    const programar = schedule || require('node-cron').schedule;
    tareaMantenimiento = programar('* * * * *', () => { void mantenimiento(); }, { timezone: 'America/Guayaquil' });
    return { detener };
  }

  function detener() {
    if (intervalo != null) clearIntervalFn(intervalo);
    tareaMantenimiento?.stop?.(); intervalo = null; tareaMantenimiento = null;
  }
  return { iniciar, detener, despertar, mantenimiento };
}

module.exports = { crearRunnerNexo };
