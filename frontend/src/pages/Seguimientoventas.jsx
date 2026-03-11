import React from "react";

const APPSHEET_URL =
  "https://www.jotform.com/213356674788673";

export default function AppSheetEmbed() {
  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <iframe
        src={APPSHEET_URL}
        title="AppSheet Seguimiento"
        width="100%"
        height="100%"
        style={{
          border: "none",
        }}
        allow="fullscreen"
      />
    </div>
  );
}