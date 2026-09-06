/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CONTROLADOR: Archivos Compartidos — hojas y permisos
 * ═══════════════════════════════════════════════════════════════════════════════
 * Aquí vive el ciclo de vida de la hoja (crear, listar, editar, archivar) y el
 * reparto de permisos. El contenido de la grilla está en hojasDatos.controller.
 *
 * Los permisos YA fueron resueltos por el middleware: estos handlers leen
 * req.hoja y req.nivel y no vuelven a preguntar.
 */

const pool = require('../config/db');
const { registrarHistorial, emitirAHoja } = require('../services/hojas.service');

const nombreCompleto = (r) =>
  [r.nombres, r.apellidos].filter(Boolean).join(' ').trim() || r.usuario;

// ══════════════════════════════════════════════════════════════════════════════
// LISTADO
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/hojas
 * Devuelve las hojas que este usuario puede abrir, con su nivel de acceso.
 * El ADMINISTRADOR recibe todas, incluidas las archivadas.
 */
exports.listar = async (req, res) => {
  try {
    const { id: usuarioId, perfil } = req.user;
    const esAdmin = perfil === 'ADMINISTRADOR';
    const incluirArchivadas = esAdmin && req.query.archivadas === 'true';

    // ── Segmentación ────────────────────────────────────────────────────────
    // Antes la lista salía entera y el único filtro era un buscador de texto
    // en el navegador. Con decenas de archivos eso es "todo contra todo": no
    // se puede responder "qué se creó esta semana" ni "qué subió tal persona".
    // Los filtros van en SQL, no en el cliente, para que sirvan igual cuando
    // haya cientos de archivos.
    const cond = ['(h.activo OR $3::boolean)', '($2::boolean OR h.creado_por = $1 OR p.id IS NOT NULL)'];
    const params = [usuarioId, esAdmin, incluirArchivadas];
    const agregar = (sql, valor) => { params.push(valor); cond.push(sql.replace('$?', '$' + params.length)); };

    // Sobre qué fecha filtrar: cuándo se creó (default) o cuándo se tocó por última vez.
    const campo = req.query.campoFecha === 'modificacion' ? 'h.updated_at' : 'h.created_at';
    if (req.query.desde) agregar(`${campo} >= $?::date`, req.query.desde);
    // 'hasta' es inclusive: el usuario que pone el día de hoy espera ver lo de hoy.
    if (req.query.hasta) agregar(`${campo} < ($?::date + INTERVAL '1 day')`, req.query.hasta);

    const creadoPor = parseInt(req.query.creadoPor, 10);
    if (Number.isInteger(creadoPor) && creadoPor > 0) agregar('h.creado_por = $?::int', creadoPor);

    if (req.query.empresa) agregar('UPPER(h.empresa) = UPPER($?)', String(req.query.empresa).trim());

    // El buscador de texto pasa al servidor: filtrar en el navegador solo
    // funciona mientras quepan todos los archivos en memoria.
    const q = (req.query.q || '').trim();
    if (q) {
      params.push(`%${q}%`);
      cond.push(`(h.nombre ILIKE $${params.length} OR h.descripcion ILIKE $${params.length})`);
    }

    const { rows } = await pool.query(
      `SELECT h.id, h.nombre, h.descripcion, h.empresa, h.color,
              h.creado_por, h.activo, h.created_at, h.updated_at,
              h.archivado_at,
              u.usuario, u.nombres, u.apellidos,
              ua.usuario AS arch_usuario, ua.nombres AS arch_nombres, ua.apellidos AS arch_apellidos,
              ult.usuario AS ult_usuario, ult.nombres AS ult_nombres, ult.apellidos AS ult_apellidos,
              ult.fecha   AS ult_fecha,   ult.accion  AS ult_accion,
              CASE
                WHEN $2::boolean          THEN 'ADMIN'
                WHEN h.creado_por = $1    THEN 'DUENO'
                ELSE COALESCE(p.nivel, 'LECTOR')
              END AS nivel,
              (SELECT COUNT(*) FROM hoj_filas    f WHERE f.hoja_id = h.id AND f.activo) AS total_filas,
              (SELECT COUNT(*) FROM hoj_columnas c WHERE c.hoja_id = h.id AND c.activo) AS total_columnas,
              (SELECT COUNT(*) FROM hoj_permisos pp WHERE pp.hoja_id = h.id)            AS total_compartidos
         FROM hoj_hojas h
         JOIN usuarios  u ON u.id = h.creado_por
         LEFT JOIN usuarios ua ON ua.id = h.archivado_por
         LEFT JOIN hoj_permisos p
                ON p.hoja_id = h.id AND p.usuario_id = $1
         -- Última acción registrada sobre la hoja: es lo que responde
         -- "quién la tocó por última vez y cuándo", que updated_at por sí solo no dice.
         LEFT JOIN LATERAL (
              SELECT uu.usuario, uu.nombres, uu.apellidos,
                     hh.created_at AS fecha, hh.accion
                FROM hoj_historial hh
                LEFT JOIN usuarios uu ON uu.id = hh.usuario_id
               WHERE hh.hoja_id = h.id
               ORDER BY hh.created_at DESC
               LIMIT 1
         ) ult ON true
        WHERE ${cond.join('\n          AND ')}
        ORDER BY h.updated_at DESC`,
      params
    );

    res.json({
      success: true,
      puedeCrear: req.puedeCrearHojas === true,
      data: rows.map(r => ({
        id:                r.id,
        nombre:            r.nombre,
        descripcion:       r.descripcion,
        empresa:           r.empresa,
        color:             r.color,
        activo:            r.activo,
        nivel:             r.nivel,
        creador:           nombreCompleto(r),
        creadorId:         r.creado_por,
        esMio:             r.creado_por === usuarioId,
        totalFilas:        Number(r.total_filas),
        totalColumnas:     Number(r.total_columnas),
        totalCompartidos:  Number(r.total_compartidos),
        createdAt:         r.created_at,
        updatedAt:         r.updated_at,
        // Trazabilidad visible en la tarjeta, sin tener que abrir el archivo.
        ultimaAccion:      r.ult_accion || null,
        modificadoPor:     r.ult_usuario
          ? ([r.ult_nombres, r.ult_apellidos].filter(Boolean).join(' ').trim() || r.ult_usuario)
          : null,
        modificadoAt:      r.ult_fecha || null,
        archivadoPor:      r.arch_usuario
          ? ([r.arch_nombres, r.arch_apellidos].filter(Boolean).join(' ').trim() || r.arch_usuario)
          : null,
        archivadoAt:       r.archivado_at || null,
      })),
    });
  } catch (error) {
    console.error('[hojas.listar]', error);
    res.status(500).json({ success: false, error: 'No se pudo cargar la lista de archivos' });
  }
};

