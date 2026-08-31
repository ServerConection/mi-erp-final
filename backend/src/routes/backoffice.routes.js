// src/routes/backoffice.routes.js
// ============================================================
// Módulo BACKOFFICE — Auditoría de registros envios_ventas
// GET  /api/backoffice        → listar registros
// GET  /api/backoffice/:id    → detalle completo de un registro
// PUT  /api/backoffice/:id    → editar solo campos de auditoría
// Todos los perfiles excepto ASESOR
// ============================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verificarToken, noAsesor } = require('../middleware/auth');
const { enviarBienvenidaWelcome } = require('../services/email.service');
const { encolarWhatsappBienvenida } = require('../services/welcomeWhatsapp.service');

// ─── QUIÉN ENTRA A BACKOFFICE ───────────────────────────────────────────────
// Antes esta ruta usaba `noAsesor`, que bloquea `perfil === 'ASESOR'`.
// Ese perfil NO EXISTE en la tabla usuarios: los asesores están registrados
// como 'USUARIO' (93 de ellos). O sea que el guard no bloqueaba a nadie y
// cualquier vendedor podía leer y editar ventas ajenas —incluido valor_pago,
// plan contratado y los datos personales del cliente.
//
// Se cambia a lista blanca en vez de lista negra: si mañana aparece un perfil
// nuevo en la base, queda FUERA por defecto en vez de entrar por descuido.
// `noAsesor` se deja intacto porque lo usan otras 11 rutas del ERP.
const PERFILES_BACKOFFICE = new Set([
  'ADMINISTRADOR',   // transversal, ve las dos empresas
  'GERENCIA',
  'SUPERVISOR',
  'ANALISTA',
]);

const soloBackoffice = (req, res, next) => {
  const perfil = (req.user?.perfil || '').trim().toUpperCase();
  if (!PERFILES_BACKOFFICE.has(perfil)) {
    return res.status(403).json({
      success: false,
      error: 'Tu perfil no tiene acceso al módulo de Backoffice.',
    });
  }
  next();
};

router.use(verificarToken, soloBackoffice);

// ─── GET /api/backoffice ─────────────────────────────────────────────────────
// Lista todos los registros con columnas clave para la tabla
// Comparación de fechas TOLERANTE AL TIPO DE COLUMNA.
// En envios_ventas estas columnas pueden venir como date, timestamp o texto
// ISO según el registro. Un ::date directo revienta con cualquier valor
// malformado y tumba toda la consulta. LEFT(col::text, 10) devuelve siempre
// 'YYYY-MM-DD' en los tres casos y nunca lanza excepción.
const fechaCol = (col) => `LEFT(${col}::text, 10)`;

// ─── AISLAMIENTO POR EMPRESA ────────────────────────────────────────────────
// `distribuidor_autorizado` guarda NOVONET o VELSA y se deriva de
// usuarios.empresa al momento de registrar la venta (ver NuevaVenta.jsx).
// Antes, la empresa se elegía con un query param: cualquier usuario podía
// pedir la data de la otra empresa cambiando la URL. Ahora el alcance sale
// del token y el query param solo puede ESTRECHARLO, nunca ampliarlo.
//
// ADMINISTRADOR es transversal (ve las dos empresas), igual que en el resto
// del ERP.
//
// NOTA sobre registros sin empresa: hay filas históricas con
// distribuidor_autorizado NULL o vacío. Se dejan visibles para todos para no
// esconderle trabajo a nadie de un día para otro. Cuando esas filas estén
// normalizadas, quitar el `OR ... IS NULL` de abajo cierra el aislamiento
// del todo.
const empresaDelUsuario = (req) => {
  if (!req.user) return null;
  if (req.user.perfil === 'ADMINISTRADOR') return null;   // sin restricción
  const e = (req.user.empresa || '').trim().toUpperCase();
  return e || null;
};

/** Condición SQL de visibilidad. Devuelve '' cuando el usuario ve todo. */
const filtroEmpresa = (req, P) => {
  const empresa = empresaDelUsuario(req);
  if (!empresa) return '';
  return ` AND (UPPER(TRIM(COALESCE(distribuidor_autorizado,''))) = ${P(empresa)}
                OR COALESCE(TRIM(distribuidor_autorizado),'') = '')`;
};

