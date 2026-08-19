const MODULOS = {
  VISTA_ASESOR: 'VistaAsesor',
  SEGUIMIENTO_VENTAS: 'SeguimientoVentas',
  INDICADORES: 'Indicadores',
  REDES: 'Redes',

  VISTA_ASESOR_VELSA: 'VistaAsesorVelsa',
  SEGUIMIENTO_VELSA: 'SeguimientoVelsa',
  INDICADORES_VELSA: 'IndicadoresVelsa',
  REDES_VELSA: 'RedesVelsa',

  RESUMEN_NOVONET: 'ResumenNovonet',
  RESUMEN_VELSA: 'ResumenVelsa',

  VENTAS: 'Ventas',
  VENTAS_FORMULARIO: 'VentasFormulario',
  RRHH: 'RRHH',
  HORARIOS: 'Horarios',
  BILLETERA: 'Billetera',
  COMISIONES: 'Comisiones',
  GUIA_COMERCIAL: 'GuiaComercial',

  BOT_AUDITOR: 'BotAuditor',
};

const MODULOS_GERENCIALES = [
  MODULOS.VENTAS,
  MODULOS.RRHH,
  MODULOS.HORARIOS,
  MODULOS.BILLETERA,
  MODULOS.COMISIONES,
];

// ─────────────────────────────────────────────────────────────────────────────
// PERFIL TTHH (Talento Humano) — transversal a las dos empresas
// ─────────────────────────────────────────────────────────────────────────────
// Igual alcance que GERENCIA, pero NO queda atado a la empresa del usuario:
// ve Novonet Y Velsa al mismo tiempo. Por eso se resuelve antes del lookup por
// empresa en obtenerPermisosUsuario() — si dependiera del map por empresa,
// un TTHH de Novonet no vería Velsa y viceversa.
//
// Antes de este cambio TTHH no existía en el map y caía al fallback USUARIO,
// así que solo veía Vista Asesor / Seguimiento de su propia empresa.
//
// QUÉ NO INCLUYE, a propósito:
//   - Broadcast y WaBot: son de ENVÍO masivo a clientes, no de consulta.
//   - No se toca soloAdmin: TTHH sigue sin poder entrar a lo de administrador.
// Si más adelante se quiere dar broadcast a TTHH, hay que tocar además
// forEmpresa() en frontend/src/layouts/DashboardLayout.jsx.
const MODULOS_TTHH = [
  // Novonet
  MODULOS.VISTA_ASESOR,
  MODULOS.SEGUIMIENTO_VENTAS,
  MODULOS.INDICADORES,
  MODULOS.REDES,
  MODULOS.RESUMEN_NOVONET,
  // Velsa
  MODULOS.VISTA_ASESOR_VELSA,
  MODULOS.SEGUIMIENTO_VELSA,
  MODULOS.INDICADORES_VELSA,
  MODULOS.RESUMEN_VELSA,
  // Transversales
  MODULOS.VENTAS_FORMULARIO,
  MODULOS.GUIA_COMERCIAL,
  MODULOS.BOT_AUDITOR,
  ...MODULOS_GERENCIALES,
];

