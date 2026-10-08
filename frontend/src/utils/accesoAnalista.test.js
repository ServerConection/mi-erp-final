import test from 'node:test';
import assert from 'node:assert/strict';
import { rutaPermitidaAnalista, rutaPermitidaAtc } from './accesoAnalista.js';

test('analista accede únicamente a la lista solicitada', () => {
  for (const ruta of ['/', '/indicadores', '/indicadores-velsa', '/vista-asesor', '/vista-asesor-velsa', '/seguimiento-ventas', '/seguimiento-velsa', '/redes', '/redes-velsa', '/ventas', '/nueva-venta', '/vista-backoffice', '/gestionables-asesores', '/whatsapp/inbox', '/whatsapp/control-lineas', '/archivos-compartidos']) assert.equal(rutaPermitidaAnalista(ruta), true, ruta);
  for (const ruta of ['/gestionables-velsa', '/llamadas', '/redes-wintracker', '/mis-ventas-pendientes', '/catalogo-planes', '/broadcast']) assert.equal(rutaPermitidaAnalista(ruta), false, ruta);
});

test('ATC conserva sus módulos y accede a todo WaBot Masivos', () => {
  for (const ruta of ['/indicadores', '/indicadores-velsa', '/vista-backoffice', '/whatsapp/lineas', '/whatsapp/inbox', '/whatsapp/campanas', '/whatsapp/chatbots', '/whatsapp/contactos', '/whatsapp/respaldos', '/whatsapp/presentacion', '/whatsapp/control-lineas']) {
    assert.equal(rutaPermitidaAtc(ruta), true, ruta);
  }
  for (const ruta of ['/gestionables-asesores', '/gestionables-velsa', '/redes', '/ventas', '/archivos-compartidos']) {
    assert.equal(rutaPermitidaAtc(ruta), false, ruta);
  }
});
