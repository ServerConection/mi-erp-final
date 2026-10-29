const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { verificarToken } = require("../middleware/auth");
const { recolectar: recolectarBitrix } = require("../controllers/bitrixSesiones.controller");
const { claveNombre, mismaPalabra } = require("../services/asesorMatcher.service");

const TOLERANCIA_INGRESO_MIN = 5;

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN
// ─────────────────────────────────────────────────────────────

const ACTIVIDADES = new Set([
  "INGRESO",
  "SALIDA ALMUERZO",
  "INGRESO ALMUERZO",
  "SALIDA",
]);

// Mensajes que se muestran al usuario después de registrar.
const MENSAJES_ACTIVIDAD = {
  INGRESO: "¡Que tengas un excelente día! Vamos con todo 💪",
  "SALIDA ALMUERZO":
    "¡Buen provecho! Disfruta tu almuerzo y recarga energías 🍽️",
  "INGRESO ALMUERZO":
    "¡Bienvenido nuevamente! Vamos con todo en esta segunda parte del día 🚀",
  SALIDA:
    "¡Gracias por tu esfuerzo y compromiso de hoy! Que tengas un excelente descanso 🙌",
};

// Perfiles autorizados.
const PERFILES_PERMITIDOS = new Set([
  "ADMINISTRADOR",
  "GERENCIA",
  "GERENTE",
]);

// Asesores comisionistas: solo registran y ven SUS propias marcaciones
// (control de conexión para toma de leads). No acceden al resumen general.
const PERFIL_COMISIONISTA = "USUARIO";
// NOVONET ACCESS: cualquier usuario autenticado registra sus marcaciones.
const puedeMarcar = (perfil) => Boolean(perfil);

const MENSAJES_CONEXION = {
  INGRESO: "Conexión iniciada. ¡Éxitos en la toma de leads! 💪",
  "SALIDA ALMUERZO": "Pausa registrada. La recepción de leads queda en pausa ⏸️",
  "INGRESO ALMUERZO": "Segundo bloque iniciado. ¡Vamos con todo! 🚀",
  SALIDA: "Conexión finalizada. ¡Gracias por tu gestión de hoy! 🙌",
};

const normalizarTexto = (valor) =>
  String(valor || "")
    .trim()
    .toUpperCase();

const puedeVerResumenGeneral = (perfil) => {
  const normalizado = normalizarTexto(perfil);
  return PERFILES_PERMITIDOS.has(normalizado) || /^GEREN(?:CIA|TE)[ _-]/.test(normalizado);
};

const esAdministrador = (perfil) => /^ADMINISTRADOR(?:A)?(?:[ _-]|$)/.test(normalizarTexto(perfil));

const tokensNombre = (valor) => [...new Set(claveNombre(valor).split(" ").filter((x) => x.length > 1))];

// Vincula únicamente coincidencias inequívocas. Nunca elige al "más parecido":
// si hay cero o más de un candidato, el estado queda expresamente no verificable.
function vincularUsuarioBitrix(nombre, usuariosBitrix) {
  const clave = claveNombre(nombre);
  const exactos = usuariosBitrix.filter((u) => claveNombre(u.nombre) === clave);
  if (exactos.length === 1) return { estado: "EXACTO", usuario: exactos[0] };
  if (exactos.length > 1) return { estado: "AMBIGUO", usuario: null };

  const origen = tokensNombre(nombre);
  if (origen.length < 2) return { estado: "NO_ENCONTRADO", usuario: null };
  const candidatos = usuariosBitrix.filter((u) => {
    const destino = tokensNombre(u.nombre);
    const corto = origen.length <= destino.length ? origen : destino;
    const largo = origen.length <= destino.length ? destino : origen;
    return corto.length >= 2 && corto.every((x) => largo.some((y) => mismaPalabra(x, y)));
  });
  return candidatos.length === 1
    ? { estado: "NOMBRE_UNICO", usuario: candidatos[0] }
    : { estado: candidatos.length > 1 ? "AMBIGUO" : "NO_ENCONTRADO", usuario: null };
}

// ─────────────────────────────────────────────────────────────
// OBTENER IP
// ─────────────────────────────────────────────────────────────

