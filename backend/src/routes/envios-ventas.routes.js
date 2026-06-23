// src/routes/envios-ventas.routes.js
// ============================================================
// POST /api/envios-ventas               — Ingreso de nueva venta (CARGAR o BORRADOR)
// PUT  /api/envios-ventas/:id            — Editar/finalizar un borrador propio
// GET  /api/envios-ventas/mis-borradores — Borradores pendientes del asesor logueado
// GET  /api/envios-ventas/opciones       — Solo admin/supervisor (noAsesor)
// GET  /api/envios-ventas                — Solo admin/supervisor (noAsesor)
// POST /api/envios-ventas/upload         — Sube cédula/carnet/resumen (imagen o PDF)
//
// Flujo de borradores:
//   - El asesor puede enviar accion:"BORRADOR" → estatus_envio="BORRADOR", se
//     relajan las validaciones obligatorias (puede guardar a medias).
//   - El asesor puede enviar accion:"CARGAR" (o no enviar "accion") → estatus_envio=
//     "PENDIENTE", se exige el set completo de campos obligatorios. Una vez
//     CARGADA, ya no se puede editar desde aquí (solo desde Backoffice).
//   - usuario_id SIEMPRE se completa desde el token, nunca desde el body.
//
// Las columnas de fecha e IP se auto-computan en el servidor.
// ============================================================

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const pool    = require('../config/db');
const { verificarToken, noAsesor } = require('../middleware/auth');
const { subirArchivo, obtenerArchivo, rutaInterna, configurado } = require('../utils/storageClient');

// Todas las rutas requieren token válido
router.use(verificarToken);

// ─── Almacenamiento de documentos (cédula frontal/trasera, carnet, resumen) ──
// Los archivos ya NO se guardan en disco del backend: se reciben en memoria y
// se reenvían al servidor de almacenamiento local del cliente (carpeta por
// cédula). Esto evita exponer PII vía una ruta estática pública.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Solo se permiten imágenes o PDF'));
  }
});

const soloDigitos = (s) => String(s || '').replace(/\D/g, '');

// Campos obligatorios solo cuando la acción es "CARGAR" (venta final, no borrador)
const CAMPOS_OBLIGATORIOS_CARGAR = ['origen_venta', 'venta_nueva_o_reingreso', 'turno'];

// Columnas editables que acepta el INSERT/UPDATE (todo excepto sistema/auto)
const COLUMNAS_VENTA = [
  'codigo_asesor', 'id_bitrix', 'distribuidor_autorizado', 'supervisor',
  'origen_venta', 'venta_nueva_o_reingreso', 'turno',
  'nombre_atc', 'clausulas', 'lider_comercial',
  'tipo_cliente', 'genero_cliente', 'tipo_documento',
  'numero_identificacion', 'nombre_cliente_completo',
  'estado_civil', 'fecha_nacimiento',
  'email_cliente', 'aplica_descuento_3ra_edad',
  'telf_celular_pin', 'telf_celular_2', 'telf_fijo',
  'provincia', 'ciudad', 'parroquia_barrio',
  'direccion_calles', 'direccion_manzana_villa',
  'referencia_ubicacion', 'coordenadas_gps',
  'tipo_vivienda', 'regimen_vivienda',
  'plan_contratado_final', 'servicios_digitales',
  'forma_pago', 'detalle_bancario_ahorros',
  'valor_pago', 'tipo_contrato', 'links_documentos',
  'banco', 'ciclo_facturacion', 'costo_instalacion', 'descuento_instalacion',
  'beneficios_adicionales', 'beneficios_de_ley', 'plazo_contrato_meses',
  'resumen_venta', 'foto_cedula_frontal', 'foto_cedula_trasera',
  'foto_carnet', 'archivo_resumen',
];

const t = (v) => (v === undefined || v === null || String(v).trim() === '') ? null : String(v).trim();

