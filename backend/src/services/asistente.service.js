/**
 * Asistente ERP — responde preguntas en lenguaje natural SOLO con datos del ERP.
 *
 * Motor de intenciones (keywords → SQL): determinista, rápido y gratis.
 * Detecta en la pregunta:
 *   • EMPRESA: "novonet" | "velsa" | (nada = ambas)
 *   • PERÍODO: "hoy" (default) | "ayer" | "semana" | "mes"
 *
 * Fuentes (las MISMAS de los dashboards de indicadores):
 *   • Novonet: public.mestra_bitrix (+ public.empleados para supervisores)
 *   • Velsa:   public.mv_indicadores_velsa_completo
 *
 * Si defines OLLAMA_URL, las preguntas sin intención se redactan con el LLM
 * usando únicamente datos del ERP como contexto.
 */
const pool = require('../config/db');
const broadcastSvc = require('./broadcast.service');

// ── Fechas (Ecuador) ──────────────────────────────────────────
const fechaEc = (d = new Date()) =>
  d.toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

const detectarPeriodo = (q) => {
  const hoy = fechaEc();
  if (/\bayer\b/i.test(q)) {
    const d = new Date(Date.now() - 24 * 3600 * 1000);
    return { desde: fechaEc(d), hasta: fechaEc(d), label: 'AYER' };
  }
  if (/semana/i.test(q)) {
    const d = new Date(Date.now() - 6 * 24 * 3600 * 1000);
    return { desde: fechaEc(d), hasta: hoy, label: 'ÚLTIMOS 7 DÍAS' };
  }
  if (/\bmes\b|mensual|del mes/i.test(q)) {
    return { desde: hoy.slice(0, 7) + '-01', hasta: hoy, label: 'MES ACTUAL' };
  }
  return { desde: hoy, hasta: hoy, label: 'HOY' };
};

const detectarEmpresa = (q) => {
  const v = /velsa/i.test(q), n = /novonet/i.test(q);
  if (v && !n) return ['velsa'];
  if (n && !v) return ['novonet'];
  return ['novonet', 'velsa']; // sin especificar → ambas
};

// ── Expresiones SQL por empresa ───────────────────────────────
// Novonet: b_creado_el_fecha es texto con formatos mixtos
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

// ── Consultas genéricas (parametrizadas por empresa) ──────────
async function topPorAsesor(emp, rango, condicion, fechaCol, limit = 10) {
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

// Ventas del día (misma definición que los dashboards)
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
  // Novonet: self-join Jot ↔ CRM (igual que monitoreo-diario)
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
  const seguimiento = Math.max(0, jot - vdia);
  const pctDesc = leads > 0 ? ((descartes / leads) * 100).toFixed(1) : '0.0';
  const pctInst = jot > 0 ? ((activas / jot) * 100).toFixed(1) : '0.0';
  return { leads, ventasCrm, jot, activas, descartes, vdia, seguimiento, pctDesc, pctInst };
}

// ── Formato ───────────────────────────────────────────────────
const lista = (rows, unidad = '') =>
  rows.length
    ? rows.map((r, i) => `${i + 1}. ${r.nombre || 'Sin nombre'} — ${r.cantidad}${unidad}`).join('\n')
    : 'Sin registros en este período.';

const porEmpresas = async (empresas, fn) => {
  const partes = [];
  for (const emp of empresas) partes.push(await fn(emp));
  return partes.join('\n\n');
};