function obtenerIp(req) {
  const forwarded = req.headers["x-forwarded-for"];

  let ip = forwarded
    ? String(forwarded).split(",")[0].trim()
    : req.ip ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    null;

  // Convierte:
  // ::ffff:192.168.1.1
  // en:
  // 192.168.1.1
  if (ip && ip.startsWith("::ffff:")) {
    ip = ip.substring(7);
  }

  return ip;
}

// Devuelve los datos vigentes desde la base. El cargo no debe depender del
// perfil guardado en localStorage, que puede estar incompleto o desactualizado.
router.get("/mi-perfil", verificarToken, async (req, res) => {
  const usuario = req.user;
  if (!usuario?.id) {
    return res.status(401).json({ success: false, error: "Usuario no autenticado" });
  }
  return res.json({
    success: true,
    data: {
      id: usuario.id,
      usuario: usuario.usuario || "",
      nombre: usuario.nombreCompleto || "",
      cargo: usuario.cargo || "",
      perfil: usuario.perfil || "",
      empresa: usuario.empresa || "",
      modalidad_asistencia: usuario.modalidad_asistencia || "",
    },
  });
});

// ─────────────────────────────────────────────────────────────
// POST /api/control-asistencia
// ─────────────────────────────────────────────────────────────

router.post("/", verificarToken, async (req, res) => {
  try {
    const usuario = req.user;

    // ─────────────────────────────────────────────────────
    // VALIDAR AUTENTICACIÓN
    // ─────────────────────────────────────────────────────

    if (!usuario?.id) {
      return res.status(401).json({
        success: false,
        error: "Usuario no autenticado",
      });
    }

    // ─────────────────────────────────────────────────────
    // VALIDAR PERFIL
    // ─────────────────────────────────────────────────────

    const perfilUsuario = normalizarTexto(usuario.perfil);

    if (!puedeMarcar(perfilUsuario)) {
      return res.status(403).json({
        success: false,
        error:
          "No tiene permiso para registrar asistencia",
      });
    }

    // ─────────────────────────────────────────────────────
    // VALIDAR ACTIVIDAD
    // ─────────────────────────────────────────────────────

    const actividad = normalizarTexto(
      req.body?.actividad
    );

    if (!ACTIVIDADES.has(actividad)) {
      return res.status(400).json({
        success: false,
        error: "Actividad inválida",
      });
    }

    // ─────────────────────────────────────────────────────
    // VALIDAR UBICACIÓN
    // ─────────────────────────────────────────────────────

    const latitud = Number(req.body?.latitud);

    const longitud = Number(
      req.body?.longitud
    );

    const precisionMetros = Number(
      req.body?.precision_metros
    );

    if (
      !Number.isFinite(latitud) ||
      !Number.isFinite(longitud) ||
      !Number.isFinite(precisionMetros)
    ) {
      return res.status(400).json({
        success: false,
        error:
          "La ubicación enviada no es válida",
      });
    }

    if (latitud < -90 || latitud > 90) {
      return res.status(400).json({
        success: false,
        error: "Latitud inválida",
      });
    }

    if (
      longitud < -180 ||
      longitud > 180
    ) {
      return res.status(400).json({
        success: false,
        error: "Longitud inválida",
      });
    }

    if (precisionMetros < 0) {
      return res.status(400).json({
        success: false,
        error:
          "Precisión de ubicación inválida",
      });
    }

    // ─────────────────────────────────────────────────────
    // DATOS DEL USUARIO
    //
    // Estos datos NO vienen del frontend.
    // Se obtienen del token autenticado.
    // ─────────────────────────────────────────────────────

    const usuarioLogin =
      usuario.usuario ||
      usuario.username ||
      usuario.login ||
      "";

    const nombreCompleto =
      usuario.nombreCompleto ||
      usuario.nombre_completo ||
      usuario.nombre ||
      "";

    const cargo = usuario.cargo || "";

    const ip = obtenerIp(req);

    // ─────────────────────────────────────────────────────
    // EVITAR DOBLE REGISTRO ACCIDENTAL
    //
    // Si el mismo usuario intenta registrar la misma
    // actividad dentro de 3 segundos, se rechaza.
    // ─────────────────────────────────────────────────────

    const duplicado = await pool.query(
      `
      SELECT id
      FROM control_asistencia
      WHERE usuario_id = $1
        AND actividad = $2
        AND created_at >= NOW() - INTERVAL '3 seconds'
      LIMIT 1
      `,
      [usuario.id, actividad]
    );

    if (duplicado.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error:
          "Esta marcación ya fue registrada",
      });
    }

    // ─────────────────────────────────────────────────────
    // GUARDAR REGISTRO
    //
    // La fecha y hora oficial se generan aquí.
    // No dependemos del reloj del navegador.
    // ─────────────────────────────────────────────────────

    const query = `
      INSERT INTO control_asistencia (
        usuario_id,
        usuario,
        nombre_completo,
        cargo,
        actividad,
        fecha,
        hora,
        fecha_hora,
        ip_publica,
        latitud,
        longitud,
        precision_metros,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guayaquil')::date,
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guayaquil')::time,
        CURRENT_TIMESTAMP AT TIME ZONE 'America/Guayaquil',
        $6,
        $7,
        $8,
        $9,
        NOW(),
        NOW()
      )
      RETURNING *
    `;

    const values = [
      usuario.id,
      usuarioLogin,
      nombreCompleto,
      cargo,
      actividad,
      ip,
      latitud,
      longitud,
      precisionMetros,
    ];

    const result = await pool.query(
      query,
      values
    );

    const registro = result.rows[0];

    // ─────────────────────────────────────────────────────
    // RESPUESTA CON MENSAJE MOTIVACIONAL
    // ─────────────────────────────────────────────────────

    return res.status(201).json({
      success: true,

      data: registro,

      mensaje:
        (normalizarTexto(usuario.modalidad_asistencia) === "CONEXION" ||
        (!usuario.modalidad_asistencia && [PERFIL_COMISIONISTA, "ASESOR"].includes(perfilUsuario))
          ? MENSAJES_CONEXION[actividad]
          : MENSAJES_ACTIVIDAD[actividad]) ||
        "Marcación registrada correctamente",
    });
  } catch (error) {
    console.error(
      "[controlAsistencia.routes] Error registrando marcación:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "Error interno al guardar la marcación",
    });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/control-asistencia/resumen-dia?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Una fila por usuario y fecha con la primera marcación de cada actividad.
