import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

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

const CAMPOS_FECHA = [
  "fecha_nacimiento", "fecha_regularizacion_atc", "fecha_agenda",
  "fecha_recaudada", "fecha_activacion_netlife", "fecha_registro_sistema",
];

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
};

const TABLE_COLUMNS = [
  "id","estatus_envio","ip_origen","fecha_registro_sistema","mes_registro_sistema","dia_abc_registro_sistema",
  "codigo_asesor","id_bitrix","distribuidor_autorizado","supervisor","origen_venta","venta_nueva_o_reingreso","turno",
  "nombre_atc","clausulas","lider_comercial","tipo_cliente","genero_cliente","tipo_documento","numero_identificacion",
  "nombre_cliente_completo","estado_civil","fecha_nacimiento","mes_nacimiento","dia_abc_nacimiento","email_cliente",
  "aplica_descuento_3ra_edad","telf_celular_pin","telf_celular_2","telf_fijo","provincia","ciudad","parroquia_barrio",
  "direccion_calles","direccion_manzana_villa","referencia_ubicacion","coordenadas_gps","tipo_vivienda","regimen_vivienda",
  "plan_contratado_final","servicios_digitales","forma_pago","detalle_bancario_ahorros","valor_pago","tipo_contrato",
  "links_documentos","estado_recaudacion","fecha_recaudada","mes_recaudada","dia_abc_recaudada","netlife_login","netlife_estatus_real",
  "fecha_activacion_netlife","mes_activacion_netlife","dia_abc_activacion_netlife","calidad_venta_analista","novedades_atc",
  "venta_efectiva","auditoria_documentos","auditado_por","inconsistencia_documental","observacion_auditoria","errores_telcos",
  "estatus_regularizacion","detalle_regularizacion","fecha_regularizacion_atc","mes_regularizacion_atc","dia_abc_regularizacion_atc",
  "mes_regularizacion","observacion_venta_original","observacion_gestion_cobranza","turno_agendado","fecha_agenda","mes_agenda",
  "dia_abc_agenda","banco","ciclo_facturacion","costo_instalacion","descuento_instalacion","beneficios_adicionales",
  "beneficios_de_ley","plazo_contrato_meses","resumen_venta","foto_cedula_frontal","foto_cedula_trasera","foto_carnet","archivo_resumen"
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
  campo:  { display: "flex", flexDirection: "column", gap: 5, minWidth: 0 },
  label:  { fontSize: 10, fontWeight: 800, letterSpacing: ".08em", color: "#64748b", textTransform: "uppercase" },
  ctl:    { padding: "8px 10px", borderRadius: 10, border: "1px solid #dbe4f0", fontSize: 12, outline: "none", background: "#fff", color: "#0f172a", width: "100%" },
  rango:  { display: "flex", alignItems: "center", gap: 6 },
  guion:  { color: "#94a3b8", fontSize: 12 },
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
        <input type="date" style={estilosFiltro.ctl} value={desde} onChange={(e) => onDesde(e.target.value)} />
        <span style={estilosFiltro.guion}>–</span>
        <input type="date" style={estilosFiltro.ctl} value={hasta} onChange={(e) => onHasta(e.target.value)} />
      </div>
    </div>
  );
}

