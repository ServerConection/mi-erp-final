const EXCLUIDAS = [/^VENTAS? SUBIDAS?$/, /^DUPLICADOS?$/, /^REMARKETING$/, /^REGULARIZACION$/];
function normalizarEtapa(valor) { return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim().replace(/[_/\-]+/g, ' ').replace(/\s+/g, ' '); }
function etapaExcluida(valor) { const etapa = normalizarEtapa(valor); return EXCLUIDAS.some((patron) => patron.test(etapa)); }
module.exports = { normalizarEtapa, etapaExcluida, EXCLUIDAS };
