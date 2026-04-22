// pages/VentasFormulario.jsx

import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL;

const ESTADOS = ["ACTIVO", "DETENIDO", "RE-PLANIFICADO", "FACTIBLE", "PLANIFICADO", "ASIGNADO"];
const PAGOS   = ["EFEC", "TC", "CA"];

const ESTADO_ESTILOS = {
  ACTIVO:          "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
  DETENIDO:        "bg-red-500/20 text-red-300 border border-red-500/40",
  "RE-PLANIFICADO":"bg-orange-500/20 text-orange-300 border border-orange-500/40",
  FACTIBLE:        "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40",
  PLANIFICADO:     "bg-blue-500/20 text-blue-300 border border-blue-500/40",
  ASIGNADO:        "bg-slate-500/20 text-slate-300 border border-slate-500/40",
};

const PAGO_ESTILOS = {
  EFEC: "bg-emerald-500/20 text-emerald-300",
  TC:   "bg-yellow-500/20 text-yellow-300",
  CA:   "bg-sky-500/20 text-sky-300",
};

const inputCls = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition text-sm";
const selectCls = "w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition text-sm";
const labelCls = "block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1";

// ── Modal Formulario ───────────────────────────────────────────────────────────
function ModalVenta({ modo, registro, onGuardar, onCerrar, cargando }) {
  const inicial = {
    id_bitrix: "", plan: "", valor_plan: "", login: "", ingreso_telcos: "",
    fecha_ingreso: "", estado: "ACTIVO", pago: "EFEC", tercerdad: false,
    observacion: "", check_cedula: false, check_foto_cartel: false, check_resumen: false,
  };
  const [form, setForm] = useState(registro ? {
    id_bitrix:        registro.id_bitrix        || "",
    plan:             registro.plan             || "",
    valor_plan:       registro.valor_plan       || "",
    login:            registro.login            || "",
    ingreso_telcos:   registro.ingreso_telcos != null ? String(registro.ingreso_telcos) : "",
    fecha_ingreso:    registro.fecha_ingreso ? registro.fecha_ingreso.split("T")[0] : "",
    estado:           registro.estado           || "ACTIVO",
    pago:             registro.pago             || "EFEC",
    tercerdad:        registro.tercerdad        || false,
    observacion:      registro.observacion      || "",
    check_cedula:     registro.check_cedula     || false,
    check_foto_cartel:registro.check_foto_cartel|| false,
    check_resumen:    registro.check_resumen    || false,
  } : inicial);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}>
      <div className="w-full max-w-lg bg-slate-900/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-blue-600/10">
          <h3 className="text-white font-black text-lg uppercase tracking-tight">
            {modo === "crear" ? "➕ Nueva Venta" : "✏️ Editar Venta"}
          </h3>
          <button onClick={onCerrar}
            className="text-slate-400 hover:text-white text-2xl leading-none transition-colors">×</button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* ID Bitrix */}
          <div>
            <label className={labelCls}>ID Bitrix</label>
            <input type="text" value={form.id_bitrix} onChange={e => set("id_bitrix", e.target.value)}
              placeholder="Ej: 12345" className={inputCls} />
          </div>

          {/* Login */}
          <div>
            <label className={labelCls}>Login</label>
            <input type="text" value={form.login} onChange={e => set("login", e.target.value)}
              placeholder="Ej: usuario.cliente" className={inputCls} />
          </div>

          {/* Plan */}
          <div>
            <label className={labelCls}>Plan</label>
            <input type="text" value={form.plan} onChange={e => set("plan", e.target.value)}
              placeholder="Ej: 850 MBPS" className={inputCls} />
          </div>

          {/* Valor del Plan (antes Ciudad) */}
          <div>
            <label className={labelCls}>Valor del Plan</label>
            <input type="text" value={form.valor_plan} onChange={e => set("valor_plan", e.target.value)}
              placeholder="Ej: $35.00" className={inputCls} />
          </div>

          {/* Ingreso Telcos */}
          <div>
            <label className={labelCls}>Ingreso Telcos</label>
            <input type="number" step="0.01" min="0" value={form.ingreso_telcos}
              onChange={e => set("ingreso_telcos", e.target.value)}
              placeholder="Ej: 120.50" className={inputCls} />
          </div>

          {/* Fecha Ingreso */}
          <div>
            <label className={labelCls}>Fecha de Ingreso</label>
            <input type="date" value={form.fecha_ingreso} onChange={e => set("fecha_ingreso", e.target.value)}
              className={inputCls + " [color-scheme:dark]"} />
          </div>

          {/* Estado + Pago */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Estado</label>
              <select value={form.estado} onChange={e => set("estado", e.target.value)} className={selectCls}>
                {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Pago</label>
              <select value={form.pago} onChange={e => set("pago", e.target.value)} className={selectCls}>
                {PAGOS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Tercera Edad */}
          <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
            <button type="button" onClick={() => set("tercerdad", !form.tercerdad)}
              className={`w-10 h-6 rounded-full transition-all duration-300 relative flex-shrink-0 ${form.tercerdad ? "bg-blue-500" : "bg-slate-600"}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300 ${form.tercerdad ? "translate-x-4" : "translate-x-0"}`} />
            </button>
            <span className="text-sm font-bold text-slate-300">
              Tercera Edad: <span className={form.tercerdad ? "text-emerald-400" : "text-red-400"}>
                {form.tercerdad ? "SÍ" : "NO"}
              </span>
            </span>
          </div>

          {/* Checklist documentos */}
          <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 space-y-2">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">✅ Checklist</p>
            {[
              { key: "check_cedula",      label: "Cédula ambos lados" },
              { key: "check_foto_cartel", label: "Foto Cartel" },
              { key: "check_resumen",     label: "Resumen" },
            ].map(({ key, label }) => (
              <button key={key} type="button"
                onClick={() => set(key, !form[key])}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-sm font-bold text-left
                  ${form[key]
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                    : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20"}`}>
                <span className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all
                  ${form[key] ? "bg-emerald-500 border-emerald-500" : "border-slate-500"}`}>
                  {form[key] && <span className="text-white text-xs font-black">✓</span>}
                </span>
                {label}
              </button>
            ))}
          </div>

          {/* Observación */}
          <div>
            <label className={labelCls}>Observación</label>
            <textarea
              value={form.observacion}
              onChange={e => set("observacion", e.target.value)}
              rows={3}
              placeholder="Notas adicionales sobre esta venta…"
              className={inputCls + " resize-none"}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onCerrar}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 font-bold text-sm transition-all">
            Cancelar
          </button>
          <button onClick={() => onGuardar(form)} disabled={cargando}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/40">
            {cargando ? "Guardando…" : modo === "crear" ? "Crear Registro" : "Guardar Cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Confirmar Eliminación ───────────────────────────────────────────────
function ModalEliminar({ registro, onConfirmar, onCerrar, cargando }) {
  if (!registro) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}>
      <div className="w-full max-w-sm bg-slate-900/95 border border-red-500/30 rounded-2xl shadow-2xl p-6 text-center">
        <div className="text-5xl mb-4">🗑️</div>
        <h3 className="text-white font-black text-lg mb-2">¿Eliminar registro?</h3>
        <p className="text-slate-400 text-sm mb-6">
          Venta #{registro.numero_venta} — ID Bitrix: <strong className="text-white">{registro.id_bitrix || "N/A"}</strong>
          <br />Esta acción no se puede deshacer.
        </p>
        <div className="flex gap-3">
          <button onClick={onCerrar}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:text-white font-bold text-sm transition-all">
            Cancelar
          </button>
          <button onClick={() => onConfirmar(registro.id)} disabled={cargando}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-sm transition-all disabled:opacity-50">
            {cargando ? "Eliminando…" : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── COMPONENTE PRINCIPAL ───────────────────────────────────────────────────────
export default function Ventas() {
  const [ventas, setVentas]               = useState([]);
  const [cargando, setCargando]           = useState(true);
  const [cargandoAccion, setCargandoAccion] = useState(false);
  const [error, setError]                 = useState(null);
  const [modal, setModal]                 = useState(null);
  const [filtroEstado, setFiltroEstado]   = useState("TODOS");
  const [toast, setToast]                 = useState(null);

  const userRaw = localStorage.getItem("userProfile");
  const user    = userRaw ? JSON.parse(userRaw) : {};
  const perfil  = user.perfil?.toLowerCase() || "";
  const token   = localStorage.getItem("token");

  const esAdmin     = perfil === "administrador";
  const esSoloVer   = ["supervisor", "analista", "gerencia"].includes(perfil);
  const puedeEditar = esAdmin || (!esSoloVer);
  const puedeEliminar = esAdmin;

  const mostrarToast = (msg, tipo = "ok") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Cargar ventas ─────────────────────────────────────────
  const cargarVentas = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/ventas`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || "Error al cargar");
      setVentas(data.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => { cargarVentas(); }, [cargarVentas]);

  // ── Crear / Editar ────────────────────────────────────────
  const guardarVenta = async (form) => {
    setCargandoAccion(true);
    try {
      const esEditar = modal.modo === "editar";
      const payload = {
        ...form,
        id_bitrix:        form.id_bitrix?.trim()        || null,
        plan:             form.plan?.trim()              || null,
        valor_plan:       form.valor_plan?.trim()        || null,
        login:            form.login?.trim()             || null,
        ingreso_telcos:   form.ingreso_telcos !== "" ? Number(form.ingreso_telcos) : null,
        fecha_ingreso:    form.fecha_ingreso             || null,
        observacion:      form.observacion?.trim()       || null,
        check_cedula:     form.check_cedula,
        check_foto_cartel:form.check_foto_cartel,
        check_resumen:    form.check_resumen,
      };

      const url    = esEditar ? `${API}/api/ventas/${modal.registro.id}` : `${API}/api/ventas`;
      const method = esEditar ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || "Error al guardar");
      mostrarToast(esEditar ? "✅ Registro actualizado" : "✅ Registro creado");
      setModal(null);
      cargarVentas();
    } catch (e) {
      mostrarToast(`❌ ${e.message}`, "error");
    } finally {
      setCargandoAccion(false);
    }
  };

  // ── Eliminar ──────────────────────────────────────────────
  const eliminarVenta = async (id) => {
    setCargandoAccion(true);
    try {
      const res = await fetch(`${API}/api/ventas/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || "Error al eliminar");
      mostrarToast("🗑️ Registro eliminado");
      setModal(null);
      cargarVentas();
    } catch (e) {
      mostrarToast(`❌ ${e.message}`, "error");
    } finally {
      setCargandoAccion(false);
    }
  };

  // ── Exportar CSV ──────────────────────────────────────────
  const exportarCSV = async () => {
    try {
      const res = await fetch(`${API}/api/ventas/exportar`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { mostrarToast("❌ Sin datos para exportar", "error"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ventas_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      mostrarToast("📥 Descarga iniciada");
    } catch {
      mostrarToast("❌ Error al exportar", "error");
    }
  };

  const contadores = ESTADOS.reduce((acc, e) => {
    acc[e] = ventas.filter(v => v.estado === e).length;
    return acc;
  }, {});

  const ventasFiltradas = filtroEstado === "TODOS"
    ? ventas
    : ventas.filter(v => v.estado === filtroEstado);

  // Columnas de la tabla (header dinámico)
  const colsHeader = ["#", "ID BITRIX", "LOGIN", "PLAN", "VALOR PLAN", "ING. TELCOS",
    "FECHA", "ESTADO", "PAGO", "3RA EDAD",
    ...(esAdmin || esSoloVer ? ["ASESOR"] : []),
    "ACCIONES"
  ];

  return (
    <div className="space-y-6 relative">

      {/* TOAST */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[9999] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl transition-all
          ${toast.tipo === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"}`}>
          {toast.msg}
        </div>
      )}

      {/* MODALES */}
      {modal?.modo !== "eliminar" && modal && (
        <ModalVenta
          modo={modal.modo}
          registro={modal.registro}
          onGuardar={guardarVenta}
          onCerrar={() => setModal(null)}
          cargando={cargandoAccion}
        />
      )}
      {modal?.modo === "eliminar" && (
        <ModalEliminar
          registro={modal.registro}
          onConfirmar={eliminarVenta}
          onCerrar={() => setModal(null)}
          cargando={cargandoAccion}
        />
      )}

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">📈 Ventas</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            {esSoloVer
              ? "Vista global de todos los asesores"
              : esAdmin
                ? "Gestión completa · Todos los asesores"
                : `Mis registros · ${user.usuario}`}
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={exportarCSV}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 font-bold text-sm transition-all">
            📥 Exportar CSV
          </button>
          {!esSoloVer && (
            <button onClick={() => setModal({ modo: "crear" })}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm transition-all shadow-lg shadow-blue-900/40">
              ➕ Agregar
            </button>
          )}
        </div>
      </div>

      {/* CONTADORES */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[{ label: "TODOS", val: ventas.length, icon: "📋" },
          ...ESTADOS.map(e => ({
            label: e, val: contadores[e] || 0,
            icon: { ACTIVO:"✅", DETENIDO:"🔴", "RE-PLANIFICADO":"🔄",
                    FACTIBLE:"🔵", PLANIFICADO:"📘", ASIGNADO:"📌" }[e]
          }))
        ].map(({ label, val, icon }) => (
          <button key={label} onClick={() => setFiltroEstado(label)}
            className={`text-center p-3 rounded-2xl border transition-all ${
              filtroEstado === label
                ? "bg-blue-600/20 border-blue-500/50 text-white"
                : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"
            }`}>
            <div className="text-xl">{icon}</div>
            <div className="text-lg font-black text-white">{val}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-70 truncate">{label}</div>
          </button>
        ))}
      </div>

      {/* TABLA */}
      <div className="bg-black/30 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden">
        {cargando ? (
          <div className="flex items-center justify-center py-20 text-slate-400 font-bold">
            <span className="animate-pulse">⏳ Cargando registros…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <span className="text-4xl">⚠️</span>
            <p className="text-red-400 font-bold">{error}</p>
            <button onClick={cargarVentas}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm">
              Reintentar
            </button>
          </div>
        ) : ventasFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
            <span className="text-5xl">📋</span>
            <p className="font-bold text-lg">Sin registros</p>
            {!esSoloVer && (
              <button onClick={() => setModal({ modo: "crear" })}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm">
                Crear primer registro
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  {colsHeader.map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ventasFiltradas.map((v, idx) => (
                  <tr key={v.id}
                    className={`border-b border-white/5 transition-colors hover:bg-white/5 ${idx % 2 === 0 ? "" : "bg-white/[0.02]"}`}>
                    <td className="px-4 py-3 text-slate-400 font-bold">{v.numero_venta}</td>
                    <td className="px-4 py-3 text-white font-mono text-xs">{v.id_bitrix || <span className="text-slate-600">—</span>}</td>
                    <td className="px-4 py-3 text-slate-300 text-xs">{v.login || <span className="text-slate-600">—</span>}</td>
                    <td className="px-4 py-3 text-slate-200 whitespace-nowrap">{v.plan || <span className="text-slate-600">—</span>}</td>
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{v.valor_plan || <span className="text-slate-600">—</span>}</td>
                    <td className="px-4 py-3 text-emerald-300 font-bold whitespace-nowrap">
                      {v.ingreso_telcos != null
                        ? `$${Number(v.ingreso_telcos).toFixed(2)}`
                        : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                      {v.fecha_ingreso
                        ? new Date(v.fecha_ingreso).toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit" })
                        : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase whitespace-nowrap ${ESTADO_ESTILOS[v.estado] || ""}`}>
                        {v.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${PAGO_ESTILOS[v.pago] || ""}`}>
                        {v.pago}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${v.tercerdad ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
                        {v.tercerdad ? "SÍ" : "NO"}
                      </span>
                    </td>
                    {(esAdmin || esSoloVer) && (
                      <td className="px-4 py-3 text-slate-400 text-xs font-bold whitespace-nowrap">
                        {v.nombre_asesor || "—"}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {puedeEditar && !esSoloVer && (
                          <button onClick={() => setModal({ modo: "editar", registro: v })} title="Editar"
                            className="w-8 h-8 rounded-lg bg-blue-600/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 flex items-center justify-center text-sm transition-all">
                            ✏️
                          </button>
                        )}
                        {puedeEliminar && (
                          <button onClick={() => setModal({ modo: "eliminar", registro: v })} title="Eliminar"
                            className="w-8 h-8 rounded-lg bg-red-600/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 flex items-center justify-center text-sm transition-all">
                            🗑️
                          </button>
                        )}
                        {esSoloVer && (
                          <span className="text-[10px] text-slate-600 font-bold px-2">Solo lectura</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!cargando && !error && (
        <p className="text-center text-xs text-slate-600 font-bold">
          {ventasFiltradas.length} registro{ventasFiltradas.length !== 1 ? "s" : ""} mostrado{ventasFiltradas.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
