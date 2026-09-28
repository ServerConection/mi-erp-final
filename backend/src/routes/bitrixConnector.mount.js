const express = require('express')

function portalOrigin(portalUrl) {
  try {
    const url = new URL(portalUrl)
    return url.protocol === 'https:' ? url.origin : ''
  } catch (_) {
    return ''
  }
}

function mountBitrixConnector(app, {
  router = require('./bitrixConnector.routes'),
  portalUrl = process.env.BITRIX_PORTAL_URL,
} = {}) {
  const origin = portalOrigin(portalUrl)
  app.use(
    '/api/bitrix-connector/placement-call',
    express.urlencoded({ extended: false, limit: '32kb', parameterLimit: 20 }),
    (req, res, next) => {
      res.removeHeader('X-Frame-Options')
      res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${origin || "'none'"}`)
      next()
    },
  )
  app.use(
    '/api/bitrix-connector',
    express.urlencoded({ extended: true, limit: '1mb', parameterLimit: 1000 }),
    router,
  )
}

module.exports = { mountBitrixConnector, portalOrigin }
