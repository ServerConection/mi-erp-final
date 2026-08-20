import { useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const NUMERO_SOPORTE = "593960288044"; // sin "+" ni espacios (formato wa.me)

// El formulario de nombre + número queda suspendido por pedido del usuario
// (2026-08-20). En su lugar, el primer mensaje es un menú de opciones: se
// elige una con un clic y se abre WhatsApp con el texto ya armado. Si algún
// día se quiere recuperar el formulario, está en el historial de git de
// este archivo.
const OPCIONES = [
  {
    id: "reporte-erp",
    icono: "📋",
    titulo: "Deseo reportar un problema del ERP",
    mensaje: "Hola, deseo reportar un problema del ERP.",
  },
  {
    id: "problema-pc",
    icono: "🖥️",
    titulo: "Tengo problemas en mi PC",
    mensaje: "Hola, tengo problemas con mi PC.",
  },
  {
    id: "soporte-ti",
    icono: "🎧",
    titulo: "Necesito conversar con Soporte TI",
    mensaje: "Hola, necesito conversar con Soporte TI.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ICONO WHATSAPP (SVG inline — lucide-react no trae logos de marca)
// ─────────────────────────────────────────────────────────────────────────────
function WhatsAppIcon({ className }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="currentColor" aria-hidden="true">
      <path d="M16.004 3C9.377 3 4 8.373 4 15c0 2.29.638 4.43 1.744 6.256L4 29l7.94-1.706A11.93 11.93 0 0 0 16.004 27C22.63 27 28 21.627 28 15S22.63 3 16.004 3Zm0 21.7a9.66 9.66 0 0 1-4.93-1.35l-.354-.21-4.71 1.012 1.03-4.59-.232-.372A9.65 9.65 0 0 1 5.3 15c0-5.906 4.8-10.7 10.704-10.7 5.905 0 10.7 4.794 10.7 10.7 0 5.905-4.795 10.7-10.7 10.7Zm5.86-8.01c-.32-.16-1.9-.938-2.194-1.045-.294-.107-.508-.16-.722.16-.213.32-.827 1.045-1.014 1.26-.187.213-.373.24-.693.08-.32-.16-1.352-.498-2.575-1.588-.952-.848-1.594-1.895-1.782-2.215-.187-.32-.02-.493.14-.652.144-.143.32-.373.48-.56.16-.187.213-.32.32-.533.106-.213.053-.4-.027-.56-.08-.16-.722-1.74-.99-2.383-.26-.626-.526-.54-.722-.55l-.615-.01c-.213 0-.56.08-.853.4-.293.32-1.12 1.093-1.12 2.665s1.146 3.09 1.306 3.303c.16.213 2.256 3.444 5.467 4.83.764.33 1.36.527 1.825.674.767.244 1.464.21 2.016.127.615-.092 1.9-.777 2.168-1.526.267-.75.267-1.393.187-1.526-.08-.133-.293-.213-.613-.373Z" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function WhatsAppSupportButton() {
  const [abierto, setAbierto] = useState(false);
  const [opcionElegida, setOpcionElegida] = useState(null);

  useEffect(() => {
    if (abierto) {
      const onEsc = (e) => e.key === "Escape" && setAbierto(false);
      window.addEventListener("keydown", onEsc);
      return () => window.removeEventListener("keydown", onEsc);
    }
  }, [abierto]);

  const elegirOpcion = (opcion) => {
    setOpcionElegida(opcion.id);

    const url = `https://wa.me/${NUMERO_SOPORTE}?text=${encodeURIComponent(opcion.mensaje)}`;
    window.open(url, "_blank", "noopener,noreferrer");

    // Pequeño respiro visual antes de cerrar, para que se vea qué se eligió
    setTimeout(() => {
      setAbierto(false);
      setOpcionElegida(null);
    }, 500);
  };

  return (
    <>
      {/* ── Botón flotante ─────────────────────────────────────────────────
          Orden de la pila (de abajo hacia arriba), lado derecho: WhatsApp
          (aquí, bottom-6) → Chat interno (bottom-[92px]) → Tareas asignadas
          (bottom-[160px]), ver components/ChatTareasFloatingButtons.jsx. ── */}
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir chat de soporte por WhatsApp"
        className="fixed bottom-6 right-6 z-[999] group"
      >
        <span className="absolute inset-0 rounded-full bg-[#25D366] opacity-60 animate-ping" />
        <span
          className="relative flex items-center justify-center w-14 h-14 rounded-full
                     bg-gradient-to-br from-[#25D366] to-[#128C7E] text-white
                     shadow-[0_8px_24px_rgba(18,140,126,0.45)]
                     transition-transform duration-200 group-hover:scale-110 group-active:scale-95"
        >
          <WhatsAppIcon className="w-7 h-7" />
        </span>
      </button>

      {/* ── Popup / mini-landing ───────────────────────────────────────── */}
      {abierto && (
        <div
          className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-start sm:justify-end
                     p-0 sm:p-6"
          onClick={() => setAbierto(false)}
        >
          {/* overlay */}
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" />

          {/* card */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full sm:w-[360px] max-w-full bg-white sm:rounded-2xl rounded-t-2xl
                       shadow-card-hover overflow-hidden animate-fade-in-up
                       sm:mr-6 sm:mb-6 mx-auto sm:mx-0"
          >
            {/* header estilo WhatsApp */}
            <div className="relative bg-gradient-to-br from-[#128C7E] to-[#075E54] px-5 pt-5 pb-8 text-white">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center
                           rounded-full bg-white/15 hover:bg-white/25 transition-colors text-sm"
              >
                ✕
              </button>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center shrink-0">
                  <WhatsAppIcon className="w-6 h-6 text-[#25D366]" />
                </div>
                <div>
                  <p className="font-bold text-[15px] leading-tight">Soporte NOVONET</p>
                  <p className="text-[12px] text-white/85 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 inline-block" />
                    En línea · te respondemos en minutos
                  </p>
                </div>
              </div>
            </div>

            {/* burbuja de mensaje simulada */}
            <div className="px-5 -mt-4">
              <div className="bg-[#e9fbe6] border border-emerald-100 rounded-xl rounded-tl-sm px-3.5 py-2.5 text-[13px] text-slate-700 shadow-sm">
                ¡Hola! 👋 ¿En qué te ayudamos? Elige una opción:
              </div>
            </div>

            {/* menú de opciones — un clic abre WhatsApp con el mensaje ya listo */}
            <div className="p-5 pt-4 space-y-2">
              {OPCIONES.map((opcion) => {
                const activa = opcionElegida === opcion.id;
                return (
                  <button
                    key={opcion.id}
                    type="button"
                    onClick={() => elegirOpcion(opcion)}
                    disabled={!!opcionElegida}
                    className={`w-full flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm font-medium
                                transition-all disabled:cursor-not-allowed
                                ${activa
                                  ? "border-[#25D366] bg-[#e9fbe6] text-emerald-800"
                                  : "border-slate-200 text-slate-700 hover:border-[#25D366] hover:bg-[#f3fef1] active:scale-[0.98]"}`}
                  >
                    <span className="text-lg leading-none shrink-0">{opcion.icono}</span>
                    <span className="flex-1">{opcion.titulo}</span>
                    {activa && (
                      <span className="text-[11px] font-semibold text-emerald-600 shrink-0">Abriendo…</span>
                    )}
                  </button>
                );
              })}

              <p className="text-[10px] text-slate-400 text-center leading-relaxed pt-2">
                Se abrirá WhatsApp con el mensaje correspondiente ya listo para enviar.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
