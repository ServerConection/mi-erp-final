const pool = require('../config/db');
const crypto = require('crypto');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { verificarToken } = require('../middleware/auth');

const LISTAS = {
  empresa: new Set(['NOVONET', 'VELSA']),
  tipo_dispositivo: new Set(['CPU', 'MONITOR', 'LAPTOP', 'TELEVISION', 'IMPRESORA']),
  disco_tipo: new Set(['MECANICO', 'SOLIDO', 'OTRO']),
  impresion: new Set(['COLOR', 'BLANCO Y NEGRO']),
  estado: new Set(['ACTIVO', 'EN REPARACION', 'DISPONIBLE', 'DE BAJA']),
  mouse: new Set(['SI', 'NO', 'CAMBIAR']),
  teclado: new Set(['SI', 'NO', 'CAMBIAR']),
  regulador: new Set(['SI', 'NO']),
  cambio_reemplazo: new Set(['MANTENER', 'POTENCIAR', 'REEMPLAZAR']),
};

const OBLIGATORIOS = [
  'empresa', 'tipo_dispositivo', 'marca', 'numero_serie',
  'ubicacion', 'area', 'estado',
];

const CAMPOS_EDITABLES = [
  'empresa', 'tipo_dispositivo', 'marca', 'modelo', 'numero_serie',
  'procesador', 'ram_gb', 'disco_tipo', 'disco_gb', 'fecha_fabricacion',
  'pulgadas', 'impresion', 'ubicacion', 'area', 'estado',
  'fecha_adquisicion', 'mouse', 'teclado', 'regulador',
  'observacion_vida_util', 'cambio_reemplazo',
];

const CAMPOS_FECHA = new Set(['fecha_fabricacion', 'fecha_adquisicion']);
const CAMPOS_NUMERICOS = new Set(['ram_gb', 'disco_gb']);
const CAMPOS_SERVIDOR = ['responsable', 'fecha_revision'];
const ID_PLANO_REGEX = /^EQ-(\d{4})$/;

const normalizarTexto = (valor) => {
  if (valor === undefined || valor === null) return null;
  return String(valor).trim().replace(/\s+/g, ' ').toUpperCase() || null;
};

const normalizarBody = (body) => {
  const datos = {};
  for (const campo of CAMPOS_EDITABLES) {
    const valor = body[campo];
    if (CAMPOS_FECHA.has(campo)) {
      datos[campo] = valor === undefined || valor === null || String(valor).trim() === '' ? null : String(valor).trim();
    } else if (CAMPOS_NUMERICOS.has(campo)) {
      datos[campo] = valor === undefined || valor === null || String(valor).trim() === '' ? null : Number(valor);
    } else {
      datos[campo] = normalizarTexto(valor);
    }
  }
  return datos;
};

const fechaValida = (valor) => {
  if (valor === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
};

const validar = (datos) => {
  const faltantes = OBLIGATORIOS.filter((campo) => !datos[campo]);
  if (faltantes.length) {
    return `Campos obligatorios faltantes: ${faltantes.join(', ')}.`;
  }

  for (const [campo, permitidos] of Object.entries(LISTAS)) {
    if (datos[campo] !== null && !permitidos.has(datos[campo])) {
      return `Valor invalido para ${campo}. Valores permitidos: ${[...permitidos].join(', ')}.`;
    }
  }

  for (const campo of CAMPOS_FECHA) {
    if (!fechaValida(datos[campo])) {
      return `${campo} debe tener formato YYYY-MM-DD y ser una fecha valida.`;
    }
  }

  for (const campo of CAMPOS_NUMERICOS) {
    if (datos[campo] !== null && (!Number.isFinite(datos[campo]) || datos[campo] < 0)) {
      return `${campo} debe ser un numero mayor o igual a cero.`;
    }
  }

  return null;
};

const rechazarCamposServidor = (body, campos = CAMPOS_SERVIDOR) => {
  const enviados = campos.filter((campo) => Object.prototype.hasOwnProperty.call(body, campo));
  return enviados.length ? `Los campos ${enviados.join(', ')} son asignados por el servidor.` : null;
};

const usuarioActual = (req) => normalizarTexto(req.user?.usuario) || `USUARIO ${req.user.id}`;
const textoGB = (valor) => valor === null ? null : `${Number(valor).toString()} GB`;

const idSolicitadoValido = (valor) => {
  const coincidencia = normalizarTexto(valor)?.match(ID_PLANO_REGEX);
  if (!coincidencia) return false;
  const numero = Number(coincidencia[1]);
  return numero >= 1 && numero <= 83;
};

const resolverUsuarioAsignado = async (db, req, recibido, { creando = false } = {}) => {
  const esAdmin = req.user?.perfil === 'ADMINISTRADOR';
  if (!esAdmin) return creando ? req.user.id : undefined;

  if (!creando && recibido === undefined) return undefined;

  const valor = recibido === '' || recibido === null ? null : Number(recibido ?? req.user.id);
  if (valor === null) return null;
  if (!Number.isInteger(valor) || valor <= 0) {
    const error = new Error('usuario_asignado_id debe ser un usuario valido.');
    error.status = 400;
    throw error;
  }
  const usuario = await db.query(
    `SELECT id FROM public.usuarios WHERE id = $1 AND activo = 'SI'`,
    [valor]
  );
  if (!usuario.rows.length) {
    const error = new Error('El usuario asignado no existe o esta inactivo.');
    error.status = 400;
    throw error;
  }
  return valor;
};

const responderError = (res, error, operacion) => {
  console.error(`[InventarioActivos] ${operacion}:`, error.message);
  if (error.code === '23505' && error.constraint === 'inventario_activos_numero_serie_uq') {
    return res.status(409).json({ success: false, error: 'El numero de serie ya esta registrado.' });
  }
  if (error.code === '23505' && error.constraint === 'inventario_activos_pkey') {
    return res.status(409).json({ success: false, error: 'El ID solicitado ya esta registrado.' });
  }
  if (error.code === '22P02' || error.code === '22007') {
    return res.status(400).json({ success: false, error: 'Uno de los valores enviados tiene un formato invalido.' });
  }
  if (error.status) return res.status(error.status).json({ success: false, error: error.message });
  return res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message,
  });
};

