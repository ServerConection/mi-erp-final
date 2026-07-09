// src/pages/NuevaVenta.jsx
// Formulario de ingreso de venta — vista ASESOR
// Estilo: lista vertical tipo formulario · Branding Netlife naranja

import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_API_URL;

// ─── Catálogos exactos del proceso comercial ─────────────────────────────────
const DISTRIBUIDORES  = ["NOVONET", "VELSA"];
const BIOMETRICO      = ["FALTA BIOMÉTRICO", "FIRMÓ BIOMÉTRICO"];
const TIPOS_CLI       = ["NATURAL", "JURÍDICO"];
const TIPOS_DOC       = ["CÉDULA DE IDENTIDAD", "NÚMERO DE PASAPORTE", "RUC PERSONAL", "RUC EMPRESA"];
const GENEROS         = ["HOMBRE", "MUJER"];
const ESTADOS_CIV     = ["SOLTERO/A", "CASADO/A", "DIVORCIADO/A", "VIUDO/A", "UNIÓN LIBRE"];
const TIPO_INMUEBLE   = ["CASA NO REQUIERE LIBERAR", "EDIFICIO", "CONJUNTO", "PARA LIBERAR EDIFICIO", "PARA LIBERAR CONJUNTO", "HAY QUE ATAR CAJA"];
// Ya no se vende con motivo "discapacidad" — única opción afirmativa es 3ra edad (>=65 años)
const DESCUENTO_3ERA  = ["NO", "SÍ — POR 3RA EDAD"];
const TIPO_VIV        = ["ARRENDADA", "PROPIA", "DE UN FAMILIAR"];
const FORMAS_PAGO     = ["EFECTIVO", "TARJETA DE CRÉDITO", "CUENTA CORRIENTE", "CUENTA AHORROS"];
// Tipos de plan = pestañas del Excel de precios + venta de solo servicio adicional
const SOLO_ADICIONAL  = "SOLO SERVICIO ADICIONAL";
const TIPOS_PLAN      = ["HOME", "TERCERA EDAD", "GAMER", "PRO", "PYME", SOLO_ADICIONAL];
// Formas de pago que activan cada promoción del catálogo (EFECTIVO no tiene promo)
const PAGO_TC   = "TARJETA DE CRÉDITO";
const PAGOS_CTA = ["CUENTA CORRIENTE", "CUENTA AHORROS"];
const ORIGENES        = [
  "BASE 593-995211968", "API 484", "Base 593-979083368", "BASE 593-992827793",
  "FORMULARIO LANDING 3", "LLAMADA LANDING 3", "WHATSAPP - ECUANET REGISTRO",
  "BASE 593-962881280", "POR RECOMENDACIÓN", "REFERIDO PERSONAL",
  "BASE 593-958993371", "BASE 593-999803743", "BASE 593-995967355",
  "WHATSAPP 593958993371", "BASE 593-987133635", "FORMULARIO LANDING 4",
  "BASE API 593963463480", "LLAMADA LANDING 4", "LLAMADA REMARKETING",
];
const CICLOS_FACT     = ["Del 1 al 31 de cada mes (débito automático por pago anticipado)", "Del 1 al 30/31 (pago contra factura)", "Otro"];
const BENEFICIOS_LEY  = ["SI", "NO"];

// Supervisores por distribuidor (filtra el dropdown según Distribuidor seleccionado)
const SUPERVISORES = {
  NOVONET: ["RICARDO ECHEVERRÍA", "ANDRÉS RODRÍGUEZ", "JAVIER NAVARRETE", "ADRIANA"],
  VELSA:   ["ALEXANDRA PACHECO", "DARIANA"],
};

