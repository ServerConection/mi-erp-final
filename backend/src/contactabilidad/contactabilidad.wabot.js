const LIMITE_WABOT = 500;

async function obtenerConversacionWabot(pool, empresa, idBitrix, limite = LIMITE_WABOT) {
  const tope = Math.min(LIMITE_WABOT, Math.max(1, Number(limite) || LIMITE_WABOT));
  const { rows } = await pool.query(`
    SELECT m.id,
           CASE WHEN m.direction = 'in' THEN 'CLIENTE' ELSE 'ASESOR' END AS emisor_tipo,
           CASE WHEN m.direction = 'in'
             THEN COALESCE(NULLIF(BTRIM(ct.name), ''), 'Cliente')
             ELSE NULLIF(BTRIM(CONCAT_WS(' ', u.nombres, u.apellidos)), '')
           END AS emisor_nombre,
           m.timestamp AS fecha,
           COALESCE(NULLIF(m.content, ''),
             CASE WHEN m.type <> 'text' THEN '[' || UPPER(m.type) || ']' END,
             '[Mensaje]') AS texto
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      JOIN lines l ON l.id = c.line_id
      JOIN usuarios u ON u.id = l.created_by
      LEFT JOIN contacts ct ON ct.id = c.contact_id
     WHERE UPPER(BTRIM(u.empresa)) = $1
       AND c.bitrix_deal_id = $2
     ORDER BY m.timestamp DESC, m.id DESC
     LIMIT $3
  `, [empresa, idBitrix, tope]);

  return rows.reverse().map((mensaje) => ({
    ...mensaje,
    id: `wabot:${mensaje.id}`,
    fecha: mensaje.fecha instanceof Date ? mensaje.fecha.toISOString() : mensaje.fecha,
    fuente: 'WABOT',
  }));
}

function combinarMensajes(bitrix = [], wabot = []) {
  return [
    ...bitrix.map((mensaje) => ({ ...mensaje, fuente: 'BITRIX' })),
    ...wabot,
  ].sort((a, b) => {
    const diferencia = new Date(a.fecha).getTime() - new Date(b.fecha).getTime();
    return diferencia || String(a.id).localeCompare(String(b.id));
  });
}

module.exports = { obtenerConversacionWabot, combinarMensajes, LIMITE_WABOT };
