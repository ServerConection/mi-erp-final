/**
 * COSTOS BOLSA LEADS — cuánto le costó la pauta a cada empresa.
 *
 * Toda la pauta (ARTS, Vidika, Velsa) entra a Bolsa Leads y la Bolsa la reparte.
 * El costo se asigna POR DÍA:
 *   CPL del día   = inversión del día (todas las agencias) / leads que repartió la Bolsa ese día
 *   costo empresa = Σ días (CPL del día × leads que recibió esa empresa ese día)
 * Así, si un día la pauta salió más cara, ese día pesa más para quien recibió más.
 * La inversión de días sin leads repartidos queda aparte ("sin asignar").
 *
 * Eficiencia: ventas ingresadas y activas de los leads que recibió cada empresa
 * (envios_ventas cruzado por ID de Bitrix) → CPA = costo / ventas.
 * Funciones puras (sin base de datos) para poder probarlas.
 */
const EMPRESAS = ['novonet', 'velsa', 'semillero'];
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const div = (a, b) => (b > 0 ? r2(a / b) : null);           // null = no calculable (nunca un 0 falso)
const pct = (a, b) => (b > 0 ? Math.round((a * 1000) / b) / 10 : null);

// Nombre legible de la fuente de inversión
const nombreFuente = (tabla, origen) => {
  const o = String(origen || '').toUpperCase();
  if (o.includes('WINTRACKER_ARTS')) return 'ARTS';
  if (o.includes('WINTRACKER_VIDIKA')) return 'VIDIKA';
  if (o.includes('WINTRACKER_VELSA')) return 'VELSA';
  return `${tabla === 'velsa' ? 'VELSA' : 'NOVONET'} · ${String(origen || 'SIN ORIGEN').trim()}`;
};

/**
 * entregas:  [{ deal, empresa, fecha:'YYYY-MM-DD' }]   (solo estado 'entregado')
 * inversion: [{ fecha:'YYYY-MM-DD', tabla:'novonet'|'velsa', origen, monto }]
 * ventas:    Map deal → { ventas, activas }
 */
const calcularCostos = ({ entregas = [], inversion = [], ventas = new Map() }) => {
  const dias = new Map();
  const dia = (f) => {
    if (!dias.has(f)) dias.set(f, { fecha: f, inversion: 0, leads: 0, ...Object.fromEntries(EMPRESAS.map((e) => [e, 0])) });
    return dias.get(f);
  };
  const fuentes = new Map();
  for (const i of inversion) {
    const m = Number(i.monto) || 0;
    dia(i.fecha).inversion += m;
    const f = nombreFuente(i.tabla, i.origen);
    fuentes.set(f, (fuentes.get(f) || 0) + m);
  }
  for (const e of entregas) {
    const d = dia(e.fecha);
    d.leads++;
    if (EMPRESAS.includes(e.empresa)) d[e.empresa]++;
  }

  const porDia = [...dias.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((d) => {
    const cpl = d.leads ? d.inversion / d.leads : null;
    const fila = { ...d, inversion: r2(d.inversion), cpl: cpl === null ? null : r2(cpl) };
    for (const e of EMPRESAS) fila[`costo_${e}`] = cpl === null ? 0 : r2(cpl * d[e]);
    fila.sin_asignar = d.leads ? 0 : r2(d.inversion);
    return fila;
  });
  const cplDe = new Map(porDia.map((d) => [d.fecha, d.leads ? dias.get(d.fecha).inversion / d.leads : 0]));

  const emp = Object.fromEntries(EMPRESAS.map((e) => [e, { empresa: e, leads: 0, costo: 0, ventas: 0, activas: 0, leads_con_venta: 0 }]));
  const detalle = entregas.map((e) => {
    const v = ventas.get(String(e.deal)) || { ventas: 0, activas: 0 };
    const costo = cplDe.get(e.fecha) || 0;
    const x = emp[e.empresa];
    if (x) {
      x.leads++; x.costo += costo; x.ventas += v.ventas; x.activas += v.activas;
      if (v.ventas > 0) x.leads_con_venta++;
    }
    return { deal: String(e.deal), empresa: e.empresa, fecha: e.fecha, costo: r2(costo), ventas: v.ventas, activas: v.activas };
  });

  const inversionTotal = porDia.reduce((s, d) => s + d.inversion, 0);
  const sinAsignar = porDia.reduce((s, d) => s + d.sin_asignar, 0);
  const t = Object.values(emp).reduce((a, x) => ({
    leads: a.leads + x.leads, costo: a.costo + x.costo, ventas: a.ventas + x.ventas,
    activas: a.activas + x.activas, leads_con_venta: a.leads_con_venta + x.leads_con_venta,
  }), { leads: 0, costo: 0, ventas: 0, activas: 0, leads_con_venta: 0 });

  const porEmpresa = Object.values(emp).map((x) => ({
    ...x,
    costo: r2(x.costo),
    pct_leads: pct(x.leads, t.leads),
    pct_costo: pct(x.costo, t.costo),
    cpl: div(x.costo, x.leads),
    cpa: div(x.costo, x.ventas),                 // costo por venta ingresada
    cpa_activa: div(x.costo, x.activas),         // costo por venta activa
    conversion: pct(x.leads_con_venta, x.leads), // % de leads que tuvieron al menos 1 venta
  }));

  // Ranking de eficiencia: menor costo por venta = más eficiente (sin ventas va al final)
  const ranking = [...porEmpresa].filter((x) => x.leads > 0)
    .sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity))
    .map((x, i) => ({ puesto: i + 1, empresa: x.empresa, cpa: x.cpa, conversion: x.conversion }));

  return {
    totales: {
      inversion: r2(inversionTotal), inversion_asignada: r2(t.costo), inversion_sin_asignar: r2(sinAsignar),
      leads: t.leads, ventas: t.ventas, activas: t.activas, leads_con_venta: t.leads_con_venta,
      cpl: div(t.costo, t.leads), cpa: div(t.costo, t.ventas), cpa_activa: div(t.costo, t.activas),
      conversion: pct(t.leads_con_venta, t.leads),
      dias: porDia.length, dias_con_leads: porDia.filter((d) => d.leads > 0).length,
    },
    porEmpresa, ranking, porDia,
    porFuente: [...fuentes.entries()].map(([fuente, monto]) => ({ fuente, monto: r2(monto) })).sort((a, b) => b.monto - a.monto),
    detalle,
  };
};

