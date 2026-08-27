function crearRepositorioContactabilidad() {
  async function upsertLead(client, lead) {
    return client.query(`
      INSERT INTO contactabilidad_leads
        (empresa, id_bitrix, nombre_cliente, asesor_id, asesor_nombre,
         origen_id, origen_nombre, fecha_creacion, etapa_id, etapa_nombre,
         etapa_ingreso_at, ultima_sincronizacion_at, actualizado_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW(),NOW())
      ON CONFLICT (empresa, id_bitrix) DO UPDATE SET
        nombre_cliente = EXCLUDED.nombre_cliente,
        asesor_id = EXCLUDED.asesor_id,
        asesor_nombre = EXCLUDED.asesor_nombre,
        origen_id = EXCLUDED.origen_id,
        origen_nombre = EXCLUDED.origen_nombre,
        fecha_creacion = COALESCE(contactabilidad_leads.fecha_creacion, EXCLUDED.fecha_creacion),
        etapa_id = EXCLUDED.etapa_id,
        etapa_nombre = EXCLUDED.etapa_nombre,
        ultima_sincronizacion_at = NOW(),
        actualizado_at = NOW()
      RETURNING empresa, id_bitrix
    `, [
      lead.empresa, lead.id_bitrix, lead.nombre_cliente, lead.asesor_id,
      lead.asesor_nombre, lead.origen_id, lead.origen_nombre,
      lead.fecha_creacion, lead.etapa_id, lead.etapa_nombre,
    ]);
  }

  async function insertarMensaje(client, message) {
    return client.query(`
      INSERT INTO contactabilidad_mensajes
        (empresa, id_bitrix, chat_id, mensaje_externo_id, emisor_tipo,
         emisor_id, emisor_nombre, mensaje_at, etapa_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (empresa, chat_id, mensaje_externo_id) DO NOTHING
      RETURNING id
    `, [
      message.empresa, message.id_bitrix, message.chat_id,
      message.mensaje_externo_id, message.emisor_tipo, message.emisor_id,
      message.emisor_nombre, message.mensaje_at, message.etapa_id,
    ]);
  }

  async function actualizarNombresOrigen(client, empresa, origenes) {
    if (!origenes?.length) return { rowCount: 0 };
    const ids = origenes.map((origen) => String(origen.id));
    const nombres = origenes.map((origen) => origen.nombre || String(origen.id));
    return client.query(`
      UPDATE contactabilidad_leads l
      SET origen_nombre = fuente.nombre,
          actualizado_at = NOW()
      FROM (
        SELECT UNNEST($2::text[]) AS id, UNNEST($3::text[]) AS nombre
      ) fuente
      WHERE l.empresa = $1 AND l.origen_id = fuente.id
        AND l.origen_nombre IS DISTINCT FROM fuente.nombre
    `, [empresa, ids, nombres]);
  }

  return { upsertLead, insertarMensaje, actualizarNombresOrigen };
}

module.exports = { crearRepositorioContactabilidad };
