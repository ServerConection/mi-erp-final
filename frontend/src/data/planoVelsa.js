// Disposición física del plano VELSA según el levantamiento de puestos.
// Para mover una casilla solo es necesario modificar su fila y columna.
const celda = (numero, fila, columna, forma = 'RECTANGULO') => ({
  id: `EQ-${String(numero).padStart(4, '0')}`, fila, columna, forma,
});

export const PLANO_VELSA = {
  columnas: 10,
  filas: 8,
  casillas: [
    // Bloque izquierdo: cuatro puestos a la izquierda y cinco a la derecha.
    ...[82, 81, 80, 79].map((numero, indice) => celda(numero, 2 + indice, 1)),
    ...[73, 74, 75, 76, 77].map((numero, indice) => celda(numero, 2 + indice, 2)),
    { ...celda(78, 7, 1, 'OVALO'), centradaEntreColumnas: true },

    // Bloque derecho: siete puestos a la izquierda y seis a la derecha.
    ...[72, 71, 70, 69, 68, 67, 66].map((numero, indice) => celda(numero, 1 + indice, 6)),
    celda(65, 8, 6),
    ...[64, 63, 62, 61, 60].map((numero, indice) => celda(numero, 3 + indice, 7)),

    // Puesto independiente ubicado en la parte superior derecha.
    celda(83, 1, 10, 'OVALO'),
  ],
};

export default PLANO_VELSA;
