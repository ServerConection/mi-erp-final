const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
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

module.exports = { enviarOTP };
