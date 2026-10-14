const normalizar = (valor) => String(valor ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, " ")
  .trim()
  .toUpperCase();

export const CAMPOS_BUSQUEDA_BACKOFFICE = [
  "nombre_cliente_completo",
  "numero_identificacion",
  "codigo_asesor",
  "id_asesor_comercial",
  "nombre_asesor_comercial",
  "id_bitrix",
  "netlife_login",
  "telf_celular_pin",
  "telf_celular_2",
  "telf_fijo",
  "distribuidor_autorizado",
  "supervisor",
  "plan_contratado",
  "plan_contratado_final",
  "ciudad",
  "estado_welcome",
  "netlife_estatus_real",
  "estatus_regularizacion",
  "gestion_atc",
  "id",
];

const codigosDe = (row) => [row?.codigo_asesor, row?.id_asesor_comercial]
  .map(normalizar)
  .filter(Boolean);

/**
 * Búsqueda global consistente para todos los tableros de Backoffice.
 * Si el texto coincide exactamente con un código de asesor existente, esa
 * coincidencia tiene prioridad exclusiva. Así un código como "4340" no trae
 * ventas porque ese número aparezca accidentalmente en un teléfono o dirección.
 */
export function filtrarRegistrosBackoffice(rows, busqueda) {
  const lista = Array.isArray(rows) ? rows : [];
  const termino = normalizar(busqueda);
  if (!termino) return lista;

  const esCodigoExacto = lista.some((row) => codigosDe(row).includes(termino));
  if (esCodigoExacto) {
    return lista.filter((row) => codigosDe(row).includes(termino));
  }

  return lista.filter((row) => CAMPOS_BUSQUEDA_BACKOFFICE.some(
    (campo) => normalizar(row?.[campo]).includes(termino),
  ));
}

