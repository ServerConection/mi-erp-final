const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/forecast.controller');
const { verificarToken, soloAdmin } = require('../middleware/auth');

// Todos los endpoints requieren token válido
router.use(verificarToken);

router.get('/dashboard',       ctrl.getDashboard);
router.get('/diario/:canal',   ctrl.getDiario);
router.get('/ejecutivos',      ctrl.getEjecutivos);
router.get('/objetivos',       ctrl.getObjetivos);

// Solo admin puede modificar objetivos
router.post('/objetivos', soloAdmin, ctrl.upsertObjetivos);

module.exports = router;
