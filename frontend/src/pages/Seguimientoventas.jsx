import { useState } from "react";

const TABS = [
  {
    id: "jotform",
    label: "Formulario",
    url: "https://www.jotform.com/213356674788673",
    title: "JotForm Seguimiento",
  },
  {
    id: "appsheet",
    label: "AppSheet",
    url: "https://sites.google.com/view/panel-de-registro?usp=sharing",
    title: "AppSheet App",
  },
];

export default function TabbedEmbed() {
  const [activeTab, setActiveTab] = useState("jotform");
  const [showAppSheet, setShowAppSheet] = useState(false); // 👈 NUEVO

  const handleTabClick = (tab) => {
    if (tab.id === "appsheet") {
      setShowAppSheet(true); // 👈 abre el "módulo"
    } else {
      setActiveTab(tab.id);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100vh", fontFamily: "sans-serif" }}>
      
      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "2px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab)}
              style={{
                padding: "12px 24px",
                fontSize: "14px",
                fontWeight: isActive ? "600" : "400",
                color: isActive ? "#2563eb" : "#64748b",
                background: "none",
                border: "none",
                borderBottom: isActive ? "2px solid #2563eb" : "2px solid transparent",
                marginBottom: "-2px",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Iframe SOLO JotForm */}
      <div style={{ flex: 1, position: "relative" }}>
        {TABS.filter(tab => tab.id !== "appsheet").map((tab) => (
          <iframe
            key={tab.id}
            src={tab.url}
            title={tab.title}
            width="100%"
            height="100%"
            style={{
              border: "none",
              position: "absolute",
              top: 0,
              left: 0,
              display: activeTab === tab.id ? "block" : "none",
            }}
          />
        ))}
      </div>

      {/* 🔥 MODULO SIMULADO AppSheet */}
      {showAppSheet && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "#ffffff",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "12px",
              background: "#2563eb",
              color: "#fff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>AppSheet - Ventas</span>
            <button
              onClick={() => setShowAppSheet(false)}
              style={{
                background: "#fff",
                color: "#2563eb",
                border: "none",
                padding: "6px 12px",
                cursor: "pointer",
              }}
            >
              Cerrar
            </button>
          </div>

          {/* Contenido */}
          <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
            <button
              onClick={() =>
                window.open(
                  "https://www.appsheet.com/start/64aaca5b-4eba-4bc7-8dce-512ef8a1f118",
                  "_blank"
                )
              }
              style={{
                padding: "14px 24px",
                fontSize: "16px",
                background: "#2563eb",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                borderRadius: "6px",
              }}
            >
              Abrir AppSheet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
