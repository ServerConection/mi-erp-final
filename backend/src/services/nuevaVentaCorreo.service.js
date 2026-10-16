'use strict';

const DESTINATARIOS_VENTA = Object.freeze(['novonetatc1@gmail.com', 'uio.novonet1@gmail.com']);
const CAMPOS_ADJUNTOS = Object.freeze([
  ['foto_cedula_frontal', 'cedula-frontal'], ['foto_cedula_trasera', 'cedula-trasera'],
  ['foto_carnet', 'carnet'], ['archivo_resumen', 'resumen-firmado'],
  ['archivo_planilla', 'planilla'], ['archivo_nombramiento', 'nombramiento'],
  ['archivo_registro_mercantil', 'registro-mercantil'], ['archivo_ruc', 'ruc'],
]);
const MAX_BYTES_POR_CORREO = 18 * 1024 * 1024;
const RUTA_ARCHIVO = /^\/api\/envios-ventas\/archivo\/([A-Za-z0-9._-]{1,200})\/([A-Za-z0-9._-]{1,200})$/;
const MIMES_PERMITIDOS = Object.freeze({
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf',
});
const ETIQUETAS = Object.freeze({
  id: 'Número interno', estatus_envio: 'Estado', fecha_registro_sistema: 'Fecha de registro',
  fecha_ingreso_telcos: 'Fecha de ingreso Telcos', usuario_id: 'Usuario interno', ip_origen: 'IP de origen',
  codigo_asesor: 'Código de asesor', id_bitrix: 'ID Bitrix', distribuidor_autorizado: 'Distribuidor autorizado',
  supervisor: 'Supervisor', origen_venta: 'Origen de venta', venta_nueva_o_reingreso: 'Tipo de venta',
  nombre_atc: 'Nombre ATC', lider_comercial: 'Líder comercial', tipo_cliente: 'Tipo de cliente',
  genero_cliente: 'Género', tipo_documento: 'Tipo de documento', numero_identificacion: 'Identificación',
  nombre_cliente_completo: 'Cliente', representante_legal: 'Representante legal', estado_civil: 'Estado civil',
  fecha_nacimiento: 'Fecha de nacimiento', email_cliente: 'Correo del cliente',
  aplica_descuento_3ra_edad: 'Descuento tercera edad', telf_celular_pin: 'Celular principal',
  telf_celular_2: 'Celular secundario', telf_fijo: 'Teléfono fijo', provincia: 'Provincia', ciudad: 'Ciudad',
  parroquia_barrio: 'Parroquia / barrio', direccion_calles: 'Calles', direccion_manzana_villa: 'Manzana / villa',
  referencia_ubicacion: 'Referencia', coordenadas_gps: 'Coordenadas GPS', tipo_vivienda: 'Tipo de vivienda',
  regimen_vivienda: 'Régimen de vivienda', plan_contratado_final: 'Plan contratado',
  servicios_digitales: 'Servicios digitales', forma_pago: 'Forma de pago', detalle_bancario_ahorros: 'Detalle bancario',
  valor_pago: 'Valor de pago', tipo_contrato: 'Tipo de contrato', links_documentos: 'Enlaces de documentos',
  banco: 'Banco', tipo_cuenta: 'Tipo de cuenta', ciclo_facturacion: 'Ciclo de facturación',
  costo_instalacion: 'Costo de instalación', descuento_instalacion: 'Descuento de instalación',
  beneficios_adicionales: 'Beneficios adicionales', beneficios_de_ley: 'Beneficios de ley',
  plazo_contrato_meses: 'Plazo del contrato', resumen_venta: 'Resumen de venta',
});

