// =============================================================================
// POLLA MUNDIALISTA 2026 - Controller
// Cada usuario predice el orden 1º-4º de los 12 grupos y los clasificados de
// cada fase eliminatoria. El admin registra resultados reales; el ranking de
// aciertos/puntos se calcula automáticamente.
// =============================================================================
const pool = require('../config/db');

const FASES = {
  DIECISEISAVOS: 32,
  OCTAVOS:       16,
  CUARTOS:        8,
  SEMIS:          4,
  FINAL:          2,
  CAMPEON:        1,
};

const esAdmin = (req) => {
  const p = (req.user?.perfil || '').toUpperCase();
  return p === 'ADMINISTRADOR' || p === 'ADMIN';
};

async function getConfig() {
  const r = await pool.query('SELECT * FROM polla_config WHERE id = 1');
  return r.rows[0];
}

// =============================================================================
// EQUIPOS + CONFIG
// =============================================================================
exports.listarEquipos = async (req, res) => {
  try {
    const [equipos, config] = await Promise.all([
      pool.query('SELECT * FROM polla_equipos ORDER BY grupo, orden'),
      getConfig(),
    ]);
    res.json({
      success: true,
      equipos: equipos.rows,
      config,
      esAdmin: esAdmin(req),
      fases: FASES,
    });
  } catch (err) {
    console.error('[polla.listarEquipos]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// =============================================================================
// MI POLLA (predicciones del usuario autenticado)
// =============================================================================
exports.miPolla = async (req, res) => {
  try {
    const uid = req.user.id;
    const [grupos, fases, config] = await Promise.all([
      pool.query('SELECT grupo, equipo_id, posicion FROM polla_pred_grupos WHERE usuario_id = $1', [uid]),
      pool.query('SELECT fase, equipo_id FROM polla_pred_fases WHERE usuario_id = $1', [uid]),
      getConfig(),
    ]);
    res.json({
      success: true,
      grupos: grupos.rows,
      fases: fases.rows,
      abierta: config.predicciones_abiertas,
    });
  } catch (err) {
    console.error('[polla.miPolla]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// body: { grupos: { A: [id1, id2, id3, id4], B: [...] } }  (orden = posición 1º-4º)
exports.guardarPredGrupos = async (req, res) => {
  const client = await pool.connect();
  try {
    const config = await getConfig();
    if (!config.predicciones_abiertas) {
      return res.status(403).json({ success: false, error: 'Las predicciones están cerradas.' });
    }
    const uid = req.user.id;
    const grupos = req.body?.grupos || {};

    // Validar contra los equipos reales de cada grupo
    const eq = await client.query('SELECT id, grupo FROM polla_equipos');
    const equipoGrupo = new Map(eq.rows.map((e) => [e.id, e.grupo]));

    await client.query('BEGIN');
    for (const [grupo, ids] of Object.entries(grupos)) {
      const g = String(grupo).toUpperCase();
      if (!Array.isArray(ids) || ids.length !== 4 || new Set(ids).size !== 4) {
        throw new Error(`Grupo ${g}: se requieren 4 equipos distintos en orden 1º-4º.`);
      }
      for (const id of ids) {
        if (equipoGrupo.get(Number(id)) !== g) {
          throw new Error(`Grupo ${g}: el equipo ${id} no pertenece a ese grupo.`);
        }
      }
      await client.query('DELETE FROM polla_pred_grupos WHERE usuario_id = $1 AND grupo = $2', [uid, g]);
      for (let i = 0; i < 4; i++) {
        await client.query(
          `INSERT INTO polla_pred_grupos (usuario_id, grupo, equipo_id, posicion)
           VALUES ($1, $2, $3, $4)`,
          [uid, g, Number(ids[i]), i + 1]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[polla.guardarPredGrupos]', err);
    res.status(400).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
};

// body: { fases: { OCTAVOS: [ids...], CAMPEON: [id] } }
exports.guardarPredFases = async (req, res) => {
  const client = await pool.connect();
  try {
    const config = await getConfig();
    if (!config.predicciones_abiertas) {
      return res.status(403).json({ success: false, error: 'Las predicciones están cerradas.' });
    }
    const uid = req.user.id;
    const fases = req.body?.fases || {};

    await client.query('BEGIN');
    for (const [fase, ids] of Object.entries(fases)) {
      const f = String(fase).toUpperCase();
      const max = FASES[f];
      if (!max) throw new Error(`Fase inválida: ${f}`);
      if (!Array.isArray(ids) || ids.length > max || new Set(ids).size !== ids.length) {
        throw new Error(`Fase ${f}: máximo ${max} equipos, sin repetidos.`);
      }
      await client.query('DELETE FROM polla_pred_fases WHERE usuario_id = $1 AND fase = $2', [uid, f]);
      for (const id of ids) {
        await client.query(
          'INSERT INTO polla_pred_fases (usuario_id, fase, equipo_id) VALUES ($1, $2, $3)',
          [uid, f, Number(id)]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[polla.guardarPredFases]', err);
    res.status(400).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
};

// =============================================================================
// RESULTADOS REALES (lectura para todos, escritura solo admin)
// =============================================================================
exports.resultados = async (_req, res) => {
  try {
    const [grupos, fases] = await Promise.all([
      pool.query('SELECT grupo, equipo_id, posicion FROM polla_res_grupos'),
      pool.query('SELECT fase, equipo_id FROM polla_res_fases'),
    ]);
    res.json({ success: true, grupos: grupos.rows, fases: fases.rows });
  } catch (err) {
    console.error('[polla.resultados]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// body: { grupo: 'A', posiciones: [id1, id2, id3, id4] }
exports.guardarResGrupo = async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ success: false, error: 'Solo administradores.' });
  const client = await pool.connect();
  try {
    const g = String(req.body?.grupo || '').toUpperCase();
    const ids = req.body?.posiciones;
    if (!g || !Array.isArray(ids) || ids.length !== 4 || new Set(ids).size !== 4) {
      throw new Error('Se requiere grupo y 4 equipos distintos en orden 1º-4º.');
    }
    const eq = await client.query('SELECT id FROM polla_equipos WHERE grupo = $1', [g]);
    const validos = new Set(eq.rows.map((r) => r.id));
    for (const id of ids) {
      if (!validos.has(Number(id))) throw new Error(`El equipo ${id} no pertenece al grupo ${g}.`);
    }
    await client.query('BEGIN');
    await client.query('DELETE FROM polla_res_grupos WHERE grupo = $1', [g]);
    for (let i = 0; i < 4; i++) {
      await client.query(
        'INSERT INTO polla_res_grupos (grupo, equipo_id, posicion) VALUES ($1, $2, $3)',
        [g, Number(ids[i]), i + 1]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[polla.guardarResGrupo]', err);
    res.status(400).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
};

// body: { fase: 'OCTAVOS', equipos: [ids...] }
exports.guardarResFase = async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ success: false, error: 'Solo administradores.' });
  const client = await pool.connect();
  try {
    const f = String(req.body?.fase || '').toUpperCase();
    const ids = req.body?.equipos;
    const max = FASES[f];
    if (!max) throw new Error(`Fase inválida: ${f}`);
    if (!Array.isArray(ids) || ids.length > max || new Set(ids).size !== ids.length) {
      throw new Error(`Fase ${f}: máximo ${max} equipos, sin repetidos.`);
    }
    await client.query('BEGIN');
    await client.query('DELETE FROM polla_res_fases WHERE fase = $1', [f]);
    for (const id of ids) {
      await client.query('INSERT INTO polla_res_fases (fase, equipo_id) VALUES ($1, $2)', [f, Number(id)]);
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[polla.guardarResFase]', err);
    res.status(400).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
};

// body: { predicciones_abiertas: true|false }
exports.actualizarConfig = async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ success: false, error: 'Solo administradores.' });
  try {
    const abierta = !!req.body?.predicciones_abiertas;
    await pool.query(
      'UPDATE polla_config SET predicciones_abiertas = $1, updated_at = now() WHERE id = 1',
      [abierta]
    );
    res.json({ success: true, predicciones_abiertas: abierta });
  } catch (err) {
    console.error('[polla.actualizarConfig]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// =============================================================================
// RANKING DE ACIERTOS
// =============================================================================
exports.ranking = async (_req, res) => {
  try {
    const [config, predG, predF, resG, resF, predP, resP, usuarios] = await Promise.all([
      getConfig(),
      pool.query('SELECT usuario_id, grupo, equipo_id, posicion FROM polla_pred_grupos'),
      pool.query('SELECT usuario_id, fase, equipo_id FROM polla_pred_fases'),
      pool.query('SELECT grupo, equipo_id, posicion FROM polla_res_grupos'),
      pool.query('SELECT fase, equipo_id FROM polla_res_fases'),
      pool.query('SELECT usuario_id, partido_id, home_goles, away_goles FROM polla_pred_partidos'),
      pool.query('SELECT partido_id, home_goles, away_goles FROM polla_res_partidos'),
      pool.query(`SELECT id, usuario, nombres, apellidos, empresa FROM usuarios WHERE activo = 'SI'`),
    ]);

    // Resultados reales indexados
    const realPos = new Map(); // `${grupo}-${posicion}` -> equipo_id
    for (const r of resG.rows) realPos.set(`${r.grupo}-${r.posicion}`, r.equipo_id);
    const realFase = new Map(); // fase -> Set(equipo_id)
    for (const r of resF.rows) {
      if (!realFase.has(r.fase)) realFase.set(r.fase, new Set());
      realFase.get(r.fase).add(r.equipo_id);
    }

    const ptsFase = {
      DIECISEISAVOS: config.pts_dieciseisavos,
      OCTAVOS:       config.pts_octavos,
      CUARTOS:       config.pts_cuartos,
      SEMIS:         config.pts_semis,
      FINAL:         config.pts_final,
      CAMPEON:       config.pts_campeon,
    };

    // Resultados reales de partidos indexados
    const realPartido = new Map(); // partido_id -> { home, away }
    for (const r of resP.rows) realPartido.set(r.partido_id, { home: r.home_goles, away: r.away_goles });
    const signo = (h, a) => (h > a ? 1 : h < a ? -1 : 0);

    const stats = new Map(); // usuario_id -> stats
    const ensure = (uid) => {
      if (!stats.has(uid)) {
        stats.set(uid, {
          usuario_id: uid,
          aciertos_grupos: 0,
          aciertos_fases: Object.fromEntries(Object.keys(FASES).map((f) => [f, 0])),
          aciertos_marcador: 0,   // marcador exacto
          aciertos_resultado: 0,  // solo ganador/empate
          pred_grupos: 0,
          pred_fases: 0,
          pred_partidos: 0,
          puntos: 0,
        });
      }
      return stats.get(uid);
    };

    for (const p of predG.rows) {
      const s = ensure(p.usuario_id);
      s.pred_grupos++;
      if (realPos.get(`${p.grupo}-${p.posicion}`) === p.equipo_id) {
        s.aciertos_grupos++;
        s.puntos += config.pts_posicion_exacta;
      }
    }
    for (const p of predF.rows) {
      const s = ensure(p.usuario_id);
      s.pred_fases++;
      if (realFase.get(p.fase)?.has(p.equipo_id)) {
        s.aciertos_fases[p.fase]++;
        s.puntos += ptsFase[p.fase] || 0;
      }
    }
    for (const p of predP.rows) {
      const s = ensure(p.usuario_id);
      s.pred_partidos++;
      const real = realPartido.get(p.partido_id);
      if (!real) continue;
      if (real.home === p.home_goles && real.away === p.away_goles) {
        s.aciertos_marcador++;
        s.puntos += config.pts_marcador_exacto || 0;
      } else if (signo(real.home, real.away) === signo(p.home_goles, p.away_goles)) {
        s.aciertos_resultado++;
        s.puntos += config.pts_resultado || 0;
      }
    }

    const userById = new Map(usuarios.rows.map((u) => [u.id, u]));
    const ranking = [...stats.values()]
      .map((s) => {
        const u = userById.get(s.usuario_id);
        const nombre = u
          ? `${u.nombres || ''} ${u.apellidos || ''}`.trim() || u.usuario
          : `Usuario ${s.usuario_id}`;
        return { ...s, nombre, empresa: u?.empresa || '' };
      })
      .filter((s) => s.pred_grupos > 0 || s.pred_fases > 0 || s.pred_partidos > 0)
      .sort((a, b) => b.puntos - a.puntos || b.aciertos_grupos - a.aciertos_grupos || a.nombre.localeCompare(b.nombre));

    res.json({ success: true, ranking, config });
  } catch (err) {
    console.error('[polla.ranking]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// =============================================================================
// PARTIDOS + PRONÓSTICOS DE MARCADOR
// =============================================================================

// GET /partidos — calendario completo + pronósticos del usuario + marcadores reales
exports.listarPartidos = async (req, res) => {
  try {
    const uid = req.user.id;
    // El SELECT de partidos tolera bases sin las columnas de bracket (home_ref/away_ref):
    // si no existen, se devuelven como NULL en lugar de fallar.
    const queryPartidos = (conRefs) => pool.query(`
      SELECT p.id, p.numero, p.fase, p.grupo, p.kickoff, p.sede, p.ciudad,
             p.home_label, p.away_label,
             ${conRefs ? 'p.home_ref, p.away_ref,' : 'NULL AS home_ref, NULL AS away_ref,'}
             he.nombre AS home_nombre, he.codigo AS home_codigo,
             ae.nombre AS away_nombre, ae.codigo AS away_codigo
        FROM polla_partidos p
        LEFT JOIN polla_equipos he ON he.id = p.home_equipo_id
        LEFT JOIN polla_equipos ae ON ae.id = p.away_equipo_id
       ORDER BY p.kickoff, p.numero`);
    let partidos;
    try {
      partidos = await queryPartidos(true);
    } catch (e) {
      console.warn('[polla.listarPartidos] sin columnas de bracket, usando fallback:', e.code || e.message);
      partidos = await queryPartidos(false);
    }
    const [pron, reales, config] = await Promise.all([
      pool.query('SELECT partido_id, home_goles, away_goles FROM polla_pred_partidos WHERE usuario_id = $1', [uid]),
      pool.query('SELECT partido_id, home_goles, away_goles FROM polla_res_partidos'),
      getConfig(),
    ]);
    res.json({
      success: true,
      partidos: partidos.rows,
      pronosticos: pron.rows,
      resultados: reales.rows,
      abierta: config.predicciones_abiertas,
      esAdmin: esAdmin(req),
      config,
    });
  } catch (err) {
    console.error('[polla.listarPartidos]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// PUT /mi-polla/partidos — body: { pronosticos: [{ partido_id, home_goles, away_goles }] }
// Guarda solo partidos no comenzados y con predicciones abiertas.
exports.guardarPredPartidos = async (req, res) => {
  const client = await pool.connect();
  try {
    const config = await getConfig();
    if (!config.predicciones_abiertas) {
      return res.status(403).json({ success: false, error: 'Las predicciones están cerradas.' });
    }
    const uid = req.user.id;
    const items = Array.isArray(req.body?.pronosticos) ? req.body.pronosticos : [];
    if (items.length === 0) return res.status(400).json({ success: false, error: 'No hay pronósticos para guardar.' });

    // Partidos válidos y aún no comenzados
    const pr = await client.query('SELECT id, kickoff FROM polla_partidos');
    const ahora = Date.now();
    const kickoffById = new Map(pr.rows.map((r) => [r.id, new Date(r.kickoff).getTime()]));

    await client.query('BEGIN');
    let guardados = 0;
    for (const it of items) {
      const pid = Number(it.partido_id);
      const h = Number(it.home_goles);
      const a = Number(it.away_goles);
      if (!kickoffById.has(pid)) continue;
      if (kickoffById.get(pid) <= ahora) continue; // ya comenzó: no editable
      if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0 || h > 99 || a > 99) {
        throw new Error(`Marcador inválido en el partido ${pid}.`);
      }
      await client.query(
        `INSERT INTO polla_pred_partidos (usuario_id, partido_id, home_goles, away_goles, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (usuario_id, partido_id)
         DO UPDATE SET home_goles = EXCLUDED.home_goles, away_goles = EXCLUDED.away_goles, updated_at = now()`,
        [uid, pid, h, a]
      );
      guardados++;
    }
    await client.query('COMMIT');
    res.json({ success: true, guardados });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[polla.guardarPredPartidos]', err);
    res.status(400).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
};

// PUT /resultados/partidos — (admin) body: { partido_id, home_goles, away_goles }
exports.guardarResPartido = async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ success: false, error: 'Solo administradores.' });
  try {
    const pid = Number(req.body?.partido_id);
    const h = Number(req.body?.home_goles);
    const a = Number(req.body?.away_goles);
    if (!Number.isInteger(pid)) throw new Error('partido_id requerido.');
    if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0 || h > 99 || a > 99) {
      throw new Error('Marcador inválido.');
    }
    const ex = await pool.query('SELECT 1 FROM polla_partidos WHERE id = $1', [pid]);
    if (ex.rowCount === 0) throw new Error('El partido no existe.');
    await pool.query(
      `INSERT INTO polla_res_partidos (partido_id, home_goles, away_goles, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (partido_id)
       DO UPDATE SET home_goles = EXCLUDED.home_goles, away_goles = EXCLUDED.away_goles, updated_at = now()`,
      [pid, h, a]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[polla.guardarResPartido]', err);
    res.status(400).json({ success: false, error: err.message });
  }
};

// =============================================================================
// BRACKET (diagrama de flujo) — persistencia del armado del usuario
// El scoring sigue en polla_pred_fases; el frontend deriva las fases del bracket
// y las guarda con /mi-polla/fases. Aquí solo persistimos el estado del bracket
// (terceros asignados + ganador elegido por partido) para poder restaurarlo.
// =============================================================================

// GET /mi-polla/bracket
exports.miBracket = async (req, res) => {
  try {
    const r = await pool.query('SELECT data FROM polla_pred_bracket WHERE usuario_id = $1', [req.user.id]);
    res.json({ success: true, data: r.rows[0]?.data || {} });
  } catch (err) {
    console.error('[polla.miBracket]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// PUT /mi-polla/bracket — body: { data: { thirds: {...}, winners: {...} } }
exports.guardarBracket = async (req, res) => {
  try {
    const config = await getConfig();
    if (!config.predicciones_abiertas) {
      return res.status(403).json({ success: false, error: 'Las predicciones están cerradas.' });
    }
    const data = req.body?.data;
    if (data == null || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ success: false, error: 'Bracket inválido.' });
    }
    await pool.query(
      `INSERT INTO polla_pred_bracket (usuario_id, data, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (usuario_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [req.user.id, JSON.stringify(data)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[polla.guardarBracket]', err);
    res.status(400).json({ success: false, error: err.message });
  }
};
