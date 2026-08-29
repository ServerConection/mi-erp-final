// =============================================================================
// Contactabilidad — Visor de conversacion en vivo
//
// Trae el chat real de Bitrix en el momento en que el usuario pulsa el boton.
// NO persiste el contenido: el texto viaja a la pantalla y ahi muere. La tabla
// contactabilidad_mensajes sigue guardando solo quien escribio y cuando, que es
// la decision de privacidad original del modulo.
//
// Cache corta en memoria (15 s) para que abrir y cerrar el modal no dispare
// llamadas repetidas contra el limite de la API de Bitrix.
// =============================================================================

const TTL_MS = 15_000;
const LIMITE_DEFECTO = 200;
const LIMITE_MAXIMO = 500;
const CACHE_MAXIMO = 200; // entradas; evita crecer sin control

/** Limpia el BB-code de Bitrix para que el texto se lea como en el chat. */
function limpiarTexto(texto) {
  if (!texto) return '';
  return String(texto)
    .replace(/\[\/?[BIUS]\]/gi, '')
    .replace(/\[URL=([^\]]+)\](.*?)\[\/URL\]/gi, '$2 ($1)')
    .replace(/\[URL\](.*?)\[\/URL\]/gi, '$1')
    .replace(/\[br\]/gi, '\n')
    .replace(/\[DISK=[^\]]*\]|\[FILE=[^\]]*\]/gi, '📎 archivo adjunto')
    .replace(/\[[A-Z_]+=[^\]]*\]|\[\/?[A-Z_]+\]/gi, '')
    .trim();
}

const fechaMensaje = (mensaje) => {
  if (!mensaje?.date) return null;
  const fecha = typeof mensaje.date === 'number' ? new Date(mensaje.date * 1000) : new Date(mensaje.date);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
};

/**
 * Convierte la respuesta cruda de Bitrix en una conversacion legible y calcula
 * cuanto tardo el asesor en contestar cada vez que el cliente escribio.
 */
function armarConversacion(chat, { empresa, idBitrix }) {
  const usuarios = new Map((chat?.users || []).map((u) => [String(u.id), u]));

  const mensajes = (chat?.messages || [])
    .map((mensaje) => {
      const fecha = fechaMensaje(mensaje);
      if (!fecha) return null;
      const autor = usuarios.get(String(mensaje.author_id));
      const sistema = Number(mensaje.author_id) === 0;
      const texto = limpiarTexto(mensaje.text);
      if (sistema && !texto) return null;
      return {
        id: String(mensaje.id),
        emisor_tipo: sistema ? 'SISTEMA' : (autor?.connector || autor?.extranet ? 'CLIENTE' : 'ASESOR'),
        emisor_nombre: autor?.name || (sistema ? 'Sistema' : null),
        texto: texto || '📎 adjunto sin texto',
        fecha: fecha.toISOString(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  // Tiempo de respuesta: se marca en el primer mensaje del asesor despues de
  // que el cliente escribiera. Es el mismo criterio que usan los indicadores.
  let esperandoDesde = null;
  for (const mensaje of mensajes) {
    if (mensaje.emisor_tipo === 'CLIENTE') {
      if (!esperandoDesde) esperandoDesde = mensaje.fecha;
    } else if (mensaje.emisor_tipo === 'ASESOR' && esperandoDesde) {
      mensaje.respuesta_seg = Math.max(0,
        Math.round((new Date(mensaje.fecha) - new Date(esperandoDesde)) / 1000));
      esperandoDesde = null;
    }
  }

  const cliente = [...usuarios.values()].find((u) => u.connector || u.extranet);
  return {
    empresa,
    id_bitrix: String(idBitrix),
    chat_id: chat?.chatId || null,
    cliente_nombre: cliente?.name || null,
    mensajes,
    total: mensajes.length,
    mensajes_cliente: mensajes.filter((m) => m.emisor_tipo === 'CLIENTE').length,
    mensajes_asesor: mensajes.filter((m) => m.emisor_tipo === 'ASESOR').length,
    // Sin respuesta pendiente = null; si el ultimo que hablo fue el cliente,
    // aqui queda la marca de cuando empezo a esperar.
    esperando_desde: esperandoDesde,
  };
}

function crearVisorConversacion({ crms = [], bitrix, ttlMs = TTL_MS, ahora = () => Date.now() }) {
  if (!bitrix) throw new TypeError('bitrix es requerido');
  const porEmpresa = new Map(crms.map((crm) => [String(crm.empresa).toUpperCase(), crm]));
  const cache = new Map();

  function guardar(clave, valor) {
    if (cache.size >= CACHE_MAXIMO) cache.delete(cache.keys().next().value);
    cache.set(clave, { valor, at: ahora() });
  }

  async function obtener(empresa, idBitrix, { limite = LIMITE_DEFECTO, forzar = false } = {}) {
    const crm = porEmpresa.get(String(empresa || '').toUpperCase());
    if (!crm) throw new TypeError(`Empresa ${empresa} no habilitada para Contactabilidad`);

    const tope = Math.min(LIMITE_MAXIMO, Math.max(1, Number(limite) || LIMITE_DEFECTO));
    const clave = `${crm.empresa}:${idBitrix}:${tope}`;
    const guardado = cache.get(clave);
    if (!forzar && guardado && ahora() - guardado.at < ttlMs) {
      return { ...guardado.valor, desde_cache: true };
    }

    const ultimo = await bitrix.resolverChatLead(crm, { ID: String(idBitrix) });
    if (!ultimo?.chatId) {
      return { empresa: crm.empresa, id_bitrix: String(idBitrix), sin_chat: true, mensajes: [], total: 0 };
    }

    // resolverChatLead trae hasta 200; si piden mas se relee el dialogo.
    const chat = tope > LIMITE_DEFECTO
      ? { ...ultimo, messages: (await bitrix.obtenerChat(crm, ultimo.chatId, tope))?.result?.messages || ultimo.messages }
      : ultimo;

    const conversacion = armarConversacion({ ...chat, chatId: ultimo.chatId },
      { empresa: crm.empresa, idBitrix });
    conversacion.truncado = conversacion.total >= tope;
    guardar(clave, conversacion);
    return { ...conversacion, desde_cache: false };
  }

  return { obtener, empresas: () => [...porEmpresa.keys()] };
}

module.exports = { crearVisorConversacion, armarConversacion, limpiarTexto, TTL_MS, LIMITE_MAXIMO };
