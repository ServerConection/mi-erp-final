// src/pages/PilotoLlamadas.jsx
// ============================================================================
// PILOTO LLAMADAS PC (solo ADMINISTRADOR)
//  - Activa/desactiva el piloto por asesor.
//  - Al activar se genera la CLAVE DE PC (se muestra una sola vez) que se pega
//    al instalar el agente en la PC del asesor.
// Backend: /api/piloto-llamadas (backend/src/routes/pilotoLlamadas.routes.js)
// ============================================================================
import { useState, useEffect, useCallback } from "react";

const API = `${import.meta.env.VITE_API_URL}/api/piloto-llamadas`;
const authH = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
  "Content-Type": "application/json",
});

export default function PilotoLlamadas() {
  const [lista, setLista] = useState([]);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState([]);
  const [clave, setClave] = useState(null); // { nombre, clave }
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [reporte, setReporte] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`${API}/admin`, { headers: authH() });
      const d = await r.json();
      if (d.success) setLista(d.data);
      else setError(d.error || "No se pudo cargar");
    } catch {
      setError("No se pudo conectar con el servidor");
    }
  }, []);

  const cargarReporte = useCallback(async () => {
    try {
      const r = await fetch(`${API}/admin/reporte`, { headers: authH() });
      const d = await r.json();
      if (d.success) setReporte(d);
    } catch { /* el reporte es opcional */ }
  }, []);

  useEffect(() => { cargar(); cargarReporte(); }, [cargar, cargarReporte]);

  const buscar = async (e) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    const r = await fetch(`${API}/admin/usuarios?q=${encodeURIComponent(q.trim())}`, { headers: authH() });
    const d = await r.json();
    setResultados(d.success ? d.data : []);
  };

  const activar = async (usuario) => {
    const nombre = usuario.nombre || usuario.usuario;
    if (!confirm(`¿Activar el piloto para ${nombre}? Se generará una clave nueva para su PC (la anterior deja de servir).`)) return;
    setCargando(true);
    try {
      const r = await fetch(`${API}/admin/activar`, {
        method: "POST", headers: authH(), body: JSON.stringify({ usuario_id: usuario.id ?? usuario.usuario_id }),
      });
      const d = await r.json();
      if (d.success) { setClave({ nombre, clave: d.clave }); setResultados([]); setQ(""); cargar(); cargarReporte(); }
      else alert(d.error || "No se pudo activar");
    } finally { setCargando(false); }
  };

  const desactivar = async (fila) => {
    if (!confirm(`¿Desactivar el piloto para ${fila.nombre || fila.usuario}?`)) return;
    const r = await fetch(`${API}/admin/desactivar`, {
      method: "POST", headers: authH(), body: JSON.stringify({ usuario_id: fila.usuario_id }),
    });
    const d = await r.json();
    if (d.success) { cargar(); cargarReporte(); } else alert(d.error || "No se pudo desactivar");
  };

  const fecha = (v) => (v ? new Date(v).toLocaleString("es-EC") : "—");

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">📞 Piloto Llamadas PC</h1>
        <p className="text-sm text-slate-500">
          Solo los asesores activos aquí ven el botón "Llamar (PC)" y el número oculto. El resto del ERP no cambia.
        </p>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>}

      {reporte && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ["Asesores activos", reporte.resumen.asesores_activos],
              ["Llamadas hoy", reporte.resumen.llamadas_hoy],
              ["Últimos 7 días", reporte.resumen.llamadas_semana],
              ["Total", reporte.resumen.llamadas_total],
            ].map(([t, v]) => (
              <div key={t} className="bg-white border rounded-xl p-4">
                <div className="text-2xl font-bold text-slate-800 tabular-nums">{v}</div>
                <div className="text-xs text-slate-500">{t}</div>
              </div>
            ))}
          </div>
          {reporte.porDia?.length > 0 && (
            <div className="bg-white border rounded-xl p-4">
              <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Llamadas por día (14 días)</div>
              <div className="flex items-end gap-1 h-24">
                {(() => {
                  const max = Math.max(...reporte.porDia.map(d => d.llamadas), 1);
                  return reporte.porDia.map(d => (
                    <div key={d.dia} className="flex-1 flex flex-col items-center justify-end" title={`${d.dia}: ${d.llamadas}`}>
                      <div className="w-full bg-emerald-500 rounded-t" style={{ height: `${(d.llamadas / max) * 100}%` }} />
                      <div className="text-[9px] text-slate-400 mt-1">{d.dia.slice(5)}</div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {clave && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
          <div className="font-semibold text-amber-800">Clave de PC para {clave.nombre}</div>
          <p className="text-xs text-amber-700 mb-2">
            Cópiala ahora: no se vuelve a mostrar. Se pega al instalar el agente en la PC del asesor.
          </p>
          <div className="flex gap-2 items-center">
            <code className="bg-white border rounded px-3 py-2 text-sm break-all flex-1">{clave.clave}</code>
            <button onClick={() => navigator.clipboard.writeText(clave.clave)}
              className="text-xs bg-amber-600 text-white px-3 py-2 rounded-lg hover:bg-amber-700">Copiar</button>
            <button onClick={() => setClave(null)}
              className="text-xs bg-white border px-3 py-2 rounded-lg">Cerrar</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="font-semibold text-slate-700">Agregar asesor al piloto</div>
        <form onSubmit={buscar} className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Usuario o nombre…"
            className="flex-1 border rounded-lg px-3 py-2 text-sm" />
          <button className="text-sm bg-slate-800 text-white px-4 py-2 rounded-lg">Buscar</button>
        </form>
        {resultados.map((u) => (
          <div key={u.id} className="flex items-center justify-between border-t pt-2 text-sm">
            <div>
              <span className="font-medium">{u.nombre || u.usuario}</span>
              <span className="text-slate-400"> · {u.usuario} · {u.empresa} · {u.perfil}</span>
            </div>
            <button disabled={cargando} onClick={() => activar(u)}
              className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-60">
              Activar
            </button>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Asesor</th>
              <th className="text-left px-4 py-2">Estado</th>
              <th className="text-left px-4 py-2">Llamadas</th>
              <th className="text-left px-4 py-2">Última llamada</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Nadie en el piloto todavía.</td></tr>
            )}
            {lista.map((f) => (
              <tr key={f.usuario_id} className="border-t">
                <td className="px-4 py-2">
                  <div className="font-medium">{f.nombre || f.usuario}</div>
                  <div className="text-xs text-slate-400">{f.usuario} · {f.empresa}</div>
                </td>
                <td className="px-4 py-2">
                  {f.activo
                    ? <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">Activo</span>
                    : <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full">Inactivo</span>}
                </td>
                <td className="px-4 py-2 tabular-nums">{f.llamadas}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{fecha(f.ultima_llamada)}</td>
                <td className="px-4 py-2 text-right space-x-2">
                  {f.activo ? (
                    <>
                      <button onClick={() => activar(f)}
                        className="text-xs border px-3 py-1.5 rounded-lg hover:bg-slate-50">Nueva clave</button>
                      <button onClick={() => desactivar(f)}
                        className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700">Desactivar</button>
                    </>
                  ) : (
                    <button onClick={() => activar(f)}
                      className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700">Activar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
