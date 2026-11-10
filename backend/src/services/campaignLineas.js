// Reparto de destinatarios entre varias líneas de una campaña.
//
// Modos (campaigns.modo_responsable):
//   libre  → ronda simple: una línea tras otra y vuelve a empezar.
//   evitar → ronda, pero NUNCA desde la línea del responsable del lead
//            (para que lo contacte otro asesor). Si solo queda esa, se salta.
//   mismo  → SOLO desde la línea del responsable del lead. Si no tiene línea
//            disponible en la campaña, se salta.
// Un destinatario saltado queda marcado con el motivo; nunca se envía
// desde una línea que rompa la regla.

const MODOS = ['libre', 'evitar', 'mismo']
const normalizarModo = (m) => (MODOS.includes(String(m || '').toLowerCase()) ? String(m).toLowerCase() : 'libre')

const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

// Palabras (≥3 letras) del nombre del dueño de la línea.
function palabrasNombre(nombre) {
  return [...new Set(sinTildes(nombre).split(/[^A-Z]+/).filter(p => p.length >= 3))]
}

// ¿El responsable del lead (texto de Bitrix) es el dueño de la línea?
// Se compara contra el nombre del usuario que registró la línea y contra el
// NOMBRE de la línea (las líneas suelen llamarse como el asesor, y muchas las
// registró un supervisor/admin, así que el creador no siempre es el asesor).
// Basta con que coincidan 2 palabras: Bitrix guarda "MONICA PILCO QUINATOA" y
// la línea "MONICA_ALEXANDRA_PILCO_QUINATOA"; antes se exigían todas y el
// modo "mismo" saltaba contactos que sí tenían su línea en la campaña.
function coinciden(nombre, tokensResp, minimo) {
  const palabras = palabrasNombre(nombre)
  if (!palabras.length) return false
  const comunes = palabras.filter(p => tokensResp.has(p)).length
  return comunes >= Math.min(minimo ?? 2, palabras.length)
}

function esResponsable(linea, responsable) {
  const resp = sinTildes(responsable)
  if (!resp) return false
  const tokens = new Set(resp.split(/[^A-Z]+/).filter(p => p.length >= 3))
  if (!tokens.size) return false
  // Por nombre de línea se exigen 2 palabras siempre: una línea llamada
  // solo "KATHERINE" no debe tomar los leads de cualquier Katherine.
  return coinciden(linea?.owner_nombre, tokens) || coinciden(linea?.name, tokens, 2) && palabrasNombre(linea?.name).length >= 2
}

const responsableDe = (recipient) => String(recipient?.variables?.bitrix_responsible || '').trim()

// lineas: [{ id, name, owner_nombre }] en el orden de la ronda.
// disponible(linea) → boolean (conectada y sin tope de calentamiento).
// Devuelve { linea, siguiente } o { saltar: motivo, siguiente }.
function elegirLinea({ lineas, indice = 0, recipient, modo, disponible = () => true }) {
  const n = lineas.length
  const m = normalizarModo(modo)
  if (!n) return { saltar: 'Campaña sin líneas', siguiente: indice }
  const responsable = responsableDe(recipient)

  if (m === 'mismo') {
    if (!responsable) return { saltar: 'Contacto sin responsable de Bitrix', siguiente: indice }
    const propia = lineas.find(l => esResponsable(l, responsable))
    if (!propia) return { saltar: `Sin línea del responsable (${responsable})`, siguiente: indice }
    if (!disponible(propia)) return { saltar: `Línea del responsable no disponible (${propia.name})`, siguiente: indice }
    return { linea: propia, siguiente: indice }
  }

  for (let k = 0; k < n; k++) {
    const pos = (indice + k) % n
    const linea = lineas[pos]
    if (!disponible(linea)) continue
    if (m === 'evitar' && responsable && esResponsable(linea, responsable)) continue
    return { linea, siguiente: (pos + 1) % n }
  }
  return {
    saltar: m === 'evitar' ? 'Solo está disponible la línea del mismo responsable' : 'Ninguna línea disponible',
    siguiente: indice,
  }
}

module.exports = { elegirLinea, esResponsable, normalizarModo, MODOS }
