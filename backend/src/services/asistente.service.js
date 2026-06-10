/**
 * Asistente ERP — responde preguntas en lenguaje natural SOLO con datos del ERP.
 *
 * Funciona con un motor de intenciones (keywords → SQL) que es determinista,
 * rápido y gratis. Si defines OLLAMA_URL (ej: http://tu-servidor:11434),
 * las preguntas que no matcheen ninguna intención se redactan con el LLM
 * usando ÚNICAMENTE los datos del resumen del día como contexto.
 */
const pool = require('../config/db');
const broadcastSvc = require('./broadcast.service');

const getFechaEcuador = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

// ── Helpers de formato ────────────────────────────────────────
const fmtLista = (rows, campoNombre, campoValor, unidad = '') =>
  rows.map((r, i) => `${i + 1}. ${r[campoNombre] || 'Sin nombre'} — ${r[campoValor]}${unidad}`).join('\n');

// ── Consultas adicionales ─────────────────────────────────────
async function leadsHoy() {
  const hoy = getFechaEcuador();
  const { rows } = await pool.query(`
    SELECT COUNT(*)::int AS total
    FROM public.mestra_bitrix
    WHERE b_creado_el_fecha::date = $1::date
  `, [hoy]);
  const { rows: porAsesor } = await pool.query(`
    SELECT b_persona_responsable AS nombre, COUNT(*)::int AS cantidad
    FROM public.mestra_bitrix
    WHERE b_creado_el_fecha::date = $1::date
    GROUP BY b_persona_responsable
    ORDER BY cantidad DESC
    LIMIT 10
  `, [hoy]);
  return { total: rows[0]?.total ?? 0, porAsesor };
}

async function ventasNovonetHoy() {
  const hoy = getFechaEcuador();
  const { rows } = await pool.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE UPPER(TRIM(estatus_netlife)) = 'ACTIVO')::int AS activas
    FROM vista_analisis_novonet
    WHERE created_at::date = $1::date
  `, [hoy]);
  return rows[0] || { total: 0, activas: 0 };
}

async function ventasVelsaHoy() {
  const hoy = getFechaEcuador();
  const { rows } = await pool.query(`
    SELECT COUNT(*)::int AS total
    FROM vw_jotform_velsa_netlife_completo
    WHERE created_at::date = $1::date
  `, [hoy]);
  return rows[0] || { total: 0 };
}

// ── Registro de intenciones ───────────────────────────────────
// Cada intención: patrones (regex) + ejecución que devuelve texto.
const INTENCIONES = [
  {
    id: 'top_ventas_hoy',
    ejemplos: '¿Quién ha hecho más ventas hoy?',
    patron: /(quien|quién|top|mejor|mas|más).*(venta|ingres)|venta.*(hoy|dia|día).*(top|mejor|quien|quién)/i,
    run: async () => {
      const rows = await broadcastSvc.getTopAsesores(10);
      if (!rows.length) return 'Hoy todavía no hay ingresos registrados.';
      return `🏆 *Top asesores por ingresos de HOY (${getFechaEcuador()})*\n\n${fmtLista(rows, 'nombre', 'ingresos', ' ingresos')}`;
    },
  },
  {
    id: 'leads_hoy',
    ejemplos: '¿Cuántos leads se crearon hoy?',
    patron: /lead|prospecto|oportunidad/i,
    run: async () => {
      const { total, porAsesor } = await leadsHoy();
      let txt = `📋 *Leads creados HOY (${getFechaEcuador()})*: ${total}`;
      if (porAsesor.length) txt += `\n\nPor responsable:\n${fmtLista(porAsesor, 'nombre', 'cantidad')}`;
      return txt;
    },
  },
  {
    id: 'resumen_dia',
    ejemplos: 'Dame el resumen del día',
    patron: /resumen|como vamos|cómo vamos|estado general|panorama/i,
    run: async () => {
      const r = await broadcastSvc.getResumenDia();
      return `📊 *Resumen de HOY (${getFechaEcuador()})*\n\n` +
        `• Ingresos: ${r.ingresos_hoy ?? 0}\n` +
        `• Activas: ${r.activas_hoy ?? 0}\n` +
        `• Gestión diaria: ${r.gestion_diaria ?? 0}`;
    },
  },
  {
    id: 'sin_ventas_hoy',
    ejemplos: '¿Quiénes no han vendido hoy?',
    patron: /sin venta|no.*(vendido|venta)|quien(es)? falta/i,
    run: async () => {
      const nombres = await broadcastSvc.getAsesoresSinVentas();
      if (!nombres.length) return '🎉 Todos los asesores tienen al menos una venta hoy.';
      return `⚠️ *Asesores SIN ventas hoy (${nombres.length})*\n\n${nombres.map((n, i) => `${i + 1}. ${n}`).join('\n')}`;
    },
  },
  {
    id: 'top_activas_mes',
    ejemplos: '¿Quién tiene más activas este mes?',
    patron: /activa/i,
    run: async () => {
      const rows = await broadcastSvc.getTopActivas(10);
      if (!rows.length) return 'Aún no hay ventas activas este mes.';
      return `✅ *Top asesores por ACTIVAS del mes*\n\n${fmtLista(rows, 'nombre', 'activas', ' activas')}`;
    },
  },
  {
    id: 'gestion_diaria',
    ejemplos: '¿Cómo va la gestión diaria?',
    patron: /gesti(o|ó)n/i,
    run: async () => {
      const rows = await broadcastSvc.getAsesoresGestionDiaria();
      if (!rows.length) return 'Hoy no hay registros en Gestión Diaria.';
      return `📞 *Gestión Diaria de HOY*\n\n${fmtLista(rows, 'nombre', 'cantidad')}`;
    },
  },
  {
    id: 'ventas_novonet_hoy',
    ejemplos: '¿Cuántas ventas tiene Novonet hoy?',
    patron: /novonet/i,
    run: async () => {
      const r = await ventasNovonetHoy();
      return `📡 *NOVONET hoy (${getFechaEcuador()})*\n\n• Ventas: ${r.total}\n• Activas: ${r.activas}`;
    },
  },
  {
    id: 'ventas_velsa_hoy',
    ejemplos: '¿Cuántas ventas tiene Velsa hoy?',
    patron: /velsa/i,
    run: async () => {
      const r = await ventasVelsaHoy();
      return `🟣 *VELSA hoy (${getFechaEcuador()})*\n\n• Ventas: ${r.total}`;
    },
  },
];

const AYUDA =
  `Puedo responder con datos del ERP. Prueba con:\n\n` +
  INTENCIONES.map(i => `• ${i.ejemplos}`).join('\n');

// ── Ollama opcional (para redactar cuando no hay intención) ───
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
          `Eres el asistente del ERP. Responde en español, breve y SOLO con base en estos datos del día ` +
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
        const respuesta = await intent.run();
        return { intent: intent.id, respuesta };
      } catch (err) {
        console.error(`[Asistente] Error en intención ${intent.id}:`, err.message);
        return { intent: intent.id, respuesta: 'Ocurrió un error consultando los datos. Intenta de nuevo.' };
      }
    }
  }

  // Sin intención → intentar Ollama con el resumen del día como contexto
  try {
    const contexto = await broadcastSvc.getResumenDia();
    const conLLM = await preguntarOllama(q, contexto);
    if (conLLM) return { intent: 'ollama', respuesta: conLLM };
  } catch {}

  return { intent: 'desconocido', respuesta: `No entendí la pregunta. ${AYUDA}` };
}

module.exports = { responder, INTENCIONES };
