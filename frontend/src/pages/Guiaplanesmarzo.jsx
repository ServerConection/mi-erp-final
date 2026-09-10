// src/pages/Guiaplanesmarzo.jsx  ·  ruta: /guia-planes
// ============================================================
// GUÍA DE PLANES — herramienta de ventas para asesores.
//
// Dos modos, un mismo dato:
//   🧠 ASESOR INTELIGENTE — wizard de preguntas (para quién es, cuántos
//      usuarios, cuánto puede pagar...) que recomienda planes y da
//      argumentos de venta. Es el modo "didáctico" que existía hasta
//      julio 2026, cuando los planes vivían hardcodeados en este archivo.
//   🔍 EXPLORAR PLANES — tabla completa, filtrable por tipo.
//
// Desde agosto 2026 los planes YA NO están hardcodeados: ambos modos leen
// /api/planes-catalogo — la misma tabla (catalogo_planes) que alimenta el
// formulario Nueva Venta y que se actualiza subiendo el Excel
// "PRECIOS <MES> MATERIAL ASESORES" desde este módulo. El título y el mes
// vigente salen solos del campo "vigencia" — no hay nada que tocar a mano.
//
// Solo ADMINISTRADOR ve el botón de carga (ver PERFILES_ADMIN_UPLOAD).
// ============================================================

import { useState, useEffect, useRef, useMemo } from "react";

const API = import.meta.env.VITE_API_URL;

// ============================================================
// ZONAS CON INSTALACIÓN GRATIS — dato geográfico estático, no viene
// del Excel de precios.
// ============================================================
const ZONAS_CERO = [
  "El Oro", "Machala", "Balsas", "Marcabeli", "Piñas", "Portovelo", "Zaruma",
  "Guayas", "Daule", "Duran", "Milagro", "Samborondon", "Coronel Marcelino Maridueña",
  "Manabi", "24 de Mayo", "Manta", "Portoviejo", "Rocafuerte", "Santa Ana", "Chone", "Jipijapa",
  "Los Rios", "Quinsaloma", "Vinces", "Salinas",
  "Santa Elena",
  "Cotopaxi", "Latacunga", "Salcedo",
  "Loja", "Calvas", "Celica", "Chaguarpamba",
  "Imbabura", "Antonio Ante", "Cotacachi", "Ibarra", "Otavalo", "San Miguel de Urcuchi",
  "Azuay", "Cuenca", "Nabon", "Oña", "San Fernando",
  "Carchi", "Bolivar", "Montufar", "Tulcán",
  "Bolivar", "Montufar",
  "Chimborazo", "Alausí", "Chambo", "Chunchi", "Colta", "Guamote", "Guano", "Riobamba",
  "Tungurahua", "Ambato", "Baños de Agua Santa", "Cevallos", "Mocha", "Patate", "Quero", "San Pedro de Pelileo",
  "Cañar",
  "Napo", "Tena", "Mera",
  "Pichincha",
  "Quito", "Rumiñahui", "Iñaquito", "Cumbaya", "Calderon", "San Juan", "Carapungo", "Kennedy",
  "Conocoto", "Carcelen", "Puengasi", "Ponceano", "Belisario Quevedo", "Cochapamba", "Cotocollao",
  "La Concepcion", "Tumbaco", "La Magdalena", "Mariscal Sucre", "Pomasqui", "San Isidro del Inca",
  "Nayon", "Puembo", "Alangasi", "Zambiza", "Gungopolo", "La Merced", "Itchimbia", "Amaguaña",
  "San Antonio", "Sangolqui", "Rumipamba", "La Floresta",
  "Morona Santiago", "Pastaza"
];

// Usos de internet — alimenta la pregunta "multicheck" del wizard y el
// cálculo de velocidad recomendada.
const USOS_INTERNET = {
  streaming:     { label: "Streaming / Netflix", icon: "🎬", minVel: 25,  ideal: 100 },
  teletrabajo:   { label: "Teletrabajo",         icon: "💼", minVel: 50,  ideal: 200 },
  gamers:        { label: "Gaming Online",       icon: "🎮", minVel: 50,  ideal: 300 },
  videollamadas: { label: "Videollamadas",       icon: "📹", minVel: 10,  ideal: 50  },
  smartHome:     { label: "Smart Home IoT",      icon: "🏠", minVel: 100, ideal: 500 },
  descarga:      { label: "Descargas Masivas",   icon: "⬇️", minVel: 200, ideal: 500 },
};

// Paleta para las tarjetas de resultado del asesor — el catálogo dinámico
// (viene del Excel) no trae color ni badge como los arrays hardcodeados de
// antes, así que se asignan por posición.
const PALETA = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#a855f7"];

const TIPO_A_CATALOGO = { hogar: "HOME", pyme: "PYME", gamer: "GAMER", tercera_edad: "TERCERA EDAD" };
const TIPO_LABEL = { hogar: "HOGAR", pyme: "NEGOCIO", gamer: "GAMING", tercera_edad: "TERCERA EDAD" };

