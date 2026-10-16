const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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
router.get('/resumen', ctrl.resumen);
router.get('/opciones', ctrl.opciones);
router.get('/exportar', ctrl.exportar);
router.get('/:id/auditorias', ctrl.obtenerAuditorias);
router.get('/:id', ctrl.obtener);
router.post('/', ctrl.crear);
router.post('/:id/foto', ctrl.autorizarFoto, recibirFoto, ctrl.subirFoto);

// Solo un administrador puede editar un activo existente.
router.put('/:id', soloAdmin, ctrl.editar);

module.exports = router;

