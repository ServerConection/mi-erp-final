// src/routes/metasCarga.routes.js
// ============================================================
// Carga mensual de metas comerciales (Excel de gerencia)
//   POST /api/metas-carga/preview    (multipart: archivo, empresa, anio, mes, hoja?, dias_habiles?)
//   POST /api/metas-carga/confirmar  (json: carga_id, decisiones, supervisores)
//   GET  /api/metas-carga/historial
//   GET  /api/metas-carga/vigentes?empresa=&anio=&mes=
// Montado en app.js (monolito) y entries/core.js. El gateway lo envia a CORE
// por su catch-all, no requiere cambio en gateway.js.
// Acceso: ADMINISTRADOR y GERENCIA.
// ============================================================

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { verificarToken } = require('../middleware/auth');
const ctrl = require('../controllers/metasCarga.controller');

const soloAdminGerencia = (req, res, next) => {
  const p = req.user?.perfil;
  if (p === 'ADMINISTRADOR' || p === 'GERENCIA') return next();
  return res.status(403).json({ success: false, error: 'Solo Administrador o Gerencia pueden cargar metas' });
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    /\.(xlsx|xlsm)$/i.test(file.originalname || '')
      ? cb(null, true)
      : cb(new Error('Solo se permiten archivos Excel (.xlsx)'));
  },
});

// Errores de multer (archivo grande / extension) como JSON y no como 500
const subir = (req, res, next) => upload.single('archivo')(req, res, (err) => {
  if (err) return res.status(400).json({ success: false, error: err.message });
  next();
});

router.use(verificarToken);
router.use(soloAdminGerencia);

router.post('/preview',   subir, ctrl.preview);
router.post('/confirmar', ctrl.confirmar);
router.get('/historial',  ctrl.historial);
router.get('/vigentes',   ctrl.vigentes);

module.exports = router;
