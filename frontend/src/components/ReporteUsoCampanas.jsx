// Reporte de uso de Campañas Masivas por empresa, supervisor y asesor.
// Visible para ADMINISTRADOR y usuarios autorizados (todas las empresas) y para
// GERENCIA/GERENTE/SUPERVISOR (solo su empresa). El backend también lo valida y
// fija la empresa.
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, LineChart,
} from "recharts";

const API = `${import.meta.env.VITE_API_URL}/api/wa`;
const USUARIOS_REPORTE = ["acloaiza"];

const perfilActual = () => {
  try { return JSON.parse(localStorage.getItem("userProfile") || "{}"); } catch { return {}; }
};
const veTodas = (u) => String(u.perfil || "").toUpperCase() === "ADMINISTRADOR"
  || USUARIOS_REPORTE.includes(String(u.usuario || "").toLowerCase());
const empresaDeGerencia = (u) => ["GERENCIA", "GERENTE", "SUPERVISOR"].includes(String(u.perfil || "").toUpperCase())
  ? String(u.empresa || "").trim().toUpperCase() : "";

export const puedeVerReporteCampanas = () => {
  const u = perfilActual();
  return veTodas(u) || Boolean(empresaDeGerencia(u));
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
  const usuario = perfilActual();
  const empresaFija = veTodas(usuario) ? "" : empresaDeGerencia(usuario);
  const [filtros, setFiltros] = useState({ desde: inicioMes(), hasta: hoy(), empresa: empresaFija || "TODAS" });
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

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-7xl max-h-[94vh] overflow-y-auto">
        <div className="bg-white p-5 border-b border-slate-100 flex items-start justify-between sticky top-0 z-10">
          <div>
            <h3 className="font-bold text-slate-800">📊 Reporte de campañas</h3>
            <p className="text-xs text-slate-500 mt-1">Envíos, lecturas y respuestas por hora, día, línea, campaña y mensaje.</p>
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
              <select value={filtros.empresa} onChange={e => cambiar("empresa", e.target.value)} disabled={Boolean(empresaFija)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-slate-100">
                {(empresaFija ? [empresaFija] : ["TODAS", "NOVONET", "VELSA", "SEMILLERO", "VENTAENLINEA"]).map(e =>
                  <option key={e} value={e}>{e === "VENTAENLINEA" ? "VENTA EN LÍNEA" : e}</option>)}
              </select>
            </label>
            <button onClick={() => cargar()} disabled={cargando}
              className="bg-green-600 hover:bg-green-500 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {cargando ? "Consultando…" : "Consultar"}
            </button>
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

          {data && <Detalle data={data} />}
        </div>
      </div>
    </div>
  );
}