function PanelRegistros({ onVolver, idInicial, fechaFija, etiquetaContexto }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(initialDetail);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [detailOriginal, setDetailOriginal] = useState({});

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
      // Solo se mandan los filtros con valor: si están vacíos, el backend
      // se comporta exactamente como antes.
      Object.entries(f || {}).forEach(([k, v]) => { if (v) p.set(k, v); });
      const qs = p.toString() ? `?${p.toString()}` : "";
      const res = await fetch(`${API}/api/backoffice${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Error al cargar registros");
      setRows(json.data || []);
      if (!selectedId && (json.data || []).length) setSelectedId(json.data[0].id);
    } catch (e) {
      setAlert({ type: "error", msg: e.message || "Error al cargar la vista" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => fetchRows(search, filtros), 350);
    return () => clearTimeout(t);
  }, [search, filtros]);

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
    try {
      const res = await fetch(`${API}/api/backoffice/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
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
    setShowModal(false);
    setSelectedId(null);
    setDetail(null);
    setDetailOriginal({});
    setAlert(null);
  };

  // Cuando se llega aquí desde el tablero de Validación (?m=registros&id=123),
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
    "estatus_envio","codigo_asesor","id_bitrix","distribuidor_autorizado","supervisor","origen_venta",
    "nombre_cliente_completo","numero_identificacion","tipo_cliente","genero_cliente","fecha_nacimiento",
    "email_cliente","provincia","ciudad","parroquia_barrio","telf_celular_pin","telf_celular_2",
    "direccion_calles","referencia_ubicacion","plan_contratado_final","servicios_digitales","forma_pago",
    "banco","ciclo_facturacion","costo_instalacion","descuento_instalacion","beneficios_adicionales",
    "beneficios_de_ley","plazo_contrato_meses","resumen_venta","estado_recaudacion","netlife_login",
    "netlife_estatus_real","calidad_venta_analista","venta_efectiva","auditoria_documentos","auditado_por",
    "inconsistencia_documental","observacion_auditoria","errores_telcos","estatus_regularizacion","detalle_regularizacion",
    "fecha_regularizacion_atc","mes_regularizacion","novedades_atc","observacion_venta_original","observacion_gestion_cobranza",
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
      { titulo: "Registro",       campos: ["estatus_envio","codigo_asesor","id_bitrix","distribuidor_autorizado","supervisor","origen_venta"] },
      { titulo: "Cliente",        campos: ["nombre_cliente_completo","numero_identificacion","tipo_cliente","genero_cliente","fecha_nacimiento","email_cliente","telf_celular_pin","telf_celular_2"] },
      { titulo: "Ubicación",      campos: ["provincia","ciudad","parroquia_barrio","direccion_calles","referencia_ubicacion"] },
      { titulo: "Plan y pago",    campos: ["plan_contratado_final","servicios_digitales","forma_pago","banco","ciclo_facturacion","costo_instalacion","descuento_instalacion","beneficios_adicionales","beneficios_de_ley","plazo_contrato_meses","resumen_venta"] },
      { titulo: "Netlife",        campos: ["estado_recaudacion","netlife_login","netlife_estatus_real"] },
      { titulo: "Auditoría",      campos: ["calidad_venta_analista","venta_efectiva","auditoria_documentos","auditado_por","inconsistencia_documental","observacion_auditoria","errores_telcos"] },
      { titulo: "Regularización", campos: ["estatus_regularizacion","detalle_regularizacion","fecha_regularizacion_atc","mes_regularizacion","novedades_atc"] },
      { titulo: "Observaciones",  campos: ["observacion_venta_original","observacion_gestion_cobranza"] },
      { titulo: "Documentos",     campos: [...CAMPOS_DOCUMENTO] },
    ];
    const asignados = new Set(grupos.flatMap((g) => g.campos));
    const sobrantes = editableFields.filter((f) => !asignados.has(f));
    const salida = grupos
      .map((g) => ({ ...g, campos: g.campos.filter((f) => editableFields.includes(f)) }))
      .filter((g) => g.campos.length);
    if (sobrantes.length) salida.push({ titulo: "Otros datos", campos: sobrantes });
    return salida;
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

        // 🔠 Convertir a mayúsculas todo el texto excepto los documentos.
        // Con la comprobación anterior ("foto_"), "archivo_resumen" se pasaba a
        // MAYÚSCULAS y la ruta guardada quedaba inservible: el servidor de
        // archivos distingue mayúsculas de minúsculas en el nombre.
        if (typeof nuevo === "string" && !esCampoDocumento(campo)) {
          nuevo = nuevo.toUpperCase();
        }

        if (nuevo !== viejo) payload[campo] = nuevo;
      }

      if (Object.keys(payload).length === 0) {
        setAlert({ type: "success", msg: "No hay cambios que guardar" });
        setSaving(false);
        return;
      }

      const res = await fetch(`${API}/api/backoffice/${selectedId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error || "No se pudo guardar");

      setAlert({ type: "success", msg: "Registro actualizado correctamente" });
      fetchRows(search);
      fetchDetail(selectedId);
    } catch (e) {
      setAlert({ type: "error", msg: e.message || "Error al guardar" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 18, background: "#f3f4f6", minHeight: "100vh", color: "#0f172a" }}>
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 12px 40px rgba(15, 23, 42, 0.08)", overflow: "hidden" }}>
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
                  opciones={opciones.estatusNetlife}
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
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 11 }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 3 }}>
                    <tr style={{ background: "#f8fafc" }}>
                      {tableHeaders.map((h, i) => (
                        <th
                          key={h.key}
                          title={h.key}
                          style={{
                            textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e5e7eb",
                            fontWeight: 800, color: "#475569", whiteSpace: "nowrap", background: "#f8fafc",
                            // Las 2 primeras columnas quedan fijas para no perder
                            // la referencia del registro al desplazarse a lo ancho.
                            ...(i < 2 ? { position: "sticky", left: i === 0 ? 0 : 60, zIndex: 4, boxShadow: i === 1 ? "2px 0 0 #e5e7eb" : undefined } : {}),
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
                        onClick={() => { setSelectedId(row.id); fetchDetail(row.id); }}
                        style={{ cursor: "pointer", background: selectedId === row.id ? "#eff6ff" : "#fff" }}
                      >
                        {tableHeaders.map((h, i) => (
                        <td
                          key={`${row.id}-${h.key}`}
                          title={valueForField(row, h.key)}
                          style={{
                            padding: "10px 8px", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap",
                            maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis",
                            background: selectedId === row.id ? "#eff6ff" : "#fff",
                            ...(i < 2 ? { position: "sticky", left: i === 0 ? 0 : 60, zIndex: 2, boxShadow: i === 1 ? "2px 0 0 #e5e7eb" : undefined } : {}),
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

        {/* ─── MODAL DETALLE ─────────────────────────────────────────────────────────────── */}
        {showModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
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
                    <label style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
                    {FIELD_LABELS[field] || field}
                    </label>

                    {esCampoDocumento(field) ? (
                    /* 📸 CASO 1: DOCUMENTO DE RESPALDO — miniatura sin recorte,
                       clic para verlo completo, y reemplazo vía el servidor de
                       almacenamiento (no como base64 dentro de la fila). */
                    <CampoDocumento
                        field={field}
                        etiqueta={FIELD_LABELS[field] || field}
                        valor={detail?.[field] || ""}
                        numeroIdentificacion={detail?.numero_identificacion}
                        onCambio={(nuevaRuta) => setDetail((prev) => ({ ...prev, [field]: nuevaRuta }))}
                        onAlert={setAlert}
                    />
                    ) : (
                    /* 📅 CASO 2 Y 3: INPUT DINÁMICO (TIPO "date" PARA FECHAS, "text" PARA EL RESTO) */
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
    listo: false,
  },
  {
    id: "agendamientos",
    nombre: "Agendamientos",
    icono: "📅",
    descripcion: "Programación y control de las visitas de instalación.",
    color: "#ea580c",
    fondo: "#ffedd5",
    listo: false,
  },
  {
    id: "preservicios",
    nombre: "Preservicios",
    icono: "🔧",
    descripcion: "Verificaciones técnicas previas a la instalación del servicio.",
    color: "#0891b2",
    fondo: "#cffafe",
    listo: false,
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
        <span style={{ position: "absolute", top: 16, right: 16, fontSize: 10, fontWeight: 800, letterSpacing: ".08em", color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 999, padding: "3px 9px" }}>
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

function HubBackoffice({ onAbrir }) {
  return (
    <div style={{ padding: 18, background: "#f3f4f6", minHeight: "100vh", color: "#0f172a" }}>
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 12px 40px rgba(15,23,42,.08)", overflow: "hidden" }}>
        <div style={{ padding: 22, borderBottom: "1px solid #e5e7eb", background: "linear-gradient(135deg,#f8fafc,#eef2ff)" }}>
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
const MESES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS_ES  = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

const fmtFechaEC = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit",
});

/** Devuelve la fecha calendario en Ecuador como "YYYY-MM-DD", o null. */
function fechaCalendarioEC(valor) {
  if (!valor) return null;
  const s = String(valor);
  // Ya viene como fecha pura (sin hora): no hay nada que convertir.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
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
    if (!iso) { sinFecha.push(row); continue; }
    const [a, m] = iso.split("-");

    if (!anios.has(a)) anios.set(a, { anio: a, cantidad: 0, meses: new Map() });
    const anio = anios.get(a);
    anio.cantidad++;

    if (!anio.meses.has(m)) anio.meses.set(m, { mes: m, cantidad: 0, dias: new Map() });
    const mes = anio.meses.get(m);
    mes.cantidad++;

    mes.dias.set(iso, (mes.dias.get(iso) || 0) + 1);
  }

  const lista = [...anios.values()]
    .map((a) => ({
      ...a,
      meses: [...a.meses.values()]
        .map((m) => ({
          ...m,
          dias: [...m.dias.entries()]
            .map(([iso, cantidad]) => ({ iso, cantidad }))
            .sort((x, y) => (x.iso < y.iso ? 1 : -1)), // día más reciente primero
        }))
        .sort((x, y) => Number(y.mes) - Number(x.mes)),
    }))
    .sort((x, y) => Number(y.anio) - Number(x.anio)); // año más reciente primero

  return { anios: lista, sinFecha };
}

function BotonNivel({ titulo, cantidad, color, fondo, borde, onClick, ancho = 200 }) {
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
        borderRadius: 14, padding: "16px 18px", cursor: "pointer",
        minWidth: ancho, display: "flex", flexDirection: "column", gap: 8,
        boxShadow: hover ? `0 12px 26px ${color}22` : "0 4px 14px rgba(15,23,42,.05)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "all .16s ease-out",
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 900, color: "#0f172a" }}>{titulo}</span>
      <span style={{ alignSelf: "flex-start", fontSize: 12, fontWeight: 800, color, background: fondo, border: `1px solid ${borde}`, borderRadius: 999, padding: "3px 11px" }}>
        {cantidad} {cantidad === 1 ? "registro" : "registros"}
      </span>
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
}) {
  const { anios, sinFecha } = useMemo(() => agruparPorFecha(rows), [rows]);

  const anioSel = nav.anio ? anios.find((a) => a.anio === nav.anio) : null;
  const mesSel  = anioSel && nav.mes ? anioSel.meses.find((m) => m.mes === nav.mes) : null;

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

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: "#111827" }}>{tituloModulo}</h2>
            <div style={{ display: "flex", gap: 10 }}>
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

          {!cargando && !error && anios.length === 0 && (
            <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>Todavía no hay registros con fecha para agrupar.</p>
          )}

          {!cargando && !error && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
              {nivel === "anios" && anios.map((a) => (
                <BotonNivel
                  key={a.anio} titulo={a.anio} cantidad={a.cantidad}
                  color={color} fondo={fondo} borde={borde}
                  onClick={() => navegar.aMeses(a.anio)}
                />
              ))}

              {nivel === "meses" && anioSel.meses.map((m) => (
                <BotonNivel
                  key={m.mes} titulo={MESES_ES[Number(m.mes) - 1]} cantidad={m.cantidad}
                  color={color} fondo={fondo} borde={borde}
                  onClick={() => navegar.aDias(anioSel.anio, m.mes)}
                />
              ))}

              {nivel === "dias" && mesSel.dias.map((d) => (
                <BotonNivel
                  key={d.iso} titulo={etiquetaDia(d.iso)} cantidad={d.cantidad}
                  color={color} fondo={fondo} borde={borde} ancho={230}
                  onClick={() => navegar.aDia(anioSel.anio, mesSel.mes, d.iso)}
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
function useRegistrosBackoffice(limite = 1000) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const token = localStorage.getItem("token");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch(`${API}/api/backoffice?limit=${limite}`, {
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
  }, [token, limite]);

  useEffect(() => { cargar(); }, [cargar]);

  return { rows, total, cargando, error, recargar: cargar };
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
  { id: "SIN_REVISAR",     titulo: "Sin revisar",     color: "#475569", fondo: "#f1f5f9", borde: "#cbd5e1", valorBD: "" },
  { id: "POR_REGULARIZAR", titulo: "Por regularizar", color: "#b45309", fondo: "#fffbeb", borde: "#fcd34d", valorBD: "POR REGULARIZAR" },
  { id: "REGULARIZADO",    titulo: "Regularizado",    color: "#047857", fondo: "#f0fdf4", borde: "#86efac", valorBD: "REGULARIZADO" },
];

// Normaliza para comparar: sin tildes, sin espacios sobrantes, en mayúsculas.
// Así "Regularizado", "REGULARIZADO " y "regularizado" caen en el mismo sitio.
const normalizarEstado = (txt) =>
  String(txt ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

function bloqueDeRegistro(row) {
  const v = normalizarEstado(row?.estatus_regularizacion);
  if (!v) return "SIN_REVISAR";
  if (v.includes("NO NECESITA") || v.startsWith("REGULARIZAD")) return "REGULARIZADO";
  if (v.includes("REGULARIZAR")) return "POR_REGULARIZAR";
  // Valor que no encaja en ninguna regla: se muestra en "Sin revisar" pero la
  // tarjeta lleva su texto original visible, para que se note y se corrija.
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
  // Solo se muestra el texto crudo cuando NO coincide con la etiqueta esperada
  // del bloque (es decir, un valor raro que alguien escribió a mano).
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
        <span style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", lineHeight: 1.3 }}>
          {row.nombre_cliente_completo || "Sin nombre"}
        </span>
        <span style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", flex: "none" }}>#{row.id}</span>
      </div>

      <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.6 }}>
        <div>CI {row.numero_identificacion || "—"}</div>
        {row.plan_contratado_final && <div>{row.plan_contratado_final}</div>}
        <div>Asesor: {row.codigo_asesor || "—"}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: colorAntiguedad, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 999, padding: "2px 8px" }}>
          {dias == null ? "sin fecha" : dias === 0 ? "hoy" : `${dias} día${dias > 1 ? "s" : ""}`}
        </span>
        {row.estatus_envio && (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "#475569", background: "#f1f5f9", borderRadius: 999, padding: "2px 8px" }}>
            {row.estatus_envio}
          </span>
        )}
        {estadoInesperado && (
          <span title="Valor no reconocido en estatus_regularizacion" style={{ fontSize: 10, fontWeight: 800, color: "#7c2d12", background: "#ffedd5", border: "1px solid #fed7aa", borderRadius: 999, padding: "2px 8px" }}>
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

function opcionesFechaDe(rows, f) {
  const anios = new Map(), meses = new Map(), dias = new Map();
  for (const r of rows) {
    const iso = fechaCalendarioEC(r.fecha_registro_sistema);
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

function aplicarFiltroFecha(rows, f) {
  if (!f.anio && !f.mes && !f.dia) return rows;
  return rows.filter((r) => {
    const iso = fechaCalendarioEC(r.fecha_registro_sistema);
    if (!iso) return false; // con filtro activo, lo que no tiene fecha no aplica
    const [a, m] = iso.split("-");
    if (f.anio && a !== f.anio) return false;
    if (f.mes && m !== f.mes) return false;
    if (f.dia && iso !== f.dia) return false;
    return true;
  });
}

function FiltroFechaBloque({ rows, filtro, onCambiar, color, fondo, borde }) {
  const op = opcionesFechaDe(rows, filtro);
  const activo = Boolean(filtro.anio || filtro.mes || filtro.dia);

  const estiloSelect = {
    flex: 1, minWidth: 0, padding: "5px 7px", borderRadius: 7,
    border: `1px solid ${activo ? borde : "#e2e8f0"}`,
    background: "#fff", fontSize: 11, color: "#334155",
    fontWeight: 700, outline: "none", cursor: "pointer",
  };

  return (
    <div style={{ marginBottom: 12, padding: 9, borderRadius: 10, background: activo ? fondo : "#f8fafc", border: `1px solid ${activo ? borde : "#eef2f7"}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", color: activo ? color : "#94a3b8", textTransform: "uppercase" }}>
          📅 Filtrar por fecha
        </span>
        {activo && (
          <button
            onClick={() => onCambiar(FILTRO_FECHA_VACIO)}
            style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 10.5, fontWeight: 800, color, cursor: "pointer", textDecoration: "underline" }}
          >
            limpiar
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <select
          value={filtro.anio}
          onChange={(e) => onCambiar({ anio: e.target.value, mes: "", dia: "" })}
          style={estiloSelect}
        >
          <option value="">Año: todos</option>
          {op.anios.map(([a, n]) => <option key={a} value={a}>{a} ({n})</option>)}
        </select>

        <select
          value={filtro.mes}
          disabled={!filtro.anio}
          onChange={(e) => onCambiar({ ...filtro, mes: e.target.value, dia: "" })}
          style={{ ...estiloSelect, opacity: filtro.anio ? 1 : 0.5, cursor: filtro.anio ? "pointer" : "not-allowed" }}
        >
          <option value="">Mes: todos</option>
          {op.meses.map(([m, n]) => <option key={m} value={m}>{MESES_ES[Number(m) - 1]} ({n})</option>)}
        </select>

        <select
          value={filtro.dia}
          disabled={!filtro.mes}
          onChange={(e) => onCambiar({ ...filtro, dia: e.target.value })}
          style={{ ...estiloSelect, opacity: filtro.mes ? 1 : 0.5, cursor: filtro.mes ? "pointer" : "not-allowed" }}
        >
          <option value="">Día: todos</option>
          {op.dias.map(([iso, n]) => <option key={iso} value={iso}>{etiquetaDia(iso)} ({n})</option>)}
        </select>
      </div>
    </div>
  );
}

