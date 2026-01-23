const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');

const router = express.Router();

router.get('/', auth, isAdmin, async (req, res) => {
  const users = await pool.query(
    'SELECT id, username, nombres_completos, correo, rol, activo FROM users'
  );
  res.json(users.rows);
});

router.post('/', auth, isAdmin, async (req, res) => {
  const { username, password, nombres, correo, identificacion, rol } = req.body;
  const hash = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO users 
     (username, password_hash, nombres_completos, correo, identificacion, rol)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [username, hash, nombres, correo, identificacion, rol]
  );

  res.sendStatus(201);
});

module.exports = router;
