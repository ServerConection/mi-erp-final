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
const crypto  = require('crypto');
const { subirArchivo, obtenerArchivo, rutaInterna, configurado, estado } = require('../utils/storageClient');
const { validarArchivo, mimeSeguroPorExtension } = require('../utils/fileSignature');
const { crearRateLimit } = require('../utils/rateLimit');

// Todas las rutas requieren token válido
router.use(verificarToken);

// ─── Almacenamiento de documentos (cédula frontal/trasera, carnet, resumen) ──
// Los archivos ya NO se guardan en disco del backend: se reciben en memoria y
// se reenvían al servidor de almacenamiento local del cliente (carpeta por
// cédula). Esto evita exponer PII vía una ruta estática pública.
//
// SEGURIDAD — el `fileFilter` de multer NO es una defensa real: solo ve el
// Content-Type que declara el navegador, que el cliente controla. Se deja como
// primer filtro barato (corta la subida antes de gastar memoria), pero la
// validación que manda es la de firma binaria, más abajo en la ruta.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB
    files: 1,                   // un solo archivo por request
    fields: 10,                 // techo de campos de texto (anti-abuso)
    parts: 15,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf'
      || file.mimetype === 'application/octet-stream') cb(null, true);
    else cb(new Error('Solo se permiten imágenes o PDF'));
  }
});

// Máximo 30 subidas cada 5 minutos por usuario: suficiente para una jornada
// normal (4 documentos por venta) y corta scripts de abuso.
const limiteSubidas = crearRateLimit({
  ventanaMs: 5 * 60 * 1000,
  maximo: 30,
  mensaje: 'Demasiadas subidas seguidas. Espera un par de minutos e intenta otra vez.',
});

// Máximo 200 descargas cada 5 minutos: frena el escaneo masivo de documentos
// por una cuenta comprometida.
const limiteDescargas = crearRateLimit({
  ventanaMs: 5 * 60 * 1000,
  maximo: 200,
  mensaje: 'Demasiadas descargas seguidas. Espera un momento.',
});

// ─── Trazabilidad de errores ────────────────────────────────────────────────
// Al cliente se le devuelve SIEMPRE un mensaje neutro + una referencia corta.
// El detalle técnico (stack, causa de red, URL del túnel) queda solo en el log
// del servidor. Así el usuario puede decir "me salió el error 7f3a2b" y soporte
// lo encuentra, sin que el navegador reciba información de infraestructura.
function registrarError(contexto, err, extra = {}) {
  const ref = crypto.randomBytes(4).toString('hex');
  console.error(`[ENVIOS-VENTAS][${contexto}][ref:${ref}]`, {
    codigo: err?.codigo,
    causaRed: err?.causaRed,
    mensaje: err?.message,
    causa: err?.cause?.message || err?.cause?.code,
    ...extra,
  });
  return ref;
}

function responderError(res, contexto, err, extra = {}) {
  const ref = registrarError(contexto, err, extra);
  const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  return res.status(status).json({
    success: false,
    error: err?.publico || 'No se pudo completar la operación. Intenta de nuevo o avisa a soporte.',
    codigo: err?.codigo || 'ERROR_INTERNO',
    ref,
  });
}

// ─── Registro efímero de subidas recientes (para previsualizar antes de guardar)
// El asesor sube la cédula y quiere verla ANTES de guardar la venta, cuando
// todavía no existe fila en la BD que lo vincule al archivo. Este mapa recuerda
// qué usuario subió qué ruta durante 12 h para poder autorizar esa vista sin
// tener que abrir el acceso a todo el mundo.
const SUBIDAS_TTL_MS = 12 * 60 * 60 * 1000;
const subidasRecientes = new Map(); // "carpeta/archivo" -> { userId, exp }

function recordarSubida(clave, userId) {
  subidasRecientes.set(clave, { userId, exp: Date.now() + SUBIDAS_TTL_MS });
  if (subidasRecientes.size > 50_000) {
    const ahora = Date.now();
    for (const [k, v] of subidasRecientes) if (v.exp < ahora) subidasRecientes.delete(k);
  }
}

function subioEsteUsuario(clave, userId) {
  const e = subidasRecientes.get(clave);
  if (!e) return false;
  if (e.exp < Date.now()) { subidasRecientes.delete(clave); return false; }
  return e.userId === userId;
}

const soloDigitos = (s) => String(s || '').replace(/\D/g, '');

// Campos obligatorios solo cuando la acción es "CARGAR" (venta final, no borrador)
// "turno" dejó de ser obligatorio: el campo se retiró del formulario NuevaVenta
const CAMPOS_OBLIGATORIOS_CARGAR = ['origen_venta', 'venta_nueva_o_reingreso'];

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
  'banco', 'tipo_cuenta', 'ciclo_facturacion', 'costo_instalacion', 'descuento_instalacion',
  'beneficios_adicionales', 'beneficios_de_ley', 'plazo_contrato_meses',
  'resumen_venta', 'foto_cedula_frontal', 'foto_cedula_trasera',
  'foto_carnet', 'archivo_resumen', 'archivo_planilla',
];

