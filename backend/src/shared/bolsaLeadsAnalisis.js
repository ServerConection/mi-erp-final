/**
 * ANÁLISIS DEL PILOTO BOLSA LEADS — funciones puras (sin base de datos ni Bitrix).
 *
 *  1) Embudo por empresa (y por agencia): lead → gestionable → venta subida →
 *     ingreso (venta en envios_ventas) → activa. Más la etapa ACTUAL de los leads
 *     en Bitrix, para ver dónde se quedan.
 *  2) Por asesor: leads, gestionables, ventas, activas, conversión, costo y CPA.
 *  3) Por hora y día de entrega: leads, ventas y conversión; leads que esperaron
 *     fuera de horario y leads que se pasaron a otra empresa por falta de conectados.
 *  4) Antes vs piloto: mismo cálculo en los días previos a la Bolsa y en el piloto.
 */
const { esEtapaGestionable, normalizarEtapa } = require('./etapas');

const EMPRESAS = ['novonet', 'velsa', 'semillero'];
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const div = (a, b) => (b > 0 ? r2(a / b) : null);
const pct = (a, b) => (b > 0 ? Math.round((a * 1000) / b) / 10 : null);
const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const esVentaSubida = (etapa) => /VENTA SUBIDA/.test(normalizarEtapa(etapa));

// Un paso del embudo para un grupo de leads
const pasos = (leads) => {
  const n = leads.length;
  const gest = leads.filter((l) => l.gestionable).length;
  const subida = leads.filter((l) => l.ventaSubida || l.ventas > 0).length;
  const ingreso = leads.filter((l) => l.ventas > 0).length;
  const activa = leads.filter((l) => l.activas > 0).length;
  return {
    leads: n,
    gestionables: gest, pct_gestionables: pct(gest, n),
    venta_subida: subida, pct_venta_subida: pct(subida, n),
    ingresos: ingreso, pct_ingresos: pct(ingreso, n),
    activas: activa, pct_activas: pct(activa, n),
    ventas: leads.reduce((s, l) => s + l.ventas, 0),
    costo: r2(leads.reduce((s, l) => s + l.costo, 0)),
  };
};

/**
 * detalle:  [{ deal, empresa, fecha, costo, ventas, activas, agencia }]   (de calcularCostos + orígenes)
 * extra:    Map deal → { hora, dow, salto, saltoDe, viaCola }               (de bolsa_leads_entregas)
 * bitrix:   Map deal → { etapa, asesor }                                   (etapa y responsable actuales)
 * enEspera: cuántos leads esperaron fuera de horario
 */
