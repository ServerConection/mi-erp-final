/**
 * SALUD DEL SISTEMA — mapa de estado del ERP y sus tuberias de datos
 *
 * Responde una sola pregunta, la que hoy no se puede contestar de un vistazo:
 * "¿que esta vivo y que se congelo?".
 *
 * El problema real que resuelve: cuando un ETL se cae, el ERP NO da error. Los
 * dashboards siguen pintando numeros, solo que viejos. Un dato congelado que se
 * ve normal es peor que una pantalla rota, porque se toman decisiones con el.
 *
 * Cada chequeo mide la FRESCURA de una tabla (que tan viejo es su ultimo dato)
 * y la compara con dos umbrales en minutos:
 *    edad <= verde     -> OK        (al dia)
 *    edad <= amarillo  -> RETRASO   (aun sirve, pero mirar)
 *    mas que eso       -> CAIDO     (dato congelado)
 *
 * Cada chequeo corre aislado: si una tabla no existe o la consulta falla, ese
 * chequeo sale como DESCONOCIDO y los demas siguen. El endpoint nunca revienta.
 *
 * OJO — alcance: solo ve la base de Render (bddgeneral). Las tablas de JotForm
 * viven en el Postgres LOCAL de la oficina y no son visibles desde aqui; por eso
 * no aparecen. Lo que si aparece es todo lo que alimenta al ERP en produccion.
 */
const pool = require('../config/db');

// Un chequeo = una consulta que devuelve { ultimo, total }.
// verde/amarillo en MINUTOS.
const CHEQUEOS = [
  {
    id: 'mestra_bitrix',
    nombre: 'Maestra Bitrix (Novonet)',
    grupo: 'Ingesta',
    critico: true,
    detalle: 'La alimenta un ETL fuera del ERP. Si se congela, se congelan casi todos los dashboards de Novonet sin dar error.',
    verde: 60, amarillo: 180,
    sql: `SELECT MAX(j_fecha_registro_sistema)::timestamptz AS ultimo, COUNT(*)::int AS total FROM public.mestra_bitrix`,
  },
  {
    id: 'bitrix_webhook_leads',
    nombre: 'Leads de Bitrix (webhook)',
    grupo: 'Ingesta',
    critico: true,
    detalle: 'Entrada en vivo desde las automatizaciones de Bitrix24. Si se detiene, dejan de entrar leads nuevos.',
    verde: 60, amarillo: 240,
    sql: `SELECT MAX(updated_at)::timestamptz AS ultimo, COUNT(*)::int AS total FROM public.bitrix_webhook_leads`,
  },
  {
    id: 'mv_velsa',
    nombre: 'Vista materializada Velsa',
    grupo: 'Analitica',
    critico: true,
    detalle: 'Base de todos los indicadores de Velsa. Se refresca por cron; si no refresca, los numeros se quedan pegados.',
    verde: 120, amarillo: 360,
    sql: `SELECT MAX(fecha_registro_jotform)::timestamptz AS ultimo, COUNT(*)::int AS total FROM public.mv_indicadores_velsa_completo`,
  },
  {
    id: 'contactabilidad',
    nombre: 'Contactabilidad',
    grupo: 'Analitica',
    critico: false,
    detalle: 'Ultima corrida del sincronizador de chats de Bitrix.',
    verde: 60, amarillo: 180,
    sql: `SELECT MAX(finalizado_at)::timestamptz AS ultimo, COUNT(*)::int AS total FROM public.contactabilidad_sync_runs`,
  },
  {
    id: 'cierre_diario',
    nombre: 'Cierre diario',
    grupo: 'Respaldos',
    critico: false,
    detalle: 'Respaldo de las 23:50. Se considera al dia si corrio en las ultimas 26 horas.',
    verde: 1560, amarillo: 2880,
    sql: `SELECT MAX(creado_en)::timestamptz AS ultimo, COUNT(*)::int AS total FROM public.cierre_diario_log`,
  },
];

