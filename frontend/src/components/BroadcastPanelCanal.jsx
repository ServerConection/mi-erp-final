/**
 * BroadcastPanelCanal.jsx — v2 Dark Premium
 * Panel de broadcast para NOVONET y VELSA.
 * Props:
 *   canal   "novonet" | "velsa"
 *   config  { label, accent, icon }
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Catálogos ────────────────────────────────────────────────────────────────
const TIPOS = [
  { id: "urgente",       emoji: "🚨", label: "Urgente",       bg: "rgba(239,68,68,.18)",  border: "#ef4444", text: "#fca5a5" },
  { id: "prevencion",    emoji: "⚠️",  label: "Prevención",    bg: "rgba(234,179,8,.16)",  border: "#eab308", text: "#fde047" },
  { id: "logro",         emoji: "🏆", label: "Logro",          bg: "rgba(16,185,129,.16)", border: "#10b981", text: "#6ee7b7" },
  { id: "info",          emoji: "📢", label: "Info",           bg: "rgba(59,130,246,.16)", border: "#3b82f6", text: "#93c5fd" },
  { id: "personalizado", emoji: "✨", label: "Personalizado",  bg: "rgba(168,85,247,.16)", border: "#a855f7", text: "#d8b4fe" },
  { id: "record",        emoji: "🥇", label: "Récord",         bg: "rgba(251,191,36,.16)", border: "#fbbf24", text: "#fde68a" },
  { id: "motivacion",    emoji: "💪", label: "Motivación",     bg: "rgba(236,72,153,.16)", border: "#ec4899", text: "#f9a8d4" },
];

const EFECTOS = [
  { id: "ninguno",    label: "Sin efecto",   emoji: "○",  color: "#64748b" },
  { id: "confeti",    label: "Confeti",      emoji: "🎊", color: "#f59e0b" },
  { id: "fuego",      label: "Fuego",        emoji: "🔥", color: "#ef4444" },
  { id: "alertaroja", label: "Alerta Roja",  emoji: "🚨", color: "#dc2626" },
  { id: "nieve",      label: "Nieve",        emoji: "❄️", color: "#93c5fd" },
  { id: "estrellas",  label: "Estrellas",    emoji: "⭐", color: "#fbbf24" },
  { id: "arcoiris",   label: "Arcoíris",     emoji: "🌈", color: "#a855f7" },
  { id: "matrix",     label: "Matrix",       emoji: "💻", color: "#22c55e" },
  { id: "spotlight",  label: "Spotlight",    emoji: "🔦", color: "#e2e8f0" },
  { id: "pulso",      label: "Pulso",        emoji: "⚡", color: "#3b82f6" },
  { id: "explosion",  label: "Explosión",    emoji: "💥", color: "#f97316" },
  { id: "glitch",     label: "Glitch",       emoji: "👾", color: "#8b5cf6" },
];

const SONIDOS = [
  { id: "ninguno",   label: "Sin sonido",   emoji: "🔇" },
  { id: "chime",     label: "Chime",        emoji: "🔔" },
  { id: "alerta",    label: "Alerta",       emoji: "🚨" },
  { id: "victoria",  label: "Victoria",     emoji: "🏆" },
  { id: "error",     label: "Atención",     emoji: "❌" },
  { id: "pop",       label: "Pop",          emoji: "🎈" },
  { id: "swoosh",    label: "Swoosh",       emoji: "💨" },
  { id: "cash",      label: "Caja",         emoji: "💰" },
];

const DATOS_VIVOS = [
  { id: "",               label: "Sin datos en vivo",    emoji: "—"  },
  { id: "top_asesores",   label: "Top asesores del día", emoji: "🥇" },
  { id: "top_activas",    label: "Top activas",          emoji: "✅" },
  { id: "sin_ventas",     label: "Sin ventas",           emoji: "📉" },
  { id: "gestion_diaria", label: "En Gestión Diaria",    emoji: "⚠️" },
  { id: "resumen_dia",    label: "Resumen del día",      emoji: "📊" },
];

const PLANTILLAS = [
  { emoji: "🏆", titulo: "¡META ALCANZADA!",       mensaje: "El equipo superó la meta del día. ¡Excelente trabajo a todos!", tipo: "logro",      efecto: "confeti"   },
  { emoji: "💪", titulo: "¡VAMOS EQUIPO!",          mensaje: "Cada llamada cuenta. ¡Démoslo todo en esta recta final!", tipo: "motivacion", efecto: "pulso"     },
  { emoji: "⚠️",  titulo: "REUNIÓN EN 5 MINUTOS",   mensaje: "Por favor acérquense al área de coordinación.", tipo: "prevencion", efecto: "alertaroja"},
  { emoji: "☕", titulo: "DESCANSO — 15 MIN",       mensaje: "Pausa activa. Regresamos a las actividades en 15 minutos.", tipo: "info",       efecto: "ninguno"   },
  { emoji: "🎯", titulo: "¡CIERRE DEL DÍA!",       mensaje: "Últimos 30 minutos. Maximicen su gestión. ¡Lo logramos!", tipo: "urgente",    efecto: "fuego"     },
  { emoji: "🥇", titulo: "¡NUEVO RÉCORD!",          mensaje: "Hoy establecimos un nuevo récord histórico. ¡INCREÍBLE!", tipo: "record",     efecto: "estrellas" },
  { emoji: "📢", titulo: "ATENCIÓN EQUIPO",         mensaje: "Escríbeme el mensaje personalizado aquí.", tipo: "info",       efecto: "spotlight" },
  { emoji: "🚀", titulo: "¡HORA PICO!",             mensaje: "Máxima concentración — estamos en la hora más importante.", tipo: "urgente",    efecto: "explosion" },
];

const FONDOS_PRESET = [
  { color: "#0f172a", label: "Noche"      },
  { color: "#1e1b4b", label: "Indigo"     },
  { color: "#0c4a6e", label: "Océano"     },
  { color: "#064e3b", label: "Selva"      },
  { color: "#431407", label: "Brasa"      },
  { color: "#1a1a2e", label: "Cosmos"     },
  { color: "#2d1b69", label: "Galaxia"    },
  { color: "#0d1b2a", label: "Profundo"   },
  { color: "#0a0f1e", label: "Abismo"     },
  { color: "#1c0533", label: "Aura"       },
  { color: "#1a0a00", label: "Cobre"      },
  { color: "#001a00", label: "Matrix"     },
];

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

// ─── Keyframes CSS ─────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
@keyframes bcast-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(.97)} }
@keyframes bcast-glow  { 0%,100%{box-shadow:0 0 0 0 transparent} 50%{box-shadow:0 0 24px 4px var(--glow)} }
@keyframes bcast-shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
@keyframes bcast-rainbow { 0%{filter:hue-rotate(0deg)} 100%{filter:hue-rotate(360deg)} }
@keyframes bcast-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
@keyframes bcast-glitch {
  0%,100%{transform:translate(0)} 20%{transform:translate(-2px,1px);filter:hue-rotate(90deg)}
  40%{transform:translate(2px,-1px)} 60%{transform:translate(-1px,2px);filter:hue-rotate(180deg)}
  80%{transform:translate(1px,-2px)}
}
@keyframes bcast-scanline { 0%{top:-10%} 100%{top:110%} }
@keyframes bcast-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
@keyframes bcast-pop { 0%{transform:scale(.8);opacity:0} 60%{transform:scale(1.1)} 100%{transform:scale(1);opacity:1} }
@keyframes bcast-progress { from{width:100%} to{width:0%} }

.bcast-card {
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 16px;
  padding: 18px 20px;
  backdrop-filter: blur(20px);
}
.bcast-btn-chip {
  padding: 6px 14px; border-radius: 20px; border: 1px solid;
  font-size: 11px; font-weight: 700; cursor: pointer;
  transition: all .15s; white-space: nowrap;
}
.bcast-btn-chip:hover { transform: translateY(-1px); }
.bcast-grid-efecto {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.bcast-grid-sonido {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.bcast-input {
  width: 100%; box-sizing: border-box;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 10px; padding: 10px 14px;
  font-size: 13px; font-weight: 500; color: #f1f5f9;
  outline: none; transition: border .15s;
}
.bcast-input::placeholder { color: rgba(241,245,249,.35); }
.bcast-input:focus { border-color: rgba(255,255,255,.3); background: rgba(255,255,255,.09); }
.bcast-label {
  display: block; font-size: 9px; font-weight: 800;
  color: rgba(148,163,184,.8); text-transform: uppercase;
  letter-spacing: .12em; margin-bottom: 8px;
}
`;

// ─── Mini audio player ─────────────────────────────────────────────────────────
function AudioPlayer({ src, name, accent }) {
  const audioRef  = useRef(null);
  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().then(() => setPlaying(true)).catch(() => {}); }
  };
  const fmt = s => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10,
      background:"rgba(255,255,255,.06)", borderRadius:10,
      padding:"10px 14px", marginTop:8,
      border:"1px solid rgba(255,255,255,.1)" }}>
      <audio ref={audioRef} src={src}
        onTimeUpdate={() => { const a=audioRef.current; if(a) setProgress(a.currentTime/(a.duration||1)*100); }}
        onLoadedMetadata={() => { if(audioRef.current) setDuration(audioRef.current.duration); }}
        onEnded={() => setPlaying(false)} />
      <button onClick={toggle} style={{
        width:32, height:32, borderRadius:"50%",
        background: playing ? accent : "rgba(255,255,255,.12)", color:"#fff",
        border:"none", cursor:"pointer", fontSize:12,
        display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
        transition:"all .15s",
      }}>{playing ? "⏸" : "▶"}</button>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontSize:11, fontWeight:600, color:"#e2e8f0", margin:"0 0 4px",
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {name || "Audio adjunto"}
        </p>
        <div style={{ height:3, background:"rgba(255,255,255,.12)", borderRadius:4 }}>
          <div style={{ height:"100%", width:`${progress}%`, background:accent, borderRadius:4, transition:"width .1s" }} />
        </div>
      </div>
      <span style={{ fontSize:10, color:"#64748b", flexShrink:0, fontWeight:600 }}>{fmt(duration)}</span>
    </div>
  );
}

// ─── Vista previa animada ──────────────────────────────────────────────────────
function PreviewScreen({ form, imagen, audioPreviewSrc, tipoActual, label, accent }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x+1), 80);
    return () => clearInterval(t);
  }, []);

  const efecto = form.efecto;

  // Overlay animations por efecto
  const overlayStyle = () => {
    switch (efecto) {
      case "alertaroja": return {
        position:"absolute", inset:0, pointerEvents:"none",
        animation:"bcast-shake .15s infinite",
        background:"rgba(239,68,68,.12)",
        outline:"4px solid #ef4444",
      };
      case "pulso": return {
        position:"absolute", inset:0, pointerEvents:"none",
        animation:`bcast-pulse 1s ease-in-out infinite`,
        "--glow": accent,
      };
      case "glitch": return {
        position:"absolute", inset:0, pointerEvents:"none",
        animation:"bcast-glitch .6s infinite",
      };
      case "spotlight": return {
        position:"absolute", inset:0, pointerEvents:"none",
        background:"radial-gradient(circle at 50% 45%, transparent 30%, rgba(0,0,0,.7) 70%)",
      };
      case "matrix": return {
        position:"absolute", inset:0, pointerEvents:"none",
        background:"repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,197,94,.04) 2px, rgba(34,197,94,.04) 4px)",
      };
      case "arcoiris": return {
        position:"absolute", inset:0, pointerEvents:"none",
        animation:"bcast-rainbow 2s linear infinite",
        background:"linear-gradient(135deg, rgba(239,68,68,.15), rgba(234,179,8,.15), rgba(34,197,94,.15), rgba(59,130,246,.15), rgba(168,85,247,.15))",
      };
      case "nieve": return {
        position:"absolute", inset:0, pointerEvents:"none",
        background:"radial-gradient(circle at 20% 20%, rgba(147,197,253,.2) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(147,197,253,.15) 0%, transparent 40%)",
      };
      case "explosion": return {
        position:"absolute", inset:0, pointerEvents:"none",
        background:"radial-gradient(circle at 50% 50%, rgba(249,115,22,.25) 0%, transparent 60%)",
        animation:"bcast-pulse .3s ease-in-out infinite",
      };
      default: return { display:"none" };
    }
  };

  // Scanline para matrix
  const matrixLine = efecto === "matrix" ? (
    <div style={{
      position:"absolute", left:0, right:0, height:2,
      background:"rgba(34,197,94,.3)",
      animation:"bcast-scanline 1.5s linear infinite",
    }} />
  ) : null;

  // Partículas simuladas
  const particles = ["confeti","fuego","nieve","estrellas","explosion"].includes(efecto)
    ? Array.from({ length: 8 }, (_, i) => {
        const chars = {
          confeti: ["🎊","🎉","✨","🎈"],
          fuego:   ["🔥","✨","💫"],
          nieve:   ["❄️","⛄","✨"],
          estrellas:["⭐","✨","💫","🌟"],
          explosion:["💥","✨","⚡","🔥"],
        };
        const set = chars[efecto] || ["✨"];
        const x = (i * 12.5) + "%";
        const delay = (i * 0.15) + "s";
        const dur = (0.8 + Math.random() * 0.6) + "s";
        return (
          <div key={i} style={{
            position:"absolute", left:x, fontSize:14,
            animation:`bcast-float ${dur} ${delay} ease-in-out infinite`,
            top: `${10 + (i % 3) * 20}%`,
            opacity: .8,
          }}>
            {set[i % set.length]}
          </div>
        );
      })
    : null;

  const titleAnim = efecto === "glitch" ? "bcast-glitch .8s infinite"
    : efecto === "pulso" ? "bcast-pulse 1.5s ease-in-out infinite"
    : efecto === "explosion" ? "bcast-pop .4s ease-out"
    : "none";

  return (
    <div style={{
      width:"100%", aspectRatio:"16/9",
      background: form.color_fondo,
      borderRadius:14, overflow:"hidden", position:"relative",
      border:`2px solid ${tipoActual.border}`,
      boxShadow:`0 0 0 1px rgba(255,255,255,.05), 0 8px 40px rgba(0,0,0,.5), 0 0 60px ${accent}22`,
    }}>
      {/* Imagen de fondo */}
      {imagen && (
        <img src={URL.createObjectURL(imagen)} alt=""
          style={{ position:"absolute", inset:0, width:"100%", height:"100%",
            objectFit:"cover", opacity:.2 }} />
      )}

      {/* Overlay de efecto */}
      <div style={overlayStyle()} />
      {matrixLine}

      {/* Partículas */}
      {particles}

      {/* Chip canal */}
      <div style={{
        position:"absolute", top:8, right:8,
        fontSize:8, fontWeight:900, letterSpacing:".12em",
        padding:"3px 8px", borderRadius:5, textTransform:"uppercase",
        background:`${accent}28`, color:accent,
        border:`1px solid ${accent}50`,
      }}>{label}</div>

      {/* Chip tipo */}
      <div style={{
        position:"absolute", top:8, left:8,
        fontSize:8, fontWeight:700, padding:"3px 8px",
        borderRadius:5, background:tipoActual.bg,
        color:tipoActual.text, border:`1px solid ${tipoActual.border}50`,
      }}>{tipoActual.emoji} {tipoActual.label}</div>

      {/* Contenido central */}
      <div style={{
        position:"absolute", inset:0, display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center", padding:24, textAlign:"center",
      }}>
        <div style={{ fontSize:32, marginBottom:8,
          animation: efecto === "arcoiris" ? "bcast-rainbow 2s linear infinite" : "none" }}>
          {tipoActual.emoji}
        </div>
        <div style={{
          fontSize:17, fontWeight:900, color:form.color_texto,
          textTransform:"uppercase", letterSpacing:".04em", lineHeight:1.15,
          marginBottom:8, wordBreak:"break-word",
          textShadow:"0 2px 12px rgba(0,0,0,.6)",
          animation: titleAnim,
          maxWidth:"90%",
        }}>
          {form.titulo || "TÍTULO DEL MENSAJE"}
        </div>
        <div style={{ fontSize:10, color:form.color_texto, opacity:.8,
          lineHeight:1.6, wordBreak:"break-word", maxWidth:"85%" }}>
          {form.mensaje || "El mensaje aparecerá aquí…"}
        </div>
        {form.datos_vivos && (
          <div style={{ marginTop:10, padding:"6px 12px",
            background:"rgba(255,255,255,.12)", borderRadius:20,
            fontSize:9, color:form.color_texto, fontWeight:700,
            border:"1px solid rgba(255,255,255,.2)" }}>
            {DATOS_VIVOS.find(d => d.id === form.datos_vivos)?.emoji}{" "}
            {DATOS_VIVOS.find(d => d.id === form.datos_vivos)?.label}
          </div>
        )}
        {audioPreviewSrc && (
          <div style={{ marginTop:6, fontSize:9, color:form.color_texto, opacity:.5 }}>
            🎵 Audio adjunto
          </div>
        )}
      </div>

      {/* Barra de duración */}
      <div style={{ position:"absolute", bottom:0, left:0, right:0 }}>
        <div style={{ height:3, background:"rgba(255,255,255,.08)" }}>
          <div style={{ width:"60%", height:"100%", background:accent,
            boxShadow:`0 0 8px ${accent}` }} />
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function BroadcastPanelCanal({ canal, config }) {
  const {
    label  = canal.toUpperCase(),
    accent = "#3b82f6",
    icon   = "📡",
  } = config || {};

  // Inyectar estilos globales
  useEffect(() => {
    const id = "bcast-global-css";
    if (!document.getElementById(id)) {
      const el = document.createElement("style");
      el.id = id;
      el.textContent = GLOBAL_CSS;
      document.head.appendChild(el);
    }
  }, []);

  const [form, setForm] = useState({
    tipo:            "info",
    titulo:          "",
    mensaje:         "",
    efecto:          "ninguno",
    sonido:          "chime",
    duracion:        30,
    datos_vivos:     "",
    programado:      false,
    programado_para: "",
    color_fondo:     "#0f172a",
    color_texto:     "#ffffff",
    prioridad:       "normal",
  });

  const [imagen,       setImagen]       = useState(null);
  const [audioFile,    setAudioFile]    = useState(null);
  const [audioUrl,     setAudioUrl]     = useState("");
  const [audioMode,    setAudioMode]    = useState("none");
  const [tab,          setTab]          = useState("crear");
  const [loading,      setLoading]      = useState(false);
  const [toast,        setToast]        = useState(null);
  const [historial,    setHistorial]    = useState([]);
  const [datosVivos,   setDatosVivos]   = useState(null);
  const [dragAudio,    setDragAudio]    = useState(false);
  const [showPlantillas, setShowPlantillas] = useState(false);
  const [histView,     setHistView]     = useState("tabla"); // "tabla"|"cards"

  const imgRef   = useRef();
  const audioRef = useRef();
  const upd = useCallback((k, v) => setForm(f => ({ ...f, [k]: v })), []);

  const fetchHistorial = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/broadcast/historial`);
      const d = await r.json();
      if (d.success) setHistorial(d.data.filter(m => !m.canal || m.canal === canal));
    } catch (_) {}
  }, [canal]);

  const fetchDatosVivos = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/broadcast/datos-vivos`);
      const d = await r.json();
      if (d.success) setDatosVivos(d);
    } catch (_) {}
  }, []);

  useEffect(() => { fetchHistorial(); fetchDatosVivos(); }, [fetchHistorial, fetchDatosVivos]);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const enviar = async () => {
    if (!form.titulo.trim() && !form.mensaje.trim()) {
      showToast("err", "Escribe un título o mensaje antes de enviar.");
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append("canal", canal);
      if (imagen) fd.append("imagen", imagen);
      if (audioMode === "file" && audioFile)       fd.append("audio_archivo", audioFile);
      if (audioMode === "url" && audioUrl.trim())  fd.append("audio_url", audioUrl.trim());

      const endpoint = form.programado ? "/api/broadcast/programar" : "/api/broadcast/enviar";
      const r = await fetch(`${API}${endpoint}`, { method:"POST", body:fd });
      const d = await r.json();
      if (d.success) {
        showToast("ok", form.programado ? "⏰ Mensaje programado correctamente" : "✅ Mensaje enviado a todas las pantallas");
        fetchHistorial();
        setForm(f => ({ ...f, titulo:"", mensaje:"", datos_vivos:"", programado:false, programado_para:"" }));
        setImagen(null); setAudioFile(null); setAudioUrl(""); setAudioMode("none");
      } else {
        showToast("err", d.message || "Error al enviar");
      }
    } catch (e) {
      showToast("err", "Error de conexión: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const aplicarPlantilla = (p) => {
    setForm(f => ({ ...f, tipo:p.tipo, efecto:p.efecto, titulo:p.titulo, mensaje:p.mensaje }));
    setShowPlantillas(false);
    showToast("ok", `Plantilla "${p.titulo}" aplicada`);
  };

  const reenviar = async (row) => {
    setLoading(true);
    try {
      const fd = new FormData();
      const datos = { tipo:row.tipo, titulo:row.titulo, mensaje:row.mensaje||"",
        efecto:row.efecto||"ninguno", sonido:row.sonido||"ninguno",
        duracion:row.duracion||30, datos_vivos:"", programado:false,
        programado_para:"", color_fondo:row.color_fondo||"#0f172a",
        color_texto:row.color_texto||"#ffffff", canal };
      Object.entries(datos).forEach(([k,v]) => fd.append(k, v));
      const r = await fetch(`${API}/api/broadcast/enviar`, { method:"POST", body:fd });
      const d = await r.json();
      if (d.success) { showToast("ok", "✅ Mensaje reenviado"); fetchHistorial(); }
      else showToast("err", d.message||"Error");
    } catch (e) { showToast("err", e.message); }
    finally { setLoading(false); }
  };

  const tipoActual = TIPOS.find(t => t.id === form.tipo) || TIPOS[3];
  const audioPreviewSrc = audioMode === "file" && audioFile
    ? URL.createObjectURL(audioFile)
    : audioMode === "url" && audioUrl.trim() ? audioUrl.trim() : null;

  const hoyEnviados = historial.filter(h => {
    const d = new Date(h.created_at);
    const hoy = new Date();
    return d.toDateString() === hoy.toDateString();
  }).length;

  // ─── Estilos base ──────────────────────────────────────────────────────────
  const bg = "#080e1a";

  const sectionLabel = (txt) => (
    <div style={{ fontSize:9, fontWeight:800, color:"rgba(148,163,184,.6)",
      textTransform:"uppercase", letterSpacing:".14em", marginBottom:10 }}>{txt}</div>
  );

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:bg, padding:"24px 22px",
      fontFamily:"'DM Sans','Inter',system-ui,sans-serif", color:"#e2e8f0" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position:"fixed", top:16, right:16, zIndex:9999,
          display:"flex", alignItems:"center", gap:10,
          padding:"12px 18px", borderRadius:12, fontSize:13, fontWeight:700,
          background: toast.type === "ok"
            ? "linear-gradient(135deg,#059669,#10b981)"
            : "linear-gradient(135deg,#dc2626,#ef4444)",
          color:"#fff", boxShadow:"0 8px 32px rgba(0,0,0,.4)",
          animation:"bcast-pop .2s ease-out",
          border:"1px solid rgba(255,255,255,.15)",
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom:24, display:"flex",
        justifyContent:"space-between", alignItems:"flex-start",
        flexWrap:"wrap", gap:16 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:6 }}>
            <span style={{ fontSize:24 }}>{icon}</span>
            <span style={{
              padding:"4px 12px", borderRadius:6, fontSize:10, fontWeight:900,
              letterSpacing:".12em", background:`${accent}20`, color:accent,
              border:`1px solid ${accent}40`, textTransform:"uppercase",
            }}>BROADCAST · {label}</span>
            <span style={{
              padding:"4px 10px", borderRadius:6, fontSize:10, fontWeight:700,
              background:"rgba(255,255,255,.06)", color:"#64748b",
              border:"1px solid rgba(255,255,255,.06)",
            }}>
              🟢 Sistema activo
            </span>
          </div>
          <h1 style={{ margin:0, fontSize:22, fontWeight:900, color:"#f1f5f9",
            letterSpacing:"-.02em" }}>
            Centro de Control
          </h1>
          <p style={{ margin:"2px 0 0", fontSize:11, color:"#475569" }}>
            Proyecta mensajes en tiempo real a todas las pantallas del equipo {label}
          </p>
        </div>

        {/* Stats + Modo TV */}
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          {[
            ["📨", `${hoyEnviados}`, "enviados hoy"],
            ["📋", `${historial.length}`, "en historial"],
          ].map(([ico, val, lbl]) => (
            <div key={lbl} style={{
              background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.07)",
              borderRadius:10, padding:"8px 14px", textAlign:"center",
            }}>
              <div style={{ fontSize:18, lineHeight:1 }}>{ico}</div>
              <div style={{ fontSize:16, fontWeight:900, color:"#f1f5f9", lineHeight:1.2 }}>{val}</div>
              <div style={{ fontSize:9, color:"#475569", fontWeight:600, textTransform:"uppercase" }}>{lbl}</div>
            </div>
          ))}
          <a href="/tv" target="_blank" style={{
            background:`linear-gradient(135deg,${accent},${accent}bb)`,
            color:"#fff", padding:"10px 18px", borderRadius:10,
            fontSize:11, fontWeight:800, textDecoration:"none",
            textTransform:"uppercase", letterSpacing:".08em",
            boxShadow:`0 4px 16px ${accent}44`,
          }}>📺 Modo TV</a>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", gap:2, padding:3,
        background:"rgba(255,255,255,.04)",
        border:"1px solid rgba(255,255,255,.07)",
        borderRadius:10, width:"fit-content", marginBottom:22 }}>
        {[["crear","✏️ Crear mensaje"], ["historial","📋 Historial"]].map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding:"8px 20px", borderRadius:8, border:"none",
            fontSize:11, fontWeight:800, cursor:"pointer",
            background: tab === id
              ? `linear-gradient(135deg,${accent},${accent}cc)` : "transparent",
            color: tab === id ? "#fff" : "#64748b",
            transition:"all .15s",
            boxShadow: tab === id ? `0 2px 10px ${accent}50` : "none",
          }}>{lbl}</button>
        ))}
      </div>

      {tab === "crear" ? (
        /* ═══ CREAR ═══════════════════════════════════════════════════════════ */
        <div style={{ display:"grid", gridTemplateColumns:"1fr 420px", gap:20, alignItems:"start" }}>

          {/* ── Columna formulario ────────────────────────────────────────── */}
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

            {/* Plantillas rápidas */}
            <div className="bcast-card">
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: showPlantillas ? 14 : 0 }}>
                {sectionLabel("⚡ Plantillas rápidas")}
                <button onClick={() => setShowPlantillas(s => !s)} style={{
                  background:`${accent}18`, color:accent, border:`1px solid ${accent}40`,
                  borderRadius:8, padding:"4px 12px", fontSize:10, fontWeight:800,
                  cursor:"pointer", letterSpacing:".06em",
                }}>
                  {showPlantillas ? "Ocultar ▲" : "Mostrar ▼"}
                </button>
              </div>
              {showPlantillas && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {PLANTILLAS.map((p, i) => (
                    <button key={i} onClick={() => aplicarPlantilla(p)} style={{
                      display:"flex", alignItems:"center", gap:10,
                      background:"rgba(255,255,255,.04)",
                      border:"1px solid rgba(255,255,255,.08)",
                      borderRadius:10, padding:"10px 12px",
                      cursor:"pointer", textAlign:"left",
                      transition:"all .15s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background=`${accent}15`; e.currentTarget.style.borderColor=`${accent}50`; }}
                    onMouseLeave={e => { e.currentTarget.style.background="rgba(255,255,255,.04)"; e.currentTarget.style.borderColor="rgba(255,255,255,.08)"; }}
                    >
                      <span style={{ fontSize:20, flexShrink:0 }}>{p.emoji}</span>
                      <div>
                        <div style={{ fontSize:10, fontWeight:800, color:"#e2e8f0" }}>{p.titulo}</div>
                        <div style={{ fontSize:9, color:"#475569", marginTop:1 }}>
                          {EFECTOS.find(e => e.id === p.efecto)?.emoji} {p.efecto}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tipo + Prioridad */}
            <div className="bcast-card">
              {sectionLabel("Tipo de mensaje")}
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {TIPOS.map(t => (
                  <button key={t.id} className="bcast-btn-chip"
                    onClick={() => upd("tipo", t.id)}
                    style={{
                      borderColor: t.border,
                      background: form.tipo === t.id ? t.bg : "rgba(255,255,255,.04)",
                      color:       form.tipo === t.id ? t.text : "#64748b",
                      boxShadow:   form.tipo === t.id ? `0 0 0 2px ${t.border}40` : "none",
                    }}>
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Título + Mensaje */}
            <div className="bcast-card">
              {sectionLabel("Contenido")}
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:10, fontWeight:700, color:"#64748b",
                  display:"block", marginBottom:5 }}>Título del mensaje</label>
                <input className="bcast-input"
                  placeholder="Ej: ¡Felicitaciones equipo! 🎉"
                  value={form.titulo}
                  onChange={e => upd("titulo", e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize:10, fontWeight:700, color:"#64748b",
                  display:"block", marginBottom:5 }}>Cuerpo del mensaje</label>
                <textarea className="bcast-input"
                  style={{ minHeight:88, resize:"vertical" }}
                  placeholder="Escribe el mensaje que verán en pantalla…"
                  value={form.mensaje}
                  onChange={e => upd("mensaje", e.target.value)} />
              </div>
            </div>

            {/* Efectos visuales */}
            <div className="bcast-card">
              {sectionLabel("✨ Efectos visuales")}
              <div className="bcast-grid-efecto">
                {EFECTOS.map(e => (
                  <button key={e.id} onClick={() => upd("efecto", e.id)}
                    style={{
                      padding:"9px 8px", borderRadius:10,
                      border:`1px solid ${form.efecto === e.id ? e.color : "rgba(255,255,255,.08)"}`,
                      background: form.efecto === e.id ? `${e.color}20` : "rgba(255,255,255,.03)",
                      color: form.efecto === e.id ? e.color : "#64748b",
                      fontSize:10, fontWeight:700, cursor:"pointer",
                      transition:"all .15s", textAlign:"center",
                      boxShadow: form.efecto === e.id ? `0 0 12px ${e.color}30` : "none",
                    }}>
                    <div style={{ fontSize:16, marginBottom:3 }}>{e.emoji}</div>
                    <div>{e.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Sonidos */}
            <div className="bcast-card">
              {sectionLabel("🔊 Sonido del sistema")}
              <div className="bcast-grid-sonido">
                {SONIDOS.map(s => (
                  <button key={s.id} onClick={() => upd("sonido", s.id)}
                    style={{
                      padding:"9px 8px", borderRadius:10,
                      border:`1px solid ${form.sonido === s.id ? accent : "rgba(255,255,255,.08)"}`,
                      background: form.sonido === s.id ? `${accent}20` : "rgba(255,255,255,.03)",
                      color: form.sonido === s.id ? accent : "#64748b",
                      fontSize:10, fontWeight:700, cursor:"pointer",
                      transition:"all .15s", textAlign:"center",
                      boxShadow: form.sonido === s.id ? `0 0 10px ${accent}25` : "none",
                    }}>
                    <div style={{ fontSize:16, marginBottom:3 }}>{s.emoji}</div>
                    <div>{s.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Audio adjunto */}
            <div className="bcast-card">
              {sectionLabel("🎵 Audio personalizado (opcional)")}
              <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                {[["none","Sin audio"],["file","Subir archivo"],["url","Link de audio"]].map(([m, lbl]) => (
                  <button key={m}
                    onClick={() => { setAudioMode(m); setAudioFile(null); setAudioUrl(""); }}
                    style={{
                      padding:"7px 14px", borderRadius:8, fontSize:11,
                      fontWeight:700, cursor:"pointer", transition:"all .15s",
                      background: audioMode === m ? `${accent}22` : "rgba(255,255,255,.04)",
                      color:      audioMode === m ? accent : "#64748b",
                      border:     audioMode === m ? `1px solid ${accent}60` : "1px solid rgba(255,255,255,.08)",
                    }}>
                    {lbl}
                  </button>
                ))}
              </div>

              {audioMode === "file" && (
                <div
                  onDragOver={e => { e.preventDefault(); setDragAudio(true); }}
                  onDragLeave={() => setDragAudio(false)}
                  onDrop={e => {
                    e.preventDefault(); setDragAudio(false);
                    const f = e.dataTransfer.files[0];
                    if (f && f.type.startsWith("audio/")) setAudioFile(f);
                  }}
                  onClick={() => audioRef.current?.click()}
                  style={{
                    border:`2px dashed ${dragAudio ? accent : "rgba(255,255,255,.15)"}`,
                    borderRadius:10, padding:"20px", textAlign:"center",
                    cursor:"pointer", background:dragAudio ? `${accent}10` : "rgba(255,255,255,.02)",
                    transition:"all .15s",
                  }}>
                  <input ref={audioRef} type="file" accept="audio/*"
                    style={{ display:"none" }}
                    onChange={e => { const f = e.target.files[0]; if(f) setAudioFile(f); }} />
                  <div style={{ fontSize:24, marginBottom:6 }}>🎵</div>
                  <p style={{ fontSize:11, color:"#475569", margin:0, fontWeight:600 }}>
                    {audioFile ? audioFile.name : "Arrastra o haz clic · mp3, wav, ogg, m4a"}
                  </p>
                </div>
              )}

              {audioMode === "url" && (
                <input className="bcast-input"
                  placeholder="https://example.com/audio.mp3"
                  value={audioUrl}
                  onChange={e => setAudioUrl(e.target.value)} />
              )}

              {audioPreviewSrc && (
                <AudioPlayer src={audioPreviewSrc} name={audioFile?.name || audioUrl} accent={accent} />
              )}
            </div>

            {/* Datos en vivo */}
            <div className="bcast-card">
              {sectionLabel("📊 Datos en vivo de asesores")}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                {DATOS_VIVOS.map(d => (
                  <label key={d.id} style={{
                    display:"flex", alignItems:"center", gap:8,
                    padding:"9px 12px", borderRadius:8, cursor:"pointer",
                    background: form.datos_vivos === d.id ? `${accent}15` : "rgba(255,255,255,.03)",
                    border:`1px solid ${form.datos_vivos === d.id ? `${accent}50` : "rgba(255,255,255,.07)"}`,
                    transition:"all .15s",
                  }}>
                    <input type="radio" name={`dv_${canal}`}
                      checked={form.datos_vivos === d.id}
                      onChange={() => upd("datos_vivos", d.id)}
                      style={{ accentColor:accent }} />
                    <span style={{ fontSize:11, fontWeight:600, color: form.datos_vivos === d.id ? accent : "#94a3b8" }}>
                      {d.emoji} {d.label}
                    </span>
                  </label>
                ))}
              </div>
              {form.datos_vivos && datosVivos && (
                <div style={{ marginTop:10, padding:"10px 12px",
                  background:`${accent}10`, borderRadius:8,
                  border:`1px solid ${accent}30` }}>
                  <div style={{ fontSize:9, fontWeight:800, color:accent,
                    textTransform:"uppercase", marginBottom:4 }}>Preview datos actuales</div>
                  {form.datos_vivos === "top_asesores" && datosVivos.topAsesores?.slice(0,3).map((a,i) => (
                    <div key={i} style={{ fontSize:11, color:"#e2e8f0", marginBottom:2 }}>
                      {i+1}. {a.nombre} — {a.ingresos} ingresos
                    </div>
                  ))}
                  {form.datos_vivos === "sin_ventas" && (
                    <div style={{ fontSize:11, color:"#e2e8f0" }}>
                      {datosVivos.sinVentas?.length} asesores sin ventas hoy
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Apariencia */}
            <div className="bcast-card">
              {sectionLabel("🎨 Apariencia")}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
                <div>
                  <label style={{ fontSize:10, fontWeight:700, color:"#64748b", display:"block", marginBottom:6 }}>
                    Duración · {form.duracion}s
                  </label>
                  <input type="range" min={5} max={300} step={5}
                    value={form.duracion} onChange={e => upd("duracion", +e.target.value)}
                    style={{ width:"100%", accentColor:accent }} />
                  <div style={{ display:"flex", justifyContent:"space-between",
                    fontSize:9, color:"#475569", marginTop:2 }}>
                    <span>5s</span><span>300s</span>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize:10, fontWeight:700, color:"#64748b", display:"block", marginBottom:6 }}>
                    Color de fondo
                  </label>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:4 }}>
                    {FONDOS_PRESET.map(({color, label:lbl}) => (
                      <button key={color} title={lbl} onClick={() => upd("color_fondo", color)}
                        style={{
                          width:22, height:22, borderRadius:6, background:color,
                          cursor:"pointer",
                          border: form.color_fondo === color
                            ? `2px solid ${accent}` : "1px solid rgba(255,255,255,.12)",
                          boxShadow: form.color_fondo === color ? `0 0 6px ${accent}` : "none",
                        }} />
                    ))}
                    <input type="color" value={form.color_fondo}
                      onChange={e => upd("color_fondo", e.target.value)}
                      style={{ width:22, height:22, borderRadius:6, border:"none",
                        cursor:"pointer", padding:0, background:"none" }} />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize:10, fontWeight:700, color:"#64748b", display:"block", marginBottom:6 }}>
                    Color de texto
                  </label>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                    {["#ffffff","#fbbf24","#34d399","#f87171","#60a5fa","#e2e8f0"].map(c => (
                      <button key={c} onClick={() => upd("color_texto", c)}
                        style={{
                          width:22, height:22, borderRadius:6, background:c,
                          cursor:"pointer",
                          border: form.color_texto === c ? `2px solid ${accent}` : "1px solid rgba(255,255,255,.2)",
                          boxShadow: form.color_texto === c ? `0 0 6px ${accent}` : "none",
                        }} />
                    ))}
                    <input type="color" value={form.color_texto}
                      onChange={e => upd("color_texto", e.target.value)}
                      style={{ width:22, height:22, borderRadius:6, border:"none",
                        cursor:"pointer", padding:0 }} />
                  </div>
                </div>
              </div>

              {/* Imagen adjunta */}
              <div>
                <label style={{ fontSize:10, fontWeight:700, color:"#64748b", display:"block", marginBottom:6 }}>
                  🖼 Imagen de fondo (opcional)
                </label>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <button onClick={() => imgRef.current?.click()}
                    style={{
                      background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)",
                      borderRadius:8, padding:"8px 16px", fontSize:11,
                      fontWeight:700, cursor:"pointer", color:"#94a3b8",
                      transition:"all .15s",
                    }}>
                    📎 {imagen ? imagen.name : "Seleccionar imagen"}
                  </button>
                  {imagen && (
                    <button onClick={() => setImagen(null)}
                      style={{ background:"rgba(239,68,68,.15)", border:"1px solid rgba(239,68,68,.3)",
                        borderRadius:8, padding:"8px 10px", fontSize:11, cursor:"pointer", color:"#f87171" }}>
                      ✕ Quitar
                    </button>
                  )}
                  <input ref={imgRef} type="file" accept="image/*"
                    style={{ display:"none" }} onChange={e => setImagen(e.target.files[0])} />
                </div>
              </div>
            </div>

            {/* Programar */}
            <div className="bcast-card">
              <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer",
                marginBottom: form.programado ? 12 : 0 }}>
                <div style={{
                  width:36, height:20, borderRadius:10, cursor:"pointer",
                  background: form.programado ? accent : "rgba(255,255,255,.12)",
                  position:"relative", transition:"all .2s",
                }} onClick={() => upd("programado", !form.programado)}>
                  <div style={{
                    position:"absolute", top:2, left: form.programado ? 18 : 2,
                    width:16, height:16, borderRadius:"50%", background:"#fff",
                    transition:"all .2s",
                  }} />
                </div>
                <span style={{ fontSize:12, fontWeight:700, color:"#e2e8f0" }}>
                  ⏰ Programar para más tarde
                </span>
              </label>
              {form.programado && (
                <input type="datetime-local" className="bcast-input"
                  value={form.programado_para}
                  onChange={e => upd("programado_para", e.target.value)} />
              )}
            </div>

            {/* Botón enviar */}
            <button onClick={enviar} disabled={loading}
              style={{
                width:"100%", padding:"16px",
                borderRadius:14, border:"none",
                cursor: loading ? "default" : "pointer",
                fontSize:13, fontWeight:900,
                textTransform:"uppercase", letterSpacing:".08em", color:"#fff",
                background: loading
                  ? "rgba(255,255,255,.12)"
                  : `linear-gradient(135deg, ${accent}, ${accent}aa)`,
                boxShadow: loading ? "none" : `0 8px 28px ${accent}50`,
                transition:"all .2s",
              }}>
              {loading ? "⏳ Enviando…"
                : form.programado ? "⏰ Programar envío"
                : `📡 Enviar a todas las pantallas · ${label}`}
            </button>
          </div>

          {/* ── Columna preview ───────────────────────────────────────────── */}
          <div style={{ position:"sticky", top:20, display:"flex", flexDirection:"column", gap:12 }}>

            <div style={{ fontSize:9, fontWeight:800, color:"rgba(148,163,184,.6)",
              textTransform:"uppercase", letterSpacing:".14em" }}>Vista previa en vivo</div>

            <PreviewScreen
              form={form} imagen={imagen}
              audioPreviewSrc={audioPreviewSrc}
              tipoActual={tipoActual}
              label={label} accent={accent}
            />

            {/* Resumen config */}
            <div className="bcast-card" style={{ padding:"14px 16px" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {[
                  ["Tipo",     tipoActual.emoji + " " + tipoActual.label],
                  ["Efecto",   (EFECTOS.find(e => e.id === form.efecto)?.emoji || "○") + " " + form.efecto],
                  ["Sonido",   SONIDOS.find(s => s.id === form.sonido)?.emoji + " " + form.sonido],
                  ["Duración", `${form.duracion}s`],
                  ["Audio",    audioMode === "file" ? "📂 Archivo" : audioMode === "url" ? "🔗 Link" : "—"],
                  ["Canal",    label],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p style={{ fontSize:8, fontWeight:800, color:"#475569",
                      textTransform:"uppercase", letterSpacing:".1em", margin:"0 0 2px" }}>{k}</p>
                    <p style={{ fontSize:11, fontWeight:700, color:"#e2e8f0", margin:0 }}>{v}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Efecto visual indicator */}
            {form.efecto !== "ninguno" && (
              <div className="bcast-card" style={{ padding:"12px 14px" }}>
                <div style={{ fontSize:9, fontWeight:800, color:EFECTOS.find(e => e.id === form.efecto)?.color,
                  textTransform:"uppercase", letterSpacing:".12em", marginBottom:6 }}>
                  Efecto activo
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:24 }}>{EFECTOS.find(e => e.id === form.efecto)?.emoji}</span>
                  <div>
                    <div style={{ fontSize:12, fontWeight:800, color:"#e2e8f0" }}>
                      {EFECTOS.find(e => e.id === form.efecto)?.label}
                    </div>
                    <div style={{ fontSize:10, color:"#475569" }}>
                      Se proyectará en pantalla con animación
                    </div>
                  </div>
                  <div style={{
                    marginLeft:"auto", width:8, height:8, borderRadius:"50%",
                    background: EFECTOS.find(e => e.id === form.efecto)?.color,
                    boxShadow:`0 0 8px ${EFECTOS.find(e => e.id === form.efecto)?.color}`,
                    animation:"bcast-pulse 1s ease-in-out infinite",
                  }} />
                </div>
              </div>
            )}
          </div>
        </div>

      ) : (
        /* ═══ HISTORIAL ════════════════════════════════════════════════════════ */
        <div>
          {/* Toolbar historial */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
            marginBottom:14, flexWrap:"wrap", gap:10 }}>
            <div style={{ fontSize:13, fontWeight:800, color:"#e2e8f0" }}>
              📋 Historial · <span style={{ color:accent }}>{label}</span>
              <span style={{ fontSize:11, color:"#475569", fontWeight:600, marginLeft:8 }}>
                ({historial.length} mensajes)
              </span>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              {[["tabla","≡ Tabla"],["cards","⊞ Cards"]].map(([v, lbl]) => (
                <button key={v} onClick={() => setHistView(v)}
                  style={{
                    padding:"6px 12px", borderRadius:8, fontSize:10, fontWeight:700,
                    cursor:"pointer", transition:"all .15s",
                    background: histView === v ? `${accent}22` : "rgba(255,255,255,.04)",
                    color:      histView === v ? accent : "#64748b",
                    border:     histView === v ? `1px solid ${accent}50` : "1px solid rgba(255,255,255,.08)",
                  }}>{lbl}</button>
              ))}
              <button onClick={fetchHistorial}
                style={{
                  background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)",
                  borderRadius:8, padding:"6px 14px", fontSize:10, fontWeight:700,
                  cursor:"pointer", color:"#94a3b8",
                }}>↻ Actualizar</button>
            </div>
          </div>

          {histView === "tabla" ? (
            /* Vista tabla */
            <div style={{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)",
              borderRadius:14, overflow:"hidden" }}>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                  <thead>
                    <tr style={{ background:"rgba(255,255,255,.04)",
                      borderBottom:"1px solid rgba(255,255,255,.06)" }}>
                      {["Tipo","Título","Efecto","Duración","Estado","Fecha","Acciones"].map(h => (
                        <th key={h} style={{
                          padding:"10px 14px", textAlign:"left", fontWeight:800,
                          color:"#475569", textTransform:"uppercase",
                          fontSize:9, letterSpacing:".1em", whiteSpace:"nowrap",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {historial.length === 0 ? (
                      <tr><td colSpan={7} style={{ padding:40, textAlign:"center", color:"#475569" }}>
                        Sin mensajes en este canal aún
                      </td></tr>
                    ) : historial.map(row => {
                      const tipo = TIPOS.find(t => t.id === row.tipo) || TIPOS[3];
                      return (
                        <tr key={row.id}
                          style={{ borderBottom:"1px solid rgba(255,255,255,.04)", transition:"background .1s" }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.03)"}
                          onMouseLeave={e => e.currentTarget.style.background = ""}>
                          <td style={{ padding:"10px 14px" }}>
                            <span style={{ background:tipo.bg, color:tipo.text,
                              borderRadius:20, padding:"3px 8px",
                              fontSize:10, fontWeight:700, border:`1px solid ${tipo.border}40` }}>
                              {tipo.emoji} {tipo.label}
                            </span>
                          </td>
                          <td style={{ padding:"10px 14px", fontWeight:700, color:"#e2e8f0",
                            maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {row.titulo || "—"}
                          </td>
                          <td style={{ padding:"10px 14px", color:"#64748b" }}>
                            {EFECTOS.find(e => e.id === row.efecto)?.emoji || "—"}
                          </td>
                          <td style={{ padding:"10px 14px", color:"#64748b" }}>{row.duracion}s</td>
                          <td style={{ padding:"10px 14px" }}>
                            <span style={{
                              fontSize:10, fontWeight:700, borderRadius:20, padding:"3px 8px",
                              background: row.enviado ? "rgba(16,185,129,.18)" : "rgba(234,179,8,.18)",
                              color:      row.enviado ? "#6ee7b7"              : "#fde047",
                            }}>
                              {row.enviado ? "✓ Enviado" : "⏳ Pendiente"}
                            </span>
                          </td>
                          <td style={{ padding:"10px 14px", color:"#475569",
                            fontSize:10, whiteSpace:"nowrap" }}>
                            {new Date(row.created_at).toLocaleString("es-EC", {
                              timeZone:"America/Guayaquil",
                              day:"2-digit", month:"short",
                              hour:"2-digit", minute:"2-digit",
                            })}
                          </td>
                          <td style={{ padding:"10px 14px" }}>
                            <button onClick={() => reenviar(row)}
                              style={{
                                background:`${accent}18`, color:accent,
                                border:`1px solid ${accent}40`,
                                borderRadius:6, padding:"4px 10px",
                                fontSize:9, fontWeight:800, cursor:"pointer",
                              }}>
                              ↺ Reenviar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Vista cards */
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:12 }}>
              {historial.length === 0 ? (
                <div style={{ gridColumn:"1/-1", padding:40, textAlign:"center", color:"#475569" }}>
                  Sin mensajes en este canal aún
                </div>
              ) : historial.map(row => {
                const tipo = TIPOS.find(t => t.id === row.tipo) || TIPOS[3];
                const efecto = EFECTOS.find(e => e.id === row.efecto);
                return (
                  <div key={row.id} className="bcast-card" style={{ padding:"14px 16px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between",
                      alignItems:"flex-start", marginBottom:10 }}>
                      <span style={{ background:tipo.bg, color:tipo.text,
                        borderRadius:20, padding:"3px 10px",
                        fontSize:10, fontWeight:700 }}>
                        {tipo.emoji} {tipo.label}
                      </span>
                      <span style={{
                        fontSize:10, fontWeight:700, borderRadius:20, padding:"3px 8px",
                        background: row.enviado ? "rgba(16,185,129,.18)" : "rgba(234,179,8,.18)",
                        color:      row.enviado ? "#6ee7b7" : "#fde047",
                      }}>
                        {row.enviado ? "✓" : "⏳"}
                      </span>
                    </div>
                    <div style={{ fontSize:13, fontWeight:800, color:"#e2e8f0", marginBottom:4 }}>
                      {row.titulo || "Sin título"}
                    </div>
                    {row.mensaje && (
                      <div style={{ fontSize:11, color:"#64748b", marginBottom:8,
                        overflow:"hidden", textOverflow:"ellipsis",
                        display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>
                        {row.mensaje}
                      </div>
                    )}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ fontSize:10, color:"#475569" }}>
                        {efecto?.emoji} {efecto?.label || "—"} · {row.duracion}s
                      </div>
                      <button onClick={() => reenviar(row)}
                        style={{
                          background:`${accent}18`, color:accent,
                          border:`1px solid ${accent}40`,
                          borderRadius:6, padding:"4px 10px",
                          fontSize:9, fontWeight:800, cursor:"pointer",
                        }}>
                        ↺ Reenviar
                      </button>
                    </div>
                    <div style={{ fontSize:9, color:"#334155", marginTop:8, fontWeight:600 }}>
                      {new Date(row.created_at).toLocaleString("es-EC", {
                        timeZone:"America/Guayaquil",
                        day:"2-digit", month:"short",
                        hour:"2-digit", minute:"2-digit",
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
