// src/pages/NuevaVenta.jsx
// Panel exclusivo ADMINISTRADOR — Ingreso manual de nueva venta
// Inserta las 15 primeras columnas de public.envios_ventas

import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL;

// ─── Catálogos ───────────────────────────────────────────────────────────────
const ESTATUSES = [
  "PENDIENTE", "ENVIADO", "PROCESADO", "RECHAZADO", "EN REVISIÓN",
  "APROBADO", "ANULADO", "DUPLICADO",
];
const ORIGENES = [
  "CAMPO", "CALL CENTER", "DIGITAL", "REFERIDO", "PUERTA A PUERTA",
  "EVENTO", "REINGRESO DIRECTO", "OTRO",
];
const TIPOS_VENTA = ["NUEVA", "REINGRESO"];
const TURNOS      = ["MAÑANA", "TARDE", "NOCHE", "PARTIDO"];

// ─── Helpers UI ──────────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#0f172a 100%)",
    padding: "32px 24px 64px",
    fontFamily: "'Inter','Segoe UI',sans-serif",
    color: "#f1f5f9",
  },
  header: {
    display: "flex", alignItems: "center", gap: 16,
    marginBottom: 36,
  },
  iconBox: {
    width: 52, height: 52, borderRadius: 14,
    background: "linear-gradient(135deg,#3b82f6,#6366f1)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 24, flexShrink: 0,
    boxShadow: "0 4px 20px rgba(99,102,241,.4)",
  },
  title: { fontSize: 26, fontWeight: 800, color: "#f1f5f9", margin: 0 },
  subtitle: { fontSize: 13, color: "#64748b", marginTop: 2 },
  badge: {
    display: "inline-flex", alignItems: "center", gap: 6,
    background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.35)",
    color: "#fca5a5", borderRadius: 8, padding: "4px 12px",
    fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
    marginLeft: "auto",
  },

  // Formulario
  card: {
    background: "rgba(255,255,255,.04)",
    border: "1px solid rgba(255,255,255,.09)",
    borderRadius: 18, padding: "32px 36px", marginBottom: 20,
    backdropFilter: "blur(8px)",
  },
  sectionTitle: {
    fontSize: 11, fontWeight: 800, color: "#64748b",
    textTransform: "uppercase", letterSpacing: ".14em",
    marginBottom: 20, display: "flex", alignItems: "center", gap: 8,
  },
  grid2: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20,
  },
  grid3: {
    display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20,
  },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: {
    fontSize: 11, fontWeight: 700, color: "#94a3b8",
    textTransform: "uppercase", letterSpacing: ".1em",
  },
  required: { color: "#ef4444", marginLeft: 3 },
  input: {
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.12)",
    borderRadius: 10, padding: "11px 14px",
    fontSize: 14, fontWeight: 500, color: "#f1f5f9",
    outline: "none", transition: "border .15s,box-shadow .15s",
    width: "100%", boxSizing: "border-box",
  },
  inputFocus: {
    border: "1px solid #6366f1",
    boxShadow: "0 0 0 3px rgba(99,102,241,.15)",
  },
  select: {
    background: "rgba(30,41,59,.9)",
    border: "1px solid rgba(255,255,255,.12)",
    borderRadius: 10, padding: "11px 14px",
    fontSize: 14, fontWeight: 500, color: "#f1f5f9",
    outline: "none", width: "100%", boxSizing: "border-box",
    cursor: "pointer", appearance: "none",
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
    backgroundSize: 18,
    paddingRight: 40,
  },

  // Auto-info
  autoRow: {
    display: "flex", gap: 12, flexWrap: "wrap",
  },
  autoChip: {
    display: "flex", alignItems: "center", gap: 6,
    background: "rgba(99,102,241,.12)", border: "1px solid rgba(99,102,241,.25)",
    borderRadius: 8, padding: "6px 14px",
    fontSize: 12, color: "#a5b4fc",
  },
  autoLabel: { color: "#64748b", fontSize: 11 },

  // Botones
  btnRow: { display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 },
  btnReset: {
    background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)",
    borderRadius: 10, padding: "12px 24px",
    fontSize: 14, fontWeight: 600, color: "#94a3b8",
    cursor: "pointer", transition: "background .15s",
  },
  btnSubmit: {
    background: "linear-gradient(135deg,#3b82f6,#6366f1)",
    border: "none", borderRadius: 10, padding: "12px 32px",
    fontSize: 14, fontWeight: 700, color: "#fff",
    cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
    boxShadow: "0 4px 20px rgba(99,102,241,.35)",
    transition: "opacity .15s,transform .1s",
  },

  // Alerta
  alertBase: {
    borderRadius: 12, padding: "14px 18px", marginBottom: 20,
    fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 10,
  },
  alertSuccess: {
    background: "rgba(16,185,129,.12)", border: "1px solid rgba(16,185,129,.3)",
    color: "#34d399",
  },
  alertError: {
    background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.3)",
    color: "#fca5a5",
  },

  // Historial
  tableWrap: { overflowX: "auto", marginTop: 4 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left", padding: "10px 14px",
    borderBottom: "1px solid rgba(255,255,255,.08)",
    color: "#64748b", fontSize: 11, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: ".1em",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "12px 14px",
    borderBottom: "1px solid rgba(255,255,255,.05)",
    color: "#cbd5e1", whiteSpace: "nowrap",
  },
  trHover: { background: "rgba(255,255,255,.025)" },
};