function escaparHtml(valor) {
  return String(valor ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function etiqueta(campo) {
  return ETIQUETAS[campo] || campo.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
function valorVisible(valor) {
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}
function datosRegistrados(venta) {
  const adjuntos = new Set(CAMPOS_ADJUNTOS.map(([campo]) => campo));
  return Object.entries(venta)
    .filter(([campo, valor]) => !adjuntos.has(campo) && valor !== null && valor !== undefined && String(valor).trim() !== '')
    .map(([campo, valor]) => [etiqueta(campo), valorVisible(valor)]);
}
function crearContenido(venta, parte, totalPartes) {
  const datos = datosRegistrados(venta);
  const filas = datos.map(([nombre, valor], i) => `<tr><td style="padding:11px 14px;background:${i % 2 ? '#ffffff' : '#f8fafc'};border-bottom:1px solid #e2e8f0;color:#64748b;font-size:12px;font-weight:700;width:38%;vertical-align:top;">${escaparHtml(nombre)}</td><td style="padding:11px 14px;background:${i % 2 ? '#ffffff' : '#f8fafc'};border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;word-break:break-word;">${escaparHtml(valor)}</td></tr>`).join('');
  const sufijoParte = totalPartes > 1 ? ` · Documentos ${parte} de ${totalPartes}` : '';
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#eef2f7;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 10px;background:#eef2f7;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:720px;background:#ffffff;border-radius:18px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;box-shadow:0 8px 30px rgba(15,23,42,.10);"><tr><td style="padding:30px 34px;background:#1A3A6E;color:#ffffff;"><div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#a5c3ee;font-weight:700;">ERP Novonet</div><div style="margin-top:7px;font-size:25px;font-weight:800;">Nueva venta registrada</div><div style="margin-top:8px;font-size:13px;color:#dbeafe;">Respaldo automático de la venta #${escaparHtml(venta.id)}${escaparHtml(sufijoParte)}</div></td></tr><tr><td style="padding:28px 34px;"><div style="padding:14px 16px;margin-bottom:22px;border:1px solid #a7f3d0;border-radius:10px;background:#ecfdf5;color:#166534;font-size:13px;line-height:1.55;">La venta quedó registrada correctamente. Este mensaje contiene los datos guardados y sus documentos de respaldo.</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;border-collapse:separate;border-spacing:0;">${filas}</table><p style="margin:20px 0 0;color:#64748b;font-size:12px;line-height:1.6;">Los documentos se incluyen como adjuntos. Por contener información personal, conserva este correo únicamente en cuentas autorizadas.</p></td></tr><tr><td style="padding:16px 34px;text-align:center;background:#0f172a;color:#cbd5e1;font-size:11px;">Mensaje automático · Sistema ERP</td></tr></table></td></tr></table></body></html>`;
  const texto = [`NUEVA VENTA REGISTRADA #${venta.id}${sufijoParte}`, '', ...datos.map(([k, v]) => `${k}: ${v}`), '', 'Los documentos de respaldo se incluyen como adjuntos.'].join('\n');
  return { html, texto };
}
function referenciaSegura(ruta) {
  const coincidencia = RUTA_ARCHIVO.exec(String(ruta || ''));
  if (!coincidencia || coincidencia[1].includes('..') || coincidencia[2].includes('..')) throw new Error('Referencia de adjunto inválida');
  const archivo = coincidencia[2];
  const punto = archivo.lastIndexOf('.');
  const extension = punto >= 0 ? archivo.slice(punto).toLowerCase() : '';
  const contentType = MIMES_PERMITIDOS[extension];
  if (!contentType) throw new Error('Tipo de adjunto no permitido');
  return { carpeta: coincidencia[1], archivo, extension, contentType };
}
function dividirAdjuntos(adjuntos) {
  if (adjuntos.length === 0) return [[]];
  const grupos = []; let grupo = []; let bytes = 0;
  for (const adjunto of adjuntos) {
    if (grupo.length > 0 && bytes + adjunto.content.length > MAX_BYTES_POR_CORREO) {
      grupos.push(grupo); grupo = []; bytes = 0;
    }
    grupo.push(adjunto); bytes += adjunto.content.length;
  }
  if (grupo.length) grupos.push(grupo);
  return grupos;
}
function crearNotificadorVenta({ pool, obtenerArchivo, enviarCorreo, logger = console }) {
  if (!pool?.query || typeof obtenerArchivo !== 'function' || typeof enviarCorreo !== 'function') throw new TypeError('Dependencias incompletas para el notificador de ventas');
  async function notificar(id) {
    const { rows } = await pool.query('SELECT * FROM public.envios_ventas WHERE id = $1', [id]);
    if (rows.length !== 1) throw new Error('Venta no encontrada para notificación');
    const venta = rows[0]; const adjuntos = [];
    for (const [campo, nombreBase] of CAMPOS_ADJUNTOS) {
      if (!venta[campo]) continue;
      const ref = referenciaSegura(venta[campo]);
      const { buffer } = await obtenerArchivo(ref.carpeta, ref.archivo);
      if (!Buffer.isBuffer(buffer)) throw new Error('El almacenamiento devolvió un adjunto inválido');
      adjuntos.push({ filename: `${nombreBase}${ref.extension}`, content: buffer, contentType: ref.contentType, contentDisposition: 'attachment' });
    }
    const grupos = dividirAdjuntos(adjuntos);
    for (let i = 0; i < grupos.length; i++) {
      const parte = i + 1; const total = grupos.length; const { html, texto } = crearContenido(venta, parte, total);
      await enviarCorreo({ to: DESTINATARIOS_VENTA, subject: `Respaldo ERP · Venta #${venta.id}${total > 1 ? ` · parte ${parte} de ${total}` : ''}`, body: texto, html, attachments: grupos[i] });
    }
    return { aplica: true, enviado: true, partes: grupos.length };
  }
  async function notificarSiFinal(registro) {
    if (registro?.estatus_envio !== 'PENDIENTE') return { aplica: false, enviado: false };
    try { return await notificar(registro?.id); }
    catch (error) {
      logger.error('[CORREO-VENTA] No se pudo enviar el respaldo', { ventaId: registro?.id, mensaje: error?.message });
      return { aplica: true, enviado: false, codigo: 'CORREO_VENTA_ERROR' };
    }
  }
  return { notificarSiFinal };
}

let notificadorPredeterminado;
function notificarVentaSiFinal(registro) {
  if (!notificadorPredeterminado) {
    const pool = require('../config/db');
    const { obtenerArchivo } = require('../utils/storageClient');
    const { send } = require('./email.service');
    notificadorPredeterminado = crearNotificadorVenta({ pool, obtenerArchivo, enviarCorreo: send });
  }
  return notificadorPredeterminado.notificarSiFinal(registro);
}

module.exports = { DESTINATARIOS_VENTA, crearNotificadorVenta, notificarVentaSiFinal };