const t = (v) => (v === undefined || v === null || String(v).trim() === '') ? null : String(v).trim();

// ─── POST /api/envios-ventas/upload ──────────────────────────────────────────
// Sube un documento (cédula frontal/trasera, carnet o resumen) al servidor de
// almacenamiento local, dentro de una carpeta nombrada con la cédula del
// cliente. Devuelve una "url" interna (no pública) que se guarda en la BD y
// que solo se puede resolver a bytes reales a través de GET /archivo/:ruta,
// que sí exige token + rol.
// Campos esperados en el form-data: "archivo" (file), "numero_identificacion" (cédula)
router.post('/upload', limiteSubidas, (req, res, next) => {
  upload.single('archivo')(req, res, (err) => {
    if (!err) return next();
    // Errores de multer: se traducen a mensajes claros, sin filtrar internals.
    const mapa = {
      LIMIT_FILE_SIZE: 'El archivo supera el máximo de 15 MB. Comprime la imagen o usa menor resolución.',
      LIMIT_FILE_COUNT: 'Solo se permite un archivo por subida.',
      LIMIT_UNEXPECTED_FILE: 'Campo de archivo inesperado.',
    };
    const ref = registrarError('upload:multer', err, { code: err.code });
    return res.status(400).json({
      success: false,
      error: mapa[err.code] || 'Solo se permiten imágenes o PDF.',
      codigo: err.code || 'ARCHIVO_INVALIDO',
      ref,
    });
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se recibió ningún archivo', codigo: 'SIN_ARCHIVO' });
    }
    if (!configurado()) {
      return res.status(503).json({
        success: false,
        error: 'El almacenamiento de documentos no está configurado. Contacta al administrador.',
        codigo: 'STORAGE_NO_CONFIGURADO',
      });
    }

    // ── Validación por FIRMA BINARIA (no por el Content-Type del cliente) ────
    // Aquí se cae cualquier archivo disfrazado: .php/.html/.svg/.exe renombrados
    // a .jpg, o enviados con un Content-Type falso desde curl/Postman.
    const veredicto = validarArchivo({
      buffer: req.file.buffer,
      mimetypeDeclarado: req.file.mimetype,
      pdfEstricto: process.env.UPLOAD_PDF_STRICT !== '0',
    });

    if (!veredicto.ok) {
      console.warn('[ENVIOS-VENTAS][upload:rechazado]', {
        usuario: req.user.id,
        codigo: veredicto.codigo,
        declarado: req.file.mimetype,
        bytes: req.file.size,
        detalle: veredicto.detalle,
      });
      return res.status(415).json({ success: false, error: veredicto.motivo, codigo: veredicto.codigo });
    }

    if (veredicto.incoherente) {
      // No bloquea (hay navegadores que mienten sin malicia), pero queda auditado.
      console.warn('[ENVIOS-VENTAS][upload:mime-incoherente]', {
        usuario: req.user.id,
        declarado: req.file.mimetype,
        real: veredicto.mime,
      });
    }

    const cedula  = soloDigitos(req.body.numero_identificacion);
    // La carpeta solo puede ser dígitos o "temp_<id>": no hay forma de inyectar
    // "../" ni nombres raros desde el cliente.
    const carpeta = cedula || `temp_${req.user.id}`;
    if (!/^[0-9]{1,20}$|^temp_[0-9]{1,12}$/.test(carpeta)) {
      return res.status(400).json({ success: false, error: 'Número de identificación inválido.', codigo: 'CARPETA_INVALIDA' });
    }

    const resultado = await subirArchivo({
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: veredicto.mime,   // el MIME real, no el declarado
      extension: veredicto.ext,   // extensión canónica derivada de la firma
      carpeta,
    });

    recordarSubida(rutaInterna(resultado.carpeta, resultado.archivo), req.user.id);

    console.log('[ENVIOS-VENTAS][upload:ok]', {
      usuario: req.user.id, carpeta: resultado.carpeta, tipo: veredicto.tipo, bytes: req.file.size,
    });

    const url = `/api/envios-ventas/archivo/${resultado.carpeta}/${resultado.archivo}`;
    res.json({ success: true, url, nombre: req.file.originalname, tipo: veredicto.tipo });
  } catch (e) {
    return responderError(res, 'upload', e, { usuario: req.user?.id });
  }
});

// ─── GET /api/envios-ventas/storage-estado ───────────────────────────────────
// Diagnóstico para soporte: dice si el servidor de almacenamiento responde y,
// si no, por qué (DNS, conexión rechazada, timeout, TLS). No revela la URL ni
// la API key. Restringido a perfiles no-asesor.
router.get('/storage-estado', noAsesor, async (req, res) => {
  const info = await estado();
  res.json({ success: true, ...info });
});

