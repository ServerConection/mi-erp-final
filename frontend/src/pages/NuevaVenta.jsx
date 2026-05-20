// src/pages/NuevaVenta.jsx
// Panel exclusivo ADMINISTRADOR — Ingreso manual de nueva venta
// Todas las columnas son TEXT en BD; el frontend usa inputs tipados
// y convierte todo a string antes de enviar.

import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL;

// ─── Catálogos ───────────────────────────────────────────────────────────────
const ESTATUSES   = ["PENDIENTE","ENVIADO","PROCESADO","RECHAZADO","EN REVISIÓN","APROBADO","ANULADO","DUPLICADO"];
const ORIGENES    = ["CAMPO","CALL CENTER","DIGITAL","REFERIDO","PUERTA A PUERTA","EVENTO","REINGRESO DIRECTO","OTRO"];
const TIPOS_VENTA = ["NUEVA","REINGRESO"];
const TURNOS      = ["MAÑANA","TARDE","NOCHE","PARTIDO"];
const TIPOS_DOC   = ["CÉDULA","PASAPORTE","RUC"];
const ESTADOS_CIV = ["SOLTERO/A","CASADO/A","DIVORCIADO/A","VIUDO/A","UNIÓN LIBRE"];
const GENEROS     = ["MASCULINO","FEMENINO","OTRO"];
const TIPOS_CLI   = ["NATURAL","JURÍDICO"];
const TIPOS_VIV   = ["PROPIA","ARRENDADA","FAMILIAR","OTRO"];
const REG_VIV     = ["URBANO","RURAL","SUBURBANO"];
const FORMAS_PAGO = ["EFECTIVO","TRANSFERENCIA","DÉBITO AUTOMÁTICO","CHEQUE","TARJETA"];
const TIPOS_CONT  = ["PREPAGO","POSTPAGO","CORPORATIVO"];
const SI_NO       = ["SÍ","NO"];

// ─── Helper: convierte fecha input (YYYY-MM-DD) → string ────────────────────
const fechaTexto = (v) => v || "";

