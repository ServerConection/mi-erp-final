const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { verificarToken, invalidarUsuarioCache } = require('../middleware/auth');

const router = express.Router();

const normalizarCodigoVendedor = (valor) => {
  if (valor === undefined || valor === null) return null;
  return String(valor).trim() || null;
};

const MODALIDADES_ASISTENCIA = new Set(['JORNADA', 'CONEXION']);
const normalizarModalidadAsistencia = (valor, perfil = '') => {
  const modalidad = String(valor || '').trim().toUpperCase();
  if (modalidad) return MODALIDADES_ASISTENCIA.has(modalidad) ? modalidad : null;
  return ['USUARIO', 'ASESOR'].includes(String(perfil || '').trim().toUpperCase()) ? 'CONEXION' : 'JORNADA';
};

// ─── LISTAR USUARIOS ──────────────────────────────────────────────────────────
router.get('/', verificarToken, async (req, res) => {
  try {
    if (req.user.perfil !== 'ADMINISTRADOR') {
      return res.status(403).json({ success: false, error: 'Solo administrador' });
    }
    const result = await pool.query(
      `SELECT id, nombres, apellidos, correo, cargo, perfil, empresa, activo, usuario, codigo_vendedor, modalidad_asistencia
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
    const { nombres, apellidos, correo, cargo, perfil, empresa, usuario, password, codigo_vendedor } = req.body;
    const modalidadAsistencia = normalizarModalidadAsistencia(req.body.modalidad_asistencia, perfil);

    if (!nombres || !apellidos || !correo || !cargo || !perfil || !empresa || !usuario || !password) {
      return res.status(400).json({ success: false, error: 'Todos los campos son requeridos' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    if (!modalidadAsistencia) {
      return res.status(400).json({ success: false, error: 'Modalidad de asistencia inválida' });
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
      `INSERT INTO usuarios (nombres, apellidos, correo, cargo, perfil, empresa, activo, usuario, contraseña, codigo_vendedor, modalidad_asistencia)
       VALUES ($1, $2, $3, $4, $5, $6, 'SI', $7, $8, $9, $10)
       RETURNING id`,
      [nombres, apellidos, correo, cargo, perfil, empresa, usuario, passwordHash, normalizarCodigoVendedor(codigo_vendedor), modalidadAsistencia]
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
    const { nombres, apellidos, correo, cargo, perfil, empresa, activo, codigo_vendedor } = req.body;
    const actualizaCodigoVendedor = Object.prototype.hasOwnProperty.call(req.body, 'codigo_vendedor');
    const actualizaModalidad = Object.prototype.hasOwnProperty.call(req.body, 'modalidad_asistencia');
    const modalidadAsistencia = actualizaModalidad
      ? normalizarModalidadAsistencia(req.body.modalidad_asistencia, perfil)
      : null;
    if (actualizaModalidad && !modalidadAsistencia) {
      return res.status(400).json({ success: false, error: 'Modalidad de asistencia inválida' });
    }

    const result = await pool.query(
      `UPDATE usuarios
       SET nombres=$1, apellidos=$2, correo=$3, cargo=$4, perfil=$5, empresa=$6, activo=$7,
           codigo_vendedor=CASE WHEN $8 THEN $9 ELSE codigo_vendedor END,
           modalidad_asistencia=CASE WHEN $10 THEN $11 ELSE modalidad_asistencia END
       WHERE id=$12 RETURNING id`,
      [
        nombres, apellidos, correo, cargo, perfil, empresa, activo,
        actualizaCodigoVendedor, normalizarCodigoVendedor(codigo_vendedor),
        actualizaModalidad, modalidadAsistencia, id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    invalidarUsuarioCache(Number(id));

    return res.json({ success: true, message: 'Usuario actualizado' });

  } catch (error) {
    console.error('[usuarios.routes] PUT /:id:', error);
    return res.status(500).json({ success: false, error: 'Error actualizando usuario' });
  }
});

router.patch('/:id/modalidad-asistencia', verificarToken, async (req, res) => {
  try {
    if (req.user.perfil !== 'ADMINISTRADOR') {
      return res.status(403).json({ success: false, error: 'Solo administrador' });
    }
    const modalidad = normalizarModalidadAsistencia(req.body?.modalidad_asistencia);
    if (!modalidad || !req.body?.modalidad_asistencia) {
      return res.status(400).json({ success: false, error: 'Modalidad de asistencia inválida' });
    }
    const result = await pool.query(
      `UPDATE usuarios SET modalidad_asistencia = $1 WHERE id = $2
       RETURNING id, modalidad_asistencia`,
      [modalidad, req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    invalidarUsuarioCache(Number(req.params.id));
    return res.json({ success: true, data: result.rows[0], message: 'Modalidad actualizada' });
  } catch (error) {
    console.error('[usuarios.routes] PATCH modalidad:', error);
    return res.status(500).json({ success: false, error: 'Error actualizando modalidad' });
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
