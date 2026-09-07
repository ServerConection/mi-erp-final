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
  BarChart, LineChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LabelList, ResponsiveContainer,
} from "recharts";

const API = import.meta.env.VITE_API_URL;

// Las tres series del embudo (ingresos → gestionables → activas) son la MISMA
// magnitud en distinta etapa, así que van en una rampa del mismo color de claro
// a oscuro, no en tres colores sueltos: el degradado ya cuenta la historia de
// que cada paso es un subconjunto del anterior.
// Separación verificada para daltonismo (ΔE 20.2 Novonet / 13.1 Velsa, sobre
// un mínimo de 8) y reforzada con el valor escrito sobre cada barra.
const TEMA = {
  novonet: { fuerte: "#1A3A6E", medio: "#3b82f6", suave: "#93c5fd", acento: "#2563eb", fondo: "bg-[#1A3A6E]" },
  velsa:   { fuerte: "#c2410c", medio: "#f97316", suave: "#fdba74", acento: "#ea580c", fondo: "bg-[#c2410c]" },
};

// El número sobre la barra. Se omite el 0 a propósito: una columna de ceros
// escritos ensucia el gráfico sin aportar nada.
const Valor = (props) => {
  const { x, y, width, value } = props;
  if (!value) return null;
  return (
    <text x={x + width / 2} y={y - 4} textAnchor="middle"
          fill="#57534e" fontSize={9} fontWeight={700}>
      {Number(value).toLocaleString("es-EC")}
    </text>
  );
};

const hoyEc = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });
const primerDiaMes = () => hoyEc().slice(0, 8) + "01";

