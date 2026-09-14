// El origen pertenece al deal de Bitrix, no al envío JotForm.
// EXISTS implementa un semi-join: varias ventas del mismo deal conservan
// su cardinalidad y los IDs iguales de empresas distintas nunca se mezclan.
const ORIGENES_NOVONET = [
  'BASE API 593963463480',
  'API 484',
  'WAZZUP: WhatsApp - API 963999000',
  'Formulario Landing 4',
  'Fomulario Landing 3',
];

const normalizarOrigenExpr = col => `UPPER(REGEXP_REPLACE(BTRIM(${col}), '[[:space:]]+', ' ', 'g'))`;

function filtroOrigenBitrix({ empresa, deal, origenes, values }) {
  if (!['novonet', 'velsa'].includes(empresa)) throw new Error('Empresa inválida');
  const lista = [...new Set(origenes.map(v => String(v).trim().replace(/\s+/g, ' ').toUpperCase()).filter(Boolean))];
  if (!lista.length) return '';
  const placeholders = lista.map(value => { values.push(value); return `$${values.length}`; });
  return ` AND EXISTS (
    SELECT 1 FROM public.bitrix_webhook_leads origen_bwl
    WHERE origen_bwl.empresa = '${empresa}'
      AND BTRIM(origen_bwl.bitrix_id::text) = ${deal}
      AND ${normalizarOrigenExpr('origen_bwl.source')} IN (${placeholders.join(', ')})
  )`;
}

const dealNovonet = (alias = 'mb') =>
  `COALESCE(NULLIF(BTRIM(${alias}.j_id_bitrix::text), ''), NULLIF(BTRIM(${alias}.b_id::text), ''))`;
module.exports = { ORIGENES_NOVONET, filtroOrigenBitrix, dealNovonet, normalizarOrigenExpr };
