import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

export default function VistaBackoffice() {
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
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
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
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", color: "#4f46e5", textTransform: "uppercase" }}>Backoffice</div>
              <h2 style={{ margin: "8px 0 0", fontSize: 26, fontWeight: 900, color: "#111827" }}>Vista Backoffice</h2>
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
