'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DESTINATARIOS_VENTA,
  crearNotificadorVenta,
} = require('../src/services/nuevaVentaCorreo.service');

const ventaCompleta = (overrides = {}) => ({
  id: 731,
  estatus_envio: 'PENDIENTE',
  fecha_registro_sistema: '2026-10-01T14:20:00.000Z',
  codigo_asesor: 'ASESOR-01',
  id_bitrix: 'BX-9001',
  nombre_cliente_completo: 'Ana <script>alert(1)</script>',
  numero_identificacion: '1712345678',
  email_cliente: 'ana@example.com',
  telf_celular_pin: '0991234567',
  provincia: 'Pichincha',
  ciudad: 'Quito',
  direccion_calles: 'Av. Siempre Viva',
  plan_contratado_final: 'Plan 500 Mbps',
  valor_pago: '31.50',
  foto_cedula_frontal: '/api/envios-ventas/archivo/1712345678/frontal.jpg',
  archivo_resumen: '/api/envios-ventas/archivo/1712345678/resumen.pdf',
  ...overrides,
});

function escenario({ venta = ventaCompleta(), buffers = {} } = {}) {
  const correos = [];
  const descargas = [];
  const pool = {
    query: async (sql, valores) => {
      assert.match(sql, /SELECT \* FROM public\.envios_ventas WHERE id = \$1/);
      assert.deepEqual(valores, [venta.id]);
      return { rows: [venta] };
    },
  };
  const obtenerArchivo = async (carpeta, archivo) => {
    descargas.push([carpeta, archivo]);
    const content = buffers[archivo] || Buffer.from(`contenido:${archivo}`);
    return {
      buffer: content,
      contentType: archivo.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
    };
  };
  const enviarCorreo = async (mensaje) => { correos.push(mensaje); return true; };
  const notificador = crearNotificadorVenta({
    pool, obtenerArchivo, enviarCorreo, logger: { error() {} },
  });
  return { notificador, correos, descargas };
}

test('un borrador no consulta datos, descarga archivos ni envía correo', async () => {
  let consultas = 0;
  const notificador = crearNotificadorVenta({
    pool: { query: async () => { consultas++; return { rows: [] }; } },
    obtenerArchivo: async () => { throw new Error('no debe descargar'); },
    enviarCorreo: async () => { throw new Error('no debe enviar'); },
  });

  const resultado = await notificador.notificarSiFinal({ id: 15, estatus_envio: 'BORRADOR' });

  assert.deepEqual(resultado, { aplica: false, enviado: false });
  assert.equal(consultas, 0);
});

test('un estado distinto de PENDIENTE no genera un respaldo nuevo', async () => {
  let consultas = 0;
  const notificador = crearNotificadorVenta({
    pool: { query: async () => { consultas++; return { rows: [] }; } },
    obtenerArchivo: async () => { throw new Error('no debe descargar'); },
    enviarCorreo: async () => { throw new Error('no debe enviar'); },
  });

  const resultado = await notificador.notificarSiFinal({ id: 15, estatus_envio: 'RECHAZADO' });

  assert.deepEqual(resultado, { aplica: false, enviado: false });
  assert.equal(consultas, 0);
});

test('una venta final envía el registro completo a los dos destinatarios con HTML escapado', async () => {
  const { notificador, correos, descargas } = escenario();

  const resultado = await notificador.notificarSiFinal({ id: 731, estatus_envio: 'PENDIENTE' });

  assert.equal(resultado.enviado, true);
  assert.equal(correos.length, 1);
  assert.deepEqual(correos[0].to, DESTINATARIOS_VENTA);
  assert.match(correos[0].subject, /Venta #731/);
  assert.match(correos[0].html, /Plan 500 Mbps/);
  assert.match(correos[0].html, /Ana &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(correos[0].html, /<script>alert/);
  assert.deepEqual(descargas, [
    ['1712345678', 'frontal.jpg'],
    ['1712345678', 'resumen.pdf'],
  ]);
  assert.deepEqual(correos[0].attachments.map((a) => [a.filename, a.contentType]), [
    ['cedula-frontal.jpg', 'image/jpeg'],
    ['resumen-firmado.pdf', 'application/pdf'],
  ]);
});

test('divide los adjuntos en correos numerados sin omitir archivos cuando el total es pesado', async () => {
  const sieteMb = Buffer.alloc(7 * 1024 * 1024, 1);
  const venta = ventaCompleta({
    foto_cedula_trasera: '/api/envios-ventas/archivo/1712345678/trasera.jpg',
  });
  const { notificador, correos } = escenario({
    venta,
    buffers: { 'frontal.jpg': sieteMb, 'trasera.jpg': sieteMb, 'resumen.pdf': sieteMb },
  });

  const resultado = await notificador.notificarSiFinal({ id: 731, estatus_envio: 'PENDIENTE' });

  assert.equal(resultado.enviado, true);
  assert.equal(correos.length, 2);
  assert.match(correos[0].subject, /parte 1 de 2/);
  assert.match(correos[1].subject, /parte 2 de 2/);
  assert.deepEqual(correos.flatMap((c) => c.attachments.map((a) => a.filename)).sort(), [
    'cedula-frontal.jpg', 'cedula-trasera.jpg', 'resumen-firmado.pdf',
  ]);
});

test('rechaza referencias de adjuntos que no pertenecen a la ruta privada esperada', async () => {
  const { notificador, correos } = escenario({
    venta: ventaCompleta({ foto_cedula_frontal: 'https://sitio-malicioso.example/cedula.jpg' }),
  });

  const resultado = await notificador.notificarSiFinal({ id: 731, estatus_envio: 'PENDIENTE' });

  assert.equal(resultado.enviado, false);
  assert.equal(resultado.codigo, 'CORREO_VENTA_ERROR');
  assert.equal(correos.length, 0);
});

test('un fallo SMTP no revierte la venta y devuelve un estado controlado', async () => {
  const venta = ventaCompleta({ foto_cedula_frontal: null, archivo_resumen: null });
  const notificador = crearNotificadorVenta({
    pool: { query: async () => ({ rows: [venta] }) },
    obtenerArchivo: async () => { throw new Error('no aplica'); },
    enviarCorreo: async () => { throw new Error('SMTP temporalmente no disponible'); },
    logger: { error() {} },
  });

  const resultado = await notificador.notificarSiFinal({ id: 731, estatus_envio: 'PENDIENTE' });

  assert.deepEqual(resultado, {
    aplica: true,
    enviado: false,
    codigo: 'CORREO_VENTA_ERROR',
  });
});
