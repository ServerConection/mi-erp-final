/**
 * TarjetaCliente — imagen presentable para enviar al cliente por WhatsApp.
 *
 * REGLA DE SEGURIDAD (no modificar sin revisar):
 * Esta tarjeta NUNCA debe mostrar:
 *   • Polígonos de cobertura → es información competitiva: revela hasta dónde
 *     llega y hasta dónde no llega la red.
 *   • Zonas de peligro → es información interna y sensible. Enviarle a un
 *     cliente una imagen donde su barrio aparece como "Zona Bloqueada" es un
 *     problema serio de reputación.
 *
 * Por eso el mapa se renderiza con modo="cliente", que ignora el arreglo de
 * zonas por completo y solo dibuja el marcador.
 */

import { useRef, useState } from "react";
import MapaCobertura from "./MapaCobertura";

export default function TarjetaCliente({ lat, lon, hasCoverage, onCerrar, empresa = "NETLIFE" }) {
  const tarjetaRef = useRef(null);
  const [descargando, setDescargando] = useState(false);
  const [aviso, setAviso] = useState("");

  // Descarga la tarjeta como PNG usando html2canvas (CDN, bajo demanda).
  // Si falla (por ejemplo, si los tiles del mapa bloquean el export), se le
  // indica al usuario que tome una captura de pantalla.
  async function descargarPNG() {
    setDescargando(true);
    setAviso("");
    try {
      if (!window.html2canvas) {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js";
          s.onload = resolve;
          s.onerror = () => reject(new Error("no-cdn"));
          document.head.appendChild(s);
        });
      }
      const canvas = await window.html2canvas(tarjetaRef.current, {
        useCORS: true,
        backgroundColor: "#ffffff",
        scale: 2,
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `cobertura-${lat.toFixed(5)}_${lon.toFixed(5)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      setAviso("No se pudo generar la imagen automáticamente. Toma una captura de pantalla de la tarjeta.");
    } finally {
      setDescargando(false);
    }
  }

  const fecha = new Date().toLocaleDateString("es-EC", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <div className="fixed inset-0 z-[1000] bg-black/60 flex items-start md:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full my-auto">

        {/* Encabezado del modal (NO se incluye en la imagen) */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="font-semibold text-slate-700 text-sm">Vista para el cliente</h3>
          <button
            onClick={onCerrar}
            className="text-slate-400 hover:text-slate-700 text-xl leading-none px-1"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {/* ── TARJETA QUE SE EXPORTA ─────────────────────────────────────── */}
        <div ref={tarjetaRef} className="bg-white p-5">
          <div className="border-2 border-slate-200 rounded-xl overflow-hidden">

            <div className={`px-5 py-4 text-white ${hasCoverage
              ? "bg-gradient-to-r from-teal-600 to-teal-500"
              : "bg-gradient-to-r from-slate-600 to-slate-500"}`}>
              <p className="text-[11px] font-bold uppercase tracking-widest opacity-90">
                {empresa}
              </p>
              <p className="text-lg font-extrabold leading-tight mt-0.5">
                {hasCoverage ? "Cobertura disponible" : "Consulta de cobertura"}
              </p>
            </div>

            {/* Mapa SIN polígonos ni zonas de peligro (modo="cliente") */}
            <MapaCobertura
              lat={lat}
              lon={lon}
              modo="cliente"
              zoom={16}
              alto={230}
              interactivo={false}
              etiquetaMarcador="Tu ubicación"
            />

            <div className="px-5 py-4">
              {hasCoverage ? (
                <div className="flex items-start gap-3">
                  <span className="text-3xl leading-none">✅</span>
                  <div>
                    <p className="font-bold text-teal-700 text-sm">
                      ¡Buenas noticias! Tu ubicación cuenta con cobertura
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Podemos brindarte el servicio en esta dirección.
                      Un asesor coordinará contigo la instalación.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <span className="text-3xl leading-none">📍</span>
                  <div>
                    <p className="font-bold text-slate-700 text-sm">
                      Aún no tenemos cobertura en esta ubicación
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Estamos ampliando nuestra red constantemente.
                      Te contactaremos apenas llegue el servicio a tu zona.
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                <span>Consulta realizada el {fecha}</span>
                <span className="font-mono">{lat?.toFixed(5)}, {lon?.toFixed(5)}</span>
              </div>
            </div>

          </div>
        </div>
        {/* ── FIN DE LA TARJETA ──────────────────────────────────────────── */}

        <div className="px-5 pb-5 space-y-2">
          {aviso && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {aviso}
            </p>
          )}
          <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            🔒 Esta vista no muestra los polígonos de cobertura ni las zonas de
            riesgo. Es segura para enviar al cliente.
          </p>
          <div className="flex gap-2">
            <button
              onClick={descargarPNG}
              disabled={descargando}
              className="flex-1 py-2.5 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 disabled:opacity-60 transition"
            >
              {descargando ? "Generando…" : "⬇ Descargar imagen"}
            </button>
            <button
              onClick={onCerrar}
              className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition"
            >
              Cerrar
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
