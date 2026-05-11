// controllers/ventas.controller.js
// ============================================================
// CORRECCIONES:
// 1. usuario_id comparado como Number (JWT lo trae como string)
// 2. editarVenta usa valores actuales si el campo viene vacío
// 3. Log de diagnóstico incluido
// ============================================================

const db = require("../config/db");

const PERFILES_GLOBALES = ["supervisor", "analista", "gerencia", "administrador"];

// ── GET /api/ventas ─────────────────────────────────────────
const obtenerVentas = async (req, res) => {
  try {
    const { id: usuario_id, perfil, empresa } = req.user;
    // ✅ FIX: Convertir a Number por si el JWT lo trae como string
    const uid = Number(usuario_id);
    const esGlobal = PERFILES_GLOBALES.includes(perfil?.toLowerCase());

    console.log(`[VENTAS] uid=${uid} perfil=${perfil} empresa=${empresa} esGlobal=${esGlobal}`);

    let query, params;

    if (esGlobal) {
      query = `
        SELECT vr.*, u.usuario AS nombre_asesor
        FROM ventas_registros vr
        LEFT JOIN usuarios u ON vr.usuario_id = u.id
        WHERE vr.empresa = $1
        ORDER BY vr.usuario_id, vr.numero_venta ASC
      `;
      params = [empresa];
    } else {
      query = `
        SELECT vr.*, u.usuario AS nombre_asesor
        FROM ventas_registros vr
        LEFT JOIN usuarios u ON vr.usuario_id = u.id
        WHERE vr.usuario_id = $1
        ORDER BY vr.numero_venta ASC
      `;
      params = [uid];
    }

    const { rows } = await db.query(query, params);
    console.log(`[VENTAS] Registros encontrados: ${rows.length}`);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("Error obtenerVentas:", err);
    res.status(500).json({ ok: false, mensaje: "Error interno del servidor" });
  }
};

