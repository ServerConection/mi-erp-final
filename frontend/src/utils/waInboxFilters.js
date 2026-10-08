export const FILTROS_INBOX_INICIALES = Object.freeze({
  search: '',
  lineFilter: '',
  filter: 'all',
});

const texto = (valor) => String(valor ?? '').trim().toLowerCase();
const digitos = (valor) => String(valor ?? '').replace(/\D/g, '');

export function estadoCoincide(conversacion, filter) {
  if (!filter || filter === 'all') return true;
  if (filter === 'human_takeover') return ['human', 'human_takeover'].includes(conversacion?.status);
  return conversacion?.status === filter;
}

export function lineaCoincide(conversacion, lineFilter) {
  if (!lineFilter) return true;
  return String(conversacion?.line_id ?? conversacion?.lineId ?? '') === String(lineFilter);
}

export function busquedaCoincide(conversacion, search) {
  const termino = texto(search);
  if (!termino) return true;

  const campos = [
    conversacion?.contact_name,
    conversacion?.wa_number,
    conversacion?.bitrix_deal_id,
    conversacion?.line_name,
    conversacion?.contact_metadata?.real_phone,
  ];
  if (campos.some(valor => texto(valor).includes(termino))) return true;

  const buscados = digitos(search);
  return Boolean(buscados) && [
    conversacion?.wa_number,
    conversacion?.bitrix_deal_id,
    conversacion?.contact_metadata?.real_phone,
  ].some(valor => digitos(valor).includes(buscados));
}

export function conversacionCoincideFiltros(conversacion, filtros = FILTROS_INBOX_INICIALES) {
  return estadoCoincide(conversacion, filtros.filter)
    && lineaCoincide(conversacion, filtros.lineFilter)
    && busquedaCoincide(conversacion, filtros.search);
}

export function crearParametrosInbox({ dealId = null, search = '', lineFilter = '', filter = 'all', limit = 500 } = {}) {
  const params = new URLSearchParams();
  if (dealId) params.set('bitrix_deal_id', dealId);
  else if (lineFilter) params.set('line_id', lineFilter);
  if (!dealId) params.set('limit', String(limit));
  if (String(search).trim()) params.set('search', String(search).trim());
  if (filter && filter !== 'all') params.set('status', filter);
  return params;
}