function TableroValidacion({ onVolver, onAbrirRegistro }) {
  const { rows: todas, total, cargando, error, recargar } = useRegistrosBackoffice(1000);
  const [rows, setRows] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [arrastrando, setArrastrando] = useState(null);
  const [sobreBloque, setSobreBloque] = useState(null);
  const [moviendo, setMoviendo] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [filtrosFecha, setFiltrosFecha] = useState({
    SIN_REVISAR: FILTRO_FECHA_VACIO,
    POR_REGULARIZAR: FILTRO_FECHA_VACIO,
    REGULARIZADO: FILTRO_FECHA_VACIO,
  });

  const token = localStorage.getItem("token");

  const cambiarFiltro = (bloqueId, nuevo) =>
    setFiltrosFecha((prev) => ({ ...prev, [bloqueId]: { ...FILTRO_FECHA_VACIO, ...nuevo } }));

  // El tablero trabaja sobre una copia local para poder mover tarjetas al
  // instante (actualización optimista) sin volver a pedir todo al servidor.
  useEffect(() => { setRows(todas); }, [todas]);

  useEffect(() => {
    if (total > todas.length && todas.length > 0) {
      setAviso(`Mostrando ${todas.length} de ${total} registros. Los más antiguos quedaron fuera del límite de carga.`);
    }
  }, [total, todas.length]);

  // Ordenadas de la MÁS ANTIGUA a la más reciente.
  const ordenadas = (() => {
    const q = normalizarEstado(busqueda);
    const filtradas = !q ? rows : rows.filter((r) =>
      [r.nombre_cliente_completo, r.numero_identificacion, r.codigo_asesor, r.id_bitrix, String(r.id)]
        .some((c) => normalizarEstado(c).includes(q))
    );
    return [...filtradas].sort((a, b) => {
      const fa = String(a.fecha_registro_sistema || "");
      const fb = String(b.fecha_registro_sistema || "");
      if (fa && fb && fa !== fb) return fa < fb ? -1 : 1;
      return (a.id ?? 0) - (b.id ?? 0);
    });
  })();

  // OJO: de aquí para abajo NO puede haber hooks. El `return` temprano del
  // explorador de fechas hace que este tramo no siempre se ejecute, y React
  // exige que la cantidad de hooks sea idéntica en todos los renders. Por eso
  // esto es un cálculo plano y no un useMemo.
  const porBloque = { SIN_REVISAR: [], POR_REGULARIZAR: [], REGULARIZADO: [] };
  for (const r of ordenadas) porBloque[bloqueDeRegistro(r)].push(r);

  const soltarEn = async (bloqueDestino, e) => {
    e.preventDefault();
    setSobreBloque(null);
    const id = Number(e.dataTransfer.getData("text/plain"));
    setArrastrando(null);
    if (!id) return;

    const row = rows.find((r) => r.id === id);
    if (!row) return;
    if (bloqueDeRegistro(row) === bloqueDestino) return; // no se movió de bloque

    const destino = BLOQUES_VALIDACION.find((b) => b.id === bloqueDestino);
    const valorPrevio = row.estatus_regularizacion;

    // Actualización optimista: la tarjeta salta al instante y, si el guardado
    // falla, vuelve a su sitio. Sin esto el kanban se siente lento.
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, estatus_regularizacion: destino.valorBD } : r)));
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
      setRows((prev) => prev.map((x) => (x.id === id ? { ...x, estatus_regularizacion: valorPrevio } : x)));
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
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar cliente, CI, asesor…"
                style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #dbe4f0", fontSize: 13, outline: "none", minWidth: 240 }}
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
                      onAbrir={onAbrirRegistro}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Registros = explorador de fechas + tabla completa.
 * La tabla no filtra en el navegador: recibe el día elegido y deja que el
 * backend haga el filtro con fechaDesde/fechaHasta, que ya existía.
 */
