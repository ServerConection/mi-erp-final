/**
 * VidikaEmbed.jsx
 * Módulo de reportería Vidika embebido en el ERP.
 *
 * Auto-login: usa un form POST oculto que autentica directamente
 * dentro del iframe, sin que el usuario vea la pantalla de login.
 *
 * Actualización: en tiempo real (el iframe mantiene su propia sesión).
 *
 * ─── CONFIGURA AQUÍ ───────────────────────────────────────────────
 * Cambia VIDIKA_CONFIG con las credenciales reales.
 * Si Vidika tiene un endpoint de token (ej: /api/auth/token),
 * cambia LOGIN_URL y los nombres de los campos (field_user, field_pass).
 * ──────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from "react";

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
const VIDIKA_CONFIG = {
  BASE_URL:    "https://reportingvidika.online",
  DASHBOARD:   "https://reportingvidika.online/dashboard",   // URL post-login
  LOGIN_URL:   "https://reportingvidika.online/login",       // endpoint de login
  FIELD_USER:  "username",   // nombre del campo usuario en el form de Vidika
  FIELD_PASS:  "password",   // nombre del campo contraseña en el form de Vidika
  // ── Credenciales (mueve esto a variables de entorno en producción) ──
  USERNAME:    import.meta.env.VITE_VIDIKA_USER || "tu_usuario",
  PASSWORD:    import.meta.env.VITE_VIDIKA_PASS || "tu_contraseña",
};

const FRAME_ID = "vidika-iframe";
const FORM_ID  = "vidika-autologin-form";

// ─── ESTADOS VISUALES ─────────────────────────────────────────────────────────
const STATUS = {
  LOADING:    { label: "Conectando...",  dot: "bg-yellow-400", pulse: true  },
  CONNECTED:  { label: "En vivo",        dot: "bg-emerald-400", pulse: true  },
  ERROR:      { label: "Sin conexión",   dot: "bg-red-500",     pulse: false },
};

export default function VidikaEmbed() {
  const [status,     setStatus]     = useState("LOADING");
  const [fullscreen, setFullscreen] = useState(false);
  const [lastRefresh,setLastRefresh]= useState(new Date());
  const [loginDone,  setLoginDone]  = useState(false);
  const [frameKey,   setFrameKey]   = useState(0);   // fuerza remount del iframe
  const formRef   = useRef(null);
  const wrapperRef= useRef(null);

  // ── Auto-login al montar ─────────────────────────────────────────────────
  useEffect(() => {
    // Pequeño delay para que el iframe esté listo en el DOM
    const t = setTimeout(() => {
      if (formRef.current) {
        formRef.current.submit();
        setLoginDone(true);
        setLastRefresh(new Date());
        setTimeout(() => setStatus("CONNECTED"), 2500);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [frameKey]);

  // ── Fullscreen API ───────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      wrapperRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  // ── Refrescar manualmente ────────────────────────────────────────────────
  function handleRefresh() {
    setStatus("LOADING");
    setLoginDone(false);
    setFrameKey(k => k + 1);
  }

  const s = STATUS[status];
  const timeStr = lastRefresh.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div
      ref={wrapperRef}
      className={`flex flex-col bg-slate-950 transition-all ${
        fullscreen ? "fixed inset-0 z-50" : "h-[calc(100vh-64px)] rounded-2xl overflow-hidden"
      }`}
    >
      {/* ── TOOLBAR ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-white/8 shrink-0">

        {/* Izquierda: branding */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base">📊</span>
            <span className="text-sm font-bold text-white tracking-tight">Vidika</span>
            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-widest hidden sm:inline">Reportería</span>
          </div>
          <div className="w-px h-4 bg-white/10" />
          {/* Status dot */}
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot} ${s.pulse ? "animate-pulse" : ""}`} />
            <span className="text-xs text-slate-400 font-medium">{s.label}</span>
          </div>
        </div>

        {/* Centro: última actualización */}
        <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500">
          <span>🕐</span>
          <span>Actualizado {timeStr}</span>
        </div>

        {/* Derecha: acciones */}
        <div className="flex items-center gap-2">
          <a
            href={VIDIKA_CONFIG.BASE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-slate-400 hover:text-white border border-white/10 hover:border-white/25 transition"
          >
            ↗ Abrir aparte
          </a>
          <button
            onClick={handleRefresh}
            title="Refrescar"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/25 transition text-base"
          >
            ↺
          </button>
          <button
            onClick={toggleFullscreen}
            title={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/25 transition text-sm"
          >
            {fullscreen ? "⊡" : "⛶"}
          </button>
        </div>
      </div>

      {/* ── ÁREA DEL IFRAME ─────────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0">

        {/* Overlay de carga */}
        {status === "LOADING" && (
          <div className="absolute inset-0 z-10 bg-slate-950 flex flex-col items-center justify-center gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-white/10" />
              <div className="absolute inset-0 rounded-full border-2 border-t-blue-400 animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-white">Iniciando sesión en Vidika…</p>
              <p className="text-xs text-slate-500 mt-1">Autenticación automática en curso</p>
            </div>
          </div>
        )}

        {/* Form oculto para auto-login — hace POST al iframe */}
        {!loginDone && (
          <form
            ref={formRef}
            id={FORM_ID}
            method="POST"
            action={VIDIKA_CONFIG.LOGIN_URL}
            target={FRAME_ID}
            style={{ display: "none" }}
          >
            <input type="hidden" name={VIDIKA_CONFIG.FIELD_USER} value={VIDIKA_CONFIG.USERNAME} />
            <input type="hidden" name={VIDIKA_CONFIG.FIELD_PASS} value={VIDIKA_CONFIG.PASSWORD} />
            {/* Si Vidika necesita un redirect post-login: */}
            <input type="hidden" name="redirect" value={VIDIKA_CONFIG.DASHBOARD} />
            <input type="hidden" name="next"     value={VIDIKA_CONFIG.DASHBOARD} />
          </form>
        )}

        {/* El iframe — target del form de login */}
        <iframe
          key={frameKey}
          id={FRAME_ID}
          name={FRAME_ID}
          src={loginDone ? VIDIKA_CONFIG.DASHBOARD : "about:blank"}
          title="Reportería Vidika"
          className="w-full h-full border-0 bg-slate-950"
          allow="fullscreen; autoplay"
          onLoad={() => {
            if (loginDone && status === "LOADING") {
              setStatus("CONNECTED");
              setLastRefresh(new Date());
            }
          }}
          onError={() => setStatus("ERROR")}
        />
      </div>

      {/* ── FOOTER (solo en pantalla completa/TV) ───────────────────────── */}
      {fullscreen && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-slate-900/80 border-t border-white/8 shrink-0">
          <span className="text-[10px] text-slate-600">ERP · Módulo Vidika</span>
          <span className="text-[10px] text-slate-600">{timeStr}</span>
        </div>
      )}
    </div>
  );
}
