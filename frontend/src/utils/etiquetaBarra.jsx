/**
 * ═══════════════════════════════════════════════════════════════════════════
 * El número escrito sobre la barra
 * ═══════════════════════════════════════════════════════════════════════════
 * Gerencia pidió ver los valores sin tener que pasar el mouse por cada barra.
 * Un tooltip sirve para inspeccionar UNA barra; para comparar de un vistazo, o
 * para imprimir la pantalla y llevarla a una reunión, no sirve de nada.
 *
 * Uso:
 *     <Bar dataKey="ventas" fill="#1A3A6E">
 *       <LabelList dataKey="ventas" content={ValorBarra} />
 *     </Bar>
 *
 * Reglas que aplica solo:
 *   · El 0 y los vacíos no se escriben — una fila de ceros ensucia y no aporta.
 *   · Barras muy angostas (menos de 22px) tampoco: el número saldría encimado
 *     con el de al lado y se lee peor que si no estuviera.
 *   · Si la barra es alta, el número va DENTRO en blanco; si es baja, encima
 *     en gris. Así nunca queda un número blanco sobre el fondo de la página.
 */

const fmt = (v) => Number(v).toLocaleString('es-EC');

export function ValorBarra(props) {
  const { x, y, width, height, value } = props;
  if (value === null || value === undefined || Number(value) === 0) return null;
  if (!Number.isFinite(Number(value))) return null;
  if (width < 22) return null;

  const dentro = height >= 26;
  return (
    <text
      x={x + width / 2}
      y={dentro ? y + 15 : y - 4}
      textAnchor="middle"
      fill={dentro ? '#ffffff' : '#57534e'}
      fontSize={9}
      fontWeight={700}
      pointerEvents="none"
    >
      {fmt(value)}
    </text>
  );
}

/** Igual, para barras horizontales (layout="vertical"). */
export function ValorBarraH(props) {
  const { x, y, width, height, value } = props;
  if (value === null || value === undefined || Number(value) === 0) return null;
  if (!Number.isFinite(Number(value))) return null;
  if (height < 12) return null;

  const dentro = width >= 40;
  return (
    <text
      x={dentro ? x + width - 6 : x + width + 4}
      y={y + height / 2 + 3}
      textAnchor={dentro ? 'end' : 'start'}
      fill={dentro ? '#ffffff' : '#57534e'}
      fontSize={9}
      fontWeight={700}
      pointerEvents="none"
    >
      {fmt(value)}
    </text>
  );
}

/** Dentro del segmento, para barras apiladas: encima se pisarían entre sí. */
export function ValorApilado(props) {
  const { x, y, width, height, value } = props;
  if (!value || Number(value) === 0) return null;
  if (height < 14 || width < 22) return null;
  return (
    <text
      x={x + width / 2} y={y + height / 2 + 3}
      textAnchor="middle" fill="#ffffff" fontSize={9} fontWeight={700}
      pointerEvents="none"
    >
      {fmt(value)}
    </text>
  );
}
