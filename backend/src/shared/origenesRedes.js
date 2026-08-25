const ORIGEN_A_CANAL = {
  'BASE 593-979083368': 'ARTS',
  'BASE 593-995211968': 'ARTS FACEBOOK',
  'BASE 593-992827793': 'ARTS GOOGLE',
  'FORMULARIO LANDING 3': 'ARTS GOOGLE',
  'FOMULARIO LANDING 3': 'ARTS GOOGLE',
  'LLAMADA LANDING 3': 'ARTS GOOGLE',
  'POR RECOMENDACIÓN': 'POR RECOMENDACIÓN',
  'REFERIDO PERSONAL': 'POR RECOMENDACIÓN',
  'TIENDA ONLINE': 'POR RECOMENDACIÓN',
  'BASE 593-958993371': 'REMARKETING',
  'BASE 593-984414273': 'REMARKETING',
  'BASE 593-995967355': 'REMARKETING',
  'WHATSAPP 593958993371': 'REMARKETING',
  'BASE 593-962881280': 'VIDIKA GOOGLE',
  'BASE 593-987133635': 'VIDIKA GOOGLE',
  'BASE API 593963463480': 'VIDIKA GOOGLE',
  'FORMULARIO LANDING 4': 'VIDIKA GOOGLE',
  'LLAMADA': 'VIDIKA GOOGLE',
  'LLAMADA LANDING 4': 'VIDIKA GOOGLE',
};

const normalizarOrigen = (origen) => String(origen ?? '')
  .trim()
  .replace(/\s+/g, ' ')
  .toUpperCase();

const normalizarOrigenSql = (columna) => `UPPER(REGEXP_REPLACE(TRIM(${columna}), '\\s+', ' ', 'g'))`;

const canalOrigenSql = (columna) => {
  const origen = normalizarOrigenSql(columna);
  const casos = Object.entries(ORIGEN_A_CANAL)
    .map(([valor, canal]) => `WHEN '${valor.replace(/'/g, "''")}' THEN '${canal.replace(/'/g, "''")}'`)
    .join('\n        ');
  return `CASE ${origen}\n        ${casos}\n        ELSE ${origen}\n      END`;
};
const normalizarAgencia = (agencia) => {
  const normalizada = normalizarOrigen(agencia);
  if (normalizada === 'ARST') return 'ARTS';
  return normalizada;
};

const agenciaSql = (columna) => {
  const normalizada = normalizarOrigenSql(columna);
  return `CASE ${normalizada} WHEN 'ARST' THEN 'ARTS' ELSE ${normalizada} END`;
};

const canalAsignadoSql = (columnaAgencia, columnaOrigen) =>
  `COALESCE(NULLIF(${agenciaSql(columnaAgencia)}, ''), ${canalOrigenSql(columnaOrigen)})`;
const resolverCanalOrigen = (origen) => {
  const normalizado = normalizarOrigen(origen);
  if (!normalizado) return 'SIN ORIGEN';
  return ORIGEN_A_CANAL[normalizado] || normalizado;
};

const construirFiltroOrigenes = (origenes, offsetInicial, field) => {
  if (!origenes || origenes.length === 0) return { where: '', params: [] };
  const normalizados = [...new Set(origenes.map(normalizarOrigen).filter(Boolean))];
  if (!normalizados.length) return { where: '', params: [] };
  const ph = normalizados.map((_, i) => `$${offsetInicial + i + 1}`).join(', ');
  return {
    where: `AND ${normalizarOrigenSql(field)} IN (${ph})`,
    params: normalizados,
  };
};

module.exports = {
  ORIGEN_A_CANAL,
  normalizarOrigen,
  normalizarOrigenSql,
  normalizarAgencia,
  canalOrigenSql,
  canalAsignadoSql,
  resolverCanalOrigen,
  construirFiltroOrigenes,
};
