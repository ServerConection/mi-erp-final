// src/pages/NuevaVenta.jsx
// Formulario de ingreso de venta — vista ASESOR
// Estilo: lista vertical tipo formulario · Branding Netlife naranja

import { useState, useEffect, useRef } from "react";

const API = import.meta.env.VITE_API_URL;

// ─── Catálogos exactos del proceso comercial ─────────────────────────────────
const DISTRIBUIDORES  = ["NOVONET", "VELSA"];
const BIOMETRICO      = ["FALTA BIOMÉTRICO", "FIRMÓ BIOMÉTRICO"];
const TIPOS_CLI       = ["NATURAL", "JURÍDICO"];
const TIPOS_DOC       = ["CÉDULA DE IDENTIDAD", "NÚMERO DE PASAPORTE", "RUC PERSONAL", "RUC EMPRESA"];
const GENEROS         = ["HOMBRE", "MUJER"];
const ESTADOS_CIV     = ["SOLTERO/A", "CASADO/A", "DIVORCIADO/A", "VIUDO/A", "UNIÓN LIBRE"];
const TIPO_INMUEBLE   = ["CASA NO REQUIERE LIBERAR", "EDIFICIO", "CONJUNTO", "PARA LIBERAR EDIFICIO", "PARA LIBERAR CONJUNTO", "HAY QUE ATAR CAJA"];
const DESCUENTO_3ERA  = ["NO", "SÍ — POR 3RA EDAD", "SÍ — POR DISCAPACIDAD"];
const TIPO_VIV        = ["ARRENDADA", "PROPIA", "DE UN FAMILIAR"];
const FORMAS_PAGO     = ["EFECTIVO", "TARJETA DE CRÉDITO", "CUENTA CORRIENTE", "CUENTA AHORROS"];
const TIPOS_PLAN      = ["CASA", "PROFESIONAL", "PYMES", "GAMER", "ADULTO MAYOR"];
const ORIGENES        = ["CAMPO", "CALL CENTER", "DIGITAL", "REFERIDO", "PUERTA A PUERTA", "EVENTO", "REINGRESO DIRECTO", "OTRO"];
const TURNOS          = ["MAÑANA", "TARDE", "NOCHE", "PARTIDO"];

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
};

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