// Chequeos que no miden frescura sino un conteo (se evaluan aparte).
async function estadoLineasWhatsApp() {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'connected')::int AS conectadas
     FROM public.lines
     WHERE COALESCE(activo, TRUE) = TRUE`
  );
  const { total, conectadas } = rows[0];
  return {
    id: 'wa_lineas', nombre: 'Líneas de WhatsApp', grupo: 'WhatsApp', critico: false,
    detalle: 'Líneas activas y cuántas están realmente conectadas.',
    estado: total === 0 ? 'DESCONOCIDO' : conectadas === 0 ? 'CAIDO' : conectadas < total ? 'RETRASO' : 'OK',
    medida: `${conectadas} de ${total} conectadas`,
    ultimo: null, total,
  };
}

async function estadoColaNexoIa() {
  const { rows } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE estado = 'PENDIENTE')::int AS pendientes,
            MAX(actualizado_at)::timestamptz AS ultimo
     FROM public.nexo_ia_jobs`
  );
  const { pendientes, ultimo } = rows[0];
  return {
    id: 'nexo_ia', nombre: 'Cola de Nexo IA', grupo: 'IA', critico: false,
    detalle: 'Borradores en espera. Una cola que crece sin bajar es señal de atasco.',
    estado: pendientes > 200 ? 'CAIDO' : pendientes > 50 ? 'RETRASO' : 'OK',
    medida: `${pendientes} en cola`,
    ultimo, total: pendientes,
  };
}

const minutosDesde = (fecha) =>
  fecha ? Math.round((Date.now() - new Date(fecha).getTime()) / 60000) : null;

function evaluarFrescura(chequeo, ultimo, total) {
  const edad = minutosDesde(ultimo);
  if (edad === null) return { estado: 'DESCONOCIDO', medida: 'sin datos' };
  const estado = edad <= chequeo.verde ? 'OK' : edad <= chequeo.amarillo ? 'RETRASO' : 'CAIDO';
  const medida = edad < 60
    ? `hace ${edad} min`
    : edad < 1440 ? `hace ${Math.round(edad / 60)} h` : `hace ${Math.round(edad / 1440)} d`;
  return { estado, medida, edad_minutos: edad, total };
}

async function getSalud(req, res) {
  const componentes = [];

  for (const chequeo of CHEQUEOS) {
    try {
      const { rows } = await pool.query(chequeo.sql);
      const { ultimo, total } = rows[0] || {};
      componentes.push({
        id: chequeo.id, nombre: chequeo.nombre, grupo: chequeo.grupo,
        critico: chequeo.critico, detalle: chequeo.detalle,
        ultimo, ...evaluarFrescura(chequeo, ultimo, total),
      });
    } catch (err) {
      // Una tabla que no existe o una consulta que falla NO tumba el mapa.
      componentes.push({
        id: chequeo.id, nombre: chequeo.nombre, grupo: chequeo.grupo,
        critico: chequeo.critico, detalle: chequeo.detalle,
        estado: 'DESCONOCIDO', medida: 'no se pudo consultar',
        error: err.message, ultimo: null,
      });
    }
  }

  for (const extra of [estadoLineasWhatsApp, estadoColaNexoIa]) {
    try { componentes.push(await extra()); }
    catch (err) {
      componentes.push({
        id: extra.name, nombre: extra.name, grupo: 'Otros', critico: false,
        estado: 'DESCONOCIDO', medida: 'no se pudo consultar', error: err.message,
      });
    }
  }

  const cuenta = (e) => componentes.filter((c) => c.estado === e).length;
  const hayCriticoCaido = componentes.some((c) => c.critico && c.estado === 'CAIDO');

  res.json({
    success: true,
    generado_en: new Date().toISOString(),
    resumen: {
      total: componentes.length,
      ok: cuenta('OK'), retraso: cuenta('RETRASO'),
      caido: cuenta('CAIDO'), desconocido: cuenta('DESCONOCIDO'),
      // El semaforo general se pone rojo solo si lo caido es CRITICO: que el
      // cierre diario no haya corrido no es lo mismo que perder la ingesta.
      estado_general: hayCriticoCaido ? 'CAIDO' : cuenta('CAIDO') || cuenta('RETRASO') ? 'RETRASO' : 'OK',
    },
    componentes,
  });
}

module.exports = { getSalud, evaluarFrescura, minutosDesde, CHEQUEOS };
