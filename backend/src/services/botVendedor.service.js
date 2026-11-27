// src/services/botVendedor.service.js
// ============================================================
// BOT VENDEDOR IA — nucleo compartido.
// Lo usan:
//   - routes/botVendedor.routes.js  (modulo del ERP: editar y probar)
//   - scripts/bot-vendedor/bot-vendedor.js (bot de WhatsApp por QR)
//
// Prompt, reglas y conocimiento viven en Postgres (bv_config, bv_conocimiento),
// asi lo que se edita en el ERP lo usa el bot sin reiniciarlo (cache de 60 s).
// IA: Groq (API compatible con OpenAI). Audios: Whisper. Imagenes: modelo de vision.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const estadoComercial = require('./botVendedorEstado.service');

const DIR_BOT = path.join(__dirname, '..', '..', 'scripts', 'bot-vendedor');
const BASE_URL = (process.env.BOT_VENDEDOR_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
const apiKey = () => process.env.BOT_VENDEDOR_API_KEY || process.env.GROQ_API_KEY;
const MODELO = process.env.BOT_MODEL || 'openai/gpt-oss-120b';
const MODELO_RESPALDO = process.env.BOT_MODEL_RESPALDO || 'openai/gpt-oss-20b';
const MODELO_VISION = process.env.BOT_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const TZ = 'America/Guayaquil';
const CACHE_MS = 60 * 1000;

const MSG_ESCALAR = 'Gracias por tu paciencia. Te comunico con un asesor de NETLIFE, en breve te escribe por aqui.';
const MSG_FUERA_HORARIO = 'Gracias por escribirnos. Nuestro equipo atiende de lunes a viernes de 9:00 a 18:00. Un asesor te escribira apenas inicie el horario de atencion.';

// ─── Tablas (idempotente) + datos iniciales ──────────────────────────────────
let listo = null;
function asegurarTablas() {
  if (!listo) {
    listo = (async () => {
      const sql = fs.readFileSync(path.join(__dirname, '../migrations/bot_vendedor.sql'), 'utf8');
      await pool.query(sql);
      await sembrarSiVacio();
    })().catch((e) => { listo = null; throw e; });
  }
  return listo;
}

// La primera vez copia el prompt y el catalogo que vienen en el repo.
// Planes de la Guia Comercial Noviembre 2026. Solo se insertan si la tabla esta vacia;
// el administrador sube la imagen de cada uno desde el modulo.
const PLANES_INICIALES = [
  ['GI Beginner-Defense 200Mbps', 200, 'HOME', '$27,03 con IVA; promo TC $24,32 x 6 facturas. Wifi 5. Promo 900 Mbps x 18 meses.'],
  ['NX Beginner-Defense 900Mbps', 900, 'HOME', '$27,03 con IVA; promo TC $24,32 x 6 facturas. Wifi 6.'],
  ['GI Net-Defense 400Mbps', 400, 'HOME', '$28,18 con IVA; promo TC $25,36 x 6 facturas. Wifi 5. Promo 900 Mbps x 18 meses.'],
  ['NX Net-Defense 1000Mbps', 1000, 'HOME', '$28,18 con IVA; promo TC $25,36 x 6 facturas. Wifi 6.'],
  ['GI Entry-Defense 750Mbps', 750, 'HOME', '$29,61 con IVA; promo TC $19,25 x 3 facturas. Wifi 7* + Mini UPS. Promo 1200 Mbps x 18 meses.'],
  ['NX Entry-Defense 1200Mbps', 1200, 'HOME', '$29,61 con IVA; promo TC $19,25 x 3 facturas. Wifi 7 + Mini UPS.'],
  ['NX Learner-Defense 1350Mbps', 1350, 'HOME', '$32,19 con IVA; promo TC $20,92 x 3 facturas. Wifi 7* + Mini UPS.'],
  ['GI Starter-Defense 850Mbps', 850, 'HOME', '$33,93 con IVA; promo TC $22,05 x 3 facturas. Wifi 7* + Mini UPS. Promo 1300 Mbps x 18 meses.'],
  ['NX Starter-Defense 1500Mbps', 1500, 'HOME', '$34,49 con IVA; promo TC $22,42 x 3 facturas. Wifi 7* + Mini UPS.'],
  ['NX Spirit-Defense 1600Mbps', 1600, 'HOME', '$40,24 con IVA; promo TC $26,16 x 3 facturas. Wifi 7 XGSPON + Mini UPS.'],
  ['GI Jedi-Defense 2000Mbps', 2000, 'HOME', '$114,99 con IVA; promo $57,50 x 12 facturas. Wifi 7* + Mini UPS.'],
  ['GI Beginner-Defense 150Mbps', 150, 'GUAYAQUIL', 'Solo Guayaquil. $25,29 con IVA; promo $22,76. Wifi 5. Promo 600 Mbps x 18 meses.'],
  ['NX Beginner-Defense 600Mbps', 600, 'GUAYAQUIL', 'Solo Guayaquil. $25,29 con IVA; promo $22,76. Wifi 5.'],
  ['Adulto Mayor 100Mbps', 100, 'ADULTO MAYOR', '$18,98 con IVA; con beneficio de ley $9,49. Requiere cedula y planilla de servicio basico.'],
];

async function sembrarSiVacio() {
  const p = await pool.query('SELECT COUNT(*)::int n FROM public.bv_planes');
  if (p.rows[0].n === 0) {
    let orden = 0;
    for (const [nombre, mbps, segmento, descripcion] of PLANES_INICIALES) {
      await pool.query(
        `INSERT INTO public.bv_planes (nombre, velocidad_mbps, segmento, descripcion, orden, actualizado_por)
         VALUES ($1, $2, $3, $4, $5, 'sistema')`, [nombre, mbps, segmento, descripcion, ++orden]);
    }
  }

  const { rows } = await pool.query("SELECT 1 FROM public.bv_config WHERE clave = 'prompt'");
  if (!rows.length) {
    let prompt = '';
    try { prompt = fs.readFileSync(path.join(DIR_BOT, 'prompt.txt'), 'utf8'); } catch (_) {}
    await pool.query(
      `INSERT INTO public.bv_config (clave, valor, actualizado_por) VALUES ('prompt', $1, 'sistema'), ('reglas', '', 'sistema')
       ON CONFLICT (clave) DO NOTHING`, [prompt]);
  }
  const c = await pool.query('SELECT COUNT(*)::int n FROM public.bv_conocimiento');
  if (c.rows[0].n === 0) {
    const dir = path.join(DIR_BOT, 'conocimiento');
    let archivos = [];
    try { archivos = fs.readdirSync(dir).filter((f) => /\.(txt|md)$/i.test(f)); } catch (_) {}
    for (const f of archivos) {
      const contenido = fs.readFileSync(path.join(dir, f), 'utf8');
      await pool.query(
        `INSERT INTO public.bv_conocimiento (nombre, origen, contenido, siempre_incluir, creado_por)
         VALUES ($1, 'archivo', $2, $3, 'sistema')`,
        [f, contenido, /^catalogo/i.test(f)]);
    }
  }
}

// ─── Base de conocimiento (con cache) ────────────────────────────────────────
let cache = null;
let cacheEn = 0;
function invalidarCache() { cache = null; }

const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const palabrasDe = (t) => new Set(normalizar(t).split(/[^a-z0-9]+/).filter((p) => p.length > 2));

function limpiarTexto(t) {
  return String(t || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function interpretarRespuestaModelo(textoCrudo) {
  const original = String(textoCrudo || '');
  const bloque = original.match(/<estado_comercial>([\s\S]*?)<\/estado_comercial>/i);
  let estado = {};
  if (bloque) {
    try {
      const valor = JSON.parse(bloque[1]);
      if (valor && typeof valor === 'object' && !Array.isArray(valor)) estado = valor;
    } catch (_) {}
  }
  const imagenesRaw = [...new Set([...original.matchAll(/\[IMG:(\d+)\]/g)].map((m) => Number(m[1])))].slice(0, 2);
  const ventaCerrada = /\[VENTA_CERRADA\]/.test(original);
  const texto = original
    .replace(/<estado_comercial>[\s\S]*?<\/estado_comercial>/gi, '')
    .replace(/\[IMG:\d+\]/g, '')
    .replace(/\[VENTA_CERRADA\]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  return { texto, estado, imagenesRaw, ventaCerrada };
}

async function cargarBase() {
  if (cache && Date.now() - cacheEn < CACHE_MS) return cache;
  await asegurarTablas();
  const cfg = await pool.query("SELECT clave, valor FROM public.bv_config WHERE clave IN ('prompt','reglas')");
  const valores = Object.fromEntries(cfg.rows.map((r) => [r.clave, r.valor]));
  const docs = await pool.query(
    'SELECT id, nombre, contenido, siempre_incluir FROM public.bv_conocimiento WHERE activo = TRUE ORDER BY id');
  const siempre = [];
  const fragmentos = [];
  for (const d of docs.rows) {
    const texto = limpiarTexto(d.contenido);
    if (!texto) continue;
    if (d.siempre_incluir) { siempre.push(`[${d.nombre}]\n${texto}`); continue; }
    const TAM = 1200;
    const SOLAPE = 200;
    for (let i = 0; i < texto.length; i += TAM - SOLAPE) {
      const pedazo = texto.slice(i, i + TAM);
      if (pedazo.trim().length < 40) continue;
      fragmentos.push({ fuente: d.nombre, texto: pedazo, palabras: palabrasDe(pedazo) });
    }
  }
  const planes = await pool.query(
    `SELECT id, nombre, velocidad_mbps, segmento FROM public.bv_planes
      WHERE activo = TRUE AND imagen IS NOT NULL ORDER BY orden, id`);
  cache = { prompt: valores.prompt || '', reglas: valores.reglas || '', siempre, fragmentos, planesConImagen: planes.rows };
  cacheEn = Date.now();
  return cache;
}

function buscar(fragmentos, consulta, max) {
  const q = palabrasDe(consulta);
  return fragmentos
    .map((f) => { let n = 0; for (const p of q) if (f.palabras.has(p)) n++; return { f, n }; })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((x) => `[${x.f.fuente}]\n${x.f.texto}`);
}

// ─── Groq ────────────────────────────────────────────────────────────────────
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// Proveedores de IA en orden. Si uno responde 429 (limite por minuto del plan gratis)
// se pasa AL INSTANTE al siguiente, sin esperar. Gemini se suma si hay GEMINI_API_KEY.
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const MODELO_GEMINI = process.env.BOT_GEMINI_MODEL || 'gemini-3.8-flash';
function proveedores() {
  const lista = [
    { url: BASE_URL, key: apiKey(), modelo: MODELO },
    { url: BASE_URL, key: apiKey(), modelo: MODELO_RESPALDO },
  ];
  if (process.env.GEMINI_API_KEY) lista.push({ url: GEMINI_URL, key: process.env.GEMINI_API_KEY, modelo: MODELO_GEMINI });
  return lista.filter((p) => p.key);
}

async function llamarModelo(messages, prov) {
  const cuerpo = { model: prov.modelo, messages, temperature: 0.75, max_tokens: 400 };
  if (/gpt-oss|gemini/.test(prov.modelo)) cuerpo.reasoning_effort = 'low';
  const resp = await fetch(`${prov.url}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${prov.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(45000),
  });
  if (!resp.ok) {
    const err = new Error(`IA ${prov.modelo} ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    err.status = resp.status;
    throw err;
  }
  const data = await resp.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

// Recorre los proveedores; si TODOS estan en limite, espera lo minimo que pidan y reintenta (max 3 vueltas).
// Llamada corta para clasificar (bot ATC): usa Gemini Flash-Lite primero para no gastar el cupo
// de Groq del bot vendedor; si Gemini no esta o falla, usa la cadena normal.
const MODELO_CLASIFICADOR = process.env.BOT_ATC_MODEL || 'gemini-3.1-flash-lite';
async function llamarClasificador(messages) {
  if (process.env.GEMINI_API_KEY) {
    try {
      const cuerpo = { model: MODELO_CLASIFICADOR, messages, temperature: 0, max_tokens: 200, reasoning_effort: 'low' };
      const resp = await fetch(`${GEMINI_URL}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.GEMINI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(20000),
      });
      if (resp.ok) {
        const data = await resp.json();
        const texto = (data.choices?.[0]?.message?.content || '').trim();
        if (texto) return { texto, modelo: MODELO_CLASIFICADOR };
      } else {
        console.warn(`[BOT-ATC] clasificador ${MODELO_CLASIFICADOR} ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
      }
    } catch (e) { console.warn(`[BOT-ATC] clasificador ${MODELO_CLASIFICADOR}:`, e.message); }
  }
  return llamarConRespaldo(messages);
}

async function llamarConRespaldo(messages) {
  const lista = proveedores();
  if (!lista.length) throw new Error('Falta GROQ_API_KEY (o GEMINI_API_KEY) en el entorno');
  let ultimo;
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    let espera = 0;
    for (const prov of lista) {
      try {
        const texto = await llamarModelo(messages, prov);
        if (texto) return { texto, modelo: prov.modelo };
      } catch (e) {
        ultimo = e;
        const seg = Number((e.message.match(/try again in ([\d.]+)s/) || [])[1] || (e.status === 429 ? 8 : 0));
        if (seg) espera = espera ? Math.min(espera, seg) : seg;
      }
    }
    if (!espera) break; // errores que no son de limite: no sirve esperar
    await esperar(Math.min(20, Math.ceil(espera)) * 1000 + 300);
  }
  throw ultimo || new Error('La IA no respondio');
}

// Minutos desde medianoche en hora de Ecuador.
function minutosEcuador(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(fecha);
  const [h, m] = partes.split(':').map(Number);
  return (h % 24) * 60 + m;
}
const aMinutos = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
// ¿La fecha cae dentro del horario? Sin horario = siempre. Si inicio > fin, cruza medianoche.
function enHorario(inicio, fin, fecha = new Date()) {
  const i = aMinutos(inicio);
  const f = aMinutos(fin);
  if (i === null || f === null || i === f) return true;
  const ahora = minutosEcuador(fecha);
  return i < f ? (ahora >= i && ahora < f) : (ahora >= i || ahora < f);
}

function horarioLaboral(fecha = new Date()) {
  const dia = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(fecha);
  return !['Sat', 'Sun'].includes(dia) && enHorario('09:00', '18:00', fecha);
}

function fechaHoraActual() {
  return new Intl.DateTimeFormat('es-EC', {
    timeZone: TZ, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
}

/**
 * historial: [{ role: 'user'|'assistant', content }] (el ultimo debe ser del cliente).
 * Devuelve { texto, accion: null|'ESCALAR'|'FUERA_HORARIO', modelo, ms }.
 */
const HISTORIAL_MAX = Math.max(4, Number(process.env.BOT_HISTORIAL || 6));

const ESTILOS_APERTURA = [
  'saludo calido y breve, y pregunta si el internet es para casa o negocio',
  'saludo energico mencionando la fibra optica de Netlife, y pregunta en que sector vive',
  'saludo cercano ofreciendo ayudarle a elegir el plan ideal, y pregunta cuantas personas lo usarian',
  'saludo profesional y directo, y pregunta si ya tiene internet o seria su primera instalacion',
  'saludo amable agradeciendo que escribio, y pregunta para que usa mas el internet (trabajo, estudios, series, juegos)',
  'saludo simpatico y corto, y pregunta que le gustaria mejorar de su internet actual',
];

async function responder(historial, opciones = {}) {
  if (!apiKey()) throw new Error('Falta GROQ_API_KEY en el entorno');
  const inicio = Date.now();
  const base = await cargarBase();
  const hist = (historial || []).slice(-HISTORIAL_MAX).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 2000),
  }));

  const delCliente = hist.filter((m) => m.role === 'user');
  let consulta = delCliente.slice(-3).map((m) => m.content).join(' ');
  // Ahorro de tokens: el catalogo (docs "siempre") solo va cuando se habla de planes/precios
  // o la conversacion ya avanzo; al saludar no hace falta.
  const hablaDePrecios = /precio|cuest|cuanto|valor|plan|recomi|mbps|megas|velocidad|promo|pag|tarifa|instal|ofert|contrat|requisit|cobertura/i.test(normalizar(consulta));
  const conCatalogo = hablaDePrecios || delCliente.length >= 3;
  if (conCatalogo) consulta += ' precio final con iva sin iva promo facturas mbps defense forma de pago tarjeta instalacion';
  const fragmentos = delCliente.length >= 2 || hablaDePrecios ? buscar(base.fragmentos, consulta, base.siempre.length ? 1 : 3) : [];
  const contexto = [...(conCatalogo ? base.siempre : []), ...fragmentos].join('\n\n---\n\n');

  const messages = [
    { role: 'system', content: base.prompt },
    { role: 'system', content: `FECHA Y HORA ACTUAL (Ecuador): ${fechaHoraActual()}. Haz UNA sola pregunta por mensaje y responde en maximo 4 lineas, salvo cuando presentes la recomendacion o el resumen final.` },
  ];
  if (opciones.estado) {
    const estado = estadoComercial.normalizarEstado(opciones.estado);
    const paso = estadoComercial.calcularPaso(estado);
    messages.push({
      role: 'system',
      content: `ESTADO COMERCIAL CONFIRMADO (no vuelvas a preguntar estos datos):\n${JSON.stringify(estado)}\nSIGUIENTE PASO PENDIENTE: ${paso}. Responde primero cualquier pregunta directa del cliente y despues haz como maximo una pregunta sobre el siguiente dato faltante.`,
    });
  }
  messages.push({
    role: 'system',
    content: 'MEMORIA INTERNA: al final de cada respuesta agrega <estado_comercial>{"campo":"valor"}</estado_comercial> con SOLO los datos comerciales nuevos confirmados por el cliente en este turno. Campos permitidos: motivo, segmento, ciudad, sector, personas, usos, plan, forma_pago, documentos, direccion, cierre_confirmado, escalado. Usa {} si no hay datos nuevos. Este bloque es interno y no se muestra al cliente.',
  });
  if (base.reglas.trim()) messages.push({ role: 'system', content: `REGLAS ADICIONALES DEL NEGOCIO (obligatorias):\n${base.reglas.trim()}` });
  messages.push({
    role: 'system',
    content: `BASE DE CONOCIMIENTO (usa solo esto para precios, planes y condiciones. Si el cliente no dice su forma de pago, muestra el precio promo con tarjeta de credito y aclara que con cuenta bancaria la promo cambia):\n\n${contexto || '(no se cargo el catalogo en este mensaje; si el cliente pide precios o planes, preguntale que necesita y en el siguiente mensaje tendras el catalogo. No inventes precios)'}`,
  });
  // Primer mensaje del bot en el chat: un estilo de apertura al azar para que la
  // presentacion no sea siempre igual (el prompt pide no repetir saludos).
  if (!hist.some((m) => m.role === 'assistant')) {
    const estilo = ESTILOS_APERTURA[Math.floor(Math.random() * ESTILOS_APERTURA.length)];
    messages.push({ role: 'system', content: `ESTILO DE APERTURA PARA ESTE CLIENTE (redactalo con tus palabras, sin copiar): ${estilo}` });
  }
  messages.push({
    role: 'system',
    content: 'CIERRE: cuando el cliente confirme que el resumen final de su solicitud esta correcto (acepta contratar el plan), escribe al FINAL de tu mensaje la etiqueta [VENTA_CERRADA]. Usala una sola vez y solo con esa confirmacion. No la menciones en el texto.',
  });
  if (base.planesConImagen.length) {
    const lista = base.planesConImagen.map((p) => `[IMG:${p.id}] ${p.nombre} (${p.velocidad_mbps} Mbps, ${p.segmento})`).join('\n');
    messages.push({
      role: 'system',
      content: `IMAGENES DE PLANES: cuando recomiendes un plan o el cliente pregunte por uno de esta lista, escribe al FINAL de tu mensaje su etiqueta exacta (maximo 2 etiquetas por mensaje) y se le enviara la imagen con sus caracteristicas. No envies la misma imagen dos veces en la conversacion. No menciones las etiquetas en el texto.\n${lista}`,
    });
  }
  messages.push(...hist);

  const { texto, modelo } = await llamarConRespaldo(messages);
  const interpretada = interpretarRespuestaModelo(texto);
  // Etiquetas [IMG:id] -> imagenes a enviar (solo ids validos), y se quitan del texto.
  const validos = new Set(base.planesConImagen.map((p) => p.id));
  const imagenes = interpretada.imagenesRaw.filter((id) => validos.has(id));
  const ventaCerrada = interpretada.ventaCerrada;
  let salida = interpretada.texto;
  let accion = null;
  // La IA solo decide SI pasa a un asesor; el horario lo decide el codigo (lun-vie 9:00-18:00 Ecuador).
  if (/ESCALAR_ASESOR|FUERA_DE_HORARIO/.test(salida)) {
    if (horarioLaboral()) { accion = 'ESCALAR'; salida = MSG_ESCALAR; }
    else { accion = 'FUERA_HORARIO'; salida = MSG_FUERA_HORARIO; }
  }
  if (!salida) salida = 'Disculpa, no te entendi bien. ¿Me lo puedes repetir?';
  return { texto: salida, accion, imagenes: accion ? [] : imagenes, ventaCerrada: !accion && ventaCerrada, estadoCambios: interpretada.estado, modelo, ms: Date.now() - inicio };
}

// ─── Etapa recomendada ───────────────────────────────────────────────────────
// Etapas del pipeline NOVONET (53 en total) que tienen sentido para una conversacion de WhatsApp.
const ETAPAS_RECOMENDABLES = [
  ['CONTACTO NUEVO', 'El cliente no respondio o la conversacion no avanzo.'],
  ['VOLVER A LLAMAR NO CONTESTA', 'Respondio poco y dejo de contestar; hay que volver a contactarlo.'],
  ['SEGUIMIENTO NEGOCIACION', 'Mostro interes y pregunto por planes/precios, pero no decidio.'],
  ['PENDIENTE CIERRE', 'Eligio un plan o esta por decidir; falta cerrar.'],
  ['ENVIO REQUISITOS/DOCUMENTOS PENDIENTES', 'Acepto contratar y faltan cedula, planilla u otros datos.'],
  ['CLIENTE CON ACUERDO', 'Confirmo la venta con todos los datos; listo para subir.'],
  ['FUERA DE COBERTURA', 'La direccion no tiene cobertura.'],
  ['NO INTERESA COSTO PLAN', 'El precio del plan le parecio caro.'],
  ['NO INTERESA COSTO INSTALACIÓN', 'No acepta el valor de instalacion.'],
  ['MANTIENE PROVEEDOR', 'Se queda con su proveedor actual.'],
  ['DESISTE DE COMPRA', 'Dijo que ya no quiere el servicio.'],
  ['NO VOLVER A CONTACTAR', 'Pidio no ser contactado.'],
  ['ATC/SOPORTE', 'Ya es cliente y escribio por soporte o servicio al cliente.'],
  ['CLIENTE DISCAPACIDAD', 'Califica al plan de discapacidad.'],
  ['DUPLICADO', 'Ya esta siendo atendido por otro deal o asesor.'],
];

/** Lee la conversacion y recomienda a que etapa de Bitrix moverla. Devuelve { etapa, motivo, modelo }. */
async function recomendarEtapa(mensajes) {
  if (!apiKey()) throw new Error('Falta GROQ_API_KEY en el entorno');
  const transcripcion = mensajes
    .map((m) => `${m.quien}: ${String(m.texto || '').replace(/\s+/g, ' ').slice(0, 400)}`)
    .join('\n').slice(-6000);
  const lista = ETAPAS_RECOMENDABLES.map(([e, d]) => `- ${e}: ${d}`).join('\n');
  const { texto, modelo } = await llamarConRespaldo([
    { role: 'system', content: `Eres supervisor comercial de NETLIFE. Lee la conversacion de WhatsApp y elige UNA etapa de Bitrix a la que deberia pasar la negociacion. Responde SOLO un JSON: {"etapa": "<nombre exacto de la lista>", "motivo": "<una frase corta en espanol>"}.\nETAPAS:\n${lista}` },
    { role: 'user', content: transcripcion || '(sin mensajes)' },
  ]);
  let etapa = 'SEGUIMIENTO NEGOCIACION';
  let motivo = '';
  try {
    const j = JSON.parse((String(texto).match(/\{[\s\S]*\}/) || ['{}'])[0]);
    const valida = ETAPAS_RECOMENDABLES.find(([e]) => normalizar(e) === normalizar(j.etapa || ''));
    if (valida) etapa = valida[0];
    motivo = String(j.motivo || '').slice(0, 300);
  } catch (_) {
    motivo = 'No se pudo interpretar la respuesta de la IA.';
  }
  return { etapa, motivo, modelo };
}

// Ultimo error de la IA (para mostrarlo en el modulo; WABOT corre en otro proceso).
async function registrarErrorIA(mensaje) {
  try {
    await pool.query(
      `INSERT INTO public.bv_config (clave, valor, actualizado_por, actualizado_en) VALUES ('ia_ultimo_error', $1, 'wabot', NOW())
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_por = 'wabot', actualizado_en = NOW()`,
      [String(mensaje).slice(0, 500)]);
  } catch (_) {}
}

// Imagen de un plan (cache en memoria para no leer la BD en cada envio).
const cacheImagenes = new Map(); // id -> { buffer, mime, nombre, en }
async function imagenPlan(id) {
  const c = cacheImagenes.get(id);
  if (c && Date.now() - c.en < 10 * 60 * 1000) return c;
  const { rows } = await pool.query('SELECT nombre, imagen, imagen_mime FROM public.bv_planes WHERE id = $1 AND imagen IS NOT NULL', [id]);
  if (!rows.length) return null;
  const v = { buffer: rows[0].imagen, mime: rows[0].imagen_mime || 'image/jpeg', nombre: rows[0].nombre, en: Date.now() };
  cacheImagenes.set(id, v);
  return v;
}
function invalidarImagen(id) { cacheImagenes.delete(Number(id)); invalidarCache(); }

// ─── Audios, imagenes y archivos ─────────────────────────────────────────────
async function transcribirAudio(buffer, mimetype = 'audio/ogg') {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimetype }), 'audio.ogg');
  form.append('model', 'whisper-large-v3');
  form.append('language', 'es');
  const resp = await fetch(`${BASE_URL}/audio/transcriptions`, {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey()}` }, body: form,
  });
  if (!resp.ok) throw new Error(`Whisper ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  return ((await resp.json()).text || '').trim();
}

