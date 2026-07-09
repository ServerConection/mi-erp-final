// src/pages/CatalogoPlanes.jsx
// Administración del catálogo mensual de planes y precios.
// Un admin/supervisor sube aquí el Excel "PRECIOS <MES> MATERIAL ASESORES"
// y el sistema reemplaza el catálogo que alimenta el formulario Nueva Venta.

import { useState, useEffect, useRef } from "react";

const API = import.meta.env.VITE_API_URL;
const O = "#FF6B00", OP = "#FFF3E8", OB = "#FFCBA0";

const fmt$ = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v))) ? "—" : `$${Number(v).toFixed(2)}`;
const fmtPct = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)) || Number(v) === 0) ? "—" : `${Math.round(Number(v) * 100)}%`;

export default function CatalogoPlanes() {
  const [catalogo, setCatalogo] = useState([]);
  const [vigencia, setVigencia] = useState(null);
  const [tipoSel, setTipoSel]   = useState("HOME");
  const [subiendo, setSubiendo] = useState(false);
  const [alert, setAlert]       = useState(null);
  const inputRef = useRef(null);
  const token = localStorage.getItem("token");

  const cargar = async () => {
    try {
      const r = await fetch(`${API}/api/planes-catalogo`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.success) { setCatalogo(d.data || []); setVigencia(d.vigencia || null); }
    } catch { /* noop */ }
  };
  useEffect(() => { cargar(); }, []);

  const subir = async (file) => {
    if (!file) return;
    setSubiendo(true); setAlert(null);
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
        setAlert({ tipo: "ok", msg: `✅ Catálogo actualizado: ${d.total} opciones cargadas. ${Object.entries(d.resumen).map(([h, v]) => `${h}: ${v}`).join(" · ")}` });
        cargar();
      } else {
        setAlert({ tipo: "err", msg: d.error || "No se pudo procesar el archivo." });
      }
    } catch {
      setAlert({ tipo: "err", msg: "Error de conexión al subir el archivo." });
    } finally { setSubiendo(false); }
  };

  const tipos = [...new Set(catalogo.map(c => c.tipo_plan))];
  const filas = catalogo.filter(c => c.tipo_plan === tipoSel);
  const tieneProm = filas.some(f => f.tc_pvp != null || f.cta_pvp != null);

  const th = { padding: "10px 12px", fontSize: 11, fontWeight: 800, color: "#7C3A00", textTransform: "uppercase", letterSpacing: ".05em", textAlign: "left", background: OP, borderBottom: `1.5px solid ${OB}`, whiteSpace: "nowrap" };
  const td = { padding: "9px 12px", fontSize: 12.5, color: "#1C1C2E", borderBottom: "1px solid #FEF0E6", verticalAlign: "top" };

  return (
    <div style={{ minHeight: "100vh", background: "#FFF8F3", fontFamily: "'Inter','Segoe UI',sans-serif", padding: "28px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: O, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📊</div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: "#1C1C2E", margin: 0 }}>Catálogo de planes y precios</h1>
            <p style={{ fontSize: 12, color: "#A07850", margin: "2px 0 0", fontWeight: 600 }}>
              {vigencia ? `Lista vigente: ${vigencia}` : "Todavía no se ha cargado ninguna lista de precios"}
            </p>
          </div>
        </div>

        {/* Carga del Excel */}
        <div style={{ background: "#fff", border: `1.5px solid ${OB}`, borderRadius: 16, padding: 22, marginBottom: 18 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#6B3A1F", margin: "0 0 6px" }}>📤 Actualizar precios del mes</p>
          <p style={{ fontSize: 12, color: "#A07850", margin: "0 0 14px", lineHeight: 1.5 }}>
            Sube el Excel <strong>"PRECIOS &lt;MES&gt; MATERIAL ASESORES"</strong> con las pestañas HOME, TERCERA EDAD, GAMER, PRO y PYME.
            El catálogo anterior se reemplaza por completo y el formulario <strong>Nueva Venta</strong> empieza a usar los nuevos precios al instante.
          </p>
          <input ref={inputRef} type="file" accept=".xlsx,.xlsm" style={{ display: "none" }}
            onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ""; }} />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={subiendo}
            style={{ padding: "12px 22px", border: "none", borderRadius: 10, background: `linear-gradient(135deg, ${O}, #FF8533)`, color: "#fff", fontSize: 13.5, fontWeight: 800, cursor: subiendo ? "wait" : "pointer", opacity: subiendo ? 0.7 : 1 }}
          >
            {subiendo ? "Procesando Excel…" : "📎 Seleccionar Excel de precios"}
          </button>
          {alert && (
            <div style={{ marginTop: 14, borderRadius: 10, padding: "12px 16px", fontSize: 12.5, fontWeight: 600, background: alert.tipo === "ok" ? "#ECFDF5" : "#FEF2F2", border: `1px solid ${alert.tipo === "ok" ? "#6EE7B7" : "#FCA5A5"}`, color: alert.tipo === "ok" ? "#065F46" : "#991B1B" }}>
              {alert.msg}
            </div>
          )}
        </div>

        {/* Vista del catálogo */}
        {catalogo.length > 0 && (
          <div style={{ background: "#fff", border: "1.5px solid #F0E6DD", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ display: "flex", gap: 8, padding: "14px 16px", flexWrap: "wrap", borderBottom: "1.5px solid #FEF0E6" }}>
              {tipos.map(t => (
                <button key={t} onClick={() => setTipoSel(t)}
                  style={{ padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${t === tipoSel ? O : "#E8D5C8"}`, background: t === tipoSel ? O : "#FDFAF8", color: t === tipoSel ? "#fff" : "#8B5E3C" }}>
                  {t} ({catalogo.filter(c => c.tipo_plan === t).length})
                </button>
              ))}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Plan</th>
                    <th style={th}>Servicio empaquetado</th>
                    <th style={th}>Sin imp.</th>
                    <th style={th}>Con imp.</th>
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
                      <td style={td}>{fmt$(f.precio_sin_iva)}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{fmt$(f.precio_con_iva)}</td>
                      {tieneProm && <>
                        <td style={td}>{f.tc_pvp != null && Number(f.tc_dsto) > 0 ? `${fmt$(f.tc_pvp)} · ${fmtPct(f.tc_dsto)} × ${f.tc_facturas ?? "—"} fact.` : "—"}</td>
                        <td style={td}>{f.cta_pvp != null && Number(f.cta_dsto) > 0 ? `${fmt$(f.cta_pvp)} · ${fmtPct(f.cta_dsto)} × ${f.cta_facturas ?? "—"} fact.` : "—"}</td>
                      </>}
                      <td style={{ ...td, fontSize: 11.5, color: "#8B5E3C" }}>{f.equipo || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