const money = (v) => (v === null || v === undefined ? "—" : `$${Number(v).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const num   = (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("es-EC"));
const pct   = (v) => (v === null || v === undefined ? "—" : `${Number(v).toFixed(1)}%`);
const dia   = (f) => (f ? f.slice(8, 10) + "/" + f.slice(5, 7) : "");

// Variacion contra el periodo anterior. En casi todo, subir es bueno; en el
// costo por venta es al reves, por eso `bajarEsBueno`.
function Delta({ valor, bajarEsBueno = false }) {
  if (valor === null || valor === undefined) return null;
  const sube = valor > 0;
  const bueno = bajarEsBueno ? !sube : sube;
  if (Math.abs(valor) < 0.05) {
    return <span className="text-[9px] font-bold text-stone-400">= igual</span>;
  }
  return (
    <span className={`text-[9px] font-black ${bueno ? "text-emerald-600" : "text-red-600"}`}>
      {sube ? "▲" : "▼"} {Math.abs(valor).toFixed(1)}%
    </span>
  );
}

// `pista` sale solo al pasar el mouse: explica el indicador sin ensuciar la
// pantalla para quien ya lo conoce.
function Kpi({ etiqueta, valor, ayuda, resaltado, pista, delta, bajarEsBueno }) {
  return (
    <div title={pista || ""}
      className={`rounded-xl border p-3 transition-colors ${resaltado ? "border-stone-300 bg-stone-50" : "border-stone-200 bg-white"} ${pista ? "hover:border-stone-400 cursor-help" : ""}`}>
      <div className="text-[9px] font-black uppercase tracking-widest text-stone-400">{etiqueta}</div>
      <div className="text-lg font-black text-stone-800 leading-tight mt-0.5">{valor}</div>
      <div className="flex items-center gap-2 mt-0.5">
        {ayuda && <span className="text-[9px] text-stone-400">{ayuda}</span>}
        <Delta valor={delta} bajarEsBueno={bajarEsBueno} />
      </div>
    </div>
  );
}

// ── Proyección a fin de mes ─────────────────────────────────────────────────
// Usa el MISMO método que Redes → Reporte Data: promedio de los días que
// tienen dato × días del mes. Se comparte a propósito — si gerencia y pauta
// proyectan distinto, la reunión se va en discutir cuál número vale.
function Forecast({ f, k }) {
  if (!f) return null;
  const fin = f.financiero;
  const cpaSube = k?.cpa && f.cpa_proyectado ? f.cpa_proyectado > k.cpa : false;

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <span className="text-[10px] font-black uppercase tracking-widest text-stone-600">
          Proyección a fin de mes · {f.mes}
        </span>
        <span className="text-[9px] text-stone-400" title={f.metodo}>
          día {f.dia_actual} de {f.dias_del_mes} · faltan {f.dias_restantes} · <span className="cursor-help underline decoration-dotted">cómo se calcula</span>
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
        <Proj etiqueta="Inversión" hoy={money(f.inversion.acumulado)} fin={money(f.inversion.proyeccion_cierre)}
              pie={`faltan por gastar ${money(f.inversion.por_gastar)}`} />
        <Proj etiqueta="Activas" hoy={num(f.activas.acumulado)} fin={num(Math.round(f.activas.proyeccion_cierre))}
              pie={`${num(f.activas.promedio_diario)}/día en ${f.activas.dias_con_datos} días con dato`} />
        <Proj etiqueta="Ingresos" hoy={num(f.ingresos.acumulado)} fin={num(Math.round(f.ingresos.proyeccion_cierre))}
              pie={`${num(f.ingresos.promedio_diario)}/día`} />
        <Proj etiqueta="Costo x venta" hoy={money(k?.cpa)} fin={money(f.cpa_proyectado)}
              pie={cpaSube ? "va a subir" : "va a bajar o se mantiene"}
              color={f.cpa_proyectado == null ? "" : cpaSube ? "text-red-700" : "text-emerald-700"} />
      </div>

      {fin ? (
        <div className={`rounded-lg border p-3 ${fin.rentable ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-[9px] uppercase text-stone-500">Ingreso proyectado</div>
              <div className="font-black text-stone-800">{money(fin.ingreso_proyectado)}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase text-stone-500">Margen proyectado</div>
              <div className={`font-black ${fin.margen_proyectado >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {money(fin.margen_proyectado)}
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase text-stone-500">Activas para cubrir la pauta</div>
              <div className="font-black text-stone-800">{num(fin.activas_necesarias)}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase text-stone-500">
                {fin.faltan_activas > 0 ? "Faltan" : "Sobre el punto"}
              </div>
              <div className={`font-black ${fin.faltan_activas > 0 ? "text-red-700" : "text-emerald-700"}`}>
                {fin.faltan_activas > 0
                  ? num(fin.faltan_activas)
                  : num(Math.round(f.activas.proyeccion_cierre) - fin.activas_necesarias)}
              </div>
            </div>
          </div>
          <p className="text-[10px] text-stone-500 mt-2">
            Si el mes sigue al ritmo de hoy, cierra {fin.rentable ? "en positivo" : "en negativo"}:
            {" "}{money(fin.ingreso_proyectado)} de las ventas contra {money(f.inversion.proyeccion_cierre)} de pauta.
          </p>
        </div>
      ) : (
        <p className="text-[10px] text-stone-400">
          Escribe el ARPU arriba para ver el margen proyectado del mes.
        </p>
      )}

      {f.por_agencia?.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-[9px] uppercase tracking-wider text-stone-400 border-b border-stone-200">
                <th className="py-1 font-medium">Agencia</th>
                <th className="py-1 font-medium text-right">Gastado</th>
                <th className="py-1 font-medium text-right">Proyección</th>
                <th className="py-1 font-medium text-right">Por gastar</th>
                <th className="py-1 font-medium text-right">Prom./día</th>
                <th className="py-1 font-medium">Último dato</th>
              </tr>
            </thead>
            <tbody>
              {f.por_agencia.map((a) => (
                <tr key={a.agencia} className="border-b border-stone-100 last:border-0">
                  <td className="py-1 font-bold text-stone-700">
                    {a.agencia}
                    {a.atrasada && (
                      <span title="La última carga de inversión es anterior a hoy: la proyección se queda corta hasta que se actualice."
                            className="ml-1.5 text-[8px] font-black uppercase text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 cursor-help">
                        atrasada
                      </span>
                    )}
                  </td>
                  <td className="py-1 text-right text-stone-600">{money(a.inversion_acumulada)}</td>
                  <td className="py-1 text-right font-bold text-stone-800">{money(a.proyeccion_cierre)}</td>
                  <td className="py-1 text-right text-stone-600">{money(a.gasto_proyectado_restante)}</td>
                  <td className="py-1 text-right text-stone-600">{money(a.promedio_diario)}</td>
                  <td className="py-1 text-stone-500">{a.ultima_fecha}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Proj({ etiqueta, hoy, fin, pie, color = "" }) {
  return (
    <div>
      <div className="text-[9px] uppercase text-stone-500">{etiqueta}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-stone-400 text-xs">{hoy}</span>
        <span className="text-stone-300">→</span>
        <span className={`font-black ${color || "text-stone-800"}`}>{fin}</span>
      </div>
      {pie && <div className="text-[9px] text-stone-400 mt-0.5">{pie}</div>}
    </div>
  );
}

function BloqueEmpresa({ emp }) {
  const [valores, setValores] = useState(true);   // números sobre las barras
  const t = TEMA[emp.empresa] || TEMA.novonet;
  // Ancho reservado por día: tres barras más el número encima de cada una.
  const anchoDia = valores ? 74 : 42;
  const k = emp.kpis;
  const eq = emp.equilibrio;
  const v  = emp.tendencia?.variacion;         // vs período anterior
  const dp = emp.tendencia?.dentro_del_periodo; // hacia dónde iba dentro del período

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
            <Kpi etiqueta="Ingresos" valor={num(k?.ingresos)} delta={v?.ingresos}
                 pista="Formularios que entraron en el período." />
            <Kpi etiqueta="Gestionables" valor={num(k?.gestionables)} ayuda={pct(k?.pct_gestionable)}
                 pista="Leads que NO cayeron en una etapa de descarte (duplicado, ATC, fuera de cobertura, zona peligrosa)." />
            <Kpi etiqueta="Activas" valor={num(k?.activas)} delta={v?.activas}
                 pista="Ventas instaladas, contadas por fecha de ingreso del lead." />
            <Kpi etiqueta="Inversión" valor={money(k?.inversion)} delta={v?.inversion}
                 pista="Inversión publicitaria registrada en el período." />
            <Kpi etiqueta="Costo x venta" valor={money(k?.cpa)} ayuda="CPA" resaltado
                 delta={v?.cpa} bajarEsBueno
                 pista="Inversión ÷ activas. Es el número que se compara contra el ARPU: si lo supera, cada venta cuesta más de lo que deja." />
            <Kpi etiqueta="Costo x lead" valor={money(k?.cpl)} ayuda="CPL"
                 pista="Inversión ÷ ingresos. Cuánto cuesta traer un formulario." />
            <Kpi etiqueta="Efectividad" valor={pct(k?.pct_efectividad)} ayuda="activas / ingresos"
                 delta={v?.efectividad}
                 pista="Qué porcentaje de lo que entró terminó instalado." />
          </div>

          {/* Tendencia: comparativa y hacia donde iba dentro del periodo */}
          {(emp.tendencia?.previo || dp?.activas) && (
            <div className="flex flex-wrap items-center gap-4 text-[10px] text-stone-600 bg-stone-50 border border-stone-200 rounded-xl px-4 py-2">
              {emp.tendencia?.periodo_previo && (
                <span title="Mismo número de días, justo antes del período elegido." className="cursor-help">
                  <b>vs. período anterior</b> ({emp.tendencia.periodo_previo.desde} → {emp.tendencia.periodo_previo.hasta}):
                  {" "}activas {num(emp.tendencia.previo?.activas)} · inversión {money(emp.tendencia.previo?.inversion)}
                </span>
              )}
              {dp?.activas && (
                <span title="Pendiente de las activas diarias dentro del período. Dice si venía subiendo o cayendo, algo que el total no muestra."
                      className={`font-black cursor-help ${dp.activas.direccion === "SUBIENDO" ? "text-emerald-600" : dp.activas.direccion === "BAJANDO" ? "text-red-600" : "text-stone-500"}`}>
                  {dp.activas.direccion === "SUBIENDO" ? "▲" : dp.activas.direccion === "BAJANDO" ? "▼" : "="} Dentro del período: {dp.activas.direccion.toLowerCase()}
                  {dp.activas.por_dia ? ` (${dp.activas.por_dia > 0 ? "+" : ""}${dp.activas.por_dia} activas/día)` : ""}
                </span>
              )}
            </div>
          )}

          {/* ── Embudo diario: ingresos → gestionables → activas ────────────
              Antes esto era un solo gráfico con DOS ejes (volumen a la
              izquierda, dólares a la derecha). Con dos escalas distintas la
              altura de una barra y la de la línea no son comparables aunque el
              ojo las compare igual, y encima la línea de inversión aplastaba
              las barras. Ahora son dos gráficos, cada uno con su unidad. */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-stone-500">
                Volumen por día · leads
              </span>
              <button onClick={() => setValores(v => !v)}
                      title="Mostrar u ocultar el número sobre cada barra"
                      className="text-[9px] font-bold uppercase tracking-wider text-stone-400 hover:text-stone-700 border border-stone-200 rounded-lg px-2 py-1">
                {valores ? "Ocultar valores" : "Ver valores"}
              </button>
            </div>

            {/* Con muchos días las barras y sus números no caben: en vez de
                encogerlos hasta que no se lean, el gráfico crece y se desplaza. */}
            <div className="overflow-x-auto">
              <div style={{ width: Math.max(560, (emp.dias?.length || 1) * anchoDia), height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={emp.dias} margin={{ top: 18, right: 8, left: -18, bottom: 0 }}
                            barGap={2} barCategoryGap="18%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                    <XAxis dataKey="fecha" tickFormatter={dia} tick={{ fontSize: 10, fill: "#78716c" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#78716c" }} />
                    <Tooltip
                      labelFormatter={(f) => `Día ${f}`}
                      formatter={(v) => num(v)}
                      cursor={{ fill: "#f5f5f4" }}
                      contentStyle={{ fontSize: 11, borderRadius: 10, border: "1px solid #e7e5e4" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="ingresos"     name="Ingresos"     fill={t.suave}  radius={[3, 3, 0, 0]}>
                      {valores && <LabelList dataKey="ingresos"     content={Valor} />}
                    </Bar>
                    <Bar dataKey="gestionables" name="Gestionables" fill={t.medio}  radius={[3, 3, 0, 0]}>
                      {valores && <LabelList dataKey="gestionables" content={Valor} />}
                    </Bar>
                    <Bar dataKey="activas"      name="Activas"      fill={t.fuerte} radius={[3, 3, 0, 0]}>
                      {valores && <LabelList dataKey="activas"      content={Valor} />}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Inversión: otra unidad, otro gráfico */}
          {emp.inversion_disponible && (
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-stone-500">
                Inversión por día · USD
              </span>
              <div className="overflow-x-auto mt-1">
                <div style={{ width: Math.max(560, (emp.dias?.length || 1) * anchoDia), height: 150 }}>
                  <ResponsiveContainer>
                    <LineChart data={emp.dias} margin={{ top: 14, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                      <XAxis dataKey="fecha" tickFormatter={dia} tick={{ fontSize: 10, fill: "#78716c" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#78716c" }} tickFormatter={(v) => `$${v}`} />
                      <Tooltip
                        labelFormatter={(f) => `Día ${f}`}
                        formatter={(v) => money(v)}
                        contentStyle={{ fontSize: 11, borderRadius: 10, border: "1px solid #e7e5e4" }}
                      />
                      <Line dataKey="inversion" name="Inversión" stroke={t.acento}
                            strokeWidth={2} dot={{ r: 2.5, fill: t.acento }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

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

          <Forecast f={emp.forecast} k={k} />
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

  // Atajos de periodo: gerencia mira "el mes pasado" o "el trimestre", no
  // fechas sueltas. Evita el error clasico de comparar medio mes contra un mes
  // entero, que es lo que hace que un reporte se lea al reves.
  const preset = (clave) => {
    const hoy = new Date(hoyEc() + "T00:00:00Z");
    const y = hoy.getUTCFullYear(), m = hoy.getUTCMonth();
    const iso = (d) => d.toISOString().slice(0, 10);
    if (clave === "mes")      { setDesde(iso(new Date(Date.UTC(y, m, 1))));     setHasta(hoyEc()); }
    if (clave === "anterior") { setDesde(iso(new Date(Date.UTC(y, m - 1, 1)))); setHasta(iso(new Date(Date.UTC(y, m, 0)))); }
    if (clave === "trim")     { setDesde(iso(new Date(Date.UTC(y, m - 2, 1)))); setHasta(hoyEc()); }
    if (clave === "anio")     { setDesde(iso(new Date(Date.UTC(y, 0, 1))));     setHasta(hoyEc()); }
  };

  // Descarga CSV con el detalle diario de ambas empresas. Se arma en el
  // navegador con lo que ya esta en pantalla: lo que se descarga es
  // exactamente lo que se esta viendo, no una segunda consulta que podria
  // devolver otra cosa.
  const descargarCsv = () => {
    if (!data?.empresas?.length) return;
    const cols = ["empresa", "fecha", "ingresos", "gestionables", "activas", "inversion", "cpa", "cpl"];
    const filas = [cols.join(";")];
    data.empresas.forEach((emp) =>
      (emp.dias || []).forEach((d) =>
        filas.push([emp.nombre, d.fecha, d.ingresos, d.gestionables, d.activas,
                    d.inversion, d.cpa ?? "", d.cpl ?? ""].join(";"))));
    // Resumen al final: lo primero que se mira al abrir el archivo.
    filas.push("");
    filas.push(["RESUMEN", "desde", data.rango.desde, "hasta", data.rango.hasta].join(";"));
    data.empresas.forEach((emp) => {
      const k = emp.kpis; if (!k) return;
      filas.push([emp.nombre, "ingresos", k.ingresos, "gestionables", k.gestionables,
                  "activas", k.activas, "inversion", k.inversion,
                  "CPA", k.cpa ?? "", "CPL", k.cpl ?? "",
                  "efectividad%", k.pct_efectividad ?? ""].join(";"));
    });
    // BOM para que Excel en español respete las tildes.
    const blob = new Blob(["\uFEFF" + filas.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte_gerencial_${data.rango.desde}_${data.rango.hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
          <button onClick={descargarCsv} disabled={!data || cargando}
            title="Descarga el detalle diario de ambas empresas más el resumen, tal como se ve en pantalla."
            className="h-[42px] px-5 rounded-xl text-[10px] font-black uppercase text-stone-700 bg-white border border-stone-300 hover:border-stone-500 transition-all active:scale-95 disabled:opacity-40">
            ⬇️ Descargar
          </button>
        </div>

        {/* Atajos de periodo */}
        <div className="flex flex-wrap gap-2 mt-4">
          {[["mes", "Mes actual"], ["anterior", "Mes anterior"], ["trim", "Últimos 3 meses"], ["anio", "Año actual"]].map(([clave, txt]) => (
            <button key={clave} onClick={() => preset(clave)}
              className="text-[10px] font-bold px-3 py-1.5 rounded-full border border-stone-300 text-stone-600 hover:border-stone-800 hover:text-stone-900 transition-colors">
              {txt}
            </button>
          ))}
          <span className="text-[9px] text-stone-400 self-center ml-1">
            Elige un atajo y pulsa Actualizar. Siempre se compara contra el período anterior del mismo largo.
          </span>
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