const EMPRESAS_AUDITORIA = new Set(['NOVONET', 'VELSA', 'POR DEFINIR']);
const PERFILES_WINDOWS = new Set(['USUARIO', 'ADMIN']);

const sha256 = (valor) => crypto.createHash('sha256').update(valor).digest('hex');

const jsonValido = (valor, predeterminado) => {
  if (valor === undefined || valor === null) return predeterminado;
  if (typeof valor === 'string') {
    try { return JSON.parse(valor); } catch (_) { return undefined; }
  }
  return valor;
};

const normalizarJson = (valor) => {
  if (typeof valor === 'string') return normalizarTexto(valor);
  if (Array.isArray(valor)) return valor.map(normalizarJson);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([clave, contenido]) => [clave, normalizarJson(contenido)]));
  }
  return valor;
};

exports.autenticarAuditoria = async (req, res, next) => {
  const authorization = req.headers.authorization || '';
  const coincidencia = authorization.match(/^Bearer\s+(.+)$/i);
  const token = coincidencia?.[1]?.trim();

  // Los tokens iat_ solo son validos para esta ruta y nunca reciben perfil ADMINISTRADOR.
  if (!token?.startsWith('iat_')) return verificarToken(req, res, next);

  try {
    const result = await pool.query(
      `UPDATE public.inventario_activos_api_tokens
       SET ultimo_uso = NOW()
       WHERE token_hash = $1 AND revocado = FALSE AND expira_en > NOW()
       RETURNING id, nombre, empresa`,
      [sha256(token)]
    );
    if (!result.rows.length) {
      return res.status(401).json({ success: false, error: 'Token de auditoria invalido, vencido o revocado.' });
    }
    const apiToken = result.rows[0];
    req.user = {
      id: null,
      usuario: `API ${apiToken.nombre}`,
      empresa: apiToken.empresa,
      perfil: 'AUDITORIA_API',
      authTipo: 'API_TOKEN',
      tokenId: apiToken.id,
    };
    return next();
  } catch (error) {
    return responderError(res, error, 'autenticar auditoria');
  }
};

