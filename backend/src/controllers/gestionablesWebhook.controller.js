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
 */

const poolErp = require('../config/dbErp');
const { bitrixCallNovonet } = require('../services/bitrix.service');

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
    if (!nombreAsesor) {
      await registrarLog({ bitrixId, nombreAsesor, error: 'Falta nombre_asesor' });
      return res.status(400).send('Falta nombre_asesor');
    }

    // 1) Cupo más reciente <= hoy para este asesor (permite cargar el cupo
    //    con anticipación y que se siga usando hasta la próxima carga).
    const r = await poolErp.query(
      `SELECT gestionables_permitidos
         FROM gestionables_asesores
        WHERE nombre_bitrix_asesor = $1
          AND fecha_carga <= CURRENT_DATE
        ORDER BY fecha_carga DESC
        LIMIT 1`,
      [nombreAsesor]
    );

    if (r.rows.length === 0) {
      await registrarLog({ bitrixId, nombreAsesor, encontrado: false });
      console.warn(`[gestionablesWebhook] Sin cupo cargado para "${nombreAsesor}" (deal ${bitrixId})`);
      return res.status(200).send('OK (sin cupo cargado para ese asesor)');
    }

    const gestionables = r.rows[0].gestionables_permitidos;

    // 2) (Opcional) confirmar que el deal sigue en la etapa esperada antes de escribir
    if (EXPECTED_STAGE_ID) {
      const deal = await bitrixCallNovonet('crm.deal.get', { id: bitrixId });
      if (deal.result && deal.result.STAGE_ID !== EXPECTED_STAGE_ID) {
        await registrarLog({ bitrixId, nombreAsesor, gestionables, encontrado: true, actualizado: false, error: `Etapa actual (${deal.result.STAGE_ID}) ya no es la esperada (${EXPECTED_STAGE_ID})` });
        return res.status(200).send('OK (el deal ya cambió de etapa, no se actualizó)');
      }
    }

    // 3) Escribir el cupo en el campo personalizado del deal
    await bitrixCallNovonet('crm.deal.update', {
      id: bitrixId,
      fields: { [FIELD_NAME]: gestionables },
    });

    await registrarLog({ bitrixId, nombreAsesor, gestionables, encontrado: true, actualizado: true });
    return res.status(200).send('OK');

  } catch (err) {
    console.error('[gestionablesWebhook] recibirGestionable error:', err.message);
    await registrarLog({ bitrixId: bitrixId || '(vacio)', nombreAsesor, error: err.message });
    return res.status(500).send('Error interno');
  }
};

module.exports = { recibirGestionable };