// ─── Componente Input con focus ──────────────────────────────────────────────
function FInput({ value, onChange, placeholder, type = "text" }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{ ...S.input, ...(focused ? S.inputFocus : {}) }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

// ─── Componente Select ───────────────────────────────────────────────────────
function FSelect({ value, onChange, options, placeholder = "Seleccionar…" }) {
  return (
    <select value={value} onChange={onChange} style={S.select}>
      <option value="">{placeholder}</option>
      {options.map(o => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

// ─── Estado inicial del formulario ───────────────────────────────────────────
const INIT = {
  estatus_envio: "",
  codigo_asesor: "",
  id_bitrix: "",
  distribuidor_autorizado: "",
  supervisor: "",
  origen_venta: "",
  venta_nueva_o_reingreso: "",
  turno: "",
};

// ─── Componente principal ────────────────────────────────────────────────────
export default function NuevaVenta() {
  const [form, setForm]           = useState(INIT);
  const [loading, setLoading]     = useState(false);
  const [alert, setAlert]         = useState(null); // {tipo:"success"|"error", msg}
  const [historial, setHistorial] = useState([]);
  const [loadingHist, setLoadingHist] = useState(true);
  const [opciones, setOpciones]   = useState({ distribuidores: [], supervisores: [] });
  const [hovRow, setHovRow]       = useState(null);

  // ── Verificar admin ────────────────────────────────────────────────────────
  const isAdmin = (() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      return (u.perfil || "").toUpperCase() === "ADMINISTRADOR";
    } catch (_) { return false; }
  })();

  const token = localStorage.getItem("token");

  // ── Cargar opciones y historial ────────────────────────────────────────────
  const cargarHistorial = useCallback(async () => {
    try {
      setLoadingHist(true);
      const r = await fetch(`${API}/api/envios-ventas`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.success) setHistorial(d.data);
    } catch (_) {} finally { setLoadingHist(false); }
  }, [token]);

  useEffect(() => {
    if (!isAdmin) return;
    // Cargar opciones dinámicas
    fetch(`${API}/api/envios-ventas/opciones`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setOpciones(d); })
      .catch(() => {});
    cargarHistorial();
  }, [isAdmin, token, cargarHistorial]);

  // ── Cambio de campo ────────────────────────────────────────────────────────
  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }));

  // ── Envío ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setAlert(null);

    // Validación cliente
    if (!form.estatus_envio)           return setAlert({ tipo: "error", msg: "Selecciona el estatus de envío." });
    if (!form.codigo_asesor.trim())    return setAlert({ tipo: "error", msg: "Ingresa el código de asesor." });
    if (!form.origen_venta)            return setAlert({ tipo: "error", msg: "Selecciona el origen de venta." });
    if (!form.venta_nueva_o_reingreso) return setAlert({ tipo: "error", msg: "Indica si es NUEVA o REINGRESO." });
    if (!form.turno)                   return setAlert({ tipo: "error", msg: "Selecciona el turno." });

    setLoading(true);
    try {
      const r = await fetch(`${API}/api/envios-ventas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (d.success) {
        setAlert({ tipo: "success", msg: `✅ Venta registrada correctamente (ID: ${d.data.id})` });
        setForm(INIT);
        cargarHistorial();
      } else {
        setAlert({ tipo: "error", msg: d.error || "Error al registrar la venta." });
      }
    } catch (err) {
      setAlert({ tipo: "error", msg: "Error de conexión con el servidor." });
    } finally {
      setLoading(false);
    }
  };

  // ── Bloqueo si no es admin ─────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <p style={{ fontSize: 20, fontWeight: 700, color: "#fca5a5" }}>Acceso restringido</p>
          <p style={{ color: "#64748b", marginTop: 8 }}>Este módulo solo está disponible para administradores.</p>
        </div>
      </div>
    );
  }

  // ── Fecha actual mostrada ──────────────────────────────────────────────────
  const ahora   = new Date();
  const fechaStr = ahora.toLocaleString("es-EC", { timeZone: "America/Guayaquil" });

  return (
    <div style={S.page}>

      {/* ── Encabezado ── */}
      <div style={S.header}>
        <div style={S.iconBox}>💼</div>
        <div>
          <h1 style={S.title}>Ingresar Nueva Venta</h1>
          <p style={S.subtitle}>Panel de registro manual · envios_ventas</p>
        </div>
        <div style={S.badge}>🔐 SOLO ADMINISTRADOR</div>
      </div>

      {/* ── Alerta ── */}
      {alert && (
        <div style={{ ...S.alertBase, ...(alert.tipo === "success" ? S.alertSuccess : S.alertError) }}>
          <span style={{ fontSize: 18 }}>{alert.tipo === "success" ? "✅" : "❌"}</span>
          {alert.msg}
        </div>
      )}

      {/* ── Formulario ── */}
      <form onSubmit={handleSubmit}>

        {/* Bloque 1: Campos auto-computados (informativo) */}
        <div style={S.card}>
          <div style={S.sectionTitle}>
            <span>⚙️</span> Datos automáticos del sistema
          </div>
          <div style={S.autoRow}>
            <div style={S.autoChip}><span style={S.autoLabel}>Fecha:</span> {fechaStr}</div>
            <div style={S.autoChip}><span style={S.autoLabel}>IP:</span> Detectada automáticamente</div>
            <div style={S.autoChip}><span style={S.autoLabel}>Año / Mes / Día:</span> Auto-calculados</div>
          </div>
        </div>

        {/* Bloque 2: Información de la venta */}
        <div style={S.card}>
          <div style={S.sectionTitle}><span>📋</span> Información de la venta</div>
          <div style={S.grid3}>

            {/* estatus_envio */}
            <div style={S.field}>
              <label style={S.label}>Estatus envío <span style={S.required}>*</span></label>
              <FSelect value={form.estatus_envio} onChange={set("estatus_envio")} options={ESTATUSES} />
            </div>

            {/* venta_nueva_o_reingreso */}
            <div style={S.field}>
              <label style={S.label}>Tipo de venta <span style={S.required}>*</span></label>
              <FSelect value={form.venta_nueva_o_reingreso} onChange={set("venta_nueva_o_reingreso")} options={TIPOS_VENTA} />
            </div>

            {/* origen_venta */}
            <div style={S.field}>
              <label style={S.label}>Origen de venta <span style={S.required}>*</span></label>
              <FSelect value={form.origen_venta} onChange={set("origen_venta")} options={ORIGENES} />
            </div>

            {/* turno */}
            <div style={S.field}>
              <label style={S.label}>Turno <span style={S.required}>*</span></label>
              <FSelect value={form.turno} onChange={set("turno")} options={TURNOS} />
            </div>

            {/* codigo_asesor */}
            <div style={S.field}>
              <label style={S.label}>Código asesor <span style={S.required}>*</span></label>
              <FInput value={form.codigo_asesor} onChange={set("codigo_asesor")} placeholder="Ej: ATN-0042" />
            </div>

            {/* id_bitrix */}
            <div style={S.field}>
              <label style={S.label}>ID Bitrix</label>
              <FInput value={form.id_bitrix} onChange={set("id_bitrix")} placeholder="Ej: 12345" />
            </div>

          </div>
        </div>

        {/* Bloque 3: Distribuidor y Supervisor */}
        <div style={S.card}>
          <div style={S.sectionTitle}><span>🏢</span> Estructura comercial</div>
          <div style={S.grid2}>

            {/* distribuidor_autorizado */}
            <div style={S.field}>
              <label style={S.label}>Distribuidor autorizado</label>
              {opciones.distribuidores.length > 0
                ? <FSelect
                    value={form.distribuidor_autorizado}
                    onChange={set("distribuidor_autorizado")}
                    options={opciones.distribuidores}
                    placeholder="Sin distribuidor…"
                  />
                : <FInput value={form.distribuidor_autorizado} onChange={set("distribuidor_autorizado")} placeholder="Nombre del distribuidor" />
              }
            </div>

            {/* supervisor */}
            <div style={S.field}>
              <label style={S.label}>Supervisor</label>
              {opciones.supervisores.length > 0
                ? <FSelect
                    value={form.supervisor}
                    onChange={set("supervisor")}
                    options={opciones.supervisores}
                    placeholder="Sin supervisor…"
                  />
                : <FInput value={form.supervisor} onChange={set("supervisor")} placeholder="Nombre del supervisor" />
              }
            </div>

          </div>
        </div>

        {/* Botones */}
        <div style={S.btnRow}>
          <button
            type="button"
            style={S.btnReset}
            onClick={() => { setForm(INIT); setAlert(null); }}
            disabled={loading}
          >
            Limpiar
          </button>
          <button
            type="submit"
            style={{ ...S.btnSubmit, opacity: loading ? .7 : 1 }}
            disabled={loading}
          >
            {loading
              ? <><span style={{ display:"inline-block", width:16, height:16, border:"2px solid #fff", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} /> Registrando…</>
              : <><span style={{ fontSize: 18 }}>💾</span> Registrar venta</>
            }
          </button>
        </div>

      </form>

      {/* ── Historial reciente ── */}
      <div style={{ ...S.card, marginTop: 28 }}>
        <div style={{ ...S.sectionTitle, marginBottom: 16 }}>
          <span>📑</span> Últimas ventas registradas
          <button
            onClick={cargarHistorial}
            style={{ marginLeft: "auto", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "4px 12px", fontSize: 11, color: "#94a3b8", cursor: "pointer" }}
          >
            ↻ Actualizar
          </button>
        </div>

        {loadingHist ? (
          <p style={{ color: "#64748b", textAlign: "center", padding: 24 }}>Cargando historial…</p>
        ) : historial.length === 0 ? (
          <p style={{ color: "#64748b", textAlign: "center", padding: 24 }}>No hay registros aún.</p>
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
                  <tr
                    key={r.id}
                    style={hovRow === i ? { ...S.trHover } : {}}
                    onMouseEnter={() => setHovRow(i)}
                    onMouseLeave={() => setHovRow(null)}
                  >
                    <td style={{ ...S.td, color: "#6366f1", fontWeight: 700 }}>#{r.id}</td>
                    <td style={S.td}>
                      <span style={{
                        background: r.estatus_envio === "APROBADO"   ? "rgba(16,185,129,.2)"  :
                                    r.estatus_envio === "RECHAZADO"  ? "rgba(239,68,68,.2)"   :
                                    r.estatus_envio === "PENDIENTE"  ? "rgba(234,179,8,.2)"   :
                                    "rgba(99,102,241,.15)",
                        color: r.estatus_envio === "APROBADO"  ? "#34d399" :
                               r.estatus_envio === "RECHAZADO" ? "#fca5a5" :
                               r.estatus_envio === "PENDIENTE" ? "#fde047" :
                               "#a5b4fc",
                        borderRadius: 6, padding: "3px 10px",
                        fontSize: 11, fontWeight: 700,
                      }}>
                        {r.estatus_envio}
                      </span>
                    </td>
                    <td style={S.td}>{r.fecha_registro_sistema ? new Date(r.fecha_registro_sistema).toLocaleString("es-EC", { timeZone:"America/Guayaquil" }) : "—"}</td>
                    <td style={S.td}>{r.codigo_asesor || "—"}</td>
                    <td style={S.td}>{r.id_bitrix || "—"}</td>
                    <td style={S.td}>{r.distribuidor_autorizado || "—"}</td>
                    <td style={S.td}>{r.supervisor || "—"}</td>
                    <td style={S.td}>{r.origen_venta || "—"}</td>
                    <td style={S.td}>
                      <span style={{
                        background: r.venta_nueva_o_reingreso === "NUEVA" ? "rgba(59,130,246,.2)" : "rgba(168,85,247,.2)",
                        color: r.venta_nueva_o_reingreso === "NUEVA" ? "#60a5fa" : "#c084fc",
                        borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700,
                      }}>
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

      {/* Spinner keyframe */}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

    </div>
  );
}
