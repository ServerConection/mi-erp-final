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

function agregarInversionDiaria(filasVivas = [], filasRespaldo = [], canalesSeleccionados = []) {
  const canalesFiltro = new Set(canalesSeleccionados.map(resolverCanalRespaldo));
  const porCanalDia = new Map();
  const incluirCanal = (canal) => canalesFiltro.size === 0 || canalesFiltro.has(canal);

  filasVivas.forEach((row) => {
    const canal = resolverCanalRespaldo(resolverCanalInversion(row.origen));
    if (!incluirCanal(canal)) return;
    const fecha = normalizarFechaInversion(row.fecha);
    const key = `${fecha}__${canal}`;
    porCanalDia.set(key, (porCanalDia.get(key) || 0) + Number(row.monto_usd || 0));
  });

  filasRespaldo.forEach((row) => {
    const canal = resolverCanalRespaldo(row.canal || row.canal_inversion);
    if (!incluirCanal(canal)) return;
    const fecha = normalizarFechaInversion(row.fecha);
    const key = `${fecha}__${canal}`;
    if (!porCanalDia.has(key)) porCanalDia.set(key, Number(row.inversion_usd || 0));
  });

  const porDia = new Map();
  porCanalDia.forEach((monto, key) => {
    const fecha = key.slice(0, key.indexOf('__'));
    const dia = Number(fecha.slice(-2));
    porDia.set(dia, (porDia.get(dia) || 0) + monto);
  });

  return [...porDia.entries()]
    .sort(([diaA], [diaB]) => diaA - diaB)
    .map(([dia, inversion_usd]) => ({ dia, inversion_usd: Number(inversion_usd.toFixed(2)) }));
}

function construirForecastAgencias(filas = [], { desde, hasta, hoy }) {
  const diasTotales = Number(String(hasta).slice(-2));
  const diaHoy = Math.min(diasTotales, Math.max(0, Number(String(hoy).slice(-2))));
  const porAgencia = new Map();

  filas.forEach((row) => {
    const agencia = resolverCanalRespaldo(resolverCanalInversion(row.origen || row.agencia));
    const fecha = normalizarFechaInversion(row.fecha);
    const monto = Number(row.monto_usd || 0);
    if (!agencia || !fecha || Number.isNaN(monto)) return;
    if (!porAgencia.has(agencia)) porAgencia.set(agencia, { agencia, fechas: new Set(), total: 0, primera: fecha, ultima: fecha });
    const item = porAgencia.get(agencia);
    item.total += monto;
    item.fechas.add(fecha);
    if (fecha < item.primera) item.primera = fecha;
    if (fecha > item.ultima) item.ultima = fecha;
  });

  return [...porAgencia.values()]
    .sort((a, b) => a.agencia.localeCompare(b.agencia))
    .map((item) => {
      const acumulada = Number(item.total.toFixed(2));
      const diasConDatos = item.fechas.size;
      const promedio = diasConDatos > 0 ? Number((acumulada / diasConDatos).toFixed(2)) : 0;
      const proyeccion = Number((promedio * diasTotales).toFixed(2));
      return {
        agencia: item.agencia,
        inversion_acumulada: acumulada,
        dias_con_datos: diasConDatos,
        primera_fecha: item.primera,
        ultima_fecha: item.ultima,
        promedio_diario: promedio,
        dias_transcurridos: diaHoy,
        dias_restantes: Math.max(diasTotales - diaHoy, 0),
        proyeccion_cierre: proyeccion,
        gasto_proyectado_restante: Number(Math.max(proyeccion - acumulada, 0).toFixed(2)),
        atrasada: item.ultima < hoy,
      };
    });
}

module.exports = { ORIGEN_SINTETICO_A_CANAL, normalizarFechaInversion, resolverCanalInversion, resolverCanalRespaldo, agregarFilasSoloInversion, agregarInversionDiaria, construirForecastAgencias };
