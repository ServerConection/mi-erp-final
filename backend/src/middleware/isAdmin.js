module.exports = (req, res, next) => {
  if (req.user.rol !== 'admin') {
    return res.sendStatus(403);
  }
  next();
};