// ── Detalle con gráficos ────────────────────────────────────────────────────
const C = { enviados: "#16a34a", leidos: "#0284c7", respuestas: "#9333ea", fallidos: "#dc2626", tasa: "#f59e0b" };
const tasa = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const minutos = (m) => (m == null ? "—" : m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} d`);
const ESTADOS = { completed: ["Completada", "bg-green-100 text-green-700"], running: ["Enviando", "bg-sky-100 text-sky-700"],
  paused: ["Pausada", "bg-amber-100 text-amber-700"], draft: ["Borrador", "bg-slate-100 text-slate-600"],
  scheduled: ["Programada", "bg-violet-100 text-violet-700"], failed: ["Fallida", "bg-red-100 text-red-700"] };
const MODOS = { libre: "Libre", evitar: "Evitar responsable", mismo: "Mismo responsable" };

function Caja({ titulo, sub, children, accion }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-800 text-sm">{titulo}</h3>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
        {accion}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Hallazgo({ icono, titulo, valor, detalle }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 flex gap-3 items-start">
      <div className="text-2xl leading-none">{icono}</div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{titulo}</div>
        <div className="font-bold text-slate-800 truncate">{valor}</div>
        {detalle && <div className="text-xs text-slate-500">{detalle}</div>}
      </div>
    </div>
  );
}

// Lo "mejor" solo cuenta si tiene volumen suficiente (evita que 1 envío leído = 100%).
const mejorPorTasa = (filas, envKey, leiKey, minimo) => {
  const validas = filas.filter(f => f[envKey] >= minimo);
  return validas.sort((a, b) => tasa(b[leiKey], b[envKey]) - tasa(a[leiKey], a[envKey]))[0] || null;
};

function descargarCsv(campanas) {
  const cols = [["Campaña", "name"], ["Empresa", "empresa"], ["Creador", "creador"], ["Usuario", "usuario"], ["Estado", "status"],
    ["Modo", "modo"], ["Líneas", "lineas"], ["Líneas usadas", "lineas_usadas"], ["Creada", "creada"], ["Primer envío", "primer_envio"],
    ["Último envío", "ultimo_envio"], ["Destinatarios", "destinatarios"], ["Enviados", "enviados"], ["Entregados", "entregados"],
    ["Leídos", "leidos"], ["Respondieron", "respondieron"], ["Fallidos", "fallidos"], ["Saltados", "saltados"],
    ["Pendientes", "pendientes"], ["Min. a lectura (mediana)", "min_lectura_mediana"]];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.map(c => esc(c[0])).join(";"), ...campanas.map(c => cols.map(([, k]) => esc(c[k])).join(";"))].join("\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = `reporte_campanas_${hoy()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

const PESTANAS = [["resumen", "Resumen"], ["horarios", "Horarios"], ["lineas", "Líneas"], ["campanas", "Campañas"], ["mensajes", "Mensajes"], ["usuarios", "Usuarios"]];

function Detalle({ data }) {
  const [tab, setTab] = useState("resumen");
  const [buscar, setBuscar] = useState("");
  const e = data.embudo || {};
  const horas = useMemo(() => (data.por_hora || []).map(h => ({
    ...h, etiqueta: `${String(h.hora).padStart(2, "0")}h`, tasa: tasa(h.leidos_de_enviados, h.enviados),
  })), [data]);
  const dias = useMemo(() => (data.por_dia || []).map(d => ({ ...d, etiqueta: d.fecha.slice(5).split("-").reverse().join("/"), tasa: tasa(d.leidos, d.enviados) })), [data]);
  const semana = useMemo(() => (data.por_dia_semana || []).map(d => ({ ...d, tasa: tasa(d.leidos, d.enviados) })), [data]);
  const lineas = useMemo(() => (data.por_linea || []).map(l => ({ ...l, tasa: tasa(l.leidos, l.enviados), tasa_resp: tasa(l.respondieron, l.enviados) })), [data]);

  const maxEnv = Math.max(0, ...horas.map(h => h.enviados));
  const mejorHora = mejorPorTasa([...horas], "enviados", "leidos_de_enviados", Math.max(5, maxEnv * 0.1));
  const horaLectura = [...horas].sort((a, b) => b.lecturas - a.lecturas)[0];
  const horaResp = [...horas].sort((a, b) => b.respuestas - a.respuestas)[0];
  const mejorDia = mejorPorTasa([...semana], "enviados", "leidos", 5);
  const mejorLinea = mejorPorTasa([...lineas], "enviados", "leidos", 10);
  const lecturaRapida = (data.tiempo_lectura || []).slice(0, 2).reduce((a, t) => a + t.leidos, 0);

  const campanas = (data.campanas || []).filter(c => !buscar.trim()
    || `${c.name} ${c.creador || ""} ${c.usuario || ""} ${c.empresa}`.toLowerCase().includes(buscar.trim().toLowerCase()));

  const embudo = [
    ["Destinatarios", e.destinatarios, "#64748b"], ["Enviados", e.enviados, C.enviados], ["Entregados", e.entregados, "#0d9488"],
    ["Leídos", e.leidos, C.leidos], ["Respondieron", e.respondieron, C.respuestas],
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto bg-white border border-slate-200 rounded-xl p-1">
        {PESTANAS.map(([id, nombre]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${tab === id ? "bg-green-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            {nombre}
          </button>
        ))}
      </div>

      {tab === "resumen" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {[["Campañas", data.campanas?.length, "text-slate-800"], ["Destinatarios", e.destinatarios, "text-slate-800"],
              ["Enviados", e.enviados, "text-green-700"], ["Leídos", e.leidos, "text-sky-700", tasa(e.leidos, e.enviados)],
              ["Respondieron", e.respondieron, "text-purple-700", tasa(e.respondieron, e.enviados)],
              ["Fallidos", e.fallidos, "text-red-600", tasa(e.fallidos, e.enviados + e.fallidos)],
              ["Saltados", e.saltados, "text-amber-600"], ["Pendientes", e.pendientes, "text-slate-500"]].map(([l, v, c, p]) => (
              <div key={l} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                <div className={`text-xl font-bold ${c}`}>{num(v)}</div>
                <div className="text-xs text-slate-500">{l}{p != null && <span className="text-slate-400"> · {p}%</span>}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <Hallazgo icono="⏰" titulo="Mejor hora para enviar" valor={mejorHora ? `${mejorHora.etiqueta} · ${mejorHora.tasa}% leído` : "Sin datos suficientes"}
              detalle={mejorHora && `${num(mejorHora.enviados)} enviados en esa hora`} />
            <Hallazgo icono="👀" titulo="Hora en que más nos leen" valor={horaLectura?.lecturas ? `${horaLectura.etiqueta} · ${num(horaLectura.lecturas)} lecturas` : "Sin lecturas"} />
            <Hallazgo icono="💬" titulo="Hora en que más responden" valor={horaResp?.respuestas ? `${horaResp.etiqueta} · ${num(horaResp.respuestas)} respuestas` : "Sin respuestas"} />
            <Hallazgo icono="📅" titulo="Mejor día de la semana" valor={mejorDia ? `${mejorDia.nombre} · ${mejorDia.tasa}% leído` : "Sin datos suficientes"} />
            <Hallazgo icono="📱" titulo="Línea con mejor lectura" valor={mejorLinea ? `${mejorLinea.linea}` : "Sin datos suficientes"}
              detalle={mejorLinea && `${mejorLinea.tasa}% leído · ${num(mejorLinea.enviados)} enviados`} />
            <Hallazgo icono="⚡" titulo="Leídos en menos de 30 min" valor={`${tasa(lecturaRapida, e.leidos)}% de los leídos`}
              detalle={`${num(lecturaRapida)} de ${num(e.leidos)}`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Caja titulo="Embudo" sub="De los destinatarios a las respuestas">
              <div className="space-y-2">
                {embudo.map(([l, v, color]) => (
                  <div key={l}>
                    <div className="flex justify-between text-xs mb-1"><span className="text-slate-600">{l}</span>
                      <span className="font-semibold text-slate-800">{num(v)} <span className="text-slate-400 font-normal">({tasa(v, e.destinatarios)}%)</span></span></div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(tasa(v, e.destinatarios), v ? 1 : 0)}%`, background: color }} />
                    </div>
                  </div>
                ))}
              </div>
            </Caja>
            <Caja titulo="¿Cuánto tardan en leer?" sub="Tiempo desde el envío hasta la lectura">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.tiempo_lectura || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="tramo" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip /><Bar dataKey="leidos" name="Leídos" fill={C.leidos} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Caja>
          </div>

          <Caja titulo="Evolución diaria" sub="Enviados, leídos y fallidos por día de envío">
            {dias.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={dias}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="n" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis yAxisId="p" orientation="right" unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip /><Legend />
                  <Bar yAxisId="n" dataKey="enviados" name="Enviados" fill={C.enviados} radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="n" dataKey="leidos" name="Leídos" fill={C.leidos} radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="n" dataKey="fallidos" name="Fallidos" fill={C.fallidos} radius={[4, 4, 0, 0]} />
                  <Line yAxisId="p" dataKey="tasa" name="% leído" stroke={C.tasa} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <Vacio />}
          </Caja>
        </>
      )}

      {tab === "horarios" && (
        <>
          <Caja titulo="Envíos por hora y % de lectura" sub="Barras: mensajes enviados en esa hora · Línea: % de esos mensajes que se leyeron">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={horas}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} interval={0} />
                <YAxis yAxisId="n" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis yAxisId="p" orientation="right" unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip /><Legend />
                <Bar yAxisId="n" dataKey="enviados" name="Enviados" fill={C.enviados} radius={[4, 4, 0, 0]} />
                <Line yAxisId="p" dataKey="tasa" name="% leído" stroke={C.tasa} strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </Caja>
          <Caja titulo="¿A qué hora nos leen y nos responden?" sub="Según la hora en que el cliente abrió o contestó (no la hora del envío)">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={horas}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} interval={0} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip /><Legend />
                <Line dataKey="lecturas" name="Lecturas" stroke={C.leidos} strokeWidth={2} dot={{ r: 2 }} />
                <Line dataKey="respuestas" name="Respuestas" stroke={C.respuestas} strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </Caja>
          <Caja titulo="Por día de la semana" sub="Enviados y % leído según el día del envío">
            {semana.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={semana}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="n" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis yAxisId="p" orientation="right" unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip /><Legend />
                  <Bar yAxisId="n" dataKey="enviados" name="Enviados" fill={C.enviados} radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="n" dataKey="leidos" name="Leídos" fill={C.leidos} radius={[4, 4, 0, 0]} />
                  <Line yAxisId="p" dataKey="tasa" name="% leído" stroke={C.tasa} strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <Vacio />}
          </Caja>
        </>
      )}

      {tab === "lineas" && (
        <>
          <Caja titulo="Top 15 líneas por envíos" sub="Enviados, leídos y respuestas por línea">
            {lineas.length ? (
              <ResponsiveContainer width="100%" height={Math.max(220, Math.min(15, lineas.length) * 30)}>
                <BarChart data={lineas.slice(0, 15)} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="linea" width={190} tick={{ fontSize: 10 }} />
                  <Tooltip /><Legend />
                  <Bar dataKey="enviados" name="Enviados" fill={C.enviados} />
                  <Bar dataKey="leidos" name="Leídos" fill={C.leidos} />
                  <Bar dataKey="respondieron" name="Respondieron" fill={C.respuestas} />
                </BarChart>
              </ResponsiveContainer>
            ) : <Vacio />}
          </Caja>
          <Caja titulo="Detalle por línea">
            <TablaSimple filas={lineas} cols={[
              ["Línea", l => <><div className="font-medium text-slate-800">{l.linea}</div><div className="text-xs text-slate-400">{l.dueno || "—"}</div></>],
              ["Enviados", l => num(l.enviados), "text-right"], ["Entregados", l => num(l.entregados), "text-right"],
              ["Leídos", l => <>{num(l.leidos)} <span className="text-xs text-slate-400">({l.tasa}%)</span></>, "text-right text-sky-700"],
              ["Respondieron", l => <>{num(l.respondieron)} <span className="text-xs text-slate-400">({l.tasa_resp}%)</span></>, "text-right text-purple-700"],
              ["Fallidos", l => num(l.fallidos), "text-right text-red-600"], ["Lectura (mediana)", l => minutos(l.min_lectura_mediana), "text-right"],
            ]} />
          </Caja>
        </>
      )}

      {tab === "campanas" && (
        <Caja titulo={`Detalle por campaña (${campanas.length})`} sub="Respondieron = el cliente escribió dentro de las 48 h siguientes al envío"
          accion={<div className="flex gap-2">
            <input value={buscar} onChange={ev => setBuscar(ev.target.value)} placeholder="Buscar campaña o usuario…"
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-48" />
            <button onClick={() => descargarCsv(campanas)} className="bg-slate-800 hover:bg-slate-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium">⬇ Excel (CSV)</button>
          </div>}>
          <TablaSimple filas={campanas} cols={[
            ["Campaña", c => <><div className="font-medium text-slate-800">{c.name}</div>
              <div className="text-xs text-slate-400">{c.creador || c.usuario} · {c.empresa} · {c.creada}</div></>],
            ["Estado", c => { const [n, cls] = ESTADOS[c.status] || [c.status, "bg-slate-100 text-slate-600"]; return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{n}</span>; }],
            ["Modo / líneas", c => <><div className="text-xs">{MODOS[c.modo] || c.modo}</div><div className="text-xs text-slate-400">{c.lineas_usadas}/{c.lineas} usadas</div></>],
            ["Dest.", c => num(c.destinatarios), "text-right"],
            ["Enviados", c => num(c.enviados), "text-right font-semibold text-green-700"],
            ["Leídos", c => <>{num(c.leidos)} <span className="text-xs text-slate-400">({tasa(c.leidos, c.enviados)}%)</span></>, "text-right text-sky-700"],
            ["Resp.", c => <>{num(c.respondieron)} <span className="text-xs text-slate-400">({tasa(c.respondieron, c.enviados)}%)</span></>, "text-right text-purple-700"],
            ["Fall.", c => num(c.fallidos), "text-right text-red-600"],
            ["Salt.", c => num(c.saltados), "text-right text-amber-600"],
            ["Pend.", c => num(c.pendientes), "text-right text-slate-500"],
            ["Lectura", c => minutos(c.min_lectura_mediana), "text-right"],
            ["Envío", c => <span className="text-xs text-slate-500 whitespace-nowrap">{c.primer_envio ? `${c.primer_envio.slice(5)} → ${(c.ultimo_envio || "").slice(11)}` : "—"}</span>],
          ]} />
        </Caja>
      )}

      {tab === "mensajes" && (
        <Caja titulo="¿Qué mensaje se lee más?" sub="Cada variante de mensaje de las campañas, con su % de lectura">
          <TablaSimple filas={(data.por_mensaje || []).map(m => ({ ...m, tasa: tasa(m.leidos, m.enviados) }))} cols={[
            ["Mensaje", m => <><div className="font-medium text-slate-800">{m.etiqueta} {m.media_type && <span className="text-xs text-slate-400">· {m.media_type}</span>}</div>
              <div className="text-xs text-slate-500 max-w-xl">{m.texto || "—"}</div></>],
            ["Campaña", m => <span className="text-xs">{m.campana}</span>],
            ["Enviados", m => num(m.enviados), "text-right"],
            ["Leídos", m => num(m.leidos), "text-right text-sky-700"],
            ["% leído", m => <div className="flex items-center gap-2 justify-end"><div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-sky-500" style={{ width: `${m.tasa}%` }} /></div><span className="text-xs w-10 text-right">{m.tasa}%</span></div>, "text-right"],
          ]} />
        </Caja>
      )}

      {tab === "usuarios" && (
        <>
          <Caja titulo="Por empresa">
            <TablaSimple filas={data.empresas || []} cols={[
              ["Empresa", x => <span className="font-medium">{x.empresa}</span>], ["Usuarios", x => num(x.usuarios), "text-right"],
              ["Campañas", x => num(x.campanas), "text-right"], ["Enviados", x => num(x.enviados), "text-right text-green-700 font-semibold"],
              ["Fallidos", x => num(x.fallidos), "text-right text-red-600"], ["Leídos", x => num(x.leidos), "text-right text-sky-700"],
            ]} />
          </Caja>
          <Tabla titulo="🏆 Supervisores (ordenados por enviados)" filas={data.supervisores || []} />
          <Tabla titulo="👤 Asesores (ordenados por enviados)" filas={data.asesores || []} />
        </>
      )}
    </div>
  );
}

function Vacio() {
  return <div className="py-10 text-center text-sm text-slate-400">Sin envíos en este rango.</div>;
}

function TablaSimple({ filas, cols }) {
  if (!filas.length) return <Vacio />;
  return (
    <div className="overflow-x-auto -m-4">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
          <tr>{cols.map(([t, , cls]) => <th key={t} className={`px-3 py-2 ${cls?.includes("text-right") ? "text-right" : "text-left"}`}>{t}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filas.map((f, i) => (
            <tr key={f.id || i} className="hover:bg-slate-50">
              {cols.map(([t, render, cls]) => <td key={t} className={`px-3 py-2 ${cls || ""}`}>{render(f)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
