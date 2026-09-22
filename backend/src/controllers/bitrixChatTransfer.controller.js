const axios = require('axios');

const {
  BITRIX_WEBHOOK_BASE,
  BITRIX_BOT_CLIENT_ID,
  BITRIX_TRANSFER_TOKEN,
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

  try {
    const chatsResp = await axios.get(`${BITRIX_WEBHOOK_BASE}/imopenlines.crm.chat.get`, {
      params: {
        CRM_ENTITY_TYPE: entityType,
        CRM_ENTITY: entityId,
        ACTIVE_ONLY: 'Y',
      },
    });

    const chats = chatsResp.data?.result || [];

    if (chats.length === 0) {
      console.log(`[chat-transfer] ${entityType} ${entityId}: sin chats activos, nada que transferir`);
      return res.json({ ok: true, transferred: 0, reason: 'sin chats activos' });
    }

    const resultados = [];
    for (const chat of chats) {
      const chatId = chat.CHAT_ID;
      try {
        const transferResp = await axios.get(`${BITRIX_WEBHOOK_BASE}/imopenlines.bot.session.transfer`, {
          params: {
            CHAT_ID: chatId,
            USER_ID: responsableId,
            LEAVE: 'N',
            CLIENT_ID: BITRIX_BOT_CLIENT_ID,
          },
        });
        resultados.push({ chatId, ok: transferResp.data?.result === true });
      } catch (err) {
        console.error(`[chat-transfer] error transfiriendo chat ${chatId}:`, err.response?.data || err.message);
        resultados.push({ chatId, ok: false, error: err.response?.data?.error_description || err.message });
      }
    }

    const okCount = resultados.filter((r) => r.ok).length;
    console.log(`[chat-transfer] ${entityType} ${entityId} -> responsable ${responsableId}: ${okCount}/${resultados.length} chats transferidos`);

    return res.json({ ok: true, transferred: okCount, detalle: resultados });
  } catch (err) {
    console.error('[chat-transfer] error general:', err.response?.data || err.message);
    return res.status(500).json({ ok: false, error: err.response?.data?.error_description || err.message });
  }
}

module.exports = { handleDealResponsibleChanged };
