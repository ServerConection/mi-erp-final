// =============================================================================
// REPORTE JEFATURA - Comparativa de ingresos JotForm vs promedio historico
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
  return res.json();
};

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const ESTADO_STYLE = {
  ENCIMA:    { bg: "#dcfce7", color: "#166534", border: "#86efac", label: "ENCIMA", icon: "📈" },
  EN_LINEA:  { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd", label: "EN LÍNEA", icon: "➡️" },
  DEBAJO:    { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5", label: "DEBAJO", icon: "📉" },
  SIN_DATO:  { bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1", label: "SIN DATO", icon: "⏳" },
};

// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================
export default function ReporteJefatura() {
  const [empresa, setEmpresa] = useState("NOVONET");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let activo = true;
    setLoading(true);
    const endpoint = empresa === "VELSA" ? "/api/reporte-jefatura/velsa" : "/api/reporte-jefatura/novonet";
    fetchJson(endpoint)
      .then(r => { if (activo) { setData(r); setLoading(false); } })
      .catch(() => { if (activo) setLoading(false); });
    return () => { activo = false; };
  }, [empresa, refreshKey]);

  // Auto-refresh cada 5 minutos
  useEffect(() => {
    const i = setInterval(() => setRefreshKey(k => k + 1), 5 * 60 * 1000);
    return () => clearInterval(i);
  }, []);

  const filasFiltradas = useMemo(() => {
    if (!data?.por_hora) return [];
    // mostrar de 7am a 9pm (rango laboral tipico)
    return data.por_hora.filter(f => f.hora >= 7 && f.hora <= 21);
  }, [data]);

  const formatHora = (h) => `${String(h).padStart(2, "0")}:00`;

  if (loading || !data) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Cargando reporte jefatura...</div>
      </div>
    );
  }

  const estiloAcum = ESTADO_STYLE[data.acumulado.estado] || ESTADO_STYLE.SIN_DATO;

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
          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: ".15em", textTransform: "uppercase" }}>
            Reporte Jefatura
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginTop: 4, marginBottom: 0 }}>
            📊 Ingresos JotForm vs Comportamiento Histórico
          </h1>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            {DIAS_SEMANA[data.dia_semana]} {data.fecha} · Comparado con últimos {data.ventana_dias} días
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {["NOVONET", "VELSA"].map(e => (
            <button key={e} onClick={() => setEmpresa(e)}
              style={{
                background: empresa === e ? "#0f172a" : "white",
                color:      empresa === e ? "white" : "#0f172a",
                padding: "8px 16px", borderRadius: 10,
                fontWeight: 700, fontSize: 12,
                border: "1px solid #0f172a", cursor: "pointer",
                transition: "all .15s",
              }}>
              {e}
            </button>
          ))}
          <button onClick={() => setRefreshKey(k => k + 1)}
            style={{
              background: "white", color: "#0f172a",
              padding: "8px 14px", borderRadius: 10,
              fontWeight: 600, fontSize: 12,
              border: "1px solid #e2e8f0", cursor: "pointer",
            }}>
            🔄 Refrescar
          </button>
        </div>
      </div>

      {/* RESUMEN ACUMULADO */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12, marginBottom: 16,
      }}>
        <KpiCard
          label="Ingresos hoy (acumulado)"
          value={data.acumulado.total_hoy}
          icon="📥"
          color="#0f172a"
        />
        <KpiCard
          label={`Promedio histórico (hasta ${formatHora(data.hora_actual)})`}
          value={Number(data.acumulado.promedio_historico).toFixed(1)}
          icon="📊"
          color="#64748b"
        />
        <KpiCard
          label="Variación vs promedio"
          value={data.acumulado.variacion_pct == null
            ? "—"
            : `${data.acumulado.variacion_pct > 0 ? "+" : ""}${data.acumulado.variacion_pct}%`}
          icon={data.acumulado.variacion_pct > 0 ? "🚀" : data.acumulado.variacion_pct < 0 ? "⚠️" : "➡️"}
          color={data.acumulado.variacion_pct > 0 ? "#059669" : data.acumulado.variacion_pct < 0 ? "#dc2626" : "#1e40af"}
        />
        <div style={{
          background: estiloAcum.bg, border: `1px solid ${estiloAcum.border}`,
          borderRadius: 12, padding: 16,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: estiloAcum.color, letterSpacing: ".1em", textTransform: "uppercase" }}>
            Estado General
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: estiloAcum.color, marginTop: 8 }}>
            {estiloAcum.icon} {estiloAcum.label}
          </div>
          <div style={{ fontSize: 11, color: estiloAcum.color, opacity: .8, marginTop: 4 }}>
            Para esta hora del día normalmente este día semana
          </div>
        </div>
      </div>

      {/* TABLA HORA POR HORA */}
      <div style={{
        background: "white", border: "1px solid #e2e8f0", borderRadius: 16,
        padding: 20, boxShadow: "0 1px 3px rgba(15,23,42,.04)",
      }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#0f172a", marginBottom: 12 }}>
          Comparativa hora por hora
        </h3>
        <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "white" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={th}>Hora</th>
                <th style={th}>Ingresos hoy</th>
                <th style={th}>Promedio histórico</th>
                <th style={th}>Mín – Máx histórico</th>
                <th style={th}>Variación</th>
                <th style={th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filasFiltradas.map(f => {
                const est = ESTADO_STYLE[f.estado] || ESTADO_STYLE.SIN_DATO;
                const horaActual = f.hora === data.hora_actual;
                const horaPasada = f.hora < data.hora_actual;
                return (
                  <tr key={f.hora} style={{
                    borderTop: "1px solid #f1f5f9",
                    background: horaActual ? "#fef3c7" : "white",
                    opacity: horaPasada || horaActual ? 1 : 0.5,
                  }}>
                    <td style={{ ...td, fontWeight: 700, color: "#0f172a" }}>
                      {formatHora(f.hora)} {horaActual && <span style={{ fontSize: 10, color: "#b45309", fontWeight: 800 }}>← AHORA</span>}
                    </td>
                    <td style={{ ...td, fontSize: 14, fontWeight: 800, color: "#0f172a" }}>{f.ingresos_hoy}</td>
                    <td style={td}>{Number(f.promedio_historico).toFixed(1)}</td>
                    <td style={{ ...td, color: "#64748b", fontSize: 11 }}>
                      {Number(f.historico_min).toFixed(0)} – {Number(f.historico_max).toFixed(0)}
                    </td>
                    <td style={td}>
                      {f.variacion_pct == null ? "—" : (
                        <span style={{
                          color: f.variacion_pct > 0 ? "#059669" : f.variacion_pct < 0 ? "#dc2626" : "#1e40af",
                          fontWeight: 700,
                        }}>
                          {f.variacion_pct > 0 ? "+" : ""}{f.variacion_pct}%
                        </span>
                      )}
                    </td>
                    <td style={td}>
                      <span style={{
                        background: est.bg, color: est.color, border: `1px solid ${est.border}`,
                        padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                        letterSpacing: ".05em",
                      }}>
                        {est.icon} {est.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: "#64748b", display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span><b>📈 Encima</b>: superas el promedio histórico en más de 10%</span>
          <span><b>➡️ En línea</b>: dentro de ±10% del promedio</span>
          <span><b>📉 Debajo</b>: por debajo del promedio en más de 10%</span>
        </div>
      </div>

      <div style={{ marginTop: 16, textAlign: "center", fontSize: 11, color: "#94a3b8" }}>
        Datos se actualizan automáticamente cada 5 minutos. Última consulta: {new Date().toLocaleTimeString()}
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENTES AUXILIARES
// =============================================================================
function KpiCard({ label, value, icon, color }) {
  return (
    <div style={{
      background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16,
      boxShadow: "0 1px 2px rgba(15,23,42,.04)",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: ".1em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color, marginTop: 8 }}>
        {icon} {value}
      </div>
    </div>
  );
}

const th = {
  padding: "10px 12px", textAlign: "left",
  fontSize: 10, fontWeight: 800, color: "#64748b",
  letterSpacing: ".05em", textTransform: "uppercase",
};
const td = { padding: "10px 12px", fontSize: 13, color: "#334155" };
