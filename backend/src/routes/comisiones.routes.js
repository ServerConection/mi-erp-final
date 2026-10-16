// src/routes/comisiones.routes.js
// ============================================================
// Submódulo Comisiones (Administración) — Fase 1
//   GET  /api/comisiones/calculo?empresa=&anio=&mes=&refrescar=1
//   GET  /api/comisiones/catalogo?empresa=&anio=&mes=
//   POST /api/comisiones/catalogo   (json: empresa, anio, mes, planes[])
// Montado en app.js (monolito) y entries/core.js. El gateway lo envía a CORE
// por su catch-all, no requiere cambio en gateway.js.
// Acceso: ADMINISTRADOR y GERENCIA.
// ============================================================

const express = require('express');
const router  = express.Router();
const { verificarToken } = require('../middleware/auth');
const ctrl = require('../controllers/comisiones.controller');

const soloAdminGerencia = (req, res, next) => {
  const p = req.user?.perfil;
  if (p === 'ADMINISTRADOR' || p === 'GERENCIA') return next();
  return res.status(403).json({ success: false, error: 'Solo Administrador o Gerencia pueden ver comisiones' });
};

router.use(verificarToken);
router.use(soloAdminGerencia);

router.get('/calculo',   ctrl.calculo);
router.get('/catalogo',  ctrl.catalogo);
router.post('/catalogo', ctrl.guardarCatalogo);

module.exports = router;
