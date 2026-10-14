const router = require('express').Router();
const { authenticate } = require('../auth');

// Datos del usuario del ERP que abrió el módulo
router.get('/me', authenticate, (req, res) => {
  const { id, name, username, role, perfil, empresa, account_id, habilitado } = req.agent;
  res.json({ id, name, username, role, perfil, empresa, account_id, habilitado: role === 'admin' || habilitado });
});

module.exports = router;
