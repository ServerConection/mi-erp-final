const db = require('../config/db');
const erp = require('../config/dbErp');
const { esEtapaGestionable } = require('../shared/etapas');
const { getEmpresa } = require('../shared/repartoEmpresas');

const PERFILES_REPORTE = new Set(['ADMINISTRADOR', 'GERENCIA', 'GERENTE', 'SUPERVISOR', 'ANALISTA', 'COORDINADOR']);
const EMPRESAS = {
  NOVONET: 'gestionables_asignaciones',
  VELSA: 'velsa_gestionables_asignaciones',
};
const MODULOS_ACCESO = new Set(['INDICADORES', 'CONTACTABILIDAD', 'VISTA_ASESOR']);
let tablaAccesosPromise;

function asegurarTablaAccesos() {
  if (!tablaAccesosPromise) tablaAccesosPromise = db.query(`
    CREATE TABLE IF NOT EXISTS public.accesos_modulos (
      id BIGSERIAL PRIMARY KEY,
      usuario_id BIGINT NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
      empresa VARCHAR(30) NOT NULL,
      modulo VARCHAR(30) NOT NULL CHECK (modulo IN ('INDICADORES','CONTACTABILIDAD','VISTA_ASESOR')),
      modulo_empresa VARCHAR(30),
      accedido_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_accesos_modulos_fecha_empresa
      ON public.accesos_modulos (accedido_en DESC, empresa, modulo);
    CREATE TABLE IF NOT EXISTS public.acciones_modulos (
      id BIGSERIAL PRIMARY KEY,
      usuario_id BIGINT NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
      empresa VARCHAR(30) NOT NULL,
      modulo VARCHAR(30) NOT NULL CHECK (modulo IN ('INDICADORES','CONTACTABILIDAD','VISTA_ASESOR')),
      modulo_empresa VARCHAR(30),
      accion VARCHAR(40) NOT NULL,
      detalle TEXT,
      realizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_acciones_modulos_fecha_empresa
      ON public.acciones_modulos (realizado_en DESC, empresa, modulo);
    ALTER TABLE public.acciones_modulos ALTER COLUMN detalle TYPE TEXT;
    ALTER TABLE public.accesos_modulos ADD COLUMN IF NOT EXISTS modulo_empresa VARCHAR(30);
    ALTER TABLE public.acciones_modulos ADD COLUMN IF NOT EXISTS modulo_empresa VARCHAR(30);
  `).catch((error) => { tablaAccesosPromise = null; throw error; });
  return tablaAccesosPromise;
}

async function registrarAcceso(req, res) {
  const modulo = String(req.body?.modulo || '').trim().toUpperCase();
  const empresa = String(req.user?.empresa || '').trim().toUpperCase();
  const moduloEmpresa = String(req.body?.modulo_empresa || '').trim().toUpperCase();
  if (!MODULOS_ACCESO.has(modulo)) return res.status(400).json({ success: false, error: 'Modulo no valido' });
  if (!EMPRESAS[empresa]) return res.status(400).json({ success: false, error: 'Empresa no valida' });
  try {
    await asegurarTablaAccesos();
    await db.query('INSERT INTO public.accesos_modulos (usuario_id, empresa, modulo, modulo_empresa) VALUES ($1, $2, $3, $4)',
      [req.user.id, empresa, modulo, EMPRESAS[moduloEmpresa] ? moduloEmpresa : null]);
    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('[wa-uso/acceso]', error);
    return res.status(500).json({ success: false, error: 'No se pudo registrar el acceso' });
  }
}

