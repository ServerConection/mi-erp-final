// =============================================================================
// Contactabilidad — Cron corto (red de seguridad del tiempo real)
// El webhook de Bitrix es el camino rapido; este job existe para que el dato
// sea CONFIABLE aunque el webhook falle, Bitrix se caiga o el proceso reinicie.
//
// Salvaguardas:
//  - Lock en memoria: nunca dos ciclos superpuestos en el mismo proceso.
//  - Lock de aplicacion en Postgres: nunca dos instancias haciendo lo mismo.
//  - Tope de leads por ciclo y concurrencia acotada: no revienta el rate limit.
//  - Backoff progresivo: si Bitrix falla, se espacia solo en vez de insistir.
// =============================================================================

const cron = require('node-cron');

const LOCK_ID = 918273641;          // identificador del advisory lock
const INTERVALO_DEFECTO = 2;        // minutos
const BACKOFF_MAX = 8;              // ciclos que llega a saltarse tras fallar

function crearJobTiempoReal({
  cronImpl = cron,
  pool,
  refrescador,
  webhook,
  env = process.env,
  logger = console,
}) {
  let ejecutando = false;
  let fallosSeguidos = 0;
  let saltosPendientes = 0;

  /** Lock entre procesos: solo una instancia refresca por ciclo. */
  async function conLock(tarea) {
    const { rows } = await pool.query('SELECT pg_try_advisory_lock($1) AS obtenido', [LOCK_ID]);
    if (!rows[0]?.obtenido) return { omitido: true, motivo: 'LOCK_OCUPADO' };
    try {
      return await tarea();
    } finally {
      await pool.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    }
  }

  async function ejecutarCiclo() {
    if (ejecutando) return { omitido: true, motivo: 'CICLO_EN_CURSO' };
    if (saltosPendientes > 0) {
      saltosPendientes -= 1;
      return { omitido: true, motivo: 'BACKOFF', restantes: saltosPendientes };
    }

    ejecutando = true;
    try {
      return await conLock(async () => {
        const resultados = {};
        let huboError = false;

        // 1) Primero los eventos que llegaron por webhook y no se procesaron.
        if (webhook?.drenarPendientes) {
          try {
            resultados.eventos = await webhook.drenarPendientes({ limite: 50 });
          } catch (error) {
            huboError = true;
            logger.error(`[CONTACTABILIDAD:RT] inbox: ${error.message}`);
          }
        }

        // 2) Luego los chats vivos de cada empresa.
        const ventana = Math.max(1, Number(env.CONTACTABILIDAD_VENTANA_ACTIVA_HORAS) || 48);
        const limite = Math.max(1, Number(env.CONTACTABILIDAD_LEADS_POR_CICLO) || 60);

        for (const empresa of refrescador.empresas()) {
          let runId;
          try {
            const inicio = await pool.query(`
              INSERT INTO contactabilidad_sync_runs (empresa, estado, origen)
              VALUES ($1, 'ACTIVO', 'CRON_CORTO') RETURNING id
            `, [empresa]);
            runId = inicio.rows[0].id;

            const res = await refrescador.refrescarActivos(empresa, {
              ventanaHoras: ventana, limite, origen: 'CRON_CORTO',
            });

            await pool.query(`
              UPDATE contactabilidad_sync_runs
              SET finalizado_at = NOW(), estado = $2,
                  leads_leidos = $3, leads_actualizados = $3, mensajes_insertados = $4,
                  error_resumen = $5
              WHERE id = $1
            `, [runId, res.errores ? 'PARCIAL' : 'COMPLETO', res.leads, res.mensajes_nuevos,
              res.errores ? `${res.errores} lead(s) con error` : null]);

            if (res.errores) huboError = true;
            resultados[empresa] = res;
          } catch (error) {
            huboError = true;
            resultados[empresa] = { error: error.message };
            logger.error(`[CONTACTABILIDAD:RT:${empresa}] ${error.message}`);
            if (runId) {
              await pool.query(`
                UPDATE contactabilidad_sync_runs
                SET finalizado_at = NOW(), estado = 'FALLIDO', error_resumen = $2
                WHERE id = $1
              `, [runId, error.message]).catch(() => {});
            }
          }
        }

        if (huboError) {
          fallosSeguidos += 1;
          saltosPendientes = Math.min(BACKOFF_MAX, 2 ** (fallosSeguidos - 1));
          logger.warn(`[CONTACTABILIDAD:RT] backoff activo: se saltan ${saltosPendientes} ciclo(s)`);
        } else {
          fallosSeguidos = 0;
          saltosPendientes = 0;
        }

        return resultados;
      });
    } finally {
      ejecutando = false;
    }
  }

  function iniciar() {
    if (String(env.CONTACTABILIDAD_TIEMPO_REAL_ENABLED).toLowerCase() !== 'true') {
      logger.warn('[CONTACTABILIDAD:RT] Desactivado (CONTACTABILIDAD_TIEMPO_REAL_ENABLED != true)');
      return false;
    }
    if (!refrescador.empresas().length) {
      logger.warn('[CONTACTABILIDAD:RT] No hay empresas habilitadas con webhook');
      return false;
    }
    const minutos = Math.min(30, Math.max(1,
      Number(env.CONTACTABILIDAD_TIEMPO_REAL_MINUTOS) || INTERVALO_DEFECTO));
    cronImpl.schedule(`*/${minutos} * * * *`,
      () => ejecutarCiclo().catch((error) => logger.error(`[CONTACTABILIDAD:RT] ${error.message}`)),
      { timezone: 'America/Guayaquil' });
    logger.log(`[CONTACTABILIDAD:RT] Refresco de chats activos cada ${minutos} minuto(s)`);
    return true;
  }

  return { iniciar, ejecutarCiclo, estado: () => ({ ejecutando, fallosSeguidos, saltosPendientes }) };
}

function initContactabilidadTiempoReal() {
  const { obtenerContexto } = require('../contactabilidad/contactabilidad.contexto');
  const { pool, refrescador, webhook } = obtenerContexto();
  return crearJobTiempoReal({ pool, refrescador, webhook }).iniciar();
}

module.exports = { crearJobTiempoReal, initContactabilidadTiempoReal, LOCK_ID };
