/**
 * LlamadasWhatsApp.jsx
 * Softphone de WhatsApp Business Calling API embebido en el ERP.
 *
 * El módulo vive en un servicio aparte (calls-service en Render) para que un
 * deploy del ERP no corte llamadas en curso. Se abre en un iframe y entra con
 * el MISMO token del ERP (mismo JWT_SECRET), así el asesor no vuelve a loguearse.
 *
 * Variable: VITE_CALLS_URL = URL pública del calls-service.
 * Atajo "LLAMAR" desde otras pantallas: /whatsapp/llamadas?to=5939XXXXXXXX&name=Juan&ref=ID_TRATO
 */
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

const CALLS_URL = (import.meta.env.VITE_CALLS_URL || "").replace(/\/+$/, "");

export default function LlamadasWhatsApp() {
  const [params] = useSearchParams();
  const token = localStorage.getItem("token") || "";

  // El token va en el hash (#): no viaja al servidor ni queda en logs
  const src = useMemo(() => {
    const h = new URLSearchParams({ token });
    ["to", "name", "ref"].forEach(k => { if (params.get(k)) h.set(k, params.get(k)); });
    return `${CALLS_URL}/#${h.toString()}`;
  }, [token, params]);

  if (!CALLS_URL) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          Falta configurar <b>VITE_CALLS_URL</b> (URL del servicio de llamadas) en el frontend.
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] w-full overflow-hidden rounded-xl bg-white shadow-sm">
      <iframe
        key={src}
        title="Llamadas WhatsApp"
        src={src}
        allow="microphone; autoplay; clipboard-write"
        className="h-full w-full border-0"
      />
    </div>
  );
}
