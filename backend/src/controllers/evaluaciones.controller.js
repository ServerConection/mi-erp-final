/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CONTROLADOR: Evaluaciones
 * ═══════════════════════════════════════════════════════════════════════════════
 * Las preguntas se guardan con su respuesta correcta en `eva_evaluaciones.preguntas`,
 * pero esa respuesta NUNCA sale hacia quien está por responder — se filtra acá
 * (ver `sinRespuestas`). Solo el creador/admin la ve completa.
 */

const XLSX = require('xlsx');
const pool = require('../config/db');
const { enviarResultadoEvaluacion } = require('../services/evaluacionesCorreo.service');

const nombreCompleto = (r) =>
  [r.nombres, r.apellidos].filter(Boolean).join(' ').trim() || r.usuario;

/** Quita "correcta" de cada pregunta — lo que ve alguien que va a responder. */
const sinRespuestas = (preguntas) =>
  preguntas.map(({ correcta, ...resto }) => resto);

// ══════════════════════════════════════════════════════════════════════════════
// CREAR / EDITAR
// ══════════════════════════════════════════════════════════════════════════════

function validarPreguntas(preguntas) {
  if (!Array.isArray(preguntas) || preguntas.length === 0) {
    return 'Necesitas al menos 1 pregunta';
  }
  for (let i = 0; i < preguntas.length; i++) {
    const p = preguntas[i];
    if (!p.texto || String(p.texto).trim().length < 3) {
      return `La pregunta ${i + 1} necesita un enunciado`;
    }
    if (!Array.isArray(p.opciones) || p.opciones.length < 2) {
      return `La pregunta ${i + 1} necesita al menos 2 opciones`;
    }
    if (p.opciones.some(o => !o || String(o).trim() === '')) {
      return `La pregunta ${i + 1} tiene una opción vacía`;
    }
    if (!Number.isInteger(p.correcta) || p.correcta < 0 || p.correcta >= p.opciones.length) {
      return `La pregunta ${i + 1} necesita marcar cuál opción es la correcta`;
    }
  }
  return null;
}

/** POST /api/evaluaciones */
exports.crear = async (req, res) => {
  try {
    const { titulo, moduloTema, empresa, notaMinima, tiempoLimiteMin } = req.body;

    if (!titulo || String(titulo).trim().length < 3) {
      return res.status(400).json({ success: false, error: 'El título debe tener al menos 3 caracteres' });
    }
    const nota = parseInt(notaMinima, 10);
    if (!Number.isInteger(nota) || nota < 1 || nota > 100) {
      return res.status(400).json({ success: false, error: 'La nota mínima debe estar entre 1 y 100' });
    }
    if (empresa && !['NOVONET', 'VELSA'].includes(String(empresa).toUpperCase())) {
      return res.status(400).json({ success: false, error: 'Empresa inválida' });
    }

    // Opcional: NULL/vacío = sin límite de tiempo
    let tiempoLimite = null;
    if (tiempoLimiteMin !== undefined && tiempoLimiteMin !== null && tiempoLimiteMin !== '') {
      tiempoLimite = parseInt(tiempoLimiteMin, 10);
      if (!Number.isInteger(tiempoLimite) || tiempoLimite < 1 || tiempoLimite > 180) {
        return res.status(400).json({ success: false, error: 'El tiempo límite debe estar entre 1 y 180 minutos' });
      }
    }

    const preguntas = (req.body.preguntas || []).map((p, i) => ({
      id: `p${i + 1}`,
      texto: String(p.texto).trim(),
      opciones: p.opciones.map(o => String(o).trim()),
      correcta: p.correcta,
    }));
    const errorPreguntas = validarPreguntas(preguntas);
    if (errorPreguntas) {
      return res.status(400).json({ success: false, error: errorPreguntas });
    }

    const { rows } = await pool.query(
      `INSERT INTO eva_evaluaciones (titulo, modulo_tema, empresa, nota_minima, tiempo_limite_min, preguntas, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING id, titulo, modulo_tema, empresa, nota_minima, tiempo_limite_min, activa, created_at`,
      [
        String(titulo).trim(),
        moduloTema ? String(moduloTema).trim() : null,
        empresa ? String(empresa).toUpperCase() : null,
        nota,
        tiempoLimite,
        JSON.stringify(preguntas),
        req.user.id,
      ]
    );

    res.status(201).json({ success: true, data: { ...rows[0], totalPreguntas: preguntas.length } });
  } catch (error) {
    console.error('[evaluaciones.crear]', error);
    res.status(500).json({ success: false, error: 'No se pudo crear la evaluación' });
  }
};

