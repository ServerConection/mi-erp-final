/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RUTAS: Archivos Compartidos
 * Base: /api/hojas
 * ═══════════════════════════════════════════════════════════════════════════════
 * Cada ruta declara el nivel mínimo que exige. Leyendo este archivo se entiende
 * el modelo de permisos completo sin abrir ningún controlador.
 *
 *   LECTOR → ver          EDITOR → escribir celdas y filas
 *   DUENO  → estructura y permisos     ADMIN → todo, en cualquier hoja
 */

const express = require('express');
const multer  = require('multer');
const router  = express.Router();

const { verificarToken } = require('../middleware/auth');
const { accesoHojas, puedeCrearHoja, exigeNivel } = require('../middleware/hojasAcceso');

const hojas = require('../controllers/hojas.controller');
const datos = require('../controllers/hojasDatos.controller');

// Excel en memoria: no tocamos disco por un archivo que se procesa y se tira.
const subida = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error('Solo se admiten archivos .xlsx, .xls o .csv'), ok);
  },
});

// Puerta de entrada del módulo
router.use(verificarToken, accesoHojas);

// ── Catálogos ─────────────────────────────────────────────────────────────────
router.get('/usuarios', hojas.usuariosDisponibles);

// ── Hojas ─────────────────────────────────────────────────────────────────────
router.get   ('/',        hojas.listar);
router.post  ('/',        puedeCrearHoja, hojas.crear);
router.get   ('/:hojaId', exigeNivel('LECTOR'), datos.detalle);
router.patch ('/:hojaId', exigeNivel('DUENO'),  hojas.editar);
router.patch ('/:hojaId/archivar', exigeNivel('DUENO'), hojas.archivar);

// ── Permisos (solo el dueño reparte acceso) ───────────────────────────────────
router.get   ('/:hojaId/permisos',             exigeNivel('DUENO'), hojas.listarPermisos);
router.put   ('/:hojaId/permisos',             exigeNivel('DUENO'), hojas.otorgarPermiso);
router.delete('/:hojaId/permisos/:usuarioId',  exigeNivel('DUENO'), hojas.revocarPermiso);

// ── Estructura: columnas (solo el dueño) ──────────────────────────────────────
router.post  ('/:hojaId/columnas',             exigeNivel('DUENO'), datos.crearColumna);
router.patch ('/:hojaId/columnas/:columnaId',  exigeNivel('DUENO'), datos.editarColumna);
router.delete('/:hojaId/columnas/:columnaId',  exigeNivel('DUENO'), datos.eliminarColumna);

// ── Contenido: filas y celdas (editores) ──────────────────────────────────────
router.post  ('/:hojaId/filas',          exigeNivel('EDITOR'), datos.crearFila);
router.delete('/:hojaId/filas/:filaId',  exigeNivel('EDITOR'), datos.eliminarFila);
router.put   ('/:hojaId/celdas',         exigeNivel('EDITOR'), datos.guardarCelda);

// ── Excel e historial ─────────────────────────────────────────────────────────
router.get ('/:hojaId/exportar',  exigeNivel('LECTOR'), datos.exportar);
router.post('/:hojaId/importar',  exigeNivel('EDITOR'), subida.single('archivo'), datos.importar);
router.get ('/:hojaId/historial', exigeNivel('LECTOR'), datos.historial);

// Multer lanza fuera del try/catch de los controladores: lo atajamos aquí para
// que el usuario reciba un mensaje claro en vez de un 500 genérico.
router.use((err, req, res, next) => {
  if (err) {
    const grande = err.code === 'LIMIT_FILE_SIZE';
    return res.status(400).json({
      success: false,
      error: grande ? 'El archivo supera los 5 MB' : (err.message || 'Archivo inválido'),
    });
  }
  next();
});

module.exports = router;
