// src/services/asesorMatcher.service.js
// ============================================================================
// Encuentra "como esta escrito en Bitrix" cada asesor del Excel de metas.
//
// En Bitrix NO existe el codigo de vendedor: el lead solo trae el NOMBRE del
// responsable, con escrituras distintas para la misma persona (Mixed Case en
// el webhook, MAYUSCULA en mestra, nombre corto vs nombre legal, tildes, Ñ,
// espacios dobles). Este servicio compara el nombre del Excel contra los
// nombres REALES que aparecen en Bitrix y devuelve, para cada asesor:
//
//   estado  'alias'     -> ya se confirmo en una carga anterior (tabla asesor_alias_bitrix)
//           'codigo'    -> (Velsa) el codigo del Excel coincide con el codigo de Jotform
//           'exacto'    -> mismo nombre ignorando mayusculas/tildes/espacios
//           'contiene'  -> todas las palabras de uno estan en el otro (ILIKE por partes),
//                          y hay UN solo candidato
//           'ambiguo'   -> varios candidatos posibles: hay que elegir
//           'sugerido'  -> parecido pero no seguro: hay que confirmar
//           'sin_match' -> no aparece en Bitrix (asesor nuevo sin leads, o mal escrito)
//
// Solo 'alias', 'codigo', 'exacto' y 'contiene' se aceptan sin intervencion.
// El resto exige que el usuario elija en pantalla antes de aplicar.
// ============================================================================

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Clave de comparacion: MAYUSCULAS, sin tildes, sin simbolos, espacios simples. */
function claveNombre(s) {
  return sinTildes(s)
    .replace(/[ ​﻿]/g, ' ')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const tokens = (clave) => clave.split(' ').filter((t) => t.length > 1);

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Dos palabras "son la misma": iguales, o 1 letra de diferencia si son largas
 *  (CRISTINA/CRISTIANA, TATIANNA/TATIANA, NAVARRTE/NAVARRETE). */
function mismaPalabra(x, y) {
  if (x === y) return true;
  const min = Math.min(x.length, y.length);
  if (min >= 5 && levenshtein(x, y) <= 1) return true;
  if (min >= 8 && levenshtein(x, y) <= 2) return true;
  return false;
}

/** Cuantas palabras de A aparecen en B (cada palabra de B se usa una vez). */
function palabrasEnComun(ta, tb) {
  const libres = [...tb];
  let n = 0;
  for (const x of ta) {
    const i = libres.findIndex((y) => mismaPalabra(x, y));
    if (i >= 0) { n++; libres.splice(i, 1); }
  }
  return n;
}

/**
 * Agrupa los nombres crudos de Bitrix por clave normalizada.
 * @param {Array<{nombre:string, codigo?:string, n?:number, fuente?:string}>} filas
 * @returns {Map<clave, {clave, display, variantes:Set, leads, codigos:Map}>}
 */
function construirPool(filas) {
  const pool = new Map();
  for (const f of filas) {
    if (!f || f.nombre === null || f.nombre === undefined) continue;
    const crudo = String(f.nombre);
    const clave = claveNombre(crudo);
    if (!clave) continue;
    if (!pool.has(clave)) pool.set(clave, { clave, display: crudo.trim(), variantes: new Set(), leads: 0, codigos: new Map() });
    const p = pool.get(clave);
    p.variantes.add(crudo);
    p.leads += Number(f.n || 0);
    if (f.codigo) {
      const c = String(f.codigo).trim().toUpperCase();
      p.codigos.set(c, (p.codigos.get(c) || 0) + Number(f.n || 0));
    }
    // Para mostrar se prefiere la escritura en Mixed Case si existe
    if (/[a-z]/.test(crudo) && !/[a-z]/.test(p.display)) p.display = crudo.trim();
  }
  return pool;
}

/** Codigo -> clave de Bitrix dominante (Velsa: el codigo viene de Jotform).
 *  Solo se acepta si ese nombre tiene al menos el 60% de los registros del codigo. */
function indicePorCodigo(pool) {
  const porCodigo = new Map();
  for (const p of pool.values()) {
    for (const [cod, n] of p.codigos) {
      if (!porCodigo.has(cod)) porCodigo.set(cod, []);
      porCodigo.get(cod).push({ clave: p.clave, n });
    }
  }
  const idx = new Map();
  for (const [cod, lista] of porCodigo) {
    const total = lista.reduce((s, x) => s + x.n, 0) || 1;
    lista.sort((a, b) => b.n - a.n);
    if (lista[0].n / total >= 0.6) idx.set(cod, lista[0].clave);
  }
  return idx;
}

const candidatoDto = (p, score) => ({
  clave: p.clave,
  display: p.display,
  variantes: [...p.variantes],
  leads: p.leads,
  ...(score !== undefined ? { score: Math.round(score * 100) / 100 } : {}),
});

/**
 * Cruza cada asesor del Excel contra el pool de Bitrix.
 * @param {Array<{codigo, nombre_excel}>} asesores
 * @param {Map} pool  (de construirPool)
 * @param {Array<{codigo_asesor, clave_excel, nombre_bitrix}>} alias  confirmados antes
 */
function cruzarAsesores(asesores, pool, alias = []) {
  const idxCodigo = indicePorCodigo(pool);
  const poolLista = [...pool.values()];

  return asesores.map((a) => {
    const claveExcel = claveNombre(a.nombre_excel);
    const tExcel = tokens(claveExcel);
    const base = { clave_excel: claveExcel };

    // 1. Alias confirmado en una carga anterior (por codigo o por nombre)
    const al = alias.filter((x) =>
      (a.codigo && x.codigo_asesor && String(x.codigo_asesor).trim().toUpperCase() === a.codigo) ||
      x.clave_excel === claveExcel);
    if (al.length) {
      const claves = [...new Set(al.map((x) => claveNombre(x.nombre_bitrix)))];
      const elegidos = claves.map((c) => pool.get(c) || { clave: c, display: al.find((x) => claveNombre(x.nombre_bitrix) === c).nombre_bitrix, variantes: new Set(al.filter((x) => claveNombre(x.nombre_bitrix) === c).map((x) => x.nombre_bitrix)), leads: 0 });
      return { ...base, estado: 'alias', elegidos: elegidos.map((p) => candidatoDto(p)), sugerencias: [] };
    }

    // 2. Codigo (Velsa: Jotform trae el codigo del asesor)
    if (a.codigo && idxCodigo.has(a.codigo)) {
      const p = pool.get(idxCodigo.get(a.codigo));
      // Sanidad: el nombre debe compartir al menos 1 palabra con el del Excel
      if (palabrasEnComun(tExcel, tokens(p.clave)) >= 1) {
        return { ...base, estado: 'codigo', elegidos: [candidatoDto(p)], sugerencias: [] };
      }
    }

    // 3. Exacto ignorando mayusculas / tildes / espacios
    if (pool.has(claveExcel)) {
      return { ...base, estado: 'exacto', elegidos: [candidatoDto(pool.get(claveExcel))], sugerencias: [] };
    }

    // 4. "Contiene": todas las palabras del mas corto estan en el otro
    //    (equivale a ILIKE '%GRACE%ARIAS%NARVAEZ%' tolerando tildes y orden)
    const puntuados = poolLista.map((p) => {
      const tB = tokens(p.clave);
      const comunes = palabrasEnComun(tExcel, tB);
      const corto = Math.min(tExcel.length, tB.length);
      const contiene = comunes >= 2 && comunes === corto;
      const score = comunes / Math.max(tExcel.length, tB.length, 1);
      return { p, comunes, contiene, score };
    });

    const contienen = puntuados.filter((x) => x.contiene).sort((x, y) => y.score - x.score || y.p.leads - x.p.leads);
    if (contienen.length === 1) {
      return { ...base, estado: 'contiene', elegidos: [candidatoDto(contienen[0].p, contienen[0].score)], sugerencias: [] };
    }
    if (contienen.length > 1) {
      return { ...base, estado: 'ambiguo', elegidos: [], sugerencias: contienen.slice(0, 5).map((x) => candidatoDto(x.p, x.score)) };
    }

    // 5. Parecidos (al menos 2 palabras en comun) -> el usuario confirma
    const parecidos = puntuados
      .filter((x) => x.comunes >= 2 || x.score >= 0.5)
      .sort((x, y) => y.score - x.score || y.p.leads - x.p.leads)
      .slice(0, 3);
    if (parecidos.length) {
      return { ...base, estado: 'sugerido', elegidos: [], sugerencias: parecidos.map((x) => candidatoDto(x.p, x.score)) };
    }

    return { ...base, estado: 'sin_match', elegidos: [], sugerencias: [] };
  });
}

/** Marca como 'ambiguo' a dos asesores del Excel que cayeron en el MISMO nombre de Bitrix. */
function marcarDuplicados(resultados) {
  const usados = new Map();
  resultados.forEach((r, i) => r.elegidos.forEach((e) => {
    if (!usados.has(e.clave)) usados.set(e.clave, []);
    usados.get(e.clave).push(i);
  }));
  for (const idxs of usados.values()) {
    if (idxs.length < 2) continue;
    for (const i of idxs) {
      const r = resultados[i];
      if (r.estado === 'alias') continue;      // lo confirmado manda
      r.sugerencias = r.elegidos;
      r.elegidos = [];
      r.estado = 'ambiguo';
      r.motivo = 'Otro asesor del Excel apunta al mismo nombre de Bitrix';
    }
  }
  return resultados;
}

const ESTADOS_AUTOMATICOS = new Set(['alias', 'codigo', 'exacto', 'contiene']);

module.exports = { claveNombre, construirPool, cruzarAsesores, marcarDuplicados, ESTADOS_AUTOMATICOS, mismaPalabra };
