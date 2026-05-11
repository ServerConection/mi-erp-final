const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

// ─── CREAR USUARIO ────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { nombres, apellidos, correo, cargo, perfil, empresa, usuario, contraseña } = req.body;

    if (!nombres || !apellidos || !correo || !usuario || !contraseña) {
      return res.status(400).json({ success: false, error: 'Faltan campos obligatorios' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(correo)) {
      return res.status(400).json({ success: false, error: 'Correo inválido' });
    }

    if (contraseña.length < 8) {
      return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    // Verificar duplicados
    const existe = await pool.query(
      'SELECT id FROM usuarios WHERE usuario = $1 OR correo = $2',
      [usuario, correo]
    );
    if (existe.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'El usuario o correo ya está registrado' });
    }

    // Hashear con cost factor 12 (más seguro que 6)
    const passwordHash = await bcrypt.hash(contraseña, 12);

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
    console.error('[usuarios.js] POST /:', error);
    return res.status(500).json({ success: false, error: 'Error creando usuario' });
  }
});

// ─── LISTAR USUARIOS ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nombres, apellidos, correo, cargo, perfil, empresa, activo, usuario FROM usuarios ORDER BY id ASC'
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('[usuarios.js] GET /:', error);
    return res.status(500).json({ success: false, error: 'Error obteniendo usuarios' });
  }
});

// ─── ACTUALIZAR USUARIO ───────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombres, apellidos, correo, cargo, perfil, empresa, activo } = req.body;

    const result = await pool.query(
      `UPDATE usuarios
       SET nombres=$1, apellidos=$2, correo=$3, cargo=$4, perfil=$5, empresa=$6, activo=$7
       WHERE id=$8
       RETURNING id`,
      [nombres, apellidos, correo, cargo, perfil, empresa, activo, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    return res.json({ success: true, message: 'Usuario actualizado' });

  } catch (error) {
    console.error('[usuarios.js] PUT /:id:', error);
    return res.status(500).json({ success: false, error: 'Error actualizando usuario' });
  }
});

module.exports = router;