// ─── GET /api/envios-ventas/archivo/:carpeta/:archivo ────────────────────────
// Proxy autenticado hacia el servidor de almacenamiento local.
//
// CONTROLES APLICADOS
// -------------------
// 1) AUTORIZACIÓN (antes solo autenticación). Antes, CUALQUIER usuario logueado
//    podía leer la cédula de CUALQUIER cliente si conocía carpeta+archivo — un
//    IDOR sobre datos personales (CWE-639). Ahora:
//      · Perfiles no-asesor (backoffice/admin/supervisor/analista): ven todo,
//        que es lo que su función exige.
//      · ASESOR: solo archivos referenciados en ventas suyas, o que él mismo
//        acaba de subir (ventana de 12 h para previsualizar antes de guardar).
//    Se puede desactivar con ARCHIVO_STRICT_OWNERSHIP=0 si hiciera falta.
// 2) VALIDACIÓN DE PARÁMETROS: se rechaza cualquier cosa que no sea
//    [A-Za-z0-9._-] — corta path traversal antes de tocar la red.
// 3) NEUTRALIZACIÓN DE CONTENIDO: el Content-Type ya no se copia del servidor
//    de almacenamiento (dato no confiable). Se deriva de la extensión y se
//    limita a una lista blanca; lo desconocido baja como descarga binaria.
//    Con nosniff + CSP + sandbox, un archivo malicioso que llegara a colarse no
//    puede ejecutar script en el dominio del ERP (XSS almacenado).
const EXT_VALIDA = /^[A-Za-z0-9._-]{1,200}$/;
const OWNERSHIP_ESTRICTO = process.env.ARCHIVO_STRICT_OWNERSHIP !== '0';

async function puedeVerArchivo(user, ruta) {
  if (!OWNERSHIP_ESTRICTO) return true;
  if (user.perfil !== 'ASESOR') return true;              // backoffice/admin/etc.
  if (subioEsteUsuario(ruta, user.id)) return true;       // recién subido por él

  const url = `/api/envios-ventas/archivo/${ruta}`;
  const { rows } = await pool.query(
    `SELECT 1 FROM public.envios_ventas
      WHERE usuario_id = $1
        AND $2 IN (foto_cedula_frontal, foto_cedula_trasera, foto_carnet, archivo_resumen, archivo_planilla)
      LIMIT 1`,
    [user.id, url]
  );
  return rows.length > 0;
}

router.get('/archivo/:carpeta/:archivo', limiteDescargas, async (req, res) => {
  try {
    const { carpeta, archivo } = req.params;

    if (!EXT_VALIDA.test(carpeta) || !EXT_VALIDA.test(archivo) ||
        carpeta.includes('..') || archivo.includes('..')) {
      return res.status(400).json({ success: false, error: 'Parámetros inválidos', codigo: 'PARAMS_INVALIDOS' });
    }

    const ruta = rutaInterna(carpeta, archivo);

    if (!(await puedeVerArchivo(req.user, ruta))) {
      console.warn('[ENVIOS-VENTAS][archivo:denegado]', { usuario: req.user.id, perfil: req.user.perfil, ruta });
      // 404 y no 403: no confirmamos al que sondea que el archivo existe.
      return res.status(404).json({ success: false, error: 'Archivo no encontrado', codigo: 'NO_ENCONTRADO' });
    }

    const { buffer } = await obtenerArchivo(carpeta, archivo);

    const punto = archivo.lastIndexOf('.');
    const ext   = punto === -1 ? '' : archivo.slice(punto).toLowerCase();
    const mime  = mimeSeguroPorExtension(ext);

    // Lista blanca: si no reconocemos la extensión, se entrega como descarga
    // binaria opaca en vez de dejar que el navegador la interprete.
    res.set('Content-Type', mime || 'application/octet-stream');
    res.set('Content-Disposition', `${mime ? 'inline' : 'attachment'}; filename="documento${ext || '.bin'}"`);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; object-src 'none'; sandbox");
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Cache-Control', 'private, max-age=0, no-store');
    res.set('Pragma', 'no-cache');
    res.send(buffer);
  } catch (e) {
    return responderError(res, 'archivo', e, { usuario: req.user?.id });
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

    // Normalizar aplica_descuento_3ra_edad para cumplir el CHECK de la tabla (solo 'SÍ' | 'NO' | NULL)
    const _raw3 = t(b.aplica_descuento_3ra_edad);
    if (_raw3) {
      const _u = _raw3.toUpperCase();
      b.aplica_descuento_3ra_edad = (_u.includes('3RA') || _u.includes('TERCERA') || _u.includes('SÍ') || _u.includes('SI')) ? 'SÍ' : 'NO';
    } else {
      b.aplica_descuento_3ra_edad = null;
    }

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
