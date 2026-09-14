export const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function matchesCreationDate(value, range) {
  if (!range.desde && !range.hasta) return true;
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return false;
  const day = localDate(date);
  return (!range.desde || day >= range.desde) && (!range.hasta || day <= range.hasta);
}

export function formatCreationDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Fecha no disponible";
}
