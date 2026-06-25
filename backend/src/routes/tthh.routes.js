// src/routes/tthh.routes.js
// ============================================================
// Módulo TALENTO HUMANO (TTHH)
//
// GET  /api/tthh/productividad         — Rendimiento de asesores (datos de Backoffice/envios_ventas)
// GET  /api/tthh/metas                 — Metas mensuales configuradas
// POST /api/tthh/metas                 — Crear/actualizar meta (empresa + asesor opcional)
//
// GET    /api/tthh/documentos          — Listar documentos de control (filtros: tipo, empresa, codigo_asesor)
// POST   /api/tthh/documentos/upload   — Subir archivo, devuelve url
// POST   /api/tthh/documentos          — Crear registro de documento
// DELETE /api/tthh/documentos/:id      — Eliminar documento
//
// GET    /api/tthh/tabla/columnas      — Columnas de la "hoja compartida"
// POST   /api/tthh/tabla/columnas      — Nueva columna
// PUT    /api/tthh/tabla/columnas/:id  — Renombrar/reordenar columna
// DELETE /api/tthh/tabla/columnas/:id  — Eliminar columna
// GET    /api/tthh/tabla/filas         — Filas de la hoja
// POST   /api/tthh/tabla/filas         — Nueva fila
// PUT    /api/tthh/tabla/filas/:id     — Editar datos de una fila
// DELETE /api/tthh/tabla/filas/:id     — Eliminar fila
//
// Acceso: exclusivo perfil TTHH (soloTTHH). TTHH es transversal: ignora su
// propia empresa y siempre puede ver/filtrar Novonet y Velsa.
//
// NOTA productividad: por ahora se calcula solo sobre public.envios_ventas
// (tabla que también audita Backoffice para Novonet/Netlife). Si Velsa
// registra sus ventas en otra tabla, avisar para sumar esa fuente aquí.
// ============================================================

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const pool    = require('../config/db');
const { verificarToken, soloTTHH } = require('../middleware/auth');
const { subirArchivo, obtenerArchivo, configurado } = require('../utils/storageClient');

router.use(verificarToken, soloTTHH);

// ─── Almacenamiento de documentos de control ─────────────────────────────────
// En memoria — se reenvían al servidor de almacenamiento local (carpeta =
// código de asesor, o "generales" para documentos tipo GENERAL).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf'
      || file.mimetype.includes('word') || file.mimetype.includes('sheet')) cb(null, true);
    else cb(new Error('Formato no permitido. Usa imagen, PDF, Word o Excel.'));
  }
});

const soloCarpeta = (s) => String(s || '').trim().replace(/[^a-zA-Z0-9._-]/g, '_');

const t = (v) => (v === undefined || v === null || String(v).trim() === '') ? null : String(v).trim();

// ════════════════════════════════════════════════════════════════
// PRODUCTIVIDAD
// ════════════════════════════════════════════════════════════════

