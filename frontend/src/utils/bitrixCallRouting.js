const BITRIX_DEAL_BASE = {
  VELSA: 'https://aclopecuador.bitrix24.es/crm/deal/details',
  NOVONET: 'https://novonet.bitrix24.es/crm/deal/details',
};

export function esAplicacionWabot(capacitor = globalThis.Capacitor) {
  try {
    return Boolean(capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export function construirUrlNegociacionBitrix(empresa, dealId) {
  const id = String(dealId ?? '').trim();
  const base = BITRIX_DEAL_BASE[String(empresa || '').trim().toUpperCase()];
  if (!base || !/^\d+$/.test(id)) return null;
  return `${base}/${id}/`;
}

export function decidirDestinoLlamadaBitrix({ esApk, empresa, dealId }) {
  if (!esApk) return { tipo: 'automarcador' };
  const url = construirUrlNegociacionBitrix(empresa, dealId);
  if (!url) {
    return {
      tipo: 'error',
      mensaje: 'Esta conversación no tiene una negociación de Bitrix asociada.',
    };
  }
  return { tipo: 'abrir_negociacion', url };
}
