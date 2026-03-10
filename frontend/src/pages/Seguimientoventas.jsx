import { useState } from "react";

const APPSHEET_URL =
  "https://www.appsheet.com/start/64aaca5b-4eba-4bc7-8dce-512ef8a1f118";

export default function SeguimientoVentas() {
  const [hover, setHover] = useState(false);

  return (
    <div
      className="flex flex-col items-center justify-center w-full"
      style={{ minHeight: "calc(100vh - 64px)", background: "linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 50%, #f0f4ff 100%)" }}
    >
      {/* Card */}
      <div
        className="flex flex-col items-center gap-8 px-8 py-12 rounded-3xl bg-white max-w-md w-full mx-4"
        style={{ boxShadow: "0 20px 60px rgba(37,99,235,0.12)" }}
      >
        {/* Icon */}
        <div className="relative">
          <div
            className="w-24 h-24 rounded-2xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <span
            className="absolute -inset-1 rounded-2xl border-2 border-blue-300 opacity-40 animate-ping"
            style={{ animationDuration: "2s" }}
          ></span>
        </div>

        {/* Text */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Seguimiento de Ventas</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Accede al formulario de seguimiento comercial para registrar y gestionar tus ventas en tiempo real.
          </p>
        </div>

        {/* Main Button */}
        <a
          href={APPSHEET_URL}
          target="_blank"
          rel="noopener noreferrer"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl text-white font-semibold text-base transition-all duration-300"
          style={{
            background: hover
              ? "linear-gradient(135deg, #1d4ed8 0%, #1e3a5f 100%)"
              : "linear-gradient(135deg, #2563eb 0%, #1e3a5f 100%)",
            boxShadow: hover
              ? "0 8px 30px rgba(37,99,235,0.5)"
              : "0 4px 15px rgba(37,99,235,0.35)",
            transform: hover ? "translateY(-2px)" : "translateY(0)",
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Abrir Formulario
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>

        {/* Info note */}
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Se abrirá en una nueva pestaña
        </p>
      </div>
    </div>
  );
}