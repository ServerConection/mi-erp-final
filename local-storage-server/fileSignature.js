// src/utils/fileSignature.js
// ============================================================
// Validación de tipo real de archivo por FIRMA BINARIA (magic bytes).
//
// POR QUÉ EXISTE
// --------------
// El `mimetype` que entrega multer viene del header Content-Type que envía el
// NAVEGADOR: es un dato controlado por el cliente y se falsifica trivialmente
// (curl -F "archivo=@shell.php;type=image/png"). Confiar en él para decidir si
// un archivo es una imagen es una vulnerabilidad clásica de "unrestricted file
// upload" (OWASP A04 / CWE-434).
//
// Aquí se lee el encabezado real del buffer y se decide el tipo. Si la firma no
// coincide con un tipo permitido, el archivo se rechaza — sin importar cómo se
// haya declarado.
//
// La extensión que se persiste en disco SIEMPRE se deriva de la firma detectada,
// nunca del `originalname` del cliente (evita guardar "cedula.png.php" o
// "cedula.svg" en una carpeta que algún día se sirva estáticamente).
//
// Sin dependencias externas a propósito: es código de seguridad, cuanto menos
// superficie de terceros, mejor.
// ============================================================

'use strict';

// Marcas de contenedor ISO-BMFF usadas por fotos de iPhone (HEIC/HEIF).
const MARCAS_HEIF = new Set([
  'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs',
  'mif1', 'msf1',
]);

/**
 * Detecta el tipo real de un buffer.
 * @param {Buffer} buf
 * @returns {{tipo:string, mime:string, ext:string}|null} null si no se reconoce
 */
function detectarTipo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;

  // JPEG — FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { tipo: 'jpeg', mime: 'image/jpeg', ext: '.jpg' };
  }

  // PNG — 89 50 4E 47 0D 0A 1A 0A
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { tipo: 'png', mime: 'image/png', ext: '.png' };
  }

  // GIF — "GIF87a" / "GIF89a"
  const cabecera6 = buf.subarray(0, 6).toString('latin1');
  if (cabecera6 === 'GIF87a' || cabecera6 === 'GIF89a') {
    return { tipo: 'gif', mime: 'image/gif', ext: '.gif' };
  }

  // WEBP — "RIFF" .... "WEBP"
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
      buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { tipo: 'webp', mime: 'image/webp', ext: '.webp' };
  }

  // HEIC/HEIF — .... "ftyp" <marca>
  if (buf.length >= 16 && buf.subarray(4, 8).toString('latin1') === 'ftyp') {
    const marca = buf.subarray(8, 12).toString('latin1');
    if (MARCAS_HEIF.has(marca)) {
      return { tipo: 'heic', mime: 'image/heic', ext: '.heic' };
    }
  }

  // PDF — "%PDF-" (se admite un BOM/basura corta al inicio, como hacen algunos
  // escáneres; se busca solo en los primeros 1024 bytes)
  const inicio = buf.subarray(0, 1024).toString('latin1');
  const posPdf = inicio.indexOf('%PDF-');
  if (posPdf !== -1 && posPdf <= 4) {
    return { tipo: 'pdf', mime: 'application/pdf', ext: '.pdf' };
  }

  return null;
}

/**
 * Busca construcciones activas dentro de un PDF (JavaScript embebido, acciones
 * de lanzamiento de programas, archivos adjuntos). Una cédula escaneada jamás
 * las necesita, así que su presencia es señal de un PDF armado a mano.
 *
 * Nota: es una heurística sobre el texto crudo, no un parser. Puede dar falsos
 * positivos en PDFs generados por herramientas exóticas; por eso el rechazo se
 * puede desactivar con UPLOAD_PDF_STRICT=0.
 *
 * @param {Buffer} buf
 * @returns {string[]} lista de marcadores encontrados (vacío = limpio)
 */
function marcadoresActivosPdf(buf) {
  const texto = buf.toString('latin1');
  const patrones = [
    [/\/JavaScript\b/, '/JavaScript'],
    [/\/JS\s*[<(\[\/]/, '/JS'],
    [/\/Launch\b/, '/Launch'],
    [/\/EmbeddedFile\b/, '/EmbeddedFile'],
    [/\/RichMedia\b/, '/RichMedia'],
  ];
  const hallazgos = [];
  for (const [re, nombre] of patrones) if (re.test(texto)) hallazgos.push(nombre);
  return hallazgos;
}

/**
 * Valida un archivo subido y devuelve el tipo canónico.
 *
 * @param {Object} opts
 * @param {Buffer} opts.buffer
 * @param {string} [opts.mimetypeDeclarado] - lo que dijo el navegador (solo se
 *        usa para detectar incoherencias, nunca como fuente de verdad)
 * @param {string[]} [opts.permitidos] - lista de tipos aceptados
 * @param {boolean} [opts.pdfEstricto=true]
 * @returns {{ok:true, tipo:string, mime:string, ext:string}
 *          |{ok:false, motivo:string, codigo:string}}
 */
function validarArchivo({
  buffer,
  mimetypeDeclarado = '',
  permitidos = ['jpeg', 'png', 'webp', 'gif', 'heic', 'pdf'],
  pdfEstricto = true,
} = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, codigo: 'ARCHIVO_VACIO', motivo: 'El archivo llegó vacío.' };
  }

  const det = detectarTipo(buffer);
  if (!det) {
    return {
      ok: false,
      codigo: 'FIRMA_DESCONOCIDA',
      motivo: 'El archivo no es una imagen ni un PDF válido (firma binaria no reconocida).',
    };
  }

  if (!permitidos.includes(det.tipo)) {
    return {
      ok: false,
      codigo: 'TIPO_NO_PERMITIDO',
      motivo: `Tipo de archivo no permitido (${det.tipo}). Usa JPG, PNG, WEBP, HEIC o PDF.`,
    };
  }

  // Incoherencia entre lo declarado y lo real: no siempre es un ataque (algunos
  // navegadores mandan application/octet-stream para HEIC), pero se reporta para
  // que quede en el log de auditoría.
  const incoherente = Boolean(
    mimetypeDeclarado &&
    mimetypeDeclarado !== 'application/octet-stream' &&
    mimetypeDeclarado !== det.mime &&
    !(det.tipo === 'jpeg' && /jpe?g/i.test(mimetypeDeclarado))
  );

  if (det.tipo === 'pdf' && pdfEstricto) {
    const activos = marcadoresActivosPdf(buffer);
    if (activos.length) {
      return {
        ok: false,
        codigo: 'PDF_CON_CONTENIDO_ACTIVO',
        motivo: 'El PDF contiene contenido activo (JavaScript o adjuntos) y fue rechazado por seguridad.',
        detalle: activos,
      };
    }
  }

  return { ok: true, tipo: det.tipo, mime: det.mime, ext: det.ext, incoherente };
}

/** MIME seguro para devolver al navegador según la extensión almacenada. */
function mimeSeguroPorExtension(ext) {
  const mapa = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.heic': 'image/heic',
    '.pdf': 'application/pdf',
  };
  return mapa[String(ext || '').toLowerCase()] || null;
}

module.exports = {
  detectarTipo,
  validarArchivo,
  marcadoresActivosPdf,
  mimeSeguroPorExtension,
};
