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
    url: "https://www.appsheet.com/start/64aaca5b-4eba-4bc7-8dce-512ef8a1f118",
    title: "AppSheet App",
  },
];

export default function TabbedEmbed() {
  const [activeTab, setActiveTab] = useState("jotform");

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100vh", fontFamily: "sans-serif" }}>
      {/* Tab Bar */}
      <div
        style={{
          display: "flex",
          borderBottom: "2px solid #e2e8f0",
          backgroundColor: "#f8fafc",
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
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
                transition: "all 0.2s",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Iframe Content */}
      <div style={{ flex: 1, position: "relative" }}>
        {TABS.map((tab) => (
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
            allow="fullscreen"
          />
        ))}
      </div>
    </div>
  );
}