// ============================================================
// HELPERS
// ============================================================
const fmt$ = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v))) ? "—" : `$${Number(v).toFixed(2)}`;
const fmtPct = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)) || Number(v) === 0) ? "—" : `${Math.round(Number(v) * 100)}%`;

// El catálogo trae la velocidad como texto ("400 Mbps", a veces vacío/null
// para GAMER, que no la reporta en el Excel). Esto extrae el número.
const velNum = (v) => {
  const m = String(v ?? "").match(/\d+/);
  return m ? Number(m[0]) : null;
};
const velLabel = (v) => {
  const n = velNum(v);
  if (n == null) return v || "—";
  return n >= 1000 ? `${(n / 1000).toFixed(1)} Gbps` : `${n} Mbps`;
};
const speedBar = (v, max = 2000) => {
  const n = velNum(v);
  if (n == null) return 30;
  return Math.min(100, Math.max(6, (n / max) * 100));
};

// En HOME/TERCERA EDAD la velocidad real viene embebida en el nombre del
// plan ("Plan 850 Mbps"); la columna "velocidad" del catálogo para esas
// filas es en realidad el tipo de conexión (Simétrica/Asimétrica), no un
// número. GAMER/PYME/PRO sí traen la velocidad directa en esa columna.
function megasDe(row) {
  const enNombre = String(row?.plan_base || "").match(/(\d+)\s*Mbps/i);
  if (enNombre) return Number(enNombre[1]);
  return velNum(row?.velocidad);
}
function tipoConexion(row) {
  if (velNum(row?.velocidad) != null) return null; // esa columna ya es el número
  return row?.velocidad || null; // "Simétrica" / "Asimétrica"
}
function megasLabel(n) {
  if (n == null) return "—";
  return n >= 1000 ? `${(n / 1000).toFixed(1)} Gbps` : `${n} Mbps`;
}

// Precio efectivo de una fila del catálogo según la forma de pago elegida.
// Solo HOME trae promos TC/Cuenta (columnas tc_pvp/cta_pvp); el resto de
// tipos siempre usa precio_con_iva, igual que en la versión de abril 2026.
function precioEfectivo(row, pago) {
  if (!row) return 0;
  if (row.tipo_plan === "HOME") {
    if (pago === "TC" && row.tc_pvp != null && Number(row.tc_dsto) > 0) return Number(row.tc_pvp);
    if (pago === "CCAH" && row.cta_pvp != null && Number(row.cta_dsto) > 0) return Number(row.cta_pvp);
  }
  return Number(row.precio_con_iva) || 0;
}

function nombrePlan(row) {
  if (row.empaquetado && row.empaquetado !== "Sin empaquetado") return `${row.plan_base} · ${row.empaquetado}`;
  return row.plan_base;
}

