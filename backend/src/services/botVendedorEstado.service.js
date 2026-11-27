'use strict';

const CAMPOS_TEXTO = ['motivo', 'segmento', 'ciudad', 'sector', 'plan', 'forma_pago', 'direccion'];
const CAMPOS_LISTA = ['usos', 'documentos'];

function texto(valor, max = 500) {
  if (typeof valor !== 'string') return null;
  const limpio = valor.replace(/\s+/g, ' ').trim();
  return limpio ? limpio.slice(0, max) : null;
}

function lista(valor) {
  if (!Array.isArray(valor)) return [];
  const unicos = [];
  for (const item of valor) {
    const limpio = texto(String(item || ''), 100);
    if (limpio && !unicos.some((v) => v.toLowerCase() === limpio.toLowerCase())) unicos.push(limpio);
    if (unicos.length >= 12) break;
  }
  return unicos;
}

function normalizarEstado(input = {}) {
  const salida = {
    version: 1,
    motivo: null,
    segmento: null,
    ciudad: null,
    sector: null,
    personas: null,
    usos: [],
    plan: null,
    forma_pago: null,
    documentos: [],
    direccion: null,
    cierre_confirmado: false,
    escalado: false,
  };
  for (const campo of CAMPOS_TEXTO) salida[campo] = texto(input[campo]);
  const personas = Number(input.personas);
  salida.personas = Number.isInteger(personas) && personas > 0 && personas <= 100 ? personas : null;
  for (const campo of CAMPOS_LISTA) salida[campo] = lista(input[campo]);
  salida.cierre_confirmado = input.cierre_confirmado === true;
  salida.escalado = input.escalado === true;
  return salida;
}

function fusionarEstado(actual = {}, cambios = {}) {
  const base = normalizarEstado(actual);
  const nuevos = normalizarEstado(cambios);
  for (const campo of CAMPOS_TEXTO) if (nuevos[campo]) base[campo] = nuevos[campo];
  if (nuevos.personas) base.personas = nuevos.personas;
  for (const campo of CAMPOS_LISTA) if (nuevos[campo].length) base[campo] = lista([...base[campo], ...nuevos[campo]]);
  if (cambios.cierre_confirmado === true) base.cierre_confirmado = true;
  if (cambios.escalado === true) base.escalado = true;
  return base;
}

function calcularPaso(e = {}) {
  const s = normalizarEstado(e);
  if (!s.motivo) return 'motivo';
  if (!s.segmento) return 'segmento';
  if (!s.ciudad || !s.sector) return 'ubicacion';
  if (!s.personas || !s.usos.length) return 'uso';
  if (!s.plan) return 'recomendacion';
  if (!s.forma_pago) return 'forma_pago';
  if (!s.documentos.length) return 'documentos';
  if (!s.direccion) return 'direccion';
  if (!s.cierre_confirmado) return 'confirmacion';
  return 'cerrado';
}

function calcularAvance(e = {}) {
  const s = normalizarEstado(e);
  const hitos = [s.motivo, s.segmento, s.ciudad && s.sector, s.personas && s.usos.length, s.plan, s.forma_pago, s.documentos.length, s.direccion, s.cierre_confirmado];
  return Math.round((hitos.filter(Boolean).length / hitos.length) * 100);
}

async function leerEstado(pool, conversationId) {
  const { rows } = await pool.query('SELECT estado FROM public.bv_conversation_state WHERE conversation_id = $1', [conversationId]);
  return normalizarEstado(rows[0]?.estado || {});
}

async function guardarEstado(pool, conversationId, cambios) {
  const actual = await leerEstado(pool, conversationId);
  const estado = fusionarEstado(actual, cambios);
  const paso = calcularPaso(estado);
  const avance = calcularAvance(estado);
  await pool.query(
    `INSERT INTO public.bv_conversation_state (conversation_id, estado, paso_actual, avance, actualizado_en)
     VALUES ($1, $2::jsonb, $3, $4, NOW())
     ON CONFLICT (conversation_id) DO UPDATE SET estado = EXCLUDED.estado, paso_actual = EXCLUDED.paso_actual,
       avance = EXCLUDED.avance, actualizado_en = NOW()`,
    [conversationId, JSON.stringify(estado), paso, avance]);
  return { estado, paso, avance };
}

function aplicarMetricas(filas = []) {
  return filas.map((fila) => ({
    ...fila,
    paso_actual: texto(fila.paso_actual, 40) || 'motivo',
    avance: Math.max(0, Math.min(100, Number(fila.avance) || 0)),
    reintentos: Math.max(0, Number(fila.reintentos) || 0),
    mensajes_agrupados: Math.max(0, Number(fila.mensajes_agrupados) || 0),
    estado_actualizado_en: fila.estado_actualizado_en || null,
  }));
}

module.exports = { normalizarEstado, fusionarEstado, calcularPaso, calcularAvance, leerEstado, guardarEstado, aplicarMetricas };
