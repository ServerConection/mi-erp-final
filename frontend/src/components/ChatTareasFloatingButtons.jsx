/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BOTONES FLOTANTES: Chat interno + Tareas asignadas
 * ═══════════════════════════════════════════════════════════════════════════════
 * Se muestran apilados en la esquina inferior izquierda, junto al botón de
 * WhatsApp (ver components/WhatsAppSupportButton.jsx, que se movió un poco
 * más arriba para dejar este espacio libre).
 *
 * Orden de abajo hacia arriba:
 *   1. WhatsApp         (bottom-6, ver WhatsAppSupportButton.jsx)
 *   2. Chat interno     (bottom-[92px])  → badge = mensajes no leídos, tiempo real (socket)
 *   3. Tareas asignadas (bottom-[160px]) → solo visible si hay tareas asignadas
 *
 * Ambos botones solo se montan si hay sesión iniciada (token en localStorage)
 * y no estamos en /login, para no disparar llamadas a la API sin auth.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { MessageCircle, ClipboardCheck } from "lucide-react";
import { chatApi, useSocketChat } from "../hooks/useChat";
import { useMisTareas } from "../hooks/useTareas";

const tieneSesion = () => !!localStorage.getItem("token");

// ─────────────────────────────────────────────────────────────────────────────
// Botón: Chat interno (con badge de no leídos, actualizado por socket)
// ─────────────────────────────────────────────────────────────────────────────
function BotonChatInterno() {
  const navigate = useNavigate();
  const location = useLocation();
  const [noLeidos, setNoLeidos] = useState(0);

  const cargarNoLeidos = useCallback(() => {
    chatApi
      .listarConversaciones()
      .then((r) => {
        const total = (r.data || []).reduce((acc, c) => acc + (c.noLeidos || 0), 0);
        setNoLeidos(total);
      })
      .catch(() => {
        /* silencioso: el ícono no debe romper el resto del ERP */
      });
  }, []);

  // Carga inicial + respaldo por si el socket se cae
  useEffect(() => {
    cargarNoLeidos();
    const t = setInterval(cargarNoLeidos, 60000);
    return () => clearInterval(t);
  }, [cargarNoLeidos]);

  // Tiempo real: mensaje nuevo o conversación nueva → recalcular badge
  useSocketChat({
    "chat:mensaje": cargarNoLeidos,
    "chat:conversacion_nueva": cargarNoLeidos,
  });

  const enChat = location.pathname === "/chat";

  return (
    <button
      type="button"
      onClick={() => navigate("/chat")}
      aria-label={noLeidos > 0 ? `Chat interno, ${noLeidos} sin leer` : "Abrir chat interno"}
      title="Chat interno"
      className="fixed bottom-[92px] left-6 z-[999] group"
    >
      <span
        className="relative flex items-center justify-center w-14 h-14 rounded-full text-white
                   shadow-[0_8px_24px_rgba(37,99,235,0.45)]
                   transition-transform duration-200 group-hover:scale-110 group-active:scale-95"
        style={{
          background: enChat
            ? "linear-gradient(135deg,#1d4ed8,#1e3a8a)"
            : "linear-gradient(135deg,#3b82f6,#2563eb)",
        }}
      >
        <MessageCircle className="w-6 h-6" />
      </span>

      {noLeidos > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[20px] h-5 rounded-full bg-rose-500
                     text-white text-[11px] font-bold flex items-center justify-center px-1
                     border-2 border-white animate-pulse"
        >
          {noLeidos > 99 ? "99+" : noLeidos}
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Botón: Tareas asignadas (solo aparece si el usuario tiene tareas pendientes)
// ─────────────────────────────────────────────────────────────────────────────
function BotonTareasAsignadas() {
  const navigate = useNavigate();
  const location = useLocation();
  const { datos, recargar } = useMisTareas("responsable");

  // Respaldo por si el usuario deja el ERP abierto y le asignan algo nuevo
  useEffect(() => {
    const t = setInterval(recargar, 90000);
    return () => clearInterval(t);
  }, [recargar]);

  const total = datos?.contadores?.total || 0;
  if (total === 0) return null;

  const enTareas = location.pathname === "/tareas";

  return (
    <button
      type="button"
      onClick={() => navigate("/tareas")}
      aria-label={`Tareas asignadas, ${total} pendientes`}
      title="Tareas asignadas"
      className="fixed bottom-[160px] left-6 z-[999] group"
    >
      <span
        className="relative flex items-center justify-center w-14 h-14 rounded-full text-white
                   shadow-[0_8px_24px_rgba(217,119,6,0.45)]
                   transition-transform duration-200 group-hover:scale-110 group-active:scale-95"
        style={{
          background: enTareas
            ? "linear-gradient(135deg,#b45309,#92400e)"
            : "linear-gradient(135deg,#f59e0b,#d97706)",
        }}
      >
        <ClipboardCheck className="w-6 h-6" />
      </span>

      <span
        className="absolute -top-1 -right-1 min-w-[20px] h-5 rounded-full bg-rose-500
                   text-white text-[11px] font-bold flex items-center justify-center px-1
                   border-2 border-white"
      >
        {total > 99 ? "99+" : total}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL — decide si hay sesión antes de montar nada
// ─────────────────────────────────────────────────────────────────────────────
export default function ChatTareasFloatingButtons() {
  const location = useLocation();
  // Lectura síncrona de localStorage en cada render. useLocation ya fuerza
  // un re-render en cada cambio de ruta (ej. justo después del login), así
  // que no hace falta un efecto ni memoización para mantenerlo al día.
  const autenticado = tieneSesion();

  if (!autenticado || location.pathname === "/login") return null;

  return (
    <>
      <BotonChatInterno />
      <BotonTareasAsignadas />
    </>
  );
}
