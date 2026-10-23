// src/pages/Horarios.jsx
// ============================================================================
// HORARIOS (NOVONET) — turnos semanales de asesores, lunes a domingo.
//  - Admin / Gerencia: cargan el Excel de horarios (se lee aquí y se envía al backend).
//  - Admin / Gerencia / Supervisor: ven a todos, editan con selects de 30 min y
//    pulsan "Guardar cambios". Ven la marcación de INGRESO de NOVONET ACCESS
//    contra la hora del turno (a tiempo / tarde / sin marcar).
//  - Asesor: solo ve su propio horario.
// Backend: /api/horarios (backend/src/routes/horarios.routes.js)
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";

const API = import.meta.env.VITE_API_URL;
const EMPRESA = "NOVONET";
const O = "#FF6B00", OP = "#FFF3E8", OB = "#FFCBA0";
const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DIAS_EXCEL = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"];

// Horas cada 30 min: 06:00 ... 23:30
const HORAS = [];
for (let h = 6; h <= 23; h++) for (const m of ["00", "30"]) HORAS.push(`${String(h).padStart(2, "0")}:${m}`);

const MODALIDAD_UI = {
  "": { t: "Normal", c: "#374151", bg: "#F3F4F6" },
  OFICINA: { t: "Oficina", c: "#1E40AF", bg: "#DBEAFE" },
  TELECONEXION: { t: "Teleconexión", c: "#6D28D9", bg: "#EDE9FE" },
  HIBRIDO: { t: "Híbrido", c: "#0F766E", bg: "#CCFBF1" },
};

const sinTildes = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
const aMin = (h) => { const [a, b] = String(h).split(":").map(Number); return a * 60 + b; };
const fmtFecha = (s) => { const [, m, d] = s.split("-"); return `${d}/${m}`; };
const sumarDias = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lunesDe = (s) => { const d = new Date(`${s}T00:00:00Z`); return sumarDias(s, -((d.getUTCDay() + 6) % 7)); };
const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const textoTurno = (t) => {
  if (!t || t.tipo === "SIN_ASIGNAR") return "—";
  if (t.tipo === "LIBRE") return "LIBRE";
  let s = `${t.hora_inicio} – ${t.hora_fin}`;
  if (t.hora_inicio2) s += ` / ${t.hora_inicio2} – ${t.hora_fin2}`;
  return s;
};

// Estado de puntualidad de una celda (null = no aplica)
function puntualidad(t, fecha, hoy, tolerancia, conUsuario) {
  if (!t || t.tipo !== "TURNO" || !t.hora_inicio || fecha > hoy) return null;
  if (!conUsuario) return { k: "nouser", t: "Sin usuario ERP", c: "#6B7280", bg: "#F3F4F6" };
  const inicio = aMin(t.hora_inicio);
  if (t.ingreso) {
    const dif = aMin(t.ingreso) - inicio;
    return dif <= tolerancia
      ? { k: "ok", t: `✓ ${t.ingreso}`, c: "#065F46", bg: "#D1FAE5" }
      : { k: "tarde", t: `⚠ +${dif} min (${t.ingreso})`, c: "#92400E", bg: "#FEF3C7", dif };
  }
  if (fecha === hoy) {
    const ahora = new Date(); const minAhora = ahora.getHours() * 60 + ahora.getMinutes();
    if (minAhora <= inicio + tolerancia) return null;
  }
  return { k: "falta", t: "✗ Sin marcar", c: "#991B1B", bg: "#FEE2E2" };
}

// ── Lectura del Excel ──────────────────────────────────────────────────────
function leerHoja(wb, nombre) {
  const ws = wb.Sheets[nombre];
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });
  if (!filas.length) throw new Error("La hoja está vacía");
  const cab = filas[0].map((c) => sinTildes(c));
  const iAsesor = cab.findIndex((c) => c === "ASESOR");
  const iSup = cab.findIndex((c) => c === "SUPERVISOR");
  if (iAsesor < 0) throw new Error("No encuentro la columna ASESOR en la primera fila");
  const colsDia = cab.map((c, i) => (DIAS_EXCEL.some((d) => c.startsWith(d)) ? i : -1)).filter((i) => i >= 0);
  if (!colsDia.length) throw new Error("No encuentro columnas de días (LUNES 28, MARTES 29...)");
  if (!cab[colsDia[0]].startsWith("LUNES")) throw new Error("La primera columna de días debe ser un LUNES");
  const diaNum = parseInt((cab[colsDia[0]].match(/\d+/) || [])[0], 10);
  const asesores = filas.slice(1)
    .filter((f) => f[iAsesor] && String(f[iAsesor]).trim())
    .map((f) => ({
      asesor: String(f[iAsesor]).trim(),
      supervisor: iSup >= 0 && f[iSup] ? String(f[iSup]).trim() : "",
      celdas: colsDia.map((i) => (f[i] === null || f[i] === undefined ? null : String(f[i]).trim())),
    }));
  return { asesores, dias: colsDia.length, diaNum, primeraCab: filas[0][colsDia[0]] };
}

