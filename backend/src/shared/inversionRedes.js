const ORIGEN_SINTETICO_A_CANAL = Object.freeze({
  '__WINTRACKER_ARTS__': 'ARTS',
  '__WINTRACKER_VIDIKA__': 'VIDIKA',
});

function normalizarFechaInversion(fecha) {
  if (fecha instanceof Date) {
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(fecha || '').split('T')[0];
}
const CANAL_HISTORICO_A_AGENCIA = Object.freeze({
  'VIDIKA GOOGLE': 'VIDIKA',
  'ARTS GOOGLE': 'ARTS',
  'ARTS FACEBOOK': 'ARTS',
});

function resolverCanalRespaldo(canal) {
  const normalizado = String(canal || '').trim().toUpperCase();
  return CANAL_HISTORICO_A_AGENCIA[normalizado] || normalizado;
}
function resolverCanalInversion(origen) {
  const normalizado = String(origen || '').trim().toUpperCase();
  return ORIGEN_SINTETICO_A_CANAL[normalizado] || normalizado;
}

function agregarFilasSoloInversion(data, inversionMap) {
  const resultado = [...data];
  const presentes = new Set(data.map((row) => `${normalizarFechaInversion(row.fecha)}__${row.canal_inversion}`));

  Object.entries(inversionMap).forEach(([key, monto]) => {
    if (presentes.has(key) || Number(monto) <= 0) return;
    const separador = key.indexOf('__');
    const fecha = key.slice(0, separador);
    const canal = key.slice(separador + 2);
    resultado.push({
      fecha,
      dia_semana: '',
      canal_inversion: canal,
      canal_publicidad: canal,
      n_leads: 0,
      negociables: 0,
      atc_soporte: 0,
      fuera_cobertura: 0,
      innegociable: 0,
      venta_subida_bitrix: 0,
      seguimiento_negociacion: 0,
      ingreso_jot: 0,
      activo_backlog: 0,
      activos_mes: 0,
      inversion_usd: Number(monto),
    });
  });
  return resultado;
}

module.exports = { ORIGEN_SINTETICO_A_CANAL, normalizarFechaInversion, resolverCanalInversion, resolverCanalRespaldo, agregarFilasSoloInversion };