exports.listarTokensAuditoria = async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre, token_prefijo, empresa, expira_en, revocado,
              creado_por, created_at, ultimo_uso
       FROM public.inventario_activos_api_tokens
       ORDER BY created_at DESC`
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return responderError(res, error, 'listar tokens de auditoria');
  }
};

exports.crearTokenAuditoria = async (req, res) => {
  const nombre = normalizarTexto(req.body.nombre);
  const empresaSolicitada = normalizarTexto(req.body.empresa);
  const empresaUsuario = normalizarTexto(req.user?.empresa);
  const empresa = empresaSolicitada || (EMPRESAS_AUDITORIA.has(empresaUsuario) ? empresaUsuario : 'POR DEFINIR');
  const expiraDias = req.body.expira_dias === undefined ? 30 : Number(req.body.expira_dias);

  if (!nombre) return res.status(400).json({ success: false, error: 'nombre es obligatorio.' });
  if (!EMPRESAS_AUDITORIA.has(empresa)) {
    return res.status(400).json({ success: false, error: 'empresa debe ser NOVONET, VELSA o POR DEFINIR.' });
  }
  if (!Number.isInteger(expiraDias) || expiraDias < 1 || expiraDias > 365) {
    return res.status(400).json({ success: false, error: 'expira_dias debe ser un entero entre 1 y 365.' });
  }

  const token = `iat_${crypto.randomBytes(32).toString('base64url')}`;
  try {
    const result = await pool.query(
      `INSERT INTO public.inventario_activos_api_tokens
         (nombre, token_hash, token_prefijo, empresa, expira_en, creado_por)
       VALUES ($1, $2, $3, $4, NOW() + ($5 * INTERVAL '1 day'), $6)
       RETURNING id, nombre, token_prefijo, empresa, expira_en, revocado,
                 creado_por, created_at, ultimo_uso`,
      [nombre, sha256(token), token.slice(0, 12), empresa, expiraDias, usuarioActual(req)]
    );
    return res.status(201).json({
      success: true,
      data: { ...result.rows[0], token },
      message: 'Guarda este token ahora: no volvera a mostrarse.',
    });
  } catch (error) {
    return responderError(res, error, 'crear token de auditoria');
  }
};

exports.revocarTokenAuditoria = async (req, res) => {
  const tokenId = Number(req.params.tokenId);
  if (!Number.isInteger(tokenId) || tokenId < 1) {
    return res.status(400).json({ success: false, error: 'Identificador de token invalido.' });
  }
  try {
    const result = await pool.query(
      `UPDATE public.inventario_activos_api_tokens
       SET revocado = TRUE
       WHERE id = $1
       RETURNING id, nombre, token_prefijo, empresa, expira_en, revocado`,
      [tokenId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Token no encontrado.' });
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    return responderError(res, error, 'revocar token de auditoria');
  }
};

const normalizarAuditoria = (body) => ({
  empresa: normalizarTexto(body.empresa),
  mac: normalizarTexto(body.mac),
  tipo: normalizarTexto(body.tipo),
  marca: normalizarTexto(body.marca),
  modelo: normalizarTexto(body.modelo),
  procesador: normalizarTexto(body.procesador),
  ram_gb: body.ram_gb === undefined || body.ram_gb === null || body.ram_gb === '' ? null : Number(body.ram_gb),
  disco_tipo: normalizarTexto(body.disco_tipo),
  disco_gb: body.disco_gb === undefined || body.disco_gb === null || body.disco_gb === '' ? null : Number(body.disco_gb),
  fecha_fabricacion: body.fecha_fabricacion ? String(body.fecha_fabricacion).trim() : null,
  perfil_windows: normalizarTexto(body.perfil_windows),
  usb_bloqueado: body.usb_bloqueado,
  descargas_totales: body.descargas_totales,
  accesos: normalizarJson(jsonValido(body.accesos, 0)),
  paginas_bloqueadas_ok: body.paginas_bloqueadas_ok,
  usuario_windows: normalizarTexto(body.usuario_windows),
  datos_extra: normalizarJson(jsonValido(body.datos_extra, {})),
});

const validarAuditoria = (datos) => {
  const faltantes = ['empresa', 'mac', 'tipo', 'marca', 'perfil_windows']
    .filter((campo) => !datos[campo]);
  if (faltantes.length) return `Campos obligatorios faltantes: ${faltantes.join(', ')}.`;
  if (!['NOVONET', 'VELSA'].includes(datos.empresa)) return 'empresa debe ser NOVONET o VELSA.';
  if (!['CPU', 'LAPTOP'].includes(datos.tipo)) return 'tipo debe ser CPU o LAPTOP.';
  if (!PERFILES_WINDOWS.has(datos.perfil_windows)) return 'perfil_windows debe ser USUARIO o ADMIN.';
  if (typeof datos.usb_bloqueado !== 'boolean') return 'usb_bloqueado debe ser boolean.';
  if (typeof datos.paginas_bloqueadas_ok !== 'boolean') return 'paginas_bloqueadas_ok debe ser boolean.';
  if (!Number.isInteger(datos.descargas_totales) || datos.descargas_totales < 0) return 'descargas_totales debe ser un entero mayor o igual a cero.';
  if (datos.accesos === undefined || (!Number.isInteger(datos.accesos) && (typeof datos.accesos !== 'object' || datos.accesos === null))) return 'accesos debe ser un entero o JSON valido.';
  if (Number.isInteger(datos.accesos) && datos.accesos < 0) return 'accesos no puede ser negativo.';
  if (datos.datos_extra === undefined || typeof datos.datos_extra !== 'object' || datos.datos_extra === null || Array.isArray(datos.datos_extra)) return 'datos_extra debe ser un objeto JSON valido.';
  if (datos.disco_tipo && !LISTAS.disco_tipo.has(datos.disco_tipo)) return 'disco_tipo debe ser MECANICO, SOLIDO u OTRO.';
  for (const campo of ['ram_gb', 'disco_gb']) {
    if (datos[campo] !== null && (!Number.isFinite(datos[campo]) || datos[campo] < 0)) return `${campo} debe ser un numero mayor o igual a cero.`;
  }
  if (!fechaValida(datos.fecha_fabricacion)) return 'fecha_fabricacion debe tener formato YYYY-MM-DD y ser una fecha valida.';
  return null;
};

exports.registrarAuditoria = async (req, res) => {
  const datos = normalizarAuditoria(req.body || {});
  const errorValidacion = validarAuditoria(datos);
  if (errorValidacion) return res.status(400).json({ success: false, error: errorValidacion });

  const empresaToken = normalizarTexto(req.user?.empresa);
  if (req.user?.authTipo === 'API_TOKEN' && empresaToken !== 'POR DEFINIR' && empresaToken !== datos.empresa) {
    return res.status(403).json({
      success: false,
      error: `El token de auditoria pertenece a ${empresaToken} y no puede registrar equipos de ${datos.empresa}.`,
    });
  }

  try {
    const resultado = await pool.transaction(async (client) => {
      let consultaActivo = await client.query(
        'SELECT * FROM public.inventario_activos WHERE numero_serie = $1 FOR UPDATE',
        [datos.mac]
      );
      let activo = consultaActivo.rows[0];
      let activoCreado = false;
      let activoActualizado = false;
      const usuario = usuarioActual(req);

      if (!activo) {
        const insercion = await client.query(
          `INSERT INTO public.inventario_activos
             (empresa, tipo_dispositivo, marca, modelo, numero_serie, procesador,
              ram_gb, ram, disco_tipo, disco_gb, disco_espacio, fecha_fabricacion,
              ubicacion, area, responsable, estado, creado_por, actualizado_por)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                   'POR DEFINIR', 'POR DEFINIR', $13, 'ACTIVO', $13, $13)
           ON CONFLICT (numero_serie) DO NOTHING
           RETURNING *`,
          [datos.empresa, datos.tipo, datos.marca, datos.modelo, datos.mac, datos.procesador,
            datos.ram_gb, textoGB(datos.ram_gb), datos.disco_tipo, datos.disco_gb,
            textoGB(datos.disco_gb), datos.fecha_fabricacion, usuario]
        );
        activo = insercion.rows[0];
        activoCreado = Boolean(activo);
        if (!activo) {
          consultaActivo = await client.query(
            'SELECT * FROM public.inventario_activos WHERE numero_serie = $1 FOR UPDATE',
            [datos.mac]
          );
          activo = consultaActivo.rows[0];
        }
      }

      if (!activo) throw new Error('No se pudo obtener el activo asociado a la MAC.');
      if (normalizarTexto(activo.empresa) !== datos.empresa) {
        const error = new Error(`La MAC ya pertenece a un activo de ${activo.empresa}; no se registrara como ${datos.empresa}.`);
        error.status = 409;
        throw error;
      }

      if (!activoCreado && req.user?.perfil === 'ADMINISTRADOR') {
        const actualizacion = await client.query(
          `UPDATE public.inventario_activos
           SET tipo_dispositivo = $1, marca = $2, modelo = $3, procesador = $4,
               ram_gb = $5, ram = $6, disco_tipo = $7, disco_gb = $8,
               disco_espacio = $9, fecha_fabricacion = $10,
               fecha_revision = NOW(), updated_at = NOW(), actualizado_por = $11
           WHERE id = $12
           RETURNING *`,
          [datos.tipo, datos.marca, datos.modelo, datos.procesador, datos.ram_gb,
            textoGB(datos.ram_gb), datos.disco_tipo, datos.disco_gb,
            textoGB(datos.disco_gb), datos.fecha_fabricacion, usuario, activo.id]
        );
        activo = actualizacion.rows[0];
        activoActualizado = true;
      }

      const auditoria = await client.query(
        `INSERT INTO public.inventario_activos_auditoria
           (activo_id, perfil_windows, usb_bloqueado, descargas_totales, accesos,
            paginas_bloqueadas_ok, usuario_windows, datos_extra)
         VALUES ($1, $2, $3, $4, $5::JSONB, $6, $7, $8::JSONB)
         RETURNING *`,
        [activo.id, datos.perfil_windows, datos.usb_bloqueado, datos.descargas_totales,
          JSON.stringify(datos.accesos), datos.paginas_bloqueadas_ok,
          datos.usuario_windows, JSON.stringify(datos.datos_extra)]
      );

      return { activo, auditoria: auditoria.rows[0], activoCreado, activoActualizado };
    });

    return res.status(201).json({
      success: true,
      data: {
        activo: resultado.activo,
        auditoria: resultado.auditoria,
        activo_creado: resultado.activoCreado,
        activo_actualizado: resultado.activoActualizado,
      },
    });
  } catch (error) {
    return responderError(res, error, 'registrar auditoria');
  }
};

exports.obtenerAuditorias = async (req, res) => {
  const id = normalizarTexto(req.params.id);
  try {
    const [activo, auditorias] = await Promise.all([
      pool.query('SELECT id FROM public.inventario_activos WHERE id = $1', [id]),
      pool.query(
        `SELECT id, activo_id, perfil_windows, usb_bloqueado, descargas_totales,
                accesos, paginas_bloqueadas_ok, usuario_windows, datos_extra,
                fecha_auditoria
         FROM public.inventario_activos_auditoria
         WHERE activo_id = $1
         ORDER BY fecha_auditoria DESC, id DESC`,
        [id]
      ),
    ]);
    if (!activo.rows.length) return res.status(404).json({ success: false, error: 'Activo no encontrado.' });
    return res.json({
      success: true,
      data: auditorias.rows,
      ultima: auditorias.rows[0] || null,
    });
  } catch (error) {
    return responderError(res, error, 'obtener auditorias');
  }
};

const FILTROS_LISTA = {
  empresa: LISTAS.empresa,
  tipo_dispositivo: LISTAS.tipo_dispositivo,
  estado: LISTAS.estado,
  cambio_reemplazo: LISTAS.cambio_reemplazo,
};

const construirFiltros = (query, alias = '') => {
  const condiciones = [];
  const valores = [];
  const columna = (nombre) => `${alias}${nombre}`;
  const agregar = (valor) => { valores.push(valor); return `$${valores.length}`; };

  for (const [campo, permitidos] of Object.entries(FILTROS_LISTA)) {
    const valor = normalizarTexto(query[campo]);
    if (!valor) continue;
    if (!permitidos.has(valor)) {
      return { error: `Filtro invalido para ${campo}. Valores permitidos: ${[...permitidos].join(', ')}.` };
    }
    condiciones.push(`${columna(campo)} = ${agregar(valor)}`);
  }

  const area = normalizarTexto(query.area);
  if (area) condiciones.push(`${columna('area')} = ${agregar(area)}`);

  const q = normalizarTexto(query.q);
  if (q) {
    const parametro = agregar(`%${q}%`);
    condiciones.push(`(
      ${columna('numero_serie')} ILIKE ${parametro} OR ${columna('marca')} ILIKE ${parametro} OR
      ${columna('modelo')} ILIKE ${parametro} OR ${columna('ubicacion')} ILIKE ${parametro}
    )`);
  }

  for (const [parametro, columna, operador] of [
    ['ram_gb_min', 'ram_gb', '>='], ['ram_gb_max', 'ram_gb', '<='],
    ['disco_gb_min', 'disco_gb', '>='], ['disco_gb_max', 'disco_gb', '<='],
  ]) {
    const recibido = query[parametro];
    if (recibido === undefined || recibido === null || String(recibido).trim() === '') continue;
    const numero = Number(recibido);
    if (!Number.isFinite(numero) || numero < 0) return { error: `${parametro} debe ser un numero mayor o igual a cero.` };
    condiciones.push(`${alias}${columna} ${operador} ${agregar(numero)}`);
  }

  return {
    where: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '',
    valores,
  };
};

exports.listar = async (req, res) => {
  const filtros = construirFiltros(req.query, 'ia.');
  if (filtros.error) return res.status(400).json({ success: false, error: filtros.error });

  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  try {
    const [result, conteo] = await Promise.all([
      pool.query(
        `SELECT ia.*,
                u.usuario AS usuario_asignado_usuario,
                COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', u.nombres, u.apellidos)), ''), u.usuario) AS usuario_asignado_nombre,
                u.cargo AS usuario_asignado_cargo,
                u.perfil AS usuario_asignado_perfil
         FROM public.inventario_activos ia
         LEFT JOIN public.usuarios u ON u.id = ia.usuario_asignado_id
         ${filtros.where}
         ORDER BY ia.created_at DESC, ia.id DESC
         LIMIT $${filtros.valores.length + 1} OFFSET $${filtros.valores.length + 2}`,
        [...filtros.valores, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::INTEGER AS total
         FROM public.inventario_activos ia ${filtros.where}`,
        filtros.valores
      ),
    ]);
    const total = conteo.rows[0].total;
    return res.json({
      success: true,
      data: result.rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return responderError(res, error, 'listar');
  }
};