// ── Intenciones ───────────────────────────────────────────────
// El orden importa: la primera que matchee gana.
const INTENCIONES = [
  {
    id: 'top_descartes',
    ejemplos: '¿Quién tiene más descartes hoy? (Novonet / Velsa, hoy/mes)',
    patron: /descart/i,
    run: async (q) => {
      const rango = detectarPeriodo(q), emps = detectarEmpresa(q);
      return porEmpresas(emps, async (emp) => {
        const s = SRC[emp];
        const rows = await topPorAsesor(emp, rango, `UPPER(${s.etapa}) LIKE 'DESCARTE%'`, s.fLead);
        const total = rows.reduce((a, r) => a + r.cantidad, 0);
        return `🗑️ *${s.nombre} — Descartes ${rango.label}* (total visible: ${total})\n\n${lista(rows)}`;
      });
    },
  },
  {
    id: 'venta_seguimiento',
    ejemplos: '¿Cuántas ventas seguimiento hay hoy? (Jot − ventas del día)',
    patron: /seguimiento/i,
    run: async (q) => {
      const rango = detectarPeriodo(q), emps = detectarEmpresa(q);
      return porEmpresas(emps, async (emp) => {
        const s = SRC[emp];
        const [jot, vdia] = await Promise.all([
          totalCon(emp, rango, null, s.fJot),
          ventasDelDia(emp, rango),
        ]);
        return `🔁 *${s.nombre} — Venta Seguimiento ${rango.label}*\n\n` +
          `• Ingresos Jot: ${jot}\n• Ventas del día: ${vdia}\n` +
          `• *Seguimiento (Jot − día): ${Math.max(0, jot - vdia)}*`;
      });
    },
  },
  {
    id: 'ventas_del_dia',
    ejemplos: '¿Cuántas ventas del día tiene Velsa?',
    patron: /ventas? del d(i|í)a/i,
    run: async (q) => {
      const rango = detectarPeriodo(q), emps = detectarEmpresa(q);
      return porEmpresas(emps, async (emp) =>
        `📆 *${SRC[emp].nombre} — Ventas del día ${rango.label}*: ${await ventasDelDia(emp, rango)}`);
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
        const total = await totalCon(emp, rango, s.activo, s.fJot);
        return `✅ *${s.nombre} — Activas ${rango.label}* (total: ${total})\n\n${lista(rows, ' activas')}`;
      });
    },
  },
  {
    id: 'leads',
    ejemplos: '¿Cuántos leads se crearon hoy en Novonet?',
    patron: /lead|prospecto|oportunidad/i,
    run: async (q) => {
      const rango = detectarPeriodo(q), emps = detectarEmpresa(q);
      return porEmpresas(emps, async (emp) => {
        const s = SRC[emp];
        const total = await totalCon(emp, rango, null, s.fLead);
        const rows = await topPorAsesor(emp, rango, null, s.fLead);
        return `📋 *${s.nombre} — Leads creados ${rango.label}*: ${total}\n\nPor responsable:\n${lista(rows)}`;
      });
    },
  },
  {
    id: 'tarjeta',
    ejemplos: '¿Cuántas ventas con tarjeta de crédito hay este mes?',
    patron: /tarjeta/i,
    run: async (q) => {
      const rango = detectarPeriodo(q), emps = detectarEmpresa(q);
      return porEmpresas(emps, async (emp) => {
        const s = SRC[emp];
        const total = await totalCon(emp, rango, s.tarjeta, s.fJot);
        const jot = await totalCon(emp, rango, null, s.fJot);
        const pct = jot > 0 ? ((total / jot) * 100).toFixed(1) : '0.0';
        return `💳 *${s.nombre} — Tarjeta de crédito ${rango.label}*: ${total} de ${jot} ingresos (${pct}%)`;
      });
    },
  },
  {
    id: 'tercera_edad',
    ejemplos: '¿Cuántas ventas de tercera edad hay hoy?',
    patron: /tercera( edad)?|3ra/i,
    run: async (q) => {
      const rango = detectarPeriodo(q), emps = detectarEmpresa(q);
      return porEmpresas(emps, async (emp) => {
        const s = SRC[emp];
        const total = await totalCon(emp, rango, `${s.tercera} AND ${s.activo}`, s.fJot);
        return `👴 *${s.nombre} — Tercera edad (activas) ${rango.label}*: ${total}`;
      });
    },
  },
  {
    id: 'ciudades',
    ejemplos: '¿Cuáles son las ciudades con más ventas hoy?',
    patron: /ciudad|provincia/i,
    run: async (q) => {
      const rango = detectarPeriodo(q);
      const { rows } = await pool.query(`
        SELECT COALESCE(UPPER(TRIM(mb.j_ciudad)), 'SIN DATO') AS nombre, COUNT(*)::int AS cantidad
        FROM public.mestra_bitrix mb
        WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
        GROUP BY 1 ORDER BY cantidad DESC LIMIT 10
      `, [rango.desde, rango.hasta]);
      return `🏙️ *NOVONET — Ciudades con más ingresos ${rango.label}*\n\n${lista(rows)}`;
    },
  },
  {
    id: 'gestion_diaria',
    ejemplos: '¿Cómo va la gestión diaria?',
    patron: /gesti(o|ó)n/i,
    run: async () => {
      const rows = await broadcastSvc.getAsesoresGestionDiaria();
      if (!rows.length) return 'Hoy no hay registros en Gestión Diaria.';
      return `📞 *Gestión Diaria de HOY*\n\n${rows.map((r, i) => `${i + 1}. ${r.nombre || 'Sin nombre'} — ${r.cantidad}`).join('\n')}`;
    },
  },
  {
    id: 'sin_ventas',
    ejemplos: '¿Quiénes no han vendido hoy?',
    patron: /sin venta|no.*(vendido|venta)|quien(es)? falta/i,
    run: async () => {
      const nombres = await broadcastSvc.getAsesoresSinVentas();
      if (!nombres.length) return '🎉 Todos los asesores tienen al menos una venta hoy.';
      return `⚠️ *Asesores SIN ventas hoy (${nombres.length})*\n\n${nombres.map((n, i) => `${i + 1}. ${n}`).join('\n')}`;
    },
  },
  {
    id: 'resumen',
    ejemplos: 'Dame el resumen de Novonet de hoy / resumen del mes de Velsa',
    patron: /resumen|como vamos|cómo vamos|estado general|panorama|indicador/i,
    run: async (q) => {
      const rango = detectarPeriodo(q), emps = detectarEmpresa(q);
      return porEmpresas(emps, async (emp) => {
        const r = await resumenEmpresa(emp, rango);
        return `📊 *${SRC[emp].nombre} — Resumen ${rango.label}*\n\n` +
          `• Leads creados: ${r.leads}\n` +
          `• Ventas CRM (subidas): ${r.ventasCrm}\n` +
          `• Ingresos Jot: ${r.jot}\n` +
          `• Ventas del día: ${r.vdia}\n` +
          `• Venta seguimiento: ${r.seguimiento}\n` +
          `• Activas: ${r.activas} (instalación ${r.pctInst}%)\n` +
          `• Descartes: ${r.descartes} (${r.pctDesc}% de leads)`;
      });
    },
  },
  {
    id: 'top_jot',
    ejemplos: '¿Quién ha ingresado más ventas en Jot hoy?',
    patron: /jot|ingres/i,
    run: async (q) => {
      const rango = detectarPeriodo(q), emps = detectarEmpresa(q);
      return porEmpresas(emps, async (emp) => {
        const s = SRC[emp];
        const rows = await topPorAsesor(emp, rango, null, s.fJot);
        const total = await totalCon(emp, rango, null, s.fJot);
        return `🏆 *${s.nombre} — Top ingresos Jot ${rango.label}* (total: ${total})\n\n${lista(rows, ' ingresos')}`;
      });
    },
  },
  {
    // Genérico al final: "quién tiene más ventas" → ventas CRM subidas
    id: 'top_ventas',
    ejemplos: '¿Quién tiene más ventas hoy? / ¿quién más vendió este mes en Velsa?',
    patron: /(quien|quién|top|mejor|mas|más).*(vend|venta)|venta.*(top|mejor|quien|quién)/i,
    run: async (q) => {
      const rango = detectarPeriodo(q), emps = detectarEmpresa(q);
      return porEmpresas(emps, async (emp) => {
        const s = SRC[emp];
        const rows = await topPorAsesor(emp, rango, `UPPER(${s.etapa}) = 'VENTA SUBIDA'`, s.fLead);
        const total = rows.reduce((a, r) => a + r.cantidad, 0);
        return `🏆 *${s.nombre} — Top VENTAS SUBIDAS ${rango.label}* (total visible: ${total})\n\n${lista(rows, ' ventas')}`;
      });
    },
  },
];