router.get("/resumen-dia", verificarToken, async (req, res) => {
  try {
    const usuario = req.user;
    if (!usuario?.id) {
      return res.status(401).json({ success: false, error: "Usuario no autenticado" });
    }
    if (!puedeVerResumenGeneral(usuario.perfil)) {
      return res.status(403).json({ success: false, error: "No tiene permiso para consultar marcaciones" });
    }

    const desde = String(req.query.desde || req.query.fecha || "").trim();
    const hasta = String(req.query.hasta || req.query.fecha || desde).trim();
    const formatoFecha = /^\d{4}-\d{2}-\d{2}$/;
    if ((desde && !formatoFecha.test(desde)) || (hasta && !formatoFecha.test(hasta))) {
      return res.status(400).json({ success: false, error: "Las fechas deben tener formato YYYY-MM-DD" });
    }
    if (desde && hasta && desde > hasta) {
      return res.status(400).json({ success: false, error: "La fecha desde no puede ser posterior a la fecha hasta" });
    }

    const result = await pool.query(`
      SELECT
        ca.fecha::text AS fecha,
        ca.usuario_id,
        MAX(NULLIF(TRIM(ca.usuario), '')) AS usuario,
        MAX(NULLIF(TRIM(ca.nombre_completo), '')) AS nombre_completo,
        COALESCE(MAX(NULLIF(UPPER(TRIM(u.empresa)), '')), 'SIN EMPRESA') AS empresa,
        TO_CHAR(MIN(ca.hora) FILTER (WHERE ca.actividad = 'INGRESO'), 'HH24:MI') AS ingreso,
        TO_CHAR(MIN(ca.hora) FILTER (WHERE ca.actividad = 'SALIDA ALMUERZO'), 'HH24:MI') AS salida_almuerzo,
        TO_CHAR(MIN(ca.hora) FILTER (WHERE ca.actividad = 'INGRESO ALMUERZO'), 'HH24:MI') AS regreso_almuerzo,
        TO_CHAR(MIN(ca.hora) FILTER (WHERE ca.actividad = 'SALIDA'), 'HH24:MI') AS salida
      FROM public.control_asistencia ca
      LEFT JOIN public.usuarios u ON u.id = ca.usuario_id
      WHERE ca.fecha BETWEEN
        COALESCE(NULLIF($1, '')::date, (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guayaquil')::date)
        AND COALESCE(NULLIF($2, '')::date, (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guayaquil')::date)
      GROUP BY ca.fecha, ca.usuario_id
      ORDER BY ca.fecha DESC, COALESCE(
        MIN(ca.hora) FILTER (WHERE ca.actividad = 'INGRESO'),
        MIN(ca.hora)
      ) DESC, MAX(ca.nombre_completo) ASC
    `, [desde, hasta]);

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("[controlAsistencia.routes] Error consultando resumen diario:", error);
    return res.status(500).json({ success: false, error: "Error al obtener el resumen diario" });
  }
});

