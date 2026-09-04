const pool = require('../config/db');

// Línea dedicada para las notificaciones del submódulo Welcome.
// La comparación en la consulta es exacta (ignorando mayúsculas y espacios).
const LINEA_WELCOME = 'ENVIO_NOTI_BACK';

function normalizarTelefonoEcuador(valor) {
  let numero = String(valor || '').replace(/\D/g, '');
  if (!numero) return '';

  if (numero.startsWith('00')) numero = numero.slice(2);
  if (numero.length === 10 && numero.startsWith('0')) numero = `593${numero.slice(1)}`;
  else if (numero.length === 9 && numero.startsWith('9')) numero = `593${numero}`;

  return numero.length >= 10 && numero.length <= 15 ? numero : '';
}

function crearMensajeBienvenida(registro) {
  const nombreCompleto = String(registro?.nombre_cliente_completo || '').trim();
  const primerNombre = nombreCompleto.split(/\s+/)[0] || 'cliente';
  const plan = String(registro?.plan_contratado_final || '').trim();
  const login = String(registro?.netlife_login || '').trim();
  const fecha = registro?.fecha_activacion_netlife
    ? String(registro.fecha_activacion_netlife).slice(0, 10)
    : '';

  const detalles = [
    plan ? `📦 *Plan:* ${plan}` : null,
    login ? `👤 *Login Netlife:* ${login}` : null,
    fecha ? `📅 *Fecha de activación:* ${fecha}` : null,
  ].filter(Boolean);

  return [
    `Hola, *${primerNombre}* 👋`,
    '',
    '¡Te damos la bienvenida! 🎉',
    'Nos alegra informarte que tu servicio ya se encuentra *activo*.',
    detalles.length ? `\n${detalles.join('\n')}` : null,
    '',
    'Gracias por confiar en nosotros. 💙',
    '_Este es un mensaje automático; no compartas información sensible por este medio._',
  ].filter((linea) => linea !== null).join('\n');
}

/**
 * Encola el WhatsApp de bienvenida. El scheduler de WaBot procesa esta tabla
 * cada 30 segundos, lo que permite que CORE y WABOT sigan siendo procesos
 * independientes y evita exponer un endpoint interno sin autenticación.
 */
async function encolarWhatsappBienvenida(registro) {
  const preparado = await prepararWhatsappBienvenida(registro);
  if (!preparado.ok) {
    return { encolado: false, motivo: preparado.motivo };
  }

  const resultado = await pool.query(
    `INSERT INTO scheduled_messages
       (line_id, wa_number, body, scheduled_at, status)
     VALUES ($1, $2, $3, NOW(), 'pending')
     RETURNING id`,
    [preparado.linea_id, preparado.telefono, preparado.mensaje]
  );

  return {
    encolado: true,
    mensaje_id: resultado.rows[0].id,
    linea: LINEA_WELCOME,
    telefono: preparado.telefono,
  };
}

async function prepararWhatsappBienvenida(registro) {
  const telefono = normalizarTelefonoEcuador(
    registro?.telf_celular_pin || registro?.telf_celular_2 || registro?.telf_fijo
  );

  if (!telefono) {
    return { ok: false, motivo: 'cliente_sin_telefono_valido' };
  }

  const linea = await pool.query(
    `SELECT id, status
     FROM lines
     WHERE UPPER(TRIM(name)) = $1
       AND deleted_at IS NULL
     ORDER BY last_connected DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [LINEA_WELCOME]
  );

  if (!linea.rows.length) {
    return { ok: false, motivo: 'linea_envio_noti_back_no_encontrada' };
  }

  return {
    ok: true,
    linea_id: linea.rows[0].id,
    linea: LINEA_WELCOME,
    telefono,
    mensaje: crearMensajeBienvenida(registro),
  };
}

module.exports = {
  encolarWhatsappBienvenida,
  prepararWhatsappBienvenida,
  normalizarTelefonoEcuador,
  crearMensajeBienvenida,
};
