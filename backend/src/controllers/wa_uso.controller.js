const db = require('../config/db');
const erp = require('../config/dbErp');
const { esEtapaGestionable } = require('../shared/etapas');
const { getEmpresa } = require('../shared/repartoEmpresas');

const PERFILES_REPORTE = new Set(['ADMINISTRADOR', 'GERENCIA', 'GERENTE', 'SUPERVISOR', 'ANALISTA', 'COORDINADOR']);
const EMPRESAS = {
  NOVONET: 'gestionables_asignaciones',
  VELSA: 'velsa_gestionables_asignaciones',
};

const fechaValida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const nombreClave = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().replace(/\s+/g, ' ').toUpperCase();

function alcance(req) {
  const perfil = String(req.user?.perfil || '').toUpperCase();
  if (!PERFILES_REPORTE.has(perfil)) return null;
  const propia = String(req.user?.empresa || '').trim().toUpperCase();
  const solicitada = String(req.query.empresa || '').trim().toUpperCase();
  if (perfil === 'ADMINISTRADOR') return EMPRESAS[solicitada] ? solicitada : '';
  return EMPRESAS[propia] ? propia : '';
}

function validarRango(req, res) {
  const desde = req.query.desde;
  const hasta = req.query.hasta;
  if (!fechaValida(desde) || !fechaValida(hasta) || desde > hasta) {
    res.status(400).json({ success: false, error: 'Rango de fechas inválido' });
    return null;
  }
  const dias = (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000;
  if (dias > 92) {
    res.status(400).json({ success: false, error: 'El rango máximo es de 93 días' });
    return null;
  }
  return { desde, hasta };
}

async function listarAsignaciones(empresas, desde, hasta) {
  const partes = empresas.map((empresa) => `
    SELECT '${empresa}'::text AS empresa, fecha::text, bitrix_deal_id::text,
           asesor_asignado::text, bitrix_user_id
    FROM public.${EMPRESAS[empresa]}
    WHERE fecha BETWEEN $1::date AND $2::date AND vigente = TRUE
  `);
  if (!partes.length) return [];
  const { rows } = await erp.query(partes.join(' UNION ALL '), [desde, hasta]);
  return filtrarGestionables(rows);
}

// Aplica la misma regla del panel Reparto de Gestionables: parte de las
// asignaciones, consulta la etapa ACTUAL en bitrix_webhook_leads y conserva
// solo las que siguen siendo gestionables. Un lead aún sin registro de etapa
// se considera Contacto nuevo, igual que repartoConteo.conteoGestionablesHoy.
async function filtrarGestionables(asignaciones) {
  const porEmpresa = new Map();
  for (const fila of asignaciones) {
    if (!porEmpresa.has(fila.empresa)) porEmpresa.set(fila.empresa, []);
    porEmpresa.get(fila.empresa).push(fila);
  }

  const etapasPorEmpresa = new Map();
  await Promise.all([...porEmpresa.entries()].map(async ([empresa, filas]) => {
    const cfg = getEmpresa(empresa);
    const ids = [...new Set(filas.map((f) => String(f.bitrix_deal_id)))];
    const { rows } = await db.query(`
      SELECT DISTINCT ON (bitrix_id::text)
             bitrix_id::text AS id,
             COALESCE(NULLIF(BTRIM(etapa_bitrix), ''), REPLACE(etapa, '_', ' ')) AS etapa,
             source
      FROM public.bitrix_webhook_leads w
      WHERE w.empresa = $2 AND w.bitrix_id::text = ANY($1::text[])
      ORDER BY w.bitrix_id::text, w.id DESC
    `, [ids, cfg.clave]);
    etapasPorEmpresa.set(empresa, new Map(rows.map((r) => [r.id, r])));
  }));

  return asignaciones.filter((fila) => {
    const cfg = getEmpresa(fila.empresa);
    const lead = etapasPorEmpresa.get(fila.empresa)?.get(String(fila.bitrix_deal_id));
    const origen = nombreClave(lead?.source);
    if ((cfg.origenesSinConteo || []).some((o) => nombreClave(o) === origen)) return false;
    return !lead?.etapa || esEtapaGestionable(lead.etapa);
  });
}

async function reporte(req, res) {
  const empresa = alcance(req);
  if (empresa === null) return res.status(403).json({ success: false, error: 'No tienes acceso a este reporte' });
  const rango = validarRango(req, res);
  if (!rango) return;
  const empresas = empresa ? [empresa] : Object.keys(EMPRESAS);

  try {
    const { rows: inicioRows } = await db.query(`
      SELECT MIN((consultado_en AT TIME ZONE 'America/Guayaquil')::date)::text AS fecha
      FROM public.coverage_consultas
    `);
    const coberturaDesde = inicioRows[0]?.fecha
      ? (inicioRows[0].fecha > rango.desde ? inicioRows[0].fecha : rango.desde)
      : null;
    const filtroEmpresa = empresa ? 'AND UPPER(BTRIM(u.empresa)) = $3' : '';
    const params = empresa ? [rango.desde, rango.hasta, empresa] : [rango.desde, rango.hasta];
    const [wabot, consultas, asignaciones] = await Promise.all([
      db.query(`
        SELECT (m.timestamp AT TIME ZONE 'America/Guayaquil')::date::text AS fecha,
               l.created_by AS usuario_id,
               COALESCE(NULLIF(BTRIM(u.nombres || ' ' || u.apellidos), ''), u.usuario, 'Sin usuario') AS usuario,
               UPPER(BTRIM(COALESCE(u.empresa, 'SIN EMPRESA'))) AS empresa,
               COUNT(*) FILTER (
                 WHERE m.direction = 'out'
                   AND m.type NOT IN ('internal_note', 'system')
                   AND m.campaign_id IS NULL
                   AND m.node_type IS NULL
               )::int AS usos,
               COUNT(DISTINCT m.conversation_id)::int AS conversaciones
        FROM public.messages m
        JOIN public.lines l ON l.id = m.line_id AND l.deleted_at IS NULL
        JOIN public.usuarios u ON u.id = l.created_by
        WHERE (m.timestamp AT TIME ZONE 'America/Guayaquil')::date BETWEEN $1::date AND $2::date
          ${filtroEmpresa}
        GROUP BY 1,2,3,4 ORDER BY 1 DESC, usos DESC
      `, params),
      db.query(`
        SELECT (consultado_en AT TIME ZONE 'America/Guayaquil')::date::text AS fecha,
               usuario_id, asesor, UPPER(BTRIM(COALESCE(empresa, ''))) AS empresa,
               negociacion_id, tiene_cobertura
        FROM public.coverage_consultas
        WHERE (consultado_en AT TIME ZONE 'America/Guayaquil')::date BETWEEN $1::date AND $2::date
          ${empresa ? "AND UPPER(BTRIM(COALESCE(empresa, ''))) = $3" : ''}
      `, params),
      coberturaDesde ? listarAsignaciones(empresas, coberturaDesde, rango.hasta) : Promise.resolve([]),
    ]);

    const consultasPorDeal = new Map();
    for (const c of consultas.rows) {
      if (!c.negociacion_id) continue;
      const k = `${c.empresa}|${c.negociacion_id}`;
      if (!consultasPorDeal.has(k)) consultasPorDeal.set(k, []);
      consultasPorDeal.get(k).push(c);
    }

    const coberturaMap = new Map();
    for (const a of asignaciones) {
      const k = `${a.fecha}|${a.empresa}|${nombreClave(a.asesor_asignado)}`;
      if (!coberturaMap.has(k)) coberturaMap.set(k, {
        fecha: a.fecha, empresa: a.empresa, usuario: a.asesor_asignado,
        gestionables: 0, consultados: 0, no_consultados: 0,
        con_cobertura: 0, sin_cobertura: 0, detalle_no_consultados: [],
      });
      const fila = coberturaMap.get(k);
      fila.gestionables++;
      const matches = consultasPorDeal.get(`${a.empresa}|${a.bitrix_deal_id}`) || [];
      if (matches.length) {
        fila.consultados++;
        if (matches.some((c) => c.tiene_cobertura)) fila.con_cobertura++;
        else fila.sin_cobertura++;
      } else {
        fila.no_consultados++;
        fila.detalle_no_consultados.push(a.bitrix_deal_id);
      }
    }

    const cobertura = [...coberturaMap.values()].sort((a, b) =>
      b.fecha.localeCompare(a.fecha) || b.no_consultados - a.no_consultados || a.usuario.localeCompare(b.usuario));
    const totales = cobertura.reduce((t, f) => ({
      gestionables: t.gestionables + f.gestionables,
      consultados: t.consultados + f.consultados,
      no_consultados: t.no_consultados + f.no_consultados,
    }), { gestionables: 0, consultados: 0, no_consultados: 0 });

    return res.json({
      success: true,
      data: {
        rango, empresa: empresa || 'TODAS', uso: { wabot: wabot.rows },
        cobertura, totales,
        cobertura_desde: coberturaDesde,
        fuentes: { wabot: 'ACTIVIDAD_DE_LINEA', cobertura: 'GESTIONABLE_POR_NEGOCIACION' },
      },
    });
  } catch (error) {
    console.error('[wa-uso/reporte]', error);
    return res.status(500).json({ success: false, error: 'No se pudo generar el reporte de uso' });
  }
}

module.exports = { reporte };
