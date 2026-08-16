// src/routes/backoffice.routes.js
// ============================================================
// Módulo BACKOFFICE — Auditoría de registros envios_ventas
// GET  /api/backoffice        → listar registros
// GET  /api/backoffice/:id    → detalle completo de un registro
// PUT  /api/backoffice/:id    → editar solo campos de auditoría
// Todos los perfiles excepto ASESOR
// ============================================================

const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { verificarToken, noAsesor } = require('../middleware/auth');

router.use(verificarToken, noAsesor);

// ─── GET /api/backoffice ─────────────────────────────────────────────────────
// Lista todos los registros con columnas clave para la tabla
// Comparación de fechas TOLERANTE AL TIPO DE COLUMNA.
// En envios_ventas estas columnas pueden venir como date, timestamp o texto
// ISO según el registro. Un ::date directo revienta con cualquier valor
// malformado y tumba toda la consulta. LEFT(col::text, 10) devuelve siempre
// 'YYYY-MM-DD' en los tres casos y nunca lanza excepción.
const fechaCol = (col) => `LEFT(${col}::text, 10)`;

router.get('/', async (req, res) => {
  try {
    const {
      buscar = '', page = 1, limit = 100,
      // ── Filtros nuevos (todos opcionales: si no vienen, no se aplican) ──
      fechaDesde = '', fechaHasta = '',                 // fecha_registro_sistema
      activacionDesde = '', activacionHasta = '',       // fecha_activacion_netlife
      login = '',                                        // netlife_login
      estatusNetlife = '',                               // netlife_estatus_real
      terceraEdad = '',                                  // aplica_descuento_3ra_edad
      estatusRegularizacion = '',                        // estatus_regularizacion
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = "WHERE estatus_envio != 'BORRADOR'";
    const params = [];
    const P = (v) => { params.push(v); return `$${params.length}`; };

    if (buscar.trim()) {
      const p = P(`%${buscar.trim()}%`);
      whereClause += ` AND (
        codigo_asesor            ILIKE ${p} OR
        id_bitrix                ILIKE ${p} OR
        nombre_cliente_completo  ILIKE ${p} OR
        numero_identificacion    ILIKE ${p} OR
        distribuidor_autorizado  ILIKE ${p} OR
        supervisor               ILIKE ${p}
      )`;
    }

    // ── FECHA DE REGISTRO ────────────────────────────────────────────────
    if (fechaDesde) whereClause += ` AND ${fechaCol('fecha_registro_sistema')} >= ${P(fechaDesde)}`;
    if (fechaHasta) whereClause += ` AND ${fechaCol('fecha_registro_sistema')} <= ${P(fechaHasta)}`;

    // ── FECHA DE ACTIVACIÓN ──────────────────────────────────────────────
    if (activacionDesde) whereClause += ` AND ${fechaCol('fecha_activacion_netlife')} >= ${P(activacionDesde)}`;
    if (activacionHasta) whereClause += ` AND ${fechaCol('fecha_activacion_netlife')} <= ${P(activacionHasta)}`;

    // ── LOGIN NETLIFE (coincidencia parcial: se suele buscar por fragmento) ──
    if (login.trim()) whereClause += ` AND netlife_login ILIKE ${P(`%${login.trim()}%`)}`;

    // ── ESTATUS NETLIFE / REGULARIZACIÓN / 3RA EDAD ──────────────────────
    // Match EXACTO (case-insensitive) porque vienen de un catálogo cerrado.
    if (estatusNetlife.trim())
      whereClause += ` AND UPPER(TRIM(netlife_estatus_real)) = UPPER(TRIM(${P(estatusNetlife.trim())}))`;
    if (estatusRegularizacion.trim())
      whereClause += ` AND UPPER(TRIM(estatus_regularizacion)) = UPPER(TRIM(${P(estatusRegularizacion.trim())}))`;
    if (terceraEdad.trim())
      whereClause += ` AND UPPER(TRIM(aplica_descuento_3ra_edad)) = UPPER(TRIM(${P(terceraEdad.trim())}))`;

    const countParams = [...params];
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM public.envios_ventas ${whereClause}`,
      countParams
    );

    params.push(parseInt(limit), offset);
    const limitParam  = params.length - 1;
    const offsetParam = params.length;

    // SELECT * : la vista muestra TODAS las columnas de la tabla.
    // Antes se devolvía un subconjunto fijo de 18 columnas, así que el resto
    // ni siquiera llegaba al frontend. El límite de filas (LIMIT) sigue
    // controlando el peso de la respuesta.
    const { rows } = await pool.query(`
      SELECT *
      FROM public.envios_ventas
      ${whereClause}
      ORDER BY id DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `, params);

    res.json({ success: true, data: rows, total: countRows[0].total });
  } catch (e) {
    console.error('[BACKOFFICE] GET list:', e.message);
    res.status(500).json({ success: false, error: 'Error interno al cargar los registros' });
  }
});

// ─── GET /api/backoffice/opciones ────────────────────────────────────────────
// Valores distintos que existen realmente en la tabla, para poblar los combos
// de los filtros. Así el usuario elige de una lista en vez de adivinar cómo
// está escrito el estado.
//
// OJO — ESTA RUTA VA ANTES QUE '/:id'. Si se declara después, Express hace
// match de '/opciones' contra '/:id' (id = "opciones") y la consulta falla.
router.get('/opciones', async (req, res) => {
  try {
    const distintos = async (col) => {
      const { rows } = await pool.query(`
        SELECT DISTINCT TRIM(${col}) AS v
        FROM public.envios_ventas
        WHERE ${col} IS NOT NULL AND TRIM(${col}) <> ''
          AND estatus_envio != 'BORRADOR'
        ORDER BY 1
      `);
      return rows.map(r => r.v);
    };

    const [estatusNetlife, estatusRegularizacion, terceraEdad] = await Promise.all([
      distintos('netlife_estatus_real'),
      distintos('estatus_regularizacion'),
      distintos('aplica_descuento_3ra_edad'),
    ]);

    res.json({ success: true, data: { estatusNetlife, estatusRegularizacion, terceraEdad } });
  } catch (e) {
    console.error('[BACKOFFICE] GET opciones:', e.message);
    res.status(500).json({ success: false, error: 'Error interno al cargar las opciones de filtro' });
  }
});

// ─── GET /api/backoffice/:id ──────────────────────────────────────────────────
// Detalle completo de un registro
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM public.envios_ventas WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0)
      return res.status(404).json({ success: false, error: 'Registro no encontrado' });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    console.error('[BACKOFFICE] GET detail:', e.message);
    res.status(500).json({ success: false, error: 'Error interno al cargar el registro' });
  }
});

// Arriba, fuera de la ruta, declaras la whitelist
const CAMPOS_EDITABLES = new Set([
  'estatus_envio', 'codigo_asesor', 'id_bitrix', 'distribuidor_autorizado',
  'supervisor', 'origen_venta', 'venta_nueva_o_reingreso', 'turno',
  'nombre_atc', 'clausulas', 'lider_comercial',
  'tipo_cliente', 'genero_cliente', 'tipo_documento', 'numero_identificacion',
  'nombre_cliente_completo', 'estado_civil', 'fecha_nacimiento', 'email_cliente',
  'aplica_descuento_3ra_edad', 'telf_celular_pin', 'telf_celular_2', 'telf_fijo',
  'provincia', 'ciudad', 'parroquia_barrio', 'direccion_calles',
  'direccion_manzana_villa', 'referencia_ubicacion', 'coordenadas_gps',
  'tipo_vivienda', 'regimen_vivienda',
  'plan_contratado_final', 'servicios_digitales', 'forma_pago',
  'detalle_bancario_ahorros', 'valor_pago', 'tipo_contrato', 'banco',
  'ciclo_facturacion', 'costo_instalacion', 'descuento_instalacion',
  'beneficios_adicionales', 'beneficios_de_ley', 'plazo_contrato_meses',
  'resumen_venta',
  'estado_recaudacion', 'netlife_login', 'netlife_estatus_real',
  'calidad_venta_analista', 'novedades_atc', 'venta_efectiva',
  'auditoria_documentos', 'auditado_por', 'inconsistencia_documental',
  'observacion_auditoria', 'errores_telcos', 'estatus_regularizacion',
  'detalle_regularizacion', 'fecha_regularizacion_atc', 'mes_regularizacion',
  'observacion_venta_original', 'observacion_gestion_cobranza',
  'foto_cedula_frontal', 'foto_cedula_trasera', 'foto_carnet',
  'archivo_resumen', 'links_documentos',
]);

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// ─── PUT /api/backoffice/:id ──────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validación del ID (solo números)
    if (!/^\d+$/.test(String(id))) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    // Construcción del payload filtrando solo lo permitido
    const payload = {};
    for (const [clave, valor] of Object.entries(req.body || {})) {
      if (!CAMPOS_EDITABLES.has(clave)) continue; // descarta id y todo lo no permitido
      payload[clave] = valor === '' ? null : valor;
    }

    // Manejo de la fecha y cálculo de campos derivados
    if ('fecha_regularizacion_atc' in payload) {
      const raw = payload.fecha_regularizacion_atc;

      if (!raw) {
        payload.fecha_regularizacion_atc   = null;
        payload.año_regularizacion_atc     = null;
        payload.mes_regularizacion_atc     = null;
        payload.dia_num_regularizacion_atc = null;
        payload.dia_abc_regularizacion_atc = null;
      } else {
        const soloFecha = String(raw).slice(0, 10);
        const d = new Date(`${soloFecha}T00:00:00`);

        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({
            success: false,
            error: 'fecha_regularizacion_atc debe tener formato YYYY-MM-DD',
          });
        }

        payload.fecha_regularizacion_atc   = soloFecha;
        payload.año_regularizacion_atc     = d.getFullYear();
        payload.mes_regularizacion_atc     = MESES[d.getMonth()];
        payload.dia_num_regularizacion_atc = d.getDate();
        payload.dia_abc_regularizacion_atc = DIAS[d.getDay()];
      }
    }

    const fields = Object.keys(payload);
    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No hay datos válidos para actualizar' });
    }

    // Construcción dinámica y parametrizada del SET
    const setClause = fields
      .map((field, idx) => `"${field}" = $${idx + 1}`)
      .join(', ');

    const values = fields.map(field => payload[field]);
    values.push(id);

    const query = `
      UPDATE public.envios_ventas 
      SET ${setClause} 
      WHERE id = $${values.length} 
      RETURNING *
    `;

    const { rows } = await pool.query(query, values);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Registro no encontrado' });
    }

    res.json({ success: true, data: rows[0], mensaje: 'Registro actualizado correctamente' });
  } catch (e) {
    // Se loguea el error real en servidor, se envía mensaje genérico al cliente
    console.error('[BACKOFFICE] Error en PUT update:', e.message);
    res.status(500).json({ success: false, error: 'Error interno al actualizar el registro' });
  }
});

module.exports = router;
