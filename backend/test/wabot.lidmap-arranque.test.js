/**
 * El arranque de WABOT no debe esperar la reconciliación de lid_mappings:
 * antes revisaba ~10.000 filas (≈30.000 consultas) y ninguna línea conectaba
 * durante ~8 minutos. Ahora carga el mapa con 1 consulta y fusiona en
 * segundo plano solo los LID que todavía tienen chat propio.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const managerPath = path.resolve(__dirname, '../src/services/BaileysManager.js')
const dbPath = path.resolve(__dirname, '../src/config/db.js')

test('cargar el LidMap no espera las fusiones y solo procesa pendientes', async () => {
  const consultas = []
  let liberarFusion
  const fusionBloqueada = new Promise(r => { liberarFusion = r })
  require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true,
    exports: {
      query: async (sql, params) => {
        consultas.push(sql.replace(/\s+/g, ' ').trim())
        if (sql.includes('SELECT lid_number, real_number FROM lid_mappings')) {
          return { rows: Array.from({ length: 5000 }, (_, i) => ({ lid_number: `L${i}`, real_number: `R${i}` })) }
        }
        if (sql.includes('JOIN conversations c ON c.wa_number = m.lid_number')) {
          return { rows: [{ lid_number: 'L1', real_number: 'R1' }] }
        }
        if (sql.includes('FROM conversations WHERE wa_number = $1')) { await fusionBloqueada; return { rows: [] } }
        return { rows: [] }
      },
      transaction: async (fn) => fn({ query: async () => ({ rows: [] }) }),
    },
  }
  delete require.cache[managerPath]
  const BaileysManager = require(managerPath)
  const manager = new BaileysManager({ emit: () => {}, to: () => ({ emit: () => {} }) })

  await manager._loadLidMapFromDB()   // debe resolver aunque la fusión siga bloqueada
  assert.equal(manager.lidMap.L4999, 'R4999')
  await new Promise(r => setImmediate(r))
  const porLid = consultas.filter(q => q.includes('FROM conversations WHERE wa_number = $1'))
  assert.equal(porLid.length, 1, 'solo se revisa el LID pendiente, no las 5000 filas')
  liberarFusion()
  delete require.cache[managerPath]
  delete require.cache[dbPath]
})
