function construirAlcanceSalud(empresa, idBitrix = '') {
  const id = String(idBitrix || '').trim();
  return { parametros: id ? [empresa, id] : [empresa], filtroLead: id ? ' AND id_bitrix=$2' : '', mostrarError: Boolean(id) };
}
module.exports = { construirAlcanceSalud };
