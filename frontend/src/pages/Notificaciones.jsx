// src/pages/Notificaciones.jsx
// ─── Módulo de gestión de alertas ───────────────────────────────────────────
// • Escaneo de QR para WhatsApp
// • Dashboard de conteos por canal (ERP / Email / WhatsApp)
// • Historial de últimas notificaciones
// • Toast global de alertas en tiempo real (Socket.io)

import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

// ─────────────────────────────────────────────────────────────────────────────
// TOAST GLOBAL — se puede importar y usar en DashboardLayout para que aparezca
// en cualquier módulo del ERP
// ─────────────────────────────────────────────────────────────────────────────
let _socketGlobal = null;

export const useAlertasSocket = (onAlerta) => {
  useEffect(() => {
    if (!_socketGlobal) {
      // 🔐 Conectar Socket.io con autenticación JWT
      _socketGlobal = io(import.meta.env.VITE_API_URL, {
        auth: { token: localStorage.getItem('token') },  // ← JWT token requerido
        transports: ["websocket"]
      });
    }
    _socketGlobal.on("alerta_supervisor", onAlerta);
    return () => _socketGlobal.off("alerta_supervisor", onAlerta);
  }, []);
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE TOAST — úsalo en DashboardLayout.jsx para que aparezca siempre
// ─────────────────────────────────────────────────────────────────────────────
export function AlertaToast() {
  const [toasts, setToasts] = useState([]);

  const playBeep = () => {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine"; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(); osc.stop(ctx.currentTime + 0.7);
    } catch (_) {}
  };

  useAlertasSocket((alerta) => {
    playBeep();
    const id = Date.now();
    setToasts(prev => [...prev, { ...alerta, id }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 8000);
  });

  const COLORES = {
    gestion_diaria: { bg: "#fef9c3", border: "#fde047", icon: "⚠️", texto: "#854d0e" },
    contacto_nuevo: { bg: "#fee2e2", border: "#fca5a5", icon: "🔴", texto: "#991b1b" },
    sin_ventas:     { bg: "#dbeafe", border: "#93c5fd", icon: "📉", texto: "#1e40af" },
  };
  const TITULOS = {
    gestion_diaria: "Gestión Diaria sin mover",
    contacto_nuevo: "Contacto Nuevo sin responder",
    sin_ventas:     "Asesores sin ingresos hoy",
  };

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: "fixed", top: 16, right: 16, zIndex: 9999,
      display: "flex", flexDirection: "column", gap: 10,
      maxWidth: 360,
    }}>
      {toasts.map((t) => {
        const cfg = COLORES[t.condicion] || COLORES.gestion_diaria;
        return (
          <div key={t.id} style={{
            background: cfg.bg, border: `1px solid ${cfg.border}`,
            borderRadius: 12, padding: "12px 16px",
            boxShadow: "0 4px 20px rgba(0,0,0,.12)",
            animation: "slideInRight .3s ease-out",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{cfg.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: cfg.texto,
                  textTransform: "uppercase", letterSpacing: ".06em" }}>
                  {TITULOS[t.condicion]}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#0f172a", marginTop: 2 }}>
                  {t.supervisor}
                </div>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
                  {t.asesores?.slice(0, 3).map(a => a.nombre).join(", ")}
                  {t.asesores?.length > 3 && ` +${t.asesores.length - 3} más`}
                </div>
              </div>
              <button
                onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                style={{ background: "none", border: "none", cursor: "pointer",
                  color: cfg.texto, fontSize: 14, padding: 0, opacity: .6 }}>
                ✕
              </button>
            </div>
          </div>
        );
      })}
      <style>{`
        @keyframes slideInRight {
          from { opacity:0; transform:translateX(40px); }
          to   { opacity:1; transform:translateX(0); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL;

const CANAL_CONFIG = {
  ERP:      { color: "#0ea5e9", light: "#e0f2fe", icon: "🖥️",  label: "ERP (tiempo real)" },
  EMAIL:    { color: "#8b5cf6", light: "#ede9fe", icon: "📧",  label: "Correo electrónico" },
  WHATSAPP: { color: "#10b981", light: "#d1fae5", icon: "💬",  label: "WhatsApp" },
};

const CONDICION_LABEL = {
  gestion_diaria: "Gestión Diaria",
  contacto_nuevo: "Contacto Nuevo",
  sin_ventas:     "Sin ventas",
};

// ─────────────────────────────────────────────────────────────────────────────
// PÁGINA PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function Notificaciones() {
  const [resumen, setResumen]           = useState([]);
  const [porCondicion, setPorCondicion] = useState([]);
  const [historial, setHistorial]       = useState([]);
  const [waEstado, setWaEstado]         = useState({ estado: "desconectado", tieneQR: false });
  const [qrImg, setQrImg]               = useState(null);
  const [loadingQR, setLoadingQR]       = useState(false);
  const [loadingJob, setLoadingJob]     = useState(false);
  const [loading, setLoading]           = useState(false);
  const pollingRef                      = useRef(null);

  const fetchResumen = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/alertas/resumen`);
      const d = await r.json();
      if (d.success) {
        setResumen(d.resumen || []);
        setPorCondicion(d.porCondicion || []);
        setHistorial(d.historial || []);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchWaEstado = async () => {
    try {
      const r = await fetch(`${API}/api/alertas/whatsapp/estado`);
      const d = await r.json();
      if (d.success) setWaEstado({ estado: d.estado, tieneQR: d.tieneQR });
    } catch (_) {}
  };

  const fetchQR = async () => {
    setLoadingQR(true);
    try {
      const r = await fetch(`${API}/api/alertas/whatsapp/qr`);
      const d = await r.json();
      if (d.success && d.qr) setQrImg(d.qr);
      else setQrImg(null);
      if (d.estado) setWaEstado(prev => ({ ...prev, estado: d.estado }));
    } catch (_) {}
    finally { setLoadingQR(false); }
  };

  const ejecutarAlertas = async () => {
    setLoadingJob(true);
    try {
      await fetch(`${API}/api/alertas/ejecutar`, { method: "POST" });
      setTimeout(fetchResumen, 1500);
    } catch (_) {}
    finally { setLoadingJob(false); }
  };

  useEffect(() => {
    fetchResumen();
    fetchWaEstado();
    // Polling estado WA cada 5s
    pollingRef.current = setInterval(fetchWaEstado, 5000);
    return () => clearInterval(pollingRef.current);
  }, []);

  // Cuando WA se conecta, limpia el QR
  useEffect(() => {
    if (waEstado.estado === "conectado") setQrImg(null);
  }, [waEstado.estado]);

  // Totales globales
  const totalERP      = resumen.find(r => r.canal === "ERP")?.total      || 0;
  const totalEmail    = resumen.find(r => r.canal === "EMAIL")?.total     || 0;
  const totalWA       = resumen.find(r => r.canal === "WHATSAPP")?.total  || 0;
  const totalGeneral  = totalERP + totalEmail + totalWA;

  const WA_ESTADO_COLOR = {
    conectado:     { bg: "#d1fae5", border: "#6ee7b7", text: "#065f46", dot: "#10b981", label: "Conectado ✓" },
    esperando_qr:  { bg: "#fef9c3", border: "#fde047", text: "#854d0e", dot: "#eab308", label: "Esperando QR..." },
    desconectado:  { bg: "#fee2e2", border: "#fca5a5", text: "#991b1b", dot: "#ef4444", label: "Desconectado" },
  };
  const waColor = WA_ESTADO_COLOR[waEstado.estado] || WA_ESTADO_COLOR.desconectado;

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: "24px 20px",
      fontFamily: "'DM Sans','Inter',system-ui,sans-serif", color: "#0f172a" }}>

      {/* ── HEADER ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ background: "#0f172a", color: "#fff", padding: "3px 10px",
                borderRadius: 5, fontSize: 10, fontWeight: 900,
                letterSpacing: ".12em", textTransform: "uppercase" }}>
                SISTEMA
              </span>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#0f172a",
                textTransform: "uppercase", letterSpacing: "-.01em" }}>
                Centro de Notificaciones
              </h1>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>
              Alertas en tiempo real · Correo · WhatsApp — historial y estado de conexión
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={fetchResumen}
              style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
                padding: "8px 16px", fontSize: 10, fontWeight: 800, cursor: "pointer",
                color: "#0f172a", textTransform: "uppercase", letterSpacing: ".06em" }}>
              ↻ Actualizar
            </button>
            <button onClick={ejecutarAlertas} disabled={loadingJob}
              style={{ background: loadingJob ? "#f1f5f9" : "#0f172a",
                color: loadingJob ? "#94a3b8" : "#fff",
                border: "none", borderRadius: 8, padding: "8px 18px",
                fontSize: 10, fontWeight: 800, cursor: loadingJob ? "default" : "pointer",
                textTransform: "uppercase", letterSpacing: ".06em" }}>
              {loadingJob ? "Ejecutando..." : "▶ Disparar alertas ahora"}
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI STRIP ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))",
        gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total enviadas", val: totalGeneral, color: "#0f172a" },
          { label: "ERP (tiempo real)", val: totalERP, color: "#0ea5e9" },
          { label: "Correo", val: totalEmail, color: "#8b5cf6" },
          { label: "WhatsApp", val: totalWA, color: "#10b981" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: "#fff", border: "1px solid #e2e8f0",
            borderRadius: 12, padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8",
              textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 4 }}>
              {label}
            </div>
            <div style={{ fontSize: 30, fontWeight: 900, color, lineHeight: 1 }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>

        {/* ── WHATSAPP QR ── */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
          overflow: "hidden", boxShadow: "0 1px 8px rgba(0,0,0,.05)" }}>
          {/* Header */}
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #f1f5f9",
            background: "#fafafa", display: "flex", justifyContent: "space-between",
            alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a",
                textTransform: "uppercase", letterSpacing: ".02em" }}>
                💬 WhatsApp
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                Escanea el QR para activar alertas
              </div>
            </div>
            <span style={{
              background: waColor.bg, color: waColor.text,
              border: `1px solid ${waColor.border}`,
              borderRadius: 20, padding: "3px 10px",
              fontSize: 10, fontWeight: 700,
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%",
                background: waColor.dot, display: "inline-block" }} />
              {waColor.label}
            </span>
          </div>

          <div style={{ padding: "24px 18px", textAlign: "center" }}>
            {waEstado.estado === "conectado" ? (
              <div style={{ padding: "32px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#065f46" }}>
                  WhatsApp conectado
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                  Las alertas se enviarán automáticamente a los supervisores
                </div>
              </div>
            ) : qrImg ? (
              <>
                <img src={qrImg} alt="QR WhatsApp"
                  style={{ width: 220, height: 220, borderRadius: 12,
                    border: "2px solid #e2e8f0", marginBottom: 12 }} />
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo
                </div>
                <button onClick={fetchQR}
                  style={{ marginTop: 12, background: "#f1f5f9", border: "1px solid #e2e8f0",
                    borderRadius: 8, padding: "6px 14px", fontSize: 10, fontWeight: 700,
                    cursor: "pointer", color: "#475569" }}>
                  ↻ Refrescar QR
                </button>
              </>
            ) : (
              <div style={{ padding: "24px 0" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 14 }}>
                  {waEstado.estado === "esperando_qr"
                    ? "QR generándose, haz click en Mostrar QR"
                    : "Inicia sesión de WhatsApp para activar las alertas"}
                </div>
                <button onClick={fetchQR} disabled={loadingQR}
                  style={{ background: "#10b981", color: "#fff", border: "none",
                    borderRadius: 8, padding: "10px 20px", fontSize: 11, fontWeight: 800,
                    cursor: loadingQR ? "default" : "pointer",
                    textTransform: "uppercase", letterSpacing: ".06em" }}>
                  {loadingQR ? "Cargando..." : "📷 Mostrar QR"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── CONTEOS POR CONDICIÓN ── */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
          overflow: "hidden", boxShadow: "0 1px 8px rgba(0,0,0,.05)" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #f1f5f9",
            background: "#fafafa" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a",
              textTransform: "uppercase", letterSpacing: ".02em" }}>
              🔔 Alertas por condición
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
              Conteo acumulado del mes actual
            </div>
          </div>
          <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
            {porCondicion.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0",
                fontSize: 11, color: "#94a3b8" }}>
                Sin alertas registradas este mes
              </div>
            ) : porCondicion.map((row) => (
              <div key={row.condicion} style={{ display: "flex", alignItems: "center",
                gap: 12, padding: "10px 14px", background: "#f8fafc",
                borderRadius: 10, border: "1px solid #f1f5f9" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
                    {CONDICION_LABEL[row.condicion] || row.condicion}
                  </div>
                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                    Última: {new Date(row.ultima_vez).toLocaleString("es-EC",
                      { timeZone: "America/Guayaquil", day: "2-digit",
                        month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#0f172a" }}>
                  {row.total}
                </div>
              </div>
            ))}
          </div>

          {/* Desglose por canal */}
          <div style={{ padding: "0 18px 16px", display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {["ERP","EMAIL","WHATSAPP"].map(canal => {
              const r   = resumen.find(x => x.canal === canal) || {};
              const cfg = CANAL_CONFIG[canal];
              return (
                <div key={canal} style={{ background: cfg.light, borderRadius: 10,
                  padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 16 }}>{cfg.icon}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: cfg.color, lineHeight: 1, marginTop: 4 }}>
                    {r.total || 0}
                  </div>
                  <div style={{ fontSize: 8, fontWeight: 700, color: cfg.color,
                    textTransform: "uppercase", letterSpacing: ".06em", marginTop: 2, opacity: .7 }}>
                    {canal}
                  </div>
                  <div style={{ fontSize: 8, color: "#64748b", marginTop: 4 }}>
                    24h: {r.ultimas_24h || 0}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── HISTORIAL ── */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
        overflow: "hidden", boxShadow: "0 1px 8px rgba(0,0,0,.05)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #f1f5f9",
          background: "#fafafa", display: "flex", justifyContent: "space-between",
          alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a",
              textTransform: "uppercase", letterSpacing: ".02em" }}>
              📋 Historial reciente
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
              Últimas 20 notificaciones enviadas
            </div>
          </div>
          {loading && <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700,
            animation: "pulse 1.5s infinite" }}>Actualizando...</span>}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
                {["Canal","Supervisor","Asesor(es)","Condición","Estado","Fecha"].map(h => (
                  <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontWeight: 800,
                    color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".08em",
                    fontSize: 9, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historial.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: "32px", textAlign: "center",
                  color: "#94a3b8", fontSize: 11 }}>Sin registros aún</td></tr>
              ) : historial.map((row) => {
                const cfg = CANAL_CONFIG[row.canal] || CANAL_CONFIG.ERP;
                return (
                  <tr key={row.id} style={{ borderBottom: "1px solid #f8fafc" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background = ""}>
                    <td style={{ padding: "9px 14px" }}>
                      <span style={{ background: cfg.light, color: cfg.color,
                        borderRadius: 20, padding: "2px 8px", fontWeight: 700, fontSize: 10 }}>
                        {cfg.icon} {row.canal}
                      </span>
                    </td>
                    <td style={{ padding: "9px 14px", fontWeight: 700, color: "#0f172a",
                      maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap" }}>
                      {row.supervisor || "—"}
                    </td>
                    <td style={{ padding: "9px 14px", color: "#475569", maxWidth: 180,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.asesor || "—"}
                    </td>
                    <td style={{ padding: "9px 14px" }}>
                      <span style={{ fontSize: 10, fontWeight: 700,
                        color: "#475569", background: "#f1f5f9",
                        borderRadius: 6, padding: "2px 8px" }}>
                        {CONDICION_LABEL[row.condicion] || row.condicion}
                      </span>
                    </td>
                    <td style={{ padding: "9px 14px" }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "2px 8px",
                        background: row.enviado_ok ? "#d1fae5" : "#fee2e2",
                        color:      row.enviado_ok ? "#065f46" : "#991b1b",
                      }}>
                        {row.enviado_ok ? "✓ Enviado" : "✗ Error"}
                      </span>
                    </td>
                    <td style={{ padding: "9px 14px", color: "#64748b", whiteSpace: "nowrap",
                      fontSize: 10 }}>
                      {new Date(row.created_at).toLocaleString("es-EC",
                        { timeZone: "America/Guayaquil", day: "2-digit", month: "short",
                          hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}