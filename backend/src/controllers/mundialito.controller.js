// =============================================================================
// MUNDIALITO - Controller
// Programa de Aceleracion Comercial (incentivo estilo Mundial entre asesores)
// Solo accesible para perfil ADMINISTRADOR.
// =============================================================================
const pool = require('../config/db');

let _io = null;
try { _io = require('../config/socket').getIO; } catch (_) { _io = null; }

function emitLive(eventName, payload) {
  try {
    if (!_io) return;
    const io = _io();
    io.to('broadcast:all').emit(eventName, payload);
    io.to('tv:all').emit(eventName, payload);
  } catch (_) {
    // no-op si socket no esta listo aun
  }
}

const NOMBRES_GRUPOS_DEFAULT = [
  { nombre: 'TITANES',  color_hex: '#fbbf24', orden: 1 },
  { nombre: 'AGUILAS',  color_hex: '#3b82f6', orden: 2 },
  { nombre: 'DRAGONES', color_hex: '#ef4444', orden: 3 },
  { nombre: 'COBRAS',   color_hex: '#10b981', orden: 4 },
  { nombre: 'OSOS',     color_hex: '#8b5cf6', orden: 5 },
];

// =============================================================================
// TORNEOS
// =============================================================================
exports.listarTorneos = async (req, res) => {
  try {
    const { empresa } = req.query;
    const params = [];
    let where = '';
    if (empresa) { params.push(empresa.toUpperCase()); where = 'WHERE empresa = $1'; }
    const r = await pool.query(
      `SELECT * FROM mundialito_torneos ${where} ORDER BY created_at DESC`,
      params
    );
    res.json({ success: true, torneos: r.rows });
  } catch (err) {
    console.error('[mundialito.listarTorneos]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.crearTorneo = async (req, res) => {
  try {
    const { empresa, nombre, fecha_inicio, fecha_fin, fase = 'GRUPOS' } = req.body;
    if (!empresa || !nombre || !fecha_inicio || !fecha_fin) {
      return res.status(400).json({ success: false, error: 'Faltan campos: empresa, nombre, fecha_inicio, fecha_fin' });
    }
    const r = await pool.query(
      `INSERT INTO mundialito_torneos (empresa, nombre, fase, fecha_inicio, fecha_fin)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [empresa.toUpperCase(), nombre, fase, fecha_inicio, fecha_fin]
    );
    const torneo = r.rows[0];
    // crear los 5 grupos default
    for (const g of NOMBRES_GRUPOS_DEFAULT) {
      await pool.query(
        `INSERT INTO mundialito_grupos (torneo_id, nombre, color_hex, orden) VALUES ($1,$2,$3,$4)`,
        [torneo.id, g.nombre, g.color_hex, g.orden]
      );
    }
    res.json({ success: true, torneo });
  } catch (err) {
    console.error('[mundialito.crearTorneo]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.cerrarTorneo = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`UPDATE mundialito_torneos SET estado='CERRADO', updated_at=NOW() WHERE id=$1`, [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.actualizarReglas = async (req, res) => {
  try {
    const { id } = req.params;
    const { reglas } = req.body;
    await pool.query(
      `UPDATE mundialito_torneos SET reglas_json = $1, updated_at = NOW() WHERE id = $2`,
      [reglas, id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// =============================================================================
// GRUPOS
// =============================================================================
exports.listarGrupos = async (req, res) => {
  try {
    const { torneoId } = req.params;
    const r = await pool.query(
      `SELECT * FROM mundialito_grupos WHERE torneo_id=$1 ORDER BY orden`,
      [torneoId]
    );
    res.json({ success: true, grupos: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// =============================================================================
// PARTICIPANTES + SORTEO
// =============================================================================
exports.listarParticipantes = async (req, res) => {
  try {
    const { torneoId } = req.params;
    const r = await pool.query(
      `SELECT p.*, g.nombre AS grupo_nombre, g.color_hex AS grupo_color
       FROM mundialito_participantes p
       LEFT JOIN mundialito_grupos g ON g.id = p.grupo_id
       WHERE p.torneo_id = $1
       ORDER BY g.orden NULLS LAST, p.nombre`,
      [torneoId]
    );
    res.json({ success: true, participantes: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.agregarParticipante = async (req, res) => {
  try {
    const { torneoId } = req.params;
    const { nombre, asesor_key, empresa, foto_url } = req.body;
    if (!nombre || !empresa) {
      return res.status(400).json({ success: false, error: 'nombre y empresa son requeridos' });
    }
    const r = await pool.query(
      `INSERT INTO mundialito_participantes (torneo_id, nombre, asesor_key, empresa, foto_url)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (torneo_id, asesor_key) DO UPDATE SET nombre = EXCLUDED.nombre, foto_url = EXCLUDED.foto_url
       RETURNING *`,
      [torneoId, nombre, asesor_key || nombre, empresa.toUpperCase(), foto_url || null]
    );
    res.json({ success: true, participante: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.eliminarParticipante = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM mundialito_participantes WHERE id=$1`, [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// SORTEO: distribuye aleatoriamente los participantes entre los grupos del torneo
exports.realizarSorteo = async (req, res) => {
  const client = await pool.connect();
  try {
    const { torneoId } = req.params;
    const grupos = await client.query(
      `SELECT id FROM mundialito_grupos WHERE torneo_id=$1 ORDER BY orden`,
      [torneoId]
    );
    if (grupos.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Crea primero los grupos del torneo' });
    }
    const parts = await client.query(
      `SELECT id FROM mundialito_participantes WHERE torneo_id=$1 AND activo=TRUE`,
      [torneoId]
    );
    if (parts.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No hay participantes para sortear' });
    }

    // Algoritmo: Fisher-Yates shuffle + reparto round-robin a los grupos
    const ids = parts.rows.map(r => r.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const gIds = grupos.rows.map(r => r.id);

    await client.query('BEGIN');
    for (let i = 0; i < ids.length; i++) {
      const grupoId = gIds[i % gIds.length];
      await client.query(
        `UPDATE mundialito_participantes SET grupo_id=$1 WHERE id=$2`,
        [grupoId, ids[i]]
      );
    }
    await client.query('COMMIT');

    emitLive('mundialito:sorteo', { torneoId });
    res.json({ success: true, sorteados: ids.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[mundialito.realizarSorteo]', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
};

// =============================================================================
// PARTIDOS
// =============================================================================
exports.listarPartidos = async (req, res) => {
  try {
    const { torneoId } = req.params;
    const { fecha } = req.query;
    const params = [torneoId];
    let extra = '';
    if (fecha) { params.push(fecha); extra = `AND pa.fecha = $2`; }
    const r = await pool.query(
      `SELECT pa.*,
              pl.nombre AS local_nombre, pl.foto_url AS local_foto,
              pv.nombre AS visitante_nombre, pv.foto_url AS visitante_foto,
              gl.nombre AS local_grupo, gv.nombre AS visitante_grupo
         FROM mundialito_partidos pa
         JOIN mundialito_participantes pl ON pl.id = pa.jugador_local_id
         JOIN mundialito_participantes pv ON pv.id = pa.jugador_visitante_id
         LEFT JOIN mundialito_grupos gl ON gl.id = pl.grupo_id
         LEFT JOIN mundialito_grupos gv ON gv.id = pv.grupo_id
       WHERE pa.torneo_id = $1 ${extra}
       ORDER BY pa.fecha DESC, pa.id DESC`,
      params
    );
    res.json({ success: true, partidos: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Genera partidos del dia: empareja participantes del mismo grupo aleatoriamente
exports.generarPartidosDia = async (req, res) => {
  const client = await pool.connect();
  try {
    const { torneoId } = req.params;
    const { fecha } = req.body;
    if (!fecha) return res.status(400).json({ success: false, error: 'fecha requerida (YYYY-MM-DD)' });

    const exist = await client.query(
      `SELECT COUNT(*)::int as n FROM mundialito_partidos WHERE torneo_id=$1 AND fecha=$2`,
      [torneoId, fecha]
    );
    if (exist.rows[0].n > 0) {
      return res.status(400).json({ success: false, error: 'Ya hay partidos generados para esa fecha' });
    }

    const grupos = await client.query(
      `SELECT id FROM mundialito_grupos WHERE torneo_id=$1 ORDER BY orden`,
      [torneoId]
    );

    await client.query('BEGIN');
    let creados = 0;
    for (const g of grupos.rows) {
      const parts = await client.query(
        `SELECT id FROM mundialito_participantes WHERE torneo_id=$1 AND grupo_id=$2 AND activo=TRUE`,
        [torneoId, g.id]
      );
      const ids = parts.rows.map(r => r.id);
      // shuffle
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      // emparejar de a dos
      for (let i = 0; i + 1 < ids.length; i += 2) {
        await client.query(
          `INSERT INTO mundialito_partidos (torneo_id, fecha, jugador_local_id, jugador_visitante_id)
           VALUES ($1, $2, $3, $4)`,
          [torneoId, fecha, ids[i], ids[i+1]]
        );
        creados++;
      }
    }
    await client.query('COMMIT');
    res.json({ success: true, partidos_creados: creados });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
};

// Cierra un partido: calcula puntos segun goles
exports.cerrarPartido = async (req, res) => {
  try {
    const { id } = req.params;
    const torneo = await pool.query(
      `SELECT t.reglas_json
         FROM mundialito_partidos pa
         JOIN mundialito_torneos t ON t.id = pa.torneo_id
        WHERE pa.id = $1`, [id]);
    if (torneo.rows.length === 0) return res.status(404).json({ success: false, error: 'Partido no encontrado' });
    const reglas = torneo.rows[0].reglas_json;
    const ptsV = Number(reglas.pts_victoria || 3);
    const ptsE = Number(reglas.pts_empate   || 1);
    const ptsD = Number(reglas.pts_derrota  || 0);

    await pool.query(`
      UPDATE mundialito_partidos
      SET goles_local     = COALESCE((SELECT SUM(cantidad) FROM mundialito_goles WHERE partido_id=$1 AND asesor_id=jugador_local_id),0),
          goles_visitante = COALESCE((SELECT SUM(cantidad) FROM mundialito_goles WHERE partido_id=$1 AND asesor_id=jugador_visitante_id),0),
          updated_at = NOW()
      WHERE id = $1
    `, [id]);

    await pool.query(`
      UPDATE mundialito_partidos
      SET puntos_local     = CASE WHEN goles_local > goles_visitante THEN $2
                                 WHEN goles_local = goles_visitante THEN $3
                                 ELSE $4 END,
          puntos_visitante = CASE WHEN goles_visitante > goles_local THEN $2
                                 WHEN goles_local = goles_visitante THEN $3
                                 ELSE $4 END,
          cerrado = TRUE,
          updated_at = NOW()
      WHERE id = $1
    `, [id, ptsV, ptsE, ptsD]);

    emitLive('mundialito:partido_cerrado', { partidoId: Number(id) });
    res.json({ success: true });
  } catch (err) {
    console.error('[mundialito.cerrarPartido]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// =============================================================================
// GOLES (con emision LIVE para animaciones en frontend)
// =============================================================================
exports.registrarGol = async (req, res) => {
  try {
    const { torneoId } = req.params;
    const { asesor_id, partido_id, tipo = 'MANUAL', cantidad = 1, descripcion = null, venta_ref = null } = req.body;
    if (!asesor_id) return res.status(400).json({ success: false, error: 'asesor_id requerido' });

    const r = await pool.query(
      `INSERT INTO mundialito_goles (torneo_id, partido_id, asesor_id, tipo, cantidad, descripcion, venta_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [torneoId, partido_id || null, asesor_id, tipo, cantidad, descripcion, venta_ref]
    );

    const info = await pool.query(
      `SELECT p.nombre, p.foto_url, g.nombre AS grupo_nombre, g.color_hex AS grupo_color
         FROM mundialito_participantes p
         LEFT JOIN mundialito_grupos g ON g.id = p.grupo_id
        WHERE p.id = $1`, [asesor_id]);

    const payload = {
      gol:    r.rows[0],
      asesor: info.rows[0] || null,
      tipo,
      cantidad,
    };

    emitLive('mundialito:gol', payload);
    res.json({ success: true, ...payload });
  } catch (err) {
    console.error('[mundialito.registrarGol]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.listarGoles = async (req, res) => {
  try {
    const { torneoId } = req.params;
    const limit = Math.min(parseInt(req.query.limit || 50, 10), 500);
    const r = await pool.query(
      `SELECT g.*, p.nombre AS asesor_nombre, p.foto_url
         FROM mundialito_goles g
         JOIN mundialito_participantes p ON p.id = g.asesor_id
        WHERE g.torneo_id = $1
        ORDER BY g.fecha_hora DESC
        LIMIT $2`,
      [torneoId, limit]
    );
    res.json({ success: true, goles: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// =============================================================================
// TABLA DE POSICIONES (la vista que se ve en la imagen)
// =============================================================================
exports.tablaPosiciones = async (req, res) => {
  try {
    const { torneoId } = req.params;
    const r = await pool.query(
      `SELECT v.*,
              (v.puntos_partidos + v.goles_totales) AS puntos_total
         FROM v_mundialito_posiciones v
        WHERE v.torneo_id = $1
        ORDER BY puntos_total DESC, v.goles_totales DESC, v.asesor_nombre ASC`,
      [torneoId]
    );
    // Agregar KPIs simulados/calculados — pendiente conexion real con indicadores
    const rows = r.rows.map((row, idx) => ({
      ...row,
      rango: idx + 1,
      kpi_eficiencia_pct: Number(((row.goles_totales * 7) % 30) + 70).toFixed(0),  // placeholder
      kpi_velocidad_min: Number((((row.goles_totales * 3) % 4) + 1).toFixed(1)),
      kpi_conversion_pct: Number(((row.goles_totales * 5) % 18) + 12).toFixed(0),
    }));
    res.json({ success: true, posiciones: rows });
  } catch (err) {
    console.error('[mundialito.tablaPosiciones]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// =============================================================================
// TOP 10 (incentivo de productividad)
// =============================================================================
exports.calcularTop10 = async (req, res) => {
  try {
    const { torneoId } = req.params;
    const r = await pool.query(
      `SELECT v.participante_id, v.asesor_nombre,
              (v.puntos_partidos + v.goles_totales) AS puntos_total
         FROM v_mundialito_posiciones v
        WHERE v.torneo_id = $1
        ORDER BY puntos_total DESC, v.goles_totales DESC
        LIMIT 10`, [torneoId]
    );
    await pool.query(`DELETE FROM mundialito_top10 WHERE torneo_id=$1`, [torneoId]);
    for (let i = 0; i < r.rows.length; i++) {
      await pool.query(
        `INSERT INTO mundialito_top10 (torneo_id, asesor_id, posicion) VALUES ($1,$2,$3)`,
        [torneoId, r.rows[i].participante_id, i + 1]
      );
    }
    res.json({ success: true, top10: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.listarTop10 = async (req, res) => {
  try {
    const { torneoId } = req.params;
    const r = await pool.query(
      `SELECT t.*, p.nombre AS asesor_nombre, p.foto_url, g.nombre AS grupo_nombre
         FROM mundialito_top10 t
         JOIN mundialito_participantes p ON p.id = t.asesor_id
         LEFT JOIN mundialito_grupos g ON g.id = p.grupo_id
        WHERE t.torneo_id = $1
        ORDER BY t.posicion ASC`, [torneoId]
    );
    res.json({ success: true, top10: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// =============================================================================
// PREMIOS / LIQUIDACION
// =============================================================================
exports.calcularPremios = async (req, res) => {
  try {
    const { torneoId } = req.params;
    const tor = await pool.query(`SELECT reglas_json FROM mundialito_torneos WHERE id=$1`, [torneoId]);
    if (tor.rows.length === 0) return res.status(404).json({ success: false, error: 'Torneo no encontrado' });
    const reglas = tor.rows[0].reglas_json;
    const monNormal    = Number(reglas.premio_dia_normal    || 1.0);
    const monAcelerado = Number(reglas.premio_dia_acelerado || 1.5);

    await pool.query(`DELETE FROM mundialito_premios WHERE torneo_id=$1`, [torneoId]);

    // Por cada gol tipo VENTA normal => $1
    // Por cada gol tipo BONO_90MIN o BONO_MISMO_DIA => $1.50 adicional
    const goles = await pool.query(
      `SELECT asesor_id, tipo, SUM(cantidad)::int AS total
         FROM mundialito_goles
        WHERE torneo_id = $1
        GROUP BY asesor_id, tipo`,
      [torneoId]
    );

    const acumulado = new Map(); // asesor_id -> monto
    for (const row of goles.rows) {
      const monto = (row.tipo === 'VENTA') ? row.total * monNormal : row.total * monAcelerado;
      acumulado.set(row.asesor_id, (acumulado.get(row.asesor_id) || 0) + monto);
    }
    for (const [asesor_id, monto] of acumulado.entries()) {
      await pool.query(
        `INSERT INTO mundialito_premios (torneo_id, asesor_id, monto, motivo)
         VALUES ($1, $2, $3, $4)`,
        [torneoId, asesor_id, monto.toFixed(2), 'Liquidacion automatica de fase']
      );
    }
    res.json({ success: true, premios_calculados: acumulado.size });
  } catch (err) {
    console.error('[mundialito.calcularPremios]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.listarPremios = async (req, res) => {
  try {
    const { torneoId } = req.params;
    const r = await pool.query(
      `SELECT pr.*, p.nombre AS asesor_nombre, p.foto_url
         FROM mundialito_premios pr
         JOIN mundialito_participantes p ON p.id = pr.asesor_id
        WHERE pr.torneo_id = $1
        ORDER BY pr.monto DESC`, [torneoId]
    );
    res.json({ success: true, premios: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
