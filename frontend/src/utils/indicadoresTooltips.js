/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TOOLTIPS DE INDICADORES — texto corto para el ícono "i" de las tarjetas KPI
 * ─────────────────────────────────────────────────────────────────────────────
 * Fuente: docs/DICCIONARIO_INDICADORES.xlsx (hoja INDICADORES, columna
 * "QUÉ SIGNIFICA / CÓMO SE CALCULA"), resumida a 1-2 frases para que quepa en
 * el cuadro flotante. Si el diccionario cambia, actualizar aquí también —
 * este archivo NO se genera automáticamente desde el Excel.
 *
 * Compartido entre Indicadores.jsx (Novonet) e IndicadoresVelsa.jsx (Velsa):
 * el CÁLCULO técnico difiere entre empresas (ver el Excel), pero el
 * SIGNIFICADO del indicador es el mismo, así que un solo texto sirve para
 * ambas pantallas.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const TOOLTIPS_INDICADORES = {
  leadsTotales:
    "Todos los leads creados en el rango, menos duplicados, remarketing y regularización. Cuenta IDs únicos (no filas).",

  gestionables:
    "De los leads totales, los que el asesor sí puede trabajar: se descarta ATC/soporte, fuera de cobertura, zona peligrosa, postventa y Paramount.",

  pctGestionablesVsTotales:
    "De cada 100 leads que entran, cuántos son realmente trabajables. Gestionables ÷ Leads Totales. Si baja, está entrando más basura (ATC, fuera de cobertura).",

  efectividadVsLeadsTotales:
    "Ingresos JOT válidos ÷ total de leads discriminados × 100, dentro de los filtros aplicados.",

  efectividad:
    "Ingresos JOT válidos ÷ leads gestionables × 100, dentro de los filtros aplicados.",

  descarte:
    "De lo gestionable, qué porcentaje se perdió. Ojo: el divisor usa una ventana de fecha más amplia que la de \"Gestionables\" en pantalla (a propósito).",

  ventasCRM:
    "Leads que llegaron a la etapa VENTA SUBIDA en Bitrix, contados por la fecha en que se CREÓ el lead (fecha CRM).",

  ventasDelDia:
    "Ventas que se cerraron el MISMO día que entró el lead: fecha de creación CRM = fecha de registro Jotform. Mide la venta en caliente, sin seguimiento.",

  ventasDiaForm:
    "El mismo número que \"Ingresos CRM día\", mostrado del lado Jotform.",

  ventaSeguimiento:
    "Ventas que NO se cerraron el mismo día: necesitaron seguimiento. Es Ingresos Tot. Jot menos Ingresos CRM día.",

  ingresosReales:
    "Ingresos JOT del rango, excluyendo Preservicio, Fin de gestión, Desiste de Servicio, Duplicado y Sin Asunto. Se acepta también la variante Desiste del Servicio. La etapa CRM no excluye ingresos JOT.",

  activaMes:
    "De las activadas en el rango, las que ADEMÁS se registraron en Jotform dentro del mismo rango: vendido y activado en el mismo mes.",

  backlog:
    "Ventas de meses ANTERIORES que recién se activaron este mes (arrastre). Activas Total menos Activas Mes.",

  activasTotal:
    "Todo lo que Netlife activó dentro del rango (fecha de activación), sin importar cuándo se registró la venta. No sumar con Backlog: ya lo incluye.",

  tasaInstalacion:
    "De cada 100 ventas registradas en Jotform, cuántas terminaron instaladas y activas.",

  tarjeta:
    "Qué porcentaje de las ventas (fecha JOT) se pagó con tarjeta de crédito.",

  terceraEdad:
    "Qué porcentaje de las ventas ACTIVAS aplicó descuento de tercera edad.",

  porRegularizar:
    "Ventas marcadas con estatus de regularización = POR REGULARIZAR, en el rango de fecha Jotform seleccionado.",

  planes150200:
    "Porcentaje de ventas que corresponden a los planes de 150/200. Pendiente de cálculo automático (ver docs/DICCIONARIO_INDICADORES.xlsx).",
};