// ── POST /api/ventas ────────────────────────────────────────
const crearVenta = async (req, res) => {
  try {
    const { id: usuario_id, empresa } = req.user;
    // ✅ FIX: Convertir a Number
    const uid = Number(usuario_id);
    const { id_bitrix, plan, valor_plan, login, ingreso_telcos, fecha_ingreso, estado, pago, tercerdad,
            observacion, check_cedula, check_foto_cartel, check_resumen } = req.body;

    if (!estado) return res.status(400).json({ ok: false, mensaje: "El estado es requerido" });
    if (!pago)   return res.status(400).json({ ok: false, mensaje: "El tipo de pago es requerido" });

    const estadosValidos = ["ACTIVO", "DETENIDO", "RE-PLANIFICADO", "FACTIBLE", "PLANIFICADO", "ASIGNADO"];
    const pagosValidos   = ["EFEC", "TC", "CA"];
    if (!estadosValidos.includes(estado)) return res.status(400).json({ ok: false, mensaje: "Estado no válido" });
    if (!pagosValidos.includes(pago))     return res.status(400).json({ ok: false, mensaje: "Pago no válido" });

    const { rows: numRows } = await db.query(
      `SELECT COALESCE(MAX(numero_venta), 0) + 1 AS siguiente FROM ventas_registros WHERE usuario_id = $1`,
      [uid]
    );
    const numero_venta = numRows[0].siguiente;

    const { rows } = await db.query(
      `INSERT INTO ventas_registros
        (numero_venta, id_bitrix, plan, valor_plan, login, ingreso_telcos, fecha_ingreso, estado, pago, tercerdad,
         observacion, check_cedula, check_foto_cartel, check_resumen, usuario_id, empresa)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        numero_venta,
        id_bitrix?.trim()              || null,
        plan?.trim()                   || null,
        valor_plan?.trim()             || null,
        login?.trim()                  || null,
        ingreso_telcos != null && ingreso_telcos !== "" ? Number(ingreso_telcos) : null,
        fecha_ingreso                  || null,
        estado,
        pago,
        tercerdad === true || tercerdad === "SI",
        observacion?.trim()            || null,
        check_cedula === true          || check_cedula === "SI",
        check_foto_cartel === true     || check_foto_cartel === "SI",
        check_resumen === true         || check_resumen === "SI",
        uid,
        empresa,
      ]
    );

    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error("Error crearVenta:", err);
    res.status(500).json({ ok: false, mensaje: "Error interno del servidor" });
  }
};

// ── PUT /api/ventas/:id ─────────────────────────────────────
const editarVenta = async (req, res) => {
  try {
    const { id: usuario_id, perfil, empresa } = req.user;
    // ✅ FIX: Convertir a Number para comparar correctamente con BD
    const uid = Number(usuario_id);
    const { id } = req.params;
    const { id_bitrix, plan, valor_plan, login, ingreso_telcos, fecha_ingreso, estado, pago, tercerdad,
            observacion, check_cedula, check_foto_cartel, check_resumen } = req.body;
    const esAdmin = perfil?.toLowerCase() === "administrador";

    // Verificar existencia
    const { rows: existing } = await db.query(
      `SELECT * FROM ventas_registros WHERE id = $1`, [id]
    );
    if (existing.length === 0)
      return res.status(404).json({ ok: false, mensaje: "Registro no encontrado" });

    const registro = existing[0];

    if (!esAdmin && Number(registro.usuario_id) !== uid) {
      return res.status(403).json({ ok: false, mensaje: "No tienes permiso para editar este registro" });
    }
    if (esAdmin && registro.empresa !== empresa) {
      return res.status(403).json({ ok: false, mensaje: "Registro no pertenece a tu empresa" });
    }

    const { rows } = await db.query(
      `UPDATE ventas_registros SET
        id_bitrix         = $1,
        plan              = $2,
        valor_plan        = $3,
        login             = $4,
        ingreso_telcos    = $5,
        fecha_ingreso     = $6,
        estado            = $7,
        pago              = $8,
        tercerdad         = $9,
        observacion       = $10,
        check_cedula      = $11,
        check_foto_cartel = $12,
        check_resumen     = $13
       WHERE id = $14 RETURNING *`,
      [
        id_bitrix?.trim()     || registro.id_bitrix,
        plan?.trim()          || registro.plan,
        valor_plan?.trim()    || registro.valor_plan,
        login?.trim()         || registro.login,
        ingreso_telcos != null && ingreso_telcos !== "" ? Number(ingreso_telcos) : registro.ingreso_telcos,
        fecha_ingreso         || registro.fecha_ingreso,
        estado                || registro.estado,
        pago                  || registro.pago,
        tercerdad !== undefined
          ? (tercerdad === true || tercerdad === "SI")
          : registro.tercerdad,
        observacion !== undefined ? (observacion?.trim() || null) : registro.observacion,
        check_cedula !== undefined
          ? (check_cedula === true || check_cedula === "SI")
          : registro.check_cedula,
        check_foto_cartel !== undefined
          ? (check_foto_cartel === true || check_foto_cartel === "SI")
          : registro.check_foto_cartel,
        check_resumen !== undefined
          ? (check_resumen === true || check_resumen === "SI")
          : registro.check_resumen,
        id,
      ]
    );

    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error("Error editarVenta:", err);
    res.status(500).json({ ok: false, mensaje: "Error interno del servidor" });
  }
};

// ── DELETE /api/ventas/:id ──────────────────────────────────
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
    if (existing.length === 0)
      return res.status(404).json({ ok: false, mensaje: "Registro no encontrado" });
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
const exportarVentas = async (req, res) => {
  try {
    const { id: usuario_id, perfil, empresa } = req.user;
    const uid = Number(usuario_id);
    const esGlobal = PERFILES_GLOBALES.includes(perfil?.toLowerCase());

    let query, params;
    if (esGlobal) {
      query = `
        SELECT vr.numero_venta, vr.id_bitrix, vr.plan, vr.valor_plan,
               vr.login, vr.ingreso_telcos,
               vr.fecha_ingreso, vr.estado, vr.pago,
               CASE WHEN vr.tercerdad THEN 'SI' ELSE 'NO' END AS tercerdad,
               CASE WHEN vr.check_cedula      THEN 'SI' ELSE 'NO' END AS cedula_ambos_lados,
               CASE WHEN vr.check_foto_cartel THEN 'SI' ELSE 'NO' END AS foto_cartel,
               CASE WHEN vr.check_resumen     THEN 'SI' ELSE 'NO' END AS resumen,
               vr.observacion,
               u.usuario AS asesor
        FROM ventas_registros vr
        LEFT JOIN usuarios u ON vr.usuario_id = u.id
        WHERE vr.empresa = $1
        ORDER BY u.usuario, vr.numero_venta
      `;
      params = [empresa];
    } else {
      query = `
        SELECT numero_venta, id_bitrix, plan, valor_plan,
               login, ingreso_telcos,
               fecha_ingreso, estado, pago,
               CASE WHEN tercerdad      THEN 'SI' ELSE 'NO' END AS tercerdad,
               CASE WHEN check_cedula      THEN 'SI' ELSE 'NO' END AS cedula_ambos_lados,
               CASE WHEN check_foto_cartel THEN 'SI' ELSE 'NO' END AS foto_cartel,
               CASE WHEN check_resumen     THEN 'SI' ELSE 'NO' END AS resumen,
               observacion
        FROM ventas_registros
        WHERE usuario_id = $1
        ORDER BY numero_venta
      `;
      params = [uid];
    }

    const { rows } = await db.query(query, params);
    if (rows.length === 0)
      return res.status(404).json({ ok: false, mensaje: "Sin datos para exportar" });

    const headers = Object.keys(rows[0]).join(",");
    const csvRows = rows.map(r =>
      Object.values(r).map(v => `"${v ?? ""}"`).join(",")
    );
    const csv = [headers, ...csvRows].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="ventas_${Date.now()}.csv"`);
    res.send("\uFEFF" + csv);
  } catch (err) {
    console.error("Error exportarVentas:", err);
    res.status(500).json({ ok: false, mensaje: "Error interno del servidor" });
  }
};

module.exports = { obtenerVentas, crearVenta, editarVenta, eliminarVenta, exportarVentas };