exports.resumen = async (req, res) => {
  const filtros = construirFiltros(req.query);
  if (filtros.error) return res.status(400).json({ success: false, error: filtros.error });

  try {
    const [totales, porTipo, porEmpresa] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::INTEGER AS total,
           COUNT(*) FILTER (
             WHERE tipo_dispositivo IN ('CPU', 'LAPTOP') AND disco_tipo = 'MECANICO'
           )::INTEGER AS computadores_disco_mecanico,
           COUNT(*) FILTER (
             WHERE tipo_dispositivo IN ('CPU', 'LAPTOP')
               AND ram_gb <= 8
           )::INTEGER AS computadores_ram_8_o_menos,
           COUNT(*) FILTER (
             WHERE cambio_reemplazo IN ('POTENCIAR', 'REEMPLAZAR')
           )::INTEGER AS requieren_intervencion
         FROM public.inventario_activos ${filtros.where}`,
        filtros.valores
      ),
      pool.query(
        `SELECT tipo_dispositivo, COUNT(*)::INTEGER AS total
         FROM public.inventario_activos ${filtros.where}
         GROUP BY tipo_dispositivo
         ORDER BY tipo_dispositivo`,
        filtros.valores
      ),
      pool.query(
        `SELECT empresa, COUNT(*)::INTEGER AS total
         FROM public.inventario_activos ${filtros.where}
         GROUP BY empresa
         ORDER BY empresa`,
        filtros.valores
      ),
    ]);
    return res.json({
      success: true,
      data: { ...totales.rows[0], por_tipo: porTipo.rows, por_empresa: porEmpresa.rows },
    });
  } catch (error) {
    return responderError(res, error, 'resumen');
  }
};

exports.opciones = async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT marca
       FROM public.inventario_activos
       WHERE marca IS NOT NULL AND TRIM(marca) <> ''
       ORDER BY marca`
    );
    return res.json({ success: true, data: { marcas: result.rows.map((row) => row.marca) } });
  } catch (error) {
    return responderError(res, error, 'opciones');
  }
};