const analizarPiloto = ({ detalle = [], extra = new Map(), bitrix = new Map(), enEspera = 0 }) => {
  const leads = detalle.map((d) => {
    const x = extra.get(String(d.deal)) || {};
    const b = bitrix.get(String(d.deal)) || {};
    const etapa = b.etapa || 'SIN DATO EN BITRIX';
    return {
      ...d, ventas: Number(d.ventas) || 0, activas: Number(d.activas) || 0, costo: Number(d.costo) || 0,
      etapa, asesor: b.asesor || 'SIN RESPONSABLE',
      gestionable: b.etapa ? esEtapaGestionable(b.etapa) : false,
      ventaSubida: esVentaSubida(b.etapa),
      hora: x.hora ?? null, dow: x.dow ?? null, salto: !!x.salto, saltoDe: x.saltoDe || null, viaCola: !!x.viaCola,
    };
  });
  const de = (e) => leads.filter((l) => l.empresa === e);

  // 1) Embudo
  const embudo = {
    total: pasos(leads),
    porEmpresa: EMPRESAS.map((e) => ({ empresa: e, ...pasos(de(e)) })),
    porEmpresaAgencia: EMPRESAS.flatMap((e) => {
      const ags = [...new Set(de(e).map((l) => l.agencia || 'SIN AGENCIA'))];
      return ags.map((a) => ({ empresa: e, agencia: a, ...pasos(de(e).filter((l) => (l.agencia || 'SIN AGENCIA') === a)) }))
        .sort((a, b) => b.leads - a.leads);
    }),
    etapas: EMPRESAS.map((e) => {
      const cuenta = new Map();
      for (const l of de(e)) cuenta.set(l.etapa, (cuenta.get(l.etapa) || 0) + 1);
      return {
        empresa: e,
        etapas: [...cuenta.entries()].map(([etapa, n]) => ({ etapa, leads: n, pct: pct(n, de(e).length), gestionable: esEtapaGestionable(etapa) }))
          .sort((a, b) => b.leads - a.leads),
      };
    }),
  };

  // 2) Por asesor
  const asesores = EMPRESAS.map((e) => {
    const por = new Map();
    for (const l of de(e)) {
      if (!por.has(l.asesor)) por.set(l.asesor, []);
      por.get(l.asesor).push(l);
    }
    return {
      empresa: e,
      asesores: [...por.entries()].map(([asesor, ls]) => {
        const p = pasos(ls);
        return { asesor, ...p, conversion: p.pct_ingresos, cpa: div(p.costo, p.ventas) };
      }).sort((a, b) => b.leads - a.leads),
    };
  });

  // 3) Por hora y día de entrega
  const agrupar = (clave, valores, etiqueta) => valores.map((v) => {
    const ls = leads.filter((l) => l[clave] === v);
    const p = pasos(ls);
    return { [clave]: v, etiqueta: etiqueta(v), ...p, conversion: p.pct_ingresos, ...Object.fromEntries(EMPRESAS.map((e) => [e, ls.filter((l) => l.empresa === e).length])) };
  });
  const tiempo = {
    porHora: agrupar('hora', [...Array(24).keys()], (h) => `${String(h).padStart(2, '0')}:00`).filter((h) => h.leads > 0),
    porDia: agrupar('dow', [1, 2, 3, 4, 5, 6, 7], (d) => DIAS[d]).filter((d) => d.leads > 0),
    enEspera,
    viaCola: { ...pasos(leads.filter((l) => l.viaCola)), conversion: pct(leads.filter((l) => l.viaCola && l.ventas > 0).length, leads.filter((l) => l.viaCola).length) },
    directos: { ...pasos(leads.filter((l) => !l.viaCola)), conversion: pct(leads.filter((l) => !l.viaCola && l.ventas > 0).length, leads.filter((l) => !l.viaCola).length) },
    saltos: EMPRESAS.map((e) => ({
      empresa: e,
      recibidos: leads.filter((l) => l.empresa === e && l.salto).length,             // le llegaron porque otra no tenía conectados
      cedidos: leads.filter((l) => l.saltoDe === e).length,                           // se fueron a otra porque esta no tenía conectados
      ventas_recibidos: leads.filter((l) => l.empresa === e && l.salto).reduce((s, l) => s + l.ventas, 0),
    })),
  };

  return { embudo, asesores, tiempo };
};

/**
 * 4) Antes vs piloto. Cada periodo: { dias, inversion, leads:{novonet,velsa,semillero}, ventas:{…} }
 * Se calcula igual en los dos: leads creados en el pipeline de cada empresa y
 * ventas ingresadas en esos días (todas, no solo de pauta) → comparación justa.
 */
const compararPeriodos = (antes, piloto) => {
  const armar = (p) => {
    const leads = EMPRESAS.reduce((s, e) => s + (p.leads?.[e] || 0), 0);
    const ventas = EMPRESAS.reduce((s, e) => s + (p.ventas?.[e] || 0), 0);
    return {
      ...p, leads_total: leads, ventas_total: ventas,
      leads_dia: p.dias ? r2(leads / p.dias) : null, ventas_dia: p.dias ? r2(ventas / p.dias) : null,
      inversion_dia: p.dias ? r2(p.inversion / p.dias) : null,
      cpl: div(p.inversion, leads), cpa: div(p.inversion, ventas), ventas_por_100_leads: pct(ventas, leads),
      porEmpresa: EMPRESAS.map((e) => ({ empresa: e, leads: p.leads?.[e] || 0, ventas: p.ventas?.[e] || 0, ventas_por_100_leads: pct(p.ventas?.[e] || 0, p.leads?.[e] || 0) })),
    };
  };
  const a = armar(antes), b = armar(piloto);
  const cambio = (x, y) => (x > 0 && y !== null ? Math.round(((y - x) * 1000) / x) / 10 : null);   // % de cambio
  return {
    antes: a, piloto: b,
    cambios: {
      cpl: cambio(a.cpl, b.cpl), cpa: cambio(a.cpa, b.cpa),
      leads_dia: cambio(a.leads_dia, b.leads_dia), ventas_dia: cambio(a.ventas_dia, b.ventas_dia),
      inversion_dia: cambio(a.inversion_dia, b.inversion_dia), ventas_por_100_leads: cambio(a.ventas_por_100_leads, b.ventas_por_100_leads),
    },
  };
};

