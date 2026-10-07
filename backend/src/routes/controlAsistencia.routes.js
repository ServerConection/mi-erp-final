const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { verificarToken } = require("../middleware/auth");

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN
// ─────────────────────────────────────────────────────────────

const ACTIVIDADES = new Set([
  "INGRESO",
  "SALIDA ALMUERZO",
  "INGRESO ALMUERZO",
  "SALIDA",
]);

// Mensajes que se muestran al usuario después de registrar.
const MENSAJES_ACTIVIDAD = {
  INGRESO: "¡Que tengas un excelente día! Vamos con todo 💪",
  "SALIDA ALMUERZO":
    "¡Buen provecho! Disfruta tu almuerzo y recarga energías 🍽️",
  "INGRESO ALMUERZO":
    "¡Bienvenido nuevamente! Vamos con todo en esta segunda parte del día 🚀",
  SALIDA:
    "¡Gracias por tu esfuerzo y compromiso de hoy! Que tengas un excelente descanso 🙌",
};

// Perfiles autorizados.
const PERFILES_PERMITIDOS = new Set([
  "ADMINISTRADOR",
  "GERENCIA",
  "SUPERVISOR",
  "ATC",
]);

const normalizarTexto = (valor) =>
  String(valor || "")
    .trim()
    .toUpperCase();

// ─────────────────────────────────────────────────────────────
// OBTENER IP
// ─────────────────────────────────────────────────────────────

function obtenerIp(req) {
  const forwarded = req.headers["x-forwarded-for"];

  let ip = forwarded
    ? String(forwarded).split(",")[0].trim()
    : req.ip ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    null;

  // Convierte:
  // ::ffff:192.168.1.1
  // en:
  // 192.168.1.1
  if (ip && ip.startsWith("::ffff:")) {
    ip = ip.substring(7);
  }

  return ip;
}

// ─────────────────────────────────────────────────────────────
// POST /api/control-asistencia
// ─────────────────────────────────────────────────────────────

router.post("/", verificarToken, async (req, res) => {
  try {
    const usuario = req.user;

    // ─────────────────────────────────────────────────────
    // VALIDAR AUTENTICACIÓN
    // ─────────────────────────────────────────────────────

    if (!usuario?.id) {
      return res.status(401).json({
        success: false,
        error: "Usuario no autenticado",
      });
    }

    // ─────────────────────────────────────────────────────
    // VALIDAR PERFIL
    // ─────────────────────────────────────────────────────

    const perfilUsuario = normalizarTexto(usuario.perfil);

    if (!PERFILES_PERMITIDOS.has(perfilUsuario)) {
      return res.status(403).json({
        success: false,
        error:
          "No tiene permiso para registrar asistencia",
      });
    }

    // ─────────────────────────────────────────────────────
    // VALIDAR ACTIVIDAD
    // ─────────────────────────────────────────────────────

    const actividad = normalizarTexto(
      req.body?.actividad
    );

    if (!ACTIVIDADES.has(actividad)) {
      return res.status(400).json({
        success: false,
        error: "Actividad inválida",
      });
    }

    // ─────────────────────────────────────────────────────
    // VALIDAR UBICACIÓN
    // ─────────────────────────────────────────────────────

    const latitud = Number(req.body?.latitud);

    const longitud = Number(
      req.body?.longitud
    );

    const precisionMetros = Number(
      req.body?.precision_metros
    );

    if (
      !Number.isFinite(latitud) ||
      !Number.isFinite(longitud) ||
      !Number.isFinite(precisionMetros)
    ) {
      return res.status(400).json({
        success: false,
        error:
          "La ubicación enviada no es válida",
      });
    }

    if (latitud < -90 || latitud > 90) {
      return res.status(400).json({
        success: false,
        error: "Latitud inválida",
      });
    }

    if (
      longitud < -180 ||
      longitud > 180
    ) {
      return res.status(400).json({
        success: false,
        error: "Longitud inválida",
      });
    }

    if (precisionMetros < 0) {
      return res.status(400).json({
        success: false,
        error:
          "Precisión de ubicación inválida",
      });
    }

    // ─────────────────────────────────────────────────────
    // DATOS DEL USUARIO
    //
    // Estos datos NO vienen del frontend.
    // Se obtienen del token autenticado.
    // ─────────────────────────────────────────────────────

    const usuarioLogin =
      usuario.usuario ||
      usuario.username ||
      usuario.login ||
      "";

    const nombreCompleto =
      usuario.nombreCompleto ||
      usuario.nombre_completo ||
      usuario.nombre ||
      "";

    const cargo =
      usuario.perfil ||
      usuario.cargo ||
      "";

    const ip = obtenerIp(req);

    // ─────────────────────────────────────────────────────
    // EVITAR DOBLE REGISTRO ACCIDENTAL
    //
    // Si el mismo usuario intenta registrar la misma
    // actividad dentro de 3 segundos, se rechaza.
    // ─────────────────────────────────────────────────────

    const duplicado = await pool.query(
      `
      SELECT id
      FROM control_asistencia
      WHERE usuario_id = $1
        AND actividad = $2
        AND created_at >= NOW() - INTERVAL '3 seconds'
      LIMIT 1
      `,
      [usuario.id, actividad]
    );

    if (duplicado.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error:
          "Esta marcación ya fue registrada",
      });
    }

    // ─────────────────────────────────────────────────────
    // GUARDAR REGISTRO
    //
    // La fecha y hora oficial se generan aquí.
    // No dependemos del reloj del navegador.
    // ─────────────────────────────────────────────────────

    const query = `
      INSERT INTO control_asistencia (
        usuario_id,
        usuario,
        nombre_completo,
        cargo,
        actividad,
        fecha,
        hora,
        fecha_hora,
        ip_publica,
        latitud,
        longitud,
        precision_metros,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guayaquil')::date,
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guayaquil')::time,
        CURRENT_TIMESTAMP AT TIME ZONE 'America/Guayaquil',
        $6,
        $7,
        $8,
        $9,
        NOW(),
        NOW()
      )
      RETURNING *
    `;

    const values = [
      usuario.id,
      usuarioLogin,
      nombreCompleto,
      cargo,
      actividad,
      ip,
      latitud,
      longitud,
      precisionMetros,
    ];

    const result = await pool.query(
      query,
      values
    );

    const registro = result.rows[0];

    // ─────────────────────────────────────────────────────
    // RESPUESTA CON MENSAJE MOTIVACIONAL
    // ─────────────────────────────────────────────────────

    return res.status(201).json({
      success: true,

      data: registro,

      mensaje:
        MENSAJES_ACTIVIDAD[actividad] ||
        "Marcación registrada correctamente",
    });
  } catch (error) {
    console.error(
      "[controlAsistencia.routes] Error registrando marcación:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "Error interno al guardar la marcación",
    });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/control-asistencia/resumen-dia?fecha=YYYY-MM-DD
