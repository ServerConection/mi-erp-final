// src/controllers/metasCarga.controller.js
// ============================================================================
// CARGA MENSUAL DE METAS COMERCIALES (Excel de gerencia)
//
// Flujo en DOS pasos, para que nada se escriba sin revisar:
//   1. POST /api/metas-carga/preview   -> lee la hoja, cruza nombres con Bitrix,
//                                          guarda un PREVIEW en metas_cargas. NO toca metas.
//   2. POST /api/metas-carga/confirmar -> con las decisiones del usuario, aplica
//                                          todo en UNA transaccion y guarda una foto
//                                          de como estaba antes (snapshot_previo).
//
// Donde escribe al confirmar (las mismas tablas que ya leen los reportes):
//   metas_asesor            -> "Pto" de KPI por Supervisor/Asesor (Reporte D-1).
//                              Una fila por CADA escritura del nombre en Bitrix.
//   empleados   (NOVONET)   -> supervisor del asesor (codigo = mes), por nombre exacto.
//   catalogo_asesores_velsa -> supervisor del asesor (VELSA), por codigo y periodo.
//   asesor_alias_bitrix     -> nombre Excel <-> nombre Bitrix <-> codigo de vendedor.
//   metas_supervisor / metas_empresa -> metas de equipo y de empresa.
//
// NUNCA borra filas. Lo que sobra del mismo mes en metas_asesor queda activo=false.
// ============================================================================

const XLSX = require('xlsx');
const pool = require('../config/db');
const { parseHojaMetas, hojasDeMetas, mesDelTexto, MESES } = require('../services/metasExcelParser.service');
const { construirPool, cruzarAsesores, marcarDuplicados, claveNombre, ESTADOS_AUTOMATICOS } = require('../services/asesorMatcher.service');

const EMPRESAS = new Set(['NOVONET', 'VELSA']);
const DIAS_POOL = 120;   // ventana para buscar los nombres que aparecen en Bitrix

const fail = (res, code, error, extra = {}) => res.status(code).json({ success: false, error, ...extra });
const errorInterno = (res, etiqueta, err) => {
  console.error(`[MetasCarga][${etiqueta}]`, err.message);
  return fail(res, 500, process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message);
};

const tablaExiste = async (db, nombre) => {
  const { rows } = await db.query('SELECT to_regclass($1) IS NOT NULL AS ok', [`public.${nombre}`]);
  return rows[0].ok;
};

// ── Nombres que aparecen REALMENTE en Bitrix ────────────────────────────────
// Cada fuente va en su propio try: si una falla, las otras siguen.
async function nombresBitrix(empresa) {
  const fuentes = [];
  const filas = [];
  const correr = async (fuente, sql) => {
    try {
      const { rows } = await pool.query(sql);
      rows.forEach((r) => filas.push({ ...r, fuente }));
      fuentes.push({ fuente, ok: true, nombres: rows.length });
    } catch (e) {
      fuentes.push({ fuente, ok: false, error: e.message });
    }
  };

  if (empresa === 'NOVONET') {
    // Lo que usa el Reporte D-1 / KPI (vw_bitrix_novonet = TRIM(responsible) del webhook)
    await correr('webhook', `
      SELECT NULLIF(TRIM(w.responsible), '') AS nombre, NULL::text AS codigo, COUNT(*)::int AS n
      FROM public.bitrix_webhook_leads w
      WHERE w.empresa = 'novonet' AND w.created_at >= NOW() - INTERVAL '${DIAS_POOL} days'
      GROUP BY 1`);
    // Lo que usan alertas y algunos cruces (mestra_bitrix, MAYUSCULAS)
    await correr('mestra', `
      SELECT mb.b_persona_responsable AS nombre, NULL::text AS codigo, COUNT(*)::int AS n
      FROM public.mestra_bitrix mb
      WHERE mb.b_persona_responsable IS NOT NULL
        AND public.parse_fecha_flex(mb.b_creado_el_fecha::text) >= CURRENT_DATE - ${DIAS_POOL}
      GROUP BY 1`);
    // Escrituras ya registradas a mano en meses anteriores (sin leads recientes = n 0)
    await correr('empleados', `
      SELECT DISTINCT nombre_completo AS nombre, NULL::text AS codigo, 0 AS n
      FROM public.empleados WHERE nombre_completo IS NOT NULL`);
  } else {
    // VELSA: el asesor sale de Bitrix (mv.asesor) y el codigo de Jotform
    await correr('mv_velsa', `
      SELECT mv.asesor AS nombre, UPPER(BTRIM(mv.codigo_asesor::text)) AS codigo, COUNT(*)::int AS n
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.asesor IS NOT NULL
        AND COALESCE(mv.fecha_creacion_crm, mv.fecha_registro_jotform) >= NOW() - INTERVAL '${DIAS_POOL} days'
      GROUP BY 1, 2`);
    if (!fuentes[0].ok) {
      // Si la vista no tuviera codigo_asesor, al menos los nombres
      await correr('mv_velsa_sin_codigo', `
        SELECT mv.asesor AS nombre, NULL::text AS codigo, COUNT(*)::int AS n
        FROM public.mv_indicadores_velsa_completo mv
        WHERE mv.asesor IS NOT NULL
          AND mv.fecha_creacion_crm >= NOW() - INTERVAL '${DIAS_POOL} days'
        GROUP BY 1`);
    }
  }
  return { filas, fuentes };
}

