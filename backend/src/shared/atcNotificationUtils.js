function sanitizeError(error) {
  return String(error?.message || error || 'Error desconocido')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 500);
}

function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (/^0\d{9}$/.test(digits)) digits = `593${digits.slice(1)}`;
  if (/^9\d{8}$/.test(digits)) digits = `593${digits}`;
  return /^5939\d{8}$/.test(digits) ? digits : null;
}

function isAtcEntry(currentStage, previousStage) {
  return currentStage === 'atc' && previousStage !== 'atc';
}

module.exports = { sanitizeError, normalizePhone, isAtcEntry };
