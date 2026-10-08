const normalizar = (valor) => String(valor || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().replace(/\s+/g, ' ').toUpperCase();

function perfilGestionables(valor) {
  const perfil = normalizar(valor);
  if (perfil === 'ADMINISTRADOR') return 'ADMINISTRADOR';
  if (perfil === 'GERENCIA' || perfil === 'GERENTE' || perfil.startsWith('GERENCIA ') || perfil.startsWith('GERENTE ')) return 'GERENCIA';
  if (perfil === 'SUPERVISOR' || perfil === 'SUPERVISORA' || perfil.startsWith('SUPERVISOR ')) return 'SUPERVISOR';
  return null;
}

function empresaGestionables(valor) {
  const empresa = normalizar(valor);
  if (empresa === 'NOVONET' || empresa.startsWith('NOVONET ')) return 'NOVONET';
  if (empresa === 'VELSA' || empresa.startsWith('VELSA ')) return 'VELSA';
  return null;
}

function puedeAccederGestionables(usuario, empresaObjetivo) {
  const perfil = perfilGestionables(usuario?.perfil || usuario?.rol);
  const objetivo = empresaGestionables(empresaObjetivo);

  // El administrador es corporativo y puede operar NOVONET y VELSA. Para
  // supervisión y gerencia se mantiene el aislamiento por empresa.
  if (perfil === 'ADMINISTRADOR') return objetivo !== null;
  if (normalizar(usuario?.perfil || usuario?.rol) === 'ANALISTA') return objetivo === 'NOVONET';

  const empresa = empresaGestionables(usuario?.empresa);

  return perfil !== null && empresa !== null && empresa === objetivo;
}

module.exports = { perfilGestionables, empresaGestionables, puedeAccederGestionables };