// ── Orígenes y agencias ──────────────────────────────────────────────────────
// El origen del lead (campo "source" de Bitrix) define la campaña. La agencia
// sale de los catálogos del módulo Redes (novonet_lineas_canal / velsa_lineas_canal)
// y, si el origen no está ahí, del mapa histórico (ORIGEN_A_CANAL de origenesRedes).
const normalizarOrigen = (o) => String(o ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
const agenciaCanonica = (valor) => {
  const v = normalizarOrigen(valor);
  if (!v) return null;
  if (/\bARS?TS?\b|^ARST|^ARTS/.test(v)) return 'ARTS';
  if (/VIDI[KC]A/.test(v)) return 'VIDIKA';
  if (/VELSA/.test(v)) return 'VELSA';
  return v;   // otros grupos (REMARKETING, POR RECOMENDACIÓN…) se muestran con su nombre
};
/**
 * catalogo: Map origenNormalizado → agencia (de las tablas *_lineas_canal)
 * historico: objeto origenNormalizado → canal (ORIGEN_A_CANAL)
 */
const resolverAgencia = (origen, catalogo = new Map(), historico = {}) => resolverOrigen(origen, catalogo, historico).agencia;

/**
 * { agencia, subagencia } de un origen.
 *   agencia    = grupo que paga la pauta (ARTS / VIDIKA / VELSA / otro)
 *   subagencia = el valor tal cual del catálogo (VELSA 1, VELSA 2, ARTS GOOGLE…)
 */
const resolverOrigen = (origen, catalogo = new Map(), historico = {}) => {
  const o = normalizarOrigen(origen);
  if (!o) return { agencia: 'SIN ORIGEN', subagencia: 'SIN ORIGEN' };
  const crudo = normalizarOrigen(catalogo.get(o)) || normalizarOrigen(historico[o]);
  if (!crudo) return { agencia: 'SIN AGENCIA', subagencia: 'SIN AGENCIA' };
  const agencia = agenciaCanonica(crudo);
  return { agencia, subagencia: crudo === 'ARST' ? 'ARTS' : crudo.replace(/^ARST\b/, 'ARTS') };
};

/**
 * Leads por empresa según agencia, sub-agencia y origen.
 * detalle: [{ deal, empresa, ventas }]   origenes: Map deal → origen
 */
const agruparPorOrigen = ({ detalle = [], origenes = new Map(), catalogo = new Map(), historico = {} }) => {
  const nuevo = () => ({ total: 0, ventas: 0, ...Object.fromEntries(EMPRESAS.flatMap((e) => [[e, 0], [`ventas_${e}`, 0]])) });
  const ag = new Map(), sub = new Map(), og = new Map();
  for (const d of detalle) {
    const origen = normalizarOrigen(origenes.get(String(d.deal))) || 'SIN ORIGEN';
    const { agencia, subagencia } = resolverOrigen(origen === 'SIN ORIGEN' ? '' : origen, catalogo, historico);
    d.origen = origen; d.agencia = agencia; d.subagencia = subagencia;
    for (const [mapa, clave, base] of [
      [ag, agencia, { agencia }],
      [sub, `${agencia}|${subagencia}`, { agencia, subagencia }],
      [og, `${agencia}|${subagencia}|${origen}`, { agencia, subagencia, origen }],
    ]) {
      if (!mapa.has(clave)) mapa.set(clave, { ...base, ...nuevo() });
      const x = mapa.get(clave);
      x.total++; x.ventas += d.ventas || 0;
      if (EMPRESAS.includes(d.empresa)) { x[d.empresa]++; x[`ventas_${d.empresa}`] += d.ventas || 0; }
    }
  }
  const orden = (a, b) => b.total - a.total;
  return {
    porAgencia: [...ag.values()].sort(orden),
    porSubagencia: [...sub.values()].sort((a, b) => a.agencia.localeCompare(b.agencia) || orden(a, b)),
    porOrigen: [...og.values()].sort((a, b) => a.agencia.localeCompare(b.agencia) || a.subagencia.localeCompare(b.subagencia) || orden(a, b)),
  };
};

/**
 * Cuánto costó cada agencia y cuánto le tocó a cada empresa.
 *   inversión de la agencia (ARTS / VIDIKA / VELSA, de las tablas de inversión)
 *   CPL agencia   = inversión / leads de esa agencia que repartió la Bolsa
 *   costo empresa = CPL agencia × leads de esa agencia que recibió la empresa
 * Las sub-agencias (VELSA 1, VELSA 2…) usan el CPL de su agencia: la inversión
 * llega por agencia, no por sub-agencia.
 */
const grupoDeFuente = (fuente) => agenciaCanonica(String(fuente || '').replace(/^(NOVONET|VELSA) · /, '')) || 'SIN AGENCIA';
const costosPorAgencia = ({ porAgencia = [], porSubagencia = [], porFuente = [] }) => {
  const inv = new Map();
  for (const f of porFuente) {
    const g = grupoDeFuente(f.fuente);
    inv.set(g, (inv.get(g) || 0) + (Number(f.monto) || 0));
  }
  const conCosto = (x, cpl) => {
    const out = { ...x, cpl: cpl === null ? null : r2(cpl) };
    let costo = 0;
    for (const e of EMPRESAS) { out[`costo_${e}`] = cpl === null ? null : r2(cpl * x[e]); costo += cpl === null ? 0 : cpl * x[e]; }
    out.costo = cpl === null ? null : r2(costo);
    out.cpa = cpl === null ? null : div(costo, x.ventas);
    out.conversion_ventas = pct(x.ventas, x.total);
    return out;
  };
  const cplDe = new Map();
  const agencias = porAgencia.map((a) => {
    const inversion = inv.has(a.agencia) ? r2(inv.get(a.agencia)) : null;
    const cpl = inversion !== null && a.total ? inversion / a.total : null;
    cplDe.set(a.agencia, cpl);
    return { ...conCosto(a, cpl), inversion };
  });
  // Agencias con inversión pero sin leads en la Bolsa
  for (const [g, monto] of inv) {
    if (!porAgencia.some((a) => a.agencia === g)) {
      agencias.push({ agencia: g, inversion: r2(monto), total: 0, ventas: 0, cpl: null, costo: null, cpa: null,
        ...Object.fromEntries(EMPRESAS.flatMap((e) => [[e, 0], [`ventas_${e}`, 0], [`costo_${e}`, null]])) });
    }
  }
  return {
    porAgencia: agencias,
    porSubagencia: porSubagencia.map((x) => conCosto(x, cplDe.get(x.agencia) ?? null)),
  };
};

module.exports = { calcularCostos, nombreFuente, EMPRESAS, normalizarOrigen, resolverAgencia, resolverOrigen, agruparPorOrigen, costosPorAgencia };
