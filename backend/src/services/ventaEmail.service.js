const { send } = require('./email.service');
const { obtenerArchivo } = require('../utils/storageClient');

const DESTINATARIOS_PREDETERMINADOS = [
  'novonetatc1@gmail.com',
  'info.novonet1@gmail.com',
];

const escaparHtml = (valor) => String(valor ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const destinatarios = () => {
  const configurados = String(process.env.VENTAS_NOTIFICATION_EMAILS || '')
    .split(',')
    .map(correo => correo.trim().toLowerCase())
    .filter(Boolean);
  return configurados.length ? configurados : DESTINATARIOS_PREDETERMINADOS;
};

const CAMPOS_ARCHIVO = {
  foto_cedula_frontal: 'Cédula frontal',
  foto_cedula_trasera: 'Cédula trasera',
  foto_carnet: 'Carnet',
  archivo_resumen: 'Resumen de venta',
  archivo_planilla: 'Planilla',
  archivo_nombramiento: 'Nombramiento',
  archivo_registro_mercantil: 'Registro mercantil',
  archivo_ruc: 'RUC',
};

// Son los campos que NuevaVenta envía y envios_ventas conserva. Se enumeran
// explícitamente para no incluir hashes, IP u otras columnas internas futuras.
const CAMPOS_FORMULARIO = [
  'usuario', 'codigo_asesor', 'id_bitrix', 'distribuidor_autorizado', 'supervisor',
  'origen_venta', 'venta_nueva_o_reingreso', 'turno', 'nombre_atc', 'clausulas',
  'lider_comercial', 'tipo_cliente', 'genero_cliente', 'tipo_documento',
  'numero_identificacion', 'nombre_cliente_completo', 'representante_legal',
  'estado_civil', 'fecha_nacimiento', 'email_cliente', 'aplica_descuento_3ra_edad',
  'telf_celular_pin', 'telf_celular_2', 'telf_fijo', 'provincia', 'ciudad',
  'parroquia_barrio', 'direccion_calles', 'direccion_manzana_villa',
  'referencia_ubicacion', 'coordenadas_gps', 'tipo_vivienda', 'regimen_vivienda',
  'plan_contratado_final', 'plan_contratado', 'velocidad_plan', 'servicios_digitales',
  'forma_pago', 'detalle_bancario_ahorros', 'valor_pago', 'tipo_contrato',
  'links_documentos', 'banco', 'tipo_cuenta', 'ciclo_facturacion',
  'costo_instalacion', 'descuento_instalacion', 'beneficios_adicionales',
  'beneficios_de_ley', 'plazo_contrato_meses', 'resumen_venta', 'novedades_atc',
];

const etiquetaCampo = (campo) => campo.replace(/_/g, ' ').replace(/\b\w/g, letra => letra.toUpperCase());

const extraerRutaArchivo = (valor) => {
  const texto = String(valor || '').trim().replace(/\\/g, '/');
  if (!texto) return null;
  const marcador = '/api/envios-ventas/archivo/';
  const ruta = texto.includes(marcador) ? texto.split(marcador).pop() : texto.replace(/^\/+/, '');
  const partes = ruta.split(/[?#]/)[0].split('/').map(decodeURIComponent).filter(Boolean);
  if (partes.length !== 2 || partes.some(p => p === '..' || p.includes('/'))) return null;
  return { carpeta: partes[0], archivo: partes[1] };
};

async function cargarAdjuntos(venta) {
  const solicitudes = Object.entries(CAMPOS_ARCHIVO)
    .filter(([campo]) => String(venta[campo] || '').trim())
    .map(async ([campo, etiqueta]) => {
      const ruta = extraerRutaArchivo(venta[campo]);
      if (!ruta) throw new Error(`${etiqueta}: ruta inválida`);
      const { buffer, contentType } = await obtenerArchivo(ruta.carpeta, ruta.archivo);
      const punto = ruta.archivo.lastIndexOf('.');
      const extension = punto >= 0 ? ruta.archivo.slice(punto).toLowerCase() : '';
      return {
        campo,
        etiqueta,
        adjunto: {
          filename: `${campo}${extension || ''}`,
          content: buffer,
          contentType,
        },
      };
    });

  const resultados = await Promise.allSettled(solicitudes);
  return {
    adjuntos: resultados.filter(r => r.status === 'fulfilled').map(r => r.value.adjunto),
    adjuntados: resultados.filter(r => r.status === 'fulfilled').map(r => r.value.campo),
    errores: resultados.filter(r => r.status === 'rejected').map(r => r.reason?.message || 'No se pudo recuperar un archivo'),
  };
}

// Gmail cuenta el contenido base64 dentro de su límite de 25 MB. Mantener cada
// lote por debajo de 16 MB deja margen para esa expansión y para el HTML.
function agruparAdjuntos(adjuntos, maxBytes = 16 * 1024 * 1024) {
  if (!adjuntos.length) return [[]];
  const lotes = [];
  let lote = [];
  let bytes = 0;
  for (const adjunto of adjuntos) {
    const tamano = Buffer.isBuffer(adjunto.content) ? adjunto.content.length : 0;
    if (lote.length && bytes + tamano > maxBytes) {
      lotes.push(lote);
      lote = [];
      bytes = 0;
    }
    lote.push(adjunto);
    bytes += tamano;
  }
  if (lote.length) lotes.push(lote);
  return lotes;
}

/**
 * Notifica a ATC cuando una venta pasa a PENDIENTE.
 * No se adjuntan documentos del cliente: permanecen protegidos en el storage
 * del ERP y se consultan desde Backoffice con una sesión autorizada.
 */
async function notificarNuevaVenta(venta, usuario = {}) {
  const archivos = await cargarAdjuntos(venta);
  const datos = [
    ['Registro ERP', venta.id],
    ['Fecha de registro', venta.fecha_registro_sistema
      ? new Date(venta.fecha_registro_sistema).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })
      : new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })],
    ...CAMPOS_FORMULARIO.map(campo => [etiquetaCampo(campo), venta[campo]]),
    ...Object.entries(CAMPOS_ARCHIVO).map(([campo, etiqueta]) => [
      etiqueta,
      !venta[campo] ? 'No cargado' : archivos.adjuntados.includes(campo) ? 'Adjunto al correo' : 'No se pudo adjuntar',
    ]),
  ];

  const filas = datos.map(([etiqueta, valor], indice) => `
    <tr>
      <td style="padding:10px 13px;background:${indice % 2 ? '#ffffff' : '#f8fafc'};color:#64748b;font-size:12px;font-weight:bold;border-bottom:1px solid #e2e8f0;width:38%;">${escaparHtml(etiqueta)}</td>
      <td style="padding:10px 13px;background:${indice % 2 ? '#ffffff' : '#f8fafc'};color:#0f172a;font-size:13px;border-bottom:1px solid #e2e8f0;">${escaparHtml(valor)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
  <html lang="es"><head><meta charset="UTF-8"></head>
  <body style="margin:0;padding:0;background:#eef2f7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;background:#eef2f7;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;box-shadow:0 8px 24px rgba(15,23,42,.10);">
          <tr><td style="padding:25px 30px;background:#1A3A6E;color:#fff;">
            <div style="font-size:21px;font-weight:bold;">Nueva venta registrada</div>
            <div style="margin-top:5px;color:#bfdbfe;font-size:12px;">Novo ERP · Formulario de ventas</div>
          </td></tr>
          <tr><td style="padding:28px 30px;">
            <p style="margin:0 0 18px;color:#334155;font-size:14px;line-height:1.6;">Se registró una nueva venta. Este correo incluye todos los campos del formulario y los documentos cargados.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;border-collapse:separate;border-spacing:0;">${filas}</table>
            ${archivos.errores.length ? `<p style="margin:18px 0 0;color:#92400e;background:#fffbeb;border:1px solid #fde68a;padding:10px;border-radius:8px;font-size:11px;">Algunos archivos no pudieron recuperarse: ${escaparHtml(archivos.errores.join(' · '))}</p>` : ''}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;

  const to = destinatarios();
  const lotes = agruparAdjuntos(archivos.adjuntos);
  for (let indice = 0; indice < lotes.length; indice += 1) {
    const parte = lotes.length > 1 ? ` · Archivos ${indice + 1}/${lotes.length}` : '';
    await send({
      to,
      subject: `Nueva venta ERP #${venta.id}${venta.id_bitrix ? ` · Bitrix ${venta.id_bitrix}` : ''}${parte}`,
      body: `Se registró una nueva venta.\n\n${datos.map(([k, v]) => `${k}: ${v ?? ''}`).join('\n')}${parte}`,
      html,
      attachments: lotes[indice],
    });
  }

  return { enviado: true, destinatarios: to, adjuntos: archivos.adjuntos.length, correos: lotes.length, errores_adjuntos: archivos.errores };
}

module.exports = { notificarNuevaVenta, DESTINATARIOS_PREDETERMINADOS };
