const test = require('node:test')
const assert = require('node:assert/strict')
const FlowEngine = require('./FlowEngine')

const engine = new FlowEngine({}, {})
const options = [
  { label: 'Sí, entendí la información. Muchas gracias.', aliases: ['si entendi', 'entendido'] },
  { label: 'Hablar con un asesor', aliases: ['asesor', 'ayuda humana'] },
]

test('encuentra opciones por numero y por la palabra opcion', () => {
  assert.equal(engine._findPollOption(options, '1'), options[0])
  assert.equal(engine._findPollOption(options, 'Opción 2'), options[1])
})

test('encuentra texto y variantes ignorando tildes, signos y mayusculas', () => {
  assert.equal(engine._findPollOption(options, 'SI ENTENDÍ!!!'), options[0])
  assert.equal(engine._findPollOption(options, 'ayuda humana'), options[1])
  assert.equal(engine._findPollOption(options, 'Sí entendí la información muchas gracias'), options[0])
})

test('acepta variantes guardadas como texto separado por comas', () => {
  const textAliases = [{ label: 'Ciclo de facturación', aliases: 'ciclo, factura, mi ciclo' }]
  assert.equal(engine._findPollOption(textAliases, 'factura'), textAliases[0])
  assert.equal(engine._findPollOption(textAliases, 'MI CICLO'), textAliases[0])
})

test('no confunde respuestas parciales ni desconocidas', () => {
  assert.equal(engine._findPollOption(options, 'si'), null)
  assert.equal(engine._findPollOption(options, '3'), null)
})
