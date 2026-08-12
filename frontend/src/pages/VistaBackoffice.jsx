import { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_URL;

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
};

function fmtValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function valueForField(row, key) {
  const v = row?.[key];
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
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

  const token = localStorage.getItem("token");

  const fetchRows = async (q = "") => {
    try {
      setLoading(true);
      const qs = q ? `?buscar=${encodeURIComponent(q)}` : "";
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
    fetchRows(search);
  }, [search]);

  const fetchDetail = async (id) => {
    try {
      const res = await fetch(`${API}/api/backoffice/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Registro no encontrado");
      setDetail(json.data || initialDetail);
      setShowModal(true);
    } catch (e) {
      setAlert({ type: "error", msg: e.message || "Error al cargar detalle" });
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedId(null);
  };

  const tableHeaders = useMemo(() => {
    return TABLE_COLUMNS.slice(0, 12).map((key) => ({ key, label: FIELD_LABELS[key] || key }));
  }, []);

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
    "foto_cedula_frontal","foto_cedula_trasera","foto_carnet"
  ], []);

  const handleInput = (key, value) => {
    setDetail((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    setAlert(null);
    try {
      const payload = {};
      editableFields.forEach((field) => {
        payload[field] = detail[field] ?? "";
      });

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

  const fieldGroups = useMemo(() => {
    const groups = [
      ["estatus_envio","codigo_asesor","id_bitrix","distribuidor_autorizado","supervisor","origen_venta"],
      ["nombre_cliente_completo","numero_identificacion","tipo_cliente","genero_cliente","fecha_nacimiento","email_cliente"],
      ["provincia","ciudad","parroquia_barrio","telf_celular_pin","telf_celular_2","direccion_calles"],
      ["plan_contratado_final","servicios_digitales","forma_pago","banco","ciclo_facturacion","costo_instalacion"],
      ["descuento_instalacion","beneficios_adicionales","beneficios_de_ley","plazo_contrato_meses","resumen_venta","referencia_ubicacion"],
      ["estado_recaudacion","netlife_login","netlife_estatus_real","calidad_venta_analista","venta_efectiva","auditoria_documentos"],
      ["auditado_por","inconsistencia_documental","observacion_auditoria","errores_telcos","estatus_regularizacion","detalle_regularizacion"],
      ["fecha_regularizacion_atc","mes_regularizacion","novedades_atc","observacion_venta_original","observacion_gestion_cobranza","turno"],
    ];

    return groups;
  }, []);

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
                onClick={() => fetchRows(search)}
                style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #c7d2fe", background: "#eef2ff", color: "#3730a3", fontWeight: 700, cursor: "pointer" }}
              >
                Refrescar
              </button>
            </div>

            <div style={{ overflow: "auto", maxHeight: 700 }}>
              {loading ? (
                <div style={{ padding: 28, textAlign: "center", color: "#64748b" }}>Cargando registros...</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                    <tr style={{ background: "#f8fafc" }}>
                      {tableHeaders.map((h) => (
                        <th key={h.key} style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e5e7eb", fontWeight: 800, color: "#475569", whiteSpace: "nowrap" }}>
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
                        style={{ cursor: "pointer", background: "#fff", borderBottom: "1px solid #f1f5f9" }}
                      >
                        {tableHeaders.map((h) => (
                          <td key={`${row.id}-${h.key}`} style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {fmtValue(valueForField(row, h.key))}
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
            <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", maxWidth: 700, width: "90%", maxHeight: "85vh", overflow: "auto" }}>
              {/* Header del modal */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: 24, borderBottom: "1px solid #e5e7eb", background: "#f8fafc" }}>
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
              <div style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, maxHeight: "calc(85vh - 140px)", overflow: "auto" }}>
                {editableFields.map((field) => (
                  <div key={field}>
                    <label style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
                      {FIELD_LABELS[field] || field}
                    </label>
                    {field.includes("foto_") ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (evt) => {
                                setDetail((prev) => ({ ...prev, [field]: evt.target?.result }));
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          style={{ display: "block", fontSize: 12, padding: "8px 0", color: "#111827" }}
                        />
                        {detail?.[field] && (
                          <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #dbe4f0", background: "#f8fafc", aspectRatio: "16/9" }}>
                            <img 
                              src={detail[field]} 
                              alt={field}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <input
                        value={detail?.[field] ?? ""}
                        onChange={(e) => setDetail((prev) => ({ ...prev, [field]: e.target.value }))}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #dbe4f0", fontSize: 12, outline: "none", color: "#111827", background: "#fff" }}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Footer con alerta y botones */}
              <div style={{ padding: 20, borderTop: "1px solid #e5e7eb", background: "#f8fafc" }}>
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
