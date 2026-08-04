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

// Envío genérico — usado por FlowEngine (emailNode). No afecta el flujo OTP.
async function send({ to, subject, body, html }) {
  if (!to) throw new Error('email.send: destinatario requerido');
  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
    to,
    subject: subject || '(sin asunto)',
    text: body || '',
    html: html || undefined,
  });
  console.log('EMAIL enviado:', info.messageId, '→', to);
  return true;
}

module.exports = { enviarOTP, send };