// ─── Helper: deriva año, mes, dia de una fecha string YYYY-MM-DD ─────────────
const derivarFecha = (fechaStr) => {
  if (!fechaStr) return { año: "", mes: "", dia: "" };
  const [y, m, d] = fechaStr.split("-");
  const meses = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const dias  = ["","Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const date  = new Date(`${fechaStr}T12:00:00`);
  return {
    año:     y  || "",
    mes:     meses[parseInt(m, 10)] || "",
    dia_num: d  || "",
    dia_abc: dias[date.getDay()] || "",
  };
};

// ─── Estado inicial ──────────────────────────────────────────────────────────
const INIT = {
  // Bloque 1 — Venta
  estatus_envio: "", codigo_asesor: "", id_bitrix: "",
  distribuidor_autorizado: "", supervisor: "",
  origen_venta: "", venta_nueva_o_reingreso: "", turno: "",
  nombre_atc: "", clausulas: "", lider_comercial: "",

  // Bloque 2 — Cliente
  tipo_cliente: "", genero_cliente: "", tipo_documento: "",
  numero_identificacion: "", nombre_cliente_completo: "",
  estado_civil: "", fecha_nacimiento: "",
  email_cliente: "", aplica_descuento_3ra_edad: "",
  telf_celular_pin: "", telf_celular_2: "", telf_fijo: "",

  // Bloque 3 — Dirección
  provincia: "", ciudad: "", parroquia_barrio: "",
  direccion_calles: "", direccion_manzana_villa: "",
  referencia_ubicacion: "", coordenadas_gps: "",
  tipo_vivienda: "", regimen_vivienda: "",

  // Bloque 4 — Plan / Pago
  plan_contratado_final: "", servicios_digitales: "",
  forma_pago: "", detalle_bancario_ahorros: "",
  valor_pago: "", tipo_contrato: "", links_documentos: "",

  // Bloque 5 — Recaudación
  estado_recaudacion: "", fecha_recaudada: "",

  // Bloque 6 — Netlife
  netlife_login: "", netlife_estatus_real: "",
  fecha_activacion_netlife: "",

  // Bloque 7 — Auditoría
  calidad_venta_analista: "", novedades_atc: "",
  venta_efectiva: "", auditoria_documentos: "",
  auditado_por: "", inconsistencia_documental: "",
  observacion_auditoria: "", errores_telcos: "",

  // Bloque 8 — Regularización
  estatus_regularizacion: "", detalle_regularizacion: "",
  fecha_regularizacion_atc: "", mes_regularizacion: "",
  observacion_venta_original: "", observacion_gestion_cobranza: "",

  // Bloque 9 — Agenda
  turno_agendado: "", fecha_agenda: "",
};

// ─── Estilos ─────────────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#0f172a 100%)",
    padding: "32px 24px 64px",
    fontFamily: "'Inter','Segoe UI',sans-serif",
    color: "#f1f5f9",
  },
  header: { display:"flex", alignItems:"center", gap:16, marginBottom:36 },
  iconBox: {
    width:52, height:52, borderRadius:14,
    background:"linear-gradient(135deg,#3b82f6,#6366f1)",
    display:"flex", alignItems:"center", justifyContent:"center",
    fontSize:24, flexShrink:0, boxShadow:"0 4px 20px rgba(99,102,241,.4)",
  },
  title:    { fontSize:26, fontWeight:800, color:"#f1f5f9", margin:0 },
  subtitle: { fontSize:13, color:"#64748b", marginTop:2 },
  badge: {
    display:"inline-flex", alignItems:"center", gap:6,
    background:"rgba(239,68,68,.15)", border:"1px solid rgba(239,68,68,.35)",
    color:"#fca5a5", borderRadius:8, padding:"4px 12px",
    fontSize:11, fontWeight:700, letterSpacing:".06em", marginLeft:"auto",
  },
  card: {
    background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.09)",
    borderRadius:18, padding:"28px 32px", marginBottom:20,
    backdropFilter:"blur(8px)",
  },
  sectionTitle: {
    fontSize:11, fontWeight:800, color:"#64748b",
    textTransform:"uppercase", letterSpacing:".14em",
    marginBottom:20, display:"flex", alignItems:"center", gap:8,
  },
  grid2: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:18 },
  grid3: { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:18 },
  grid4: { display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:18 },
  field: { display:"flex", flexDirection:"column", gap:6 },
  label: { fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".1em" },
  req:   { color:"#ef4444", marginLeft:3 },
  input: {
    background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)",
    borderRadius:10, padding:"11px 14px", fontSize:14, fontWeight:500,
    color:"#f1f5f9", outline:"none", width:"100%", boxSizing:"border-box",
    transition:"border .15s,box-shadow .15s",
  },
  inputFocus: { border:"1px solid #6366f1", boxShadow:"0 0 0 3px rgba(99,102,241,.15)" },
  select: {
    background:"rgba(30,41,59,.9)", border:"1px solid rgba(255,255,255,.12)",
    borderRadius:10, padding:"11px 14px", fontSize:14, fontWeight:500,
    color:"#f1f5f9", outline:"none", width:"100%", boxSizing:"border-box",
    cursor:"pointer", appearance:"none",
    backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")",
    backgroundRepeat:"no-repeat", backgroundPosition:"right 12px center",
    backgroundSize:18, paddingRight:40,
  },
  autoRow:  { display:"flex", gap:12, flexWrap:"wrap" },
  autoChip: {
    display:"flex", alignItems:"center", gap:6,
    background:"rgba(99,102,241,.12)", border:"1px solid rgba(99,102,241,.25)",
    borderRadius:8, padding:"6px 14px", fontSize:12, color:"#a5b4fc",
  },
  autoLabel: { color:"#64748b", fontSize:11 },
  btnRow: { display:"flex", gap:12, justifyContent:"flex-end", marginTop:8 },
  btnReset: {
    background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.12)",
    borderRadius:10, padding:"12px 24px", fontSize:14, fontWeight:600,
    color:"#94a3b8", cursor:"pointer",
  },
  btnSubmit: {
    background:"linear-gradient(135deg,#3b82f6,#6366f1)", border:"none",
    borderRadius:10, padding:"12px 32px", fontSize:14, fontWeight:700,
    color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:8,
    boxShadow:"0 4px 20px rgba(99,102,241,.35)",
  },
  alertBase:    { borderRadius:12, padding:"14px 18px", marginBottom:20, fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:10 },
  alertSuccess: { background:"rgba(16,185,129,.12)", border:"1px solid rgba(16,185,129,.3)", color:"#34d399" },
  alertError:   { background:"rgba(239,68,68,.12)",  border:"1px solid rgba(239,68,68,.3)",  color:"#fca5a5" },
  tableWrap: { overflowX:"auto", marginTop:4 },
  table: { width:"100%", borderCollapse:"collapse", fontSize:13 },
  th: { textAlign:"left", padding:"10px 14px", borderBottom:"1px solid rgba(255,255,255,.08)", color:"#64748b", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".1em", whiteSpace:"nowrap" },
  td: { padding:"12px 14px", borderBottom:"1px solid rgba(255,255,255,.05)", color:"#cbd5e1", whiteSpace:"nowrap" },
};

