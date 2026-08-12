// =============================================================================
// BOT AUDITOR - Visor de auditorías IA (Bitrix24 + Wazzup + Groq)
// Acceso: ADMINISTRADOR y GERENCIA (NOVONET / VELSA)
// =============================================================================
import { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_URL || "";

const fetchJson = async (url) => {
  const res = await fetch(`${API}${url}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.error || json.message || `Error ${res.status}`);
  }
  return json;
};

const CAL_STYLE = {
  VENTA: { bg: "#dcfce7", color: "#166534", border: "#86efac" },
  ATC:   { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd" },
};

function scoreColor(score) {
  if (score == null) return "#94a3b8";
  if (score >= 80) return "#16a34a";
  if (score >= 50) return "#d97706";
  return "#dc2626";
}

// El layout guarda el usuario logueado en "userProfile" (ver Backoffice.jsx).
// Solo ADMINISTRADOR puede editar las reglas del prompt que usa el servicio
// externo bot-auditor-service para clasificar/puntuar con Groq.
function esAdministrador() {
  try {
    const u = JSON.parse(localStorage.getItem("userProfile") || "{}");
    return (u.perfil || "").toUpperCase() === "ADMINISTRADOR";
  } catch {
    return false;
  }
}

export default function BotAuditor() {
  const [filtros, setFiltros] = useState({ empresa: "", calificacion: "", canal: "", q: "", desde: "", hasta: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const esAdmin = useMemo(() => esAdministrador(), []);
  const [configAbierto, setConfigAbierto] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [configGuardando, setConfigGuardando] = useState(false);
  const [configError, setConfigError] = useState(null);
  const [configMsg, setConfigMsg] = useState(null);
  const [configForm, setConfigForm] = useState({ reglas_clasificacion: "", reglas_puntuacion_venta: "", reglas_puntuacion_atc: "" });
  const [configMeta, setConfigMeta] = useState({ actualizado_por: null, actualizado_at: null });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filtros.empresa) params.set("empresa", filtros.empresa);
    if (filtros.calificacion) params.set("calificacion", filtros.calificacion);
    if (filtros.canal) params.set("canal", filtros.canal);
    if (filtros.q) params.set("q", filtros.q);
    // desde/hasta filtran por FECHA DE CREACIÓN DEL LEAD
    if (filtros.desde) params.set("desde", filtros.desde);
    if (filtros.hasta) params.set("hasta", filtros.hasta);
    params.set("page", page);
    params.set("limit", 25);
    return params.toString();
  }, [filtros, page]);

  useEffect(() => {
    let activo = true;
    setLoading(true);
    setError(null);
    fetchJson(`/api/bot-auditor?${queryString}`)
      .then((r) => {
        if (!activo) return;
        setData(r.data || []);
        setPagination(r.pagination || null);
        setLoading(false);
      })
      .catch((err) => {
        if (!activo) return;
        setError(err.message || "Error desconocido");
        setLoading(false);
      });
    return () => { activo = false; };
  }, [queryString, refreshKey]);

  useEffect(() => {
    let activo = true;
    const statsParams = new URLSearchParams();
    if (filtros.empresa) statsParams.set("empresa", filtros.empresa);
    if (filtros.desde) statsParams.set("desde", filtros.desde);
    if (filtros.hasta) statsParams.set("hasta", filtros.hasta);
    fetchJson(`/api/bot-auditor/stats?${statsParams.toString()}`)
      .then((r) => { if (activo) setStats(r.data); })
      .catch(() => {});
    return () => { activo = false; };
  }, [filtros.empresa, filtros.desde, filtros.hasta, refreshKey]);

  const abrirDetalle = async (id) => {
    setDetalleLoading(true);
    setDetalle({ id });
    try {
      const r = await fetchJson(`/api/bot-auditor/${id}`);
      setDetalle(r.data);
    } catch (err) {
      setDetalle({ error: err.message });
    } finally {
      setDetalleLoading(false);
    }
  };

  const fmtFecha = (f) => (f ? new Date(f).toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" }) : "—");

  const abrirConfig = async () => {
    setConfigAbierto(true);
    setConfigLoading(true);
    setConfigError(null);
    setConfigMsg(null);
    try {
      const r = await fetchJson(`/api/bot-auditor/config-prompt`);
      setConfigForm({
        reglas_clasificacion: r.data.reglas_clasificacion || "",
        reglas_puntuacion_venta: r.data.reglas_puntuacion_venta || "",
        reglas_puntuacion_atc: r.data.reglas_puntuacion_atc || "",
      });
      setConfigMeta({ actualizado_por: r.data.actualizado_por, actualizado_at: r.data.actualizado_at });
    } catch (err) {
      setConfigError(err.message || "Error al cargar la configuración");
    } finally {
      setConfigLoading(false);
    }
  };

  const guardarConfig = async () => {
    setConfigGuardando(true);
    setConfigError(null);
    setConfigMsg(null);
    try {
      const res = await fetch(`${API}/api/bot-auditor/config-prompt`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(configForm),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || json.message || `Error ${res.status}`);
      }
      setConfigMsg("Guardado. El servicio de auditoría aplica el cambio en su próximo ciclo (hasta ~15 min).");
    } catch (err) {
      setConfigError(err.message || "Error al guardar");
    } finally {
      setConfigGuardando(false);
    }
  };

  return (
    <div style={{ padding: 24, background: "#f8fafc", minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* HEADER */}
      <div style={{
        background: "white", border: "1px solid #e2e8f0", borderRadius: 16,
        padding: "20px 24px", marginBottom: 16,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: 12,
        boxShadow: "0 1px 3px rgba(15,23,42,.04)",
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: 0 }}>🤖 BotAuditor</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
            Auditorías automáticas de conversaciones WhatsApp (IA) por lead en etapa ATC.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {esAdmin && (
            <button
              onClick={abrirConfig}
              style={{
                background: "white", color: "#1e293b", border: "1px solid #cbd5e1",
                borderRadius: 8, padding: "8px 18px", fontWeight: 700,
                fontSize: 12, cursor: "pointer",
              }}>
              ⚙️ Configurar prompt
            </button>
          )}
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            style={{
              background: "#1e293b", color: "white", border: "none",
              borderRadius: 8, padding: "8px 18px", fontWeight: 700,
              fontSize: 12, cursor: "pointer",
            }}>
            🔄 Actualizar
          </button>
        </div>
      </div>

      {/* STATS */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
          {[
            { label: "Total auditorías", value: stats.total },
            { label: "NOVONET", value: stats.total_novonet },
            { label: "VELSA", value: stats.total_velsa },
            { label: "Venta", value: stats.total_venta },
            { label: "ATC", value: stats.total_atc },
            { label: "Prom. Venta", value: stats.promedio_venta ?? "—" },
            { label: "Prom. ATC", value: stats.promedio_atc ?? "—" },
            { label: "Sin conversación", value: stats.sin_conversacion },
          ].map((c) => (
            <div key={c.label} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>{c.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* FILTROS */}
      <div style={{
        background: "white", border: "1px solid #e2e8f0", borderRadius: 12,
        padding: 16, marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap",
      }}>
        <select value={filtros.empresa} onChange={(e) => { setPage(1); setFiltros((f) => ({ ...f, empresa: e.target.value })); }}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}>
          <option value="">Todas las empresas</option>
          <option value="NOVONET">NOVONET</option>
          <option value="VELSA">VELSA</option>
        </select>
        <select value={filtros.calificacion} onChange={(e) => { setPage(1); setFiltros((f) => ({ ...f, calificacion: e.target.value })); }}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}>
          <option value="">Todas las calificaciones</option>
          <option value="VENTA">VENTA</option>
          <option value="ATC">ATC</option>
        </select>
        {/* Rango por FECHA DE CREACIÓN DEL LEAD */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>Creado del</span>
          <input
            type="date"
            value={filtros.desde}
            max={filtros.hasta || undefined}
            onChange={(e) => { setPage(1); setFiltros((f) => ({ ...f, desde: e.target.value })); }}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
          />
          <span style={{ fontSize: 12, color: "#64748b" }}>al</span>
          <input
            type="date"
            value={filtros.hasta}
            min={filtros.desde || undefined}
            onChange={(e) => { setPage(1); setFiltros((f) => ({ ...f, hasta: e.target.value })); }}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
          />
        </div>
        <input
          placeholder="Buscar por lead, asesor u observación…"
          value={filtros.q}
          onChange={(e) => { setPage(1); setFiltros((f) => ({ ...f, q: e.target.value })); }}
          style={{ flex: 1, minWidth: 220, padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
        />
        {(filtros.desde || filtros.hasta || filtros.q || filtros.empresa || filtros.calificacion) && (
          <button
            onClick={() => { setPage(1); setFiltros({ empresa: "", calificacion: "", canal: "", q: "", desde: "", hasta: "" }); }}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: 13, cursor: "pointer", color: "#475569" }}
          >
            Limpiar
          </button>
        )}
      </div>

      {/* TABLA */}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#64748b", fontSize: 13, fontWeight: 600 }}>Cargando auditorías…</div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: "center", color: "#991b1b", fontSize: 13 }}>⚠️ {error}</div>
        ) : data.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#64748b", fontSize: 13 }}>No hay auditorías para los filtros seleccionados.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                {["Lead", "Creado", "Empresa", "Asesor", "Canal", "Calif.", "Venta", "ATC", "Últ. mensaje", "Auditado", "Detalle"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", fontWeight: 700, color: "#475569", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const cal = CAL_STYLE[row.calificacion] || { bg: "#f1f5f9", color: "#64748b", border: "#e2e8f0" };
                return (
                  <tr key={row.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "10px 14px" }}>{row.id_bitrix}</td>
                    <td style={{ padding: "10px 14px", color: "#0f172a", fontWeight: 600, whiteSpace: "nowrap" }}>{fmtFecha(row.fecha_creacion_lead)}</td>
                    <td style={{ padding: "10px 14px" }}>{row.empresa || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>{row.asesor || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>{row.tipo_canal || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ background: cal.bg, color: cal.color, border: `1px solid ${cal.border}`, borderRadius: 6, padding: "2px 8px", fontWeight: 700, fontSize: 11 }}>
                        {row.calificacion || "—"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: 700, color: scoreColor(row.puntuacion_venta) }}>{row.puntuacion_venta ?? "—"}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 700, color: scoreColor(row.puntuacion_atc) }}>{row.puntuacion_atc ?? "—"}</td>
                    <td style={{ padding: "10px 14px", color: "#0f172a", fontWeight: 600, whiteSpace: "nowrap" }}>{fmtFecha(row.ultimo_mensaje_at)}</td>
                    <td style={{ padding: "10px 14px", color: "#64748b", whiteSpace: "nowrap" }}>{fmtFecha(row.fecha_hora_auditada)}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <button onClick={() => abrirDetalle(row.id)} style={{ background: "#1e293b", color: "white", border: "none", borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        Ver
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* PAGINACIÓN */}
      {pagination && pagination.totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #cbd5e1", background: "white", cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700 }}>
            ← Anterior
          </button>
          <span style={{ fontSize: 12, color: "#64748b", alignSelf: "center" }}>
            Página {pagination.page} de {pagination.totalPages} ({pagination.total} registros)
          </span>
          <button disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #cbd5e1", background: "white", cursor: page >= pagination.totalPages ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700 }}>
            Siguiente →
          </button>
        </div>
      )}

      {/* MODAL DETALLE */}
      {detalle && (
        <div onClick={() => setDetalle(null)} style={{
          position: "fixed", inset: 0, background: "rgba(15,23,42,.55)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "white", borderRadius: 16, padding: 24, maxWidth: 640, width: "100%",
            maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.25)",
          }}>
            {detalleLoading ? (
              <div style={{ textAlign: "center", padding: 30, color: "#64748b" }}>Cargando detalle…</div>
            ) : detalle.error ? (
              <div style={{ color: "#991b1b" }}>⚠️ {detalle.error}</div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Lead {detalle.id_bitrix}</h2>
                  <button onClick={() => setDetalle(null)} style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer", color: "#64748b" }}>✕</button>
                </div>
                <div style={{ fontSize: 12, color: "#475569", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                  <div><strong>Empresa:</strong> {detalle.empresa || "—"}</div>
                  <div><strong>Canal:</strong> {detalle.tipo_canal || "—"}</div>
                  <div><strong>Asesor:</strong> {detalle.asesor || "—"}</div>
                  <div><strong>Calificación:</strong> {detalle.calificacion || "—"}</div>
                  <div><strong>Puntuación Venta:</strong> {detalle.puntuacion_venta ?? "—"}</div>
                  <div><strong>Puntuación ATC:</strong> {detalle.puntuacion_atc ?? "—"}</div>
                  <div><strong>Lead creado:</strong> {fmtFecha(detalle.fecha_creacion_lead)}</div>
                  <div><strong>Último mensaje:</strong> {fmtFecha(detalle.ultimo_mensaje_at)}</div>
                  <div><strong>Auditado:</strong> {fmtFecha(detalle.fecha_hora_auditada)}</div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <strong style={{ fontSize: 12, color: "#475569" }}>Observación IA</strong>
                  <p style={{ fontSize: 13, color: "#0f172a", whiteSpace: "pre-wrap", marginTop: 4 }}>{detalle.observacion || "—"}</p>
                </div>
                <div>
                  <strong style={{ fontSize: 12, color: "#475569" }}>Conversación (anonimizada)</strong>
                  <pre style={{
                    fontSize: 12, color: "#1e293b", background: "#f8fafc", border: "1px solid #e2e8f0",
                    borderRadius: 10, padding: 12, whiteSpace: "pre-wrap", marginTop: 4, maxHeight: 280, overflowY: "auto",
                  }}>
                    {detalle.conversacion_anonimizada || "Sin conversación disponible."}
                  </pre>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL CONFIG PROMPT (solo ADMINISTRADOR) */}
      {configAbierto && (
        <div onClick={() => !configGuardando && setConfigAbierto(false)} style={{
          position: "fixed", inset: 0, background: "rgba(15,23,42,.55)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "white", borderRadius: 16, padding: 24, maxWidth: 640, width: "100%",
            maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.25)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>⚙️ Configurar prompt de auditoría</h2>
              <button onClick={() => setConfigAbierto(false)} style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer", color: "#64748b" }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 16px" }}>
              Edita las reglas que la IA usa para clasificar (VENTA/ATC) y puntuar cada conversación.
              El formato de salida no es editable acá para no romper el guardado automático.
            </p>

            {configLoading ? (
              <div style={{ textAlign: "center", padding: 30, color: "#64748b" }}>Cargando…</div>
            ) : (
              <>
                {configMeta.actualizado_at && (
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 12 }}>
                    Última edición: {configMeta.actualizado_por || "—"} · {fmtFecha(configMeta.actualizado_at)}
                  </div>
                )}

                <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Reglas de clasificación (VENTA vs ATC)</label>
                <textarea
                  value={configForm.reglas_clasificacion}
                  onChange={(e) => setConfigForm((f) => ({ ...f, reglas_clasificacion: e.target.value }))}
                  rows={4}
                  style={{ width: "100%", marginTop: 4, marginBottom: 14, padding: 10, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 12, fontFamily: "monospace", resize: "vertical" }}
                />

                <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Rúbrica de puntuación VENTA (0-100)</label>
                <textarea
                  value={configForm.reglas_puntuacion_venta}
                  onChange={(e) => setConfigForm((f) => ({ ...f, reglas_puntuacion_venta: e.target.value }))}
                  rows={4}
                  style={{ width: "100%", marginTop: 4, marginBottom: 14, padding: 10, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 12, fontFamily: "monospace", resize: "vertical" }}
                />

                <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Rúbrica de puntuación ATC (0-100)</label>
                <textarea
                  value={configForm.reglas_puntuacion_atc}
                  onChange={(e) => setConfigForm((f) => ({ ...f, reglas_puntuacion_atc: e.target.value }))}
                  rows={4}
                  style={{ width: "100%", marginTop: 4, marginBottom: 14, padding: 10, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 12, fontFamily: "monospace", resize: "vertical" }}
                />

                {configError && <div style={{ color: "#991b1b", fontSize: 12, marginBottom: 10 }}>⚠️ {configError}</div>}
                {configMsg && <div style={{ color: "#166534", fontSize: 12, marginBottom: 10 }}>✓ {configMsg}</div>}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button
                    onClick={() => setConfigAbierto(false)}
                    disabled={configGuardando}
                    style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #cbd5e1", background: "white", fontSize: 12, fontWeight: 700, cursor: "pointer", color: "#475569" }}>
                    Cerrar
                  </button>
                  <button
                    onClick={guardarConfig}
                    disabled={configGuardando}
                    style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#1e293b", color: "white", fontSize: 12, fontWeight: 700, cursor: configGuardando ? "not-allowed" : "pointer" }}>
                    {configGuardando ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
