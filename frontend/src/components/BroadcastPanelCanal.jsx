/**
 * BroadcastPanelCanal.jsx
 * Componente base para los paneles de broadcast NOVONET y VELSA.
 * Completamente responsive: móvil / tablet / laptop / TV.
 *
 * Props:
 *   canal     "novonet" | "velsa"
 *   config    { label, accent, gradient, icon, bg }
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Catálogos
// ─────────────────────────────────────────────────────────────────────────────
const TIPOS = [
  { id: "urgente",       emoji: "🚨", label: "Urgente",       bg: "bg-red-500/20",    ring: "ring-red-500",    text: "text-red-300"   },
  { id: "prevencion",    emoji: "⚠️",  label: "Prevención",    bg: "bg-yellow-500/20", ring: "ring-yellow-400", text: "text-yellow-300" },
  { id: "logro",         emoji: "🏆", label: "Logro",          bg: "bg-emerald-500/20",ring: "ring-emerald-400",text: "text-emerald-300"},
  { id: "info",          emoji: "📢", label: "Info",           bg: "bg-blue-500/20",   ring: "ring-blue-400",   text: "text-blue-300"  },
  { id: "personalizado", emoji: "✨", label: "Personalizado",  bg: "bg-purple-500/20", ring: "ring-purple-400", text: "text-purple-300" },
];

const EFECTOS = [
  { id: "ninguno",    label: "Sin efecto",   emoji: "—"  },
  { id: "confeti",    label: "Confeti",      emoji: "🎊" },
  { id: "fuego",      label: "Fuego",        emoji: "🔥" },
  { id: "alertaroja", label: "Alerta roja",  emoji: "🚨" },
  { id: "nieve",      label: "Nieve",        emoji: "❄️" },
  { id: "estrellas",  label: "Estrellas",    emoji: "⭐" },
];

const SONIDOS = [
  { id: "ninguno",  label: "Sin sonido",    emoji: "🔇" },
  { id: "chime",    label: "Chime suave",   emoji: "🔔" },
  { id: "alerta",   label: "Alerta",        emoji: "🚨" },
  { id: "victoria", label: "Fanfarria",     emoji: "🏆" },
  { id: "error",    label: "Atención",      emoji: "❌" },
];

const DATOS_VIVOS = [
  { id: "",               label: "Sin datos en vivo",        emoji: "—"  },
  { id: "top_asesores",   label: "Top asesores del día",     emoji: "🥇" },
  { id: "top_activas",    label: "Top asesores activas",     emoji: "✅" },
  { id: "sin_ventas",     label: "Asesores sin ventas",      emoji: "📉" },
  { id: "gestion_diaria", label: "En Gestión Diaria",        emoji: "⚠️" },
  { id: "resumen_dia",    label: "Resumen del día",          emoji: "📊" },
];

const FONDOS_PRESET = [
  "#0f172a","#1e1b4b","#0c4a6e","#064e3b","#431407",
  "#1a1a2e","#2d1b69","#0d1b2a","#0a0f1e","#1c0533",
];

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de estilo reutilizables
// ─────────────────────────────────────────────────────────────────────────────
const sectionCls = "bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4";
const labelCls   = "block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2";
const inputCls   = "w-full bg-white/8 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/30 transition";

// ─────────────────────────────────────────────────────────────────────────────
// Mini reproductor de audio
// ─────────────────────────────────────────────────────────────────────────────
function AudioPlayer({ src, name }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else         { a.play();  setPlaying(true);  }
  };

  const fmt = (s) => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;

  return (
    <div className="flex items-center gap-3 bg-white/8 rounded-xl px-3 py-2.5 mt-2">
      <audio
        ref={audioRef} src={src}
        onTimeUpdate={() => { const a = audioRef.current; if(a) setProgress(a.currentTime / (a.duration||1) * 100); }}
        onLoadedMetadata={() => { if(audioRef.current) setDuration(audioRef.current.duration); }}
        onEnded={() => setPlaying(false)}
      />
      <button onClick={toggle}
        className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition shrink-0">
        {playing ? "⏸" : "▶️"}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white font-semibold truncate">{name || "Audio adjunto"}</p>
        <div className="w-full h-1.5 bg-white/15 rounded-full mt-1">
          <div className="h-full bg-white/60 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <span className="text-[10px] text-slate-400 shrink-0">{fmt(duration)}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────
export default function BroadcastPanelCanal({ canal, config }) {
  const {
    label    = canal.toUpperCase(),
    accent   = "#3b82f6",
    gradient = "from-blue-900 via-slate-900 to-slate-950",
    icon     = "📡",
  } = config || {};

  // ── Estado del formulario ────────────────────────────────────────────────
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
  });

  const [imagen,      setImagen]      = useState(null);
  const [audioFile,   setAudioFile]   = useState(null);   // File
  const [audioUrl,    setAudioUrl]    = useState("");      // URL string
  const [audioMode,   setAudioMode]   = useState("none"); // "none" | "file" | "url"

  const [tab,         setTab]         = useState("crear"); // crear | historial
  const [loading,     setLoading]     = useState(false);
  const [toast,       setToast]       = useState(null);    // { type, msg }
  const [historial,   setHistorial]   = useState([]);
  const [datosVivos,  setDatosVivos]  = useState(null);
  const [dragAudio,   setDragAudio]   = useState(false);

  const imgRef   = useRef();
  const audioRef = useRef();

  const upd = useCallback((key, val) => setForm(f => ({ ...f, [key]: val })), []);

  // ── Cargar historial y datos vivos ───────────────────────────────────────
  const fetchHistorial = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/broadcast/historial`);
      const d = await r.json();
      if (d.success) {
        // Filtrar solo los mensajes de este canal
        const filtrado = d.data.filter(m => !m.canal || m.canal === canal);
        setHistorial(filtrado);
      }
    } catch { /* silencioso */ }
  }, [canal]);

  const fetchDatosVivos = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/broadcast/datos-vivos`);
      const d = await r.json();
      if (d.success) setDatosVivos(d);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { fetchHistorial(); fetchDatosVivos(); }, [fetchHistorial, fetchDatosVivos]);

  // ── Toast ────────────────────────────────────────────────────────────────
  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Envío ────────────────────────────────────────────────────────────────
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
      if (imagen)    fd.append("imagen", imagen);
      if (audioMode === "file" && audioFile)  fd.append("audio_archivo", audioFile);
      if (audioMode === "url"  && audioUrl.trim()) fd.append("audio_url", audioUrl.trim());

      const endpoint = form.programado
        ? "/api/broadcast/programar"
        : "/api/broadcast/enviar";

      const r = await fetch(`${API}${endpoint}`, { method: "POST", body: fd });
      const d = await r.json();
      if (d.success) {
        showToast("ok", form.programado ? "✅ Mensaje programado correctamente" : "✅ Mensaje enviado a todas las pantallas");
        fetchHistorial();
        // Limpiar
        setForm(f => ({ ...f, titulo: "", mensaje: "", datos_vivos: "", programado: false, programado_para: "" }));
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

  const tipoActual = TIPOS.find(t => t.id === form.tipo) || TIPOS[0];

  // ── URL de audio para preview ────────────────────────────────────────────
  const audioPreviewSrc = audioMode === "file" && audioFile
    ? URL.createObjectURL(audioFile)
    : audioMode === "url" && audioUrl.trim()
    ? audioUrl.trim()
    : null;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen bg-gradient-to-br ${gradient} text-white`}
      style={{ fontFamily: "'DM Sans','Inter',system-ui,sans-serif" }}>

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-2xl text-sm font-bold transition-all
          ${toast.type === "ok" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>
          {toast.type === "ok" ? "✅" : "❌"} {toast.msg}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

        {/* ── HEADER ── */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{icon}</span>
              <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md"
                style={{ background: accent + "33", color: accent, border: `1px solid ${accent}55` }}>
                BROADCAST · {label}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Centro de Mensajes
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">
              Proyecta mensajes, alertas y logros en todas las pantallas del equipo {label}.
            </p>
          </div>
          <a href="/tv" target="_blank"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition hover:scale-105"
            style={{ background: accent + "22", color: accent, border: `1px solid ${accent}44` }}>
            📺 Modo TV
          </a>
        </div>

        {/* ── TABS ── */}
        <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl w-fit mb-6">
          {[["crear","✏️ Crear"], ["historial","📋 Historial"]].map(([id, lbl]) => (
            <button key={id} onClick={() => setTab(id)}
              className="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wide transition-all"
              style={tab === id
                ? { background: accent, color: "#fff", boxShadow: `0 0 16px ${accent}66` }
                : { color: "#94a3b8" }}>
              {lbl}
            </button>
          ))}
        </div>

        {tab === "crear" ? (
          /* ═══════════════ CREAR MENSAJE ═══════════════ */
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5">

            {/* ── Columna izquierda: formulario ── */}
            <div className="space-y-4">

              {/* Tipo */}
              <div className={sectionCls}>
                <label className={labelCls}>Tipo de mensaje</label>
                <div className="flex flex-wrap gap-2">
                  {TIPOS.map(t => (
                    <button key={t.id} onClick={() => upd("tipo", t.id)}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold border transition-all
                        ${form.tipo === t.id
                          ? `${t.bg} ${t.ring} ring-2 ${t.text} scale-105 shadow-lg`
                          : "border-white/10 text-slate-400 hover:border-white/30 hover:text-white"}`}>
                      {t.emoji} {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Título y mensaje */}
              <div className={sectionCls}>
                <div>
                  <label className={labelCls}>Título del mensaje</label>
                  <input className={inputCls}
                    placeholder="Ej: ¡Felicitaciones equipo! 🎉"
                    value={form.titulo} onChange={e => upd("titulo", e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Cuerpo del mensaje</label>
                  <textarea className={`${inputCls} min-h-[90px] resize-none`}
                    placeholder="Escribe el mensaje que verán en pantalla..."
                    value={form.mensaje} onChange={e => upd("mensaje", e.target.value)} />
                </div>
              </div>

              {/* Audio */}
              <div className={sectionCls}>
                <label className={labelCls}>🎵 Audio (opcional)</label>
                <div className="flex gap-2 mb-3">
                  {[["none","Sin audio"],["file","Subir archivo"],["url","Link de audio"]].map(([m, lbl]) => (
                    <button key={m} onClick={() => { setAudioMode(m); setAudioFile(null); setAudioUrl(""); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all
                        ${audioMode === m
                          ? "border-white/40 bg-white/15 text-white"
                          : "border-white/10 text-slate-500 hover:text-slate-300"}`}>
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
                    className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all
                      ${dragAudio ? "border-white/50 bg-white/10" : "border-white/15 hover:border-white/30"}`}>
                    <input ref={audioRef} type="file" accept="audio/*" className="hidden"
                      onChange={e => { const f = e.target.files[0]; if(f) setAudioFile(f); }} />
                    <p className="text-sm text-slate-400">
                      {audioFile ? `🎵 ${audioFile.name}` : "🎵 Arrastra o haz clic · mp3, wav, ogg, m4a"}
                    </p>
                  </div>
                )}

                {audioMode === "url" && (
                  <input className={inputCls}
                    placeholder="https://example.com/audio.mp3"
                    value={audioUrl} onChange={e => setAudioUrl(e.target.value)} />
                )}

                {/* Mini reproductor */}
                {audioPreviewSrc && (
                  <AudioPlayer src={audioPreviewSrc} name={audioFile?.name || audioUrl} />
                )}
              </div>

              {/* Efecto + Sonido */}
              <div className={`${sectionCls} grid grid-cols-1 sm:grid-cols-2 gap-4`}>
                <div>
                  <label className={labelCls}>Efecto visual</label>
                  <div className="flex flex-wrap gap-1.5">
                    {EFECTOS.map(e => (
                      <button key={e.id} onClick={() => upd("efecto", e.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all
                          ${form.efecto === e.id
                            ? "bg-white/20 border-white/40 text-white"
                            : "border-white/10 text-slate-500 hover:text-slate-300"}`}>
                        {e.emoji} {e.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Sonido del sistema</label>
                  <div className="flex flex-wrap gap-1.5">
                    {SONIDOS.map(s => (
                      <button key={s.id} onClick={() => upd("sonido", s.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all
                          ${form.sonido === s.id
                            ? "bg-white/20 border-white/40 text-white"
                            : "border-white/10 text-slate-500 hover:text-slate-300"}`}>
                        {s.emoji} {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Datos en vivo */}
              <div className={sectionCls}>
                <label className={labelCls}>📊 Datos en vivo de asesores</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {DATOS_VIVOS.map(d => (
                    <label key={d.id}
                      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl cursor-pointer border transition-all
                        ${form.datos_vivos === d.id
                          ? "border-white/40 bg-white/10"
                          : "border-white/8 hover:border-white/20"}`}>
                      <input type="radio" name={`datos_vivos_${canal}`}
                        checked={form.datos_vivos === d.id}
                        onChange={() => upd("datos_vivos", d.id)}
                        className="accent-white" />
                      <span className="text-xs font-semibold text-slate-200">
                        {d.emoji} {d.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Colores + Duración + Imagen */}
              <div className={sectionCls}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>Duración (seg.)</label>
                    <input type="range" min={5} max={300} step={5}
                      value={form.duracion}
                      onChange={e => upd("duracion", +e.target.value)}
                      className="w-full accent-white" />
                    <p className="text-xs text-slate-400 mt-1 text-center font-bold">{form.duracion}s</p>
                  </div>
                  <div>
                    <label className={labelCls}>Color de fondo</label>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {FONDOS_PRESET.map(c => (
                        <button key={c} onClick={() => upd("color_fondo", c)}
                          style={{ background: c }}
                          className={`w-6 h-6 rounded-md border-2 transition-all ${form.color_fondo === c ? "border-white scale-110" : "border-transparent"}`} />
                      ))}
                      <input type="color" value={form.color_fondo}
                        onChange={e => upd("color_fondo", e.target.value)}
                        className="w-6 h-6 rounded-md cursor-pointer border-0 bg-transparent" />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Color de texto</label>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {["#ffffff","#fbbf24","#34d399","#f87171","#60a5fa","#e879f9"].map(c => (
                        <button key={c} onClick={() => upd("color_texto", c)}
                          style={{ background: c }}
                          className={`w-6 h-6 rounded-md border-2 transition-all ${form.color_texto === c ? "border-white scale-110" : "border-transparent"}`} />
                      ))}
                      <input type="color" value={form.color_texto}
                        onChange={e => upd("color_texto", e.target.value)}
                        className="w-6 h-6 rounded-md cursor-pointer border-0 bg-transparent" />
                    </div>
                  </div>
                </div>

                {/* Imagen */}
                <div className="mt-2">
                  <label className={labelCls}>🖼 Imagen adjunta (opcional)</label>
                  <button onClick={() => imgRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-white/8 border border-white/15 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/15 transition">
                    📎 {imagen ? imagen.name : "Seleccionar imagen"}
                  </button>
                  <input ref={imgRef} type="file" accept="image/*"
                    className="hidden" onChange={e => setImagen(e.target.files[0])} />
                </div>
              </div>

              {/* Programar */}
              <div className={sectionCls}>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div onClick={() => upd("programado", !form.programado)}
                    className={`w-10 h-5 rounded-full transition-all relative ${form.programado ? "" : "bg-white/15"}`}
                    style={form.programado ? { background: accent } : {}}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${form.programado ? "left-5" : "left-0.5"}`} />
                  </div>
                  <span className="text-sm font-semibold">Programar para más tarde</span>
                </label>
                {form.programado && (
                  <input type="datetime-local" className={inputCls}
                    value={form.programado_para}
                    onChange={e => upd("programado_para", e.target.value)} />
                )}
              </div>

              {/* Botón enviar */}
              <button onClick={enviar} disabled={loading}
                className="w-full py-4 rounded-2xl text-sm font-black uppercase tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={loading ? {} : {
                  background: `linear-gradient(135deg, ${accent}, ${accent}99)`,
                  boxShadow: `0 8px 32px ${accent}44`,
                }}>
                {loading ? "⏳ Enviando…" : form.programado ? "⏰ Programar envío" : `📡 Enviar a todas las pantallas ${label}`}
              </button>
            </div>

            {/* ── Columna derecha: preview en vivo (sticky) ── */}
            <div className="xl:sticky xl:top-6 space-y-4 h-fit">
              <label className={labelCls}>Vista previa en vivo</label>

              {/* Pantalla 16:9 */}
              <div className="w-full aspect-video rounded-2xl overflow-hidden relative border border-white/10 shadow-2xl"
                style={{ background: form.color_fondo, boxShadow: `0 0 40px ${accent}33` }}>

                {/* Imagen de fondo */}
                {imagen && (
                  <img src={URL.createObjectURL(imagen)} alt=""
                    className="absolute inset-0 w-full h-full object-cover opacity-25" />
                )}

                {/* Canal badge */}
                <div className="absolute top-3 right-3 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded"
                  style={{ background: accent + "44", color: accent, border: `1px solid ${accent}66` }}>
                  {label}
                </div>

                {/* Contenido */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                  <div className="text-3xl mb-2">{tipoActual.emoji}</div>
                  <div className="text-lg sm:text-xl font-black leading-tight mb-2 break-words"
                    style={{ color: form.color_texto, textShadow: "0 2px 8px rgba(0,0,0,.5)" }}>
                    {form.titulo || "TÍTULO DEL MENSAJE"}
                  </div>
                  <div className="text-xs leading-relaxed break-words opacity-80"
                    style={{ color: form.color_texto }}>
                    {form.mensaje || "El mensaje aparecerá aquí..."}
                  </div>
                  {form.datos_vivos && (
                    <div className="mt-3 px-3 py-1.5 rounded-lg text-[10px] font-bold"
                      style={{ background: "rgba(255,255,255,.12)", color: form.color_texto }}>
                      📊 {DATOS_VIVOS.find(d => d.id === form.datos_vivos)?.label}
                    </div>
                  )}
                  {audioPreviewSrc && (
                    <div className="mt-2 text-[10px]" style={{ color: form.color_texto, opacity: 0.7 }}>
                      🎵 Audio adjunto
                    </div>
                  )}
                </div>

                {/* Barra de progreso */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
                  <div className="h-full w-2/5 rounded-full"
                    style={{ background: accent }} />
                </div>
              </div>

              {/* Resumen config */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 grid grid-cols-2 gap-3">
                {[
                  ["Tipo",     tipoActual.emoji + " " + tipoActual.label],
                  ["Efecto",   EFECTOS.find(e => e.id === form.efecto)?.emoji + " " + EFECTOS.find(e => e.id === form.efecto)?.label],
                  ["Sonido",   SONIDOS.find(s => s.id === form.sonido)?.emoji + " " + SONIDOS.find(s => s.id === form.sonido)?.label],
                  ["Duración", `${form.duracion}s`],
                  ["Audio",    audioMode === "file" ? "📂 Archivo" : audioMode === "url" ? "🔗 Link" : "—"],
                  ["Canal",    label],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black">{k}</p>
                    <p className="text-xs text-slate-200 font-semibold truncate">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

        ) : (
          /* ═══════════════ HISTORIAL ═══════════════ */
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <h3 className="text-sm font-black uppercase tracking-wide">
                📋 Historial · <span style={{ color: accent }}>{label}</span>
              </h3>
              <button onClick={fetchHistorial}
                className="px-3 py-1.5 text-xs font-bold border border-white/15 rounded-lg text-slate-400 hover:text-white hover:border-white/30 transition">
                ↻ Actualizar
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/8">
                    {["Tipo","Título","Efecto","Duración","Estado","Audio","Fecha"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historial.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                        Sin mensajes enviados en este canal aún
                      </td>
                    </tr>
                  ) : historial.map(row => {
                    const tipo = TIPOS.find(t => t.id === row.tipo) || TIPOS[3];
                    return (
                      <tr key={row.id}
                        className="border-b border-white/5 hover:bg-white/5 transition">
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${tipo.bg} ${tipo.text}`}>
                            {tipo.emoji} {tipo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-200 font-semibold max-w-[160px] truncate">
                          {row.titulo || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {EFECTOS.find(e => e.id === row.efecto)?.emoji || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-400">{row.duracion}s</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold
                            ${row.enviado ? "bg-emerald-500/20 text-emerald-300" : "bg-yellow-500/20 text-yellow-300"}`}>
                            {row.enviado ? "✓ Enviado" : "⏳ Pendiente"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {row.audio_url || row.audio_archivo ? "🎵" : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {new Date(row.created_at).toLocaleString("es-EC", {
                            timeZone: "America/Guayaquil",
                            day: "2-digit", month: "short",
                            hour: "2-digit", minute: "2-digit"
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
