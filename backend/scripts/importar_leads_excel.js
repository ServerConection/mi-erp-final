/**
 * IMPORTADOR MASIVO DE LEADS DESDE EXCEL/CSV DE BITRIX24
 * ─────────────────────────────────────────────────────────────────────
 * Uso (desde la carpeta backend/):
 *   node scripts/importar_leads_excel.js "C:\ruta\a\tu\archivo.csv" novonet
 *
 * Args:
 *   1) Ruta al CSV exportado de Bitrix (delimitado por ";", con comillas)
 *   2) empresa: "novonet" o "velsa" (default: novonet)
 *
 * Qué hace:
 *   - Lee el CSV y por cada fila hace UPSERT en bitrix_webhook_leads,
 *     usando (empresa, bitrix_id) como llave — igual que el webhook.
 *   - Si el lead YA existe (llegó antes por webhook o por una carga previa),
 *     actualiza todos sus campos pero CONSERVA created_at original.
 *   - Si el lead es NUEVO, usa la fecha "Creado" del Excel como created_at
 *     (no la fecha de hoy), para no perder la fecha real de creación.
 *   - "Modificado" del Excel se usa como updated_at.
 *   - También registra 1 fila en bitrix_webhook_leads_historial por cada
 *     lead, marcada con event='import_masivo', para dejar rastro de la carga.
 *
 * Requisitos: el CSV debe tener estas columnas con el nombre EXACTO del
 * header de Bitrix: ID, Pipeline, Negociación repetida, Etapa, Responsable,
 * Origen, Creado, Creado por, Modificado, Modificado por, Comentario,
 * Fecha de inicio, UTM Source, UTM Medium, UTM Campaign, UTM Content,
 * UTM Term, Otro proveedor, Razon Descarte, Innegociable, Ciudad,
 * Volver a llamar, Fecha Concretar, Documentos Pendientes,
 * Fecha Venta Subida, MOTIVO ATC, ID_CONVERSACION, Contacto: Móvil
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');

const CSV_PATH = process.argv[2];
const EMPRESA = (process.argv[3] || 'novonet').toLowerCase();

if (!CSV_PATH) {
  console.error('Uso: node scripts/importar_leads_excel.js "<ruta_al_csv>" [novonet|velsa]');
  process.exit(1);
}
if (!fs.existsSync(CSV_PATH)) {
  console.error('No se encontró el archivo:', CSV_PATH);
  process.exit(1);
}

// ── Parser CSV: delimitador ";", campos entre comillas dobles, comillas escapadas como "" ──
function parseCsv(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let dentroComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else dentroComillas = false;
      } else campo += c;
    } else if (c === '"') {
      dentroComillas = true;
    } else if (c === ';') {
      fila.push(campo); campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.length > 1 || fila[0] !== '') filas.push(fila);
      fila = [];
    } else {
      campo += c;
    }
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

// Igual al slugify del webhook — así la etapa importada coincide con el catálogo
const slugify = (valor = '') =>
  String(valor)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase()
    .replace(/[/]+/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

// "DD/MM/YYYY HH:MM:SS" (hora Ecuador, tal como la exporta Bitrix) -> texto que
// Postgres interpreta y convierte con AT TIME ZONE 'America/Guayaquil'
function fechaEcuadorSQL(valor) {
  if (!valor) return null;
  const m = String(valor).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh = '00', mi = '00', ss = '00'] = m;
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

// Nombres de columna del CSV que difieren entre empresas (Novonet vs Velsa usan
// campos personalizados distintos en Bitrix). Si un campo no existe para esa
// empresa, se deja en `null` y el dato queda en blanco (igual que hace el webhook).
const HEADERS_POR_EMPRESA = {
  novonet: {
    city: 'Ciudad',
    fechaVentaSubida: 'Fecha Venta Subida',
    fechaConcretar: 'Fecha Concretar',
    otroProveedor: 'Otro proveedor',
    innegociable: 'Innegociable',
    volverALlamar: 'Volver a llamar',
    documentosPendientes: 'Documentos Pendientes',
    motivoAtc: 'MOTIVO ATC',
    idConversacion: 'ID_CONVERSACION',
  },
  velsa: {
    city: null, // no existe en el export de Velsa
    fechaVentaSubida: 'Fecha de cierre de negociacion',
    fechaConcretar: 'FECHA A CONCRETAR',
    otroProveedor: 'Otro Proveedor',
    innegociable: 'Motivo Innegociable',
    volverALlamar: 'Motivo Volver a Llamar',
    documentosPendientes: null, // no existe en el export de Velsa
    motivoAtc: 'Motivo ATC',
    idConversacion: null, // no existe en el export de Velsa
  },
};

// Mismo orden que las columnas 4 a 30 del INSERT de abajo (etapa_bitrix..id_conversacion)
const CAMPOS = [
  'etapa_bitrix', 'event', 'phone', 'source', 'city', 'repeated', 'responsible',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'fecha_venta_subida', 'fecha_concretar', 'modificado_por', 'creado_por',
  'creado_por_friendly', 'pipeline', 'comentario', 'iniciado_el', 'otro_proveedor',
  'razon_descarte', 'innegociable', 'volver_a_llamar', 'documentos_pendientes',
  'motivo_atc', 'id_conversacion',
];

const SQL_UPSERT_LEAD = `
  INSERT INTO bitrix_webhook_leads
    (bitrix_id, empresa, etapa, etapa_bitrix, event, phone, source, city, repeated,
     responsible, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
     fecha_venta_subida, fecha_concretar, modificado_por, creado_por, creado_por_friendly,
     pipeline, comentario, iniciado_el, otro_proveedor, razon_descarte, innegociable,
     volver_a_llamar, documentos_pendientes, motivo_atc, id_conversacion, raw_query,
     created_at, updated_at)
  VALUES
    ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
     $24,$25,$26,$27,$28,$29,$30,$31::jsonb,
     COALESCE($32::timestamp AT TIME ZONE 'America/Guayaquil', NOW()),
     COALESCE($33::timestamp AT TIME ZONE 'America/Guayaquil', NOW()))
  ON CONFLICT (empresa, bitrix_id) DO UPDATE SET
    etapa = EXCLUDED.etapa, etapa_bitrix = EXCLUDED.etapa_bitrix, event = EXCLUDED.event,
    phone = EXCLUDED.phone, source = EXCLUDED.source, city = EXCLUDED.city,
    repeated = EXCLUDED.repeated, responsible = EXCLUDED.responsible,
    utm_source = EXCLUDED.utm_source, utm_medium = EXCLUDED.utm_medium,
    utm_campaign = EXCLUDED.utm_campaign, utm_content = EXCLUDED.utm_content,
    utm_term = EXCLUDED.utm_term, fecha_venta_subida = EXCLUDED.fecha_venta_subida,
    fecha_concretar = EXCLUDED.fecha_concretar, modificado_por = EXCLUDED.modificado_por,
    creado_por = EXCLUDED.creado_por, creado_por_friendly = EXCLUDED.creado_por_friendly,
    pipeline = EXCLUDED.pipeline, comentario = EXCLUDED.comentario,
    iniciado_el = EXCLUDED.iniciado_el, otro_proveedor = EXCLUDED.otro_proveedor,
    razon_descarte = EXCLUDED.razon_descarte, innegociable = EXCLUDED.innegociable,
    volver_a_llamar = EXCLUDED.volver_a_llamar,
    documentos_pendientes = EXCLUDED.documentos_pendientes,
    motivo_atc = EXCLUDED.motivo_atc, id_conversacion = EXCLUDED.id_conversacion,
    raw_query = EXCLUDED.raw_query,
    updated_at = COALESCE($33::timestamp AT TIME ZONE 'America/Guayaquil', NOW())
    -- created_at NO se toca aquí: se conserva el original si el lead ya existía
  RETURNING (xmax = 0) AS es_nuevo
`;

const SQL_INSERT_HISTORIAL = `
  INSERT INTO bitrix_webhook_leads_historial
    (bitrix_id, empresa, etapa, etapa_bitrix, event, phone, source, city, repeated,
     responsible, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
     fecha_venta_subida, fecha_concretar, modificado_por, creado_por, creado_por_friendly,
     pipeline, comentario, iniciado_el, otro_proveedor, razon_descarte, innegociable,
     volver_a_llamar, documentos_pendientes, motivo_atc, id_conversacion, raw_query, created_at)
  VALUES
    ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
     $24,$25,$26,$27,$28,$29,$30,$31::jsonb,
     COALESCE($32::timestamp AT TIME ZONE 'America/Guayaquil', NOW()))
`;

(async () => {
  const texto = fs.readFileSync(CSV_PATH, 'utf8');
  const filas = parseCsv(texto).filter(f => f.length > 1);
  const encabezado = filas[0].map(h => h.trim());
  const idx = (nombre) => (nombre === null ? -1 : encabezado.indexOf(nombre));

  const mapa = HEADERS_POR_EMPRESA[EMPRESA];
  if (!mapa) {
    console.error(`❌ Empresa desconocida: "${EMPRESA}". Usa novonet o velsa.`);
    process.exit(1);
  }

  const col = {
    id: idx('ID'),
    pipeline: idx('Pipeline'),
    repeated: idx('Negociación repetida'),
    etapa: idx('Etapa'),
    responsible: idx('Responsable'),
    source: idx('Origen'),
    creado: idx('Creado'),
    creadoPor: idx('Creado por'),
    modificado: idx('Modificado'),
    modificadoPor: idx('Modificado por'),
    comentario: idx('Comentario'),
    iniciadoEl: idx('Fecha de inicio'),
    utmSource: idx('UTM Source'),
    utmMedium: idx('UTM Medium'),
    utmCampaign: idx('UTM Campaign'),
    utmContent: idx('UTM Content'),
    utmTerm: idx('UTM Term'),
    razonDescarte: idx('Razon Descarte'),
    phone: idx('Contacto: Móvil'),
    // Campos que varían de nombre (o no existen) según la empresa:
    city: idx(mapa.city),
    otroProveedor: idx(mapa.otroProveedor),
    innegociable: idx(mapa.innegociable),
    volverALlamar: idx(mapa.volverALlamar),
    fechaConcretar: idx(mapa.fechaConcretar),
    documentosPendientes: idx(mapa.documentosPendientes),
    fechaVentaSubida: idx(mapa.fechaVentaSubida),
    motivoAtc: idx(mapa.motivoAtc),
    idConversacion: idx(mapa.idConversacion),
  };

  // Campos que varían por empresa: solo son "obligatorios" si el mapeo espera
  // que existan (mapa.xxx !== null). Si mapa.xxx es null, es normal que no
  // aparezcan en el CSV (esa empresa no usa ese campo) y el dato queda en blanco.
  const CAMPOS_VARIABLES = ['city', 'otroProveedor', 'innegociable', 'volverALlamar',
    'fechaConcretar', 'documentosPendientes', 'fechaVentaSubida', 'motivoAtc', 'idConversacion'];

  const faltantes = Object.entries(col).filter(([k, i]) => {
    if (i !== -1) return false;
    if (CAMPOS_VARIABLES.includes(k) && mapa[k] === null) return false; // esperado, no es error
    return true;
  }).map(([k]) => k);

  if (faltantes.length) {
    console.error('❌ No se encontraron estas columnas en el CSV (revisa el nombre exacto del header):');
    console.error('  ', faltantes.join(', '));
    process.exit(1);
  }

  console.log(`Archivo: ${path.basename(CSV_PATH)}`);
  console.log(`Empresa: ${EMPRESA}`);
  console.log(`Filas a procesar: ${filas.length - 1}\n`);

  let nuevos = 0, actualizados = 0, errores = 0;

  for (let i = 1; i < filas.length; i++) {
    const f = filas[i];
    const bitrixId = (f[col.id] || '').trim();
    if (!bitrixId) continue;

    const etapaBitrix = f[col.etapa] || '';
    const etapa = slugify(etapaBitrix);
    const creadoSQL = fechaEcuadorSQL(f[col.creado]);
    const modificadoSQL = fechaEcuadorSQL(f[col.modificado]);
    const creadoPor = f[col.creadoPor] || '';

    const d = {
      etapa_bitrix: etapaBitrix,
      event: etapa,
      phone: f[col.phone] || '',
      source: f[col.source] || '',
      city: f[col.city] || '',
      repeated: f[col.repeated] || '',
      responsible: f[col.responsible] || '',
      utm_source: f[col.utmSource] || '',
      utm_medium: f[col.utmMedium] || '',
      utm_campaign: f[col.utmCampaign] || '',
      utm_content: f[col.utmContent] || '',
      utm_term: f[col.utmTerm] || '',
      fecha_venta_subida: f[col.fechaVentaSubida] || '',
      fecha_concretar: f[col.fechaConcretar] || '',
      modificado_por: f[col.modificadoPor] || '',
      creado_por: creadoPor,
      creado_por_friendly: creadoPor,
      pipeline: f[col.pipeline] || '',
      comentario: f[col.comentario] || '',
      iniciado_el: f[col.iniciadoEl] || '',
      otro_proveedor: f[col.otroProveedor] || '',
      razon_descarte: f[col.razonDescarte] || '',
      innegociable: f[col.innegociable] || '',
      volver_a_llamar: f[col.volverALlamar] || '',
      documentos_pendientes: f[col.documentosPendientes] || '',
      motivo_atc: f[col.motivoAtc] || '',
      id_conversacion: f[col.idConversacion] || '',
    };

    const rawJson = JSON.stringify({ ...d, bitrix_id: bitrixId, etapa, empresa: EMPRESA, import_masivo: true });
    const valoresCampos = CAMPOS.map(c => d[c]);

    try {
      const r = await pool.query(SQL_UPSERT_LEAD, [
        bitrixId, EMPRESA, etapa,
        ...valoresCampos,
        rawJson, creadoSQL, modificadoSQL,
      ]);

      if (r.rows[0]?.es_nuevo) nuevos++; else actualizados++;

      await pool.query(SQL_INSERT_HISTORIAL, [
        bitrixId, EMPRESA, etapa,
        ...valoresCampos,
        rawJson, creadoSQL,
      ]);
    } catch (err) {
      errores++;
      console.error(`Error en fila ${i} (ID ${bitrixId}):`, err.message);
    }
  }

  console.log(`\nListo. Nuevos: ${nuevos} | Actualizados: ${actualizados} | Errores: ${errores}`);
  process.exit(0);
})();