async function aliasConfirmados(empresa) {
  if (!(await tablaExiste(pool, 'asesor_alias_bitrix'))) return [];
  const { rows } = await pool.query(
    `SELECT codigo_asesor, clave_excel, nombre_bitrix FROM public.asesor_alias_bitrix
     WHERE empresa = $1 AND activo`, [empresa]);
  return rows;
}

// ── POST /preview ───────────────────────────────────────────────────────────
// multipart: archivo, empresa, anio, mes, hoja (opcional), dias_habiles (opcional)
const preview = async (req, res) => {
  try {
    if (!req.file) return fail(res, 400, 'No se recibio ningun archivo');
    if (!(await tablaExiste(pool, 'metas_cargas'))) {
      return fail(res, 412, 'Falta ejecutar la migracion 20261005_carga_metas_comerciales.sql en pgAdmin');
    }

    const empresa = String(req.body.empresa || '').toUpperCase();
    const anio = Number(req.body.anio);
    const mes = Number(req.body.mes);
    if (!EMPRESAS.has(empresa)) return fail(res, 400, 'Empresa invalida (NOVONET o VELSA)');
    if (!(anio >= 2024 && anio <= 2100) || !(mes >= 1 && mes <= 12)) return fail(res, 400, 'Periodo invalido');

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const hojas = hojasDeMetas(wb);
    let hoja = req.body.hoja;
    if (!hoja) {
      const cand = hojas.filter((h) => h.esMetas && h.empresa === empresa);
      hoja = (cand.find((h) => h.nombre.toUpperCase().includes(MESES[mes - 1])) || cand[cand.length - 1] || {}).nombre;
    }
    if (!hoja || !wb.Sheets[hoja]) return fail(res, 422, 'No encontre una hoja de METAS para esa empresa', { hojas });

    const leido = parseHojaMetas(wb, hoja);
    if (!leido.asesores.length) return fail(res, 422, `La hoja "${hoja}" no tiene filas de asesores`, { hojas });

    const avisos = [...leido.avisos];
    const hojaEmpresa = hojas.find((h) => h.nombre === hoja)?.empresa;
    if (hojaEmpresa && hojaEmpresa !== empresa) {
      avisos.unshift({ tipo: 'empresa', msg: `La hoja "${hoja}" parece de ${hojaEmpresa}, pero elegiste ${empresa}` });
    }
    const mesTexto = mesDelTexto(leido.periodoTexto);
    if (mesTexto && mesTexto !== mes) {
      avisos.unshift({ tipo: 'periodo', msg: `El Excel dice "${leido.periodoTexto}", pero se cargara como ${MESES[mes - 1]} ${anio} (lo que elegiste)` });
    }

    // Cruce con Bitrix
    const { filas, fuentes } = await nombresBitrix(empresa);
    if (!fuentes.some((f) => f.ok)) return fail(res, 503, 'No se pudo leer ningun nombre de Bitrix', { fuentes });
    const poolMap = construirPool(filas);
    const alias = await aliasConfirmados(empresa);
    const cruce = marcarDuplicados(cruzarAsesores(leido.asesores, poolMap, alias));

    const asesores = leido.asesores.map((a, i) => ({ ...a, cruce: cruce[i] }));
    asesores.forEach((a) => {
      const c = a.cruce;
      if (ESTADOS_AUTOMATICOS.has(c.estado) && c.elegidos.every((e) => !e.leads)) {
        c.aviso = `Sin leads en Bitrix en los ultimos ${DIAS_POOL} dias`;
      }
    });

    // Ya hay una carga aplicada para ese mes?
    const { rows: previas } = await pool.query(
      `SELECT id, archivo, usuario_nombre, aplicado_en FROM public.metas_cargas
       WHERE empresa = $1 AND anio = $2 AND mes = $3 AND estado = 'APLICADA'
       ORDER BY aplicado_en DESC LIMIT 1`, [empresa, anio, mes]);
    if (previas.length) {
      avisos.unshift({ tipo: 'reemplazo', msg: `Ya hay metas cargadas para ${MESES[mes - 1]} ${anio} (carga #${previas[0].id}). Al confirmar se REEMPLAZAN; la version anterior queda guardada.` });
    }

    const poolLista = [...poolMap.values()]
      .map((p) => ({ clave: p.clave, display: p.display, variantes: [...p.variantes], leads: p.leads }))
      .sort((a, b) => a.display.localeCompare(b.display));

    const payload = {
      empresa, anio, mes, hoja,
      dias_habiles: Number(req.body.dias_habiles) > 0 ? Number(req.body.dias_habiles) : 26,
      asesores, supervisores: leido.supervisores, total: leido.total,
      pctGlobales: leido.pctGlobales, periodoTexto: leido.periodoTexto,
      avisos, fuentes, pool: poolLista,
    };

    const { rows } = await pool.query(
      `INSERT INTO public.metas_cargas (empresa, anio, mes, archivo, hoja, estado, usuario_id, usuario_nombre, payload)
       VALUES ($1,$2,$3,$4,$5,'PREVIEW',$6,$7,$8) RETURNING id`,
      [empresa, anio, mes, req.file.originalname, hoja, req.user?.id || null, req.user?.usuario || null, payload]);

    const resumen = asesores.reduce((acc, a) => { acc[a.cruce.estado] = (acc[a.cruce.estado] || 0) + 1; return acc; }, {});
    return res.json({ success: true, data: { carga_id: rows[0].id, hojas, ...payload, resumen } });
  } catch (err) {
    if (/no existe|no encontre|falta la columna/i.test(err.message)) return fail(res, 422, err.message);
    return errorInterno(res, 'preview', err);
  }
};