/** PATCH /api/evaluaciones/:evaluacionId/archivar — activa/desactiva, no borra */
exports.archivar = async (req, res) => {
  try {
    const activa = req.body.activa === true;
    await pool.query(
      `UPDATE eva_evaluaciones SET activa = $2, updated_at = now() WHERE id = $1`,
      [req.evaluacion.id, activa]
    );
    res.json({ success: true, data: { id: req.evaluacion.id, activa } });
  } catch (error) {
    console.error('[evaluaciones.archivar]', error);
    res.status(500).json({ success: false, error: 'No se pudo actualizar la evaluación' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// LISTADOS
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/evaluaciones — panel de quien crea: sus evaluaciones (o todas si admin) + stats */
exports.listar = async (req, res) => {
  try {
    const esAdmin = req.user.perfil === 'ADMINISTRADOR';
    const { rows } = await pool.query(
      `SELECT e.id, e.titulo, e.modulo_tema, e.empresa, e.nota_minima, e.tiempo_limite_min, e.activa, e.created_at,
              jsonb_array_length(e.preguntas) AS total_preguntas,
              u.usuario, u.nombres, u.apellidos,
              (SELECT COUNT(*) FROM eva_intentos i WHERE i.evaluacion_id = e.id) AS total_intentos,
              (SELECT COUNT(*) FROM eva_intentos i WHERE i.evaluacion_id = e.id AND i.aprobado) AS total_aprobados
         FROM eva_evaluaciones e
         JOIN usuarios u ON u.id = e.creado_por
        WHERE $1::boolean OR e.creado_por = $2
        ORDER BY e.created_at DESC`,
      [esAdmin, req.user.id]
    );

    res.json({
      success: true,
      puedeCrear: req.puedeCrearEvaluaciones === true,
      data: rows.map(r => ({
        id: r.id, titulo: r.titulo, moduloTema: r.modulo_tema, empresa: r.empresa,
        notaMinima: r.nota_minima, tiempoLimiteMin: r.tiempo_limite_min, activa: r.activa, createdAt: r.created_at,
        totalPreguntas: Number(r.total_preguntas),
        totalIntentos: Number(r.total_intentos),
        totalAprobados: Number(r.total_aprobados),
        creador: nombreCompleto(r),
      })),
    });
  } catch (error) {
    console.error('[evaluaciones.listar]', error);
    res.status(500).json({ success: false, error: 'No se pudo cargar la lista de evaluaciones' });
  }
};

/** GET /api/evaluaciones/mias — evaluaciones activas para mí, con mi resultado si ya la tomé */
exports.misEvaluaciones = async (req, res) => {
  try {
    const esAdmin = req.user.perfil === 'ADMINISTRADOR';
    const { rows } = await pool.query(
      `SELECT e.id, e.titulo, e.modulo_tema, e.empresa, e.nota_minima, e.tiempo_limite_min,
              jsonb_array_length(e.preguntas) AS total_preguntas,
              i.nota, i.aprobado, i.created_at AS respondida_en
         FROM eva_evaluaciones e
         LEFT JOIN eva_intentos i ON i.evaluacion_id = e.id AND i.usuario_id = $1
        WHERE e.activa
          AND ($2::boolean OR e.empresa IS NULL OR e.empresa = $3)
        ORDER BY (i.id IS NULL) DESC, e.created_at DESC`,
      [req.user.id, esAdmin, req.user.empresa]
    );

    res.json({
      success: true,
      data: rows.map(r => ({
        id: r.id, titulo: r.titulo, moduloTema: r.modulo_tema, empresa: r.empresa,
        notaMinima: r.nota_minima, tiempoLimiteMin: r.tiempo_limite_min, totalPreguntas: Number(r.total_preguntas),
        yaRespondida: r.respondida_en !== null,
        miNota: r.nota, miAprobado: r.aprobado, respondidaEn: r.respondida_en,
      })),
    });
  } catch (error) {
    console.error('[evaluaciones.misEvaluaciones]', error);
    res.status(500).json({ success: false, error: 'No se pudieron cargar tus evaluaciones' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// TOMAR / RESPONDER
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/evaluaciones/:evaluacionId — para responder: sin respuestas correctas */
exports.detalleParaTomar = async (req, res) => {
  try {
    if (!req.evaluacion.activa && !req.esCreadorEvaluacion) {
      return res.status(404).json({ success: false, error: 'Evaluación no encontrada' });
    }
    if (req.evaluacion.empresa && req.evaluacion.empresa !== req.user.empresa && req.user.perfil !== 'ADMINISTRADOR') {
      return res.status(404).json({ success: false, error: 'Evaluación no encontrada' });
    }

    const { rows: intento } = await pool.query(
      `SELECT nota, aprobado, created_at FROM eva_intentos WHERE evaluacion_id = $1 AND usuario_id = $2`,
      [req.evaluacion.id, req.user.id]
    );
    if (intento.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Ya respondiste esta evaluación',
        resultado: { nota: intento[0].nota, aprobado: intento[0].aprobado, respondidaEn: intento[0].created_at },
      });
    }

    res.json({
      success: true,
      data: {
        id: req.evaluacion.id,
        titulo: req.evaluacion.titulo,
        moduloTema: req.evaluacion.modulo_tema,
        notaMinima: req.evaluacion.nota_minima,
        tiempoLimiteMin: req.evaluacion.tiempo_limite_min,
        iniciadaEn: new Date().toISOString(),
        preguntas: sinRespuestas(req.evaluacion.preguntas),
      },
    });
  } catch (error) {
    console.error('[evaluaciones.detalleParaTomar]', error);
    res.status(500).json({ success: false, error: 'No se pudo cargar la evaluación' });
  }
};

/** POST /api/evaluaciones/:evaluacionId/responder  Body: { respuestas: [{preguntaId, opcionElegida}] } */
exports.responder = async (req, res) => {
  try {
    if (!req.evaluacion.activa) {
      return res.status(400).json({ success: false, error: 'Esta evaluación ya no está activa' });
    }

    const respuestas = Array.isArray(req.body.respuestas) ? req.body.respuestas : [];
    const preguntas = req.evaluacion.preguntas;

    const respuestaPorPregunta = new Map(respuestas.map(r => [r.preguntaId, r.opcionElegida]));

    let correctas = 0;
    for (const p of preguntas) {
      if (respuestaPorPregunta.get(p.id) === p.correcta) correctas++;
    }
    const total = preguntas.length;
    const nota = Math.round((correctas / total) * 100);
    const aprobado = nota >= req.evaluacion.nota_minima;

    let intento;
    try {
      const { rows } = await pool.query(
        `INSERT INTO eva_intentos (evaluacion_id, usuario_id, respuestas, total_preguntas, correctas, nota, aprobado)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
         RETURNING id, nota, aprobado, created_at`,
        [req.evaluacion.id, req.user.id, JSON.stringify(respuestas), total, correctas, nota, aprobado]
      );
      intento = rows[0];
    } catch (e) {
      if (e.code === '23505') { // unique_violation → ya la había respondido
        return res.status(409).json({ success: false, error: 'Ya respondiste esta evaluación' });
      }
      throw e;
    }

    // Correo de resultado / certificado — best effort, nunca tumba la respuesta al usuario
    // (req.user solo trae id/usuario/empresa/perfil — nombres/correo se buscan aparte)
    const { rows: userRows } = await pool.query(
      `SELECT correo, usuario, nombres, apellidos FROM usuarios WHERE id = $1`, [req.user.id]
    );
    const datosUsuario = userRows[0] || {};
    const resultadoCorreo = await enviarResultadoEvaluacion({
      correoDestino: datosUsuario.correo,
      nombre: nombreCompleto(datosUsuario),
      tituloEvaluacion: req.evaluacion.titulo,
      moduloTema: req.evaluacion.modulo_tema,
      nota, notaMinima: req.evaluacion.nota_minima,
      aprobado, fecha: intento.created_at, empresa: req.user.empresa,
    });

    if (resultadoCorreo.ok) {
      await pool.query(`UPDATE eva_intentos SET correo_enviado = true WHERE id = $1`, [intento.id]);
    }

    res.status(201).json({
      success: true,
      data: { nota, aprobado, correctas, total, correoEnviado: resultadoCorreo.ok },
    });
  } catch (error) {
    console.error('[evaluaciones.responder]', error);
    res.status(500).json({ success: false, error: 'No se pudo registrar tu respuesta' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// RESULTADOS (solo creador/admin)
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/evaluaciones/:evaluacionId/resultados */
exports.resultados = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.id, i.usuario_id, i.nota, i.correctas, i.total_preguntas, i.aprobado,
              i.correo_enviado, i.created_at,
              u.usuario, u.nombres, u.apellidos, u.perfil, u.empresa
         FROM eva_intentos i
         JOIN usuarios u ON u.id = i.usuario_id
        WHERE i.evaluacion_id = $1
        ORDER BY i.nota DESC, i.created_at ASC`,
      [req.evaluacion.id]
    );

    res.json({
      success: true,
      data: {
        evaluacion: {
          id: req.evaluacion.id, titulo: req.evaluacion.titulo,
          notaMinima: req.evaluacion.nota_minima, totalPreguntas: req.evaluacion.preguntas.length,
        },
        intentos: rows.map(r => ({
          id: r.id, usuarioId: r.usuario_id, nombre: nombreCompleto(r),
          usuario: r.usuario, perfil: r.perfil, empresa: r.empresa,
          nota: r.nota, correctas: r.correctas, totalPreguntas: r.total_preguntas,
          aprobado: r.aprobado, correoEnviado: r.correo_enviado, respondidaEn: r.created_at,
        })),
      },
    });
  } catch (error) {
    console.error('[evaluaciones.resultados]', error);
    res.status(500).json({ success: false, error: 'No se pudieron cargar los resultados' });
  }
};

/** GET /api/evaluaciones/:evaluacionId/resultados/exportar — descarga .xlsx */
exports.exportarResultados = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.nota, i.correctas, i.total_preguntas, i.aprobado, i.created_at,
              u.usuario, u.nombres, u.apellidos, u.perfil, u.empresa
         FROM eva_intentos i
         JOIN usuarios u ON u.id = i.usuario_id
        WHERE i.evaluacion_id = $1
        ORDER BY i.nota DESC`,
      [req.evaluacion.id]
    );

    const datos = rows.map(r => ({
      Nombre: nombreCompleto(r),
      Usuario: r.usuario,
      Perfil: r.perfil,
      Empresa: r.empresa,
      Nota: r.nota,
      Correctas: `${r.correctas}/${r.total_preguntas}`,
      Resultado: r.aprobado ? 'APROBADO' : 'REPROBADO',
      Fecha: new Date(r.created_at).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' }),
    }));

    const libro = XLSX.utils.book_new();
    const pagina = XLSX.utils.json_to_sheet(
      datos.length > 0 ? datos : [{ Nombre: '', Usuario: '', Perfil: '', Empresa: '', Nota: '', Correctas: '', Resultado: '', Fecha: '' }]
    );
    pagina['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(libro, pagina, 'Resultados');

    const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
    const archivo = `${req.evaluacion.titulo.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, '_').slice(0, 60)}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(archivo)}"`);
    res.send(buffer);
  } catch (error) {
    console.error('[evaluaciones.exportarResultados]', error);
    res.status(500).json({ success: false, error: 'No se pudo generar el Excel' });
  }
};
