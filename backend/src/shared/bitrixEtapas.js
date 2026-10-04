const normalizarNombreEtapa = (valor) => String(valor || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toUpperCase()
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ');

const esEtapaVentaSubida = (lead = {}) =>
  [lead.etapa_bitrix, lead.etapa]
    .some((valor) => normalizarNombreEtapa(valor) === 'VENTA SUBIDA');

module.exports = { normalizarNombreEtapa, esEtapaVentaSubida };