const PERMISOS_POR_EMPRESA_PERFIL = {
  NOVONET: {
    USUARIO: [
      MODULOS.VISTA_ASESOR,
      MODULOS.SEGUIMIENTO_VENTAS,
      MODULOS.VENTAS_FORMULARIO,
      MODULOS.GUIA_COMERCIAL,
    ],
    // 👁️ CONSULTOR: solo puede ver el reporte de Redes
    CONSULTOR: [
      MODULOS.REDES,   // reactivado SOLO para WinTracker (2026-08)
      MODULOS.BOT_AUDITOR,
    ],
    SUPERVISOR: [
      MODULOS.VISTA_ASESOR,
      MODULOS.SEGUIMIENTO_VENTAS,
      MODULOS.INDICADORES,
      MODULOS.VENTAS_FORMULARIO,
      MODULOS.GUIA_COMERCIAL,
      MODULOS.BOT_AUDITOR,
    ],
    // ✅ FIX: Se agregó GUIA_COMERCIAL que faltaba en ANALISTA NOVONET
    ANALISTA: [
      MODULOS.VISTA_ASESOR,
      MODULOS.SEGUIMIENTO_VENTAS,
      MODULOS.INDICADORES,
      MODULOS.REDES,   // reactivado SOLO para WinTracker (2026-08)
      MODULOS.VENTAS_FORMULARIO,
      MODULOS.GUIA_COMERCIAL,
      MODULOS.RESUMEN_NOVONET,
      MODULOS.RESUMEN_VELSA,
      MODULOS.BOT_AUDITOR,
      ...MODULOS_GERENCIALES,
    ],
    GERENCIA: [
      MODULOS.VISTA_ASESOR,
      MODULOS.SEGUIMIENTO_VENTAS,
      MODULOS.INDICADORES,
      MODULOS.REDES,   // reactivado SOLO para WinTracker (2026-08)
      MODULOS.VENTAS_FORMULARIO,
      MODULOS.GUIA_COMERCIAL,
      MODULOS.RESUMEN_NOVONET,
      MODULOS.RESUMEN_VELSA,
      MODULOS.BOT_AUDITOR,
      ...MODULOS_GERENCIALES,
    ],
    ADMINISTRADOR: [
      MODULOS.VISTA_ASESOR,
      MODULOS.SEGUIMIENTO_VENTAS,
      MODULOS.INDICADORES,
      MODULOS.REDES,   // reactivado SOLO para WinTracker (2026-08)
      MODULOS.VENTAS_FORMULARIO,
      MODULOS.GUIA_COMERCIAL,
      MODULOS.RESUMEN_NOVONET,
      MODULOS.RESUMEN_VELSA,
      MODULOS.BOT_AUDITOR,
      ...MODULOS_GERENCIALES,
    ],
  },
  VELSA: {
    USUARIO: [
      MODULOS.VISTA_ASESOR_VELSA,
      MODULOS.SEGUIMIENTO_VELSA,
      MODULOS.VENTAS_FORMULARIO,
      MODULOS.GUIA_COMERCIAL,
    ],
    // 👁️ CONSULTOR: solo puede ver el reporte de Redes (VELSA)
    CONSULTOR: [
      MODULOS.REDES_VELSA,   // reactivado (Redes, 2026-08-19)
      MODULOS.BOT_AUDITOR,
    ],
    SUPERVISOR: [
      MODULOS.VISTA_ASESOR_VELSA,
      MODULOS.SEGUIMIENTO_VELSA,
      MODULOS.INDICADORES_VELSA,
      MODULOS.VENTAS_FORMULARIO,
      MODULOS.GUIA_COMERCIAL,
      MODULOS.BOT_AUDITOR,
    ],
    ANALISTA: [
      MODULOS.VISTA_ASESOR_VELSA,
      MODULOS.SEGUIMIENTO_VELSA,
      MODULOS.INDICADORES_VELSA,
      MODULOS.REDES_VELSA,   // reactivado (Redes, 2026-08-19)
      MODULOS.VENTAS_FORMULARIO,
      MODULOS.GUIA_COMERCIAL,
      MODULOS.RESUMEN_NOVONET,
      MODULOS.RESUMEN_VELSA,
      MODULOS.BOT_AUDITOR,
      ...MODULOS_GERENCIALES,
    ],
    GERENCIA: [
      MODULOS.VISTA_ASESOR_VELSA,
      MODULOS.SEGUIMIENTO_VELSA,
      MODULOS.INDICADORES_VELSA,
      MODULOS.REDES_VELSA,   // reactivado (Redes, 2026-08-19)
      MODULOS.VENTAS_FORMULARIO,
      MODULOS.GUIA_COMERCIAL,
      MODULOS.RESUMEN_NOVONET,
      MODULOS.RESUMEN_VELSA,
      MODULOS.BOT_AUDITOR,
      ...MODULOS_GERENCIALES,
    ],
    ADMINISTRADOR: [
      MODULOS.VISTA_ASESOR_VELSA,
      MODULOS.SEGUIMIENTO_VELSA,
      MODULOS.INDICADORES_VELSA,
      MODULOS.REDES_VELSA,   // reactivado (Redes, 2026-08-19)
      MODULOS.VENTAS_FORMULARIO,
      MODULOS.GUIA_COMERCIAL,
      MODULOS.RESUMEN_NOVONET,
      MODULOS.RESUMEN_VELSA,
      MODULOS.BOT_AUDITOR,
      ...MODULOS_GERENCIALES,
    ],
  },
};

function obtenerPermisosUsuario(empresa, perfil) {
  const empresaNorm = empresa?.toUpperCase();
  const perfilNorm = perfil?.toUpperCase();

  if (perfilNorm === 'ADMINISTRADOR') {
    return Object.values(MODULOS);
  }

  // TTHH es transversal: se resuelve ANTES del lookup por empresa, para que
  // vea Novonet y Velsa sin importar a qué empresa pertenece su usuario.
  // Se devuelve una copia para que nadie pueda mutar MODULOS_TTHH por
  // referencia desde afuera.
  if (perfilNorm === 'TTHH') {
    return [...MODULOS_TTHH];
  }

  if (!PERMISOS_POR_EMPRESA_PERFIL[empresaNorm]) {
    console.warn(`⚠️ Empresa no configurada: ${empresaNorm}`);
    return [];
  }

  if (!PERMISOS_POR_EMPRESA_PERFIL[empresaNorm][perfilNorm]) {
    console.warn(`⚠️ Perfil no configurado para ${empresaNorm}: ${perfilNorm} → fallback USUARIO`);
    return PERMISOS_POR_EMPRESA_PERFIL[empresaNorm]['USUARIO'] || [];
  }

  return PERMISOS_POR_EMPRESA_PERFIL[empresaNorm][perfilNorm];
}

function puedeAccederAlModulo(empresa, perfil, modulo) {
  return obtenerPermisosUsuario(empresa, perfil).includes(modulo);
}

module.exports = {
  MODULOS,
  PERMISOS_POR_EMPRESA_PERFIL,
  obtenerPermisosUsuario,
  puedeAccederAlModulo,
};