/**
 * REPORTE GERENCIAL — salud comercial de Novonet y Velsa en una sola pantalla
 *
 * Lo que responde, que hoy exige abrir cuatro modulos distintos:
 *   ¿cuanto entro, cuanto se activo y cuanto costo — por dia y por empresa?
 *
 * DECISION ANALITICA IMPORTANTE (leer antes de comparar con otros tableros):
 * las activas se cuentan por FECHA DE INGRESO del lead, no por fecha de
 * activacion. Es la unica forma de dividir peras entre peras: la inversion del
 * 5 de septiembre se compara contra las ventas que ESA inversion genero, no
 * contra las que se instalaron ese dia (que vienen de campanas de semanas
 * atras). Por eso el CPA de aqui puede no cuadrar con un tablero que cuente por
 * fecha de instalacion — ninguno de los dos esta mal, miden cosas distintas.
 *
 * Los dias recientes tienen activas todavia inmaduras (una venta de hoy no se
 * instala hoy), asi que su CPA se ve alto. El frontend lo advierte.
 *
 * Cada empresa se consulta por separado y con su propio try/catch: si una
 * fuente falla, la otra empresa igual se muestra.
 */
const pool = require('../config/db');
const { esGestionableExpr } = require('../shared/etapas');

const fechaEc = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

function rango(req) {
  const hoy = fechaEc();
  const desde = req.query.fechaDesde || hoy.slice(0, 8) + '01';
  const hasta = req.query.fechaHasta || hoy;
  const dias = (new Date(hasta) - new Date(desde)) / 86400000;
  if (isNaN(dias) || dias < 0) return null;
  if (dias > 400) return null;   // un año y algo: tope para no barrer de mas
  return { desde, hasta };
}

// ── Serie diaria por empresa ────────────────────────────────────────────────
const SERIES = {
  novonet: {
    nombre: 'Novonet',
    sql: `
      SELECT mb.j_fecha_registro_sistema::date                       AS fecha,
             COUNT(*)::int                                            AS ingresos,
             COUNT(*) FILTER (WHERE ${esGestionableExpr('mb.b_etapa_de_la_negociacion')})::int AS gestionables,
             COUNT(*) FILTER (WHERE UPPER(TRIM(mb.j_netlife_estatus_real)) = 'ACTIVO')::int    AS activas
      FROM public.mestra_bitrix mb
      WHERE mb.j_id_bitrix IS NOT NULL
        AND mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
      GROUP BY 1 ORDER BY 1`,
    inversionSql: `
      SELECT fecha::date AS fecha, COALESCE(SUM(monto_usd), 0)::numeric AS inversion
      FROM public.novonet_inversion_redes
      WHERE fecha::date BETWEEN $1::date AND $2::date
      GROUP BY 1 ORDER BY 1`,
  },
  velsa: {
    nombre: 'Velsa',
    sql: `
      SELECT (mv.fecha_registro_jotform - INTERVAL '5 hours')::date   AS fecha,
             COUNT(*)::int                                            AS ingresos,
             COUNT(*) FILTER (WHERE ${esGestionableExpr('mv.etapa_crm')})::int          AS gestionables,
             COUNT(*) FILTER (WHERE UPPER(TRIM(mv.estado_venta)) = 'ACTIVO')::int       AS activas
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.id_jotform IS NOT NULL
        AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
      GROUP BY 1 ORDER BY 1`,
    inversionSql: `
      SELECT fecha::date AS fecha, COALESCE(SUM(monto_usd), 0)::numeric AS inversion
      FROM public.velsa_inversion_redes
      WHERE fecha::date BETWEEN $1::date AND $2::date
      GROUP BY 1 ORDER BY 1`,
  },
};

const iso = (f) => (f instanceof Date ? f.toISOString().slice(0, 10) : String(f).slice(0, 10));
const div = (a, b) => (b > 0 ? Number((a / b).toFixed(2)) : null);   // null = "no calculable", nunca 0 disfrazado

