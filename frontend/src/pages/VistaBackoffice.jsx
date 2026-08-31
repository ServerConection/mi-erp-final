import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import JSZip from "jszip";

const API = import.meta.env.VITE_API_URL;

// ── Documentos de respaldo de la venta ───────────────────────────────────────
// Son los CUATRO que carga el asesor en Nueva Venta (sección 8). Antes esta
// pantalla detectaba los documentos con `field.startsWith("foto_")`, y por eso
// "archivo_resumen" — que no empieza por "foto_" — se caía de la lista: en
// Backoffice solo aparecían 3 de los 4 documentos que sí existían en la venta.
// Con una lista explícita el criterio deja de depender del nombre del campo.
const CAMPOS_DOCUMENTO = [
  "foto_cedula_frontal",
  "foto_cedula_trasera",
  "foto_carnet",
  "archivo_resumen",
];
const esCampoDocumento = (field) => CAMPOS_DOCUMENTO.includes(field);

const ESTATUS_NETLIFE = [
  "ACTIVO",
  "ASIGNADO",
  "FIN DE GESTIÓN",
  "RECHAZADO",
  "PRESERVICIO",
  "PREPLANIFICADO",
  "ANULADO",
  "DETENIDO",
  "DUPLICADO",
  "FACTIBLE",
  "SIN ESTADO",
  "ZONA PELIGROSA",
  "FUERA DE COBERTURA",
  "DESISTE DEL SERVICIO",
  "ELIMINADO",
  "REPLANIFICADO",
];


const CAMPOS_FECHA = [
  "fecha_nacimiento", "fecha_regularizacion_atc", "fecha_agenda",
  "fecha_recaudada", "fecha_activacion_netlife", "fecha_registro_sistema",
  "fecha_ingreso_telcos",
];

const OPCIONES_ESTATUS_REGULARIZACION = [
  { valor: "__SIN_REVISAR__", etiqueta: "Sin Revisar" },
  { valor: "POR REGULARIZAR", etiqueta: "Por regularizar" },
  { valor: "REGULARIZADO", etiqueta: "Regularizado" },
  { valor: "GESTION ATC", etiqueta: "Gestion ATC" },
];

/**
 * Exporta un arreglo de registros a un archivo CSV compatible directamente con Excel.
 * @param {Array} data - Lista de objetos/registros a exportar.
 * @param {string} nombreArchivo - Nombre del archivo resultante.
 */
/**
 * Exporta un listado de registros a un libro nativo de Excel (.xlsx) con
 * cabeceras descriptivas, auto-ajuste de anchos de columna y formato limpio.
 */
async function exportarAExcel(data, nombreArchivo = "Reporte") {
  if (!data || !data.length) {
    alert("No hay registros disponibles para exportar con los filtros actuales.");
    return;
  }

  // Excel permite máximo 32.767 caracteres por celda.
  // Dejamos un pequeño margen de seguridad.
  const MAX_CARACTERES_EXCEL = 32000;

  /**
   * Limpia cualquier valor antes de mandarlo a Excel.
   */
  const limpiarValorExcel = (valor, columna) => {
    if (valor === null || valor === undefined) return "";

    // Fechas
    if (CAMPOS_FECHA.includes(columna)) {
      return String(valor).slice(0, 10);
    }

    let texto;

    // Evita que objetos terminen como [object Object]
    try {
      if (typeof valor === "object") {
        texto = JSON.stringify(valor);
      } else {
        texto = String(valor);
      }
    } catch {
      texto = String(valor);
    }

    /*
     * DOCUMENTOS / IMÁGENES
     *
     * Los documentos deberían contener solamente una ruta o URL.
     * Si por datos antiguos existe un base64 gigantesco, NO lo
     * mandamos completo al Excel.
     */
    if (CAMPOS_DOCUMENTO.includes(columna)) {
      if (
        texto.startsWith("data:image/") ||
        texto.startsWith("data:application/") ||
        texto.length > MAX_CARACTERES_EXCEL
      ) {
        return "[DOCUMENTO ADJUNTO - CONTENIDO OMITIDO]";
      }

      return texto;
    }

    /*
     * Protección general.
     *
     * Ninguna celda puede superar el límite permitido por Excel.
     */
    if (texto.length > MAX_CARACTERES_EXCEL) {
      return `${texto.slice(0, MAX_CARACTERES_EXCEL)}\n[CONTENIDO RECORTADO PARA EXCEL]`;
    }

    return texto;
  };

  // Detectar todas las columnas existentes en todos los registros,
  // no solamente las del primer registro.
  const columnasDisponibles = [
    ...new Set(
      data.flatMap((row) => Object.keys(row || {}))
    ),
  ];

  // Mantener primero el orden definido en TABLE_COLUMNS.
  const columnasOrdenadas = [
    ...TABLE_COLUMNS.filter((col) =>
      columnasDisponibles.includes(col)
    ),
    ...columnasDisponibles.filter(
      (col) => !TABLE_COLUMNS.includes(col)
    ),
  ];

  // Preparar los registros.
  const filasFormateadas = data.map((row) => {
    const objetoFila = {};

    columnasOrdenadas.forEach((col) => {
      const cabecera =
        FIELD_LABELS[col] ||
        col.replace(/_/g, " ").toUpperCase();

      objetoFila[cabecera] = limpiarValorExcel(
        row?.[col],
        col
      );
    });

    return objetoFila;
  });

  // Crear hoja.
  const worksheet =
    XLSX.utils.json_to_sheet(filasFormateadas);

  /*
   * Anchos de columnas.
   *
   * Se calculan sobre filasFormateadas porque ahí las claves
   * ya son los nombres descriptivos de las cabeceras.
   */
  const encabezados = Object.keys(
    filasFormateadas[0] || {}
  );

  worksheet["!cols"] = encabezados.map((key) => {
    const longitudCabecera = key.length;

    const longitudMaximaDatos = filasFormateadas.reduce(
      (max, row) => {
        const valor = row[key] ?? "";

        const primeraLinea =
          String(valor).split("\n")[0];

        return Math.max(
          max,
          Math.min(primeraLinea.length, 45)
        );
      },
      0
    );

    return {
      wch: Math.max(
        12,
        Math.min(
          50,
          Math.max(
            longitudCabecera + 2,
            longitudMaximaDatos + 2
          )
        )
      ),
    };
  });

  // Filtro en las cabeceras y una altura cómoda para textos de varias líneas.
  worksheet["!autofilter"] = { ref: worksheet["!ref"] };
  worksheet["!rows"] = [
    { hpt: 28 },
    ...filasFormateadas.map((row) => {
      const lineas = Math.max(
        1,
        ...encabezados.map((key) => String(row[key] ?? "").split("\n").length)
      );
      return { hpt: Math.min(60, 18 * lineas) };
    }),
  ];

  // Crear libro.
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "Registros"
  );

  // Nombre seguro del archivo.
  const fechaHoy = new Date()
    .toISOString()
    .slice(0, 10);

  const nombreSeguro = String(nombreArchivo)
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim();

  try {
    const contenido = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });

    // SheetJS Community no escribe estilos. Como JSZip ya forma parte del
    // proyecto, incorporamos al XLSX dos estilos simples: cabecera y cuerpo.
    const zip = await JSZip.loadAsync(contenido);
    const rutaHoja = "xl/worksheets/sheet1.xml";
    const hojaXml = await zip.file(rutaHoja)?.async("string");

    if (hojaXml) {
      const hojaConEstilos = hojaXml.replace(
        /<c\b([^>]*\br="([A-Z]+)(\d+)"[^>]*)>/g,
        (celda, atributos, _columna, fila) => {
          const sinEstilo = atributos.replace(/\s+s="[^"]*"/g, "");
          return `<c${sinEstilo} s="${fila === "1" ? 1 : 2}">`;
        }
      );
      zip.file(rutaHoja, hojaConEstilos);

      zip.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E3A5F"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`);
    }

    const archivo = await zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = `${nombreSeguro}_${fechaHoy}.xlsx`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error(
      "[EXCEL] Error exportando archivo:",
      error
    );

    alert(
      `No se pudo generar el archivo Excel.\n\n${error.message || "Error desconocido"}`
    );
  }
}

function BotonDescargaExcel({
  onClick,
  color = "#059669",
  fondo = "#ecfdf5",
  borde = "#a7f3d0",
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Descargar datos actuales en Excel"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "9px 14px",
        borderRadius: 10,
        border: `1px solid ${borde}`,
        background: fondo,
        color,
        fontWeight: 700,
        fontSize: 12.5,
        cursor: "pointer",
        transition: "all .15s",
        whiteSpace: "nowrap",
      }}
    >
      <span>📥</span>
      Descargar Excel
    </button>
  );
}

