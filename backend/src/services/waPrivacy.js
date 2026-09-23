const clean = value => String(value || '').replace(/\D/g, '')

const protectedNumbers = () => [...new Set([
  '59398650281',
  ...String(process.env.WA_ADMIN_ONLY_NUMBERS || '').split(','),
].map(clean).filter(Boolean))]

const isAdminOnlyNumber = value => protectedNumbers().includes(clean(value))

module.exports = { clean, protectedNumbers, isAdminOnlyNumber }
