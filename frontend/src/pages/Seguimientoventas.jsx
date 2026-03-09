import { useState, useRef } from "react";

const APPSHEET_URL =
  "https://www.appsheet.com/start/64aaca5b-4eba-4bc7-8dce-512ef8a1f118?platform=mobile#appName=NewApp-984608101&vss=H4sIAAAAAAAAA62PywrCMBBFf6XMOv5AdiJdiJguLN0YF7GZQrBNSpOqJeTfnfpAcKku517O4U6Es8HLLqj6BHwf39cGJ-AQJZRTjxK4hJWzYXCtBCZBqO4RiqIqRF5mi6zKRbncSUiQDuzlCeiBx-80_D9rGBiNNpjG4DA7ZwO5njzVM03BJwuJQTcGdWzx_gixKVHWuHr0qCua9sMkv7b5tVdWb50mdaNaj-kGg-0ox40BAAA=&view=NOVONET%20-%20VENTAS";

export default function SeguimientoVentas() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const iframeRef = useRef(null);

  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const handleReload = () => {
    setIsLoading(true);
    setHasError(false);
    if (iframeRef.current) {
      iframeRef.current.src = APPSHEET_URL;
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-gray-50" style={{ minHeight: "calc(100vh - 64px)" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-3 shadow-sm border-b border-gray-200"
        style={{ background: "linear-gradient(90deg, #1e3a5f 0%, #2563eb 100%)" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white bg-opacity-20 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-white font-semibold text-base leading-tight">Seguimiento de Ventas</h1>
            <p className="text-blue-200 text-xs">Gestión y seguimiento comercial</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isLoading && !hasError && (
            <span className="flex items-center gap-1.5 text-xs text-green-300 bg-green-900 bg-opacity-40 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
              Conectado
            </span>
          )}
          <button onClick={handleReload} title="Recargar" className="w-8 h-8 rounded-lg bg-white bg-opacity-10 hover:bg-opacity-20 transition-all flex items-center justify-center text-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <a href={APPSHEET_URL} target="_blank" rel="noopener noreferrer" title="Abrir en nueva pestaña" className="w-8 h-8 rounded-lg bg-white bg-opacity-10 hover:bg-opacity-20 transition-all flex items-center justify-center text-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>

      {/* Content Area */}
      <div className="relative flex-1 w-full" style={{ minHeight: 0 }}>
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-50">
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 rounded-full border-4 border-blue-100"></div>
                <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
              </div>
              <div className="text-center">
                <p className="text-gray-700 font-medium text-sm">Cargando Seguimiento de Ventas...</p>
                <p className="text-gray-400 text-xs mt-1">Conectando con AppSheet</p>
              </div>
            </div>
          </div>
        )}

        {hasError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-50">
            <div className="flex flex-col items-center gap-4 max-w-sm text-center px-6">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <p className="text-gray-800 font-semibold">No se pudo cargar</p>
                <p className="text-gray-500 text-sm mt-1">El módulo no está disponible en este momento. Verifica tu conexión o ábrelo en una nueva pestaña.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleReload} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">Reintentar</button>
                <a href={APPSHEET_URL} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-100 transition-colors">Abrir en nueva pestaña</a>
              </div>
            </div>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src={APPSHEET_URL}
          title="Seguimiento de Ventas - AppSheet"
          onLoad={handleLoad}
          onError={handleError}
          className="w-full h-full border-0"
          style={{ display: hasError ? "none" : "block", height: "100%", minHeight: "calc(100vh - 112px)" }}
          allow="camera; microphone; geolocation; clipboard-read; clipboard-write"
          allowFullScreen
        />
      </div>
    </div>
  );
}