// ── Carga de un documento protegido ──────────────────────────────────────────
// En la base de datos el documento se guarda como una RUTA interna
// ("/api/envios-ventas/archivo/<carpeta>/<archivo>"), no como una imagen. Esa
// ruta exige cabecera Authorization, y una etiqueta <img src="..."> NO envía el
// token — por eso las fotos aquí salían rotas: el navegador pedía la imagen sin
// credenciales y recibía un 401.
//
// La forma correcta es traerla con fetch() + token, convertirla en blob y usar
// una object URL. El blob se libera al desmontar para no fugar memoria.
function useDocumentoProtegido(ruta) {
  const [estado, setEstado] = useState({ cargando: false, url: null, error: null, esPdf: false });

  useEffect(() => {
    if (!ruta) {
      setEstado({ cargando: false, url: null, error: null, esPdf: false });
      return;
    }
    // Valores que ya son directamente mostrables (recién subido en esta sesión,
    // o registros antiguos que guardaron una URL absoluta).
    if (/^(data:|blob:|https?:)/i.test(ruta)) {
      setEstado({ cargando: false, url: ruta, error: null, esPdf: /pdf/i.test(ruta.slice(0, 60)) });
      return;
    }

    let cancelado = false;
    let objectUrl = null;
    setEstado({ cargando: true, url: null, error: null, esPdf: false });

    (async () => {
      try {
        const token = localStorage.getItem("token");
        const r = await fetch(`${API}${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) {
          const detalle = await r.json().catch(() => ({}));
          throw new Error(
            r.status === 404 ? "El documento ya no está en el servidor de archivos."
              : r.status === 503 ? "El servidor de documentos no está disponible ahora mismo."
                : detalle.error || `No se pudo cargar el documento (HTTP ${r.status}).`
          );
        }
        const blob = await r.blob();
        if (cancelado) return;
        objectUrl = URL.createObjectURL(blob);
        setEstado({ cargando: false, url: objectUrl, error: null, esPdf: blob.type === "application/pdf" });
      } catch (e) {
        if (!cancelado) setEstado({ cargando: false, url: null, error: e.message, esPdf: false });
      }
    })();

    return () => {
      cancelado = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ruta]);

  return estado;
}

// ── Visor a pantalla completa ────────────────────────────────────────────────
// La miniatura usaba objectFit:"cover" dentro de un marco 16/9: recortaba la
// foto por los lados, que en una cédula es justo donde está el número. Ahora la
// miniatura usa "contain" (se ve entera) y al hacer clic se abre esto, que
// permite acercar, rotar y descargar.
function VisorDocumento({ url, titulo, esPdf, onCerrar }) {
  const [zoom, setZoom] = useState(1);
  const [giro, setGiro] = useState(0);

  useEffect(() => {
    const onTecla = (e) => {
      if (e.key === "Escape") onCerrar();
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(z + 0.25, 6));
      if (e.key === "-") setZoom((z) => Math.max(z - 0.25, 0.25));
      if (e.key.toLowerCase() === "r") setGiro((g) => (g + 90) % 360);
    };
    window.addEventListener("keydown", onTecla);
    // Bloquea el scroll del fondo mientras el visor está abierto.
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onTecla);
      document.body.style.overflow = overflowPrevio;
    };
  }, [onCerrar]);

  const btn = {
    background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.25)",
    color: "#fff", borderRadius: 8, padding: "7px 12px", fontSize: 13,
    fontWeight: 700, cursor: "pointer", lineHeight: 1,
  };

  return (
    <div
      onClick={onCerrar}
      style={{
        position: "fixed", inset: 0, zIndex: 4000, background: "rgba(2,6,23,.94)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}
    >
      {/* Barra de herramientas */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute", top: 0, left: 0, right: 0, padding: "12px 16px",
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          background: "linear-gradient(rgba(2,6,23,.85), transparent)",
        }}
      >
        <span style={{ color: "#fff", fontWeight: 800, fontSize: 13, marginRight: "auto" }}>{titulo}</span>

        {!esPdf && (
          <>
            <button style={btn} onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))} title="Alejar (tecla -)">－</button>
            <span style={{ color: "#cbd5e1", fontSize: 12, minWidth: 46, textAlign: "center" }}>
              {Math.round(zoom * 100)}%
            </span>
            <button style={btn} onClick={() => setZoom((z) => Math.min(z + 0.25, 6))} title="Acercar (tecla +)">＋</button>
            <button style={btn} onClick={() => { setZoom(1); setGiro(0); }} title="Restablecer">Ajustar</button>
            <button style={btn} onClick={() => setGiro((g) => (g + 90) % 360)} title="Rotar (tecla R)">⟳ Rotar</button>
          </>
        )}

        <a href={url} download={`${titulo}`} style={{ ...btn, textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>
          ⭳ Descargar
        </a>
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ ...btn, textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>
          ⧉ Nueva pestaña
        </a>
        <button style={{ ...btn, background: "rgba(239,68,68,.85)", borderColor: "transparent" }} onClick={onCerrar}>
          ✕ Cerrar
        </button>
      </div>

      {/* Contenido */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "94vw", maxHeight: "82vh", overflow: "auto", marginTop: 40 }}
      >
        {esPdf ? (
          <iframe
            title={titulo}
            src={url}
            style={{ width: "88vw", height: "80vh", border: "none", borderRadius: 10, background: "#fff" }}
          />
        ) : (
          <img
            src={url}
            alt={titulo}
            style={{
              display: "block",
              maxWidth: zoom === 1 ? "94vw" : "none",
              maxHeight: zoom === 1 ? "80vh" : "none",
              transform: `scale(${zoom}) rotate(${giro}deg)`,
              transformOrigin: "center center",
              transition: "transform .15s ease-out",
              // "contain" real: nunca recorta la imagen.
              objectFit: "contain",
            }}
          />
        )}
      </div>

      <div style={{ position: "absolute", bottom: 14, color: "#94a3b8", fontSize: 11 }}>
        Esc para cerrar · + / − para acercar · R para rotar
      </div>
    </div>
  );
}

// ── Campo de documento dentro del detalle ────────────────────────────────────
function CampoDocumento({ field, etiqueta, valor, numeroIdentificacion, onCambio, onAlert }) {
  const { cargando, url, error, esPdf } = useDocumentoProtegido(valor);
  const [abierto, setAbierto] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const inputRef = useRef(null);

  const MAX_MB = 15;

  const subir = async (file) => {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      onAlert({ type: "error", msg: `El archivo pesa ${(file.size / 1048576).toFixed(1)} MB y el máximo es ${MAX_MB} MB.` });
      return;
    }
    setSubiendo(true);
    try {
      // ANTES: el archivo se leía con FileReader y se guardaba como data URL
      // (base64) DENTRO de la columna de la tabla. Eso hinchaba la fila hasta
      // varios MB por registro, dejaba documentos de identidad sueltos en la
      // base de datos y se saltaba por completo el servidor de almacenamiento
      // — es decir, el documento del Backoffice terminaba en un sitio distinto
      // al del asesor. Ahora usa el mismo endpoint que Nueva Venta y guarda
      // únicamente la ruta.
      const token = localStorage.getItem("token");
      const fd = new FormData();
      fd.append("archivo", file);
      fd.append("numero_identificacion", numeroIdentificacion || "");

      const r = await fetch(`${API}/api/envios-ventas/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const d = await r.json().catch(() => ({}));

      if (r.ok && d.success) {
        onCambio(d.url);
        onAlert({ type: "success", msg: "Documento reemplazado. Recuerda pulsar GUARDAR." });
      } else {
        onAlert({ type: "error", msg: d.error || `No se pudo subir el documento (HTTP ${r.status}).` });
      }
    } catch {
      onAlert({ type: "error", msg: "Error de conexión al subir el documento." });
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const marco = {
    borderRadius: 8, border: "1px solid #dbe4f0", background: "#f8fafc",
    height: 150, display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden", position: "relative",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {valor ? (
        <div style={marco}>
          {cargando && <span style={{ fontSize: 11, color: "#64748b" }}>Cargando documento…</span>}

          {!cargando && error && (
            <span style={{ fontSize: 11, color: "#b91c1c", padding: 10, textAlign: "center" }}>{error}</span>
          )}

          {!cargando && url && esPdf && (
            <button
              type="button"
              onClick={() => setAbierto(true)}
              style={{ background: "none", border: "none", cursor: "pointer", textAlign: "center", color: "#0ea5e9", fontWeight: 800, fontSize: 12 }}
            >
              <div style={{ fontSize: 34 }}>📄</div>
              Ver PDF completo
            </button>
          )}

          {!cargando && url && !esPdf && (
            <img
              src={url}
              alt={etiqueta}
              onClick={() => setAbierto(true)}
              title="Clic para ver completa"
              style={{
                width: "100%", height: "100%",
                // "contain" en vez de "cover": la miniatura ya no recorta los
                // bordes de la cédula.
                objectFit: "contain",
                cursor: "zoom-in", background: "#fff",
              }}
            />
          )}
        </div>
      ) : (
        <div style={{ ...marco, borderStyle: "dashed" }}>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Sin documento cargado</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {valor && url && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            style={{ fontSize: 11, fontWeight: 800, color: "#0369a1", background: "#e0f2fe", border: "1px solid #bae6fd", borderRadius: 6, padding: "5px 10px", cursor: "pointer" }}
          >
            🔍 Ver completo
          </button>
        )}
        <button
          type="button"
          disabled={subiendo}
          onClick={() => inputRef.current?.click()}
          style={{ fontSize: 11, fontWeight: 700, color: "#475569", background: "#fff", border: "1px solid #dbe4f0", borderRadius: 6, padding: "5px 10px", cursor: "pointer" }}
        >
          {subiendo ? "Subiendo…" : valor ? "Reemplazar" : "Subir documento"}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: "none" }}
        onChange={(e) => subir(e.target.files?.[0])}
      />

      {abierto && url && (
        <VisorDocumento url={url} titulo={etiqueta} esPdf={esPdf} onCerrar={() => setAbierto(false)} />
      )}
    </div>
  );
}

function normalizarRegistro(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (v === null || v === undefined) { out[k] = ""; continue; }
    out[k] = CAMPOS_FECHA.includes(k) ? String(v).slice(0, 10) : String(v);
  }
  return out;
}

const FIELD_LABELS = {
  id: "ID",
  estatus_envio: "ESTATUS ENVÍO",
  ip_origen: "IP ORIGEN",
  fecha_registro_sistema: "FECHA REGISTRO",
  mes_registro_sistema: "MES REGISTRO",
  dia_abc_registro_sistema: "DÍA REGISTRO",
  codigo_asesor: "CÓDIGO ASESOR",
  id_bitrix: "ID BITRIX",
  distribuidor_autorizado: "DISTRIBUIDOR",
  supervisor: "SUPERVISOR",
  origen_venta: "ORIGEN VENTA",
  venta_nueva_o_reingreso: "TIPO VENTA",
  turno: "TURNO",
  nombre_atc: "NOMBRE ATC",
  clausulas: "CLÁUSULAS",
  lider_comercial: "LÍDER COMERCIAL",
  tipo_cliente: "TIPO CLIENTE",
  genero_cliente: "GÉNERO",
  tipo_documento: "TIPO DOCUMENTO",
  numero_identificacion: "IDENTIFICACIÓN",
  nombre_cliente_completo: "CLIENTE",
  estado_civil: "ESTADO CIVIL",
  fecha_nacimiento: "FECHA NAC.",
  mes_nacimiento: "MES NAC.",
  dia_abc_nacimiento: "DÍA NAC.",
  email_cliente: "EMAIL",
  aplica_descuento_3ra_edad: "3RA EDAD",
  telf_celular_pin: "TELÉFONO",
  telf_celular_2: "TEL. INSTALACIÓN",
  telf_fijo: "TEL. FIJO",
  provincia: "PROVINCIA",
  ciudad: "CIUDAD",
  parroquia_barrio: "PARROQUIA",
  direccion_calles: "CALLES",
  direccion_manzana_villa: "MANZANA/VILLA",
  referencia_ubicacion: "REFERENCIA",
  coordenadas_gps: "GPS",
  tipo_vivienda: "TIPO VIVIENDA",
  regimen_vivienda: "REGIMEN VIVIENDA",
  plan_contratado_final: "PLAN",
  servicios_digitales: "SERVICIOS",
  forma_pago: "FORMA PAGO",
  detalle_bancario_ahorros: "DETALLE BANCARIO",
  valor_pago: "VALOR PAGO",
  tipo_contrato: "TIPO CONTRATO",
  links_documentos: "LINKS",
  estado_recaudacion: "ESTADO RECAUDACIÓN",
  fecha_recaudada: "FECHA RECAUDADA",
  mes_recaudada: "MES RECAUDADA",
  dia_abc_recaudada: "DÍA RECAUDADA",
  netlife_login: "LOGIN NETLIFE",
  netlife_estatus_real: "ESTATUS NETLIFE",
  fecha_activacion_netlife: "FECHA ACTIVACIÓN",
  mes_activacion_netlife: "MES ACTIVACIÓN",
  dia_abc_activacion_netlife: "DÍA ACTIVACIÓN",
  calidad_venta_analista: "CALIDAD VENTA",
  novedades_atc: "NOVEDADES",
  venta_efectiva: "VENTA EFECTIVA",
  auditoria_documentos: "AUDITORÍA DOC.",
  auditado_por: "AUDITADO POR",
  inconsistencia_documental: "INCONSISTENCIA",
  observacion_auditoria: "OBS. AUDITORÍA",
  errores_telcos: "ERRORES TELCOS",
  estatus_regularizacion: "ESTATUS REG.",
  detalle_regularizacion: "DETALLE REG.",
  fecha_regularizacion_atc: "FECHA REG. ATC",
  mes_regularizacion_atc: "MES REG. ATC",
  dia_abc_regularizacion_atc: "DÍA REG. ATC",
  mes_regularizacion: "MES REGULARIZACIÓN",
  observacion_venta_original: "OBS. VENTA ORIGINAL",
  observacion_gestion_cobranza: "OBS. COBRANZA",
  turno_agendado: "TURNO AGENDADO",
  fecha_agenda: "FECHA AGENDA",
  mes_agenda: "MES AGENDA",
  dia_abc_agenda: "DÍA AGENDA",
  banco: "BANCO",
  ciclo_facturacion: "CICLO FACTURACIÓN",
  costo_instalacion: "COSTO INSTALACIÓN",
  descuento_instalacion: "DESCUENTO INSTALACIÓN",
  beneficios_adicionales: "BENEFICIOS",
  beneficios_de_ley: "BENEFICIOS DE LEY",
  plazo_contrato_meses: "PLAZO CONTRATO",
  resumen_venta: "RESUMEN VENTA",
  foto_cedula_frontal: "FOTO CÉDULA FRONTAL",
  foto_cedula_trasera: "FOTO CÉDULA TRASERA",
  foto_carnet: "FOTO CARNET",
  archivo_resumen: "ARCHIVO RESUMEN",
  fecha_ingreso_telcos: "FECHA INGRESO TELCOS",
  gestion_atc: "GESTIÓN ATC",
};

const TABLE_COLUMNS = [
  "id", "estatus_envio", "ip_origen", "fecha_registro_sistema", "mes_registro_sistema", "dia_abc_registro_sistema",
  "codigo_asesor", "id_bitrix", "distribuidor_autorizado", "supervisor", "origen_venta", "venta_nueva_o_reingreso", "turno",
  "nombre_atc", "clausulas", "lider_comercial", "tipo_cliente", "genero_cliente", "tipo_documento", "numero_identificacion",
  "nombre_cliente_completo", "estado_civil", "fecha_nacimiento", "mes_nacimiento", "dia_abc_nacimiento", "email_cliente",
  "aplica_descuento_3ra_edad", "telf_celular_pin", "telf_celular_2", "telf_fijo", "provincia", "ciudad", "parroquia_barrio",
  "direccion_calles", "direccion_manzana_villa", "referencia_ubicacion", "coordenadas_gps", "tipo_vivienda", "regimen_vivienda",
  "plan_contratado_final", "servicios_digitales", "forma_pago", "detalle_bancario_ahorros", "valor_pago", "tipo_contrato",
  "links_documentos", "estado_recaudacion", "fecha_recaudada", "mes_recaudada", "dia_abc_recaudada", "netlife_login", "netlife_estatus_real",
  "fecha_activacion_netlife", "fecha_ingreso_telcos", "mes_activacion_netlife", "dia_abc_activacion_netlife", "calidad_venta_analista", "novedades_atc",
  "venta_efectiva", "auditoria_documentos", "auditado_por", "inconsistencia_documental", "observacion_auditoria", "errores_telcos",
  "estatus_regularizacion", "detalle_regularizacion", "gestion_atc", "fecha_regularizacion_atc", "mes_regularizacion_atc", "dia_abc_regularizacion_atc",
  "mes_regularizacion", "observacion_venta_original", "observacion_gestion_cobranza", "turno_agendado", "fecha_agenda", "mes_agenda",
  "dia_abc_agenda", "banco", "ciclo_facturacion", "costo_instalacion", "descuento_instalacion", "beneficios_adicionales",
  "beneficios_de_ley", "plazo_contrato_meses", "resumen_venta", "foto_cedula_frontal", "foto_cedula_trasera", "foto_carnet", "archivo_resumen"
];

const initialDetail = {
  id: "",
  estatus_envio: "",
  codigo_asesor: "",
  id_bitrix: "",
  distribuidor_autorizado: "",
  supervisor: "",
  origen_venta: "",
  nombre_cliente_completo: "",
  numero_identificacion: "",
  tipo_cliente: "",
  genero_cliente: "",
  fecha_nacimiento: "",
  email_cliente: "",
  provincia: "",
  ciudad: "",
  parroquia_barrio: "",
  telf_celular_pin: "",
  telf_celular_2: "",
  direccion_calles: "",
  referencia_ubicacion: "",
  plan_contratado_final: "",
  servicios_digitales: "",
  forma_pago: "",
  banco: "",
  ciclo_facturacion: "",
  costo_instalacion: "",
  descuento_instalacion: "",
  beneficios_adicionales: "",
  beneficios_de_ley: "",
  plazo_contrato_meses: "",
  resumen_venta: "",
  observacion_venta_original: "",
  observacion_gestion_cobranza: "",
  estado_recaudacion: "",
  netlife_login: "",
  netlife_estatus_real: "",
  calidad_venta_analista: "",
  venta_efectiva: "",
  auditoria_documentos: "",
  auditado_por: "",
  inconsistencia_documental: "",
  observacion_auditoria: "",
  errores_telcos: "",
  estatus_regularizacion: "",
  detalle_regularizacion: "",
  fecha_regularizacion_atc: "",
  mes_regularizacion: "",
  novedades_atc: "",
  foto_cedula_frontal: "",
  foto_cedula_trasera: "",
  foto_carnet: "",
  archivo_resumen: "",
  fecha_ingreso_telcos: "",
  gestion_atc: "",
};

function valueForField(row, key) {
  const v = row?.[key];
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

// ── Estado inicial de los filtros (las claves son los query params del API) ──
const FILTROS_VACIOS = {
  fechaDesde: "", fechaHasta: "",
  activacionDesde: "", activacionHasta: "",
  login: "",
  estatusNetlife: "",
  terceraEdad: "",
  estatusRegularizacion: "",
};

const estilosFiltro = {
  campo: { display: "flex", flexDirection: "column", gap: 5, minWidth: 0 },
  label: { fontSize: 10, fontWeight: 800, letterSpacing: ".08em", color: "#64748b", textTransform: "uppercase" },
  ctl: { padding: "8px 10px", borderRadius: 10, border: "1px solid #dbe4f0", fontSize: 12, outline: "none", background: "#fff", color: "#0f172a", width: "100%", boxSizing: "border-box" },
  rango: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", alignItems: "center", gap: 8, minWidth: 0 },
  guion: { color: "#94a3b8", fontSize: 12 },
};

function CampoSelect({ label, valor, onChange, opciones, placeholder = "Todos" }) {
  return (
    <div style={estilosFiltro.campo}>
      <label style={estilosFiltro.label}>{label}</label>
      <select style={estilosFiltro.ctl} value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function CampoRangoFecha({ label, desde, hasta, onDesde, onHasta }) {
  return (
    <div style={estilosFiltro.campo}>
      <label style={estilosFiltro.label}>{label}</label>
      <div style={estilosFiltro.rango}>
        <input type="date" aria-label={`${label} desde`} style={{ ...estilosFiltro.ctl, minWidth: 0 }} value={desde} onChange={(e) => onDesde(e.target.value)} />
        <span style={estilosFiltro.guion}>–</span>
        <input type="date" aria-label={`${label} hasta`} style={{ ...estilosFiltro.ctl, minWidth: 0 }} value={hasta} onChange={(e) => onHasta(e.target.value)} />
      </div>
    </div>
  );
}

function PanelRegistros({ onVolver, idInicial, fechaFija, etiquetaContexto, soloDetalle = false, empresa, onCambiarEmpresa }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(initialDetail);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [detailOriginal, setDetailOriginal] = useState({});
  const solicitudDetalleRef = useRef(0);

  // ── FILTROS ────────────────────────────────────────────────────────────
  // El buscador de texto se mantiene igual; estos se suman.
  // Cuando se entra desde el explorador de fechas (Año → Mes → Día), el día
  // elegido llega como `fechaFija` y se precarga en el filtro de rango. El
  // backend ya sabe filtrar por fechaDesde/fechaHasta, así que no hace falta
  // filtrar en el navegador ni traer registros de más.
  const [filtros, setFiltros] = useState(
    fechaFija ? { ...FILTROS_VACIOS, fechaDesde: fechaFija, fechaHasta: fechaFija } : FILTROS_VACIOS
  );
  const [opciones, setOpciones] = useState({ estatusNetlife: [], estatusRegularizacion: [], terceraEdad: [] });
  // false = se muestran TODAS las columnas de envios_ventas (con scroll horizontal)
  const [vistaCompacta, setVistaCompacta] = useState(false);
  const setFiltro = (k, v) => setFiltros((f) => ({ ...f, [k]: v }));
  const limpiarFiltros = () => setFiltros(FILTROS_VACIOS);
  const filtrosActivos = Object.values(filtros).filter(Boolean).length;

  const token = localStorage.getItem("token");

  const fetchRows = async (q = "", f = filtros) => {
    try {
      setLoading(true);
      const p = new URLSearchParams();
      if (q) p.set("buscar", q);
      Object.entries(f || {}).forEach(([k, v]) => { if (v) p.set(k, v); });
      if (empresa && empresa !== "TODOS") p.set("empresa", empresa);   // ← NUEVO
      const qs = p.toString() ? `?${p.toString()}` : "";
      const res = await fetch(`${API}/api/backoffice${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Error al cargar registros");
      setRows(json.data || []);
      if ((json.data || []).length) {
        // Conserva el registro que el usuario ya seleccionó aunque esta
        // petición de listado haya comenzado antes de hacer clic en él.
        setSelectedId((actual) => actual ?? json.data[0].id);
      }
    } catch (e) {
      setAlert({ type: "error", msg: e.message || "Error al cargar la vista" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => fetchRows(search, filtros), 350);
    return () => clearTimeout(t);
  }, [search, filtros, empresa]);

  // Opciones reales de los combos (una sola vez al montar)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/backoffice/opciones`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (json.success) setOpciones(json.data);
      } catch { /* si falla, los combos quedan vacíos y se puede filtrar igual por fecha/login */ }
    })();
  }, []);

  const fetchDetail = async (id) => {
    const solicitudActual = ++solicitudDetalleRef.current;
    setSelectedId(Number(id));
    try {
      const res = await fetch(`${API}/api/backoffice/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      // Una respuesta anterior nunca debe reemplazar un detalle abierto después.
      if (solicitudActual !== solicitudDetalleRef.current) return;
      if (json.success) {
        const normalizado = normalizarRegistro(json.data);
        setDetail(normalizado);
        setDetailOriginal(normalizado); // Copia original para comparar
        setShowModal(true);
      } else {
        setAlert({ type: "error", msg: json.error || "No se pudo cargar el registro" });
      }
    } catch (e) {
      console.error(e);
      setAlert({ type: "error", msg: "Error al cargar el registro" });
    }
  };

  const closeModal = () => {
    solicitudDetalleRef.current += 1;
    setShowModal(false);
    setSelectedId(null);
    setDetail(null);
    setDetailOriginal({});
    setAlert(null);

    // En Validación/Welcome el detalle vive dentro del tablero.
    // Al cerrar debemos desmontar PanelRegistros para que el tablero
    // vuelva a quedar totalmente clickeable y el mismo registro pueda
    // abrirse nuevamente todas las veces que sea necesario.
    if (soloDetalle) {
      onVolver?.();
    }
  };

  // Cuando se abre el detalle desde un módulo mediante idInicial,
  // el detalle de ese registro se abre solo. Se ejecuta una única vez por id
  // para no reabrir el modal cada vez que el componente se vuelve a renderizar.
  const idAbiertoRef = useRef(null);
  useEffect(() => {
    if (!idInicial) return;
    if (idAbiertoRef.current === idInicial) return;
    idAbiertoRef.current = idInicial;
    setSelectedId(Number(idInicial));
    fetchDetail(idInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idInicial]);

  // Columnas de la tabla. "completa" = todas las de envios_ventas.
  // Se arma sobre las claves que REALMENTE vienen del backend, para que si
  // mañana se agrega una columna a la tabla aparezca sola, sin tocar código.
  const tableHeaders = useMemo(() => {
    const delBackend = rows.length ? Object.keys(rows[0]) : [];
    // TABLE_COLUMNS primero (mantiene el orden pensado), y al final las que
    // el backend traiga y no estén listadas ahí.
    const ordenadas = [
      ...TABLE_COLUMNS.filter((k) => !delBackend.length || delBackend.includes(k)),
      ...delBackend.filter((k) => !TABLE_COLUMNS.includes(k)),
    ];
    const cols = vistaCompacta ? ordenadas.slice(0, 12) : ordenadas;
    return cols.map((key) => ({ key, label: FIELD_LABELS[key] || key.replace(/_/g, " ").toUpperCase() }));
  }, [rows, vistaCompacta]);

  const editableFields = useMemo(() => [
    "estatus_envio", "codigo_asesor", "id_bitrix", "distribuidor_autorizado", "supervisor", "origen_venta",
    "nombre_cliente_completo", "numero_identificacion", "tipo_cliente", "genero_cliente", "fecha_nacimiento",
    "email_cliente", "provincia", "ciudad", "parroquia_barrio", "telf_celular_pin", "telf_celular_2",
    "direccion_calles", "referencia_ubicacion", "plan_contratado_final", "servicios_digitales", "forma_pago",
    "banco", "ciclo_facturacion", "costo_instalacion", "descuento_instalacion", "beneficios_adicionales",
    "beneficios_de_ley", "plazo_contrato_meses", "resumen_venta", "estado_recaudacion", "netlife_login",
    "netlife_estatus_real", "calidad_venta_analista", "venta_efectiva", "auditoria_documentos", "auditado_por",
    "inconsistencia_documental", "observacion_auditoria", "errores_telcos", "estatus_regularizacion", "detalle_regularizacion", "gestion_atc",
    "fecha_regularizacion_atc",
    "mes_regularizacion",
    "novedades_atc",

    // Agendamiento
    "turno_agendado",
    "fecha_agenda",
    "mes_agenda",
    "dia_abc_agenda",
    // Ingreso a Telcos
    "fecha_ingreso_telcos",

    "observacion_venta_original",
    "observacion_gestion_cobranza",
    ...CAMPOS_DOCUMENTO
  ], []);

  // ── Agrupación del detalle en secciones ────────────────────────────────
  // Antes eran ~50 inputs seguidos en dos columnas, sin ningún corte: había
  // que leer etiqueta por etiqueta para encontrar un campo. Agrupados por
  // tema se ubican de un vistazo (Ley de proximidad).
  //
  // La sección "Otros datos" se calcula sola con lo que no quedó asignado,
  // así que si mañana se agrega un campo a editableFields NO desaparece del
  // formulario: aparece ahí hasta que se lo ubique en su grupo.
  const seccionesDetalle = useMemo(() => {
    const grupos = [
      {
        titulo: "Registro",
        campos: [
          "estatus_regularizacion",
          "detalle_regularizacion",
          "gestion_atc",
          "mes_regularizacion"
        ]
      },

      {
        titulo: "Cliente",
        campos: [
          "nombre_cliente_completo",
          "numero_identificacion",
          "tipo_cliente",
          "genero_cliente",
          "fecha_nacimiento",
          "email_cliente",
          "telf_celular_pin",
          "telf_celular_2",
        ],
      },

      {
        titulo: "Netlife",
        campos: [
          "estado_recaudacion",
          "netlife_login",
          "netlife_estatus_real",
          "fecha_regularizacion_atc",
          "fecha_ingreso_telcos",
          "novedades_atc",
        ],
      },

      {
        titulo: "Observaciones",
        campos: [
          "observacion_venta_original",
          "observacion_gestion_cobranza",
        ],
      },
    ];

    return grupos
      .map((g) => ({
        ...g,
        campos: g.campos.filter((f) => editableFields.includes(f)),
      }))
      .filter((g) => g.campos.length);
  }, [editableFields]);

  const handleSave = async () => {
    if (!selectedId) return;

    setSaving(true);
    setAlert(null);

    try {
      const payload = {};

      for (const campo of editableFields) {
        let nuevo = detail?.[campo] ?? "";
        const viejo = detailOriginal?.[campo] ?? "";

        /*
         * Las fechas NO se convierten a mayúsculas.
         *
         * Ejemplo:
         * fecha_agenda = "2026-08-17"
         */
        if (
          typeof nuevo === "string" &&
          !esCampoDocumento(campo) &&
          !CAMPOS_FECHA.includes(campo)
        ) {
          nuevo = nuevo.toUpperCase();
        }

        if (campo === "estatus_regularizacion" && nuevo === "SIN REVISAR") {
          nuevo = "";
        }

        if (nuevo !== viejo) {
          payload[campo] = nuevo;
        }
      }

      /*
       * ============================================================
       * AGENDAMIENTO
       * ============================================================
       *
       * Nos aseguramos de que fecha_agenda se envíe cuando realmente
       * fue modificada, incluso si en algún cambio futuro alguien
       * olvida agregarla a editableFields.
       */
      const fechaAgendaNueva = detail?.fecha_agenda ?? "";
      const fechaAgendaVieja = detailOriginal?.fecha_agenda ?? "";

      if (fechaAgendaNueva !== fechaAgendaVieja) {
        payload.fecha_agenda = fechaAgendaNueva;
      }

      const turnoNuevo = detail?.turno_agendado ?? "";
      const turnoViejo = detailOriginal?.turno_agendado ?? "";

      if (turnoNuevo !== turnoViejo) {
        payload.turno_agendado = turnoNuevo;
      }

      /*
       * Si no hay cambios, no hacemos PUT.
       */
      if (Object.keys(payload).length === 0) {
        setAlert({
          type: "success",
          msg: "No hay cambios que guardar",
        });

        setSaving(false);
        return;
      }

      /*
       * DEBUG:
       * Puedes ver exactamente qué está enviando el frontend.
       */
      console.log(
        "[BACKOFFICE] PUT payload:",
        JSON.stringify(payload, null, 2)
      );

      const res = await fetch(
        `${API}/api/backoffice/${selectedId}`,
        {
          method: "PUT",

          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify(payload),
        }
      );

      /*
       * Intentamos leer JSON.
       */
      let json;

      try {
        json = await res.json();
      } catch {
        throw new Error(
          `El servidor respondió ${res.status} pero no devolvió JSON`
        );
      }

      console.log(
        "[BACKOFFICE] PUT response:",
        res.status,
        json
      );

      /*
       * IMPORTANTE:
       * Si el backend devuelve 400, ahora veremos el mensaje real.
       */
      if (!res.ok || !json.success) {
        throw new Error(
          json.error ||
          `Error ${res.status} al actualizar el registro`
        );
      }

      /*
       * Actualización correcta.
       */
      setAlert({
        type: json.correo_bienvenida?.enviado === false ? "error" : "success",
        msg: json.correo_bienvenida?.enviado === false
          ? "Registro actualizado, pero no se pudo enviar el correo de bienvenida."
          : json.correo_bienvenida?.enviado
            ? json.correo_bienvenida.cliente
              ? "Registro actualizado y correo de bienvenida enviado al cliente con copia a Backoffice."
              : "Registro actualizado. El cliente no tiene un correo válido; la bienvenida se envió solo a Backoffice."
            : "Registro actualizado correctamente",
      });

      /*
       * Recargamos ambos.
       */
      const registroActualizado = normalizarRegistro(json.data);
      setDetail(registroActualizado);
      setDetailOriginal(registroActualizado);
      await fetchRows(search, filtros);

    } catch (e) {

      console.error(
        "[BACKOFFICE] Error actualizando registro:",
        e
      );

      setAlert({
        type: "error",
        msg: e.message || "Error al guardar",
      });

    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 18, background: "#f3f4f6", minHeight: "100vh", color: "#0f172a" }}>
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 12px 40px rgba(15, 23, 42, 0.08)", overflow: "hidden" }}>
        {!soloDetalle && (
          <>
            <div style={{ padding: 18, borderBottom: "1px solid #e5e7eb", background: "linear-gradient(135deg,#f8fafc,#eef2ff)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <button
                    onClick={onVolver}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10, background: "#fff", border: "1px solid #dbe4f0", borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 800, color: "#4f46e5", cursor: "pointer" }}
                  >
                    ← Volver a Backoffice
                  </button>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", color: "#4f46e5", textTransform: "uppercase" }}>Backoffice · Registros</div>
                  <h2 style={{ margin: "8px 0 0", fontSize: 26, fontWeight: 900, color: "#111827" }}>
                    {etiquetaContexto || "Todos los registros"}
                  </h2>
                </div>
                {onCambiarEmpresa && <FiltroEmpresa valor={empresa} onCambiar={onCambiarEmpresa} />}
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#1d4ed8" }}>
                  {rows.length} registros
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 18, padding: 18, minHeight: 760 }}>
              <div style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden", background: "#fff" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por asesor, cliente, ID, CI..."
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #dbe4f0", fontSize: 13, outline: "none" }}
                  />
                  <BotonDescargaExcel
                    onClick={() => exportarAExcel(rows, `Reporte_Registros_${empresa || "Todos"}`)}
                    color="#0284c7" fondo="#f0f9ff" borde="#bae6fd"
                  />
                  <button
                    onClick={() => fetchRows(search, filtros)}
                    style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #c7d2fe", background: "#eef2ff", color: "#3730a3", fontWeight: 700, cursor: "pointer" }}
                  >
                    Refrescar
                  </button>
                </div>

                {/* ── FILTROS ──────────────────────────────────────────────── */}
                <div style={{ padding: 14, background: "#fff", borderBottom: "1px solid #e5e7eb" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
                    <CampoRangoFecha
                      label="Fecha de registro"
                      desde={filtros.fechaDesde} hasta={filtros.fechaHasta}
                      onDesde={(v) => setFiltro("fechaDesde", v)} onHasta={(v) => setFiltro("fechaHasta", v)}
                    />
                    <CampoRangoFecha
                      label="Fecha de activación"
                      desde={filtros.activacionDesde} hasta={filtros.activacionHasta}
                      onDesde={(v) => setFiltro("activacionDesde", v)} onHasta={(v) => setFiltro("activacionHasta", v)}
                    />
                    <div style={estilosFiltro.campo}>
                      <label style={estilosFiltro.label}>Login Netlife</label>
                      <input
                        style={estilosFiltro.ctl}
                        value={filtros.login}
                        onChange={(e) => setFiltro("login", e.target.value)}
                        placeholder="Login o parte del login"
                      />
                    </div>
                  <CampoSelect
  label="Estatus Netlife"
  valor={filtros.estatusNetlife}
  onChange={(v) => setFiltro("estatusNetlife", v)}
  opciones={ESTATUS_NETLIFE}
/>
                    <CampoSelect
                      label="Estatus regularización"
                      valor={filtros.estatusRegularizacion}
                      onChange={(v) => setFiltro("estatusRegularizacion", v)}
                      opciones={opciones.estatusRegularizacion}
                    />
                    <CampoSelect
                      label="Tercera edad"
                      valor={filtros.terceraEdad}
                      onChange={(v) => setFiltro("terceraEdad", v)}
                      opciones={opciones.terceraEdad}
                    />
                  </div>

                  {filtrosActivos > 0 && (
                    <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 999, padding: "4px 12px" }}>
                        {filtrosActivos} filtro{filtrosActivos > 1 ? "s" : ""} aplicado{filtrosActivos > 1 ? "s" : ""}
                      </span>
                      <button
                        onClick={limpiarFiltros}
                        style={{ padding: "6px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  )}
                </div>

                {/* Cambio de vista: 12 columnas clave vs. la tabla completa */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 14px", background: "#fff", borderBottom: "1px solid #e5e7eb" }}>
                  <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
                    {tableHeaders.length} columnas · {rows.length} registros
                    {!vistaCompacta && <span style={{ color: "#94a3b8" }}> · desplazá en horizontal para ver el resto</span>}
                  </span>
                  <button
                    onClick={() => setVistaCompacta((v) => !v)}
                    style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid #dbe4f0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    {vistaCompacta ? "Ver todas las columnas" : "Vista compacta"}
                  </button>
                </div>

                <div style={{ overflow: "auto", maxHeight: 700 }}>
                  {loading ? (
                    <div style={{ padding: 28, textAlign: "center", color: "#64748b" }}>Cargando registros...</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                      <thead style={{ position: "sticky", top: 0, zIndex: 3 }}>
                        <tr style={{ background: "#f8fafc" }}>
                          {tableHeaders.map((h, i) => (
                            <th
                              key={h.key}
                              title={h.key}
                              style={{
                                textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e5e7eb",
                                fontWeight: 800, color: "#475569", whiteSpace: "nowrap", background: "#f8fafc",
                                ...(i === 0 ? { width: 60 } : {}),
                              }}
                            >
                              {h.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr
                            key={row.id}
                            onClick={() => fetchDetail(row.id)}
                            style={{ cursor: "pointer", background: selectedId === row.id ? "#eff6ff" : "#fff" }}
                          >
                            {tableHeaders.map((h) => (
                              <td
                                key={`${row.id}-${h.key}`}
                                title={valueForField(row, h.key)}
                                style={{
                                  padding: "10px 8px", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap",
                                  maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis",
                                  background: selectedId === row.id ? "#eff6ff" : "#fff",
                                }}
                              >
                                {valueForField(row, h.key)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

          </>
        )}

        {/* ─── MODAL DETALLE ─────────────────────────────────────────────────────────────── */}
        {showModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
            <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", maxWidth: 1100, width: "94%", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Header del modal — fijo, no se va con el scroll */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: 20, borderBottom: "1px solid #e5e7eb", background: "#fff", flex: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#0ea5e9", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 20 }}>
                    {(detail?.nombre_cliente_completo || "?").split(" ").map(w => w[0]).slice(0, 2).join("")}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#111827" }}>
                      {detail?.nombre_cliente_completo || "Registro"}
                    </h3>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                      {detail?.codigo_asesor || ""}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ background: "#dcfce7", color: "#166534", padding: "6px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
                    {detail?.estatus_envio || "ACTIVO"}
                  </span>
                  <button
                    onClick={closeModal}
                    style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Contenido: Grid 2 columnas */}
              <div style={{ padding: 20, maxHeight: "calc(90vh - 170px)", overflow: "auto", background: "#f8fafc" }}>
                {seccionesDetalle.map((sec) => (
                  <section key={sec.titulo} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 18, marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: "1px solid #f1f5f9" }}>
                      <span style={{ width: 4, height: 16, borderRadius: 4, background: "#0ea5e9", flex: "none" }} />
                      <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#0f172a", letterSpacing: ".01em" }}>{sec.titulo}</h4>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", background: "#f1f5f9", borderRadius: 999, padding: "2px 8px" }}>{sec.campos.length}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
                      {sec.campos.map((field) => (
                        <div key={field}>
                          <label style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
                            {FIELD_LABELS[field] || field}
                          </label>

                          {esCampoDocumento(field) ? (
                            <CampoDocumento
                              field={field}
                              etiqueta={FIELD_LABELS[field] || field}
                              valor={detail?.[field] || ""}
                              numeroIdentificacion={detail?.numero_identificacion}
                              onCambio={(nuevaRuta) => setDetail((prev) => ({ ...prev, [field]: nuevaRuta }))}
                              onAlert={setAlert}
                            />
                          ) : field === "estatus_regularizacion" ? (() => {
                            const estadoActual = String(detail?.[field] ?? "").trim().toUpperCase();
                            const valorSeleccionado = !estadoActual || estadoActual === "SIN REVISAR"
                              ? "__SIN_REVISAR__"
                              : estadoActual;
                            const esValorConocido = OPCIONES_ESTATUS_REGULARIZACION.some(
                              (opcion) => opcion.valor === valorSeleccionado
                            );

                            return (
                            <select
                              value={valorSeleccionado}
                              onChange={(e) => {
                                const valor = e.target.value === "__SIN_REVISAR__"
                                  ? ""
                                  : e.target.value.toUpperCase();
                                setDetail((prev) => ({ ...prev, [field]: valor }));
                              }}
                              style={{
                                width: "100%",
                                padding: "10px 12px",
                                borderRadius: 8,
                                border: "1px solid #dbe4f0",
                                fontSize: 12,
                                outline: "none",
                                color: "#111827",
                                background: "#fff",
                                cursor: "pointer",
                              }}
                            >
                              {estadoActual && !esValorConocido && (
                                <option value={valorSeleccionado} disabled>
                                  Estado actual: {estadoActual}
                                </option>
                              )}
                              {OPCIONES_ESTATUS_REGULARIZACION.map((opcion) => (
                                <option key={opcion.valor} value={opcion.valor}>
                                  {opcion.etiqueta}
                                </option>
                              ))}
                            </select>
                            );
                          })() : field === "novedades_atc" ? (
                            <select
                              value={detail?.[field] ?? ""}
                              onChange={(e) =>
                                setDetail((prev) => ({ ...prev, [field]: e.target.value }))
                              }
                              style={{
                                width: "100%",
                                padding: "10px 12px",
                                borderRadius: 8,
                                border: "1px solid #dbe4f0",
                                fontSize: 12,
                                outline: "none",
                                color: "#111827",
                                background: "#fff",
                                cursor: "pointer",
                              }}
                            >
                              <option value="">Seleccionar...</option>
                              <option value="PENDIENTE">Pendiente</option>
                              <option value="NOTIFICADO">Notificado</option>
                            </select>
                          ) : field === "gestion_atc" ? (
                            /* 📋 SELECT: GESTIÓN ATC */
                            <select
                              value={detail?.[field] ?? ""}
                              onChange={(e) =>
                                setDetail((prev) => ({ ...prev, [field]: e.target.value }))
                              }
                              style={{
                                width: "100%",
                                padding: "10px 12px",
                                borderRadius: 8,
                                border: "1px solid #dbe4f0",
                                fontSize: 12,
                                outline: "none",
                                color: "#111827",
                                background: "#fff",
                                cursor: "pointer",
                              }}
                            >
                              <option value="">Seleccionar gestión...</option>
                              <option value="ANALFABETO">Analfabeto</option>
                              <option value="DESCUENTO CONADIS">Descuento conadis</option>
                              <option value="DESCUENTO 3RA EDAD">Descuento 3ra edad</option>
                            </select>
                          ) : (
                            <input
                              type={CAMPOS_FECHA.includes(field) ? "date" : "text"}
                              value={detail?.[field] ?? ""}
                              onChange={(e) => setDetail((prev) => ({ ...prev, [field]: e.target.value }))}
                              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #dbe4f0", fontSize: 12, outline: "none", color: "#111827", background: "#fff" }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              {/* Footer con alerta y botones — fijo abajo */}
              <div style={{ padding: 16, borderTop: "1px solid #e5e7eb", background: "#fff", flex: "none" }}>
                {alert && (
                  <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: alert.type === "success" ? "#ecfdf5" : "#fef2f2", color: alert.type === "success" ? "#066b4f" : "#b91c1c", border: `1px solid ${alert.type === "success" ? "#bbf7d0" : "#fecaca"}`, fontSize: 12, fontWeight: 700 }}>
                    {alert.msg}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button
                    onClick={closeModal}
                    style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #dbe4f0", background: "#fff", color: "#475569", fontWeight: 700, cursor: "pointer" }}
                  >
                    CERRAR
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#0ea5e9", color: "#fff", fontWeight: 800, cursor: "pointer" }}
                  >
                    {saving ? "Guardando..." : "GUARDAR"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HUB DE BACKOFFICE
// ═══════════════════════════════════════════════════════════════════════════
// Backoffice dejó de ser una sola pantalla: ahora es un menú de tarjetas y cada
// una abre su propio submódulo a pantalla completa.
//
// El submódulo activo vive en la URL (?m=registros), no en un useState. Eso
// permite compartir el enlace de un submódulo, recargar la página sin perder
// dónde estabas, y que el botón "atrás" del navegador funcione como se espera.
//
// PARA AGREGAR UN SUBMÓDULO NUEVO: se añade una entrada a SUBMODULOS y, cuando
// su pantalla exista, se enchufa en el switch de abajo. No hay que tocar nada
// más — ni el menú lateral, ni las rutas de App.jsx.
//
// NOTA SOBRE LAS DOS EMPRESAS: hoy el hub es común. Cuando definas cómo separar
// NOVONET y VELSA, el punto de corte natural es aquí: o un selector de empresa
// en la cabecera del hub que se pase como prop a cada submódulo, o duplicar la
// tarjeta por empresa. Se dejó `empresaUsuario` leído y disponible para eso.
const SUBMODULOS = [
  {
    id: "registros",
    nombre: "Registros",
    icono: "🗂️",
    descripcion: "Todas las ventas ingresadas, con filtros, detalle editable y documentos de respaldo.",
    color: "#0ea5e9",
    fondo: "#e0f2fe",
    listo: true,
  },
  {
    id: "validacion-estado",
    nombre: "Validación de Estado",
    icono: "🔎",
    descripcion: "Control y consulta de los estados Netlife con contadores y detalle editable.",
    color: "#ea580c",
    fondo: "#fff7ed",
    listo: true,
  },
  {
    id: "validacion",
    nombre: "Validación / Regularización",
    icono: "✅",
    descripcion: "Tablero de ventas por estado de regularización, de la más antigua a la más reciente.",
    color: "#7c3aed",
    fondo: "#ede9fe",
    listo: true,
  },
  {
    id: "welcome",
    nombre: "Welcome",
    icono: "👋",
    descripcion: "Gestión de la llamada de bienvenida al cliente tras la activación.",
    color: "#059669",
    fondo: "#d1fae5",
    listo: true,
  },
  {
    id: "agendamientos",
    nombre: "Agendamientos",
    icono: "📅",
    descripcion: "Programación y control de las visitas de instalación.",
    color: "#ea580c",
    fondo: "#ffedd5",
    listo: true,
  },
  {
    id: "preservicios",
    nombre: "Preservicios",
    icono: "🔧",
    descripcion: "Verificaciones técnicas previas a la instalación del servicio.",
    color: "#0891b2",
    fondo: "#cffafe",
    listo: true,
  },
];

function TarjetaSubmodulo({ sub, onAbrir }) {
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onAbrir(sub.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textAlign: "left",
        background: "#fff",
        border: `1px solid ${hover ? sub.color : "#e5e7eb"}`,
        borderRadius: 18,
        padding: 22,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight: 190,
        boxShadow: hover ? `0 16px 36px ${sub.color}22` : "0 6px 18px rgba(15,23,42,.06)",
        transform: hover ? "translateY(-3px)" : "none",
        transition: "all .18s ease-out",
        position: "relative",
      }}
    >
      {!sub.listo && (
        <span style={{ position: "absolute", top: 16, right: 16, fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 999, padding: "3px 9px" }}>
          EN DESARROLLO
        </span>
      )}

      <div style={{ width: 52, height: 52, borderRadius: 14, background: sub.fondo, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flex: "none" }}>
        {sub.icono}
      </div>

      <div>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "#0f172a", lineHeight: 1.25 }}>{sub.nombre}</h3>
        <p style={{ margin: "7px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "#64748b" }}>{sub.descripcion}</p>
      </div>

      <span style={{ marginTop: "auto", fontSize: 12, fontWeight: 800, color: sub.color, display: "inline-flex", alignItems: "center", gap: 6 }}>
        Abrir <span style={{ transform: hover ? "translateX(3px)" : "none", transition: "transform .18s" }}>→</span>
      </span>
    </button>
  );
}

function HubBackoffice({ onAbrir, empresa, onCambiarEmpresa }) {
  return (
    <div style={{ padding: 18, background: "#f3f4f6", minHeight: "100vh", color: "#0f172a" }}>
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 12px 40px rgba(15,23,42,.08)", overflow: "hidden" }}>
        <div style={{ padding: 22, borderBottom: "1px solid #e5e7eb", background: "linear-gradient(135deg,#f8fafc,#eef2ff)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".18em", color: "#4f46e5", textTransform: "uppercase" }}>
                Backoffice
              </div>
              <h2 style={{ margin: "8px 0 0", fontSize: 26, fontWeight: 900, color: "#111827" }}>
                ¿Qué quieres gestionar?
              </h2>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b" }}>
                Elige un módulo para entrar.
              </p>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: "#94a3b8", textTransform: "uppercase", marginBottom: 6, textAlign: "right" }}>
                Empresa
              </div>
              <FiltroEmpresa valor={empresa} onCambiar={onCambiarEmpresa} />
            </div>
          </div>
        </div>

        <div
          style={{
            padding: 22,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 18,
          }}
        >
          {SUBMODULOS.map((sub) => (
            <TarjetaSubmodulo key={sub.id} sub={sub} onAbrir={onAbrir} />
          ))}
        </div>
      </div>
    </div>
  );
}

function EnConstruccion({ sub, onVolver }) {
  return (
    <div style={{ padding: 18, background: "#f3f4f6", minHeight: "100vh", color: "#0f172a" }}>
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 12px 40px rgba(15,23,42,.08)", overflow: "hidden" }}>
        <div style={{ padding: 18, borderBottom: "1px solid #e5e7eb", background: "linear-gradient(135deg,#f8fafc,#eef2ff)" }}>
          <button
            onClick={onVolver}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10, background: "#fff", border: "1px solid #dbe4f0", borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 800, color: "#4f46e5", cursor: "pointer" }}
          >
            ← Volver a Backoffice
          </button>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".18em", color: "#4f46e5", textTransform: "uppercase" }}>
            Backoffice
          </div>
          <h2 style={{ margin: "8px 0 0", fontSize: 26, fontWeight: 900, color: "#111827" }}>{sub.nombre}</h2>
        </div>

        <div style={{ padding: "70px 24px", textAlign: "center" }}>
          <div style={{ width: 88, height: 88, borderRadius: 24, background: sub.fondo, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42, margin: "0 auto 20px" }}>
            {sub.icono}
          </div>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>Módulo en desarrollo</h3>
          <p style={{ margin: "10px auto 0", maxWidth: 460, fontSize: 13.5, lineHeight: 1.6, color: "#64748b" }}>
            {sub.descripcion}
          </p>
          <p style={{ margin: "18px auto 0", maxWidth: 460, fontSize: 12.5, lineHeight: 1.6, color: "#94a3b8" }}>
            La pantalla todavía no está construida. La navegación ya quedó lista, así que
            cuando definamos qué debe mostrar solo se enchufa aquí.
          </p>
        </div>
      </div>
    </div>
  );
}

const EMPRESAS_FILTRO = [
  { id: "TODOS", label: "Todos" },
  { id: "NOVONET", label: "Novonet" },
  { id: "VELSA", label: "Velsa" },
];

// Perfil y empresa del usuario logueado. El layout guarda esto en
// "userProfile" (no en "user"), igual que hace Backoffice.jsx.
function perfilUsuario() {
  try {
    const u = JSON.parse(localStorage.getItem("userProfile") || "{}");
    return {
      perfil: (u.perfil || "").toUpperCase(),
      empresa: (u.empresa || "").toUpperCase(),
    };
  } catch (_) {
    return { perfil: "", empresa: "" };
  }
}

function FiltroEmpresa({ valor, onCambiar }) {
  // El backend ya limita los registros a la empresa del token: un usuario que
  // no sea ADMINISTRADOR no puede ver la otra empresa aunque pulse el botón
  // (recibiría un 403). Mostrarle el selector solo genera un error confuso,
  // así que se le enseña su empresa como etiqueta fija.
  const { perfil, empresa: empresaUsuario } = perfilUsuario();

  if (perfil !== "ADMINISTRADOR") {
    const etiqueta =
      EMPRESAS_FILTRO.find((e) => e.id === empresaUsuario)?.label || empresaUsuario || "—";
    return (
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 999,
        padding: "7px 16px", fontWeight: 800, fontSize: 12.5, color: "#475569",
        whiteSpace: "nowrap",
      }} title="Solo ves los registros de tu empresa">
        <span style={{ opacity: .6 }}>Empresa:</span> {etiqueta}
      </div>
    );
  }

  return (
    <div style={{ display: "inline-flex", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 999, padding: 4, gap: 4 }}>
      {EMPRESAS_FILTRO.map((e) => {
        const activo = (valor || "TODOS") === e.id;
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => onCambiar(e.id)}
            style={{
              padding: "7px 16px",
              borderRadius: 999,
              border: "none",
              background: activo ? "#4f46e5" : "transparent",
              color: activo ? "#fff" : "#475569",
              fontWeight: 800,
              fontSize: 12.5,
              cursor: "pointer",
              transition: "all .15s",
              whiteSpace: "nowrap",
            }}
          >
            {e.label}
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPLORADOR DE FECHAS  ·  Año → Mes → Día → registros
// ═══════════════════════════════════════════════════════════════════════════
// Navegación común a TODOS los submódulos de Backoffice. Se agrupa por
// FECHA REGISTRO (`fecha_registro_sistema`), que es cuándo se cargó la venta.
//
// ⚠️ ZONA HORARIA — esto importa de verdad aquí.
// La columna es un timestamp guardado en UTC. Una venta cargada el 15/08 a las
// 20:30 en Ecuador (UTC-5) se almacena como 16/08 01:30 UTC. Si se agrupara
// cortando el texto de la fecha, esa venta aparecería en el día equivocado y
// los conteos diarios no cuadrarían con lo que vio el asesor.
// Por eso la fecha calendario se calcula siempre en America/Guayaquil, igual
// que hace el módulo de Jotform en SQL con `- INTERVAL '5 hours'`.
const MESES_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const fmtFechaEC = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit",
});

/** Devuelve la fecha calendario en Ecuador como "YYYY-MM-DD", o null. */
function fechaCalendarioEC(valor) {
  if (!valor) return null;
  const s = String(valor).trim();
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return fmtFechaEC.format(d);
}

/** "2026-01-01" → "Martes 01/01/2026" */
function etiquetaDia(iso) {
  const [a, m, d] = iso.split("-");
  // Mediodía para que ningún desfase horario cambie el día de la semana.
  const fecha = new Date(`${iso}T12:00:00`);
  return `${DIAS_ES[fecha.getDay()]} ${d}/${m}/${a}`;
}

const ETAPAS_JOTFORM_RESUMEN = [
  "ACTIVO",
  "PREPLANIFICADO",
  "ASIGNADO",
  "PRESERVICIO",
  "FACTIBLE",
  "REGULARIZACION",
  "REPLANIFICADO",
  "DETENIDO",
];

function crearContadoresEtapas() {
  return Object.fromEntries(
    ETAPAS_JOTFORM_RESUMEN.map((etapa) => [etapa, 0])
  );
}

function sumarEtapa(contadores, row) {
  const norm = (v) =>
    String(v || "")
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  // Priorizamos netlife_estatus_real (v2); si viene vacío, usamos estatus_envio (v1)
  const v2 = norm(row?.netlife_estatus_real);
  const v1 = norm(row?.estatus_envio);
  const val = v2 || v1;

  if (!val) return;

  const check = (valor, target) => {
    // 1. Coincidencia exacta
    if (valor === target) return true;

    // 2. Coincidencias flexibles / parciales específicas por etapa
    if (target === "PREPLANIFICADO") {
      return valor.includes("PLANIF") || valor.includes("PALNIF");
    }
    if (target === "PRESERVICIO") {
      return valor.includes("PRESERV") || valor.includes("PRESE");
    }
    if (target === "FACTIBLE") {
      return valor.includes("FACTIB");
    }
    if (target === "ASIGNADO") {
      return valor.includes("ASIGN");
    }
    if (target === "ACTIVO") {
      // Evita falsos positivos con "INACTIVO" o "DESACTIVADO"
      return valor.includes("ACTIV") && !valor.includes("INACTIV") && !valor.includes("DESACTIV");
    }
    if (target === "REGULARIZACION") {
      return valor.includes("REGULARIZ");
    }
    if (target === "REPLANIFICADO") {
      return valor.includes("REPLANIFIC");
    }
    if (target === "DETENIDO") {
      return valor.includes("DETENID");
    }

    return valor.includes(target);
  };

  for (const s of ETAPAS_JOTFORM_RESUMEN) {
    const sNorm = norm(s);
    if (check(val, sNorm)) {
      contadores[s]++;
      return; // Suma en la primera etapa que coincida y sale
    }
  }
}

/**
 * Agrupa registros en años → meses → días, cada nivel con su cantidad.
 * Los registros sin fecha válida no se pierden: se juntan en un grupo aparte
 * para que nadie desaparezca del sistema sin que se note.
 */
function agruparPorFecha(rows, campo = "fecha_registro_sistema") {
  const anios = new Map();
  const sinFecha = [];

  for (const row of rows) {
    const iso = fechaCalendarioEC(row?.[campo]);

    if (!iso) {
      sinFecha.push(row);
      continue;
    }

    const [a, m] = iso.split("-");

    // ─────────────────────────────────────────────
    // AÑO
    // ─────────────────────────────────────────────
    if (!anios.has(a)) {
      anios.set(a, {
        anio: a,
        cantidad: 0,
        etapas: crearContadoresEtapas(),
        meses: new Map(),
      });
    }

    const anio = anios.get(a);

    anio.cantidad++;
    sumarEtapa(anio.etapas, row);

    // ─────────────────────────────────────────────
    // MES
    // ─────────────────────────────────────────────
    if (!anio.meses.has(m)) {
      anio.meses.set(m, {
        mes: m,
        cantidad: 0,
        etapas: crearContadoresEtapas(),
        dias: new Map(),
      });
    }

    const mes = anio.meses.get(m);

    mes.cantidad++;
    sumarEtapa(mes.etapas, row);

    // ─────────────────────────────────────────────
    // DÍA
    // ─────────────────────────────────────────────
    if (!mes.dias.has(iso)) {
      mes.dias.set(iso, {
        iso,
        cantidad: 0,
        etapas: crearContadoresEtapas(),
      });
    }

    const dia = mes.dias.get(iso);

    dia.cantidad++;
    sumarEtapa(dia.etapas, row);
  }

  const lista = [...anios.values()]
    .map((a) => ({
      ...a,

      meses: [...a.meses.values()]
        .map((m) => ({
          ...m,

          dias: [...m.dias.values()]
            .sort((x, y) => (x.iso < y.iso ? 1 : -1)),
        }))
        .sort((x, y) => Number(y.mes) - Number(x.mes)),
    }))
    .sort((x, y) => Number(y.anio) - Number(x.anio));

  return {
    anios: lista,
    sinFecha,
  };
}

function BotonNivel({
  titulo,
  cantidad,
  etapas,
  color,
  fondo,
  borde,
  onClick,
  ancho = 240,
  mostrarEtapas = false,
}) {
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textAlign: "left",
        background: "#fff",
        border: `1px solid ${hover ? color : borde}`,
        borderRadius: 10,
        padding: "11px 14px",
        cursor: "pointer",

        width: mostrarEtapas ? "100%" : ancho,
        minWidth: mostrarEtapas ? 340 : ancho,

        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 18,

        boxShadow: hover
          ? `0 8px 18px ${color}22`
          : "0 3px 10px rgba(15,23,42,.04)",

        transform: hover ? "translateY(-1px)" : "none",
        transition: "all .16s ease-out",
      }}
    >
      {/* IZQUIERDA */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          minWidth: 150,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 900,
            color: "#0f172a",
          }}
        >
          {titulo}
        </span>

        <span
          style={{
            alignSelf: "flex-start",
            fontSize: 11,
            fontWeight: 800,
            color,
            background: fondo,
            border: `1px solid ${borde}`,
            borderRadius: 999,
            padding: "3px 9px",
            whiteSpace: "nowrap",
          }}
        >
          {cantidad} {cantidad === 1 ? "registro" : "registros"}
        </span>
      </div>

      {/* DERECHA — ETAPAS */}
      {mostrarEtapas && (
        <div
          style={{
            display: "grid",
            // Antes: repeat(5, ...) — fijo a las 5 etapas originales.
            // Ahora se calcula solo, así si mañana se agregan o quitan
            // etapas en ETAPAS_JOTFORM_RESUMEN, la grilla se ajusta sin
            // tener que tocar este número a mano.
            gridTemplateColumns: `repeat(${ETAPAS_JOTFORM_RESUMEN.length}, minmax(64px, 1fr))`,
            alignItems: "center",
            gap: 6,
            flex: 1,
            marginLeft: 24,
          }}
        >
          {ETAPAS_JOTFORM_RESUMEN.map((etapa) => (
            <div
              key={etapa}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 68,
                padding: "5px 6px",
                borderRadius: 8,
                background: "#f8fafc",
                border: "1px solid #e5e7eb",
              }}
              title={`${etapa}: ${etapas?.[etapa] ?? 0}`}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#64748b",
                  textAlign: "center",
                  lineHeight: 1.1,
                }}
              >
                {etapa}
              </span>

              <span
                style={{
                  marginTop: 3,
                  fontSize: 14,
                  fontWeight: 900,
                  color: "#2563eb",
                }}
              >
                {etapas?.[etapa] ?? 0}
              </span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

/**
 * Pantalla de navegación por fechas. Se muestra ANTES del contenido de cada
 * submódulo: primero se elige el día (o «Ver todos») y recién ahí aparecen los
 * registros. El nivel actual vive en la URL, así que el botón atrás del
 * navegador retrocede de día → mes → año como uno espera.
 */
function ExploradorFechas({
  rows, cargando, error, tituloModulo, migaModulo,
  color = "#4f46e5", fondo = "#eef2ff", borde = "#c7d2fe",
  nav, navegar, onVolver, onRecargar,
  empresa, onCambiarEmpresa,
  onAbrirRegistro,
}) {
  const { anios, sinFecha } = useMemo(() => agruparPorFecha(rows), [rows]);

  // ── BÚSQUEDA GENERAL (cliente, CI, asesor, login) ──────────────────────
  // Mismo criterio que en Validación/Regularización y Preservicios: filtra
  // sobre TODOS los registros cargados (sin importar año/mes/día) por
  // nombre del cliente, cédula, código de asesor, login netlife o ID.
  // Al escribir, reemplaza el explorador de años por la lista de coincidencias.
  const [busqueda, setBusqueda] = useState("");
  const qBusqueda = normalizarEstado(busqueda);
  const resultadosBusqueda = useMemo(() => {
    if (!qBusqueda) return null;
    return rows.filter((r) =>
      [
        r.nombre_cliente_completo,
        r.numero_identificacion,
        r.codigo_asesor,
        r.login_netlife,
        r.id_bitrix,
        String(r.id),
      ].some((c) => normalizarEstado(c).includes(qBusqueda))
    );
  }, [rows, qBusqueda]);

  const anioSel = nav.anio ? anios.find((a) => a.anio === nav.anio) : null;
  const mesSel = anioSel && nav.mes ? anioSel.meses.find((m) => m.mes === nav.mes) : null;

  const nivel = mesSel ? "dias" : anioSel ? "meses" : "anios";

  const miga = [
    { texto: "Años", accion: () => navegar.aAnios(), activo: nivel === "anios" },
    ...(anioSel ? [{ texto: anioSel.anio, accion: () => navegar.aMeses(anioSel.anio), activo: nivel === "meses" }] : []),
    ...(mesSel ? [{ texto: MESES_ES[Number(mesSel.mes) - 1], accion: () => navegar.aDias(anioSel.anio, mesSel.mes), activo: nivel === "dias" }] : []),
  ];

  const total = rows.length;

  return (
    <div style={{ padding: 18, background: "#f3f4f6", minHeight: "100vh", color: "#0f172a" }}>
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 12px 40px rgba(15,23,42,.08)", overflow: "hidden" }}>
        <div style={{ padding: 18, borderBottom: "1px solid #e5e7eb", background: "linear-gradient(135deg,#f8fafc,#eef2ff)" }}>
          <button
            onClick={onVolver}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10, background: "#fff", border: "1px solid #dbe4f0", borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 800, color: "#4f46e5", cursor: "pointer" }}
          >
            ← Volver a Backoffice
          </button>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".18em", color, textTransform: "uppercase" }}>
            {migaModulo}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: "#111827" }}>{tituloModulo}</h2>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {onCambiarEmpresa && <FiltroEmpresa valor={empresa} onCambiar={onCambiarEmpresa} />}
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar cliente, CI, asesor, login..."
                style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #dbe4f0", fontSize: 13, outline: "none", minWidth: 240 }}
              />
              <button
                onClick={() => navegar.aTodos()}
                style={{ padding: "9px 16px", borderRadius: 10, border: `1px solid ${borde}`, background: fondo, color, fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}
              >
                Ver todos ({total})
              </button>
              {onRecargar && (
                <button
                  onClick={onRecargar}
                  style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
                >
                  Refrescar
                </button>
              )}
            </div>
          </div>

          {/* Miga de pan: Años › 2026 › Enero */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 12, flexWrap: "wrap" }}>
            {miga.map((p, i) => (
              <span key={p.texto} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                {i > 0 && <span style={{ color: "#cbd5e1", fontSize: 13 }}>›</span>}
                <button
                  onClick={p.accion}
                  disabled={p.activo}
                  style={{
                    background: p.activo ? fondo : "transparent",
                    border: `1px solid ${p.activo ? borde : "transparent"}`,
                    borderRadius: 8, padding: "4px 11px", fontSize: 12.5,
                    fontWeight: 800, color: p.activo ? color : "#64748b",
                    cursor: p.activo ? "default" : "pointer",
                  }}
                >
                  {p.texto}
                </button>
              </span>
            ))}
          </div>
        </div>

        <div style={{ padding: 22 }}>
          {cargando && <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>Cargando registros…</p>}

          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>
              {error}
            </div>
          )}

          {/* ── RESULTADOS DE BÚSQUEDA ──────────────────────────────────────
              Reemplaza el explorador de años mientras haya un término escrito.
              Busca en TODOS los registros cargados, sin importar la fecha. */}
          {!cargando && !error && resultadosBusqueda !== null && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: "#475569" }}>
                  {resultadosBusqueda.length} resultado{resultadosBusqueda.length === 1 ? "" : "s"} para «{busqueda}»
                </span>
                <button
                  onClick={() => setBusqueda("")}
                  style={{ background: "transparent", border: "none", color, fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}
                >
                  ✕ Limpiar búsqueda
                </button>
              </div>

              {resultadosBusqueda.length === 0 ? (
                <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>Ningún registro coincide con «{busqueda}».</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {resultadosBusqueda.slice(0, 200).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onAbrirRegistro && onAbrirRegistro(r.id)}
                      disabled={!onAbrirRegistro}
                      style={{
                        textAlign: "left",
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
                        flexWrap: "wrap",
                        background: "#fff", border: `1px solid ${borde}`, borderRadius: 10,
                        padding: "10px 14px", cursor: onAbrirRegistro ? "pointer" : "default",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 200 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 800, color: "#0f172a" }}>
                          {r.nombre_cliente_completo || "(sin nombre)"} <span style={{ color: "#94a3b8", fontWeight: 700 }}>· #{r.id}</span>
                        </span>
                        <span style={{ fontSize: 11.5, color: "#64748b" }}>
                          CI: {r.numero_identificacion || "—"} · Asesor: {r.codigo_asesor || "—"} · Login: {r.login_netlife || "—"}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 800, color, background: fondo, border: `1px solid ${borde}`, borderRadius: 999, padding: "4px 10px" }}>
                        {r.netlife_estatus_real || r.estatus_regularizacion || "—"}
                      </span>
                    </button>
                  ))}
                  {resultadosBusqueda.length > 200 && (
                    <p style={{ fontSize: 11.5, color: "#94a3b8", margin: "4px 0 0" }}>
                      Mostrando los primeros 200 de {resultadosBusqueda.length} resultados. Afina la búsqueda para acotar.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {!cargando && !error && resultadosBusqueda === null && anios.length === 0 && (
            <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>Todavía no hay registros con fecha para agrupar.</p>
          )}

          {!cargando && !error && resultadosBusqueda === null && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: nivel === "anios" ? "flex-start" : "stretch" }}>
              {nivel === "anios" && anios.map((a) => (
                <BotonNivel
                  key={a.anio} titulo={a.anio} cantidad={a.cantidad}
                  color={color} fondo={fondo} borde={borde}
                  onClick={() => navegar.aMeses(a.anio)}
                  ancho={200}
                />
              ))}

              {nivel === "meses" && anioSel.meses.map((m) => (
                <BotonNivel
                  key={m.mes}
                  titulo={MESES_ES[Number(m.mes) - 1]}
                  cantidad={m.cantidad}
                  etapas={m.etapas}
                  color={color}
                  fondo={fondo}
                  borde={borde}
                  onClick={() => navegar.aDias(anioSel.anio, m.mes)}
                  ancho={520}
                  mostrarEtapas={true}
                />
              ))}

              {nivel === "dias" && mesSel.dias.map((d) => (
                <BotonNivel
                  key={d.iso}
                  titulo={etiquetaDia(d.iso)}
                  cantidad={d.cantidad}
                  etapas={d.etapas}
                  color={color}
                  fondo={fondo}
                  borde={borde}
                  ancho={520}
                  mostrarEtapas={true}
                  onClick={() =>
                    navegar.aDia(
                      anioSel.anio,
                      mesSel.mes,
                      d.iso
                    )
                  }
                />
              ))}
            </div>
          )}

          {!cargando && !error && nivel === "anios" && sinFecha.length > 0 && (
            <div style={{ marginTop: 18, padding: "10px 14px", borderRadius: 10, background: "#fffbeb", border: "1px solid #fde68a", fontSize: 12.5, color: "#92400e", fontWeight: 700 }}>
              ⚠ {sinFecha.length} registro{sinFecha.length > 1 ? "s" : ""} sin fecha de registro válida. No aparece{sinFecha.length > 1 ? "n" : ""} en ningún año — usa «Ver todos» para encontrarlo{sinFecha.length > 1 ? "s" : ""}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Carga compartida de registros para el explorador y el tablero. */
function useRegistrosBackoffice(limite = 1000, empresa = "TODOS") {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const token = localStorage.getItem("token");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: String(limite) });
      if (empresa && empresa !== "TODOS") qs.set("empresa", empresa);
      const r = await fetch(`${API}/api/backoffice?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "No se pudieron cargar los registros");
      setRows(j.data || []);
      setTotal(j.total ?? (j.data || []).length);
    } catch (e) {
      setError(e.message || "Error de conexión");
    } finally {
      setCargando(false);
    }
  }, [token, limite, empresa]);

  useEffect(() => { cargar(); }, [cargar]);

  return { rows, total, cargando, error, recargar: cargar };
}


// ═══════════════════════════════════════════════════════════════════════════
// SUBMÓDULO: WELCOME
// ═══════════════════════════════════════════════════════════════════════════
// Solo entran registros con `netlife_estatus_real = ACTIVO`.
// Se ordenan por `fecha_activacion_netlife` de la más antigua a la más reciente,
// para dar prioridad a las activaciones que llevan más tiempo esperando.
// `novedades_atc` funciona como discriminador:
//   vacío              → SIN NOTIFICAR
//   "NOTIFICADO"       → NOTIFICADOS
const BLOQUES_WELCOME = [
  { id: "SIN_NOTIFICAR", titulo: "Sin notificar", color: "#b45309", fondo: "#fffbeb", borde: "#fcd34d", valorBD: "" },
  { id: "PENDIENTES", titulo: "Pendiente", color: "#1d4ed8", fondo: "#eff6ff", borde: "#93c5fd", valorBD: "PENDIENTE" },
  { id: "NOTIFICADOS", titulo: "Notificados", color: "#047857", fondo: "#f0fdf4", borde: "#86efac", valorBD: "NOTIFICADO" },
];

function estadoWelcome(row) {
  const v = normalizarEstado(row?.novedades_atc);
  if (v === "PENDIENTE") return "PENDIENTES";
  return v === "NOTIFICADO" ? "NOTIFICADOS" : "SIN_NOTIFICAR";
}

function ordenarWelcome(rows) {
  return [...rows].sort((a, b) => {
    const fa = String(a?.fecha_activacion_netlife || "");
    const fb = String(b?.fecha_activacion_netlife || "");

    // Los que sí tienen fecha siempre van primero; dentro de ellos,
    // la fecha más antigua tiene prioridad.
    if (fa && fb && fa !== fb) return fa < fb ? -1 : 1;
    if (fa && !fb) return -1;
    if (!fa && fb) return 1;

    // Desempate estable por ID.
    return (Number(a?.id) || 0) - (Number(b?.id) || 0);
  });
}

function TarjetaWelcome({ row, onAbrir, onArrastrar, arrastrando, moviendo }) {
  const estaMoviendose = moviendo === row.id;

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!estaMoviendose}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(row.id));
        onArrastrar(row.id);
      }}
      onDragEnd={() => {
        onArrastrar(null);
      }}
      onClick={() => onAbrir?.(row.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAbrir?.(row.id);
        }
      }}
      title="Clic para abrir el detalle · arrastra para cambiar de bloque"
      style={{
        width: "100%",
        boxSizing: "border-box",
        textAlign: "left",
        background: arrastrando === row.id ? "#f8fafc" : "#fff",
        border: `1px solid ${arrastrando === row.id ? "#10b981" : "#e5e7eb"}`,
        borderRadius: 12,
        padding: 13,
        cursor: estaMoviendose ? "wait" : "grab",
        opacity: estaMoviendose ? 0.6 : 1,
        boxShadow: "0 2px 8px rgba(15,23,42,.05)",
        display: "flex",
        flexDirection: "column",
        gap: 7,
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 900, color: "#0f172a", lineHeight: 1.3 }}>
          {row.nombre_cliente_completo || "Sin nombre"}
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", flex: "none" }}>
          #{row.id}
        </span>
      </div>

      <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.6 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>
          📅 Activación: {row.fecha_activacion_netlife ? String(row.fecha_activacion_netlife).slice(0, 10) : "Sin fecha"}
        </div>
        <div>CI {row.numero_identificacion || "—"}</div>
        {row.netlife_login && <div>Login: {row.netlife_login}</div>}
        {row.codigo_asesor && <div>Asesor: {row.codigo_asesor}</div>}
      </div>
    </div>
  );
}

