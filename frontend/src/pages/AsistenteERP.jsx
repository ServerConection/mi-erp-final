/**
 * AsistenteERP.jsx — Chat que responde preguntas con datos del ERP.
 * Ej: "¿Quién ha hecho más ventas hoy?", "¿Cuántos leads se crearon hoy?"
 */
import { useState, useEffect, useRef } from "react";

const API = `${import.meta.env.VITE_API_URL}/api/asistente`;
const authH = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
  "Content-Type": "application/json",
});

// Render simple de *negritas* y saltos de línea
const Texto = ({ t }) => (
  <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
    {String(t).split(/(\*[^*]+\*)/g).map((part, i) =>
      part.startsWith("*") && part.endsWith("*")
        ? <strong key={i}>{part.slice(1, -1)}</strong>
        : <span key={i}>{part}</span>
    )}
  </span>
);

export default function AsistenteERP() {
  const [mensajes, setMensajes] = useState([
    { rol: "bot", texto: "¡Hola! Soy el asistente del ERP 🤖. Pregúntame por ventas, leads, activas, gestión diaria y más. Escribe *ayuda* para ver ejemplos." },
  ]);
  const [input, setInput]           = useState("");
  const [enviando, setEnviando]     = useState(false);
  const [sugerencias, setSugerencias] = useState([]);
  // Base de conocimiento: preguntas de PROCESO (requisitos, estados del
  // cliente, descuentos). Se puede hojear sin preguntar nada — es el manual
  // que hoy vive en la cabeza de un supervisor.
  const [faq, setFaq] = useState([]);
  const [faqAbierto, setFaqAbierto] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/sugerencias`, { headers: authH() })
      .then(r => r.json())
      .then(d => setSugerencias(Array.isArray(d?.data) ? d.data : []))
      .catch(() => {});
    fetch(`${API}/faq`, { headers: authH() })
      .then(r => r.json())
      .then(d => setFaq(Array.isArray(d?.data) ? d.data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  const preguntar = async (texto) => {
    const pregunta = (texto ?? input).trim();
    if (!pregunta || enviando) return;
    setInput("");
    setMensajes(prev => [...prev, { rol: "user", texto: pregunta }]);
    setEnviando(true);
    try {
      const r = await fetch(`${API}/preguntar`, {
        method: "POST", headers: authH(),
        body: JSON.stringify({ pregunta }),
      });
      const d = await r.json();
      setMensajes(prev => [...prev, {
        rol: "bot",
        texto: d?.respuesta || d?.error || "No pude obtener una respuesta. Intenta de nuevo.",
      }]);
    } catch {
      setMensajes(prev => [...prev, { rol: "bot", texto: "Error de conexión con el servidor. Intenta de nuevo." }]);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", height: "calc(100vh - 120px)" }}>
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#1e293b", margin: 0 }}>🧠 Asistente ERP</h1>
        <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "4px 0 0" }}>
          Responde solo con datos del ERP, en tiempo real.
        </p>
      </div>

      {/* Mensajes */}
      <div style={{
        flex: 1, overflowY: "auto", background: "#f8fafc",
        border: "1px solid #e2e8f0", borderRadius: 14, padding: "1rem",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        {mensajes.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.rol === "user" ? "flex-end" : "flex-start",
            maxWidth: "80%",
            background: m.rol === "user" ? "#2563eb" : "#ffffff",
            color: m.rol === "user" ? "#fff" : "#1e293b",
            border: m.rol === "user" ? "none" : "1px solid #e2e8f0",
            borderRadius: m.rol === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
            padding: "0.6rem 0.85rem", fontSize: "0.85rem", lineHeight: 1.5,
            boxShadow: "0 1px 2px rgba(0,0,0,.04)",
          }}>
            <Texto t={m.texto} />
          </div>
        ))}
        {enviando && (
          <div style={{ alignSelf: "flex-start", color: "#94a3b8", fontSize: "0.8rem", padding: "0.4rem 0.85rem" }}>
            Consultando datos…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Preguntas frecuentes (base de conocimiento) */}
      {faq.length > 0 && (
        <div style={{ margin: "10px 0" }}>
          <button
            onClick={() => setFaqAbierto(a => !a)}
            style={{
              fontSize: "0.72rem", fontWeight: 700, padding: "0.35rem 0.8rem",
              borderRadius: 999, border: "1px solid #1A3A6E", background: faqAbierto ? "#1A3A6E" : "#fff",
              color: faqAbierto ? "#fff" : "#1A3A6E", cursor: "pointer",
            }}>
            {faqAbierto ? "▾" : "▸"} Preguntas frecuentes ({faq.length})
          </button>

          {faqAbierto && (
            <div style={{ marginTop: 8, maxHeight: 260, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 12, padding: 8, background: "#f8fafc" }}>
              {[...new Set(faq.map(f => f.categoria))].map(cat => (
                <div key={cat} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#1A3A6E", margin: "4px 2px" }}>
                    {cat}
                  </div>
                  {faq.filter(f => f.categoria === cat).map(f => (
                    <button
                      key={f.id}
                      onClick={() => { setFaqAbierto(false); preguntar(f.pregunta); }}
                      disabled={enviando}
                      style={{
                        display: "block", width: "100%", textAlign: "left", fontSize: "0.72rem",
                        padding: "0.35rem 0.6rem", borderRadius: 8, border: "1px solid transparent",
                        background: "transparent", color: "#334155", cursor: "pointer",
                      }}>
                      {f.pregunta}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sugerencias */}
      {sugerencias.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0" }}>
          {sugerencias.map((s, i) => (
            <button key={i} onClick={() => preguntar(s)} disabled={enviando}
              style={{
                fontSize: "0.72rem", padding: "0.3rem 0.7rem", borderRadius: 999,
                border: "1px solid #cbd5e1", background: "#fff", color: "#475569",
                cursor: "pointer",
              }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ display: "flex", gap: 8, marginTop: sugerencias.length ? 0 : 10 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && preguntar()}
          placeholder="Pregunta algo… ej: ¿quién ha hecho más ventas hoy?"
          style={{
            flex: 1, padding: "0.65rem 0.9rem", borderRadius: 12,
            border: "1px solid #cbd5e1", fontSize: "0.85rem", outline: "none",
          }}
        />
        <button onClick={() => preguntar()} disabled={enviando || !input.trim()}
          style={{
            padding: "0.65rem 1.2rem", borderRadius: 12, border: "none",
            background: enviando || !input.trim() ? "#cbd5e1" : "#2563eb",
            color: "#fff", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
          }}>
          Enviar
        </button>
      </div>
    </div>
  );
}
