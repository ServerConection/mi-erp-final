// src/controllers/comisiones.controller.js
// ============================================================================
// Submódulo Administración > Comisiones (Fase 1: cuánto toca pagar a cada asesor)
//
// Fuente:   public.envios_ventas (ventas ACTIVAS del mes por fecha de activación)
// Tarifas:  public.comisiones_catalogo (valor por plan y por tramo, por mes)
//
// Reglas (definidas por Bryan):
//   - Activas totales = activas por regularizar + regularizadas.
//   - Tramo por activas totales del asesor en el mes:
//       T1: hasta 35 | T2: 36 a 41 | T3: 42 en adelante
//   - Mientras el mes está en curso, TODOS se calculan con T1.
//   - "Valor total" = sobre activas totales; "Disponible" = solo regularizadas.
//   - Nº servicios = "+" en servicios_digitales + 1 (sin "+" = 1). Informativo.
//
// Actualización: el resultado se cachea 10 minutos y un intervalo lo recalcula
// cada 10 minutos para el mes en curso (NOVONET y VELSA).
// Chargeback y egresos: fase 2.
// ============================================================================

const pool = require('../config/db');

const DIEZ_MIN = 10 * 60 * 1000;
const cache = new Map(); // clave "EMPRESA-AAAA-MM" -> { data, ts }

// Solo se paga lo ACTIVO y REGULARIZADO. Todo lo demás (incluido
// "NO REQUIERE REGULARIZAR") cuenta como por regularizar.
const esRegularizada = (est) => {
  const e = String(est || '').toUpperCase();
  if (e.includes('POR REGULARIZAR') || e.includes('NO REQUIERE')) return false;
  return e.includes('REGULARIZADO');
};

// Normaliza nombres de plan para cruzar envios_ventas con el catálogo
const normPlan = (s) => String(s || '')
  .toUpperCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[–—]/g, '-')
  .replace(/\s*-\s*/g, ' - ')
  .replace(/\s*\+\s*/g, ' + ')
  .replace(/\s+/g, ' ')
  .trim();

const contarServicios = (s) => {
  const t = String(s || '').trim();
  if (!t) return 0;
  return (t.match(/\+/g) || []).length + 1;
};

const tramoPorActivas = (n) => (n >= 42 ? 3 : n >= 36 ? 2 : 1);

const r2 = (n) => Math.round(n * 100) / 100;

// Fecha de hoy en Ecuador
const hoyEC = () => {
  const s = new Date().toLocaleString('en-CA', { timeZone: 'America/Guayaquil' }).slice(0, 10);
  const [y, m] = s.split('-').map(Number);
  return { anio: y, mes: m };
};

