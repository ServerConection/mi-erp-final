// src/routes/backoffice.routes.js
// ============================================================
// Módulo BACKOFFICE — Auditoría de registros envios_ventas
// GET  /api/backoffice        → listar registros
// GET  /api/backoffice/:id    → detalle completo de un registro
// PUT  /api/backoffice/:id    → editar solo campos de auditoría
// Acceso exclusivo: ADMINISTRADOR y ATC
// ============================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verificarToken, noAsesor } = require('../middleware/auth');
const { encolarWhatsappBienvenida } = require('../services/welcomeWhatsapp.service');

// ─── QUIÉN ENTRA A BACKOFFICE ───────────────────────────────────────────────
// Antes esta ruta usaba `noAsesor`, que bloquea `perfil === 'ASESOR'`.
// Ese perfil NO EXISTE en la tabla usuarios: los asesores están registrados
// como 'USUARIO' (93 de ellos). O sea que el guard no bloqueaba a nadie y
// cualquier vendedor podía leer y editar ventas ajenas —incluido valor_pago,
// plan contratado y los datos personales del cliente.
//
// Se usa una lista blanca: si mañana aparece un perfil
// nuevo en la base, queda FUERA por defecto en vez de entrar por descuido.
// `noAsesor` se deja intacto porque lo usan otras 11 rutas del ERP.
const PERFILES_BACKOFFICE = new Set([
  'ADMINISTRADOR',   // transversal, ve las dos empresas
  'ATC',
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
// fecha_registro_sistema guarda un timestamp UTC (ej. "2026-10-07T04:19:00+00:00"):
// se convierte a día Ecuador para que cuadre con Indicadores. Si el valor no trae
// hora+zona (solo "2026-10-06" o formato raro) se usa tal cual, sin riesgo de error de cast.
const fechaRegEC = (col) => `(CASE WHEN ${col}::text ~ '^\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?(Z|[+-]\\d{2}(:?\\d{2})?)$'
  THEN ((${col}::text)::timestamptz AT TIME ZONE 'America/Guayaquil')::date::text
  ELSE LEFT(${col}::text, 10) END)`;
// Alcance histórico autorizado para TODO Backoffice. Este límite vive en el
// backend para que tampoco pueda evadirse manipulando filtros o URLs.
const FECHA_MINIMA_BACKOFFICE = '2026-06-01';
const EMPRESAS_BACKOFFICE = new Set(['NOVONET', 'VELSA', 'SEMILLERO']);
const condicionFechaBackoffice = (alias = '') => (
  `${fechaRegEC(`${alias}fecha_registro_sistema`)} >= '${FECHA_MINIMA_BACKOFFICE}'`
);

// envios_ventas conserva el código con el que se registró la venta. El nombre
// se resuelve contra usuarios.codigo_vendedor para no duplicarlo ni dejarlo
// desactualizado cuando cambie la ficha del asesor.
const columnasBackoffice = `
  ev.*,
  COALESCE(asesor.codigo_vendedor, ev.codigo_asesor, '') AS id_asesor_comercial,
  COALESCE(asesor.nombre_completo, '') AS nombre_asesor_comercial
`;
const joinAsesorBackoffice = `
  LEFT JOIN LATERAL (
    SELECT
      NULLIF(TRIM(u.codigo_vendedor), '') AS codigo_vendedor,
      NULLIF(TRIM(CONCAT_WS(' ', u.nombres, u.apellidos)), '') AS nombre_completo
    FROM public.usuarios u
    WHERE NULLIF(TRIM(ev.codigo_asesor), '') IS NOT NULL
      AND (
        UPPER(TRIM(COALESCE(u.codigo_vendedor, ''))) = UPPER(TRIM(ev.codigo_asesor))
        OR UPPER(TRIM(COALESCE(u.usuario, ''))) = UPPER(TRIM(ev.codigo_asesor))
      )
    ORDER BY u.activo DESC, u.id DESC
    LIMIT 1
  ) asesor ON TRUE
`;

// Los listados masivos no necesitan campos extensos que solo se muestran al
// abrir el detalle. Excluirlos reduce considerablemente el JSON transferido y
// el trabajo de serializaciÃ³n cuando existen decenas de miles de ventas.
const columnasBackofficeLista = `
  (
    to_jsonb(ev)
    - ARRAY[
        'hist_cambio_estatus', 'resumen_venta', 'observacion_auditoria',
        'observacion_gestion_cobranza', 'links_documentos'
      ]::text[]
    || jsonb_build_object(
      'id_asesor_comercial', COALESCE(asesor.codigo_vendedor, ev.codigo_asesor, ''),
      'nombre_asesor_comercial', COALESCE(asesor.nombre_completo, '')
    )
  ) AS registro
`;

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
router.get('/', async (req, res) => {
  try {
    const {
      buscar = '', page = 1, limit = 100,
      fechaDesde = '', fechaHasta = '',                 // fecha_registro_sistema
      activacionDesde = '', activacionHasta = '',       // fecha_activacion_netlife
      agendaDesde = '', agendaHasta = '',               // fecha_agenda
      login = '',                                        // netlife_login
      estatusNetlife = '',                               // netlife_estatus_real
      terceraEdad = '',                                  // aplica_descuento_3ra_edad
      estatusRegularizacion = '',                        // estatus_regularizacion
      empresa = '',
      includeTotal = 'true',
      vista = 'completa',
    } = req.query;

    let whereClause = `WHERE estatus_envio != 'BORRADOR' AND ${condicionFechaBackoffice()}`;
    const params = [];
    const P = (v) => { params.push(v); return `$${params.length}`; };

    if (buscar.trim()) {
      const termino = buscar.trim();
      const exacto = P(termino);
      const parcial = P(`%${termino}%`);
      whereClause += ` AND (
        CASE WHEN EXISTS (
          SELECT 1
          FROM public.envios_ventas ev_codigo
          WHERE UPPER(TRIM(COALESCE(ev_codigo.codigo_asesor, ''))) = UPPER(TRIM(${exacto}))
        ) THEN (
          UPPER(TRIM(COALESCE(ev.codigo_asesor, ''))) = UPPER(TRIM(${exacto})) OR
          UPPER(TRIM(COALESCE(asesor.codigo_vendedor, ''))) = UPPER(TRIM(${exacto}))
        ) ELSE (
          ev.codigo_asesor            ILIKE ${parcial} OR
          ev.id_bitrix                ILIKE ${parcial} OR
          ev.nombre_cliente_completo  ILIKE ${parcial} OR
          ev.numero_identificacion    ILIKE ${parcial} OR
          ev.telf_celular_pin         ILIKE ${parcial} OR
          ev.telf_celular_2           ILIKE ${parcial} OR
          ev.telf_fijo                ILIKE ${parcial} OR
          ev.netlife_login            ILIKE ${parcial} OR
          ev.distribuidor_autorizado  ILIKE ${parcial} OR
          ev.supervisor               ILIKE ${parcial} OR
          COALESCE(asesor.codigo_vendedor, '') ILIKE ${parcial} OR
          COALESCE(asesor.nombre_completo, '') ILIKE ${parcial}
        ) END
      )`;
    }

    // ── FECHA DE REGISTRO ────────────────────────────────────────────────
    if (fechaDesde) whereClause += ` AND ${fechaRegEC('fecha_registro_sistema')} >= ${P(fechaDesde)}`;
    if (fechaHasta) whereClause += ` AND ${fechaRegEC('fecha_registro_sistema')} <= ${P(fechaHasta)}`;

    // ── FECHA DE ACTIVACIÓN ──────────────────────────────────────────────
    if (activacionDesde) whereClause += ` AND ${fechaCol('fecha_activacion_netlife')} >= ${P(activacionDesde)}`;
    if (activacionHasta) whereClause += ` AND ${fechaCol('fecha_activacion_netlife')} <= ${P(activacionHasta)}`;

    // ─── FECHA DE AGENDAMIENTO ──────────────────────────────────────────────
    if (agendaDesde) whereClause += ` AND ${fechaCol('fecha_agenda')} >= ${P(agendaDesde)}`;
    if (agendaHasta) whereClause += ` AND ${fechaCol('fecha_agenda')} <= ${P(agendaHasta)}`;

    // ── LOGIN NETLIFE ────────────────────────────────────────────────────
    if (login.trim()) whereClause += ` AND netlife_login ILIKE ${P(`%${login.trim()}%`)}`;

    // ── ESTATUS NETLIFE / REGULARIZACIÓN / 3RA EDAD ──────────────────────
    if (estatusNetlife.trim())
      whereClause += ` AND UPPER(TRIM(netlife_estatus_real)) = UPPER(TRIM(${P(estatusNetlife.trim())}))`;
    if (estatusRegularizacion.trim())
      whereClause += ` AND UPPER(TRIM(estatus_regularizacion)) = UPPER(TRIM(${P(estatusRegularizacion.trim())}))`;
    if (terceraEdad.trim())
      whereClause += ` AND UPPER(TRIM(aplica_descuento_3ra_edad)) = UPPER(TRIM(${P(terceraEdad.trim())}))`;

    // ── EMPRESA (distribuidor autorizado) ────────────────────────────────
    const empresaPedida = empresa.trim().toUpperCase();
    if (empresaPedida && empresaPedida !== 'TODOS' && !EMPRESAS_BACKOFFICE.has(empresaPedida)) {
      return res.status(400).json({ success: false, error: 'Empresa inválida.' });
    }
    if (empresaPedida && empresaPedida !== 'TODOS') {
      whereClause += ` AND UPPER(TRIM(distribuidor_autorizado)) = ${P(empresaPedida)}`;
    }

    // Parámetros exclusivos de filtros; después se pueden agregar LIMIT/OFFSET.
    const countParams = [...params];

    // ── GESTIÓN DE LÍMITE (Paginado o Todo) ──────────────────────────────
    const sinLimite = limit === '0' || limit === 0 || limit === 'all' || limit === 'sin_limite';
    let paginacionSql = '';

    if (!sinLimite) {
      const parsedLimit = parseInt(limit, 10) || 100;
      const parsedPage = parseInt(page, 10) || 1;
      const offset = (parsedPage - 1) * parsedLimit;

      params.push(parsedLimit, offset);
      paginacionSql = `LIMIT $${params.length - 1} OFFSET $${params.length}`;
    }

    const listadoLigero = String(vista).toLowerCase() === 'lista';
    const { rows } = await pool.query(`
      SELECT ${listadoLigero ? columnasBackofficeLista : columnasBackoffice}
      FROM public.envios_ventas ev
      ${joinAsesorBackoffice}
      ${whereClause}
      ORDER BY ev.id DESC
      ${paginacionSql}
    `, params);

    // PanelRegistros carga sin límite y ya conoce rows.length. Permitirle omitir
    // el COUNT evita un segundo recorrido completo de la tabla en cada consulta.
    const data = listadoLigero ? rows.map((row) => row.registro) : rows;
    let total = data.length;
    if (String(includeTotal).toLowerCase() !== 'false') {
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM public.envios_ventas ev
         ${joinAsesorBackoffice}
         ${whereClause}`,
        countParams
      );
      total = countRows[0].total;
    }

    res.json({ success: true, data, total });
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
          AND ${condicionFechaBackoffice()}
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

// ─── GET /api/backoffice/reporte-gestion ────────────────────────────────────
// Convierte el historial append-only de cada venta en filas consultables.
// Conserva los mismos accesos del módulo porque hereda router.use().
router.get('/reporte-gestion', async (req, res) => {
  try {
    const desde = String(req.query.desde || '').trim();
    const hasta = String(req.query.hasta || '').trim();
    const puedeElegirUsuario = req.user.perfil === 'ADMINISTRADOR'
      || String(req.user.usuario || '').trim().toLowerCase() === 'arengel';
    const usuarioFiltro = puedeElegirUsuario
      ? String(req.query.usuario || '').trim().toUpperCase()
      : String(req.user.usuario || '').trim().toUpperCase();
    const empresaFiltro = String(req.query.empresa || '').trim().toUpperCase();
    const campoFiltro = String(req.query.campo || '').trim().toLowerCase();
    const formatoFecha = /^\d{4}-\d{2}-\d{2}$/;
    if ((desde && !formatoFecha.test(desde)) || (hasta && !formatoFecha.test(hasta)) || (desde && hasta && desde > hasta)) {
      return res.status(400).json({ success: false, error: 'Seleccione un período válido.' });
    }
    if (empresaFiltro && empresaFiltro !== 'TODOS' && !EMPRESAS_BACKOFFICE.has(empresaFiltro)) {
      return res.status(400).json({ success: false, error: 'Empresa inválida.' });
    }

    const params = [];
    let where = `WHERE ev.estatus_envio != 'BORRADOR'
      AND ${condicionFechaBackoffice('ev.')}
      AND ev.hist_cambio_estatus IS NOT NULL
      AND BTRIM(ev.hist_cambio_estatus::text) NOT IN ('', '[]', 'null')`;
    if (empresaFiltro && empresaFiltro !== 'TODOS') {
      params.push(empresaFiltro);
      where += ` AND UPPER(BTRIM(COALESCE(ev.distribuidor_autorizado, ''))) = $${params.length}`;
    }
    const { rows } = await pool.query(`
      SELECT ev.id, ev.id_bitrix, ev.nombre_cliente_completo,
             ev.numero_identificacion, ev.netlife_login,
             UPPER(BTRIM(COALESCE(ev.distribuidor_autorizado, 'SIN EMPRESA'))) AS empresa,
             ev.hist_cambio_estatus
      FROM public.envios_ventas ev
      ${where}
      ORDER BY ev.id DESC
    `, params);

    const normalizar = valor => String(valor || '').trim().toUpperCase();
    const detalle = [];
    const usuarios = new Map();
    const camposDisponibles = new Set();
    for (const registro of rows) {
      const eventos = normalizarHistorialBackoffice(registro.hist_cambio_estatus);
      for (const evento of eventos) {
        const fechaHora = String(evento?.fecha_hora || evento?.fecha || '');
        const fecha = fechaHora.slice(0, 10);
        if ((desde && fecha < desde) || (hasta && fecha > hasta)) continue;
        const login = String(evento?.usuario || evento?.username || evento?.login_usuario || evento?.modificado_por || '').trim();
        const nombre = String(evento?.nombre_usuario || evento?.usuario_nombre || evento?.nombreUsuario || login || (evento?.usuario_id ? `Usuario #${evento.usuario_id}` : 'Historial anterior')).trim();
        const claveUsuario = String(evento?.usuario_id || login || nombre).trim();
        const identidadesEvento = [claveUsuario, login, nombre].map(normalizar).filter(Boolean);
        const identidadesAutenticado = [req.user.id, req.user.usuario, req.user.nombreCompleto]
          .map(normalizar).filter(Boolean);
        const coincideUsuario = puedeElegirUsuario
          ? (!usuarioFiltro || identidadesEvento.includes(usuarioFiltro))
          : identidadesEvento.some(valor => identidadesAutenticado.includes(valor));
        // Quien puede elegir necesita el catálogo completo aunque ya haya
        // seleccionado un usuario. Los demás reciben únicamente su identidad.
        if (puedeElegirUsuario || coincideUsuario) {
          usuarios.set(claveUsuario, { id: claveUsuario, login, nombre });
        }
        if (!coincideUsuario) continue;
        const cambios = Array.isArray(evento?.cambios)
          ? evento.cambios
          : Object.prototype.hasOwnProperty.call(evento || {}, 'estatus_nuevo')
            ? [{ campo: evento.campo || 'netlife_estatus_real', anterior: evento.estatus_anterior ?? null, nuevo: evento.estatus_nuevo ?? null }]
            : [];
        for (const cambio of cambios) {
          const campo = String(cambio?.campo || 'sin_campo');
          camposDisponibles.add(campo);
          if (campoFiltro && campo.toLowerCase() !== campoFiltro) continue;
          detalle.push({
            fecha, fecha_hora: fechaHora, usuario_id: evento?.usuario_id || null,
            usuario: login, nombre_usuario: nombre,
            perfil_usuario: evento?.perfil_usuario || '', empresa_usuario: evento?.empresa_usuario || '',
            empresa: registro.empresa, registro_id: registro.id, id_bitrix: registro.id_bitrix || '',
            cliente: registro.nombre_cliente_completo || '', identificacion: registro.numero_identificacion || '',
            login_netlife: registro.netlife_login || '', campo,
            anterior: cambio?.anterior ?? '', nuevo: cambio?.nuevo ?? '',
            accion: cambio?.accion || (cambio?.reafirmacion ? 'REAFIRMACIÓN' : 'CAMBIO'),
          });
        }
      }
    }
    detalle.sort((a, b) => String(b.fecha_hora).localeCompare(String(a.fecha_hora)) || Number(b.registro_id) - Number(a.registro_id));

    if (!puedeElegirUsuario) {
      usuarios.clear();
      usuarios.set(String(req.user.id), {
        id: String(req.user.id),
        login: req.user.usuario || '',
        nombre: req.user.nombreCompleto || req.user.usuario || `Usuario #${req.user.id}`,
      });
    }

    const acumular = (mapa, clave, base) => {
      if (!mapa.has(clave)) mapa.set(clave, { ...base, cantidad: 0 });
      mapa.get(clave).cantidad += 1;
    };
    const diario = new Map();
    const estatus = new Map();
    for (const fila of detalle) {
      acumular(diario, `${fila.fecha}|${fila.usuario_id || fila.usuario || fila.nombre_usuario}|${fila.empresa}`, {
        fecha: fila.fecha, usuario: fila.usuario, nombre_usuario: fila.nombre_usuario, empresa: fila.empresa,
      });
      if (fila.campo === 'netlife_estatus_real' || fila.campo === 'estatus_regularizacion') {
        acumular(estatus, `${fila.nombre_usuario}|${fila.empresa}|${fila.campo}|${String(fila.nuevo)}`, {
          usuario: fila.usuario, nombre_usuario: fila.nombre_usuario, campo: fila.campo, estatus: fila.nuevo, empresa: fila.empresa,
        });
      }
    }
    const resumenDiario = [...diario.values()].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.cantidad - a.cantidad);
    const resumenEstatus = [...estatus.values()].sort((a, b) => b.cantidad - a.cantidad);
    const campos = [...camposDisponibles].sort();
    return res.json({
      success: true,
      data: {
        detalle, resumenDiario, resumenEstatus,
        usuarios: [...usuarios.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)),
        campos,
        puedeElegirUsuario,
        usuarioAutenticado: { id: req.user.id, login: req.user.usuario, nombre: req.user.nombreCompleto },
      },
    });
  } catch (error) {
    console.error('[BACKOFFICE] reporte gestión:', error);
    return res.status(500).json({ success: false, error: 'No se pudo generar el reporte de gestión.' });
  }
});

