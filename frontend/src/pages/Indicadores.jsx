import { useEffect, useState } from "react";

export default function Indicadores() {
  const [reportUrl, setReportUrl] = useState("");
  const [perfil, setPerfil] = useState("");
  const [tab, setTab] = useState("NOVONET"); // solo para GERENCIA

  const URLS_FIJAS = {
    ASESOR:
      "https://lookerstudio.google.com/embed/reporting/256bf4b5-e032-4d1f-b799-c931be1b38d9/page/4a8lF",
    ADMINISTRADOR:
      "https://lookerstudio.google.com/embed/reporting/5cfdbb81-95d3-428a-9e43-ac3a1687ba9c/page/0U7lF",
    ANALISTA:
      "https://lookerstudio.google.com/embed/reporting/5cfdbb81-95d3-428a-9e43-ac3a1687ba9c/page/0U7lF",
    GERENCIA:
      "https://lookerstudio.google.com/embed/u/0/reporting/5cfdbb81-95d3-428a-9e43-ac3a1687ba9c/page/p_byi0q8p8zd",
  };

  const URL_GERENCIA_VELSA =
    "https://lookerstudio.google.com/embed/reporting/ee3b8401-45d8-4075-912b-2bc6ef815309/page/TwbmF";

  const URL_GERENCIA_ASESORES =
    "https://lookerstudio.google.com/embed/reporting/7690d7a1-0a7e-4eeb-9f7b-5d1a65d0a03a/page/w7EnF";

  const URL_POR_DEFECTO = URLS_FIJAS.GERENCIA;

  useEffect(() => {
    const userData = localStorage.getItem("userProfile");

    if (userData) {
      const parsedUser = JSON.parse(userData);
      setPerfil(parsedUser.perfil);

      let urlFinal = parsedUser.url_reporte;

      if (!urlFinal) {
        urlFinal = URLS_FIJAS[parsedUser.perfil];
      }

      if (!urlFinal) {
        urlFinal = URL_POR_DEFECTO;
      }

      setReportUrl(urlFinal);
    }
  }, []);

  // 🔁 Cambiar iframe SOLO cuando GERENCIA cambia de tab
  useEffect(() => {
    if (perfil === "GERENCIA") {
      if (tab === "NOVONET") {
        setReportUrl(URLS_FIJAS.GERENCIA);
      } else if (tab === "VELSA") {
        setReportUrl(URL_GERENCIA_VELSA);
      } else if (tab === "ASESORES") {
        setReportUrl(URL_GERENCIA_ASESORES);
      }
    }
  }, [tab, perfil]);

  return (
    <div className="h-full w-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
      
      {/* 🔹 Tabs SOLO PARA GERENCIA */}
      {perfil === "GERENCIA" && (
        <div className="flex gap-2 p-3 border-b bg-gray-50">
          <button
            onClick={() => setTab("NOVONET")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${
              tab === "NOVONET"
                ? "bg-blue-600 text-white"
                : "bg-white border text-gray-600"
            }`}
          >
            Indicadores NOVONET
          </button>

          <button
            onClick={() => setTab("VELSA")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${
              tab === "VELSA"
                ? "bg-blue-600 text-white"
                : "bg-white border text-gray-600"
            }`}
          >
            Indicadores VELSA
          </button>

          <button
            onClick={() => setTab("ASESORES")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${
              tab === "ASESORES"
                ? "bg-blue-600 text-white"
                : "bg-white border text-gray-600"
            }`}
          >
            Módulo Asesores
          </button>
        </div>
      )}

      {/* 🔹 IFRAME */}
      <div className="relative flex-1">
        {reportUrl ? (
          <iframe
            src={reportUrl}
            className="absolute top-0 left-0 w-full h-full border-0"
            allowFullScreen
            sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          ></iframe>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <span className="text-6xl mb-4">⚠️</span>
            <h3 className="text-xl font-bold">Cargando...</h3>
          </div>
        )}
      </div>
    </div>
  );
}