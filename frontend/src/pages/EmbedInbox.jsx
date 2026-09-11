/**
 * EmbedInbox.jsx — "WABOT Inbox" embebido dentro de Bitrix24
 * ---------------------------------------------------------------------------
 * Se abre SOLO desde la pestaña "WABOT" del Deal en Bitrix (ver
 * backend/src/controllers/bitrixConnector.controller.js → placementInbox).
 * No lleva sidebar ni el layout del ERP: es una réplica de la experiencia de
 * WAZZUP — solo el módulo de Inbox, nada más alrededor.
 *
 * Recibe un código de un solo uso (?code=...) en la URL — NUNCA el JWT real.
 * Lo canjea una única vez contra /api/auth/bitrix-exchange y, si es válido,
 * guarda la sesión igual que el login normal (mismas claves de localStorage
 * que usa Login.jsx: "token" y "userProfile") y muestra el Inbox. A partir de
 * ahí, el filtrado de "solo mis chats" lo hace el backend igual que siempre
 * (por el usuario del JWT) — este componente no filtra nada por su cuenta.
 *
 * Si el código ya se usó, expiró, o Bitrix no pudo confirmar la identidad,
 * se muestra un aviso claro — nunca se deja al asesor en una pantalla vacía.
 */
import { useEffect, useState, useRef } from "react";
import WaInbox from "./WaInbox";

const API = import.meta.env.VITE_API_URL;

export default function EmbedInbox() {
  const [estado, setEstado] = useState("cargando"); // cargando | listo | error
  const yaCanjeado = useRef(false);

  useEffect(() => {
    if (yaCanjeado.current) return; // evita canjear el código 2 veces (StrictMode / re-render)
    yaCanjeado.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (!code) {
      setEstado("error");
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API}/api/auth/bitrix-exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
          setEstado("error");
          return;
        }

        localStorage.setItem("token", data.token);
        localStorage.setItem("userProfile", JSON.stringify(data.user));

        // Limpia el código de la URL: si el asesor recarga la pestaña, no
        // intenta canjear de nuevo un código que ya se usó (fallaría, y
        // además evita dejar el código visible en el historial del navegador).
        window.history.replaceState({}, "", window.location.pathname);

        setEstado("listo");
      } catch {
        setEstado("error");
      }
    })();
  }, []);

  if (estado === "cargando") {
    return (
      <div style={estilos.centrado}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={estilos.spinner} />
          <span style={estilos.textoSpinner}>Conectando con tu sesión…</span>
        </div>
        <style>{"@keyframes girar-embed-inbox { to { transform: rotate(360deg); } }"}</style>
      </div>
    );
  }

  if (estado === "error") {
    return (
      <div style={{ ...estilos.centrado, padding: 24, textAlign: "center" }}>
        <div>
          <h3 style={{ margin: 0, marginBottom: 8, color: "#334155" }}>No se pudo abrir el Inbox</h3>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
            El enlace expiró o ya se usó. Cierra esta pestaña y vuelve a abrir el Deal en Bitrix.
          </p>
        </div>
      </div>
    );
  }

  return <WaInbox />;
}

const estilos = {
  centrado: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    background: "#fff",
  },
  spinner: {
    width: 32,
    height: 32,
    border: "4px solid #2563eb",
    borderTopColor: "transparent",
    borderRadius: "50%",
    animation: "girar-embed-inbox 0.8s linear infinite",
  },
  textoSpinner: {
    fontSize: 11,
    fontWeight: 900,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
};
