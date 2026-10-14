export function formatearFechaTelcos(valor) {
  if (!valor) return 'Sin fecha';
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const anio = valor.getUTCFullYear();
    const mes = String(valor.getUTCMonth() + 1).padStart(2, '0');
    const dia = String(valor.getUTCDate()).padStart(2, '0');
    return `${dia}/${mes}/${anio}`;
  }
  const coincidencia = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!coincidencia) return 'Sin fecha';
  const [, anio, mes, dia] = coincidencia;
  return `${dia}/${mes}/${anio}`;
}
