export const RUTAS_WABOT_MASIVOS = new Set([
  '/whatsapp/lineas', '/whatsapp/inbox', '/whatsapp/campanas',
  '/whatsapp/chatbots', '/whatsapp/contactos', '/whatsapp/respaldos',
  '/whatsapp/presentacion', '/whatsapp/control-lineas',
]);

export const RUTAS_ANALISTA = new Set([
  '/', '/indicadores', '/reporte-detalle-novonet', '/comparativa-supervisores',
  '/indicadores-velsa', '/indicadores-semillero', '/reporte-detalle-velsa',
  '/vista-asesor', '/vista-asesor-velsa', '/seguimiento-ventas', '/seguimiento-velsa',
  '/redes', '/redes-velsa', '/ventas', '/nueva-venta', '/vista-backoffice',
  '/gestionables-asesores', ...RUTAS_WABOT_MASIVOS,
  '/archivos-compartidos',
]);

export const rutaPermitidaAnalista = (ruta) => RUTAS_ANALISTA.has(ruta);

export const rutaPermitidaAtc = (ruta) =>
  ruta === '/vista-backoffice' ||
  ruta === '/indicadores' ||
  ruta === '/reporte-detalle-novonet' ||
  ruta === '/comparativa-supervisores' ||
  ruta === '/indicadores-velsa' ||
  ruta === '/indicadores-semillero' ||
  ruta === '/reporte-detalle-velsa' ||
  RUTAS_WABOT_MASIVOS.has(ruta);
