import { useEffect, useState } from "react";

export default function Indicadores() {
  const [reportUrl, setReportUrl] = useState("");

  // DICCIONARIO DE EMERGENCIA (Aquí pegas tus links)
  const URLS_FIJAS = {
    // Pongo las dos formas por si acaso (con error y sin error de ortografía)
    "ASESOR": "https://lookerstudio.google.com/embed/reporting/256bf4b5-e032-4d1f-b799-c931be1b38d9/page/4a8lF", 
    "ADMINISTRADOR": "https://lookerstudio.google.com/embed/reporting/5cfdbb81-95d3-428a-9e43-ac3a1687ba9c/page/0U7lF",
    "ANALISTA": "https://lookerstudio.google.com/embed/reporting/5cfdbb81-95d3-428a-9e43-ac3a1687ba9c/page/0U7lF",
    "GERENCIA": "https://lookerstudio.google.com/embed/reporting/6579e74e-9a91-4cbb-90ac-5f43448026f9/page/Hq8lF"
  };

  // URL POR DEFECTO (Si todo falla, muestra esto para que NO salga pantalla blanca en la demo)
  const URL_POR_DEFECTO = "https://lookerstudio.google.com/embed/reporting/6579e74e-9a91-4cbb-90ac-5f43448026f9/page/Hq8lF"; 

  useEffect(() => {
    const userData = localStorage.getItem("userProfile");
    
    if (userData) {
      const parsedUser = JSON.parse(userData);
      console.log("Perfil detectado:", parsedUser.perfil); // Para depurar

      // 1. Intentamos leer la URL que viene del Backend
      let urlFinal = parsedUser.url_reporte;

      // 2. Si el backend falló (o vino vacío), usamos el diccionario local
      if (!urlFinal) {
        urlFinal = URLS_FIJAS[parsedUser.perfil];
      }

      // 3. Si sigue vacío, usamos la por defecto (Para salvar la presentación)
      if (!urlFinal) {
        urlFinal = URL_POR_DEFECTO;
      }

      setReportUrl(urlFinal);
    }
  }, []);

  return (
    <div className="h-full w-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
      {reportUrl ? (
        <iframe
          src={reportUrl}
          className="absolute top-0 left-0 w-full h-full border-0"
          allowFullScreen
          sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        ></iframe>
      ) : (
        <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center">
          <span className="text-6xl mb-4">⚠️</span>
          <h3 className="text-xl font-bold text-gray-600">Cargando...</h3>
        </div>
      )}
    </div>
  );
}