async function serieEmpresa(clave, { desde, hasta }) {
  const cfg = SERIES[clave];
  const base = { empresa: clave, nombre: cfg.nombre };

  let filas = [];
  try {
    const { rows } = await pool.query(cfg.sql, [desde, hasta]);
    filas = rows;
  } catch (err) {
    return { ...base, error: err.message, dias: [], kpis: null };
  }

  // La inversion es opcional: si su tabla no existe o falla, el reporte sigue
  // mostrando volumen (solo que sin costos).
  let inversionPorDia = {};
  let inversionDisponible = true;
  try {
    const { rows } = await pool.query(cfg.inversionSql, [desde, hasta]);
    rows.forEach((r) => { inversionPorDia[iso(r.fecha)] = Number(r.inversion || 0); });
  } catch (err) {
    inversionDisponible = false;
  }

  const dias = filas.map((r) => {
    const fecha = iso(r.fecha);
    const inversion = Number(inversionPorDia[fecha] || 0);
    return {
      fecha,
      ingresos: Number(r.ingresos || 0),
      gestionables: Number(r.gestionables || 0),
      activas: Number(r.activas || 0),
      inversion: Number(inversion.toFixed(2)),
      cpa: div(inversion, Number(r.activas || 0)),        // costo por venta activada
      cpl: div(inversion, Number(r.ingresos || 0)),       // costo por lead ingresado
    };
  });

  const sum = (k) => dias.reduce((a, d) => a + (d[k] || 0), 0);
  const ingresos = sum('ingresos');
  const gestionables = sum('gestionables');
  const activas = sum('activas');
  const inversion = Number(sum('inversion').toFixed(2));

  return {
    ...base,
    inversion_disponible: inversionDisponible,
    dias,
    kpis: {
      ingresos, gestionables, activas, inversion,
      cpa: div(inversion, activas),
      cpl: div(inversion, ingresos),
      pct_gestionable: div(gestionables * 100, ingresos),
      pct_efectividad: div(activas * 100, ingresos),   // activas sobre ingresos
    },
  };
}

// ── Tendencia dentro del periodo ────────────────────────────────────────────
// Pendiente de una recta ajustada por minimos cuadrados sobre las activas
// diarias. Interesa el SIGNO y la magnitud relativa, no el numero: dice si la
// operacion venia subiendo o cayendo durante el periodo, algo que el total no
// muestra (dos meses con las mismas ventas pueden ser uno creciendo y otro
// desplomandose).
function pendienteDiaria(dias, campo = 'activas') {
  const n = dias.length;
  if (n < 3) return null;                      // con menos de 3 puntos no hay tendencia
  const y = dias.map((d) => Number(d[campo] || 0));
  const sumX = (n - 1) * n / 2;
  const sumY = y.reduce((a, v) => a + v, 0);
  const sumXY = y.reduce((a, v, i) => a + i * v, 0);
  const sumXX = y.reduce((a, _, i) => a + i * i, 0);
  const den = n * sumXX - sumX * sumX;
  if (den === 0) return null;
  const pendiente = (n * sumXY - sumX * sumY) / den;   // unidades por dia
  const promedio = sumY / n;
  return {
    por_dia: Number(pendiente.toFixed(2)),
    // Cuanto representa esa pendiente frente al promedio diario: hace
    // comparable a Novonet con Velsa aunque manejen volumenes distintos.
    pct_diario: promedio > 0 ? Number(((pendiente / promedio) * 100).toFixed(2)) : null,
    direccion: pendiente > 0.05 ? 'SUBIENDO' : pendiente < -0.05 ? 'BAJANDO' : 'ESTABLE',
  };
}

// Variacion % contra el periodo anterior. null cuando la base es 0: un cambio
// desde cero no es "infinito por ciento", simplemente no es comparable.
const variacion = (actual, previo) => {
  const a = Number(actual || 0), p = Number(previo || 0);
  if (!p) return null;
  return Number((((a - p) / p) * 100).toFixed(1));
};