async function registrarAccion(req, res) {
  const modulo = String(req.body?.modulo || '').trim().toUpperCase();
  const empresa = String(req.user?.empresa || '').trim().toUpperCase();
  const moduloEmpresa = String(req.body?.modulo_empresa || '').trim().toUpperCase();
  const accion = String(req.body?.accion || '').trim().toUpperCase().slice(0, 40);
  const detalle = String(req.body?.detalle || '').trim().replace(/\s+/g, ' ').slice(0, 2000);
  if (!MODULOS_ACCESO.has(modulo) || !accion) return res.status(400).json({ success: false, error: 'Accion no valida' });
  if (!EMPRESAS[empresa]) return res.status(400).json({ success: false, error: 'Empresa no valida' });
  try {
    await asegurarTablaAccesos();
    await db.query(`INSERT INTO public.acciones_modulos (usuario_id, empresa, modulo, modulo_empresa, accion, detalle)
                    VALUES ($1, $2, $3, $4, $5, $6)`, [req.user.id, empresa, modulo,
      EMPRESAS[moduloEmpresa] ? moduloEmpresa : null, accion, detalle || null]);
    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('[wa-uso/accion]', error);
    return res.status(500).json({ success: false, error: 'No se pudo registrar la accion' });
  }
}

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
    await asegurarTablaAccesos();
    const { rows: inicioRows } = await db.query(`
      SELECT MIN((consultado_en AT TIME ZONE 'America/Guayaquil')::date)::text AS fecha
      FROM public.coverage_consultas
    `);
    const coberturaDesde = inicioRows[0]?.fecha
      ? (inicioRows[0].fecha > rango.desde ? inicioRows[0].fecha : rango.desde)
      : null;
    const filtroEmpresa = empresa ? 'AND UPPER(BTRIM(u.empresa)) = $3' : '';
    const params = empresa ? [rango.desde, rango.hasta, empresa] : [rango.desde, rango.hasta];
    const [wabot, acciones, accesos, consultas, asignaciones] = await Promise.all([
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
        SELECT a.id, EXTRACT(EPOCH FROM a.realizado_en)::bigint AS orden,
               TO_CHAR(a.realizado_en AT TIME ZONE 'America/Guayaquil', 'DD/MM/YYYY HH24:MI:SS') AS fecha_hora,
               (a.realizado_en AT TIME ZONE 'America/Guayaquil')::date::text AS fecha,
               a.usuario_id,
               COALESCE(NULLIF(BTRIM(u.nombres || ' ' || u.apellidos), ''), u.usuario, 'Sin usuario') AS usuario,
               a.empresa, a.modulo, a.modulo_empresa, a.accion, a.detalle
        FROM public.acciones_modulos a
        JOIN public.usuarios u ON u.id = a.usuario_id
        WHERE (a.realizado_en AT TIME ZONE 'America/Guayaquil')::date BETWEEN $1::date AND $2::date
          ${empresa ? 'AND a.empresa = $3' : ''}
        ORDER BY a.realizado_en DESC
        LIMIT 10000
      `, params),
      db.query(`
        SELECT a.id, EXTRACT(EPOCH FROM a.accedido_en)::bigint AS orden,
               TO_CHAR(a.accedido_en AT TIME ZONE 'America/Guayaquil', 'DD/MM/YYYY HH24:MI:SS') AS fecha_hora,
               (a.accedido_en AT TIME ZONE 'America/Guayaquil')::date::text AS fecha,
               a.usuario_id,
               COALESCE(NULLIF(BTRIM(u.nombres || ' ' || u.apellidos), ''), u.usuario, 'Sin usuario') AS usuario,
               a.empresa, a.modulo, a.modulo_empresa
        FROM public.accesos_modulos a
        JOIN public.usuarios u ON u.id = a.usuario_id
        WHERE (a.accedido_en AT TIME ZONE 'America/Guayaquil')::date BETWEEN $1::date AND $2::date
          ${empresa ? 'AND a.empresa = $3' : ''}
        ORDER BY a.accedido_en DESC
        LIMIT 10000
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
        rango, empresa: empresa || 'TODAS', uso: { wabot: wabot.rows, accesos: accesos.rows, acciones: acciones.rows },
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

module.exports = { reporte, registrarAcceso, registrarAccion };
