import React from "react";

const APPSHEET_URL =
  "https://www.appsheet.com/start/64aaca5b-4eba-4bc7-8dce-512ef8a1f118";

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