function usuarioActual() {
  try {
    const raw = localStorage.getItem("userProfile");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function GuiaPlanesMarzo() {
  const [panel, setPanel]           = useState("smart"); // smart | tabla
  const [catalogo, setCatalogo]     = useState([]);
  const [vigencia, setVigencia]     = useState(null);
  const [cargando, setCargando]     = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [expandZonas, setExpandZonas] = useState(false);

  const [subiendo, setSubiendo] = useState(false);
  const [alertUpload, setAlertUpload] = useState(null);
  const inputRef = useRef(null);

  const usuario = usuarioActual();
  const esAdmin = (usuario?.perfil || "").toUpperCase() === "ADMINISTRADOR";
  const token = localStorage.getItem("token");

  const cargar = async () => {
    setCargando(true);
    setErrorCarga("");
    try {
      const r = await fetch(`${API}/api/planes-catalogo`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.success) {
        setCatalogo(d.data || []);
        setVigencia(d.vigencia || null);
      } else {
        setErrorCarga(d.error || "No se pudo cargar la guía de planes.");
      }
    } catch {
      setErrorCarga("Error de conexión al cargar la guía de planes.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const subir = async (file) => {
    if (!file) return;
    setSubiendo(true);
    setAlertUpload(null);
    try {
      const fd = new FormData();
      fd.append("archivo", file);
      fd.append("vigencia", file.name.replace(/\.(xlsx|xlsm)$/i, ""));
      const r = await fetch(`${API}/api/planes-catalogo/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const d = await r.json();
      if (d.success) {
        setAlertUpload({ tipo: "ok", msg: `✅ Guía actualizada: ${d.total} opciones cargadas.` });
        cargar();
      } else {
        setAlertUpload({ tipo: "err", msg: d.error || "No se pudo procesar el archivo." });
      }
    } catch {
      setAlertUpload({ tipo: "err", msg: "Error de conexión al subir el archivo." });
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div style={{ fontFamily: "'Syne', 'DM Sans', system-ui, sans-serif", minHeight: "100vh", background: "#070b14", color: "#fff" }}>
      {/* HEADER */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
        borderBottom: "1px solid rgba(99,102,241,0.3)",
        padding: "0 24px",
      }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", borderRadius: 12, padding: "10px 14px", fontSize: 22 }}>⚡</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.5px", lineHeight: 1 }}>
                GUÍA DE PLANES {vigencia && <span style={{ color: "#818cf8" }}>· {vigencia}</span>}
              </div>
              <div style={{ fontSize: 10, color: "#6366f1", fontWeight: 700, letterSpacing: "0.15em", marginTop: 2 }}>NETLIFE · HERRAMIENTA DE VENTAS</div>
            </div>
          </div>

          {/* TAB SWITCHER */}
          <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 4, gap: 4, border: "1px solid rgba(255,255,255,0.08)" }}>
            <TabBtn active={panel === "smart"} onClick={() => setPanel("smart")} icon="🧠" label="ASESOR INTELIGENTE" />
            <TabBtn active={panel === "tabla"} onClick={() => setPanel("tabla")} icon="🔍" label="EXPLORAR PLANES" />
          </div>
        </div>
      </div>

      {/* BODY */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 24px 60px" }}>

        {/* ── Carga de Excel — SOLO ADMINISTRADOR ── */}
        {esAdmin && (
          <div style={{
            background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.3)",
            borderRadius: 16, padding: 20, marginBottom: 20,
          }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: "#c7d2fe", margin: "0 0 6px" }}>📤 Actualizar guía del mes (solo Administrador)</p>
            <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 14px", lineHeight: 1.5 }}>
              Sube el Excel <strong>"PRECIOS &lt;MES&gt; MATERIAL ASESORES"</strong>. Reemplaza toda la guía —el
              wizard del Asesor Inteligente y la tabla— y también los precios que usa el formulario
              <strong> Nueva Venta</strong>, porque es la misma lista.
            </p>
            <input ref={inputRef} type="file" accept=".xlsx,.xlsm" style={{ display: "none" }}
              onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ""; }} />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={subiendo}
              style={{ padding: "11px 20px", border: "none", borderRadius: 10, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: subiendo ? "wait" : "pointer", opacity: subiendo ? 0.7 : 1 }}
            >
              {subiendo ? "Procesando Excel…" : "📎 Seleccionar Excel de precios"}
            </button>
            {alertUpload && (
              <div style={{ marginTop: 14, borderRadius: 10, padding: "12px 16px", fontSize: 12.5, fontWeight: 600, background: alertUpload.tipo === "ok" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", border: `1px solid ${alertUpload.tipo === "ok" ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`, color: alertUpload.tipo === "ok" ? "#6ee7b7" : "#fca5a5" }}>
                {alertUpload.msg}
              </div>
            )}
          </div>
        )}

        {/* ── Estados de carga / error / vacío ── */}
        {cargando && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#64748b", fontSize: 13 }}>Cargando guía de planes…</div>
        )}
        {!cargando && errorCarga && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#fca5a5", fontSize: 13 }}>{errorCarga}</div>
        )}
        {!cargando && !errorCarga && catalogo.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#64748b", fontSize: 13 }}>
            Todavía no se ha cargado ninguna lista de precios este mes.
            {esAdmin ? " Subí el Excel arriba para activarla." : " Pídele a un administrador que suba el Excel del mes."}
          </div>
        )}

        {/* ── Contenido: wizard o tabla ── */}
        {!cargando && !errorCarga && catalogo.length > 0 && (
          panel === "smart" ? <PanelSmart catalogo={catalogo} /> : <PanelTabla catalogo={catalogo} />
        )}
      </div>

      {/* ZONAS CERO EXPANDIBLE - SIEMPRE VISIBLE AL PIE */}
      <div style={{
        background: "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(5,150,105,0.04))",
        border: "1px solid rgba(16,185,129,0.2)",
        borderRadius: 16,
        padding: "20px 24px",
        margin: "0 24px 24px",
        maxWidth: "1400px",
        marginLeft: "auto",
        marginRight: "auto"
      }}>
        <button onClick={() => setExpandZonas(!expandZonas)} style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "#10b981",
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: "0.05em",
          marginBottom: expandZonas ? 16 : 0
        }}>
          <span style={{ fontSize: 28 }}>📍</span>
          <div style={{ textAlign: "left" }}>
            <div>ZONAS CON INSTALACIÓN GRATIS (TODAS LAS FORMAS DE PAGO)</div>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginTop: 2 }}>
              {expandZonas ? "Mostrar menos ▲" : `${ZONAS_CERO.length} ciudades · Click para expandir ▼`}
            </div>
          </div>
        </button>

        {expandZonas && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 10,
            marginTop: 12
          }}>
            {ZONAS_CERO.map((zona, idx) => (
              <div key={idx} style={{
                background: "rgba(16,185,129,0.1)",
                border: "1px solid rgba(16,185,129,0.3)",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 12,
                color: "#e2e8f0",
                fontWeight: 600,
                textAlign: "center"
              }}>
                {zona}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{
      background: active ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "transparent",
      border: "none", borderRadius: 9, padding: "8px 18px", cursor: "pointer",
      color: active ? "#fff" : "#94a3b8", fontSize: 11, fontWeight: 800,
      letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 6,
      transition: "all 0.2s", boxShadow: active ? "0 4px 15px rgba(99,102,241,0.4)" : "none"
    }}>
      <span>{icon}</span>{label}
    </button>
  );
}

// ============================================================
// PANEL TABLA — el explorador completo (como estaba desde agosto 2026)
// ============================================================
function PanelTabla({ catalogo }) {
  const [tipoSel, setTipoSel] = useState(() => catalogo[0]?.tipo_plan || null);
  const [busqueda, setBusqueda] = useState("");

  const tipos = [...new Set(catalogo.map(c => c.tipo_plan))];
  const tipoActivo = tipos.includes(tipoSel) ? tipoSel : tipos[0];
  const q = busqueda.trim().toLowerCase();
  const filas = catalogo
    .filter(c => c.tipo_plan === tipoActivo)
    .filter(c => !q || `${c.plan_base} ${c.empaquetado} ${c.equipo || ""}`.toLowerCase().includes(q));
  const tieneProm = filas.some(f => f.tc_pvp != null || f.cta_pvp != null);
  const tieneVelocidad = filas.some(f => f.velocidad || megasDe(f) != null);

  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 8, padding: "14px 16px", flexWrap: "wrap", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        {tipos.map(t => (
          <button key={t} onClick={() => setTipoSel(t)}
            style={{ padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${t === tipoActivo ? "#818cf8" : "rgba(255,255,255,0.12)"}`, background: t === tipoActivo ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "transparent", color: "#fff" }}>
            {t} ({catalogo.filter(c => c.tipo_plan === t).length})
          </button>
        ))}
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="🔎 Buscar plan o servicio…"
          style={{ marginLeft: "auto", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#fff", minWidth: 200 }}
        />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Plan</th>
              <th style={th}>Servicio empaquetado</th>
              {tieneVelocidad && <th style={th}>Velocidad</th>}
              <th style={th}>Sin IVA</th>
              <th style={th}>Con IVA</th>
              {tieneProm && <>
                <th style={th}>Promo TC</th>
                <th style={th}>Promo Cuenta</th>
              </>}
              <th style={th}>Equipo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>
                <td style={{ ...td, fontWeight: 700 }}>{f.plan_base}</td>
                <td style={td}>{f.empaquetado}</td>
                {tieneVelocidad && <td style={td}>{megasLabel(megasDe(f))}{tipoConexion(f) ? ` · ${tipoConexion(f)}` : ""}</td>}
                <td style={td}>{fmt$(f.precio_sin_iva)}</td>
                <td style={{ ...td, fontWeight: 700, color: "#a5b4fc" }}>{fmt$(f.precio_con_iva)}</td>
                {tieneProm && <>
                  <td style={td}>{f.tc_pvp != null && Number(f.tc_dsto) > 0 ? `${fmt$(f.tc_pvp)} · ${fmtPct(f.tc_dsto)} × ${f.tc_facturas ?? "—"} fact.` : "—"}</td>
                  <td style={td}>{f.cta_pvp != null && Number(f.cta_dsto) > 0 ? `${fmt$(f.cta_pvp)} · ${fmtPct(f.cta_dsto)} × ${f.cta_facturas ?? "—"} fact.` : "—"}</td>
                </>}
                <td style={{ ...td, fontSize: 11.5, color: "#94a3b8" }}>{f.equipo || "—"}</td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "#64748b", padding: "24px 12px" }}>Sin resultados para esta búsqueda.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = { padding: "10px 12px", fontSize: 11, fontWeight: 800, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: ".05em", textAlign: "left", background: "rgba(99,102,241,0.08)", borderBottom: "1.5px solid rgba(99,102,241,0.25)", whiteSpace: "nowrap" };
const td = { padding: "9px 12px", fontSize: 12.5, color: "#e2e8f0", borderBottom: "1px solid rgba(255,255,255,0.06)", verticalAlign: "top" };

// ============================================================
// PANEL SMART — ASESOR INTELIGENTE (wizard de preguntas → recomendación)
// ============================================================
function PanelSmart({ catalogo }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [resultado, setResultado] = useState(null);

  const PREGUNTAS = [
    {
      id: "tipo",
      pregunta: "¿Para quién es el internet?",
      subtitulo: "Esto define el portafolio correcto",
      tipo: "cards",
      opciones: [
        { valor: "hogar", label: "Mi Hogar", icon: "🏠", desc: "Casa / Familia", color: "#10b981" },
        { valor: "pyme", label: "Mi Negocio", icon: "🏢", desc: "Empresa / Local", color: "#3b82f6" },
        { valor: "gamer", label: "Gaming", icon: "🎮", desc: "Alta performance", color: "#f59e0b" },
        { valor: "tercera_edad", label: "Tercera Edad", icon: "👴", desc: "Descuento especial", color: "#ec4899" },
      ]
    },
    {
      id: "uso",
      pregunta: "¿Qué hace principalmente en internet?",
      subtitulo: "Selecciona todo lo que aplique",
      tipo: "multicheck",
      opciones: Object.entries(USOS_INTERNET).map(([k, v]) => ({ valor: k, label: v.label, icon: v.icon }))
    },
    {
      id: "personas",
      pregunta: "¿Cuántos usuarios/dispositivos simultáneos?",
      subtitulo: "Esto afecta directamente la velocidad necesaria",
      tipo: "cards",
      opciones: [
        { valor: 1, label: "1–2 personas", icon: "👤", desc: "Uso individual", color: "#10b981" },
        { valor: 3, label: "3–4 personas", icon: "👨‍👩‍👧", desc: "Familia pequeña", color: "#3b82f6" },
        { valor: 6, label: "5–6 personas", icon: "👨‍👩‍👧‍👦", desc: "Familia grande", color: "#f59e0b" },
        { valor: 10, label: "7+ / Oficina", icon: "🏢", desc: "Múltiples equipos", color: "#ef4444" },
      ]
    },
    {
      id: "pago",
      pregunta: "¿Tiene tarjeta de crédito?",
      subtitulo: "Accede a descuentos exclusivos con TC",
      tipo: "cards",
      opciones: [
        { valor: "TC", label: "Sí, Tarjeta de Crédito", icon: "💳", desc: "Mayor descuento", color: "#10b981" },
        { valor: "CCAH", label: "Cuenta o Débito", icon: "🏦", desc: "Descuento", color: "#3b82f6" },
        { valor: "EFECTIVO", label: "Efectivo", icon: "💵", desc: "Precio fijo", color: "#94a3b8" },
      ]
    },
    {
      id: "presupuesto",
      pregunta: "¿Cuánto puede pagar mensualmente? (con IVA)",
      subtitulo: "Precio final que pagaría",
      tipo: "slider",
      min: 14, max: 135, step: 1, default: 35
    },
  ];

  const preguntas = useMemo(() => {
    if (answers.tipo === "pyme") return [PREGUNTAS[0], PREGUNTAS[2], PREGUNTAS[4]];
    if (answers.tipo === "gamer") return [PREGUNTAS[0], PREGUNTAS[4]];
    if (answers.tipo === "tercera_edad") return [PREGUNTAS[0], PREGUNTAS[1], PREGUNTAS[2], PREGUNTAS[4]];
    return PREGUNTAS;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers.tipo]);

  const preguntaActual = preguntas[step];

  const velocidadNecesaria = (ans) => {
    const usos = ans.uso || [];
    const personas = ans.personas || 1;
    let base = 50;
    usos.forEach(u => { if (USOS_INTERNET[u]) base = Math.max(base, USOS_INTERNET[u].ideal); });
    return base * personas * 0.3;
  };

  const generarResultados = (ans) => {
    const tipo = ans.tipo || "hogar";
    const tipoCatalogo = TIPO_A_CATALOGO[tipo] || "HOME";
    const pago = ans.pago || "TC";
    const presupuesto = ans.presupuesto || 35;
    const velMin = velocidadNecesaria(ans);

    const base = catalogo.filter(r => r.tipo_plan === tipoCatalogo);

    let filtrados;
    if (tipo === "gamer") {
      // El Excel no reporta velocidad para GAMER — igual que en la versión
      // de abril 2026, aquí solo se filtra por presupuesto.
      filtrados = base.filter(r => precioEfectivo(r, pago) <= presupuesto * 1.1);
    } else if (tipo === "pyme") {
      filtrados = base.filter(r => {
        const v = megasDe(r);
        return precioEfectivo(r, pago) <= presupuesto * 1.15 && (v == null || v >= Math.max(velMin, 200));
      });
    } else {
      // hogar (HOME) y tercera_edad
      filtrados = base.filter(r => {
        const v = megasDe(r);
        return precioEfectivo(r, pago) <= presupuesto * 1.1 && (v == null || v >= velMin);
      });
    }

    if (filtrados.length === 0) {
      filtrados = [...base].sort((a, b) => precioEfectivo(a, pago) - precioEfectivo(b, pago)).slice(0, 3);
    }

    return filtrados.sort((a, b) => precioEfectivo(a, pago) - precioEfectivo(b, pago)).slice(0, 6);
  };

  const responder = (id, valor) => {
    const nuevas = { ...answers, [id]: valor };
    setAnswers(nuevas);
    if (step < preguntas.length - 1) {
      setStep(step + 1);
    } else {
      setResultado(generarResultados(nuevas));
      setStep(preguntas.length);
    }
  };

  const reiniciar = () => { setStep(0); setAnswers({}); setResultado(null); };

  if (resultado) {
    return <Resultado planes={resultado} answers={answers} onReset={reiniciar} />;
  }

  if (step >= preguntas.length || !preguntaActual) return null;

  const progreso = (step / preguntas.length) * 100;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* PROGRESS */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: "#6366f1", fontWeight: 800, letterSpacing: "0.1em" }}>PASO {step + 1} DE {preguntas.length}</span>
          <span style={{ fontSize: 11, color: "#475569", fontWeight: 700 }}>{Math.round(progreso)}% COMPLETADO</span>
        </div>
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 99, height: 4 }}>
          <div style={{ background: "linear-gradient(90deg,#6366f1,#8b5cf6)", borderRadius: 99, height: 4, width: `${progreso}%`, transition: "width 0.4s ease" }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "center" }}>
          {preguntas.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 24 : 8, height: 8, borderRadius: 99,
              background: i < step ? "#6366f1" : i === step ? "linear-gradient(90deg,#6366f1,#ec4899)" : "rgba(255,255,255,0.1)",
              transition: "all 0.3s"
            }} />
          ))}
        </div>
      </div>

      {/* QUESTION CARD */}
      <div style={{
        background: "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.05) 100%)",
        border: "1px solid rgba(99,102,241,0.2)", borderRadius: 20, padding: "36px 40px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)"
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h2 style={{ fontSize: 26, fontWeight: 900, marginBottom: 8, letterSpacing: "-0.5px" }}>{preguntaActual.pregunta}</h2>
          <p style={{ color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>{preguntaActual.subtitulo}</p>
        </div>

        {preguntaActual.tipo === "cards" && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${preguntaActual.opciones.length <= 2 ? 2 : 4}, 1fr)`, gap: 12 }}>
            {preguntaActual.opciones.map(op => (
              <button key={op.valor} onClick={() => responder(preguntaActual.id, op.valor)} style={{
                background: "rgba(255,255,255,0.03)", border: `2px solid rgba(255,255,255,0.08)`,
                borderRadius: 16, padding: "20px 12px", cursor: "pointer", transition: "all 0.2s",
                color: "#fff", textAlign: "center"
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = op.color; e.currentTarget.style.background = `${op.color}15`; e.currentTarget.style.transform = "translateY(-3px)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>{op.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{op.label}</div>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>{op.desc}</div>
              </button>
            ))}
          </div>
        )}

        {preguntaActual.tipo === "multicheck" && (
          <MultiCheck pregunta={preguntaActual} onDone={(vals) => responder(preguntaActual.id, vals)} />
        )}

        {preguntaActual.tipo === "slider" && (
          <SliderPregunta pregunta={preguntaActual} onDone={(val) => responder(preguntaActual.id, val)} />
        )}
      </div>

      {step > 0 && (
        <button onClick={() => setStep(step - 1)} style={{
          marginTop: 16, background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10, padding: "8px 20px", color: "#64748b", fontSize: 11,
          fontWeight: 700, cursor: "pointer", letterSpacing: "0.08em"
        }}>← VOLVER</button>
      )}
    </div>
  );
}

function MultiCheck({ pregunta, onDone }) {
  const [selected, setSelected] = useState([]);
  const toggle = (v) => setSelected(s => s.includes(v) ? s.filter(x => x !== v) : [...s, v]);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
        {pregunta.opciones.map(op => {
          const on = selected.includes(op.valor);
          return (
            <button key={op.valor} onClick={() => toggle(op.valor)} style={{
              background: on ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.03)",
              border: `2px solid ${on ? "#6366f1" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 12, padding: "14px 10px", cursor: "pointer", color: "#fff",
              display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s"
            }}>
              <span style={{ fontSize: 18 }}>{op.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700 }}>{op.label}</span>
              {on && <span style={{ marginLeft: "auto", color: "#6366f1", fontSize: 14 }}>✓</span>}
            </button>
          );
        })}
      </div>
      <button onClick={() => onDone(selected.length ? selected : ["streaming"])} style={{
        width: "100%", background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
        border: "none", borderRadius: 12, padding: "14px", color: "#fff",
        fontSize: 13, fontWeight: 800, cursor: "pointer", letterSpacing: "0.05em"
      }}>VER PLANES RECOMENDADOS →</button>
    </div>
  );
}

