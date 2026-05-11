const pool = require('../config/db');

const getFechaEcuador = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

const parseFecha = (col) =>
  `CASE WHEN ${col} IS NULL OR TRIM(${col}::text) = '' THEN NULL
        WHEN ${col}::text ~ '^\\d{4}-\\d{2}-\\d{2}' THEN ${col}::text::date
        ELSE TO_DATE(SUBSTRING(${col}::text FROM 5 FOR 11), 'Mon DD YYYY') END`;

// ─────────────────────────────────────────────────────────────────────────────
// Semanas del mes: Sem1 = día 1 → primer domingo
//                 Sem2 = lunes siguiente → siguiente domingo … etc.
// ─────────────────────────────────────────────────────────────────────────────
const getSemanasDelMes = (anio, mes) => {
  const primerDia  = new Date(anio, mes - 1, 1);
  const ultimoDia  = new Date(anio, mes, 0);
  const semanas    = [];
  let   inicio     = new Date(primerDia);
  let   numSemana  = 1;

  while (inicio <= ultimoDia) {
    const dow = inicio.getDay(); // 0=Dom … 6=Sab
    const diasHastaDom = dow === 0 ? 0 : 7 - dow;

    let fin = new Date(inicio);
    fin.setDate(inicio.getDate() + diasHastaDom);
    if (fin > ultimoDia) fin = new Date(ultimoDia);

    const pad = (n) => String(n).padStart(2, '0');
    semanas.push({
      numSemana,
      inicio: inicio.toLocaleDateString('en-CA'),
      fin:    fin.toLocaleDateString('en-CA'),
      label:  `Sem ${numSemana} (${inicio.getDate()}/${pad(mes)} - ${fin.getDate()}/${pad(mes)})`,
    });

    inicio = new Date(fin);
    inicio.setDate(fin.getDate() + 1);
    numSemana++;
  }
  return semanas;
};

// ─────────────────────────────────────────────────────────────────────────────
// JOIN lateral con fallback de mes (igual que indicadores.controller)
// ─────────────────────────────────────────────────────────────────────────────
const joinEmpleados = `
LEFT JOIN LATERAL (
  SELECT e2.supervisor
  FROM public.empleados e2
  WHERE e2.nombre_completo = mb.b_persona_responsable
  ORDER BY
    CASE WHEN e2.codigo = EXTRACT(MONTH FROM COALESCE(
        ${parseFecha('mb.b_cerrado')},
        ${parseFecha('mb.b_creado_el_fecha')}
    ))::text THEN 0 ELSE 1 END,
    e2.codigo::int DESC
  LIMIT 1
) e ON true`;

const ETAPAS_GESTIONABLES = `(
  'CONTACTO NUEVO','DOCUMENTOS PENDIENTES','NO INTERESA COSTO PLAN','VOLVER A LLAMAR',
  'GESTION DIARIA','VENTA SUBIDA','SEGUIMIENTO NEGOCIACIÓN','INNEGOCIABLE','CONTRATO NETLIFE',
  'CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA',
  'OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','OPORTUNIDADES',
  'VENTA ECUANET DIRECTA','VENTA DIRECTA ECUANET','GESTIÓN DIARIA',
  'SEGUIMIENTO NEGOCIACIÓN CON CONTACTO','SEGUIMIENTO SIN CONTACTO',
  'CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO',
  'SEGUIMIENTO NEGOCIACIÓN','DESCARTE PLAN DE 200','SEGUIMIENTO PLAN 200'
)`;

