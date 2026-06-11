/**
 * Asistente ERP — IA primero.
 *
 * Flujo:
 *  1. Si OLLAMA_URL está configurado → se arma un SNAPSHOT con datos reales
 *     del ERP (Novonet + Velsa: resumen, tops por asesor, descartes, leads,
 *     activas, gestión diaria, etc.) y el modelo (llama3) responde LIBREMENTE
 *     cualquier pregunta usando SOLO esos datos.
 *  2. Si Ollama no está disponible → motor de reglas como respaldo.
 *
 * Fuentes (las mismas de los dashboards):
 *   • Novonet: public.mestra_bitrix (+ public.empleados)
 *   • Velsa:   public.mv_indicadores_velsa_completo
 */
const pool = require('../config/db');
const broadcastSvc = require('./broadcast.service');

// ── Fechas (Ecuador) ──────────────────────────────────────────
const fechaEc = (d = new Date()) =>
  d.toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

const PERIODOS = {
  hoy:    () => ({ desde: fechaEc(), hasta: fechaEc(), label: 'HOY' }),
  ayer:   () => { const d = new Date(Date.now() - 24 * 3600 * 1000); return { desde: fechaEc(d), hasta: fechaEc(d), label: 'AYER' }; },
  semana: () => { const d = new Date(Date.now() - 6 * 24 * 3600 * 1000); return { desde: fechaEc(d), hasta: fechaEc(), label: 'ULTIMOS_7_DIAS' }; },
  mes:    () => ({ desde: fechaEc().slice(0, 7) + '-01', hasta: fechaEc(), label: 'MES_ACTUAL' }),
};

const detectarPeriodo = (q) => {
  if (/\bayer\b/i.test(q)) return PERIODOS.ayer();
  if (/semana/i.test(q))   return PERIODOS.semana();
  if (/\bmes\b|mensual|del mes/i.test(q)) return PERIODOS.mes();
  return PERIODOS.hoy();
};

const detectarEmpresa = (q) => {
  const v = /velsa/i.test(q), n = /novonet/i.test(q);
  if (v && !n) return ['velsa'];
  if (n && !v) return ['novonet'];
  return ['novonet', 'velsa'];
};

// ── Expresiones SQL por empresa ───────────────────────────────
const parseFecha = (col) =>
  `CASE WHEN ${col} IS NULL OR TRIM(${col}::text) = '' THEN NULL ` +
  `WHEN ${col}::text ~ '^\\d{4}-\\d{2}-\\d{2}' THEN ${col}::text::date ` +
  `ELSE TO_DATE(SUBSTRING(${col}::text FROM 5 FOR 11), 'Mon DD YYYY') END`;

const SRC = {
  novonet: {
    nombre: 'NOVONET',
    tabla: 'public.mestra_bitrix mb',
    asesor: 'mb.b_persona_responsable',
    etapa: 'mb.b_etapa_de_la_negociacion',
    fLead: `(${parseFecha('mb.b_creado_el_fecha')})`,
    fJot: 'mb.j_fecha_registro_sistema::date',
    activo: `mb.j_netlife_estatus_real = 'ACTIVO'`,
    tarjeta: `mb.j_forma_pago ILIKE '%TARJETA%'`,
    tercera: `mb.j_aplica_descuento_ ILIKE '%TERCERA%'`,
    ciudad: 'mb.j_ciudad',
  },
  velsa: {
    nombre: 'VELSA',
    tabla: 'public.mv_indicadores_velsa_completo mv',
    asesor: 'mv.asesor',
    etapa: 'mv.etapa_crm',
    fLead: 'mv.fecha_creacion_crm::date',
    fJot: `(mv.fecha_registro_jotform - INTERVAL '5 hours')::date`,
    activo: `mv.estado_venta = 'ACTIVO'`,
    tarjeta: `mv.forma_pago ILIKE '%TARJETA%'`,
    tercera: `mv.aplica_descuento ILIKE '%TERCERA%'`,
    ciudad: null,
  },
};

