const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();

// ─── LISTAR USUARIOS ──────────────────────────────────────────────────────────
router.get('/', verificarToken, async (req, res) => {
  try {
    if (req.user.perfil !== 'ADMINISTRADOR') {
      return res.status(403).json({ success: false, error: 'Solo administrador' });
    }
    const result = await pool.query(
      `SELECT id, nombres, apellidos, correo, cargo, perfil, empresa, activo, usuario 
       FROM usuarios ORDER BY id ASC`
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('[usuarios.routes] GET /:', error);
    return res.status(500).json({ success: false, error: 'Error obteniendo usuarios' });
  }
});

// ─── CREAR USUARIO ────────────────────────────────────────────────────────────
router.post('/', verificarToken, async (req, res) => {
  try {
    if (req.user.perfil !== 'ADMINISTRADOR') {
      return res.status(403).json({ success: false, error: 'Solo administrador' });
    }
    const { nombres, apellidos, correo, cargo, perfil, empresa, usuario, password } = req.body;

    if (!nombres || !apellidos || !correo || !cargo || !perfil || !empresa || !usuario || !password) {
      return res.status(400).json({ success: false, error: 'Todos los campos son requeridos' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const existe = await pool.query(
      'SELECT id FROM usuarios WHERE usuario = $1 OR correo = $2',
      [usuario, correo]
    );
    if (existe.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'El usuario o correo ya está registrado' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO usuarios (nombres, apellidos, correo, cargo, perfil, empresa, activo, usuario, contraseña)
       VALUES ($1, $2, $3, $4, $5, $6, 'SI', $7, $8)
       RETURNING id`,
      [nombres, apellidos, correo, cargo, perfil, empresa, usuario, passwordHash]
    );

    return res.status(201).json({
      success: true,
      message: 'Usuario creado correctamente',
      id: result.rows[0].id
    });

  } catch (error) {
    console.error('[usuarios.routes] POST /:', error);
    return res.status(500).json({ success: false, error: 'Error creando usuario' });
  }
});

// ─── ACTUALIZAR USUARIO ───────────────────────────────────────────────────────
router.put('/:id', verificarToken, async (req, res) => {
  try {
    if (req.user.perfil !== 'ADMINISTRADOR') {
      return res.status(403).json({ success: false, error: 'Solo administrador' });
    }
    const { id } = req.params;
    const { nombres, apellidos, correo, cargo, perfil, empresa, activo } = req.body;

    const result = await pool.query(
      `UPDATE usuarios
       SET nombres=$1, apellidos=$2, correo=$3, cargo=$4, perfil=$5, empresa=$6, activo=$7
       WHERE id=$8 RETURNING id`,
      [nombres, apellidos, correo, cargo, perfil, empresa, activo, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    return res.json({ success: true, message: 'Usuario actualizado' });

  } catch (error) {
    console.error('[usuarios.routes] PUT /:id:', error);
    return res.status(500).json({ success: false, error: 'Error actualizando usuario' });
  }
});

// ─── ELIMINAR USUARIO ─────────────────────────────────────────────────────────
router.delete('/:id', verificarToken, async (req, res) => {
  try {
    if (req.user.perfil !== 'ADMINISTRADOR') {
      return res.status(403).json({ success: false, error: 'Solo administrador' });
    }
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM usuarios WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    return res.json({ success: true, message: 'Usuario eliminado' });

  } catch (error) {
    console.error('[usuarios.routes] DELETE /:id:', error);
    return res.status(500).json({ success: false, error: 'Error eliminando usuario' });
  }
});

module.exports = router;