// src/pages/CargaMetasComerciales.jsx
// ============================================================================
// Carga mensual del Excel de metas de gerencia (NOVONET / VELSA).
//
// 1. Se elige empresa, mes y el archivo -> "Analizar" (no guarda metas todavia).
// 2. El sistema muestra cada asesor del Excel con el nombre que encontro en
//    Bitrix. Verde = encontrado solo. Amarillo/rojo = hay que elegir.
// 3. "Aplicar metas" escribe todo en una sola transaccion. La version anterior
//    queda guardada en el historial.
// ============================================================================

import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";

const API = import.meta.env.VITE_API_URL;
const O = "#FF6B00", OP = "#FFF3E8", OB = "#FFCBA0";
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const AUTOMATICOS = new Set(["alias", "codigo", "exacto", "contiene"]);
const EXCEL = "__EXCEL__";

const ESTADO_UI = {
  alias:     { t: "Confirmado antes", c: "#065F46", bg: "#D1FAE5" },
  codigo:    { t: "Por código",       c: "#065F46", bg: "#D1FAE5" },
  exacto:    { t: "Exacto",           c: "#065F46", bg: "#D1FAE5" },
  contiene:  { t: "Coincide",         c: "#065F46", bg: "#D1FAE5" },
  ambiguo:   { t: "Elegir",           c: "#92400E", bg: "#FEF3C7" },
  sugerido:  { t: "Confirmar",        c: "#92400E", bg: "#FEF3C7" },
  sin_match: { t: "No está en Bitrix",c: "#991B1B", bg: "#FEE2E2" },
};

const n0 = (v) => (v === null || v === undefined ? "—" : Math.round(Number(v)).toLocaleString("es-EC"));

