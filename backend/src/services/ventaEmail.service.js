const { send } = require('./email.service');

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

/**
 * Notifica a ATC cuando una venta pasa a PENDIENTE.
 * No se adjuntan documentos del cliente: permanecen protegidos en el storage
 * del ERP y se consultan desde Backoffice con una sesión autorizada.
 */
async function notificarNuevaVenta(venta, usuario = {}) {
  const datos = [
    ['Registro ERP', venta.id],
    ['ID Bitrix', venta.id_bitrix],
    ['Código asesor', venta.codigo_asesor],
    ['Asesor que registró', usuario.usuario || usuario.nombre],
    ['Cliente', venta.nombre_cliente_completo],
    ['Plan', venta.plan_contratado_final],
    ['Origen', venta.origen_venta],
    ['Distribuidor', venta.distribuidor_autorizado],
    ['Supervisor', venta.supervisor],
    ['Fecha de registro', venta.fecha_registro_sistema
      ? new Date(venta.fecha_registro_sistema).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })
      : new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })],
  ].filter(([, valor]) => valor !== null && valor !== undefined && String(valor).trim() !== '');

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
            <p style="margin:0 0 18px;color:#334155;font-size:14px;line-height:1.6;">Se registró una nueva venta y ya está disponible para revisión en Backoffice.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;border-collapse:separate;border-spacing:0;">${filas}</table>
            <p style="margin:18px 0 0;color:#94a3b8;font-size:11px;line-height:1.5;">Por protección de datos, los documentos y datos de contacto deben consultarse directamente dentro del ERP.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;

  const to = destinatarios();
  await send({
    to,
    subject: `Nueva venta ERP #${venta.id}${venta.id_bitrix ? ` · Bitrix ${venta.id_bitrix}` : ''}`,
    body: `Se registró una nueva venta.\n\n${datos.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nLos documentos y datos de contacto se consultan en Backoffice.`,
    html,
  });

  return { enviado: true, destinatarios: to };
}

module.exports = { notificarNuevaVenta, DESTINATARIOS_PREDETERMINADOS };
