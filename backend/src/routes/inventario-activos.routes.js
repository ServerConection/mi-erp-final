const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const router = express.Router();
const ctrl = require('../controllers/inventario-activos.controller');
const { verificarToken, soloAdmin } = require('../middleware/auth');

const FOTOS_DIR = path.join(process.cwd(), 'uploads', 'inventario_activos');
fs.mkdirSync(FOTOS_DIR, { recursive: true });

const EXTENSIONES_IMAGEN = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MIMES_IMAGEN = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const uploadFoto = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, FOTOS_DIR),
    filename: (req, file, cb) => {
      const extension = path.extname(file.originalname).toLowerCase();
      const id = String(req.params.id || 'activo').replace(/[^A-Z0-9-]/gi, '');
      cb(null, `${id}-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (!MIMES_IMAGEN.has(file.mimetype) || !EXTENSIONES_IMAGEN.has(extension)) {
      const error = new Error('La foto debe ser una imagen JPG, JPEG, PNG, WEBP o GIF.');
      error.status = 400;
      return cb(error);
    }
    return cb(null, true);
  },
});

const recibirFoto = (req, res, next) => uploadFoto.single('foto')(req, res, (error) => {
  if (!error) return next();
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, error: 'La foto supera el tamano maximo de 5 MB.' });
  }
  return res.status(error.status || 400).json({ success: false, error: error.message || 'No se pudo procesar la foto.' });
});

// Token dedicado o JWT. Estas rutas deben ir antes del middleware JWT general.
router.get('/auditoria/tokens', verificarToken, soloAdmin, ctrl.listarTokensAuditoria);
router.post('/auditoria/tokens', verificarToken, soloAdmin, ctrl.crearTokenAuditoria);
router.delete('/auditoria/tokens/:tokenId', verificarToken, soloAdmin, ctrl.revocarTokenAuditoria);
router.post('/auditoria', ctrl.autenticarAuditoria, ctrl.registrarAuditoria);

// Cualquier usuario autenticado puede consultar y registrar activos.
router.use(verificarToken);

router.get('/', ctrl.listar);
// Las rutas estaticas deben declararse antes de /:id.
router.get('/dashboard', async (_req, res) => {
  try {
    const result = await pool.query(`
      WITH ultima AS (
        SELECT activo_id, MAX(fecha_auditoria) AS ultima_auditoria
        FROM public.inventario_activos_auditoria
        GROUP BY activo_id
      ), base AS (
        SELECT ia.*, u.ultima_auditoria,
          (ia.usuario_asignado_id IS NULL OR NULLIF(BTRIM(ia.responsable), '') IS NULL OR UPPER(BTRIM(ia.responsable)) = 'POR DEFINIR') AS sin_responsable,
          ((u.ultima_auditoria IS NULL AND ia.created_at < NOW() - INTERVAL '90 days')
            OR u.ultima_auditoria < NOW() - INTERVAL '90 days') AS sin_auditoria_90,
          (ia.ram_gb IS NOT NULL AND ia.ram_gb < 8) AS ram_menor_8
        FROM public.inventario_activos ia
        LEFT JOIN ultima u ON u.activo_id = ia.id
      )
      SELECT json_build_object(
        'kpis', json_build_object(
          'total', COUNT(*)::INTEGER,
          'novonet', COUNT(*) FILTER (WHERE empresa = 'NOVONET')::INTEGER,
          'velsa', COUNT(*) FILTER (WHERE empresa = 'VELSA')::INTEGER,
          'sin_responsable', COUNT(*) FILTER (WHERE sin_responsable)::INTEGER,
          'sin_auditoria_90', COUNT(*) FILTER (WHERE sin_auditoria_90)::INTEGER,
          'ram_menor_8', COUNT(*) FILTER (WHERE ram_menor_8)::INTEGER
        ),
        'por_area', COALESCE((
          SELECT json_agg(json_build_object('nombre', area_nombre, 'total', total) ORDER BY total DESC, area_nombre)
          FROM (SELECT COALESCE(NULLIF(BTRIM(area), ''), 'SIN AREA') area_nombre, COUNT(*)::INTEGER total FROM base GROUP BY 1) a
        ), '[]'::json),
        'por_estado', COALESCE((
          SELECT json_agg(json_build_object('nombre', estado_nombre, 'total', total) ORDER BY total DESC, estado_nombre)
          FROM (SELECT COALESCE(NULLIF(BTRIM(estado), ''), 'SIN ESTADO') estado_nombre, COUNT(*)::INTEGER total FROM base GROUP BY 1) e
        ), '[]'::json),
        'por_revisar', COALESCE((
          SELECT json_agg(row_to_json(r)) FROM (
            SELECT id, empresa, tipo_dispositivo, marca, modelo, area, estado, responsable, ram_gb,
              CONCAT_WS(' · ',
                CASE WHEN sin_responsable THEN 'SIN RESPONSABLE / POR DEFINIR' END,
                CASE WHEN sin_auditoria_90 THEN 'SIN AUDITORIA VIGENTE (+90 DIAS)' END,
                CASE WHEN ram_menor_8 THEN 'RAM MENOR A 8 GB' END
              ) AS motivo
            FROM base
            WHERE sin_responsable OR sin_auditoria_90 OR ram_menor_8
            ORDER BY ((sin_responsable::int) + (sin_auditoria_90::int) + (ram_menor_8::int)) DESC,
              ultima_auditoria ASC NULLS FIRST, id
            LIMIT 10
          ) r
        ), '[]'::json),
        'filtros_especiales', json_build_object(
          'sin_responsable', COALESCE((SELECT json_agg(row_to_json(s) ORDER BY s.id) FROM base s WHERE sin_responsable), '[]'::json),
          'sin_auditoria_90', COALESCE((SELECT json_agg(row_to_json(s) ORDER BY s.id) FROM base s WHERE sin_auditoria_90), '[]'::json)
        )
      ) AS dashboard
      FROM base
    `);
    return res.json({ success: true, data: result.rows[0].dashboard });
  } catch (error) {
    console.error('[InventarioActivos] dashboard:', error.message);
    return res.status(500).json({ success: false, error: 'No se pudo cargar el dashboard de inventario.' });
  }
});
router.get('/resumen', ctrl.resumen);
router.get('/opciones', ctrl.opciones);
router.get('/exportar', ctrl.exportar);
router.get('/plano', ctrl.plano);
router.get('/usuarios-asignables', soloAdmin, ctrl.usuariosAsignables);
router.get('/:id/auditorias', ctrl.obtenerAuditorias);
router.get('/:id', ctrl.obtener);
router.post('/', ctrl.crear);
router.post('/:id/foto', ctrl.autorizarFoto, recibirFoto, ctrl.subirFoto);

// Solo un administrador puede editar un activo existente.
router.put('/:id', soloAdmin, ctrl.editar);

module.exports = router;

