const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function enviarOTP(correo, otp) {
  try {

    const msg = {
      to: correo,
      from: process.env.EMAIL_FROM,
      subject: "Código de acceso ERP",
      text: `Tu código OTP es: ${otp}`,
      html: `
        <div style="font-family:Arial;padding:20px">
          <h2>Acceso al ERP</h2>
          <p>Tu código de acceso es:</p>
          <h1>${otp}</h1>
          <p>Este código expira en 10 minutos.</p>
        </div>
      `
    };

   const response = await sgMail.send(msg);
console.log('SENDGRID RESPONSE:', response[0].statusCode);

    return true;

  } catch (error) {

    console.error("ERROR SENDGRID:", JSON.stringify(error.response?.body, null, 2));

    throw new Error("Error enviando correo");

  }
}

module.exports = {
  enviarOTP
};