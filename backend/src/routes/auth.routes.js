const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

router.post('/login', async (req, res) => {
  try {
    // 1. Recibir datos (aceptamos tanto español como inglés por seguridad)
    const { usuario, contraseña, username, password } = req.body;
    const userLogin = usuario || username;
    const passLogin = contraseña || password;

    // 2. Buscar usuario en la Base de Datos
    const result = await pool.query(
      'SELECT * FROM users WHERE username=$1 AND activo=true',
      [userLogin]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Usuario no encontrado' });
    }

    const user = result.rows[0];

    // 3. Validar Contraseña
    const match = await bcrypt.compare(passLogin, user.password_hash);
    
    if (!match) {
      return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
    }

    // =================================================================
    // ZONA DE EMERGENCIA: ASIGNACIÓN MANUAL DE URLS (Hardcode)
    // Edita aquí las URLs de tus reportes de Looker Studio
    // =================================================================
    
    let urlReporte = "";

    // Asegúrate de que los roles coincidan EXACTAMENTE con lo que tienes en BD
    if (user.rol === 'SUPERVISOR') {
        urlReporte = "https://lookerstudio.google.com/embed/reporting/5cfdbb81-95d3-428a-9e43-ac3a1687ba9c/page/0U7lF"; 
    } 
    else if (user.rol === 'ASESOR') {
        urlReporte = "https://lookerstudio.google.com/embed/reporting/5cfdbb81-95d3-428a-9e43-ac3a1687ba9c/page/0U7lF"; 
    } 
    else if (user.rol === 'ANALISTA') {
        urlReporte = "https://lookerstudio.google.com/embed/reporting/256bf4b5-e032-4d1f-b799-c931be1b38d9/page/4a8lF";
    }
    else if (user.rol === 'GERENCIA') {
        urlReporte = "https://lookerstudio.google.com/embed/reporting/6579e74e-9a91-4cbb-90ac-5f43448026f9/page/Hq8lF";
    }
    else {
        // URL por defecto si el rol no tiene una asignada
        urlReporte = ""; 
    }
    
    // =================================================================

    // 4. Generar Token
    const token = jwt.sign(
      { id: user.id, rol: user.rol },
      process.env.JWT_SECRET || 'secreto_super_seguro', // Fallback por si falta .env
      { expiresIn: '8h' }
    );

    // 5. Responder al Frontend
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        usuario: user.username,
        perfil: user.rol,
        nombre: user.nombres_completos,
        url_reporte: urlReporte // Enviamos la URL forzada
      }
    });

  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;