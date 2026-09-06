// =============================================================================
// REPORTE GERENCIAL — salud comercial de Novonet y Velsa en una pantalla
//
// Para dirección: cuánto entró, cuánto se activó, cuánto costó y desde qué
// punto el mes es rentable. Cada empresa con su propio bloque y su propio
// color, porque son operaciones distintas y compararlas mezcladas engaña.
//
// El ARPU (lo que deja en promedio una venta) NO vive en la base: depende del
// mix de planes del mes. Lo pone gerencia aquí arriba, y de ahí sale todo el
// bloque de rentabilidad. Sin ese número, el punto de equilibrio no existe.
// =============================================================================
import { useState, useCallback, useEffect } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";

const API = import.meta.env.VITE_API_URL;

const TEMA = {
  novonet: { fuerte: "#1A3A6E", suave: "#93c5fd", acento: "#2563eb", fondo: "bg-[#1A3A6E]" },
  velsa:   { fuerte: "#c2410c", suave: "#fdba74", acento: "#ea580c", fondo: "bg-[#c2410c]" },
};

const hoyEc = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });
const primerDiaMes = () => hoyEc().slice(0, 8) + "01";

const money = (v) => (v === null || v === undefined ? "—" : `$${Number(v).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const num   = (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("es-EC"));
const pct   = (v) => (v === null || v === undefined ? "—" : `${Number(v).toFixed(1)}%`);
const dia   = (f) => (f ? f.slice(8, 10) + "/" + f.slice(5, 7) : "");

function Kpi({ etiqueta, valor, ayuda, resaltado }) {
  return (
    <div className={`rounded-xl border p-3 ${resaltado ? "border-stone-300 bg-stone-50" : "border-stone-200 bg-white"}`}>
      <div className="text-[9px] font-black uppercase tracking-widest text-stone-400">{etiqueta}</div>
      <div className="text-lg font-black text-stone-800 leading-tight mt-0.5">{valor}</div>
      {ayuda && <div className="text-[9px] text-stone-400 mt-0.5">{ayuda}</div>}
    </div>
  );
}

function BloqueEmpresa({ emp }) {
  const t = TEMA[emp.empresa] || TEMA.novonet;
  const k = emp.kpis;
  const eq = emp.equilibrio;

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
      <div className={`${t.fondo} text-white px-5 py-3 flex flex-wrap items-center justify-between gap-3`}>
        <h3 className="text-sm font-black italic uppercase tracking-tight">{emp.nombre}</h3>
        {!emp.inversion_disponible && (
          <span className="text-[9px] font-bold bg-white/15 border border-white/25 px-2 py-1 rounded-lg">
            Sin datos de inversión — solo volumen
          </span>
        )}
      </div>

      {emp.error ? (
        <p className="p-5 text-[11px] text-red-600 font-mono">No se pudo consultar: {emp.error}</p>
      ) : (
        <div className="p-5 space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <Kpi etiqueta="Ingresos"      valor={num(k?.ingresos)} />
            <Kpi etiqueta="Gestionables"  valor={num(k?.gestionables)} ayuda={pct(k?.pct_gestionable) + " de ingresos"} />
            <Kpi etiqueta="Activas"       valor={num(k?.activas)} ayuda={pct(k?.pct_efectividad) + " de ingresos"} />
            <Kpi etiqueta="Inversión"     valor={money(k?.inversion)} />
            <Kpi etiqueta="Costo x venta" valor={money(k?.cpa)} ayuda="CPA" resaltado />
            <Kpi etiqueta="Costo x lead"  valor={money(k?.cpl)} ayuda="CPL" />
            <Kpi etiqueta="Efectividad"   valor={pct(k?.pct_efectividad)} ayuda="activas / ingresos" />
          </div>

          {/* Grafico: volumen (barras) + inversion (linea, eje derecho) */}
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <ComposedChart data={emp.dias} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                <XAxis dataKey="fecha" tickFormatter={dia} tick={{ fontSize: 10, fill: "#78716c" }} />
                <YAxis yAxisId="izq" tick={{ fontSize: 10, fill: "#78716c" }} />
                <YAxis yAxisId="der" orientation="right" tick={{ fontSize: 10, fill: t.acento }}
                       tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  labelFormatter={(f) => `Día ${f}`}
                  formatter={(v, n) => (n === "Inversión" ? money(v) : num(v))}
                  contentStyle={{ fontSize: 11, borderRadius: 10, border: "1px solid #e7e5e4" }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar  yAxisId="izq" dataKey="ingresos" name="Ingresos" fill={t.suave} radius={[3, 3, 0, 0]} />
                <Bar  yAxisId="izq" dataKey="activas"  name="Activas"  fill={t.fuerte} radius={[3, 3, 0, 0]} />
                <Line yAxisId="der" dataKey="inversion" name="Inversión" stroke={t.acento}
                      strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Punto de equilibrio */}
          {eq ? (
            <div className={`rounded-xl border p-4 ${eq.rentable ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
              <div className="text-[10px] font-black uppercase tracking-widest mb-2 text-stone-600">
                Punto de equilibrio · con ARPU de {money(eq.arpu)} por venta
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-[9px] uppercase text-stone-500">Ingreso estimado</div>
                  <div className="font-black text-stone-800">{money(eq.ingreso_estimado)}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-stone-500">Margen</div>
                  <div className={`font-black ${eq.margen >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {money(eq.margen)}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-stone-500">Activas para equilibrio</div>
                  <div className="font-black text-stone-800">{num(eq.activas_para_equilibrio)}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-stone-500">
                    {eq.diferencia_activas >= 0 ? "Activas sobre el punto" : "Activas faltantes"}
                  </div>
                  <div className={`font-black ${eq.diferencia_activas >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {num(Math.abs(eq.diferencia_activas))}
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-stone-500 mt-3">
                Mientras el <b>costo por venta</b> ({money(k?.cpa)}) esté por debajo del ARPU ({money(eq.arpu)}),
                cada venta adicional suma margen. Si lo supera, cada venta cuesta más de lo que deja.
              </p>
            </div>
          ) : (
            <p className="text-[10px] text-stone-400 border border-dashed border-stone-300 rounded-xl p-3">
              Escribe arriba cuánto deja en promedio una venta (ARPU) para ver el punto de equilibrio.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReporteGerencial() {
  const [desde, setDesde] = useState(primerDiaMes());
  const [hasta, setHasta] = useState(hoyEc());
  const [arpu, setArpu]   = useState("");
  const [data, setData]   = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true); setError("");
    try {
      const p = new URLSearchParams({ fechaDesde: desde, fechaHasta: hasta });
      if (Number(arpu) > 0) p.set("arpu", String(Number(arpu)));
      const r = await fetch(`${API}/api/reporte-gerencial?${p.toString()}`);
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "No se pudo generar el reporte");
      setData(d);
    } catch (e) {
      setError(e.message || "No se pudo generar el reporte");
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, arpu]);

  useEffect(() => { cargar(); }, []);   // primera carga; después, con el botón

  return (
    <div className="space-y-5">
      <div className="bg-stone-900 text-white p-5 rounded-2xl shadow-xl border-b-4 border-stone-700">
        <h2 className="text-lg font-black italic tracking-tighter uppercase">📈 Reporte Gerencial</h2>
        <p className="text-[9px] font-bold text-stone-400 tracking-[0.2em] uppercase mt-1">
          Salud comercial · Novonet y Velsa · volumen, costo y rentabilidad
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              className="border border-stone-300 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-stone-800" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              className="border border-stone-300 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-stone-800" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">
              ARPU · lo que deja una venta (USD)
            </label>
            <input type="number" min="0" step="0.01" value={arpu} placeholder="ej. 25.00"
              onChange={(e) => setArpu(e.target.value)}
              className="border border-stone-300 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-stone-800 w-44" />
          </div>
          <button onClick={cargar} disabled={cargando}
            className="h-[42px] px-6 rounded-xl text-[10px] font-black uppercase text-white bg-stone-900 hover:bg-stone-800 shadow transition-all active:scale-95 disabled:opacity-60">
            {cargando ? "Calculando…" : "🔄 Actualizar"}
          </button>
        </div>
        {error && <p className="mt-3 text-[10px] font-bold text-red-600 bg-red-50 px-4 py-2 rounded-lg">⚠️ {error}</p>}
      </div>

      {/* Metodología: sin esto los números se malinterpretan */}
      {data?.nota_metodologia && (
        <p className="text-[10px] text-stone-500 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
          <b>Cómo leer esto:</b> {data.nota_metodologia}
        </p>
      )}

      {data?.empresas?.map((emp) => <BloqueEmpresa key={emp.empresa} emp={emp} />)}

      {!data && !cargando && !error && (
        <div className="py-16 text-center text-stone-400 text-sm">Elige el período y presiona Actualizar.</div>
      )}
    </div>
  );
}