// Edad mínima para aplicar descuento de 3ra edad
const EDAD_MINIMA_3RA_EDAD = 65;
function calcularEdad(fechaISO) {
  if (!fechaISO) return null;
  const nac = new Date(fechaISO);
  if (Number.isNaN(nac.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nac.getFullYear();
  const noHaCumplido = (hoy.getMonth() < nac.getMonth()) ||
    (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate());
  if (noHaCumplido) edad--;
  return edad;
}

// ─── Estado inicial ──────────────────────────────────────────────────────────
const INIT = {
  codigo_asesor: "", id_bitrix: "", distribuidor_autorizado: "",
  biometrico: "", supervisor: "",
  tipo_cliente: "", tipo_documento: "", numero_identificacion: "",
  apellidos_cliente: "", nombres_cliente: "",
  genero_cliente: "", estado_civil: "", fecha_nacimiento: "",
  tipo_inmueble: "", aplica_descuento_3ra_edad: "", regimen_vivienda: "",
  calle_principal: "", calle_secundaria: "",
  provincia: "", ciudad: "", parroquia_barrio: "",
  manzana_villa: "", referencia_ubicacion: "", coordenadas_gps: "",
  telf_celular_pin: "", telf_instalacion: "", email_cliente: "",
  forma_pago: "",
  tipo_plan: "", plan_contratado_final: "",
  servicios_digitales: "", servicio_adicional: "",
  origen_venta: "", turno: "",
  observacion_venta: "",
  // ── Datos para el resumen de venta auto-generado ──
  precio_regular_sin_imp: "", precio_regular: "", precio_promocion: "", meses_promocion: "", porcentaje_descuento: "",
  banco: "", ciclo_facturacion: "", costo_instalacion: "", descuento_instalacion: "",
  beneficios_adicionales: "", beneficios_de_ley: "NO", plazo_contrato_meses: "36",
  resumen_venta: "",
  // ── Documentos ──
  foto_cedula_frontal: "", foto_cedula_trasera: "", foto_carnet: "", archivo_resumen: "",
};

// ─── Genera el texto del resumen de venta en el formato exacto acordado ──────
function generarResumenVenta(form, user) {
  const trato = form.genero_cliente === "MUJER" ? "Sra" : "Sr";
  const nombreCliente = `${form.apellidos_cliente} ${form.nombres_cliente}`.trim() || "—";
  const asesor = user.nombre || user.usuario || form.codigo_asesor || "—";
  const plan = [form.tipo_plan, form.plan_contratado_final].filter(Boolean).join(" ") || "—";
  const servicios = (form.servicios_digitales || "")
    .split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
  const serviciosTxt = servicios.length
    ? servicios.map(s => `-    ${s}`).join("\n")
    : "-    —";
  const leySi = form.beneficios_de_ley === "SI" ? "X" : " ";
  const leyNo = form.beneficios_de_ley === "SI" ? " " : "X";
  const plazo = form.plazo_contrato_meses || "36";

  return [
    `👤 Cliente: ${trato} ${nombreCliente}`,
    `💻 Asesor: ${asesor}`,
    `⏳Plan contratado: ${plan}`,
    `✅Servicios Empaquetados incluidos:`,
    serviciosTxt,
    `✅Precio regular (sin impuestos): $${form.precio_regular_sin_imp || "—"}`,
    `✅Precio regular (con impuestos): $${form.precio_regular || "—"}`,
    `✅Precio con promoción: $${form.precio_promocion || "—"}${form.meses_promocion ? ` durante ${form.meses_promocion} facturas` : ""}`,
    `✅Promoción aplicada: ${form.porcentaje_descuento ? `${form.porcentaje_descuento}% de descuento` : "—"}${form.meses_promocion ? ` por ${form.meses_promocion} facturas` : ""}`,
    `⏳Método de pago y Banco: ${[form.forma_pago, form.banco].filter(Boolean).join(" - ") || "—"}`,
    `⏳Ciclo de facturación: ${form.ciclo_facturacion || "—"}`,
    `⏳Costo de instalación: ${form.costo_instalacion ? `$${form.costo_instalacion} + IVA` : "—"}`,
    `⏳Descuento en instalación: ${form.descuento_instalacion || "—"}`,
    `✅Beneficios adicionales:`,
    (form.beneficios_adicionales || "—").split(/\n/).map(s => `•    ${s}`).join("\n"),
    `•    ✍🏼Beneficios de Ley: SI (    ${leySi}    ) NO (    ${leyNo}    )`,
    `⚠️Importante: En caso de cancelación anticipada, se cobrará el proporcional de todas las promociones recibidas por el tiempo que faltase para los ${plazo} meses de su contrato`,
  ].join("\n");
}

// ─── Colores Netlife ──────────────────────────────────────────────────────────
const O  = "#FF6B00";
const OL = "#FF8533";
const OP = "#FFF3E8";
const OB = "#FFCBA0";

// ─── Secciones del formulario ────────────────────────────────────────────────
const SECCIONES = [
  { id: "asesor",    label: "Datos del asesor",     icon: "🧑‍💼", color: "#FF6B00" },
  { id: "cliente",   label: "Datos del cliente",    icon: "👤",  color: "#FF8533" },
  { id: "direccion", label: "Dirección",            icon: "📍",  color: "#E85D00" },
  { id: "contacto",  label: "Contacto",             icon: "📞",  color: "#FF6B00" },
  { id: "plan",      label: "Plan y pago",          icon: "📡",  color: "#FF8533" },
  { id: "cierre",    label: "Cierre y origen",      icon: "✅",  color: "#E85D00" },
];

// ─── Estilos ─────────────────────────────────────────────────────────────────
const css = `
  * { box-sizing: border-box; }
  .nv-page {
    min-height: 100vh;
    background: #FFF8F3;
    font-family: 'Inter','Segoe UI',sans-serif;
    color: #1C1C2E;
    padding-bottom: 80px;
  }
  /* Header */
  .nv-header {
    background: linear-gradient(135deg, #1C1C2E 0%, #2D1200 60%, #1C1C2E 100%);
    border-bottom: 3px solid ${O};
    padding: 20px 28px;
    display: flex; align-items: center; gap: 16px; position: sticky; top: 0; z-index: 100;
    box-shadow: 0 4px 20px rgba(0,0,0,.3);
  }
  .nv-logo {
    width: 44px; height: 44px; border-radius: 12px;
    background: ${O}; display: flex; align-items: center; justify-content: center;
    font-size: 22px; flex-shrink: 0; box-shadow: 0 4px 14px rgba(255,107,0,.45);
  }
  .nv-title { font-size: 20px; font-weight: 900; color: #fff; margin: 0; }
  .nv-sub   { font-size: 11px; color: #FFB347; margin-top: 2px; font-weight: 600; letter-spacing:.05em; }
  .nv-badge {
    margin-left: auto; background: rgba(255,107,0,.15); border: 1px solid rgba(255,107,0,.4);
    color: #FFB347; border-radius: 20px; padding: 5px 14px; font-size: 11px; font-weight: 700;
    display: flex; align-items: center; gap: 6px;
  }
  /* Progreso lateral */
  .nv-body { max-width: 760px; margin: 0 auto; padding: 28px 20px 0; }
  /* Sección */
  .nv-section {
    background: #fff; border: 1.5px solid #F0E6DD;
    border-radius: 18px; margin-bottom: 16px; overflow: hidden;
    box-shadow: 0 2px 12px rgba(255,107,0,.06);
    transition: box-shadow .2s;
  }
  .nv-section:focus-within { box-shadow: 0 4px 24px rgba(255,107,0,.14); border-color: ${OB}; }
  .nv-sec-header {
    display: flex; align-items: center; gap: 12px;
    padding: 16px 22px; background: ${OP};
    border-bottom: 1.5px solid ${OB};
  }
  .nv-sec-icon {
    width: 36px; height: 36px; border-radius: 10px;
    background: ${O}; display: flex; align-items: center; justify-content: center;
    font-size: 17px; flex-shrink: 0;
  }
  .nv-sec-label { font-size: 13px; font-weight: 800; color: #7C3A00; text-transform: uppercase; letter-spacing:.1em; }
  .nv-sec-num {
    margin-left: auto; width: 26px; height: 26px; border-radius: 50%;
    background: ${O}; color: #fff; font-size: 11px; font-weight: 900;
    display: flex; align-items: center; justify-content: center;
  }
  /* Filas de campos */
  .nv-rows { padding: 6px 0 10px; }
  .nv-row {
    display: flex; align-items: flex-start; gap: 0;
    padding: 0; border-bottom: 1px solid #FEF0E6;
    transition: background .12s;
  }
  .nv-row:last-child { border-bottom: none; }
  .nv-row:focus-within { background: #FFFAF7; }
  .nv-row-label {
    flex-shrink: 0; width: 220px; min-height: 52px;
    display: flex; align-items: center;
    padding: 14px 16px 14px 22px;
    font-size: 12.5px; font-weight: 700; color: #6B3A1F;
    line-height: 1.3;
  }
  .nv-row-label .req { color: ${O}; margin-left: 3px; }
  .nv-row-input {
    flex: 1; padding: 10px 18px 10px 0;
    display: flex; flex-direction: column; justify-content: center; gap: 4px;
  }
  /* Inputs */
  .nv-input {
    width: 100%; border: 1.5px solid #E8D5C8;
    border-radius: 10px; padding: 10px 14px;
    font-size: 13.5px; font-weight: 500; color: #1C1C2E;
    background: #FDFAF8; outline: none;
    transition: border .15s, box-shadow .15s;
    font-family: inherit;
  }
  .nv-input:focus {
    border-color: ${O}; background: #fff;
    box-shadow: 0 0 0 3px rgba(255,107,0,.13);
  }
  .nv-input::placeholder { color: #C4A898; }
  .nv-select {
    width: 100%; border: 1.5px solid #E8D5C8;
    border-radius: 10px; padding: 10px 36px 10px 14px;
    font-size: 13.5px; font-weight: 500; color: #1C1C2E;
    background: #FDFAF8 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23C4A898' stroke-width='2.5'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E") no-repeat right 10px center / 18px;
    outline: none; appearance: none; cursor: pointer;
    transition: border .15s, box-shadow .15s;
    font-family: inherit;
  }
  .nv-select:focus {
    border-color: ${O}; background-color: #fff;
    box-shadow: 0 0 0 3px rgba(255,107,0,.13);
  }
  .nv-textarea {
    width: 100%; border: 1.5px solid #E8D5C8; border-radius: 10px;
    padding: 10px 14px; font-size: 13.5px; font-weight: 500;
    color: #1C1C2E; background: #FDFAF8; outline: none; resize: vertical;
    min-height: 70px; font-family: inherit;
    transition: border .15s, box-shadow .15s;
  }
  .nv-textarea:focus {
    border-color: ${O}; background: #fff;
    box-shadow: 0 0 0 3px rgba(255,107,0,.13);
  }
  .nv-err { font-size: 11px; color: #DC2626; font-weight: 600; margin-top: 2px; }
  /* Chips de plan */
  .nv-chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .nv-chip {
    padding: 7px 16px; border-radius: 20px; font-size: 12px; font-weight: 700;
    cursor: pointer; border: 1.5px solid #E8D5C8; background: #FDFAF8; color: #8B5E3C;
    transition: all .15s;
  }
  .nv-chip.sel {
    background: ${O}; border-color: ${O}; color: #fff;
    box-shadow: 0 2px 8px rgba(255,107,0,.35);
  }
  /* Botón enviar */
  .nv-submit-wrap {
    background: #fff; border: 1.5px solid #F0E6DD; border-radius: 18px;
    padding: 24px 22px; margin-top: 8px;
    box-shadow: 0 2px 12px rgba(255,107,0,.06);
  }
  .nv-btn-submit {
    width: 100%; padding: 15px; border: none; border-radius: 12px;
    background: linear-gradient(135deg, ${O}, ${OL});
    color: #fff; font-size: 15px; font-weight: 900;
    cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;
    box-shadow: 0 6px 24px rgba(255,107,0,.4);
    transition: opacity .15s, transform .1s;
    font-family: inherit; letter-spacing: .02em;
  }
  .nv-btn-submit:active { transform: scale(.99); }
  .nv-btn-submit:disabled { opacity: .65; cursor: not-allowed; }
  .nv-btn-reset {
    width: 100%; padding: 11px; border: 1.5px solid #E8D5C8; border-radius: 12px;
    background: transparent; color: #8B5E3C; font-size: 13px; font-weight: 700;
    cursor: pointer; margin-top: 10px; font-family: inherit;
    transition: background .15s;
  }
  .nv-btn-reset:hover { background: ${OP}; }
  /* Alert */
  .nv-alert {
    border-radius: 12px; padding: 14px 18px; margin-bottom: 16px;
    font-size: 13px; font-weight: 600; display: flex; align-items: flex-start; gap: 10px;
  }
  .nv-alert.ok  { background: #ECFDF5; border: 1px solid #6EE7B7; color: #065F46; }
  .nv-alert.err { background: #FEF2F2; border: 1px solid #FCA5A5; color: #991B1B; }
  /* Success */
  .nv-success {
    background: #fff; border: 1.5px solid ${OB}; border-radius: 20px;
    padding: 48px 24px; text-align: center; margin-top: 16px;
  }
  .nv-success-icon {
    width: 76px; height: 76px; border-radius: 50%;
    background: linear-gradient(135deg, ${O}, ${OL});
    display: flex; align-items: center; justify-content: center;
    font-size: 34px; margin: 0 auto 20px;
    box-shadow: 0 8px 28px rgba(255,107,0,.35);
  }
  /* Auto-chip */
  .nv-auto { display: inline-flex; align-items: center; gap: 6px; background: ${OP}; border: 1px solid ${OB}; border-radius: 8px; padding: 5px 12px; font-size: 11px; color: ${O}; font-weight: 700; }
  /* Spinner */
  .nv-spin { width:18px; height:18px; border:2.5px solid rgba(255,255,255,.4); border-top-color:#fff; border-radius:50%; animation: spin .6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  /* Divisor doble columna */
  .nv-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  @media (max-width: 600px) {
    .nv-row-label { width: 100%; min-height: unset; padding: 12px 18px 4px; }
    .nv-row { flex-direction: column; }
    .nv-row-input { padding: 4px 18px 12px; }
    .nv-row-2 { grid-template-columns: 1fr; }
    .nv-badge { display: none; }
  }
`;

// ─── Sub-componentes ──────────────────────────────────────────────────────────
function Row({ label, required, children }) {
  return (
    <div className="nv-row">
      <div className="nv-row-label">
        {label}{required && <span className="req"> *</span>}
      </div>
      <div className="nv-row-input">{children}</div>
    </div>
  );
}

function FIn({ value, onChange, placeholder, type = "text", readOnly = false }) {
  return (
    <input
      className="nv-input" type={type}
      value={value} onChange={onChange}
      placeholder={placeholder} readOnly={readOnly}
      style={readOnly ? { background: "#F5EDE6", color: "#B07A5A", cursor: "not-allowed" } : {}}
    />
  );
}

function FSel({ value, onChange, options, placeholder = "Seleccionar…" }) {
  return (
    <select className="nv-select" value={value} onChange={onChange}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Chips({ value, onChange, options, disabledOptions = [] }) {
  return (
    <div className="nv-chips">
      {options.map(o => {
        const isDisabled = disabledOptions.includes(o);
        return (
          <button
            key={o} type="button"
            className={`nv-chip${value === o ? " sel" : ""}`}
            disabled={isDisabled}
            style={isDisabled ? { opacity: 0.4, cursor: "not-allowed" } : {}}
            onClick={() => !isDisabled && onChange(o === value ? "" : o)}
          >
            {value === o && "✓ "}{o}
          </button>
        );
      })}
    </div>
  );
}

// El archivo ahora vive en el servidor de almacenamiento local, detrás de una
// ruta autenticada — un <a href> normal no envía el token, así que hay que
// pedirlo con fetch() + Authorization y abrir el resultado como blob.
async function verArchivoAutenticado(url) {
  try {
    const token = localStorage.getItem("token");
    const r = await fetch(`${API}${url}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) { alert("No se pudo abrir el archivo."); return; }
    const blob = await r.blob();
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank", "noopener,noreferrer");
  } catch {
    alert("Error de conexión al abrir el archivo.");
  }
}

function FileUpload({ label, value, uploading, onPick }) {
  const inputRef = useRef(null);
  return (
    <div>
      <input
        ref={inputRef} type="file" accept="image/*,application/pdf"
        style={{ display: "none" }}
        onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ""; }}
      />
      <button
        type="button"
        className="nv-btn-reset"
        style={{ marginTop: 0, width: "auto", padding: "9px 18px" }}
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? "Subiendo…" : value ? "✅ Reemplazar archivo" : `📎 Subir ${label}`}
      </button>
      {value && !uploading && (
        <button
          type="button"
          onClick={() => verArchivoAutenticado(value)}
          style={{ marginLeft: 10, fontSize: 12, color: "#FF6B00", fontWeight: 700, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
        >
          Ver archivo subido
        </button>
      )}
    </div>
  );
}

function Seccion({ num, icon, label, children }) {
  return (
    <div className="nv-section">
      <div className="nv-sec-header">
        <div className="nv-sec-icon">{icon}</div>
        <span className="nv-sec-label">{label}</span>
        <div className="nv-sec-num">{num}</div>
      </div>
      <div className="nv-rows">{children}</div>
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function NuevaVenta() {
  const navigate = useNavigate();
  const [form, setForm]     = useState(INIT);
  const [errs, setErrs]     = useState({});
  const [loading, setLoad]  = useState(null); // null | "CARGAR" | "BORRADOR"
  const [alert, setAlert]   = useState(null);
  const [success, setSucc]  = useState(null);
  const [uploading, setUploading] = useState({}); // { campo: true }
  const [resumenEditado, setResumenEditado] = useState(false);
  const [catalogo, setCatalogo]   = useState([]);   // catálogo mensual de planes (Excel cargado por admin)
  const [vigenciaCat, setVigenciaCat] = useState(null);

  const userRaw = localStorage.getItem("user") || localStorage.getItem("userProfile") || "{}";
  const user    = (() => { try { return JSON.parse(userRaw); } catch { return {}; } })();
  const token   = localStorage.getItem("token");

  // Si la URL trae ?id=123, estamos continuando un borrador propio
  const borradorId = new URLSearchParams(window.location.search).get("id");

  useEffect(() => {
    if (!borradorId) return;
    (async () => {
      try {
        const r = await fetch(`${API}/api/envios-ventas/borrador/${borradorId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await r.json();
        if (d.success) {
          const data = d.data;
          setForm(f => {
            const next = { ...f };
            Object.keys(INIT).forEach(k => {
              if (data[k] !== undefined && data[k] !== null) next[k] = String(data[k]);
            });
            // Campos cuya columna en la BD tiene un nombre distinto al campo del
            // formulario (por el mapeo hecho en handleSubmit). Sin este segundo
            // paso, estos campos siempre volvían vacíos al continuar un borrador.
            const RENOMBRADOS_DB_A_FORM = {
              clausulas:               'biometrico',
              tipo_vivienda:           'regimen_vivienda',
              regimen_vivienda:        'tipo_inmueble',
              direccion_manzana_villa: 'manzana_villa',
              telf_celular_2:          'telf_instalacion',
              tipo_contrato:           'servicio_adicional',
              novedades_atc:           'observacion_venta',
            };
            Object.entries(RENOMBRADOS_DB_A_FORM).forEach(([dbCol, formKey]) => {
              if (data[dbCol] !== undefined && data[dbCol] !== null) next[formKey] = String(data[dbCol]);
            });
            // El nombre se guarda combinado en la BD; al recuperar el borrador lo
            // dejamos completo en "nombres" para que el asesor lo separe si hace falta.
            if (data.nombre_cliente_completo && !next.apellidos_cliente && !next.nombres_cliente) {
              next.nombres_cliente = data.nombre_cliente_completo;
            }
            // direccion_calles también se guarda combinada
            if (data.direccion_calles && !next.calle_principal) {
              next.calle_principal = data.direccion_calles;
            }
            return next;
          });
          setResumenEditado(true); // ya tiene resumen guardado, no lo pisamos automáticamente
          setAlert({ tipo: "ok", msg: `Continuando borrador #${borradorId}. Completa los campos faltantes.` });
        } else {
          setAlert({ tipo: "err", msg: d.error || "No se pudo cargar el borrador." });
        }
      } catch {
        setAlert({ tipo: "err", msg: "Error de conexión al cargar el borrador." });
      }
    })();
  }, [borradorId]);

  // ── Catálogo mensual de planes (viene del Excel que carga el admin) ────────
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/api/planes-catalogo`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        if (d.success) { setCatalogo(d.data || []); setVigenciaCat(d.vigencia || null); }
      } catch { /* sin catálogo → los campos quedan de texto libre */ }
    })();
  }, []);

  const hayCatalogo = catalogo.length > 0;
  const usaCatalogo = hayCatalogo && form.tipo_plan && form.tipo_plan !== SOLO_ADICIONAL;

  // Planes únicos del tipo seleccionado (ej. HOME → Plan 200 Mbps, Plan 400 Mbps…)
  const planesDelTipo = useMemo(() => {
    const seen = new Set();
    return catalogo
      .filter(c => c.tipo_plan === form.tipo_plan)
      .filter(c => (seen.has(c.plan_base) ? false : (seen.add(c.plan_base), true)))
      .map(c => c.plan_base);
  }, [catalogo, form.tipo_plan]);

  // Empaquetados disponibles para el plan elegido (Sin empaquetado, Paramount+, Netlife Play…)
  const empaquetadosDelPlan = useMemo(() =>
    catalogo
      .filter(c => c.tipo_plan === form.tipo_plan && c.plan_base === form.plan_contratado_final)
      .map(c => c.empaquetado),
  [catalogo, form.tipo_plan, form.plan_contratado_final]);

  // Registro exacto seleccionado (tipo + plan + empaquetado) → de aquí salen los precios
  const opcionSel = useMemo(() =>
    catalogo.find(c =>
      c.tipo_plan === form.tipo_plan &&
      c.plan_base === form.plan_contratado_final &&
      c.empaquetado === form.servicios_digitales
    ) || null,
  [catalogo, form.tipo_plan, form.plan_contratado_final, form.servicios_digitales]);

  // Si el plan tiene un solo empaquetado, se selecciona automáticamente
  useEffect(() => {
    if (usaCatalogo && empaquetadosDelPlan.length === 1 && form.servicios_digitales !== empaquetadosDelPlan[0]) {
      setForm(f => ({ ...f, servicios_digitales: empaquetadosDelPlan[0] }));
    }
  }, [usaCatalogo, empaquetadosDelPlan]);

  // Auto-completar precios según plan + empaquetado + forma de pago
  //   TARJETA DE CRÉDITO → columnas "PROMOCION CON TARJETA DE CREDITO" del Excel
  //   CUENTA CORRIENTE/AHORROS → columnas "PROMOCION CON CUENTA"
  //   EFECTIVO → sin promoción (solo precio regular)
  useEffect(() => {
    if (!usaCatalogo || !opcionSel) return;
    const fmt = v => (v === null || v === undefined || v === "" || isNaN(Number(v))) ? "" : Number(v).toFixed(2);
    let precio_promocion = "", meses_promocion = "", porcentaje_descuento = "";
    if (form.forma_pago === PAGO_TC && opcionSel.tc_pvp != null && Number(opcionSel.tc_dsto) > 0) {
      precio_promocion     = fmt(opcionSel.tc_pvp);
      meses_promocion      = opcionSel.tc_facturas != null ? String(opcionSel.tc_facturas) : "";
      porcentaje_descuento = String(Math.round(Number(opcionSel.tc_dsto) * 100));
    } else if (PAGOS_CTA.includes(form.forma_pago) && opcionSel.cta_pvp != null && Number(opcionSel.cta_dsto) > 0) {
      precio_promocion     = fmt(opcionSel.cta_pvp);
      meses_promocion      = opcionSel.cta_facturas != null ? String(opcionSel.cta_facturas) : "";
      porcentaje_descuento = String(Math.round(Number(opcionSel.cta_dsto) * 100));
    }
    setForm(f => ({
      ...f,
      precio_regular_sin_imp: fmt(opcionSel.precio_sin_iva),
      precio_regular:         fmt(opcionSel.precio_con_iva),
      precio_promocion, meses_promocion, porcentaje_descuento,
    }));
  }, [opcionSel, form.forma_pago, usaCatalogo]);

  // Distribuidor se deriva del usuario logueado (empresa con la que se le creó la cuenta)
  const distribuidorDelUsuario = (user.empresa || "").toUpperCase();
  const distribuidorLocked = DISTRIBUIDORES.includes(distribuidorDelUsuario);

  // Pre-llenar código asesor + distribuidor desde el usuario logueado
  useEffect(() => {
    setForm(f => ({
      ...f,
      codigo_asesor: f.codigo_asesor || user.usuario || user.codigo || "",
      nombre_atc:    f.nombre_atc    || user.nombre  || user.usuario || "",
      distribuidor_autorizado: distribuidorLocked ? distribuidorDelUsuario : f.distribuidor_autorizado,
    }));
  }, []);

  const set = k => e => {
    const v = e?.target ? e.target.value : e;
    setForm(f => {
      const next = { ...f, [k]: v };
      // Si cambia el distribuidor (caso admin sin lock), limpiar supervisor para evitar mezclas
      if (k === "distribuidor_autorizado" && v !== f.distribuidor_autorizado) {
        next.supervisor = "";
      }
      // Cascada del catálogo: cambiar el tipo de plan reinicia plan/empaquetado/precios,
      // y cambiar el plan reinicia el empaquetado y sus precios
      if (k === "tipo_plan" && v !== f.tipo_plan) {
        next.plan_contratado_final = ""; next.servicios_digitales = "";
        next.precio_regular_sin_imp = ""; next.precio_regular = "";
        next.precio_promocion = ""; next.meses_promocion = ""; next.porcentaje_descuento = "";
      }
      if (k === "plan_contratado_final" && v !== f.plan_contratado_final) {
        next.servicios_digitales = "";
        next.precio_regular_sin_imp = ""; next.precio_regular = "";
        next.precio_promocion = ""; next.meses_promocion = ""; next.porcentaje_descuento = "";
      }
      return next;
    });
    setErrs(e => { const n = { ...e }; delete n[k]; return n; });
  };

  // Edad del cliente y regla de descuento 3ra edad: solo aplica con >=65 años,
  // ya no se vende por motivo de discapacidad
  const edadCliente = calcularEdad(form.fecha_nacimiento);
  const calificaPara3raEdad = edadCliente != null && edadCliente >= EDAD_MINIMA_3RA_EDAD;

  useEffect(() => {
    if (!calificaPara3raEdad && form.aplica_descuento_3ra_edad !== "NO" && form.aplica_descuento_3ra_edad !== "") {
      setForm(f => ({ ...f, aplica_descuento_3ra_edad: "NO" }));
    }
  }, [calificaPara3raEdad]);

  // El resumen se regenera automáticamente mientras el asesor no lo edite a mano
  useEffect(() => {
    if (resumenEditado) return;
    setForm(f => ({ ...f, resumen_venta: generarResumenVenta(f, user) }));
  }, [
    form.apellidos_cliente, form.nombres_cliente, form.genero_cliente,
    form.plan_contratado_final, form.tipo_plan, form.servicios_digitales,
    form.precio_regular_sin_imp, form.precio_regular, form.precio_promocion, form.meses_promocion, form.porcentaje_descuento,
    form.forma_pago, form.banco, form.ciclo_facturacion, form.costo_instalacion,
    form.descuento_instalacion, form.beneficios_adicionales, form.beneficios_de_ley,
    form.plazo_contrato_meses, resumenEditado,
  ]);

  // ── Subida de documentos (cédula frontal/trasera, carnet, resumen firmado) ──
  const subirArchivo = async (campo, file) => {
    if (!file) return;
    setUploading(u => ({ ...u, [campo]: true }));
    try {
      const fd = new FormData();
      fd.append("archivo", file);
      // La cédula del cliente decide en qué carpeta queda el archivo en el
      // servidor de almacenamiento local. Si todavía no se llenó ese campo,
      // el backend usa una carpeta temporal por usuario.
      fd.append("numero_identificacion", form.numero_identificacion || "");
      const r = await fetch(`${API}/api/envios-ventas/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const d = await r.json();
      if (d.success) {
        setForm(f => ({ ...f, [campo]: d.url }));
      } else {
        setAlert({ tipo: "err", msg: d.error || `No se pudo subir el archivo (${campo}).` });
      }
    } catch {
      setAlert({ tipo: "err", msg: "Error de conexión al subir el archivo." });
    } finally {
      setUploading(u => ({ ...u, [campo]: false }));
    }
  };

  // ── Validación ─────────────────────────────────────────────────────────────
  // accion: "CARGAR" exige todos los obligatorios; "BORRADOR" permite guardar a medias
  const validar = (accion) => {
    if (accion === "BORRADOR") { setErrs({}); return true; }
    const e = {};
    if (!form.distribuidor_autorizado)   e.distribuidor_autorizado = "Requerido";
    if (!form.tipo_cliente)              e.tipo_cliente = "Requerido";
    if (!form.tipo_documento)            e.tipo_documento = "Requerido";
    if (!form.numero_identificacion.trim()) e.numero_identificacion = "Requerido";
    if (!form.apellidos_cliente.trim())  e.apellidos_cliente = "Requerido";
    if (!form.nombres_cliente.trim())    e.nombres_cliente = "Requerido";
    if (!form.calle_principal.trim())    e.calle_principal = "Requerido";
    if (!form.ciudad.trim())             e.ciudad = "Requerido";
    if (!form.telf_celular_pin.trim())   e.telf_celular_pin = "Requerido";
    if (!form.forma_pago)                e.forma_pago = "Requerido";
    if (!form.tipo_plan)                 e.tipo_plan = "Requerido";
    if (!form.origen_venta)              e.origen_venta = "Requerido";
    setErrs(e);
    if (Object.keys(e).length > 0) {
      // Scroll al primer error
      const firstErrEl = document.querySelector(".nv-err");
      firstErrEl?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return Object.keys(e).length === 0;
  };

  // ── Envío ──────────────────────────────────────────────────────────────────
  // accion: "CARGAR" (venta final, ya no editable) o "BORRADOR" (REGISTRAR VENTA, se puede retomar)
  const handleSubmit = async (accion) => {
    setAlert(null);
    if (!validar(accion)) {
      setAlert({ tipo: "err", msg: "Corrige los campos marcados antes de continuar." });
      return;
    }
    setLoad(accion);
    try {
      // Construir payload mapeado a columnas de envios_ventas
      const nombre_cliente_completo = `${form.apellidos_cliente.trim()} ${form.nombres_cliente.trim()}`.trim();
      const direccion_calles = [form.calle_principal, form.calle_secundaria].filter(Boolean).join(" y ");
      const resumenFinal = resumenEditado ? form.resumen_venta : generarResumenVenta(form, user);

      const payload = {
        accion,
        // asesor
        codigo_asesor:              form.codigo_asesor    || null,
        id_bitrix:                  form.id_bitrix        || null,
        distribuidor_autorizado:    form.distribuidor_autorizado || null,
        supervisor:                 form.supervisor       || null,
        clausulas:                  form.biometrico       || null,  // biométrico → clausulas
        nombre_atc:                 user.nombre || user.usuario || null,
        // cliente
        tipo_cliente:               form.tipo_cliente     || null,
        tipo_documento:             form.tipo_documento   || null,
        numero_identificacion:      form.numero_identificacion || null,
        nombre_cliente_completo,
        genero_cliente:             form.genero_cliente   || null,
        estado_civil:               form.estado_civil     || null,
        fecha_nacimiento:           form.fecha_nacimiento || null,
        aplica_descuento_3ra_edad:  form.aplica_descuento_3ra_edad || null,
        tipo_vivienda:              form.regimen_vivienda || null,
        regimen_vivienda:           form.tipo_inmueble    || null,
        // dirección
        direccion_calles,
        provincia:                  form.provincia        || null,
        ciudad:                     form.ciudad           || null,
        parroquia_barrio:           form.parroquia_barrio || null,
        direccion_manzana_villa:    form.manzana_villa    || null,
        referencia_ubicacion:       form.referencia_ubicacion || null,
        coordenadas_gps:            form.coordenadas_gps  || null,
        // contacto
        telf_celular_pin:           form.telf_celular_pin || null,
        telf_celular_2:             form.telf_instalacion || null,
        email_cliente:              form.email_cliente    || null,
        // plan
        forma_pago:                 form.forma_pago       || null,
        plan_contratado_final:      [form.tipo_plan, form.plan_contratado_final].filter(Boolean).join(" — ") || null,
        servicios_digitales:        form.servicios_digitales || null,
        tipo_contrato:              form.servicio_adicional || null,
        // resumen de venta
        banco:                      form.banco || null,
        ciclo_facturacion:          form.ciclo_facturacion || null,
        costo_instalacion:          form.costo_instalacion || null,
        descuento_instalacion:      form.descuento_instalacion || null,
        beneficios_adicionales:     form.beneficios_adicionales || null,
        beneficios_de_ley:          form.beneficios_de_ley || null,
        plazo_contrato_meses:       form.plazo_contrato_meses || null,
        resumen_venta:              resumenFinal || null,
        foto_cedula_frontal:        form.foto_cedula_frontal || null,
        foto_cedula_trasera:        form.foto_cedula_trasera || null,
        foto_carnet:                form.foto_carnet || null,
        archivo_resumen:            form.archivo_resumen || null,
        // cierre
        origen_venta:               form.origen_venta     || null,
        turno:                      form.turno            || null,
        venta_nueva_o_reingreso:    "NUEVA",
        novedades_atc:              form.observacion_venta || null,
      };

      const url    = borradorId ? `${API}/api/envios-ventas/${borradorId}` : `${API}/api/envios-ventas`;
      const method = borradorId ? "PUT" : "POST";

      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.success) {
        if (accion === "BORRADOR") {
          setAlert({ tipo: "ok", msg: `Borrador guardado (#${d.data.id}). Te llevamos a "Mis ventas pendientes".` });
          setTimeout(() => navigate("/mis-ventas-pendientes"), 900);
        } else {
          setSucc({
            id:     d.data.id,
            nombre: nombre_cliente_completo,
            plan:   payload.plan_contratado_final,
          });
          setForm(INIT);
          setResumenEditado(false);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      } else {
        setAlert({ tipo: "err", msg: d.error || "Error al registrar la venta." });
      }
    } catch {
      setAlert({ tipo: "err", msg: "Error de conexión con el servidor." });
    } finally { setLoad(null); }
  };

  const err = k => errs[k]
    ? <span className="nv-err">⚠ {errs[k]}</span>
    : null;

  // ── Success screen ────────────────────────────────────────────────────────
  if (success) return (
    <>
      <style>{css}</style>
      <div className="nv-page">
        <div className="nv-header">
          <div className="nv-logo">📡</div>
          <div>
            <p className="nv-title">Ingreso de Venta · Netlife</p>
            <p className="nv-sub">Distribuidor autorizado</p>
          </div>
        </div>
        <div className="nv-body">
          <div className="nv-success">
            <div className="nv-success-icon">✅</div>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: "#1C1C2E", margin: "0 0 8px" }}>
              ¡Venta registrada!
            </h2>
            <p style={{ color: "#8B5E3C", marginBottom: 4, fontWeight: 700 }}>{success.nombre}</p>
            <p style={{ color: O, fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{success.plan}</p>
            <p style={{ color: "#A07850", fontSize: 13, marginBottom: 28 }}>ID interno #{success.id} · Estado: <strong>PENDIENTE</strong></p>
            <p style={{ fontSize: 13, color: "#8B5E3C", marginBottom: 28, maxWidth: 340, margin: "0 auto 28px" }}>
              La venta quedará en revisión del equipo de backoffice. ¡Bien hecho! 🎉
            </p>
            <button className="nv-btn-submit" style={{ maxWidth: 280, margin: "0 auto" }} onClick={() => setSucc(null)}>
              ➕ Ingresar otra venta
            </button>
          </div>
        </div>
      </div>
    </>
  );

  // ── Formulario ────────────────────────────────────────────────────────────
  return (
    <>
      <style>{css}</style>
      <div className="nv-page">

        {/* Header */}
        <div className="nv-header">
          <div className="nv-logo">📡</div>
          <div>
            <p className="nv-title">Ingreso de Venta · Netlife</p>
            <p className="nv-sub">Distribuidor autorizado · {user.nombre || user.usuario || "Asesor"}</p>
          </div>
          <div className="nv-badge">🟠 NUEVA VENTA</div>
        </div>

        <div className="nv-body">

          {alert && (
            <div className={`nv-alert ${alert.tipo}`}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{alert.tipo === "ok" ? "✅" : "❌"}</span>
              {alert.msg}
            </div>
          )}

          {/* ── 1. Datos del asesor ── */}
          <Seccion num={1} icon="🧑‍💼" label="Datos del asesor">
            <Row label="Código de asesor">
              <FIn value={form.codigo_asesor} onChange={set("codigo_asesor")} placeholder="Ej: ATN-0042" />
            </Row>
            <Row label="ID Bitrix">
              <FIn value={form.id_bitrix} onChange={set("id_bitrix")} placeholder="Ej: 12345" />
            </Row>
            <Row label="Distribuidor" required>
              {distribuidorLocked ? (
                <div className="nv-auto">
                  🔒 {form.distribuidor_autorizado}
                  <span style={{ fontWeight: 400, marginLeft: 4 }}>(según tu usuario)</span>
                </div>
              ) : (
                <Chips value={form.distribuidor_autorizado} onChange={set("distribuidor_autorizado")} options={DISTRIBUIDORES} />
              )}
              {err("distribuidor_autorizado")}
            </Row>
            <Row label="Supervisor">
              <FSel
                value={form.supervisor}
                onChange={set("supervisor")}
                options={SUPERVISORES[form.distribuidor_autorizado] || []}
                placeholder={form.distribuidor_autorizado ? "Selecciona supervisor…" : "Primero selecciona el distribuidor"}
              />
            </Row>
          </Seccion>

          {/* ── 2. Datos del cliente ── */}
          <Seccion num={2} icon="👤" label="Datos del cliente">
            <Row label="Biométrico">
              <Chips value={form.biometrico} onChange={set("biometrico")} options={BIOMETRICO} />
            </Row>
            <Row label="Tipo de cliente" required>
              <Chips value={form.tipo_cliente} onChange={set("tipo_cliente")} options={TIPOS_CLI} />
              {err("tipo_cliente")}
            </Row>
            <Row label="Documento de identidad" required>
              <FSel value={form.tipo_documento} onChange={set("tipo_documento")} options={TIPOS_DOC} />
              {err("tipo_documento")}
            </Row>
            <Row label="Número de identificación" required>
              <FIn value={form.numero_identificacion} onChange={set("numero_identificacion")} placeholder="Ej: 1712345678" />
              {err("numero_identificacion")}
            </Row>
            <Row label="Apellidos completos" required>
              <FIn value={form.apellidos_cliente} onChange={set("apellidos_cliente")} placeholder="Primer y segundo apellido" />
              {err("apellidos_cliente")}
            </Row>
            <Row label="Nombres completos" required>
              <FIn value={form.nombres_cliente} onChange={set("nombres_cliente")} placeholder="Primer y segundo nombre" />
              {err("nombres_cliente")}
            </Row>
            <Row label="Género">
              <Chips value={form.genero_cliente} onChange={set("genero_cliente")} options={GENEROS} />
            </Row>
            <Row label="Estado civil">
              <FSel value={form.estado_civil} onChange={set("estado_civil")} options={ESTADOS_CIV} />
            </Row>
            <Row label="Fecha de nacimiento">
              <FIn type="date" value={form.fecha_nacimiento} onChange={set("fecha_nacimiento")} />
              {edadCliente != null && (
                <span style={{ fontSize: 11, color: calificaPara3raEdad ? "#15803d" : "#7C3A00", marginLeft: 8 }}>
                  {edadCliente} años{calificaPara3raEdad ? " · califica para 3ra edad" : ""}
                </span>
              )}
            </Row>
            <Row label="El cliente vive en">
              <FSel value={form.tipo_inmueble} onChange={set("tipo_inmueble")} options={TIPO_INMUEBLE} />
            </Row>
            <Row label="Descuento 3ra edad">
              <Chips
                value={form.aplica_descuento_3ra_edad}
                onChange={set("aplica_descuento_3ra_edad")}
                options={DESCUENTO_3ERA}
                disabledOptions={calificaPara3raEdad ? [] : ["SÍ — POR 3RA EDAD"]}
              />
              {!calificaPara3raEdad && (
                <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
                  Solo se habilita con fecha de nacimiento que indique 65 años o más.
                </div>
              )}
            </Row>
            <Row label="Tipo de vivienda">
              <Chips value={form.regimen_vivienda} onChange={set("regimen_vivienda")} options={TIPO_VIV} />
            </Row>
          </Seccion>

          {/* ── 3. Dirección ── */}
          <Seccion num={3} icon="📍" label="Dirección de instalación">
            <Row label="Calle principal" required>
              <FIn value={form.calle_principal} onChange={set("calle_principal")} placeholder="Ej: Av. 10 de Agosto" />
              {err("calle_principal")}
            </Row>
            <Row label="Calle secundaria">
              <FIn value={form.calle_secundaria} onChange={set("calle_secundaria")} placeholder="Ej: Calle Colón" />
            </Row>
            <Row label="Provincia">
              <FIn value={form.provincia} onChange={set("provincia")} placeholder="Ej: Pichincha" />
            </Row>
            <Row label="Ciudad" required>
              <FIn value={form.ciudad} onChange={set("ciudad")} placeholder="Ej: Quito" />
              {err("ciudad")}
            </Row>
            <Row label="Parroquia / Barrio">
              <FIn value={form.parroquia_barrio} onChange={set("parroquia_barrio")} placeholder="Ej: La Mariscal" />
            </Row>
            <Row label="Manzana / Villa / Lote / Bloque">
              <FIn value={form.manzana_villa} onChange={set("manzana_villa")} placeholder="Ej: Mz. 4 Villa 12" />
            </Row>
            <Row label="Referencia de cómo llegar">
              <textarea
                className="nv-textarea"
                value={form.referencia_ubicacion}
                onChange={set("referencia_ubicacion")}
                placeholder="Ej: Frente al parque, casa amarilla con reja negra…"
                rows={2}
              />
            </Row>
            <Row label="Coordenadas GPS">
              <FIn value={form.coordenadas_gps} onChange={set("coordenadas_gps")} placeholder="-0.1807, -78.4678" />
            </Row>
          </Seccion>

          {/* ── 4. Contacto ── */}
          <Seccion num={4} icon="📞" label="Contacto">
            <Row label="Teléfono celular" required>
              <FIn type="tel" value={form.telf_celular_pin} onChange={set("telf_celular_pin")} placeholder="09XXXXXXXX" />
              {err("telf_celular_pin")}
            </Row>
            <Row label="Celular para instalación">
              <FIn type="tel" value={form.telf_instalacion} onChange={set("telf_instalacion")} placeholder="09XXXXXXXX (puede ser diferente)" />
            </Row>
            <Row label="Correo electrónico">
              <FIn type="email" value={form.email_cliente} onChange={set("email_cliente")} placeholder="correo@ejemplo.com" />
            </Row>
          </Seccion>

          {/* ── 5. Plan y pago ── */}
          <Seccion num={5} icon="📡" label="Plan y forma de pago">
            {hayCatalogo && vigenciaCat && (
              <Row label="Lista de precios vigente">
                <div className="nv-auto">📅 {vigenciaCat}</div>
              </Row>
            )}
            <Row label="Forma de pago" required>
              <FSel value={form.forma_pago} onChange={set("forma_pago")} options={FORMAS_PAGO} />
              {form.forma_pago === "EFECTIVO" && (
                <span style={{ fontSize: 11, color: "#A07850", fontWeight: 600 }}>
                  ℹ️ Con EFECTIVO no aplica precio promocional (solo tarjeta de crédito o cuenta).
                </span>
              )}
              {err("forma_pago")}
            </Row>
            <Row label="Tipo de plan" required>
              <Chips value={form.tipo_plan} onChange={set("tipo_plan")} options={TIPOS_PLAN} />
              {err("tipo_plan")}
            </Row>

            {form.tipo_plan === SOLO_ADICIONAL ? (
              /* Venta de solo servicio adicional: el asesor describe lo que pide el cliente */
              <>
                <Row label="Servicio adicional solicitado" required>
                  <FIn value={form.servicio_adicional} onChange={set("servicio_adicional")}
                    placeholder="Ej: Netlife Defense, Assistance PRO, Extender Dual Band…" />
                </Row>
                <Row label="Detalle / observación del servicio">
                  <FIn value={form.plan_contratado_final} onChange={set("plan_contratado_final")}
                    placeholder="Ej: se añade a plan existente del cliente" />
                </Row>
                <Row label="Precio regular (sin impuestos)">
                  <FIn value={form.precio_regular_sin_imp} onChange={set("precio_regular_sin_imp")} placeholder="Ej: 4,99" />
                </Row>
                <Row label="Precio regular (con impuestos)">
                  <FIn value={form.precio_regular} onChange={set("precio_regular")} placeholder="Ej: 5,74" />
                </Row>
              </>
            ) : (
              <>
                <Row label="Plan contratado (detalle)">
                  {usaCatalogo ? (
                    <FSel value={form.plan_contratado_final} onChange={set("plan_contratado_final")}
                      options={planesDelTipo}
                      placeholder={form.tipo_plan ? "Selecciona el plan…" : "Primero elige el tipo de plan"} />
                  ) : (
                    <FIn value={form.plan_contratado_final} onChange={set("plan_contratado_final")}
                      placeholder={form.tipo_plan ? "Ej: Plan 850 Mbps" : "Primero elige el tipo de plan"} />
                  )}
                </Row>
                <Row label="Servicio empaquetado">
                  {usaCatalogo ? (
                    <FSel value={form.servicios_digitales} onChange={set("servicios_digitales")}
                      options={empaquetadosDelPlan}
                      placeholder={form.plan_contratado_final ? "Selecciona el empaquetado…" : "Primero selecciona el plan"} />
                  ) : (
                    <FIn value={form.servicios_digitales} onChange={set("servicios_digitales")}
                      placeholder="Ej: Paramount+, Netlife Play, Extender…" />
                  )}
                </Row>
                {opcionSel && (opcionSel.velocidad || opcionSel.equipo || opcionSel.plan_promocion) && (
                  <Row label="Incluye">
                    <div style={{ fontSize: 12, color: "#8B5E3C", fontWeight: 600, lineHeight: 1.6 }}>
                      {opcionSel.velocidad     && <div>⚡ Velocidad: {opcionSel.velocidad}</div>}
                      {opcionSel.equipo        && <div>📶 Equipo: {opcionSel.equipo}</div>}
                      {opcionSel.plan_promocion && <div>🎁 Promo del plan: {opcionSel.plan_promocion}</div>}
                    </div>
                  </Row>
                )}
                <Row label="Servicio adicional">
                  <FIn value={form.servicio_adicional} onChange={set("servicio_adicional")}
                    placeholder="Ej: Netlife Defense, Assistance PRO…" />
                </Row>
                <Row label="Precio regular (sin impuestos)">
                  <FIn value={form.precio_regular_sin_imp} onChange={set("precio_regular_sin_imp")}
                    placeholder="Se llena automático al elegir el plan" readOnly={!!opcionSel} />
                </Row>
                <Row label="Precio regular (con impuestos)">
                  <FIn value={form.precio_regular} onChange={set("precio_regular")}
                    placeholder="Se llena automático al elegir el plan" readOnly={!!opcionSel} />
                </Row>
                <Row label="Precio con promoción">
                  <FIn value={form.precio_promocion} onChange={set("precio_promocion")}
                    placeholder={form.forma_pago === "EFECTIVO" ? "No aplica con EFECTIVO" : "Se llena automático según forma de pago"}
                    readOnly={!!opcionSel} />
                </Row>
                <Row label="Meses con promoción">
                  <FIn value={form.meses_promocion} onChange={set("meses_promocion")}
                    placeholder="Automático (facturas con promoción)" readOnly={!!opcionSel} />
                </Row>
                <Row label="% Descuento aplicado">
                  <FIn value={form.porcentaje_descuento} onChange={set("porcentaje_descuento")}
                    placeholder="Automático según forma de pago" readOnly={!!opcionSel} />
                </Row>
              </>
            )}
          </Seccion>

          {/* ── 6. Cierre y origen ── */}
          <Seccion num={6} icon="✅" label="Cierre y origen de la venta">
            <Row label="Origen de la venta" required>
              <FSel value={form.origen_venta} onChange={set("origen_venta")} options={ORIGENES} />
              {err("origen_venta")}
            </Row>
            <Row label="Observación de la venta">
              <textarea
                className="nv-textarea"
                value={form.observacion_venta}
                onChange={set("observacion_venta")}
                placeholder="Notas importantes sobre esta venta, acuerdos especiales, pendientes…"
                rows={3}
              />
            </Row>
          </Seccion>

          {/* ── 7. Resumen de venta (se genera automáticamente, antes de subir documentos) ── */}
          <Seccion num={7} icon="📝" label="Banco, facturación y resumen de venta">
            <Row label="Banco">
              <FIn value={form.banco} onChange={set("banco")} placeholder="Ej: Banco Pichincha" />
            </Row>
            <Row label="Ciclo de facturación">
              <FSel value={form.ciclo_facturacion} onChange={set("ciclo_facturacion")} options={CICLOS_FACT} />
            </Row>
            <Row label="Costo de instalación">
              <FIn value={form.costo_instalacion} onChange={set("costo_instalacion")} placeholder="Ej: 145" />
            </Row>
            <Row label="Descuento en instalación">
              <FIn value={form.descuento_instalacion} onChange={set("descuento_instalacion")} placeholder="Ej: 100% por contratar con Tarjeta de Crédito" />
            </Row>
            <Row label="Beneficios adicionales">
              <textarea
                className="nv-textarea"
                value={form.beneficios_adicionales}
                onChange={set("beneficios_adicionales")}
                placeholder={"Un beneficio por línea, ej:\n3 dispositivos con Licencia Kaspersky sin costo"}
                rows={2}
              />
            </Row>
            <Row label="Beneficios de Ley">
              <Chips value={form.beneficios_de_ley} onChange={set("beneficios_de_ley")} options={BENEFICIOS_LEY} />
            </Row>
            <Row label="Plazo del contrato (meses)">
              <FIn value={form.plazo_contrato_meses} onChange={set("plazo_contrato_meses")} placeholder="36" />
            </Row>
            <Row label="Resumen de venta (auto-generado)">
              <textarea
                className="nv-textarea"
                value={form.resumen_venta}
                onChange={(e) => { setResumenEditado(true); set("resumen_venta")(e); }}
                rows={10}
                style={{ fontFamily: "monospace", fontSize: 12 }}
              />
              <button
                type="button"
                className="nv-btn-reset"
                style={{ marginTop: 8, width: "auto", padding: "8px 16px" }}
                onClick={() => { setResumenEditado(false); setForm(f => ({ ...f, resumen_venta: generarResumenVenta(f, user) })); }}
              >
                🔄 Regenerar automáticamente
              </button>
            </Row>
          </Seccion>

          {/* ── 8. Documentos ── */}
          <Seccion num={8} icon="📎" label="Documentos de respaldo">
            <Row label="Cédula (frontal)">
              <FileUpload label="cédula frontal" value={form.foto_cedula_frontal} uploading={uploading.foto_cedula_frontal}
                onPick={(file) => subirArchivo("foto_cedula_frontal", file)} />
            </Row>
            <Row label="Cédula (trasera)">
              <FileUpload label="cédula trasera" value={form.foto_cedula_trasera} uploading={uploading.foto_cedula_trasera}
                onPick={(file) => subirArchivo("foto_cedula_trasera", file)} />
            </Row>
            <Row label="Foto carnet">
              <FileUpload label="foto carnet" value={form.foto_carnet} uploading={uploading.foto_carnet}
                onPick={(file) => subirArchivo("foto_carnet", file)} />
            </Row>
            <Row label="Resumen firmado / foto resumen">
              <FileUpload label="resumen" value={form.archivo_resumen} uploading={uploading.archivo_resumen}
                onPick={(file) => subirArchivo("archivo_resumen", file)} />
            </Row>
          </Seccion>

          {/* ── Botones de envío ── */}
          <div className="nv-submit-wrap">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: "10px 14px", background: OP, borderRadius: 10, border: `1px solid ${OB}` }}>
              <span style={{ fontSize: 18 }}>⚡</span>
              <span style={{ fontSize: 12, color: "#7C3A00", fontWeight: 700 }}>
                <strong>CARGAR VENTA</strong> la envía como definitiva (PENDIENTE para backoffice, ya no editable).
                <strong> REGISTRAR VENTA</strong> la guarda como borrador en "Mis ventas pendientes" para completarla luego.
              </span>
            </div>
            <button className="nv-btn-submit" onClick={() => handleSubmit("CARGAR")} disabled={!!loading}>
              {loading === "CARGAR"
                ? <><div className="nv-spin" /> Cargando venta…</>
                : <><span>📤</span> Cargar venta</>
              }
            </button>
            <button
              className="nv-btn-submit"
              style={{ marginTop: 10, background: "linear-gradient(135deg, #6B7280, #9CA3AF)", boxShadow: "0 6px 24px rgba(107,114,128,.35)" }}
              onClick={() => handleSubmit("BORRADOR")} disabled={!!loading}
            >
              {loading === "BORRADOR"
                ? <><div className="nv-spin" /> Guardando borrador…</>
                : <><span>💾</span> Registrar venta (guardar como borrador)</>
              }
            </button>
            <button className="nv-btn-reset" type="button" onClick={() => { setForm(INIT); setErrs({}); setAlert(null); setResumenEditado(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
              🗑️ Limpiar formulario
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
