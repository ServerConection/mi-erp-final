/**
 * AutomarcadorReportes.jsx — Reportería del Automarcador Bitrix para gerencia.
 * Indicadores del rango, tendencia diaria, tipificaciones, horas y ranking de asesores.
 */
import { useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

const API = `${import.meta.env.VITE_API_URL || "http://localhost:3050"}/api/llamadas/bitrix`;
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
const fechaEC = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });
const haceDias = (n) => fechaEC(new Date(Date.now() - n * 86400000));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const mmss = (s) => `${Math.floor((s || 0) / 60)}:${String((s || 0) % 60).padStart(2, "0")}`;

// Paleta validada (slots 1 y 2 de la paleta categórica por defecto)
const AZUL = "#2a78d6";
const NARANJA = "#eb6834";
const EJE = { fontSize: 10, fill: "#64748b" };
const GRID = "#eef2f5";

const PRESETS = [["Hoy", 0], ["7 días", 6], ["30 días", 29]];

function Kpi({ titulo, valor, nota }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="text-[9px] font-black text-slate-400 uppercase tracking-wide">{titulo}</div>
      <div className="text-3xl font-black mt-1 text-slate-800">{valor}</div>
      {nota && <div className="text-[10px] text-slate-400 mt-0.5">{nota}</div>}
    </div>
  );
}

