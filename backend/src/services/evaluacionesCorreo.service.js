/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SERVICIO: Correo de resultado de evaluación + certificado
 * ═══════════════════════════════════════════════════════════════════════════════
 * Reusa el mismo transporte de Gmail que ya usa el OTP (email.service.js →
 * MAIL_USER / MAIL_PASS). Tablas y estilos en línea a propósito: los clientes
 * de correo (sobre todo Outlook) no soportan flexbox/grid ni CSS externo.
 *
 *   - Si aprobó  → correo con formato de certificado + el certificado también
 *                  va adjunto como archivo .html independiente (para guardar
 *                  o imprimir aparte del correo).
 *   - Si no aprobó → correo simple con el resultado, sin marco de certificado.
 *
 * Nunca lanza hacia el controlador: si el envío falla, se loguea y el intento
 * queda con correo_enviado = false para poder reintentar a mano.
 */

const { send } = require('./email.service');

const fechaLarga = (d) =>
  new Date(d).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Guayaquil' });

function plantillaCertificado({ nombre, tituloEvaluacion, moduloTema, nota, fecha, empresa }) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px;">
    <tr><td align="center">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;
                    box-shadow:0 4px 16px rgba(15,37,71,.08);font-family:Arial,Helvetica,sans-serif;">

        <tr>
          <td style="background:#1A3A6E;padding:26px 32px;text-align:center;">
            <div style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:.5px;">ERP · ${empresa || 'Novonet / Velsa'}</div>
            <div style="color:#a5c3ee;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">
              Módulo de Evaluaciones
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:36px 32px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                   style="border:3px double #C9A227;border-radius:12px;">
              <tr>
                <td style="padding:34px 28px;text-align:center;">
                  <div style="font-size:34px;line-height:1;">🏆</div>
                  <p style="margin:14px 0 2px;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#C9A227;font-weight:bold;">
                    Certificado de Aprobación
                  </p>
                  <p style="margin:18px 0 4px;font-size:13px;color:#64748b;">Se certifica que</p>
                  <p style="margin:0 0 18px;font-size:24px;font-weight:bold;color:#1A3A6E;">${nombre}</p>
                  <p style="margin:0 0 6px;font-size:13px;color:#64748b;">aprobó satisfactoriamente la evaluación</p>
                  <p style="margin:0 0 22px;font-size:18px;font-weight:bold;color:#1e293b;">
                    ${tituloEvaluacion}${moduloTema ? ` <span style="font-weight:normal;color:#94a3b8;">— ${moduloTema}</span>` : ''}
                  </p>

                  <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 22px;">
                    <tr>
                      <td style="padding:10px 22px;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:10px;">
                        <span style="font-size:12px;color:#065f46;font-weight:600;">Calificación obtenida</span><br/>
                        <span style="font-size:26px;color:#059669;font-weight:bold;">${nota}%</span>
                      </td>
                    </tr>
                  </table>

                  <p style="margin:0;font-size:12px;color:#94a3b8;">${fechaLarga(fecha)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 32px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#64748b;line-height:1.6;">
              ¡Felicitaciones! Este certificado también va adjunto como archivo aparte
              por si quieres guardarlo o imprimirlo.
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:#f8fafc;padding:14px 32px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">
              Mensaje automático del Sistema ERP · No respondas a este correo
            </p>
          </td>
        </tr>

      </table>

    </td></tr>
  </table>
</body>
</html>`;
}

function plantillaResultado({ nombre, tituloEvaluacion, moduloTema, nota, notaMinima, fecha, empresa }) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px;">
    <tr><td align="center">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;
                    box-shadow:0 4px 16px rgba(15,37,71,.08);font-family:Arial,Helvetica,sans-serif;">

        <tr>
          <td style="background:#1A3A6E;padding:26px 32px;text-align:center;">
            <div style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:.5px;">ERP · ${empresa || 'Novonet / Velsa'}</div>
            <div style="color:#a5c3ee;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">
              Módulo de Evaluaciones
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 6px;font-size:16px;color:#1e293b;font-weight:bold;">Hola, ${nombre}</p>
            <p style="margin:0 0 20px;font-size:13.5px;color:#64748b;line-height:1.6;">
              Este es el resultado de tu evaluación <strong>${tituloEvaluacion}</strong>${moduloTema ? ` (${moduloTema})` : ''}.
            </p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
              <tr>
                <td style="padding:16px 18px;background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;text-align:center;">
                  <span style="font-size:12px;color:#991b1b;font-weight:600;">Calificación obtenida</span><br/>
                  <span style="font-size:26px;color:#dc2626;font-weight:bold;">${nota}%</span><br/>
                  <span style="font-size:11px;color:#b91c1c;">Nota mínima para aprobar: ${notaMinima}%</span>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:12.5px;color:#94a3b8;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:16px;">
              No alcanzaste la nota mínima esta vez. Conversa con tu supervisor sobre los
              temas a reforzar. · ${fechaLarga(fecha)}
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:#f8fafc;padding:14px 32px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">
              Mensaje automático del Sistema ERP · No respondas a este correo
            </p>
          </td>
        </tr>

      </table>

    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Envía el correo de resultado (y certificado adjunto si aprobó).
 * Nunca lanza: devuelve { ok, error? } para que el controlador decida si
 * marca correo_enviado = true sin tumbar la respuesta al usuario.
 */
async function enviarResultadoEvaluacion({
  correoDestino, nombre, tituloEvaluacion, moduloTema, nota, notaMinima, aprobado, fecha, empresa,
}) {
  if (!correoDestino) {
    console.warn('[evaluacionesCorreo] Usuario sin correo registrado — no se envía resultado');
    return { ok: false, error: 'El usuario no tiene correo registrado' };
  }

  try {
    const datos = { nombre, tituloEvaluacion, moduloTema, nota, notaMinima, fecha, empresa };

    if (aprobado) {
      const html = plantillaCertificado(datos);
      await send({
        to: correoDestino,
        subject: `🏆 ¡Aprobaste! Certificado — ${tituloEvaluacion}`,
        html,
        attachments: [{
          filename: `Certificado - ${tituloEvaluacion}.html`.replace(/[\\/:*?"<>|]/g, '_'),
          content: html,
          contentType: 'text/html',
        }],
      });
    } else {
      await send({
        to: correoDestino,
        subject: `Resultado de tu evaluación — ${tituloEvaluacion}`,
        html: plantillaResultado(datos),
      });
    }

    return { ok: true };
  } catch (error) {
    console.error('[evaluacionesCorreo] Error enviando resultado:', error.message);
    return { ok: false, error: error.message };
  }
}

module.exports = { enviarResultadoEvaluacion, plantillaCertificado, plantillaResultado };