// ─── GET /api/backoffice/:id ──────────────────────────────────────────────────
// Detalle completo de un registro
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${columnasBackoffice}
       FROM public.envios_ventas ev
       ${joinAsesorBackoffice}
       WHERE ev.id = $1
         AND ${condicionFechaBackoffice('ev.')}`,
      [req.params.id]
    );
    if (rows.length === 0)
      return res.status(404).json({ success: false, error: 'Registro no encontrado' });

    // 404 (y no 403) a propósito: un usuario de otra empresa no debe poder
    // deducir que el registro existe probando IDs.
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
  'nombre_cliente_completo', 'representante_legal', 'estado_civil', 'fecha_nacimiento', 'email_cliente',
  'aplica_descuento_3ra_edad', 'telf_celular_pin', 'telf_celular_2', 'telf_fijo',
  'provincia', 'ciudad', 'parroquia_barrio', 'direccion_calles',
  'direccion_manzana_villa', 'referencia_ubicacion', 'coordenadas_gps',
  'tipo_vivienda', 'regimen_vivienda',
  'plan_contratado_final', 'plan_contratado', 'velocidad_plan', 'servicios_digitales', 'forma_pago',
  'detalle_bancario_ahorros', 'valor_pago', 'tipo_contrato', 'banco', 'tipo_cuenta',
  'ciclo_facturacion', 'costo_instalacion', 'descuento_instalacion',
  'beneficios_adicionales', 'beneficios_de_ley', 'plazo_contrato_meses',
  'resumen_venta',
  'estado_recaudacion', 'netlife_login', 'netlife_estatus_real',
  'calidad_venta_analista', 'novedades_atc', 'estado_welcome', 'venta_efectiva',
  'auditoria_documentos', 'auditado_por', 'inconsistencia_documental',
  'observacion_auditoria', 'errores_telcos', 'estatus_regularizacion',
  'detalle_regularizacion', 'fecha_regularizacion_atc',
  'año_regularizacion_atc', 'mes_regularizacion_atc',
  'dia_num_regularizacion_atc', 'dia_abc_regularizacion_atc',
  'mes_regularizacion',
  'observacion_venta_original', 'observacion_gestion_cobranza',
  'foto_cedula_frontal', 'foto_cedula_trasera', 'foto_carnet', 'foto_cartel',
  'archivo_resumen',
  'archivo_planilla', 'archivo_nombramiento', 'archivo_registro_mercantil', 'archivo_ruc',
  'archivo_otro1', 'archivo_otro2', 'archivo_otro3', 'archivo_otro4',
  'links_documentos',
  'gestion_atc',

  // Agendamiento
  'turno_agendado',
  'fecha_agenda',
  'hora_agenda',
  'franja_horaria_agendamiento',
  'mes_agenda',
  'dia_abc_agenda',

  // Ingreso a Telcos (preservicios)
  'fecha_ingreso_telcos',
  'fecha_activacion_netlife',
]);

const CAMPOS_GALERIA = new Set([
  'foto_cedula_frontal', 'foto_cedula_trasera', 'foto_carnet', 'foto_cartel',
  'archivo_resumen', 'archivo_planilla', 'archivo_nombramiento',
  'archivo_registro_mercantil', 'archivo_ruc',
  'archivo_otro1', 'archivo_otro2', 'archivo_otro3', 'archivo_otro4',
]);

const normalizarHistorialBackoffice = (valor) => {
  if (Array.isArray(valor)) return valor;
  if (typeof valor === 'string') {
    try {
      const parsed = JSON.parse(valor);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
};

const eventoHistorialBackoffice = (req, cambios) => ({
  version: 2,
  usuario_id: req.user?.id || null,
  usuario: req.user?.usuario || null,
  nombre_usuario: req.user?.nombreCompleto || req.user?.usuario || null,
  perfil_usuario: req.user?.perfil || null,
  empresa_usuario: req.user?.empresa || null,
  fecha_hora: new Date().toISOString(),
  cambios,
});

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const intervaloWelcome = () => Math.floor(Math.random() * 3) + 5;
async function reprogramarColaWelcome(client, inicio) {
  const pendientes = await client.query(
    `SELECT id FROM welcome_notifications WHERE status IN ('pending','failed') ORDER BY scheduled_at,id FOR UPDATE`
  );
  let fecha = new Date(inicio);
  for (let i = 0; i < pendientes.rows.length; i += 1) {
    if (i) fecha = new Date(fecha.getTime() + intervaloWelcome() * 60000);
    await client.query(`UPDATE welcome_notifications SET scheduled_at=$2,status='pending',updated_at=NOW() WHERE id=$1`, [pendientes.rows[i].id, fecha]);
  }
  return pendientes.rows.length;
}

// ─── PUT /api/backoffice/:id ──────────────────────────────────────────────────
// Programación persistente de bienvenidas: cada registro queda separado del
// siguiente por un intervalo aleatorio de 5, 6 o 7 minutos. WaBot procesa los
// WhatsApp en segundo plano.
router.get('/welcome/programaciones', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT wn.registro_id, wn.scheduled_at, wn.status, wn.attempts, wn.last_error
       FROM welcome_notifications wn
       INNER JOIN public.envios_ventas ev ON ev.id = wn.registro_id
       WHERE wn.status IN ('pending', 'processing', 'failed')
         AND ${condicionFechaBackoffice('ev.')}
       ORDER BY wn.scheduled_at ASC`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('[WELCOME] Error listando programaciones:', error.message);
    res.status(500).json({ success: false, error: 'No se pudieron cargar las programaciones' });
  }
});