const AYUDA =
  `Puedo responder con datos del ERP (Novonet y Velsa). Di la empresa y el período ` +
  `("hoy", "ayer", "semana", "mes") en tu pregunta. Ejemplos:\n\n` +
  INTENCIONES.map(i => `• ${i.ejemplos}`).join('\n');

// ── Ollama opcional ───────────────────────────────────────────
async function preguntarOllama(pregunta, contexto) {
  const base = process.env.OLLAMA_URL;
  if (!base) return null;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 25000);
    const resp = await fetch(`${base.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || 'llama3.2',
        stream: false,
        prompt:
          `Eres el asistente del ERP. Responde en español, breve y SOLO con base en estos datos ` +
          `(no inventes nada; si no está en los datos, dilo):\n${JSON.stringify(contexto)}\n\nPregunta: ${pregunta}\nRespuesta:`,
      }),
    });
    clearTimeout(t);
    if (!resp.ok) return null;
    const d = await resp.json();
    return d.response?.trim() || null;
  } catch {
    return null;
  }
}

// ── Punto de entrada ──────────────────────────────────────────
async function responder(pregunta) {
  const q = (pregunta || '').trim();
  if (!q) return { intent: 'ayuda', respuesta: AYUDA };

  if (/^(ayuda|help|que puedes|qué puedes|opciones|menu|menú)/i.test(q)) {
    return { intent: 'ayuda', respuesta: AYUDA };
  }

  for (const intent of INTENCIONES) {
    if (intent.patron.test(q)) {
      try {
        const respuesta = await intent.run(q);
        return { intent: intent.id, respuesta };
      } catch (err) {
        console.error(`[Asistente] Error en intención ${intent.id}:`, err.message);
        return { intent: intent.id, respuesta: 'Ocurrió un error consultando los datos. Intenta de nuevo.' };
      }
    }
  }

  // Sin intención → contexto del día + Ollama (si está configurado)
  try {
    const rangoHoy = detectarPeriodo('hoy');
    const [nov, vel] = await Promise.all([
      resumenEmpresa('novonet', rangoHoy),
      resumenEmpresa('velsa', rangoHoy),
    ]);
    const conLLM = await preguntarOllama(q, { novonet: nov, velsa: vel });
    if (conLLM) return { intent: 'ollama', respuesta: conLLM };
  } catch {}

  return { intent: 'desconocido', respuesta: `No entendí la pregunta. ${AYUDA}` };
}

module.exports = { responder, INTENCIONES };