function Tarjeta({ titulo, children, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 p-4 ${className}`}>
      <p className="text-[11px] font-black text-slate-700 mb-3">{titulo}</p>
      {children}
    </div>
  );
}

export default function AutomarcadorReportes() {
  const [rango, setRango] = useState({ desde: haceDias(6), hasta: fechaEC() });
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true); setError("");
    try {
      const r = await fetch(`${API}/resumen?${new URLSearchParams(rango)}`, { headers: authH() });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "No se pudo cargar el reporte");
      setData(j.data);
    } catch (e) { setError(e.message); }
    finally { setCargando(false); }
  }, [rango]);

  useEffect(() => { cargar(); }, [cargar]);

  const descargar = async () => {
    try {
      const r = await fetch(`${API}/reporte?${new URLSearchParams(rango)}`, { headers: authH() });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "No se pudo generar el reporte");
      const cols = [["campana", "Campaña"], ["asesor", "Asesor"], ["nombre_cliente", "Cliente"], ["telefono", "Teléfono"],
        ["deal_id", "Negociación"], ["hora_llamada", "Hora llamada"], ["duracion_seg", "Duración (s)"], ["estado", "Resultado"],
        ["tipificacion", "Tipificación"], ["hora_tipificacion", "Hora tipificación"], ["intentos", "Intentos"]];
      const celda = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = [cols.map(c => celda(c[1])).join(";"), ...j.data.map(f => cols.map(c => celda(f[c[0]])).join(";"))].join("\r\n");
      const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = `reporte_automarcador_${rango.desde}_${rango.hasta}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); }
  };

  const k = data?.indicadores;
  const contrata = (data?.por_tipificacion || []).find(t => t.tipificacion === "Contrata")?.total || 0;
  const horas = (data?.por_hora || []).map(h => ({ ...h, etiqueta: `${String(h.hora).padStart(2, "0")}h` }));
  const dias = (data?.por_dia || []).map(d => ({ ...d, etiqueta: d.dia.slice(5) }));
  const inp = "text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white";

  return (
    <div className="flex-1 overflow-y-auto p-1 space-y-4">
      {/* Filtros: una sola fila */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center gap-2">
        {PRESETS.map(([t, n]) => {
          const activo = rango.desde === haceDias(n) && rango.hasta === fechaEC();
          return (
            <button key={t} onClick={() => setRango({ desde: haceDias(n), hasta: fechaEC() })}
              className={`text-[10px] font-black uppercase px-3 py-1.5 rounded-lg ${activo ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{t}</button>
          );
        })}
        <input type="date" className={inp} value={rango.desde} onChange={e => setRango(x => ({ ...x, desde: e.target.value }))} />
        <span className="text-slate-400 text-[11px]">a</span>
        <input type="date" className={inp} value={rango.hasta} onChange={e => setRango(x => ({ ...x, hasta: e.target.value }))} />
        {cargando && <span className="text-[10px] text-slate-400">Cargando…</span>}
        <button onClick={descargar} className="ml-auto text-[11px] font-black uppercase bg-emerald-600 text-white rounded-lg px-4 py-2">⬇ Descargar detalle</button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-[11px] text-red-700 font-bold">{error}</div>}

      {k && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi titulo="Llamadas" valor={k.llamadas.toLocaleString("es-EC")} nota={`${k.asesores} asesores`} />
            <Kpi titulo="Tasa de contacto" valor={`${pct(k.contestadas, k.llamadas)}%`} nota={`${k.contestadas} contestadas`} />
            <Kpi titulo="Contrata" valor={contrata} nota={`${pct(contrata, k.contestadas)}% de las contestadas`} />
            <Kpi titulo="Duración promedio" valor={mmss(k.duracion_promedio)} nota="de las contestadas" />
            <Kpi titulo="Tipificadas" valor={`${pct(k.tipificadas, k.llamadas)}%`} nota={`${k.llamadas - k.tipificadas} sin tipificar`} />
          </div>

          {!k.llamadas ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-[11px] text-slate-400">No hay llamadas en este rango.</div>
          ) : (
            <>
              <div className="grid lg:grid-cols-3 gap-4">
                <Tarjeta titulo="Llamadas y contestadas por día" className="lg:col-span-2">
                  <div className="h-60">
                    <ResponsiveContainer>
                      <LineChart data={dias} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="etiqueta" tick={EJE} axisLine={false} tickLine={false} />
                        <YAxis tick={EJE} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="linear" dataKey="llamadas" name="Llamadas" stroke={AZUL} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
                        <Line type="linear" dataKey="contestadas" name="Contestadas" stroke={NARANJA} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Tarjeta>
                <Tarjeta titulo="Tipificaciones">
                  <div className="h-60">
                    <ResponsiveContainer>
                      <BarChart data={data.por_tipificacion} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                        <XAxis type="number" hide allowDecimals={false} />
                        <YAxis type="category" dataKey="tipificacion" tick={EJE} axisLine={false} tickLine={false} width={125} />
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10 }} cursor={{ fill: "#f1f5f9" }} />
                        <Bar dataKey="total" name="Llamadas" fill={AZUL} radius={[0, 4, 4, 0]} barSize={14}
                          label={{ position: "right", fontSize: 10, fill: "#334155" }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Tarjeta>
              </div>

              <div className="grid lg:grid-cols-3 gap-4">
                <Tarjeta titulo="Ranking de asesores" className="lg:col-span-2">
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead className="text-[9px] text-slate-400 font-black uppercase border-b border-slate-100">
                        <tr>
                          <th className="py-2 text-left">Asesor</th><th className="py-2 text-right">Llamadas</th>
                          <th className="py-2 text-right">Contacto</th><th className="py-2 text-right">Contrata</th>
                          <th className="py-2 text-right">Dur. prom.</th><th className="py-2 text-right">Sin tipificar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {data.por_asesor.map((a, i) => (
                          <tr key={a.asesor || i}>
                            <td className="py-2 font-bold text-slate-700">{a.asesor || "—"}</td>
                            <td className="py-2 text-right">{a.llamadas}</td>
                            <td className="py-2 text-right">
                              <span className="inline-flex items-center gap-2 justify-end">
                                <span className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <span className="block h-full rounded-full" style={{ width: `${pct(a.contestadas, a.llamadas)}%`, background: AZUL }} />
                                </span>
                                {pct(a.contestadas, a.llamadas)}%
                              </span>
                            </td>
                            <td className="py-2 text-right font-bold">{a.contrata}</td>
                            <td className="py-2 text-right">{mmss(a.duracion_promedio)}</td>
                            <td className={`py-2 text-right ${a.sin_tipificar ? "text-rose-600 font-bold" : ""}`}>{a.sin_tipificar}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Tarjeta>
                <Tarjeta titulo="Llamadas por hora del día">
                  <div className="h-56">
                    <ResponsiveContainer>
                      <BarChart data={horas} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="etiqueta" tick={EJE} axisLine={false} tickLine={false} />
                        <YAxis tick={EJE} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10 }} cursor={{ fill: "#f1f5f9" }} />
                        <Bar dataKey="llamadas" name="Llamadas" fill={AZUL} radius={[4, 4, 0, 0]} barSize={14} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Tarjeta>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