// ─── POST /api/envios-ventas/upload ──────────────────────────────────────────
// Sube un documento (cédula frontal/trasera, carnet o resumen) al servidor de
// almacenamiento local, dentro de una carpeta nombrada con la cédula del
// cliente. Devuelve una "url" interna (no pública) que se guarda en la BD y
// que solo se puede resolver a bytes reales a través de GET /archivo/:ruta,
// que sí exige token + rol.
// Campos esperados en el form-data: "archivo" (file), "numero_identificacion" (cédula)
router.post('/upload', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });
    if (!configurado()) {
      return res.status(503).json({ success: false, error: 'El servidor de almacenamiento local no está configurado todavía.' });
    }

    const cedula = soloDigitos(req.body.numero_identificacion);
    const carpeta = cedula || `temp_${req.user.id}`;

    const resultado = await subirArchivo({
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      carpeta,
    });

    const url = `/api/envios-ventas/archivo/${resultado.carpeta}/${resultado.archivo}`;
    res.json({ success: true, url, nombre: req.file.originalname });
  } catch (e) {
    console.error('[ENVIOS-VENTAS] upload:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── GET /api/envios-ventas/archivo/:carpeta/:archivo ────────────────────────
// Proxy autenticado (requiere token válido, vía router.use arriba). Cualquier
// usuario logueado puede ver un archivo si conoce su carpeta+nombre exactos
// (el asesor necesita previsualizar su propia carga antes de enviar la venta;
// Backoffice/admin/supervisor necesitan ver todo). Esto sigue siendo mucho más
// seguro que la exposición pública anterior: ya no es accesible sin sesión, y
// los nombres de archivo son aleatorios (no enumerables).
router.get('/archivo/:carpeta/:archivo', async (req, res) => {
  try {
    const { carpeta, archivo } = req.params;
    const { buffer, contentType } = await obtenerArchivo(carpeta, archivo);
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'private, max-age=0, no-store');
    res.send(buffer);
  } catch (e) {
    console.error('[ENVIOS-VENTAS] archivo:', e.message);
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// ─── GET /api/envios-ventas/mis-borradores ───────────────────────────────────
// Borradores ("REGISTRAR VENTA") pendientes de completar del usuario logueado
router.get('/mis-borradores', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, nombre_cliente_completo, numero_identificacion,
             distribuidor_autorizado, plan_contratado_final,
             fecha_registro_sistema, origen_venta
      FROM public.envios_ventas
      WHERE usuario_id = $1 AND estatus_envio = 'BORRADOR'
      ORDER BY fecha_registro_sistema DESC
    `, [req.user.id]);
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('[ENVIOS-VENTAS] mis-borradores:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── GET /api/envios-ventas/borrador/:id ─────────────────────────────────────
// Detalle completo de un borrador propio, para continuar editándolo
router.get('/borrador/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM public.envios_ventas WHERE id = $1 AND usuario_id = $2 AND estatus_envio = 'BORRADOR'`,
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Borrador no encontrado' });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    console.error('[ENVIOS-VENTAS] borrador/:id:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── GET /api/envios-ventas/opciones ────────────────────────────────────────
// Devuelve listas únicas de distribuidores y supervisores de la tabla
router.get('/opciones', noAsesor, async (req, res) => {
  try {
    const [dist, sup] = await Promise.all([
      pool.query(`SELECT DISTINCT distribuidor_autorizado FROM public.envios_ventas WHERE distribuidor_autorizado IS NOT NULL ORDER BY 1`),
      pool.query(`SELECT DISTINCT supervisor FROM public.envios_ventas WHERE supervisor IS NOT NULL ORDER BY 1`),
    ]);
    res.json({
      success: true,
      distribuidores: dist.rows.map(r => r.distribuidor_autorizado),
      supervisores:   sup.rows.map(r => r.supervisor),
    });
  } catch (e) {
    console.error('[ENVIOS-VENTAS] opciones:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── GET /api/envios-ventas ──────────────────────────────────────────────────
// Listado paginado, solo admin/supervisor — no incluye borradores incompletos
router.get('/', noAsesor, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, estatus_envio, ip_origen, fecha_registro_sistema,
             codigo_asesor, id_bitrix, distribuidor_autorizado, supervisor,
             origen_venta, venta_nueva_o_reingreso, turno
      FROM public.envios_ventas
      WHERE estatus_envio != 'BORRADOR'
      ORDER BY id DESC
      LIMIT 200
    `);
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('[ENVIOS-VENTAS] listado:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── POST /api/envios-ventas ─────────────────────────────────────────────────
// Acepta todos los campos que envía NuevaVenta.jsx
// Las columnas año/mes/dia_* son GENERATED ALWAYS AS en PostgreSQL → no se insertan
router.post('/', async (req, res) => {
  try {
    const b = req.body;
    const esAsesor   = (req.user?.perfil || '').toUpperCase() === 'ASESOR';
    const esBorrador = String(b.accion || '').toUpperCase() === 'BORRADOR';

    if (esAsesor) {
      // Asesores: BORRADOR si lo piden explícitamente, si no PENDIENTE (venta final)
      b.estatus_envio = esBorrador ? 'BORRADOR' : 'PENDIENTE';
      if (!b.codigo_asesor) b.codigo_asesor = req.user.usuario || req.user.nombre || '';
      if (!b.nombre_atc)    b.nombre_atc    = req.user.nombre  || req.user.usuario || '';
    } else if (!b.estatus_envio) {
      b.estatus_envio = esBorrador ? 'BORRADOR' : 'PENDIENTE';
    }

    // Validaciones obligatorias — se relajan si es borrador
    if (!b.estatus_envio) return res.status(400).json({ success: false, error: 'estatus_envio es requerido' });
    if (b.estatus_envio !== 'BORRADOR') {
      for (const campo of CAMPOS_OBLIGATORIOS_CARGAR) {
        if (!b[campo]) return res.status(400).json({ success: false, error: `${campo} es requerido` });
      }
    }

    const ip_origen =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.socket?.remoteAddress || '0.0.0.0';
    const fecha_registro_sistema = new Date();

    const valores = COLUMNAS_VENTA.map(c => t(b[c]));
    const placeholdersVenta = COLUMNAS_VENTA.map((_, i) => `$${i + 5}`).join(', ');

    const { rows } = await pool.query(`
      INSERT INTO public.envios_ventas (
        estatus_envio, ip_origen, fecha_registro_sistema, usuario_id,
        ${COLUMNAS_VENTA.join(', ')}
      ) VALUES (
        $1, $2, $3, $4,
        ${placeholdersVenta}
      )
      RETURNING id, estatus_envio, fecha_registro_sistema, codigo_asesor, id_bitrix
    `, [t(b.estatus_envio), ip_origen, fecha_registro_sistema, req.user.id, ...valores]);

    console.log(`[ENVIOS-VENTAS] ${b.estatus_envio === 'BORRADOR' ? 'Borrador guardado' : 'Nueva venta'} id=${rows[0].id} por ${req.user.usuario} (${esAsesor ? 'ASESOR' : 'ADMIN'})`);
    res.status(201).json({
      success: true,
      data: rows[0],
      mensaje: b.estatus_envio === 'BORRADOR' ? 'Borrador guardado correctamente' : 'Venta registrada correctamente',
    });

  } catch (e) {
    console.error('[ENVIOS-VENTAS] insert:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── PUT /api/envios-ventas/:id ──────────────────────────────────────────────
// Edita o finaliza un borrador propio. Solo el dueño (usuario_id) puede editarlo,
// y solo mientras siga en estatus BORRADOR.
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const esBorrador = String(b.accion || '').toUpperCase() === 'BORRADOR';

    const { rows: existentes } = await pool.query(
      `SELECT id, usuario_id, estatus_envio FROM public.envios_ventas WHERE id = $1`,
      [id]
    );
    if (existentes.length === 0) return res.status(404).json({ success: false, error: 'Registro no encontrado' });
    const actual = existentes[0];

    if (actual.usuario_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'No puedes editar un registro que no es tuyo' });
    }
    if (actual.estatus_envio !== 'BORRADOR') {
      return res.status(409).json({ success: false, error: 'Esta venta ya fue cargada y no se puede editar desde aquí' });
    }

    const nuevoEstatus = esBorrador ? 'BORRADOR' : 'PENDIENTE';
    if (nuevoEstatus !== 'BORRADOR') {
      for (const campo of CAMPOS_OBLIGATORIOS_CARGAR) {
        if (!b[campo]) return res.status(400).json({ success: false, error: `${campo} es requerido` });
      }
    }

    const sets = COLUMNAS_VENTA.map((c, i) => `${c} = $${i + 2}`).join(', ');
    const valores = COLUMNAS_VENTA.map(c => t(b[c]));

    const { rows } = await pool.query(`
      UPDATE public.envios_ventas
      SET estatus_envio = $${COLUMNAS_VENTA.length + 2}, ${sets}
      WHERE id = $1
      RETURNING id, estatus_envio, fecha_registro_sistema, codigo_asesor, id_bitrix
    `, [id, ...valores, nuevoEstatus]);

    console.log(`[ENVIOS-VENTAS] ${nuevoEstatus === 'BORRADOR' ? 'Borrador actualizado' : 'Borrador finalizado (CARGADO)'} id=${id} por ${req.user.usuario}`);
    res.json({
      success: true,
      data: rows[0],
      mensaje: nuevoEstatus === 'BORRADOR' ? 'Borrador actualizado' : 'Venta cargada correctamente',
    });
  } catch (e) {
    console.error('[ENVIOS-VENTAS] update:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