function SliderPregunta({ pregunta, onDone }) {
  const [val, setVal] = useState(pregunta.default);
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 52, fontWeight: 900, color: "#6366f1", letterSpacing: "-2px" }}>${val}</div>
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>DÓLARES / MES (CON IVA)</div>
      </div>
      <input type="range" min={pregunta.min} max={pregunta.max} step={pregunta.step} value={val}
        onChange={e => setVal(Number(e.target.value))}
        style={{ width: "100%", marginBottom: 24, accentColor: "#6366f1" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#475569", marginBottom: 24, fontWeight: 700 }}>
        <span>${pregunta.min} MÍNIMO</span>
        <span>${pregunta.max} MÁXIMO</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {[20, 30, 40, 50, 70, 100].map(v => (
          <button key={v} onClick={() => setVal(v)} style={{
            background: val === v ? "#6366f1" : "rgba(255,255,255,0.05)", border: `1px solid ${val === v ? "#6366f1" : "rgba(255,255,255,0.1)"}`,
            borderRadius: 8, padding: "6px 14px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer"
          }}>${v}</button>
        ))}
      </div>
      <button onClick={() => onDone(val)} style={{
        width: "100%", background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
        border: "none", borderRadius: 12, padding: "14px", color: "#fff",
        fontSize: 13, fontWeight: 800, cursor: "pointer"
      }}>VER MIS PLANES RECOMENDADOS →</button>
    </div>
  );
}

