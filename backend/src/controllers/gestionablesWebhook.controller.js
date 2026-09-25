/**
 * GESTIONABLES WEBHOOK CONTROLLER — Bitrix24 NOVONET
 *
 * Recibe el webhook saliente que dispara la automatización de Bitrix cuando
 * una negociación entra a la etapa "CONTACTO NUEVO" del pipeline
 * "NETLIFE NUEVO" (ver GUIA_WEBHOOK_GESTIONABLES.md). Con el nombre del
 * asesor que Bitrix manda por placeholder ({{Nombre Asesor}}), busca en
 * erp_database.gestionables_asesores el cupo más reciente <= hoy para ese
 * asesor y lo escribe de vuelta en el deal (campo UF_CRM_GESTIONABLES, o el
 * que indique GESTIONABLES_FIELD_NAME) vía crm.deal.update.
 *
 * Endpoint independiente del webhook genérico (bitrix_webhook.php): este
 * SÍ le escribe de vuelta a Bitrix, el genérico solo guarda en Postgres.
 *
 * Seguridad: mismo esquema que bitrix_webhook.php — token compartido por
 * query string (?token=...), porque Bitrix no permite headers custom en
 * el nodo de automatización.
 *
 * Trazabilidad: cada llamada (encontró cupo o no, se actualizó Bitrix o no)
 * queda registrada en gestionables_webhook_log — nunca se sobreescribe.
 *
 * REPARTO POR RONDAS (GESTIONABLES_REPARTO, por defecto 'on'): en vez de
 * solo escribir el cupo del responsable actual, elige entre TODOS los
 * asesores con cupo hoy al que menos gestionables lleva (ver
 * shared/repartoGestionables.js), le reasigna el deal y escribe su cupo.
 * Con GESTIONABLES_REPARTO=off vuelve al comportamiento anterior.
 */

const poolErp = require('../config/dbErp');
const { bitrixCallNovonet } = require('../services/bitrix.service');
const { elegirAsesor, normalizarNombre } = require('../shared/repartoGestionables');

const FIELD_NAME = process.env.GESTIONABLES_FIELD_NAME || 'UF_CRM_GESTIONABLES';
// Opcional: si se define, antes de escribir se verifica que el deal siga
// realmente en esta etapa (evita pisar el campo si el lead ya avanzó antes
// de que el webhook llegara a procesarse). Se llena con lo que imprime
// scripts/setup_gestionables_bitrix.js.
const EXPECTED_STAGE_ID = process.env.GESTIONABLES_STAGE_ID || null;

