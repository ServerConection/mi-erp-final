/**
 * Medios subidos ANTES de separar WABOT del ERP.
 *
 * Esos archivos (imágenes de presentación, campañas, chatbots, programados)
 * siguen en el disco del ERP, no en el del servicio erp-wabot. Los módulos los
 * buscan en el disco local y, al no encontrarlos, omitían la imagen sin avisar
 * (por ejemplo, la presentación salía solo con texto).
 *
 * asegurarLocal(ruta): si el archivo no existe aquí y WA_MEDIA_FALLBACK_URL
 * apunta al ERP, lo descarga UNA vez desde la URL pública del ERP
 * (/wa-uploads/... o /uploads/...) y lo guarda en la misma ruta. Las veces
 * siguientes ya está en disco. Sin la variable no hace nada.
 */
const fs = require('fs')
const path = require('path')

const WA_DIR = process.env.WA_UPLOADS_DIR || path.join(__dirname, '../../wa_uploads')
const UP_DIR = path.join(__dirname, '../../uploads')
const enCurso = new Map()

function rutaPublica(filePath) {
  const abs = path.resolve(filePath)
  for (const [dir, prefijo] of [[WA_DIR, '/wa-uploads/'], [UP_DIR, '/uploads/']]) {
    const rel = path.relative(path.resolve(dir), abs)
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      return prefijo + rel.split(path.sep).map(encodeURIComponent).join('/')
    }
  }
  return null
}

async function descargar(filePath) {
  const base = (process.env.WA_MEDIA_FALLBACK_URL || '').replace(/\/+$/, '')
  const publica = rutaPublica(filePath)
  if (!base || !publica) return false
  try {
    const resp = await fetch(base + publica)
    if (!resp.ok) {
      console.warn(`[waMedia] no está en el ERP (${resp.status}): ${publica}`)
      return false
    }
    const buf = Buffer.from(await resp.arrayBuffer())
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, buf)
    console.log(`[waMedia] recuperado del ERP: ${publica} (${buf.length} bytes)`)
    return true
  } catch (e) {
    console.warn(`[waMedia] error recuperando ${publica}:`, e.message)
    return false
  }
}

async function asegurarLocal(filePath) {
  if (!filePath || /^https?:\/\//i.test(filePath)) return false
  if (fs.existsSync(filePath)) return true
  // Si varias líneas piden el mismo archivo a la vez, se descarga una sola vez.
  if (!enCurso.has(filePath)) {
    enCurso.set(filePath, descargar(filePath).finally(() => enCurso.delete(filePath)))
  }
  return enCurso.get(filePath)
}

module.exports = { asegurarLocal, rutaPublica }
