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
const { bitrixCallNovonet, bitrixCallCuenta } = require('../services/bitrix.service');
const { getEmpresa, empresaValida } = require('../shared/repartoEmpresas');
const { elegirAsesor, normalizarNombre, dentroDeHorario, cupoDeEntregaCola } = require('../shared/repartoGestionables');
const { leerConfig, leerEnLinea } = require('../shared/repartoEstado');
const { conteoGestionablesHoy, bloqueadoPorAtc } = require('../shared/repartoConteo');

// Opcional: si se define, antes de escribir se verifica que el deal siga
// realmente en esta etapa (evita pisar el campo si el lead ya avanzó antes
// de que el webhook llegara a procesarse). Se llena con lo que imprime
// scripts/setup_gestionables_bitrix.js.

// ── Reparto por empresa ──────────────────────────────────────────────────────
// Todo el reparto vive dentro de esta fábrica: cada empresa (novonet / velsa)
// tiene sus tablas, su cuenta Bitrix, sus cachés y sus candados. Novonet usa
// las mismas tablas y valores de siempre.
const crearReparto = (empresa) => {
  const E = getEmpresa(empresa);
  const T = E.tablas;
  const url = E.url();
  // Novonet sigue usando exactamente la misma llamada de siempre
  const bx = E.clave === 'novonet' ? bitrixCallNovonet : (method, params) => bitrixCallCuenta(url, method, params);
  // Campo de cupo en el deal (si la empresa no lo tiene configurado, no se escribe)
  const campoCupo = (valor) => (E.fieldName ? { [E.fieldName]: valor } : {});

  const registrarLog = async ({ bitrixId, nombreAsesor, gestionables, encontrado, actualizado, error }) => {
    try {
      await poolErp.query(
        `INSERT INTO ${T.log}
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
  // Encendido/apagado, "solo en línea", horario y estación se leen del panel del
  // ERP (shared/repartoEstado.js). GESTIONABLES_REPARTO=off sigue siendo el
  // apagado de emergencia desde Render.
  // Claves de candado en Postgres:
  //  - LOCK_KEY: serializa cada asignación (2 leads simultáneos no caen al mismo asesor).
  //  - COLA_LOCK_KEY: una sola pasada de la cola a la vez (aunque haya 2 instancias).
  const LOCK_KEY = E.lock;
  const COLA_LOCK_KEY = E.lock + 1;

  // ── Nombre del asesor → ID de usuario Bitrix (NOVONET), con caché 10 min ────
  let cacheUsuarios = { map: new Map(), ts: 0 };
  const cargarUsuariosBitrix = async () => {
    const map = new Map();
    let start = 0;
    for (let pagina = 0; pagina < 20; pagina++) {
      const json = await bx('user.get', { ACTIVE: true, start });
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

  // ── Comportamiento anterior (reparto APAGADO): solo escribe el cupo ────────
  const escribirCupoResponsableActual = async (bitrixId, nombreAsesor) => {
    const r = await poolErp.query(
      `SELECT gestionables_permitidos FROM ${T.asesores}
        WHERE nombre_bitrix_asesor = $1 AND fecha_carga = ${HOY_EC}
        LIMIT 1`,
      [nombreAsesor]
    );
    if (r.rows.length === 0) {
      await registrarLog({ bitrixId, nombreAsesor, encontrado: false });
      return 'OK (sin cupo cargado para ese asesor)';
    }
    const gestionables = r.rows[0].gestionables_permitidos;
    if (E.fieldName) await bx('crm.deal.update', { id: bitrixId, fields: { ...campoCupo(gestionables) } });
    await registrarLog({ bitrixId, nombreAsesor, gestionables, encontrado: true, actualizado: true });
    return 'OK';
  };

  // ── Quién puede recibir HOY ─────────────────────────────────────────────────
  // Asesores con cupo cargado hoy, cuántos llevan, y si están en línea. La
  // estación (Bryan Pineda) nunca entra al reparto aunque tenga cupo cargado.
  const asesoresDeHoy = async (db, enLinea, estacion) => {
    const { rows } = await db.query(
      `SELECT g.nombre_bitrix_asesor AS nombre,
              g.gestionables_permitidos AS permitidos,
              g.porcentaje_atc_max      AS atc_max,
              COUNT(a.id)::int          AS asignados,
              MAX(a.creado_en)          AS ultima_asignacion
         FROM ${T.asesores} g
         LEFT JOIN ${T.asignaciones} a
           ON a.fecha = g.fecha_carga
          AND a.vigente                      -- bot + humano; lo reasignado a otro ya no cuenta
          AND UPPER(BTRIM(a.asesor_asignado)) = UPPER(BTRIM(g.nombre_bitrix_asesor))
        WHERE g.fecha_carga = ${HOY_EC}
        GROUP BY 1, 2, 3`
    );
    // El cupo se mide en GESTIONABLES: un lead que pasó a ATC, Duplicado, etc.
    // ya no consume permitido. `asignados` = gestionables; `total` = todo lo entregado.
    const conteo = await conteoGestionablesHoy(db, empresa);
    if (conteo) {
      for (const r of rows) {
        const c = conteo.get(normalizarNombre(r.nombre));
        r.total = r.asignados;
        r.asignados = c?.gestionables || 0;
        // % ATC: si de lo recibido hoy el % en ATC llega al máximo, no recibe más
        r.bloqueado_atc = bloqueadoPorAtc({ total: r.total, atc: c?.atc || 0, maxPct: r.atc_max });
      }
    }
    const estNorm = normalizarNombre(estacion);
    const sinEstacion = rows.filter((r) => normalizarNombre(r.nombre) !== estNorm);
    // Si Bitrix Live no respondió (enLinea = null) no se filtra por en línea.
    const enLineaRows = enLinea
      ? sinEstacion.filter((r) => enLinea.mapa.get(normalizarNombre(r.nombre))?.enLinea)
      : sinEstacion;
    return {
      disponibles: enLineaRows.filter((r) => r.asignados < r.permitidos && !r.bloqueado_atc),
      hayConCupo: sinEstacion.some((r) => r.asignados < r.permitidos),
      // Hay asesores en línea con cupo, pero todos frenados por su % de ATC
      soloBloqueadosAtc: enLineaRows.some((r) => r.asignados < r.permitidos)
        && enLineaRows.every((r) => !(r.asignados < r.permitidos) || r.bloqueado_atc),
    };
  };

  // ── Asignar UN lead por rondas ───────────────────────────────────────────────
  // Devuelve { estado: 'asignado' | 'ya_repartido' | 'sin_disponible' | 'sin_usuario', elegido?, motivo? }
  const repartirPorRondas = async (bitrixId, nombreOriginal, enLinea, cfg, origen = 'directo') => {
    const client = await poolErp.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);

      // Si este lead ya se repartió hoy (volvió a entrar a la etapa), no se re-reparte.
      const ya = await client.query(
        `SELECT asesor_asignado FROM ${T.asignaciones}
          WHERE fecha = ${HOY_EC} AND bitrix_deal_id = $1 AND vigente`,
        [bitrixId]
      );
      if (ya.rows.length) {
        await client.query('COMMIT');
        return { estado: 'ya_repartido', elegido: { nombre: ya.rows[0].asesor_asignado } };
      }

      const { disponibles, hayConCupo, soloBloqueadosAtc } = await asesoresDeHoy(client, enLinea, cfg.estacion_nombre);
      const elegido = elegirAsesor(disponibles.map((r) => ({
        nombre: r.nombre, permitidos: r.permitidos, asignados: r.asignados, ultimaAsignacion: r.ultima_asignacion,
      })));

      if (!elegido) {
        await client.query('ROLLBACK');
        return { estado: 'sin_disponible', motivo: soloBloqueadosAtc ? 'limite_atc' : (enLinea && hayConCupo ? 'nadie_en_linea' : 'todos_al_limite') };
      }

      const userId = await idUsuarioBitrix(elegido.nombre);
      if (!userId) {
        await client.query('ROLLBACK');
        await registrarLog({ bitrixId, nombreAsesor: elegido.nombre, encontrado: true, actualizado: false, error: 'Nombre del asesor no coincide con ningún usuario activo de Bitrix' });
        return { estado: 'sin_usuario', motivo: 'nadie_en_linea' };
      }

      // Se escribe primero en Bitrix; si falla, ROLLBACK y no queda contado.
      const upd = await bx('crm.deal.update', {
        id: bitrixId,
        fields: { ASSIGNED_BY_ID: userId, ...campoCupo(elegido.permitidos) },
      });
      // Bitrix puede responder sin "error" pero con result=false (deal inexistente):
      // en ese caso NO se cuenta la asignación.
      if (upd.result !== true) throw new Error(`Bitrix no actualizó el deal ${bitrixId}`);

      await client.query(
        `INSERT INTO ${T.asignaciones}
           (fecha, bitrix_deal_id, asesor_asignado, bitrix_user_id, asesor_original, ronda, origen)
         VALUES (${HOY_EC}, $1, $2, $3, $4, $5, $6)`,
        [bitrixId, elegido.nombre, userId, nombreOriginal || null, elegido.asignados + 1, origen]
      );
      await client.query('COMMIT');

      await registrarLog({ bitrixId, nombreAsesor: elegido.nombre, gestionables: elegido.permitidos, encontrado: true, actualizado: true });
      console.log(`[gestionables ${E.etiqueta}] Deal ${bitrixId} → ${elegido.nombre} (ronda ${elegido.asignados + 1}/${elegido.permitidos}, ${origen})`);
      return { estado: 'asignado', elegido };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };

  // ── Estación: el lead espera a nombre de Bryan Pineda ───────────────────────
  const MOTIVOS = {
    fuera_de_horario: 'Fuera de horario laboral',
    nadie_en_linea:   'Ningún asesor con cupo está en línea',
    todos_al_limite:  'Todos los asesores llegaron a su límite',
    cola_en_espera:   'Hay leads esperando antes que este',
    en_estacion:      'Ya estaba a nombre de la estación',
    limite_atc:       'Los asesores con cupo superaron su % de ATC',
  };
  const enviarAEstacion = async (bitrixId, nombreOriginal, motivo, cfg) => {
    const userId = await idUsuarioBitrix(cfg.estacion_nombre);
    if (!userId) throw new Error(`La estación "${cfg.estacion_nombre}" no coincide con ningún usuario activo de Bitrix`);
    const upd = await bx('crm.deal.update', { id: bitrixId, fields: { ASSIGNED_BY_ID: userId } });
    if (upd.result !== true) throw new Error(`Bitrix no actualizó el deal ${bitrixId}`);
    await poolErp.query(
      `INSERT INTO ${T.cola} (bitrix_deal_id, motivo, responsable_original)
       VALUES ($1, $2, $3)
       ON CONFLICT (bitrix_deal_id) WHERE estado = 'pendiente' DO NOTHING`,
      [bitrixId, motivo, nombreOriginal || null]
    );
    await registrarLog({ bitrixId, nombreAsesor: cfg.estacion_nombre, encontrado: false, actualizado: true, error: `En estación: ${MOTIVOS[motivo] || motivo}` });
    return `OK (en estación ${cfg.estacion_nombre}: ${MOTIVOS[motivo] || motivo})`;
  };

  // ── Pasada de la cola: entrega lo que espera en la estación ────────────────
  // La llama el cron cada minuto (jobs/colaGestionables.cron.js) y el webhook
  // cuando encola. Reglas: solo en horario y con el reparto encendido; el más
  // antiguo primero; con 1-2 asesores disponibles entrega 1 cada 5 minutos;
  // con 3 o más entrega normal por rondas.
  let pasadaEnCurso = false;
  const procesarCola = async () => {
    if (pasadaEnCurso) return { entregados: 0, motivo: 'pasada en curso' };
    pasadaEnCurso = true;
    let lockClient = null;
    let entregados = 0;
    try {
      const cfg = await leerConfig({ sinCache: true, empresa });
      if (!cfg.activo_efectivo) return { entregados, motivo: 'reparto apagado' };
      if (!dentroDeHorario(new Date(), cfg.hora_inicio, cfg.hora_fin)) return { entregados, motivo: 'fuera de horario' };

      lockClient = await poolErp.connect();
      const lk = await lockClient.query('SELECT pg_try_advisory_lock($1) AS ok', [COLA_LOCK_KEY]);
      if (!lk.rows[0].ok) return { entregados, motivo: 'otra instancia procesando' };

      const estacionId = await idUsuarioBitrix(cfg.estacion_nombre);
      // Solo se entrega lo que SIGUE en Contacto nuevo. Si alguien lo movió de
      // etapa (ATC, Descarte, etc.) mientras esperaba, ya fue gestionado: se descarta.
      let etapaContactoNuevo = null;
      try { etapaContactoNuevo = await resolverEtapaContactoNuevo(); }
      catch (e) { console.warn(`[gestionables ${E.etiqueta}]`, ' No se pudo identificar la etapa Contacto nuevo:', e.message); }

      // Todo lo que esté a nombre de la estación en Contacto nuevo (desde ayer)
      // entra a la cola aunque haya llegado por otro camino.
      if (estacionId && etapaContactoNuevo) {
        try { await sembrarColaDesdeBitrix(estacionId, etapaContactoNuevo); }
        catch (e) { console.warn(`[gestionables ${E.etiqueta}]`, ' No se pudo revisar la estación en Bitrix:', e.message); }
      }

      const pend = await poolErp.query(
        `SELECT id, bitrix_deal_id FROM ${T.cola}
          WHERE estado = 'pendiente' ORDER BY creado_en, id LIMIT 30`
      );
      if (!pend.rows.length) return { entregados, motivo: 'cola vacía' };

      const enLinea = cfg.solo_en_linea ? await leerEnLinea({ empresa }) : null;
      let limite = null;

      for (const item of pend.rows) {
        const { disponibles } = await asesoresDeHoy(poolErp, enLinea, cfg.estacion_nombre);
        if (limite === null) {
          const ult = await poolErp.query(
            `SELECT MAX(resuelto_en) AS ultima FROM ${T.cola} WHERE estado = 'entregado'`
          );
          limite = cupoDeEntregaCola({ disponibles: disponibles.length, ultimaEntregaCola: ult.rows[0].ultima });
        }
        if (entregados >= limite || !disponibles.length) break;
        // Si en medio de la pasada quedan menos de 3 disponibles, vuelve el ritmo de 1 cada 5 min.
        if (disponibles.length < 3 && entregados >= 1) break;

        // ¿Sigue esperando en la estación? Si alguien ya lo movió o trabajó, se descarta.
        let deal = null;
        try { deal = (await bx('crm.deal.get', { id: item.bitrix_deal_id })).result; } catch { deal = null; }
        const descartar = !deal ? 'El lead ya no existe en Bitrix'
          : (estacionId && Number(deal.ASSIGNED_BY_ID) !== Number(estacionId)) ? 'Ya no está a nombre de la estación (alguien lo reasignó)'
          : (etapaContactoNuevo && deal.STAGE_ID !== etapaContactoNuevo) ? `Ya no está en Contacto nuevo (pasó a ${deal.STAGE_ID}); alguien ya lo gestionó`
          : null;
        if (descartar) {
          await poolErp.query(
            `UPDATE ${T.cola} SET estado = 'descartado', nota = $2, resuelto_en = NOW() WHERE id = $1`,
            [item.id, descartar]
          );
          continue;
        }

        const r = await repartirPorRondas(item.bitrix_deal_id, cfg.estacion_nombre, enLinea, cfg, 'cola');
        if (r.estado === 'asignado' || r.estado === 'ya_repartido') {
          await poolErp.query(
            `UPDATE ${T.cola} SET estado = 'entregado', asesor_asignado = $2, resuelto_en = NOW() WHERE id = $1`,
            [item.id, r.elegido.nombre]
          );
          entregados++;
        } else {
          break; // nadie disponible ahora; se reintenta en el próximo minuto
        }
      }
      return { entregados };
    } catch (err) {
      console.error(`[gestionables ${E.etiqueta}]`, ' procesarCola error:', err.message);
      return { entregados, error: err.message };
    } finally {
      if (lockClient) {
        await lockClient.query('SELECT pg_advisory_unlock($1)', [COLA_LOCK_KEY]).catch(() => {});
        lockClient.release();
      }
      pasadaEnCurso = false;
      if (entregados) console.log(`[gestionables ${E.etiqueta}] Cola: ${entregados} lead(s) entregados desde la estación`);
    }
  };

  // ── Entregas hechas por un HUMANO en Bitrix ────────────────────────────────
  // Cada 5 min (jobs/colaGestionables.cron.js) se revisan los leads de Netlife
  // Nuevo de la jornada (desde el cierre de ayer, 22:16, hasta ahora). Si un lead
  // está a nombre de un asesor con cupo y el bot no se lo dio, se registra como
  // entrega HUMANA: cuenta en su cupo y en sus rondas. Si un humano mueve un
  // lead de Ana a Luis, el de Ana deja de contar (vigente = false) y cuenta para Luis.
  let categoriaCache = null;
  const resolverCategoria = async () => {
    if (categoriaCache !== null) return categoriaCache;
    if (E.categoryId) return (categoriaCache = String(E.categoryId));
    const m = /^C(\d+):/.exec(E.stageId || '');
    if (m) return (categoriaCache = m[1]);
    const res = await bx('crm.category.list', { entityTypeId: 2 });
    const cats = res.result?.categories || res.result || [];
    const cat = cats.find((c) => normalizarNombre(c.name) === normalizarNombre(E.pipeline || ''));
    if (!cat) throw new Error(`No se encontró el pipeline de ${E.etiqueta} en Bitrix (defina la variable de CATEGORY_ID)`);
    return (categoriaCache = String(cat.id));
  };

  // Leads a nombre de la estación en Contacto nuevo creados desde ayer (00:00 Ecuador)
  // que no estén en la cola → se agregan con su fecha de creación real, para que
  // la cola los entregue del más antiguo al más nuevo.
  const sembrarColaDesdeBitrix = async (estacionId, etapaContactoNuevo) => {
    const categoria = await resolverCategoria();
    const ayer = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(Date.now() - 24 * 3600 * 1000));
    const deals = [];
    let start = 0;
    for (let pagina = 0; pagina < 20; pagina++) {
      const json = await bx('crm.deal.list', {
        filter: { CATEGORY_ID: categoria, ASSIGNED_BY_ID: estacionId, STAGE_ID: etapaContactoNuevo, '>=DATE_CREATE': `${ayer}T00:00:00-05:00` },
        select: ['ID', 'DATE_CREATE'],
        order: { DATE_CREATE: 'ASC' },
        start,
      });
      deals.push(...(json.result || []));
      if (!json.next) break;
      start = json.next;
    }
    let nuevos = 0;
    for (const d of deals) {
      const r = await poolErp.query(
        `INSERT INTO ${T.cola} (bitrix_deal_id, motivo, responsable_original, creado_en)
         VALUES ($1, 'en_estacion', NULL, COALESCE($2::timestamptz, NOW()))
         ON CONFLICT (bitrix_deal_id) WHERE estado = 'pendiente' DO NOTHING`,
        [String(d.ID), d.DATE_CREATE || null]
      );
      nuevos += r.rowCount || 0;
    }
    if (nuevos) console.log(`[gestionables ${E.etiqueta}] Cola: ${nuevos} lead(s) que ya estaban en la estación agregados`);
    return nuevos;
  };

  // STAGE_ID de "CONTACTO NUEVO" en Netlife Nuevo (GESTIONABLES_STAGE_ID o búsqueda por nombre).
  let etapaCache = null;
  const resolverEtapaContactoNuevo = async () => {
    if (etapaCache) return etapaCache;
    if (E.stageId) return (etapaCache = E.stageId);
    const categoria = await resolverCategoria();
    const res = await bx('crm.dealcategory.stage.list', { id: categoria });
    const nombre = normalizarNombre(E.etapa || 'CONTACTO NUEVO');
    const etapa = (res.result || []).find((e) => normalizarNombre(e.NAME) === nombre);
    if (!etapa) throw new Error('No se encontró la etapa CONTACTO NUEVO en el pipeline (defina GESTIONABLES_STAGE_ID)');
    return (etapaCache = etapa.STATUS_ID);
  };

  // Inicio de la jornada actual en hora Ecuador: ayer a hora_fin + 1 s
  // (con el horario por defecto: ayer 22:16:00). Formato ISO con -05:00.
  const inicioJornadaIso = (cfg, ahora = new Date()) => {
    const fmt = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    const ayer = fmt(new Date(ahora.getTime() - 24 * 3600 * 1000));
    const [h, mi, s] = String(cfg.hora_fin || '22:15:59').split(':').map(Number);
    const t = new Date(`${ayer}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(s || 0).padStart(2, '0')}-05:00`);
    return new Date(t.getTime() + 1000).toISOString().replace(/\.\d{3}Z$/, '+00:00');
  };

  let syncEnCurso = false;
  const sincronizarManuales = async () => {
    if (syncEnCurso) return { registrados: 0, motivo: 'en curso' };
    syncEnCurso = true;
    let registrados = 0, reasignados = 0;
    try {
      const cfg = await leerConfig({ sinCache: true, empresa });
      if (!cfg.activo_efectivo) return { registrados, motivo: 'reparto apagado' };

      const categoria = await resolverCategoria();
      // Momento de la foto de Bitrix: lo que el bot asignó DESPUÉS de esta foto
      // no se puede comparar con ella (la foto aún muestra el responsable viejo).
      const fotoEn = Date.now();
      const deals = [];
      let start = 0;
      for (let pagina = 0; pagina < 40; pagina++) {
        const json = await bx('crm.deal.list', {
          // Se ignoran los creados hace menos de 3 min: el webhook del bot aún puede estar repartiéndolos
          filter: {
            CATEGORY_ID: categoria,
            '>=DATE_CREATE': inicioJornadaIso(cfg),
            '<=DATE_CREATE': new Date(Date.now() - 3 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, '+00:00'),
          },
          select: ['ID', 'ASSIGNED_BY_ID'],
          order: { ID: 'ASC' },
          start,
        });
        deals.push(...(json.result || []));
        if (!json.next) break;
        start = json.next;
      }
      if (!deals.length) return { registrados };

      // ID de usuario Bitrix → nombre normalizado
      if (Date.now() - cacheUsuarios.ts > 10 * 60 * 1000 || !cacheUsuarios.map.size) await cargarUsuariosBitrix();
      const idANombre = new Map([...cacheUsuarios.map.entries()].map(([n, id]) => [id, n]));
      const estNorm = normalizarNombre(cfg.estacion_nombre);

      const client = await poolErp.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]); // mismo candado que el bot

        const cupos = await client.query(
          `SELECT nombre_bitrix_asesor AS nombre FROM ${T.asesores} WHERE fecha_carga = ${HOY_EC}`
        );
        const asesorPorNorm = new Map(cupos.rows.map((r) => [normalizarNombre(r.nombre), r.nombre]));
        const vig = await client.query(
          `SELECT id, bitrix_deal_id, asesor_asignado, creado_en FROM ${T.asignaciones}
            WHERE fecha = ${HOY_EC} AND vigente AND bitrix_deal_id = ANY($1::text[])`,
          [deals.map((d) => String(d.ID))]
        );
        const filaPorDeal = new Map(vig.rows.map((r) => [r.bitrix_deal_id, r]));

        for (const d of deals) {
          const dealId = String(d.ID);
          const userId = Number(d.ASSIGNED_BY_ID);
          const actualNorm = idANombre.get(userId) || null;
          const fila = filaPorDeal.get(dealId);

          // Sigue con quien ya está registrado → nada que hacer
          if (fila && actualNorm && normalizarNombre(fila.asesor_asignado) === actualNorm) continue;
          // El bot lo asignó mientras se tomaba (o después de) la foto: la foto está
          // vieja para este lead. Se revisa en la próxima pasada (5 min).
          if (fila && new Date(fila.creado_en).getTime() >= fotoEn - 60 * 1000) continue;
          // En la estación y sin registro → lo maneja la cola
          if (!fila && (actualNorm === estNorm || !actualNorm)) continue;

          // Un humano lo movió: el registro anterior deja de contar
          if (fila) {
            await client.query(
              `UPDATE ${T.asignaciones} SET vigente = false, reasignado_a = $2, reasignado_en = NOW() WHERE id = $1`,
              [fila.id, (actualNorm && asesorPorNorm.get(actualNorm)) || actualNorm || `ID ${userId}`]
            );
            reasignados++;
          }

          // Cuenta para el nuevo responsable solo si es un asesor con cupo hoy
          const asesor = actualNorm && actualNorm !== estNorm ? asesorPorNorm.get(actualNorm) : null;
          if (!asesor) continue;
          const n = await client.query(
            `SELECT COUNT(*)::int AS c FROM ${T.asignaciones}
              WHERE fecha = ${HOY_EC} AND vigente AND UPPER(BTRIM(asesor_asignado)) = UPPER(BTRIM($1))`,
            [asesor]
          );
          await client.query(
            `INSERT INTO ${T.asignaciones}
               (fecha, bitrix_deal_id, asesor_asignado, bitrix_user_id, asesor_original, ronda, origen)
             VALUES (${HOY_EC}, $1, $2, $3, $4, $5, 'humano')`,
            [dealId, asesor, userId, fila ? fila.asesor_asignado : null, n.rows[0].c + 1]
          );
          registrados++;
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
      if (registrados || reasignados) console.log(`[gestionables ${E.etiqueta}] Manuales: ${registrados} entrega(s) humana(s), ${reasignados} reasignación(es)`);
      return { registrados, reasignados };
    } catch (err) {
      console.error(`[gestionables ${E.etiqueta}]`, ' sincronizarManuales error:', err.message);
      return { registrados, error: err.message };
    } finally {
      syncEnCurso = false;
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

      if (!/^\d+$/.test(bitrixId)) {
        await registrarLog({ bitrixId: '(vacio)', nombreAsesor, error: 'Falta id de la negociación' });
        return res.status(400).send('Falta id');
      }
      const cfg = await leerConfig({ empresa });
      if (!cfg.activo_efectivo && !nombreAsesor) {
        await registrarLog({ bitrixId, nombreAsesor, error: 'Falta nombre_asesor' });
        return res.status(400).send('Falta nombre_asesor');
      }

      // (Opcional) confirmar que el deal sigue en la etapa esperada antes de tocarlo
      if (E.stageId) {
        const deal = await bx('crm.deal.get', { id: bitrixId });
        if (deal.result && deal.result.STAGE_ID !== E.stageId) {
          await registrarLog({ bitrixId, nombreAsesor, encontrado: true, actualizado: false, error: `Etapa actual (${deal.result.STAGE_ID}) ya no es la esperada (${E.stageId})` });
          return res.status(200).send('OK (el deal ya cambió de etapa, no se actualizó)');
        }
      }

      // Reparto APAGADO desde el panel: todo se detiene. El lead se queda con su
      // responsable y solo se le escribe el cupo, igual que antes del reparto.
      if (!cfg.activo_efectivo) {
        return res.status(200).send(await escribirCupoResponsableActual(bitrixId, nombreAsesor));
      }

      // ¿Ya está esperando en la estación? (Bitrix puede disparar 2 veces)
      const enCola = await poolErp.query(
        `SELECT 1 FROM ${T.cola} WHERE bitrix_deal_id = $1 AND estado = 'pendiente'`, [bitrixId]
      );
      if (enCola.rows.length) return res.status(200).send('OK (ya está en la estación)');

      // 1) Fuera de horario (22:16:00 – 07:59:59) → estación
      if (!dentroDeHorario(new Date(), cfg.hora_inicio, cfg.hora_fin)) {
        return res.status(200).send(await enviarAEstacion(bitrixId, nombreAsesor, 'fuera_de_horario', cfg));
      }

      // 2) Hay leads esperando antes que este → a la fila, para respetar el orden
      const hayCola = await poolErp.query(`SELECT 1 FROM ${T.cola} WHERE estado = 'pendiente' LIMIT 1`);
      if (hayCola.rows.length) {
        const msg = await enviarAEstacion(bitrixId, nombreAsesor, 'cola_en_espera', cfg);
        setImmediate(() => procesarCola());
        return res.status(200).send(msg);
      }

      // 3) Reparto directo por rondas; si nadie puede recibir → estación
      const enLinea = cfg.solo_en_linea ? await leerEnLinea({ empresa }) : null;
      const r = await repartirPorRondas(bitrixId, nombreAsesor, enLinea, cfg, 'directo');
      if (r.estado === 'asignado') return res.status(200).send('OK');
      if (r.estado === 'ya_repartido') return res.status(200).send('OK (ya repartido hoy)');
      return res.status(200).send(await enviarAEstacion(bitrixId, nombreAsesor, r.motivo, cfg));

    } catch (err) {
      console.error('[gestionablesWebhook] recibirGestionable error:', err.message);
      await registrarLog({ bitrixId: bitrixId || '(vacio)', nombreAsesor, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) });
      return res.status(500).send('Error interno');
    }
  };

  return { recibirGestionable, procesarCola, sincronizarManuales, inicioJornadaIso };
};

const instancias = {};
const reparto = (empresa) => {
  const E = getEmpresa(empresa);
  if (!instancias[E.clave]) instancias[E.clave] = crearReparto(E.clave);
  return instancias[E.clave];
};

// Webhook: ?empresa=velsa para Velsa; sin empresa = novonet (igual que siempre)
const recibirGestionable = (req, res) => {
  if (req.query.empresa && !empresaValida(req.query.empresa)) return res.status(400).send('Empresa inválida');
  return reparto(req.query.empresa || 'novonet').recibirGestionable(req, res);
};
const procesarCola = (empresa = 'novonet') => reparto(empresa).procesarCola();
const sincronizarManuales = (empresa = 'novonet') => reparto(empresa).sincronizarManuales();
const inicioJornadaIso = (...a) => reparto('novonet').inicioJornadaIso(...a);

module.exports = { recibirGestionable, procesarCola, sincronizarManuales, inicioJornadaIso, reparto };