// Periodo inmediatamente anterior, del mismo largo. Comparar septiembre contra
// agosto solo tiene sentido si ambos miden la misma cantidad de dias.
function rangoPrevio({ desde, hasta }) {
  const d = new Date(desde + 'T00:00:00Z');
  const h = new Date(hasta + 'T00:00:00Z');
  const dias = Math.round((h - d) / 86400000) + 1;
  const hastaPrev = new Date(d.getTime() - 86400000);
  const desdePrev = new Date(hastaPrev.getTime() - (dias - 1) * 86400000);
  const iso10 = (x) => x.toISOString().slice(0, 10);
  return { desde: iso10(desdePrev), hasta: iso10(hastaPrev), dias };
}

async function getReporteGerencial(req, res) {
  const r = rango(req);
  if (!r) return res.status(400).json({ success: false, error: 'Rango de fechas inválido (máximo 400 días)' });

  // ARPU: cuanto deja en promedio una venta activada. No vive en la base —
  // depende del mix de planes del mes — asi que lo pone gerencia desde la
  // pantalla. Sin el, el punto de equilibrio no tiene sentido.
  const arpu = Number(req.query.arpu);
  const arpuValido = Number.isFinite(arpu) && arpu > 0;

  try {
    const prev = rangoPrevio(r);
    const [novonet, velsa, novonetPrev, velsaPrev] = await Promise.all([
      serieEmpresa('novonet', r),
      serieEmpresa('velsa', r),
      serieEmpresa('novonet', prev),
      serieEmpresa('velsa', prev),
    ]);

    // Comparativa con el periodo anterior + hacia donde iba dentro del periodo.
    const conTendencia = (emp, empPrev) => {
      const k = emp.kpis, kp = empPrev?.kpis;
      return {
        ...emp,
        tendencia: !k ? null : {
          periodo_previo: prev,
          previo: kp || null,
          variacion: kp ? {
            ingresos:  variacion(k.ingresos,  kp.ingresos),
            activas:   variacion(k.activas,   kp.activas),
            inversion: variacion(k.inversion, kp.inversion),
            // En el CPA, BAJAR es bueno: cuesta menos traer una venta.
            cpa:       variacion(k.cpa,       kp.cpa),
            efectividad: variacion(k.pct_efectividad, kp.pct_efectividad),
          } : null,
          dentro_del_periodo: {
            activas:  pendienteDiaria(emp.dias, 'activas'),
            ingresos: pendienteDiaria(emp.dias, 'ingresos'),
          },
        },
      };
    };

    const equilibrio = (emp) => {
      if (!arpuValido || !emp.kpis) return null;
      const { inversion, activas } = emp.kpis;
      const ingresoTotal = activas * arpu;
      return {
        arpu,
        ingreso_estimado: Number(ingresoTotal.toFixed(2)),
        margen: Number((ingresoTotal - inversion).toFixed(2)),
        // Cuantas activas hacen falta para cubrir lo invertido.
        activas_para_equilibrio: arpu > 0 ? Math.ceil(inversion / arpu) : null,
        // Cuanto falta (o sobra) respecto de ese punto.
        diferencia_activas: arpu > 0 ? activas - Math.ceil(inversion / arpu) : null,
        // Techo de lo que se puede pagar por venta sin perder plata.
        cpa_maximo_rentable: arpu,
        rentable: ingresoTotal >= inversion,
      };
    };

    res.json({
      success: true,
      rango: r,
      generado_en: new Date().toISOString(),
      nota_metodologia:
        'Las activas se cuentan por fecha de INGRESO del lead (cohorte), no por fecha de instalación: ' +
        'así la inversión de un día se compara contra las ventas que esa inversión generó. ' +
        'Los días más recientes muestran un CPA alto porque sus ventas todavía no maduran.',
      empresas: [
        { ...conTendencia(novonet, novonetPrev), equilibrio: equilibrio(novonet) },
        { ...conTendencia(velsa,   velsaPrev),   equilibrio: equilibrio(velsa) },
      ],
    });
  } catch (err) {
    console.error('[ReporteGerencial]', err.message);
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) });
  }
}

module.exports = { getReporteGerencial, SERIES };