router.get('/welcome/config', async (_req, res) => {
  try {
    const [config, variantes] = await Promise.all([
      pool.query(`SELECT c.*,l.id AS line_id,l.status AS line_status,l.phone_number
                  FROM welcome_config c LEFT JOIN LATERAL (
                    SELECT id,status,phone_number FROM lines WHERE UPPER(TRIM(name))=UPPER(TRIM(c.line_name)) AND deleted_at IS NULL
                    ORDER BY last_connected DESC NULLS LAST,created_at DESC LIMIT 1
                  ) l ON true WHERE c.id=1`),
      pool.query(`SELECT id,code,name,body,active,sort_order FROM welcome_variants ORDER BY sort_order,id`),
    ]);
    res.json({ success: true, data: config.rows[0], variantes: variantes.rows });
  } catch (error) { res.status(500).json({ success:false,error:error.message }); }
});

router.post('/welcome/pausar', async (req, res) => {
  try {
    const { rows } = await pool.query(`UPDATE welcome_config SET paused=true,updated_by=$1,updated_at=NOW() WHERE id=1 RETURNING *`, [req.user.id]);
    res.json({ success:true,data:rows[0] });
  } catch (error) { res.status(500).json({ success:false,error:error.message }); }
});

router.post('/welcome/reanudar', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE welcome_config SET paused=false,updated_by=$1,updated_at=NOW() WHERE id=1`, [req.user.id]);
    const cantidad = await reprogramarColaWelcome(client, new Date());
    await client.query('COMMIT');
    res.json({ success:true,reprogramados:cantidad });
  } catch (error) { await client.query('ROLLBACK'); res.status(500).json({ success:false,error:error.message }); }
  finally { client.release(); }
});

router.get('/welcome/respuestas', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT wn.*,ev.nombre_cliente_completo,ev.telf_celular_pin,ev.telf_celular_2,ev.numero_identificacion,wv.name AS variante
       FROM welcome_notifications wn JOIN envios_ventas ev ON ev.id=wn.registro_id
       LEFT JOIN welcome_variants wv ON wv.id=wn.variant_id
       WHERE wn.response_status IS NOT NULL ORDER BY wn.responded_at DESC LIMIT 300`
    );
    res.json({success:true,data:rows});
  } catch (error) { res.status(500).json({success:false,error:error.message}); }
});