// ── Tiempos de operación ─────────────────────────────────────────────────────
const horasEntre = (a, b) => (new Date(b) - new Date(a)) / 3600000;
const estad = (valores) => {
  const v = valores.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (!v.length) return { n: 0, mediana: null, promedio: null, p75: null };
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1) + 0.5))];
  return { n: v.length, mediana: r2(q(0.5)), promedio: r2(v.reduce((s, x) => s + x, 0) / v.length), p75: r2(q(0.75)) };
};
const enHoras = (lim, valores) => {
  const v = valores.filter((x) => Number.isFinite(x) && x >= 0);
  return v.length ? pct(v.filter((x) => x <= lim).length, v.length) : null;
};

/**
 * Tiempos desde que la Bolsa entregó el lead:
 *  - primera gestión: primer cambio de etapa en el pipeline de la empresa
 *  - venta subida: primera vez que llega a una etapa VENTA SUBIDA
 *  - venta ingresada: primer registro en envios_ventas
 * Y cuánto se queda cada lead en cada etapa (hasta que pasa a la siguiente).
 *
 * leads:     [{ deal, empresa, entregado_en }]
 * historial: Map deal → [{ etapa, categoria, t }] (ordenado)
 * primeraVenta: Map deal → fecha/hora
 * plazos:    { novonet: 5, velsa: 5, semillero: 5 } horas para pasar a venta subida
 * ahora:     para medir lo que sigue en una etapa
 */
const analizarTiempos = ({ leads = [], historial = new Map(), primeraVenta = new Map(), plazos = {}, ahora = new Date() }) => {
  const filas = leads.map((l) => {
    const t0 = l.entregado_en;
    // Solo lo que pasó desde la entrega y fuera del pipeline Bolsa Leads
    const h = (historial.get(String(l.deal)) || []).filter((x) => new Date(x.t) >= new Date(t0) - 60000 && x.categoria !== String(l.categoriaBolsa ?? '43'));
    const entrada = h[0] || null;                               // llegada a la etapa de entrada de la empresa
    const primerCambio = h.find((x, i) => i > 0 && x.etapa !== entrada?.etapa);
    const subida = h.find((x) => esVentaSubida(x.etapa));
    const venta = primeraVenta.get(String(l.deal));
    // Tiempo en cada etapa: desde que entra hasta el siguiente cambio
    const estadias = h.map((x, i) => ({
      etapa: x.etapa, horas: horasEntre(x.t, h[i + 1]?.t || ahora), abierta: !h[i + 1],
    }));
    return {
      empresa: l.empresa,
      gestion: primerCambio ? horasEntre(t0, primerCambio.t) : null,
      subida: subida ? horasEntre(t0, subida.t) : null,
      ingreso: venta ? horasEntre(t0, venta) : null,
      sinGestion: !primerCambio,
      estadias,
    };
  });

  const porEmpresa = EMPRESAS.map((e) => {
    const fs = filas.filter((f) => f.empresa === e);
    const plazo = plazos[e] ?? null;
    const subidas = fs.map((f) => f.subida);
    return {
      empresa: e, leads: fs.length, plazo_venta_subida_h: plazo,
      sin_gestion: fs.filter((f) => f.sinGestion).length,
      primera_gestion: { ...estad(fs.map((f) => f.gestion)), en_1h: enHoras(1, fs.map((f) => f.gestion)) },
      venta_subida: { ...estad(subidas), en_plazo: plazo !== null ? enHoras(plazo, subidas) : null },
      venta_ingresada: { ...estad(fs.map((f) => f.ingreso)), en_24h: enHoras(24, fs.map((f) => f.ingreso)) },
    };
  });

  const etapas = EMPRESAS.map((e) => {
    const por = new Map();
    for (const f of filas.filter((x) => x.empresa === e)) {
      for (const st of f.estadias) {
        if (!por.has(st.etapa)) por.set(st.etapa, { cerradas: [], abiertas: [] });
        por.get(st.etapa)[st.abierta ? 'abiertas' : 'cerradas'].push(st.horas);
      }
    }
    return {
      empresa: e,
      etapas: [...por.entries()].map(([etapa, x]) => ({
        etapa, gestionable: esEtapaGestionable(etapa),
        pasaron: x.cerradas.length + x.abiertas.length,
        siguen_ahi: x.abiertas.length,
        ...estad(x.cerradas),                     // tiempo hasta salir de la etapa
        espera_actual_mediana: estad(x.abiertas).mediana,
      })).sort((a, b) => b.pasaron - a.pasaron),
    };
  });

  return { porEmpresa, etapas };
};

module.exports = { analizarPiloto, compararPeriodos, analizarTiempos, esVentaSubida, DIAS };
