/**
 * BOLSA LEADS — patrón de entrega entre empresas.
 *
 * El patrón es un texto de letras: N = NOVONET, V = VELSA. Cada lead que entra
 * a "Bolsa Leads" toma la letra de la posición actual y avanza una. Al llegar
 * al final del patrón vuelve a empezar.
 *   Ejemplo 60/40 en ciclos de 10: N V N V N N V N V N
 */
const LETRA_A_EMPRESA = { N: 'novonet', V: 'velsa' };
const PATRON_DEFECTO = 'NVNVNNVNVN';

const limpiarPatron = (p) => String(p || '').toUpperCase().replace(/[^NV]/g, '');

// Patrón válido: 1 a 50 letras, solo N y V.
const patronValido = (p) => {
  const l = limpiarPatron(p);
  return l.length >= 1 && l.length <= 50 && l === String(p || '').toUpperCase().replace(/[\s,]/g, '');
};

/**
 * Arma un patrón repartido lo más parejo posible.
 * generarPatron(60, 10) → 'NVNVNNVNVN'
 */
const generarPatron = (pctNovonet, tamano = 10) => {
  const n = Math.max(1, Math.min(50, Math.round(Number(tamano) || 10)));
  const pct = Math.max(0, Math.min(100, Number(pctNovonet)));
  const cantN = Math.round((n * pct) / 100);
  const cantV = n - cantN;
  if (cantV === 0) return 'N'.repeat(n);
  if (cantN === 0) return 'V'.repeat(n);
  // La empresa con menos leads se intercala de forma pareja entre la otra
  const [menor, mayor, m] = cantV <= cantN ? ['V', 'N', cantV] : ['N', 'V', cantN];
  let out = '';
  for (let i = 1; i <= n; i++) {
    const toca = Math.floor((i * m) / n + 0.5) > Math.floor(((i - 1) * m) / n + 0.5);
    out += toca ? menor : mayor;
  }
  return out;
};

// Cuántos de cada empresa tiene el patrón, y su %.
const resumenPatron = (p) => {
  const l = limpiarPatron(p);
  const novonet = [...l].filter((c) => c === 'N').length;
  const velsa = l.length - novonet;
  return {
    tamano: l.length, novonet, velsa,
    pct_novonet: l.length ? Math.round((novonet * 100) / l.length) : 0,
    pct_velsa: l.length ? Math.round((velsa * 100) / l.length) : 0,
  };
};

/**
 * A qué empresa va el próximo lead y cuál es la siguiente posición.
 * modo: 'proporcion' (usa el patrón) | 'solo_novonet' | 'solo_velsa'
 * En "solo una empresa" el ciclo no avanza (al volver a proporción sigue donde iba).
 */
const siguienteEntrega = ({ patron, posicion, modo }) => {
  if (modo === 'solo_novonet') return { empresa: 'novonet', slot: null, siguiente: posicion };
  if (modo === 'solo_velsa') return { empresa: 'velsa', slot: null, siguiente: posicion };
  const l = limpiarPatron(patron) || PATRON_DEFECTO;
  const pos = ((Number(posicion) || 0) % l.length + l.length) % l.length;
  return { empresa: LETRA_A_EMPRESA[l[pos]], slot: pos + 1, siguiente: (pos + 1) % l.length };
};

module.exports = { PATRON_DEFECTO, limpiarPatron, patronValido, generarPatron, resumenPatron, siguienteEntrega };
