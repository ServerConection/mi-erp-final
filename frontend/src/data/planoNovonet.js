// Disposicion fisica del plano NOVONET. Para mover una casilla, modifica solo
// fila/columna. La logica y los datos del activo viven fuera de este archivo.
const celda = (numero, fila, columna, forma = 'RECTANGULO') => ({
  id: `EQ-${String(numero).padStart(4, '0')}`, fila, columna, forma,
});

export const PLANO_NOVONET = {
  columnas: 16,
  filas: 13,
  casillas: [
    ...[7, 6, 5, 4, 3].map((n, i) => celda(n, 1, 11 + i)),
    ...[18, 17, 16, 15].map((n, i) => celda(n, 3, 1 + i)),
    ...[14, 13, 12, 11, 10, 9, 8].map((n, i) => celda(n, 3, 9 + i)),
    // EQ-0026 termina en la misma columna que EQ-0015.
    ...[28, 27, 26].map((n, i) => celda(n, 5, 2 + i)),
    // La fila completa termina con EQ-0019 debajo de EQ-0008.
    ...[25, 24].map((n, i) => celda(n, 5, 8 + i)),
    celda(52, 5, 10, 'PEQUENA'),
    ...[23, 22, 21, 20, 19].map((n, i) => celda(n, 5, 11 + i)),
    // A la derecha del bloque EQ-0032...EQ-0038 y centrado entre sus dos filas.
    { ...celda(31, 8, 5, 'OVALO'), centradaEntreFilas: true },
    celda(29, 7, 8, 'OVALO'), celda(30, 7, 12, 'OVALO'),

    // Bloque inferior que en el dibujo estaba marcado en rojo, trasladado a la izquierda.
    ...[32, 33, 34].map((n, i) => celda(n, 8, 1 + i)),
    ...[35, 36, 37, 38].map((n, i) => celda(n, 9, 1 + i)),
    celda(46, 11, 1), celda(45, 12, 1), celda(44, 13, 1), celda(43, 13, 2, 'OVALO'),
    celda(39, 10, 5), celda(40, 11, 5), celda(41, 12, 5), celda(42, 13, 5),

    // Elementos que estaban a la izquierda del bloque rojo, trasladados a la derecha.
    celda(50, 10, 12, 'OVALO'),
    ...[47, 48, 49].map((n, i) => celda(n, 10 + i, 13, 'OVALO')),
    celda(51, 11, 14, 'OVALO'),
  ],
};

export default PLANO_NOVONET;
