const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

/**
 * Plantilla del correo con el código de acceso.
 *
 * Está armada con tablas y estilos en línea a propósito: los clientes de correo
 * (sobre todo Outlook) no soportan flexbox, grid ni hojas de estilo externas.
 * Lo que aquí se ve bien, allá también.
 */
function plantillaOTP(otp, nombre) {
  const saludo = nombre ? `Hola, ${nombre}` : 'Hola';
  const digitos = String(otp).split('').map(d =>
    `<td style="padding:0 4px;">
       <div style="width:42px;height:54px;line-height:54px;background:#ffffff;border:2px solid #e2e8f0;
                   border-radius:10px;font-family:'Courier New',monospace;font-size:26px;font-weight:bold;
                   color:#1A3A6E;text-align:center;">${d}</div>
     </td>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px;">
    <tr><td align="center">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;
                    box-shadow:0 4px 16px rgba(15,37,71,.08);font-family:Arial,Helvetica,sans-serif;">

        <!-- Cabecera -->
        <tr>
          <td style="background:#1A3A6E;padding:28px 32px;text-align:center;">
            <div style="color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:.5px;">ERP</div>
            <div style="color:#a5c3ee;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">
              Acceso seguro
            </div>
          </td>
        </tr>

        <!-- Cuerpo -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 6px;font-size:17px;color:#1e293b;font-weight:bold;">${saludo} 👋</p>
            <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.6;">
              Estás a un paso de entrar. Usa este código para confirmar que eres tú:
            </p>

            <!-- Código -->
            <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 20px;">
              <tr>${digitos}</tr>
            </table>

            <p style="margin:0 0 24px;text-align:center;font-size:13px;color:#b45309;
                      background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;">
              ⏱️ Vence en <b>10 minutos</b>
            </p>

            <p style="margin:0;font-size:12.5px;color:#94a3b8;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:18px;">
              ¿No fuiste tú? Ignora este mensaje: sin el código nadie puede entrar a tu cuenta.
              Si esto se repite, avisa al área de sistemas.
            </p>
          </td>
        </tr>

        <!-- Pie -->
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">
              Mensaje automático · No respondas a este correo
            </p>
          </td>
        </tr>

      </table>

    </td></tr>
  </table>
</body>
</html>`;
}

async function enviarOTP(correo, otp, nombre) {
  try {
    const textoPlano =
      `${nombre ? 'Hola, ' + nombre : 'Hola'}\n\n` +
      `Tu código de acceso al ERP es: ${otp}\n\n` +
      `Vence en 10 minutos.\n\n` +
      `Si no fuiste tú, ignora este mensaje.`;

    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: correo,
      subject: `${otp} es tu código de acceso al ERP`,
      text: textoPlano,
      html: plantillaOTP(otp, nombre),
    });

    console.log('EMAIL OTP enviado:', info.messageId);
    return true;

  } catch (error) {
    console.error('ERROR EMAIL OTP:', error.message);
    throw new Error('Error enviando correo');
  }
}

const CORREO_COPIA_WELCOME = 'kchala@novonetmail.com';

const escaparHtml = (valor) => String(valor ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const esCorreoValido = (correo) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(correo || '').trim());

/**
 * Envía el mensaje de bienvenida cuando Welcome cambia a NOTIFICADO.
 * El cliente es el destinatario principal y Backoffice recibe siempre copia.
 */
