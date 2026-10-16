const BITRIX_EMBED_PREFIXES = Object.freeze([
  '/api/bitrix-connector/install',
  '/api/bitrix-connector/settings',
  '/api/bitrix-connector/placement-inbox',
  '/api/bitrix-connector/placement-call',
  '/api/bitrix-connector-velsa/install',
  '/api/bitrix-connector-velsa/settings',
  '/api/bitrix-connector-velsa/placement-inbox',
])

function isBitrixEmbedPath(pathname) {
  const path = String(pathname || '')
  return BITRIX_EMBED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

module.exports = { BITRIX_EMBED_PREFIXES, isBitrixEmbedPath }