// ── Consultas genéricas ───────────────────────────────────────
async function topPorAsesor(emp, rango, condicion, fechaCol, limit = 12) {
  const s = SRC[emp];
  const { rows } = await pool.query(`
    SELECT COALESCE(${s.asesor}, 'SIN ASIGNAR') AS nombre, COUNT(*)::int AS cantidad
    FROM ${s.tabla}
    WHERE ${fechaCol} BETWEEN $1::date AND $2::date ${condicion ? 'AND ' + condicion : ''}
    GROUP BY 1 ORDER BY cantidad DESC LIMIT ${limit}
  `, [rango.desde, rango.hasta]);
  return rows;
}

async function totalCon(emp, rango, condicion, fechaCol) {
  const s = SRC[emp];
  const { rows } = await pool.query(`
    SELECT COUNT(*)::int AS total
    FROM ${s.tabla}
    WHERE ${fechaCol} BETWEEN $1::date AND $2::date ${condicion ? 'AND ' + condicion : ''}
  `, [rango.desde, rango.hasta]);
  return rows[0]?.total ?? 0;
}

async function ventasDelDia(emp, rango) {
  if (emp === 'velsa') {
    const { rows } = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM public.mv_indicadores_velsa_completo mv
      WHERE UPPER(mv.etapa_crm) = 'VENTA SUBIDA'
        AND mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
        AND mv.fecha_creacion_crm::date = mv.fecha_modificacion_crm::date
    `, [rango.desde, rango.hasta]);
    return rows[0]?.total ?? 0;
  }
  const { rows } = await pool.query(`
    SELECT COUNT(DISTINCT mb_jot.j_id_bitrix)::int AS total
    FROM public.mestra_bitrix mb_jot
    JOIN public.mestra_bitrix mb_crm
      ON mb_crm.b_id::text = mb_jot.j_id_bitrix::text
    WHERE mb_jot.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
      AND mb_crm.b_etapa_de_la_negociacion = 'VENTA SUBIDA'
      AND (${parseFecha('mb_crm.b_creado_el_fecha')}) = mb_jot.j_fecha_registro_sistema::date
  `, [rango.desde, rango.hasta]);
  return rows[0]?.total ?? 0;
}

async function resumenEmpresa(emp, rango) {
  const s = SRC[emp];
  const [leads, ventasCrm, jot, activas, descartes, vdia] = await Promise.all([
    totalCon(emp, rango, null, s.fLead),
    totalCon(emp, rango, `UPPER(${s.etapa}) = 'VENTA SUBIDA'`, s.fLead),
    totalCon(emp, rango, null, s.fJot),
    totalCon(emp, rango, s.activo, s.fJot),
    totalCon(emp, rango, `UPPER(${s.etapa}) LIKE 'DESCARTE%'`, s.fLead),
    ventasDelDia(emp, rango),
  ]);
  return {
    leads_creados: leads,
    ventas_crm_subidas: ventasCrm,
    ingresos_jotform: jot,
    ventas_del_dia: vdia,
    venta_seguimiento: Math.max(0, jot - vdia),
    activas,
    descartes,
    pct_descarte_sobre_leads: leads > 0 ? +((descartes / leads) * 100).toFixed(1) : 0,
    pct_instalacion: jot > 0 ? +((activas / jot) * 100).toFixed(1) : 0,
  };
}

// ── Detección de nombres propios en la pregunta ──────────────
const STOPWORDS = new Set([
  'QUIEN','QUIÉN','CUANTAS','CUÁNTAS','CUANTOS','CUÁNTOS','VENTAS','VENTA','HOY','AYER','MES','SEMANA',
  'NOVONET','VELSA','TIENE','COMO','CÓMO','DAME','TOTAL','LEADS','LEAD','DESCARTE','DESCARTES','ACTIVAS',
  'JOT','JOTFORM','RESUMEN','ASESOR','ASESORES','SUPERVISOR','DIA','DÍA','GESTION','GESTIÓN','DIARIA',
  'TARJETA','CREDITO','CRÉDITO','TERCERA','EDAD','CIUDAD','CIUDADES','MEJOR','PEOR','MAS','MÁS','MENOS',
  'PARA','DESDE','HASTA','SOBRE','ENTRE','ESTE','ESTA','HACE','SEGUIMIENTO','SUBIDAS','CUAL','CUÁL','LISTA',
]);

function extraerNombres(q) {
  const tokens = q.toUpperCase().replace(/[¿?¡!.,;:]/g, ' ').split(/\s+/);
  return tokens.filter(t => t.length >= 4 && /^[A-ZÁÉÍÓÚÑ]+$/.test(t) && !STOPWORDS.has(t)).slice(0, 3);
}

async function consultaAsesor(nombre, rango) {
  const out = {};
  for (const emp of ['novonet', 'velsa']) {
    const s = SRC[emp];
    try {
      const { rows } = await pool.query(`
        SELECT COALESCE(${s.asesor},'') AS asesor,
          COUNT(*) FILTER (WHERE ${s.fLead} BETWEEN $2::date AND $3::date)::int AS leads,
          COUNT(*) FILTER (WHERE UPPER(${s.etapa})='VENTA SUBIDA' AND ${s.fLead} BETWEEN $2::date AND $3::date)::int AS ventas_subidas,
          COUNT(*) FILTER (WHERE ${s.fJot} BETWEEN $2::date AND $3::date)::int AS ingresos_jot,
          COUNT(*) FILTER (WHERE ${s.activo} AND ${s.fJot} BETWEEN $2::date AND $3::date)::int AS activas,
          COUNT(*) FILTER (WHERE UPPER(${s.etapa}) LIKE 'DESCARTE%' AND ${s.fLead} BETWEEN $2::date AND $3::date)::int AS descartes
        FROM ${s.tabla}
        WHERE ${s.asesor} ILIKE $1
        GROUP BY 1 LIMIT 5
      `, [`%${nombre}%`, rango.desde, rango.hasta]);
      if (rows.length) out[emp] = rows;
    } catch (e) {}
  }
  return Object.keys(out).length ? out : null;
}

// ── SNAPSHOT completo para la IA ──────────────────────────────
async function construirSnapshot(q) {
  const rangoPrincipal = detectarPeriodo(q);
  const rangos = [rangoPrincipal];
  // Siempre incluir HOY y MES para que la IA pueda comparar
  if (rangoPrincipal.label !== 'HOY') rangos.push(PERIODOS.hoy());
  if (rangoPrincipal.label !== 'MES_ACTUAL') rangos.push(PERIODOS.mes());

  const snapshot = { fecha_actual_ecuador: fechaEc(), periodos: {} };

  await Promise.all(rangos.map(async (rango) => {
    const bloque = {};
    await Promise.all(['novonet', 'velsa'].map(async (emp) => {
      const s = SRC[emp];
      const [resumen, topVentas, topJot, topActivas, topDescartes, topLeads] = await Promise.all([
        resumenEmpresa(emp, rango),
        topPorAsesor(emp, rango, `UPPER(${s.etapa}) = 'VENTA SUBIDA'`, s.fLead),
        topPorAsesor(emp, rango, null, s.fJot),
        topPorAsesor(emp, rango, s.activo, s.fJot),
        topPorAsesor(emp, rango, `UPPER(${s.etapa}) LIKE 'DESCARTE%'`, s.fLead),
        topPorAsesor(emp, rango, null, s.fLead),
      ]);
      bloque[s.nombre] = {
        resumen,
        top_ventas_subidas_por_asesor: topVentas,
        top_ingresos_jotform_por_asesor: topJot,
        top_activas_por_asesor: topActivas,
        top_descartes_por_asesor: topDescartes,
        top_leads_creados_por_asesor: topLeads,
      };
    }));
    snapshot.periodos[rango.label] = { desde: rango.desde, hasta: rango.hasta, ...bloque };
  }));

  // Extras de HOY (Novonet)
  try { snapshot.gestion_diaria_hoy = (await broadcastSvc.getAsesoresGestionDiaria()).slice(0, 10); } catch (e) {}
  try { snapshot.asesores_sin_ventas_hoy = (await broadcastSvc.getAsesoresSinVentas()).slice(0, 20); } catch (e) {}
  try {
    const hoy = PERIODOS.hoy();
    const { rows } = await pool.query(`
      SELECT COALESCE(UPPER(TRIM(mb.j_ciudad)),'SIN DATO') AS ciudad, COUNT(*)::int AS cantidad
      FROM public.mestra_bitrix mb
      WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
      GROUP BY 1 ORDER BY cantidad DESC LIMIT 8
    `, [hoy.desde, hoy.hasta]);
    snapshot.ciudades_novonet_hoy = rows;
  } catch (e) {}

  // Si la pregunta menciona un nombre propio → datos puntuales de ese asesor
  const nombres = extraerNombres(q);
  if (nombres.length) {
    snapshot.busqueda_asesor = {};
    for (const n of nombres) {
      const r = await consultaAsesor(n, detectarPeriodo(q));
      if (r) snapshot.busqueda_asesor[n] = r;
    }
    if (!Object.keys(snapshot.busqueda_asesor).length) delete snapshot.busqueda_asesor;
  }

  return snapshot;
}

// ── Llamada a Ollama (IA principal) ───────────────────────────
const SYSTEM_PROMPT =
  `Eres el Asistente del ERP de Novonet y Velsa (ventas de internet en Ecuador). ` +
  `Responde SIEMPRE en español, de forma clara, breve y directa. ` +
  `Usa ÚNICAMENTE los DATOS JSON que te entrego: son cifras reales del ERP en este momento. ` +
  `NUNCA inventes cifras, nombres ni porcentajes que no estén en los datos. ` +
  `Si la pregunta no se puede responder con los datos disponibles, di exactamente qué dato falta. ` +
  `Glosario: "ventas subidas"=ventas registradas en CRM; "ingresos jotform"=ventas ingresadas en Jot; ` +
  `"venta seguimiento"=ingresos jotform menos ventas del día; "activas"=instalaciones activadas; ` +
  `"descartes"=leads descartados. ` +
  `Formato: usa *negritas* para títulos y listas numeradas cuando muestres rankings.`;

async function llamarOllama(pregunta, snapshot) {
  const base = process.env.OLLAMA_URL;
  if (!base) return null;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 90000);
    const resp = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || 'llama3',
        stream: false,
        options: { temperature: 0.2, num_ctx: 8192 },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `DATOS DEL ERP (JSON):\n${JSON.stringify(snapshot)}\n\nPREGUNTA: ${pregunta}` },
        ],
      }),
    });
    clearTimeout(t);
    if (!resp.ok) {
      console.warn('[Asistente] Ollama HTTP', resp.status);
      return null;
    }
    const d = await resp.json();
    return d?.message?.content?.trim() || null;
  } catch (err) {
    console.warn('[Asistente] Ollama no disponible:', err.message);
    return null;
  }
}

// ── Motor de reglas (SOLO respaldo si Ollama no responde) ─────
const lista = (rows, unidad = '') =>
  rows.length
    ? rows.map((r, i) => `${i + 1}. ${r.nombre || 'Sin nombre'} — ${r.cantidad}${unidad}`).join('\n')
    : 'Sin registros en este período.';

const porEmpresas = async (empresas, fn) => {
  const partes = [];
  for (const emp of empresas) partes.push(await fn(emp));
  return partes.join('\n\n');
};

const INTENCIONES = [
  {
    id: 'top_descartes',
    ejemplos: '¿Quién tiene más descartes hoy en Novonet?',
    patron: /descart/i,
    run: async (q) => {
      const rango = detectarPeriodo(q), emps = detectarEmpresa(q);
      return porEmpresas(emps, async (emp) => {
        const s = SRC[emp];
        const rows = await topPorAsesor(emp, rango, `UPPER(${s.etapa}) LIKE 'DESCARTE%'`, s.fLead);
        return `🗑️ *${s.nombre} — Descartes ${rango.label}*\n\n${lista(rows)}`;
      });
    },
  },
  {
    id: 'venta_seguimiento',
    ejemplos: '¿Cuántas ventas seguimiento hay hoy?',
    patron: /seguimiento/i,
    run: async (q) => {
      const rango = detectarPeriodo(q), emps = detectarEmpresa(q);
      return porEmpresas(emps, async (emp) => {
        const r = await resumenEmpresa(emp, rango);
        return `🔁 *${SRC[emp].nombre} — Venta Seguimiento ${rango.label}*\n\n` +
          `• Ingresos Jot: ${r.ingresos_jotform}\n• Ventas del día: ${r.ventas_del_dia}\n` +
          `• *Seguimiento: ${r.venta_seguimiento}*`;
      });
    },
  },
  {
    id: 'top_activas',
    ejemplos: '¿Quién tiene más activas este mes en Velsa?',
    patron: /activa/i,
    run: async (q) => {
      const rango = detectarPeriodo(q), emps = detectarEmpresa(q);
      return porEmpresas(emps, async (emp) => {
        const s = SRC[emp];
        const rows = await topPorAsesor(emp, rango, s.activo, s.fJot);
        return `✅ *${s.nombre} — Activas ${rango.label}*\n\n${lista(rows, ' activas')}`;
      });
    },
  },
  {
    id: 'leads',
    ejemplos: '¿Cuántos leads se crearon hoy?',
    patron: /lead|prospecto/i,
    run: async (q) => {
      const rango = detectarPeriodo(q), emps = detectarEmpresa(q);
      return porEmpresas(emps, async (emp) => {
        const s = SRC[emp];
        const total = await totalCon(emp, rango, null, s.fLead);
        const rows = await topPorAsesor(emp, rango, null, s.fLead);
        return `📋 *${s.nombre} — Leads ${rango.label}*: ${total}\n\n${lista(rows)}`;
      });
    },
  },
  {
    id: 'resumen',
    ejemplos: 'Dame el resumen de Novonet de hoy',
    patron: /resumen|como vamos|cómo vamos|indicador/i,
    run: async (q) => {
      const rango = detectarPeriodo(q), emps = detectarEmpresa(q);
      return porEmpresas(emps, async (emp) => {
        const r = await resumenEmpresa(emp, rango);
        return `📊 *${SRC[emp].nombre} — Resumen ${rango.label}*\n\n` +
          `• Leads creados: ${r.leads_creados}\n• Ventas CRM: ${r.ventas_crm_subidas}\n` +
          `• Ingresos Jot: ${r.ingresos_jotform}\n• Ventas del día: ${r.ventas_del_dia}\n` +
          `• Venta seguimiento: ${r.venta_seguimiento}\n• Activas: ${r.activas} (${r.pct_instalacion}%)\n` +
          `• Descartes: ${r.descartes} (${r.pct_descarte_sobre_leads}%)`;
      });
    },
  },
  {
    id: 'top_ventas',
    ejemplos: '¿Quién ha hecho más ventas hoy?',
    patron: /(quien|quién|top|mejor|mas|más).*(vend|venta|ingres)|venta|jot/i,
    run: async (q) => {
      const rango = detectarPeriodo(q), emps = detectarEmpresa(q);
      return porEmpresas(emps, async (emp) => {
        const s = SRC[emp];
        const rows = await topPorAsesor(emp, rango, null, s.fJot);
        return `🏆 *${s.nombre} — Top ingresos Jot ${rango.label}*\n\n${lista(rows, ' ingresos')}`;
      });
    },
  },
];

const AYUDA =
  `Pregúntame lo que quieras sobre los datos del ERP (Novonet y Velsa): ventas, leads, descartes, ` +
  `activas, seguimiento, gestión diaria, por asesor, por día/mes... Ejemplos:\n\n` +
  INTENCIONES.map(i => `• ${i.ejemplos}`).join('\n');

async function responderConReglas(q) {
  for (const intent of INTENCIONES) {
    if (intent.patron.test(q)) {
      try {
        return { intent: intent.id, respuesta: await intent.run(q) };
      } catch (err) {
        console.error(`[Asistente] Error en ${intent.id}:`, err.message);
        return { intent: intent.id, respuesta: 'Ocurrió un error consultando los datos.' };
      }
    }
  }
  return { intent: 'desconocido', respuesta: `No entendí la pregunta. ${AYUDA}` };
}

// ── Punto de entrada ──────────────────────────────────────────
async function responder(pregunta) {
  const q = (pregunta || '').trim();
  if (!q) return { intent: 'ayuda', respuesta: AYUDA };
  if (/^(ayuda|help|opciones|menu|menú)$/i.test(q)) return { intent: 'ayuda', respuesta: AYUDA };

  // 1) IA PRIMERO: snapshot de datos reales + llama3 responde libre
  if (process.env.OLLAMA_URL) {
    try {
      const snapshot = await construirSnapshot(q);
      const respuesta = await llamarOllama(q, snapshot);
      if (respuesta) return { intent: 'ia', respuesta };
      console.warn('[Asistente] Ollama sin respuesta → usando reglas de respaldo');
    } catch (err) {
      console.error('[Asistente] Error construyendo snapshot:', err.message);
    }
  }

  // 2) Respaldo: motor de reglas
  return responderConReglas(q);
}

module.exports = { responder, INTENCIONES };
