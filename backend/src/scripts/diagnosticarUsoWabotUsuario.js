require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const db = require('../config/db');

async function main() {
  const fecha = process.argv[2] || '2026-11-16';
  const buscar = process.argv.slice(3).join(' ') || 'ANDRE SEBASTIAN NOGUERA NOGUERA';
  const { rows } = await db.query(`
    WITH usuario_objetivo AS (
      SELECT id, BTRIM(nombres || ' ' || apellidos) AS nombre
      FROM public.usuarios
      WHERE UPPER(BTRIM(nombres || ' ' || apellidos)) = UPPER($2)
      LIMIT 1
    ), lineas AS (
      SELECT l.id FROM public.lines l
      JOIN usuario_objetivo u ON u.id = l.created_by
      WHERE l.deleted_at IS NULL
    ), mensajes_dia AS (
      SELECT m.*
      FROM public.messages m
      WHERE m.line_id IN (SELECT id FROM lineas)
        AND (m.timestamp AT TIME ZONE 'America/Guayaquil')::date = $1::date
    )
    SELECT
      (SELECT id FROM usuario_objetivo) AS usuario_id,
      (SELECT nombre FROM usuario_objetivo) AS usuario,
      (SELECT COUNT(*) FROM lineas)::int AS lineas,
      COUNT(*)::int AS mensajes_total,
      COUNT(*) FILTER (WHERE direction = 'in')::int AS mensajes_entrantes,
      COUNT(*) FILTER (WHERE direction = 'out')::int AS mensajes_salientes,
      COUNT(*) FILTER (WHERE direction = 'out' AND campaign_id IS NULL AND node_type IS NULL)::int AS salientes_sin_campana_nodo,
      COUNT(*) FILTER (WHERE direction = 'out' AND (metadata ? 'author_id' OR metadata ? 'inbox_bitrix_note_id'))::int AS salientes_marcados_manual,
      COUNT(DISTINCT conversation_id) FILTER (WHERE direction = 'in')::int AS chats_con_entrada,
      COUNT(DISTINCT conversation_id) FILTER (WHERE direction = 'out')::int AS chats_con_salida,
      COUNT(DISTINCT conversation_id) FILTER (WHERE direction = 'out' AND campaign_id IS NULL AND node_type IS NULL)::int AS chats_salida_sin_campana_nodo,
      COUNT(DISTINCT conversation_id) FILTER (WHERE direction = 'out' AND (metadata ? 'author_id' OR metadata ? 'inbox_bitrix_note_id'))::int AS chats_salida_manual_marcada,
      COUNT(DISTINCT conversation_id)::int AS chats_con_actividad
    FROM mensajes_dia
  `, [fecha, buscar]);

  const { rows: inbox } = await db.query(`
    WITH usuario_objetivo AS (
      SELECT id FROM public.usuarios
      WHERE UPPER(BTRIM(nombres || ' ' || apellidos)) = UPPER($2)
      LIMIT 1
    )
    SELECT
      COUNT(*) FILTER (WHERE (c.last_msg_at AT TIME ZONE 'America/Guayaquil')::date = $1::date)::int AS conversaciones_ultima_actividad_hoy,
      COUNT(*) FILTER (WHERE (c.started_at AT TIME ZONE 'America/Guayaquil')::date = $1::date)::int AS conversaciones_iniciadas_hoy,
      COUNT(*)::int AS conversaciones_totales
    FROM public.conversations c
    JOIN public.lines l ON l.id = c.line_id
    WHERE l.created_by = (SELECT id FROM usuario_objetivo)
      AND l.deleted_at IS NULL
  `, [fecha, buscar]);

  const { rows: desglose } = await db.query(`
    WITH u AS (
      SELECT id FROM public.usuarios
      WHERE UPPER(BTRIM(nombres || ' ' || apellidos)) = UPPER($2) LIMIT 1
    )
    SELECT m.type, COALESCE(m.node_type, 'SIN_NODO') AS node_type,
           COALESCE(m.metadata->>'source', 'SIN_SOURCE') AS source,
           (m.metadata ? 'author_id') AS con_autor,
           (m.metadata ? 'inbox_bitrix_note_id') AS con_nota_bitrix,
           COUNT(*)::int AS mensajes,
           COUNT(DISTINCT m.conversation_id)::int AS chats
    FROM public.messages m
    JOIN public.lines l ON l.id = m.line_id
    WHERE l.created_by = (SELECT id FROM u)
      AND m.direction = 'out'
      AND (m.timestamp AT TIME ZONE 'America/Guayaquil')::date = $1::date
    GROUP BY 1,2,3,4,5 ORDER BY mensajes DESC
  `, [fecha, buscar]);
  const { rows: lecturas } = await db.query(`
    SELECT COUNT(*)::int AS chats_abiertos_hoy
    FROM public.conversation_reads cr
    JOIN public.usuarios u ON u.id = cr.user_id
    WHERE UPPER(BTRIM(u.nombres || ' ' || u.apellidos)) = UPPER($2)
      AND (cr.last_read_at AT TIME ZONE 'America/Guayaquil')::date = $1::date
  `, [fecha, buscar]);

  console.log(JSON.stringify({ ...rows[0], ...inbox[0], ...lecturas[0], fecha, desglose }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => db.end());