exports.plano = async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT ia.*,
              u.usuario AS usuario_asignado_usuario,
              COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', u.nombres, u.apellidos)), ''), u.usuario) AS usuario_asignado_nombre,
              u.cargo AS usuario_asignado_cargo,
              u.perfil AS usuario_asignado_perfil
       FROM public.inventario_activos ia
       LEFT JOIN public.usuarios u ON u.id = ia.usuario_asignado_id
       WHERE ia.id ~ '^EQ-[0-9]{4}$'
         AND SUBSTRING(ia.id FROM 4)::INTEGER BETWEEN 1 AND 83
       ORDER BY ia.id`
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return responderError(res, error, 'cargar plano');
  }
};

exports.usuariosAsignables = async (req, res) => {
  const empresa = normalizarTexto(req.query.empresa);
  const todas = String(req.query.todas || '').toLowerCase() === 'true';
  if (!todas && !['NOVONET', 'VELSA'].includes(empresa)) {
    return res.status(400).json({ success: false, error: 'Debe indicar una empresa valida.' });
  }
  try {
    const valores = [];
    const filtroEmpresa = todas ? '' : `AND UPPER(u.empresa) = $${valores.push(empresa)}`;
    const result = await pool.query(
      `SELECT u.id, u.usuario, u.nombres, u.apellidos, u.cargo, u.perfil, u.empresa,
              COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', u.nombres, u.apellidos)), ''), u.usuario) AS nombre
       FROM public.usuarios u
       WHERE u.activo = 'SI' ${filtroEmpresa}
       ORDER BY UPPER(COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', u.nombres, u.apellidos)), ''), u.usuario))`,
      valores
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return responderError(res, error, 'listar usuarios asignables');
  }
};

