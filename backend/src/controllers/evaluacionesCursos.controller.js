const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { esAdministradorEvaluaciones } = require('../middleware/evaluacionesAcceso');

const MAX_IMAGEN_BYTES = 2 * 1024 * 1024;
const MAX_IMAGENES_TOTAL_BYTES = 6 * 1024 * 1024;
const DATA_URL_IMAGEN = /^data:image\/(jpeg|png|webp|gif);base64,([a-zA-Z0-9+/]+={0,2})$/;
const bytesImagen = (valor) => {
  if (!valor) return 0;
  const match = String(valor).match(DATA_URL_IMAGEN);
  if (!match) return -1;
  const base64 = match[2];
  return Math.floor(base64.length * 3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
};

let tablasPromise;
function asegurarTablas() {
  if (!tablasPromise) tablasPromise = pool.query(`
    CREATE TABLE IF NOT EXISTS public.eva_cursos (
      id SERIAL PRIMARY KEY, titulo VARCHAR(200) NOT NULL, descripcion TEXT, empresa VARCHAR(20),
      video_url TEXT NOT NULL, video_nombre VARCHAR(255) NOT NULL, video_bytes BIGINT NOT NULL,
      evaluacion_id INTEGER NOT NULL REFERENCES public.eva_evaluaciones(id), activo BOOLEAN NOT NULL DEFAULT TRUE,
      creado_por INTEGER NOT NULL REFERENCES public.usuarios(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_eva_curso_empresa CHECK (empresa IS NULL OR empresa IN ('NOVONET','VELSA'))
    );
    CREATE TABLE IF NOT EXISTS public.eva_curso_progreso (
      curso_id INTEGER NOT NULL REFERENCES public.eva_cursos(id) ON DELETE CASCADE,
      usuario_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
      video_completado BOOLEAN NOT NULL DEFAULT FALSE, video_completado_en TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (curso_id, usuario_id)
    );
    CREATE INDEX IF NOT EXISTS idx_eva_cursos_activos ON public.eva_cursos (activo, empresa, created_at DESC);
  `).catch((error) => { tablasPromise = null; throw error; });
  return tablasPromise;
}

exports.listar = async (req, res) => {
  try {
    await asegurarTablas();
    const puedeGestionar = req.puedeCrearEvaluaciones === true;
    const esAdmin = esAdministradorEvaluaciones(req.user);
    const { rows } = await pool.query(`
      SELECT c.id, c.titulo, c.descripcion, c.empresa, c.video_url, c.video_nombre, c.video_bytes,
             c.evaluacion_id, c.activo, c.created_at, e.titulo AS evaluacion_titulo,
             jsonb_array_length(e.preguntas)::int AS total_preguntas, e.nota_minima,
             COALESCE(p.video_completado, FALSE) AS video_completado, p.video_completado_en,
             i.nota, i.aprobado
        FROM public.eva_cursos c
        JOIN public.eva_evaluaciones e ON e.id = c.evaluacion_id
        LEFT JOIN public.eva_curso_progreso p ON p.curso_id = c.id AND p.usuario_id = $1
        LEFT JOIN public.eva_intentos i ON i.evaluacion_id = c.evaluacion_id AND i.usuario_id = $1
       WHERE ($2::boolean OR c.activo)
         AND ($3::boolean OR c.empresa IS NULL OR c.empresa = $4)
       ORDER BY c.activo DESC, c.created_at DESC
    `, [req.user.id, puedeGestionar, esAdmin, req.user.empresa]);
    res.json({ success: true, puedeGestionar, data: rows.map((r) => ({
      id: r.id, titulo: r.titulo, descripcion: r.descripcion, empresa: r.empresa,
      videoUrl: r.video_url, videoNombre: r.video_nombre, videoBytes: Number(r.video_bytes),
      evaluacionId: r.evaluacion_id, evaluacionTitulo: r.evaluacion_titulo,
      totalPreguntas: r.total_preguntas, notaMinima: r.nota_minima, activo: r.activo,
      videoCompletado: r.video_completado, videoCompletadoEn: r.video_completado_en,
      nota: r.nota, aprobado: r.aprobado, createdAt: r.created_at,
    })) });
  } catch (error) {
    console.error('[evaluaciones.cursos.listar]', error);
    res.status(500).json({ success: false, error: 'No se pudieron cargar los cursos' });
  }
};

exports.crear = async (req, res) => {
  const borrarArchivo = () => { if (req.file?.path) fs.unlink(req.file.path, () => {}); };
  let evaluacionCreadaId = null;
  try {
    await asegurarTablas();
    const titulo = String(req.body.titulo || '').trim();
    const descripcion = String(req.body.descripcion || '').trim();
    const empresa = String(req.body.empresa || '').trim().toUpperCase() || null;
    let evaluacionId = Number(req.body.evaluacionId);
    if (titulo.length < 3) { borrarArchivo(); return res.status(400).json({ success: false, error: 'El título debe tener al menos 3 caracteres' }); }
    if (!req.file) return res.status(400).json({ success: false, error: 'Selecciona un video' });
    if (empresa && !['NOVONET', 'VELSA'].includes(empresa)) { borrarArchivo(); return res.status(400).json({ success: false, error: 'Empresa inválida' }); }
    if (evaluacionId) {
      const { rows: evaluaciones } = await pool.query(
        `SELECT id FROM eva_evaluaciones WHERE id = $1 AND activa AND jsonb_array_length(preguntas) > 0
           AND ($2::boolean OR creado_por = $3)`, [evaluacionId, esAdministradorEvaluaciones(req.user), req.user.id]
      );
      if (!evaluaciones.length) { borrarArchivo(); return res.status(400).json({ success: false, error: 'Selecciona una evaluación activa con preguntas' }); }
    } else {
      let preguntas;
      try { preguntas = JSON.parse(req.body.preguntas || '[]'); } catch { preguntas = []; }
      if (!Array.isArray(preguntas) || preguntas.length < 1) { borrarArchivo(); return res.status(400).json({ success: false, error: 'El curso necesita al menos una pregunta' }); }
      preguntas = preguntas.map((p, i) => ({
        id: `p${i + 1}`, texto: String(p.texto || '').trim(), imagen: p.imagen ? String(p.imagen) : null,
        opciones: Array.isArray(p.opciones) ? p.opciones.map((o) => String(o || '').trim()) : [],
        correcta: Number(p.correcta),
      }));
      const invalida = preguntas.find((p) => p.texto.length < 3 || p.opciones.length < 2
        || p.opciones.some((o) => !o) || !Number.isInteger(p.correcta) || p.correcta < 0 || p.correcta >= p.opciones.length);
      if (invalida) { borrarArchivo(); return res.status(400).json({ success: false, error: 'Completa el enunciado, las opciones y la respuesta correcta de cada pregunta' }); }
      let totalImagenes = 0;
      for (let i = 0; i < preguntas.length; i += 1) {
        const tamano = bytesImagen(preguntas[i].imagen);
        if (tamano < 0) { borrarArchivo(); return res.status(400).json({ success: false, error: `La imagen de la pregunta ${i + 1} no es válida` }); }
        if (tamano > MAX_IMAGEN_BYTES) { borrarArchivo(); return res.status(400).json({ success: false, error: `La imagen de la pregunta ${i + 1} supera 2 MB` }); }
        totalImagenes += tamano;
      }
      if (totalImagenes > MAX_IMAGENES_TOTAL_BYTES) { borrarArchivo(); return res.status(400).json({ success: false, error: 'Las imágenes superan el máximo total de 6 MB' }); }
      const notaMinima = Math.min(100, Math.max(1, Number(req.body.notaMinima) || 70));
      const creada = await pool.query(`
        INSERT INTO eva_evaluaciones (titulo, modulo_tema, empresa, nota_minima, preguntas, creado_por)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING id
      `, [`Evaluación · ${titulo}`, titulo, empresa, notaMinima, JSON.stringify(preguntas), req.user.id]);
      evaluacionId = creada.rows[0].id;
      evaluacionCreadaId = evaluacionId;
    }
    const videoUrl = `/uploads/evaluaciones/${path.basename(req.file.filename)}`;
    const { rows } = await pool.query(`
      INSERT INTO eva_cursos (titulo, descripcion, empresa, video_url, video_nombre, video_bytes, evaluacion_id, creado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id
    `, [titulo, descripcion || null, empresa, videoUrl, req.file.originalname, req.file.size, evaluacionId, req.user.id]);
    res.status(201).json({ success: true, data: { id: rows[0].id } });
  } catch (error) {
    borrarArchivo();
    if (evaluacionCreadaId) await pool.query(`DELETE FROM eva_evaluaciones WHERE id=$1`, [evaluacionCreadaId]).catch(() => {});
    console.error('[evaluaciones.cursos.crear]', error);
    res.status(500).json({ success: false, error: 'No se pudo crear el curso' });
  }
};

exports.completarVideo = async (req, res) => {
  try {
    await asegurarTablas();
    const cursoId = Number(req.params.cursoId);
    const { rows } = await pool.query(`SELECT id, activo, empresa FROM eva_cursos WHERE id = $1`, [cursoId]);
    const curso = rows[0];
    if (!curso || !curso.activo || (curso.empresa && curso.empresa !== req.user.empresa && !esAdministradorEvaluaciones(req.user))) {
      return res.status(404).json({ success: false, error: 'Curso no encontrado' });
    }
    await pool.query(`
      INSERT INTO eva_curso_progreso (curso_id, usuario_id, video_completado, video_completado_en)
      VALUES ($1,$2,TRUE,NOW()) ON CONFLICT (curso_id,usuario_id) DO UPDATE
      SET video_completado=TRUE, video_completado_en=COALESCE(eva_curso_progreso.video_completado_en,NOW()), updated_at=NOW()
    `, [cursoId, req.user.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[evaluaciones.cursos.completarVideo]', error);
    res.status(500).json({ success: false, error: 'No se pudo guardar el progreso' });
  }
};

exports.archivar = async (req, res) => {
  try {
    await asegurarTablas();
    const resultado = await pool.query(`UPDATE eva_cursos SET activo=$2, updated_at=NOW()
      WHERE id=$1 AND ($3::boolean OR creado_por=$4)`,
    [Number(req.params.cursoId), req.body.activo === true, esAdministradorEvaluaciones(req.user), req.user.id]);
    if (!resultado.rowCount) return res.status(404).json({ success: false, error: 'Curso no encontrado' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'No se pudo actualizar el curso' });
  }
};