// ============================================================
// RESULTADO DEL ASESOR
// ============================================================
function Resultado({ planes, answers, onReset }) {
  const [selected, setSelected] = useState(null);
  const pago = answers.pago || "—";

  if (planes.length === 0) {
    return (
      <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center", padding: "60px 0" }}>
        <div style={{ fontSize: 15, color: "#94a3b8", marginBottom: 16 }}>
          No hay planes de {TIPO_LABEL[answers.tipo] || "este tipo"} cargados en la guía de este mes.
        </div>
        <button onClick={onReset} style={{
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10, padding: "8px 18px", color: "#94a3b8", fontSize: 11, fontWeight: 700, cursor: "pointer"
        }}>🔄 NUEVA CONSULTA</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: "#6366f1", fontWeight: 800, letterSpacing: "0.1em", marginBottom: 4 }}>
            PLANES RECOMENDADOS · {TIPO_LABEL[answers.tipo] || "HOGAR"}
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.5px" }}>
            {planes.length} plan{planes.length === 1 ? "" : "es"} perfecto{planes.length === 1 ? "" : "s"} para ti 🎯
          </h2>
          <p style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>
            Basado en tu perfil · Presupuesto ${answers.presupuesto}/mes · {pago}
          </p>
        </div>
        <button onClick={onReset} style={{
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10, padding: "8px 18px", color: "#94a3b8", fontSize: 11,
          fontWeight: 700, cursor: "pointer"
        }}>🔄 NUEVA CONSULTA</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, marginBottom: 24 }}>
        {planes.map((plan, idx) => (
          <PlanCard
            key={idx}
            plan={plan}
            idx={idx}
            tipo={answers.tipo}
            pago={pago}
            destacado={idx === 0}
            selected={selected === idx}
            onClick={() => setSelected(selected === idx ? null : idx)}
          />
        ))}
      </div>

      {selected !== null && (
        <PlanDetalle plan={planes[selected]} idx={selected} tipo={answers.tipo} pago={pago} />
      )}
    </div>
  );
}

