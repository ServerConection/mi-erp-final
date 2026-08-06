/**
 * PAUTA OBJETIVOS CONTROLLER
 *
 * Objetivos diarios de pauta (forecast comercial) por campaña.
 * Alimenta las metas que se muestran en el módulo Indicadores.
 *
 * Tabla: public.pauta_objetivos_diarios
 *   (ver migrations/pauta_objetivos_diarios.sql)
 *
 * NOVONET = VIDIKA_GOOGLE + ARTS_GOOGLE + ARTS_FACEBOOK
 *
 * IMPORTANTE — este controller es 100% ADITIVO:
 *   Solo lee y escribe su propia tabla. No toca mestra_bitrix ni ninguna
 *   consulta existente del ERP. Si esta tabla estuviera vacía, los endpoints
 *   devuelven ceros y el módulo Indicadores sigue funcionando igual que antes.
 */

const pool = require('../config/db');

// Métricas que se agregan. Se declaran una sola vez para que el SELECT, el
// INSERT y la validación no se puedan desincronizar.
const METRICAS = [
  'inversion', 'leads', 'atc', 'fuera_cobertura',
  'inegociables', 'gestionables', 'efectividad',
];

const errorResponse = (res, etiqueta, err) => {
  console.error(`[PautaObjetivos][${etiqueta}]`, err.message);
  return res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message,
  });
};

// Normaliza empresa a NOVONET/VELSA. Por defecto NOVONET (retrocompatibilidad).
const normalizarEmpresa = (v) => {
  const e = String(v || '').trim().toUpperCase();
  return e === 'VELSA' ? 'VELSA' : 'NOVONET';
};

