// Reporte de uso de Campañas Masivas por empresa, supervisor y asesor.
// Visible solo para ADMINISTRADOR y usuarios autorizados (el backend también lo valida).
import { useEffect, useState } from "react";

const API = `${import.meta.env.VITE_API_URL}/api/wa`;
const USUARIOS_REPORTE = ["acloaiza"];

export const puedeVerReporteCampanas = () => {
  try {
    const u = JSON.parse(localStorage.getItem("userProfile") || "{}");
    return String(u.perfil || "").toUpperCase() === "ADMINISTRADOR"
      || USUARIOS_REPORTE.includes(String(u.usuario || "").toLowerCase());
  } catch { return false; }
};

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(new Date());
const inicioMes = () => `${hoy().slice(0, 8)}01`;
const num = (n) => Number(n || 0).toLocaleString("es-EC");
const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

function Tabla({ titulo, filas, mostrarEmpresa = true }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800 text-sm">{titulo}</h3>
        <span className="text-xs text-slate-400">{filas.length} usuario(s)</span>
      </div>
      {filas.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400">Sin campañas en este rango.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-3 py-2">Usuario</th>
                {mostrarEmpresa && <th className="text-left px-3 py-2">Empresa</th>}
                <th className="text-right px-3 py-2">Campañas</th>
                <th className="text-right px-3 py-2">Ejecutadas</th>
                <th className="text-right px-3 py-2">Destinatarios</th>
                <th className="text-right px-3 py-2">Enviados</th>
                <th className="text-right px-3 py-2">Fallidos</th>
                <th className="text-right px-3 py-2">Leídos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((f, i) => (
                <tr key={`${f.usuario_id}-${i}`} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{f.nombre || f.usuario}</div>
                    <div className="text-xs text-slate-400">{f.usuario}</div>
                  </td>
                  {mostrarEmpresa && <td className="px-3 py-2 text-slate-600">{f.empresa}</td>}
                  <td className="px-3 py-2 text-right">{num(f.campanas)}</td>
                  <td className="px-3 py-2 text-right">{num(f.ejecutadas)}</td>
                  <td className="px-3 py-2 text-right">{num(f.destinatarios)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-green-700">{num(f.enviados)}</td>
                  <td className="px-3 py-2 text-right text-red-600">{num(f.fallidos)}</td>
                  <td className="px-3 py-2 text-right text-sky-700">{num(f.leidos)} <span className="text-xs text-slate-400">({pct(f.leidos, f.enviados)})</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ReporteUsoCampanas({ onClose }) {
  const [filtros, setFiltros] = useState({ desde: inicioMes(), hasta: hoy(), empresa: "TODAS" });
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const cargar = async (f = filtros) => {
    setCargando(true); setError("");
    try {
      const qs = new URLSearchParams(f);
      const r = await fetch(`${API}/campaigns/report/usage?${qs}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || "No se pudo cargar el reporte");
      setData(d.data);
    } catch (e) { setError(e.message); setData(null); }
    finally { setCargando(false); }
  };

  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cambiar = (campo, valor) => setFiltros(prev => ({ ...prev, [campo]: valor }));
  const t = data?.total;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-y-auto">
        <div className="bg-white p-5 border-b border-slate-100 flex items-start justify-between sticky top-0 z-10">
          <div>
            <h3 className="font-bold text-slate-800">📊 Reporte de uso de campañas</h3>
            <p className="text-xs text-slate-500 mt-1">Quién usa más las campañas, por empresa, supervisor y asesor.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <label className="text-xs font-semibold text-slate-500">DESDE
              <input type="date" value={filtros.desde} onChange={e => cambiar("desde", e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-500">HASTA
              <input type="date" value={filtros.hasta} onChange={e => cambiar("hasta", e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-500">EMPRESA
              <select value={filtros.empresa} onChange={e => cambiar("empresa", e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                {["TODAS", "NOVONET", "VELSA", "SEMILLERO", "VENTAENLINEA"].map(e =>
                  <option key={e} value={e}>{e === "VENTAENLINEA" ? "VENTA EN LÍNEA" : e}</option>)}
              </select>
            </label>
            <button onClick={() => cargar()} disabled={cargando}
              className="bg-green-600 hover:bg-green-500 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {cargando ? "Consultando…" : "Consultar"}
            </button>
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

          {t && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[["Campañas", t.campanas, "text-slate-800"], ["Destinatarios", t.destinatarios, "text-slate-800"],
                ["Enviados", t.enviados, "text-green-700"], ["Fallidos", t.fallidos, "text-red-600"],
                ["Leídos", t.leidos, "text-sky-700"]].map(([l, v, c]) => (
                <div key={l} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                  <div className={`text-xl font-bold ${c}`}>{num(v)}</div>
                  <div className="text-xs text-slate-500">{l}</div>
                </div>
              ))}
            </div>
          )}

          {data && (
            <>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100"><h3 className="font-semibold text-slate-800 text-sm">Por empresa</h3></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                      <tr><th className="text-left px-3 py-2">Empresa</th><th className="text-right px-3 py-2">Usuarios</th>
                        <th className="text-right px-3 py-2">Campañas</th><th className="text-right px-3 py-2">Enviados</th>
                        <th className="text-right px-3 py-2">Fallidos</th><th className="text-right px-3 py-2">Leídos</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.empresas.map(e => (
                        <tr key={e.empresa}>
                          <td className="px-3 py-2 font-medium text-slate-800">{e.empresa}</td>
                          <td className="px-3 py-2 text-right">{num(e.usuarios)}</td>
                          <td className="px-3 py-2 text-right">{num(e.campanas)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-green-700">{num(e.enviados)}</td>
                          <td className="px-3 py-2 text-right text-red-600">{num(e.fallidos)}</td>
                          <td className="px-3 py-2 text-right text-sky-700">{num(e.leidos)}</td>
                        </tr>
                      ))}
                      {!data.empresas.length && <tr><td colSpan={6} className="p-6 text-center text-slate-400">Sin campañas en este rango.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
              <Tabla titulo="🏆 Supervisores (ordenados por enviados)" filas={data.supervisores} />
              <Tabla titulo="👤 Asesores (ordenados por enviados)" filas={data.asesores} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
