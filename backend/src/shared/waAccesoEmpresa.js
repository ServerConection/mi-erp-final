const normalizar = valor => String(valor || '').trim().toUpperCase();

const PERFILES_MANDO_WABOT = new Set(['SUPERVISOR', 'GERENCIA', 'GERENTE', 'ANALISTA', 'ATC']);

function esMandoWabot(usuario) {
  const perfil = normalizar(usuario?.perfil);
  return PERFILES_MANDO_WABOT.has(perfil) || /^GEREN(?:CIA|TE)[ _-]/.test(perfil);
}

function empresaVisibleWabot(usuario) {
  // ATC opera por ahora únicamente la bandeja corporativa de NOVONET.
  if (normalizar(usuario?.perfil) === 'ATC') return 'NOVONET';
  return normalizar(usuario?.empresa);
}

// Supervisores que cubren más de una empresa (ej. NOVONET + SEMILLERO).
// Env WA_EMPRESAS_EXTRA="asalvatore:SEMILLERO,otro:VELSA|SEMILLERO"
function empresasExtra(usuario) {
  const u = normalizar(usuario?.usuario);
  if (!u) return [];
  for (const par of String(process.env.WA_EMPRESAS_EXTRA || '').split(',')) {
    const [usr, emps] = par.split(':');
    if (normalizar(usr) === u) return String(emps || '').split('|').map(normalizar).filter(Boolean);
  }
  return [];
}

// Lista de empresas que el usuario puede ver en WABOT (la suya + extras).
function empresasVisiblesWabot(usuario) {
  return [...new Set([empresaVisibleWabot(usuario), ...empresasExtra(usuario)].filter(Boolean))];
}

module.exports = { esMandoWabot, empresaVisibleWabot, empresasVisiblesWabot };
