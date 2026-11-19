'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const ruta = (relativa) => require.resolve(path.resolve(__dirname, relativa));
const routePath = ruta('../src/routes/envios-ventas.routes');
const dbPath = ruta('../src/config/db');
const authPath = ruta('../src/middleware/auth');
const storagePath = ruta('../src/utils/storageClient');
const signaturePath = ruta('../src/utils/fileSignature');
const rateLimitPath = ruta('../src/utils/rateLimit');
const correoPath = ruta('../src/services/nuevaVentaCorreo.service');

function reemplazarModulo(modulo, exports) {
  require.cache[modulo] = { id: modulo, filename: modulo, loaded: true, exports };
}

async function levantarEscenario() {
  const notificaciones = [];
  reemplazarModulo(dbPath, {
    query: async (sql, valores = []) => {
      if (/INSERT INTO public\.envios_ventas/.test(sql)) {
        return { rows: [{ id: 901, estatus_envio: valores[0], codigo_asesor: 'ASESOR-01' }] };
      }
      if (/SELECT id, usuario_id, estatus_envio/.test(sql)) {
        return { rows: [{ id: Number(valores[0]), usuario_id: 77, estatus_envio: 'BORRADOR' }] };
      }
      if (/UPDATE public\.envios_ventas/.test(sql)) {
        return { rows: [{ id: Number(valores[0]), estatus_envio: 'PENDIENTE', codigo_asesor: 'ASESOR-01' }] };
      }
      return { rows: [] };
    },
  });
  reemplazarModulo(authPath, {
    verificarToken(req, _res, next) {
      req.user = { id: 77, usuario: 'asesor.prueba', nombre: 'Asesor Prueba', perfil: 'ASESOR' };
      next();
    },
    noAsesor(_req, _res, next) { next(); },
  });
  reemplazarModulo(storagePath, {
    subirArchivo: async () => ({}), obtenerArchivo: async () => ({ buffer: Buffer.alloc(0) }),
    rutaInterna: (a, b) => `${a}/${b}`, configurado: () => true, estado: async () => ({ arriba: true }),
  });
  reemplazarModulo(signaturePath, { validarArchivo: () => ({ ok: true }), mimeSeguroPorExtension: () => 'image/jpeg' });
  reemplazarModulo(rateLimitPath, { crearRateLimit: () => (_req, _res, next) => next() });
  reemplazarModulo(correoPath, {
    notificarVentaSiFinal: async (registro) => {
      notificaciones.push({ ...registro });
      return registro.estatus_envio === 'BORRADOR'
        ? { aplica: false, enviado: false }
        : { aplica: true, enviado: true, partes: 1 };
    },
  });
  delete require.cache[routePath];

  const app = express();
  app.use(express.json());
  app.use('/api/envios-ventas', require(routePath));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    notificaciones,
    pedir: (pathname, options) => fetch(`http://127.0.0.1:${port}${pathname}`, options),
    cerrar: async () => {
      await new Promise((resolve) => server.close(resolve));
      for (const p of [routePath, dbPath, authPath, storagePath, signaturePath, rateLimitPath, correoPath]) delete require.cache[p];
    },
  };
}

const cuerpoBase = { origen_venta: 'REDES', venta_nueva_o_reingreso: 'NUEVA' };

test('POST CARGAR envía el correo después de registrar la venta', async () => {
  const e = await levantarEscenario();
  try {
    const respuesta = await e.pedir('/api/envios-ventas', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...cuerpoBase, accion: 'CARGAR' }),
    });
    const body = await respuesta.json();
    assert.equal(respuesta.status, 201);
    assert.deepEqual(e.notificaciones, [{ id: 901, estatus_envio: 'PENDIENTE', codigo_asesor: 'ASESOR-01' }]);
    assert.equal(body.correo_respaldo.enviado, true);
  } finally { await e.cerrar(); }
});

test('POST BORRADOR no envía correo', async () => {
  const e = await levantarEscenario();
  try {
    const respuesta = await e.pedir('/api/envios-ventas', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accion: 'BORRADOR' }),
    });
    assert.equal(respuesta.status, 201);
    assert.deepEqual(e.notificaciones, []);
  } finally { await e.cerrar(); }
});

test('PUT que finaliza un borrador envía el correo', async () => {
  const e = await levantarEscenario();
  try {
    const respuesta = await e.pedir('/api/envios-ventas/44', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...cuerpoBase, accion: 'CARGAR' }),
    });
    const body = await respuesta.json();
    assert.equal(respuesta.status, 200);
    assert.deepEqual(e.notificaciones, [{ id: 44, estatus_envio: 'PENDIENTE', codigo_asesor: 'ASESOR-01' }]);
    assert.equal(body.correo_respaldo.enviado, true);
  } finally { await e.cerrar(); }
});
