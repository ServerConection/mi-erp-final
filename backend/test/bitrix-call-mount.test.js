const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')

const { mountBitrixConnector } = require('../src/routes/bitrixConnector.mount')

test('production mount parses Bitrix forms and permits only the configured portal iframe', async (t) => {
  const router = express.Router()
  router.post('/placement-call', (req, res) => res.json({ auth: req.body.AUTH_ID, options: req.body.PLACEMENT_OPTIONS }))
  router.post('/events', (req, res) => res.json({ appToken: req.body.auth?.application_token, field21: req.body.field21 }))
  const app = express()
  app.use((req, res, next) => { res.setHeader('X-Frame-Options', 'SAMEORIGIN'); next() })
  mountBitrixConnector(app, { router, portalUrl: 'https://novonet.bitrix24.es' })
  const server = app.listen(0)
  t.after(() => server.close())
  await new Promise(resolve => server.once('listening', resolve))

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/bitrix-connector/placement-call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ AUTH_ID: 'advisor-token', PLACEMENT_OPTIONS: '{"ID":"662241"}' }),
  })

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-frame-options'), null)
  assert.equal(response.headers.get('content-security-policy'), "frame-ancestors 'self' https://novonet.bitrix24.es")
  assert.deepEqual(await response.json(), { auth: 'advisor-token', options: '{"ID":"662241"}' })

  const eventBody = new URLSearchParams({ 'auth[application_token]': 'wabot-secret' })
  for (let i = 1; i <= 21; i += 1) eventBody.set(`field${i}`, String(i))
  const eventResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/bitrix-connector/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: eventBody,
  })
  assert.equal(eventResponse.status, 200)
  assert.deepEqual(await eventResponse.json(), { appToken: 'wabot-secret', field21: '21' })
})
