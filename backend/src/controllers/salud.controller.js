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
  // El cierre diario NO va en esta lista: su bitácora (cierre_diario_log) vive
  // en la base local de la PC de oficina, que este servidor no puede consultar
  // — por eso el chequeo salía siempre en DESCONOCIDO y no vigilaba nada.
  // Ahora se evalúa aparte, con el latido que el propio proceso escribe aquí.
  // Ver estadoCierreDiario().
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

// El cierre diario corre en una PC de la oficina, no aquí, y guarda en una base
// local que este servidor no ve. Lo único que cruza es el latido que el propio
// proceso escribe en Render al terminar. Si la PC se apaga, si Postgres local no
// levanta o si el cierre revienta, el latido deja de llegar y esto se pone rojo
// solo — que es el punto: nadie debería tener que acordarse de ir a revisarlo.
async function estadoCierreDiario() {
  const base = {
    id: 'cierre_diario', nombre: 'Cierre diario (PC de oficina)', grupo: 'Respaldos',
    critico: false,
    detalle: 'Congela cada noche a las 23:50 cómo cerró el día en Bitrix y JotForm. Corre en la PC de la oficina: si está apagada a esa hora, esa noche se pierde y no se recupera sola.',
  };

  const { rows } = await pool.query(
    `SELECT fecha_cierre, filas_total, tablas_ok, tablas_error, detalle, actualizado_en
       FROM public.cierre_diario_estado WHERE id = 1`
  );

  if (!rows.length) {
    return { ...base, estado: 'CAIDO', medida: 'nunca reportó',
      detalle: base.detalle + ' Todavía no llegó ningún aviso: el proceso no ha terminado una corrida desde que se instaló la vigilancia.' };
  }

  const r = rows[0];
  const horas = (Date.now() - new Date(r.actualizado_en).getTime()) / 3600000;

  // Corre una vez al día: hasta 26 h es normal (margen para que el reloj de la
  // PC y el del servidor no coincidan al minuto). Pasadas 36 h ya se saltó una
  // noche entera.
  let estado = horas <= 26 ? 'OK' : horas <= 36 ? 'RETRASO' : 'CAIDO';

  // Un latido fresco pero con tablas en error es peor que uno viejo: el
  // respaldo de anoche quedó incompleto y nadie se enteró.
  if (Number(r.tablas_error) > 0) estado = 'CAIDO';

  const cuando = new Date(r.fecha_cierre).toISOString().slice(0, 10);
  const medida = Number(r.tablas_error) > 0
    ? `${r.tablas_error} tabla(s) con error el ${cuando}`
    : `${cuando} · ${Number(r.filas_total).toLocaleString('es-EC')} filas`;

  return {
    ...base, estado, medida,
    ultimo: r.actualizado_en,
    total: Number(r.filas_total),
    detalle: base.detalle + (r.detalle ? ` Último cierre — ${r.detalle}` : ''),
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

// ═══════════════════════════════════════════════════════════════════════════
// MAPA DE MÓDULOS
// ═══════════════════════════════════════════════════════════════════════════
// La lista de chequeos dice QUÉ está caído. No dice a quién le importa.
// Este mapa agrega lo que falta: de dónde sale cada dato y qué pantallas
// dependen de él, para que "mestra_bitrix congelada" se lea directamente como
// "Reporte D-1 y Vista Asesor están mostrando números viejos".
//
// `mide` engancha el nodo con un chequeo real; los nodos sin `mide` son piezas
// del recorrido que no tienen medición propia (una fuente externa, una
// pantalla) y heredan el estado de lo que los alimenta.
const CAPAS = [
  {
    id: 'fuentes', nombre: 'Fuentes externas',
    nodos: [
      { id: 'bitrix',     nombre: 'Bitrix24',   alimenta: ['webhook', 'mestra_bitrix'] },
      { id: 'jotform',    nombre: 'JotForm',    alimenta: ['mestra_bitrix', 'mv_velsa'] },
      { id: 'wintracker', nombre: 'WinTracker', alimenta: ['inversion'] },
      { id: 'whatsapp',   nombre: 'WhatsApp',   alimenta: ['lineas_wa'] },
    ],
  },
  {
    id: 'ingesta', nombre: 'Ingesta',
    nodos: [
      { id: 'webhook',        nombre: 'Leads del webhook', mide: 'bitrix_webhook_leads', alimenta: ['redes', 'contactabilidad_n'] },
      { id: 'mestra_bitrix',  nombre: 'Maestra Bitrix',    mide: 'mestra_bitrix',        alimenta: ['reporte_d1', 'vista_asesor', 'gerencial'] },
      { id: 'inversion',      nombre: 'Inversión en redes', alimenta: ['redes', 'gerencial'] },
      { id: 'lineas_wa',      nombre: 'Líneas de WhatsApp', mide: 'whatsapp_lineas',     alimenta: ['wabot'] },
      { id: 'contactabilidad_n', nombre: 'Contactabilidad', mide: 'contactabilidad',     alimenta: ['contactabilidad_ui'] },
    ],
  },
  {
    id: 'analitica', nombre: 'Analítica',
    nodos: [
      { id: 'mv_velsa', nombre: 'Vista materializada Velsa', mide: 'mv_velsa', alimenta: ['vista_asesor_velsa', 'gerencial', 'redes_velsa'] },
      { id: 'nexo_ia',  nombre: 'Cola de Nexo IA',           mide: 'nexo_ia',  alimenta: ['nexo_ui'] },
    ],
  },
  {
    id: 'pantallas', nombre: 'Lo que ve la gente',
    nodos: [
      { id: 'reporte_d1',         nombre: 'Reporte D-1' },
      { id: 'vista_asesor',       nombre: 'Vista Asesor' },
      { id: 'vista_asesor_velsa', nombre: 'Vista Asesor Velsa' },
      { id: 'gerencial',          nombre: 'Reporte Gerencial' },
      { id: 'redes',              nombre: 'Redes Novonet' },
      { id: 'redes_velsa',        nombre: 'Redes Velsa' },
      { id: 'wabot',              nombre: 'Wabot' },
      { id: 'contactabilidad_ui', nombre: 'Contactabilidad' },
      { id: 'nexo_ui',            nombre: 'Nexo IA' },
    ],
  },
  {
    id: 'respaldo', nombre: 'Respaldo',
    nodos: [
      { id: 'cierre', nombre: 'Cierre diario', mide: 'cierre_diario' },
    ],
  },
];

const PEOR = { OK: 0, DESCONOCIDO: 1, RETRASO: 2, CAIDO: 3 };

/**
 * Arma el mapa con el estado ya propagado.
 *
 * Una pantalla no se mide sola: está mal cuando lo está algo de lo que come.
 * Se propaga el PEOR estado de sus fuentes, y se deja escrito cuál fue, que es
 * la pregunta siguiente inevitable ("¿y por qué está en rojo?").
 */
function construirMapa(componentes) {
  const porId = Object.fromEntries(componentes.map((c) => [c.id, c]));

  // quién alimenta a quién (la relación viene declarada al revés)
  const entradas = {};
  for (const capa of CAPAS) {
    for (const n of capa.nodos) {
      for (const destino of (n.alimenta || [])) (entradas[destino] ||= []).push(n.id);
    }
  }

  const estados = {};
  const motivos = {};

  // Las capas están en orden de dependencia, así que una sola pasada alcanza:
  // cuando se evalúa un nodo, todo lo que lo alimenta ya tiene estado.
  for (const capa of CAPAS) {
    for (const n of capa.nodos) {
      const propio = n.mide ? (porId[n.mide]?.estado || 'DESCONOCIDO') : null;
      let peor = propio || 'OK';
      let culpable = propio && propio !== 'OK' ? n.nombre : null;

      for (const origen of (entradas[n.id] || [])) {
        const e = estados[origen] || 'DESCONOCIDO';
        if (PEOR[e] > PEOR[peor]) { peor = e; culpable = motivos[origen] || nombreDe(origen); }
      }
      // Un nodo sin medición ni fuentes no se pinta en rojo por las dudas.
      if (!propio && !(entradas[n.id] || []).length) peor = 'SIN_MEDIR';

      estados[n.id] = peor;
      motivos[n.id] = culpable;
    }
  }

  return {
    capas: CAPAS.map((capa) => ({
      id: capa.id, nombre: capa.nombre,
      nodos: capa.nodos.map((n) => ({
        id: n.id, nombre: n.nombre,
        alimenta: n.alimenta || [],
        estado: estados[n.id],
        // Por qué está así: el nodo que lo arrastró, o él mismo.
        causa: estados[n.id] === 'OK' || estados[n.id] === 'SIN_MEDIR' ? null : motivos[n.id],
        medida: n.mide ? porId[n.mide]?.medida : null,
        detalle: n.mide ? porId[n.mide]?.detalle : null,
      })),
    })),
  };
}

const nombreDe = (id) => {
  for (const capa of CAPAS) for (const n of capa.nodos) if (n.id === id) return n.nombre;
  return id;
};

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

  for (const extra of [estadoLineasWhatsApp, estadoColaNexoIa, estadoCierreDiario]) {
    try { componentes.push(await extra()); }
    catch (err) {
      componentes.push({
        id: extra.name, nombre: extra.name, grupo: 'Otros', critico: false,
        estado: 'DESCONOCIDO', medida: 'no se pudo consultar', error: err.message,
      });
    }
  }

  const mapa = construirMapa(componentes);

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
    mapa,
  });
}

module.exports = { getSalud, evaluarFrescura, minutosDesde, CHEQUEOS };
