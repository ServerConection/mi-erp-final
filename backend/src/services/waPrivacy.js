const clean = value => String(value || '').replace(/\D/g, '')

const protectedNumbers = () => [...new Set([
  '59398650281',
  ...String(process.env.WA_ADMIN_ONLY_NUMBERS || '').split(','),
].map(clean).filter(Boolean))]

const isAdminOnlyNumber = value => protectedNumbers().includes(clean(value))

// Usuarios cuyos chats (líneas que crearon) SOLO ellos pueden ver.
// Ni otros administradores, ni supervisores, ni gerencia.
const privateOwners = () => [...new Set([
  'bpineda',
  ...String(process.env.WA_PRIVATE_OWNERS || '').split(','),
].map(v => String(v || '').trim().toLowerCase()).filter(Boolean))]

const isPrivateOwner = usuario => privateOwners().includes(String(usuario || '').trim().toLowerCase())

module.exports = { clean, protectedNumbers, isAdminOnlyNumber, privateOwners, isPrivateOwner }
