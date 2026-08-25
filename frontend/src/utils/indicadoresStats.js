export function calcularStatsIndicadores(data = {}) {
  const filas = data.asesores || [];
  const n = filas.length || 1;
  const suma = campo => filas.reduce((acc, fila) => acc + Number(fila[campo] || 0), 0);
  const totalJotform = suma('ingresos_reales');
  const totalActivos = suma('real_mes');
  const totalActivaMes = suma('activa_mes');
  const totalBacklog = Math.max(0, totalActivos - totalActivaMes);
  const totalGestionables = suma('gestionables');
  const totalLeadsTotales = suma('leads_totales');

  return {
    ingresosCRM: suma('ventas_crm'),
    gestionables: totalGestionables,
    regularizar: suma('por_regularizar'),
    ingresosJotform: totalJotform,
    ventasDelDia: suma('ventas_del_dia'),
    ventasDiaForm: suma('ventas_dia_form'),
    ventaSeguimiento: Math.max(0, totalJotform - suma('ventas_del_dia')),
    descartePorc: totalGestionables > 0
      ? ((suma('descarte_count') / totalGestionables) * 100).toFixed(1) : '0.0',
    leadsGestionables: totalLeadsTotales,
    efectividad: totalGestionables > 0 ? ((totalJotform / totalGestionables) * 100).toFixed(1) : '0.0',
    tasaInstalacion: totalJotform > 0 ? ((totalActivos / totalJotform) * 100).toFixed(1) : '0.0',
    tarjetaCredito: Number(data.porcentajeTarjeta || 0).toFixed(1),
    terceraEdad: Number(data.porcentajeTerceraEdad || 0).toFixed(1),
    efectividadActivasPauta: (suma('efectividad_activas_vs_pauta') / n).toFixed(1),
    activas: totalActivos,
    activaMes: totalActivaMes,
    backlog: totalBacklog,
    ventaServicio: suma('venta_servicio'),
    pctGestionablesVsTotales: totalLeadsTotales > 0
      ? ((totalGestionables / totalLeadsTotales) * 100).toFixed(1) : '0.0',
    efectividadVsLeadsTotales: totalLeadsTotales > 0
      ? ((totalJotform / totalLeadsTotales) * 100).toFixed(1) : '0.0',
  };
}
