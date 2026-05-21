// src/pages/Backoffice.jsx
// Módulo Backoffice — Auditoría de registros envios_ventas
// Solo ADMINISTRADOR (por ahora)
// Tabla izquierda + panel lateral derecho con datos + formulario de auditoría

import { useState, useEffect, useCallback, useRef } from "react";

const API = import.meta.env.VITE_API_URL;

// ─── Catálogos auditoría ──────────────────────────────────────────────────────
const CALIDAD_OPTS       = ["BUENA","REGULAR","MALA","PENDIENTE"];
const VENTA_EFECTIVA_OPTS= ["SI","NO","PENDIENTE"];
const AUDITORIA_DOC_OPTS = ["COMPLETA","INCOMPLETA","PENDIENTE","OBSERVADA"];
const ESTATUS_REG_OPTS   = ["REGULARIZADA","PENDIENTE","EN PROCESO","ANULADA","SIN NOVEDAD"];
const INCONSISTENCIA_OPTS= ["SI","NO"];

// ─── Estilos ──────────────────────────────────────────────────────────────────
const C = {
  // Layout
  page:   { display:"flex", flexDirection:"column", height:"100%", fontFamily:"'Inter','Segoe UI',sans-serif", color:"#f1f5f9", background:"#0f172a", minHeight:0, borderRadius:16, padding:20 },
  topBar: { display:"flex", alignItems:"center", gap:14, marginBottom:18, flexShrink:0 },
  iconBox:{ width:46, height:46, borderRadius:13, background:"linear-gradient(135deg,#6366f1,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0, boxShadow:"0 4px 16px rgba(99,102,241,.35)" },
  title:  { fontSize:22, fontWeight:800, color:"#f1f5f9", margin:0 },
  sub:    { fontSize:12, color:"#64748b", marginTop:2 },
  badge:  { marginLeft:"auto", display:"inline-flex", alignItems:"center", gap:6, background:"rgba(239,68,68,.13)", border:"1px solid rgba(239,68,68,.3)", color:"#fca5a5", borderRadius:8, padding:"4px 12px", fontSize:11, fontWeight:700, letterSpacing:".06em" },

  // Barra búsqueda
  searchBar:{ display:"flex", gap:10, marginBottom:14, flexShrink:0 },
  searchInput:{ flex:1, background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)", borderRadius:10, padding:"9px 14px", fontSize:13, color:"#f1f5f9", outline:"none" },
  btnRefresh:{ background:"rgba(99,102,241,.15)", border:"1px solid rgba(99,102,241,.3)", borderRadius:10, padding:"9px 16px", fontSize:13, fontWeight:700, color:"#a5b4fc", cursor:"pointer" },

  // Contenedor split
  split:  { display:"flex", gap:16, flex:1, minHeight:0, overflow:"hidden" },

  // Tabla
  tableWrap:{ flex:"0 0 auto", width:640, display:"flex", flexDirection:"column", background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.08)", borderRadius:16, overflow:"hidden" },
  tableScroll:{ overflowY:"auto", flex:1 },
  table:  { width:"100%", borderCollapse:"collapse", fontSize:12 },
  th:     { textAlign:"left", padding:"10px 12px", background:"rgba(255,255,255,.04)", borderBottom:"1px solid rgba(255,255,255,.08)", color:"#64748b", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:".12em", whiteSpace:"nowrap", position:"sticky", top:0, zIndex:1 },
  td:     { padding:"11px 12px", borderBottom:"1px solid rgba(255,255,255,.04)", color:"#cbd5e1", whiteSpace:"nowrap", cursor:"pointer" },
  trActive:{ background:"rgba(99,102,241,.18)" },
  trHover: { background:"rgba(255,255,255,.04)" },

  // Panel lateral
  panel:  { flex:1, display:"flex", flexDirection:"column", background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.09)", borderRadius:16, overflow:"hidden", minWidth:0 },
  panelEmpty:{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:16, color:"#475569" },

  panelHeader:{ padding:"16px 20px", borderBottom:"1px solid rgba(255,255,255,.08)", background:"rgba(255,255,255,.03)", display:"flex", alignItems:"center", gap:10, flexShrink:0 },
  panelScroll:{ flex:1, overflowY:"auto", padding:"20px" },

  // Secciones del panel
  section:{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:14, padding:"18px 20px", marginBottom:16 },
  sTitle: { fontSize:10, fontWeight:800, color:"#64748b", textTransform:"uppercase", letterSpacing:".14em", marginBottom:14, display:"flex", alignItems:"center", gap:7 },
  grid2:  { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 },
  grid3:  { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 },
  field:  { display:"flex", flexDirection:"column", gap:4 },
  label:  { fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".1em" },
  value:  { fontSize:13, color:"#e2e8f0", fontWeight:500, background:"rgba(255,255,255,.04)", borderRadius:8, padding:"8px 12px", minHeight:34 },
  valueEmpty:{ color:"#475569", fontStyle:"italic" },

  // Inputs auditoría
  auditInput:{ background:"rgba(255,255,255,.07)", border:"1px solid rgba(99,102,241,.25)", borderRadius:9, padding:"9px 12px", fontSize:13, color:"#f1f5f9", outline:"none", width:"100%", boxSizing:"border-box", transition:"border .15s" },
  auditSelect:{ background:"rgba(20,30,50,.9)", border:"1px solid rgba(99,102,241,.25)", borderRadius:9, padding:"9px 12px", fontSize:13, color:"#f1f5f9", outline:"none", width:"100%", boxSizing:"border-box", cursor:"pointer", appearance:"none" },
  auditTextarea:{ background:"rgba(255,255,255,.07)", border:"1px solid rgba(99,102,241,.25)", borderRadius:9, padding:"9px 12px", fontSize:13, color:"#f1f5f9", outline:"none", width:"100%", boxSizing:"border-box", resize:"vertical", minHeight:72, fontFamily:"inherit" },

  // Footer panel
  panelFooter:{ padding:"14px 20px", borderTop:"1px solid rgba(255,255,255,.08)", display:"flex", gap:10, justifyContent:"flex-end", flexShrink:0 },
  btnGuardar:{ background:"linear-gradient(135deg,#6366f1,#8b5cf6)", border:"none", borderRadius:10, padding:"10px 24px", fontSize:13, fontWeight:700, color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:7, boxShadow:"0 4px 14px rgba(99,102,241,.3)" },
  btnCancelar:{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:10, padding:"10px 18px", fontSize:13, fontWeight:600, color:"#94a3b8", cursor:"pointer" },

  // Alertas
  alertBase:{ borderRadius:10, padding:"10px 16px", marginBottom:12, fontSize:12, fontWeight:600, display:"flex", alignItems:"center", gap:8 },
  alertOk:  { background:"rgba(16,185,129,.12)", border:"1px solid rgba(16,185,129,.3)", color:"#34d399" },
  alertErr: { background:"rgba(239,68,68,.12)", border:"1px solid rgba(239,68,68,.3)", color:"#fca5a5" },
};

// ─── Badges coloreados ────────────────────────────────────────────────────────
function Badge({ value, tipo }) {
  if (!value) return <span style={{ color:"#475569", fontSize:11 }}>—</span>;
  const map = {
    venta_efectiva:{ SI:"#34d399", NO:"#f87171", PENDIENTE:"#fbbf24" },
    calidad:       { BUENA:"#34d399", REGULAR:"#fbbf24", MALA:"#f87171", PENDIENTE:"#94a3b8" },
    auditoria:     { COMPLETA:"#34d399", INCOMPLETA:"#f87171", PENDIENTE:"#fbbf24", OBSERVADA:"#fb923c" },
    estatus_reg:   { REGULARIZADA:"#34d399", PENDIENTE:"#fbbf24", "EN PROCESO":"#60a5fa", ANULADA:"#f87171", "SIN NOVEDAD":"#94a3b8" },
  };
  const color = (map[tipo] || {})[value] || "#94a3b8";
  return (
    <span style={{ background:`${color}22`, border:`1px solid ${color}55`, color, borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:700 }}>
      {value}
    </span>
  );
}

// ─── Valor read-only ──────────────────────────────────────────────────────────
function RO({ label, value }) {
  return (
    <div style={C.field}>
      <span style={C.label}>{label}</span>
      <div style={{ ...C.value, ...(value ? {} : C.valueEmpty) }}>
        {value || "—"}
      </div>
    </div>
  );
}

// ─── Select auditoría ─────────────────────────────────────────────────────────
function AuditSelect({ label, value, onChange, options, required }) {
  return (
    <div style={C.field}>
      <span style={{ ...C.label }}>{label}{required && <span style={{ color:"#f87171", marginLeft:3 }}>*</span>}</span>
      <select value={value} onChange={onChange} style={C.auditSelect}>
        <option value="">— seleccionar —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ─── Input auditoría ──────────────────────────────────────────────────────────
function AuditInput({ label, value, onChange, type="text", placeholder="" }) {
  return (
    <div style={C.field}>
      <span style={C.label}>{label}</span>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} style={C.auditInput} />
    </div>
  );
}

// ─── Textarea auditoría ───────────────────────────────────────────────────────
function AuditTextarea({ label, value, onChange, placeholder="" }) {
  return (
    <div style={C.field}>
      <span style={C.label}>{label}</span>
      <textarea value={value} onChange={onChange} placeholder={placeholder} style={C.auditTextarea} />
    </div>
  );
}

// ─── Estado inicial del formulario de auditoría ───────────────────────────────
const auditInit = {
  calidad_venta_analista: "", novedades_atc: "", venta_efectiva: "",
  auditoria_documentos: "", auditado_por: "", inconsistencia_documental: "",
  observacion_auditoria: "", errores_telcos: "", estatus_regularizacion: "",
  detalle_regularizacion: "", fecha_regularizacion_atc: "",
  mes_regularizacion: "", observacion_venta_original: "",
  observacion_gestion_cobranza: "",
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Backoffice() {
  const [registros, setRegistros]   = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [buscar, setBuscar]         = useState("");
  const [selId, setSelId]           = useState(null);
  const [detalle, setDetalle]       = useState(null);
  const [loadingDet, setLoadingDet] = useState(false);
  const [audit, setAudit]           = useState(auditInit);
  const [saving, setSaving]         = useState(false);
  const [alert, setAlert]           = useState(null);
  const [hovRow, setHovRow]         = useState(null);
  const buscarRef = useRef(null);

  // ── Guard: todos menos ASESOR ────────────────────────────────────────────────
  // IMPORTANTE: el layout guarda el usuario en "userProfile", no en "user"
  const isAdmin = (() => {
    try { const u = JSON.parse(localStorage.getItem("userProfile") || "{}"); return (u.perfil||"").toUpperCase() !== "ASESOR"; }
    catch(_){ return false; }
  })();
  const token = localStorage.getItem("token");

  // ── Cargar lista ─────────────────────────────────────────────────────────────
  const cargarLista = useCallback(async (q = "") => {
    setLoading(true);
    try {
      const qs = q ? `?buscar=${encodeURIComponent(q)}` : "";
      const r  = await fetch(`${API}/api/backoffice${qs}`, { headers:{ Authorization:`Bearer ${token}` } });
      const d  = await r.json();
      if (d.success) { setRegistros(d.data); setTotal(d.total); }
    } catch(_){} finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (isAdmin) cargarLista(); }, [isAdmin, cargarLista]);

  // ── Búsqueda con debounce ────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => cargarLista(buscar), 400);
    return () => clearTimeout(t);
  }, [buscar, cargarLista]);

  // ── Cargar detalle ───────────────────────────────────────────────────────────
  const abrirDetalle = useCallback(async (id) => {
    setSelId(id); setDetalle(null); setAlert(null); setLoadingDet(true);
    try {
      const r = await fetch(`${API}/api/backoffice/${id}`, { headers:{ Authorization:`Bearer ${token}` } });
      const d = await r.json();
      if (d.success) {
        setDetalle(d.data);
        // Poblar formulario con valores existentes
        setAudit({
          calidad_venta_analista:      d.data.calidad_venta_analista       || "",
          novedades_atc:               d.data.novedades_atc                || "",
          venta_efectiva:              d.data.venta_efectiva               || "",
          auditoria_documentos:        d.data.auditoria_documentos         || "",
          auditado_por:                d.data.auditado_por                 || "",
          inconsistencia_documental:   d.data.inconsistencia_documental    || "",
          observacion_auditoria:       d.data.observacion_auditoria        || "",
          errores_telcos:              d.data.errores_telcos               || "",
          estatus_regularizacion:      d.data.estatus_regularizacion       || "",
          detalle_regularizacion:      d.data.detalle_regularizacion       || "",
          fecha_regularizacion_atc:    d.data.fecha_regularizacion_atc
            ? String(d.data.fecha_regularizacion_atc).slice(0,10) : "",
          mes_regularizacion:          d.data.mes_regularizacion           || "",
          observacion_venta_original:  d.data.observacion_venta_original   || "",
          observacion_gestion_cobranza:d.data.observacion_gestion_cobranza || "",
        });
      }
    } catch(_){} finally { setLoadingDet(false); }
  }, [token]);

  // ── Guardar auditoría ────────────────────────────────────────────────────────
  const guardar = async () => {
    if (!selId) return;
    setSaving(true); setAlert(null);
    try {
      const r = await fetch(`${API}/api/backoffice/${selId}`, {
        method:"PUT",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify(audit),
      });
      const d = await r.json();
      if (d.success) {
        setAlert({ ok:true, msg:"Auditoría guardada correctamente ✅" });
        setDetalle(d.data);
        cargarLista(buscar); // refrescar tabla
      } else {
        setAlert({ ok:false, msg: d.error || "Error al guardar" });
      }
    } catch(_){
      setAlert({ ok:false, msg:"Error de conexión" });
    } finally { setSaving(false); }
  };

  const set = f => e => setAudit(a => ({ ...a, [f]: e.target.value }));

  // ── Guard ────────────────────────────────────────────────────────────────────
  if (!isAdmin) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"60vh",
      background:"#0f172a", borderRadius:16, padding:20 }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:12 }}>🔒</div>
        <p style={{ fontSize:18, fontWeight:700, color:"#fca5a5" }}>Acceso restringido</p>
        <p style={{ color:"#64748b" }}>Los asesores no tienen acceso a esta sección.</p>
      </div>
    </div>
  );

  return (
    <div style={{ ...C.page, height:"calc(100vh - 120px)" }}>

      {/* ── Top bar ── */}
      <div style={C.topBar}>
        <div style={C.iconBox}>🔍</div>
        <div>
          <h1 style={C.title}>Backoffice · Auditoría</h1>
          <p style={C.sub}>Revisión y auditoría de ventas registradas · envios_ventas</p>
        </div>
        <div style={C.badge}>🔐 NO DISPONIBLE PARA ASESORES</div>
      </div>

      {/* ── Búsqueda ── */}
      <div style={C.searchBar}>
        <input
          ref={buscarRef}
          value={buscar}
          onChange={e => setBuscar(e.target.value)}
          placeholder="🔎  Buscar por asesor, ID Bitrix, cliente, cédula, distribuidor…"
          style={C.searchInput}
        />
        <button onClick={() => cargarLista(buscar)} style={C.btnRefresh}>↻ Recargar</button>
        <span style={{ alignSelf:"center", fontSize:12, color:"#64748b", whiteSpace:"nowrap" }}>
          {total} registros
        </span>
      </div>

      {/* ── Split view ── */}
      <div style={C.split}>

        {/* ──── TABLA IZQUIERDA ──── */}
        <div style={C.tableWrap}>
          <div style={C.tableScroll}>
            {loading ? (
              <div style={{ padding:32, textAlign:"center", color:"#64748b" }}>Cargando…</div>
            ) : registros.length === 0 ? (
              <div style={{ padding:32, textAlign:"center", color:"#64748b" }}>Sin registros.</div>
            ) : (
              <table style={C.table}>
                <thead>
                  <tr>
                    {["ID","Fecha","Cód. Asesor","ID Bitrix","Cliente","Venta Ef.","Auditoría","Regulariz."].map(h => (
                      <th key={h} style={C.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {registros.map((r, i) => {
                    const activo = selId === r.id;
                    return (
                      <tr
                        key={r.id}
                        style={activo ? C.trActive : hovRow === i ? C.trHover : {}}
                        onMouseEnter={() => setHovRow(i)}
                        onMouseLeave={() => setHovRow(null)}
                        onClick={() => abrirDetalle(r.id)}
                      >
                        <td style={{ ...C.td, color:"#6366f1", fontWeight:700 }}>#{r.id}</td>
                        <td style={C.td}>{r.fecha_registro_sistema ? new Date(r.fecha_registro_sistema).toLocaleDateString("es-EC") : "—"}</td>
                        <td style={C.td}>{r.codigo_asesor || "—"}</td>
                        <td style={C.td}>{r.id_bitrix || "—"}</td>
                        <td style={{ ...C.td, maxWidth:130, overflow:"hidden", textOverflow:"ellipsis" }}>{r.nombre_cliente_completo || "—"}</td>
                        <td style={C.td}><Badge value={r.venta_efectiva} tipo="venta_efectiva" /></td>
                        <td style={C.td}><Badge value={r.auditoria_documentos} tipo="auditoria" /></td>
                        <td style={C.td}><Badge value={r.estatus_regularizacion} tipo="estatus_reg" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ──── PANEL DERECHO ──── */}
        {!selId ? (
          <div style={C.panelEmpty}>
            <span style={{ fontSize:40 }}>👈</span>
            <p style={{ fontSize:14, fontWeight:600 }}>Selecciona un registro para auditarlo</p>
          </div>
        ) : (
          <div style={C.panel}>

            {/* Header panel */}
            <div style={C.panelHeader}>
              <span style={{ fontSize:20 }}>📋</span>
              <div>
                <p style={{ margin:0, fontWeight:800, fontSize:15, color:"#f1f5f9" }}>
                  Registro #{selId}
                </p>
                <p style={{ margin:0, fontSize:11, color:"#64748b" }}>
                  {detalle ? `${detalle.codigo_asesor || "—"} · ${detalle.nombre_cliente_completo || "Sin nombre"}` : "Cargando…"}
                </p>
              </div>
              <button
                onClick={() => { setSelId(null); setDetalle(null); setAlert(null); }}
                style={{ marginLeft:"auto", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:8, width:32, height:32, cursor:"pointer", color:"#94a3b8", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}
              >✕</button>
            </div>

            {/* Contenido scroll */}
            {loadingDet ? (
              <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"#64748b" }}>Cargando detalle…</div>
            ) : detalle ? (
              <div style={C.panelScroll}>

                {/* Alerta */}
                {alert && (
                  <div style={{ ...C.alertBase, ...(alert.ok ? C.alertOk : C.alertErr) }}>
                    {alert.msg}
                  </div>
                )}

                {/* ── SECCIÓN 1: Datos del registro (READ-ONLY) ── */}
                <div style={C.section}>
                  <div style={C.sTitle}><span>📥</span> Datos del registro — solo lectura</div>
                  <div style={C.grid3}>
                    <RO label="Estatus envío"       value={detalle.estatus_envio} />
                    <RO label="Fecha registro"       value={detalle.fecha_registro_sistema ? new Date(detalle.fecha_registro_sistema).toLocaleString("es-EC") : null} />
                    <RO label="Código asesor"        value={detalle.codigo_asesor} />
                    <RO label="ID Bitrix"            value={detalle.id_bitrix} />
                    <RO label="Distribuidor"         value={detalle.distribuidor_autorizado} />
                    <RO label="Supervisor"           value={detalle.supervisor} />
                    <RO label="Origen venta"         value={detalle.origen_venta} />
                    <RO label="Tipo venta"           value={detalle.venta_nueva_o_reingreso} />
                    <RO label="Turno"                value={detalle.turno} />
                  </div>
                </div>

                {/* ── SECCIÓN 2: Datos del cliente (READ-ONLY) ── */}
                <div style={C.section}>
                  <div style={C.sTitle}><span>👤</span> Datos del cliente — solo lectura</div>
                  <div style={C.grid3}>
                    <RO label="Nombre completo"      value={detalle.nombre_cliente_completo} />
                    <RO label="Tipo documento"       value={detalle.tipo_documento} />
                    <RO label="N° identificación"    value={detalle.numero_identificacion} />
                    <RO label="Email"                value={detalle.email_cliente} />
                    <RO label="Teléfono 1"           value={detalle.telf_celular_pin} />
                    <RO label="Teléfono 2"           value={detalle.telf_celular_2} />
                    <RO label="Provincia"            value={detalle.provincia} />
                    <RO label="Ciudad"               value={detalle.ciudad} />
                    <RO label="Plan contratado"      value={detalle.plan_contratado_final} />
                    <RO label="Forma de pago"        value={detalle.forma_pago} />
                    <RO label="Valor pago"           value={detalle.valor_pago ? `$${detalle.valor_pago}` : null} />
                    <RO label="Tipo contrato"        value={detalle.tipo_contrato} />
                  </div>
                </div>

                {/* ── SECCIÓN 3: Campos de AUDITORÍA (EDITABLES) ── */}
                <div style={{ ...C.section, border:"1px solid rgba(99,102,241,.25)", background:"rgba(99,102,241,.05)" }}>
                  <div style={{ ...C.sTitle, color:"#a5b4fc" }}><span>✏️</span> Auditoría — campos editables</div>

                  <div style={{ ...C.grid3, marginBottom:12 }}>
                    <AuditSelect label="Venta efectiva"       value={audit.venta_efectiva}         onChange={set("venta_efectiva")}         options={VENTA_EFECTIVA_OPTS} required />
                    <AuditSelect label="Calidad venta"        value={audit.calidad_venta_analista}  onChange={set("calidad_venta_analista")}  options={CALIDAD_OPTS} />
                    <AuditSelect label="Auditoría documentos" value={audit.auditoria_documentos}    onChange={set("auditoria_documentos")}    options={AUDITORIA_DOC_OPTS} />
                    <AuditSelect label="Inconsistencia doc."  value={audit.inconsistencia_documental} onChange={set("inconsistencia_documental")} options={INCONSISTENCIA_OPTS} />
                    <AuditSelect label="Estatus regulariz."   value={audit.estatus_regularizacion}  onChange={set("estatus_regularizacion")}  options={ESTATUS_REG_OPTS} />
                    <AuditInput  label="Auditado por"         value={audit.auditado_por}            onChange={set("auditado_por")}            placeholder="Nombre del auditor" />
                  </div>

                  <div style={{ ...C.grid2, marginBottom:12 }}>
                    <AuditInput  label="Fecha regularización" value={audit.fecha_regularizacion_atc} onChange={set("fecha_regularizacion_atc")} type="date" />
                    <AuditInput  label="Mes regularización"   value={audit.mes_regularizacion}       onChange={set("mes_regularizacion")}       placeholder="Ej: MAYO" />
                  </div>

                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    <AuditTextarea label="Novedades ATC"             value={audit.novedades_atc}            onChange={set("novedades_atc")}            placeholder="Novedades del asesor…" />
                    <AuditTextarea label="Observación auditoría"     value={audit.observacion_auditoria}    onChange={set("observacion_auditoria")}    placeholder="Observaciones del auditor…" />
                    <AuditTextarea label="Errores TELCOS"            value={audit.errores_telcos}           onChange={set("errores_telcos")}           placeholder="Errores en sistemas TELCOS…" />
                    <AuditTextarea label="Detalle regularización"    value={audit.detalle_regularizacion}   onChange={set("detalle_regularizacion")}   placeholder="Detalle de la regularización…" />
                    <AuditTextarea label="Obs. venta original"       value={audit.observacion_venta_original}  onChange={set("observacion_venta_original")}  placeholder="Observación sobre la venta original…" />
                    <AuditTextarea label="Obs. gestión cobranza"     value={audit.observacion_gestion_cobranza} onChange={set("observacion_gestion_cobranza")} placeholder="Observaciones de cobranza…" />
                  </div>
                </div>

              </div>
            ) : null}

            {/* Footer con botones */}
            {detalle && (
              <div style={C.panelFooter}>
                <button onClick={() => { setAudit(auditInit); setAlert(null); }} style={C.btnCancelar} disabled={saving}>
                  Limpiar
                </button>
                <button onClick={guardar} style={{ ...C.btnGuardar, opacity: saving ? .7 : 1 }} disabled={saving}>
                  {saving
                    ? <><span style={{ display:"inline-block", width:14, height:14, border:"2px solid #fff", borderTopColor:"transparent", borderRadius:"50%", animation:"spin .7s linear infinite" }} /> Guardando…</>
                    : <><span>💾</span> Guardar auditoría</>
                  }
                </button>
              </div>
            )}

          </div>
        )}
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