// ============================================================
// PLAN CARD
// ============================================================
function PlanCard({ plan, idx, tipo, pago, destacado, selected, onClick }) {
  const color = PALETA[idx % PALETA.length];
  const precio = precioEfectivo(plan, pago);
  const precioNormal = Number(plan.precio_con_iva) || 0;
  const ahorro = precioNormal && precio < precioNormal ? (precioNormal - precio).toFixed(2) : null;
  const badge = destacado ? "⭐ MÁS RECOMENDADO" : ahorro ? "PROMO" : "PLAN";

  return (
    <div onClick={onClick} style={{
      background: selected
        ? `linear-gradient(135deg, ${color}25, ${color}10)`
        : destacado
        ? "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.06))"
        : "rgba(255,255,255,0.03)",
      border: `2px solid ${selected ? color : destacado ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.07)"}`,
      borderRadius: 18, padding: "20px", cursor: "pointer", transition: "all 0.25s", position: "relative",
      boxShadow: selected ? `0 8px 30px ${color}40` : "none"
    }}
    onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = color + "80"; }}
    onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = destacado ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.07)"; }}
    >
      {destacado && !selected && (
        <div style={{
          position: "absolute", top: -1, right: 16,
          background: "linear-gradient(90deg,#6366f1,#8b5cf6)",
          fontSize: 9, fontWeight: 900, padding: "4px 10px", borderRadius: "0 0 8px 8px",
          letterSpacing: "0.1em", color: "#fff"
        }}>⭐ MÁS RECOMENDADO</div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{
          background: `${color}20`, border: `1px solid ${color}40`,
          borderRadius: 8, padding: "3px 8px", fontSize: 9, fontWeight: 800,
          color: color, letterSpacing: "0.08em"
        }}>{badge}</div>
        {ahorro && (
          <div style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, padding: "3px 8px", fontSize: 9, fontWeight: 800, color: "#10b981" }}>
            AHORRA ${ahorro}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 4, lineHeight: 1.3 }}>{nombrePlan(plan)}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: color, letterSpacing: "-1px", lineHeight: 1 }}>
            {megasLabel(megasDe(plan))}
          </div>
          <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, lineHeight: 1.3 }}>
            {tipoConexion(plan) && <>{tipoConexion(plan)}<br/></>}FIBRA<br/>ÓPTICA
          </div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 99, height: 4, marginBottom: 8 }}>
          <div style={{
            background: `linear-gradient(90deg, ${color}, ${color}80)`,
            borderRadius: 99, height: 4, width: `${speedBar(megasDe(plan))}%`, transition: "width 0.5s"
          }} />
        </div>
      </div>

      <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 12, padding: "12px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, marginBottom: 2 }}>
              {ahorro ? `PRECIO ${pago === "TC" ? "PROMO TC" : "CON DCTO"}` : "PRECIO MENSUAL"}
            </div>
            <div style={{ fontSize: 30, fontWeight: 900, color: "#fff", letterSpacing: "-1px", lineHeight: 1 }}>
              ${precio.toFixed(2)}
            </div>
            <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>CON IVA · MENSUAL</div>
          </div>
          {ahorro && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, color: "#475569" }}>PRECIO NORMAL</div>
              <div style={{ fontSize: 14, color: "#475569", textDecoration: "line-through" }}>
                ${precioNormal.toFixed(2)}
              </div>
            </div>
          )}
        </div>
      </div>

      {plan.equipo && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 14 }}>📡</span>
          <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>{plan.equipo}</span>
        </div>
      )}

      <div style={{ fontSize: 10, color: color, fontWeight: 700, textAlign: "center", marginTop: 8, opacity: 0.8 }}>
        {selected ? "▲ VER MENOS" : "▼ VER DETALLE COMPLETO"}
      </div>
    </div>
  );
}