async function enviarBienvenidaWelcome(registro) {
  const correoCliente = String(registro?.email_cliente || '').trim().toLowerCase();
  const tieneCorreoCliente = esCorreoValido(correoCliente);
  const nombreCompleto = String(registro?.nombre_cliente_completo || '').trim() || 'Cliente';
  const primerNombre = nombreCompleto.split(/\s+/)[0];
  const identificacion = String(registro?.numero_identificacion || '').replace(/\s/g, '');
  const identificacionProtegida = identificacion
    ? `${'*'.repeat(Math.max(0, identificacion.length - 4))}${identificacion.slice(-4)}`
    : 'No registrada';

  const datos = [
    ['Plan contratado', registro?.plan_contratado_final],
    ['Servicios adicionales', registro?.servicios_digitales],
    ['Login Netlife', registro?.netlife_login],
    ['Fecha de activación', registro?.fecha_activacion_netlife ? String(registro.fecha_activacion_netlife).slice(0, 10) : ''],
    ['Ciudad', registro?.ciudad],
    ['Asesor', registro?.codigo_asesor],
    ['Identificación', identificacionProtegida],
  ].filter(([, valor]) => String(valor || '').trim());

  const filasHtml = datos.map(([etiqueta, valor], indice) => `
    <tr>
      <td style="padding:12px 14px;background:${indice % 2 ? '#ffffff' : '#f8fafc'};color:#64748b;font-size:12px;font-weight:bold;width:42%;border-bottom:1px solid #e2e8f0;">${escaparHtml(etiqueta)}</td>
      <td style="padding:12px 14px;background:${indice % 2 ? '#ffffff' : '#f8fafc'};color:#0f172a;font-size:13px;border-bottom:1px solid #e2e8f0;">${escaparHtml(valor)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef2f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:30px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,.10);font-family:Arial,Helvetica,sans-serif;">
        <tr><td style="padding:34px 36px;text-align:center;background:linear-gradient(135deg,#0369a1,#0ea5e9);">
          <div style="font-size:28px;line-height:1;color:#ffffff;font-weight:800;">¡Bienvenido/a!</div>
          <div style="margin-top:10px;color:#e0f2fe;font-size:14px;">Tu servicio ya se encuentra activo</div>
        </td></tr>
        <tr><td style="padding:32px 36px;">
          <p style="margin:0 0 12px;color:#0f172a;font-size:18px;font-weight:bold;">Hola, ${escaparHtml(primerNombre)} 👋</p>
          <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.7;">Nos alegra darte la bienvenida. A continuación encontrarás un resumen de los datos importantes de tu servicio.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;border-collapse:separate;border-spacing:0;">
            ${filasHtml}
          </table>
          <div style="margin-top:24px;padding:16px 18px;border-radius:12px;background:#ecfdf5;border:1px solid #a7f3d0;color:#166534;font-size:13px;line-height:1.6;">Gracias por confiar en nosotros. Conserva este correo como referencia de tu activación.</div>
          <p style="margin:22px 0 0;color:#94a3b8;font-size:11px;line-height:1.5;">Por seguridad, tu identificación se muestra parcialmente oculta. Este es un mensaje automático generado al completar tu proceso de Welcome.</p>
        </td></tr>
        <tr><td style="padding:17px 36px;text-align:center;background:#0f172a;color:#cbd5e1;font-size:11px;">Sistema ERP · Mensaje automático</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const destinatario = tieneCorreoCliente ? correoCliente : CORREO_COPIA_WELCOME;
  const copia = tieneCorreoCliente && correoCliente !== CORREO_COPIA_WELCOME
    ? CORREO_COPIA_WELCOME
    : undefined;
  const texto = `Hola, ${primerNombre}. Tu servicio ya se encuentra activo.\n\n${datos.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nGracias por confiar en nosotros.`;

  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
    to: destinatario,
    cc: copia,
    subject: `¡Bienvenido/a! Tu servicio ya está activo`,
    text: texto,
    html,
  });

  console.log('EMAIL Welcome enviado:', info.messageId, '→', destinatario, copia ? `(cc: ${copia})` : '');
  return { enviado: true, cliente: tieneCorreoCliente, destinatario, copia: copia || null };
}

// Envío genérico — usado por FlowEngine (emailNode) y por Evaluaciones
// (resultado + certificado). `attachments` sigue el formato de nodemailer:
// [{ filename, content, contentType }]. Opcional — nadie más lo manda hoy,
// así que no cambia el comportamiento de los llamadores existentes.
async function send({ to, subject, body, html, attachments }) {
  if (!to) throw new Error('email.send: destinatario requerido');
  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
    to,
    subject: subject || '(sin asunto)',
    text: body || '',
    html: html || undefined,
    attachments: Array.isArray(attachments) && attachments.length > 0 ? attachments : undefined,
  });
  console.log('EMAIL enviado:', info.messageId, '→', to);
  return true;
}

module.exports = { enviarOTP, enviarBienvenidaWelcome, send };
