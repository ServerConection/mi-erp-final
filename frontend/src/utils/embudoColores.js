// Colores SEMÁNTICOS del embudo de conversión por día (Novonet y Velsa).
// Antes el color de cada etapa dependía de su posición (mayor a menor total),
// así que cambiaba de un día a otro y no decía nada por sí solo. Ahora cada
// etapa tiene SIEMPRE el mismo color según lo que representa para el negocio,
// para que la barra de un día se lea de un vistazo:
//   · VENTA SUBIDA              → verde   (se ganó)
//   · ATC                       → rojo    (sin gestionar / en cola)
//   · etapas que ya no se negocian (se cerraron en contra) → naranja-rojizo
//   · el resto (en gestión / negociando)                   → amarillo
const normalizar = (etapa) => String(etapa ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toUpperCase();

// Etapas "muertas": la venta ya no se negocia, se cerró en contra.
// Tomadas de las mismas listas de negocio que ya usa el backend
// (shared/etapas.js: ETAPAS_NO_GESTIONABLES + ETAPAS_DESCARTE_SI), sin incluir
// ATC ni VENTA SUBIDA porque esas tienen su propio color fijo.
const ETAPAS_NO_NEGOCIABLES = [
  'DESCARTE',
  'FUERA DE COBERTURA',
  'INNEGOCIABLE',
  'ZONA PELIGROSA',
  'ZONAS PELIGROSAS',
  'DUPLICADO',
  'DUPLLICADO',
  'RECHAZADO',
  'DESISTE DEL SERVICIO',
  'DESISTE DE SERVICIO',
  'DESISTE DE COMPRA',
  'NO VOLVER A CONTACTAR',
  'OTRO PROVEEDOR',
  'MANTIENE PROVEEDOR',
  'NO INTERESA COSTO PLAN',
  'NO INTERESA COSTO INSTALACION',
];

export const COLOR_EMBUDO_VENTA_SUBIDA  = '#10b981'; // verde
export const COLOR_EMBUDO_ATC           = '#ef4444'; // rojo
export const COLOR_EMBUDO_NO_NEGOCIABLE = '#f97316'; // naranja-rojizo ("pilas")
export const COLOR_EMBUDO_NEGOCIABLE    = '#fbbf24'; // amarillo

export const colorEtapaEmbudo = (etapa) => {
  const e = normalizar(etapa);
  if (e === 'VENTA SUBIDA') return COLOR_EMBUDO_VENTA_SUBIDA;
  if (e === 'ATC' || e === 'ATC/SOPORTE' || e === 'ATC SOPORTE') return COLOR_EMBUDO_ATC;
  if (ETAPAS_NO_NEGOCIABLES.includes(e)) return COLOR_EMBUDO_NO_NEGOCIABLE;
  return COLOR_EMBUDO_NEGOCIABLE;
};