const registrarLog = async ({ bitrixId, nombreAsesor, gestionables, encontrado, actualizado, error }) => {
  try {
    await poolErp.query(
      `INSERT INTO gestionables_webhook_log
         (bitrix_id, nombre_asesor, gestionables_permitidos, encontrado, actualizado_en_bitrix, error)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [bitrixId, nombreAsesor || null, gestionables ?? null, !!encontrado, !!actualizado, error || null]
    );
  } catch (err) {
    console.error('[gestionablesWebhook] No se pudo guardar el log (no afecta el webhook):', err.message);
  }
};

// Día de trabajo en hora de Ecuador (Render corre Postgres en UTC: después de
// las 19:00 CURRENT_DATE ya sería "mañana").
const HOY_EC = `(NOW() AT TIME ZONE 'America/Guayaquil')::date`;
const REPARTO_ACTIVO = (process.env.GESTIONABLES_REPARTO || 'on').toLowerCase() !== 'off';
// Clave fija del candado: serializa el reparto para que 2 leads que llegan al
// mismo tiempo no caigan en el mismo asesor.
const LOCK_KEY = 874201;

// ── Nombre del asesor → ID de usuario Bitrix (NOVONET), con caché 10 min ────
let cacheUsuarios = { map: new Map(), ts: 0 };
const cargarUsuariosBitrix = async () => {
  const map = new Map();
  let start = 0;
  for (let pagina = 0; pagina < 20; pagina++) {
    const json = await bitrixCallNovonet('user.get', { ACTIVE: true, start });
    for (const u of json.result || []) {
      map.set(normalizarNombre(`${u.NAME || ''} ${u.LAST_NAME || ''}`), Number(u.ID));
    }
    if (!json.next) break;
    start = json.next;
  }
  cacheUsuarios = { map, ts: Date.now() };
  return map;
};
const idUsuarioBitrix = async (nombre) => {
  const key = normalizarNombre(nombre);
  const vencido = Date.now() - cacheUsuarios.ts > 10 * 60 * 1000;
  if (vencido || !cacheUsuarios.map.has(key)) await cargarUsuariosBitrix();
  return cacheUsuarios.map.get(key) || null;
};

// ── Comportamiento anterior: solo escribe el cupo del responsable actual ───
const escribirCupoResponsableActual = async (bitrixId, nombreAsesor) => {
  const r = await poolErp.query(
    `SELECT gestionables_permitidos FROM gestionables_asesores
      WHERE nombre_bitrix_asesor = $1 AND fecha_carga = ${HOY_EC}
      LIMIT 1`,
    [nombreAsesor]
  );
  if (r.rows.length === 0) {
    await registrarLog({ bitrixId, nombreAsesor, encontrado: false });
    return 'OK (sin cupo cargado para ese asesor)';
  }
  const gestionables = r.rows[0].gestionables_permitidos;
  await bitrixCallNovonet('crm.deal.update', { id: bitrixId, fields: { [FIELD_NAME]: gestionables } });
  await registrarLog({ bitrixId, nombreAsesor, gestionables, encontrado: true, actualizado: true });
  return 'OK';
};

// ── Reparto por rondas ───────────────────────────────────────────────────
const repartirPorRondas = async (bitrixId, nombreOriginal) => {
  const client = await poolErp.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);

    // Si este lead ya se repartió hoy (volvió a entrar a la etapa), no se re-reparte.
    const ya = await client.query(
      `SELECT asesor_asignado FROM gestionables_asignaciones
        WHERE fecha = ${HOY_EC} AND bitrix_deal_id = $1`,
      [bitrixId]
    );
    if (ya.rows.length) {
      await client.query('COMMIT');
      await registrarLog({ bitrixId, nombreAsesor: ya.rows[0].asesor_asignado, encontrado: true, actualizado: false, error: 'Ya repartido hoy; se respeta la asignación' });
      return 'OK (ya repartido hoy)';
    }

    // Cupo de hoy + cuántos lleva cada asesor hoy (su ronda actual)
    const { rows } = await client.query(
      `SELECT g.nombre_bitrix_asesor AS nombre,
              g.gestionables_permitidos AS permitidos,
              COUNT(a.id)::int          AS asignados,
              MAX(a.creado_en)          AS ultima_asignacion
         FROM gestionables_asesores g
         LEFT JOIN gestionables_asignaciones a
           ON a.fecha = g.fecha_carga
          AND UPPER(BTRIM(a.asesor_asignado)) = UPPER(BTRIM(g.nombre_bitrix_asesor))
        WHERE g.fecha_carga = ${HOY_EC}
        GROUP BY 1, 2`
    );

    const elegido = elegirAsesor(rows.map((r) => ({
      nombre: r.nombre, permitidos: r.permitidos, asignados: r.asignados, ultimaAsignacion: r.ultima_asignacion,
    })));

    if (!elegido) {
      await client.query('ROLLBACK');
      await registrarLog({ bitrixId, nombreAsesor: nombreOriginal, encontrado: false, error: 'Ningún asesor con cupo disponible hoy; se deja el responsable actual' });
      return 'OK (nadie con cupo disponible)';
    }

    const userId = await idUsuarioBitrix(elegido.nombre);
    if (!userId) {
      await client.query('ROLLBACK');
      await registrarLog({ bitrixId, nombreAsesor: elegido.nombre, encontrado: true, actualizado: false, error: 'Nombre del asesor no coincide con ningún usuario activo de Bitrix' });
      return 'OK (asesor elegido sin usuario en Bitrix)';
    }

    // Se escribe primero en Bitrix; si falla, ROLLBACK y no queda contado.
    await bitrixCallNovonet('crm.deal.update', {
      id: bitrixId,
      fields: { ASSIGNED_BY_ID: userId, [FIELD_NAME]: elegido.permitidos },
    });

    await client.query(
      `INSERT INTO gestionables_asignaciones
         (fecha, bitrix_deal_id, asesor_asignado, bitrix_user_id, asesor_original, ronda)
       VALUES (${HOY_EC}, $1, $2, $3, $4, $5)`,
      [bitrixId, elegido.nombre, userId, nombreOriginal || null, elegido.asignados + 1]
    );
    await client.query('COMMIT');

    await registrarLog({ bitrixId, nombreAsesor: elegido.nombre, gestionables: elegido.permitidos, encontrado: true, actualizado: true });
    console.log(`[gestionablesWebhook] Deal ${bitrixId} → ${elegido.nombre} (ronda ${elegido.asignados + 1}/${elegido.permitidos})`);
    return 'OK';
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

const recibirGestionable = async (req, res) => {
  const bitrixId     = req.query.id || '';
  const nombreAsesor = (req.query.nombre_asesor || '').trim();

  try {
    // SEGURIDAD: mismo token que el resto de webhooks de Bitrix (.env BITRIX_WEBHOOK_TOKEN)
    const tokenEsperado = process.env.BITRIX_WEBHOOK_TOKEN;
    if (tokenEsperado && req.query.token !== tokenEsperado) {
      return res.status(401).send('No autorizado');
    }

    if (!bitrixId) {
      await registrarLog({ bitrixId: '(vacio)', nombreAsesor, error: 'Falta id de la negociación' });
      return res.status(400).send('Falta id');
    }
    if (!REPARTO_ACTIVO && !nombreAsesor) {
      await registrarLog({ bitrixId, nombreAsesor, error: 'Falta nombre_asesor' });
      return res.status(400).send('Falta nombre_asesor');
    }

    // (Opcional) confirmar que el deal sigue en la etapa esperada antes de tocarlo
    if (EXPECTED_STAGE_ID) {
      const deal = await bitrixCallNovonet('crm.deal.get', { id: bitrixId });
      if (deal.result && deal.result.STAGE_ID !== EXPECTED_STAGE_ID) {
        await registrarLog({ bitrixId, nombreAsesor, encontrado: true, actualizado: false, error: `Etapa actual (${deal.result.STAGE_ID}) ya no es la esperada (${EXPECTED_STAGE_ID})` });
        return res.status(200).send('OK (el deal ya cambió de etapa, no se actualizó)');
      }
    }

    const msg = REPARTO_ACTIVO
      ? await repartirPorRondas(bitrixId, nombreAsesor)
      : await escribirCupoResponsableActual(bitrixId, nombreAsesor);
    return res.status(200).send(msg);

  } catch (err) {
    console.error('[gestionablesWebhook] recibirGestionable error:', err.message);
    await registrarLog({ bitrixId: bitrixId || '(vacio)', nombreAsesor, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) });
    return res.status(500).send('Error interno');
  }
};

module.exports = { recibirGestionable };
