import test from 'node:test';
import assert from 'node:assert/strict';
import { rutaPermitidaAnalista } from './accesoAnalista.js';

test('analista accede únicamente a la lista solicitada', () => {
  for (const ruta of ['/', '/indicadores', '/indicadores-velsa', '/vista-asesor', '/vista-asesor-velsa', '/seguimiento-ventas', '/seguimiento-velsa', '/redes', '/redes-velsa', '/ventas', '/nueva-venta', '/vista-backoffice', '/gestionables-asesores', '/whatsapp/inbox', '/whatsapp/control-lineas', '/archivos-compartidos']) assert.equal(rutaPermitidaAnalista(ruta), true, ruta);
  for (const ruta of ['/gestionables-velsa', '/llamadas', '/redes-wintracker', '/mis-ventas-pendientes', '/catalogo-planes', '/broadcast']) assert.equal(rutaPermitidaAnalista(ruta), false, ruta);
});
