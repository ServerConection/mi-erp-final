// src/pages/TalentoHumano.jsx
// Módulo TTHH (Talento Humano) — exclusivo perfil TTHH.
// Pestañas: Productividad de asesores · Documentos de control · Tabla compartida.
// TTHH ve siempre Novonet + Velsa, sin importar su propia empresa asignada.

import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL;
const O   = "#FF6B00";
const token = () => localStorage.getItem("token");
const authHeaders = (json = true) => ({
  Authorization: `Bearer ${token()}`,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

// Los archivos viven detrás de una ruta autenticada en el servidor de
// almacenamiento local — hay que pedirlos con fetch()+Authorization y
// abrirlos como blob (un <a href> normal no manda el token).
const verArchivo = async (url, e) => {
  e?.preventDefault();
  try {
    const r = await fetch(`${API}${url}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (!r.ok) { alert("No se pudo abrir el archivo."); return; }
    const blob = await r.blob();
    window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
  } catch {
    alert("Error de conexión al abrir el archivo.");
  }
};

const card = { background: "#fff", border: "1.5px solid #F0E6DD", borderRadius: 16, padding: 20 };
const btn  = { background: O, color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 800, fontSize: 12.5, cursor: "pointer" };
const btnGhost = { ...btn, background: "#fff", color: O, border: `1.5px solid ${O}` };
const input = { border: "1.5px solid #F0E6DD", borderRadius: 8, padding: "8px 10px", fontSize: 13, width: "100%" };
const th = { textAlign: "left", fontSize: 11.5, fontWeight: 800, color: "#8B5E3C", padding: "8px 10px", borderBottom: "2px solid #F0E6DD", whiteSpace: "nowrap" };
const td = { padding: "8px 10px", fontSize: 13, borderBottom: "1px solid #F5EDE5", whiteSpace: "nowrap" };

export default function TalentoHumano() {
  const [tab, setTab] = useState("productividad");

  return (
    <div style={{ minHeight: "100vh", background: "#FFF8F3", padding: "28px 20px", fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: "#1C1C2E", margin: 0 }}>🧑‍💼 Talento Humano</h1>
        <p style={{ fontSize: 13, color: "#8B5E3C", marginTop: 4, marginBottom: 20 }}>
          Visión conjunta Novonet + Velsa — exclusivo para el rol TTHH.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {[
            ["productividad", "📈 Productividad de asesores"],
            ["documentos", "📁 Documentos de control"],
            ["tabla", "🗂️ Tabla compartida"],
            ["drive", "💾 Drive"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={tab === id ? btn : btnGhost}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "productividad" && <Productividad />}
        {tab === "documentos" && <Documentos />}
        {tab === "tabla" && <TablaCompartida />}
        {tab === "drive" && <Drive />}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// PESTAÑA 1 — PRODUCTIVIDAD
// ════════════════════════════════════════════════════════════════
function Productividad() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes]   = useState(hoy.getMonth() + 1);
  const [empresa, setEmpresa] = useState("");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metaForm, setMetaForm] = useState({ empresa: "NOVONET", codigo_asesor: "", meta_mensual: 10 });
  const [guardandoMeta, setGuardandoMeta] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ anio, mes, ...(empresa ? { empresa } : {}) });
      const r = await fetch(`${API}/api/tthh/productividad?${qs}`, { headers: authHeaders() });
      const d = await r.json();
      if (d.success) setData(d.data);
      else setError(d.error || "No se pudo cargar la productividad.");
    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [anio, mes, empresa]);

  useEffect(() => { cargar(); }, [cargar]);

  const guardarMeta = async () => {
    if (!metaForm.meta_mensual) return;
    setGuardandoMeta(true);
    try {
      const r = await fetch(`${API}/api/tthh/metas`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          empresa: metaForm.empresa,
          codigo_asesor: metaForm.codigo_asesor || null,
          meta_mensual: metaForm.meta_mensual,
        }),
      });
      const d = await r.json();
      if (d.success) { alert("✅ Meta guardada."); cargar(); }
      else alert(`❌ ${d.error}`);
    } catch {
      alert("❌ Error de conexión.");
    } finally {
      setGuardandoMeta(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...card, display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <label style={labelStyle}>Año</label>
          <input style={{ ...input, width: 90 }} type="number" value={anio} onChange={e => setAnio(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Mes</label>
          <select style={{ ...input, width: 140 }} value={mes} onChange={e => setMes(e.target.value)}>
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Empresa</label>
          <select style={{ ...input, width: 150 }} value={empresa} onChange={e => setEmpresa(e.target.value)}>
            <option value="">Novonet + Velsa</option>
            <option value="NOVONET">Solo Novonet</option>
            <option value="VELSA">Solo Velsa</option>
          </select>
        </div>
        <button style={btn} onClick={cargar}>🔄 Actualizar</button>
      </div>

      <div style={card}>
        <p style={{ fontSize: 12, color: "#A07850", marginTop: 0, marginBottom: 10 }}>
          Productividad calculada sobre ventas efectivas registradas en Backoffice (envios_ventas). Si un asesor no aparece, no tiene ventas registradas en ese periodo.
        </p>
        {loading && <p>Cargando…</p>}
        {error && <p style={{ color: "#991B1B" }}>❌ {error}</p>}
        {!loading && !error && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Asesor</th>
                  <th style={th}>Empresa</th>
                  <th style={th}>Distribuidor</th>
                  <th style={th}>Supervisor</th>
                  <th style={th}>Total ventas</th>
                  <th style={th}>Ventas efectivas</th>
                  <th style={th}>Calidad buena</th>
                  <th style={th}>Calidad mala</th>
                  <th style={th}>Meta</th>
                  <th style={th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 && (
                  <tr><td style={td} colSpan={10}>Sin datos para este periodo.</td></tr>
                )}
                {data.map((r, i) => (
                  <tr key={i}>
                    <td style={td}>{r.codigo_asesor}</td>
                    <td style={td}>{r.empresa}</td>
                    <td style={td}>{r.distribuidor_autorizado || "—"}</td>
                    <td style={td}>{r.supervisor || "—"}</td>
                    <td style={td}>{r.total_ventas}</td>
                    <td style={td}>{r.ventas_efectivas}</td>
                    <td style={td}>{r.ventas_calidad_buena}</td>
                    <td style={td}>{r.ventas_calidad_mala}</td>
                    <td style={td}>{r.meta_mensual}</td>
                    <td style={td}>
                      <span style={{
                        padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800,
                        background: r.productivo ? "#DCFCE7" : "#FEF2F2",
                        color: r.productivo ? "#166534" : "#991B1B",
                      }}>
                        {r.productivo ? "✅ Productivo" : "⚠️ Por debajo de meta"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "#1C1C2E", marginTop: 0 }}>🎯 Configurar meta mensual</h3>
        <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
          <div>
            <label style={labelStyle}>Empresa</label>
            <select style={{ ...input, width: 140 }} value={metaForm.empresa} onChange={e => setMetaForm({ ...metaForm, empresa: e.target.value })}>
              <option value="NOVONET">Novonet</option>
              <option value="VELSA">Velsa</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Código asesor (opcional)</label>
            <input style={{ ...input, width: 160 }} placeholder="Vacío = meta general" value={metaForm.codigo_asesor} onChange={e => setMetaForm({ ...metaForm, codigo_asesor: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Meta mensual (ventas efectivas)</label>
            <input style={{ ...input, width: 100 }} type="number" value={metaForm.meta_mensual} onChange={e => setMetaForm({ ...metaForm, meta_mensual: e.target.value })} />
          </div>
          <button style={btn} disabled={guardandoMeta} onClick={guardarMeta}>{guardandoMeta ? "Guardando…" : "💾 Guardar meta"}</button>
        </div>
      </div>
    </div>
  );
}

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const labelStyle = { display: "block", fontSize: 11, fontWeight: 700, color: "#8B5E3C", marginBottom: 4 };

// ════════════════════════════════════════════════════════════════
// PESTAÑA 2 — DOCUMENTOS DE CONTROL
// ════════════════════════════════════════════════════════════════
function Documentos() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [form, setForm] = useState({ tipo: "ASESOR", empresa: "", codigo_asesor: "", nombre_asesor: "", categoria: "", titulo: "", descripcion: "", archivo_url: "" });
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams(filtroTipo ? { tipo: filtroTipo } : {});
      const r = await fetch(`${API}/api/tthh/documentos?${qs}`, { headers: authHeaders() });
      const d = await r.json();
      if (d.success) setDocs(d.data);
    } finally {
      setLoading(false);
    }
  }, [filtroTipo]);

  useEffect(() => { cargar(); }, [cargar]);

  const subirArchivo = async (file) => {
    if (!file) return;
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append("archivo", file);
      // tipo + codigo_asesor deciden la carpeta en el servidor de almacenamiento local
      fd.append("tipo", form.tipo);
      fd.append("codigo_asesor", form.codigo_asesor || "");
      const r = await fetch(`${API}/api/tthh/documentos/upload`, { method: "POST", headers: authHeaders(false), body: fd });
      const d = await r.json();
      if (d.success) setForm(f => ({ ...f, archivo_url: d.url }));
      else alert(`❌ ${d.error}`);
    } catch {
      alert("❌ Error subiendo el archivo.");
    } finally {
      setSubiendo(false);
    }
  };

  const crear = async () => {
    if (!form.titulo || !form.archivo_url) {
      alert("Completa el título y sube un archivo antes de guardar.");
      return;
    }
    setGuardando(true);
    try {
      const r = await fetch(`${API}/api/tthh/documentos`, { method: "POST", headers: authHeaders(), body: JSON.stringify(form) });
      const d = await r.json();
      if (d.success) {
        setForm({ tipo: "ASESOR", empresa: "", codigo_asesor: "", nombre_asesor: "", categoria: "", titulo: "", descripcion: "", archivo_url: "" });
        cargar();
      } else alert(`❌ ${d.error}`);
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (id) => {
    if (!confirm("¿Eliminar este documento?")) return;
    const r = await fetch(`${API}/api/tthh/documentos/${id}`, { method: "DELETE", headers: authHeaders() });
    const d = await r.json();
    if (d.success) cargar();
    else alert(`❌ ${d.error}`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "#1C1C2E", marginTop: 0 }}>📤 Subir nuevo documento</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <div>
            <label style={labelStyle}>Tipo</label>
            <select style={input} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
              <option value="ASESOR">Por asesor</option>
              <option value="GENERAL">General del área</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Empresa</label>
            <select style={input} value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value })}>
              <option value="">Ambas / No aplica</option>
              <option value="NOVONET">Novonet</option>
              <option value="VELSA">Velsa</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Categoría</label>
            <input style={input} placeholder="Contrato, evaluación, manual…" value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} />
          </div>
          {form.tipo === "ASESOR" && (
            <>
              <div>
                <label style={labelStyle}>Código asesor</label>
                <input style={input} value={form.codigo_asesor} onChange={e => setForm({ ...form, codigo_asesor: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Nombre asesor</label>
                <input style={input} value={form.nombre_asesor} onChange={e => setForm({ ...form, nombre_asesor: e.target.value })} />
              </div>
            </>
          )}
          <div style={{ gridColumn: form.tipo === "ASESOR" ? "auto" : "span 2" }}>
            <label style={labelStyle}>Título *</label>
            <input style={input} value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} />
          </div>
          <div style={{ gridColumn: "span 3" }}>
            <label style={labelStyle}>Descripción</label>
            <input style={input} value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={labelStyle}>Archivo *</label>
            <input type="file" onChange={e => subirArchivo(e.target.files[0])} disabled={subiendo} />
            {subiendo && <span style={{ fontSize: 11, color: "#8B5E3C" }}>Subiendo…</span>}
            {form.archivo_url && <span style={{ fontSize: 11, color: "#166534" }}> ✅ Archivo listo</span>}
          </div>
          <div style={{ display: "flex", alignItems: "end" }}>
            <button style={btn} disabled={guardando} onClick={crear}>{guardando ? "Guardando…" : "💾 Guardar documento"}</button>
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: "#1C1C2E", margin: 0 }}>📁 Documentos cargados</h3>
          <select style={{ ...input, width: 180 }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
            <option value="">Todos</option>
            <option value="ASESOR">Por asesor</option>
            <option value="GENERAL">Generales</option>
          </select>
        </div>
        {loading && <p>Cargando…</p>}
        {!loading && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Título</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Empresa</th>
                  <th style={th}>Asesor</th>
                  <th style={th}>Categoría</th>
                  <th style={th}>Subido por</th>
                  <th style={th}>Fecha</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {docs.length === 0 && <tr><td style={td} colSpan={8}>No hay documentos cargados.</td></tr>}
                {docs.map(d => (
                  <tr key={d.id}>
                    <td style={td}><a href="#" onClick={(e) => verArchivo(d.archivo_url, e)}>{d.titulo}</a></td>
                    <td style={td}>{d.tipo}</td>
                    <td style={td}>{d.empresa || "—"}</td>
                    <td style={td}>{d.nombre_asesor || d.codigo_asesor || "—"}</td>
                    <td style={td}>{d.categoria || "—"}</td>
                    <td style={td}>{d.subido_por}</td>
                    <td style={td}>{new Date(d.fecha_subida).toLocaleDateString("es-EC")}</td>
                    <td style={td}>
                      <button style={{ ...btnGhost, padding: "4px 10px", fontSize: 11 }} onClick={() => eliminar(d.id)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// PESTAÑA 3 — TABLA COMPARTIDA (mini hoja de cálculo en SQL)
// ════════════════════════════════════════════════════════════════
function TablaCompartida() {
  const [columnas, setColumnas] = useState([]);
  const [filas, setFilas] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [rc, rf] = await Promise.all([
        fetch(`${API}/api/tthh/tabla/columnas`, { headers: authHeaders() }),
        fetch(`${API}/api/tthh/tabla/filas`, { headers: authHeaders() }),
      ]);
      const [dc, df] = await Promise.all([rc.json(), rf.json()]);
      if (dc.success) setColumnas(dc.data);
      if (df.success) setFilas(df.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const agregarColumna = async () => {
    const nombre = prompt("Nombre de la nueva columna:");
    if (!nombre || !nombre.trim()) return;
    const r = await fetch(`${API}/api/tthh/tabla/columnas`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ nombre }) });
    const d = await r.json();
    if (d.success) cargar();
  };

  const eliminarColumna = async (id) => {
    if (!confirm("¿Eliminar esta columna? Se perderán los valores de esa columna en todas las filas.")) return;
    const r = await fetch(`${API}/api/tthh/tabla/columnas/${id}`, { method: "DELETE", headers: authHeaders() });
    const d = await r.json();
    if (d.success) cargar();
  };

  const agregarFila = async () => {
    const r = await fetch(`${API}/api/tthh/tabla/filas`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ datos: {} }) });
    const d = await r.json();
    if (d.success) cargar();
  };

  const eliminarFila = async (id) => {
    if (!confirm("¿Eliminar esta fila?")) return;
    const r = await fetch(`${API}/api/tthh/tabla/filas/${id}`, { method: "DELETE", headers: authHeaders() });
    const d = await r.json();
    if (d.success) cargar();
  };

  // Edición local optimista + guardado en blur
  const [celdaLocal, setCeldaLocal] = useState({}); // `${filaId}_${colId}` -> valor

  const valorCelda = (fila, colId) => {
    const key = `${fila.id}_${colId}`;
    if (key in celdaLocal) return celdaLocal[key];
    return fila.datos?.[String(colId)] ?? "";
  };

  const onChangeCelda = (filaId, colId, valor) => {
    setCeldaLocal(prev => ({ ...prev, [`${filaId}_${colId}`]: valor }));
  };

  const guardarCelda = async (fila, colId) => {
    const key = `${fila.id}_${colId}`;
    if (!(key in celdaLocal)) return;
    const nuevosDatos = { ...(fila.datos || {}), [String(colId)]: celdaLocal[key] };
    await fetch(`${API}/api/tthh/tabla/filas/${fila.id}`, { method: "PUT", headers: authHeaders(), body: JSON.stringify({ datos: nuevosDatos }) });
    setFilas(prev => prev.map(f => f.id === fila.id ? { ...f, datos: nuevosDatos } : f));
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "#1C1C2E", margin: 0 }}>🗂️ Tabla compartida TTHH</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btnGhost} onClick={agregarColumna}>➕ Columna</button>
          <button style={btn} onClick={agregarFila}>➕ Fila</button>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "#A07850", marginTop: 0 }}>
        Funciona como un Excel compartido, pero los datos viven en la base de datos — solo el rol TTHH puede verla o editarla.
      </p>
      {loading ? <p>Cargando…</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {columnas.map(c => (
                  <th key={c.id} style={{ ...th, position: "relative" }}>
                    {c.nombre}
                    <button onClick={() => eliminarColumna(c.id)} style={{ marginLeft: 6, border: "none", background: "none", color: "#C4A898", cursor: "pointer" }}>✕</button>
                  </th>
                ))}
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr><td style={td} colSpan={columnas.length + 1}>No hay filas aún. Usa "➕ Fila" para empezar.</td></tr>
              )}
              {filas.map(f => (
                <tr key={f.id}>
                  {columnas.map(c => (
                    <td key={c.id} style={td}>
                      <input
                        style={{ border: "none", background: "transparent", fontSize: 13, width: c.ancho || 160 }}
                        value={valorCelda(f, c.id)}
                        onChange={e => onChangeCelda(f.id, c.id, e.target.value)}
                        onBlur={() => guardarCelda(f, c.id)}
                      />
                    </td>
                  ))}
                  <td style={td}>
                    <button style={{ ...btnGhost, padding: "4px 10px", fontSize: 11 }} onClick={() => eliminarFila(f.id)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// PESTAÑA 4 — DRIVE (carpetas libres, tipo Google Drive)
// Compartido entre TTHH y ADMINISTRADOR. Navegación por carpetas con
// breadcrumb; crear carpeta; subir/ver/eliminar archivos dentro de la
// carpeta actual.
// ════════════════════════════════════════════════════════════════
function Drive() {
  const [ruta, setRuta] = useState([]); // [{id, nombre}, ...] — vacío = raíz
  const [carpetas, setCarpetas] = useState([]);
  const [archivos, setArchivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);

  const carpetaActualId = ruta.length ? ruta[ruta.length - 1].id : null;

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const qs = carpetaActualId ? `?padre_id=${carpetaActualId}` : "";
      const qsArch = carpetaActualId ? `?carpeta_id=${carpetaActualId}` : "";
      const [rc, ra] = await Promise.all([
        fetch(`${API}/api/tthh/drive/carpetas${qs}`, { headers: authHeaders() }),
        fetch(`${API}/api/tthh/drive/archivos${qsArch}`, { headers: authHeaders() }),
      ]);
      const [dc, da] = await Promise.all([rc.json(), ra.json()]);
      if (dc.success) setCarpetas(dc.data);
      if (da.success) setArchivos(da.data);
    } finally {
      setLoading(false);
    }
  }, [carpetaActualId]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirCarpeta = (c) => setRuta(r => [...r, { id: c.id, nombre: c.nombre }]);
  const irAMiga = (idx) => setRuta(r => r.slice(0, idx + 1));
  const irARaiz = () => setRuta([]);

  const crearCarpeta = async () => {
    const nombre = prompt("Nombre de la nueva carpeta:");
    if (!nombre || !nombre.trim()) return;
    const r = await fetch(`${API}/api/tthh/drive/carpetas`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ nombre, carpeta_padre_id: carpetaActualId }),
    });
    const d = await r.json();
    if (d.success) cargar();
    else alert(`❌ ${d.error}`);
  };

  const eliminarCarpeta = async (c, e) => {
    e.stopPropagation();
    if (!confirm(`¿Eliminar la carpeta "${c.nombre}" y todo su contenido?`)) return;
    const r = await fetch(`${API}/api/tthh/drive/carpetas/${c.id}`, { method: "DELETE", headers: authHeaders() });
    const d = await r.json();
    if (d.success) cargar();
    else alert(`❌ ${d.error}`);
  };

  const subirArchivos = async (files) => {
    if (!files || files.length === 0) return;
    setSubiendo(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("archivo", file);
        if (carpetaActualId) fd.append("carpeta_id", carpetaActualId);
        const r = await fetch(`${API}/api/tthh/drive/archivos/upload`, { method: "POST", headers: authHeaders(false), body: fd });
        const d = await r.json();
        if (!d.success) alert(`❌ ${file.name}: ${d.error}`);
      }
      cargar();
    } catch {
      alert("❌ Error subiendo el archivo.");
    } finally {
      setSubiendo(false);
    }
  };

  const eliminarArchivo = async (a) => {
    if (!confirm(`¿Eliminar "${a.nombre_original}"?`)) return;
    const r = await fetch(`${API}/api/tthh/drive/archivos/${a.id}`, { method: "DELETE", headers: authHeaders() });
    const d = await r.json();
    if (d.success) cargar();
    else alert(`❌ ${d.error}`);
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "#1C1C2E", margin: 0 }}>💾 Drive compartido — TTHH y Administración</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btnGhost} onClick={crearCarpeta}>📂 Nueva carpeta</button>
          <label style={{ ...btn, display: "inline-block" }}>
            {subiendo ? "Subiendo…" : "⬆️ Subir archivo"}
            <input
              type="file"
              multiple
              style={{ display: "none" }}
              disabled={subiendo}
              onChange={e => { subirArchivos(e.target.files); e.target.value = ""; }}
            />
          </label>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "#A07850", marginTop: 0, marginBottom: 14 }}>
        Crea carpetas libres y comparte archivos entre asesores de Talento Humano y personal administrativo.
      </p>

      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, color: "#8B5E3C", marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ cursor: "pointer", fontWeight: ruta.length === 0 ? 800 : 600, color: ruta.length === 0 ? "#1C1C2E" : O }} onClick={irARaiz}>
          🏠 Raíz
        </span>
        {ruta.map((r, i) => (
          <span key={r.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span>/</span>
            <span
              style={{ cursor: "pointer", fontWeight: i === ruta.length - 1 ? 800 : 600, color: i === ruta.length - 1 ? "#1C1C2E" : O }}
              onClick={() => irAMiga(i)}
            >
              {r.nombre}
            </span>
          </span>
        ))}
      </div>

      {loading ? <p>Cargando…</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Nombre</th>
                <th style={th}>Tipo</th>
                <th style={th}>Subido/creado por</th>
                <th style={th}>Fecha</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {carpetas.length === 0 && archivos.length === 0 && (
                <tr><td style={td} colSpan={5}>Carpeta vacía. Crea una subcarpeta o sube un archivo.</td></tr>
              )}
              {carpetas.map(c => (
                <tr key={`c-${c.id}`} style={{ cursor: "pointer" }} onClick={() => abrirCarpeta(c)}>
                  <td style={td}>📂 {c.nombre}</td>
                  <td style={td}>Carpeta</td>
                  <td style={td}>{c.creado_por || "—"}</td>
                  <td style={td}>{new Date(c.creado_en).toLocaleDateString("es-EC")}</td>
                  <td style={td}>
                    <button style={{ ...btnGhost, padding: "4px 10px", fontSize: 11 }} onClick={(e) => eliminarCarpeta(c, e)}>🗑️</button>
                  </td>
                </tr>
              ))}
              {archivos.map(a => (
                <tr key={`a-${a.id}`}>
                  <td style={td}><a href="#" onClick={(e) => verArchivo(a.archivo_url, e)}>📄 {a.nombre_original}</a></td>
                  <td style={td}>Archivo</td>
                  <td style={td}>{a.subido_por}</td>
                  <td style={td}>{new Date(a.fecha_subida).toLocaleDateString("es-EC")}</td>
                  <td style={td}>
                    <button style={{ ...btnGhost, padding: "4px 10px", fontSize: 11 }} onClick={() => eliminarArchivo(a)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
