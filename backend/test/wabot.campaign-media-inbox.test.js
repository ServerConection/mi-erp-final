const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const enginePath = path.resolve(__dirname, '../src/services/CampaignEngine.js')
const dbPath = path.resolve(__dirname, '../src/config/db.js')

test('la campana entrega mediaUrl a BaileysManager para mostrar la imagen en Inbox', async () => {
  const queries = []
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { query: async (sql, params) => {
      queries.push({ sql, params })
      return { rows: [] }
    } },
  }
  delete require.cache[enginePath]
  const CampaignEngine = require(enginePath)

  let mediaOptions
  const engine = new CampaignEngine({
    sendMedia: async (_lineId, _number, options) => {
      mediaOptions = options
      return { key: { id: 'wamid-campana-imagen' } }
    },
  }, { emit: () => {} })

  const mediaUrl = __filename // archivo local existente; evita depender de uploads en la prueba
  const ok = await engine._sendOne(
    { id: 'camp-1', line_id: 'line-1' },
    { id: 'recipient-1', wa_number: '593999999999', name: 'Cliente', variables: {} },
    {
      id: 'variant-1',
      label: 'Imagen',
      message_text: 'Hola {{nombre}}',
      media_url: mediaUrl,
      media_type: 'image',
      media_caption: 'promocion.jpg',
    }
  )

  assert.equal(ok, true)
  assert.equal(mediaOptions.mediaUrl, mediaUrl)
  assert.equal(mediaOptions.type, 'image')
  assert.match(mediaOptions.caption, /Hola Cliente/)
  assert.ok(queries.some(({ sql, params }) =>
    sql.includes("status='sent'") && params?.[1] === 'wamid-campana-imagen'
  ))
})
