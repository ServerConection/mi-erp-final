function sanitizeError(error) {
  return String(error?.message || error || 'Error desconocido')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 500);
}

function normalizePhone(raw) {
  const text = String(raw || '');
  // Bitrix puede entregar varios teléfonos en un solo placeholder separados
  // por coma (cliente, servicio móvil y línea fija). Nunca se concatenan:
  // se escoge el primer celular ecuatoriano válido.
  const candidates = [...text.split(/[,;|/]+/), text];
  for (const candidate of candidates) {
    let digits = candidate.replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (/^0\d{9}$/.test(digits)) digits = `593${digits.slice(1)}`;
    if (/^9\d{8}$/.test(digits)) digits = `593${digits}`;
    if (/^5939\d{8}$/.test(digits)) return digits;
  }
  return null;
}

function isAtcEntry(currentStage, previousStage) {
  return currentStage === 'atc' && previousStage !== 'atc';
}

module.exports = { sanitizeError, normalizePhone, isAtcEntry };
