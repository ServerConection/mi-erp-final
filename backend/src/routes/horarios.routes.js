// src/routes/horarios.routes.js
// ============================================================================
// Módulo HORARIOS — turnos semanales (lunes a domingo) de los asesores.
//   GET  /api/horarios/semanas?empresa=           semanas con datos (lunes)
//   GET  /api/horarios/semana?empresa=&lunes=     grilla de la semana (+ marcación INGRESO de NOVONET ACCESS)
//   POST /api/horarios/cargar                     carga del Excel (ADMINISTRADOR / GERENCIA)
//   PUT  /api/horarios/cambios                    guardar cambios manuales (ADMIN / GERENCIA / SUPERVISOR)
// Acceso:
//   - ADMINISTRADOR, GERENCIA, SUPERVISOR: ven a todos los asesores.
//   - Cualquier otro perfil (asesor = USUARIO): solo ve SU horario.
// Montado en app.js (monolito) y entries/core.js. El gateway lo manda a CORE por su catch-all.
// ============================================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verificarToken } = require('../middleware/auth');
const { claveNombre, mismaPalabra } = require('../services/asesorMatcher.service');

const EMPRESAS = new Set(['NOVONET']);           // por ahora solo NOVONET
const TOLERANCIA_MIN = 5;                         // minutos de gracia para "a tiempo"
const MODALIDADES = new Set(['OFICINA', 'TELECONEXION', 'HIBRIDO']);
const RE_HORA = /^([01]\d|2[0-3]):(00|30)$/;      // solo cortes de 30 minutos