exports.exportar = async (req, res) => {
  const filtros = construirFiltros(req.query);
  if (filtros.error) return res.status(400).json({ success: false, error: filtros.error });

  try {
    const result = await pool.query(
      `SELECT id, empresa, tipo_dispositivo, marca, modelo, numero_serie,
              procesador, ram, ram_gb, disco_tipo, disco_espacio, disco_gb, fecha_fabricacion,
              pulgadas, impresion, ubicacion, area, responsable, estado,
              fecha_adquisicion, fecha_revision, mouse, teclado, regulador,
              observacion_vida_util, cambio_reemplazo, foto,
              created_at, updated_at, creado_por, actualizado_por
       FROM public.inventario_activos
       ${filtros.where}
       ORDER BY created_at DESC, id DESC`,
      filtros.valores
    );
    const filas = result.rows.map((row) => ({
      ID: row.id,
      EMPRESA: row.empresa,
      TIPO_DISPOSITIVO: row.tipo_dispositivo,
      MARCA: row.marca,
      MODELO: row.modelo,
      NUMERO_SERIE_MAC: row.numero_serie,
      PROCESADOR: row.procesador,
      RAM: row.ram,
      RAM_GB: row.ram_gb,
      DISCO_TIPO: row.disco_tipo,
      DISCO_ESPACIO: row.disco_espacio,
      DISCO_GB: row.disco_gb,
      FECHA_FABRICACION: row.fecha_fabricacion,
      PULGADAS: row.pulgadas,
      IMPRESION: row.impresion,
      UBICACION: row.ubicacion,
      AREA: row.area,
      RESPONSABLE: row.responsable,
      ESTADO: row.estado,
      FECHA_ADQUISICION: row.fecha_adquisicion,
      FECHA_REVISION: row.fecha_revision,
      MOUSE: row.mouse,
      TECLADO: row.teclado,
      REGULADOR: row.regulador,
      OBSERVACION_VIDA_UTIL: row.observacion_vida_util,
      CAMBIO_REEMPLAZO: row.cambio_reemplazo,
      FOTO: row.foto,
      CREADO_EN: row.created_at,
      ACTUALIZADO_EN: row.updated_at,
      CREADO_POR: row.creado_por,
      ACTUALIZADO_POR: row.actualizado_por,
    }));
    const columnas = [
      'ID', 'EMPRESA', 'TIPO_DISPOSITIVO', 'MARCA', 'MODELO', 'NUMERO_SERIE_MAC',
      'PROCESADOR', 'RAM', 'RAM_GB', 'DISCO_TIPO', 'DISCO_ESPACIO', 'DISCO_GB', 'FECHA_FABRICACION',
      'PULGADAS', 'IMPRESION', 'UBICACION', 'AREA', 'RESPONSABLE', 'ESTADO',
      'FECHA_ADQUISICION', 'FECHA_REVISION', 'MOUSE', 'TECLADO', 'REGULADOR',
      'OBSERVACION_VIDA_UTIL', 'CAMBIO_REEMPLAZO', 'FOTO', 'CREADO_EN',
      'ACTUALIZADO_EN', 'CREADO_POR', 'ACTUALIZADO_POR',
    ];
    const hoja = XLSX.utils.json_to_sheet(filas, { header: columnas });
    hoja['!cols'] = columnas.map((key) => ({ wch: Math.min(45, Math.max(14, key.length + 2)) }));
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Activos TI');
    const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx', compression: true });
    const fecha = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="inventario_activos_${fecha}.xlsx"`);
    return res.send(buffer);
  } catch (error) {
    return responderError(res, error, 'exportar');
  }
};

exports.autorizarFoto = async (req, res, next) => {
  try {
    const id = normalizarTexto(req.params.id);
    const result = await pool.query(
      'SELECT id, foto, creado_por FROM public.inventario_activos WHERE id = $1',
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Activo no encontrado.' });

    const activo = result.rows[0];
    const esAdmin = req.user?.perfil === 'ADMINISTRADOR';
    const esCreador = normalizarTexto(activo.creado_por) === normalizarTexto(req.user?.usuario);
    if (activo.foto && !esAdmin) {
      return res.status(403).json({ success: false, error: 'Solo un administrador puede reemplazar una foto existente.' });
    }
    if (!activo.foto && !esAdmin && !esCreador) {
      return res.status(403).json({ success: false, error: 'Solo el creador del activo o un administrador puede subir la primera foto.' });
    }
    req.activoFoto = activo;
    return next();
  } catch (error) {
    return responderError(res, error, 'autorizar foto');
  }
};

exports.subirFoto = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'Debe seleccionar una foto.' });

  const id = normalizarTexto(req.params.id);
  const rutaPublica = `/uploads/inventario_activos/${req.file.filename}`;
  try {
    const result = await pool.query(
      `UPDATE public.inventario_activos
       SET foto = $1, fecha_revision = NOW(), updated_at = NOW(), actualizado_por = $2
       WHERE id = $3
       RETURNING *`,
      [rutaPublica, usuarioActual(req), id]
    );

    const fotoAnterior = req.activoFoto?.foto;
    if (fotoAnterior?.startsWith('/uploads/inventario_activos/')) {
      const anterior = path.join(process.cwd(), fotoAnterior.replace(/^\/+/, ''));
      fs.unlink(anterior, () => {});
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    fs.unlink(req.file.path, () => {});
    return responderError(res, error, 'subir foto');
  }
};

exports.obtener = async (req, res) => {
  try {
    const id = normalizarTexto(req.params.id);
    const result = await pool.query(
      `SELECT ia.*,
              u.usuario AS usuario_asignado_usuario,
              COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', u.nombres, u.apellidos)), ''), u.usuario) AS usuario_asignado_nombre,
              u.cargo AS usuario_asignado_cargo,
              u.perfil AS usuario_asignado_perfil
       FROM public.inventario_activos ia
       LEFT JOIN public.usuarios u ON u.id = ia.usuario_asignado_id
       WHERE ia.id = $1`,
      [id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Activo no encontrado.' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    return responderError(res, error, 'obtener');
  }
};

exports.crear = async (req, res) => {
  const campoServidor = rechazarCamposServidor(req.body);
  if (campoServidor) return res.status(400).json({ success: false, error: campoServidor });

  const datos = normalizarBody(req.body);
  const errorValidacion = validar(datos);
  if (errorValidacion) return res.status(400).json({ success: false, error: errorValidacion });

  const idSolicitado = req.body.id_solicitado === undefined ? null : normalizarTexto(req.body.id_solicitado);
  if (idSolicitado && !idSolicitadoValido(idSolicitado)) {
    return res.status(400).json({ success: false, error: 'id_solicitado debe estar entre EQ-0001 y EQ-0083.' });
  }

  const usuario = usuarioActual(req);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    if (idSolicitado) await db.query(`SELECT pg_advisory_xact_lock(hashtext('inventario_activos_id'))`);
    const usuarioAsignadoId = await resolverUsuarioAsignado(db, req, req.body.usuario_asignado_id, { creando: true });
    const columnasDatos = [...CAMPOS_EDITABLES, 'ram', 'disco_espacio'];
    const columnas = [...(idSolicitado ? ['id'] : []), ...columnasDatos, 'responsable', 'creado_por', 'actualizado_por', 'usuario_asignado_id'];
    const valores = [
      ...(idSolicitado ? [idSolicitado] : []),
      ...CAMPOS_EDITABLES.map((campo) => datos[campo]),
      textoGB(datos.ram_gb), textoGB(datos.disco_gb), usuario, usuario, usuario, usuarioAsignadoId,
    ];
    const placeholders = valores.map((_, index) => `$${index + 1}`).join(', ');
    const result = await db.query(
      `INSERT INTO public.inventario_activos (${columnas.join(', ')})
       VALUES (${placeholders}) RETURNING *`,
      valores
    );
    if (idSolicitado) {
      await db.query(
        `SELECT setval('public.inventario_activos_id_seq',
           GREATEST((SELECT last_value FROM public.inventario_activos_id_seq), $1::BIGINT), true)`,
        [Number(idSolicitado.slice(3))]
      );
    }
    await db.query('COMMIT');
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    await db.query('ROLLBACK');
    return responderError(res, error, 'crear');
  } finally {
    db.release();
  }
};

exports.editar = async (req, res) => {
  const campoServidor = rechazarCamposServidor(req.body, ['fecha_revision']);
  if (campoServidor) return res.status(400).json({ success: false, error: campoServidor });

  const id = normalizarTexto(req.params.id);
  const datos = normalizarBody(req.body);
  const responsable = normalizarTexto(req.body.responsable);
  if (!responsable) {
    return res.status(400).json({ success: false, error: 'responsable es obligatorio.' });
  }
  const errorValidacion = validar(datos);
  if (errorValidacion) return res.status(400).json({ success: false, error: errorValidacion });

  const db = await pool.connect();
  let usuarioAsignadoId;
  try {
    usuarioAsignadoId = await resolverUsuarioAsignado(db, req, req.body.usuario_asignado_id);
  } catch (error) {
    db.release();
    return responderError(res, error, 'validar usuario asignado');
  }
  db.release();

  const columnasDatos = [...CAMPOS_EDITABLES, 'ram', 'disco_espacio', 'responsable'];
  if (usuarioAsignadoId !== undefined) columnasDatos.push('usuario_asignado_id');
  const asignaciones = columnasDatos.map((campo, index) => `${campo} = $${index + 1}`);
  const valores = [
    ...CAMPOS_EDITABLES.map((campo) => datos[campo]),
    textoGB(datos.ram_gb), textoGB(datos.disco_gb), responsable,
    ...(usuarioAsignadoId !== undefined ? [usuarioAsignadoId] : []),
  ];
  valores.push(usuarioActual(req), id);

  try {
    const result = await pool.query(
      `UPDATE public.inventario_activos
       SET ${asignaciones.join(', ')},
           fecha_revision = NOW(),
           updated_at = NOW(),
           actualizado_por = $${columnasDatos.length + 1}
       WHERE id = $${columnasDatos.length + 2}
       RETURNING *`,
      valores
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Activo no encontrado.' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    return responderError(res, error, 'editar');
  }
};