// ─── Sub-componentes ──────────────────────────────────────────────────────────
function FInput({ value, onChange, placeholder, type = "text", readOnly = false }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      readOnly={readOnly}
      style={{ ...S.input, ...(focused ? S.inputFocus : {}), ...(readOnly ? { opacity:.5, cursor:"not-allowed" } : {}) }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

function FSelect({ value, onChange, options, placeholder = "Seleccionar…" }) {
  return (
    <select value={value} onChange={onChange} style={S.select}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Field({ label, required, children }) {
  return (
    <div style={S.field}>
      <label style={S.label}>{label}{required && <span style={S.req}>*</span>}</label>
      {children}
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function NuevaVenta() {
  const [form, setForm]           = useState(INIT);
  const [loading, setLoading]     = useState(false);
  const [alert, setAlert]         = useState(null);
  const [historial, setHistorial] = useState([]);
  const [loadingHist, setLoadingHist] = useState(true);
  const [opciones, setOpciones]   = useState({ distribuidores:[], supervisores:[] });
  const [hovRow, setHovRow]       = useState(null);

  const isAdmin = (() => {
    try { const u = JSON.parse(localStorage.getItem("user") || "{}"); return (u.perfil || "").toUpperCase() !== "ASESOR"; }
    catch (_) { return false; }
  })();
  const token = localStorage.getItem("token");

  // ── Helpers de cambio ────────────────────────────────────────────────────
  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }));

  // Cuando cambia una fecha, también actualiza año/mes/dia derivados
  const setFecha = (campoFecha, campoAño, campoMes, campoDiaN, campoDiaA) => (e) => {
    const v = e.target.value; // YYYY-MM-DD
    const d = derivarFecha(v);
    setForm(f => ({
      ...f,
      [campoFecha]: fechaTexto(v),
      ...(campoAño  ? { [campoAño]:  d.año     } : {}),
      ...(campoMes  ? { [campoMes]:  d.mes     } : {}),
      ...(campoDiaN ? { [campoDiaN]: d.dia_num } : {}),
      ...(campoDiaA ? { [campoDiaA]: d.dia_abc } : {}),
    }));
  };

  // ── Cargar historial ─────────────────────────────────────────────────────
  const cargarHistorial = useCallback(async () => {
    try {
      setLoadingHist(true);
      const r = await fetch(`${API}/api/envios-ventas`, { headers:{ Authorization:`Bearer ${token}` } });
      const d = await r.json();
      if (d.success) setHistorial(d.data);
    } catch (_) {} finally { setLoadingHist(false); }
  }, [token]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch(`${API}/api/envios-ventas/opciones`, { headers:{ Authorization:`Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.success) setOpciones(d); }).catch(() => {});
    cargarHistorial();
  }, [isAdmin, token, cargarHistorial]);

  // ── Preparar payload: todo como string, nunca vacío → null ───────────────
  const buildPayload = () => {
    const p = {};
    Object.entries(form).forEach(([k, v]) => {
      p[k] = (v === "" || v === null || v === undefined) ? null : String(v).trim();
    });
    // fecha_registro_sistema la genera el backend al momento del INSERT
    // año/mes/dia son GENERATED ALWAYS AS en PostgreSQL — no se envían
    // IP la genera el backend
    return p;
  };

  // ── Envío ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setAlert(null);
    if (!form.estatus_envio)           return setAlert({ tipo:"error", msg:"Selecciona el estatus de envío." });
    if (!form.codigo_asesor.trim())    return setAlert({ tipo:"error", msg:"Ingresa el código de asesor." });
    if (!form.origen_venta)            return setAlert({ tipo:"error", msg:"Selecciona el origen de venta." });
    if (!form.venta_nueva_o_reingreso) return setAlert({ tipo:"error", msg:"Indica si es NUEVA o REINGRESO." });
    if (!form.turno)                   return setAlert({ tipo:"error", msg:"Selecciona el turno." });

    setLoading(true);
    try {
      const r = await fetch(`${API}/api/envios-ventas`, {
        method: "POST",
        headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify(buildPayload()),
      });
      const d = await r.json();
      if (d.success) {
        setAlert({ tipo:"success", msg:`Venta registrada correctamente (ID: ${d.data.id})` });
        setForm(INIT);
        cargarHistorial();
      } else {
        setAlert({ tipo:"error", msg: d.error || "Error al registrar la venta." });
      }
    } catch (_) {
      setAlert({ tipo:"error", msg:"Error de conexión con el servidor." });
    } finally { setLoading(false); }
  };

  if (!isAdmin) return (
    <div style={{ ...S.page, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🔒</div>
        <p style={{ fontSize:20, fontWeight:700, color:"#fca5a5" }}>Acceso restringido</p>
        <p style={{ color:"#64748b", marginTop:8 }}>Este módulo solo está disponible para administradores.</p>
      </div>
    </div>
  );

  const fechaStr = new Date().toLocaleString("es-EC", { timeZone:"America/Guayaquil" });

  return (
    <div style={S.page}>

      {/* Encabezado */}
      <div style={S.header}>
        <div style={S.iconBox}>💼</div>
        <div>
          <h1 style={S.title}>Ingresar Nueva Venta</h1>
          <p style={S.subtitle}>Panel de registro manual · envios_ventas</p>
        </div>
        <div style={S.badge}>🔐 SOLO ADMINISTRADORES</div>
      </div>

      {alert && (
        <div style={{ ...S.alertBase, ...(alert.tipo === "success" ? S.alertSuccess : S.alertError) }}>
          <span style={{ fontSize:18 }}>{alert.tipo === "success" ? "✅" : "❌"}</span>
          {alert.msg}
        </div>
      )}

      <form onSubmit={handleSubmit}>

        {/* ── Bloque 0: Datos automáticos ── */}
        <div style={S.card}>
          <div style={S.sectionTitle}><span>⚙️</span> Datos automáticos del sistema</div>
          <div style={S.autoRow}>
            <div style={S.autoChip}><span style={S.autoLabel}>Fecha:</span> {fechaStr}</div>
            <div style={S.autoChip}><span style={S.autoLabel}>Año / Mes / Día:</span> Se calculan automáticamente</div>
            <div style={S.autoChip}><span style={S.autoLabel}>IP:</span> Detectada por el servidor</div>
          </div>
        </div>

        {/* ── Bloque 1: Información de la venta ── */}
        <div style={S.card}>
          <div style={S.sectionTitle}><span>📋</span> Información de la venta</div>
          <div style={S.grid3}>
            <Field label="Estatus envío" required>
              <FSelect value={form.estatus_envio} onChange={set("estatus_envio")} options={ESTATUSES} />
            </Field>
            <Field label="Tipo de venta" required>
              <FSelect value={form.venta_nueva_o_reingreso} onChange={set("venta_nueva_o_reingreso")} options={TIPOS_VENTA} />
            </Field>
            <Field label="Origen de venta" required>
              <FSelect value={form.origen_venta} onChange={set("origen_venta")} options={ORIGENES} />
            </Field>
            <Field label="Turno" required>
              <FSelect value={form.turno} onChange={set("turno")} options={TURNOS} />
            </Field>
            <Field label="Código asesor" required>
              <FInput value={form.codigo_asesor} onChange={set("codigo_asesor")} placeholder="Ej: ATN-0042" />
            </Field>
            <Field label="ID Bitrix">
              <FInput value={form.id_bitrix} onChange={set("id_bitrix")} placeholder="Ej: 12345" type="number" />
            </Field>
            <Field label="Nombre ATC">
              <FInput value={form.nombre_atc} onChange={set("nombre_atc")} placeholder="Nombre del agente" />
            </Field>
            <Field label="Líder comercial">
              <FInput value={form.lider_comercial} onChange={set("lider_comercial")} placeholder="Nombre del líder" />
            </Field>
            <Field label="Cláusulas">
              <FInput value={form.clausulas} onChange={set("clausulas")} placeholder="Ej: C1, C2" />
            </Field>
          </div>
        </div>

        {/* ── Bloque 2: Estructura comercial ── */}
        <div style={S.card}>
          <div style={S.sectionTitle}><span>🏢</span> Estructura comercial</div>
          <div style={S.grid2}>
            <Field label="Distribuidor autorizado">
              {opciones.distribuidores.length > 0
                ? <FSelect value={form.distribuidor_autorizado} onChange={set("distribuidor_autorizado")} options={opciones.distribuidores} placeholder="Sin distribuidor…" />
                : <FInput value={form.distribuidor_autorizado} onChange={set("distribuidor_autorizado")} placeholder="Nombre del distribuidor" />
              }
            </Field>
            <Field label="Supervisor">
              {opciones.supervisores.length > 0
                ? <FSelect value={form.supervisor} onChange={set("supervisor")} options={opciones.supervisores} placeholder="Sin supervisor…" />
                : <FInput value={form.supervisor} onChange={set("supervisor")} placeholder="Nombre del supervisor" />
              }
            </Field>
          </div>
        </div>

        {/* ── Bloque 3: Datos del cliente ── */}
        <div style={S.card}>
          <div style={S.sectionTitle}><span>👤</span> Datos del cliente</div>
          <div style={S.grid3}>
            <Field label="Tipo de cliente">
              <FSelect value={form.tipo_cliente} onChange={set("tipo_cliente")} options={TIPOS_CLI} />
            </Field>
            <Field label="Género">
              <FSelect value={form.genero_cliente} onChange={set("genero_cliente")} options={GENEROS} />
            </Field>
            <Field label="Estado civil">
              <FSelect value={form.estado_civil} onChange={set("estado_civil")} options={ESTADOS_CIV} />
            </Field>
            <Field label="Tipo de documento">
              <FSelect value={form.tipo_documento} onChange={set("tipo_documento")} options={TIPOS_DOC} />
            </Field>
            <Field label="Número de identificación">
              <FInput value={form.numero_identificacion} onChange={set("numero_identificacion")} placeholder="Ej: 1712345678" />
            </Field>
            <Field label="Nombre completo del cliente">
              <FInput value={form.nombre_cliente_completo} onChange={set("nombre_cliente_completo")} placeholder="Apellidos y nombres" />
            </Field>
            {/* Fecha de nacimiento — input tipo date, se guarda como YYYY-MM-DD texto */}
            <Field label="Fecha de nacimiento">
              <FInput
                type="date"
                value={form.fecha_nacimiento}
                onChange={setFecha("fecha_nacimiento","año_nacimiento","mes_nacimiento","dia_num_nacimiento","dia_abc_nacimiento")}
              />
            </Field>
            <Field label="Email">
              <FInput value={form.email_cliente} onChange={set("email_cliente")} placeholder="correo@ejemplo.com" type="email" />
            </Field>
            <Field label="¿Aplica descuento 3ra edad?">
              <FSelect value={form.aplica_descuento_3ra_edad} onChange={set("aplica_descuento_3ra_edad")} options={SI_NO} />
            </Field>
          </div>
        </div>

        {/* ── Bloque 4: Contacto ── */}
        <div style={S.card}>
          <div style={S.sectionTitle}><span>📞</span> Contacto</div>
          <div style={S.grid3}>
            <Field label="Teléfono celular (PIN)">
              <FInput value={form.telf_celular_pin} onChange={set("telf_celular_pin")} placeholder="09XXXXXXXX" type="tel" />
            </Field>
            <Field label="Teléfono celular 2">
              <FInput value={form.telf_celular_2} onChange={set("telf_celular_2")} placeholder="09XXXXXXXX" type="tel" />
            </Field>
            <Field label="Teléfono fijo">
              <FInput value={form.telf_fijo} onChange={set("telf_fijo")} placeholder="02XXXXXXX" type="tel" />
            </Field>
          </div>
        </div>

        {/* ── Bloque 5: Dirección ── */}
        <div style={S.card}>
          <div style={S.sectionTitle}><span>📍</span> Dirección</div>
          <div style={S.grid3}>
            <Field label="Provincia">
              <FInput value={form.provincia} onChange={set("provincia")} placeholder="Ej: Pichincha" />
            </Field>
            <Field label="Ciudad">
              <FInput value={form.ciudad} onChange={set("ciudad")} placeholder="Ej: Quito" />
            </Field>
            <Field label="Parroquia / Barrio">
              <FInput value={form.parroquia_barrio} onChange={set("parroquia_barrio")} placeholder="Ej: La Mariscal" />
            </Field>
            <Field label="Dirección (calles)">
              <FInput value={form.direccion_calles} onChange={set("direccion_calles")} placeholder="Ej: Av. 10 de Agosto y Colón" />
            </Field>
            <Field label="Manzana / Villa">
              <FInput value={form.direccion_manzana_villa} onChange={set("direccion_manzana_villa")} placeholder="Ej: Mz. 4 Villa 12" />
            </Field>
            <Field label="Referencia">
              <FInput value={form.referencia_ubicacion} onChange={set("referencia_ubicacion")} placeholder="Ej: Frente al parque" />
            </Field>
            <Field label="Coordenadas GPS">
              <FInput value={form.coordenadas_gps} onChange={set("coordenadas_gps")} placeholder="Lat, Lng" />
            </Field>
            <Field label="Tipo de vivienda">
              <FSelect value={form.tipo_vivienda} onChange={set("tipo_vivienda")} options={TIPOS_VIV} />
            </Field>
            <Field label="Régimen de vivienda">
              <FSelect value={form.regimen_vivienda} onChange={set("regimen_vivienda")} options={REG_VIV} />
            </Field>
          </div>
        </div>

        {/* ── Bloque 6: Plan y pago ── */}
        <div style={S.card}>
          <div style={S.sectionTitle}><span>💳</span> Plan y pago</div>
          <div style={S.grid3}>
            <Field label="Plan contratado">
              <FInput value={form.plan_contratado_final} onChange={set("plan_contratado_final")} placeholder="Ej: Plan 200 Mbps" />
            </Field>
            <Field label="Servicios digitales">
              <FInput value={form.servicios_digitales} onChange={set("servicios_digitales")} placeholder="Ej: Netflix, Disney+" />
            </Field>
            <Field label="Forma de pago">
              <FSelect value={form.forma_pago} onChange={set("forma_pago")} options={FORMAS_PAGO} />
            </Field>
            <Field label="Detalle bancario / Ahorros">
              <FInput value={form.detalle_bancario_ahorros} onChange={set("detalle_bancario_ahorros")} placeholder="Banco, cuenta, etc." />
            </Field>
            <Field label="Valor de pago">
              {/* type number en UI, pero se guarda como texto */}
              <FInput value={form.valor_pago} onChange={set("valor_pago")} placeholder="Ej: 29.99" type="number" />
            </Field>
            <Field label="Tipo de contrato">
              <FSelect value={form.tipo_contrato} onChange={set("tipo_contrato")} options={TIPOS_CONT} />
            </Field>
            <Field label="Links de documentos">
              <FInput value={form.links_documentos} onChange={set("links_documentos")} placeholder="https://..." type="url" />
            </Field>
          </div>
        </div>

        {/* ── Bloque 7: Recaudación ── */}
        <div style={S.card}>
          <div style={S.sectionTitle}><span>💰</span> Recaudación</div>
          <div style={S.grid3}>
            <Field label="Estado recaudación">
              <FInput value={form.estado_recaudacion} onChange={set("estado_recaudacion")} placeholder="Ej: COBRADO" />
            </Field>
            <Field label="Fecha recaudada">
              <FInput
                type="date"
                value={form.fecha_recaudada}
                onChange={setFecha("fecha_recaudada","año_recaudada","mes_recaudada","dia_num_recaudada","dia_abc_recaudada")}
              />
            </Field>
          </div>
        </div>

        {/* ── Bloque 8: Netlife ── */}
        <div style={S.card}>
          <div style={S.sectionTitle}><span>🌐</span> Netlife</div>
          <div style={S.grid3}>
            <Field label="Login Netlife">
              <FInput value={form.netlife_login} onChange={set("netlife_login")} placeholder="usuario@netlife" />
            </Field>
            <Field label="Estatus real Netlife">
              <FInput value={form.netlife_estatus_real} onChange={set("netlife_estatus_real")} placeholder="Ej: ACTIVO" />
            </Field>
            <Field label="Fecha activación Netlife">
              <FInput
                type="date"
                value={form.fecha_activacion_netlife}
                onChange={setFecha("fecha_activacion_netlife","año_activacion_netlife","mes_activacion_netlife","dia_num_activacion_netlife","dia_abc_activacion_netlife")}
              />
            </Field>
          </div>
        </div>

        {/* ── Bloque 9: Auditoría ── */}
        <div style={S.card}>
          <div style={S.sectionTitle}><span>🔍</span> Auditoría</div>
          <div style={S.grid3}>
            <Field label="Calidad venta (analista)">
              <FInput value={form.calidad_venta_analista} onChange={set("calidad_venta_analista")} placeholder="Ej: BUENA" />
            </Field>
            <Field label="Novedades ATC">
              <FInput value={form.novedades_atc} onChange={set("novedades_atc")} placeholder="Observaciones" />
            </Field>
            <Field label="Venta efectiva">
              <FSelect value={form.venta_efectiva} onChange={set("venta_efectiva")} options={SI_NO} />
            </Field>
            <Field label="Auditoría documentos">
              <FInput value={form.auditoria_documentos} onChange={set("auditoria_documentos")} placeholder="Ej: COMPLETO" />
            </Field>
            <Field label="Auditado por">
              <FInput value={form.auditado_por} onChange={set("auditado_por")} placeholder="Nombre del auditor" />
            </Field>
            <Field label="Inconsistencia documental">
              <FInput value={form.inconsistencia_documental} onChange={set("inconsistencia_documental")} placeholder="Descripción" />
            </Field>
            <Field label="Observación auditoría">
              <FInput value={form.observacion_auditoria} onChange={set("observacion_auditoria")} placeholder="Observaciones" />
            </Field>
            <Field label="Errores Telcos">
              <FInput value={form.errores_telcos} onChange={set("errores_telcos")} placeholder="Descripción de errores" />
            </Field>
          </div>
        </div>

        {/* ── Bloque 10: Regularización ── */}
        <div style={S.card}>
          <div style={S.sectionTitle}><span>🔧</span> Regularización</div>
          <div style={S.grid3}>
            <Field label="Estatus regularización">
              <FInput value={form.estatus_regularizacion} onChange={set("estatus_regularizacion")} placeholder="Ej: REGULARIZADO" />
            </Field>
            <Field label="Detalle regularización">
              <FInput value={form.detalle_regularizacion} onChange={set("detalle_regularizacion")} placeholder="Descripción" />
            </Field>
            <Field label="Fecha regularización ATC">
              <FInput
                type="date"
                value={form.fecha_regularizacion_atc}
                onChange={setFecha("fecha_regularizacion_atc","año_regularizacion_atc","mes_regularizacion_atc","dia_num_regularizacion_atc","dia_abc_regularizacion_atc")}
              />
            </Field>
            <Field label="Mes regularización">
              <FInput value={form.mes_regularizacion} onChange={set("mes_regularizacion")} placeholder="Ej: Enero" />
            </Field>
            <Field label="Observación venta original">
              <FInput value={form.observacion_venta_original} onChange={set("observacion_venta_original")} placeholder="Observaciones" />
            </Field>
            <Field label="Observación gestión cobranza">
              <FInput value={form.observacion_gestion_cobranza} onChange={set("observacion_gestion_cobranza")} placeholder="Observaciones" />
            </Field>
          </div>
        </div>

        {/* ── Bloque 11: Agenda ── */}
        <div style={S.card}>
          <div style={S.sectionTitle}><span>📅</span> Agenda</div>
          <div style={S.grid2}>
            <Field label="Turno agendado">
              <FSelect value={form.turno_agendado} onChange={set("turno_agendado")} options={TURNOS} />
            </Field>
            <Field label="Fecha agenda">
              <FInput
                type="date"
                value={form.fecha_agenda}
                onChange={setFecha("fecha_agenda","año_agenda","mes_agenda","dia_num_agenda","dia_abc_agenda")}
              />
            </Field>
          </div>
        </div>

        {/* Botones */}
        <div style={S.btnRow}>
          <button type="button" style={S.btnReset} onClick={() => { setForm(INIT); setAlert(null); }} disabled={loading}>
            Limpiar
          </button>
          <button type="submit" style={{ ...S.btnSubmit, opacity: loading ? .7 : 1 }} disabled={loading}>
            {loading
              ? <><span style={{ display:"inline-block", width:16, height:16, border:"2px solid #fff", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} /> Registrando…</>
              : <><span style={{ fontSize:18 }}>💾</span> Registrar venta</>
            }
          </button>
        </div>

      </form>

      {/* ── Historial reciente ── */}
      <div style={{ ...S.card, marginTop:28 }}>
        <div style={{ ...S.sectionTitle, marginBottom:16 }}>
          <span>📑</span> Últimas ventas registradas
          <button onClick={cargarHistorial} style={{ marginLeft:"auto", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, padding:"4px 12px", fontSize:11, color:"#94a3b8", cursor:"pointer" }}>
            ↻ Actualizar
          </button>
        </div>
        {loadingHist ? (
          <p style={{ color:"#64748b", textAlign:"center", padding:24 }}>Cargando historial…</p>
        ) : historial.length === 0 ? (
          <p style={{ color:"#64748b", textAlign:"center", padding:24 }}>No hay registros aún.</p>
        ) : (
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  {["ID","Estatus","Fecha registro","Cód. Asesor","ID Bitrix","Distribuidor","Supervisor","Origen","Tipo","Turno"].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historial.map((r, i) => (
                  <tr key={r.id} style={hovRow === i ? { background:"rgba(255,255,255,.025)" } : {}} onMouseEnter={() => setHovRow(i)} onMouseLeave={() => setHovRow(null)}>
                    <td style={{ ...S.td, color:"#6366f1", fontWeight:700 }}>#{r.id}</td>
                    <td style={S.td}>
                      <span style={{
                        background: r.estatus_envio === "APROBADO" ? "rgba(16,185,129,.2)" : r.estatus_envio === "RECHAZADO" ? "rgba(239,68,68,.2)" : r.estatus_envio === "PENDIENTE" ? "rgba(234,179,8,.2)" : "rgba(99,102,241,.15)",
                        color: r.estatus_envio === "APROBADO" ? "#34d399" : r.estatus_envio === "RECHAZADO" ? "#fca5a5" : r.estatus_envio === "PENDIENTE" ? "#fde047" : "#a5b4fc",
                        borderRadius:6, padding:"3px 10px", fontSize:11, fontWeight:700,
                      }}>
                        {r.estatus_envio}
                      </span>
                    </td>
                    <td style={S.td}>{r.fecha_registro_sistema || "—"}</td>
                    <td style={S.td}>{r.codigo_asesor || "—"}</td>
                    <td style={S.td}>{r.id_bitrix || "—"}</td>
                    <td style={S.td}>{r.distribuidor_autorizado || "—"}</td>
                    <td style={S.td}>{r.supervisor || "—"}</td>
                    <td style={S.td}>{r.origen_venta || "—"}</td>
                    <td style={S.td}>
                      <span style={{ background: r.venta_nueva_o_reingreso === "NUEVA" ? "rgba(59,130,246,.2)" : "rgba(168,85,247,.2)", color: r.venta_nueva_o_reingreso === "NUEVA" ? "#60a5fa" : "#c084fc", borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:700 }}>
                        {r.venta_nueva_o_reingreso || "—"}
                      </span>
                    </td>
                    <td style={S.td}>{r.turno || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}