function Chips({ value, onChange, options }) {
  return (
    <div className="nv-chips">
      {options.map(o => (
        <button
          key={o} type="button"
          className={`nv-chip${value === o ? " sel" : ""}`}
          onClick={() => onChange(o === value ? "" : o)}
        >
          {value === o && "✓ "}{o}
        </button>
      ))}
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
  const [form, setForm]     = useState(INIT);
  const [errs, setErrs]     = useState({});
  const [loading, setLoad]  = useState(false);
  const [alert, setAlert]   = useState(null);
  const [success, setSucc]  = useState(null);

  const userRaw = localStorage.getItem("user") || localStorage.getItem("userProfile") || "{}";
  const user    = (() => { try { return JSON.parse(userRaw); } catch { return {}; } })();
  const token   = localStorage.getItem("token");

  // Pre-llenar código asesor desde el usuario logueado
  useEffect(() => {
    setForm(f => ({
      ...f,
      codigo_asesor: f.codigo_asesor || user.usuario || user.codigo || "",
      nombre_atc:    f.nombre_atc    || user.nombre  || user.usuario || "",
    }));
  }, []);

  const set = k => e => {
    const v = e?.target ? e.target.value : e;
    setForm(f => ({ ...f, [k]: v }));
    setErrs(e => { const n = { ...e }; delete n[k]; return n; });
  };

  // ── Validación ─────────────────────────────────────────────────────────────
  const validar = () => {
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
  const handleSubmit = async () => {
    setAlert(null);
    if (!validar()) {
      setAlert({ tipo: "err", msg: "Corrige los campos marcados antes de continuar." });
      return;
    }
    setLoad(true);
    try {
      // Construir payload mapeado a columnas de envios_ventas
      const nombre_cliente_completo = `${form.apellidos_cliente.trim()} ${form.nombres_cliente.trim()}`.trim();
      const direccion_calles = [form.calle_principal, form.calle_secundaria].filter(Boolean).join(" y ");

      const payload = {
        // sistema
        estatus_envio:              "PENDIENTE",
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
        // cierre
        origen_venta:               form.origen_venta     || null,
        turno:                      form.turno            || null,
        venta_nueva_o_reingreso:    "NUEVA",
        novedades_atc:              form.observacion_venta || null,
      };

      const r = await fetch(`${API}/api/envios-ventas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.success) {
        setSucc({
          id:     d.data.id,
          nombre: nombre_cliente_completo,
          plan:   payload.plan_contratado_final,
        });
        setForm(INIT);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setAlert({ tipo: "err", msg: d.error || "Error al registrar la venta." });
      }
    } catch {
      setAlert({ tipo: "err", msg: "Error de conexión con el servidor." });
    } finally { setLoad(false); }
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
              <Chips value={form.distribuidor_autorizado} onChange={set("distribuidor_autorizado")} options={DISTRIBUIDORES} />
              {err("distribuidor_autorizado")}
            </Row>
            <Row label="Supervisor">
              <FIn value={form.supervisor} onChange={set("supervisor")} placeholder="Nombre del supervisor" />
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
            </Row>
            <Row label="El cliente vive en">
              <FSel value={form.tipo_inmueble} onChange={set("tipo_inmueble")} options={TIPO_INMUEBLE} />
            </Row>
            <Row label="Descuento 3ra edad / discapacidad">
              <Chips value={form.aplica_descuento_3ra_edad} onChange={set("aplica_descuento_3ra_edad")} options={DESCUENTO_3ERA} />
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
            <Row label="Forma de pago" required>
              <FSel value={form.forma_pago} onChange={set("forma_pago")} options={FORMAS_PAGO} />
              {err("forma_pago")}
            </Row>
            <Row label="Tipo de plan" required>
              <Chips value={form.tipo_plan} onChange={set("tipo_plan")} options={TIPOS_PLAN} />
              {err("tipo_plan")}
            </Row>
            <Row label="Plan contratado (detalle)">
              <FIn value={form.plan_contratado_final} onChange={set("plan_contratado_final")} placeholder="Ej: 1300 Mbps · $16.96 · Promo 50%" />
            </Row>
            <Row label="Servicio empaquetado">
              <FIn value={form.servicios_digitales} onChange={set("servicios_digitales")} placeholder="Ej: Paramount+, Netlife Play, Extender…" />
            </Row>
            <Row label="Servicio adicional">
              <FIn value={form.servicio_adicional} onChange={set("servicio_adicional")} placeholder="Ej: Netlife Defense, Assistance PRO…" />
            </Row>
          </Seccion>

          {/* ── 6. Cierre y origen ── */}
          <Seccion num={6} icon="✅" label="Cierre y origen de la venta">
            <Row label="Origen de la venta" required>
              <FSel value={form.origen_venta} onChange={set("origen_venta")} options={ORIGENES} />
              {err("origen_venta")}
            </Row>
            <Row label="Turno">
              <Chips value={form.turno} onChange={set("turno")} options={TURNOS} />
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

          {/* ── Botón enviar ── */}
          <div className="nv-submit-wrap">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: "10px 14px", background: OP, borderRadius: 10, border: `1px solid ${OB}` }}>
              <span style={{ fontSize: 18 }}>⚡</span>
              <span style={{ fontSize: 12, color: "#7C3A00", fontWeight: 700 }}>
                Al enviar, la venta queda en estado <strong>PENDIENTE</strong> para revisión del equipo de backoffice.
              </span>
            </div>
            <button className="nv-btn-submit" onClick={handleSubmit} disabled={loading}>
              {loading
                ? <><div className="nv-spin" /> Registrando venta…</>
                : <><span>📤</span> Registrar venta</>
              }
            </button>
            <button className="nv-btn-reset" type="button" onClick={() => { setForm(INIT); setErrs({}); setAlert(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
              🗑️ Limpiar formulario
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
