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
      MODULOS.REDES,
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
      MODULOS.REDES,
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
      MODULOS.REDES,
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
      MODULOS.REDES,
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
      MODULOS.REDES_VELSA,
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
      MODULOS.REDES_VELSA,
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
      MODULOS.REDES_VELSA,
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
      MODULOS.REDES_VELSA,
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