// GET /api/control-asistencia/control-ingresos?empresa=NOVONET
// Cruce operativo del día: horario PostgreSQL + primera marcación de Access +
// estado vivo de Bitrix. El estado externo nunca se infiere si la API falla o
// si el nombre no se puede vincular de forma única.
router.get("/control-ingresos", verificarToken, async (req, res) => {
  try {
    const usuario = req.user;
    if (!usuario?.id) return res.status(401).json({ success: false, error: "Usuario no autenticado" });
    if (!esAdministrador(usuario.perfil)) {
      return res.status(403).json({ success: false, error: "No tiene permiso para consultar el control de ingresos" });
    }

    const empresaSolicitada = String(req.query.empresa || usuario.empresa || "").trim().toUpperCase();
    if (!["NOVONET", "VELSA", "SEMILLERO"].includes(empresaSolicitada)) {
      return res.status(400).json({ success: false, error: "Empresa no habilitada para el control de ingresos" });
    }
    const empresa = empresaSolicitada;
    const fechaConsulta = String(req.query.fecha || "").trim()
      || new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(new Date());
    const fechaObj = new Date(`${fechaConsulta}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaConsulta)
        || Number.isNaN(fechaObj.getTime())
        || fechaObj.toISOString().slice(0, 10) !== fechaConsulta) {
      return res.status(400).json({ success: false, error: "La fecha debe tener formato YYYY-MM-DD" });
    }

    const { rows } = await pool.query(`
      SELECT
        u.id AS usuario_id,
        BTRIM(COALESCE(u.nombres, '') || ' ' || COALESCE(u.apellidos, '')) AS nombre_completo,
        ht.supervisor,
        ht.modalidad,
        ht.tipo,
        TO_CHAR(ht.hora_inicio, 'HH24:MI') AS hora_programada,
        TO_CHAR(ht.hora_fin, 'HH24:MI') AS hora_fin,
        TO_CHAR(ht.hora_inicio2, 'HH24:MI') AS hora_inicio2,
        TO_CHAR(ht.hora_fin2, 'HH24:MI') AS hora_fin2,
        COALESCE(u.usuario, '') AS usuario,
        COALESCE(u.modalidad_asistencia, 'JORNADA') AS modalidad_asistencia,
        TO_CHAR(m.ingreso, 'HH24:MI') AS ingreso_access,
        CASE WHEN m.ingreso IS NULL OR ht.hora_inicio IS NULL THEN NULL
             ELSE ROUND(EXTRACT(EPOCH FROM (m.ingreso - ht.hora_inicio)) / 60)::int
        END AS diferencia_minutos,
        CASE WHEN ht.hora_inicio IS NULL THEN NULL
          WHEN $3::date < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guayaquil')::date THEN TRUE
          WHEN $3::date > (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guayaquil')::date THEN FALSE
          ELSE ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Guayaquil')::time
            > ht.hora_inicio + ($1::int * INTERVAL '1 minute'))
        END AS turno_vencido
      FROM public.usuarios u
      LEFT JOIN LATERAL (
        SELECT h.*
        FROM public.horarios_turnos h
        WHERE h.usuario_id = u.id
          AND h.empresa = $2
          AND h.fecha = $3::date
        ORDER BY h.id DESC
        LIMIT 1
      ) ht ON TRUE
      LEFT JOIN LATERAL (
        SELECT MIN(ca.hora) AS ingreso
        FROM public.control_asistencia ca
        WHERE ca.usuario_id = u.id
          AND ca.fecha = $3::date
          AND UPPER(BTRIM(ca.actividad)) = 'INGRESO'
      ) m ON TRUE
      WHERE UPPER(BTRIM(COALESCE(u.empresa, ''))) = $2
        AND UPPER(BTRIM(COALESCE(u.activo, ''))) = 'SI'
        AND UPPER(BTRIM(COALESCE(u.modalidad_asistencia, ''))) = 'CONEXION'
        AND COALESCE(ht.tipo, 'TURNO') = 'TURNO'
      ORDER BY ht.hora_inicio NULLS LAST, nombre_completo
    `, [TOLERANCIA_INGRESO_MIN, empresa, fechaConsulta]);

    let catalogo = [];
    let catalogoRespaldo = [];
    try {
      if (empresa === "VELSA") {
        const r = await pool.query(`
          SELECT DISTINCT ON (UPPER(BTRIM(nombre_asesor)))
                 nombre_asesor AS nombre, nombre_supervisor AS supervisor
          FROM public.catalogo_asesores_velsa
          WHERE nombre_asesor IS NOT NULL
            AND periodo <= date_trunc('month', $1::date)::date
          ORDER BY UPPER(BTRIM(nombre_asesor)), periodo DESC
        `, [fechaConsulta]);
        catalogo = r.rows;
      } else {
        const metas = await pool.query(`
          SELECT asesor AS nombre, supervisor
          FROM public.metas_asesor
          WHERE empresa = $1 AND activo
            AND anio = EXTRACT(YEAR FROM $2::date)::int
            AND mes = EXTRACT(MONTH FROM $2::date)::int
        `, [empresa, fechaConsulta]);
        catalogo = metas.rows;
        const empleados = await pool.query(`
          SELECT DISTINCT ON (UPPER(BTRIM(nombre_completo)))
                 nombre_completo AS nombre, supervisor
          FROM public.empleados
          WHERE nombre_completo IS NOT NULL AND supervisor IS NOT NULL
          ORDER BY UPPER(BTRIM(nombre_completo)),
                   CASE WHEN BTRIM(codigo) ~ '^\\d+$' THEN BTRIM(codigo)::int ELSE -1 END DESC
        `);
        catalogoRespaldo = empleados.rows;
      }
    } catch (error) {
      console.warn("[control-ingresos] catálogo de supervisores no disponible:", error.message);
    }

    for (const fila of rows) {
      if (fila.supervisor) continue;
      let cruce = vincularUsuarioBitrix(fila.nombre_completo, catalogo);
      if (!cruce.usuario && catalogoRespaldo.length) {
        cruce = vincularUsuarioBitrix(fila.nombre_completo, catalogoRespaldo);
      }
      if (cruce.usuario?.supervisor) fila.supervisor = cruce.usuario.supervisor;
    }

    let bitrix = null;
    let bitrixError = null;
    const hoyEcuador = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(new Date());
    try {
      if (fechaConsulta !== hoyEcuador) {
        throw new Error("Bitrix no conserva un histórico confiable del estado en línea");
      }
      bitrix = await recolectarBitrix({ forzar: String(req.query.forzar || "") === "1" });
      const fuente = bitrix?.fuentes?.[empresa];
      // La licencia corporativa NOVONET también puede devolver usuarios VELSA.
      // Bitrix Live los clasifica por su identidad ERP; esos datos siguen siendo
      // válidos aunque el webhook directo BITRIX_VELSA_URL no esté configurado.
      const usuariosClasificados = (bitrix?.usuarios || []).filter((u) => u.cuenta === empresa);
      if (!usuariosClasificados.length && fuente?.error) bitrixError = fuente.error;
      if (!usuariosClasificados.length && !fuente?.error) bitrixError = `Bitrix no devolvió usuarios de ${empresa}`;
    } catch (error) {
      bitrixError = error.message;
    }

    const universoBitrix = bitrixError
      ? []
      : (bitrix?.usuarios || []).filter((u) => u.cuenta === empresa);

    const data = rows.map((fila) => {
      const vinculo = bitrixError
        ? { estado: "FUENTE_NO_DISPONIBLE", usuario: null }
        : vincularUsuarioBitrix(fila.nombre_completo, universoBitrix);
      const bx = vinculo.usuario;
      const conectado = bx ? Boolean(bx.online) : null;

      let estado;
      if (fila.ingreso_access && !fila.hora_programada) {
        estado = "INGRESO_REGISTRADO_SIN_HORARIO";
      } else if (fila.ingreso_access) {
        estado = Number(fila.diferencia_minutos) <= TOLERANCIA_INGRESO_MIN
          ? "INGRESO_A_TIEMPO"
          : "INGRESO_ATRASADO";
      } else if (fila.hora_programada && !fila.turno_vencido) {
        estado = "TURNO_PENDIENTE";
      } else if (!bx) {
        estado = "BITRIX_NO_VERIFICABLE";
      } else if (conectado) {
        estado = "BITRIX_SIN_ACCESS";
      } else {
        estado = "SIN_ACCESS_Y_DESCONECTADO";
      }

      return {
        ...fila,
        bitrix_vinculo: vinculo.estado,
        bitrix_id: bx?.id || null,
        bitrix_nombre: bx?.nombre || null,
        bitrix_conectado: conectado,
        bitrix_jornada: bx?.jornada || null,
        bitrix_ultima_actividad: bx?.ultimaActividad || null,
        estado,
      };
    });

    const conteos = data.reduce((acc, fila) => {
      acc.programados++;
      if (fila.ingreso_access) acc.con_ingreso++;
      else if (!fila.hora_programada || fila.turno_vencido) acc.sin_ingreso++;
      if (fila.estado === "BITRIX_SIN_ACCESS") acc.bitrix_sin_access++;
      if (fila.estado === "INGRESO_ATRASADO") acc.atrasados++;
      if (["BITRIX_NO_VERIFICABLE", "USUARIO_ERP_NO_VINCULADO"].includes(fila.estado)) acc.no_verificables++;
      return acc;
    }, { programados: 0, con_ingreso: 0, sin_ingreso: 0, bitrix_sin_access: 0, atrasados: 0, no_verificables: 0 });

    return res.json({
      success: true,
      data,
      meta: {
        empresa,
        fecha: fechaConsulta,
        bitrix_es_en_vivo: fechaConsulta === hoyEcuador,
        generado_en: new Date().toISOString(),
        tolerancia_minutos: TOLERANCIA_INGRESO_MIN,
        bitrix_disponible: !bitrixError,
        bitrix_error: bitrixError,
        bitrix_generado_en: bitrix?.generado || null,
        conteos,
      },
    });
  } catch (error) {
    console.error("[controlAsistencia.routes] Error en control de ingresos:", error);
    return res.status(500).json({ success: false, error: "No se pudo generar el control de ingresos" });
  }
});

// GET /api/control-asistencia/mis-registros
// ─────────────────────────────────────────────────────────────

router.get(
  "/mis-registros",
  verificarToken,
  async (req, res) => {
    try {
      const usuario = req.user;

      if (!usuario?.id) {
        return res.status(401).json({
          success: false,
          error: "Usuario no autenticado",
        });
      }

      const perfilUsuario =
        normalizarTexto(usuario.perfil);

      if (!puedeMarcar(perfilUsuario)) {
        return res.status(403).json({
          success: false,
          error:
            "No tiene permiso para consultar marcaciones",
        });
      }

      let limit = Number(
        req.query.limit
      );

      if (
        !Number.isInteger(limit) ||
        limit <= 0
      ) {
        limit = 100;
      }

      limit = Math.min(limit, 200);

      const query = `
        SELECT
          id,
          usuario_id,
          usuario,
          nombre_completo,
          cargo,
          actividad,
          fecha,
          hora,
          fecha_hora,
          ip_publica,
          latitud,
          longitud,
          precision_metros,
          created_at
        FROM control_asistencia
        WHERE usuario_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `;

      const result = await pool.query(
        query,
        [usuario.id, limit]
      );

      return res.json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error(
        "[controlAsistencia.routes] Error consultando registros:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Error al obtener los registros",
      });
    }
  }
);

router._test = { vincularUsuarioBitrix };
module.exports = router;