router.post('/welcome/respuestas/:id/atender', async (req,res) => {
  try {
    const { rows } = await pool.query(`UPDATE welcome_notifications SET attended=true,attended_by=$2,attended_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id,req.user.id]);
    res.json({success:true,data:rows[0]});
  } catch (error) { res.status(500).json({success:false,error:error.message}); }
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
         AND ${condicionFechaBackoffice()}
         AND COALESCE(UPPER(TRIM(estado_welcome)), 'SIN_NOTIFICAR') = 'SIN_NOTIFICAR'
       ORDER BY array_position($1::bigint[], id::bigint)`,
      [ids]
    );

    if (seleccionados.rows.length !== ids.length) {
      throw Object.assign(new Error('Uno o más registros ya no están disponibles en Sin notificar'), { status: 409 });
    }

    const programaciones = [];
    let fechaProgramada = new Date(inicio);
    for (let indice = 0; indice < seleccionados.rows.length; indice += 1) {
      const registroId = seleccionados.rows[indice].id;
      const intervaloAnteriorMinutos = indice === 0
        ? null
        : intervaloWelcome();
      if (intervaloAnteriorMinutos !== null) {
        fechaProgramada = new Date(fechaProgramada.getTime() + intervaloAnteriorMinutos * 60 * 1000);
      }
      const variante = await client.query(`SELECT id FROM welcome_variants WHERE active=true ORDER BY sort_order,id`);
      const varianteId = variante.rows.length ? variante.rows[indice % variante.rows.length].id : null;
      await client.query(
        `INSERT INTO welcome_notifications
           (registro_id, scheduled_at, status, email_sent, whatsapp_sent, attempts, last_error, created_by, updated_at, completed_at,variant_id,delivery_status,response_status,response_text,responded_at,attended)
         VALUES ($1, $2, 'pending', true, false, 0, NULL, $3, NOW(), NULL,$4,'PENDING',NULL,NULL,NULL,false)
         ON CONFLICT (registro_id) DO UPDATE SET
           scheduled_at=EXCLUDED.scheduled_at, status='pending', email_sent=true,
           whatsapp_sent=false, attempts=0, last_error=NULL,
           created_by=EXCLUDED.created_by, updated_at=NOW(), completed_at=NULL,variant_id=EXCLUDED.variant_id,
           delivery_status='PENDING',response_status=NULL,response_text=NULL,responded_at=NULL,attended=false`,
        [registroId, fechaProgramada.toISOString(), req.user.id, varianteId]
      );
      await client.query(
        `UPDATE public.envios_ventas SET estado_welcome='PENDIENTE' WHERE id=$1`,
        [registroId]
      );
      programaciones.push({
        registro_id: registroId,
        scheduled_at: fechaProgramada.toISOString(),
        status: 'pending',
        intervalo_anterior_minutos: intervaloAnteriorMinutos,
      });
    }

    await client.query('COMMIT');
    res.json({ success: true, data: programaciones, intervalo_minutos: { minimo: 5, maximo: 7 } });
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
       SET estado_welcome='SIN_NOTIFICAR'
       WHERE id=$1 AND UPPER(TRIM(COALESCE(estado_welcome, '')))='PENDIENTE'`,
      [registroId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[WELCOME] Error cancelando:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo cancelar la programación' });
  }
});

// Registra la descarga intencional desde el detalle. La ruta real del archivo
// no se copia al historial: solo se conserva qué campo fue descargado, por
// quién y cuándo.
router.post('/:id/documentos/:campo/descarga', async (req, res) => {
  const { id, campo } = req.params;
  if (!/^\d+$/.test(String(id))) {
    return res.status(400).json({ success: false, error: 'ID inválido' });
  }
  if (!CAMPOS_GALERIA.has(campo)) {
    return res.status(400).json({ success: false, error: 'Campo documental inválido' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, distribuidor_autorizado, hist_cambio_estatus, "${campo}" AS documento
       FROM public.envios_ventas
       WHERE id = $1 AND ${condicionFechaBackoffice()}
       FOR UPDATE`,
      [id]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Registro no encontrado' });
    }
    if (!String(rows[0].documento || '').trim()) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'El documento ya no está disponible' });
    }

    const historial = normalizarHistorialBackoffice(rows[0].hist_cambio_estatus);
    historial.push(eventoHistorialBackoffice(req, [{
      campo,
      anterior: 'Documento cargado',
      nuevo: 'Documento descargado',
      accion: 'DESCARGADO',
    }]));
    await client.query(
      'UPDATE public.envios_ventas SET hist_cambio_estatus = $1 WHERE id = $2',
      [JSON.stringify(historial), id]
    );
    await client.query('COMMIT');

    try {
      require('../config/socket').getIO().emit('backoffice:registro-actualizado', {
        id: Number(id),
        empresa: rows[0].distribuidor_autorizado || null,
        campos: ['hist_cambio_estatus'],
      });
    } catch (_) { /* el proceso de pruebas puede no inicializar Socket.IO */ }

    return res.json({ success: true, historial });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[BACKOFFICE] Error auditando descarga:', error);
    return res.status(500).json({ success: false, error: 'No se pudo registrar la descarga' });
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  let client;
  let transaccionAbierta = false;
  try {
    const { id } = req.params;

    // Validación del ID (solo números)
    if (!/^\d+$/.test(String(id))) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    // El registro debe existir Y pertenecer a la empresa del usuario.
    // Sin esto, cualquier perfil no-ASESOR podía editar ventas de la otra
    // empresa mandando el id directo al endpoint.
    client = await pool.connect();
    await client.query('BEGIN');
    transaccionAbierta = true;
    const { rows: actual } = await client.query(
      `SELECT * FROM public.envios_ventas
       WHERE id = $1 AND ${condicionFechaBackoffice()}
       FOR UPDATE`,
      [id]
    );
    if (actual.length === 0)
      return res.status(404).json({ success: false, error: 'Registro no encontrado' });
    // Construcción del payload filtrando solo lo permitido
    const payload = {};
    for (const [clave, valor] of Object.entries(req.body || {})) {
      if (!CAMPOS_EDITABLES.has(clave)) continue; // descarta id y todo lo no permitido
      payload[clave] = valor === '' ? null : valor;
    }
    // Solo estos campos fueron solicitados por ATC. Las reglas de negocio de
    // abajo agregan valores derivados (fechas, franja, etc.), que se guardan
    // pero no deben aparentar una edición manual en el historial.
    const camposSolicitados = new Set(Object.keys(payload));

    if ('representante_legal' in payload || 'tipo_documento' in payload) {
      const tipoDocumento = 'tipo_documento' in payload ? payload.tipo_documento : actual[0].tipo_documento;
      if (tipoDocumento !== 'RUC EMPRESA') payload.representante_legal = null;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'estado_welcome')) {
      const estadoWelcome = String(payload.estado_welcome || 'SIN_NOTIFICAR').trim().toUpperCase();
      if (!['SIN_NOTIFICAR', 'PENDIENTE', 'NOTIFICADO'].includes(estadoWelcome)) {
        return res.status(400).json({ success: false, error: 'Estado Welcome inválido' });
      }
      payload.estado_welcome = estadoWelcome;
    }

    // El correo se dispara únicamente al entrar a NOTIFICADO. Guardar otros
    // campos de un registro que ya estaba notificado no debe reenviarlo.
    let debeEnviarBienvenida = false;
    if (String(payload.estado_welcome || '').trim().toUpperCase() === 'NOTIFICADO') {
      const estadoAnterior = String(actual[0]?.estado_welcome || '').trim().toUpperCase();
      debeEnviarBienvenida = estadoAnterior !== 'NOTIFICADO';
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'franja_horaria_agendamiento') && !Object.prototype.hasOwnProperty.call(payload, 'fecha_agenda')) {
      const franja = String(payload.franja_horaria_agendamiento || '').trim();
      const matchFranja = franja.match(/^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)$/);
      const duraDosHoras = matchFranja && matchFranja[2] === matchFranja[4]
        && (Number(matchFranja[3]) - Number(matchFranja[1]) + 24) % 24 === 2;
      if (franja && !duraDosHoras) {
        return res.status(400).json({ success: false, error: 'Franja horaria inválida' });
      }
      payload.franja_horaria_agendamiento = franja || null;
    }

    // Seleccionar "Auditado por" es la acción que sella la regularización.
    // Ambas fechas las genera el servidor; el cliente no decide sus valores.
    if (Object.prototype.hasOwnProperty.call(payload, 'auditado_por')) {
      const auditor = String(payload.auditado_por || '').trim();
      if (!auditor) {
        return res.status(400).json({ success: false, error: 'Debe seleccionar quién auditó el registro' });
      }
      payload.auditado_por = auditor;
      const selloAuditoria = actual[0].fecha_hora_regularizacion
        ? new Date(actual[0].fecha_hora_regularizacion)
        : new Date();
      if (!actual[0].fecha_hora_regularizacion) {
        payload.fecha_hora_regularizacion = selloAuditoria;
      }
      // Los registros auditados antes de crear las columnas separadas ya
      // tienen fecha_hora_regularizacion. Se usa ese sello original para
      // completar fecha/hora sin reemplazarlo por el momento actual.
      if (!actual[0].fecha_auditoria) {
        payload.fecha_auditoria = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(selloAuditoria);
      }
      if (!actual[0].hora_auditoria) {
        payload.hora_auditoria = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }).format(selloAuditoria);
      }
      if (!actual[0].fecha_regularizacion_atc) {
        payload.fecha_regularizacion_atc = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date());
      }
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
        payload.hora_agenda = null;
        payload.franja_horaria_agendamiento = null;
        payload.mes_agenda = null;
        payload.dia_abc_agenda = null;
      } else {
        // El frontend envía fecha y hora local de Ecuador: YYYY-MM-DDTHH:mm.
        const fechaHora = String(raw).trim();
        const formatoValido = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(fechaHora);
        const d = new Date(fechaHora);

        if (!formatoValido || Number.isNaN(d.getTime())) {
          return res.status(400).json({
            success: false,
            error: 'fecha_agenda debe tener formato YYYY-MM-DDTHH:mm',
          });
        }

        payload.fecha_agenda = fechaHora.slice(0, 10);
        const horaAgenda = fechaHora.slice(11, 19);
        payload.hora_agenda = horaAgenda.length === 5 ? `${horaAgenda}:00` : horaAgenda;
        const horaInicio = Number(fechaHora.slice(11, 13));
        const minutos = fechaHora.slice(14, 16);
        const horaFin = String((horaInicio + 2) % 24).padStart(2, '0');
        payload.franja_horaria_agendamiento = `${String(horaInicio).padStart(2, '0')}:${minutos} - ${horaFin}:${minutos}`;
        payload.mes_agenda = MESES[d.getMonth()];
        payload.dia_abc_agenda = DIAS[d.getDay()];
      }
    }

    // Identidad y momento de auditoría: los decide el servidor y nunca el
    // navegador. La primera regularización queda inmutable.
    const CAMPOS_AUDITORIA = new Set([
      'estatus_regularizacion', 'auditoria_documentos', 'detalle_regularizacion',
      'gestion_atc', 'inconsistencia_documental', 'observacion_auditoria',
    ]);
    const intervinoAuditor = Object.keys(payload).some(campo => CAMPOS_AUDITORIA.has(campo));
    const estadoRegAnterior = String(actual[0].estatus_regularizacion || '').trim().toUpperCase();
    const estadoRegNuevo = String(payload.estatus_regularizacion || '').trim().toUpperCase();
    if (intervinoAuditor && estadoRegNuevo === 'REGULARIZADO' && estadoRegAnterior !== 'REGULARIZADO' && !actual[0].fecha_hora_regularizacion) {
      payload.fecha_hora_regularizacion = new Date();
    }

    // Historial append-only de cualquier campo que ATC puede editar. Netlife
    // conserva la reafirmación explícita (p. ej. ASIGNADO -> ASIGNADO).
    const valorComparableHistorial = (campo, valor) => {
      if (campo !== 'auditoria_documentos') return String(valor ?? '');
      let lista = valor;
      if (!Array.isArray(lista)) {
        try { lista = JSON.parse(String(valor || '')); } catch { lista = String(valor || '').split(/\s*(?:,|\||\n)\s*/); }
      }
      if (!Array.isArray(lista)) lista = [lista];
      return lista.map(item => String(item).trim().toUpperCase()).filter(Boolean).sort().join('|');
    };
    const cambiosHistorial = Object.entries(payload)
      .filter(([campo, valor]) => camposSolicitados.has(campo)
        && (campo === 'netlife_estatus_real'
          || valorComparableHistorial(campo, actual[0][campo]) !== valorComparableHistorial(campo, valor)))
      .map(([campo, valor]) => {
        if (!CAMPOS_GALERIA.has(campo)) {
          return {
            campo,
            anterior: actual[0][campo] ?? null,
            nuevo: valor ?? null,
            reafirmacion: campo === 'netlife_estatus_real'
              && valorComparableHistorial(campo, actual[0][campo]) === valorComparableHistorial(campo, valor),
          };
        }
        const teniaDocumento = Boolean(String(actual[0][campo] || '').trim());
        const tieneDocumento = Boolean(String(valor || '').trim());
        return {
          campo,
          anterior: teniaDocumento ? 'Documento cargado' : 'Sin documento',
          nuevo: tieneDocumento ? 'Documento cargado' : 'Sin documento',
          accion: !teniaDocumento && tieneDocumento
            ? 'AGREGADO'
            : teniaDocumento && !tieneDocumento ? 'ELIMINADO' : 'REEMPLAZADO',
        };
      });
    if (cambiosHistorial.length) {
      const historial = normalizarHistorialBackoffice(actual[0].hist_cambio_estatus);
      historial.push(eventoHistorialBackoffice(req, cambiosHistorial));
      payload.hist_cambio_estatus = JSON.stringify(historial);
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

    const { rows } = await client.query(query, values);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Registro no encontrado' });
    }

    // Si el usuario mueve manualmente una tarjeta programada fuera de
    // Pendiente, su tarea futura debe quedar anulada para evitar un envío
    // sorpresa después de haber cambiado el estado.
    if (
      Object.prototype.hasOwnProperty.call(payload, 'estado_welcome') &&
      String(payload.estado_welcome || '').trim().toUpperCase() !== 'PENDIENTE'
    ) {
      await client.query(
        `UPDATE welcome_notifications
         SET status='cancelled', updated_at=NOW()
         WHERE registro_id=$1 AND status IN ('pending', 'failed')`,
        [id]
      );
    }

    await client.query('COMMIT');
    transaccionAbierta = false;

    // Invalida en tiempo real calendarios, contadores y tablas abiertas.
    try {
      require('../config/socket').getIO().emit('backoffice:registro-actualizado', {
        id: rows[0].id,
        empresa: rows[0].distribuidor_autorizado || null,
        campos: fields,
        registro: rows[0],
      });
    } catch (_) { /* el proceso de pruebas puede no inicializar Socket.IO */ }

    let correoBienvenida = null;
    let whatsappBienvenida = null;
    if (debeEnviarBienvenida) {
      try {
        // Welcome opera exclusivamente por WhatsApp; el correo queda desactivado.
        correoBienvenida = null;
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
    if (client && transaccionAbierta) {
      await client.query('ROLLBACK').catch(() => {});
      transaccionAbierta = false;
    }
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
  } finally {
    if (client && transaccionAbierta) await client.query('ROLLBACK').catch(() => {});
    client?.release();
  }
});

module.exports = router;
