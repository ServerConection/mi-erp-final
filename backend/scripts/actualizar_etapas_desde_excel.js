/**
 * Corrige la columna "Etapa" de un export de Bitrix (.xlsx) para que refleje
 * la etapa REAL y actual del lead, tomada en vivo de bitrix_webhook_leads
 * (la tabla que el webhook de Bitrix actualiza en tiempo real).
 *
 * Por que hace falta: un export de Bitrix es una foto del momento en que se
 * descargo. Si el lead cambio de etapa despues (por el webhook), el Excel
 * queda desactualizado. Este script NO escribe nada en la base de datos —
 * solo LEE bitrix_webhook_leads y corrige el Excel localmente. Genera un
 * archivo nuevo (no toca el original) y NO modifica ninguna otra columna
 * (fechas, asesor, origen, etc. quedan exactamente igual que en tu Excel).
 *
 * Detecta automaticamente si el archivo es de Novonet o Velsa comparando
 * cuantos ID coinciden contra cada empresa en bitrix_webhook_leads.
 *
 * Uso (desde backend/):
 *   node scripts/actualizar_etapas_desde_excel.js <ruta_al_excel.xlsx>
 *
 * Ejemplo:
 *   node scripts/actualizar_etapas_desde_excel.js scripts/data/lecyura.xlsx
 *
 * Genera: <mismo_nombre>_actualizado.xlsx en la misma carpeta.
 */

require('dotenv').config();
const path = require('path');
const XLSX = require('xlsx');
const pool = require('../src/config/db');

const inputPath = process.argv[2];

(async () => {
  try {
    if (!inputPath) {
      console.error('Uso: node scripts/actualizar_etapas_desde_excel.js <ruta_al_excel.xlsx>');
      process.exit(1);
    }

    const wb = XLSX.readFile(inputPath);
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    const headerRow = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false })[0] || [];
    const norm = (s) => String(s || '').trim().toLowerCase();
    const idColIdx = headerRow.findIndex(h => norm(h) === 'id');
    const etapaColIdx = headerRow.findIndex(h => norm(h) === 'etapa');

    if (idColIdx === -1 || etapaColIdx === -1) {
      throw new Error(`No se encontraron las columnas "ID" y/o "Etapa". Encabezados: ${headerRow.join(' | ')}`);
    }

    const idColLetter = XLSX.utils.encode_col(idColIdx);
    const etapaColLetter = XLSX.utils.encode_col(etapaColIdx);
    const range = XLSX.utils.decode_range(ws['!ref']);

    // Recolectar IDs del Excel para detectar la empresa
    const idsExcel = new Set();
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const cell = ws[`${idColLetter}${r + 1}`];
      if (cell && cell.v !== undefined && cell.v !== '') idsExcel.add(String(cell.v).trim());
    }
    console.log(`Filas leidas en el Excel: ${idsExcel.size}`);

    const { rows: novonetRows } = await pool.query(
      `SELECT bitrix_id, etapa_bitrix FROM public.bitrix_webhook_leads WHERE empresa = 'novonet'`
    );
    const { rows: velsaRows } = await pool.query(
      `SELECT bitrix_id, etapa_bitrix FROM public.bitrix_webhook_leads WHERE empresa = 'velsa'`
    );
    const mapaFrom = (rows) => new Map(rows.map(r => [String(r.bitrix_id).trim(), r]));
    const mapaNovonet = mapaFrom(novonetRows);
    const mapaVelsa = mapaFrom(velsaRows);

    let matchNovonet = 0, matchVelsa = 0;
    idsExcel.forEach(id => {
      if (mapaNovonet.has(id)) matchNovonet++;
      if (mapaVelsa.has(id)) matchVelsa++;
    });
    console.log(`Coinciden con NOVONET: ${matchNovonet}/${idsExcel.size}`);
    console.log(`Coinciden con VELSA:   ${matchVelsa}/${idsExcel.size}`);

    const empresa = matchNovonet >= matchVelsa ? 'novonet' : 'velsa';
    const mapa = empresa === 'novonet' ? mapaNovonet : mapaVelsa;
    console.log(`\n>> Empresa detectada: ${empresa.toUpperCase()}\n`);

    let actualizadas = 0, sinCambio = 0, noEncontradas = 0;
    const cambios = [];
    const noEncontradasIds = [];

    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const idCellAddr = `${idColLetter}${r + 1}`;
      const etapaCellAddr = `${etapaColLetter}${r + 1}`;
      const idCell = ws[idCellAddr];
      if (!idCell || idCell.v === undefined || idCell.v === '') continue;

      const id = String(idCell.v).trim();
      const live = mapa.get(id);
      if (!live) {
        noEncontradas++;
        noEncontradasIds.push(id);
        continue;
      }

      const etapaViva = (live.etapa_bitrix || '').trim();
      const etapaCell = ws[etapaCellAddr];
      const etapaActualExcel = etapaCell && etapaCell.v !== undefined ? String(etapaCell.v).trim() : '';

      // Comparacion insensible a mayusculas/minusculas: la tabla en vivo
      // guarda la etapa en MAYUSCULAS, el export de Bitrix la muestra en
      // Formato Titulo -- eso NO es un cambio real de etapa, es solo estilo.
      // Solo se cuenta/corrige cuando la etapa en si es distinta.
      const mismaEtapa = etapaViva && etapaActualExcel &&
        etapaViva.toUpperCase() === etapaActualExcel.toUpperCase();

      if (etapaViva && !mismaEtapa) {
        cambios.push({ id, antes: etapaActualExcel || '(vacio)', despues: etapaViva });
        ws[etapaCellAddr] = { t: 's', v: etapaViva };
        actualizadas++;
      } else {
        sinCambio++;
      }
    }

    console.log(`=== RESUMEN ===`);
    console.log(`Actualizadas (etapa corregida):        ${actualizadas}`);
    console.log(`Sin cambio (ya estaban bien):            ${sinCambio}`);
    console.log(`No encontradas en bitrix_webhook_leads:  ${noEncontradas}`);

    if (cambios.length) {
      console.log(`\nPrimeros 25 cambios:`);
      cambios.slice(0, 25).forEach(c => console.log(`  ID ${c.id}: "${c.antes}" -> "${c.despues}"`));
    }
    if (noEncontradasIds.length) {
      console.log(`\nPrimeros 25 ID no encontrados (no estan en bitrix_webhook_leads de ${empresa}):`);
      console.log('  ' + noEncontradasIds.slice(0, 25).join(', '));
    }

    const dir = path.dirname(inputPath);
    const base = path.basename(inputPath, path.extname(inputPath));
    const outPath = path.join(dir, `${base}_actualizado.xlsx`);
    XLSX.writeFile(wb, outPath);
    console.log(`\nArchivo corregido guardado en: ${outPath}`);

    process.exit(0);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
