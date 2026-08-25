const test = require('node:test');
const assert = require('node:assert/strict');

const { crearRecolector } = require('../src/contactabilidad/contactabilidad.collector');

test('evita ciclos simultaneos', async () => {
  let liberar;
  const espera = new Promise((resolve) => { liberar = resolve; });
  const recolector = crearRecolector({
    crms: [{ empresa: 'NOVONET' }],
    procesarCrm: async () => espera,
    logger: { info() {}, error() {} },
  });

  const primero = recolector.ejecutarCiclo({ desde: '2026-08-23', hasta: '2026-08-24' });
  const segundo = await recolector.ejecutarCiclo({ desde: '2026-08-23', hasta: '2026-08-24' });
  assert.deepEqual(segundo, { omitido: true, motivo: 'CICLO_EN_CURSO' });
  liberar({ leads: 1, mensajes: 2 });
  await primero;
});

test('continua con VELSA cuando NOVONET falla', async () => {
  const procesadas = [];
  const recolector = crearRecolector({
    crms: [{ empresa: 'NOVONET' }, { empresa: 'VELSA' }],
    procesarCrm: async (crm) => {
      procesadas.push(crm.empresa);
      if (crm.empresa === 'NOVONET') throw new Error('Bitrix no disponible');
      return { leads: 3, mensajes: 5 };
    },
    logger: { info() {}, error() {} },
  });

  const resultado = await recolector.ejecutarCiclo({ desde: '2026-08-23', hasta: '2026-08-24' });
  assert.deepEqual(procesadas, ['NOVONET', 'VELSA']);
  assert.equal(resultado.estado, 'PARCIAL');
  assert.equal(resultado.empresas.VELSA.mensajes, 5);
  assert.match(resultado.empresas.NOVONET.error, /Bitrix no disponible/);
});