async function describirImagen(buffer, mimetype = 'image/jpeg', caption = '') {
  const resp = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO_VISION,
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Describe en espanol, breve y objetivamente, lo que muestra esta imagen (texto visible, documentos, pantallas, equipos, errores). No inventes.' + (caption ? ` El cliente escribio: "${caption}"` : '') },
          { type: 'image_url', image_url: { url: `data:${mimetype};base64,${buffer.toString('base64')}` } },
        ],
      }],
    }),
  });
  if (!resp.ok) throw new Error(`Vision ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  return ((await resp.json()).choices?.[0]?.message?.content || '').trim();
}

// Texto de un archivo subido al modulo (PDF, TXT, MD, CSV).
async function extraerTexto(buffer, nombre) {
  if (/\.pdf$/i.test(nombre)) {
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    return limpiarTexto((await pdfParse(buffer)).text);
  }
  return limpiarTexto(buffer.toString('utf8'));
}

module.exports = {
  asegurarTablas, cargarBase, invalidarCache, responder, imagenPlan, invalidarImagen, enHorario, aMinutos,
  recomendarEtapa, registrarErrorIA, ETAPAS_RECOMENDABLES, horarioLaboral,
  _llamarConRespaldo: llamarConRespaldo, // para pruebas
  llamarClasificador,
  transcribirAudio, describirImagen, extraerTexto,
  interpretarRespuestaModelo,
  MODELO, MODELO_RESPALDO, MSG_ESCALAR,
};
