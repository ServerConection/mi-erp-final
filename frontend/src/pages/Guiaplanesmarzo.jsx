// src/pages/Guiaplanesmarzo.jsx  ·  ruta: /guia-planes
// ============================================================
// GUÍA DE PLANES — herramienta de ventas para asesores.
//
// Antes: los planes vivían hardcodeados en este archivo (arrays PLANES_*)
// y alguien tenía que editar código cada mes para actualizar precios y
// hasta el título ("ABRIL 2026" escrito a mano).
//
// Ahora: esta página SOLO lee /api/planes-catalogo — la misma tabla
// (catalogo_planes) que ya alimenta el formulario Nueva Venta y que se
// actualiza subiendo el Excel "PRECIOS <MES> MATERIAL ASESORES" desde
// /catalogo-planes. El título y el mes vigente salen solos del campo
// "vigencia" que se guarda al subir el archivo — no hay nada que tocar
// a mano nunca más.
//
// Solo ADMINISTRADOR ve el botón de carga aquí (ver PERFILES_ADMIN_UPLOAD).
// El endpoint de subida (/api/planes-catalogo/upload) sigue abierto a
// noAsesor como ya estaba para no romper el flujo de Supervisores/
// Analistas que lo usan para Nueva Venta — este módulo solo agrega un
// segundo punto de entrada, restringido, apuntando a la misma data.
// ============================================================

import { useState, useEffect, useRef } from "react";

const API = import.meta.env.VITE_API_URL;

// ============================================================
// ZONAS CON INSTALACIÓN GRATIS — dato geográfico estático, no viene
// del Excel de precios, se mantiene igual que antes.
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

// ============================================================
// HELPERS
// ============================================================
const fmt$ = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v))) ? "—" : `$${Number(v).toFixed(2)}`;
const fmtPct = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)) || Number(v) === 0) ? "—" : `${Math.round(Number(v) * 100)}%`;

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
  const [catalogo, setCatalogo]     = useState([]);
  const [vigencia, setVigencia]     = useState(null);
  const [cargando, setCargando]     = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [tipoSel, setTipoSel]       = useState(null);
  const [busqueda, setBusqueda]     = useState("");
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
        const tipos = [...new Set((d.data || []).map(c => c.tipo_plan))];
        setTipoSel(prev => (prev && tipos.includes(prev)) ? prev : (tipos[0] || null));
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

  const tipos = [...new Set(catalogo.map(c => c.tipo_plan))];
  const q = busqueda.trim().toLowerCase();
  const filas = catalogo
    .filter(c => c.tipo_plan === tipoSel)
    .filter(c => !q || `${c.plan_base} ${c.empaquetado} ${c.equipo || ""}`.toLowerCase().includes(q));
  const tieneProm = filas.some(f => f.tc_pvp != null || f.cta_pvp != null);
  const tieneVelocidad = filas.some(f => f.velocidad);

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
              Sube el Excel <strong>"PRECIOS &lt;MES&gt; MATERIAL ASESORES"</strong>. Reemplaza toda la guía y también
              los precios que usa el formulario <strong>Nueva Venta</strong> — es la misma lista.
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

        {/* ── Tabla de planes ── */}
        {!cargando && !errorCarga && catalogo.length > 0 && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ display: "flex", gap: 8, padding: "14px 16px", flexWrap: "wrap", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              {tipos.map(t => (
                <button key={t} onClick={() => setTipoSel(t)}
                  style={{ padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${t === tipoSel ? "#818cf8" : "rgba(255,255,255,0.12)"}`, background: t === tipoSel ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "transparent", color: "#fff" }}>
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
                      {tieneVelocidad && <td style={td}>{f.velocidad || "—"}</td>}
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

const th = { padding: "10px 12px", fontSize: 11, fontWeight: 800, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: ".05em", textAlign: "left", background: "rgba(99,102,241,0.08)", borderBottom: "1.5px solid rgba(99,102,241,0.25)", whiteSpace: "nowrap" };
const td = { padding: "9px 12px", fontSize: 12.5, color: "#e2e8f0", borderBottom: "1px solid rgba(255,255,255,0.06)", verticalAlign: "top" };
