const pool = require('../config/db');

// Línea dedicada para las notificaciones del submódulo Welcome.
// La comparación en la consulta es exacta (ignorando mayúsculas y espacios).
const LINEA_WELCOME = 'NOTI_BACK';

function reemplazarVariablesWelcome(texto, registro) {
  const valores = {
    nombre: obtenerNombreSaludo(registro),
    plan: String(registro?.plan_contratado_final || registro?.plan_contratado || 'No especificado').trim(),
    forma_pago: String(registro?.forma_pago || 'No especificada').trim(),
    ciclo_facturacion: String(registro?.ciclo_facturacion || 'No especificado').trim(),
  };
  return String(texto || '').replace(/\{\{(nombre|plan|forma_pago|ciclo_facturacion)\}\}/g, (_m, clave) => valores[clave]);
}

function normalizarTelefonoEcuador(valor) {
  let numero = String(valor || '').replace(/\D/g, '');
  if (!numero) return '';

  if (numero.startsWith('00')) numero = numero.slice(2);
  if (numero.length === 10 && numero.startsWith('0')) numero = `593${numero.slice(1)}`;
  else if (numero.length === 9 && numero.startsWith('9')) numero = `593${numero}`;

  return numero.length >= 10 && numero.length <= 15 ? numero : '';
}

function obtenerNombreSaludo(registro) {
  const nombreCompleto = String(registro?.nombre_cliente_completo || '').trim();
  if (!nombreCompleto) return 'cliente';

  // En ventas de personas el nombre se persiste como:
  // "primer apellido segundo apellido primer nombre segundo nombre".
  // Para empresas se conserva la razon social completa.
  if (String(registro?.tipo_documento || '').trim().toUpperCase() === 'RUC EMPRESA') {
    return nombreCompleto;
  }

  const partes = nombreCompleto.split(/\s+/).filter(Boolean);
  if (partes.length === 1) return partes[0];

  const primerApellido = partes[0];
  const primerNombre = partes.length >= 3 ? partes[2] : partes[1];
  return `${primerNombre} ${primerApellido}`;
}

function crearMensajeBienvenida(registro) {
  const nombreSaludo = obtenerNombreSaludo(registro);
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
    `Hola, *${nombreSaludo}* 👋`,
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

async function prepararWhatsappBienvenida(registro, variantId = null) {
  const telefono = normalizarTelefonoEcuador(
    registro?.telf_celular_pin || registro?.telf_celular_2 || registro?.telf_fijo
  );

  if (!telefono) {
    return { ok: false, motivo: 'cliente_sin_telefono_valido' };
  }

  const config = await pool.query(`SELECT line_name FROM welcome_config WHERE id=1`).catch(() => ({ rows: [] }));
  const nombreLinea = String(config.rows[0]?.line_name || LINEA_WELCOME).trim().toUpperCase();
  const linea = await pool.query(
    `SELECT id, status
     FROM lines
     WHERE UPPER(TRIM(name)) = $1
       AND deleted_at IS NULL
     ORDER BY last_connected DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [nombreLinea]
  );

  if (!linea.rows.length) {
    return { ok: false, motivo: 'linea_noti_back_no_encontrada' };
  }

  let variante = null;
  if (variantId) {
    const resultado = await pool.query(`SELECT id, code, name, body FROM welcome_variants WHERE id=$1 AND active=true`, [variantId]);
    variante = resultado.rows[0] || null;
  }
  if (!variante) {
    const resultado = await pool.query(
      `SELECT id, code, name, body FROM welcome_variants WHERE active=true ORDER BY sort_order, id`
    ).catch(() => ({ rows: [] }));
    if (resultado.rows.length) variante = resultado.rows[Math.abs(Number(registro?.id) || 0) % resultado.rows.length];
  }

  return {
    ok: true,
    linea_id: linea.rows[0].id,
    linea: nombreLinea,
    telefono,
    mensaje: variante ? reemplazarVariablesWelcome(variante.body, registro) : crearMensajeBienvenida(registro),
    variante_id: variante?.id || null,
    variante_codigo: variante?.code || null,
  };
}

module.exports = {
  encolarWhatsappBienvenida,
  prepararWhatsappBienvenida,
  normalizarTelefonoEcuador,
  obtenerNombreSaludo,
  reemplazarVariablesWelcome,
  crearMensajeBienvenida,
};