// ─── GET /api/tthh/productividad ─────────────────────────────────────────────
router.get('/productividad', async (req, res) => {
  try {
    const hoy = new Date();
    const anio = parseInt(req.query.anio) || hoy.getFullYear();
    const mes  = parseInt(req.query.mes)  || (hoy.getMonth() + 1);
    const empresaFiltro = (req.query.empresa || '').toUpperCase().trim(); // '' = todas (TTHH ve ambas)

    const { rows: ventas } = await pool.query(`
      SELECT
        codigo_asesor,
        distribuidor_autorizado,
        supervisor,
        COUNT(*)::int AS total_ventas,
        COUNT(*) FILTER (WHERE UPPER(venta_efectiva) IN ('SI','SÍ','EFECTIVA'))::int AS ventas_efectivas,
        COUNT(*) FILTER (WHERE UPPER(calidad_venta_analista) IN ('BUENA','EXCELENTE'))::int AS ventas_calidad_buena,
        COUNT(*) FILTER (WHERE UPPER(calidad_venta_analista) IN ('MALA','DEFICIENTE'))::int AS ventas_calidad_mala
      FROM public.envios_ventas
      WHERE estatus_envio != 'BORRADOR'
        AND EXTRACT(YEAR  FROM fecha_registro_sistema) = $1
        AND EXTRACT(MONTH FROM fecha_registro_sistema) = $2
        AND codigo_asesor IS NOT NULL
      GROUP BY codigo_asesor, distribuidor_autorizado, supervisor
      ORDER BY ventas_efectivas DESC
    `, [anio, mes]);

    const { rows: metas } = await pool.query(`SELECT empresa, codigo_asesor, meta_mensual FROM public.tthh_metas`);
    const metaDefault = { NOVONET: 10, VELSA: 10 };
    const metaPorAsesor = {};
    metas.forEach(m => {
      if (m.codigo_asesor) metaPorAsesor[`${m.empresa}__${m.codigo_asesor}`] = m.meta_mensual;
      else metaDefault[m.empresa] = m.meta_mensual;
    });

    // No tenemos un campo "empresa" directo en envios_ventas; se infiere por
    // distribuidor (igual que el resto del ERP) — si se necesita más precisión,
    // se puede ajustar este mapeo.
    const inferirEmpresa = (dist) => {
      const d = (dist || '').toUpperCase();
      if (d.includes('VELSA')) return 'VELSA';
      return 'NOVONET';
    };

    let data = ventas.map(v => {
      const empresa = inferirEmpresa(v.distribuidor_autorizado);
      const meta = metaPorAsesor[`${empresa}__${v.codigo_asesor}`] ?? metaDefault[empresa] ?? 10;
      return {
        ...v,
        empresa,
        meta_mensual: meta,
        productivo: v.ventas_efectivas >= meta,
      };
    });

    if (empresaFiltro) data = data.filter(d => d.empresa === empresaFiltro);

    res.json({ success: true, anio, mes, data });
  } catch (e) {
    console.error('[TTHH] productividad:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── GET /api/tthh/metas ─────────────────────────────────────────────────────
router.get('/metas', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM public.tthh_metas ORDER BY empresa, codigo_asesor NULLS FIRST`);
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('[TTHH] metas GET:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── POST /api/tthh/metas ────────────────────────────────────────────────────
// Crea o actualiza (upsert) la meta para una empresa (+ asesor opcional)
router.post('/metas', async (req, res) => {
  try {
    const { empresa, codigo_asesor, meta_mensual } = req.body;
    if (!empresa || !['NOVONET', 'VELSA'].includes(empresa.toUpperCase()))
      return res.status(400).json({ success: false, error: 'empresa debe ser NOVONET o VELSA' });
    if (!meta_mensual || isNaN(parseInt(meta_mensual)))
      return res.status(400).json({ success: false, error: 'meta_mensual es requerido y debe ser numérico' });

    const { rows } = await pool.query(`
      INSERT INTO public.tthh_metas (empresa, codigo_asesor, meta_mensual, actualizado_por, actualizado_en)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (empresa, codigo_asesor) DO UPDATE SET
        meta_mensual = EXCLUDED.meta_mensual,
        actualizado_por = EXCLUDED.actualizado_por,
        actualizado_en = NOW()
      RETURNING *
    `, [empresa.toUpperCase(), t(codigo_asesor), parseInt(meta_mensual), req.user.usuario]);

    res.json({ success: true, data: rows[0] });
  } catch (e) {
    console.error('[TTHH] metas POST:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
// DOCUMENTOS DE CONTROL
// ════════════════════════════════════════════════════════════════

router.post('/documentos/upload', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });
    if (!configurado()) {
      return res.status(503).json({ success: false, error: 'El servidor de almacenamiento local no está configurado todavía.' });
    }

    const tipo = (req.body.tipo || '').toUpperCase();
    const carpeta = tipo === 'ASESOR'
      ? soloCarpeta(req.body.codigo_asesor) || 'sin_asesor'
      : 'generales';

    const resultado = await subirArchivo({
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      carpeta,
    });

    const url = `/api/tthh/archivo/${resultado.carpeta}/${resultado.archivo}`;
    res.json({ success: true, url, nombre: req.file.originalname });
  } catch (e) {
    console.error('[TTHH] documentos upload:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── GET /api/tthh/archivo/:carpeta/:archivo ─────────────────────────────────
// Proxy autenticado (solo perfil TTHH, ya forzado por router.use arriba).
router.get('/archivo/:carpeta/:archivo', async (req, res) => {
  try {
    const { carpeta, archivo } = req.params;
    const { buffer, contentType } = await obtenerArchivo(carpeta, archivo);
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'private, max-age=0, no-store');
    res.send(buffer);
  } catch (e) {
    console.error('[TTHH] archivo:', e.message);
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

router.get('/documentos', async (req, res) => {
  try {
    const { tipo, empresa, codigo_asesor } = req.query;
    const where = [];
    const params = [];
    if (tipo) { params.push(tipo.toUpperCase()); where.push(`tipo = $${params.length}`); }
    if (empresa) { params.push(empresa.toUpperCase()); where.push(`(empresa = $${params.length} OR empresa IS NULL)`); }
    if (codigo_asesor) { params.push(codigo_asesor); where.push(`codigo_asesor = $${params.length}`); }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows } = await pool.query(`
      SELECT * FROM public.tthh_documentos
      ${whereClause}
      ORDER BY fecha_subida DESC
      LIMIT 500
    `, params);
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('[TTHH] documentos GET:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/documentos', async (req, res) => {
  try {
    const { tipo, empresa, codigo_asesor, nombre_asesor, categoria, titulo, descripcion, archivo_url } = req.body;
    if (!tipo || !['ASESOR', 'GENERAL'].includes(tipo.toUpperCase()))
      return res.status(400).json({ success: false, error: 'tipo debe ser ASESOR o GENERAL' });
    if (!titulo || !archivo_url)
      return res.status(400).json({ success: false, error: 'titulo y archivo_url son requeridos' });

    const { rows } = await pool.query(`
      INSERT INTO public.tthh_documentos
        (tipo, empresa, codigo_asesor, nombre_asesor, categoria, titulo, descripcion, archivo_url, subido_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      tipo.toUpperCase(), t(empresa), t(codigo_asesor), t(nombre_asesor),
      t(categoria), titulo.trim(), t(descripcion), archivo_url, req.user.usuario,
    ]);

    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    console.error('[TTHH] documentos POST:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/documentos/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`DELETE FROM public.tthh_documentos WHERE id = $1 RETURNING id`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Documento no encontrado' });
    res.json({ success: true, mensaje: 'Documento eliminado' });
  } catch (e) {
    console.error('[TTHH] documentos DELETE:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
// TABLA COMPARTIDA (mini hoja de cálculo en SQL)
// ════════════════════════════════════════════════════════════════

router.get('/tabla/columnas', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM public.tthh_tabla_columnas ORDER BY orden, id`);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/tabla/columnas', async (req, res) => {
  try {
    const { nombre, ancho } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ success: false, error: 'nombre es requerido' });
    const { rows: maxOrden } = await pool.query(`SELECT COALESCE(MAX(orden), 0) + 1 AS siguiente FROM public.tthh_tabla_columnas`);
    const { rows } = await pool.query(`
      INSERT INTO public.tthh_tabla_columnas (nombre, orden, ancho) VALUES ($1, $2, $3) RETURNING *
    `, [nombre.trim(), maxOrden[0].siguiente, ancho || 160]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.put('/tabla/columnas/:id', async (req, res) => {
  try {
    const { nombre, orden, ancho } = req.body;
    const { rows } = await pool.query(`
      UPDATE public.tthh_tabla_columnas SET
        nombre = COALESCE($1, nombre),
        orden  = COALESCE($2, orden),
        ancho  = COALESCE($3, ancho)
      WHERE id = $4
      RETURNING *
    `, [t(nombre), orden ?? null, ancho ?? null, req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Columna no encontrada' });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/tabla/columnas/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`DELETE FROM public.tthh_tabla_columnas WHERE id = $1 RETURNING id`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Columna no encontrada' });
    res.json({ success: true, mensaje: 'Columna eliminada' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/tabla/filas', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM public.tthh_tabla_filas ORDER BY orden, id`);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/tabla/filas', async (req, res) => {
  try {
    const { datos } = req.body;
    const { rows: maxOrden } = await pool.query(`SELECT COALESCE(MAX(orden), 0) + 1 AS siguiente FROM public.tthh_tabla_filas`);
    const { rows } = await pool.query(`
      INSERT INTO public.tthh_tabla_filas (datos, orden, creado_por, actualizado_por)
      VALUES ($1, $2, $3, $3)
      RETURNING *
    `, [JSON.stringify(datos || {}), maxOrden[0].siguiente, req.user.usuario]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.put('/tabla/filas/:id', async (req, res) => {
  try {
    const { datos, orden } = req.body;
    const { rows } = await pool.query(`
      UPDATE public.tthh_tabla_filas SET
        datos = COALESCE($1, datos),
        orden = COALESCE($2, orden),
        actualizado_por = $3,
        actualizado_en = NOW()
      WHERE id = $4
      RETURNING *
    `, [datos ? JSON.stringify(datos) : null, orden ?? null, req.user.usuario, req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Fila no encontrada' });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/tabla/filas/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`DELETE FROM public.tthh_tabla_filas WHERE id = $1 RETURNING id`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Fila no encontrada' });
    res.json({ success: true, mensaje: 'Fila eliminada' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
// DRIVE COMPARTIDO (carpetas libres, tipo Google Drive)
// Acceso: TTHH + ADMINISTRADOR (ya forzado por soloTTHH en router.use arriba).
// Todos los binarios se guardan físicamente en una sola carpeta del
// servidor de almacenamiento local ("drive"); la jerarquía de carpetas
// que ve el usuario vive solo en estas dos tablas de la BD.
// ════════════════════════════════════════════════════════════════

// ─── GET /api/tthh/drive/carpetas?padre_id= ──────────────────────────────────
// Subcarpetas de una carpeta dada. Sin padre_id (o vacío) = carpetas raíz.
router.get('/drive/carpetas', async (req, res) => {
  try {
    const padreId = req.query.padre_id ? parseInt(req.query.padre_id) : null;
    const { rows } = await pool.query(
      padreId
        ? `SELECT * FROM public.tthh_drive_carpetas WHERE carpeta_padre_id = $1 ORDER BY nombre`
        : `SELECT * FROM public.tthh_drive_carpetas WHERE carpeta_padre_id IS NULL ORDER BY nombre`,
      padreId ? [padreId] : []
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('[TTHH] drive carpetas GET:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── GET /api/tthh/drive/carpetas/:id ────────────────────────────────────────
// Detalle de una carpeta puntual (para armar el breadcrumb / "migas de pan")
router.get('/drive/carpetas/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM public.tthh_drive_carpetas WHERE id = $1`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Carpeta no encontrada' });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/drive/carpetas', async (req, res) => {
  try {
    const { nombre, carpeta_padre_id } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ success: false, error: 'nombre es requerido' });
    const { rows } = await pool.query(`
      INSERT INTO public.tthh_drive_carpetas (nombre, carpeta_padre_id, creado_por)
      VALUES ($1, $2, $3) RETURNING *
    `, [nombre.trim(), carpeta_padre_id || null, req.user.usuario]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    console.error('[TTHH] drive carpetas POST:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/drive/carpetas/:id', async (req, res) => {
  try {
    // ON DELETE CASCADE se encarga de subcarpetas y archivos asociados en la BD
    // (los binarios quedan en el servidor de almacenamiento, ya inaccesibles sin el registro).
    const { rows } = await pool.query(`DELETE FROM public.tthh_drive_carpetas WHERE id = $1 RETURNING id`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Carpeta no encontrada' });
    res.json({ success: true, mensaje: 'Carpeta eliminada' });
  } catch (e) {
    console.error('[TTHH] drive carpetas DELETE:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── GET /api/tthh/drive/archivos?carpeta_id= ────────────────────────────────
// Archivos dentro de una carpeta. Sin carpeta_id = archivos en la raíz del Drive.
router.get('/drive/archivos', async (req, res) => {
  try {
    const carpetaId = req.query.carpeta_id ? parseInt(req.query.carpeta_id) : null;
    const { rows } = await pool.query(
      carpetaId
        ? `SELECT * FROM public.tthh_drive_archivos WHERE carpeta_id = $1 ORDER BY fecha_subida DESC`
        : `SELECT * FROM public.tthh_drive_archivos WHERE carpeta_id IS NULL ORDER BY fecha_subida DESC`,
      carpetaId ? [carpetaId] : []
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('[TTHH] drive archivos GET:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── POST /api/tthh/drive/archivos/upload ────────────────────────────────────
// Sube el archivo al servidor de almacenamiento local y crea el registro en
// un solo paso (a diferencia de "documentos de control", aquí no hace falta
// un formulario intermedio: arrastrar/seleccionar un archivo ya lo guarda).
router.post('/drive/archivos/upload', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });
    if (!configurado()) {
      return res.status(503).json({ success: false, error: 'El servidor de almacenamiento local no está configurado todavía.' });
    }

    const carpetaId = req.body.carpeta_id ? parseInt(req.body.carpeta_id) : null;

    const resultado = await subirArchivo({
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      carpeta: 'drive',
    });

    const url = `/api/tthh/archivo/${resultado.carpeta}/${resultado.archivo}`;
    const { rows } = await pool.query(`
      INSERT INTO public.tthh_drive_archivos
        (carpeta_id, nombre_original, archivo_url, tipo_mime, tamano_bytes, subido_por)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [carpetaId, req.file.originalname, url, req.file.mimetype, req.file.size, req.user.usuario]);

    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    console.error('[TTHH] drive archivos upload:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/drive/archivos/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`DELETE FROM public.tthh_drive_archivos WHERE id = $1 RETURNING id`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
    res.json({ success: true, mensaje: 'Archivo eliminado' });
  } catch (e) {
    console.error('[TTHH] drive archivos DELETE:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
