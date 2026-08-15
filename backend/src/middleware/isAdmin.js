module.exports = (req, res, next) => {
  const rol = req.user?.rol?.toUpperCase();
  if (rol === 'ADMINISTRADOR' || rol === 'ADMIN') {
    return next();
  }
  return res.status(403).json({ success: false, error: 'Acceso denegado. Se requiere rol administrador.' });
};