/**
 * Utilidad de una sola vez: listar y borrar placements CRM_DEAL_DETAIL_TAB
 * duplicados de WABOT en Bitrix (por ejemplo, el que quedó de una prueba
 * anterior y ya no sirve).
 *
 * Usa el OAuth YA guardado de la app (bitrixApp.service.js) — no pide ni
 * imprime ningún token nuevo, no expone nada sensible en la consola.
 *
 * Uso (en la Shell de Render, parado en /backend):
 *   node scripts/bitrix-placements.js list
 *   node scripts/bitrix-placements.js unbind "<HANDLER exacto de la lista>"
 */
require('dotenv').config()
const bitrixApp = require('../src/services/bitrixApp.service')

async function main() {
  const [, , accion, handler] = process.argv

  if (accion === 'list') {
    const r = await bitrixApp.llamar('placement.get', { PLACEMENT: 'CRM_DEAL_DETAIL_TAB' })
    if (!r || !r.length) {
      console.log('No hay placements CRM_DEAL_DETAIL_TAB registrados.')
      return
    }
    console.log(`Encontrados ${r.length} placement(s) CRM_DEAL_DETAIL_TAB:\n`)
    r.forEach((p, i) => {
      console.log(`[${i + 1}] TITLE: ${p.TITLE || '(sin título)'}`)
      console.log(`    HANDLER: ${p.HANDLER}`)
      console.log('')
    })
    console.log('El que hay que CONSERVAR es el que termina en /api/bitrix-connector/placement-inbox')
    console.log('Para borrar cualquier otro:')
    console.log('  node scripts/bitrix-placements.js unbind "<HANDLER exacto de arriba>"')
    return
  }

  if (accion === 'unbind') {
    if (!handler) {
      console.error('Falta el HANDLER a eliminar. Corre primero: node scripts/bitrix-placements.js list')
      process.exit(1)
    }
    const ok = await bitrixApp.llamar('placement.unbind', { PLACEMENT: 'CRM_DEAL_DETAIL_TAB', HANDLER: handler })
    console.log(ok ? '✔ Eliminado.' : '✘ No se pudo eliminar (revisa que el HANDLER sea exactamente igual al de la lista).')
    return
  }

  console.log('Uso:')
  console.log('  node scripts/bitrix-placements.js list')
  console.log('  node scripts/bitrix-placements.js unbind "<HANDLER>"')
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('Error:', e.message); process.exit(1) })
