const numero = (valor) => Number(valor || 0);

export function calcularEfectividadGestionables(ventaSubida, gestionables) {
  const base = numero(gestionables);
  return base > 0 ? (numero(ventaSubida) / base) * 100 : 0;
}

export function construirResumenHora(filas = []) {
  return filas.map((fila) => {
    const nLeads = numero(fila.n_leads);
    const atc = numero(fila.atc);
    return { ...fila, hora: numero(fila.hora), n_leads: nLeads, atc,
      pct_atc: fila.pct_atc == null ? (nLeads > 0 ? (atc / nLeads) * 100 : 0) : numero(fila.pct_atc) };
  }).sort((a, b) => a.hora - b.hora);
}

export function construirMatrizHoraDia(filas = []) {
  const horas = [...new Set(filas.map((fila) => numero(fila.hora)))].sort((a, b) => a - b);
  const porDia = {};
  filas.forEach((fila) => {
    const dia = numero(fila.dia), hora = numero(fila.hora);
    if (!porDia[dia]) porDia[dia] = {};
    porDia[dia][hora] = numero(fila.n_leads);
  });
  return { horas, porDia };
}