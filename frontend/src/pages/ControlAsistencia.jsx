import {
  useEffect,
  useRef,
  useState,
} from "react";

const API = import.meta.env.VITE_API_URL;

// ─────────────────────────────────────────────
// ACTIVIDADES
//
// value = lo que se guarda en base de datos
// label = lo que ve el usuario
// ─────────────────────────────────────────────

const ACTIVIDADES = [
  {
    value: "INGRESO",
    label: "Ingreso",
  },

  {
    value: "SALIDA ALMUERZO",
    label: "Salida a almuerzo",
  },

  {
    value: "INGRESO ALMUERZO",
    label: "Regreso de almuerzo",
  },

  {
    value: "SALIDA",
    label: "Salida",
  },
];

function fechaHoyEcuador() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function fechaInicioMesEcuador() {
  const hoy = fechaHoyEcuador();
  return `${hoy.slice(0, 7)}-01`;
}

function fechaVisible(valor) {
  const match = String(valor || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
}

// ─────────────────────────────────────────────
// FECHA / HORA ECUADOR
// ─────────────────────────────────────────────

function formatearFechaHora(fecha) {
  try {
    const partes =
      new Intl.DateTimeFormat("es-EC", {
        timeZone:
          "America/Guayaquil",

        day: "2-digit",
        month: "2-digit",
        year: "numeric",

        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",

        hour12: false,
      }).formatToParts(fecha);

    const obtener = (tipo) =>
      partes.find(
        (p) => p.type === tipo
      )?.value || "";

    return `${obtener(
      "day"
    )}/${obtener(
      "month"
    )}/${obtener(
      "year"
    )} · ${obtener(
      "hour"
    )}:${obtener(
      "minute"
    )}:${obtener("second")}`;
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────
// HORA SOLA
// ─────────────────────────────────────────────

function formatearHora(fecha) {
  try {
    return new Intl.DateTimeFormat(
      "es-EC",
      {
        timeZone:
          "America/Guayaquil",

        hour: "2-digit",
        minute: "2-digit",

        hour12: false,
      }
    ).format(fecha);
  } catch {
    return "";
  }
}

export default function ControlAsistencia() {
  const [user, setUser] =
    useState(null);

  const [
    actividad,
    setActividad,
  ] = useState("");

  const [
    fechaHora,
    setFechaHora,
  ] = useState(new Date());

  const [loading, setLoading] =
    useState(false);

  const [mensaje, setMensaje] =
    useState(null);

  const [vistaActiva, setVistaActiva] = useState("REGISTRO");
  const [fechaDesde, setFechaDesde] = useState(fechaInicioMesEcuador);
  const [fechaHasta, setFechaHasta] = useState(fechaHoyEcuador);
  const [resumenDia, setResumenDia] = useState([]);
  const [cargandoResumen, setCargandoResumen] = useState(false);

  const [
    estadoUbicacion,
    setEstadoUbicacion,
  ] = useState("pendiente");

  // Evita dos solicitudes simultáneas.
  const bloqueoEnvioRef =
    useRef(false);

  const timeoutMensajeRef =
    useRef(null);

  // ─────────────────────────────────────────────
  // CARGAR PERFIL
  // ─────────────────────────────────────────────

  useEffect(() => {
    try {
      const perfil = JSON.parse(
        localStorage.getItem(
          "userProfile"
        ) || "null"
      );

      setUser(perfil);
    } catch {
      setUser(null);
    }
  }, []);

  // ─────────────────────────────────────────────
  // RELOJ EN TIEMPO REAL
  // ─────────────────────────────────────────────

  useEffect(() => {
    const intervalo = setInterval(
      () => {
        setFechaHora(new Date());
      },
      1000
    );

    return () =>
      clearInterval(intervalo);
  }, []);

  // ─────────────────────────────────────────────
  // LIMPIAR TIMEOUT
  // ─────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (
        timeoutMensajeRef.current
      ) {
        clearTimeout(
          timeoutMensajeRef.current
        );
      }
    };
  }, []);

  // ─────────────────────────────────────────────
  // MOSTRAR MENSAJE
  // ─────────────────────────────────────────────

  const mostrarMensaje = (
    type,
    text,
    ocultarAutomaticamente = false
  ) => {
    if (
      timeoutMensajeRef.current
    ) {
      clearTimeout(
        timeoutMensajeRef.current
      );
    }

    setMensaje({
      type,
      text,
    });

    if (ocultarAutomaticamente) {
      timeoutMensajeRef.current =
        setTimeout(() => {
          setMensaje(null);
        }, 3500);
    }
  };

  const cargarResumenDia = async (desde = fechaDesde, hasta = fechaHasta) => {
    try {
      setCargandoResumen(true);
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${API}/api/control-asistencia/resumen-dia?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.error || "No se pudo cargar el panel diario");
      }
      setResumenDia(json.data || []);
    } catch (error) {
      mostrarMensaje("error", error.message || "No se pudo cargar el panel diario");
    } finally {
      setCargandoResumen(false);
    }
  };

  useEffect(() => {
    if (vistaActiva === "MARCACIONES") {
      cargarResumenDia(fechaDesde, fechaHasta);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaDesde, fechaHasta, vistaActiva]);

  // ─────────────────────────────────────────────
  // OBTENER GEOLOCALIZACIÓN
  // ─────────────────────────────────────────────

  const obtenerUbicacion = () =>
    new Promise(
      (resolve, reject) => {
        if (
          !navigator.geolocation
        ) {
          reject({
            code: 0,
            message:
              "Geolocalización no disponible",
          });

          return;
        }

        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy: true,
            timeout: 12000,
            maximumAge: 0,
          }
        );
      }
    );

  // ─────────────────────────────────────────────
  // REGISTRAR MARCACIÓN
  // ─────────────────────────────────────────────

  const registrarMarcacion =
    async () => {
      // Evitar doble clic.
      if (
        bloqueoEnvioRef.current
      ) {
        return;
      }

      // Debe elegir actividad.
      if (!actividad) {
        mostrarMensaje(
          "error",
          "Selecciona una actividad antes de registrar."
        );

        return;
      }

      bloqueoEnvioRef.current =
        true;

      setLoading(true);

      setMensaje(null);

      setEstadoUbicacion(
        "obteniendo"
      );

      try {
        let posicion;

        // ───────────────────────────
        // UBICACIÓN
        // ───────────────────────────

        try {
          posicion =
            await obtenerUbicacion();

          setEstadoUbicacion(
            "disponible"
          );
        } catch (errorGeo) {
          console.warn(
            "[ControlAsistencia] Geolocalización:",
            errorGeo
          );

          if (
            errorGeo?.code === 1
          ) {
            setEstadoUbicacion(
              "denegada"
            );

            mostrarMensaje(
              "error",
              "Debes permitir el acceso a tu ubicación para registrar la marcación."
            );
          } else if (
            errorGeo?.code === 3
          ) {
            setEstadoUbicacion(
              "error"
            );

            mostrarMensaje(
              "error",
              "No fue posible obtener tu ubicación a tiempo. Intenta nuevamente."
            );
          } else {
            setEstadoUbicacion(
              "error"
            );

            mostrarMensaje(
              "error",
              "No fue posible obtener tu ubicación."
            );
          }

          return;
        }

        // ───────────────────────────
        // TOKEN
        // ───────────────────────────

        const token =
          localStorage.getItem(
            "token"
          );

        // ───────────────────────────
        // BODY
        // ───────────────────────────

        const body = {
          actividad,

          latitud:
            posicion.coords
              .latitude,

          longitud:
            posicion.coords
              .longitude,

          precision_metros:
            posicion.coords
              .accuracy,
        };

        // ───────────────────────────
        // REQUEST
        // ───────────────────────────

        const response =
          await fetch(
            `${API}/api/control-asistencia`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",

                ...(token
                  ? {
                    Authorization: `Bearer ${token}`,
                  }
                  : {}),
              },

              body: JSON.stringify(
                body
              ),
            }
          );

        const json =
          await response
            .json()
            .catch(() => ({}));

        if (
          !response.ok ||
          !json.success
        ) {
          throw new Error(
            json.error ||
            "No se pudo registrar la marcación"
          );
        }

        // ───────────────────────────
        // MENSAJE DEL BACKEND
        // ───────────────────────────

        const mensajeBackend =
          json.mensaje ||
          "Que tengas un excelente día.";

        // ───────────────────────────
        // MENSAJE FINAL
        // ───────────────────────────

        mostrarMensaje(
          "success",
          mensajeBackend,
          true
        );

        // Limpiamos solo actividad.
        setActividad("");
        await cargarResumenDia(fechaDesde, fechaHasta);
      } catch (error) {
        console.error(
          "[ControlAsistencia] Error:",
          error
        );

        mostrarMensaje(
          "error",
          error.message ||
          "Error de conexión al registrar"
        );
      } finally {
        bloqueoEnvioRef.current =
          false;

        setLoading(false);
      }
    };

  // ─────────────────────────────────────────────
  // ESTADOS VISUALES UBICACIÓN
  // ─────────────────────────────────────────────

  const ubicacionInfo = {
    pendiente: {
      icono: "📍",

      texto:
        "La ubicación se solicitará al registrar",

      color: "#64748b",

      fondo: "#f8fafc",

      borde: "#e2e8f0",
    },

    obteniendo: {
      icono: "📡",

      texto:
        "Obteniendo ubicación...",

      color: "#0369a1",

      fondo: "#f0f9ff",

      borde: "#bae6fd",
    },

    disponible: {
      icono: "✓",

      texto:
        "Ubicación disponible",

      color: "#047857",

      fondo: "#ecfdf5",

      borde: "#a7f3d0",
    },

    denegada: {
      icono: "⚠",

      texto:
        "Debes permitir el acceso a ubicación",

      color: "#b91c1c",

      fondo: "#fef2f2",

      borde: "#fecaca",
    },

    error: {
      icono: "⚠",

      texto:
        "No se pudo obtener la ubicación",

      color: "#b45309",

      fondo: "#fffbeb",

      borde: "#fde68a",
    },
  };

  const estadoActual =
    ubicacionInfo[
    estadoUbicacion
    ] ||
    ubicacionInfo.pendiente;

  // ─────────────────────────────────────────────
  // ESTILOS
  // ─────────────────────────────────────────────

  const estiloCampo = {
    width: "100%",

    boxSizing: "border-box",

    padding: "11px 12px",

    borderRadius: 9,

    border:
      "1px solid #dbe4f0",

    fontSize: 13,

    color: "#334155",

    background: "#f8fafc",

    outline: "none",

    fontWeight: 600,
  };

  const estiloLabel = {
    fontSize: 11,

    fontWeight: 800,

    color: "#475569",

    textTransform:
      "uppercase",

    letterSpacing: ".04em",

    marginBottom: 6,
  };

  return (
    <div
      style={{
        minHeight:
          "calc(100vh - 90px)",

        padding:
          "32px 20px",

        display: "grid",
        gap: 24,
        justifyItems: "center",

        alignItems:
          "flex-start",
      }}
    >
      <nav
        aria-label="Vistas de control de asistencia"
        style={{
          width: "100%",
          maxWidth: 980,
          padding: 5,
          display: "flex",
          gap: 6,
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 15,
          boxShadow: "0 8px 24px rgba(15,23,42,.06)",
        }}
      >
        {[
          { id: "REGISTRO", icono: "⏱️", texto: "REGISTRAR MARCACIÓN" },
          { id: "MARCACIONES", icono: "📋", texto: "MARCACIONES DEL DÍA" },
        ].map((opcion) => {
          const activa = vistaActiva === opcion.id;
          return (
            <button
              key={opcion.id}
              type="button"
              onClick={() => setVistaActiva(opcion.id)}
              style={{
                flex: 1,
                minHeight: 42,
                padding: "10px 16px",
                border: 0,
                borderRadius: 11,
                background: activa
                  ? "linear-gradient(135deg, #0f766e, #0ea5a4)"
                  : "transparent",
                color: activa ? "#fff" : "#64748b",
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: ".035em",
                cursor: "pointer",
                boxShadow: activa ? "0 6px 14px rgba(14,165,164,.22)" : "none",
                transition: "all .18s ease",
              }}
            >
              <span style={{ marginRight: 7 }}>{opcion.icono}</span>
              {opcion.texto}
            </button>
          );
        })}
      </nav>

      {vistaActiva === "REGISTRO" ? (
      <div
        style={{
          width: "100%",

          maxWidth: 980,

          background: "#fff",

          border:
            "1px solid #e2e8f0",

          borderRadius: 18,

          boxShadow:
            "0 10px 30px rgba(15,23,42,.06)",

          overflow: "hidden",
        }}
      >
        {/* CABECERA */}

        <div
          style={{
            padding:
              "24px 26px 20px",

            borderBottom:
              "1px solid #eef2f7",

            background:
              "linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)",
          }}
        >
          <div
            style={{
              display: "flex",

              gap: 13,

              alignItems:
                "center",
            }}
          >
            <div
              style={{
                width: 44,

                height: 44,

                borderRadius: 12,

                background:
                  "#e0f2fe",

                display: "flex",

                alignItems:
                  "center",

                justifyContent:
                  "center",

                fontSize: 21,
              }}
            >
              🕐
            </div>

            <div>
              <h2
                style={{
                  margin: 0,

                  fontSize: 20,

                  fontWeight: 900,

                  color:
                    "#0f172a",
                }}
              >
                Registro de
                asistencia
              </h2>

              <div
                style={{
                  marginTop: 4,

                  fontSize: 12.5,

                  color:
                    "#64748b",
                }}
              >
                Registra tu ingreso, salida a almuerzo, regreso de almuerzo o salida
              </div>
            </div>
          </div>
        </div>

        {/* CUERPO */}

        <div
          style={{
            padding: 26,
          }}
        >
          {/* DATOS DEL USUARIO */}

          <div
            style={{
              display: "grid",

              gridTemplateColumns:
                "repeat(auto-fit, minmax(280px, 1fr))",

              gap: 18,
            }}
          >
            {/* USUARIO */}

            <div>
              <div
                style={
                  estiloLabel
                }
              >
                Usuario
              </div>

              <input
                readOnly
                value={
                  user?.usuario ||
                  user?.username ||
                  user?.login ||
                  ""
                }
                style={
                  estiloCampo
                }
              />
            </div>

            {/* FECHA */}

            <div>
              <div
                style={
                  estiloLabel
                }
              >
                Fecha y hora
              </div>

              <input
                readOnly
                value={formatearFechaHora(
                  fechaHora
                )}
                style={
                  estiloCampo
                }
              />
            </div>

            {/* NOMBRE */}

            <div>
              <div
                style={
                  estiloLabel
                }
              >
                Nombre completo
              </div>

              <input
                readOnly
                value={
                  user?.nombreCompleto ||
                  user?.nombre_completo ||
                  user?.nombre ||
                  ""
                }
                style={
                  estiloCampo
                }
              />
            </div>

            {/* CARGO */}

            <div>
              <div
                style={
                  estiloLabel
                }
              >
                Cargo
              </div>

              <input
                readOnly
                value={
                  user?.perfil ||
                  user?.cargo ||
                  ""
                }
                style={
                  estiloCampo
                }
              />
            </div>
          </div>

          {/* SEPARADOR */}

          <div
            style={{
              height: 1,

              background:
                "#eef2f7",

              margin:
                "26px 0",
            }}
          />

          {/* ACTIVIDAD */}

          <div>
            <div
              style={estiloLabel}
            >
              ¿Qué actividad vas a
              registrar?
            </div>

            <select
              value={actividad}
              disabled={loading}
              onChange={(e) =>
                setActividad(
                  e.target.value
                )
              }
              style={{
                width: "100%",

                boxSizing:
                  "border-box",

                padding:
                  "13px 14px",

                borderRadius: 10,

                border:
                  "1px solid #cbd5e1",

                background:
                  "#fff",

                fontSize: 14,

                fontWeight: 600,

                color: actividad
                  ? "#0f172a"
                  : "#64748b",

                cursor: loading
                  ? "wait"
                  : "pointer",

                outline: "none",
              }}
            >
              <option value="">
                Selecciona tu
                actividad...
              </option>

              {ACTIVIDADES.map(
                (item) => (
                  <option
                    key={
                      item.value
                    }
                    value={
                      item.value
                    }
                  >
                    {item.label}
                  </option>
                )
              )}
            </select>
          </div>

          {/* UBICACIÓN */}

          <div
            style={{
              marginTop: 16,

              padding:
                "11px 13px",

              borderRadius: 9,

              display: "flex",

              alignItems:
                "center",

              gap: 8,

              background:
                estadoActual.fondo,

              border: `1px solid ${estadoActual.borde}`,

              color:
                estadoActual.color,

              fontSize: 12,

              fontWeight: 700,
            }}
          >
            <span>
              {
                estadoActual.icono
              }
            </span>

            <span>
              {
                estadoActual.texto
              }
            </span>
          </div>

          {/* BOTÓN */}

          <button
            type="button"
            onClick={
              registrarMarcacion
            }
            disabled={loading}
            style={{
              width: "100%",

              marginTop: 20,

              padding:
                "14px 18px",

              border: "none",

              borderRadius: 10,

              background: loading
                ? "#94a3b8"
                : "#0ea5a4",

              color: "#fff",

              fontWeight: 900,

              fontSize: 14,

              cursor: loading
                ? "wait"
                : "pointer",

              boxShadow: loading
                ? "none"
                : "0 6px 14px rgba(14,165,164,.18)",

              transition:
                "all .15s ease",
            }}
          >
            {loading
              ? "Registrando marcación..."
              : "✓ Registrar marcación"}
          </button>

          {/* MENSAJE */}

          {mensaje && (
            <div
              style={{
                marginTop: 18,

                padding:
                  "14px 16px",

                borderRadius: 10,

                background:
                  mensaje.type ===
                    "success"
                    ? "#ecfdf5"
                    : "#fef2f2",

                color:
                  mensaje.type ===
                    "success"
                    ? "#047857"
                    : "#b91c1c",

                border: `1px solid ${mensaje.type ===
                    "success"
                    ? "#a7f3d0"
                    : "#fecaca"
                  }`,

                fontSize: 13,

                fontWeight: 800,

                textAlign:
                  "center",

                lineHeight: 1.5,
              }}
            >
              {mensaje.text}
            </div>
          )}
        </div>
      </div>
      ) : (
      <section style={{ width: "100%", maxWidth: 1180, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, boxShadow: "0 10px 30px rgba(15,23,42,.07)", overflow: "hidden" }}>
        <div style={{ padding: "22px 24px", borderBottom: "1px solid #e8eef5", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", background: "linear-gradient(135deg,#f0fdfa 0%,#ffffff 65%)" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 38, height: 38, display: "grid", placeItems: "center", borderRadius: 11, background: "#ccfbf1", fontSize: 18 }}>📋</div>
              <div>
                <h2 style={{ margin: 0, fontSize: 19, fontWeight: 900, color: "#0f172a" }}>Marcaciones del día</h2>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "#64748b" }}>{resumenDia.length} usuario{resumenDia.length === 1 ? "" : "s"} con registros</p>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 800, color: "#475569", textTransform: "uppercase" }}>
              Desde
              <input type="date" value={fechaDesde} max={fechaHasta} onChange={(e) => setFechaDesde(e.target.value)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 13, fontWeight: 700, color: "#334155", background: "#fff", outline: "none" }} />
            </label>
            <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 800, color: "#475569", textTransform: "uppercase" }}>
              Hasta
              <input type="date" value={fechaHasta} min={fechaDesde} onChange={(e) => setFechaHasta(e.target.value)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 13, fontWeight: 700, color: "#334155", background: "#fff", outline: "none" }} />
            </label>
          </div>
        </div>
        {mensaje?.type === "error" && (
          <div style={{ margin: "16px 20px 0", padding: "11px 14px", borderRadius: 10, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", fontSize: 12, fontWeight: 700 }}>{mensaje.text}</div>
        )}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 850 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Fecha", "Usuario", "Ingreso", "Salida almuerzo", "Regreso almuerzo", "Salida"].map((titulo) => (
                  <th key={titulo} style={{ padding: "13px 16px", borderBottom: "1px solid #e2e8f0", textAlign: "left", fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", whiteSpace: "nowrap" }}>{titulo}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resumenDia.map((fila) => (
                <tr key={`${fila.fecha}-${fila.usuario_id}`}>
                  <td style={{ padding: "13px 16px", borderBottom: "1px solid #f1f5f9", fontSize: 12, fontWeight: 700 }}>{fechaVisible(fila.fecha)}</td>
                  <td style={{ padding: "13px 16px", borderBottom: "1px solid #f1f5f9" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, flex: "0 0 32px", display: "grid", placeItems: "center", borderRadius: "50%", color: "#0f766e", background: "#ccfbf1", fontSize: 11, fontWeight: 900 }}>{String(fila.nombre_completo || fila.usuario || "U").trim().charAt(0).toUpperCase()}</div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>{fila.nombre_completo || fila.usuario || "Usuario"}</div>
                        {fila.usuario && <div style={{ marginTop: 2, fontSize: 10, color: "#64748b" }}>@{fila.usuario}</div>}
                      </div>
                    </div>
                  </td>
                  {[fila.ingreso, fila.salida_almuerzo, fila.regreso_almuerzo, fila.salida].map((hora, index) => (
                    <td key={index} style={{ padding: "13px 16px", borderBottom: "1px solid #f1f5f9" }}>
                      <span style={{ display: "inline-block", minWidth: 52, padding: "6px 9px", textAlign: "center", borderRadius: 8, fontSize: 12, fontWeight: 900, color: hora ? "#0f766e" : "#94a3b8", background: hora ? "#f0fdfa" : "#f8fafc" }}>{hora || "—"}</span>
                    </td>
                  ))}
                </tr>
              ))}
              {!cargandoResumen && resumenDia.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 28, textAlign: "center", color: "#94a3b8", fontSize: 12 }}>No hay marcaciones registradas para esta fecha.</td></tr>
              )}
              {cargandoResumen && (
                <tr><td colSpan={6} style={{ padding: 28, textAlign: "center", color: "#64748b", fontSize: 12 }}>Cargando marcaciones…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}
    </div>
  );
}