// ── POST /confirmar ─────────────────────────────────────────────────────────
// body: { carga_id, decisiones: { [fila]: string[] claves_bitrix | ['__EXCEL__'] | [] (omitir) },
//         supervisores: { [nombre_excel]: nombre_final } }
const confirmar = async (req, res) => {
  const cargaId = Number(req.body?.carga_id);
  if (!cargaId) return fail(res, 400, 'Falta carga_id');
  const decisiones = req.body?.decisiones || {};
  const renombres = req.body?.supervisores || {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: cargas } = await client.query(
      'SELECT * FROM public.metas_cargas WHERE id = $1 FOR UPDATE', [cargaId]);
    if (!cargas.length) { await client.query('ROLLBACK'); return fail(res, 404, 'Carga no encontrada'); }
    const carga = cargas[0];
    if (carga.estado !== 'PREVIEW') { await client.query('ROLLBACK'); return fail(res, 409, 'Esta carga ya fue aplicada'); }

    const P = carga.payload;
    const { empresa, anio, mes } = P;
    const periodo = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const poolPorClave = new Map(P.pool.map((p) => [p.clave, p]));
    const nombreSup = (s) => (s && renombres[s] !== undefined ? String(renombres[s]).trim() : s) || null;
    const pg = P.pctGlobales || {};

    // 1. Resolver la lista final de nombres Bitrix por asesor
    const pendientes = [];
    const finales = P.asesores.map((a) => {
      let claves;
      if (Object.prototype.hasOwnProperty.call(decisiones, a.fila)) {
        claves = Array.isArray(decisiones[a.fila]) ? decisiones[a.fila] : [];
      } else if (ESTADOS_AUTOMATICOS.has(a.cruce.estado)) {
        claves = a.cruce.elegidos.map((e) => e.clave);
      } else {
        pendientes.push(a.nombre_excel);
        claves = [];
      }
      const variantes = new Set();
      let soloExcel = false;
      for (const c of claves) {
        // Asesor nuevo sin leads todavia: se guarda tal como viene en el Excel.
        // Cuando empiece a tener leads con ese mismo nombre, el KPI lo cruza solo.
        if (c === '__EXCEL__') { variantes.add(a.nombre_excel); soloExcel = true; continue; }
        const p = poolPorClave.get(c) || a.cruce.elegidos.find((e) => e.clave === c);
        if (!p) throw new Error(`Nombre de Bitrix desconocido para ${a.nombre_excel}: ${c}`);
        p.variantes.forEach((v) => variantes.add(v));
      }
      return { ...a, supervisorFinal: nombreSup(a.supervisor), variantes: [...variantes], soloExcel,
        manual: Object.prototype.hasOwnProperty.call(decisiones, a.fila) };
    });
    if (pendientes.length) {
      await client.query('ROLLBACK');
      return fail(res, 422, `Faltan por resolver ${pendientes.length} asesor(es): ${pendientes.join(', ')}`);
    }

    if (!finales.some((a) => a.variantes.length)) {
      await client.query('ROLLBACK');
      return fail(res, 422, 'Ningun asesor quedo asociado a un nombre de Bitrix: no se aplica nada');
    }

    // 2. Foto de como estaba todo ANTES (para poder revertir a mano)
    const snapshot = {};
    snapshot.metas_asesor = (await client.query(
      'SELECT * FROM public.metas_asesor WHERE empresa=$1 AND anio=$2 AND mes=$3', [empresa, anio, mes])).rows;
    if (empresa === 'NOVONET') {
      snapshot.empleados = (await client.query(
        'SELECT * FROM public.empleados WHERE codigo::text = $1', [String(mes)])).rows;
    } else if (await tablaExiste(client, 'catalogo_asesores_velsa')) {
      snapshot.catalogo_asesores_velsa = (await client.query(
        'SELECT * FROM public.catalogo_asesores_velsa WHERE periodo = $1::date', [periodo])).rows;
    }
    snapshot.metas_supervisor = (await client.query(
      'SELECT * FROM public.metas_supervisor WHERE empresa=$1 AND anio=$2 AND mes=$3', [empresa, anio, mes])).rows;
    snapshot.metas_empresa = (await client.query(
      'SELECT * FROM public.metas_empresa WHERE empresa=$1 AND anio=$2 AND mes=$3', [empresa, anio, mes])).rows;

    const resumen = { metas_asesor_insert: 0, metas_asesor_update: 0, metas_asesor_desactivadas: 0,
      empleados_insert: 0, empleados_update: 0, catalogo_velsa: 0, alias: 0, omitidos: [] };

    // 3. metas_asesor: una fila por cada escritura del nombre en Bitrix
    const todasVariantes = [];
    for (const a of finales) {
      if (!a.variantes.length) { resumen.omitidos.push(a.nombre_excel); continue; }
      const vals = [
        a.supervisorFinal, a.leads_total || 0, a.leads_gestion || 0, a.ingresos_jot || 0, a.activas_totales || 0,
        a.pct_efect_leads ?? 0.23, a.pct_efect_gestion ?? 0.5, a.pct_descarte ?? 0.27, a.pct_tasa_activacion ?? 0.85,
        pg.pct_tarjeta ?? 0.35, pg.pct_tercera_edad ?? 0.15, pg.pct_planes_150_200 ?? 0.15,
        a.codigo, cargaId,
      ];
      for (const v of a.variantes) {
        todasVariantes.push(v);
        const up = await client.query(
          `UPDATE public.metas_asesor SET supervisor=$1, leads_total=$2, leads_gestion=$3, ingresos_jot=$4,
             activas_totales=$5, pct_efect_leads=$6, pct_efect_gestion=$7, pct_descarte=$8, pct_tasa_activacion=$9,
             pct_tarjeta=$10, pct_tercera_edad=$11, pct_planes_150_200=$12, codigo_asesor=$13, carga_id=$14,
             activo=TRUE, actualizado_en=now()
           WHERE empresa=$15 AND anio=$16 AND mes=$17 AND asesor=$18`,
          [...vals, empresa, anio, mes, v]);
        if (up.rowCount) { resumen.metas_asesor_update += up.rowCount; continue; }
        await client.query(
          `INSERT INTO public.metas_asesor (supervisor, leads_total, leads_gestion, ingresos_jot, activas_totales,
             pct_efect_leads, pct_efect_gestion, pct_descarte, pct_tasa_activacion, pct_tarjeta, pct_tercera_edad,
             pct_planes_150_200, codigo_asesor, carga_id, empresa, anio, mes, asesor, activo, actualizado_en)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,TRUE,now())`,
          [...vals, empresa, anio, mes, v]);
        resumen.metas_asesor_insert++;
      }
    }
    // Lo que habia ese mes y ya no viene en el Excel: se apaga, no se borra
    const off = await client.query(
      `UPDATE public.metas_asesor SET activo=FALSE, actualizado_en=now()
       WHERE empresa=$1 AND anio=$2 AND mes=$3 AND activo AND NOT (asesor = ANY($4::text[]))`,
      [empresa, anio, mes, todasVariantes]);
    resumen.metas_asesor_desactivadas = off.rowCount;

    // 4. Asignacion de equipos
    if (empresa === 'NOVONET') {
      // empleados: el D-1 cruza por nombre EXACTO -> una fila por escritura
      for (const a of finales) {
        if (!a.supervisorFinal) continue;
        for (const v of a.variantes) {
          const up = await client.query(
            'UPDATE public.empleados SET supervisor=$1 WHERE nombre_completo=$2 AND codigo::text=$3',
            [a.supervisorFinal, v, String(mes)]);
          if (up.rowCount) { resumen.empleados_update += up.rowCount; continue; }
          await client.query(
            'INSERT INTO public.empleados (nombre_completo, supervisor, codigo) VALUES ($1,$2,$3)',
            [v, a.supervisorFinal, String(mes)]);
          resumen.empleados_insert++;
        }
      }
    } else if (snapshot.catalogo_asesores_velsa) {
      const supCodigo = new Map(P.supervisores.map((s) => [s.supervisor, s.codigo]));
      for (const a of finales) {
        if (!a.codigo) continue;   // el catalogo Velsa va por codigo (el de Jotform)
        await client.query(
          `INSERT INTO public.catalogo_asesores_velsa
             (periodo, codigo_asesor, nombre_asesor, estado, cargo, codigo_supervisor, nombre_supervisor)
           VALUES ($1::date,$2,$3,'ACTIVO','ASESOR',$4,$5)
           ON CONFLICT (periodo, codigo_asesor) DO UPDATE SET
             nombre_asesor=EXCLUDED.nombre_asesor, estado=EXCLUDED.estado, cargo=EXCLUDED.cargo,
             codigo_supervisor=EXCLUDED.codigo_supervisor, nombre_supervisor=EXCLUDED.nombre_supervisor,
             actualizado_en=now()`,
          [periodo, a.codigo, a.nombre_excel, supCodigo.get(a.supervisor) || null, a.supervisorFinal]);
        resumen.catalogo_velsa++;
      }
    }

    // 5. Alias: nombre Excel <-> nombre Bitrix <-> codigo (se reconoce solo el proximo mes)
    for (const a of finales) {
      if (a.soloExcel) continue;   // aun no existe en Bitrix: el proximo mes se vuelve a buscar
      for (const v of a.variantes) {
        await client.query(
          `INSERT INTO public.asesor_alias_bitrix
             (empresa, codigo_asesor, nombre_excel, clave_excel, nombre_bitrix, origen, creado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (empresa, clave_excel, nombre_bitrix) DO UPDATE SET
             codigo_asesor=COALESCE(EXCLUDED.codigo_asesor, asesor_alias_bitrix.codigo_asesor),
             activo=TRUE, actualizado_en=now()`,
          [empresa, a.codigo, a.nombre_excel, claveNombre(a.nombre_excel), v,
           a.manual ? 'manual' : 'auto', req.user?.usuario || null]);
        resumen.alias++;
      }
    }

    // 6. Metas de supervisor y de empresa
    for (const s of P.supervisores) {
      await client.query(
        `INSERT INTO public.metas_supervisor (empresa, anio, mes, supervisor, codigo_supervisor, num_asesores,
           leads_total, leads_gestion, ingresos_jot, activas_totales, pct_efect_leads, pct_efect_gestion,
           pct_descarte, pct_tasa_activacion, carga_id, activo, actualizado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE,now())
         ON CONFLICT (empresa, anio, mes, supervisor) DO UPDATE SET
           codigo_supervisor=EXCLUDED.codigo_supervisor, num_asesores=EXCLUDED.num_asesores,
           leads_total=EXCLUDED.leads_total, leads_gestion=EXCLUDED.leads_gestion,
           ingresos_jot=EXCLUDED.ingresos_jot, activas_totales=EXCLUDED.activas_totales,
           pct_efect_leads=EXCLUDED.pct_efect_leads, pct_efect_gestion=EXCLUDED.pct_efect_gestion,
           pct_descarte=EXCLUDED.pct_descarte, pct_tasa_activacion=EXCLUDED.pct_tasa_activacion,
           carga_id=EXCLUDED.carga_id, activo=TRUE, actualizado_en=now()`,
        [empresa, anio, mes, nombreSup(s.supervisor), s.codigo, s.num_asesores,
         s.leads_total || 0, s.leads_gestion || 0, s.ingresos_jot || 0, s.activas_totales || 0,
         s.pct_efect_leads, s.pct_efect_gestion, s.pct_descarte, s.pct_tasa_activacion, cargaId]);
    }
    const nuevosSup = P.supervisores.map((s) => nombreSup(s.supervisor));
    await client.query(
      `UPDATE public.metas_supervisor SET activo=FALSE, actualizado_en=now()
       WHERE empresa=$1 AND anio=$2 AND mes=$3 AND activo AND NOT (supervisor = ANY($4::text[]))`,
      [empresa, anio, mes, nuevosSup]);

    if (P.total) {
      const t = P.total;
      await client.query(
        `INSERT INTO public.metas_empresa (empresa, anio, mes, leads_total, leads_gestion, ingresos_jot,
           activas_totales, pct_efect_leads, pct_efect_gestion, pct_descarte, pct_tasa_activacion,
           pct_tarjeta, pct_tercera_edad, pct_planes_150_200, dias_habiles, carga_id, actualizado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now())
         ON CONFLICT (empresa, anio, mes) DO UPDATE SET
           leads_total=EXCLUDED.leads_total, leads_gestion=EXCLUDED.leads_gestion,
           ingresos_jot=EXCLUDED.ingresos_jot, activas_totales=EXCLUDED.activas_totales,
           pct_efect_leads=EXCLUDED.pct_efect_leads, pct_efect_gestion=EXCLUDED.pct_efect_gestion,
           pct_descarte=EXCLUDED.pct_descarte, pct_tasa_activacion=EXCLUDED.pct_tasa_activacion,
           pct_tarjeta=EXCLUDED.pct_tarjeta, pct_tercera_edad=EXCLUDED.pct_tercera_edad,
           pct_planes_150_200=EXCLUDED.pct_planes_150_200, dias_habiles=EXCLUDED.dias_habiles,
           carga_id=EXCLUDED.carga_id, actualizado_en=now()`,
        [empresa, anio, mes, t.leads_total || 0, t.leads_gestion || 0, t.ingresos_jot || 0, t.activas_totales || 0,
         t.pct_efect_leads, t.pct_efect_gestion, t.pct_descarte, t.pct_tasa_activacion,
         pg.pct_tarjeta ?? null, pg.pct_tercera_edad ?? null, pg.pct_planes_150_200 ?? null,
         P.dias_habiles || 26, cargaId]);
    }

    // 7. Cerrar la carga
    await client.query(
      `UPDATE public.metas_cargas SET estado='APLICADA', aplicado_en=now(), resumen=$2, snapshot_previo=$3,
         payload = payload || jsonb_build_object('decisiones', $4::jsonb, 'supervisores_renombrados', $5::jsonb)
       WHERE id=$1`,
      [cargaId, resumen, snapshot, JSON.stringify(decisiones), JSON.stringify(renombres)]);

    await client.query('COMMIT');
    return res.json({ success: true, data: { carga_id: cargaId, resumen } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (/desconocido/.test(err.message)) return fail(res, 422, err.message);
    return errorInterno(res, 'confirmar', err);
  } finally {
    client.release();
  }
};

// ── GET /historial ──────────────────────────────────────────────────────────
const historial = async (req, res) => {
  try {
    if (!(await tablaExiste(pool, 'metas_cargas'))) return res.json({ success: true, data: [] });
    const { rows } = await pool.query(
      `SELECT id, empresa, anio, mes, archivo, hoja, estado, usuario_nombre, creado_en, aplicado_en, resumen
       FROM public.metas_cargas WHERE estado = 'APLICADA'
       ORDER BY aplicado_en DESC LIMIT 50`);
    return res.json({ success: true, data: rows });
  } catch (err) {
    return errorInterno(res, 'historial', err);
  }
};

// ── GET /vigentes?empresa=&anio=&mes= — metas cargadas de un mes ─────────────
const vigentes = async (req, res) => {
  try {
    const empresa = String(req.query.empresa || '').toUpperCase();
    const anio = Number(req.query.anio);
    const mes = Number(req.query.mes);
    if (!EMPRESAS.has(empresa) || !anio || !mes) return fail(res, 400, 'Parametros invalidos');
    if (!(await tablaExiste(pool, 'metas_empresa'))) return res.json({ success: true, data: null });
    const [emp, sup, ase] = await Promise.all([
      pool.query('SELECT * FROM public.metas_empresa WHERE empresa=$1 AND anio=$2 AND mes=$3', [empresa, anio, mes]),
      pool.query('SELECT * FROM public.metas_supervisor WHERE empresa=$1 AND anio=$2 AND mes=$3 AND activo ORDER BY supervisor', [empresa, anio, mes]),
      pool.query(`SELECT asesor, codigo_asesor, supervisor, leads_total, leads_gestion, ingresos_jot, activas_totales
                  FROM public.metas_asesor WHERE empresa=$1 AND anio=$2 AND mes=$3 AND activo ORDER BY supervisor, asesor`,
                 [empresa, anio, mes]),
    ]);
    return res.json({ success: true, data: { empresa: emp.rows[0] || null, supervisores: sup.rows, asesores: ase.rows } });
  } catch (err) {
    return errorInterno(res, 'vigentes', err);
  }
};

module.exports = { preview, confirmar, historial, vigentes };
