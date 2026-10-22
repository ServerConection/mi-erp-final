/**
 * ESTADO DEL REPARTO DE GESTIONABLES — interruptores + quién está en línea.
 *
 * - Interruptores (tabla gestionables_reparto_config, erp_database): se
 *   manejan desde el panel "Reparto de Gestionables" del ERP. Si la tabla
 *   todavía no existe se usan los valores por defecto (reparto encendido,
 *   solo en línea), así un deploy antes de correr la migración no rompe nada.
 *   GESTIONABLES_REPARTO=off en Render sigue funcionando como apagado de
 *   emergencia y gana sobre el panel.
 *
 * - En línea: se reutiliza el módulo Bitrix Live (bitrixSesiones.controller).
 *   Puede recibir quien tenga la JORNADA ABIERTA en Bitrix (en pausa no).
 *   Si la cuenta NOVONET no usa jornada laboral, se usa "conectado a Bitrix".
 *   Si Bitrix Live no responde se devuelve null y el reparto NO filtra (es
 *   preferible repartir a todos con cupo que dejar los leads sin dueño).
 */
const poolErp = require('../config/dbErp');
const { normalizarNombre } = require('./repartoGestionables');
const { getEmpresa } = require('./repartoEmpresas');

const DEFAULT = {
  activo: true, solo_en_linea: true, actualizado_por: null, actualizado_en: null,
  // Horario laboral (hora Ecuador) y usuario "estación" donde esperan los leads
  hora_inicio: '08:00:00', hora_fin: '22:15:59', estacion_nombre: 'BRYAN PINEDA',
};
const cacheCfg = {};   // por empresa: { data, ts }

const apagadoPorEntorno = () =>
  (process.env.GESTIONABLES_REPARTO || 'on').toLowerCase() === 'off';

// empresa: 'novonet' (por defecto) | 'velsa'. Cada una tiene su tabla de configuración.
const leerConfig = async ({ sinCache = false, empresa } = {}) => {
  const E = getEmpresa(empresa);
  const c = cacheCfg[E.clave];
  if (!sinCache && c?.data && Date.now() - c.ts < 10_000) return c.data;
  // Velsa arranca APAGADO si todavía no tiene su configuración (seguridad)
  let cfg = { ...DEFAULT, estacion_nombre: E.estacion || DEFAULT.estacion_nombre, ...(E.clave === 'novonet' ? {} : { activo: false }) };
  try {
    const r = await poolErp.query(
      `SELECT * FROM ${E.tablas.config} WHERE id = 1`
    );
    // SELECT * + merge: si la migración del horario aún no se corrió, se usan los valores por defecto
    if (r.rows[0]) cfg = { ...DEFAULT, ...Object.fromEntries(Object.entries(r.rows[0]).filter(([, v]) => v !== null && v !== undefined)) };
    if (r.rows[0]) { cfg.actualizado_por = r.rows[0].actualizado_por; cfg.actualizado_en = r.rows[0].actualizado_en; }
  } catch (e) {
    console.warn('[reparto] Sin tabla de configuración, uso valores por defecto:', e.message);
  }
  cfg = { ...cfg, empresa: E.clave, apagado_por_entorno: apagadoPorEntorno() };
  cfg.activo_efectivo = cfg.activo && !cfg.apagado_por_entorno;
  cacheCfg[E.clave] = { data: cfg, ts: Date.now() };
  return cfg;
};

