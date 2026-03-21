// src/pages/BroadcastPanel.jsx
import { useEffect, useState, useRef } from "react";

const API = import.meta.env.VITE_API_URL;

const TIPOS = [
  { id: "urgente",      label: "🚨 Urgente",      bg: "#fee2e2", border: "#ef4444", text: "#991b1b" },
  { id: "prevencion",   label: "⚠️ Prevención",   bg: "#fef9c3", border: "#eab308", text: "#854d0e" },
  { id: "logro",        label: "🏆 Logro",         bg: "#d1fae5", border: "#10b981", text: "#065f46" },
  { id: "info",         label: "📢 Información",   bg: "#dbeafe", border: "#3b82f6", text: "#1e40af" },
  { id: "personalizado",label: "✨ Personalizado", bg: "#f3e8ff", border: "#a855f7", text: "#6b21a8" },
];

const EFECTOS = [
  { id: "ninguno",    label: "Sin efecto" },
  { id: "confeti",    label: "🎊 Confeti" },
  { id: "fuego",      label: "🔥 Fuego" },
  { id: "alertaroja", label: "🚨 Alerta roja" },
  { id: "nieve",      label: "❄️ Nieve" },
  { id: "estrellas",  label: "⭐ Estrellas" },
];

const SONIDOS = [
  { id: "ninguno",  label: "Sin sonido" },
  { id: "chime",    label: "🔔 Chime suave" },
  { id: "alerta",   label: "🚨 Alerta urgente" },
  { id: "victoria", label: "🏆 Fanfarria" },
  { id: "error",    label: "❌ Error / Atención" },
];

const DATOS_VIVOS = [
  { id: "",              label: "Sin datos en vivo" },
  { id: "top_asesores",  label: "🥇 Top asesores del día (Jot)" },
  { id: "top_activas",   label: "✅ Top asesores activas" },
  { id: "sin_ventas",    label: "📉 Asesores sin ventas hoy" },
  { id: "gestion_diaria",label: "⚠️ Asesores en Gestión Diaria" },
  { id: "resumen_dia",   label: "📊 Resumen general del día" },
];

// Colores de fondo predefinidos
const FONDOS = [
  "#0f172a","#1e3a5f","#064e3b","#7c2d12","#4c1d95","#1a1a2e",
  "#0d1b2a","#2d1b69","#1a0a00","#0a0f1e",
];

