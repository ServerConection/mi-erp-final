/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CONTROLADOR: Chat Interno
 * ═══════════════════════════════════════════════════════════════════════════════
 * Los permisos de conversación YA fueron resueltos por chatAcceso.js: estos
 * handlers leen req.conversacion y confían. La única regla que se valida acá
 * es la de empresa al agregar participantes (validarParticipantes).
 */

const pool = require('../config/db');
const { validarParticipantes } = require('../middleware/chatAcceso');
const { nombreCompleto, emitirAUsuario, emitirAParticipantes } = require('../services/chat.service');

// ══════════════════════════════════════════════════════════════════════════════
// CATÁLOGO DE USUARIOS (para armar chats nuevos)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/chat/usuarios?q=
 * Aislado por empresa: un usuario normal solo ve gente de su propia empresa.
 * ADMINISTRADOR ve de ambas (es quien puede cruzar chats entre NOVONET/VELSA).
 */
exports.usuariosDisponibles = async (req, res) => {
  try {
    const busqueda = (req.query.q || '').trim();
    const esAdmin = req.user.perfil === 'ADMINISTRADOR';

    const condiciones = [`activo = 'SI'`, `id != $1`];
    const params = [req.user.id];

    if (!esAdmin) {
      params.push(req.user.empresa);
      condiciones.push(`UPPER(empresa) = $${params.length}`);
    }
    if (busqueda) {
      params.push(`%${busqueda.toLowerCase()}%`);
      condiciones.push(
        `LOWER(COALESCE(nombres, '') || ' ' || COALESCE(apellidos, '') || ' ' || usuario) LIKE $${params.length}`
      );
    }

    const { rows } = await pool.query(
      `SELECT id, usuario, nombres, apellidos, perfil, empresa
         FROM usuarios
        WHERE ${condiciones.join(' AND ')}
        ORDER BY nombres, apellidos
        LIMIT 300`,
      params
    );

    res.json({
      success: true,
      data: rows.map(r => ({
        id: r.id, nombre: nombreCompleto(r), usuario: r.usuario,
        perfil: r.perfil, empresa: r.empresa,
      })),
    });
  } catch (error) {
    console.error('[chat.usuariosDisponibles]', error);
    res.status(500).json({ success: false, error: 'No se pudo cargar la lista de usuarios' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// CONVERSACIONES
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/chat/conversaciones — mis conversaciones, ordenadas por actividad reciente */
exports.listarConversaciones = async (req, res) => {
  try {
    const { id: usuarioId } = req.user;

    const { rows } = await pool.query(
      `SELECT
          c.id, c.tipo, c.nombre, c.creado_por, c.created_at, c.updated_at,
          mp.ultimo_leido_id,
          (SELECT m.contenido   FROM chat_mensajes m WHERE m.conversacion_id = c.id AND NOT m.eliminado ORDER BY m.id DESC LIMIT 1) AS ultimo_mensaje,
          (SELECT m.usuario_id  FROM chat_mensajes m WHERE m.conversacion_id = c.id AND NOT m.eliminado ORDER BY m.id DESC LIMIT 1) AS ultimo_autor_id,
          (SELECT m.created_at  FROM chat_mensajes m WHERE m.conversacion_id = c.id AND NOT m.eliminado ORDER BY m.id DESC LIMIT 1) AS ultimo_at,
          (SELECT COUNT(*)      FROM chat_mensajes m WHERE m.conversacion_id = c.id AND NOT m.eliminado
                                  AND m.usuario_id != $1 AND m.id > COALESCE(mp.ultimo_leido_id, 0)) AS no_leidos,
          COALESCE(
            json_agg(json_build_object(
              'id', u.id, 'nombre',
              COALESCE(NULLIF(TRIM(COALESCE(u.nombres, '') || ' ' || COALESCE(u.apellidos, '')), ''), u.usuario),
              'usuario', u.usuario, 'empresa', u.empresa
            )) FILTER (WHERE u.id IS NOT NULL AND u.id != $1),
            '[]'
          ) AS otros_participantes
        FROM chat_conversaciones c
        JOIN chat_participantes mp ON mp.conversacion_id = c.id AND mp.usuario_id = $1 AND mp.activo
        LEFT JOIN chat_participantes p2 ON p2.conversacion_id = c.id AND p2.activo
        LEFT JOIN usuarios u ON u.id = p2.usuario_id
        GROUP BY c.id, c.tipo, c.nombre, c.creado_por, c.created_at, c.updated_at, mp.ultimo_leido_id
        ORDER BY c.updated_at DESC`,
      [usuarioId]
    );

    res.json({
      success: true,
      data: rows.map(r => {
        const otros = r.otros_participantes || [];
        const titulo = r.tipo === 'GRUPO' ? r.nombre : (otros[0]?.nombre || '(sin participantes)');
        return {
          id: r.id,
          tipo: r.tipo,
          titulo,
          otrosParticipantes: otros,
          totalParticipantes: otros.length + 1,
          ultimoMensaje: r.ultimo_mensaje,
          ultimoAutorId: r.ultimo_autor_id,
          ultimoAutorSoyYo: r.ultimo_autor_id === usuarioId,
          ultimoAt: r.ultimo_at,
          noLeidos: Number(r.no_leidos),
          esMio: r.creado_por === usuarioId,
          updatedAt: r.updated_at,
        };
      }),
    });
  } catch (error) {
    console.error('[chat.listarConversaciones]', error);
    res.status(500).json({ success: false, error: 'No se pudo cargar tus chats' });
  }
};

/**
 * POST /api/chat/conversaciones
 * Body: { tipo: 'DIRECTA' | 'GRUPO', participantes: [usuarioId, ...], nombre? }
 * Si ya existe una DIRECTA exacta con esa otra persona, la reutiliza en vez de
 * crear una nueva (evita duplicar el mismo 1 a 1 cada vez que alguien escribe).
 */
exports.crearConversacion = async (req, res) => {
  const tipo = String(req.body.tipo || '').toUpperCase();
  const participantesBody = Array.isArray(req.body.participantes) ? req.body.participantes : [];

  if (!['DIRECTA', 'GRUPO'].includes(tipo)) {
    return res.status(400).json({ success: false, error: 'tipo debe ser DIRECTA o GRUPO' });
  }
  if (tipo === 'DIRECTA' && participantesBody.length !== 1) {
    return res.status(400).json({ success: false, error: 'Una conversación directa necesita exactamente 1 destinatario' });
  }
  if (tipo === 'GRUPO' && (!req.body.nombre || String(req.body.nombre).trim().length < 3)) {
    return res.status(400).json({ success: false, error: 'El grupo necesita un nombre de al menos 3 caracteres' });
  }

  const validacion = await validarParticipantes(participantesBody, req.user);
  if (!validacion.ok) {
    return res.status(400).json({ success: false, error: validacion.error });
  }
  const idsDestino = validacion.usuarios.map(u => u.id);

  const db = await pool.connect();
  try {
    await db.query('BEGIN');

    if (tipo === 'DIRECTA') {
      const otroId = idsDestino[0];
      const { rows: existente } = await db.query(
        `SELECT c.id
           FROM chat_conversaciones c
          WHERE c.tipo = 'DIRECTA'
            AND EXISTS (SELECT 1 FROM chat_participantes p1 WHERE p1.conversacion_id = c.id AND p1.usuario_id = $1 AND p1.activo)
            AND EXISTS (SELECT 1 FROM chat_participantes p2 WHERE p2.conversacion_id = c.id AND p2.usuario_id = $2 AND p2.activo)
            AND (SELECT COUNT(*) FROM chat_participantes p WHERE p.conversacion_id = c.id AND p.activo) = 2
          LIMIT 1`,
        [req.user.id, otroId]
      );
      if (existente.length > 0) {
        await db.query('COMMIT');
        return res.json({ success: true, data: { id: existente[0].id, reutilizada: true } });
      }
    }

    const { rows } = await db.query(
      `INSERT INTO chat_conversaciones (tipo, nombre, creado_por)
       VALUES ($1, $2, $3)
       RETURNING id, tipo, nombre, creado_por, created_at, updated_at`,
      [tipo, tipo === 'GRUPO' ? String(req.body.nombre).trim() : null, req.user.id]
    );
    const conversacion = rows[0];

    const todosLosIds = [req.user.id, ...idsDestino];
    for (const uid of todosLosIds) {
      await db.query(
        `INSERT INTO chat_participantes (conversacion_id, usuario_id, activo)
         VALUES ($1, $2, true)
         ON CONFLICT (conversacion_id, usuario_id) DO UPDATE SET activo = true`,
        [conversacion.id, uid]
      );
    }

    await db.query('COMMIT');

    // Avisa a los invitados (menos a quien la creó) que tienen un chat nuevo.
    emitirAParticipantes(idsDestino, 'chat:conversacion_nueva', { conversacionId: conversacion.id });

    res.status(201).json({ success: true, data: { ...conversacion, reutilizada: false } });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[chat.crearConversacion]', error);
    res.status(500).json({ success: false, error: 'No se pudo crear la conversación' });
  } finally {
    db.release();
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// MENSAJES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/chat/conversaciones/:conversacionId/mensajes?antes=&limit=
 * Devuelve mensajes en orden cronológico ascendente (los más viejos primero),
 * listos para pintar de arriba hacia abajo. `antes` pagina hacia atrás.
 */
exports.listarMensajes = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const antes = parseInt(req.query.antes, 10);

    const params = [req.conversacion.id];
    let condicionAntes = '';
    if (Number.isInteger(antes) && antes > 0) {
      params.push(antes);
      condicionAntes = `AND m.id < $${params.length}`;
    }
    params.push(limit);

    const { rows } = await pool.query(
      `SELECT m.id, m.usuario_id, m.contenido, m.created_at,
              u.usuario, u.nombres, u.apellidos
         FROM chat_mensajes m
         JOIN usuarios u ON u.id = m.usuario_id
        WHERE m.conversacion_id = $1 AND NOT m.eliminado ${condicionAntes}
        ORDER BY m.id DESC
        LIMIT $${params.length}`,
      params
    );

    const mensajes = rows.reverse().map(r => ({
      id: r.id,
      conversacionId: req.conversacion.id,
      usuarioId: r.usuario_id,
      autor: nombreCompleto(r),
      contenido: r.contenido,
      createdAt: r.created_at,
      esMio: r.usuario_id === req.user.id,
    }));

    res.json({ success: true, data: mensajes, hayMas: rows.length === limit });
  } catch (error) {
    console.error('[chat.listarMensajes]', error);
    res.status(500).json({ success: false, error: 'No se pudieron cargar los mensajes' });
  }
};

/** POST /api/chat/conversaciones/:conversacionId/mensajes  Body: { contenido } */
exports.enviarMensaje = async (req, res) => {
  try {
    const contenido = String(req.body.contenido || '').trim();
    if (!contenido) {
      return res.status(400).json({ success: false, error: 'El mensaje no puede estar vacío' });
    }
    if (contenido.length > 4000) {
      return res.status(400).json({ success: false, error: 'El mensaje admite máximo 4000 caracteres' });
    }

    const { rows } = await pool.query(
      `INSERT INTO chat_mensajes (conversacion_id, usuario_id, contenido)
       VALUES ($1, $2, $3)
       RETURNING id, usuario_id, contenido, created_at`,
      [req.conversacion.id, req.user.id, contenido]
    );
    const m = rows[0];

    // El autor nunca ve su propio mensaje como "no leído"
    await pool.query(
      `UPDATE chat_participantes SET ultimo_leido_id = $3
        WHERE conversacion_id = $1 AND usuario_id = $2`,
      [req.conversacion.id, req.user.id, m.id]
    );

    const { rows: participantes } = await pool.query(
      `SELECT usuario_id FROM chat_participantes WHERE conversacion_id = $1 AND activo`,
      [req.conversacion.id]
    );

    const mensaje = {
      id: m.id,
      conversacionId: req.conversacion.id,
      usuarioId: m.usuario_id,
      autor: nombreCompleto(req.user),
      contenido: m.contenido,
      createdAt: m.created_at,
    };

    emitirAParticipantes(
      participantes.map(p => p.usuario_id).filter(id => id !== req.user.id),
      'chat:mensaje',
      mensaje
    );

    res.status(201).json({ success: true, data: { ...mensaje, esMio: true } });
  } catch (error) {
    console.error('[chat.enviarMensaje]', error);
    res.status(500).json({ success: false, error: 'No se pudo enviar el mensaje' });
  }
};

/** PATCH /api/chat/conversaciones/:conversacionId/leido — marca todo como leído */
exports.marcarLeido = async (req, res) => {
  try {
    await pool.query(
      `UPDATE chat_participantes SET ultimo_leido_id = COALESCE(
          (SELECT MAX(id) FROM chat_mensajes WHERE conversacion_id = $1), ultimo_leido_id
       )
       WHERE conversacion_id = $1 AND usuario_id = $2`,
      [req.conversacion.id, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[chat.marcarLeido]', error);
    res.status(500).json({ success: false, error: 'No se pudo actualizar el estado de lectura' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// PARTICIPANTES (solo grupos)
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/chat/conversaciones/:conversacionId/participantes */
exports.listarParticipantes = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.usuario, u.nombres, u.apellidos, u.perfil, u.empresa, p.unido_en
         FROM chat_participantes p
         JOIN usuarios u ON u.id = p.usuario_id
        WHERE p.conversacion_id = $1 AND p.activo
        ORDER BY u.nombres, u.apellidos`,
      [req.conversacion.id]
    );
    res.json({
      success: true,
      data: rows.map(r => ({
        id: r.id, nombre: nombreCompleto(r), usuario: r.usuario,
        perfil: r.perfil, empresa: r.empresa, unidoEn: r.unido_en,
        esCreador: r.id === req.conversacion.creado_por,
      })),
    });
  } catch (error) {
    console.error('[chat.listarParticipantes]', error);
    res.status(500).json({ success: false, error: 'No se pudieron cargar los participantes' });
  }
};

/** POST /api/chat/conversaciones/:conversacionId/participantes  Body: { usuarioId } */
exports.agregarParticipante = async (req, res) => {
  try {
    if (req.conversacion.tipo !== 'GRUPO') {
      return res.status(400).json({ success: false, error: 'Solo se pueden agregar participantes a un grupo' });
    }

    const validacion = await validarParticipantes([req.body.usuarioId], req.user);
    if (!validacion.ok) {
      return res.status(400).json({ success: false, error: validacion.error });
    }
    const nuevo = validacion.usuarios[0];

    await pool.query(
      `INSERT INTO chat_participantes (conversacion_id, usuario_id, activo)
       VALUES ($1, $2, true)
       ON CONFLICT (conversacion_id, usuario_id) DO UPDATE SET activo = true`,
      [req.conversacion.id, nuevo.id]
    );

    emitirAUsuario(nuevo.id, 'chat:conversacion_nueva', { conversacionId: req.conversacion.id });
    res.json({ success: true, data: { id: nuevo.id, nombre: nombreCompleto(nuevo) } });
  } catch (error) {
    console.error('[chat.agregarParticipante]', error);
    res.status(500).json({ success: false, error: 'No se pudo agregar a esa persona' });
  }
};

/** DELETE /api/chat/conversaciones/:conversacionId/participantes/me — salir del grupo */
exports.salirDeGrupo = async (req, res) => {
  try {
    if (req.conversacion.tipo !== 'GRUPO') {
      return res.status(400).json({ success: false, error: 'No puedes salir de una conversación directa' });
    }

    await pool.query(
      `UPDATE chat_participantes SET activo = false WHERE conversacion_id = $1 AND usuario_id = $2`,
      [req.conversacion.id, req.user.id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[chat.salirDeGrupo]', error);
    res.status(500).json({ success: false, error: 'No se pudo salir del grupo' });
  }
};
