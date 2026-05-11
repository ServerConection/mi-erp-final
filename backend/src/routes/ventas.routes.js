// routes/ventas.routes.js
// ============================================================
// Rutas: Módulo Seguimiento de Ventas
// Todos los perfiles autenticados acceden
// Restricciones granulares en el controller
// ============================================================

const express = require("express");
const router  = express.Router();

const { verificarToken }   = require("../middleware/auth");
const {
  obtenerVentas,
  crearVenta,
  editarVenta,
  eliminarVenta,
  exportarVentas,
} = require("../controllers/ventas.controller");

// Todas las rutas requieren token válido
router.use(verificarToken);

// GET    /api/ventas          → listar registros (filtrado por perfil)
router.get("/",          obtenerVentas);

// GET    /api/ventas/exportar → descargar CSV
router.get("/exportar",  exportarVentas);

// POST   /api/ventas          → crear nuevo registro
router.post("/",         crearVenta);

// PUT    /api/ventas/:id      → editar registro (asesor = propio, admin = todos)
router.put("/:id",       editarVenta);

// DELETE /api/ventas/:id      → eliminar (SOLO administrador)
router.delete("/:id",    eliminarVenta);

module.exports = router;