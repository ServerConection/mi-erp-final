const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

router.post('/login', async (req, res) => {
  try {
    // 1. Recibir datos
    const { usuario, contraseña, username, password } = req.body;
    const userLogin = usuario || username;
    const passLogin = contraseña || password;

    if (!userLogin || !passLogin) {
        return res.status(400).json({ success: false, error: "Faltan datos de acceso" });
    }

    // 2. Buscar usuario en la Base de Datos
    const result = await pool.query(
      'SELECT * FROM users WHERE username=$1', 
      [userLogin]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Usuario no encontrado' });
    }

    const user = result.rows[0];

    // 3. Validar Contraseña (seguridad doble campo)
    const dbPassword = user.password || user.password_hash;

    if (!dbPassword) {
        console.error("Error: Usuario sin contraseña válida.");
        return res.status(500).json({ success: false, error: 'Error de datos' });
    }

    const match = await bcrypt.compare(passLogin, dbPassword);
    
    if (!match) {
      return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
    }

    // =================================================================
    // ZONA DE REPORTES (LINKS INTERCAMBIADOS SEGÚN TU PEDIDO)
    // =================================================================
    
    let urlReporte = "";
    const rolUsuario = user.rol ? user.rol.toUpperCase() : "";

    if (rolUsuario === 'SUPERVISOR') {
        // Mantiene el mismo de ventas
        urlReporte = "https://lookerstudio.google.com/embed/reporting/5cfdbb81-95d3-428a-9e43-ac3a1687ba9c/page/0U7lF"; 
    } 
    else if (rolUsuario === 'ASESOR') {
        // CAMBIO: Ahora tiene el link que era de Analista (...4a8lF)
        urlReporte = "https://lookerstudio.google.com/embed/reporting/256bf4b5-e032-4d1f-b799-c931be1b38d9/page/4a8lF"; 
    } 
    else if (rolUsuario === 'ANALISTA') {
        // CAMBIO: Ahora tiene el link que era de Asesor (...0U7lF)
        urlReporte = "https://lookerstudio.google.com/embed/reporting/5cfdbb81-95d3-428a-9e43-ac3a1687ba9c/page/0U7lF";
    }
    else if (rolUsuario === 'GERENCIA') {
        urlReporte = "https://lookerstudio.google.com/embed/reporting/6579e74e-9a91-4cbb-90ac-5f43448026f9/page/Hq8lF";
    }
    else if (rolUsuario === 'ADMINISTRADOR') {
         urlReporte = "https://lookerstudio.google.com/embed/reporting/256bf4b5-e032-4d1f-b799-c931be1b38d9/page/4a8lF";
    }
    
    // =================================================================

    // 4. Generar Token
    const token = jwt.sign(
      { id: user.id, rol: user.rol },
      process.env.JWT_SECRET || 'secreto_v1_super_seguro', 
      { expiresIn: '8h' }
    );

    // 5. Responder
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        usuario: user.username,
        perfil: user.rol,
        nombre: user.nombres_completos,
        url_reporte: urlReporte 
      }
    });

  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;