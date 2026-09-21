function fechaValida(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function validarFilas(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 5000) throw new Error('Debe cargar entre 1 y 5000 filas');
  const ids = new Set(), asesores = new Set();
  return rows.map((r, i) => {
    const nombre = String(r.nombre_bitrix_asesor || '').trim();
    if (!Number.isInteger(r.id) || r.id < 1 || r.id > 2147483647 || !nombre || nombre.length > 150 || !Number.isInteger(r.gestionables_permitidos) || r.gestionables_permitidos < 0 || r.gestionables_permitidos > 2147483647 || !fechaValida(r.fecha_carga)) throw new Error(`Fila ${i + 1}: ID, nombre, cantidad o fecha inválidos`);
    const key = `${nombre.toLocaleUpperCase('es')}|${r.fecha_carga}`;
    if (ids.has(r.id) || asesores.has(key)) throw new Error(`Fila ${i + 1}: ID o asesor/fecha repetidos`);
    ids.add(r.id); asesores.add(key);
    return { ...r, nombre_bitrix_asesor: nombre };
  });
}
function parseTxt(text) {
  if (typeof text !== 'string') throw new Error('Falta el contenido del TXT');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  const header = 'id;nombre_bitrix_asesor;gestionables_permitidos;fecha_carga';
  const separator = lines[0]?.includes('\t') ? '\t' : ';';
  if (lines.shift()?.split(separator).map(s => s.trim()).join(';') !== header) throw new Error(`Encabezado requerido: ${header}`);
  return validarFilas(lines.map((line, i) => {
    const parts = line.split(separator).map(s => s.trim());
    if (parts.length !== 4 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[2])) throw new Error(`Línea ${i + 2}: formato inválido`);
    return { id: Number(parts[0]), nombre_bitrix_asesor: parts[1], gestionables_permitidos: Number(parts[2]), fecha_carga: parts[3] };
  }));
}
module.exports = { fechaValida, validarFilas, parseTxt };
