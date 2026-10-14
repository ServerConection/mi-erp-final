const normalizar = valor => String(valor || '').trim().toUpperCase();

const PERFILES_MANDO_WABOT = new Set(['SUPERVISOR', 'GERENCIA', 'ANALISTA', 'ATC']);

function esMandoWabot(usuario) {
  return PERFILES_MANDO_WABOT.has(normalizar(usuario?.perfil));
}

function empresaVisibleWabot(usuario) {
  // ATC opera por ahora únicamente la bandeja corporativa de NOVONET.
  if (normalizar(usuario?.perfil) === 'ATC') return 'NOVONET';
  return normalizar(usuario?.empresa);
}

module.exports = { esMandoWabot, empresaVisibleWabot };