// Una fila por usuario con la primera marcación de cada actividad.
router.get("/resumen-dia", verificarToken, async (req, res) => {
  try {
    const usuario = req.user;
    if (!usuario?.id) {
      return res.status(401).json({ success: false, error: "Usuario no autenticado" });
    }
    if (!PERFILES_PERMITIDOS.has(normalizarTexto(usuario.perfil))) {
      return res.status(403).json({ success: false, error: "No tiene permiso para consultar marcaciones" });
    }

    const fecha = String(req.query.fecha || "").trim();
    if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return res.status(400).json({ success: false, error: "La fecha debe tener formato YYYY-MM-DD" });
    }

    const result = await pool.query(`
      SELECT
        fecha::text AS fecha,
        usuario_id,
        MAX(NULLIF(TRIM(usuario), '')) AS usuario,
        MAX(NULLIF(TRIM(nombre_completo), '')) AS nombre_completo,
        TO_CHAR(MIN(hora) FILTER (WHERE actividad = 'INGRESO'), 'HH24:MI') AS ingreso,
        TO_CHAR(MIN(hora) FILTER (WHERE actividad = 'SALIDA ALMUERZO'), 'HH24:MI') AS salida_almuerzo,
        TO_CHAR(MIN(hora) FILTER (WHERE actividad = 'INGRESO ALMUERZO'), 'HH24:MI') AS regreso_almuerzo,
        TO_CHAR(MIN(hora) FILTER (WHERE actividad = 'SALIDA'), 'HH24:MI') AS salida
      FROM public.control_asistencia
      WHERE fecha = COALESCE(NULLIF($1, '')::date,
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guayaquil')::date)
      GROUP BY fecha, usuario_id
      ORDER BY COALESCE(
        MIN(hora) FILTER (WHERE actividad = 'INGRESO'),
        MIN(hora)
      ) ASC, MAX(nombre_completo) ASC
    `, [fecha]);

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("[controlAsistencia.routes] Error consultando resumen diario:", error);
    return res.status(500).json({ success: false, error: "Error al obtener el resumen diario" });
  }
});

// GET /api/control-asistencia/mis-registros
// ─────────────────────────────────────────────────────────────

router.get(
  "/mis-registros",
  verificarToken,
  async (req, res) => {
    try {
      const usuario = req.user;

      if (!usuario?.id) {
        return res.status(401).json({
          success: false,
          error: "Usuario no autenticado",
        });
      }

      const perfilUsuario =
        normalizarTexto(usuario.perfil);

      if (
        !PERFILES_PERMITIDOS.has(
          perfilUsuario
        )
      ) {
        return res.status(403).json({
          success: false,
          error:
            "No tiene permiso para consultar marcaciones",
        });
      }

      let limit = Number(
        req.query.limit
      );

      if (
        !Number.isInteger(limit) ||
        limit <= 0
      ) {
        limit = 100;
      }

      limit = Math.min(limit, 200);

      const query = `
        SELECT
          id,
          usuario_id,
          usuario,
          nombre_completo,
          cargo,
          actividad,
          fecha,
          hora,
          fecha_hora,
          ip_publica,
          latitud,
          longitud,
          precision_metros,
          created_at
        FROM control_asistencia
        WHERE usuario_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `;

      const result = await pool.query(
        query,
        [usuario.id, limit]
      );

      return res.json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error(
        "[controlAsistencia.routes] Error consultando registros:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Error al obtener los registros",
      });
    }
  }
);

module.exports = router;