// ─────────────────────────────────────────────────────────────────────────────
const getComparativaSupervisores = async (req, res) => {
  try {
    const hoy     = getFechaEcuador();
    const hoyDate = new Date(hoy);

    const mesNum  = req.query.mes  ? parseInt(req.query.mes)  : hoyDate.getMonth() + 1;
    const anioNum = req.query.anio ? parseInt(req.query.anio) : hoyDate.getFullYear();
    const supFilt = req.query.supervisor || '';

    const pad    = (n) => String(n).padStart(2, '0');
    const desde  = `${anioNum}-${pad(mesNum)}-01`;
    const ultimo = new Date(anioNum, mesNum, 0).getDate();
    const hasta  = `${anioNum}-${pad(mesNum)}-${ultimo}`;

    let values      = [desde, hasta];
    let filterSup   = '';
    if (supFilt) {
      values.push(`%${supFilt}%`);
      filterSup = ` AND e.supervisor ILIKE $${values.length}`;
    }

    // ── QUERY 1: Totales por supervisor ────────────────────────────────────
    const queryTotales = `
      SELECT
        COALESCE(e.supervisor, 'SIN ASIGNAR') AS supervisor,
        COUNT(DISTINCT mb.b_id) FILTER (
          WHERE ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date
        ) AS leads_totales,
        COUNT(DISTINCT mb.b_id) FILTER (
          WHERE ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date
          AND mb.b_etapa_de_la_negociacion IN ${ETAPAS_GESTIONABLES}
        ) AS gestionables,
        COUNT(DISTINCT mb.j_id_bitrix) FILTER (
          WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
        ) AS ingresos_jot,
        COUNT(DISTINCT mb.j_id_bitrix) FILTER (
          WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
          AND mb.j_netlife_estatus_real = 'ACTIVO'
        ) AS activas,
        ROUND(
          COUNT(DISTINCT mb.j_id_bitrix) FILTER (
            WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
            AND mb.j_netlife_estatus_real = 'ACTIVO'
          )::numeric /
          NULLIF(COUNT(DISTINCT mb.j_id_bitrix) FILTER (
            WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
          ), 0) * 100, 1
        ) AS tasa_instalacion,
        COUNT(DISTINCT mb.j_id_bitrix) FILTER (
          WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
          AND mb.j_aplica_descuento_3ra_edad = 'SI POR TERCERA EDAD'
          AND mb.j_netlife_estatus_real = 'ACTIVO'
        ) AS activas_tercera_edad,
        COUNT(DISTINCT mb.j_id_bitrix) FILTER (
          WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
          AND mb.j_forma_pago = 'TARJETA DE CREDITO.'
        ) AS pagos_tarjeta,
        COUNT(DISTINCT mb.j_id_bitrix) FILTER (
          WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
          AND mb.j_estatus_regularizacion = 'POR REGULARIZAR'
        ) AS por_regularizar
      FROM mestra_bitrix mb
      ${joinEmpleados}
      WHERE (
        ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date
        OR mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
      ) ${filterSup}
      GROUP BY e.supervisor
      ORDER BY ingresos_jot DESC NULLS LAST
    `;

    // ── QUERY 2: Desglose semanal por supervisor (CTE con número de semana) ─
    //  Semana = días desde primer domingo del mes
    const querySemanales = `
      WITH primer_dom AS (
        SELECT (
          DATE_TRUNC('month', $1::date) +
          ((7 - EXTRACT(DOW FROM DATE_TRUNC('month', $1::date))::int) % 7) * INTERVAL '1 day'
        )::date AS pd
      ),
      crm AS (
        SELECT
          COALESCE(e.supervisor, 'SIN ASIGNAR') AS supervisor,
          CASE
            WHEN ${parseFecha('mb.b_creado_el_fecha')} <= (SELECT pd FROM primer_dom) THEN 1
            WHEN ${parseFecha('mb.b_creado_el_fecha')} <= (SELECT pd + 7  FROM primer_dom) THEN 2
            WHEN ${parseFecha('mb.b_creado_el_fecha')} <= (SELECT pd + 14 FROM primer_dom) THEN 3
            WHEN ${parseFecha('mb.b_creado_el_fecha')} <= (SELECT pd + 21 FROM primer_dom) THEN 4
            ELSE 5
          END AS num_semana,
          COUNT(DISTINCT mb.b_id) AS leads_totales,
          COUNT(DISTINCT mb.b_id) FILTER (
            WHERE mb.b_etapa_de_la_negociacion IN ${ETAPAS_GESTIONABLES}
          ) AS gestionables
        FROM mestra_bitrix mb
        ${joinEmpleados}
        WHERE ${parseFecha('mb.b_creado_el_fecha')} BETWEEN $1::date AND $2::date
        ${filterSup}
        GROUP BY 1, 2
      ),
      jot AS (
        SELECT
          COALESCE(e.supervisor, 'SIN ASIGNAR') AS supervisor,
          CASE
            WHEN mb.j_fecha_registro_sistema::date <= (SELECT pd FROM primer_dom) THEN 1
            WHEN mb.j_fecha_registro_sistema::date <= (SELECT pd + 7  FROM primer_dom) THEN 2
            WHEN mb.j_fecha_registro_sistema::date <= (SELECT pd + 14 FROM primer_dom) THEN 3
            WHEN mb.j_fecha_registro_sistema::date <= (SELECT pd + 21 FROM primer_dom) THEN 4
            ELSE 5
          END AS num_semana,
          COUNT(DISTINCT mb.j_id_bitrix) AS ingresos_jot,
          COUNT(DISTINCT mb.j_id_bitrix) FILTER (
            WHERE mb.j_netlife_estatus_real = 'ACTIVO'
          ) AS activas
        FROM mestra_bitrix mb
        ${joinEmpleados}
        WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
        ${filterSup}
        GROUP BY 1, 2
      )
      SELECT
        COALESCE(c.supervisor, j.supervisor)   AS supervisor,
        COALESCE(c.num_semana, j.num_semana)   AS num_semana,
        COALESCE(c.leads_totales, 0)            AS leads_totales,
        COALESCE(c.gestionables, 0)             AS gestionables,
        COALESCE(j.ingresos_jot, 0)             AS ingresos_jot,
        COALESCE(j.activas, 0)                  AS activas
      FROM crm c
      FULL OUTER JOIN jot j ON c.supervisor = j.supervisor AND c.num_semana = j.num_semana
      ORDER BY supervisor, num_semana
    `;

    const [resTotales, resSemanales] = await Promise.all([
      pool.query(queryTotales,   values),
      pool.query(querySemanales, values),
    ]);

    const semanas = getSemanasDelMes(anioNum, mesNum);

    const supervisoresComparativa = resTotales.rows.map(r => ({
      supervisor:            r.supervisor,
      leads_totales:         Number(r.leads_totales   || 0),
      gestionables:          Number(r.gestionables    || 0),
      ingresos_jot:          Number(r.ingresos_jot    || 0),
      activas:               Number(r.activas         || 0),
      tasa_instalacion:      Number(r.tasa_instalacion || 0),
      activas_tercera_edad:  Number(r.activas_tercera_edad || 0),
      pagos_tarjeta:         Number(r.pagos_tarjeta   || 0),
      por_regularizar:       Number(r.por_regularizar  || 0),
    }));

    const semanasDetalle = resSemanales.rows.map(r => ({
      supervisor:    r.supervisor,
      num_semana:    Number(r.num_semana),
      leads_totales: Number(r.leads_totales  || 0),
      gestionables:  Number(r.gestionables   || 0),
      ingresos_jot:  Number(r.ingresos_jot   || 0),
      activas:       Number(r.activas        || 0),
    }));

    const tot = supervisoresComparativa;
    res.json({
      success: true,
      mes: mesNum,
      anio: anioNum,
      semanas,
      supervisoresComparativa,
      semanasDetalle,
      resumen: {
        total_supervisores: tot.length,
        total_leads:        tot.reduce((a, r) => a + r.leads_totales, 0),
        total_gestionables: tot.reduce((a, r) => a + r.gestionables,  0),
        total_ingresos_jot: tot.reduce((a, r) => a + r.ingresos_jot,  0),
        total_activas:      tot.reduce((a, r) => a + r.activas,        0),
      },
    });

  } catch (error) {
    console.error('ERROR COMPARATIVA:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { getComparativaSupervisores };