// Lunes cuyo día del mes = diaNum, el más cercano a hoy
function inferirLunes(diaNum) {
  if (!diaNum) return lunesDe(hoyLocal());
  const hoy = new Date(`${hoyLocal()}T00:00:00Z`);
  let mejor = null;
  for (let k = -26; k <= 8; k++) {
    const l = sumarDias(lunesDe(hoyLocal()), k * 7);
    if (Number(l.slice(8, 10)) !== diaNum) continue;
    const dist = Math.abs(new Date(`${l}T00:00:00Z`) - hoy);
    if (!mejor || dist < mejor.dist) mejor = { l, dist };
  }
  return mejor ? mejor.l : lunesDe(hoyLocal());
}

// ── Estilos ────────────────────────────────────────────────────────────────
const card = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: 16, marginBottom: 16 };
const btn = (bg = O, c = "#fff") => ({ background: bg, color: c, border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 });
const sel = { border: "1px solid #D1D5DB", borderRadius: 8, padding: "6px 8px", fontSize: 13, background: "#fff" };

export default function Horarios() {
  const token = localStorage.getItem("token");
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);

  const [lunes, setLunes] = useState(lunesDe(hoyLocal()));
  const [semanas, setSemanas] = useState([]);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [filtroSup, setFiltroSup] = useState("");
  const [busca, setBusca] = useState("");
  const [cambios, setCambios] = useState({}); // "clave|fecha" -> turno editado
  const [editando, setEditando] = useState(null); // { fila, fecha, turno }
  const [guardando, setGuardando] = useState(false);
  const [verCarga, setVerCarga] = useState(false);

  const cargarSemanas = useCallback(() => {
    fetch(`${API}/api/horarios/semanas?empresa=${EMPRESA}`, { headers })
      .then((r) => r.json()).then((j) => j.success && setSemanas(j.data)).catch(() => {});
  }, [headers]);

  const cargarSemana = useCallback(async (l) => {
    setCargando(true); setError("");
    try {
      const r = await fetch(`${API}/api/horarios/semana?empresa=${EMPRESA}&lunes=${l}`, { headers });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Error al cargar");
      setDatos(j.data); setCambios({});
    } catch (e) { setError(e.message); }
    finally { setCargando(false); }
  }, [headers]);

  useEffect(() => { cargarSemanas(); }, [cargarSemanas]);
  useEffect(() => { cargarSemana(lunes); }, [lunes, cargarSemana]);

  const nCambios = Object.keys(cambios).length;
  const irSemana = (n) => {
    if (nCambios && !window.confirm("Tienes cambios sin guardar. ¿Descartarlos?")) return;
    setLunes(sumarDias(lunes, n * 7));
  };

  const turnoDe = (fila, fecha) => cambios[`${fila.asesor_clave}|${fecha}`] || fila.dias[fecha] || null;

  const supervisores = useMemo(() => [...new Set((datos?.filas || []).map((f) => f.supervisor).filter(Boolean))].sort(), [datos]);
  const filas = useMemo(() => (datos?.filas || []).filter((f) =>
    (!filtroSup || f.supervisor === filtroSup) && (!busca || sinTildes(f.asesor).includes(sinTildes(busca)))
  ), [datos, filtroSup, busca]);

  // Alertas del día (solo quien ve a todos)
  const alertasHoy = useMemo(() => {
    if (!datos?.ve_todo || !datos.dias.includes(datos.hoy)) return null;
    const tarde = [], falta = [];
    for (const f of filas) {
      const p = puntualidad(f.dias[datos.hoy], datos.hoy, datos.hoy, datos.tolerancia_min, !!f.usuario_id);
      if (p?.k === "tarde") tarde.push({ f, p });
      if (p?.k === "falta") falta.push({ f, p });
    }
    return { tarde, falta };
  }, [datos, filas]);

  const guardar = async () => {
    setGuardando(true); setError(""); setAviso("");
    try {
      const lista = Object.entries(cambios).map(([k, t]) => {
        const [clave, fecha] = k.split("|");
        const fila = datos.filas.find((f) => f.asesor_clave === clave);
        return { asesor_clave: clave, asesor: fila?.asesor, supervisor: fila?.supervisor, fecha, ...t };
      });
      const r = await fetch(`${API}/api/horarios/cambios`, { method: "PUT", headers, body: JSON.stringify({ empresa: EMPRESA, cambios: lista }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "No se pudo guardar");
      setAviso(`✅ ${j.data.guardados} cambio(s) guardado(s)`);
      await cargarSemana(lunes);
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  };

  return (
    <div style={{ padding: 16, maxWidth: 1400, margin: "0 auto", fontFamily: "inherit" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "#111827" }}>⏰ Horarios {EMPRESA}</h1>
        {datos?.puede_cargar && (
          <button style={btn(verCarga ? "#374151" : O)} onClick={() => setVerCarga((v) => !v)}>
            {verCarga ? "Cerrar carga" : "📤 Cargar Excel"}
          </button>
        )}
      </div>

      {verCarga && datos?.puede_cargar && (
        <PanelCarga headers={headers} onCargado={(desde) => { cargarSemanas(); setVerCarga(false); setLunes(desde); cargarSemana(desde); }} />
      )}

      {/* Navegación de semana */}
      <div style={{ ...card, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <button style={btn(OP, O)} onClick={() => irSemana(-1)}>◀</button>
        <div style={{ fontWeight: 800, fontSize: 15 }}>
          Semana {datos ? `${fmtFecha(datos.lunes)} al ${fmtFecha(datos.domingo)}` : "…"}
        </div>
        <button style={btn(OP, O)} onClick={() => irSemana(1)}>▶</button>
        <button style={btn("#F3F4F6", "#111827")} onClick={() => { if (!nCambios || window.confirm("¿Descartar cambios?")) setLunes(lunesDe(hoyLocal())); }}>Hoy</button>
        {semanas.length > 0 && (
          <select style={sel} value={semanas.includes(lunes) ? lunes : ""} onChange={(e) => e.target.value && (!nCambios || window.confirm("¿Descartar cambios?")) && setLunes(e.target.value)}>
            <option value="">Semanas cargadas…</option>
            {semanas.map((s) => <option key={s} value={s}>{fmtFecha(s)} al {fmtFecha(sumarDias(s, 6))} ({s.slice(0, 4)})</option>)}
          </select>
        )}
        {datos?.ve_todo && (
          <>
            <select style={sel} value={filtroSup} onChange={(e) => setFiltroSup(e.target.value)}>
              <option value="">Todos los supervisores</option>
              {supervisores.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input style={{ ...sel, minWidth: 160 }} placeholder="Buscar asesor…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </>
        )}
        <div style={{ flex: 1 }} />
        {datos?.puede_editar && (
          <>
            {nCambios > 0 && <button style={btn("#F3F4F6", "#111827")} onClick={() => setCambios({})}>Descartar</button>}
            <button style={{ ...btn(nCambios ? O : "#D1D5DB"), cursor: nCambios ? "pointer" : "default" }} disabled={!nCambios || guardando} onClick={guardar}>
              {guardando ? "Guardando…" : `💾 Guardar cambios${nCambios ? ` (${nCambios})` : ""}`}
            </button>
          </>
        )}
      </div>

      {error && <div style={{ ...card, background: "#FEE2E2", color: "#991B1B", borderColor: "#FCA5A5" }}>{error}</div>}
      {aviso && <div style={{ ...card, background: "#D1FAE5", color: "#065F46", borderColor: "#6EE7B7" }}>{aviso}</div>}

      {/* Alertas de hoy vs NOVONET ACCESS */}
      {alertasHoy && (alertasHoy.tarde.length > 0 || alertasHoy.falta.length > 0) && (
        <div style={{ ...card, borderColor: OB, background: OP }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            🚨 Hoy vs NOVONET ACCESS: {alertasHoy.tarde.length} tarde · {alertasHoy.falta.length} sin marcar
            <span style={{ fontWeight: 400, fontSize: 12, color: "#6B7280" }}> (tolerancia {datos.tolerancia_min} min)</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[...alertasHoy.falta, ...alertasHoy.tarde].map(({ f, p }) => (
              <span key={f.asesor_clave} style={{ background: p.bg, color: p.c, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                {f.asesor} · {f.dias[datos.hoy].hora_inicio} · {p.t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Grilla */}
      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        {cargando ? (
          <div style={{ padding: 30, textAlign: "center", color: "#6B7280" }}>Cargando…</div>
        ) : !filas.length ? (
          <div style={{ padding: 30, textAlign: "center", color: "#6B7280" }}>
            {datos?.ve_todo ? "No hay horarios cargados para esta semana." : "Aún no tienes horario asignado para esta semana."}
          </div>
        ) : (
          <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, zIndex: 2, background: "#111827", color: "#fff", padding: 10, textAlign: "left", minWidth: 190 }}>Asesor</th>
                {datos.dias.map((d, i) => (
                  <th key={d} style={{ background: d === datos.hoy ? O : "#111827", color: "#fff", padding: 10, minWidth: 128 }}>
                    {DIAS_CORTOS[i]} {fmtFecha(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, idx) => (
                <tr key={f.asesor_clave} style={{ background: idx % 2 ? "#FAFAFA" : "#fff" }}>
                  <td style={{ position: "sticky", left: 0, zIndex: 1, background: idx % 2 ? "#FAFAFA" : "#fff", padding: "8px 10px", borderBottom: "1px solid #F3F4F6", borderRight: "1px solid #E5E7EB" }}>
                    <div style={{ fontWeight: 700, color: "#111827" }}>{f.asesor}</div>
                    {f.supervisor && <div style={{ color: "#6B7280", fontSize: 11 }}>Sup. {f.supervisor}</div>}
                  </td>
                  {datos.dias.map((d) => {
                    const t = turnoDe(f, d);
                    const sucio = !!cambios[`${f.asesor_clave}|${d}`];
                    const mod = MODALIDAD_UI[t?.modalidad || ""];
                    const p = puntualidad(t, d, datos.hoy, datos.tolerancia_min, !!f.usuario_id);
                    return (
                      <td key={d}
                        onClick={() => datos.puede_editar && setEditando({ fila: f, fecha: d, turno: t })}
                        title={t?.texto_original ? `Excel: ${t.texto_original}` : ""}
                        style={{
                          padding: 6, borderBottom: "1px solid #F3F4F6", textAlign: "center", verticalAlign: "top",
                          cursor: datos.puede_editar ? "pointer" : "default",
                          background: sucio ? "#FFEDD5" : d === datos.hoy ? "#FFFBF5" : undefined,
                          outline: sucio ? `2px solid ${O}` : "none", outlineOffset: -2,
                        }}>
                        <div style={{ fontWeight: 700, color: t?.tipo === "LIBRE" ? "#9CA3AF" : "#111827" }}>{textoTurno(t)}</div>
                        {t?.tipo === "TURNO" && t.modalidad && (
                          <span style={{ display: "inline-block", marginTop: 3, background: mod.bg, color: mod.c, borderRadius: 999, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>{mod.t}</span>
                        )}
                        {p && !sucio && (
                          <div style={{ marginTop: 4, background: p.bg, color: p.c, borderRadius: 6, padding: "2px 4px", fontSize: 10, fontWeight: 700 }}>{p.t}</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {datos?.puede_editar && filas.length > 0 && (
        <div style={{ color: "#6B7280", fontSize: 12 }}>Toca una celda para cambiar el turno. Los cambios quedan en naranja hasta que pulses <b>Guardar cambios</b>.</div>
      )}

      {editando && (
        <EditorTurno
          {...editando}
          onCerrar={() => setEditando(null)}
          onAplicar={(t) => {
            setCambios((c) => ({ ...c, [`${editando.fila.asesor_clave}|${editando.fecha}`]: t }));
            setEditando(null); setAviso("");
          }}
        />
      )}
    </div>
  );
}

// ── Editor de una celda (modal) ────────────────────────────────────────────
function EditorTurno({ fila, fecha, turno, onCerrar, onAplicar }) {
  const [tipo, setTipo] = useState(turno?.tipo || "SIN_ASIGNAR");
  const [ini, setIni] = useState(turno?.hora_inicio || "08:00");
  const [fin, setFin] = useState(turno?.hora_fin || "15:00");
  const [dos, setDos] = useState(!!turno?.hora_inicio2);
  const [ini2, setIni2] = useState(turno?.hora_inicio2 || "17:00");
  const [fin2, setFin2] = useState(turno?.hora_fin2 || "20:00");
  const [modalidad, setModalidad] = useState(turno?.modalidad || "");

  // Si la hora vino del Excel fuera del corte de 30 min, se muestra igual
  const opciones = (v) => (HORAS.includes(v) ? HORAS : [v, ...HORAS]);
  let err = "";
  if (tipo === "TURNO") {
    if (aMin(fin) <= aMin(ini)) err = "La hora de fin debe ser mayor que la de inicio";
    else if (dos && (aMin(fin2) <= aMin(ini2) || aMin(ini2) < aMin(fin))) err = "El 2do bloque debe ir después del 1ro";
  }
  const aplicar = () => {
    if (err) return;
    onAplicar(tipo === "TURNO"
      ? { tipo, hora_inicio: ini, hora_fin: fin, hora_inicio2: dos ? ini2 : null, hora_fin2: dos ? fin2 : null, modalidad: modalidad || null }
      : { tipo, hora_inicio: null, hora_fin: null, hora_inicio2: null, hora_fin2: null, modalidad: null });
  };
  const fila2 = { display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" };

  return (
    <div onClick={onCerrar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 18, width: "100%", maxWidth: 380 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{fila.asesor}</div>
        <div style={{ color: "#6B7280", fontSize: 12, marginBottom: 12 }}>
          {DIAS_CORTOS[(new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7]} {fmtFecha(fecha)}
          {turno?.texto_original ? ` · Excel: ${turno.texto_original}` : ""}
        </div>

        <div style={fila2}>
          {[["TURNO", "Turno"], ["LIBRE", "Libre"], ["SIN_ASIGNAR", "Sin asignar"]].map(([k, t]) => (
            <button key={k} onClick={() => setTipo(k)} style={btn(tipo === k ? O : "#F3F4F6", tipo === k ? "#fff" : "#111827")}>{t}</button>
          ))}
        </div>

        {tipo === "TURNO" && (
          <>
            <div style={fila2}>
              <span style={{ width: 54, fontSize: 12 }}>Bloque 1</span>
              <select style={sel} value={ini} onChange={(e) => setIni(e.target.value)}>{opciones(ini).map((h) => <option key={h}>{h}</option>)}</select>
              <span>a</span>
              <select style={sel} value={fin} onChange={(e) => setFin(e.target.value)}>{opciones(fin).map((h) => <option key={h}>{h}</option>)}</select>
            </div>
            {dos ? (
              <div style={fila2}>
                <span style={{ width: 54, fontSize: 12 }}>Bloque 2</span>
                <select style={sel} value={ini2} onChange={(e) => setIni2(e.target.value)}>{opciones(ini2).map((h) => <option key={h}>{h}</option>)}</select>
                <span>a</span>
                <select style={sel} value={fin2} onChange={(e) => setFin2(e.target.value)}>{opciones(fin2).map((h) => <option key={h}>{h}</option>)}</select>
                <button style={btn("#F3F4F6", "#991B1B")} onClick={() => setDos(false)}>✕</button>
              </div>
            ) : (
              <button style={{ ...btn("#F3F4F6", "#111827"), marginBottom: 10 }} onClick={() => setDos(true)}>+ 2do bloque (turno partido)</button>
            )}
            <div style={fila2}>
              <span style={{ width: 54, fontSize: 12 }}>Modalidad</span>
              <select style={sel} value={modalidad} onChange={(e) => setModalidad(e.target.value)}>
                {Object.entries(MODALIDAD_UI).map(([k, v]) => <option key={k} value={k}>{v.t}</option>)}
              </select>
            </div>
          </>
        )}

        {err && <div style={{ color: "#991B1B", fontSize: 12, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
          <button style={btn("#F3F4F6", "#111827")} onClick={onCerrar}>Cancelar</button>
          <button style={{ ...btn(err ? "#D1D5DB" : O), cursor: err ? "default" : "pointer" }} disabled={!!err} onClick={aplicar}>Aplicar</button>
        </div>
      </div>
    </div>
  );
}

// ── Carga del Excel ────────────────────────────────────────────────────────
function PanelCarga({ headers, onCargado }) {
  const [wb, setWb] = useState(null);
  const [archivo, setArchivo] = useState("");
  const [hoja, setHoja] = useState("");
  const [info, setInfo] = useState(null);
  const [fechaInicio, setFechaInicio] = useState("");
  const [sobrescribir, setSobrescribir] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const elegirHoja = (libro, nombre) => {
    setHoja(nombre); setError(""); setInfo(null);
    try {
      const i = leerHoja(libro, nombre);
      setInfo(i); setFechaInicio(inferirLunes(i.diaNum));
    } catch (e) { setError(e.message); }
  };

  const abrir = async (file) => {
    if (!file) return;
    setArchivo(file.name); setResultado(null); setError("");
    try {
      const libro = XLSX.read(await file.arrayBuffer(), { type: "array" });
      setWb(libro);
      elegirHoja(libro, libro.SheetNames[libro.SheetNames.length - 1]); // la última suele ser la vigente
    } catch (e) { setError("No se pudo leer el archivo: " + e.message); }
  };

  const esLunes = fechaInicio && new Date(`${fechaInicio}T00:00:00Z`).getUTCDay() === 1;

  const enviar = async () => {
    setEnviando(true); setError("");
    try {
      const r = await fetch(`${API}/api/horarios/cargar`, {
        method: "POST", headers,
        body: JSON.stringify({ empresa: EMPRESA, fecha_inicio: fechaInicio, sobrescribir_manuales: sobrescribir, filas: info.asesores }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Error al cargar");
      setResultado(j.data);
    } catch (e) { setError(e.message); }
    finally { setEnviando(false); }
  };

  return (
    <div style={{ ...card, borderColor: OB }}>
      <div style={{ fontWeight: 800, marginBottom: 10 }}>📤 Cargar Excel de horarios ({EMPRESA})</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <input type="file" accept=".xlsx,.xlsm,.xls" onChange={(e) => abrir(e.target.files?.[0])} />
        {wb && (
          <select style={sel} value={hoja} onChange={(e) => elegirHoja(wb, e.target.value)}>
            {wb.SheetNames.map((n) => <option key={n} value={n}>Hoja: {n}</option>)}
          </select>
        )}
      </div>

      {info && (
        <div style={{ marginTop: 12, fontSize: 13 }}>
          <div style={{ marginBottom: 8 }}>
            <b>{info.asesores.length}</b> asesores · <b>{info.dias}</b> días ({Math.ceil(info.dias / 7)} semana/s) en <i>{archivo}</i>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <label>La columna “{info.primeraCab}” es el lunes:</label>
            <input type="date" style={sel} value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
            {fechaInicio && !esLunes && <span style={{ color: "#991B1B" }}>Esa fecha no es lunes</span>}
            {esLunes && <span style={{ color: "#6B7280" }}>→ hasta {fmtFecha(sumarDias(fechaInicio, info.dias - 1))}/{sumarDias(fechaInicio, info.dias - 1).slice(0, 4)}</span>}
          </div>
          <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
            <input type="checkbox" checked={sobrescribir} onChange={(e) => setSobrescribir(e.target.checked)} />
            Sobrescribir también los cambios manuales ya guardados
          </label>
          <button style={{ ...btn(esLunes ? O : "#D1D5DB"), marginTop: 10 }} disabled={!esLunes || enviando} onClick={enviar}>
            {enviando ? "Cargando…" : "Cargar horarios"}
          </button>
        </div>
      )}

      {error && <div style={{ marginTop: 10, color: "#991B1B" }}>{error}</div>}
      {resultado && (
        <div style={{ marginTop: 12, background: "#D1FAE5", color: "#065F46", borderRadius: 10, padding: 12, fontSize: 13 }}>
          ✅ {resultado.asesores} asesores · {resultado.registros} días guardados ({resultado.desde} a {resultado.hasta})
          {resultado.omitidos_por_cambio_manual > 0 && <div>Se respetaron {resultado.omitidos_por_cambio_manual} cambio(s) manual(es).</div>}
          {resultado.sin_usuario_erp.length > 0 && (
            <div style={{ color: "#92400E", marginTop: 6 }}>
              ⚠ Sin usuario en el ERP (no se podrá cruzar con NOVONET ACCESS): {resultado.sin_usuario_erp.join(", ")}
            </div>
          )}
          <button style={{ ...btn(), marginTop: 8 }} onClick={() => onCargado(resultado.desde)}>Ver horarios</button>
        </div>
      )}
    </div>
  );
}
