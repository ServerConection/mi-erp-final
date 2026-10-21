// src/utils/multimediaDbStore.js
// ============================================================
// Almacén de AUDIOS / VIDEOS en PostgreSQL.
//
// POR QUÉ: el servidor de almacenamiento local (túnel) rechaza audios.
// Para no depender de él, los archivos multimedia (audio/* y video/*) se
// guardan en la tabla public.archivos_multimedia. Las imágenes y PDF siguen
// yendo al servidor de almacenamiento como siempre.
//
// La URL que se guarda en envios_ventas tiene EXACTAMENTE el mismo formato
// (/api/envios-ventas/archivo/<carpeta>/<archivo>), así que el frontend y los
// permisos existentes no cambian.
// ============================================================
'use strict';

const crypto = require('crypto');

let pool = null;
function getPool() {
  if (!pool) pool = require('../config/db');
  return pool;
}

const EXT_MULTIMEDIA = new Set([
  '.mp3', '.aac', '.m4a', '.ogg', '.opus', '.wav', '.webm', '.amr', '.mp4',
  '.3gp', '.flac', '.wma', '.aiff', '.mid', '.caf',
]);

function esMultimedia({ mimetype = '', extension = '', archivo = '' } = {}) {
  if (/^(audio|video)\//i.test(String(mimetype))) return true;
  const ext = (extension || (String(archivo).match(/\.[A-Za-z0-9]+$/) || [''])[0]).toLowerCase();
  return EXT_MULTIMEDIA.has(ext);
}

let tablaLista = null;
function asegurarTabla() {
  if (!tablaLista) {
    tablaLista = getPool().query(`
      CREATE TABLE IF NOT EXISTS public.archivos_multimedia (
        id          BIGSERIAL PRIMARY KEY,
        carpeta     VARCHAR(40)  NOT NULL,
        archivo     VARCHAR(200) NOT NULL,
        mime        VARCHAR(80)  NOT NULL,
        bytes       INTEGER      NOT NULL,
        nombre_original VARCHAR(200),
        datos       BYTEA        NOT NULL,
        creado_en   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE (carpeta, archivo)
      )`).catch((e) => { tablaLista = null; throw e; });
  }
  return tablaLista;
}

async function guardarMultimedia({ buffer, originalname, mimetype, carpeta, extension }) {
  await asegurarTabla();
  const ext = String(extension || '').toLowerCase();
  const archivo = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
  await getPool().query(
    `INSERT INTO public.archivos_multimedia (carpeta, archivo, mime, bytes, nombre_original, datos)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [carpeta, archivo, mimetype || 'application/octet-stream', buffer.length,
      String(originalname || '').slice(0, 200), buffer]
  );
  console.log('[MULTIMEDIA-DB] guardado', { carpeta, archivo, bytes: buffer.length });
  return { success: true, carpeta, archivo, nombreOriginal: originalname };
}

/** Devuelve {buffer, contentType} o null si no está en la BD. */
async function leerMultimedia(carpeta, archivo) {
  await asegurarTabla();
  const { rows } = await getPool().query(
    `SELECT mime, datos FROM public.archivos_multimedia WHERE carpeta = $1 AND archivo = $2 LIMIT 1`,
    [carpeta, archivo]
  );
  if (!rows.length) return null;
  return { buffer: rows[0].datos, contentType: rows[0].mime };
}

module.exports = { esMultimedia, guardarMultimedia, leerMultimedia, EXT_MULTIMEDIA };