/**
 * GET /api/hojas/filtros
 * Valores reales para los desplegables del panel: solo aparecen las personas y
 * las empresas que de verdad tienen archivos que ESTE usuario puede ver. Un
 * desplegable con gente que no tiene archivos no ayuda, y uno con archivos
 * ajenos filtra información.
 */
exports.opcionesFiltro = async (req, res) => {
  try {
    const { id: usuarioId, perfil } = req.user;
    const esAdmin = perfil === 'ADMINISTRADOR';
    const params = [usuarioId, esAdmin];

    const [creadores, empresas] = await Promise.all([
      pool.query(
        `SELECT DISTINCT u.id, u.usuario, u.nombres, u.apellidos
           FROM hoj_hojas h
           JOIN usuarios u ON u.id = h.creado_por
           LEFT JOIN hoj_permisos p ON p.hoja_id = h.id AND p.usuario_id = $1
          WHERE h.activo
            AND ($2::boolean OR h.creado_por = $1 OR p.id IS NOT NULL)`,
        params
      ),
      pool.query(
        `SELECT DISTINCT h.empresa
           FROM hoj_hojas h
           LEFT JOIN hoj_permisos p ON p.hoja_id = h.id AND p.usuario_id = $1
          WHERE h.activo
            AND ($2::boolean OR h.creado_por = $1 OR p.id IS NOT NULL)
            AND h.empresa IS NOT NULL AND h.empresa <> ''
          ORDER BY 1`,
        params
      ),
    ]);

    res.json({
      success: true,
      creadores: creadores.rows
        .map(r => ({ id: r.id, nombre: nombreCompleto(r) }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
      empresas: empresas.rows.map(r => r.empresa),
    });
  } catch (error) {
    console.error('[hojas.opcionesFiltro]', error);
    res.status(500).json({ success: false, error: 'No se pudieron cargar los filtros' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// AUDITORÍA GENERAL
// ══════════════════════════════════════════════════════════════════════════════

// Etiquetas legibles. La bitácora guarda códigos; una pantalla para personas
// no debería mostrar "CELDA_EDITADA".
const ETIQUETA_ACCION = {
  HOJA_CREADA:       'Creó el archivo',
  HOJA_EDITADA:      'Editó los datos del archivo',
  HOJA_ARCHIVADA:    'Archivó el archivo',
  HOJA_DESARCHIVADA: 'Restauró el archivo',
  COLUMNA_CREADA:    'Agregó una columna',
  COLUMNA_EDITADA:   'Editó una columna',
  COLUMNA_ELIMINADA: 'Eliminó una columna',
  FILA_CREADA:       'Agregó una fila',
  FILA_ELIMINADA:    'Eliminó una fila',
  CELDA_EDITADA:     'Editó una celda',
  PERMISO_OTORGADO:  'Dio acceso a alguien',
  PERMISO_REVOCADO:  'Quitó el acceso a alguien',
  IMPORTACION:       'Importó un Excel',
  EXPORTACION:       'Descargó el archivo',
};

/**
 * GET /api/hojas/auditoria
 * Bitácora CRUZANDO todos los archivos: quién hizo qué y cuándo.
 *
 * Solo aparecen los archivos que este usuario ya podía abrir — el panel no
 * puede convertirse en una puerta trasera para ver movimientos de archivos
 * ajenos. El ADMINISTRADOR ve todo, igual que en el resto del módulo.
 *
 * Con ?formato=csv devuelve el mismo resultado como archivo descargable.
 */
exports.auditoria = async (req, res) => {
  try {
    const { id: usuarioId, perfil } = req.user;
    const esAdmin = perfil === 'ADMINISTRADOR';

    const cond = ['($2::boolean OR h.creado_por = $1 OR p.id IS NOT NULL)'];
    const params = [usuarioId, esAdmin];
    const agregar = (sql, valor) => { params.push(valor); cond.push(sql.replace('$?', '$' + params.length)); };

    if (req.query.desde) agregar('hh.created_at >= $?::date', req.query.desde);
    if (req.query.hasta) agregar("hh.created_at < ($?::date + INTERVAL '1 day')", req.query.hasta);

    const quien = parseInt(req.query.usuarioId, 10);
    if (Number.isInteger(quien) && quien > 0) agregar('hh.usuario_id = $?::int', quien);

    const hojaId = parseInt(req.query.hojaId, 10);
    if (Number.isInteger(hojaId) && hojaId > 0) agregar('hh.hoja_id = $?::int', hojaId);

    // Solo se aceptan acciones conocidas: evita que un parámetro raro cuele
    // texto en la consulta y de paso avisa si el filtro está mal escrito.
    if (req.query.accion && ETIQUETA_ACCION[req.query.accion]) agregar('hh.accion = $?', req.query.accion);

    const csv = req.query.formato === 'csv';
    const limite = csv ? 5000 : Math.min(parseInt(req.query.limite, 10) || 100, 500);
    const desplazamiento = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const sql = `
      SELECT hh.id, hh.accion, hh.created_at, hh.valor_anterior, hh.valor_nuevo,
             hh.hoja_id, h.nombre AS hoja_nombre, h.empresa,
             c.nombre AS columna_nombre,
             u.usuario, u.nombres, u.apellidos
        FROM hoj_historial hh
        JOIN hoj_hojas h ON h.id = hh.hoja_id
        LEFT JOIN hoj_permisos p ON p.hoja_id = h.id AND p.usuario_id = $1
        LEFT JOIN usuarios     u ON u.id = hh.usuario_id
        LEFT JOIN hoj_columnas c ON c.id = hh.columna_id
       WHERE ${cond.join('\n         AND ')}
       ORDER BY hh.created_at DESC
       LIMIT ${limite} OFFSET ${desplazamiento}`;

    const { rows } = await pool.query(sql, params);

    const registros = rows.map(r => ({
      id:            r.id,
      fecha:         r.created_at,
      usuario:       [r.nombres, r.apellidos].filter(Boolean).join(' ').trim() || r.usuario || 'Sistema',
      accion:        r.accion,
      accionTexto:   ETIQUETA_ACCION[r.accion] || r.accion,
      hojaId:        r.hoja_id,
      archivo:       r.hoja_nombre,
      empresa:       r.empresa,
      columna:       r.columna_nombre,
      valorAnterior: r.valor_anterior,
      valorNuevo:    r.valor_nuevo,
    }));

    if (csv) {
      const escapar = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const cabecera = ['Fecha', 'Usuario', 'Accion', 'Archivo', 'Empresa', 'Columna', 'Valor anterior', 'Valor nuevo'];
      const lineas = registros.map(r => [
        new Date(r.fecha).toISOString(), r.usuario, r.accionTexto,
        r.archivo, r.empresa, r.columna, r.valorAnterior, r.valorNuevo,
      ].map(escapar).join(';'));
      // BOM para que Excel en español abra los acentos bien.
      const contenido = '\uFEFF' + [cabecera.map(escapar).join(';'), ...lineas].join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="auditoria-archivos.csv"');
      return res.send(contenido);
    }

    res.json({
      success: true,
      data: registros,
      acciones: Object.entries(ETIQUETA_ACCION).map(([valor, texto]) => ({ valor, texto })),
      hayMas: registros.length === limite,
    });
  } catch (error) {
    console.error('[hojas.auditoria]', error);
    res.status(500).json({ success: false, error: 'No se pudo cargar la auditoría' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// CREAR
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/hojas
 * Crea la hoja y sus columnas iniciales en una sola transacción: nunca queda
 * una hoja huérfana sin estructura.
 */
exports.crear = async (req, res) => {
  const { nombre, descripcion, empresa, color, columnas } = req.body;

  if (!nombre || String(nombre).trim().length < 3) {
    return res.status(400).json({ success: false, error: 'El nombre debe tener al menos 3 caracteres' });
  }

  const db = await pool.connect();
  try {
    await db.query('BEGIN');

    const { rows } = await db.query(
      `INSERT INTO hoj_hojas (nombre, descripcion, empresa, color, creado_por)
       VALUES ($1, $2, $3, COALESCE($4, '#2563EB'), $5)
       RETURNING id, nombre, descripcion, empresa, color, activo, created_at, updated_at`,
      [
        String(nombre).trim(),
        descripcion ? String(descripcion).trim() : null,
        empresa ? String(empresa).toUpperCase() : req.user.empresa,
        color || null,
        req.user.id,
      ]
    );
    const hoja = rows[0];

    // Sin columnas explícitas arrancamos con una estructura mínima usable
    // en vez de una hoja en blanco que no deja escribir nada.
    const definicion = Array.isArray(columnas) && columnas.length > 0
      ? columnas
      : [{ nombre: 'Detalle', tipo: 'TEXTO' }, { nombre: 'Fecha', tipo: 'FECHA' }];

    for (let i = 0; i < definicion.length; i++) {
      const c = definicion[i];
      await db.query(
        `INSERT INTO hoj_columnas (hoja_id, nombre, tipo, opciones, orden, ancho, solo_lectura)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
        [
          hoja.id,
          String(c.nombre || `Columna ${i + 1}`).slice(0, 100),
          ['TEXTO', 'LISTA', 'FECHA', 'USUARIO'].includes(c.tipo) ? c.tipo : 'TEXTO',
          JSON.stringify(Array.isArray(c.opciones) ? c.opciones : []),
          i,
          parseInt(c.ancho, 10) || 180,
          c.soloLectura === true,
        ]
      );
    }

    await registrarHistorial({
      hojaId: hoja.id, accion: 'HOJA_CREADA',
      valorNuevo: hoja.nombre, usuarioId: req.user.id,
    }, db);

    await db.query('COMMIT');
    res.status(201).json({ success: true, data: { ...hoja, nivel: 'DUENO' } });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[hojas.crear]', error);
    res.status(500).json({ success: false, error: 'No se pudo crear el archivo' });
  } finally {
    db.release();
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// EDITAR / ARCHIVAR
// ══════════════════════════════════════════════════════════════════════════════

/** PATCH /api/hojas/:hojaId  — solo el dueño (o admin) */
exports.editar = async (req, res) => {
  try {
    const { nombre, descripcion, color } = req.body;

    const { rows } = await pool.query(
      `UPDATE hoj_hojas
          SET nombre      = COALESCE($2, nombre),
              descripcion = COALESCE($3, descripcion),
              color       = COALESCE($4, color),
              updated_at  = now()
        WHERE id = $1
        RETURNING id, nombre, descripcion, empresa, color, activo, updated_at`,
      [
        req.hoja.id,
        nombre ? String(nombre).trim() : null,
        descripcion !== undefined ? String(descripcion || '').trim() : null,
        color || null,
      ]
    );

    await registrarHistorial({
      hojaId: req.hoja.id, accion: 'HOJA_EDITADA',
      valorAnterior: req.hoja.nombre, valorNuevo: rows[0].nombre,
      usuarioId: req.user.id,
    });

    emitirAHoja(req.hoja.id, 'hoja:actualizada', rows[0]);
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('[hojas.editar]', error);
    res.status(500).json({ success: false, error: 'No se pudo actualizar el archivo' });
  }
};

/** PATCH /api/hojas/:hojaId/archivar  — borrado lógico, reversible */
exports.archivar = async (req, res) => {
  try {
    const archivar = req.body.archivar !== false;

    // Archivar saca el archivo del panel de todo el mundo y hasta ahora no
    // dejaba rastro de quién lo hizo: quedaba como si se hubiera esfumado.
    await pool.query(
      `UPDATE hoj_hojas
          SET activo        = $2,
              updated_at    = now(),
              archivado_por = CASE WHEN $3::boolean THEN $4::int ELSE NULL END,
              archivado_at  = CASE WHEN $3::boolean THEN now()   ELSE NULL END
        WHERE id = $1`,
      [req.hoja.id, !archivar, archivar, req.user.id]
    );

    await registrarHistorial({
      hojaId: req.hoja.id,
      accion: archivar ? 'HOJA_ARCHIVADA' : 'HOJA_DESARCHIVADA',
      valorNuevo: req.hoja.nombre,
      usuarioId: req.user.id,
    });

    emitirAHoja(req.hoja.id, 'hoja:archivada', { hojaId: req.hoja.id, archivada: archivar });
    res.json({ success: true, data: { id: req.hoja.id, activo: !archivar } });
  } catch (error) {
    console.error('[hojas.archivar]', error);
    res.status(500).json({ success: false, error: 'No se pudo archivar el archivo' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// PERMISOS
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/hojas/:hojaId/permisos */
exports.listarPermisos = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.usuario_id, p.nivel, p.created_at,
              u.usuario, u.nombres, u.apellidos, u.perfil, u.empresa
         FROM hoj_permisos p
         JOIN usuarios u ON u.id = p.usuario_id
        WHERE p.hoja_id = $1
        ORDER BY u.nombres, u.apellidos`,
      [req.hoja.id]
    );

    res.json({
      success: true,
      data: {
        creador: {
          id:     req.hoja.creado_por,
          nombre: [req.hoja.creador_nombres, req.hoja.creador_apellidos]
                    .filter(Boolean).join(' ').trim() || req.hoja.creador_usuario,
        },
        invitados: rows.map(r => ({
          id:        r.id,
          usuarioId: r.usuario_id,
          nombre:    nombreCompleto(r),
          usuario:   r.usuario,
          perfil:    r.perfil,
          empresa:   r.empresa,
          nivel:     r.nivel,
        })),
      },
    });
  } catch (error) {
    console.error('[hojas.listarPermisos]', error);
    res.status(500).json({ success: false, error: 'No se pudieron cargar los permisos' });
  }
};

/**
 * PUT /api/hojas/:hojaId/permisos
 * Body: { usuarioId, nivel: 'EDITOR' | 'LECTOR' }
 * Sirve para invitar y para cambiar el nivel de alguien ya invitado.
 */
exports.otorgarPermiso = async (req, res) => {
  try {
    const usuarioId = parseInt(req.body.usuarioId, 10);
    const nivel     = String(req.body.nivel || 'LECTOR').toUpperCase();

    if (!Number.isInteger(usuarioId)) {
      return res.status(400).json({ success: false, error: 'Usuario inválido' });
    }
    if (!['EDITOR', 'LECTOR'].includes(nivel)) {
      return res.status(400).json({ success: false, error: 'El nivel debe ser EDITOR o LECTOR' });
    }
    if (usuarioId === req.hoja.creado_por) {
      return res.status(400).json({ success: false, error: 'El creador ya tiene acceso total' });
    }

    const existe = await pool.query('SELECT id FROM usuarios WHERE id = $1 AND activo = $2', [usuarioId, 'SI']);
    if (existe.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado o desactivado' });
    }

    const { rows } = await pool.query(
      `INSERT INTO hoj_permisos (hoja_id, usuario_id, nivel, otorgado_por)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (hoja_id, usuario_id)
       DO UPDATE SET nivel = EXCLUDED.nivel, otorgado_por = EXCLUDED.otorgado_por
       RETURNING id, usuario_id, nivel`,
      [req.hoja.id, usuarioId, nivel, req.user.id]
    );

    await registrarHistorial({
      hojaId: req.hoja.id, accion: 'PERMISO_OTORGADO',
      valorNuevo: `usuario ${usuarioId} → ${nivel}`, usuarioId: req.user.id,
    });

    // Si el invitado está conectado en ese momento, su vista se actualiza sola.
    emitirAHoja(req.hoja.id, 'hoja:permisos', { hojaId: req.hoja.id });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('[hojas.otorgarPermiso]', error);
    res.status(500).json({ success: false, error: 'No se pudo compartir el archivo' });
  }
};

/** DELETE /api/hojas/:hojaId/permisos/:usuarioId */
exports.revocarPermiso = async (req, res) => {
  try {
    const usuarioId = parseInt(req.params.usuarioId, 10);

    const { rowCount } = await pool.query(
      'DELETE FROM hoj_permisos WHERE hoja_id = $1 AND usuario_id = $2',
      [req.hoja.id, usuarioId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Ese usuario no tenía acceso' });
    }

    await registrarHistorial({
      hojaId: req.hoja.id, accion: 'PERMISO_REVOCADO',
      valorAnterior: `usuario ${usuarioId}`, usuarioId: req.user.id,
    });

    // Echa de la sala a quien acaba de perder el acceso, sin esperar a que
    // recargue la página.
    emitirAHoja(req.hoja.id, 'hoja:permisos', { hojaId: req.hoja.id, revocadoA: usuarioId });
    res.json({ success: true });
  } catch (error) {
    console.error('[hojas.revocarPermiso]', error);
    res.status(500).json({ success: false, error: 'No se pudo quitar el acceso' });
  }
};

/**
 * GET /api/hojas/usuarios
 * Catálogo para los selectores: a quién compartir y qué poner en las
 * columnas de tipo USUARIO.
 */
exports.usuariosDisponibles = async (req, res) => {
  try {
    const busqueda = (req.query.q || '').trim();

    const { rows } = await pool.query(
      `SELECT id, usuario, nombres, apellidos, perfil, empresa
         FROM usuarios
        WHERE activo = 'SI'
          AND ($1 = '' OR
               LOWER(COALESCE(nombres, '') || ' ' || COALESCE(apellidos, '') || ' ' || usuario)
               LIKE '%' || LOWER($1) || '%')
        ORDER BY nombres, apellidos
        LIMIT 300`,
      [busqueda]
    );

    res.json({
      success: true,
      data: rows.map(r => ({
        id:      r.id,
        nombre:  nombreCompleto(r),
        usuario: r.usuario,
        perfil:  r.perfil,
        empresa: r.empresa,
      })),
    });
  } catch (error) {
    console.error('[hojas.usuariosDisponibles]', error);
    res.status(500).json({ success: false, error: 'No se pudo cargar la lista de usuarios' });
  }
};
