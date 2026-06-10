/**
 * BroadcastPanelCanal.jsx — v3 (todo inline, sin className)
 * VELSA  → solo ve historial VELSA
 * NOVONET → solo ve historial NOVONET
 * ADMINISTRADOR → ve TODO
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── Catálogos ─────────────────────────────────────────────────────────────────
const TIPOS = [
  { id:"urgente",       emoji:"🚨", label:"Urgente",      bg:"rgba(239,68,68,.18)",  border:"#ef4444", text:"#fca5a5" },
  { id:"prevencion",    emoji:"⚠️",  label:"Prevención",   bg:"rgba(234,179,8,.16)",  border:"#eab308", text:"#fde047" },
  { id:"logro",         emoji:"🏆", label:"Logro",         bg:"rgba(16,185,129,.16)", border:"#10b981", text:"#6ee7b7" },
  { id:"info",          emoji:"📢", label:"Info",          bg:"rgba(59,130,246,.16)", border:"#3b82f6", text:"#93c5fd" },
  { id:"personalizado", emoji:"✨", label:"Personalizado", bg:"rgba(168,85,247,.16)", border:"#a855f7", text:"#d8b4fe" },
  { id:"record",        emoji:"🥇", label:"Récord",        bg:"rgba(251,191,36,.16)", border:"#fbbf24", text:"#fde68a" },
  { id:"motivacion",    emoji:"💪", label:"Motivación",    bg:"rgba(236,72,153,.16)", border:"#ec4899", text:"#f9a8d4" },
];

const EFECTOS = [
  { id:"ninguno",    label:"Sin efecto",   emoji:"○",  color:"#64748b", desc:"" },
  { id:"confeti",    label:"Confeti",      emoji:"🎊", color:"#f59e0b", desc:"Lluvia de colores" },
  { id:"fuego",      label:"Fuego",        emoji:"🔥", color:"#ef4444", desc:"Llamas desde el suelo" },
  { id:"alertaroja", label:"Alerta Roja",  emoji:"🚨", color:"#dc2626", desc:"Borde parpadeante" },
  { id:"nieve",      label:"Nieve",        emoji:"❄️", color:"#93c5fd", desc:"Copos cayendo" },
  { id:"estrellas",  label:"Estrellas",    emoji:"⭐", color:"#fbbf24", desc:"Destello de puntos" },
  { id:"arcoiris",   label:"Arcoíris",     emoji:"🌈", color:"#a855f7", desc:"Rotación de colores" },
  { id:"matrix",     label:"Matrix",       emoji:"💻", color:"#22c55e", desc:"Caracteres verdes" },
  { id:"spotlight",  label:"Spotlight",    emoji:"🔦", color:"#e2e8f0", desc:"Foco de luz móvil" },
  { id:"pulso",      label:"Pulso",        emoji:"⚡", color:"#3b82f6", desc:"Pantalla pulsante" },
  { id:"explosion",  label:"Explosión",    emoji:"💥", color:"#f97316", desc:"Burst desde el centro" },
  { id:"glitch",     label:"Glitch",       emoji:"👾", color:"#8b5cf6", desc:"Distorsión digital" },
];

const SONIDOS = [
  { id:"ninguno",  label:"Sin sonido",  emoji:"🔇" },
  { id:"chime",    label:"Chime",       emoji:"🔔" },
  { id:"alerta",   label:"Alerta",      emoji:"🚨" },
  { id:"victoria", label:"Victoria",    emoji:"🏆" },
  { id:"error",    label:"Atención",    emoji:"❌" },
  { id:"pop",      label:"Pop",         emoji:"🎈" },
  { id:"swoosh",   label:"Swoosh",      emoji:"💨" },
  { id:"cash",     label:"Caja",        emoji:"💰" },
];

const DATOS_VIVOS = [
  { id:"",               label:"Sin datos en vivo",    emoji:"—"  },
  { id:"top_asesores",   label:"Top asesores del día", emoji:"🥇" },
  { id:"top_activas",    label:"Top activas",          emoji:"✅" },
  { id:"sin_ventas",     label:"Sin ventas",           emoji:"📉" },
  { id:"gestion_diaria", label:"En Gestión Diaria",    emoji:"⚠️" },
  { id:"resumen_dia",    label:"Resumen del día",      emoji:"📊" },
];

const PLANTILLAS = [
  { emoji:"🏆", titulo:"¡META ALCANZADA!",     mensaje:"El equipo superó la meta del día. ¡Excelente trabajo!",        tipo:"logro",      efecto:"confeti"    },
  { emoji:"💪", titulo:"¡VAMOS EQUIPO!",        mensaje:"Cada llamada cuenta. ¡Démoslo todo en esta recta final!",       tipo:"motivacion", efecto:"pulso"      },
  { emoji:"⚠️",  titulo:"REUNIÓN EN 5 MIN",     mensaje:"Por favor acérquense al área de coordinación.",                tipo:"prevencion", efecto:"alertaroja" },
  { emoji:"☕", titulo:"DESCANSO — 15 MIN",     mensaje:"Pausa activa. Regresamos a las actividades en 15 minutos.",    tipo:"info",       efecto:"ninguno"    },
  { emoji:"🎯", titulo:"¡CIERRE DEL DÍA!",     mensaje:"Últimos 30 minutos. ¡Maximicen su gestión!",                   tipo:"urgente",    efecto:"fuego"      },
  { emoji:"🥇", titulo:"¡NUEVO RÉCORD!",        mensaje:"Hoy establecimos un nuevo récord histórico. ¡INCREÍBLE!",      tipo:"record",     efecto:"estrellas"  },
  { emoji:"🌈", titulo:"¡CELEBRACIÓN!",         mensaje:"Hoy fue un día espectacular. ¡Equipo TOP!",                    tipo:"personalizado",efecto:"arcoiris" },
  { emoji:"💥", titulo:"¡HORA PICO!",           mensaje:"Máxima concentración — estamos en la hora más importante.",    tipo:"urgente",    efecto:"explosion"  },
  { emoji:"💻", titulo:"ACTUALIZACIÓN SISTEMA", mensaje:"Reinicio programado en 5 minutos. Guarden su trabajo.",        tipo:"info",       efecto:"matrix"     },
  { emoji:"👾", titulo:"¡ALERTA CRÍTICA!",      mensaje:"Atención inmediata requerida. Contactar a coordinación.",      tipo:"urgente",    efecto:"glitch"     },
];

const FONDOS = [
  { color:"#0f172a", label:"Noche"   }, { color:"#1e1b4b", label:"Índigo"  },
  { color:"#0c4a6e", label:"Océano"  }, { color:"#064e3b", label:"Selva"   },
  { color:"#431407", label:"Brasa"   }, { color:"#1a1a2e", label:"Cosmos"  },
  { color:"#2d1b69", label:"Galaxia" }, { color:"#0d1b2a", label:"Profundo"},
  { color:"#0a0f1e", label:"Abismo"  }, { color:"#1c0533", label:"Aura"    },
  { color:"#1a0a00", label:"Cobre"   }, { color:"#001a00", label:"Matrix"  },
];

const TEXTOS_COLOR = ["#ffffff","#fbbf24","#34d399","#f87171","#60a5fa","#e879f9"];

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

// ─── Estilos inline reutilizables ─────────────────────────────────────────────
const S = {
  card: {
    background:"rgba(255,255,255,.04)",
    border:"1px solid rgba(255,255,255,.08)",
    borderRadius:16, padding:"18px 20px",
  },
  label: {
    display:"block", fontSize:9, fontWeight:800,
    color:"rgba(148,163,184,.7)", textTransform:"uppercase",
    letterSpacing:".13em", marginBottom:8,
  },
  input: {
    width:"100%", boxSizing:"border-box",
    background:"rgba(255,255,255,.06)",
    border:"1px solid rgba(255,255,255,.12)",
    borderRadius:10, padding:"10px 14px",
    fontSize:13, fontWeight:500, color:"#f1f5f9",
    outline:"none",
  },
};

// ─── Mini reproductor de audio ──────────────────────────────────────────────────
function AudioPlayer({ src, name, accent }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProg]   = useState(0);
  const [duration, setDur]    = useState(0);

  const toggle = () => {
    const a = ref.current;
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
      <audio ref={ref} src={src}
        onTimeUpdate={() => { const a=ref.current; if(a) setProg(a.currentTime/(a.duration||1)*100); }}
        onLoadedMetadata={() => { if(ref.current) setDur(ref.current.duration); }}
        onEnded={() => setPlaying(false)} />
      <button onClick={toggle} style={{
        width:34, height:34, borderRadius:"50%",
        background:playing ? accent : "rgba(255,255,255,.12)",
        color:"#fff", border:"none", cursor:"pointer", fontSize:13,
        display:"flex", alignItems:"center", justifyContent:"center",
        flexShrink:0, transition:"all .15s",
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

// ─── Preview animada ──────────────────────────────────────────────────────────
function PreviewScreen({ form, imagen, audioPreviewSrc, tipoActual, label, accent }) {
  const efecto = form.efecto;

  // Partículas decorativas para preview
  const particles = useMemo(() => {
    if (!["confeti","fuego","nieve","estrellas","explosion"].includes(efecto)) return [];
    const COLORS = { confeti:["#fbbf24","#10b981","#f97316","#f472b6","#60a5fa"],
      fuego:["#ff4500","#ff6200","#ff8c00"], nieve:["#fff","#bfdbfe"],
      estrellas:["#fbbf24","#34d399","#f472b6"], explosion:["#f97316","#ef4444","#fbbf24"] };
    const set = COLORS[efecto] || ["#fff"];
    return Array.from({ length: 10 }, (_, i) => ({
      key: i,
      emoji: efecto === "confeti" ? "🎊" : efecto === "fuego" ? "🔥" :
             efecto === "nieve" ? "❄️" : efecto === "estrellas" ? "⭐" : "💥",
      x: `${5 + i * 9}%`,
      y: efecto === "fuego" ? "70%" : `${5 + (i % 4) * 20}%`,
      color: set[i % set.length],
      size: 10 + (i % 3) * 5,
    }));
  }, [efecto]);

  // Overlay style por efecto
  const overlayEfecto = () => {
    switch (efecto) {
      case "alertaroja": return {
        position:"absolute", inset:0, pointerEvents:"none",
        outline:"3px solid #ef4444",
        background:"rgba(239,68,68,.08)",
        animation:"prevAlertFlash .5s ease-in-out infinite",
        zIndex:5,
      };
      case "arcoiris": return {
        position:"absolute", inset:0, pointerEvents:"none",
        background:"linear-gradient(135deg,rgba(239,68,68,.12),rgba(234,179,8,.12),rgba(34,197,94,.12),rgba(59,130,246,.12),rgba(168,85,247,.12))",
        animation:"prevRainbow 2s linear infinite",
        zIndex:5,
      };
      case "matrix": return {
        position:"absolute", inset:0, pointerEvents:"none",
        background:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(34,197,94,.06) 3px,rgba(34,197,94,.06) 6px)",
        zIndex:5,
      };
      case "spotlight": return {
        position:"absolute", inset:0, pointerEvents:"none",
        background:"radial-gradient(ellipse at 50% 45%,transparent 28%,rgba(0,0,0,.65) 68%)",
        zIndex:5,
      };
      case "glitch": return {
        position:"absolute", inset:0, pointerEvents:"none",
        animation:"prevGlitch .6s steps(1) infinite",
        zIndex:5,
      };
      default: return { display:"none" };
    }
  };

  const contentAnim = efecto === "pulso" ? "prevPulse 1.2s ease-in-out infinite"
    : efecto === "glitch" ? "prevGlitch .7s steps(1) infinite"
    : efecto === "arcoiris" ? "prevRainbowText 2s linear infinite"
    : "none";

  return (
    <>
      {/* Keyframes solo para preview */}
      <style>{`
        @keyframes prevAlertFlash { 0%,100%{opacity:.3} 50%{opacity:1} }
        @keyframes prevRainbow { 0%{filter:hue-rotate(0deg)} 100%{filter:hue-rotate(360deg)} }
        @keyframes prevRainbowText { 0%{filter:hue-rotate(0deg) saturate(2)} 100%{filter:hue-rotate(360deg) saturate(2)} }
        @keyframes prevPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.7;transform:scale(.97)} }
        @keyframes prevGlitch { 0%,100%{transform:translate(0);filter:none} 30%{transform:translate(-2px,1px);filter:hue-rotate(90deg)} 60%{transform:translate(2px,-1px);filter:hue-rotate(200deg)} }
        @keyframes prevFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
      `}</style>

      <div style={{
        width:"100%", aspectRatio:"16/9",
        background:form.color_fondo,
        borderRadius:12, overflow:"hidden", position:"relative",
        border:`2px solid ${tipoActual.border}`,
        boxShadow:`0 0 0 1px rgba(255,255,255,.04), 0 8px 32px rgba(0,0,0,.5), 0 0 50px ${accent}18`,
      }}>
        {imagen && (
          <img src={URL.createObjectURL(imagen)} alt=""
            style={{ position:"absolute", inset:0, width:"100%", height:"100%",
              objectFit:"cover", opacity:.2, zIndex:0 }} />
        )}

        {/* Overlay efecto */}
        <div style={overlayEfecto()} />

        {/* Partículas decorativas */}
        {particles.map(p => (
          <div key={p.key} style={{
            position:"absolute", left:p.x, top:p.y,
            fontSize:p.size, animation:`prevFloat ${1 + p.key * 0.15}s ${p.key * 0.1}s ease-in-out infinite`,
            zIndex:6, pointerEvents:"none",
          }}>{p.emoji}</div>
        ))}

        {/* Matrix scanline */}
        {efecto === "matrix" && (
          <div style={{ position:"absolute", left:0, right:0, height:2,
            background:"rgba(34,197,94,.5)", zIndex:7,
            animation:"tvScanline 1.5s linear infinite" }} />
        )}

        {/* Explosion flash */}
        {efecto === "explosion" && (
          <div style={{ position:"absolute", inset:0, zIndex:4,
            background:"radial-gradient(circle at 50%,rgba(249,115,22,.25) 0%,transparent 60%)",
            animation:"prevPulse .4s ease-in-out infinite" }} />
        )}

        {/* Chip canal */}
        <div style={{ position:"absolute", top:7, right:7, zIndex:10,
          fontSize:8, fontWeight:900, letterSpacing:".1em",
          padding:"2px 7px", borderRadius:4, textTransform:"uppercase",
          background:`${accent}28`, color:accent, border:`1px solid ${accent}50` }}>
          {label}
        </div>

        {/* Chip tipo */}
        <div style={{ position:"absolute", top:7, left:7, zIndex:10,
          fontSize:8, fontWeight:700, padding:"2px 7px", borderRadius:4,
          background:tipoActual.bg, color:tipoActual.text,
          border:`1px solid ${tipoActual.border}40` }}>
          {tipoActual.emoji} {tipoActual.label}
        </div>

        {/* Contenido */}
        <div style={{
          position:"absolute", inset:0, display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center", padding:20,
          textAlign:"center", zIndex:8,
          animation: contentAnim,
        }}>
          <div style={{ fontSize:28, marginBottom:8 }}>{tipoActual.emoji}</div>
          <div style={{
            fontSize:15, fontWeight:900, color:form.color_texto,
            textTransform:"uppercase", letterSpacing:".03em", lineHeight:1.15,
            marginBottom:6, wordBreak:"break-word",
            textShadow:"0 2px 10px rgba(0,0,0,.6)", maxWidth:"90%",
          }}>
            {form.titulo || "TÍTULO DEL MENSAJE"}
          </div>
          <div style={{ fontSize:10, color:form.color_texto, opacity:.8,
            lineHeight:1.6, wordBreak:"break-word", maxWidth:"85%" }}>
            {form.mensaje || "El mensaje aparecerá aquí…"}
          </div>
          {form.datos_vivos && (
            <div style={{ marginTop:8, padding:"4px 10px",
              background:"rgba(255,255,255,.12)", borderRadius:20,
              fontSize:9, color:form.color_texto, fontWeight:700,
              border:"1px solid rgba(255,255,255,.2)" }}>
              {DATOS_VIVOS.find(d => d.id === form.datos_vivos)?.emoji} {DATOS_VIVOS.find(d => d.id === form.datos_vivos)?.label}
            </div>
          )}
        </div>

        {/* Barra progreso */}
        <div style={{ position:"absolute", bottom:0, left:0, right:0, height:3,
          background:"rgba(255,255,255,.08)", zIndex:9 }}>
          <div style={{ width:"55%", height:"100%", background:accent,
            boxShadow:`0 0 6px ${accent}` }} />
        </div>
      </div>
    </>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function BroadcastPanelCanal({ canal, config }) {
  const {
    label  = canal.toUpperCase(),
    accent = "#3b82f6",
    icon   = "📡",
  } = config || {};

  // Detectar si el usuario es ADMINISTRADOR
  const isAdmin = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      return (u.perfil || "").toUpperCase() === "ADMINISTRADOR";
    } catch (_) { return false; }
  }, []);

  const [form, setForm] = useState({
    tipo:"info", titulo:"", mensaje:"",
    efecto:"ninguno", sonido:"chime",
    duracion:30, datos_vivos:"",
    programado:false, programado_para:"",
    color_fondo:"#0f172a", color_texto:"#ffffff",
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
  const [showPlant,    setShowPlant]    = useState(false);
  const [histView,     setHistView]     = useState("cards");
  const [canalFiltro,  setCanalFiltro]  = useState("todos"); // solo para admin

  const imgRef   = useRef();
  const audioRef = useRef();
  const upd = useCallback((k, v) => setForm(f => ({ ...f, [k]: v })), []);

  const authH = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const fetchHistorial = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/broadcast/historial`, { headers: authH() });
      const d = await r.json();
      if (!d.success) return;
      if (isAdmin) {
        // Admin ve todo, puede filtrar por canal con el selector
        setHistorial(d.data);
      } else {
        // Cada canal ve solo sus mensajes
        setHistorial(d.data.filter(m => !m.canal || m.canal === canal));
      }
    } catch (_) {}
  }, [canal, isAdmin]);

  const fetchDatosVivos = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/broadcast/datos-vivos`, { headers: authH() });
      const d = await r.json();
      if (d.success) setDatosVivos(d);
    } catch (_) {}
  }, []);

  useEffect(() => { fetchHistorial(); fetchDatosVivos(); }, [fetchHistorial, fetchDatosVivos]);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4200);
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
      if (audioMode === "file" && audioFile)      fd.append("audio_archivo", audioFile);
      if (audioMode === "url" && audioUrl.trim()) fd.append("audio_url", audioUrl.trim());

      const endpoint = form.programado ? "/api/broadcast/programar" : "/api/broadcast/enviar";
      const r = await fetch(`${API}${endpoint}`, { method:"POST", headers: authH(), body:fd });
      const d = await r.json();
      if (d.success) {
        showToast("ok", form.programado ? "⏰ Mensaje programado" : "✅ Enviado a todas las pantallas");
        fetchHistorial();
        setForm(f => ({ ...f, titulo:"", mensaje:"", datos_vivos:"",
          programado:false, programado_para:"" }));
        setImagen(null); setAudioFile(null); setAudioUrl(""); setAudioMode("none");
      } else {
        showToast("err", d.message || "Error al enviar");
      }
    } catch (e) { showToast("err", "Error de conexión: " + e.message); }
    finally { setLoading(false); }
  };

  const aplicarPlantilla = (p) => {
    setForm(f => ({ ...f, tipo:p.tipo, efecto:p.efecto, titulo:p.titulo, mensaje:p.mensaje }));
    setShowPlant(false);
    showToast("ok", `Plantilla "${p.titulo}" aplicada`);
  };

  const reenviar = async (row) => {
    setLoading(true);
    try {
      const fd = new FormData();
      const datos = {
        tipo:row.tipo||"info", titulo:row.titulo||"", mensaje:row.mensaje||"",
        efecto:row.efecto||"ninguno", sonido:row.sonido||"ninguno",
        duracion:row.duracion||30, datos_vivos:"", programado:false,
        programado_para:"", color_fondo:row.color_fondo||"#0f172a",
        color_texto:row.color_texto||"#ffffff",
        canal: row.canal || canal,
      };
      Object.entries(datos).forEach(([k,v]) => fd.append(k, v));
      const r = await fetch(`${API}/api/broadcast/enviar`, { method:"POST", headers: authH(), body:fd });
      const d = await r.json();
      if (d.success) { showToast("ok", "✅ Mensaje reenviado"); fetchHistorial(); }
      else showToast("err", d.message || "Error");
    } catch (e) { showToast("err", e.message); }
    finally { setLoading(false); }
  };

  const tipoActual   = TIPOS.find(t => t.id === form.tipo) || TIPOS[3];
  const audioPreviewSrc = audioMode === "file" && audioFile
    ? URL.createObjectURL(audioFile)
    : audioMode === "url" && audioUrl.trim() ? audioUrl.trim() : null;

  // Historial filtrado (solo admin tiene opcion de filtrar por canal)
  const historialVisible = useMemo(() => {
    if (!isAdmin || canalFiltro === "todos") return historial;
    return historial.filter(m => (m.canal || "") === canalFiltro);
  }, [historial, isAdmin, canalFiltro]);

  const hoyEnviados = historial.filter(h => {
    try { return new Date(h.created_at).toDateString() === new Date().toDateString(); } catch(_){return false;}
  }).length;

  // ─── Estilos de botones chip ─────────────────────────────────────────────
  const chipEfecto = (e) => ({
    padding:"9px 6px", borderRadius:10, textAlign:"center",
    border:`1px solid ${form.efecto === e.id ? e.color : "rgba(255,255,255,.08)"}`,
    background: form.efecto === e.id ? `${e.color}22` : "rgba(255,255,255,.03)",
    color: form.efecto === e.id ? e.color : "#64748b",
    fontSize:10, fontWeight:700, cursor:"pointer",
    boxShadow: form.efecto === e.id ? `0 0 12px ${e.color}30` : "none",
    transition:"all .15s",
  });
  const chipSonido = (s) => ({
    padding:"9px 6px", borderRadius:10, textAlign:"center",
    border:`1px solid ${form.sonido === s.id ? accent : "rgba(255,255,255,.08)"}`,
    background: form.sonido === s.id ? `${accent}22` : "rgba(255,255,255,.03)",
    color: form.sonido === s.id ? accent : "#64748b",
    fontSize:10, fontWeight:700, cursor:"pointer",
    boxShadow: form.sonido === s.id ? `0 0 10px ${accent}28` : "none",
    transition:"all .15s",
  });
  const chipTipo = (t) => ({
    padding:"7px 13px", borderRadius:20, cursor:"pointer",
    border:`1.5px solid ${t.border}`,
    background: form.tipo === t.id ? t.bg : "rgba(255,255,255,.04)",
    color:       form.tipo === t.id ? t.text : "#64748b",
    fontSize:11, fontWeight:800,
    boxShadow:   form.tipo === t.id ? `0 0 0 2px ${t.border}35` : "none",
    transition:"all .15s",
  });
  const tabBtn = (id, lbl) => (
    <button key={id} onClick={() => setTab(id)} style={{
      padding:"8px 20px", borderRadius:8, border:"none",
      fontSize:11, fontWeight:800, cursor:"pointer",
      background: tab === id ? `linear-gradient(135deg,${accent},${accent}bb)` : "transparent",
      color: tab === id ? "#fff" : "#64748b",
      transition:"all .15s",
      boxShadow: tab === id ? `0 2px 10px ${accent}45` : "none",
    }}>{lbl}</button>
  );

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"#080e1a",
      padding:"24px 22px",
      fontFamily:"'DM Sans','Inter',system-ui,sans-serif", color:"#e2e8f0" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position:"fixed", top:16, right:16, zIndex:9999,
          padding:"12px 18px", borderRadius:12, fontSize:13, fontWeight:700,
          background: toast.type === "ok"
            ? "linear-gradient(135deg,#059669,#10b981)"
            : "linear-gradient(135deg,#dc2626,#ef4444)",
          color:"#fff", boxShadow:"0 8px 30px rgba(0,0,0,.4)",
          border:"1px solid rgba(255,255,255,.14)",
          animation:"popIn .2s ease-out",
        }}>
          {toast.msg}
        </div>
      )}
      <style>{`@keyframes popIn{0%{transform:scale(.8);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}`}</style>

      {/* ── Header ── */}
      <div style={{ marginBottom:24, display:"flex", justifyContent:"space-between",
        alignItems:"flex-start", flexWrap:"wrap", gap:16 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6, flexWrap:"wrap" }}>
            <span style={{ fontSize:24 }}>{icon}</span>
            <span style={{ padding:"4px 12px", borderRadius:6, fontSize:10, fontWeight:900,
              letterSpacing:".12em", background:`${accent}20`, color:accent,
              border:`1px solid ${accent}40`, textTransform:"uppercase" }}>
              BROADCAST · {label}
            </span>
            {isAdmin && (
              <span style={{ padding:"4px 10px", borderRadius:6, fontSize:9, fontWeight:800,
                background:"rgba(251,191,36,.15)", color:"#fde047",
                border:"1px solid rgba(251,191,36,.3)", textTransform:"uppercase",
                letterSpacing:".08em" }}>
                👑 Vista Admin — todos los canales
              </span>
            )}
          </div>
          <h1 style={{ margin:0, fontSize:21, fontWeight:900, color:"#f1f5f9", letterSpacing:"-.02em" }}>
            Centro de Control · {label}
          </h1>
          <p style={{ margin:"2px 0 0", fontSize:11, color:"#475569" }}>
            Proyecta mensajes a todas las pantallas del equipo · {isAdmin ? "Vista completa" : `canal ${label}`}
          </p>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          {[["📨", `${hoyEnviados}`, "hoy"], ["📋", `${historial.length}`, "total"]].map(([ico, val, lbl]) => (
            <div key={lbl} style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.07)",
              borderRadius:10, padding:"8px 14px", textAlign:"center" }}>
              <div style={{ fontSize:17 }}>{ico}</div>
              <div style={{ fontSize:16, fontWeight:900, color:"#f1f5f9" }}>{val}</div>
              <div style={{ fontSize:9, color:"#475569", fontWeight:600, textTransform:"uppercase" }}>{lbl}</div>
            </div>
          ))}
          <a href="/tv" target="_blank" style={{
            background:`linear-gradient(135deg,${accent},${accent}bb)`,
            color:"#fff", padding:"10px 18px", borderRadius:10,
            fontSize:11, fontWeight:800, textDecoration:"none",
            textTransform:"uppercase", letterSpacing:".08em",
            boxShadow:`0 4px 16px ${accent}40`,
          }}>📺 Modo TV</a>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display:"flex", gap:2, padding:3,
        background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.07)",
        borderRadius:10, width:"fit-content", marginBottom:22 }}>
        {tabBtn("crear",    "✏️ Crear mensaje")}
        {tabBtn("historial","📋 Historial")}
      </div>

      {tab === "crear" ? (
        /* ═══ CREAR ══════════════════════════════════════════════════════════ */
        <div style={{ display:"grid", gridTemplateColumns:"1fr 420px", gap:20, alignItems:"start" }}>

          {/* ── Formulario ── */}
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

            {/* Plantillas */}
            <div style={{ ...S.card }}>
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"center", marginBottom: showPlant ? 14 : 0 }}>
                <span style={S.label}>⚡ Plantillas rápidas ({PLANTILLAS.length})</span>
                <button onClick={() => setShowPlant(s => !s)} style={{
                  background:`${accent}18`, color:accent,
                  border:`1px solid ${accent}40`, borderRadius:8,
                  padding:"4px 12px", fontSize:10, fontWeight:800, cursor:"pointer",
                }}>
                  {showPlant ? "Ocultar ▲" : "Ver plantillas ▼"}
                </button>
              </div>
              {showPlant && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7 }}>
                  {PLANTILLAS.map((p, i) => (
                    <button key={i} onClick={() => aplicarPlantilla(p)}
                      onMouseEnter={e => { e.currentTarget.style.background=`${accent}18`; e.currentTarget.style.borderColor=`${accent}55`; }}
                      onMouseLeave={e => { e.currentTarget.style.background="rgba(255,255,255,.04)"; e.currentTarget.style.borderColor="rgba(255,255,255,.08)"; }}
                      style={{
                        display:"flex", alignItems:"center", gap:10,
                        background:"rgba(255,255,255,.04)",
                        border:"1px solid rgba(255,255,255,.08)",
                        borderRadius:10, padding:"10px 12px",
                        cursor:"pointer", textAlign:"left", transition:"all .14s",
                      }}>
                      <span style={{ fontSize:20 }}>{p.emoji}</span>
                      <div>
                        <div style={{ fontSize:10, fontWeight:800, color:"#e2e8f0" }}>{p.titulo}</div>
                        <div style={{ fontSize:9, color:"#475569" }}>
                          {EFECTOS.find(e => e.id === p.efecto)?.emoji} {p.efecto}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tipo */}
            <div style={S.card}>
              <span style={S.label}>Tipo de mensaje</span>
              <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                {TIPOS.map(t => (
                  <button key={t.id} onClick={() => upd("tipo", t.id)} style={chipTipo(t)}>
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Contenido */}
            <div style={S.card}>
              <span style={S.label}>Contenido</span>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:10, fontWeight:700, color:"#64748b", display:"block", marginBottom:5 }}>Título</label>
                <input style={S.input}
                  placeholder="Ej: ¡Felicitaciones equipo! 🎉"
                  value={form.titulo} onChange={e => upd("titulo", e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize:10, fontWeight:700, color:"#64748b", display:"block", marginBottom:5 }}>Cuerpo del mensaje</label>
                <textarea style={{ ...S.input, minHeight:88, resize:"vertical" }}
                  placeholder="Escribe el mensaje que verán en pantalla…"
                  value={form.mensaje} onChange={e => upd("mensaje", e.target.value)} />
              </div>
            </div>

            {/* Efectos — 12 en grid 4 columnas */}
            <div style={S.card}>
              <span style={S.label}>✨ Efecto visual en pantalla (12 efectos)</span>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6 }}>
                {EFECTOS.map(e => (
                  <button key={e.id} onClick={() => upd("efecto", e.id)} style={chipEfecto(e)}>
                    <div style={{ fontSize:18, marginBottom:2 }}>{e.emoji}</div>
                    <div style={{ fontSize:10 }}>{e.label}</div>
                    {e.desc && <div style={{ fontSize:8, opacity:.6, marginTop:1 }}>{e.desc}</div>}
                  </button>
                ))}
              </div>
              {form.efecto !== "ninguno" && (
                <div style={{ marginTop:10, padding:"8px 12px",
                  background:`${EFECTOS.find(e => e.id === form.efecto)?.color}18`,
                  borderRadius:8, border:`1px solid ${EFECTOS.find(e => e.id === form.efecto)?.color}35`,
                  display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:20 }}>{EFECTOS.find(e => e.id === form.efecto)?.emoji}</span>
                  <div>
                    <div style={{ fontSize:11, fontWeight:800,
                      color:EFECTOS.find(e => e.id === form.efecto)?.color }}>
                      {EFECTOS.find(e => e.id === form.efecto)?.label} activado
                    </div>
                    <div style={{ fontSize:9, color:"#475569" }}>
                      {EFECTOS.find(e => e.id === form.efecto)?.desc || "Se proyectará en pantalla"}
                    </div>
                  </div>
                  <div style={{ marginLeft:"auto", width:8, height:8, borderRadius:"50%",
                    background:EFECTOS.find(e => e.id === form.efecto)?.color,
                    boxShadow:`0 0 8px ${EFECTOS.find(e => e.id === form.efecto)?.color}`,
                    animation:"popIn .5s ease-in-out infinite alternate" }} />
                </div>
              )}
            </div>

            {/* Sonidos — 8 en grid 4 columnas */}
            <div style={S.card}>
              <span style={S.label}>🔊 Sonido del sistema (8 opciones)</span>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6 }}>
                {SONIDOS.map(s => (
                  <button key={s.id} onClick={() => upd("sonido", s.id)} style={chipSonido(s)}>
                    <div style={{ fontSize:18, marginBottom:2 }}>{s.emoji}</div>
                    <div style={{ fontSize:10 }}>{s.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Audio personalizado */}
            <div style={S.card}>
              <span style={S.label}>🎵 Audio personalizado (opcional)</span>
              <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                {[["none","Sin audio"],["file","Subir archivo"],["url","Link de audio"]].map(([m, lbl]) => (
                  <button key={m}
                    onClick={() => { setAudioMode(m); setAudioFile(null); setAudioUrl(""); }}
                    style={{
                      padding:"7px 14px", borderRadius:8, fontSize:11, fontWeight:700,
                      cursor:"pointer", transition:"all .15s",
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
                  onDrop={e => { e.preventDefault(); setDragAudio(false); const f=e.dataTransfer.files[0]; if(f&&f.type.startsWith("audio/"))setAudioFile(f); }}
                  onClick={() => audioRef.current?.click()}
                  style={{
                    border:`2px dashed ${dragAudio ? accent : "rgba(255,255,255,.15)"}`,
                    borderRadius:10, padding:"20px", textAlign:"center",
                    cursor:"pointer", background:dragAudio ? `${accent}10` : "rgba(255,255,255,.02)",
                    transition:"all .15s",
                  }}>
                  <input ref={audioRef} type="file" accept="audio/*" style={{ display:"none" }}
                    onChange={e => { const f=e.target.files[0]; if(f) setAudioFile(f); }} />
                  <div style={{ fontSize:24, marginBottom:6 }}>🎵</div>
                  <p style={{ fontSize:11, color:"#475569", margin:0, fontWeight:600 }}>
                    {audioFile ? audioFile.name : "Arrastra o haz clic · mp3, wav, ogg, m4a"}
                  </p>
                </div>
              )}
              {audioMode === "url" && (
                <input style={S.input}
                  placeholder="https://example.com/audio.mp3"
                  value={audioUrl} onChange={e => setAudioUrl(e.target.value)} />
              )}
              {audioPreviewSrc && (
                <AudioPlayer src={audioPreviewSrc} name={audioFile?.name || audioUrl} accent={accent} />
              )}
            </div>

            {/* Datos en vivo */}
            <div style={S.card}>
              <span style={S.label}>📊 Datos en vivo de asesores</span>
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
                    <span style={{ fontSize:11, fontWeight:600,
                      color: form.datos_vivos === d.id ? accent : "#94a3b8" }}>
                      {d.emoji} {d.label}
                    </span>
                  </label>
                ))}
              </div>
              {form.datos_vivos && datosVivos && (
                <div style={{ marginTop:10, padding:"10px 12px",
                  background:`${accent}10`, borderRadius:8, border:`1px solid ${accent}30` }}>
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
            <div style={S.card}>
              <span style={S.label}>🎨 Apariencia</span>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
                <div>
                  <label style={{ fontSize:10, fontWeight:700, color:"#64748b",
                    display:"block", marginBottom:6 }}>Duración · {form.duracion}s</label>
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
                    {FONDOS.map(({ color, label:lbl }) => (
                      <button key={color} title={lbl} onClick={() => upd("color_fondo", color)}
                        style={{ width:22, height:22, borderRadius:6, background:color, cursor:"pointer",
                          border:form.color_fondo === color ? `2px solid ${accent}` : "1px solid rgba(255,255,255,.12)",
                          boxShadow:form.color_fondo === color ? `0 0 6px ${accent}` : "none" }} />
                    ))}
                    <input type="color" value={form.color_fondo}
                      onChange={e => upd("color_fondo", e.target.value)}
                      style={{ width:22, height:22, borderRadius:6, border:"none", cursor:"pointer", padding:0 }} />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize:10, fontWeight:700, color:"#64748b", display:"block", marginBottom:6 }}>
                    Color de texto
                  </label>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                    {TEXTOS_COLOR.map(c => (
                      <button key={c} onClick={() => upd("color_texto", c)}
                        style={{ width:22, height:22, borderRadius:6, background:c, cursor:"pointer",
                          border:form.color_texto === c ? `2px solid ${accent}` : "1px solid rgba(255,255,255,.2)",
                          boxShadow:form.color_texto === c ? `0 0 6px ${accent}` : "none" }} />
                    ))}
                    <input type="color" value={form.color_texto}
                      onChange={e => upd("color_texto", e.target.value)}
                      style={{ width:22, height:22, borderRadius:6, border:"none", cursor:"pointer", padding:0 }} />
                  </div>
                </div>
              </div>
              {/* Imagen adjunta */}
              <div>
                <label style={{ fontSize:10, fontWeight:700, color:"#64748b", display:"block", marginBottom:6 }}>
                  🖼 Imagen de fondo (opcional)
                </label>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => imgRef.current?.click()}
                    style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)",
                      borderRadius:8, padding:"8px 16px", fontSize:11, fontWeight:700,
                      cursor:"pointer", color:"#94a3b8" }}>
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
            <div style={S.card}>
              <div style={{ display:"flex", alignItems:"center", gap:10,
                cursor:"pointer", marginBottom: form.programado ? 12 : 0 }}
                onClick={() => upd("programado", !form.programado)}>
                <div style={{ width:36, height:20, borderRadius:10,
                  background: form.programado ? accent : "rgba(255,255,255,.14)",
                  position:"relative", transition:"all .2s", flexShrink:0 }}>
                  <div style={{ position:"absolute", top:2,
                    left: form.programado ? 18 : 2,
                    width:16, height:16, borderRadius:"50%",
                    background:"#fff", transition:"all .2s" }} />
                </div>
                <span style={{ fontSize:12, fontWeight:700, color:"#e2e8f0" }}>
                  ⏰ Programar para más tarde
                </span>
              </div>
              {form.programado && (
                <input type="datetime-local" style={S.input}
                  value={form.programado_para}
                  onChange={e => upd("programado_para", e.target.value)} />
              )}
            </div>

            {/* Enviar */}
            <button onClick={enviar} disabled={loading} style={{
              width:"100%", padding:"16px",
              borderRadius:14, border:"none",
              cursor: loading ? "default" : "pointer",
              fontSize:13, fontWeight:900, textTransform:"uppercase",
              letterSpacing:".08em", color:"#fff",
              background: loading ? "rgba(255,255,255,.12)"
                : `linear-gradient(135deg,${accent},${accent}99)`,
              boxShadow: loading ? "none" : `0 8px 28px ${accent}48`,
              transition:"all .2s",
            }}>
              {loading ? "⏳ Enviando…"
                : form.programado ? "⏰ Programar envío"
                : `📡 Enviar a todas las pantallas · ${label}`}
            </button>
          </div>

          {/* ── Preview sticky ── */}
          <div style={{ position:"sticky", top:20, display:"flex", flexDirection:"column", gap:12 }}>
            <span style={S.label}>Vista previa en vivo · {form.efecto !== "ninguno" ? EFECTOS.find(e=>e.id===form.efecto)?.emoji+" "+EFECTOS.find(e=>e.id===form.efecto)?.label : "sin efecto"}</span>

            <PreviewScreen
              form={form} imagen={imagen}
              audioPreviewSrc={audioPreviewSrc}
              tipoActual={tipoActual}
              label={label} accent={accent}
            />

            {/* Resumen */}
            <div style={{ ...S.card, padding:"14px 16px" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {[
                  ["Tipo",     `${tipoActual.emoji} ${tipoActual.label}`],
                  ["Efecto",   `${EFECTOS.find(e=>e.id===form.efecto)?.emoji} ${form.efecto}`],
                  ["Sonido",   `${SONIDOS.find(s=>s.id===form.sonido)?.emoji} ${form.sonido}`],
                  ["Duración", `${form.duracion}s`],
                  ["Audio",    audioMode==="file"?"📂 Archivo":audioMode==="url"?"🔗 Link":"—"],
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

            {/* Nota canales TV */}
            <div style={{ ...S.card, padding:"12px 14px",
              borderColor:`${accent}30`, background:`${accent}08` }}>
              <div style={{ fontSize:9, fontWeight:800, color:accent,
                textTransform:"uppercase", letterSpacing:".1em", marginBottom:4 }}>
                📺 Filtrado de pantallas TV
              </div>
              <div style={{ fontSize:10, color:"#64748b", lineHeight:1.6 }}>
                Para que una TV solo reciba mensajes de <strong style={{ color:accent }}>{label}</strong>,
                abre la URL: <code style={{ background:"rgba(255,255,255,.08)", padding:"1px 5px",
                  borderRadius:4, fontSize:9, color:"#93c5fd" }}>/tv?canal={canal}</code>
              </div>
            </div>
          </div>
        </div>

      ) : (
        /* ═══ HISTORIAL ═══════════════════════════════════════════════════════ */
        <div>
          {/* Toolbar */}
          <div style={{ display:"flex", justifyContent:"space-between",
            alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:10 }}>
            <div style={{ fontSize:13, fontWeight:800, color:"#e2e8f0" }}>
              📋 Historial{isAdmin ? " · Todos los canales" : ` · ${label}`}
              <span style={{ fontSize:11, color:"#475569", fontWeight:600, marginLeft:8 }}>
                ({historialVisible.length} mensajes)
              </span>
            </div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {/* Filtro de canal solo para admin */}
              {isAdmin && (
                <select value={canalFiltro} onChange={e => setCanalFiltro(e.target.value)}
                  style={{
                    background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)",
                    borderRadius:8, padding:"6px 12px", fontSize:10, fontWeight:700,
                    cursor:"pointer", color:"#e2e8f0", outline:"none",
                  }}>
                  <option value="todos" style={{ background:"#1e293b" }}>Todos los canales</option>
                  <option value="novonet" style={{ background:"#1e293b" }}>NOVONET</option>
                  <option value="velsa" style={{ background:"#1e293b" }}>VELSA</option>
                </select>
              )}
              {[["tabla","≡ Tabla"],["cards","⊞ Cards"]].map(([v,lbl]) => (
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
                style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)",
                  borderRadius:8, padding:"6px 14px", fontSize:10, fontWeight:700,
                  cursor:"pointer", color:"#94a3b8" }}>↻ Actualizar</button>
            </div>
          </div>

          {histView === "tabla" ? (
            <div style={{ background:"rgba(255,255,255,.03)",
              border:"1px solid rgba(255,255,255,.07)", borderRadius:14, overflow:"hidden" }}>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                  <thead>
                    <tr style={{ background:"rgba(255,255,255,.04)",
                      borderBottom:"1px solid rgba(255,255,255,.06)" }}>
                      {(isAdmin ? ["Canal","Tipo","Título","Efecto","Dur.","Estado","Fecha",""] :
                        ["Tipo","Título","Efecto","Dur.","Estado","Fecha",""]).map(h => (
                        <th key={h} style={{ padding:"10px 14px", textAlign:"left",
                          fontWeight:800, color:"#475569", fontSize:9,
                          textTransform:"uppercase", letterSpacing:".1em",
                          whiteSpace:"nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {historialVisible.length === 0 ? (
                      <tr><td colSpan={8} style={{ padding:40, textAlign:"center", color:"#475569" }}>
                        Sin mensajes
                      </td></tr>
                    ) : historialVisible.map(row => {
                      const tipo = TIPOS.find(t => t.id === row.tipo) || TIPOS[3];
                      return (
                        <tr key={row.id}
                          style={{ borderBottom:"1px solid rgba(255,255,255,.04)", transition:"background .1s" }}
                          onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,.03)"}
                          onMouseLeave={e => e.currentTarget.style.background=""}>
                          {isAdmin && (
                            <td style={{ padding:"10px 14px" }}>
                              <span style={{ fontSize:10, fontWeight:800, padding:"3px 8px",
                                borderRadius:20,
                                background: row.canal === "velsa" ? "rgba(168,85,247,.2)" : "rgba(14,165,233,.2)",
                                color: row.canal === "velsa" ? "#c084fc" : "#38bdf8" }}>
                                {(row.canal || "—").toUpperCase()}
                              </span>
                            </td>
                          )}
                          <td style={{ padding:"10px 14px" }}>
                            <span style={{ background:tipo.bg, color:tipo.text,
                              borderRadius:20, padding:"3px 8px",
                              fontSize:10, fontWeight:700 }}>
                              {tipo.emoji} {tipo.label}
                            </span>
                          </td>
                          <td style={{ padding:"10px 14px", fontWeight:700, color:"#e2e8f0",
                            maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {row.titulo || "—"}
                          </td>
                          <td style={{ padding:"10px 14px", color:"#64748b" }}>
                            {EFECTOS.find(e => e.id === row.efecto)?.emoji || "○"}
                          </td>
                          <td style={{ padding:"10px 14px", color:"#64748b" }}>{row.duracion}s</td>
                          <td style={{ padding:"10px 14px" }}>
                            <span style={{ fontSize:10, fontWeight:700, borderRadius:20, padding:"3px 8px",
                              background: row.enviado ? "rgba(16,185,129,.18)" : "rgba(234,179,8,.18)",
                              color:      row.enviado ? "#6ee7b7" : "#fde047" }}>
                              {row.enviado ? "✓ Enviado" : "⏳ Pendiente"}
                            </span>
                          </td>
                          <td style={{ padding:"10px 14px", color:"#475569", fontSize:10, whiteSpace:"nowrap" }}>
                            {new Date(row.created_at).toLocaleString("es-EC", {
                              timeZone:"America/Guayaquil", day:"2-digit", month:"short",
                              hour:"2-digit", minute:"2-digit" })}
                          </td>
                          <td style={{ padding:"10px 14px" }}>
                            <button onClick={() => reenviar(row)}
                              style={{ background:`${accent}18`, color:accent,
                                border:`1px solid ${accent}40`, borderRadius:6,
                                padding:"4px 10px", fontSize:9, fontWeight:800, cursor:"pointer" }}>
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
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:12 }}>
              {historialVisible.length === 0 ? (
                <div style={{ gridColumn:"1/-1", padding:40, textAlign:"center", color:"#475569" }}>
                  Sin mensajes
                </div>
              ) : historialVisible.map(row => {
                const tipo = TIPOS.find(t => t.id === row.tipo) || TIPOS[3];
                const ef   = EFECTOS.find(e => e.id === row.efecto);
                return (
                  <div key={row.id} style={{ ...S.card, padding:"14px 16px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between",
                      alignItems:"flex-start", marginBottom:8, gap:6 }}>
                      <span style={{ background:tipo.bg, color:tipo.text,
                        borderRadius:20, padding:"3px 10px", fontSize:10, fontWeight:700,
                        flexShrink:0 }}>
                        {tipo.emoji} {tipo.label}
                      </span>
                      <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                        {isAdmin && row.canal && (
                          <span style={{ fontSize:9, fontWeight:800, padding:"2px 6px",
                            borderRadius:20,
                            background: row.canal === "velsa" ? "rgba(168,85,247,.2)" : "rgba(14,165,233,.2)",
                            color: row.canal === "velsa" ? "#c084fc" : "#38bdf8" }}>
                            {row.canal.toUpperCase()}
                          </span>
                        )}
                        <span style={{ fontSize:10, fontWeight:700, borderRadius:20, padding:"2px 7px",
                          background: row.enviado ? "rgba(16,185,129,.18)" : "rgba(234,179,8,.18)",
                          color:      row.enviado ? "#6ee7b7" : "#fde047" }}>
                          {row.enviado ? "✓" : "⏳"}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize:12, fontWeight:800, color:"#e2e8f0", marginBottom:4 }}>
                      {row.titulo || "Sin título"}
                    </div>
                    {row.mensaje && (
                      <div style={{ fontSize:10, color:"#64748b", marginBottom:8,
                        overflow:"hidden", textOverflow:"ellipsis",
                        display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>
                        {row.mensaje}
                      </div>
                    )}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ fontSize:10, color:"#475569" }}>
                        {ef?.emoji} {ef?.label || "sin efecto"} · {row.duracion}s
                      </div>
                      <button onClick={() => reenviar(row)}
                        style={{ background:`${accent}18`, color:accent,
                          border:`1px solid ${accent}40`, borderRadius:6,
                          padding:"4px 10px", fontSize:9, fontWeight:800, cursor:"pointer" }}>
                        ↺ Reenviar
                      </button>
                    </div>
                    <div style={{ fontSize:9, color:"#334155", marginTop:8, fontWeight:600 }}>
                      {new Date(row.created_at).toLocaleString("es-EC", {
                        timeZone:"America/Guayaquil", day:"2-digit",
                        month:"short", hour:"2-digit", minute:"2-digit" })}
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