export default function BroadcastPanel() {
  const [form, setForm] = useState({
    tipo:          "info",
    titulo:        "",
    mensaje:       "",
    efecto:        "ninguno",
    sonido:        "chime",
    duracion:      30,
    datos_vivos:   "",
    programado:    false,
    programado_para: "",
    color_fondo:   "#0f172a",
    color_texto:   "#ffffff",
  });
  const [imagen, setImagen]         = useState(null);
  const [preview, setPreview]       = useState(false);
  const [loading, setLoading]       = useState(false);
  const [historial, setHistorial]   = useState([]);
  const [datosVivos, setDatosVivos] = useState(null);
  const [tab, setTab]               = useState("crear"); // 'crear' | 'historial'
  const fileRef                     = useRef();

  const fetchHistorial = async () => {
    try {
      const r = await fetch(`${API}/api/broadcast/historial`);
      const d = await r.json();
      if (d.success) setHistorial(d.data);
    } catch (_) {}
  };

  const fetchDatosVivos = async () => {
    try {
      const r = await fetch(`${API}/api/broadcast/datos-vivos`);
      const d = await r.json();
      if (d.success) setDatosVivos(d);
    } catch (_) {}
  };

  useEffect(() => { fetchHistorial(); fetchDatosVivos(); }, []);

  const handleImagen = (e) => {
    const file = e.target.files[0];
    if (file) setImagen(file);
  };

  const enviar = async () => {
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (imagen) fd.append("imagen", imagen);

      const endpoint = form.programado ? "/api/broadcast/programar" : "/api/broadcast/enviar";
      const r = await fetch(`${API}${endpoint}`, { method: "POST", body: fd });
      const d = await r.json();
      if (d.success) {
        alert(form.programado ? "✅ Mensaje programado correctamente" : "✅ Mensaje enviado a todas las pantallas");
        fetchHistorial();
      }
    } catch (e) { alert("Error al enviar: " + e.message); }
    finally { setLoading(false); }
  };

  const tipoActual = TIPOS.find(t => t.id === form.tipo) || TIPOS[0];

  const inputCls = {
    background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8,
    padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "#0f172a",
    outline: "none", width: "100%", boxSizing: "border-box",
  };
  const labelCls = {
    fontSize: 10, fontWeight: 800, color: "#64748b",
    textTransform: "uppercase", letterSpacing: ".1em",
    display: "block", marginBottom: 5,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: "24px 20px",
      fontFamily: "'DM Sans','Inter',system-ui,sans-serif", color: "#0f172a" }}>

      {/* ── HEADER ── */}
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ background: "#0f172a", color: "#fff", padding: "3px 10px",
              borderRadius: 5, fontSize: 10, fontWeight: 900,
              letterSpacing: ".12em", textTransform: "uppercase" }}>
              BROADCAST
            </span>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#0f172a",
              textTransform: "uppercase", letterSpacing: "-.01em" }}>
              Centro de Mensajes
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>
            Envía mensajes a todas las pantallas del ERP en tiempo real
          </p>
        </div>
        <a href="/tv" target="_blank"
          style={{ background: "#0f172a", color: "#fff", padding: "8px 16px",
            borderRadius: 8, fontSize: 10, fontWeight: 800, textDecoration: "none",
            textTransform: "uppercase", letterSpacing: ".06em" }}>
          📺 Abrir modo TV
        </a>
      </div>

      {/* ── TABS ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20,
        background: "#fff", padding: 4, borderRadius: 10,
        border: "1px solid #e2e8f0", width: "fit-content" }}>
        {[["crear","✏️ Crear mensaje"],["historial","📋 Historial"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding: "7px 18px", borderRadius: 7, border: "none",
              fontSize: 11, fontWeight: 800, cursor: "pointer",
              background: tab === id ? "#0f172a" : "transparent",
              color: tab === id ? "#fff" : "#64748b",
              transition: "all .15s" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "crear" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 20 }}>

          {/* ── FORMULARIO ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Tipo */}
            <div style={{ background: "#fff", borderRadius: 14, padding: "18px 20px",
              border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
              <label style={labelCls}>Tipo de mensaje</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {TIPOS.map(t => (
                  <button key={t.id} onClick={() => setForm(f => ({...f, tipo: t.id}))}
                    style={{
                      padding: "7px 14px", borderRadius: 20, border: `1.5px solid ${t.border}`,
                      background: form.tipo === t.id ? t.bg : "#fff",
                      color: form.tipo === t.id ? t.text : "#64748b",
                      fontSize: 11, fontWeight: 800, cursor: "pointer",
                      transition: "all .15s",
                      boxShadow: form.tipo === t.id ? `0 0 0 3px ${t.border}33` : "none",
                    }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Título y mensaje */}
            <div style={{ background: "#fff", borderRadius: 14, padding: "18px 20px",
              border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
              <div style={{ marginBottom: 14 }}>
                <label style={labelCls}>Título</label>
                <input style={inputCls} placeholder="Ej: ¡Felicitaciones equipo!"
                  value={form.titulo} onChange={e => setForm(f => ({...f, titulo: e.target.value}))} />
              </div>
              <div>
                <label style={labelCls}>Mensaje</label>
                <textarea style={{ ...inputCls, minHeight: 80, resize: "vertical" }}
                  placeholder="Escribe el mensaje que verán en pantalla..."
                  value={form.mensaje} onChange={e => setForm(f => ({...f, mensaje: e.target.value}))} />
              </div>
            </div>

            {/* Datos en vivo */}
            <div style={{ background: "#fff", borderRadius: 14, padding: "18px 20px",
              border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
              <label style={labelCls}>Datos en vivo de asesores</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {DATOS_VIVOS.map(d => (
                  <label key={d.id} style={{ display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                    background: form.datos_vivos === d.id ? "#f0f9ff" : "#f8fafc",
                    border: `1px solid ${form.datos_vivos === d.id ? "#0ea5e9" : "#f1f5f9"}` }}>
                    <input type="radio" name="datos_vivos"
                      checked={form.datos_vivos === d.id}
                      onChange={() => setForm(f => ({...f, datos_vivos: d.id}))}
                      style={{ accentColor: "#0ea5e9" }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{d.label}</span>
                  </label>
                ))}
              </div>
              {/* Preview datos vivos */}
              {form.datos_vivos && datosVivos && (
                <div style={{ marginTop: 12, padding: "10px 14px", background: "#f0f9ff",
                  borderRadius: 8, border: "1px solid #bae6fd" }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: "#0369a1",
                    textTransform: "uppercase", marginBottom: 6 }}>Preview datos actuales</div>
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
                  {form.datos_vivos === "top_activas" && datosVivos.topActivas?.slice(0,3).map((a,i) => (
                    <div key={i} style={{ fontSize: 11, color: "#0f172a", marginBottom: 2 }}>
                      {i+1}. {a.nombre} — {a.activas} activas
                    </div>
                  ))}
                  {form.datos_vivos === "resumen_dia" && datosVivos.resumen && (
                    <div style={{ fontSize: 11, color: "#0f172a" }}>
                      Ingresos: {datosVivos.resumen.ingresos_hoy} · Activas: {datosVivos.resumen.activas_hoy}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Efecto + Sonido */}
            <div style={{ background: "#fff", borderRadius: 14, padding: "18px 20px",
              border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,.04)",
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelCls}>Efecto visual</label>
                <select style={inputCls} value={form.efecto}
                  onChange={e => setForm(f => ({...f, efecto: e.target.value}))}>
                  {EFECTOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelCls}>Sonido</label>
                <select style={inputCls} value={form.sonido}
                  onChange={e => setForm(f => ({...f, sonido: e.target.value}))}>
                  {SONIDOS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            </div>

            {/* Imagen + Colores + Duración */}
            <div style={{ background: "#fff", borderRadius: 14, padding: "18px 20px",
              border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 14 }}>
                <div>
                  <label style={labelCls}>Duración (segundos)</label>
                  <input type="number" style={inputCls} min={5} max={300}
                    value={form.duracion}
                    onChange={e => setForm(f => ({...f, duracion: e.target.value}))} />
                </div>
                <div>
                  <label style={labelCls}>Color de fondo</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                    {FONDOS.map(c => (
                      <div key={c} onClick={() => setForm(f => ({...f, color_fondo: c}))}
                        style={{ width: 24, height: 24, borderRadius: 6, background: c, cursor: "pointer",
                          border: form.color_fondo === c ? "2px solid #0ea5e9" : "2px solid transparent" }} />
                    ))}
                    <input type="color" value={form.color_fondo}
                      onChange={e => setForm(f => ({...f, color_fondo: e.target.value}))}
                      style={{ width: 24, height: 24, borderRadius: 6, border: "none",
                        cursor: "pointer", padding: 0 }} />
                  </div>
                </div>
                <div>
                  <label style={labelCls}>Color de texto</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                    {["#ffffff","#fbbf24","#34d399","#f87171","#60a5fa","#0f172a"].map(c => (
                      <div key={c} onClick={() => setForm(f => ({...f, color_texto: c}))}
                        style={{ width: 24, height: 24, borderRadius: 6, background: c, cursor: "pointer",
                          border: form.color_texto === c ? "2px solid #0ea5e9" : "1px solid #e2e8f0" }} />
                    ))}
                    <input type="color" value={form.color_texto}
                      onChange={e => setForm(f => ({...f, color_texto: e.target.value}))}
                      style={{ width: 24, height: 24, borderRadius: 6, border: "none",
                        cursor: "pointer", padding: 0 }} />
                  </div>
                </div>
              </div>

              {/* Imagen */}
              <div>
                <label style={labelCls}>Imagen adjunta (opcional)</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button onClick={() => fileRef.current?.click()}
                    style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8,
                      padding: "7px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                      color: "#475569" }}>
                    📎 Seleccionar imagen
                  </button>
                  {imagen && <span style={{ fontSize: 11, color: "#10b981" }}>✓ {imagen.name}</span>}
                  <input ref={fileRef} type="file" accept="image/*"
                    style={{ display: "none" }} onChange={handleImagen} />
                </div>
              </div>
            </div>

            {/* Programar */}
            <div style={{ background: "#fff", borderRadius: 14, padding: "18px 20px",
              border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10,
                cursor: "pointer", marginBottom: form.programado ? 12 : 0 }}>
                <input type="checkbox" checked={form.programado}
                  onChange={e => setForm(f => ({...f, programado: e.target.checked}))}
                  style={{ accentColor: "#0f172a", width: 16, height: 16 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
                  Programar para más tarde
                </span>
              </label>
              {form.programado && (
                <input type="datetime-local" style={inputCls}
                  value={form.programado_para}
                  onChange={e => setForm(f => ({...f, programado_para: e.target.value}))} />
              )}
            </div>

            {/* Botones */}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setPreview(true)}
                style={{ flex: 1, background: "#fff", border: "1px solid #e2e8f0",
                  borderRadius: 10, padding: "12px", fontSize: 12, fontWeight: 800,
                  cursor: "pointer", color: "#0f172a" }}>
                👁 Vista previa
              </button>
              <button onClick={enviar} disabled={loading}
                style={{ flex: 2, background: loading ? "#f1f5f9" : "#0f172a",
                  color: loading ? "#94a3b8" : "#fff",
                  border: "none", borderRadius: 10, padding: "12px",
                  fontSize: 12, fontWeight: 900, cursor: loading ? "default" : "pointer",
                  textTransform: "uppercase", letterSpacing: ".06em" }}>
                {loading ? "Enviando..." : form.programado ? "⏰ Programar" : "📡 Enviar ahora a todas las pantallas"}
              </button>
            </div>
          </div>

          {/* ── PREVIEW EN VIVO ── */}
          <div style={{ position: "sticky", top: 20 }}>
            <label style={{ ...labelCls, marginBottom: 10 }}>Vista previa en vivo</label>
            <div style={{
              width: "100%", aspectRatio: "16/9",
              background: form.color_fondo,
              borderRadius: 14, overflow: "hidden",
              border: `2px solid ${tipoActual.border}`,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              padding: "20px", position: "relative",
              boxShadow: "0 4px 24px rgba(0,0,0,.15)",
            }}>
              {imagen && (
                <img src={URL.createObjectURL(imagen)} alt=""
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
                    objectFit: "cover", opacity: .3 }} />
              )}
              <div style={{ position: "relative", zIndex: 1, textAlign: "center", width: "100%" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>
                  {tipoActual.label.split(" ")[0]}
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: form.color_texto,
                  textTransform: "uppercase", letterSpacing: ".04em", lineHeight: 1.1,
                  marginBottom: 8, wordBreak: "break-word" }}>
                  {form.titulo || "TÍTULO DEL MENSAJE"}
                </div>
                <div style={{ fontSize: 12, color: form.color_texto, opacity: .85,
                  lineHeight: 1.5, wordBreak: "break-word" }}>
                  {form.mensaje || "El mensaje aparecerá aquí..."}
                </div>
                {form.datos_vivos && (
                  <div style={{ marginTop: 12, padding: "8px 12px",
                    background: "rgba(255,255,255,.15)", borderRadius: 8,
                    fontSize: 10, color: form.color_texto, opacity: .8 }}>
                    📊 Datos en vivo: {DATOS_VIVOS.find(d => d.id === form.datos_vivos)?.label}
                  </div>
                )}
              </div>
              {/* Barra de duración */}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
                height: 3, background: "rgba(255,255,255,.2)" }}>
                <div style={{ width: "60%", height: "100%",
                  background: tipoActual.border }} />
              </div>
            </div>

            {/* Info del mensaje */}
            <div style={{ marginTop: 12, background: "#fff", borderRadius: 10,
              padding: "12px 14px", border: "1px solid #e2e8f0",
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                ["Tipo", tipoActual.label],
                ["Efecto", EFECTOS.find(e => e.id === form.efecto)?.label],
                ["Sonido", SONIDOS.find(s => s.id === form.sonido)?.label],
                ["Duración", `${form.duracion}s`],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 8, fontWeight: 800, color: "#94a3b8",
                    textTransform: "uppercase", letterSpacing: ".1em" }}>{k}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#0f172a" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

      ) : (
        /* ── HISTORIAL ── */
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0",
          overflow: "hidden", boxShadow: "0 1px 8px rgba(0,0,0,.05)" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #f1f5f9",
            background: "#fafafa", display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase",
              letterSpacing: ".02em" }}>📋 Historial de mensajes</div>
            <button onClick={fetchHistorial}
              style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 6,
                padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
              ↻ Actualizar
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
                  {["Tipo","Título","Efecto","Duración","Programado","Estado","Fecha"].map(h => (
                    <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontWeight: 800,
                      color: "#94a3b8", textTransform: "uppercase", fontSize: 9,
                      letterSpacing: ".08em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historial.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 32, textAlign: "center",
                    color: "#94a3b8" }}>Sin mensajes enviados aún</td></tr>
                ) : historial.map(row => {
                  const tipo = TIPOS.find(t => t.id === row.tipo) || TIPOS[0];
                  return (
                    <tr key={row.id} style={{ borderBottom: "1px solid #f8fafc" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                      onMouseLeave={e => e.currentTarget.style.background = ""}>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{ background: tipo.bg, color: tipo.text,
                          borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>
                          {tipo.label}
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px", fontWeight: 700, maxWidth: 180,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.titulo || "—"}
                      </td>
                      <td style={{ padding: "9px 14px", color: "#64748b" }}>
                        {EFECTOS.find(e => e.id === row.efecto)?.label || "—"}
                      </td>
                      <td style={{ padding: "9px 14px", color: "#64748b" }}>{row.duracion}s</td>
                      <td style={{ padding: "9px 14px", color: "#64748b", fontSize: 10 }}>
                        {row.programado_para
                          ? new Date(row.programado_para).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })
                          : "Inmediato"}
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 20,
                          padding: "2px 8px",
                          background: row.enviado ? "#d1fae5" : "#fef9c3",
                          color: row.enviado ? "#065f46" : "#854d0e" }}>
                          {row.enviado ? "✓ Enviado" : "⏳ Pendiente"}
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px", color: "#64748b", fontSize: 10,
                        whiteSpace: "nowrap" }}>
                        {new Date(row.created_at).toLocaleString("es-EC",
                          { timeZone: "America/Guayaquil", day: "2-digit",
                            month: "short", hour: "2-digit", minute: "2-digit" })}
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