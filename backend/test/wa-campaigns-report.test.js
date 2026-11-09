const test = require('node:test')
const assert = require('node:assert/strict')
const svc = require('../src/services/waCampaignsReport.service')

test('reporte de uso: solo administradores o acloaiza', () => {
  assert.equal(svc.puedeVerReporte({ perfil: 'ADMINISTRADOR', usuario: 'x' }), true)
  assert.equal(svc.puedeVerReporte({ perfil: 'USUARIO', usuario: 'ACLOAIZA' }), true)
  assert.equal(svc.puedeVerReporte({ perfil: 'SUPERVISOR', usuario: 'jperez' }), false)
})

test('reporte de uso: separa supervisores y asesores y totaliza por empresa', async () => {
  const fila = (usuario, empresa, perfil, enviados) => ({ usuario_id: usuario, usuario, nombre: usuario, empresa, perfil,
    campanas: 1, ejecutadas: 1, destinatarios: enviados, enviados, fallidos: 0, entregados: enviados, leidos: 0 })
  let params
  const db = { query: async (sql, p) => { params = p; return { rows: [
    fila('sup1', 'NOVONET', 'SUPERVISOR', 50), fila('ase1', 'NOVONET', 'USUARIO', 30), fila('ase2', 'VELSA', 'USUARIO', 10),
  ] } } }
  const r = await svc.reporteUso({ desde: '2026-10-01', hasta: '2026-10-28', empresa: 'todas' }, db)
  assert.deepEqual(params, ['2026-10-01', '2026-10-28', ''])
  assert.equal(r.supervisores.length, 1)
  assert.equal(r.asesores.length, 2)
  assert.equal(r.total.enviados, 90)
  assert.deepEqual(r.empresas.map(e => [e.empresa, e.enviados]), [['NOVONET', 80], ['VELSA', 10]])
  await assert.rejects(() => svc.reporteUso({ desde: '2026-10-28', hasta: '2026-10-01' }, db), /rango/)
})

test('gerencia ve el reporte solo de su empresa', async () => {
  assert.equal(svc.puedeVerReporte({ perfil: 'GERENCIA', empresa: 'NOVONET' }), true)
  assert.equal(svc.puedeVerReporte({ perfil: 'GERENTE', empresa: 'velsa' }), true)
  assert.equal(svc.puedeVerReporte({ perfil: 'GERENCIA', empresa: '' }), false)
  assert.equal(svc.empresaForzada({ perfil: 'ADMINISTRADOR', empresa: 'NOVONET' }), null)
  let params
  const db = { query: async (_sql, p) => { params = p; return { rows: [] } } }
  // Aunque pida TODAS o VELSA, una gerencia de NOVONET solo ve NOVONET.
  await svc.reporteUso({ desde: '2026-11-01', hasta: '2026-11-07', empresa: 'VELSA' }, db, { perfil: 'GERENCIA', empresa: 'Novonet' })
  assert.deepEqual(params, ['2026-11-01', '2026-11-07', 'NOVONET'])
  await svc.reporteUso({ desde: '2026-11-01', hasta: '2026-11-07', empresa: 'TODAS' }, db, { perfil: 'GERENTE', empresa: 'VELSA' })
  assert.equal(params[2], 'VELSA')
  // Administrador sigue pudiendo ver todas.
  await svc.reporteUso({ desde: '2026-11-01', hasta: '2026-11-07', empresa: 'TODAS' }, db, { perfil: 'ADMINISTRADOR' })
  assert.equal(params[2], '')
})
