const API = import.meta.env.VITE_API_URL || '';
const ultimos = new Map();

// Evita el doble montaje de React StrictMode sin impedir una entrada posterior.
export function registrarAccesoModulo(modulo, moduloEmpresa = '') {
  const ahora = Date.now();
  const clave = `${modulo}|${moduloEmpresa}`;
  if (ahora - (ultimos.get(clave) || 0) < 2000) return;
  ultimos.set(clave, ahora);
  fetch(`${API}/api/wa/uso/acceso`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modulo, modulo_empresa: moduloEmpresa }),
    keepalive: true,
  }).catch(() => {});
}

export function registrarAccionModulo(modulo, accion, detalle = '', moduloEmpresa = '') {
  fetch(`${API}/api/wa/uso/accion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modulo, accion, detalle: String(detalle).slice(0, 2000), modulo_empresa: moduloEmpresa }),
    keepalive: true,
  }).catch(() => {});
}

const ETIQUETAS_FILTRO = {
  fechaDesde: 'Fecha desde', fechaHasta: 'Fecha hasta', fechaActivacionDesde: 'Activación desde',
  fechaActivacionHasta: 'Activación hasta', asesor: 'Asesor', supervisor: 'Supervisor',
  estadoNetlife: 'Estado Netlife', estadoRegularizacion: 'Regularización', etapaCRM: 'Etapa CRM',
  etapaJotform: 'Etapa Jotform', idBitrix: 'ID Bitrix', canal: 'Canal', origen: 'Origen',
  gestionables: 'Gestionables', empresa: 'Empresa', desde: 'Desde', hasta: 'Hasta',
};

export function registrarFiltrosModulo(modulo, filtros, contexto = 'tablero principal', moduloEmpresa = '') {
  const partes = Object.entries(filtros || {}).map(([clave, valor]) => {
    const contenido = Array.isArray(valor) ? valor.join(', ') : String(valor ?? '').trim();
    return `${ETIQUETAS_FILTRO[clave] || clave}: ${contenido || 'Todos'}`;
  });
  registrarAccionModulo(modulo, 'APLICO_FILTROS', `${contexto} · ${partes.join(' · ')}`, moduloEmpresa);
}

const textoLimpio = (valor) => String(valor || '').replace(/\s+/g, ' ').trim();

function etiquetaControl(control, indice) {
  const porFor = control.id && document.querySelector(`label[for="${CSS.escape(control.id)}"]`);
  const label = porFor || control.closest('label');
  if (label) {
    const copia = label.cloneNode(true);
    copia.querySelectorAll('input,select,textarea,button,option').forEach((n) => n.remove());
    const texto = textoLimpio(copia.textContent);
    if (texto) return texto;
  }
  return textoLimpio(control.getAttribute('aria-label') || control.name || control.id
    || control.placeholder || `Filtro ${indice + 1}`);
}

function valorControl(control) {
  if (control.type === 'checkbox') return control.checked ? 'Sí' : 'No';
  if (control.tagName === 'SELECT') return textoLimpio(control.selectedOptions?.[0]?.textContent || control.value);
  return textoLimpio(control.value);
}

function filtrosVisibles(boton) {
  const zona = boton.closest('form') || document.querySelector('main');
  const controles = [...(zona?.querySelectorAll('input, select') || [])]
    .filter((c) => !c.disabled && c.type !== 'hidden' && c.type !== 'search' && c.offsetParent !== null);
  const vistos = new Set();
  return controles.map((control, indice) => {
    const etiqueta = etiquetaControl(control, indice);
    const valor = valorControl(control);
    const clave = `${etiqueta}|${valor}`;
    if (!valor || vistos.has(clave)) return null;
    vistos.add(clave);
    return `${etiqueta}: ${valor}`;
  }).filter(Boolean).join(' · ');
}

function describirAccion(boton) {
  const texto = textoLimpio(boton.dataset.auditAction || boton.getAttribute('aria-label')
    || boton.title || boton.textContent || 'Botón');
  const normalizado = texto.toUpperCase();
  if (/APLICAR|FILTRAR|ACTUALIZAR|REFRESCAR/.test(normalizado)) {
    const filtros = filtrosVisibles(boton);
    return { accion: /ACTUALIZAR|REFRESCAR/.test(normalizado) ? 'ACTUALIZO_DATOS' : 'APLICO_FILTROS', detalle: filtros || texto };
  }
  if (/EXCEL|CSV|EXPORTAR|DESCARGAR/.test(normalizado)) return { accion: 'EXPORTO_REPORTE', detalle: texto };
  if (/PANTALLA COMPLETA/.test(normalizado)) return { accion: 'ACTIVO_PANTALLA_COMPLETA', detalle: texto };
  if (/MOSTRAR M[AÁ]S/.test(normalizado)) return { accion: 'AMPLIO_RESULTADOS', detalle: texto };
  return { accion: 'SELECCIONO_OPCION', detalle: texto };
}

// Audita botones de forma delegada: cubre filtros, pestañas, exportaciones,
// refrescos y aperturas de detalle sin almacenar valores escritos por el usuario.
export function usarAuditoriaModulo(modulo, useEffect, moduloEmpresa = '') {
  useEffect(() => {
    registrarAccesoModulo(modulo, moduloEmpresa);
    const alHacerClick = (evento) => {
      const boton = evento.target.closest('button');
      if (!boton || boton.disabled || boton.closest('nav, aside') || boton.dataset.auditManual === 'true') return;
      const { accion, detalle } = describirAccion(boton);
      registrarAccionModulo(modulo, accion, detalle, moduloEmpresa);
    };
    document.addEventListener('click', alHacerClick, true);
    return () => document.removeEventListener('click', alHacerClick, true);
  }, [modulo, moduloEmpresa]);
}