// ── Perfiles ────────────────────────────────────────────────────────────────
const normPerfil = (p) => String(p || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
const esAdminGerencia = (p) => {
  const x = normPerfil(p);
  return x === 'ADMINISTRADOR' || x === 'GERENCIA' || x === 'GERENTE' || /^GEREN(CIA|TE)[ _-]/.test(x);
};
const esSupervisor = (p) => normPerfil(p).startsWith('SUPERVISOR');
const veTodo = (p) => esAdminGerencia(p) || esSupervisor(p);

// ── Fechas (YYYY-MM-DD, sin zona horaria) ───────────────────────────────────
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const aDate = (s) => new Date(`${s}T00:00:00Z`);
const aTexto = (d) => d.toISOString().slice(0, 10);
const sumarDias = (s, n) => { const d = aDate(s); d.setUTCDate(d.getUTCDate() + n); return aTexto(d); };
const lunesDe = (s) => { const d = aDate(s); const dow = (d.getUTCDay() + 6) % 7; return sumarDias(s, -dow); };
const hoyEcuador = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

// ── Celda del Excel -> turno ────────────────────────────────────────────────
// "08:00 - 15:00" | "16:30 - 22:30 TELECONEXIÓN" | "08:30-13:30 OFICINA" | "LIBRE"
// "08:00 - 12:00 / 17:00 - 20:00 HIBRIDO" | vacío
const hhmm = (h, m) => `${String(Number(h)).padStart(2, '0')}:${m}`;
function parseCelda(valor) {
  const original = valor === null || valor === undefined ? '' : String(valor).trim();
  const t = original.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const base = { tipo: 'SIN_ASIGNAR', hora_inicio: null, hora_fin: null, hora_inicio2: null, hora_fin2: null, modalidad: null, texto_original: original || null };
  if (!t) return base;
  if (t.includes('LIBRE')) return { ...base, tipo: 'LIBRE' };
  const pares = [...t.matchAll(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g)];
  if (!pares.length) return base;
  let modalidad = null;
  if (t.includes('TELECONEX')) modalidad = 'TELECONEXION';
  else if (t.includes('OFICINA')) modalidad = 'OFICINA';
  else if (t.includes('HIBRID')) modalidad = 'HIBRIDO';
  const [a, b] = pares;
  return {
    ...base,
    tipo: 'TURNO',
    hora_inicio: hhmm(a[1], a[2]), hora_fin: hhmm(a[3], a[4]),
    hora_inicio2: b ? hhmm(b[1], b[2]) : null, hora_fin2: b ? hhmm(b[3], b[4]) : null,
    modalidad,
  };
}

// ── Nombre del Excel <-> usuario del ERP ────────────────────────────────────
// Todas las palabras del nombre del Excel deben estar en el nombre del usuario
// ("ALEXIS NAGUA" ⊂ "ALEXIS JAVIER NAGUA PEREZ"), tolerando 1 letra en nombres largos.
function coincideNombre(claveExcel, claveUsuario) {
  const ex = claveExcel.split(' ').filter((x) => x.length > 1);
  const us = claveUsuario.split(' ').filter((x) => x.length > 1);
  if (ex.length < 2 || !us.length) return false;
  return ex.every((w) => us.some((u) => mismaPalabra(w, u)));
}

async function usuariosEmpresa(empresa) {
  const { rows } = await pool.query(
    `SELECT id, TRIM(COALESCE(nombres,'') || ' ' || COALESCE(apellidos,'')) AS nombre
       FROM usuarios
      WHERE activo = 'SI' AND UPPER(COALESCE(empresa,'')) = $1`,
    [empresa]
  );
  return rows.map((r) => ({ id: Number(r.id), clave: claveNombre(r.nombre) }));
}

/** clave del Excel -> usuario_id (solo si hay UN candidato). */
function resolver(claves, usuarios) {
  const out = {};
  for (const c of claves) {
    const cand = usuarios.filter((u) => coincideNombre(c, u.clave));
    out[c] = cand.length === 1 ? cand[0].id : null;
  }
  return out;
}

const empresaDe = (req) => {
  const e = String(req.query.empresa || req.body?.empresa || 'NOVONET').trim().toUpperCase();
  return EMPRESAS.has(e) ? e : null;
};
const quien = (req) => req.user?.usuario || req.user?.nombreCompleto || String(req.user?.id || '');

router.use(verificarToken);

// ── GET /semanas ────────────────────────────────────────────────────────────
router.get('/semanas', async (req, res) => {
  const empresa = empresaDe(req);
  if (!empresa) return res.status(400).json({ success: false, error: 'Empresa no habilitada' });
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT to_char(date_trunc('week', fecha)::date, 'YYYY-MM-DD') AS lunes
         FROM horarios_turnos WHERE empresa = $1 ORDER BY 1 DESC LIMIT 60`,
      [empresa]
    );
    res.json({ success: true, data: rows.map((r) => r.lunes) });
  } catch (e) {
    console.error('[HORARIOS] semanas', e.message);
    res.status(500).json({ success: false, error: 'No se pudo leer las semanas' });
  }
});

// ── GET /semana ─────────────────────────────────────────────────────────────
router.get('/semana', async (req, res) => {
  const empresa = empresaDe(req);
  if (!empresa) return res.status(400).json({ success: false, error: 'Empresa no habilitada' });
  const pedido = RE_FECHA.test(String(req.query.lunes || '')) ? req.query.lunes : hoyEcuador();
  const lunes = lunesDe(pedido);
  const domingo = sumarDias(lunes, 6);
  const perfil = req.user?.perfil;
  const todo = veTodo(perfil);

  try {
    const { rows } = await pool.query(
      `SELECT id, to_char(fecha,'YYYY-MM-DD') AS fecha, asesor_clave, asesor_nombre, supervisor, usuario_id,
              tipo, to_char(hora_inicio,'HH24:MI') AS hora_inicio, to_char(hora_fin,'HH24:MI') AS hora_fin,
              to_char(hora_inicio2,'HH24:MI') AS hora_inicio2, to_char(hora_fin2,'HH24:MI') AS hora_fin2,
              modalidad, texto_original, origen, actualizado_por, actualizado_en
         FROM horarios_turnos
        WHERE empresa = $1 AND fecha BETWEEN $2 AND $3
        ORDER BY asesor_nombre, fecha`,
      [empresa, lunes, domingo]
    );

    // Completar usuario_id que falten (asesor creado en el ERP después de la carga)
    const sinUsuario = [...new Set(rows.filter((r) => !r.usuario_id).map((r) => r.asesor_clave))];
    if (sinUsuario.length) {
      const mapa = resolver(sinUsuario, await usuariosEmpresa(empresa));
      for (const [clave, id] of Object.entries(mapa)) {
        if (!id) continue;
        await pool.query(
          `UPDATE horarios_turnos SET usuario_id = $1 WHERE empresa = $2 AND asesor_clave = $3 AND usuario_id IS NULL`,
          [id, empresa, clave]
        );
        rows.forEach((r) => { if (r.asesor_clave === clave) r.usuario_id = id; });
      }
    }

    // Asesor: solo su propio horario
    let visibles = rows;
    if (!todo) {
      const miId = Number(req.user?.id);
      const miClave = claveNombre(req.user?.nombreCompleto || '');
      visibles = rows.filter((r) => Number(r.usuario_id) === miId || (!r.usuario_id && coincideNombre(r.asesor_clave, miClave)));
    }

    // Marcación de INGRESO en NOVONET ACCESS (control_asistencia) por usuario/día
    const ids = [...new Set(visibles.map((r) => Number(r.usuario_id)).filter(Boolean))];
    const ingresos = {};
    if (ids.length) {
      try {
        const { rows: m } = await pool.query(
          `SELECT usuario_id, to_char(fecha,'YYYY-MM-DD') AS fecha, to_char(MIN(hora),'HH24:MI') AS ingreso
             FROM control_asistencia
            WHERE usuario_id = ANY($1::bigint[]) AND fecha BETWEEN $2 AND $3 AND UPPER(actividad) = 'INGRESO'
            GROUP BY usuario_id, fecha`,
          [ids, lunes, domingo]
        );
        m.forEach((x) => { ingresos[`${x.usuario_id}|${x.fecha}`] = x.ingreso; });
      } catch (e) {
        console.warn('[HORARIOS] sin datos de NOVONET ACCESS:', e.message);
      }
    }

    // Agrupar por asesor
    const porAsesor = new Map();
    for (const r of visibles) {
      if (!porAsesor.has(r.asesor_clave)) {
        porAsesor.set(r.asesor_clave, {
          asesor_clave: r.asesor_clave, asesor: r.asesor_nombre, supervisor: r.supervisor,
          usuario_id: r.usuario_id ? Number(r.usuario_id) : null, dias: {},
        });
      }
      porAsesor.get(r.asesor_clave).dias[r.fecha] = {
        tipo: r.tipo, hora_inicio: r.hora_inicio, hora_fin: r.hora_fin,
        hora_inicio2: r.hora_inicio2, hora_fin2: r.hora_fin2, modalidad: r.modalidad,
        texto_original: r.texto_original, origen: r.origen, actualizado_por: r.actualizado_por,
        ingreso: r.usuario_id ? ingresos[`${r.usuario_id}|${r.fecha}`] || null : null,
      };
    }

    res.json({
      success: true,
      data: {
        empresa, lunes, domingo, hoy: hoyEcuador(),
        dias: Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)),
        tolerancia_min: TOLERANCIA_MIN,
        puede_editar: veTodo(perfil),
        puede_cargar: esAdminGerencia(perfil),
        ve_todo: todo,
        filas: [...porAsesor.values()],
      },
    });
  } catch (e) {
    console.error('[HORARIOS] semana', e.message);
    res.status(500).json({ success: false, error: 'No se pudo leer los horarios' });
  }
});

// ── POST /cargar (Excel ya leído en el navegador) ───────────────────────────
// body: { empresa, fecha_inicio: 'YYYY-MM-DD' (lunes de la 1ra columna),
//         sobrescribir_manuales: bool, filas: [{ asesor, supervisor, celdas: [..] }] }
router.post('/cargar', async (req, res) => {
  if (!esAdminGerencia(req.user?.perfil)) {
    return res.status(403).json({ success: false, error: 'Solo Administrador o Gerencia pueden cargar horarios' });
  }
  const empresa = empresaDe(req);
  if (!empresa) return res.status(400).json({ success: false, error: 'Empresa no habilitada' });
  const { fecha_inicio, filas, sobrescribir_manuales } = req.body || {};
  if (!RE_FECHA.test(String(fecha_inicio || '')) || lunesDe(fecha_inicio) !== fecha_inicio) {
    return res.status(400).json({ success: false, error: 'La fecha de inicio debe ser un LUNES (YYYY-MM-DD)' });
  }
  if (!Array.isArray(filas) || !filas.length || filas.length > 500) {
    return res.status(400).json({ success: false, error: 'El Excel no trae asesores' });
  }

  const limpias = filas
    .map((f) => ({ asesor: String(f.asesor || '').trim(), supervisor: String(f.supervisor || '').trim() || null, celdas: Array.isArray(f.celdas) ? f.celdas.slice(0, 98) : [] }))
    .filter((f) => f.asesor);
  const usuarios = await usuariosEmpresa(empresa).catch(() => []);
  const mapa = resolver([...new Set(limpias.map((f) => claveNombre(f.asesor)))], usuarios);

  const client = await pool.connect();
  let insertados = 0, omitidosManual = 0;
  try {
    await client.query('BEGIN');
    for (const f of limpias) {
      const clave = claveNombre(f.asesor);
      for (let i = 0; i < f.celdas.length; i++) {
        const t = parseCelda(f.celdas[i]);
        const r = await client.query(
          `INSERT INTO horarios_turnos
             (empresa, fecha, asesor_clave, asesor_nombre, supervisor, usuario_id, tipo,
              hora_inicio, hora_fin, hora_inicio2, hora_fin2, modalidad, texto_original, origen, actualizado_por, actualizado_en)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'EXCEL',$14,NOW())
           ON CONFLICT (empresa, fecha, asesor_clave) DO UPDATE SET
             asesor_nombre = EXCLUDED.asesor_nombre, supervisor = EXCLUDED.supervisor,
             usuario_id = COALESCE(EXCLUDED.usuario_id, horarios_turnos.usuario_id),
             tipo = EXCLUDED.tipo, hora_inicio = EXCLUDED.hora_inicio, hora_fin = EXCLUDED.hora_fin,
             hora_inicio2 = EXCLUDED.hora_inicio2, hora_fin2 = EXCLUDED.hora_fin2, modalidad = EXCLUDED.modalidad,
             texto_original = EXCLUDED.texto_original, origen = 'EXCEL',
             actualizado_por = EXCLUDED.actualizado_por, actualizado_en = NOW()
           WHERE $15::boolean OR horarios_turnos.origen <> 'MANUAL'`,
          [empresa, sumarDias(fecha_inicio, i), clave, f.asesor, f.supervisor, mapa[clave] || null, t.tipo,
            t.hora_inicio, t.hora_fin, t.hora_inicio2, t.hora_fin2, t.modalidad, t.texto_original, quien(req),
            Boolean(sobrescribir_manuales)]
        );
        if (r.rowCount) insertados++; else omitidosManual++;
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[HORARIOS] cargar', e.message);
    return res.status(500).json({ success: false, error: 'No se pudo guardar el Excel: ' + e.message });
  } finally {
    client.release();
  }

  const maxDias = Math.max(...limpias.map((f) => f.celdas.length));
  res.json({
    success: true,
    data: {
      asesores: limpias.length,
      registros: insertados,
      omitidos_por_cambio_manual: omitidosManual,
      desde: fecha_inicio,
      hasta: sumarDias(fecha_inicio, maxDias - 1),
      sin_usuario_erp: limpias.filter((f) => !mapa[claveNombre(f.asesor)]).map((f) => f.asesor),
    },
  });
});

// ── PUT /cambios ────────────────────────────────────────────────────────────
// body: { empresa, cambios: [{ asesor_clave, asesor, supervisor, fecha, tipo,
//         hora_inicio, hora_fin, hora_inicio2, hora_fin2, modalidad }] }
router.put('/cambios', async (req, res) => {
  if (!veTodo(req.user?.perfil)) {
    return res.status(403).json({ success: false, error: 'No tienes permiso para editar horarios' });
  }
  const empresa = empresaDe(req);
  if (!empresa) return res.status(400).json({ success: false, error: 'Empresa no habilitada' });
  const cambios = Array.isArray(req.body?.cambios) ? req.body.cambios : [];
  if (!cambios.length) return res.status(400).json({ success: false, error: 'No hay cambios para guardar' });

  // Validar todo antes de escribir
  const errores = [];
  const validos = cambios.map((c, i) => {
    const tipo = String(c.tipo || '').toUpperCase();
    const v = {
      asesor_clave: claveNombre(c.asesor_clave || c.asesor || ''),
      asesor: String(c.asesor || c.asesor_clave || '').trim(),
      supervisor: c.supervisor ? String(c.supervisor).trim() : null,
      fecha: String(c.fecha || ''),
      tipo,
      hora_inicio: null, hora_fin: null, hora_inicio2: null, hora_fin2: null, modalidad: null,
    };
    const tag = `${v.asesor || '?'} ${v.fecha}`;
    if (!v.asesor_clave || !RE_FECHA.test(v.fecha)) errores.push(`${tag}: datos incompletos`);
    if (!['TURNO', 'LIBRE', 'SIN_ASIGNAR'].includes(tipo)) errores.push(`${tag}: tipo inválido`);
    if (tipo === 'TURNO') {
      v.hora_inicio = c.hora_inicio; v.hora_fin = c.hora_fin;
      if (!RE_HORA.test(v.hora_inicio || '') || !RE_HORA.test(v.hora_fin || '')) errores.push(`${tag}: elige hora de inicio y fin`);
      else if (v.hora_fin <= v.hora_inicio) errores.push(`${tag}: la hora de fin debe ser mayor que la de inicio`);
      if (c.hora_inicio2 || c.hora_fin2) {
        v.hora_inicio2 = c.hora_inicio2; v.hora_fin2 = c.hora_fin2;
        if (!RE_HORA.test(v.hora_inicio2 || '') || !RE_HORA.test(v.hora_fin2 || '')) errores.push(`${tag}: completa el 2do bloque`);
        else if (v.hora_fin2 <= v.hora_inicio2 || v.hora_inicio2 < v.hora_fin) errores.push(`${tag}: el 2do bloque debe ir después del 1ro`);
      }
      const m = String(c.modalidad || '').toUpperCase();
      v.modalidad = MODALIDADES.has(m) ? m : null;
    }
    if (errores.length > 20) errores.length = 20;
    return v;
  });
  if (errores.length) return res.status(400).json({ success: false, error: errores.join(' · ') });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const v of validos) {
      await client.query(
        `INSERT INTO horarios_turnos
           (empresa, fecha, asesor_clave, asesor_nombre, supervisor, tipo,
            hora_inicio, hora_fin, hora_inicio2, hora_fin2, modalidad, origen, actualizado_por, actualizado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'MANUAL',$12,NOW())
         ON CONFLICT (empresa, fecha, asesor_clave) DO UPDATE SET
           tipo = EXCLUDED.tipo, hora_inicio = EXCLUDED.hora_inicio, hora_fin = EXCLUDED.hora_fin,
           hora_inicio2 = EXCLUDED.hora_inicio2, hora_fin2 = EXCLUDED.hora_fin2, modalidad = EXCLUDED.modalidad,
           origen = 'MANUAL', actualizado_por = EXCLUDED.actualizado_por, actualizado_en = NOW()`,
        [empresa, v.fecha, v.asesor_clave, v.asesor, v.supervisor, v.tipo,
          v.hora_inicio, v.hora_fin, v.hora_inicio2, v.hora_fin2, v.modalidad, quien(req)]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, data: { guardados: validos.length } });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[HORARIOS] cambios', e.message);
    res.status(500).json({ success: false, error: 'No se pudieron guardar los cambios' });
  } finally {
    client.release();
  }
});

router._test = { parseCelda, coincideNombre, lunesDe };
module.exports = router;