const guardarConfig = async (cambios, usuario, empresa) => {
  const E = getEmpresa(empresa);
  const T = E.tablas;
  const campos = ['activo', 'solo_en_linea'].filter((k) => typeof cambios[k] === 'boolean');
  if (!campos.length) throw Object.assign(new Error('Nada que actualizar'), { status: 400 });
  const client = await poolErp.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO ${T.config} (id, activo, solo_en_linea, actualizado_por, actualizado_en)
       VALUES (1, COALESCE($1, TRUE), COALESCE($2, TRUE), $3, NOW())
       ON CONFLICT (id) DO UPDATE SET
         activo          = COALESCE($1, ${T.config}.activo),
         solo_en_linea   = COALESCE($2, ${T.config}.solo_en_linea),
         actualizado_por = $3,
         actualizado_en  = NOW()`,
      [cambios.activo ?? null, cambios.solo_en_linea ?? null, usuario || null]
    );
    for (const c of campos) {
      await client.query(
        `INSERT INTO ${T.eventos} (campo, valor, usuario) VALUES ($1,$2,$3)`,
        [c, cambios[c], usuario || null]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  cacheCfg[E.clave] = null;
  return leerConfig({ sinCache: true, empresa: E.clave });
};

/**
 * Map nombreNormalizado → { enLinea, online, jornada } de NOVONET, o null si
 * Bitrix Live no respondió. `criterio` dice qué se usó: 'jornada' | 'conexion'.
 */
// Último estado bueno de Bitrix Live por empresa. Si Bitrix se cae o no
// responde (o deja de devolver la jornada), NO se reparte a ciegas: se usa
// el último estado conocido de cada asesor hasta que Bitrix se restablezca.
const ultimoBueno = {};

const leerEnLinea = async ({ forzar = false, empresa } = {}) => {
  const E = getEmpresa(empresa);
  const cuentas = E.cuentasLive;   // p. ej. ['NOVONET'] o ['NOVONET','VELSA']
  const respaldo = (motivo) => {
    const prev = ultimoBueno[E.clave];
    if (!prev) return null;        // sin estado previo: comportamiento anterior (sin filtro)
    console.warn(`[reparto ${E.clave}] Bitrix Live sin respuesta (${motivo}); se usa el último estado de ${prev.generado}`);
    return { ...prev, respaldo: true, motivo_respaldo: motivo };
  };
  try {
    const { recolectar } = require('../controllers/bitrixSesiones.controller');
    const data = await recolectar({ forzar });
    const validas = cuentas.filter((c) => { const f = data?.fuentes?.[c]; return f && !f.error && f.usuarios; });
    if (!validas.length) return respaldo('Bitrix no devolvió usuarios');
    const criterios = {};
    for (const c of validas) criterios[c] = data.fuentes[c].timeman ? 'jornada' : 'conexion';
    // Antes se medía por jornada y ahora Bitrix no la devuelve: es una caída parcial
    if (ultimoBueno[E.clave]?.criterio === 'jornada' && criterios[validas[0]] !== 'jornada') {
      return respaldo('Bitrix no devolvió la jornada laboral');
    }
    const mapa = new Map();
    // Se filtra por el PORTAL de donde vino la persona (portalCuenta). Bitrix Live
    // clasifica `cuenta` por empresa (NOVONET/VELSA) y una asesora de Velsa
    // que trabaja en el portal Novonet quedaría fuera → "nadie en línea".
    // Si la persona está en línea en cualquier cuenta, cuenta como en línea.
    for (const c of validas) {
      for (const u of data.usuarios.filter((x) => (x.portalCuenta || x.cuenta) === c)) {
        const enLinea = criterios[c] === 'jornada' ? u.jornada === 'OPENED' : !!u.online;
        const k = normalizarNombre(u.nombre);
        const prev = mapa.get(k);
        // inicio = hora en que abrió la jornada (orden de conexión para el reparto)
        if (!prev || (!prev.enLinea && enLinea)) mapa.set(k, { enLinea, online: !!u.online, jornada: u.jornada || null, inicio: u.jornadaInicio || null });
      }
    }
    if (!mapa.size) return respaldo('Bitrix devolvió la lista vacía');
    const res = { criterio: criterios[validas[0]], mapa, generado: data.generado };
    ultimoBueno[E.clave] = res;
    return res;
  } catch (e) {
    return respaldo(e.message) || (console.warn('[reparto] Bitrix Live no respondió, se reparte sin filtro de en línea:', e.message), null);
  }
};

module.exports = { leerConfig, guardarConfig, leerEnLinea };
