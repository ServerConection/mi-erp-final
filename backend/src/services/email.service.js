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

async function enviarOTP(correo, otp) {
  try {
    const htmlBody = '<div style="font-family:Arial;padding:20px">'
      + '<h2>Acceso al ERP</h2>'
      + '<p>Tu codigo de acceso es:</p>'
      + '<h1 style="letter-spacing:4px">' + otp + '</h1>'
      + '<p>Este codigo expira en 10 minutos.</p>'
      + '</div>';

    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: correo,
      subject: 'Codigo de acceso ERP',
      text: 'Tu codigo OTP es: ' + otp,
      html: htmlBody,
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
