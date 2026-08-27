/**
 * NORMALIZACION DE NOMBRE DE ASESOR (Novonet)
 *
 * El campo de texto libre que llega de Bitrix (bitrix_webhook_leads.responsible,
 * heredado tambien en mestra_bitrix.b_persona_responsable) a veces tiene mas
 * de una forma de escribirse para el MISMO asesor (apellido incompleto, un
 * caracter de mas/menos, etc.). Sin normalizar, las tablas de KPI por asesor
 * agrupan por ese texto tal cual y la misma persona sale como 2 filas.
 *
 * Cada variante de esta lista fue CONFIRMADA cruzando el catalogo
 * "empleados": todas las formas de escribir el nombre apuntan al mismo
 * codigo/supervisor mas reciente (ver scripts/diagnosticar_asesor_duplicado.js),
 * por eso es seguro tratarlas como la misma persona.
 *
 * Si aparece un caso nuevo, agregarlo aqui (variante en MAYUSCULAS -> nombre
 * canonico) despues de confirmarlo con el mismo script de diagnostico.
 */
const VARIANTES_ASESOR_NOVONET = {
  'CHRISTIAN PONCE': 'CHRISTIAN PONCE BAROJA',
  'JOMAIRA CRISTINA LEITON RIZZO': 'JOMAIRA CRISTIANA LEITON RIZZO',
};

// Expresion SQL: normaliza `col` (una columna o expresion de texto) a su
// nombre canonico si hace match (insensible a mayusculas/espacios) con
// alguna variante conocida; si no, deja el valor tal cual llego.
function normalizarAsesorExpr(col) {
  const casos = Object.entries(VARIANTES_ASESOR_NOVONET)
    .map(([variante, canonico]) => `WHEN UPPER(TRIM(${col})) = '${variante}' THEN '${canonico}'`)
    .join('\n        ');
  return `(CASE
        ${casos}
        ELSE ${col}
    END)`;
}

module.exports = { normalizarAsesorExpr, VARIANTES_ASESOR_NOVONET };
