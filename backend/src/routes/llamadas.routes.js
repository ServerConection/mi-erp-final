const express = require('express');
const router  = express.Router();
const {
  getCatalogosFiltro,
  filtrarNegociaciones,
  crearLote,
  listarLotes,
  asignarAsesorItem,
  exportarLoteCsv,
} = require('../controllers/llamadas.controller');

const { verificarToken, noAsesor } = require('../middleware/auth');

// Todo el módulo es solo para supervisión (igual que Automarcador): los
// asesores no cargan bases, solo reciben llamadas desde el Automarcador.
router.use(verificarToken, noAsesor);

router.get('/filtros',                       getCatalogosFiltro);
router.get('/filtrar',                       filtrarNegociaciones);
router.post('/lotes',                        crearLote);
router.get('/lotes',                         listarLotes);
router.put('/lotes/:loteId/items/:itemId',   asignarAsesorItem);
router.get('/lotes/:loteId/export.csv',      exportarLoteCsv);

module.exports = router;