// Valida rango de fechas. Devuelve null si algo no cuadra.
const validarRango = (desde, hasta) => {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(String(desde || '')) || !re.test(String(hasta || ''))) return null;
  if (String(desde) > String(hasta)) return null;
  return { desde, hasta };
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ─────────────────────────────────────────────────────────────────────────
// GET /api/pauta-objetivos/resumen?fechaDesde=&fechaHasta=&empresa=
//
// Total acumulado del rango. Es el endpoint que consume Indicadores para
// pintar la meta junto a cada tarjeta.
// ─────────────────────────────────────────────────────────────────────────
async function getResumen(req, res) {
  try {
    const empresa = normalizarEmpresa(req.query.empresa);
    const rango = validarRango(req.query.fechaDesde, req.query.fechaHasta);
    if (!rango) {
      return res.status(400).json({
        success: false,
        error: 'fechaDesde y fechaHasta son requeridas en formato YYYY-MM-DD',
      });
    }

    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(inversion),       0)::float AS inversion,
        COALESCE(SUM(leads),           0)::float AS leads,
        COALESCE(SUM(atc),             0)::float AS atc,
        COALESCE(SUM(fuera_cobertura), 0)::float AS fuera_cobertura,
        COALESCE(SUM(inegociables),    0)::float AS inegociables,
        COALESCE(SUM(gestionables),    0)::float AS gestionables,
        COALESCE(SUM(efectividad),     0)::float AS efectividad,
        COUNT(DISTINCT fecha)::int               AS dias_con_objetivo
      FROM public.pauta_objetivos_diarios
      WHERE activo
        AND empresa = $1
        AND fecha BETWEEN $2::date AND $3::date
    `, [empresa, rango.desde, rango.hasta]);

    const d = rows[0] || {};
    // CPL se recalcula, nunca se promedia: promediar CPLs da un número falso.
    const cpl = d.leads > 0 ? d.inversion / d.leads : 0;

    return res.json({
      success: true,
      data: { ...d, cpl, empresa, fechaDesde: rango.desde, fechaHasta: rango.hasta },
    });
  } catch (err) {
    return errorResponse(res, 'getResumen', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// GET /api/pauta-objetivos/diario?fechaDesde=&fechaHasta=&empresa=
//
// Serie por día (todas las campañas sumadas). Para la gráfica meta vs real.
// ─────────────────────────────────────────────────────────────────────────
async function getDiario(req, res) {
  try {
    const empresa = normalizarEmpresa(req.query.empresa);
    const rango = validarRango(req.query.fechaDesde, req.query.fechaHasta);
    if (!rango) {
      return res.status(400).json({
        success: false,
        error: 'fechaDesde y fechaHasta son requeridas en formato YYYY-MM-DD',
      });
    }

    const { rows } = await pool.query(`
      SELECT
        fecha,
        SUM(inversion)::float       AS inversion,
        SUM(leads)::float           AS leads,
        SUM(atc)::float             AS atc,
        SUM(fuera_cobertura)::float AS fuera_cobertura,
        SUM(inegociables)::float    AS inegociables,
        SUM(gestionables)::float    AS gestionables,
        SUM(efectividad)::float     AS efectividad
      FROM public.pauta_objetivos_diarios
      WHERE activo
        AND empresa = $1
        AND fecha BETWEEN $2::date AND $3::date
      GROUP BY fecha
      ORDER BY fecha ASC
    `, [empresa, rango.desde, rango.hasta]);

    return res.json({ success: true, data: rows });
  } catch (err) {
    return errorResponse(res, 'getDiario', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// GET /api/pauta-objetivos?empresa=&fechaDesde=&fechaHasta=
//
// Filas crudas por campaña — es lo que consume la pantalla de carga/edición.
// ─────────────────────────────────────────────────────────────────────────
async function listar(req, res) {
  try {
    const empresa = normalizarEmpresa(req.query.empresa);
    const rango = validarRango(req.query.fechaDesde, req.query.fechaHasta);
    if (!rango) {
      return res.status(400).json({
        success: false,
        error: 'fechaDesde y fechaHasta son requeridas en formato YYYY-MM-DD',
      });
    }

    const { rows } = await pool.query(`
      SELECT id, empresa, campana, fecha, inversion, cpl, leads, atc,
             fuera_cobertura, inegociables, gestionables, efectividad,
             activo, actualizado_en
      FROM public.pauta_objetivos_diarios
      WHERE empresa = $1
        AND fecha BETWEEN $2::date AND $3::date
      ORDER BY fecha ASC, campana ASC
    `, [empresa, rango.desde, rango.hasta]);

    return res.json({ success: true, data: rows });
  } catch (err) {
    return errorResponse(res, 'listar', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// GET /api/pauta-objetivos/campanas?empresa=
// Catálogo de campañas ya cargadas (para poblar el selector de la pantalla).
// ─────────────────────────────────────────────────────────────────────────
async function getCampanas(req, res) {
  try {
    const empresa = normalizarEmpresa(req.query.empresa);
    const { rows } = await pool.query(`
      SELECT campana,
             MIN(fecha) AS desde,
             MAX(fecha) AS hasta,
             COUNT(*)::int AS dias
      FROM public.pauta_objetivos_diarios
      WHERE empresa = $1
      GROUP BY campana
      ORDER BY campana ASC
    `, [empresa]);
    return res.json({ success: true, data: rows });
  } catch (err) {
    return errorResponse(res, 'getCampanas', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// POST /api/pauta-objetivos
// Body: { empresa, campana, fecha, inversion, leads, atc, ... }
// Upsert por (empresa, campana, fecha).
// ─────────────────────────────────────────────────────────────────────────
async function upsert(req, res) {
  try {
    const empresa = normalizarEmpresa(req.body.empresa);
    const campana = String(req.body.campana || '').trim().toUpperCase();
    const fecha = String(req.body.fecha || '').trim();

    if (!campana) {
      return res.status(400).json({ success: false, error: 'campana es requerida' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return res.status(400).json({ success: false, error: 'fecha debe venir en formato YYYY-MM-DD' });
    }

    const v = Object.fromEntries(METRICAS.map((m) => [m, num(req.body[m])]));
    // CPL derivado, no se acepta del cliente: evita que la pantalla mande un
    // valor inconsistente con inversion/leads.
    const cpl = v.leads > 0 ? v.inversion / v.leads : 0;

    const { rows } = await pool.query(`
      INSERT INTO public.pauta_objetivos_diarios
        (empresa, campana, fecha, inversion, cpl, leads, atc,
         fuera_cobertura, inegociables, gestionables, efectividad)
      VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (empresa, campana, fecha) DO UPDATE SET
        inversion       = EXCLUDED.inversion,
        cpl             = EXCLUDED.cpl,
        leads           = EXCLUDED.leads,
        atc             = EXCLUDED.atc,
        fuera_cobertura = EXCLUDED.fuera_cobertura,
        inegociables    = EXCLUDED.inegociables,
        gestionables    = EXCLUDED.gestionables,
        efectividad     = EXCLUDED.efectividad,
        activo          = TRUE
      RETURNING *
    `, [empresa, campana, fecha, v.inversion, cpl, v.leads, v.atc,
        v.fuera_cobertura, v.inegociables, v.gestionables, v.efectividad]);

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return errorResponse(res, 'upsert', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// POST /api/pauta-objetivos/lote
// Body: { filas: [ {empresa, campana, fecha, ...}, ... ] }
//
// Carga masiva (un mes completo). Todo dentro de UNA transacción: si una fila
// falla, no queda el mes cargado a medias.
// ─────────────────────────────────────────────────────────────────────────
async function upsertLote(req, res) {
  const filas = Array.isArray(req.body.filas) ? req.body.filas : null;
  if (!filas || !filas.length) {
    return res.status(400).json({ success: false, error: 'filas debe ser un arreglo no vacío' });
  }
  if (filas.length > 2000) {
    return res.status(400).json({ success: false, error: 'Máximo 2000 filas por lote' });
  }

  // Validación previa: se revisa TODO antes de abrir la transacción.
  const preparadas = [];
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i] || {};
    const campana = String(f.campana || '').trim().toUpperCase();
    const fecha = String(f.fecha || '').trim();
    if (!campana) {
      return res.status(400).json({ success: false, error: `Fila ${i + 1}: campana es requerida` });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return res.status(400).json({ success: false, error: `Fila ${i + 1}: fecha inválida (usar YYYY-MM-DD)` });
    }
    const v = Object.fromEntries(METRICAS.map((m) => [m, num(f[m])]));
    preparadas.push({
      empresa: normalizarEmpresa(f.empresa), campana, fecha, ...v,
      cpl: v.leads > 0 ? v.inversion / v.leads : 0,
    });
  }

  try {
    const guardadas = await pool.transaction(async (client) => {
      let n = 0;
      for (const p of preparadas) {
        await client.query(`
          INSERT INTO public.pauta_objetivos_diarios
            (empresa, campana, fecha, inversion, cpl, leads, atc,
             fuera_cobertura, inegociables, gestionables, efectividad)
          VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (empresa, campana, fecha) DO UPDATE SET
            inversion       = EXCLUDED.inversion,
            cpl             = EXCLUDED.cpl,
            leads           = EXCLUDED.leads,
            atc             = EXCLUDED.atc,
            fuera_cobertura = EXCLUDED.fuera_cobertura,
            inegociables    = EXCLUDED.inegociables,
            gestionables    = EXCLUDED.gestionables,
            efectividad     = EXCLUDED.efectividad,
            activo          = TRUE
        `, [p.empresa, p.campana, p.fecha, p.inversion, p.cpl, p.leads, p.atc,
            p.fuera_cobertura, p.inegociables, p.gestionables, p.efectividad]);
        n++;
      }
      return n;
    });

    return res.json({ success: true, data: { guardadas } });
  } catch (err) {
    return errorResponse(res, 'upsertLote', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// PUT /api/pauta-objetivos/:id   { ...métricas, activo }
// ─────────────────────────────────────────────────────────────────────────
async function actualizar(req, res) {
  try {
    const { id } = req.params;
    if (!/^\d+$/.test(String(id))) {
      return res.status(400).json({ success: false, error: 'id inválido' });
    }

    const p = METRICAS.map((m) => (req.body[m] === undefined ? null : num(req.body[m])));

    const { rows } = await pool.query(`
      UPDATE public.pauta_objetivos_diarios SET
        inversion       = COALESCE($2, inversion),
        leads           = COALESCE($3, leads),
        atc             = COALESCE($4, atc),
        fuera_cobertura = COALESCE($5, fuera_cobertura),
        inegociables    = COALESCE($6, inegociables),
        gestionables    = COALESCE($7, gestionables),
        efectividad     = COALESCE($8, efectividad),
        activo          = COALESCE($9, activo),
        cpl             = CASE WHEN COALESCE($3, leads) > 0
                               THEN COALESCE($2, inversion) / COALESCE($3, leads)
                               ELSE 0 END
      WHERE id = $1
      RETURNING *
    `, [id, ...p, req.body.activo ?? null]);

    if (!rows.length) return res.status(404).json({ success: false, error: 'No encontrado' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return errorResponse(res, 'actualizar', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// DELETE /api/pauta-objetivos/:id  → baja lógica (activo = FALSE)
// No se borra físicamente: conviene conservar el histórico de objetivos.
// ─────────────────────────────────────────────────────────────────────────
async function desactivar(req, res) {
  try {
    const { id } = req.params;
    if (!/^\d+$/.test(String(id))) {
      return res.status(400).json({ success: false, error: 'id inválido' });
    }
    const { rows } = await pool.query(`
      UPDATE public.pauta_objetivos_diarios
      SET activo = FALSE
      WHERE id = $1
      RETURNING id
    `, [id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'No encontrado' });
    return res.json({ success: true, message: 'Objetivo desactivado' });
  } catch (err) {
    return errorResponse(res, 'desactivar', err);
  }
}

module.exports = {
  getResumen, getDiario, listar, getCampanas,
  upsert, upsertLote, actualizar, desactivar,
};