export default function CargaMetasComerciales() {
  const hoy = new Date();
  const [empresa, setEmpresa] = useState("NOVONET");
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [diasHabiles, setDiasHabiles] = useState(26);
  const [archivo, setArchivo] = useState(null);
  const [hojas, setHojas] = useState([]);
  const [hoja, setHoja] = useState("");

  // Hoja sugerida: la de la empresa elegida que menciona el MES elegido
  // ("METAS NOVONET OCTUBRE"). Si no hay, ninguna: que el usuario elija a conciencia.
  const sugerirHoja = (lista, emp, m) => {
    const delaEmpresa = lista.filter((n) => n.toUpperCase().includes(emp));
    return delaEmpresa.find((n) => n.toUpperCase().includes(MESES[m - 1].toUpperCase())) || "";
  };
  const [cargando, setCargando] = useState(false);
  const [alerta, setAlerta] = useState(null);
  const [prev, setPrev] = useState(null);          // respuesta del preview
  const [decisiones, setDecisiones] = useState({}); // fila -> claves elegidas
  const [supNombres, setSupNombres] = useState({}); // supervisor excel -> nombre final
  const [resultado, setResultado] = useState(null);
  const [historial, setHistorial] = useState([]);
  const token = localStorage.getItem("token");

  const [verHistorial, setVerHistorial] = useState(0);   // sube en 1 para recargar
  useEffect(() => {
    let vivo = true;
    fetch(`${API}/api/metas-carga/historial`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (vivo && d.success) setHistorial(d.data || []); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [token, verHistorial]);
  const cargarHistorial = () => setVerHistorial((v) => v + 1);

  // Leer los nombres de las hojas en el navegador para ofrecer el selector
  const elegirArchivo = async (file) => {
    setArchivo(file); setPrev(null); setResultado(null); setAlerta(null); setHojas([]); setHoja("");
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", bookSheets: true });
      const metas = wb.SheetNames.filter((n) => n.toUpperCase().startsWith("METAS"));
      setHojas(metas);
      setHoja(sugerirHoja(metas, empresa, mes));
    } catch {
      setAlerta({ tipo: "err", msg: "No se pudo leer el archivo. ¿Es un Excel (.xlsx)?" });
    }
  };

  const analizar = async () => {
    if (!archivo) return;
    setCargando(true); setAlerta(null); setPrev(null); setResultado(null); setDecisiones({}); setSupNombres({});
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      fd.append("empresa", empresa);
      fd.append("anio", anio);
      fd.append("mes", mes);
      fd.append("dias_habiles", diasHabiles);
      if (hoja) fd.append("hoja", hoja);
      const r = await fetch(`${API}/api/metas-carga/preview`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const d = await r.json();
      if (d.success) setPrev(d.data);
      else setAlerta({ tipo: "err", msg: d.error || "No se pudo analizar el archivo." });
    } catch {
      setAlerta({ tipo: "err", msg: "Error de conexión al analizar el archivo." });
    } finally { setCargando(false); }
  };

  // Claves vigentes para una fila: la decision del usuario o lo automatico
  const clavesDe = (a) => (decisiones[a.fila] !== undefined
    ? decisiones[a.fila]
    : (AUTOMATICOS.has(a.cruce.estado) ? a.cruce.elegidos.map((e) => e.clave) : null));

  const pendientes = prev ? prev.asesores.filter((a) => clavesDe(a) === null) : [];

  const aplicar = async () => {
    if (!prev || pendientes.length) return;
    if (!window.confirm(`Se aplicarán las metas de ${MESES[prev.mes - 1]} ${prev.anio} para ${prev.empresa}. ¿Continuar?`)) return;
    setCargando(true); setAlerta(null);
    try {
      const r = await fetch(`${API}/api/metas-carga/confirmar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ carga_id: prev.carga_id, decisiones, supervisores: supNombres }),
      });
      const d = await r.json();
      if (d.success) { setResultado(d.data.resumen); setPrev(null); cargarHistorial(); }
      else setAlerta({ tipo: "err", msg: d.error || "No se pudo aplicar." });
    } catch {
      setAlerta({ tipo: "err", msg: "Error de conexión al aplicar." });
    } finally { setCargando(false); }
  };

  const card = { background: "#fff", border: `1.5px solid ${OB}`, borderRadius: 16, padding: 20, marginBottom: 16 };
  const lbl = { fontSize: 11, fontWeight: 800, color: "#7C3A00", textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 };
  const inp = { padding: "8px 10px", borderRadius: 10, border: `1.5px solid ${OB}`, fontSize: 13, background: "#fff" };
  const th = { padding: "9px 10px", fontSize: 10.5, fontWeight: 800, color: "#7C3A00", textTransform: "uppercase", textAlign: "left", background: OP, borderBottom: `1.5px solid ${OB}`, whiteSpace: "nowrap" };
  const td = { padding: "8px 10px", fontSize: 12.5, color: "#1C1C2E", borderBottom: "1px solid #FEF0E6", verticalAlign: "top" };
  const btn = (activo) => ({ padding: "10px 18px", borderRadius: 12, border: "none", fontWeight: 800, fontSize: 13, cursor: activo ? "pointer" : "not-allowed", background: activo ? O : "#E5E7EB", color: activo ? "#fff" : "#9CA3AF" });

  return (
    <div style={{ minHeight: "100vh", background: "#FFF8F3", fontFamily: "'Inter','Segoe UI',sans-serif", padding: "28px 24px" }}>
      <div style={{ maxWidth: 1250, margin: "0 auto" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: O, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🎯</div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: "#1C1C2E", margin: 0 }}>Carga de metas comerciales</h1>
            <p style={{ fontSize: 12, color: "#A07850", margin: "2px 0 0", fontWeight: 600 }}>
              Metas por asesor, por supervisor y asignación de equipos — alimentan el Reporte D-1 y el KPI Comercial
            </p>
          </div>
        </div>

        {/* Paso 1: archivo */}
        <div style={card}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
            <div><span style={lbl}>Empresa</span>
              <select style={inp} value={empresa} onChange={(e) => { setEmpresa(e.target.value); setHoja(sugerirHoja(hojas, e.target.value, mes)); setPrev(null); }}>
                <option>NOVONET</option><option>VELSA</option>
              </select></div>
            <div><span style={lbl}>Mes</span>
              <select style={inp} value={mes} onChange={(e) => { setMes(Number(e.target.value)); setHoja(sugerirHoja(hojas, empresa, Number(e.target.value))); setPrev(null); }}>
                {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select></div>
            <div><span style={lbl}>Año</span>
              <input style={{ ...inp, width: 90 }} type="number" value={anio} onChange={(e) => { setAnio(Number(e.target.value)); setPrev(null); }} /></div>
            <div><span style={lbl}>Días hábiles</span>
              <input style={{ ...inp, width: 80 }} type="number" min="1" max="31" value={diasHabiles} onChange={(e) => setDiasHabiles(Number(e.target.value))} /></div>
            <div><span style={lbl}>Archivo Excel</span>
              <input type="file" accept=".xlsx,.xlsm" onChange={(e) => elegirArchivo(e.target.files?.[0] || null)} style={{ fontSize: 12 }} /></div>
            {hojas.length > 0 && (
              <div><span style={lbl}>Hoja</span>
                <select style={{ ...inp, fontWeight: 800, borderColor: hoja ? OB : "#F87171" }} value={hoja} onChange={(e) => { setHoja(e.target.value); setPrev(null); }}>
                  <option value="">— Elegir hoja —</option>
                  {hojas.map((h) => <option key={h}>{h}</option>)}
                </select></div>
            )}
            <button style={btn(!!archivo && !!hoja && !cargando)} disabled={!archivo || !hoja || cargando} onClick={analizar}>
              {cargando && !prev ? "Analizando…" : "🔍 Analizar"}
            </button>
          </div>
          <p style={{ fontSize: 11.5, color: "#A07850", margin: "12px 0 0" }}>
            Analizar no guarda metas. Primero vas a revisar cómo quedó cada asesor frente a Bitrix.
          </p>
        </div>

        {alerta && (
          <div style={{ ...card, borderColor: alerta.tipo === "err" ? "#FCA5A5" : "#86EFAC", background: alerta.tipo === "err" ? "#FEF2F2" : "#F0FDF4", fontSize: 13, fontWeight: 600 }}>
            {alerta.msg}
          </div>
        )}

        {resultado && (
          <div style={{ ...card, borderColor: "#86EFAC", background: "#F0FDF4" }}>
            <p style={{ fontWeight: 900, color: "#065F46", margin: "0 0 6px" }}>✅ Metas aplicadas</p>
            <p style={{ fontSize: 12.5, color: "#065F46", margin: 0, lineHeight: 1.6 }}>
              Metas por asesor: {resultado.metas_asesor_insert} nuevas, {resultado.metas_asesor_update} actualizadas, {resultado.metas_asesor_desactivadas} desactivadas ·
              Equipos: {resultado.empleados_insert + resultado.empleados_update + resultado.catalogo_velsa} asignaciones ·
              Nombres recordados: {resultado.alias}
              {resultado.omitidos?.length ? ` · Omitidos: ${resultado.omitidos.join(", ")}` : ""}
            </p>
          </div>
        )}

        {prev && (
          <>
            {/* Avisos */}
            {prev.avisos?.length > 0 && (
              <div style={{ ...card, borderColor: "#FCD34D", background: "#FFFBEB" }}>
                <p style={{ fontWeight: 800, color: "#92400E", margin: "0 0 8px", fontSize: 13 }}>⚠️ Revisa antes de aplicar ({prev.avisos.length})</p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "#78350F", lineHeight: 1.6 }}>
                  {prev.avisos.map((a, i) => <li key={i}>{a.msg}</li>)}
                </ul>
              </div>
            )}

            {/* Resumen + supervisores */}
            <div style={card}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
                <Chip t={`Hoja: ${prev.hoja}`} />
                <Chip t={`${prev.asesores.length} asesores`} />
                {Object.entries(prev.resumen).map(([k, v]) => <Chip key={k} t={`${ESTADO_UI[k]?.t || k}: ${v}`} c={ESTADO_UI[k]?.c} bg={ESTADO_UI[k]?.bg} />)}
                {prev.total && <Chip t={`Meta empresa: ${n0(prev.total.leads_total)} leads · ${n0(prev.total.ingresos_jot)} ingresos Jot · ${n0(prev.total.activas_totales)} activas`} />}
              </div>
              <span style={lbl}>Supervisores (puedes corregir el nombre)</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {prev.supervisores.map((s) => (
                  <div key={s.supervisor} style={{ border: `1px solid ${OB}`, borderRadius: 12, padding: "8px 10px", background: OP }}>
                    <input style={{ ...inp, width: 260 }} value={supNombres[s.supervisor] ?? s.supervisor}
                      onChange={(e) => setSupNombres({ ...supNombres, [s.supervisor]: e.target.value })} />
                    <div style={{ fontSize: 11, color: "#7C3A00", marginTop: 4 }}>
                      {s.codigo ? `Cód. ${s.codigo} · ` : ""}{s.num_asesores} asesores · {n0(s.leads_total)} leads · {n0(s.activas_totales)} activas
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabla de asesores */}
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={th}>Cód.</th><th style={th}>Asesor (Excel)</th><th style={th}>Supervisor</th>
                    <th style={th}>Leads</th><th style={th}>Gestión</th><th style={th}>Ing. Jot</th><th style={th}>Activas</th>
                    <th style={th}>Estado</th><th style={{ ...th, minWidth: 320 }}>Nombre en Bitrix</th>
                  </tr></thead>
                  <tbody>
                    {prev.asesores.map((a) => (
                      <FilaAsesor key={a.fila} a={a} pool={prev.pool} claves={clavesDe(a)} td={td} inp={inp}
                        onChange={(cl) => setDecisiones({ ...decisiones, [a.fila]: cl })}
                        onReset={() => { const d = { ...decisiones }; delete d[a.fila]; setDecisiones(d); }}
                        cambiado={decisiones[a.fila] !== undefined} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "flex-end", marginBottom: 30 }}>
              {pendientes.length > 0 && (
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#991B1B" }}>
                  Faltan {pendientes.length} asesor(es) por resolver
                </span>
              )}
              <button style={btn(!pendientes.length && !cargando)} disabled={!!pendientes.length || cargando} onClick={aplicar}>
                {cargando ? "Aplicando…" : "✅ Aplicar metas"}
              </button>
            </div>
          </>
        )}

        {/* Historial */}
        <div style={card}>
          <p style={{ fontSize: 13, fontWeight: 800, color: "#6B3A1F", margin: "0 0 10px" }}>🗂️ Cargas aplicadas</p>
          {historial.length === 0 ? (
            <p style={{ fontSize: 12, color: "#A07850", margin: 0 }}>Todavía no hay cargas.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>#</th><th style={th}>Empresa</th><th style={th}>Periodo</th><th style={th}>Archivo / hoja</th><th style={th}>Usuario</th><th style={th}>Aplicada</th><th style={th}>Asesores</th></tr></thead>
              <tbody>{historial.map((h) => (
                <tr key={h.id}>
                  <td style={td}>{h.id}</td><td style={td}>{h.empresa}</td><td style={td}>{MESES[h.mes - 1]} {h.anio}</td>
                  <td style={td}>{h.archivo}<br /><span style={{ color: "#A07850", fontSize: 11 }}>{h.hoja}</span></td>
                  <td style={td}>{h.usuario_nombre || "—"}</td>
                  <td style={td}>{h.aplicado_en ? new Date(h.aplicado_en).toLocaleString("es-EC") : "—"}</td>
                  <td style={td}>{(h.resumen?.metas_asesor_insert || 0) + (h.resumen?.metas_asesor_update || 0)} filas</td>
                </tr>))}</tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ t, c = "#7C3A00", bg = OP }) {
  return <span style={{ fontSize: 11.5, fontWeight: 800, color: c, background: bg, border: `1px solid ${OB}`, borderRadius: 999, padding: "4px 10px" }}>{t}</span>;
}

// Una fila de asesor con el selector de nombre(s) de Bitrix
function FilaAsesor({ a, pool, claves, td, inp, onChange, onReset, cambiado }) {
  const [buscar, setBuscar] = useState("");
  const est = ESTADO_UI[a.cruce.estado] || {};
  const porClave = useMemo(() => new Map(pool.map((p) => [p.clave, p])), [pool]);
  const elegidas = claves || [];
  const resuelto = claves !== null;

  const opciones = useMemo(() => {
    const q = buscar.trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (!q) return a.cruce.sugerencias || [];
    const partes = q.split(/\s+/);
    return pool.filter((p) => partes.every((w) => p.clave.includes(w))).slice(0, 8);   // ILIKE por partes
  }, [buscar, pool, a]);

  const agregar = (clave) => { if (!elegidas.includes(clave)) onChange([...elegidas.filter((c) => c !== EXCEL), clave]); setBuscar(""); };
  const quitar = (clave) => onChange(elegidas.filter((c) => c !== clave));
  const nombreDe = (c) => (c === EXCEL ? `${a.nombre_excel} (nombre del Excel)` : porClave.get(c)?.display || a.cruce.elegidos.find((e) => e.clave === c)?.display || c);
  const leadsDe = (c) => porClave.get(c)?.leads ?? a.cruce.elegidos.find((e) => e.clave === c)?.leads;

  return (
    <tr style={{ background: resuelto ? "#fff" : "#FFFBEB" }}>
      <td style={td}>{a.codigo || "—"}</td>
      <td style={{ ...td, fontWeight: 700 }}>{a.nombre_excel}{a.cruce.aviso && <div style={{ fontSize: 10.5, color: "#B45309", fontWeight: 600 }}>{a.cruce.aviso}</div>}</td>
      <td style={td}>{a.supervisor || "—"}</td>
      <td style={td}>{n0(a.leads_total)}</td><td style={td}>{n0(a.leads_gestion)}</td>
      <td style={td}>{n0(a.ingresos_jot)}</td><td style={td}>{n0(a.activas_totales)}</td>
      <td style={td}><span style={{ fontSize: 11, fontWeight: 800, color: est.c, background: est.bg, borderRadius: 999, padding: "3px 8px", whiteSpace: "nowrap" }}>{cambiado ? "Elegido a mano" : est.t}</span></td>
      <td style={td}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          {elegidas.length === 0 && resuelto && <span style={{ fontSize: 11.5, color: "#991B1B", fontWeight: 700 }}>Omitido (no se carga)</span>}
          {elegidas.map((c) => (
            <span key={c} style={{ fontSize: 11.5, background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 8, padding: "3px 8px", display: "inline-flex", gap: 6, alignItems: "center" }}>
              {nombreDe(c)}{leadsDe(c) !== undefined && <span style={{ color: "#6B7280" }}>· {leadsDe(c)} leads</span>}
              <button onClick={() => quitar(c)} style={{ border: "none", background: "none", cursor: "pointer", color: "#991B1B", fontWeight: 900 }} title="Quitar">×</button>
            </span>
          ))}
        </div>
        <input style={{ ...inp, width: "100%", padding: "6px 8px", fontSize: 12 }} placeholder="Buscar en Bitrix (ej: grace arias)…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        {opciones.length > 0 && (
          <div style={{ border: "1px solid #F3E2D3", borderRadius: 8, marginTop: 4, maxHeight: 150, overflowY: "auto" }}>
            {opciones.map((p) => (
              <div key={p.clave} onClick={() => agregar(p.clave)} style={{ padding: "5px 8px", fontSize: 12, cursor: "pointer", borderBottom: "1px solid #FEF0E6" }}>
                ➕ {p.display} <span style={{ color: "#6B7280" }}>· {p.leads} leads</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 11.5 }}>
          <a onClick={() => onChange([EXCEL])} style={{ cursor: "pointer", color: "#1D4ED8" }}>Asesor nuevo: usar nombre del Excel</a>
          <a onClick={() => onChange([])} style={{ cursor: "pointer", color: "#991B1B" }}>Omitir</a>
          {cambiado && <a onClick={onReset} style={{ cursor: "pointer", color: "#6B7280" }}>Deshacer</a>}
        </div>
      </td>
    </tr>
  );
}