function BloqueWelcome({
  bloque, rows, onAbrir, onMarcarNotificado,
  onArrastrar, onSoltar, arrastrando, sobreBloque, onSobreBloque, moviendo,
}) {
  const activo = sobreBloque === bloque.id;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (sobreBloque !== bloque.id) onSobreBloque?.(bloque.id);
      }}
      onDragLeave={() => {
        onSobreBloque?.((b) => (b === bloque.id ? null : b));
      }}
      onDrop={(e) => {
        e.preventDefault();
        onSoltar(bloque.id, e);
      }}
      style={{
        background: activo ? bloque.fondo : "#fafbfc",
        border: `2px ${activo ? "dashed" : "solid"} ${activo ? bloque.color : "#e5e7eb"}`,
        borderRadius: 14,
        padding: 14,
        minHeight: 360,
        transition: "background .15s, border-color .15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
        <span style={{ width: 4, height: 18, borderRadius: 4, background: bloque.color, flex: "none" }} />
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: bloque.color, textTransform: "uppercase", letterSpacing: ".04em" }}>
          {bloque.titulo}
        </h3>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11.5,
            fontWeight: 800,
            color: bloque.color,
            background: bloque.fondo,
            border: `1px solid ${bloque.borde}`,
            borderRadius: 999,
            padding: "2px 10px",
          }}
        >
          {rows.length}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.length === 0 ? (
          <div
            style={{
              padding: "30px 12px",
              textAlign: "center",
              fontSize: 12,
              color: "#94a3b8",
              border: "1px dashed #e2e8f0",
              borderRadius: 10,
            }}
          >
            No hay registros en este bloque.
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.id} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <TarjetaWelcome
                row={row}
                onAbrir={onAbrir}
                onArrastrar={onArrastrar}
                arrastrando={arrastrando}
                moviendo={moviendo}
              />
              {bloque.id === "SIN_NOTIFICAR" && (
                <button
                  type="button"
                  onClick={() => onMarcarNotificado(row.id)}
                  style={{
                    alignSelf: "stretch",
                    padding: "8px 10px",
                    borderRadius: 9,
                    border: "1px solid #bbf7d0",
                    background: "#f0fdf4",
                    color: "#166534",
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  ✓ Marcar como notificado
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TableroWelcome({ onVolver, onAbrirRegistro, empresa, onCambiarEmpresa }) {
  const { rows: todas, cargando, error, recargar } = useRegistrosBackoffice(1000, empresa);
  const [rows, setRows] = useState([]);
  const [detalleId, setDetalleId] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [aviso, setAviso] = useState(null);
  const [arrastrando, setArrastrando] = useState(null);
  const [sobreBloque, setSobreBloque] = useState(null);
  const [moviendo, setMoviendo] = useState(null);
  const token = localStorage.getItem("token");

  useEffect(() => {
    // Welcome solo trabaja con activaciones que ya están ACTIVAS.
    const activas = (todas || []).filter(
      (r) => normalizarEstado(r?.netlife_estatus_real) === "ACTIVO"
    );
    setRows(ordenarWelcome(activas));
  }, [todas]);

  const filtradas = (() => {
    const q = normalizarEstado(busqueda);
    if (!q) return rows;

    return rows.filter((r) =>
      [
        r.nombre_cliente_completo,
        r.numero_identificacion,
        r.codigo_asesor,
        r.id_bitrix,
        r.netlife_login,
        String(r.id),
      ].some((c) => normalizarEstado(c).includes(q))
    );
  })();

  const porBloque = { SIN_NOTIFICAR: [], PENDIENTES: [], NOTIFICADOS: [] };
  for (const row of filtradas) {
    porBloque[estadoWelcome(row)].push(row);
  }

  const soltarWelcome = async (bloqueDestino, e) => {
    e.preventDefault();
    setSobreBloque(null);

    const idStr = e.dataTransfer.getData("text/plain");

    setArrastrando(null);
    if (!idStr) {
      setAviso("❌ No se pudo identificar el registro arrastrado.");
      return;
    }

    // Comparación como string: evita el mismatch number vs string
    // que ocurre si `id` en la BD es BIGINT (Postgres lo devuelve como string).
    const row = rows.find((r) => String(r.id) === idStr);
    if (!row) return;

    const id = row.id; // usamos el id tal como viene en el row (string o number)

    const bloqueActual = estadoWelcome(row);
    if (bloqueActual === bloqueDestino) return;

    const destino = BLOQUES_WELCOME.find((b) => b.id === bloqueDestino);
    if (!destino) return;

    const valorPrevio = row.novedades_atc ?? "";

    setRows((prev) =>
      prev.map((r) => (String(r.id) === idStr ? { ...r, novedades_atc: destino.valorBD } : r))
    );
    setMoviendo(id);
    setAviso(null);

    try {
      const r = await fetch(`${API}/api/backoffice/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ novedades_atc: destino.valorBD }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) {
        throw new Error(j.error || `No se pudo guardar (HTTP ${r.status})`);
      }

      await recargar();
      const correo = j.correo_bienvenida;
      setAviso(
        correo?.enviado === false
          ? `⚠️ #${id} movido a «${destino.titulo}», pero el correo no pudo enviarse.`
          : correo?.enviado
            ? `✅ #${id} movido a «${destino.titulo}» y correo de bienvenida enviado${correo.cliente ? ' al cliente con copia a Backoffice' : ' solo a Backoffice (cliente sin correo válido)'}.`
            : `✅ #${id} movido a «${destino.titulo}».`
      );
    } catch (e) {
      setRows((prev) =>
        prev.map((r) => (String(r.id) === idStr ? { ...r, novedades_atc: valorPrevio } : r))
      );
      setAviso(`❌ No se pudo mover #${id}: ${e.message}. La tarjeta volvió a su bloque.`);
    } finally {
      setMoviendo(null);
    }
  };

  const marcarNotificado = async (id) => {
    setAviso(null);

    // Actualización optimista: el registro pasa inmediatamente al bloque
    // "Notificados"; si el servidor falla, vuelve a "Sin notificar".
    const anterior = rows;
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, novedades_atc: "NOTIFICADO" } : r))
    );

    try {
      const r = await fetch(`${API}/api/backoffice/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ novedades_atc: "NOTIFICADO" }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) {
        throw new Error(j.error || `No se pudo guardar (HTTP ${r.status})`);
      }

      await recargar();
      const correo = j.correo_bienvenida;
      setAviso(
        correo?.enviado === false
          ? `⚠️ #${id} marcado como NOTIFICADO, pero el correo no pudo enviarse.`
          : correo?.enviado
            ? `✅ #${id} marcado como NOTIFICADO y correo de bienvenida enviado${correo.cliente ? ' al cliente con copia a Backoffice' : ' solo a Backoffice (cliente sin correo válido)'}.`
            : `✅ #${id} marcado como NOTIFICADO.`
      );
    } catch (e) {
      setRows(anterior);
      setAviso(`❌ No se pudo marcar #${id}: ${e.message}`);
    }
  };

  const total = filtradas.length;
  const sinNotificar = porBloque.SIN_NOTIFICAR.length;
  const pendientes = porBloque.PENDIENTES.length;
  const notificados = porBloque.NOTIFICADOS.length;

  return (
    <div style={{ padding: 18, background: "#f3f4f6", minHeight: "100vh", color: "#0f172a" }}>
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 12px 40px rgba(15,23,42,.08)", overflow: "hidden" }}>
        <div style={{ padding: 18, borderBottom: "1px solid #e5e7eb", background: "linear-gradient(135deg,#f8fafc,#ecfdf5)" }}>
          <button
            onClick={onVolver}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10, background: "#fff", border: "1px solid #dbe4f0", borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 800, color: "#047857", cursor: "pointer" }}
          >
            ← Volver a Backoffice
          </button>

          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".18em", color: "#059669", textTransform: "uppercase" }}>
            Backoffice · Welcome
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: "#111827" }}>
                Welcome
              </h2>
              <p style={{ margin: "7px 0 0", fontSize: 12.5, color: "#64748b" }}>
                Solo activaciones con <b>Status NetLife = ACTIVO</b>, ordenadas de la más antigua a la más reciente.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {onCambiarEmpresa && <FiltroEmpresa valor={empresa} onCambiar={onCambiarEmpresa} />}
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar cliente, CI, login, asesor…"
                style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #dbe4f0", fontSize: 13, outline: "none", minWidth: 250 }}
              />
              <BotonDescargaExcel
                onClick={() => exportarAExcel(filtradas, `Reporte_Welcome_${empresa || "Todos"}`)}
                color="#047857" fondo="#f0fdf4" borde="#a7f3d0"
              />
              <button
                onClick={recargar}
                style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #a7f3d0", background: "#ecfdf5", color: "#047857", fontWeight: 700, cursor: "pointer" }}
              >
                Refrescar
              </button>
            </div>
          </div>
        </div>

        {aviso && (
          <div style={{ margin: "14px 18px 0", padding: "10px 14px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 12.5, fontWeight: 700, color: "#334155" }}>
            {aviso}
          </div>
        )}

        {error && (
          <div style={{ margin: "14px 18px 0", padding: "10px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>
            {error}
          </div>
        )}

        {/* Resumen de los estados de Welcome */}
        <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
          <div style={{ padding: 18, borderRadius: 14, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#047857", textTransform: "uppercase", letterSpacing: ".08em" }}>
              Registros totales
            </div>
            <div style={{ marginTop: 8, fontSize: 32, lineHeight: 1, fontWeight: 900, color: "#065f46" }}>
              {total}
            </div>
            <div style={{ marginTop: 7, fontSize: 11.5, color: "#64748b" }}>
              Activaciones con Status NetLife activo
            </div>
          </div>

          <div style={{ padding: 18, borderRadius: 14, background: "#fffbeb", border: "1px solid #fde68a" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#b45309", textTransform: "uppercase", letterSpacing: ".08em" }}>
              Sin notificar
            </div>
            <div style={{ marginTop: 8, fontSize: 32, lineHeight: 1, fontWeight: 900, color: "#92400e" }}>
              {sinNotificar}
            </div>
            <div style={{ marginTop: 7, fontSize: 11.5, color: "#64748b" }}>
              Novedades ATC vacío
            </div>
          </div>

          <div style={{ padding: 18, borderRadius: 14, background: "#eff6ff", border: "1px solid #93c5fd" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: ".08em" }}>
              Pendientes
            </div>
            <div style={{ marginTop: 8, fontSize: 32, lineHeight: 1, fontWeight: 900, color: "#1e40af" }}>
              {pendientes}
            </div>
            <div style={{ marginTop: 7, fontSize: 11.5, color: "#64748b" }}>
              Novedades ATC = PENDIENTE
            </div>
          </div>

          <div style={{ padding: 18, borderRadius: 14, background: "#f0fdf4", border: "1px solid #86efac" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#047857", textTransform: "uppercase", letterSpacing: ".08em" }}>
              Notificados
            </div>
            <div style={{ marginTop: 8, fontSize: 32, lineHeight: 1, fontWeight: 900, color: "#166534" }}>
              {notificados}
            </div>
            <div style={{ marginTop: 7, fontSize: 11.5, color: "#64748b" }}>
              Novedades ATC = NOTIFICADO
            </div>
          </div>
        </div>

        <div style={{ padding: "0 18px 18px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 }}>
            {BLOQUES_WELCOME.map((bloque) => {
              const activo = sobreBloque === bloque.id;
              const listaBloque = porBloque[bloque.id];

              return (
                <div
                  key={bloque.id}
                  onDragOver={(e) => { e.preventDefault(); setSobreBloque(bloque.id); }}
                  onDragLeave={() => setSobreBloque((b) => (b === bloque.id ? null : b))}
                  onDrop={(e) => soltarWelcome(bloque.id, e)}
                  style={{
                    background: activo ? bloque.fondo : "#fafbfc",
                    border: `2px ${activo ? "dashed" : "solid"} ${activo ? bloque.color : "#e5e7eb"}`,
                    borderRadius: 14,
                    padding: 14,
                    minHeight: 360,
                    transition: "background .15s, border-color .15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
                    <span style={{ width: 4, height: 18, borderRadius: 4, background: bloque.color, flex: "none" }} />
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: bloque.color, textTransform: "uppercase", letterSpacing: ".04em" }}>
                      {bloque.titulo}
                    </h3>
                    <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 800, color: bloque.color, background: bloque.fondo, border: `1px solid ${bloque.borde}`, borderRadius: 999, padding: "2px 10px" }}>
                      {listaBloque.length}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {listaBloque.length === 0 ? (
                      <div style={{ padding: "30px 12px", textAlign: "center", fontSize: 12, color: "#94a3b8", border: "1px dashed #e2e8f0", borderRadius: 10 }}>
                        {arrastrando ? "Suelta aquí" : "No hay registros en este bloque."}
                      </div>
                    ) : (
                      listaBloque.map((row) => (
                        <div key={row.id} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          <TarjetaWelcome
                            row={row}
                            onAbrir={onAbrirRegistro || ((id) => setDetalleId(id))}
                            onArrastrar={setArrastrando}
                            arrastrando={arrastrando}
                            moviendo={moviendo}
                          />
                          {bloque.id === "SIN_NOTIFICAR" && (
                            <button
                              type="button"
                              onClick={() => marcarNotificado(row.id)}
                              style={{
                                alignSelf: "stretch", padding: "8px 10px", borderRadius: 9,
                                border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#166534",
                                fontSize: 11, fontWeight: 800, cursor: "pointer",
                              }}
                            >
                              ✓ Marcar como notificado
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 11.5, color: "#64748b" }}>
            <b>Prioridad:</b> los registros de Welcome están ordenados por <b>Fecha de activación</b>, del más antiguo al más reciente.
            <br />
            <b>Drag &amp; drop:</b> arrastra cualquier tarjeta entre «Sin notificar», «Pendiente» y «Notificados». El cambio actualiza <b>NOVEDADES</b> automáticamente; también puedes cambiarlo desde el select del detalle.
          </div>
        </div>
        {detalleId && (
          <PanelRegistros
            soloDetalle
            idInicial={detalleId}
            etiquetaContexto="Detalle de Welcome"
            onVolver={() => setDetalleId(null)}
          />
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// SUBMÓDULO: AGENDAMIENTOS  ·  Año → Mes → Calendario → detalle del día
// ═══════════════════════════════════════════════════════════════════════════
// Se agrupa por `fecha_agenda` (cuándo se le prometió al cliente la
// instalación), no por fecha de registro. Año y mes se navegan con la misma
// lista de botones que ya usa Registros; el último nivel es un calendario de
// verdad — cada día muestra su cantidad entre paréntesis — para que de un
// vistazo se vea la carga de trabajo de la semana.

const DIAS_CORTOS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Cantidad de días que tiene un mes (anio: "2026", mes: "08" o 8). */
function diasEnMes(anio, mes) {
  return new Date(Number(anio), Number(mes), 0).getDate();
}

/** Día de la semana (0=domingo) del día 1 de ese mes, calculado a mediodía
 *  para que ningún desfase horario lo mueva al día anterior/siguiente. */
function primerDiaSemanaMes(anio, mes) {
  const mesStr = String(mes).padStart(2, "0");
  return new Date(`${anio}-${mesStr}-01T12:00:00`).getDay();
}

function CalendarioMes({ anio, mes, mapaDias, color, fondo, borde, onDiaClick }) {
  const totalDias = diasEnMes(anio, mes);
  const offset = primerDiaSemanaMes(anio, mes);
  const mesStr = String(mes).padStart(2, "0");
  const hoyIso = fechaCalendarioEC(new Date());

  const celdas = [];
  for (let i = 0; i < offset; i++) celdas.push(null);
  for (let d = 1; d <= totalDias; d++) celdas.push(d);

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 18, boxShadow: "0 4px 20px rgba(15,23,42,0.03)" }}>
      {/* Cabecera de días de la semana */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10, marginBottom: 10 }}>
        {DIAS_CORTOS_ES.map((d, idx) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              fontSize: 12,
              fontWeight: 800,
              color: idx === 0 || idx === 6 ? "#ea580c" : "#64748b",
              textTransform: "uppercase",
              letterSpacing: ".06em",
              padding: "6px 0",
              background: "#f8fafc",
              borderRadius: 8,
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Cuadrícula de Días */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
        {celdas.map((d, i) => {
          if (d === null) {
            return (
              <div
                key={`vacio-${i}`}
                style={{
                  minHeight: 82,
                  background: "#f8fafc",
                  borderRadius: 12,
                  border: "1px dashed #e2e8f0",
                  opacity: 0.45,
                }}
              />
            );
          }

          const iso = `${anio}-${mesStr}-${String(d).padStart(2, "0")}`;
          const cantidad = mapaDias.get(iso) || 0;
          const esHoy = iso === hoyIso;
          const tieneAgendamientos = cantidad > 0;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => tieneAgendamientos && onDiaClick(iso)}
              disabled={!tieneAgendamientos}
              style={{
                minHeight: 84,
                borderRadius: 14,
                border: esHoy
                  ? `2px solid ${color}`
                  : tieneAgendamientos
                    ? `1px solid ${borde}`
                    : "1px solid #edf2f7",
                background: tieneAgendamientos ? "#ffffff" : "#fbfcfe",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "space-between",
                padding: "10px 12px",
                cursor: tieneAgendamientos ? "pointer" : "default",
                transition: "all .18s ease-out",
                boxShadow: tieneAgendamientos
                  ? "0 4px 14px rgba(234, 88, 12, 0.08)"
                  : "none",
                position: "relative",
              }}
              onMouseEnter={(e) => {
                if (tieneAgendamientos) {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.borderColor = color;
                }
              }}
              onMouseLeave={(e) => {
                if (tieneAgendamientos) {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.borderColor = borde;
                }
              }}
            >
              {/* Encabezado de la celda: Número grande + Indicador Hoy */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 900,
                    lineHeight: 1,
                    color: esHoy ? color : tieneAgendamientos ? "#0f172a" : "#94a3b8",
                  }}
                >
                  {d}
                </span>

                {esHoy && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 900,
                      color: "#fff",
                      background: color,
                      borderRadius: 999,
                      padding: "2px 7px",
                      textTransform: "uppercase",
                      letterSpacing: ".04em",
                    }}
                  >
                    Hoy
                  </span>
                )}
              </div>

              {/* Conteo / Citas agendadas */}
              {tieneAgendamientos ? (
                <div
                  style={{
                    width: "100%",
                    marginTop: 6,
                    padding: "5px 8px",
                    background: fondo,
                    borderRadius: 8,
                    border: `1px solid ${borde}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#9a3412" }}>
                    Agendamientos
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 900,
                      color,
                    }}
                  >
                    {cantidad}
                  </span>
                </div>
              ) : (
                <span style={{ fontSize: 11, color: "#cbd5e1", fontWeight: 600, marginTop: "auto" }}>
                  —
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Modal que lista los agendamientos de un día. Cada fila abre el detalle
 *  completo del registro (reutilizando PanelRegistros). */
function ModalDiaAgendamientos({ iso, registros, onCerrar, onAbrirRegistro, color }) {
  const registrosOrdenados = [...registros].sort((a, b) => {
    const fa = String(a.fecha_ingreso_telcos || "");
    const fb = String(b.fecha_ingreso_telcos || "");
    if (fa && fb && fa !== fb) return fa < fb ? -1 : 1;
    if (fa && !fb) return -1;
    if (!fa && fb) return 1;
    return 0;
  });

  return (

    <div
      onClick={onCerrar}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.72)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1200,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 18,
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
          maxWidth: 620,
          width: "94%",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color, textTransform: "uppercase" }}>
              Agenda de Instalación
            </div>
            <h3 style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, color: "#0f172a" }}>
              {etiquetaDia(iso)}
            </h3>
          </div>
          <button
            onClick={onCerrar}
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "#fff",
              border: "1px solid #e2e8f0",
              fontSize: 14,
              cursor: "pointer",
              color: "#64748b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 18, overflow: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {registros.length === 0 && (
            <p style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: "20px 0" }}>
              No hay agendamientos para este día.
            </p>
          )}
          {registrosOrdenados.map((row) => (

            <button
              key={row.id}
              type="button"
              onClick={() => onAbrirRegistro(row.id)}
              style={{
                textAlign: "left",
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: "14px 16px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                boxShadow: "0 2px 8px rgba(15,23,42,.04)",
                transition: "border-color .15s, transform .15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = color;
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#e5e7eb";
                e.currentTarget.style.transform = "none";
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: "#0f172a" }}>
                  {row.nombre_cliente_completo || "Sin nombre"}
                </span>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#ea580c", background: "#ffedd5", border: "1px solid #fed7aa", borderRadius: 999, padding: "2px 8px" }}>
                  #{row.id}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#475569", flexWrap: "wrap", marginTop: 2 }}>
                <span><b>CI:</b> {row.numero_identificacion || "—"}</span>
                {row.fecha_ingreso_telcos && (
                  <span style={{ color: "#0891b2", fontWeight: 700 }}>
                    📥 Telcos: {String(row.fecha_ingreso_telcos).slice(0, 10)}
                  </span>
                )}
                {row.turno_agendado && (

                  <span style={{ background: "#f1f5f9", padding: "2px 8px", borderRadius: 6, fontWeight: 800, color: "#334155" }}>
                    🕒 Turno: {row.turno_agendado}
                  </span>
                )}
                {row.codigo_asesor && (
                  <span style={{ color: "#64748b" }}>Asesor: {row.codigo_asesor}</span>
                )}
              </div>

              {row.direccion_calles && (
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  📍 {row.direccion_calles}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TableroAgendamientos({ onVolver, nav, navegar, empresa, onCambiarEmpresa }) {
  const { rows: todas, cargando, error, recargar } = useRegistrosBackoffice(1000, empresa);
  const [diaModal, setDiaModal] = useState(null);
  const [detalleId, setDetalleId] = useState(null);

  const color = "#ea580c", fondo = "#fff7ed", borde = "#fed7aa";

  // ── FILTRO ESTRICTO: Solo registros con estado "ASIGNADO" ──────────────────
  const rows = useMemo(() => {
    return (todas || []).filter((r) => {
      const v2 = normalizarEstado(r?.netlife_estatus_real);
      const v1 = normalizarEstado(r?.estatus_envio);
      const estado = v2 || v1;
      return estado.includes("ASIGN");
    });
  }, [todas]);

  const { anios, sinFecha } = useMemo(() => agruparPorFecha(rows, "fecha_agenda"), [rows]);

  // ── BÚSQUEDA GENERAL (cliente, CI, login, asesor) ───────────────────────
  // Mismo criterio que en Registros y Validación/Regularización: busca sobre
  // TODOS los registros cargados (sin importar año/mes/día) y, mientras haya
  // un término escrito, reemplaza el explorador años/meses/calendario por la
  // lista de coincidencias.
  const [busqueda, setBusqueda] = useState("");
  const qBusqueda = normalizarEstado(busqueda);
  const resultadosBusqueda = useMemo(() => {
    if (!qBusqueda) return null;
    return rows.filter((r) =>
      [
        r.nombre_cliente_completo,
        r.numero_identificacion,
        r.codigo_asesor,
        r.login_netlife,
        r.id_bitrix,
        String(r.id),
      ].some((c) => normalizarEstado(c).includes(qBusqueda))
    );
  }, [rows, qBusqueda]);

  const anioSel = nav.anio ? anios.find((a) => a.anio === nav.anio) : null;
  const mesSel = anioSel && nav.mes ? anioSel.meses.find((m) => m.mes === nav.mes) : null;

  const mapaDias = useMemo(() => {
    if (!mesSel) return new Map();
    return new Map(mesSel.dias.map((d) => [d.iso, d.cantidad]));
  }, [mesSel]);

  const registrosDelDia = useMemo(() => {
    if (!diaModal) return [];
    return rows.filter((r) => fechaCalendarioEC(r.fecha_agenda) === diaModal);
  }, [diaModal, rows]);

  const nivel = mesSel ? "calendario" : anioSel ? "meses" : "anios";
  const total = useMemo(() => rows.filter((r) => fechaCalendarioEC(r.fecha_agenda)).length, [rows]);

  const miga = [
    { texto: "Años", accion: () => navegar.aAnios(), activo: nivel === "anios" },
    ...(anioSel ? [{ texto: anioSel.anio, accion: () => navegar.aMeses(anioSel.anio), activo: nivel === "meses" }] : []),
    ...(mesSel ? [{ texto: MESES_ES[Number(mesSel.mes) - 1], accion: () => { }, activo: nivel === "calendario" }] : []),
  ];

  return (
    <div style={{ padding: 18, background: "#f3f4f6", minHeight: "100vh", color: "#0f172a" }}>
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 12px 40px rgba(15,23,42,.08)", overflow: "hidden" }}>
        <div style={{ padding: 18, borderBottom: "1px solid #e5e7eb", background: "linear-gradient(135deg,#f8fafc,#fff7ed)" }}>
          <button
            onClick={onVolver}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10, background: "#fff", border: "1px solid #dbe4f0", borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 800, color, cursor: "pointer" }}
          >
            ← Volver a Backoffice
          </button>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".18em", color, textTransform: "uppercase" }}>
            Backoffice · Agendamientos
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: "#111827" }}>
                {mesSel ? `Agendamientos · ${MESES_ES[Number(mesSel.mes) - 1]} ${anioSel.anio}` : "Agendamientos"}
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#64748b" }}>
                Instalaciones con estado <b>ASIGNADO</b> organizadas por fecha de visita.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {onCambiarEmpresa && <FiltroEmpresa valor={empresa} onCambiar={onCambiarEmpresa} />}
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar cliente, CI, login, asesor..."
                style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #dbe4f0", fontSize: 13, outline: "none", minWidth: 240 }}
              />
              <div style={{ background: fondo, border: `1px solid ${borde}`, borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 800, color }}>
                {total} asignados
              </div>
              <BotonDescargaExcel
                onClick={() => exportarAExcel(rows, `Reporte_Agendamientos_${empresa || "Todos"}`)}
                color="#ea580c" fondo="#fff7ed" borde="#fed7aa"
              />
              <button
                onClick={recargar}
                style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
              >
                Refrescar
              </button>
            </div>
          </div>

          {/* Miga de Pan */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 12, flexWrap: "wrap" }}>
            {miga.map((p, i) => (
              <span key={p.texto} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                {i > 0 && <span style={{ color: "#cbd5e1", fontSize: 13 }}>›</span>}
                <button
                  onClick={p.accion}
                  disabled={p.activo}
                  style={{
                    background: p.activo ? fondo : "transparent",
                    border: `1px solid ${p.activo ? borde : "transparent"}`,
                    borderRadius: 8, padding: "4px 11px", fontSize: 12.5,
                    fontWeight: 800, color: p.activo ? color : "#64748b",
                    cursor: p.activo ? "default" : "pointer",
                  }}
                >
                  {p.texto}
                </button>
              </span>
            ))}
          </div>
        </div>

        <div style={{ padding: 20 }}>
          {cargando && <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>Cargando registros…</p>}

          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>
              {error}
            </div>
          )}

          {!cargando && !error && rows.length === 0 && (
            <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>No hay registros con estado ASIGNADO.</p>
          )}

          {!cargando && !error && nivel === "anios" && anios.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
              {anios.map((a) => (
                <BotonNivel
                  key={a.anio} titulo={a.anio} cantidad={a.cantidad}
                  color={color} fondo={fondo} borde={borde}
                  onClick={() => navegar.aMeses(a.anio)}
                  ancho={240}
                />
              ))}
            </div>
          )}

          {!cargando && !error && resultadosBusqueda === null && nivel === "meses" && anioSel && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
              {anioSel.meses.map((m) => (
                <BotonNivel
                  key={m.mes} titulo={MESES_ES[Number(m.mes) - 1]} cantidad={m.cantidad}
                  color={color} fondo={fondo} borde={borde}
                  onClick={() => navegar.aDias(anioSel.anio, m.mes)}
                  ancho={240}
                />
              ))}
            </div>
          )}

          {!cargando && !error && resultadosBusqueda === null && nivel === "calendario" && mesSel && (
            <CalendarioMes
              anio={anioSel.anio}
              mes={mesSel.mes}
              mapaDias={mapaDias}
              color={color} fondo={fondo} borde={borde}
              onDiaClick={(iso) => setDiaModal(iso)}
            />
          )}

          {!cargando && !error && resultadosBusqueda === null && nivel === "anios" && sinFecha.length > 0 && (
            <div style={{ marginTop: 18, padding: "10px 14px", borderRadius: 10, background: "#fffbeb", border: "1px solid #fde68a", fontSize: 12.5, color: "#92400e", fontWeight: 700 }}>
              ⚠ {sinFecha.length} registro{sinFecha.length > 1 ? "s" : ""} asignado{sinFecha.length > 1 ? "s" : ""} sin fecha de agenda válida.
            </div>
          )}
        </div>
      </div>

      {diaModal && (
        <ModalDiaAgendamientos
          iso={diaModal}
          registros={registrosDelDia}
          color={color}
          onCerrar={() => setDiaModal(null)}
          onAbrirRegistro={(id) => { setDiaModal(null); setDetalleId(id); }}
        />
      )}

      {detalleId && (
        <PanelRegistros
          soloDetalle
          idInicial={detalleId}
          etiquetaContexto="Detalle de Agendamiento"
          onVolver={() => setDetalleId(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBMÓDULO: PRESERVICIOS  ·  Cards de estado + tabla filtrada a la derecha
// ═══════════════════════════════════════════════════════════════════════════
const ESTADOS_PRESERVICIOS = [
  { id: "PRESERVICIO", titulo: "Preservicios", color: "#0891b2", fondo: "#ecfeff", borde: "#a5f3fc", match: (v) => v.includes("PRESERV") || v.includes("PRESE") },
  { id: "FACTIBLE", titulo: "Factible", color: "#7c3aed", fondo: "#ede9fe", borde: "#ddd6fe", match: (v) => v.includes("FACTIB") },
  { id: "REPLANIFICADO", titulo: "Replanificados", color: "#b45309", fondo: "#fffbeb", borde: "#fcd34d", match: (v) => v.includes("REPLANIFIC") },
];

/** Determina a qué estado pertenece basándose EXCLUSIVAMENTE en netlife_estatus_real */
function clasificarPreservicio(row) {
  const v = normalizarEstado(row?.netlife_estatus_real);
  if (!v) return null;
  for (const e of ESTADOS_PRESERVICIOS) {
    if (e.match(v)) return e.id;
  }
  return null;
}

function CardEstadoPreservicio({ estado, cantidad, activo, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left", width: "100%", cursor: "pointer",
        background: activo ? estado.color : "#fff",
        border: `1.5px solid ${activo ? estado.color : estado.borde}`,
        borderRadius: 14, padding: "14px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        boxShadow: activo ? `0 8px 20px ${estado.color}33` : "0 2px 8px rgba(15,23,42,.04)",
        transition: "all .15s",
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 900, color: activo ? "#fff" : "#0f172a" }}>
        {estado.titulo}
      </span>
      <span
        style={{
          fontSize: 13, fontWeight: 900, minWidth: 30, textAlign: "center",
          color: activo ? "#fff" : estado.color,
          background: activo ? "rgba(255,255,255,.22)" : estado.fondo,
          border: `1px solid ${activo ? "transparent" : estado.borde}`,
          borderRadius: 999, padding: "3px 10px",
        }}
      >
        {cantidad}
      </span>
    </button>
  );
}

/** Tabla de registros filtrados por estado, mismo estilo visual que la tabla
 *  de Registros (columnas fijas a la izquierda, scroll horizontal). */
const COLUMNAS_TABLA_PRESERVICIOS = [
  "nombre_cliente_completo",
  "numero_identificacion",
  "codigo_asesor",
  "id_bitrix",
  "distribuidor_autorizado",
  "netlife_login",
  "netlife_estatus_real",
  "fecha_ingreso_telcos",
  "dias_pendientes",
];

function TablaPreservicios({ rows, onAbrirRegistro }) {
  const headers = COLUMNAS_TABLA_PRESERVICIOS.map((key) => ({
    key,
    label:
      key === "nombre_cliente_completo"
        ? "CLIENTE"
        : key === "numero_identificacion"
          ? "IDENTIFICACIÓN"
          : key === "codigo_asesor"
            ? "ASESOR"
            : key === "id_bitrix"
              ? "ID BITRIX"
              : key === "distribuidor_autorizado"
                ? "DISTRIBUIDOR"
                : key === "netlife_login"
                  ? "LOGIN NETLIFE"
                  : key === "netlife_estatus_real"
                    ? "ESTATUS NETLIFE"
                    : key === "fecha_ingreso_telcos"
                      ? "INGRESO TELCOS"
                      : key === "dias_pendientes"
                        ? "DÍAS PENDIENTES"
                        : FIELD_LABELS[key] || key.replace(/_/g, " ").toUpperCase(),
  }));

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden", background: "#fff" }}>
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid #e5e7eb",
          background: "#f8fafc",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: "#64748b",
            fontWeight: 700,
          }}
        >
          {rows.length} registro{rows.length !== 1 ? "s" : ""}
        </span>

        <span
          style={{
            fontSize: 11,
            color: "#94a3b8",
          }}
        >
          Haz clic en un registro para ver el detalle
        </span>
      </div>
      <div style={{ overflow: "auto", maxHeight: 640 }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 3 }}>
            <tr style={{ background: "#f8fafc" }}>
              {headers.map((h, i) => (
                <th
                  key={h.key}
                  title={h.key}
                  style={{
                    textAlign: "left",
                    padding: "11px 12px",
                    borderBottom: "1px solid #e5e7eb",
                    fontWeight: 800,
                    color: "#475569",
                    whiteSpace: "nowrap",
                    background: "#f8fafc",
                    fontSize: 12.5,
                    letterSpacing: ".04em",
                  }}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={headers.length} style={{ padding: 28, textAlign: "center", color: "#94a3b8" }}>
                  Sin registros con este estado.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onAbrirRegistro(row.id)}
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#eff6ff")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
              >
                {headers.map((h, i) => (
                  <td
                    key={`${row.id}-${h.key}`}
                    title={valueForField(row, h.key)}
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid #f1f5f9",
                      whiteSpace: "nowrap",
                      maxWidth: h.key === "nombre_cliente_completo" ? 230 : 180,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      background: "#fff",
                      color: "#334155",
                      fontSize: 11.5,
                    }}
                  >
                    {h.key === "dias_pendientes"
                      ? (() => {
                        const dias = diasDesde(row.fecha_ingreso_telcos);

                        return (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "4px 9px",
                              borderRadius: 999,
                              background:
                                dias === 0
                                  ? "#ecfdf5"
                                  : "#fff7ed",
                              color:
                                dias === 0
                                  ? "#047857"
                                  : "#c2410c",
                              fontWeight: 900,
                              fontSize: 11,
                            }}
                          >
                            {dias} {dias === 1 ? "día" : "días"}
                          </span>
                        );
                      })()
                      : valueForField(row, h.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TableroPreservicios({ onVolver, empresa, onCambiarEmpresa }) {
  const { rows: todas, cargando, error, recargar } = useRegistrosBackoffice(1000, empresa);
  const [estadoActivo, setEstadoActivo] = useState("PRESERVICIO");
  const [detalleId, setDetalleId] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const color = "#0891b2";

  // Solo entran los registros que caen en alguno de los 3 estados definidos.
  const rowsClasificadas = useMemo(
    () => (todas || []).filter((r) => clasificarPreservicio(r) !== null),
    [todas]
  );

  const conteos = useMemo(() => {
    const acc = { PRESERVICIO: 0, FACTIBLE: 0, REPLANIFICADO: 0 };
    for (const r of rowsClasificadas) {
      const e = clasificarPreservicio(r);
      if (e) acc[e]++;
    }
    return acc;
  }, [rowsClasificadas]);

  // Filtro final: estado seleccionado + búsqueda + rango de fecha_registro_sistema
  const rowsFiltradas = useMemo(() => {
    const q = normalizarEstado(busqueda);
    return rowsClasificadas.filter((r) => {
      if (clasificarPreservicio(r) !== estadoActivo) return false;

      if (q) {
        const coincide = [
          r.nombre_cliente_completo, r.numero_identificacion, r.codigo_asesor,
          r.id_bitrix, r.netlife_login, String(r.id),
        ].some((c) => normalizarEstado(c).includes(q));
        if (!coincide) return false;
      }

      const iso = fechaCalendarioEC(r.fecha_registro_sistema);
      if (fechaDesde && (!iso || iso < fechaDesde)) return false;
      if (fechaHasta && (!iso || iso > fechaHasta)) return false;

      return true;
    });
  }, [rowsClasificadas, estadoActivo, busqueda, fechaDesde, fechaHasta]);

  const estadoObj = ESTADOS_PRESERVICIOS.find((e) => e.id === estadoActivo);

  return (
    <div style={{ padding: 18, background: "#f3f4f6", minHeight: "100vh", color: "#0f172a" }}>
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 12px 40px rgba(15,23,42,.08)", overflow: "hidden" }}>
        <div style={{ padding: 18, borderBottom: "1px solid #e5e7eb", background: "linear-gradient(135deg,#f8fafc,#ecfeff)" }}>
          <button
            onClick={onVolver}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10, background: "#fff", border: "1px solid #dbe4f0", borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 800, color, cursor: "pointer" }}
          >
            ← Volver a Backoffice
          </button>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".18em", color, textTransform: "uppercase" }}>
            Backoffice · Preservicios
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: "#111827" }}>Preservicios</h2>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {onCambiarEmpresa && <FiltroEmpresa valor={empresa} onCambiar={onCambiarEmpresa} />}
              <BotonDescargaExcel
                onClick={() => exportarAExcel(rowsFiltradas, `Reporte_Preservicios_${empresa || "Todos"}`)}
                color="#0891b2" fondo="#ecfeff" borde="#a5f3fc"
              />
              <button
                onClick={recargar}
                style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #a5f3fc", background: "#ecfeff", color, fontWeight: 700, cursor: "pointer" }}
              >
                Refrescar
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ margin: "14px 18px 0", padding: "10px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>
            {error}
          </div>
        )}

        <div style={{ padding: 18, display: "grid", gridTemplateColumns: "260px 1fr", gap: 18, alignItems: "start" }}>
          {/* ── IZQUIERDA: cards de estado, en columna ────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {cargando && <span style={{ fontSize: 12, color: "#94a3b8" }}>Cargando…</span>}
            {ESTADOS_PRESERVICIOS.map((e) => (
              <CardEstadoPreservicio
                key={e.id}
                estado={e}
                cantidad={conteos[e.id]}
                activo={estadoActivo === e.id}
                onClick={() => setEstadoActivo(e.id)}
              />
            ))}
          </div>

          {/* ── DERECHA: filtros + tabla ──────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: estadoObj?.color }}>
                {estadoObj?.titulo}
              </h3>
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar cliente, CI, login, asesor…"
                style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #dbe4f0", fontSize: 13, outline: "none", minWidth: 230 }}
              />
              <div style={estilosFiltro.campo}>
                <label style={estilosFiltro.label}>Fecha de registro</label>
                <div style={estilosFiltro.rango}>
                  <input
                    type="date" style={estilosFiltro.ctl}
                    value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)}
                  />
                  <span style={estilosFiltro.guion}>–</span>
                  <input
                    type="date" style={estilosFiltro.ctl}
                    value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)}
                  />
                </div>
              </div>
              {(fechaDesde || fechaHasta || busqueda) && (
                <button
                  onClick={() => { setFechaDesde(""); setFechaHasta(""); setBusqueda(""); }}
                  style={{ padding: "6px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 12, cursor: "pointer", alignSelf: "flex-end" }}
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            <TablaPreservicios rows={rowsFiltradas} onAbrirRegistro={(id) => setDetalleId(id)} />
          </div>
        </div>
      </div>

      {detalleId && (
        <PanelRegistros
          soloDetalle
          idInicial={detalleId}
          etiquetaContexto="Detalle de Preservicio"
          onVolver={() => setDetalleId(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBMÓDULO: VALIDACIÓN DE ESTADO
// ═══════════════════════════════════════════════════════════════════════════
function estadoNetlifeDe(row) {
  const v = normalizarEstado(row?.netlife_estatus_real);
  if (!v) return "SIN ESTADO";
  return ESTATUS_NETLIFE.find((estado) => normalizarEstado(estado) === v) || v;
}

function TableroValidacionEstado({ onVolver, empresa, onCambiarEmpresa }) {
  const { rows: todas, total, cargando, error, recargar } = useRegistrosBackoffice(1000, empresa);
  const [estadoActivo, setEstadoActivo] = useState("ACTIVO");
  const [detalleId, setDetalleId] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const conteos = useMemo(() => {
    const acc = Object.fromEntries(ESTATUS_NETLIFE.map((e) => [e, 0]));
    for (const row of todas || []) {
      const estado = estadoNetlifeDe(row);
      if (Object.prototype.hasOwnProperty.call(acc, estado)) acc[estado] += 1;
    }
    return acc;
  }, [todas]);

  const rowsFiltradas = useMemo(() => {
    const q = normalizarEstado(busqueda);

    return (todas || [])
      .filter((r) => estadoNetlifeDe(r) === estadoActivo)
      .filter((r) => {
        if (q) {
          const coincide = [
            r.nombre_cliente_completo,
            r.numero_identificacion,
            r.codigo_asesor,
            r.id_bitrix,
            r.netlife_login,
            r.supervisor,
            String(r.id),
          ].some((c) => normalizarEstado(c).includes(q));

          if (!coincide) return false;
        }

        const iso = fechaCalendarioEC(r.fecha_registro_sistema);

        if (fechaDesde && (!iso || iso < fechaDesde)) return false;
        if (fechaHasta && (!iso || iso > fechaHasta)) return false;

        return true;
      })
      .sort((a, b) =>
        String(b.fecha_registro_sistema || "").localeCompare(
          String(a.fecha_registro_sistema || "")
        )
      );
  }, [todas, estadoActivo, busqueda, fechaDesde, fechaHasta]);

  const columnas = [
    "id",
    "netlife_estatus_real",
    "nombre_cliente_completo",
    "numero_identificacion",
    "fecha_registro_sistema",
    "codigo_asesor",
    "id_bitrix",
    "distribuidor_autorizado",
    "supervisor",
    "netlife_login",
    "origen_venta",
  ];

  return (
    <div
      style={{
        padding: 18,
        background: "#f3f4f6",
        minHeight: "100vh",
        color: "#0f172a",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 12px 40px rgba(15,23,42,.08)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: 18,
            borderBottom: "1px solid #e5e7eb",
            background: "linear-gradient(135deg,#f8fafc,#fff7ed)",
          }}
        >
          <button
            onClick={onVolver}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 10,
              background: "#fff",
              border: "1px solid #dbe4f0",
              borderRadius: 999,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 800,
              color: "#ea580c",
              cursor: "pointer",
            }}
          >
            ← Volver a Backoffice
          </button>

          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: ".18em",
              color: "#ea580c",
              textTransform: "uppercase",
            }}
          >
            Backoffice · Validación de Estado
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 8,
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 26,
                  fontWeight: 900,
                  color: "#111827",
                }}
              >
                Validación de Estado
              </h2>

              <p
                style={{
                  margin: "7px 0 0",
                  color: "#64748b",
                  fontSize: 12.5,
                }}
              >
                Control por <b>ESTATUS NETLIFE</b>. Selecciona una tarjeta para
                desplegar los registros de ese estado.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {onCambiarEmpresa && (
                <FiltroEmpresa
                  valor={empresa}
                  onCambiar={onCambiarEmpresa}
                />
              )}

              <button
                onClick={recargar}
                style={{
                  padding: "9px 14px",
                  borderRadius: 10,
                  border: "1px solid #fed7aa",
                  background: "#fff7ed",
                  color: "#c2410c",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Refrescar
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div
            style={{
              margin: "14px 18px 0",
              padding: "10px 14px",
              borderRadius: 10,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              fontSize: 12.5,
              fontWeight: 700,
              color: "#b91c1c",
            }}
          >
            {error}
          </div>
        )}

        {total > (todas || []).length && (todas || []).length > 0 && (
          <div
            style={{
              margin: "14px 18px 0",
              padding: "10px 14px",
              borderRadius: 10,
              background: "#fffbeb",
              border: "1px solid #fde68a",
              fontSize: 12,
              color: "#92400e",
              fontWeight: 700,
            }}
          >
            Mostrando {(todas || []).length} de {total} registros por el límite
            actual de carga.
          </div>
        )}

        <div
          style={{
            padding: 18,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(205px, 1fr))",
            gap: 12,
          }}
        >
          {ESTATUS_NETLIFE.map((estado) => {
            const activo = estadoActivo === estado;

            return (
              <button
                key={estado}
                type="button"
                onClick={() => setEstadoActivo(estado)}
                style={{
                  width: "100%",
                  minHeight: 54,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: `1.5px solid ${activo ? "#ea580c" : "#e5e7eb"}`,
                  background: activo ? "#fff7ed" : "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  boxShadow: activo
                    ? "0 5px 16px rgba(234,88,12,.12)"
                    : "none",
                }}
              >
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 900,
                    color: "#334155",
                    textAlign: "left",
                  }}
                >
                  {estado}
                </span>

                <span
                  style={{
                    minWidth: 34,
                    padding: "4px 9px",
                    borderRadius: 10,
                    background: "#fff7ed",
                    color: "#ea580c",
                    fontSize: 13,
                    fontWeight: 900,
                    textAlign: "center",
                  }}
                >
                  {conteos[estado] || 0}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ padding: "0 18px 18px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 14,
            }}
          >
            <div style={{ marginRight: "auto" }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  letterSpacing: ".08em",
                }}
              >
                Estado seleccionado
              </div>

              <h3
                style={{
                  margin: "4px 0 0",
                  fontSize: 18,
                  color: "#c2410c",
                }}
              >
                {estadoActivo} · {rowsFiltradas.length}
              </h3>
            </div>

            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente, CI, login, asesor…"
              style={{
                padding: "9px 12px",
                borderRadius: 10,
                border: "1px solid #dbe4f0",
                fontSize: 12,
                minWidth: 240,
              }}
            />

            <CampoRangoFecha
              label="Fecha de registro"
              desde={fechaDesde}
              hasta={fechaHasta}
              onDesde={setFechaDesde}
              onHasta={setFechaHasta}
            />

            {(busqueda || fechaDesde || fechaHasta) && (
              <button
                onClick={() => {
                  setBusqueda("");
                  setFechaDesde("");
                  setFechaHasta("");
                }}
                style={{
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  color: "#475569",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Limpiar filtros
              </button>
            )}
          </div>

          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <div style={{ overflow: "auto", maxHeight: 590 }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "separate",
                  borderSpacing: 0,
                  fontSize: 11,
                }}
              >
                <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                  <tr>
                    {columnas.map((key) => (
                      <th
                        key={key}
                        style={{
                          textAlign: "left",
                          padding: "11px 12px",
                          borderBottom: "1px solid #e5e7eb",
                          whiteSpace: "nowrap",
                          background: "#f8fafc",
                          color: "#475569",
                          fontSize: 10.5,
                          fontWeight: 800,
                        }}
                      >
                        {FIELD_LABELS[key] ||
                          key.replace(/_/g, " ").toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {!cargando && rowsFiltradas.length === 0 && (
                    <tr>
                      <td
                        colSpan={columnas.length}
                        style={{
                          padding: 30,
                          textAlign: "center",
                          color: "#94a3b8",
                        }}
                      >
                        Sin registros para {estadoActivo}.
                      </td>
                    </tr>
                  )}

                  {cargando && (
                    <tr>
                      <td
                        colSpan={columnas.length}
                        style={{
                          padding: 30,
                          textAlign: "center",
                          color: "#94a3b8",
                        }}
                      >
                        Cargando…
                      </td>
                    </tr>
                  )}

                  {!cargando &&
                    rowsFiltradas.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => setDetalleId(row.id)}
                        style={{ cursor: "pointer" }}
                      >
                        {columnas.map((key) => (
                          <td
                            key={`${row.id}-${key}`}
                            title={valueForField(row, key)}
                            style={{
                              padding: "10px 12px",
                              borderBottom: "1px solid #f1f5f9",
                              whiteSpace: "nowrap",
                              maxWidth: 220,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              color: "#334155",
                            }}
                          >
                            {key === "netlife_estatus_real" && !row[key]
                              ? "SIN ESTADO"
                              : valueForField(row, key)}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {detalleId && (
        <PanelRegistros
          soloDetalle
          idInicial={detalleId}
          etiquetaContexto="Detalle de Validación de Estado"
          onVolver={() => setDetalleId(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBMÓDULO: VALIDACIÓN / REGULARIZACIÓN  (tablero kanban)
// ═══════════════════════════════════════════════════════════════════════════
// Tres bloques alimentados por la columna `estatus_regularizacion`:
//
//   (vacío)                        → SIN REVISAR
//   "POR REGULARIZAR"              → POR REGULARIZAR
//   "REGULARIZADO"                 → REGULARIZADO
//   "NO NECESITA REGULARIZACIÓN"   → REGULARIZADO
//
// Las tarjetas se ordenan de la MÁS ANTIGUA a la más reciente: lo que lleva más
// tiempo sin resolverse queda arriba de todo, que es donde tiene que mirar
// primero quien valida.
const BLOQUES_VALIDACION = [
  { id: "SIN_REVISAR", titulo: "Sin revisar", color: "#475569", fondo: "#f1f5f9", borde: "#cbd5e1", valorBD: "" },
  { id: "POR_REGULARIZAR", titulo: "Por regularizar", color: "#b45309", fondo: "#fffbeb", borde: "#fcd34d", valorBD: "POR REGULARIZAR" },
  { id: "REGULARIZADO", titulo: "Regularizado", color: "#047857", fondo: "#f0fdf4", borde: "#86efac", valorBD: "REGULARIZADO" },
  { id: "GESTION_ATC", titulo: "Gestión ATC", color: "#e11d48", fondo: "#fff1f2", borde: "#fecdd3", valorBD: "GESTION ATC" },
];

// Normaliza para comparar: sin tildes, sin espacios sobrantes, en mayúsculas.
// Así "Regularizado", "REGULARIZADO " y "regularizado" caen en el mismo sitio.
const normalizarEstado = (txt) =>
  String(txt ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

function bloqueDeRegistro(row) {
  const v = normalizarEstado(row?.estatus_regularizacion);
  if (!v) return "SIN_REVISAR";
  if (v.includes("NO NECESITA") || v.startsWith("REGULARIZAD")) return "REGULARIZADO";
  if (v.includes("GESTION") && v.includes("ATC")) return "GESTION_ATC";
  if (v.includes("REGULARIZAR")) return "POR_REGULARIZAR";
  return "SIN_REVISAR";
}

function diasDesde(fecha) {
  if (!fecha) return null;
  const d = new Date(String(fecha).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

function TarjetaCliente({ row, onAbrir, onArrastrar, moviendo, bloqueActual }) {
  const dias = diasDesde(row.fecha_registro_sistema);
  const estadoCrudo = String(row.estatus_regularizacion ?? "").trim();
  const esperado = BLOQUES_VALIDACION.find((b) => b.id === bloqueActual)?.valorBD ?? "";
  const estadoInesperado = estadoCrudo && normalizarEstado(estadoCrudo) !== normalizarEstado(esperado);
  const colorAntiguedad = dias == null ? "#94a3b8" : dias >= 15 ? "#b91c1c" : dias >= 7 ? "#b45309" : "#64748b";

  return (
    <div
      draggable={!moviendo}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(row.id));
        e.dataTransfer.effectAllowed = "move";
        onArrastrar(row.id);
      }}
      onDragEnd={() => onArrastrar(null)}
      onClick={() => onAbrir(row.id)}
      title="Clic para abrir el detalle · arrastra para cambiar de bloque"
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 13,
        cursor: moviendo ? "wait" : "grab",
        boxShadow: "0 2px 8px rgba(15,23,42,.05)",
        opacity: moviendo ? 0.55 : 1,
        display: "flex",
        flexDirection: "column",
        gap: 7,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 900, color: "#0f172a", lineHeight: 1.3 }}>
          {row.nombre_cliente_completo || "Sin nombre"}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {/* Indicador rojo a la derecha si está en Por regularizar */}
          {bloqueActual === "POR_REGULARIZAR" && (
            <span
              title={row.gestion_atc ? `Gestión ATC: ${row.gestion_atc}` : "Sin Gestión ATC asignada"}
              style={{
                fontSize: 10,
                fontWeight: 900,
                color: "#991b1b",
                background: "#fee2e2",
                border: "1px solid #fca5a5",
                borderRadius: 6,
                padding: "2px 6px",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                maxWidth: 130,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              ⚠️ {row.gestion_atc ? row.gestion_atc : "PEND. ATC"}
            </span>
          )}
          <span style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8" }}>#{row.id}</span>
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 2, display: "flex", alignItems: "center", gap: 4 }}>
          <span>📅</span> {row.fecha_registro_sistema ? String(row.fecha_registro_sistema).slice(0, 10) : "Sin fecha"}
        </div>
        <div>CI {row.numero_identificacion || "—"}</div>
        {row.plan_contratado_final && <div>{row.plan_contratado_final}</div>}
        <div>Asesor: {row.codigo_asesor || "—"}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: colorAntiguedad, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 999, padding: "2px 8px" }}>
          {dias == null ? "sin fecha" : dias === 0 ? "hoy" : `${dias} día${dias > 1 ? "s" : ""}`}
        </span>
        {row.estatus_envio && (
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#475569", background: "#f1f5f9", borderRadius: 999, padding: "2px 8px" }}>
            {row.estatus_envio}
          </span>
        )}
        {estadoInesperado && (
          <span title="Valor no reconocido en estatus_regularizacion" style={{ fontSize: 12, fontWeight: 800, color: "#7c2d12", background: "#ffedd5", border: "1px solid #fed7aa", borderRadius: 999, padding: "2px 8px" }}>
            ⚠ {estadoCrudo}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Filtro de fecha propio de cada bloque ────────────────────────────────────
// Cada columna del kanban filtra por su cuenta: se puede estar viendo «Sin
// revisar» de todo 2026 mientras «Por regularizar» muestra solo el 15/08. Las
// opciones de cada selector se calculan con los registros de ESA columna, así
// que nunca aparece un mes que en esa columna no tiene nada.
const FILTRO_FECHA_VACIO = { anio: "", mes: "", dia: "" };

function opcionesFechaDe(rows, f, campoFecha = "fecha_registro_sistema") {
  const anios = new Map(), meses = new Map(), dias = new Map();
  for (const r of rows) {
    const iso = fechaCalendarioEC(r[campoFecha]);
    if (!iso) continue;
    const [a, m] = iso.split("-");
    anios.set(a, (anios.get(a) || 0) + 1);
    if (f.anio && a !== f.anio) continue;
    meses.set(m, (meses.get(m) || 0) + 1);
    if (f.mes && m !== f.mes) continue;
    dias.set(iso, (dias.get(iso) || 0) + 1);
  }
  const orden = (mapa, desc = true) =>
    [...mapa.entries()].sort((x, y) => (desc ? String(y[0]).localeCompare(String(x[0])) : String(x[0]).localeCompare(String(y[0]))));
  return { anios: orden(anios), meses: orden(meses), dias: orden(dias) };
}

function aplicarFiltroFecha(rows, f, campoFecha = "fecha_registro_sistema") {
  if (!f.anio && !f.mes && !f.dia) return rows;
  return rows.filter((r) => {
    const iso = fechaCalendarioEC(r[campoFecha]);
    if (!iso) return false;
    const [a, m] = iso.split("-");
    if (f.anio && a !== f.anio) return false;
    if (f.mes && m !== f.mes) return false;
    if (f.dia && iso !== f.dia) return false;
    return true;
  });
}

function BotonFiltroCard({ titulo, cantidad, color, fondo, borde, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textAlign: "left", background: "#fff",
        border: `1px solid ${hover ? color : borde}`,
        borderRadius: 10, padding: "10px 12px", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        boxShadow: hover ? `0 4px 12px ${color}15` : "none",
        transition: "all .15s",
        width: "100%"
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 800, color: "#1e293b", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {titulo}
      </span>
      <span style={{ fontSize: 11, fontWeight: 800, color, background: fondo, border: `1px solid ${borde}`, borderRadius: 999, padding: "2px 8px", flex: "none" }}>
        ({cantidad})
      </span>
    </button>
  );
}

function FiltroFechaBloque({ rows, filtro, onCambiar, color, fondo, borde, campoFecha = "fecha_registro_sistema" }) {
  const op = opcionesFechaDe(rows, filtro, campoFecha);
  const activo = Boolean(filtro.anio || filtro.mes || filtro.dia);
  const nivel = filtro.dia ? "dia" : filtro.mes ? "mes" : filtro.anio ? "anio" : "inicio";

  return (
    <div style={{ marginBottom: 16, padding: 12, borderRadius: 12, background: activo ? fondo : "#f8fafc", border: `1px solid ${activo ? borde : "#eef2f7"}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".06em", color: activo ? color : "#94a3b8", textTransform: "uppercase" }}>
          📅 Navegar fechas
        </span>
        {activo && (
          <button
            onClick={() => onCambiar(FILTRO_FECHA_VACIO)}
            style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 12, fontWeight: 800, color, cursor: "pointer", textDecoration: "underline" }}
          >
            limpiar
          </button>
        )}
      </div>

      {nivel !== "inicio" && (
        <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <button
            onClick={() => {
              if (nivel === "dia") onCambiar({ ...filtro, dia: "" });
              else if (nivel === "mes") onCambiar({ ...filtro, mes: "" });
              else if (nivel === "anio") onCambiar(FILTRO_FECHA_VACIO);
            }}
            style={{ background: "#fff", border: `1px solid ${borde}`, borderRadius: 6, padding: "3px 8px", fontSize: 12, fontWeight: 800, color, cursor: "pointer" }}
          >
            ← Volver
          </button>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>
            {filtro.anio}{filtro.mes && ` / ${MESES_ES[Number(filtro.mes) - 1]}`}{filtro.dia && ` / ${filtro.dia.split("-")[2]}`}
          </span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto", paddingRight: 4 }}>
        {nivel === "inicio" && op.anios.map(([a, n]) => (
          <BotonFiltroCard key={a} titulo={a} cantidad={n} color={color} fondo={fondo} borde={borde} onClick={() => onCambiar({ anio: a, mes: "", dia: "" })} />
        ))}

        {nivel === "anio" && op.meses.map(([m, n]) => (
          <BotonFiltroCard key={m} titulo={MESES_ES[Number(m) - 1]} cantidad={n} color={color} fondo={fondo} borde={borde} onClick={() => onCambiar({ ...filtro, mes: m, dia: "" })} />
        ))}

        {nivel === "mes" && op.dias.map(([iso, n]) => (
          <BotonFiltroCard key={iso} titulo={etiquetaDia(iso)} cantidad={n} color={color} fondo={fondo} borde={borde} onClick={() => onCambiar({ ...filtro, dia: iso })} />
        ))}

        {nivel === "dia" && (
          <div style={{ padding: "10px", textAlign: "center", background: "#fff", border: `1px solid ${borde}`, borderRadius: 10, fontSize: 12, fontWeight: 700, color: "#1e293b" }}>
            Filtrando día: {etiquetaDia(filtro.dia)}
          </div>
        )}
      </div>
    </div>
  );
}

function TableroValidacion({ onVolver, onAbrirRegistro, empresa, onCambiarEmpresa }) {
  const { rows: todas, total, cargando, error, recargar } = useRegistrosBackoffice(1000, empresa);
  const [rows, setRows] = useState([]);
  const [detalleId, setDetalleId] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [arrastrando, setArrastrando] = useState(null);
  const [sobreBloque, setSobreBloque] = useState(null);
  const [moviendo, setMoviendo] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [filtrosFecha, setFiltrosFecha] = useState({
    SIN_REVISAR: FILTRO_FECHA_VACIO,
    POR_REGULARIZAR: FILTRO_FECHA_VACIO,
    GESTION_ATC: FILTRO_FECHA_VACIO,
    REGULARIZADO: FILTRO_FECHA_VACIO,
  });

  const token = localStorage.getItem("token");
  const cambiarFiltro = (bloqueId, nuevo) =>
    setFiltrosFecha((prev) => ({ ...prev, [bloqueId]: { ...FILTRO_FECHA_VACIO, ...nuevo } }));

  useEffect(() => { setRows(todas); }, [todas]);

  const ordenadas = (() => {
    const q = normalizarEstado(busqueda);
    const filtradas = !q ? rows : rows.filter((r) =>
      [r.nombre_cliente_completo, r.numero_identificacion, r.codigo_asesor, r.id_bitrix, r.gestion_atc, String(r.id)]
        .some((c) => normalizarEstado(c).includes(q))
    );
    return [...filtradas].sort((a, b) => {
      const fa = String(a.fecha_registro_sistema || "");
      const fb = String(b.fecha_registro_sistema || "");
      if (fa && fb && fa !== fb) return fa < fb ? -1 : 1;
      return (a.id ?? 0) - (b.id ?? 0);
    });
  })();

  const porBloque = { SIN_REVISAR: [], POR_REGULARIZAR: [], GESTION_ATC: [], REGULARIZADO: [] };
  for (const r of ordenadas) {
    const b = bloqueDeRegistro(r);
    if (porBloque[b]) porBloque[b].push(r);
  }

  // ... (el resto de funciones y renderizado iteran automáticamente sobre BLOQUES_VALIDACION mostrando las 4 columnas)

  const soltarEn = async (bloqueDestino, e) => {
    e.preventDefault();
    setSobreBloque(null);

    const idStr = e.dataTransfer.getData("text/plain");
    setArrastrando(null);
    if (!idStr) return;

    // Comparación como string: evita el mismatch number vs string
    // que ocurre si `id` en la BD es BIGINT (Postgres lo devuelve como string).
    const row = rows.find((r) => String(r.id) === idStr);
    if (!row) return;

    const id = row.id; // usamos el id tal como viene en el row (string o number)

    if (bloqueDeRegistro(row) === bloqueDestino) return; // no se movió de bloque

    const destino = BLOQUES_VALIDACION.find((b) => b.id === bloqueDestino);
    const valorPrevio = row.estatus_regularizacion;

    // Actualización optimista: la tarjeta salta al instante y, si el guardado
    // falla, vuelve a su sitio. Sin esto el kanban se siente lento.
    setRows((prev) =>
      prev.map((r) => (String(r.id) === idStr ? { ...r, estatus_regularizacion: destino.valorBD } : r))
    );
    setMoviendo(id);
    setAviso(null);

    try {
      const r = await fetch(`${API}/api/backoffice/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estatus_regularizacion: destino.valorBD }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.error || `No se pudo guardar (HTTP ${r.status})`);
      setAviso(`✅ #${id} movido a «${destino.titulo}».`);
    } catch (err) {
      setRows((prev) =>
        prev.map((x) => (String(x.id) === idStr ? { ...x, estatus_regularizacion: valorPrevio } : x))
      );
      setAviso(`❌ No se pudo mover #${id}: ${err.message}. La tarjeta volvió a su bloque.`);
    } finally {
      setMoviendo(null);
    }
  };

  return (
    <div style={{ padding: 18, background: "#f3f4f6", minHeight: "100vh", color: "#0f172a" }}>
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 12px 40px rgba(15,23,42,.08)", overflow: "hidden" }}>
        <div style={{ padding: 18, borderBottom: "1px solid #e5e7eb", background: "linear-gradient(135deg,#f8fafc,#eef2ff)" }}>
          <button
            onClick={onVolver}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10, background: "#fff", border: "1px solid #dbe4f0", borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 800, color: "#4f46e5", cursor: "pointer" }}
          >
            ← Volver a Backoffice
          </button>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".18em", color: "#4f46e5", textTransform: "uppercase" }}>
            Backoffice · Validación
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: "#111827" }}>Validación / Regularización</h2>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {onCambiarEmpresa && <FiltroEmpresa valor={empresa} onCambiar={onCambiarEmpresa} />}
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar cliente, CI, asesor…"
                style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #dbe4f0", fontSize: 13, outline: "none", minWidth: 240 }}
              />
              <BotonDescargaExcel
                onClick={() => exportarAExcel(ordenadas, `Reporte_Validacion_${empresa || "Todos"}`)}
                color="#4f46e5" fondo="#eef2ff" borde="#c7d2fe"
              />
              <button
                onClick={recargar}
                style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #c7d2fe", background: "#eef2ff", color: "#3730a3", fontWeight: 700, cursor: "pointer" }}
              >
                Refrescar
              </button>
            </div>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#64748b" }}>
            Ordenadas de la más antigua a la más reciente. Arrastra una tarjeta a otro bloque para cambiar su estado, o haz clic para abrir el detalle.
            <br />
            Cada bloque tiene <b>su propio filtro de fecha</b>: puedes ver «Sin revisar» de todo el año mientras «Por regularizar» muestra un solo día.
            Los <b>contadores se actualizan automáticamente</b> con la búsqueda y los filtros seleccionados.
          </p>
        </div>

        {aviso && (
          <div style={{ margin: "14px 18px 0", padding: "10px 14px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 12.5, fontWeight: 700, color: "#334155" }}>
            {aviso}
          </div>
        )}

        {error && (
          <div style={{ margin: "14px 18px 0", padding: "10px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>
            {error}
          </div>
        )}

        {/* ── CONTADORES DINÁMICOS ─────────────────────────────────────────
            Los contadores usan exactamente las listas que se muestran en cada
            columna después de aplicar búsqueda + filtro de fecha. Por eso se
            actualizan inmediatamente cada vez que cambia cualquier filtro.
        */}
        {(() => {
          const conteosVisibles = BLOQUES_VALIDACION.map((bloque) => {
            const todasDelBloque = porBloque[bloque.id] || [];
            const filtro = filtrosFecha[bloque.id];
            return aplicarFiltroFecha(todasDelBloque, filtro).length;
          });

          const totalVisible = conteosVisibles.reduce((sum, n) => sum + n, 0);

          const contadorCards = [
            {
              titulo: "Registros totales",
              cantidad: totalVisible,
              color: "#047857",
              fondo: "#f0fdf4",
              borde: "#86efac",
              detalle: "Registros visibles según los filtros",
            },
            {
              titulo: "Sin revisar",
              cantidad: conteosVisibles[0],
              color: "#475569",
              fondo: "#f1f5f9",
              borde: "#cbd5e1",
              detalle: "Pendientes de revisión",
            },
            {
              titulo: "Por regularizar",
              cantidad: conteosVisibles[1],
              color: "#b45309",
              fondo: "#fffbeb",
              borde: "#fcd34d",
              detalle: "Requieren regularización",
            },
            {
              titulo: "Regularizados",
              cantidad: conteosVisibles[2],
              color: "#047857",
              fondo: "#f0fdf4",
              borde: "#86efac",
              detalle: "Ya regularizados",
            },

            {
              titulo: "Gestión ATC",
              cantidad: conteosVisibles[3],
              color: "#0369a1",
              fondo: "#f0f9ff",
              borde: "#7dd3fc",
              detalle: "Registros en gestión por ATC",
            },
          ];

          return (
            <div
              style={{
                padding: "0 18px 18px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 16,
              }}
            >
              {contadorCards.map((card) => (
                <div
                  key={card.titulo}
                  style={{
                    padding: 18,
                    borderRadius: 14,
                    background: card.fondo,
                    border: `1px solid ${card.borde}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: card.color,
                      textTransform: "uppercase",
                      letterSpacing: ".08em",
                    }}
                  >
                    {card.titulo}
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 32,
                      lineHeight: 1,
                      fontWeight: 900,
                      color: card.color,
                    }}
                  >
                    {card.cantidad}
                  </div>

                  <div
                    style={{
                      marginTop: 7,
                      fontSize: 11.5,
                      color: "#64748b",
                    }}
                  >
                    {card.detalle}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "start" }}>
          {BLOQUES_VALIDACION.map((bloque) => {
            const todasDelBloque = porBloque[bloque.id] || [];
            const filtro = filtrosFecha[bloque.id];
            const lista = aplicarFiltroFecha(todasDelBloque, filtro);
            const hayFiltro = Boolean(filtro.anio || filtro.mes || filtro.dia);
            const activo = sobreBloque === bloque.id;
            return (
              <div
                key={bloque.id}
                onDragOver={(e) => { e.preventDefault(); setSobreBloque(bloque.id); }}
                onDragLeave={() => setSobreBloque((b) => (b === bloque.id ? null : b))}
                onDrop={(e) => soltarEn(bloque.id, e)}
                style={{
                  background: activo ? bloque.fondo : "#fafbfc",
                  border: `2px ${activo ? "dashed" : "solid"} ${activo ? bloque.color : "#e5e7eb"}`,
                  borderRadius: 14,
                  padding: 14,
                  minHeight: 300,
                  transition: "background .15s, border-color .15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
                  <span style={{ width: 4, height: 18, borderRadius: 4, background: bloque.color, flex: "none" }} />
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: bloque.color, textTransform: "uppercase", letterSpacing: ".04em" }}>
                    {bloque.titulo}
                  </h3>
                  <span
                    title={hayFiltro ? `${lista.length} de ${todasDelBloque.length} en total` : `${lista.length} en total`}
                    style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 800, color: bloque.color, background: bloque.fondo, border: `1px solid ${bloque.borde}`, borderRadius: 999, padding: "2px 10px" }}
                  >
                    {hayFiltro ? `${lista.length} / ${todasDelBloque.length}` : lista.length}
                  </span>
                </div>

                {/* Filtro de fecha propio de esta columna */}
                <FiltroFechaBloque
                  rows={todasDelBloque}
                  filtro={filtro}
                  onCambiar={(nuevo) => cambiarFiltro(bloque.id, nuevo)}
                  color={bloque.color}
                  fondo={bloque.fondo}
                  borde={bloque.borde}
                />

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {cargando && <span style={{ fontSize: 12, color: "#94a3b8" }}>Cargando…</span>}

                  {!cargando && lista.length === 0 && (
                    <div style={{ padding: "26px 12px", textAlign: "center", fontSize: 12, color: "#94a3b8", border: "1px dashed #e2e8f0", borderRadius: 10 }}>
                      {arrastrando
                        ? "Suelta aquí"
                        : hayFiltro
                          ? `Sin ventas con ese filtro (hay ${todasDelBloque.length} en el bloque)`
                          : "Sin ventas en este bloque"}
                    </div>
                  )}

                  {lista.map((row) => (
                    <TarjetaCliente
                      key={row.id}
                      row={row}
                      bloqueActual={bloque.id}
                      moviendo={moviendo === row.id}
                      onArrastrar={setArrastrando}
                      onAbrir={(id) => setDetalleId(id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {detalleId && (
          <PanelRegistros
            soloDetalle
            idInicial={detalleId}
            etiquetaContexto="Detalle de Validación / Regularización"
            onVolver={() => setDetalleId(null)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Registros = explorador de fechas + tabla completa.
 * La tabla no filtra en el navegador: recibe el día elegido y deja que el
 * backend haga el filtro con fechaDesde/fechaHasta, que ya existía.
 */
function ModuloRegistros({ onVolver, idInicial, nav, navegar, empresa, onCambiarEmpresa, onAbrirRegistro }) {
  const { rows, cargando, error, recargar } = useRegistrosBackoffice(1000, empresa);

  if (!idInicial && !nav.dia && !nav.todos) {
    return (
      <ExploradorFechas
        rows={rows} cargando={cargando} error={error}
        tituloModulo="Registros"
        migaModulo="Backoffice · Registros"
        color="#0284c7" fondo="#e0f2fe" borde="#bae6fd"
        nav={nav} navegar={navegar} onVolver={onVolver} onRecargar={recargar}
        empresa={empresa} onCambiarEmpresa={onCambiarEmpresa}
        onAbrirRegistro={onAbrirRegistro}
      />
    );
  }

  return (
    <PanelRegistros
      onVolver={onVolver}
      idInicial={idInicial}
      fechaFija={nav.dia || undefined}
      etiquetaContexto={nav.dia ? etiquetaDia(nav.dia) : "Todos los registros"}
      empresa={empresa}
      onCambiarEmpresa={onCambiarEmpresa}
    />
  );
}

export default function VistaBackoffice() {
  const [params, setParams] = useSearchParams();
  const idActivo = params.get("m");
  const sub = SUBMODULOS.find((s) => s.id === idActivo);

  // Filtro de empresa: vive en un state simple (no en la URL) para no tener
  // que arrastrarlo en cada setParams de la navegación por fechas. Se
  // mantiene mientras la persona navega entre submódulos porque
  // VistaBackoffice nunca se desmonta; se resetea a "Todos" al recargar la página.
  const [empresa, setEmpresa] = useState("TODOS");

  const nav = {
    anio: params.get("a"),
    mes: params.get("me"),
    dia: params.get("d"),
    todos: params.get("todos") === "1",
  };

  const navegar = useMemo(() => ({
    aAnios: () => setParams({ m: idActivo }),
    aMeses: (a) => setParams({ m: idActivo, a }),
    aDias: (a, me) => setParams({ m: idActivo, a, me }),
    aDia: (a, me, d) => setParams({ m: idActivo, a, me, d }),
    aTodos: () => setParams({ m: idActivo, todos: "1" }),
  }), [idActivo, setParams]);

  const abrir = useCallback((id) => setParams({ m: id }), [setParams]);
  const volver = useCallback(() => setParams({}), [setParams]);
  const abrirRegistro = useCallback((id) => setParams({ m: "registros", id: String(id) }), [setParams]);

  if (!sub) return <HubBackoffice onAbrir={abrir} empresa={empresa} onCambiarEmpresa={setEmpresa} />;

  if (sub.id === "registros") {
    return (
      <ModuloRegistros
        onVolver={volver} idInicial={params.get("id")} nav={nav} navegar={navegar}
        empresa={empresa} onCambiarEmpresa={setEmpresa}
        onAbrirRegistro={abrirRegistro}
      />
    );
  }

  if (sub.id === "validacion-estado") {
    return (
      <TableroValidacionEstado
        onVolver={volver}
        empresa={empresa}
        onCambiarEmpresa={setEmpresa}
      />
    );
  }

  if (sub.id === "validacion") {
    return <TableroValidacion onVolver={volver} empresa={empresa} onCambiarEmpresa={setEmpresa} />;
  }

  if (sub.id === "welcome") {
    return <TableroWelcome onVolver={volver} empresa={empresa} onCambiarEmpresa={setEmpresa} />;
  }

  if (sub.id === "agendamientos") {
    return (
      <TableroAgendamientos
        onVolver={volver} nav={nav} navegar={navegar}
        empresa={empresa} onCambiarEmpresa={setEmpresa}
      />
    );
  }

  if (sub.id === "preservicios") {
    return (
      <TableroPreservicios
        onVolver={volver}
        empresa={empresa} onCambiarEmpresa={setEmpresa}
      />
    );
  }

  return <EnConstruccion sub={sub} onVolver={volver} />;
}
