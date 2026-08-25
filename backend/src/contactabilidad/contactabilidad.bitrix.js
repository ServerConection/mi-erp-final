function crearClienteBitrix({ request }) {
  if (typeof request !== 'function') throw new TypeError('request es requerido');

  async function listarDeals(crm, { desde, start = 0 }) {
    const select = [
      'ID', 'TITLE', 'DATE_CREATE', 'STAGE_ID', 'ASSIGNED_BY_ID',
      'CONTACT_ID', 'SOURCE_ID',
    ];
    if (crm.campoChat) select.push(crm.campoChat);
    return request(crm, 'crm.deal.list', {
      filter: { CATEGORY_ID: crm.categoryId, '>=DATE_CREATE': desde },
      select,
      order: { DATE_CREATE: 'ASC' },
      start,
    });
  }

  const obtenerContacto = (crm, contactId) =>
    request(crm, 'crm.contact.get', { id: String(contactId) });

  const obtenerChat = (crm, chatId, limit = 200) =>
    request(crm, 'im.dialog.messages.get', {
      DIALOG_ID: `chat${chatId}`,
      LIMIT: limit,
    });

  async function resolverChatLead(crm, deal) {
    const last = await request(crm, 'imopenlines.crm.chat.getLastId', {
      CRM_ENTITY_TYPE: 'deal',
      CRM_ENTITY: String(deal.ID),
    });
    if (!last?.result) return null;
    const chatId = String(last.result);
    const data = await obtenerChat(crm, chatId);
    return { chatId, messages: data?.result?.messages || [], users: data?.result?.users || [] };
  }

  return { listarDeals, obtenerContacto, obtenerChat, resolverChatLead };
}

module.exports = { crearClienteBitrix };
