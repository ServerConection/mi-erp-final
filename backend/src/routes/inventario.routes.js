/**
 * Inventario Routes — solo ADMINISTRADOR
 */
const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const ctrl     = require('../controllers/inventario.controller');
const { verificarToken, soloAdmin } = require('../middleware/auth');

// Almacenamiento de imágenes de equipos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = require('path').join(process.cwd(), 'uploads', 'equipos_Images');
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = `${Date.now()}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imágenes'));
  }
});

// Todas las rutas requieren token + admin
router.use(verificarToken, soloAdmin);

router.get ('/dashboard',       ctrl.getDashboard);
router.get ('/equipos',         ctrl.getEquipos);
router.get ('/equipos/:id',     ctrl.getEquipo);
router.post('/equipos',         upload.single('imagen'), ctrl.createEquipo);
router.put ('/equipos/:id',     upload.single('imagen'), ctrl.updateEquipo);
router.delete('/equipos/:id',   ctrl.deleteEquipo);

module.exports = router;
