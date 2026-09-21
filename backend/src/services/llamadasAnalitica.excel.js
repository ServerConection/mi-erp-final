const XLSX=require('xlsx');
function workbook(data,filters) {
  const wb=XLSX.utils.book_new();
  const labels={grupo:'Grupo',total:'Llamadas',contestadas:'Contestadas',tasa:'Contestadas (%)',telefonos:'Teléfonos únicos',telefonosContestados:'Teléfonos con ANSWERED',intentosPorTelefono:'Intentos por teléfono',segundosFacturados:'Segundos facturados',duracion:'Duración (s)',esperaMedia:'Espera media entrante (s)',costo:'Costo reportado',fecha:'Fecha local origen',empresa:'Empresa',direccion:'Dirección',agente:'Agente',telefono:'Teléfono',facturados:'Segundos facturados',espera:'Espera entrante (s)',estado:'Disposición'};
  function sheet(name,rows) {
    const mapped=rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[labels[k]||k,v])));
    const ws=XLSX.utils.json_to_sheet(mapped.length?mapped:[{Información:'Sin registros para los filtros seleccionados'}]);
    const range=XLSX.utils.decode_range(ws['!ref']);
    ws['!cols']=Array.from({length:range.e.c+1},()=>({wch:24}));
    ws['!autofilter']={ref:ws['!ref']};
    XLSX.utils.book_append_sheet(wb,ws,name);
  }
  sheet('Resumen',[data.resumen]);
  for(const [key,name] of Object.entries({empresas:'Empresas',diario:'Diario',agentes:'Agentes',horas:'Horas',mapa:'Dia y hora',estados:'Resultados',detalle:'Detalle',cobertura:'Cobertura',cargas:'Últimas cargas'}))sheet(name,data[key]);
  sheet('Metodología',[
    {Concepto:'Filtros aplicados',Definición:JSON.stringify(filters)},
    {Concepto:'Fecha de exportación UTC',Definición:new Date().toISOString()},
    {Concepto:'Contestadas (%)',Definición:'100 × registros ANSWERED / total de llamadas filtradas. No confirma contacto humano ni venta.'},
    {Concepto:'Segundos facturados',Definición:'Suma literal del campo del proveedor; no equivale necesariamente a conversación.'},
    {Concepto:'Espera media',Definición:'Promedio de Tiempo Espera, solo llamadas entrantes. Salientes: dato no disponible, no cero.'},
    {Concepto:'Teléfonos e intentos',Definición:'Teléfonos únicos normalizados. Intentos por teléfono = llamadas / teléfonos únicos. Incluye todas las direcciones seleccionadas.'},
    {Concepto:'Deduplicación',Definición:'Huella de empresa, dirección, fecha local, agente normalizado, teléfono normalizado, duración, facturados, espera, estado y costo. Filas idénticas se cuentan una vez. Sin ID del proveedor no se distinguen llamadas idénticas ni correcciones de una llamada.'},
    {Concepto:'Fechas',Definición:'Hora local tal como figura en CSV, sin conversión. Confirmar zona horaria con proveedor. Día 0=domingo, 1=lunes...6=sábado.'},
    {Concepto:'Cobertura',Definición:'Cobertura total importada independiente del rango del reporte. Días sin registros no prueban una caída del sistema.'},
    {Concepto:'Costos',Definición:'Valores del CSV; moneda no especificada. Cero no demuestra gratuidad.'},
    {Concepto:'Eficiencia',Definición:'No hay tiempos de sesión, dotación, campañas ni ventas: no se calculan ocupación, disponibilidad, conversión comercial ni contacto humano confirmado.'},
    {Concepto:'Fuente',Definición:'Exportaciones CSV inbound/outbound Netlife y Ecuanet; originales no se modifican.'}
  ]);
  return XLSX.write(wb,{type:'buffer',bookType:'xlsx',compression:true});
}
module.exports={workbook};
