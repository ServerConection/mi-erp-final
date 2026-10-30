const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

const texto = (valor) => String(valor || '').trim();

// Orden estable del catálogo: supervisor -> código de asesor -> nombre.
// Las métricas del período nunca participan en el orden.
export const compararFilasKpi = (a, b) => {
  const porSupervisor = collator.compare(
    texto(a?.supervisor || 'SIN ASIGNAR'),
    texto(b?.supervisor || 'SIN ASIGNAR'),
  );
  if (porSupervisor) return porSupervisor;

  const codigoA = texto(a?.codigo_asesor);
  const codigoB = texto(b?.codigo_asesor);
  if (codigoA && codigoB) {
    const porCodigo = collator.compare(codigoA, codigoB);
    if (porCodigo) return porCodigo;
  } else if (codigoA || codigoB) {
    return codigoA ? -1 : 1;
  }

  return collator.compare(
    texto(a?.nombre || a?.asesor_display),
    texto(b?.nombre || b?.asesor_display),
  );
};

export const ordenarFilasKpi = (filas = []) => [...filas].sort(compararFilasKpi);