// ============================================================
// PLAN DETALLE EXPANDIDO
// ============================================================
function PlanDetalle({ plan, idx, tipo, pago }) {
  const color = PALETA[idx % PALETA.length];
  const precio = precioEfectivo(plan, pago);
  const facturas = pago === "TC" ? plan.tc_facturas : pago === "CCAH" ? plan.cta_facturas : null;
  const dsto = pago === "TC" ? plan.tc_dsto : pago === "CCAH" ? plan.cta_dsto : null;

  return (
    <div style={{
      background: `linear-gradient(135deg, ${color}15, rgba(0,0,0,0.5))`,
      border: `1px solid ${color}40`, borderRadius: 20, padding: "28px",
      marginTop: 8, animation: "fadeIn 0.3s ease"
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24 }}>
        <div>
          <div style={{ fontSize: 10, color: color, fontWeight: 800, letterSpacing: "0.1em", marginBottom: 12 }}>DETALLES DEL PLAN</div>
          <Row icon="⚡" label="Velocidad" value={megasLabel(megasDe(plan))} />
          <Row icon="🔄" label="Categoría" value={plan.tipo_plan} />
          {tipoConexion(plan) && <Row icon="🔀" label="Conexión" value={tipoConexion(plan)} />}
          <Row icon="📡" label="Equipo" value={plan.equipo || "—"} />
          {facturas > 0 && <Row icon="📅" label="Facturas con dcto" value={`${facturas} meses`} />}
          {dsto > 0 && <Row icon="🏷️" label="Descuento" value={fmtPct(dsto)} />}
        </div>

        <div>
          <div style={{ fontSize: 10, color: color, fontWeight: 800, letterSpacing: "0.1em", marginBottom: 12 }}>PRECIOS</div>
          {plan.precio_sin_iva != null && <Row icon="💰" label="Sin IVA" value={fmt$(plan.precio_sin_iva)} />}
          <Row icon="💰" label="Con IVA (normal)" value={fmt$(plan.precio_con_iva)} />
          {dsto > 0 && (
            <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 10, padding: "10px 12px", marginTop: 8 }}>
              <div style={{ fontSize: 9, color: "#10b981", fontWeight: 800, marginBottom: 2 }}>PRECIO PROMO</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#10b981" }}>${precio.toFixed(2)}</div>
              <div style={{ fontSize: 9, color: "#64748b" }}>POR {facturas || "—"} FACTURAS</div>
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 10, color: color, fontWeight: 800, letterSpacing: "0.1em", marginBottom: 12 }}>💬 ARGUMENTOS DE VENTA</div>
          <ArgVenta velocidad={megasDe(plan)} tipo={tipo} precio={precio} plan={plan} dsto={dsto} />
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 9, color: "#475569", fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 600 }}>{value}</div>
      </div>
    </div>
  );
}

