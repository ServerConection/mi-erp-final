/**
 * WaLineasDashboard.jsx — Control de líneas WhatsApp por empresa y asesor
 *
 * Muestra, agrupado por empresa → asesor, cuántas líneas tiene cada uno,
 * el número vinculado y si está conectada o no.
 *
 * Visibilidad (la aplica el backend en /api/wa/lines/dashboard):
 *   ADMINISTRADOR → todas las empresas
 *   GERENCIA / ANALISTA / SUPERVISOR → solo su empresa
 *   ASESOR → solo sus propias líneas
 */
import { useState, useEffect, useCallback } from "react";

const API = `${import.meta.env.VITE_API_URL}/api/wa`;
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

const ESTADO_UI = {
  connected:    { label: "Conectada",    cls: "bg-green-100 text-green-700 border-green-200" },
  connecting:   { label: "Conectando…",  cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  qr_ready:     { label: "Esperando QR", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  logged_out:   { label: "Sesión cerrada", cls: "bg-orange-100 text-orange-700 border-orange-200" },
  error:        { label: "Error",        cls: "bg-red-100 text-red-600 border-red-200" },
  disconnected: { label: "Desconectada", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  deleted:      { label: "Dada de baja", cls: "bg-slate-100 text-slate-400 border-slate-200" },
};
const estadoUI = (e) => ESTADO_UI[e] || ESTADO_UI.disconnected;

const fechaLocal = (fecha) => {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
};

const fechaCorta = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-EC", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
};

export default function WaLineasDashboard() {
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [soloSinConectar, setSoloSinConectar] = useState(false);
  const [soloConectados, setSoloConectados] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [fechas, setFechas] = useState(() => {
    const hoy = new Date();
    return {
      desde: fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
      hasta: fechaLocal(hoy),
    };
  });
  const [fechasAplicadas, setFechasAplicadas] = useState(fechas);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/lines/dashboard`, { headers: authH() });
      const d = await r.json();
      if (d.success) {
        setData(Array.isArray(d.data) ? d.data : []);
        setError("");
      } else {
        setError(d.error || "No se pudo cargar el panel de líneas");
      }
    } catch {
      setError("No se pudo cargar el panel de líneas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Refresco periódico: el estado de conexión cambia solo
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  // Filtros en cliente (búsqueda por asesor/número/nombre de línea)
  const q = busqueda.trim().toLowerCase();
  const todasLasLineas = data.flatMap(emp => emp.asesores.flatMap(a => a.lineas));
  const sinFecha = todasLasLineas.filter(l => !l.created_at || !Number.isFinite(new Date(l.created_at).getTime())).length;
  const filtroFechasActivo = Boolean(fechasAplicadas.desde || fechasAplicadas.hasta);
  const rangoInvalido = fechas.desde && fechas.hasta && fechas.desde > fechas.hasta;
  const fechasPendientes = fechas.desde !== fechasAplicadas.desde || fechas.hasta !== fechasAplicadas.hasta;
  const inicio = fechasAplicadas.desde ? new Date(`${fechasAplicadas.desde}T00:00:00`).getTime() : null;
  const fin = fechasAplicadas.hasta ? new Date(`${fechasAplicadas.hasta}T00:00:00`) : null;
  if (fin) fin.setDate(fin.getDate() + 1);
  const dataFiltrada = data
    .map(emp => {
      const asesores = emp.asesores
        .map(a => {
          const lineas = a.lineas.filter(l => {
            if (inicio !== null || fin !== null) {
              const creacion = l.created_at ? new Date(l.created_at).getTime() : NaN;
              if (!Number.isFinite(creacion)) return false;
              if (inicio !== null && creacion < inicio) return false;
              if (fin !== null && creacion >= fin.getTime()) return false;
            }
            if (soloSinConectar && l.estado === "connected") return false;
            if (soloConectados && l.estado !== "connected") return false;
            if (!q) return true;
            return (
              a.usuario.toLowerCase().includes(q) ||
              (a.nombre || "").toLowerCase().includes(q) ||
              (l.name || "").toLowerCase().includes(q) ||
              (l.phone_number || "").includes(q)
            );
          });
          return { ...a, lineas, total: lineas.length, conectadas: lineas.filter(l => l.estado === "connected").length };
        })
        .filter(a => a.lineas.length > 0);
      return {
        ...emp, asesores,
        total: asesores.reduce((n, a) => n + a.total, 0),
        conectadas: asesores.reduce((n, a) => n + a.conectadas, 0),
      };
    })
    .filter(emp => emp.asesores.length > 0)
    .sort((a, b) => {
      const orden = { NOVONET: 0, VELSA: 1 };
      return (orden[a.empresa.toUpperCase()] ?? 2) - (orden[b.empresa.toUpperCase()] ?? 2);
    });

  const resumen = {
    empresas: dataFiltrada.length,
    asesores: dataFiltrada.reduce((n, emp) => n + emp.asesores.length, 0),
    lineas: dataFiltrada.reduce((n, emp) => n + emp.total, 0),
    conectadas: dataFiltrada.reduce((n, emp) => n + emp.conectadas, 0),
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">📊 Control de líneas WhatsApp</h1>
        <p className="text-sm text-slate-500 mt-1">
          Quién tiene línea vinculada, cuántas y en qué estado. Se actualiza cada 20 s.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {/* Resumen */}
      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { l: "Empresas",    v: resumen.empresas,   c: "text-slate-700" },
            { l: "Asesores",    v: resumen.asesores,   c: "text-slate-700" },
            { l: "Líneas",      v: resumen.lineas,     c: "text-slate-700" },
            { l: "Conectadas",  v: resumen.conectadas, c: "text-green-600" },
          ].map(k => (
            <div key={k.l} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-400 uppercase tracking-wide">{k.l}</div>
              <div className={`text-2xl font-bold mt-1 ${k.c}`}>{k.v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Controles */}
      <fieldset className="flex flex-wrap items-end gap-3 mb-3">
        <legend className="text-sm font-medium text-slate-600 mb-2">Fecha de creación de la línea</legend>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Desde
          <input
            type="date"
            value={fechas.desde}
            max={fechas.hasta || undefined}
            onChange={e => setFechas(v => ({ ...v, desde: e.target.value }))}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Hasta
          <input
            type="date"
            value={fechas.hasta}
            min={fechas.desde || undefined}
            onChange={e => setFechas(v => ({ ...v, hasta: e.target.value }))}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setFechas({ desde: "", hasta: "" });
            setFechasAplicadas({ desde: "", hasta: "" });
            load();
          }}
          className="text-sm px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
        >
          Todas las fechas
        </button>
        {[
          { label: "Hoy", offset: 0 },
          { label: "Ayer", offset: -1 },
        ].map(({ label, offset }) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              const dia = new Date();
              dia.setDate(dia.getDate() + offset);
              const fecha = fechaLocal(dia);
              const rango = { desde: fecha, hasta: fecha };
              setFechas(rango);
              setFechasAplicadas(rango);
              load();
            }}
            className="text-sm px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          disabled={Boolean(rangoInvalido)}
          onClick={() => {
            setFechasAplicadas({ ...fechas });
            load();
          }}
          className="text-sm px-4 py-2 rounded-lg border border-green-600 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Consultar
        </button>
      </fieldset>
      {fechasPendientes && !rangoInvalido && (
        <p className="text-sm text-slate-500 mb-3">Pulsa «Consultar» para aplicar las fechas seleccionadas.</p>
      )}
      {filtroFechasActivo && sinFecha > 0 && (
        <p role="status" className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          {sinFecha} línea{sinFecha !== 1 ? "s" : ""} sin fecha de creación en la respuesta del servidor.
          {" "}No se pueden incluir en el rango consultado. Para verlas, pulsa «Todas las fechas».
          {" "}Si acabas de actualizar el sistema, reinicia el backend para que envíe la fecha de creación.
        </p>
      )}
      {rangoInvalido && (
        <p role="alert" className="text-sm text-red-600 mb-3">La fecha Desde no puede ser posterior a Hasta.</p>
      )}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Buscar asesor, línea o número…"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="flex-1 min-w-[220px] border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
        />
        <button
          aria-pressed={soloSinConectar}
          onClick={() => { setSoloSinConectar(v => !v); setSoloConectados(false); }}
          className={`text-sm px-4 py-2 rounded-lg border transition-colors ${
            soloSinConectar
              ? "bg-red-50 border-red-200 text-red-600"
              : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
          }`}
        >
          {soloSinConectar ? "◉ Solo no conectadas" : "○ Solo no conectadas"}
        </button>
        <button
          aria-pressed={soloConectados}
          onClick={() => { setSoloConectados(v => !v); setSoloSinConectar(false); }}
          className={`text-sm px-4 py-2 rounded-lg border transition-colors ${
            soloConectados
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
          }`}
        >
          Solo conectados
        </button>
        <button
          onClick={load}
          className="text-sm px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-300 transition-colors"
        >
          ⟳ Actualizar
        </button>
      </div>

      {dataFiltrada.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-5xl mb-3">📭</div>
          <div className="font-medium text-slate-500">Sin resultados</div>
          <p className="text-sm mt-2">
            {todasLasLineas.length > 0
              ? `Hay ${todasLasLineas.length} líneas disponibles, pero ninguna coincide con los filtros actuales.`
              : "El servidor no devolvió líneas disponibles para tu usuario."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {dataFiltrada.map(emp => (
            <div key={emp.empresa} className="min-w-0 bg-white border border-slate-200 rounded-xl overflow-hidden">
              {/* Cabecera empresa */}
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                <h2 className="font-bold text-slate-800">🏢 {emp.empresa}</h2>
                <span className="text-xs text-slate-500">
                  <span className="font-semibold text-green-600">{emp.conectadas}</span>
                  {" "}de {emp.total} conectadas
                </span>
              </div>

              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                    <th className="px-4 py-2 font-medium">Asesor</th>
                    <th className="px-4 py-2 font-medium">Línea</th>
                    <th className="px-4 py-2 font-medium">Número</th>
                    <th className="px-4 py-2 font-medium">Estado</th>
                    <th className="px-4 py-2 font-medium">Última conexión</th>
                  </tr>
                </thead>
                <tbody>
                  {emp.asesores.map(a =>
                    a.lineas.map((l, i) => (
                      <tr key={l.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 align-top">
                          {i === 0 ? (
                            <div>
                              <div className="font-medium text-slate-700">{a.usuario}</div>
                              {a.nombre && a.nombre !== a.usuario && (
                                <div className="text-xs text-slate-400">{a.nombre}</div>
                              )}
                              <div className="text-xs text-slate-400 mt-0.5">
                                {a.total} línea{a.total !== 1 ? "s" : ""} · {a.conectadas} conectada{a.conectadas !== 1 ? "s" : ""}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300">↳</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{l.name}</td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {l.phone_number ? `+${l.phone_number}` : "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex whitespace-nowrap text-xs font-medium px-2.5 py-1 rounded-full border ${estadoUI(l.estado).cls}`}>
                            {estadoUI(l.estado).label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-400 text-xs">
                          {fechaCorta(l.last_connected)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
