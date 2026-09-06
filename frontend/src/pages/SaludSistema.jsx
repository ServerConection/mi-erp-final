// =============================================================================
// SALUD DEL SISTEMA — mapa de estado del ERP
//
// Responde de un vistazo lo que hoy solo se sabe mirando logs: que tuberia de
// datos esta viva y cual se congelo. Importa porque cuando un ETL se cae el ERP
// NO da error: los dashboards siguen pintando numeros, solo que viejos.
//
// Se actualiza SOLO cuando se pulsa "Actualizar" (o al entrar). Sin refresco
// automatico: este mapa se mira cuando se sospecha algo, no todo el rato.
// =============================================================================
import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL;

const COLOR = {
  OK:          { punto: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", texto: "Al día" },
  RETRASO:     { punto: "bg-amber-500",   chip: "bg-amber-50 text-amber-700 border-amber-200",       texto: "Con retraso" },
  CAIDO:       { punto: "bg-red-500",     chip: "bg-red-50 text-red-700 border-red-200",             texto: "Congelado" },
  DESCONOCIDO: { punto: "bg-stone-300",   chip: "bg-stone-50 text-stone-500 border-stone-200",       texto: "Sin dato" },
};

const fmtHora = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-EC", { timeZone: "America/Guayaquil" }); }
  catch { return String(iso); }
};

export default function SaludSistema() {
  const [data, setData]       = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError]     = useState("");

  const cargar = useCallback(async () => {
    setCargando(true); setError("");
    try {
      const r = await fetch(`${API}/api/salud`);
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "No se pudo consultar el estado");
      setData(d);
    } catch (e) {
      setError(e.message || "No se pudo consultar el estado");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const general = data?.resumen?.estado_general || "DESCONOCIDO";
  const grupos = (data?.componentes || []).reduce((acc, c) => {
    (acc[c.grupo] = acc[c.grupo] || []).push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="bg-[#1A3A6E] text-white p-5 rounded-2xl flex flex-wrap justify-between items-center gap-4 shadow-xl border-b-4 border-[#0f2550]">
        <div>
          <h2 className="text-lg font-black italic tracking-tighter uppercase flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${COLOR[general].punto}`} />
            Salud del sistema
          </h2>
          <p className="text-[9px] font-bold text-blue-300 tracking-[0.2em] uppercase mt-1">
            Qué tubería de datos está viva y cuál se congeló
          </p>
        </div>
        <div className="flex items-center gap-4">
          {data && (
            <div className="text-right text-[10px] text-blue-200 leading-tight">
              <div><b className="text-white">{data.resumen.ok}</b> al día · <b className="text-white">{data.resumen.retraso}</b> con retraso · <b className="text-white">{data.resumen.caido}</b> congelados</div>
              <div className="opacity-70">Consultado: {fmtHora(data.generado_en)}</div>
            </div>
          )}
          <button
            onClick={cargar}
            disabled={cargando}
            className="h-[38px] px-5 rounded-xl text-[10px] font-black uppercase bg-white/10 hover:bg-white/20 border border-white/20 transition-all active:scale-95 disabled:opacity-60"
          >
            {cargando ? "Consultando…" : "🔄 Actualizar"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">
          ⚠️ {error}
        </p>
      )}

      {/* Aviso de alcance: honesto sobre lo que este mapa NO ve */}
      <p className="text-[10px] text-stone-500 bg-stone-50 border border-stone-200 rounded-xl px-4 py-2">
        Este mapa consulta la base de producción (Render). Las tablas de JotForm viven en el
        Postgres local de la oficina y no son visibles desde aquí, por eso no aparecen.
      </p>

      {/* Componentes por grupo */}
      {Object.entries(grupos).map(([grupo, items]) => (
        <div key={grupo} className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-stone-100 bg-stone-50">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#1A3A6E]">{grupo}</span>
          </div>
          <div className="divide-y divide-stone-100">
            {items.map((c) => (
              <div key={c.id} className="px-5 py-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[240px] flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${COLOR[c.estado].punto}`} />
                    <span className="text-sm font-bold text-stone-800">{c.nombre}</span>
                    {c.critico && (
                      <span className="text-[8px] font-black uppercase tracking-wider text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                        Crítico
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1 ml-[18px]">{c.detalle}</p>
                  {c.error && (
                    <p className="text-[10px] text-red-500 mt-1 ml-[18px] font-mono">{c.error}</p>
                  )}
                </div>
                <div className="text-right">
                  <span className={`inline-block text-[9px] font-black uppercase tracking-wider border px-2 py-1 rounded-lg ${COLOR[c.estado].chip}`}>
                    {COLOR[c.estado].texto}
                  </span>
                  <div className="text-[11px] font-bold text-stone-700 mt-1">{c.medida}</div>
                  {c.ultimo && (
                    <div className="text-[9px] text-stone-400">último dato: {fmtHora(c.ultimo)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {!cargando && !data && !error && (
        <div className="py-16 text-center text-stone-400 text-sm">Sin datos todavía.</div>
      )}
    </div>
  );
}