function ModuloRegistros({ onVolver, idInicial, nav, navegar }) {
  const { rows, cargando, error, recargar } = useRegistrosBackoffice(1000);

  // Si se llegó con un id concreto (clic en una tarjeta del kanban), se salta
  // el explorador y se abre el detalle directamente.
  if (!idInicial && !nav.dia && !nav.todos) {
    return (
      <ExploradorFechas
        rows={rows} cargando={cargando} error={error}
        tituloModulo="Registros"
        migaModulo="Backoffice · Registros"
        color="#0284c7" fondo="#e0f2fe" borde="#bae6fd"
        nav={nav} navegar={navegar} onVolver={onVolver} onRecargar={recargar}
      />
    );
  }

  return (
    <PanelRegistros
      onVolver={onVolver}
      idInicial={idInicial}
      fechaFija={nav.dia || undefined}
      etiquetaContexto={nav.dia ? etiquetaDia(nav.dia) : "Todos los registros"}
    />
  );
}

export default function VistaBackoffice() {
  const [params, setParams] = useSearchParams();
  const idActivo = params.get("m");
  const sub = SUBMODULOS.find((s) => s.id === idActivo);

  // Estado de la navegación por fechas, todo en la URL.
  //   ?m=validacion            → años
  //   ?m=validacion&a=2026     → meses de 2026
  //   ?m=validacion&a=2026&me=01        → días de enero
  //   ?m=validacion&a=2026&me=01&d=2026-01-06  → registros de ese día
  //   ?m=validacion&todos=1    → todos, sin filtro de fecha
  const nav = {
    anio:  params.get("a"),
    mes:   params.get("me"),
    dia:   params.get("d"),
    todos: params.get("todos") === "1",
  };

  const navegar = useMemo(() => ({
    aAnios: ()          => setParams({ m: idActivo }),
    aMeses: (a)         => setParams({ m: idActivo, a }),
    aDias:  (a, me)     => setParams({ m: idActivo, a, me }),
    aDia:   (a, me, d)  => setParams({ m: idActivo, a, me, d }),
    aTodos: ()          => setParams({ m: idActivo, todos: "1" }),
  }), [idActivo, setParams]);

  const abrir = useCallback((id) => setParams({ m: id }), [setParams]);
  const volver = useCallback(() => setParams({}), [setParams]);

  // Desde el tablero de Validación se salta al detalle completo reutilizando el
  // modal que ya existe en Registros: se navega a ?m=registros&id=<n> y el
  // panel lo abre solo. Así no hay dos pantallas de detalle que mantener.
  const abrirRegistro = useCallback((id) => setParams({ m: "registros", id: String(id) }), [setParams]);

  // Sin submódulo válido en la URL → menú de tarjetas.
  if (!sub) return <HubBackoffice onAbrir={abrir} />;

  if (sub.id === "registros") {
    return <ModuloRegistros onVolver={volver} idInicial={params.get("id")} nav={nav} navegar={navegar} />;
  }

  // Validación entra directo al tablero: el filtro de fechas vive dentro de
  // cada bloque, no antes del tablero.
  if (sub.id === "validacion") {
    return <TableroValidacion onVolver={volver} onAbrirRegistro={abrirRegistro} />;
  }

  return <EnConstruccion sub={sub} onVolver={volver} />;
}
