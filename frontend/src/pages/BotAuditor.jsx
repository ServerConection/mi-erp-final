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

export default function BotAuditor() {
  const [filtros, setFiltros] = useState({ empresa: "", calificacion: "", canal: "", q: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filtros.empresa) params.set("empresa", filtros.empresa);
    if (filtros.calificacion) params.set("calificacion", filtros.calificacion);
    if (filtros.canal) params.set("canal", filtros.canal);
    if (filtros.q) params.set("q", filtros.q);
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
    fetchJson(`/api/bot-auditor/stats?${statsParams.toString()}`)
      .then((r) => { if (activo) setStats(r.data); })
      .catch(() => {});
    return () => { activo = false; };
  }, [filtros.empresa, refreshKey]);

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
        <input
          placeholder="Buscar por lead, asesor u observación…"
          value={filtros.q}
          onChange={(e) => { setPage(1); setFiltros((f) => ({ ...f, q: e.target.value })); }}
          style={{ flex: 1, minWidth: 220, padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
        />
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
                {["Lead", "Empresa", "Asesor", "Canal", "Calif.", "Venta", "ATC", "Auditado", "Detalle"].map((h) => (
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
    </div>
  );
}
