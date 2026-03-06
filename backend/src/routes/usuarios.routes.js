const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');

const router = express.Router();

// ─── LISTAR USUARIOS ──────────────────────────────────────────────────────────
router.get('/', auth, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, nombres_completos, correo, rol, activo FROM users ORDER BY id ASC'
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('[users.routes] GET /:', error);
    return res.status(500).json({ success: false, error: 'Error obteniendo usuarios' });
  }
});

// ─── CREAR USUARIO ────────────────────────────────────────────────────────────
router.post('/', auth, isAdmin, async (req, res) => {
  try {
    const { username, password, nombres, correo, identificacion, rol } = req.body;

    if (!username || !password || !nombres || !correo || !identificacion || !rol) {
      return res.status(400).json({ success: false, error: 'Todos los campos son requeridos' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    // Verificar si el username ya existe
    const existe = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR correo = $2',
      [username, correo]
    );
    if (existe.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'El usuario o correo ya está registrado' });
    }

    const hash = await bcrypt.hash(password, 12);

    await pool.query(
      `INSERT INTO users (username, password_hash, nombres_completos, correo, identificacion, rol)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [username, hash, nombres, correo, identificacion, rol]
    );

    return res.status(201).json({ success: true, message: 'Usuario creado correctamente' });

  } catch (error) {
    console.error('[users.routes] POST /:', error);
    return res.status(500).json({ success: false, error: 'Error creando usuario' });
  }
});

// ─── ELIMINAR USUARIO ─────────────────────────────────────────────────────────
router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    return res.json({ success: true, message: 'Usuario eliminado' });

  } catch (error) {
    console.error('[users.routes] DELETE /:id:', error);
    return res.status(500).json({ success: false, error: 'Error eliminando usuario' });
  }
});

module.exports = router;