/** ¿Este usuario puede tocar esta fila? */
const puedeVerRegistro = (req, row) => {
  const empresa = empresaDelUsuario(req);
  if (!empresa) return true;
  const dist = (row?.distribuidor_autorizado || '').trim().toUpperCase();
  return dist === '' || dist === empresa;
};

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
      empresa = '',
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
    // ── EMPRESA (distribuidor autorizado) ────────────────────────────────
    // Alcance obligatorio según el token (no se puede saltar desde la URL).
    whereClause += filtroEmpresa(req, P);

    // El selector de la UI solo puede estrechar dentro de lo permitido.
    const empresaPedida = empresa.trim().toUpperCase();
    const alcance = empresaDelUsuario(req);
    if (empresaPedida && empresaPedida !== 'TODOS') {
      if (alcance && empresaPedida !== alcance) {
        return res.status(403).json({
          success: false,
          error: 'No tienes acceso a los registros de esa empresa.',
        });
      }
      whereClause += ` AND UPPER(TRIM(distribuidor_autorizado)) = ${P(empresaPedida)}`;
    }

    const countParams = [...params];
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM public.envios_ventas ${whereClause}`,
      countParams
    );

    params.push(parseInt(limit), offset);
    const limitParam = params.length - 1;
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
    // Los combos solo ofrecen valores que el usuario realmente puede ver.
    const params = [];
    const P = (v) => { params.push(v); return `$${params.length}`; };
    const alcanceSql = filtroEmpresa(req, P);

    const distintos = async (col) => {
      const { rows } = await pool.query(`
        SELECT DISTINCT TRIM(${col}) AS v
        FROM public.envios_ventas
        WHERE ${col} IS NOT NULL AND TRIM(${col}) <> ''
          AND estatus_envio != 'BORRADOR'
          ${alcanceSql}
        ORDER BY 1
      `, params);
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

    // 404 (y no 403) a propósito: un usuario de otra empresa no debe poder
    // deducir que el registro existe probando IDs.
    if (!puedeVerRegistro(req, rows[0]))
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
  'archivo_resumen',
  'links_documentos',
  'gestion_atc',
  
  // Agendamiento
  'turno_agendado',
  'fecha_agenda',
  'mes_agenda',
  'dia_abc_agenda',

  // Ingreso a Telcos (preservicios)
  'fecha_ingreso_telcos',
]);

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// ─── PUT /api/backoffice/:id ──────────────────────────────────────────────────
// Programación persistente de bienvenidas: cada registro queda separado tres
// minutos del siguiente y WaBot procesa correo + WhatsApp en segundo plano.
router.get('/welcome/programaciones', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT registro_id, scheduled_at, status, attempts, last_error
       FROM welcome_notifications
       WHERE status IN ('pending', 'processing', 'failed')
       ORDER BY scheduled_at ASC`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('[WELCOME] Error listando programaciones:', error.message);
    res.status(500).json({ success: false, error: 'No se pudieron cargar las programaciones' });
  }
});

