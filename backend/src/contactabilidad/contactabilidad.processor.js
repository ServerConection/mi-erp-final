const { normalizarMensaje } = require('./contactabilidad.normalizer');

function nombreCompleto(contact) {
  return [contact?.NAME, contact?.SECOND_NAME, contact?.LAST_NAME]
    .filter(Boolean).join(' ').trim() || null;
}

function crearProcesadorCrm({ bitrix, repository, pool }) {
  return async function procesarCrm(crm, rango) {
    let start = 0;
    let total = Infinity;
    let leads = 0;
    let mensajes = 0;
    const etapas = typeof bitrix.listarEtapas === 'function' ? await bitrix.listarEtapas(crm) : [];
    const etapasPorId = new Map(etapas.map((etapa) => [String(etapa.STATUS_ID), etapa.NAME || etapa.STATUS_ID]));
    const usuariosPorId = new Map();


    while (start < total) {
      const page = await bitrix.listarDeals(crm, { desde: rango.desde, hasta: rango.hasta, start });
      const deals = page.result || [];
      total = Number(page.total ?? deals.length);

      for (const deal of deals) {
        const contactData = deal.CONTACT_ID
          ? await bitrix.obtenerContacto(crm, deal.CONTACT_ID)
          : { result: null };
        const chat = await bitrix.resolverChatLead(crm, deal);
        const users = chat?.users || [];
        let asesor = users.find((u) => String(u.id) === String(deal.ASSIGNED_BY_ID) && !u.connector && !u.extranet);
        if (!asesor && deal.ASSIGNED_BY_ID && typeof bitrix.obtenerUsuario === 'function') {
          const asesorId = String(deal.ASSIGNED_BY_ID);
          if (!usuariosPorId.has(asesorId)) usuariosPorId.set(asesorId, await bitrix.obtenerUsuario(crm, asesorId));
          const usuario = usuariosPorId.get(asesorId);
          if (usuario) asesor = {
            name: [usuario.NAME, usuario.LAST_NAME].filter(Boolean).join(' ').trim() || null,
          };
        }
        const lead = {
          empresa: crm.empresa,
          id_bitrix: String(deal.ID),
          nombre_cliente: nombreCompleto(contactData.result),
          asesor_id: deal.ASSIGNED_BY_ID ? String(deal.ASSIGNED_BY_ID) : null,
          asesor_nombre: asesor?.name || null,
          origen_id: deal.SOURCE_ID || null,
          origen_nombre: deal.SOURCE_ID || null,
          fecha_creacion: deal.DATE_CREATE ? new Date(deal.DATE_CREATE) : null,
          etapa_id: deal.STAGE_ID || null,
          etapa_nombre: etapasPorId.get(String(deal.STAGE_ID)) || deal.STAGE_ID || null,
        };
        const normalizados = (chat?.messages || [])
          .map((message) => normalizarMensaje(message, users, {
            empresa: crm.empresa, idBitrix: deal.ID,
            chatId: chat.chatId, etapaId: deal.STAGE_ID,
          }))
          .filter(Boolean);

        await pool.transaction(async (client) => {
          await repository.upsertLead(client, lead);
          for (const message of normalizados) await repository.insertarMensaje(client, message);
        });
        leads += 1;
        mensajes += normalizados.length;
      }
      start += deals.length;
      if (!deals.length || deals.length < 50) break;
    }
    return { leads, mensajes };
  };
}

module.exports = { crearProcesadorCrm };
