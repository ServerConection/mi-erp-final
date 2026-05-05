// email.service.js — OTP via Gmail (Nodemailer)
// Variables de entorno requeridas en Render:
//   MAIL_USER = tucorreo@gmail.com
//   MAIL_PASS = contraseña_de_aplicacion_gmail  (NO la contraseña normal)
//   MAIL_FROM = Sistema ERP <tucorreo@gmail.com>  (opcional)

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
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: correo,
      subject: 'Código de acceso ERP',
      text: `Tu código OTP es: ${otp}`,
      html: `
        <div style="font-family:Arial;padding:20px">
          <h2>Acceso al ERP</h2>
          <p>Tu código de acceso es:</p>
      