router.post('/welcome/programar', async (req, res) => {
  const ids = [...new Set((req.body?.registro_ids || []).map(Number).filter(Number.isSafeInteger))];
  const inicio = new Date(req.body?.inicio);

  if (!ids.length || ids.length > 200) {
    return res.status(400).json({ success: false, error: 'Selecciona entre 1 y 200 registros' });
  }
  if (Number.isNaN(inicio.getTime())) {
    return res.status(400).json({ success: false, error: 'La fecha y hora de inicio no son válidas' });
  }
  if (inicio.getTime() < Date.now() - 60 * 1000) {
    return res.status(400).json({ success: false, error: 'La fecha de inicio no puede estar en el pasado' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const seleccionados = await client.query(
      `SELECT id
       FROM public.envios_ventas
       WHERE id = ANY($1::bigint[])
         AND COALESCE(UPPER(TRIM(novedades_atc)), '') NOT IN ('NOTIFICADO', 'PENDIENTE')
       ORDER BY array_position($1::bigint[], id::bigint)`,
      [ids]
    );

    if (seleccionados.rows.length !== ids.length) {
      throw Object.assign(new Error('Uno o más registros ya no están disponibles en Sin notificar'), { status: 409 });
    }

    const programaciones = [];
    for (let indice = 0; indice < seleccionados.rows.length; indice += 1) {
      const registroId = seleccionados.rows[indice].id;
      const fechaProgramada = new Date(inicio.getTime() + indice * 3 * 60 * 1000);
      await client.query(
        `INSERT INTO welcome_notifications
           (registro_id, scheduled_at, status, email_sent, whatsapp_sent, attempts, last_error, created_by, updated_at, completed_at)
         VALUES ($1, $2, 'pending', false, false, 0, NULL, $3, NOW(), NULL)
         ON CONFLICT (registro_id) DO UPDATE SET
           scheduled_at=EXCLUDED.scheduled_at, status='pending', email_sent=false,
           whatsapp_sent=false, attempts=0, last_error=NULL,
           created_by=EXCLUDED.created_by, updated_at=NOW(), completed_at=NULL`,
        [registroId, fechaProgramada.toISOString(), req.user.id]
      );
      await client.query(
        `UPDATE public.envios_ventas SET novedades_atc='PENDIENTE' WHERE id=$1`,
        [registroId]
      );
      programaciones.push({ registro_id: registroId, scheduled_at: fechaProgramada.toISOString(), status: 'pending' });
    }

    await client.query('COMMIT');
    res.json({ success: true, data: programaciones, intervalo_minutos: 3 });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[WELCOME] Error programando:', error.message);
    res.status(error.status || 500).json({ success: false, error: error.message || 'No se pudieron programar los envíos' });
  } finally {
    client.release();
  }
});

router.post('/welcome/programaciones/:registroId/cancelar', async (req, res) => {
  try {
    const registroId = Number(req.params.registroId);
    if (!Number.isSafeInteger(registroId)) {
      return res.status(400).json({ success: false, error: 'Registro inválido' });
    }
    const cancelada = await pool.query(
      `UPDATE welcome_notifications
       SET status='cancelled', updated_at=NOW(), last_error=NULL
       WHERE registro_id=$1 AND status IN ('pending', 'failed')
       RETURNING id`,
      [registroId]
    );
    if (!cancelada.rows.length) {
      return res.status(409).json({ success: false, error: 'La notificación ya se está enviando o terminó' });
    }
    await pool.query(
      `UPDATE public.envios_ventas
       SET novedades_atc=NULL
       WHERE id=$1 AND UPPER(TRIM(COALESCE(novedades_atc, '')))='PENDIENTE'`,
      [registroId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[WELCOME] Error cancelando:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo cancelar la programación' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validación del ID (solo números)
    if (!/^\d+$/.test(String(id))) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    // El registro debe existir Y pertenecer a la empresa del usuario.
    // Sin esto, cualquier perfil no-ASESOR podía editar ventas de la otra
    // empresa mandando el id directo al endpoint.
    const { rows: actual } = await pool.query(
      'SELECT distribuidor_autorizado FROM public.envios_ventas WHERE id = $1',
      [id]
    );
    if (actual.length === 0)
      return res.status(404).json({ success: false, error: 'Registro no encontrado' });
    if (!puedeVerRegistro(req, actual[0]))
      return res.status(404).json({ success: false, error: 'Registro no encontrado' });

    // Construcción del payload filtrando solo lo permitido
    const payload = {};
    for (const [clave, valor] of Object.entries(req.body || {})) {
      if (!CAMPOS_EDITABLES.has(clave)) continue; // descarta id y todo lo no permitido
      payload[clave] = valor === '' ? null : valor;
    }

    // El correo se dispara únicamente al entrar a NOTIFICADO. Guardar otros
    // campos de un registro que ya estaba notificado no debe reenviarlo.
    let debeEnviarBienvenida = false;
    if (String(payload.novedades_atc || '').trim().toUpperCase() === 'NOTIFICADO') {
      const anterior = await pool.query(
        'SELECT novedades_atc FROM public.envios_ventas WHERE id = $1',
        [id]
      );
      const estadoAnterior = String(anterior.rows[0]?.novedades_atc || '').trim().toUpperCase();
      debeEnviarBienvenida = estadoAnterior !== 'NOTIFICADO';
    }

    // Manejo de la fecha y cálculo de campos derivados
    if ('fecha_regularizacion_atc' in payload) {
      const raw = payload.fecha_regularizacion_atc;

      if (!raw) {
        payload.fecha_regularizacion_atc = null;
        payload.año_regularizacion_atc = null;
        payload.mes_regularizacion_atc = null;
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

        payload.fecha_regularizacion_atc = soloFecha;
        payload.año_regularizacion_atc = d.getFullYear();
        payload.mes_regularizacion_atc = MESES[d.getMonth()];
        payload.dia_num_regularizacion_atc = d.getDate();
        payload.dia_abc_regularizacion_atc = DIAS[d.getDay()];
      }
    }

    // ─── Manejo de fecha de agenda ────────────────────────────────
    if ('fecha_agenda' in payload) {
      const raw = payload.fecha_agenda;

      // Si el usuario borra la fecha
      if (!raw) {
        payload.fecha_agenda = null;
        payload.mes_agenda = null;
        payload.dia_abc_agenda = null;
      } else {
        // El frontend envía YYYY-MM-DD
        const soloFecha = String(raw).slice(0, 10);
        const d = new Date(`${soloFecha}T00:00:00`);

        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({
            success: false,
            error: 'fecha_agenda debe tener formato YYYY-MM-DD',
          });
        }

        payload.fecha_agenda = soloFecha;
        payload.mes_agenda = MESES[d.getMonth()];
        payload.dia_abc_agenda = DIAS[d.getDay()];
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

    // Si el usuario mueve manualmente una tarjeta programada fuera de
    // Pendiente, su tarea futura debe quedar anulada para evitar un envío
    // sorpresa después de haber cambiado el estado.
    if (
      Object.prototype.hasOwnProperty.call(payload, 'novedades_atc') &&
      String(payload.novedades_atc || '').trim().toUpperCase() !== 'PENDIENTE'
    ) {
      await pool.query(
        `UPDATE welcome_notifications
         SET status='cancelled', updated_at=NOW()
         WHERE registro_id=$1 AND status IN ('pending', 'failed')`,
        [id]
      );
    }

    let correoBienvenida = null;
    let whatsappBienvenida = null;
    if (debeEnviarBienvenida) {
      try {
        correoBienvenida = await enviarBienvenidaWelcome(rows[0]);
      } catch (errorCorreo) {
        // El estado ya quedó guardado. Un fallo SMTP se informa sin revertir
        // la gestión realizada por Backoffice.
        console.error('[BACKOFFICE] Error enviando bienvenida:', errorCorreo.message);
        correoBienvenida = { enviado: false, error: 'No se pudo enviar el correo de bienvenida' };
      }

      try {
        whatsappBienvenida = await encolarWhatsappBienvenida(rows[0]);
      } catch (errorWhatsapp) {
        // Igual que con el correo: la gestión de Backoffice no se revierte si
        // la línea o la cola de WaBot presentan un problema.
        console.error('[BACKOFFICE] Error encolando WhatsApp de bienvenida:', errorWhatsapp.message);
        whatsappBienvenida = { encolado: false, motivo: 'error_al_encolar' };
      }
    }

    res.json({
      success: true,
      data: rows[0],
      mensaje: 'Registro actualizado correctamente',
      correo_bienvenida: correoBienvenida,
      whatsapp_bienvenida: whatsappBienvenida,
    });
  } catch (e) {
    console.error(
      '[BACKOFFICE] Error en PUT update:',
      e
    );

    res.status(500).json({
      success: false,
      error: e.message || 'Error interno al actualizar el registro',
      code: e.code || null,
      detail: e.detail || null,
    });
  }
});

module.exports = router;
