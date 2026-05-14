/**
 * BroadcastPanelCanal.jsx — Tema CLARO
 * Panel de broadcast para NOVONET y VELSA.
 * Props:
 *   canal   "novonet" | "velsa"
 *   config  { label, accent, icon }
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Catálogos ────────────────────────────────────────────────────────────────
const TIPOS = [
  { id: "urgente",       emoji: "🚨", label: "Urgente",      bg: "#fee2e2", border: "#ef4444", text: "#991b1b" },
  { id: "prevencion",    emoji: "⚠️",  label: "Prevención",   bg: "#fef9c3", border: "#eab308", text: "#854d0e" },
  { id: "logro",         emoji: "🏆", label: "Logro",         bg: "#d1fae5", border: "#10b981", text: "#065f46" },
  { id: "info",          emoji: "📢", label: "Info",          bg: "#dbeafe", border: "#3b82f6", text: "#1e40af" },
  { id: "personalizado", emoji: "✨", label: "Personalizado", bg: "#f3e8ff", border: "#a855f7", text: "#6b21a8" },
];

const EFECTOS = [
  { id: "ninguno",    label: "Sin efecto",  emoji: "—"  },
  { id: "confeti",    label: "Confeti",     emoji: "🎊" },
  { id: "fuego",      label: "Fuego",       emoji: "🔥" },
  { id: "alertaroja", label: "Alerta roja", emoji: "🚨" },
  { id: "nieve",      label: "Nieve",       emoji: "❄️" },
  { id: "estrellas",  label: "Estrellas",   emoji: "⭐" },
];

const SONIDOS = [
  { id: "ninguno",  label: "Sin sonido",  emoji: "🔇" },
  { id: "chime",    label: "Chime suave", emoji: "🔔" },
  { id: "alerta",   label: "Alerta",      emoji: "🚨" },
  { id: "victoria", label: "Fanfarria",   emoji: "🏆" },
  { id: "error",    label: "Atención",    emoji: "❌" },
];

const DATOS_VIVOS = [
  { id: "",               label: "Sin datos en vivo",    emoji: "—"  },
  { id: "top_asesores",   label: "Top asesores del día", emoji: "🥇" },
  { id: "top_activas",    label: "Top asesores activas", emoji: "✅" },
  { id: "sin_ventas",     label: "Asesores sin ventas",  emoji: "📉" },
  { id: "gestion_diaria", label: "En Gestión Diaria",    emoji: "⚠️" },
  { id: "resumen_dia",    label: "Resumen del día",      emoji: "📊" },
];

const FONDOS_PRESET = [
  "#0f172a","#1e1b4b","#0c4a6e","#064e3b","#431407",
  "#1a1a2e","#2d1b69","#0d1b2a","#0a0f1e","#1c0533",
];

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

// ─── Estilos reutilizables ────────────────────────────────────────────────────
const card = {
  background: "#fff", border: "1px solid #e2e8f0",
  borderRadius: 16, padding: "18px 20px",
  boxShadow: "0 1px 4px rgba(0,0,0,.05)",
};
const labelSt = {
  display: "block", fontSize: 10, fontWeight: 800,
  color: "#64748b", textTransform: "uppercase",
  letterSpacing: ".1em", marginBottom: 6,
};
const inputSt = {
  width: "100%", boxSizing: "border-box",
  background: "#f8fafc", border: "1px solid #e2e8f0",
  borderRadius: 10, padding: "9px 12px",
  fontSize: 13, fontWeight: 500, color: "#0f172a",
  outline: "none",
};
const inputFocusSt = {
  ...inputSt, border: "1px solid #94a3b8",
  background: "#fff",
};

// ─── Mini reproductor de audio ────────────────────────────────────────────────
function AudioPlayer({ src, name }) {
  const audioRef  = useRef(null);
  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else         { a.play().then(() => setPlaying(true)).catch(() => {}); }
  };

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: "#f1f5f9", borderRadius: 10,
      padding: "10px 14px", marginTop: 8,
      border: "1px solid #e2e8f0",
    }}>
      <audio
        ref={audioRef} src={src}
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (a) setProgress(a.currentTime / (a.duration || 1) * 100);
        }}
        onLoadedMetadata={() => { if (audioRef.current) setDuration(audioRef.current.duration); }}
        onEnded={() => setPlaying(false)}
      />
      <button
        onClick={toggle}
        style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "#0f172a", color: "#fff",
          border: "none", cursor: "pointer", fontSize: 14,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
        {playing ? "⏸" : "▶"}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: "#0f172a", margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name || "Audio adjunto"}
        </p>
        <div style={{ height: 4, background: "#e2e8f0", borderRadius: 4 }}>
          <div style={{ height: "100%", width: `${progress}%`, background: "#0f172a", borderRadius: 4, transition: "width .1s" }} />
        </div>
      </div>
      <span style={{ fontSize: 10, color: "#94a3b8", flexShrink: 0, fontWeight: 600 }}>{fmt(duration)}</span>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function BroadcastPanelCanal({ canal, config }) {
  const {
    label  = canal.toUpperCase(),
    accent = "#3b82f6",
    icon   = "📡",
  } = config || {};

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

  const [imagen,    setImagen]    = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [audioUrl,  setAudioUrl]  = useState("");
  const [audioMode, setAudioMode] = useState("none"); // "none"|"file"|"url"
  const [tab,       setTab]       = useState("crear");
  const [loading,   setLoading]   = useState(false);
  const [toast,     setToast]     = useState(null);
  const [historial, setHistorial] = useState([]);
  const [datosVivos,setDatosVivos]= useState(null);
  const [dragAudio, setDragAudio] = useState(false);
  const [focusedInput, setFocusedInput] = useState(null);

  const imgRef   = useRef();
  const audioRef = useRef();
  const upd = useCallback((k, v) => setForm(f => ({ ...f, [k]: v })), []);

  // ── Cargar historial y datos vivos ──────────────────────────────────────────
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

  // ── Toast ───────────────────────────────────────────────────────────────────
  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Envío ───────────────────────────────────────────────────────────────────
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
      if (audioMode === "file" && audioFile)        fd.append("audio_archivo", audioFile);
      if (audioMode === "url"  && audioUrl.trim())  fd.append("audio_url", audioUrl.trim());

      const endpoint = form.programado ? "/api/broadcast/programar" : "/api/broadcast/enviar";
      const r = await fetch(`${API}${endpoint}`, { method: "POST", body: fd });
      const d = await r.json();
      if (d.success) {
        showToast("ok", form.programado ? "✅ Mensaje programado" : "✅ Mensaje enviado a pantallas");
        fetchHistorial();
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

  const audioPreviewSrc = audioMode === "file" && audioFile
    ? URL.createObjectURL(audioFile)
    : audioMode === "url" && audioUrl.trim()
    ? audioUrl.trim()
    : null;

  const iStyle = (id) => focusedInput === id ? inputFocusSt : inputSt;

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: "24px 20px",
      fontFamily: "'DM Sans','Inter',system-ui,sans-serif", color: "#0f172a" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 999,
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700,
          background: toast.type === "ok" ? "#10b981" : "#ef4444", color: "#fff",
          boxShadow: "0 4px 20px rgba(0,0,0,.15)",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 22 }}>{icon}</span>
            <span style={{
              padding: "3px 10px", borderRadius: 6,
              fontSize: 10, fontWeight: 900, letterSpacing: ".1em",
              background: accent + "18", color: accent,
              border: `1px solid ${accent}40`, textTransform: "uppercase",
            }}>
              BROADCAST · {label}
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#0f172a",
            textTransform: "uppercase", letterSpacing: "-.01em" }}>
            Centro de Mensajes
          </h1>
          <p style={{ margin: 0, fontSize: 11, color: "#64748b", marginTop: 2 }}>
            Proyecta mensajes en todas las pantallas del equipo {label}
          </p>
        </div>
        <a href="/tv" target="_blank"
          style={{
            background: "#0f172a", color: "#fff", padding: "8px 16px",
            borderRadius: 8, fontSize: 10, fontWeight: 800,
            textDecoration: "none", textTransform: "uppercase", letterSpacing: ".06em",
          }}>
          📺 Modo TV
        </a>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 4, padding: 4, background: "#fff",
        border: "1px solid #e2e8f0", borderRadius: 10,
        width: "fit-content", marginBottom: 20,
      }}>
        {[["crear","✏️ Crear"], ["historial","📋 Historial"]].map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{
              padding: "7px 18px", borderRadius: 7, border: "none",
              fontSize: 11, fontWeight: 800, cursor: "pointer",
              background: tab === id ? accent : "transparent",
              color:      tab === id ? "#fff"  : "#64748b",
              transition: "all .15s",
            }}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === "crear" ? (
        /* ═══ CREAR ═══ */
        <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 20, alignItems: "start" }}>

          {/* Columna formulario */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Tipo */}
            <div style={card}>
              <label style={labelSt}>Tipo de mensaje</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {TIPOS.map(t => (
                  <button key={t.id} onClick={() => upd("tipo", t.id)}
                    style={{
                      padding: "7px 14px", borderRadius: 20, cursor: "pointer",
                      border: `1.5px solid ${t.border}`,
                      background: form.tipo === t.id ? t.bg : "#fff",
                      color:      form.tipo === t.id ? t.text : "#64748b",
                      fontSize: 11, fontWeight: 800, transition: "all .15s",
                      boxShadow: form.tipo === t.id ? `0 0 0 3px ${t.border}25` : "none",
                    }}>
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Título y mensaje */}
            <div style={card}>
              <div style={{ marginBottom: 14 }}>
                <label style={labelSt}>Título del mensaje</label>
                <input
                  style={iStyle("titulo")}
                  onFocus={() => setFocusedInput("titulo")}
                  onBlur={() => setFocusedInput(null)}
                  placeholder="Ej: ¡Felicitaciones equipo! 🎉"
                  value={form.titulo}
                  onChange={e => upd("titulo", e.target.value)}
                />
              </div>
              <div>
                <label style={labelSt}>Cuerpo del mensaje</label>
                <textarea
                  style={{ ...iStyle("mensaje"), minHeight: 90, resize: "vertical" }}
                  onFocus={() => setFocusedInput("mensaje")}
                  onBlur={() => setFocusedInput(null)}
                  placeholder="Escribe el mensaje que verán en pantalla..."
                  value={form.mensaje}
                  onChange={e => upd("mensaje", e.target.value)}
                />
              </div>
            </div>

            {/* Audio */}
            <div style={card}>
              <label style={labelSt}>🎵 Audio (opcional)</label>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {[["none","Sin audio"],["file","Subir archivo"],["url","Link de audio"]].map(([m, lbl]) => (
                  <button key={m}
                    onClick={() => { setAudioMode(m); setAudioFile(null); setAudioUrl(""); }}
                    style={{
                      padding: "6px 12px", borderRadius: 8, fontSize: 11,
                      fontWeight: 700, cursor: "pointer", transition: "all .15s",
                      background: audioMode === m ? "#0f172a" : "#f8fafc",
                      color:      audioMode === m ? "#fff"    : "#64748b",
                      border:     audioMode === m ? "1px solid #0f172a" : "1px solid #e2e8f0",
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
                    border: `2px dashed ${dragAudio ? "#0f172a" : "#cbd5e1"}`,
                    borderRadius: 10, padding: "18px", textAlign: "center",
                    cursor: "pointer", background: dragAudio ? "#f8fafc" : "#fff",
                    transition: "all .15s",
                  }}>
                  <input ref={audioRef} type="file" accept="audio/*" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files[0]; if (f) setAudioFile(f); }} />
                  <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
                    {audioFile ? `🎵 ${audioFile.name}` : "🎵 Arrastra o haz clic · mp3, wav, ogg, m4a"}
                  </p>
                </div>
              )}

              {audioMode === "url" && (
                <input
                  style={iStyle("audioUrl")}
                  onFocus={() => setFocusedInput("audioUrl")}
                  onBlur={() => setFocusedInput(null)}
                  placeholder="https://example.com/audio.mp3"
                  value={audioUrl}
                  onChange={e => setAudioUrl(e.target.value)}
                />
              )}

              {audioPreviewSrc && (
                <AudioPlayer src={audioPreviewSrc} name={audioFile?.name || audioUrl} />
              )}
            </div>

            {/* Efecto + Sonido */}
            <div style={{ ...card, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelSt}>Efecto visual</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {EFECTOS.map(e => (
                    <button key={e.id} onClick={() => upd("efecto", e.id)}
                      style={{
                        padding: "5px 10px", borderRadius: 7, fontSize: 11,
                        fontWeight: 600, cursor: "pointer", transition: "all .15s",
                        background: form.efecto === e.id ? "#0f172a" : "#f8fafc",
                        color:      form.efecto === e.id ? "#fff"    : "#475569",
                        border: `1px solid ${form.efecto === e.id ? "#0f172a" : "#e2e8f0"}`,
                      }}>
                      {e.emoji} {e.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelSt}>Sonido del sistema</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {SONIDOS.map(s => (
                    <button key={s.id} onClick={() => upd("sonido", s.id)}
                      style={{
                        padding: "5px 10px", borderRadius: 7, fontSize: 11,
                        fontWeight: 600, cursor: "pointer", transition: "all .15s",
                        background: form.sonido === s.id ? "#0f172a" : "#f8fafc",
                        color:      form.sonido === s.id ? "#fff"    : "#475569",
                        border: `1px solid ${form.sonido === s.id ? "#0f172a" : "#e2e8f0"}`,
                      }}>
                      {s.emoji} {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Datos en vivo */}
            <div style={card}>
              <label style={labelSt}>📊 Datos en vivo de asesores</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {DATOS_VIVOS.map(d => (
                  <label key={d.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                      background: form.datos_vivos === d.id ? "#f0f9ff" : "#f8fafc",
                      border: `1px solid ${form.datos_vivos === d.id ? "#0ea5e9" : "#f1f5f9"}`,
                      transition: "all .15s",
                    }}>
                    <input type="radio" name={`dv_${canal}`}
                      checked={form.datos_vivos === d.id}
                      onChange={() => upd("datos_vivos", d.id)}
                      style={{ accentColor: "#0ea5e9" }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#0f172a" }}>
                      {d.emoji} {d.label}
                    </span>
                  </label>
                ))}
              </div>
              {form.datos_vivos && datosVivos && (
                <div style={{ marginTop: 10, padding: "10px 12px", background: "#f0f9ff",
                  borderRadius: 8, border: "1px solid #bae6fd" }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: "#0369a1",
                    textTransform: "uppercase", marginBottom: 4 }}>Preview datos actuales</div>
                  {form.datos_vivos === "top_asesores" && datosVivos.topAsesores?.slice(0,3).map((a,i) => (
                    <div key={i} style={{ fontSize: 11, color: "#0f172a", marginBottom: 2 }}>
                      {i+1}. {a.nombre} — {a.ingresos} ingresos
                    </div>
                  ))}
                  {form.datos_vivos === "sin_ventas" && (
                    <div style={{ fontSize: 11, color: "#0f172a" }}>
                      {datosVivos.sinVentas?.length} asesores sin ventas hoy
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Colores + Duración + Imagen */}
            <div style={card}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 14 }}>
                <div>
                  <label style={labelSt}>Duración (seg.)</label>
                  <input type="range" min={5} max={300} step={5}
                    value={form.duracion}
                    onChange={e => upd("duracion", +e.target.value)}
                    style={{ width: "100%", accentColor: accent }} />
                  <p style={{ fontSize: 11, color: "#64748b", textAlign: "center",
                    fontWeight: 700, margin: "4px 0 0" }}>{form.duracion}s</p>
                </div>
                <div>
                  <label style={labelSt}>Color de fondo</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
                    {FONDOS_PRESET.map(c => (
                      <button key={c} onClick={() => upd("color_fondo", c)}
                        style={{
                          width: 22, height: 22, borderRadius: 5, background: c,
                          cursor: "pointer", border: form.color_fondo === c
                            ? "2px solid #0ea5e9" : "2px solid transparent",
                        }} />
                    ))}
                    <input type="color" value={form.color_fondo}
                      onChange={e => upd("color_fondo", e.target.value)}
                      style={{ width: 22, height: 22, borderRadius: 5, border: "none",
                        cursor: "pointer", padding: 0 }} />
                  </div>
                </div>
                <div>
                  <label style={labelSt}>Color de texto</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
                    {["#ffffff","#fbbf24","#34d399","#f87171","#60a5fa","#0f172a"].map(c => (
                      <button key={c} onClick={() => upd("color_texto", c)}
                        style={{
                          width: 22, height: 22, borderRadius: 5, background: c,
                          cursor: "pointer",
                          border: form.color_texto === c ? "2px solid #0ea5e9" : "1px solid #e2e8f0",
                        }} />
                    ))}
                    <input type="color" value={form.color_texto}
                      onChange={e => upd("color_texto", e.target.value)}
                      style={{ width: 22, height: 22, borderRadius: 5, border: "none",
                        cursor: "pointer", padding: 0 }} />
                  </div>
                </div>
              </div>
              <div>
                <label style={labelSt}>🖼 Imagen adjunta (opcional)</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button onClick={() => imgRef.current?.click()}
                    style={{
                      background: "#f8fafc", border: "1px solid #e2e8f0",
                      borderRadius: 8, padding: "7px 14px",
                      fontSize: 11, fontWeight: 700, cursor: "pointer", color: "#475569",
                    }}>
                    📎 {imagen ? imagen.name : "Seleccionar imagen"}
                  </button>
                  <input ref={imgRef} type="file" accept="image/*"
                    style={{ display: "none" }} onChange={e => setImagen(e.target.files[0])} />
                </div>
              </div>
            </div>

            {/* Programar */}
            <div style={card}>
              <label style={{ display: "flex", alignItems: "center", gap: 10,
                cursor: "pointer", marginBottom: form.programado ? 12 : 0 }}>
                <input type="checkbox" checked={form.programado}
                  onChange={e => upd("programado", e.target.checked)}
                  style={{ accentColor: accent, width: 16, height: 16 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
                  Programar para más tarde
                </span>
              </label>
              {form.programado && (
                <input type="datetime-local"
                  style={iStyle("prog")}
                  onFocus={() => setFocusedInput("prog")}
                  onBlur={() => setFocusedInput(null)}
                  value={form.programado_para}
                  onChange={e => upd("programado_para", e.target.value)}
                />
              )}
            </div>

            {/* Botón enviar */}
            <button onClick={enviar} disabled={loading}
              style={{
                width: "100%", padding: "14px",
                borderRadius: 12, border: "none", cursor: loading ? "default" : "pointer",
                fontSize: 13, fontWeight: 900, textTransform: "uppercase",
                letterSpacing: ".06em", color: "#fff",
                background: loading ? "#94a3b8" : accent,
                boxShadow: loading ? "none" : `0 6px 20px ${accent}44`,
                transition: "all .2s",
              }}>
              {loading ? "⏳ Enviando…" : form.programado ? "⏰ Programar envío" : `📡 Enviar a todas las pantallas ${label}`}
            </button>
          </div>

          {/* Columna preview */}
          <div style={{ position: "sticky", top: 20 }}>
            <label style={labelSt}>Vista previa en vivo</label>

            {/* Pantalla 16:9 */}
            <div style={{
              width: "100%", aspectRatio: "16/9",
              background: form.color_fondo,
              borderRadius: 14, overflow: "hidden", position: "relative",
              border: `2px solid ${tipoActual.border}`,
              boxShadow: `0 4px 24px ${accent}22`,
            }}>
              {imagen && (
                <img src={URL.createObjectURL(imagen)} alt=""
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
                    objectFit: "cover", opacity: .25 }} />
              )}
              <div style={{
                position: "absolute", top: 8, right: 8, fontSize: 9, fontWeight: 900,
                padding: "2px 8px", borderRadius: 4, textTransform: "uppercase",
                background: accent + "33", color: accent, border: `1px solid ${accent}55`,
              }}>
                {label}
              </div>
              <div style={{
                position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center",
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{tipoActual.emoji}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: form.color_texto,
                  textTransform: "uppercase", letterSpacing: ".02em", lineHeight: 1.1,
                  marginBottom: 6, wordBreak: "break-word",
                  textShadow: "0 2px 8px rgba(0,0,0,.4)" }}>
                  {form.titulo || "TÍTULO DEL MENSAJE"}
                </div>
                <div style={{ fontSize: 11, color: form.color_texto, opacity: .85,
                  lineHeight: 1.5, wordBreak: "break-word" }}>
                  {form.mensaje || "El mensaje aparecerá aquí..."}
                </div>
                {form.datos_vivos && (
                  <div style={{ marginTop: 10, padding: "6px 10px",
                    background: "rgba(255,255,255,.15)", borderRadius: 6,
                    fontSize: 10, color: form.color_texto, opacity: .8 }}>
                    📊 {DATOS_VIVOS.find(d => d.id === form.datos_vivos)?.label}
                  </div>
                )}
                {audioPreviewSrc && (
                  <div style={{ marginTop: 8, fontSize: 10, color: form.color_texto, opacity: .6 }}>
                    🎵 Audio adjunto
                  </div>
                )}
              </div>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3,
                background: "rgba(255,255,255,.12)" }}>
                <div style={{ width: "40%", height: "100%", background: accent }} />
              </div>
            </div>

            {/* Resumen config */}
            <div style={{ ...card, marginTop: 10, display: "grid",
              gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                ["Tipo",     tipoActual.emoji + " " + tipoActual.label],
                ["Efecto",   EFECTOS.find(e => e.id === form.efecto)?.emoji + " " + EFECTOS.find(e => e.id === form.efecto)?.label],
                ["Sonido",   SONIDOS.find(s => s.id === form.sonido)?.emoji + " " + SONIDOS.find(s => s.id === form.sonido)?.label],
                ["Duración", `${form.duracion}s`],
                ["Audio",    audioMode === "file" ? "📂 Archivo" : audioMode === "url" ? "🔗 Link" : "—"],
                ["Canal",    label],
              ].map(([k, v]) => (
                <div key={k}>
                  <p style={{ fontSize: 8, fontWeight: 800, color: "#94a3b8",
                    textTransform: "uppercase", letterSpacing: ".1em", margin: "0 0 2px" }}>{k}</p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#0f172a", margin: 0 }}>{v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

      ) : (
        /* ═══ HISTORIAL ═══ */
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{
            padding: "14px 18px", borderBottom: "1px solid #f1f5f9",
            background: "#fafafa", display: "flex", justifyContent: "space-between",
            alignItems: "center",
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase",
              letterSpacing: ".02em", color: "#0f172a" }}>
              📋 Historial · <span style={{ color: accent }}>{label}</span>
            </div>
            <button onClick={fetchHistorial}
              style={{
                background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6,
                padding: "5px 12px", fontSize: 10, fontWeight: 700,
                cursor: "pointer", color: "#475569",
              }}>
              ↻ Actualizar
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
                  {["Tipo","Título","Efecto","Duración","Estado","Audio","Fecha"].map(h => (
                    <th key={h} style={{
                      padding: "8px 14px", textAlign: "left", fontWeight: 800,
                      color: "#94a3b8", textTransform: "uppercase",
                      fontSize: 9, letterSpacing: ".08em", whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historial.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 32, textAlign: "center",
                    color: "#94a3b8" }}>Sin mensajes en este canal aún</td></tr>
                ) : historial.map(row => {
                  const tipo = TIPOS.find(t => t.id === row.tipo) || TIPOS[3];
                  return (
                    <tr key={row.id}
                      style={{ borderBottom: "1px solid #f8fafc" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                      onMouseLeave={e => e.currentTarget.style.background = ""}>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{ background: tipo.bg, color: tipo.text,
                          borderRadius: 20, padding: "2px 8px",
                          fontSize: 10, fontWeight: 700 }}>
                          {tipo.emoji} {tipo.label}
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px", fontWeight: 700, color: "#0f172a",
                        maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap" }}>
                        {row.titulo || "—"}
                      </td>
                      <td style={{ padding: "9px 14px", color: "#64748b" }}>
                        {EFECTOS.find(e => e.id === row.efecto)?.emoji || "—"}
                      </td>
                      <td style={{ padding: "9px 14px", color: "#64748b" }}>{row.duracion}s</td>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "2px 8px",
                          background: row.enviado ? "#d1fae5" : "#fef9c3",
                          color:      row.enviado ? "#065f46" : "#854d0e",
                        }}>
                          {row.enviado ? "✓ Enviado" : "⏳ Pendiente"}
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px", color: "#64748b" }}>
                        {row.audio_url ? "🎵" : "—"}
                      </td>
                      <td style={{ padding: "9px 14px", color: "#64748b",
                        fontSize: 10, whiteSpace: "nowrap" }}>
                        {new Date(row.created_at).toLocaleString("es-EC", {
                          timeZone: "America/Guayaquil",
                          day: "2-digit", month: "short",
                          hour: "2-digit", minute: "2-digit",
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
  );
}
