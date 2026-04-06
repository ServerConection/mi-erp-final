// controllers/ventas.controller.js
// ============================================================
// Módulo: Seguimiento de Ventas
// Seguridad: Solo ve sus propios registros (asesor)
//            Supervisor/Analista/Gerencia/Administrador: ven todos
//            Solo Administrador puede eliminar
// ============================================================

const db = require("../config/db");

// Perfiles con acceso global (ver todos los registros)
const PERFILES_GLOBALES = ["supervisor", "analista", "gerencia", "administrador"];

// ── GET /api/ventas ─────────────────────────────────────────
// Retorna registros según perfil del usuario logueado
const obtenerVentas = async (req, res) => {
  try {
    const { id: usuario_id, perfil, empresa } = req.user;
    const esGlobal = PERFILES_GLOBALES.includes(perfil?.toLowerCase());

    let query, params;

    if (esGlobal) {
      // Administrador/Supervisor/etc: ve TODOS de su empresa
      query = `
        SELECT vr.*, u.usuario AS nombre_asesor
        FROM ventas_registros vr
        LEFT JOIN usuarios u ON vr.usuario_id = u.id
        WHERE vr.empresa = $1
        ORDER BY vr.usuario_id, vr.numero_venta ASC
      `;
      params = [empresa];
    } else {
      // Asesor: solo sus propios registros
      query = `
        SELECT vr.*, u.usuario AS nombre_asesor
        FROM ventas_registros vr
        LEFT JOIN usuarios u ON vr.usuario_id = u.id
        WHERE vr.usuario_id = $1
        ORDER BY vr.numero_venta ASC
      `;
      params = [usuario_id];
    }

    const { rows } = await db.query(query, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("Error obtenerVentas:", err);
    res.status(500).json({ ok: false, mensaje: "Error interno del servidor" });
  }
};

// ── POST /api/ventas ────────────────────────────────────────
// Crear nuevo registro — todos los perfiles pueden crear (para sí mismos)
const crearVenta = async (req, res) => {
  try {
    const { id: usuario_id, empresa } = req.user;
    const { id_bitrix, plan, ciudad, fecha_ingreso, estado, pago, tercerdad } = req.body;

    // Validaciones básicas
    if (!estado) return res.status(400).json({ ok: false, mensaje: "El estado es requerido" });
    if (!pago)   return res.status(400).json({ ok: false, mensaje: "El tipo de pago es requerido" });

    const estadosValidos = ["ACTIVO", "DETENIDO", "RE-PLANIFICADO", "FACTIBLE", "PLANIFICADO", "ASIGNADO"];
    const pagosValidos   = ["EFEC", "TC", "CA"];
    if (!estadosValidos.includes(estado)) return res.status(400).json({ ok: false, mensaje: "Estado no válido" });
    if (!pagosValidos.includes(pago))     return res.status(400).json({ ok: false, mensaje: "Pago no válido" });

    // Calcular siguiente número de venta para este usuario
    const { rows: numRows } = await db.query(
      `SELECT COALESCE(MAX(numero_venta), 0) + 1 AS siguiente FROM ventas_registros WHERE usuario_id = $1`,
      [usuario_id]
    );
    const numero_venta = numRows[0].siguiente;

    const { rows } = await db.query(
      `INSERT INTO ventas_registros
        (numero_venta, id_bitrix, plan, ciudad, fecha_ingreso, estado, pago, tercerdad, usuario_id, empresa)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [numero_venta, id_bitrix || null, plan || null, ciudad || null,
       fecha_ingreso || null, estado, pago, tercerdad === true || tercerdad === "SI", usuario_id, empresa]
    );

    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error("Error crearVenta:", err);
    res.status(500).json({ ok: false, mensaje: "Error interno del servidor" });
  }
};

// ── PUT /api/ventas/:id ─────────────────────────────────────
// Editar registro:
//   - Asesor: solo puede editar sus propios registros
//   - Administrador: puede editar cualquiera de su empresa
const editarVenta = async (req, res) => {
  try {
    const { id: usuario_id, perfil, empresa } = req.user;
    const { id } = req.params;
    const { id_bitrix, plan, ciudad, fecha_ingreso, estado, pago, tercerdad } = req.body;
    const esAdmin = perfil?.toLowerCase() === "administrador";

    // Verificar existencia y permisos
    const { rows: existing } = await db.query(
      `SELECT * FROM ventas_registros WHERE id = $1`, [id]
    );
    if (existing.length === 0) return res.status(404).json({ ok: false, mensaje: "Registro no encontrado" });

    const registro = existing[0];

    // Asesor solo edita los suyos; admin edita cualquiera de su empresa
    if (!esAdmin && registro.usuario_id !== usuario_id) {
      return res.status(403).json({ ok: false, mensaje: "No tienes permiso para editar este registro" });
    }
    if (esAdmin && registro.empresa !== empresa) {
      return res.status(403).json({ ok: false, mensaje: "Registro no pertenece a tu empresa" });
    }

    const { rows } = await db.query(
      `UPDATE ventas_registros SET
        id_bitrix     = COALESCE($1, id_bitrix),
        plan          = COALESCE($2, plan),
        ciudad        = COALESCE($3, ciudad),
        fecha_ingreso = COALESCE($4, fecha_ingreso),
        estado        = COALESCE($5, estado),
        pago          = COALESCE($6, pago),
        tercerdad     = COALESCE($7, tercerdad)
       WHERE id = $8 RETURNING *`,
      [id_bitrix ?? null, plan ?? null, ciudad ?? null, fecha_ingreso ?? null,
       estado ?? null, pago ?? null,
       tercerdad !== undefined ? (tercerdad === true || tercerdad === "SI") : null,
       id]
    );

    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error("Error editarVenta:", err);
    res.status(500).json({ ok: false, mensaje: "Error interno del servidor" });
  }
};

// ── DELETE /api/ventas/:id ──────────────────────────────────
// SOLO Administrador puede eliminar
const eliminarVenta = async (req, res) => {
  try {
    const { perfil, empresa } = req.user;
    const { id } = req.params;

    if (perfil?.toLowerCase() !== "administrador") {
      return res.status(403).json({ ok: false, mensaje: "Solo el administrador puede eliminar registros" });
    }

    const { rows: existing } = await db.query(
      `SELECT * FROM ventas_registros WHERE id = $1`, [id]
    );
    if (existing.length === 0) return res.status(404).json({ ok: false, mensaje: "Registro no encontrado" });
    if (existing[0].empresa !== empresa) {
      return res.status(403).json({ ok: false, mensaje: "Registro no pertenece a tu empresa" });
    }

    await db.query(`DELETE FROM ventas_registros WHERE id = $1`, [id]);
    res.json({ ok: true, mensaje: "Registro eliminado correctamente" });
  } catch (err) {
    console.error("Error eliminarVenta:", err);
    res.status(500).json({ ok: false, mensaje: "Error interno del servidor" });
  }
};

// ── GET /api/ventas/exportar ────────────────────────────────
// Exportar datos en CSV según perfil
const exportarVentas = async (req, res) => {
  try {
    const { id: usuario_id, perfil, empresa } = req.user;
    const esGlobal = PERFILES_GLOBALES.includes(perfil?.toLowerCase());

    let query, params;
    if (esGlobal) {
      query = `
        SELECT vr.numero_venta, vr.id_bitrix, vr.plan, vr.ciudad,
               vr.fecha_ingreso, vr.estado, vr.pago,
               CASE WHEN vr.tercerdad THEN 'SI' ELSE 'NO' END AS tercerdad,
               u.usuario AS asesor
        FROM ventas_registros vr
        LEFT JOIN usuarios u ON vr.usuario_id = u.id
        WHERE vr.empresa = $1
        ORDER BY u.usuario, vr.numero_venta
      `;
      params = [empresa];
    } else {
      query = `
        SELECT numero_venta, id_bitrix, plan, ciudad,
               fecha_ingreso, estado, pago,
               CASE WHEN tercerdad THEN 'SI' ELSE 'NO' END AS tercerdad
        FROM ventas_registros
        WHERE usuario_id = $1
        ORDER BY numero_venta
      `;
      params = [usuario_id];
    }

    const { rows } = await db.query(query, params);
    if (rows.length === 0) return res.status(404).json({ ok: false, mensaje: "Sin datos para exportar" });

    const headers = Object.keys(rows[0]).join(",");
    const csvRows = rows.map(r =>
      Object.values(r).map(v => `"${v ?? ""}"`).join(",")
    );
    const csv = [headers, ...csvRows].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="ventas_${Date.now()}.csv"`);
    res.send("\uFEFF" + csv); // BOM para Excel
  } catch (err) {
    console.error("Error exportarVentas:", err);
    res.status(500).json({ ok: false, mensaje: "Error interno del servidor" });
  }
};

module.exports = { obtenerVentas, crearVenta, editarVenta, eliminarVenta, exportarVentas };