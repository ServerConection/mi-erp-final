const bitrixChatTransferApp = require('../services/bitrixChatTransferApp.service');

const {
  BITRIX_BOT_CLIENT_ID,
  BITRIX_WEBHOOK_TOKEN: BITRIX_TRANSFER_TOKEN,
} = process.env;

const ENTITY_TYPES_VALIDOS = new Set(['lead', 'deal', 'company', 'contact']);

async function handleDealResponsibleChanged(req, res) {
  const {
    entity_type: entityType,
    entity_id: entityId,
    responsable_id: responsableId,
    token,
  } = req.query;

  if (token !== BITRIX_TRANSFER_TOKEN) {
    return res.status(403).json({ ok: false, error: 'token inválido' });
  }
  if (!ENTITY_TYPES_VALIDOS.has(entityType)) {
    return res.status(400).json({ ok: false, error: 'entity_type inválido' });
  }
  if (!entityId || !responsableId) {
    return res.status(400).json({ ok: false, error: 'faltan entity_id o responsable_id' });
  }
  if (!BITRIX_BOT_CLIENT_ID) {
    return res.status(500).json({ ok: false, error: 'falta BITRIX_BOT_CLIENT_ID en el .env (BOT_ID de imbot.register)' });
  }

  // Bitrix manda el campo "Persona responsable" como "user_211307",
  // hay que quitar el prefijo "user_" para quedarnos con el ID numérico
  const responsableIdLimpio = responsableId.replace(/^user_/, '');

  try {
    // imopenlines.* exige contexto de aplicación (no webhook simple), por
    // eso se llama vía la app local aislada "Chat Transfer Bot"
    // (bitrixChatTransferApp), nunca con axios+webhook.
    const chats = await bitrixChatTransferApp.llamar('imopenlines.crm.chat.get', {
      CRM_ENTITY_TYPE: entityType,
      CRM_ENTITY: entityId,
      ACTIVE_ONLY: 'Y',
    }) || [];

    if (chats.length === 0) {
      console.log(`[chat-transfer] ${entityType} ${entityId}: sin chats activos, nada que transferir`);
      return res.json({ ok: true, transferred: 0, reason: 'sin chats activos' });
    }

    const resultados = [];
    for (const chat of chats) {
      const chatId = chat.CHAT_ID;
      try {
        const r = await bitrixChatTransferApp.llamar('imopenlines.bot.session.transfer', {
          CHAT_ID: chatId,
          USER_ID: responsableIdLimpio,
          LEAVE: 'N',
          CLIENT_ID: BITRIX_BOT_CLIENT_ID,
        });
        resultados.push({ chatId, ok: r === true });
      } catch (err) {
        console.error(`[chat-transfer] error transfiriendo chat ${chatId}:`, err.message);
        resultados.push({ chatId, ok: false, error: err.message });
      }
    }

    const okCount = resultados.filter((r) => r.ok).length;
    console.log(`[chat-transfer] ${entityType} ${entityId} -> responsable ${responsableIdLimpio}: ${okCount}/${resultados.length} chats transferidos`);

    return res.json({ ok: true, transferred: okCount, detalle: resultados });
  } catch (err) {
    console.error('[chat-transfer] error general:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = { handleDealResponsibleChanged };
