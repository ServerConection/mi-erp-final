/**
 * BOLSA LEADS — patrón de entrega entre empresas.
 *
 * El patrón es un texto de letras: N = NOVONET, V = VELSA, S = SEMILLERO.
 * Cada lead que entra a "Bolsa Leads" toma la letra de la posición actual y
 * avanza una. Al llegar al final del patrón vuelve a empezar.
 *   Por defecto (12 casillas: 7 N / 4 V / 1 S): N V N N V N S N V N N V
 */
const LETRAS = { N: 'novonet', V: 'velsa', S: 'semillero' };
const EMPRESAS_BOLSA = Object.values(LETRAS);
const LETRA_DE = Object.fromEntries(Object.entries(LETRAS).map(([l, e]) => [e, l]));
const PATRON_DEFECTO = 'NVNNVNSNVNNV';
const PATRON_ANTERIOR = 'NVNVNNVNVN'; // 60/40 de 10 casillas (versión inicial)

const limpiarPatron = (p) => String(p || '').toUpperCase().replace(/[^NVS]/g, '');

// Patrón válido: 1 a 50 letras, solo N, V y S.
const patronValido = (p) => {
  const l = limpiarPatron(p);
  return l.length >= 1 && l.length <= 50 && l === String(p || '').toUpperCase().replace(/[\s,]/g, '');
};

/**
 * Arma un patrón repartido lo más parejo posible (round robin ponderado suave).
 * generarPatron({ novonet: 7, velsa: 4, semillero: 1 }) → 12 casillas
 * generarPatron({ novonet: 6, velsa: 4 })               → 'NVNVNNVNVN'
 */
const generarPatron = (cantidades = {}) => {
  const pesos = EMPRESAS_BOLSA
    .map((e) => ({ e, w: Math.max(0, Math.round(Number(cantidades[e]) || 0)), act: 0 }))
    .filter((x) => x.w > 0);
  const total = pesos.reduce((s, x) => s + x.w, 0);
  if (!total || total > 50) return '';
  let out = '';
  for (let i = 0; i < total; i++) {
    for (const x of pesos) x.act += x.w;
    const elegido = pesos.reduce((a, b) => (b.act > a.act ? b : a));
    elegido.act -= total;
    out += LETRA_DE[elegido.e];
  }
  return out;
};

// Cuántas casillas tiene cada empresa y su %.
const resumenPatron = (p) => {
  const l = limpiarPatron(p);
  const r = { tamano: l.length };
  for (const [letra, e] of Object.entries(LETRAS)) {
    r[e] = [...l].filter((c) => c === letra).length;
    r[`pct_${e}`] = l.length ? Math.round((r[e] * 100) / l.length) : 0;
  }
  return r;
};

/**
 * A qué empresa va el próximo lead y cuál es la siguiente posición.
 * modo: 'proporcion' (usa el patrón) | 'solo_novonet' | 'solo_velsa' | 'solo_semillero'
 * En "solo una empresa" el ciclo no avanza (al volver a proporción sigue donde iba).
 */
const siguienteEntrega = ({ patron, posicion, modo }) => {
  const solo = /^solo_(.+)$/.exec(modo || '');
  if (solo && EMPRESAS_BOLSA.includes(solo[1])) return { empresa: solo[1], slot: null, siguiente: posicion };
  const l = limpiarPatron(patron) || PATRON_DEFECTO;
  const pos = ((Number(posicion) || 0) % l.length + l.length) % l.length;
  return { empresa: LETRAS[l[pos]], slot: pos + 1, siguiente: (pos + 1) % l.length };
};

module.exports = {
  LETRAS, EMPRESAS_BOLSA, PATRON_DEFECTO, PATRON_ANTERIOR,
  limpiarPatron, patronValido, generarPatron, resumenPatron, siguienteEntrega,
};