function ArgVenta({ velocidad, tipo, precio, plan, dsto }) {
  const args = [];
  const v = velNum(velocidad);
  if (v != null) {
    if (v >= 1000) args.push("🔥 Velocidad GIGABIT — el tope del mercado");
    else if (v >= 500) args.push("⚡ Alta velocidad para toda la familia simultánea");
    else args.push("✅ Velocidad ideal para uso cotidiano");
  }

  if (precio < 25) args.push("💵 Precio más accesible del portafolio");
  else if (precio < 35) args.push("💰 Excelente relación velocidad / precio");
  else if (precio < 60) args.push("🏆 Plan premium con servicios adicionales incluidos");

  if (tipo === "gamer") args.push("🎮 NAT Abierto — 0 lag en partidas online");
  if (tipo === "tercera_edad") args.push("👴 Precio especial para tercera edad");
  if (tipo === "pyme") args.push("🏢 Pensado para empresas — garantía de servicio");

  if (plan.empaquetado && plan.empaquetado !== "Sin empaquetado") args.push(`🎁 Incluye: ${plan.empaquetado}`);
  if (Number(dsto) >= 0.4) args.push("🏷️ Descuento MÁXIMO disponible con esta forma de pago");

  return (
    <div>
      {args.slice(0, 4).map((a, i) => (
        <div key={i} style={{
          background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "7px 10px",
          marginBottom: 6, fontSize: 10, color: "#cbd5e1", lineHeight: 1.4
        }}>{a}</div>
      ))}
    </div>
  );
}
