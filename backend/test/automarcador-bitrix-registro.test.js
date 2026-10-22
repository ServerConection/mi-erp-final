const test = require('node:test')
const assert = require('node:assert/strict')
const { crearRegistroLlamadas, resultadoDeFila } = require('../src/services/automarcadorBitrixRegistro.service')

test('una sola consulta a Bitrix sirve a varios asesores dentro del intervalo', async () => {
  let llamadas = 0
  let t = Date.parse('2026-10-22T15:00:00Z')
  const fetchImpl = async (url, o) => {
    llamadas++
    assert.match(url, /\/rest\/1\/abc\/voximplant\.statistic\.get\.json$/)
    assert.ok(JSON.parse(o.body).FILTER['>=CALL_START_DATE'])
    return { json: async () => ({ result: [
      { PORTAL_USER_ID: '55', PHONE_NUMBER: '+593990000001', CALL_START_DATE: '2026-10-22T10:00:05-05:00', CALL_FAILED_CODE: '200', CALL_DURATION: '40' },
      { PORTAL_USER_ID: '66', PHONE_NUMBER: '0990000002', CALL_START_DATE: '2026-10-22T10:00:09-05:00', CALL_FAILED_CODE: '304', CALL_DURATION: '0' },
    ] }) }
  }
  const reg = crearRegistroLlamadas({ webhook: 'https://x.bitrix24.es/rest/1/abc/profile.json', fetchImpl, now: () => t, logger: { error() {} } })
  const desde = '2026-10-22T15:00:00Z'
  const a = await reg.buscar({ bitrixUserId: '55', telefono: '593990000001', desde })
  const b = await reg.buscar({ bitrixUserId: '66', telefono: '593990000002', desde })
  const c = await reg.buscar({ bitrixUserId: '55', telefono: '593990000002', desde })
  assert.equal(llamadas, 1)
  assert.deepEqual(resultadoDeFila(a), { estado: 'contestada', duracion: 40 })
  assert.deepEqual(resultadoDeFila(b), { estado: 'no_contesta', duracion: 0 })
  assert.equal(c, null)
  t += 16000
  await reg.buscar({ bitrixUserId: '55', telefono: '1', desde })
  assert.equal(llamadas, 2)
})

test('ignora llamadas anteriores al intento y no consulta sin webhook', async () => {
  const reg = crearRegistroLlamadas({ webhook: '', fetchImpl: async () => { throw new Error('no debe llamar') } })
  assert.equal(reg.configurado(), false)
  assert.equal(await reg.buscar({ bitrixUserId: '1', telefono: '1', desde: new Date() }), null)
  const reg2 = crearRegistroLlamadas({ webhook: 'https://x/rest/1/a/', now: () => Date.parse('2026-10-22T16:00:00Z'),
    fetchImpl: async () => ({ json: async () => ({ result: [{ PORTAL_USER_ID: '1', PHONE_NUMBER: '0990000001', CALL_START_DATE: '2026-10-22T15:00:00Z', CALL_FAILED_CODE: '200', CALL_DURATION: '9' }] }) }) })
  assert.equal(await reg2.buscar({ bitrixUserId: '1', telefono: '0990000001', desde: '2026-10-22T15:30:00Z' }), null)
})

test('si Bitrix falla, espera antes de reintentar', async () => {
  let llamadas = 0, t = 0
  const reg = crearRegistroLlamadas({ webhook: 'https://x/rest/1/a', now: () => t, logger: { error() {} },
    fetchImpl: async () => { llamadas++; return { json: async () => ({ error: 'QUERY_LIMIT_EXCEEDED' }) } } })
  t = 100000; await reg.buscar({ bitrixUserId: '1', telefono: '1', desde: 0 })
  t += 16000; await reg.buscar({ bitrixUserId: '1', telefono: '1', desde: 0 })
  assert.equal(llamadas, 1)
  t += 20000; await reg.buscar({ bitrixUserId: '1', telefono: '1', desde: 0 })
  assert.equal(llamadas, 2)
})
