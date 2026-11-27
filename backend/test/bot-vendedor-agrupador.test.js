const test = require('node:test');
const assert = require('node:assert/strict');

const { crearAgrupador } = require('../src/services/botVendedorAgrupador');

function relojManual() {
  let siguiente = 1;
  const tareas = new Map();
  return {
    setTimer(fn) { const id = siguiente++; tareas.set(id, fn); return id; },
    clearTimer(id) { tareas.delete(id); },
    async ejecutar() { const actuales = [...tareas.values()]; tareas.clear(); for (const fn of actuales) await fn(); },
  };
}

test('mensajes rapidos de una conversacion producen un lote ordenado', async () => {
  const reloj = relojManual();
  const lotes = [];
  const agrupador = crearAgrupador({ esperaMs: 5000, procesar: async (lote) => lotes.push(lote), setTimer: reloj.setTimer, clearTimer: reloj.clearTimer });

  agrupador.agregar('conv-1', { texto: 'Somos 4', secuencia: 1 });
  agrupador.agregar('conv-1', { texto: 'En Quito', secuencia: 2 });
  agrupador.agregar('conv-1', { texto: 'Teletrabajo', secuencia: 3 });
  await reloj.ejecutar();

  assert.equal(lotes.length, 1);
  assert.deepEqual(lotes[0].mensajes.map((m) => m.texto), ['Somos 4', 'En Quito', 'Teletrabajo']);
  assert.equal(agrupador.pendientes(), 0);
});

test('mensajes posteriores a una descarga producen otro lote', async () => {
  const reloj = relojManual();
  const lotes = [];
  const agrupador = crearAgrupador({ procesar: async (lote) => lotes.push(lote), setTimer: reloj.setTimer, clearTimer: reloj.clearTimer });

  agrupador.agregar('conv-1', { texto: 'Hola' });
  await reloj.ejecutar();
  agrupador.agregar('conv-1', { texto: 'Quiero un plan' });
  await reloj.ejecutar();

  assert.equal(lotes.length, 2);
});

test('cancelar evita procesar un lote pendiente', async () => {
  const reloj = relojManual();
  const lotes = [];
  const agrupador = crearAgrupador({ procesar: async (lote) => lotes.push(lote), setTimer: reloj.setTimer, clearTimer: reloj.clearTimer });
  agrupador.agregar('conv-1', { texto: 'Hola' });
  agrupador.cancelar('conv-1');
  await reloj.ejecutar();
  assert.equal(lotes.length, 0);
});
