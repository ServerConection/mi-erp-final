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

const DEFAULT = { activo: true, solo_en_linea: true, actualizado_por: null, actualizado_en: null };
let cacheCfg = { data: null, ts: 0 };

const apagadoPorEntorno = () =>
  (process.env.GESTIONABLES_REPARTO || 'on').toLowerCase() === 'off';

const leerConfig = async ({ sinCache = false } = {}) => {
  if (!sinCache && cacheCfg.data && Date.now() - cacheCfg.ts < 10_000) return cacheCfg.data;
  let cfg = { ...DEFAULT };
  try {
    const r = await poolErp.query(
      'SELECT activo, solo_en_linea, actualizado_por, actualizado_en FROM gestionables_reparto_config WHERE id = 1'
    );
    if (r.rows[0]) cfg = r.rows[0];
  } catch (e) {
    console.warn('[reparto] Sin tabla de configuración, uso valores por defecto:', e.message);
  }
  cfg = { ...cfg, apagado_por_entorno: apagadoPorEntorno() };
  cfg.activo_efectivo = cfg.activo && !cfg.apagado_por_entorno;
  cacheCfg = { data: cfg, ts: Date.now() };
  return cfg;
};

const guardarConfig = async (cambios, usuario) => {
  const campos = ['activo', 'solo_en_linea'].filter((k) => typeof cambios[k] === 'boolean');
  if (!campos.length) throw Object.assign(new Error('Nada que actualizar'), { status: 400 });
  const client = await poolErp.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO gestionables_reparto_config (id, activo, solo_en_linea, actualizado_por, actualizado_en)
       VALUES (1, COALESCE($1, TRUE), COALESCE($2, TRUE), $3, NOW())
       ON CONFLICT (id) DO UPDATE SET
         activo          = COALESCE($1, gestionables_reparto_config.activo),
         solo_en_linea   = COALESCE($2, gestionables_reparto_config.solo_en_linea),
         actualizado_por = $3,
         actualizado_en  = NOW()`,
      [cambios.activo ?? null, cambios.solo_en_linea ?? null, usuario || null]
    );
    for (const c of campos) {
      await client.query(
        'INSERT INTO gestionables_reparto_eventos (campo, valor, usuario) VALUES ($1,$2,$3)',
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
  cacheCfg = { data: null, ts: 0 };
  return leerConfig({ sinCache: true });
};

/**
 * Map nombreNormalizado → { enLinea, online, jornada } de NOVONET, o null si
 * Bitrix Live no respondió. `criterio` dice qué se usó: 'jornada' | 'conexion'.
 */
const leerEnLinea = async () => {
  try {
    const { recolectar } = require('../controllers/bitrixSesiones.controller');
    const data = await recolectar();
    const fuente = data?.fuentes?.NOVONET;
    if (!fuente || fuente.error || !fuente.usuarios) return null;
    const criterio = fuente.timeman ? 'jornada' : 'conexion';
    const mapa = new Map();
    for (const u of data.usuarios.filter((x) => x.cuenta === 'NOVONET')) {
      const enLinea = criterio === 'jornada' ? u.jornada === 'OPENED' : !!u.online;
      mapa.set(normalizarNombre(u.nombre), { enLinea, online: !!u.online, jornada: u.jornada || null });
    }
    return { criterio, mapa, generado: data.generado };
  } catch (e) {
    console.warn('[reparto] Bitrix Live no respondió, se reparte sin filtro de en línea:', e.message);
    return null;
  }
};

module.exports = { leerConfig, guardarConfig, leerEnLinea };
