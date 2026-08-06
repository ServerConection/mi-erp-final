/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CONTROLADOR: Archivos Compartidos — contenido de la grilla
 * ═══════════════════════════════════════════════════════════════════════════════
 * Columnas, filas, celdas, historial e importación/exportación de Excel.
 *
 * Regla de oro del módulo: cada celda es su propia fila en BD. Dos personas
 * editando celdas distintas jamás se pisan; si editan la MISMA celda gana la
 * última escritura y todos ven el valor final al instante.
 */

const XLSX = require('xlsx');
const pool = require('../config/db');
const {
  registrarHistorial,
  emitirAHoja,
  normalizarValor,
} = require('../services/hojas.service');

const TIPOS = ['TEXTO', 'LISTA', 'FECHA', 'USUARIO'];

// ══════════════════════════════════════════════════════════════════════════════
// LECTURA COMPLETA
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/hojas/:hojaId
 * Devuelve la hoja entera: columnas, filas y celdas en un solo viaje.
 * Con hojas de hasta ~500 filas esto es más rápido que paginar.
 */
exports.detalle = async (req, res) => {
  try {
    const hojaId = req.hoja.id;

    const [columnas, filas, celdas, usuarios] = await Promise.all([
      pool.query(
        `SELECT id, nombre, tipo, opciones, orden, ancho, solo_lectura
           FROM hoj_columnas
          WHERE hoja_id = $1 AND activo
          ORDER BY orden, id`,
        [hojaId]
      ),
      pool.query(
        `SELECT f.id, f.orden, f.creado_por, f.created_at
           FROM hoj_filas f
          WHERE f.hoja_id = $1 AND f.activo
          ORDER BY f.orden, f.id`,
        [hojaId]
      ),
      pool.query(
        `SELECT c.fila_id, c.columna_id, c.valor, c.actualizado_por, c.updated_at
           FROM hoj_celdas c
           JOIN hoj_filas f ON f.id = c.fila_id
          WHERE f.hoja_id = $1 AND f.activo`,
        [hojaId]
      ),
      // Catálogo para pintar las columnas de tipo USUARIO sin un fetch extra
      pool.query(
        `SELECT id, usuario, nombres, apellidos
           FROM usuarios WHERE activo = 'SI' ORDER BY nombres, apellidos`
      ),
    ]);

    // Mapa fila → { columnaId: valor } para que el frontend no tenga que
    // recorrer un array plano en cada render.
    const valores = {};
    for (const c of celdas.rows) {
      if (!valores[c.fila_id]) valores[c.fila_id] = {};
      valores[c.fila_id][c.columna_id] = c.valor;
    }

    res.json({
      success: true,
      data: {
        hoja: {
          id:          req.hoja.id,
          nombre:      req.hoja.nombre,
          descripcion: req.hoja.descripcion,
          empresa:     req.hoja.empresa,
          color:       req.hoja.color,
          activo:      req.hoja.activo,
          creadoPor:   req.hoja.creado_por,
        },
        nivel:    req.nivel,
        columnas: columnas.rows.map(c => ({
          id:          c.id,
          nombre:      c.nombre,
          tipo:        c.tipo,
          opciones:    c.opciones || [],
          orden:       c.orden,
          ancho:       c.ancho,
          soloLectura: c.solo_lectura,
        })),
        filas: filas.rows.map(f => ({
          id:     f.id,
          orden:  f.orden,
          valores: valores[f.id] || {},
        })),
        usuarios: usuarios.rows.map(u => ({
          id:     u.id,
          nombre: [u.nombres, u.apellidos].filter(Boolean).join(' ').trim() || u.usuario,
        })),
      },
    });
  } catch (error) {
    console.error('[hojasDatos.detalle]', error);
    res.status(500).json({ success: false, error: 'No se pudo abrir el archivo' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// COLUMNAS  (solo el dueño define la estructura)
// ══════════════════════════════════════════════════════════════════════════════

/** POST /api/hojas/:hojaId/columnas */
exports.crearColumna = async (req, res) => {
  try {
    const { nombre, tipo, opciones, ancho, soloLectura } = req.body;

    if (!nombre || String(nombre).trim() === '') {
      return res.status(400).json({ success: false, error: 'La columna necesita un nombre' });
    }
    const tipoFinal = TIPOS.includes(tipo) ? tipo : 'TEXTO';
    if (tipoFinal === 'LISTA' && (!Array.isArray(opciones) || opciones.length === 0)) {
      return res.status(400).json({ success: false, error: 'Una columna de lista necesita al menos una opción' });
    }

    const { rows: max } = await pool.query(
      'SELECT COALESCE(MAX(orden), -1) + 1 AS siguiente FROM hoj_columnas WHERE hoja_id = $1',
      [req.hoja.id]
    );

    const { rows } = await pool.query(
      `INSERT INTO hoj_columnas (hoja_id, nombre, tipo, opciones, orden, ancho, solo_lectura)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
       RETURNING id, nombre, tipo, opciones, orden, ancho, solo_lectura`,
      [
        req.hoja.id,
        String(nombre).trim().slice(0, 100),
        tipoFinal,
        JSON.stringify(Array.isArray(opciones) ? opciones.map(String) : []),
        max[0].siguiente,
        parseInt(ancho, 10) || 180,
        soloLectura === true,
      ]
    );

    const columna = {
      id: rows[0].id, nombre: rows[0].nombre, tipo: rows[0].tipo,
      opciones: rows[0].opciones || [], orden: rows[0].orden,
      ancho: rows[0].ancho, soloLectura: rows[0].solo_lectura,
    };

    await registrarHistorial({
      hojaId: req.hoja.id, columnaId: columna.id, accion: 'COLUMNA_CREADA',
      valorNuevo: columna.nombre, usuarioId: req.user.id,
    });

    emitirAHoja(req.hoja.id, 'hoja:columna-creada', { columna, por: req.user.id });
    res.status(201).json({ success: true, data: columna });
  } catch (error) {
    console.error('[hojasDatos.crearColumna]', error);
    res.status(500).json({ success: false, error: 'No se pudo crear la columna' });
  }
};

/** PATCH /api/hojas/:hojaId/columnas/:columnaId */
exports.editarColumna = async (req, res) => {
  try {
    const columnaId = parseInt(req.params.columnaId, 10);
    const { nombre, opciones, ancho, soloLectura, orden } = req.body;

    const { rows } = await pool.query(
      `UPDATE hoj_columnas
          SET nombre       = COALESCE($3, nombre),
              opciones     = COALESCE($4::jsonb, opciones),
              ancho        = COALESCE($5, ancho),
              solo_lectura = COALESCE($6, solo_lectura),
              orden        = COALESCE($7, orden)
        WHERE id = $1 AND hoja_id = $2 AND activo
        RETURNING id, nombre, tipo, opciones, orden, ancho, solo_lectura`,
      [
        columnaId,
        req.hoja.id,
        nombre ? String(nombre).trim().slice(0, 100) : null,
        Array.isArray(opciones) ? JSON.stringify(opciones.map(String)) : null,
        ancho !== undefined ? parseInt(ancho, 10) : null,
        soloLectura !== undefined ? soloLectura === true : null,
        orden !== undefined ? parseInt(orden, 10) : null,
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Columna no encontrada' });
    }

    const columna = {
      id: rows[0].id, nombre: rows[0].nombre, tipo: rows[0].tipo,
      opciones: rows[0].opciones || [], orden: rows[0].orden,
      ancho: rows[0].ancho, soloLectura: rows[0].solo_lectura,
    };

    await registrarHistorial({
      hojaId: req.hoja.id, columnaId, accion: 'COLUMNA_EDITADA',
      valorNuevo: columna.nombre, usuarioId: req.user.id,
    });

    emitirAHoja(req.hoja.id, 'hoja:columna-editada', { columna, por: req.user.id });
    res.json({ success: true, data: columna });
  } catch (error) {
    console.error('[hojasDatos.editarColumna]', error);
    res.status(500).json({ success: false, error: 'No se pudo actualizar la columna' });
  }
};

/** DELETE /api/hojas/:hojaId/columnas/:columnaId — desactiva, no borra */
exports.eliminarColumna = async (req, res) => {
  try {
    const columnaId = parseInt(req.params.columnaId, 10);

    const { rows } = await pool.query(
      `UPDATE hoj_columnas SET activo = false
        WHERE id = $1 AND hoja_id = $2 AND activo
        RETURNING nombre`,
      [columnaId, req.hoja.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Columna no encontrada' });
    }

    await registrarHistorial({
      hojaId: req.hoja.id, columnaId, accion: 'COLUMNA_ELIMINADA',
      valorAnterior: rows[0].nombre, usuarioId: req.user.id,
    });

    emitirAHoja(req.hoja.id, 'hoja:columna-eliminada', { columnaId, por: req.user.id });
    res.json({ success: true });
  } catch (error) {
    console.error('[hojasDatos.eliminarColumna]', error);
    res.status(500).json({ success: false, error: 'No se pudo eliminar la columna' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// FILAS
// ══════════════════════════════════════════════════════════════════════════════

/** POST /api/hojas/:hojaId/filas — agrega una fila vacía al final */
exports.crearFila = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO hoj_filas (hoja_id, orden, creado_por)
       SELECT $1, COALESCE(MAX(orden), -1) + 1, $2
         FROM hoj_filas WHERE hoja_id = $1
       RETURNING id, orden`,
      [req.hoja.id, req.user.id]
    );

    const fila = { id: rows[0].id, orden: rows[0].orden, valores: {} };

    await registrarHistorial({
      hojaId: req.hoja.id, filaId: fila.id, accion: 'FILA_CREADA',
      usuarioId: req.user.id,
    });

    emitirAHoja(req.hoja.id, 'hoja:fila-creada', { fila, por: req.user.id });
    res.status(201).json({ success: true, data: fila });
  } catch (error) {
    console.error('[hojasDatos.crearFila]', error);
    res.status(500).json({ success: false, error: 'No se pudo agregar la fila' });
  }
};

/** DELETE /api/hojas/:hojaId/filas/:filaId — borrado lógico */
exports.eliminarFila = async (req, res) => {
  try {
    const filaId = req.params.filaId;

    const { rowCount } = await pool.query(
      'UPDATE hoj_filas SET activo = false WHERE id = $1 AND hoja_id = $2 AND activo',
      [filaId, req.hoja.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Fila no encontrada' });
    }

    await registrarHistorial({
      hojaId: req.hoja.id, filaId, accion: 'FILA_ELIMINADA', usuarioId: req.user.id,
    });

    emitirAHoja(req.hoja.id, 'hoja:fila-eliminada', { filaId: Number(filaId), por: req.user.id });
    res.json({ success: true });
  } catch (error) {
    console.error('[hojasDatos.eliminarFila]', error);
    res.status(500).json({ success: false, error: 'No se pudo eliminar la fila' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// CELDAS  ·  el endpoint más caliente del módulo
// ══════════════════════════════════════════════════════════════════════════════

/**
 * PUT /api/hojas/:hojaId/celdas
 * Body: { filaId, columnaId, valor }
 *
 * UPSERT sobre la PK compuesta: una sola query, sin leer-antes-de-escribir,
 * sin bloqueos. Es lo que permite que 10 personas escriban a la vez.
 */
exports.guardarCelda = async (req, res) => {
  try {
    const filaId    = req.body.filaId;
    const columnaId = parseInt(req.body.columnaId, 10);

    if (!filaId || !Number.isInteger(columnaId)) {
      return res.status(400).json({ success: false, error: 'Celda inválida' });
    }

    // La columna manda: define el tipo y si es de solo lectura.
    const { rows: cols } = await pool.query(
      `SELECT id, nombre, tipo, opciones, solo_lectura
         FROM hoj_columnas
        WHERE id = $1 AND hoja_id = $2 AND activo`,
      [columnaId, req.hoja.id]
    );
    if (cols.length === 0) {
      return res.status(404).json({ success: false, error: 'Columna no encontrada' });
    }
    const columna = cols[0];

    // Una columna bloqueada solo la toca el dueño de la hoja.
    if (columna.solo_lectura && !['ADMIN', 'DUENO'].includes(req.nivel)) {
      return res.status(403).json({ success: false, error: `"${columna.nombre}" es de solo lectura` });
    }

    // La fila tiene que pertenecer a ESTA hoja: sin esto, alguien con acceso a
    // una hoja podría escribir en filas de otra pasando un id ajeno.
    const { rows: filas } = await pool.query(
      'SELECT id FROM hoj_filas WHERE id = $1 AND hoja_id = $2 AND activo',
      [filaId, req.hoja.id]
    );
    if (filas.length === 0) {
      return res.status(404).json({ success: false, error: 'Fila no encontrada' });
    }

    const check = normalizarValor(req.body.valor, columna);
    if (!check.ok) {
      return res.status(400).json({ success: false, error: check.error });
    }

    // El CTE `previo` se evalúa contra el snapshot anterior al UPSERT, así que
    // devuelve el valor viejo de verdad — necesario para el historial.
    const { rows } = await pool.query(
      `WITH previo AS (
         SELECT valor FROM hoj_celdas WHERE fila_id = $1 AND columna_id = $2
       ),
       guardado AS (
         INSERT INTO hoj_celdas (fila_id, columna_id, valor, actualizado_por, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (fila_id, columna_id)
         DO UPDATE SET valor           = EXCLUDED.valor,
                       actualizado_por = EXCLUDED.actualizado_por,
                       updated_at      = now()
         RETURNING valor, updated_at
       )
       SELECT g.valor, g.updated_at, (SELECT valor FROM previo) AS previo
         FROM guardado g`,
      [filaId, columnaId, check.valor, req.user.id]
    );

    await registrarHistorial({
      hojaId: req.hoja.id, filaId, columnaId, accion: 'CELDA_EDITADA',
      valorAnterior: rows[0].previo, valorNuevo: check.valor, usuarioId: req.user.id,
    });

    // Los demás ven el cambio sin recargar. El que lo escribió se ignora a sí
    // mismo en el frontend leyendo `por`.
    emitirAHoja(req.hoja.id, 'hoja:celda', {
      filaId: Number(filaId),
      columnaId,
      valor: check.valor,
      por: req.user.id,
      porNombre: req.user.usuario,
      ts: rows[0].updated_at,
    });

    res.json({ success: true, data: { filaId: Number(filaId), columnaId, valor: check.valor } });
  } catch (error) {
    console.error('[hojasDatos.guardarCelda]', error);
    res.status(500).json({ success: false, error: 'No se pudo guardar el cambio' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// HISTORIAL
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/hojas/:hojaId/historial?limite=100 */
exports.historial = async (req, res) => {
  try {
    const limite = Math.min(parseInt(req.query.limite, 10) || 100, 500);

    const { rows } = await pool.query(
      `SELECT h.id, h.fila_id, h.columna_id, h.accion,
              h.valor_anterior, h.valor_nuevo, h.created_at,
              u.usuario, u.nombres, u.apellidos,
              c.nombre AS columna_nombre
         FROM hoj_historial h
         LEFT JOIN usuarios     u ON u.id = h.usuario_id
         LEFT JOIN hoj_columnas c ON c.id = h.columna_id
        WHERE h.hoja_id = $1
        ORDER BY h.created_at DESC
        LIMIT $2`,
      [req.hoja.id, limite]
    );

    res.json({
      success: true,
      data: rows.map(r => ({
        id:            r.id,
        accion:        r.accion,
        filaId:        r.fila_id,
        columna:       r.columna_nombre,
        valorAnterior: r.valor_anterior,
        valorNuevo:    r.valor_nuevo,
        usuario:       [r.nombres, r.apellidos].filter(Boolean).join(' ').trim() || r.usuario || 'Sistema',
        fecha:         r.created_at,
      })),
    });
  } catch (error) {
    console.error('[hojasDatos.historial]', error);
    res.status(500).json({ success: false, error: 'No se pudo cargar el historial' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// EXCEL
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/hojas/:hojaId/exportar — descarga .xlsx */
exports.exportar = async (req, res) => {
  try {
    const hojaId = req.hoja.id;

    const [columnas, filas, celdas, usuarios] = await Promise.all([
      pool.query('SELECT id, nombre, tipo FROM hoj_columnas WHERE hoja_id = $1 AND activo ORDER BY orden, id', [hojaId]),
      pool.query('SELECT id FROM hoj_filas WHERE hoja_id = $1 AND activo ORDER BY orden, id', [hojaId]),
      pool.query(
        `SELECT c.fila_id, c.columna_id, c.valor
           FROM hoj_celdas c JOIN hoj_filas f ON f.id = c.fila_id
          WHERE f.hoja_id = $1 AND f.activo`,
        [hojaId]
      ),
      pool.query(`SELECT id, usuario, nombres, apellidos FROM usuarios`),
    ]);

    const nombreUsuario = new Map(
      usuarios.rows.map(u => [
        String(u.id),
        [u.nombres, u.apellidos].filter(Boolean).join(' ').trim() || u.usuario,
      ])
    );

    const valores = {};
    for (const c of celdas.rows) {
      if (!valores[c.fila_id]) valores[c.fila_id] = {};
      valores[c.fila_id][c.columna_id] = c.valor;
    }

    const datos = filas.rows.map(f => {
      const registro = {};
      for (const col of columnas.rows) {
        const bruto = valores[f.id]?.[col.id] ?? '';
        // En el Excel el usuario quiere leer nombres, no ids.
        registro[col.nombre] = col.tipo === 'USUARIO' && bruto
          ? (nombreUsuario.get(String(bruto)) || bruto)
          : bruto;
      }
      return registro;
    });

    const libro = XLSX.utils.book_new();
    const pagina = XLSX.utils.json_to_sheet(
      datos.length > 0 ? datos : [Object.fromEntries(columnas.rows.map(c => [c.nombre, '']))]
    );
    pagina['!cols'] = columnas.rows.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(libro, pagina, 'Datos');

    const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
    const archivo = `${req.hoja.nombre.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, '_').slice(0, 60)}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(archivo)}"`);
    res.send(buffer);
  } catch (error) {
    console.error('[hojasDatos.exportar]', error);
    res.status(500).json({ success: false, error: 'No se pudo generar el Excel' });
  }
};

/**
 * POST /api/hojas/:hojaId/importar   (multipart, campo "archivo")
 * Agrega filas al final. No borra lo que ya está: importar nunca destruye.
 * Solo se leen las columnas del Excel cuyo encabezado coincida con una columna
 * existente de la hoja; el resto se ignora.
 */
exports.importar = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });
  }

  const db = await pool.connect();
  try {
    const libro  = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false });
    const pagina = libro.Sheets[libro.SheetNames[0]];
    if (!pagina) {
      return res.status(400).json({ success: false, error: 'El archivo no tiene hojas' });
    }

    const registros = XLSX.utils.sheet_to_json(pagina, { defval: '', raw: false });
    if (registros.length === 0) {
      return res.status(400).json({ success: false, error: 'El archivo está vacío' });
    }
    if (registros.length > 2000) {
      return res.status(400).json({ success: false, error: 'Máximo 2000 filas por importación' });
    }

    const { rows: columnas } = await db.query(
      'SELECT id, nombre, tipo, opciones FROM hoj_columnas WHERE hoja_id = $1 AND activo ORDER BY orden',
      [req.hoja.id]
    );

    const porNombre = new Map(columnas.map(c => [c.nombre.trim().toLowerCase(), c]));

    await db.query('BEGIN');

    const { rows: base } = await db.query(
      'SELECT COALESCE(MAX(orden), -1) AS ultimo FROM hoj_filas WHERE hoja_id = $1',
      [req.hoja.id]
    );
    let orden = Number(base[0].ultimo) + 1;

    let filasCreadas = 0;
    const omitidos = [];

    for (const registro of registros) {
      const { rows: nueva } = await db.query(
        'INSERT INTO hoj_filas (hoja_id, orden, creado_por) VALUES ($1, $2, $3) RETURNING id',
        [req.hoja.id, orden++, req.user.id]
      );
      const filaId = nueva[0].id;
      filasCreadas++;

      for (const [encabezado, bruto] of Object.entries(registro)) {
        const columna = porNombre.get(String(encabezado).trim().toLowerCase());
        if (!columna || bruto === '' || bruto === null) continue;

        const check = normalizarValor(bruto, columna);
        if (!check.ok) {
          // Un valor malo no aborta la importación entera: se anota y sigue.
          if (omitidos.length < 20) omitidos.push(`Fila ${filasCreadas}: ${check.error}`);
          continue;
        }
        if (check.valor === null) continue;

        await db.query(
          `INSERT INTO hoj_celdas (fila_id, columna_id, valor, actualizado_por)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (fila_id, columna_id)
           DO UPDATE SET valor = EXCLUDED.valor`,
          [filaId, columna.id, check.valor, req.user.id]
        );
      }
    }

    await registrarHistorial({
      hojaId: req.hoja.id, accion: 'IMPORTACION',
      valorNuevo: `${filasCreadas} filas desde ${req.file.originalname}`,
      usuarioId: req.user.id,
    }, db);

    await db.query('COMMIT');

    // Todos recargan la hoja: es más simple y fiable que emitir 2000 eventos.
    emitirAHoja(req.hoja.id, 'hoja:recargar', { motivo: 'importacion', por: req.user.id });

    res.json({
      success: true,
      data: { filasCreadas, omitidos },
      mensaje: `Se importaron ${filasCreadas} filas`,
    });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[hojasDatos.importar]', error);
    res.status(500).json({ success: false, error: 'No se pudo importar el archivo' });
  } finally {
    db.release();
  }
};
