import { useState } from "react";

const APPSHEET_URL =
  "https://www.appsheet.com/start/64aaca5b-4eba-4bc7-8dce-512ef8a1f118";

export default function SeguimientoVentas() {
  const [iframeError, setIframeError] = useState(false);
  const [loading, setLoading] = useState(true);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 64px)",
        background: "#060d1a",
        fontFamily: "sans-serif",
      }}
    >
      {/* Barra superior */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 20px",
          background: "#0a1628",
          borderBottom: "1px solid #1a3a5c",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#00e676",
              boxShadow: "0 0 6px #00e676",
            }}
          />
          <span style={{ color: "#00e5ff", fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
            Seguimiento de Ventas — AppSheet
          </span>
        </div>
        <a
          href={APPSHEET_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "6px 16px",
            background: "linear-gradient(135deg, #00b4d8, #0077b6)",
            color: "#fff",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1,
            textDecoration: "none",
            textTransform: "uppercase",
          }}
        >
          ↗ Abrir en nueva pestaña
        </a>
      </div>

      {/* Iframe o fallback */}
      <div style={{ flex: 1, position: "relative" }}>
        {loading && !iframeError && (
          <div
            style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              background: "#060d1a", zIndex: 1, gap: 16,
            }}
          >
            <div
              style={{
                width: 36, height: 36,
                border: "3px solid rgba(0,229,255,0.15)",
                borderTopColor: "#00e5ff",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <span style={{ color: "#5a7a9a", fontSize: 13, letterSpacing: 1 }}>
              Cargando AppSheet...
            </span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {iframeError ? (
          <div
            style={{
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              height: "100%", gap: 20,
              background: "#060d1a",
            }}
          >
            <div style={{ fontSize: 48 }}>📊</div>
            <div style={{ color: "#00e5ff", fontSize: 18, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
              Seguimiento de Ventas
            </div>
            <div style={{ color: "#5a7a9a", fontSize: 13, textAlign: "center", maxWidth: 360, lineHeight: 1.6 }}>
              El navegador bloqueó el iframe. Usa el botón para abrir AppSheet directamente.
            </div>
            <a
              href={APPSHEET_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "14px 32px",
                background: "linear-gradient(135deg, #00b4d8, #0077b6)",
                color: "#fff", borderRadius: 12,
                fontSize: 14, fontWeight: 700,
                letterSpacing: 2, textDecoration: "none",
                textTransform: "uppercase",
                boxShadow: "0 0 20px rgba(0,180,216,0.35)",
              }}
            >
              ⚡ Abrir AppSheet
            </a>
          </div>
        ) : (
          <iframe
            src={APPSHEET_URL}
            title="Seguimiento de Ventas"
            onLoad={() => setLoading(false)}
            onError={() => { setIframeError(true); setLoading(false); }}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              display: "block",
            }}
            allow="camera; microphone; geolocation"
          />
        )}
      </div>
    </div>
  );
}