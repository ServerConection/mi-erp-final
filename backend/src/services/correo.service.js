// src/services/correo.service.js
// Requiere en .env:
//   MAIL_USER=tucorreo@gmail.com
//   MAIL_PASS=tu_app_password_gmail
//   MAIL_FROM=Sistema ERP <tucorreo@gmail.com>

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// Envía alerta a un supervisor con la lista de asesores/leads afectados
const enviarAlerta = async ({ para, supervisor, condicion, asesores = [], detalle = '' }) => {
  const TITULOS = {
    gestion_diaria: '⚠️ Leads en Gestión Diaria sin mover',
    contacto_nuevo: '🔴 Leads en Contacto Nuevo sin responder',
    sin_ventas:     '📉 Asesores sin ingresos hoy',
  };

  const titulo = TITULOS[condicion] || '⚠️ Alerta de gestión';

  const filasAsesores = asesores.map(a => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;color:#0f172a">${a.nombre}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;text-align:center">${a.cantidad ?? '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b">${a.etapa ?? '—'}</td>
    </tr>
  `).join('');

  const html = `
  <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:12px">
    <div style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0">
      
      <div style="background:#0f172a;padding:20px 24px;display:flex;align-items:center;gap:12px">
        <span style="font-size:24px">🔔</span>
        <div>
          <div style="color:#fff;font-size:15px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">${titulo}</div>
          <div style="color:#94a3b8;font-size:11px;margin-top:2px">Sistema ERP · ${new Date().toLocaleString('es-EC',{timeZone:'America/Guayaquil'})}</div>
        </div>
      </div>

      <div style="padding:20px 24px">
        <p style="margin:0 0 16px;color:#334155;font-size:13px">
          Hola <strong>${supervisor}</strong>, el sistema detectó la siguiente situación que requiere tu atención:
        </p>
        ${detalle ? `<p style="margin:0 0 16px;color:#64748b;font-size:12px;background:#f1f5f9;padding:10px 14px;border-radius:8px;border-left:3px solid #0ea5e9">${detalle}</p>` : ''}
        
        ${asesores.length > 0 ? `
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">
          <thead>
            <tr style="background:#f8fafc">
              <th style="padding:8px 12px;text-align:left;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #e2e8f0">Asesor</th>
              <th style="padding:8px 12px;text-align:center;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #e2e8f0">Cantidad</th>
              <th style="padding:8px 12px;text-align:left;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #e2e8f0">Etapa</th>
            </tr>
          </thead>
          <tbody>${filasAsesores}</tbody>
        </table>
        ` : '<p style="color:#94a3b8;font-size:12px;text-align:center;padding:20px">Sin detalle adicional</p>'}
      </div>

      <div style="padding:14px 24px;background:#f8fafc;border-top:1px solid #f1f5f9;text-align:center">
        <span style="font-size:10px;color:#cbd5e1;text-transform:uppercase;letter-spacing:.1em">Sistema de Alertas ERP · Novonet</span>
      </div>
    </div>
  </div>
  `;

  await transporter.sendMail({
    from:    process.env.MAIL_FROM || process.env.MAIL_USER,
    to:      para,
    subject: `${titulo} — ${supervisor}`,
    html,
  });
};

module.exports = { enviarAlerta };