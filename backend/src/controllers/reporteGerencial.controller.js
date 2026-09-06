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

async function getReporteGerencial(req, res) {
  const r = rango(req);
  if (!r) return res.status(400).json({ success: false, error: 'Rango de fechas inválido (máximo 400 días)' });

  // ARPU: cuanto deja en promedio una venta activada. No vive en la base —
  // depende del mix de planes del mes — asi que lo pone gerencia desde la
  // pantalla. Sin el, el punto de equilibrio no tiene sentido.
  const arpu = Number(req.query.arpu);
  const arpuValido = Number.isFinite(arpu) && arpu > 0;

  try {
    const [novonet, velsa] = await Promise.all([
      serieEmpresa('novonet', r),
      serieEmpresa('velsa', r),
    ]);

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
        { ...novonet, equilibrio: equilibrio(novonet) },
        { ...velsa,   equilibrio: equilibrio(velsa) },
      ],
    });
  } catch (err) {
    console.error('[ReporteGerencial]', err.message);
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) });
  }
}

module.exports = { getReporteGerencial, SERIES };