let tablaLista = false;
async function asegurarTabla() {
  if (tablaLista) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.comisiones_catalogo (
      id           SERIAL PRIMARY KEY,
      empresa      VARCHAR(20)  NOT NULL DEFAULT 'NOVONET',
      anio         INT          NOT NULL,
      mes          INT          NOT NULL,
      plan_nombre  TEXT         NOT NULL,
      plan_norm    TEXT         NOT NULL,
      valor_t1     NUMERIC(10,2) NOT NULL DEFAULT 0,
      valor_t2     NUMERIC(10,2) NOT NULL DEFAULT 0,
      valor_t3     NUMERIC(10,2) NOT NULL DEFAULT 0,
      actualizado_por VARCHAR(100),
      updated_at   TIMESTAMP DEFAULT NOW(),
      UNIQUE (empresa, anio, mes, plan_norm)
    )`);
  tablaLista = true;
}

// Catálogo del mes; si no existe, el último mes anterior cargado
async function obtenerCatalogo(empresa, anio, mes) {
  const { rows: per } = await pool.query(`
    SELECT anio, mes FROM public.comisiones_catalogo
    WHERE empresa = $1 AND (anio * 100 + mes) <= $2
    GROUP BY anio, mes ORDER BY anio DESC, mes DESC LIMIT 1`,
    [empresa, anio * 100 + mes]);
  if (!per.length) return { periodo: null, mapa: new Map() };
  const { rows } = await pool.query(`
    SELECT plan_nombre, plan_norm, valor_t1, valor_t2, valor_t3
    FROM public.comisiones_catalogo WHERE empresa = $1 AND anio = $2 AND mes = $3`,
    [empresa, per[0].anio, per[0].mes]);
  const mapa = new Map(rows.map(r => [r.plan_norm, {
    t1: Number(r.valor_t1), t2: Number(r.valor_t2), t3: Number(r.valor_t3),
  }]));
  return { periodo: { anio: per[0].anio, mes: per[0].mes }, mapa };
}

async function calcular(empresa, anio, mes) {
  await asegurarTabla();
  const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const hasta = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);

  const { rows } = await pool.query(`
    SELECT e.id, e.id_bitrix, e.codigo_asesor,
           COALESCE(NULLIF(TRIM(e.nombre_atc), ''), NULLIF(TRIM(e.usuario), ''), 'SIN ASESOR') AS asesor,
           e.supervisor,
           COALESCE(NULLIF(TRIM(e.plan_contratado_final), ''), e.plan_contratado) AS plan,
           e.servicios_digitales,
           e.estatus_regularizacion,
           e.nombre_cliente_completo,
           public.parse_fecha_flex(e.fecha_activacion_netlife::text) AS fecha_activacion
    FROM public.envios_ventas e
    WHERE e.distribuidor_autorizado = $1
      AND e.estatus_envio IS DISTINCT FROM 'BORRADOR'
      AND UPPER(TRIM(e.netlife_estatus_real)) = 'ACTIVO'
      AND public.parse_fecha_flex(e.fecha_activacion_netlife::text) BETWEEN $2::date AND $3::date
  `, [empresa, desde, hasta]);

  const { periodo: periodoCatalogo, mapa } = await obtenerCatalogo(empresa, anio, mes);
  const h = hoyEC();
  const mesEnCurso = h.anio === anio && h.mes === mes;

  // Agrupar por asesor
  const porAsesor = new Map();
  for (const v of rows) {
    const k = String(v.asesor).toUpperCase().trim();
    if (!porAsesor.has(k)) porAsesor.set(k, {
      asesor: v.asesor, codigo_asesor: v.codigo_asesor, supervisor: v.supervisor, ventas: [],
    });
    const a = porAsesor.get(k);
    if (!a.codigo_asesor && v.codigo_asesor) a.codigo_asesor = v.codigo_asesor;
    if (!a.supervisor && v.supervisor) a.supervisor = v.supervisor;
    a.ventas.push(v);
  }

  const planesSinTarifa = new Map();
  const asesores = [];
  for (const a of porAsesor.values()) {
    const activas = a.ventas.length;
    const tramo = mesEnCurso ? 1 : tramoPorActivas(activas);
    let total = 0, disponible = 0, regularizadas = 0, sinTarifa = 0;
    const detalle = a.ventas.map(v => {
      const tarifa = mapa.get(normPlan(v.plan));
      const valor = tarifa ? tarifa[`t${tramo}`] : 0;
      const reg = esRegularizada(v.estatus_regularizacion);
      if (!tarifa) {
        sinTarifa++;
        const pk = normPlan(v.plan) || '(SIN PLAN)';
        planesSinTarifa.set(pk, (planesSinTarifa.get(pk) || 0) + 1);
      }
      total += valor;
      if (reg) { disponible += valor; regularizadas++; }
      return {
        id: v.id, id_bitrix: v.id_bitrix, cliente: v.nombre_cliente_completo,
        plan: v.plan, servicios: contarServicios(v.servicios_digitales),
        servicios_digitales: v.servicios_digitales,
        estado_regularizacion: v.estatus_regularizacion || 'SIN ESTADO',
        regularizada: reg, fecha_activacion: v.fecha_activacion,
        valor: r2(valor), con_tarifa: !!tarifa,
      };
    });
    asesores.push({
      asesor: a.asesor, codigo_asesor: a.codigo_asesor, supervisor: a.supervisor,
      activas_total: activas, regularizadas, por_regularizar: activas - regularizadas,
      tramo, valor_total: r2(total), valor_disponible: r2(disponible),
      ventas_sin_tarifa: sinTarifa, detalle,
    });
  }
  asesores.sort((x, y) => y.valor_total - x.valor_total || y.activas_total - x.activas_total);

  const sum = (f) => r2(asesores.reduce((s, a) => s + a[f], 0));
  return {
    empresa, anio, mes, mes_en_curso: mesEnCurso,
    catalogo_periodo: periodoCatalogo,
    planes_catalogo: mapa.size,
    resumen: {
      asesores: asesores.length,
      activas_total: sum('activas_total'),
      regularizadas: sum('regularizadas'),
      por_regularizar: sum('por_regularizar'),
      valor_total: sum('valor_total'),
      valor_disponible: sum('valor_disponible'),
    },
    planes_sin_tarifa: [...planesSinTarifa.entries()]
      .map(([plan, ventas]) => ({ plan, ventas })).sort((a, b) => b.ventas - a.ventas),
    asesores,
    calculado_en: new Date().toISOString(),
  };
}

async function obtener(empresa, anio, mes, forzar = false) {
  const k = `${empresa}-${anio}-${mes}`;
  const c = cache.get(k);
  if (!forzar && c && Date.now() - c.ts < DIEZ_MIN) return c.data;
  const data = await calcular(empresa, anio, mes);
  cache.set(k, { data, ts: Date.now() });
  return data;
}

// Recalcula el mes en curso cada 10 minutos
const refrescarMesActual = async () => {
  const { anio, mes } = hoyEC();
  for (const emp of ['NOVONET', 'VELSA']) {
    try { await obtener(emp, anio, mes, true); }
    catch (e) { console.error(`[COMISIONES] refresco ${emp}:`, e.message); }
  }
};
if (process.env.NODE_ENV !== 'test') {
  setTimeout(refrescarMesActual, 30 * 1000).unref();
  setInterval(refrescarMesActual, DIEZ_MIN).unref();
}

const leerPeriodo = (q) => {
  const h = hoyEC();
  const empresa = String(q.empresa || 'NOVONET').toUpperCase() === 'VELSA' ? 'VELSA' : 'NOVONET';
  const anio = parseInt(q.anio, 10) || h.anio;
  const mes = Math.min(12, Math.max(1, parseInt(q.mes, 10) || h.mes));
  return { empresa, anio, mes };
};

// GET /api/comisiones/calculo?empresa=&anio=&mes=&refrescar=1
exports.calculo = async (req, res) => {
  try {
    const { empresa, anio, mes } = leerPeriodo(req.query);
    const data = await obtener(empresa, anio, mes, req.query.refrescar === '1');
    res.json({ success: true, data, proxima_actualizacion_min: 10 });
  } catch (e) {
    console.error('[COMISIONES] calculo:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
};

// GET /api/comisiones/catalogo?empresa=&anio=&mes=
exports.catalogo = async (req, res) => {
  try {
    await asegurarTabla();
    const { empresa, anio, mes } = leerPeriodo(req.query);
    const { rows } = await pool.query(`
      SELECT plan_nombre, valor_t1, valor_t2, valor_t3, updated_at
      FROM public.comisiones_catalogo WHERE empresa = $1 AND anio = $2 AND mes = $3
      ORDER BY plan_nombre`, [empresa, anio, mes]);
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('[COMISIONES] catalogo:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
};

// POST /api/comisiones/catalogo  { empresa, anio, mes, planes: [{plan, t1, t2, t3}] }
// Inserta o actualiza (no borra planes existentes).
exports.guardarCatalogo = async (req, res) => {
  const client = await pool.connect();
  try {
    await asegurarTabla();
    const { empresa, anio, mes } = leerPeriodo(req.body || {});
    const planes = Array.isArray(req.body?.planes) ? req.body.planes : [];
    const num = (v) => { const n = Number(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : 0; };
    const validos = planes.filter(p => normPlan(p.plan));
    if (!validos.length) return res.status(400).json({ success: false, error: 'No llegaron planes válidos' });

    await client.query('BEGIN');
    for (const p of validos) {
      await client.query(`
        INSERT INTO public.comisiones_catalogo
          (empresa, anio, mes, plan_nombre, plan_norm, valor_t1, valor_t2, valor_t3, actualizado_por, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
        ON CONFLICT (empresa, anio, mes, plan_norm) DO UPDATE SET
          plan_nombre = EXCLUDED.plan_nombre, valor_t1 = EXCLUDED.valor_t1,
          valor_t2 = EXCLUDED.valor_t2, valor_t3 = EXCLUDED.valor_t3,
          actualizado_por = EXCLUDED.actualizado_por, updated_at = NOW()`,
        [empresa, anio, mes, String(p.plan).trim(), normPlan(p.plan),
         num(p.t1), num(p.t2), num(p.t3), req.user?.usuario || null]);
    }
    await client.query('COMMIT');
    for (const k of cache.keys()) if (k.startsWith(`${empresa}-`)) cache.delete(k);
    res.json({ success: true, guardados: validos.length });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[COMISIONES] guardarCatalogo:', e.message);
    res.status(500).json({ success: false, error: e.message });
  } finally {
    client.release();
  }
};
