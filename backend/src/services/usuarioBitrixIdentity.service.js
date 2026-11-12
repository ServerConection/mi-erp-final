const { claveNombre } = require('./asesorMatcher.service');

/**
 * Elimina repeticiones completas del nombre causadas por registros antiguos
 * donde `nombres` y `apellidos` contienen el mismo nombre legal completo.
 * No elimina palabras repetidas normales dentro de un nombre.
 */
function quitarRepeticionCompleta(clave) {
  let partes = String(clave || '').split(' ').filter(Boolean);
  let cambio = true;
  while (cambio && partes.length >= 2) {
    cambio = false;
    for (let tam = 1; tam <= Math.floor(partes.length / 2); tam += 1) {
      if (partes.length % tam !== 0) continue;
      const bloque = partes.slice(0, tam).join(' ');
      const repeticiones = partes.length / tam;
      if (repeticiones < 2) continue;
      const todosIguales = Array.from({ length: repeticiones }, (_, i) =>
        partes.slice(i * tam, (i + 1) * tam).join(' ')
      ).every((actual) => actual === bloque);
      if (todosIguales) {
        partes = partes.slice(0, tam);
        cambio = true;
        break;
      }
    }
  }
  return partes;
}

/**
 * Coincidencia deliberadamente estricta para crear una identidad persistente:
 * mismas palabras completas, ignorando tildes, símbolos, orden y la repetición
 * total descrita arriba. Nunca acepta nombres parciales ni aproximados.
 */
function nombresEquivalentesParaVincular(nombreErp, nombreBitrix) {
  const erp = quitarRepeticionCompleta(claveNombre(nombreErp)).sort();
  const bitrix = quitarRepeticionCompleta(claveNombre(nombreBitrix)).sort();
  return erp.length >= 2 && erp.length === bitrix.length && erp.every((p, i) => p === bitrix[i]);
}

module.exports = { quitarRepeticionCompleta, nombresEquivalentesParaVincular };
