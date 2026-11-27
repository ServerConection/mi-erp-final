'use strict';

function crearAgrupador({ esperaMs = 5000, procesar, setTimer = setTimeout, clearTimer = clearTimeout }) {
  if (typeof procesar !== 'function') throw new TypeError('procesar es obligatorio');
  const lotes = new Map();

  function programar(clave) {
    const lote = lotes.get(clave);
    if (!lote) return;
    if (lote.timer) clearTimer(lote.timer);
    lote.timer = setTimer(async () => {
      const actual = lotes.get(clave);
      if (!actual) return;
      lotes.delete(clave);
      await procesar({ clave, mensajes: actual.mensajes });
    }, esperaMs);
  }

  function agregar(clave, payload) {
    const lote = lotes.get(clave) || { mensajes: [], timer: null };
    lote.mensajes.push(payload);
    lotes.set(clave, lote);
    programar(clave);
  }

  function cancelar(clave) {
    const lote = lotes.get(clave);
    if (!lote) return false;
    if (lote.timer) clearTimer(lote.timer);
    lotes.delete(clave);
    return true;
  }

  return { agregar, cancelar, pendientes: () => lotes.size };
}

module.exports = { crearAgrupador };
