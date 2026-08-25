function fechaMensaje(message) {
  if (!message?.date) return null;
  const fecha = typeof message.date === 'number'
    ? new Date(message.date * 1000)
    : new Date(message.date);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function normalizarMensaje(message, users, context) {
  if (!message || Number(message.author_id) === 0 || !String(message.text || '').trim()) return null;
  const fecha = fechaMensaje(message);
  if (!fecha) return null;
  const user = (users || []).find((item) => String(item.id) === String(message.author_id));
  const esCliente = Boolean(user?.connector || user?.extranet);

  return {
    empresa: String(context.empresa).toUpperCase(),
    id_bitrix: String(context.idBitrix),
    chat_id: String(context.chatId),
    mensaje_externo_id: String(message.id),
    emisor_tipo: esCliente ? 'CLIENTE' : 'ASESOR',
    emisor_id: String(message.author_id),
    emisor_nombre: user?.name || null,
    mensaje_at: fecha,
    etapa_id: context.etapaId || null,
  };
}

function resumirMensajes(messages) {
  const resumen = {
    mensajes_cliente: 0,
    mensajes_asesor: 0,
    ultimo_mensaje_cliente_at: null,
    ultimo_mensaje_asesor_at: null,
  };
  for (const message of messages || []) {
    const cliente = message.emisor_tipo === 'CLIENTE';
    const contador = cliente ? 'mensajes_cliente' : 'mensajes_asesor';
    const ultima = cliente ? 'ultimo_mensaje_cliente_at' : 'ultimo_mensaje_asesor_at';
    resumen[contador] += 1;
    if (!resumen[ultima] || message.mensaje_at > resumen[ultima]) resumen[ultima] = message.mensaje_at;
  }
  return resumen;
}

function calcularPendientePor(resumen) {
  const cliente = resumen?.ultimo_mensaje_cliente_at;
  const asesor = resumen?.ultimo_mensaje_asesor_at;
  if (!cliente && !asesor) return null;
  if (cliente && (!asesor || cliente > asesor)) return 'ASESOR';
  return 'CLIENTE';
}

module.exports = { normalizarMensaje, resumirMensajes, calcularPendientePor };
