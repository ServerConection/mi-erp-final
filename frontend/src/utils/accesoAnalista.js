export const RUTAS_ANALISTA = new Set([
  '/', '/indicadores', '/reporte-detalle-novonet', '/comparativa-supervisores',
  '/indicadores-velsa', '/indicadores-semillero', '/reporte-detalle-velsa',
  '/vista-asesor', '/vista-asesor-velsa', '/seguimiento-ventas', '/seguimiento-velsa',
  '/redes', '/redes-velsa', '/ventas', '/nueva-venta', '/vista-backoffice',
  '/gestionables-asesores', '/whatsapp/lineas', '/whatsapp/inbox',
  '/whatsapp/campanas', '/whatsapp/chatbots', '/whatsapp/contactos',
  '/whatsapp/respaldos', '/whatsapp/presentacion', '/whatsapp/control-lineas',
]);

export const rutaPermitidaAnalista = (ruta) => RUTAS_ANALISTA.has(ruta);
