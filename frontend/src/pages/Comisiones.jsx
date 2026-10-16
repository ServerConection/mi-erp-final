// src/pages/Comisiones.jsx
// ============================================================================
// Administración > Comisiones (Fase 1)
// Calcula cuánto toca pagar a cada asesor con las ventas ACTIVAS del mes
// (envios_ventas) y el catálogo de tarifas por plan y tramo.
// Se actualiza solo cada 10 minutos (el backend también recalcula cada 10 min).
// ============================================================================

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import * as XLSX from "xlsx";

const API = import.meta.env.VITE_API_URL;
const O = "#FF6B00", OP = "#FFF3E8";
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIEZ_MIN = 10 * 60 * 1000;

const usd = (v) => `$${Number(v || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const n0 = (v) => Number(v || 0).toLocaleString("es-EC");
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" }) : "—");
const TRAMO_TXT = { 1: "Hasta 35", 2: "36 a 41", 3: "42 o más" };

// Lee el Excel del catálogo: columna con "PLAN" + columnas de tramos (35 / 41 / 42)
function leerCatalogoExcel(wb) {
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "" });
  const iCab = filas.findIndex((f) => f.some((c) => /PLAN/i.test(String(c))));
  if (iCab < 0) throw new Error('No encontré una columna "PLAN" en la primera hoja');
  const cab = filas[iCab].map((c) => String(c).toUpperCase());
  const iPlan = cab.findIndex((c) => c.includes("PLAN"));
  const i1 = cab.findIndex((c) => c.includes("35"));
  const i2 = cab.findIndex((c) => c.includes("41"));
  const i3 = cab.findIndex((c) => c.includes("42"));
  if (i1 < 0 || i2 < 0 || i3 < 0) throw new Error("Faltan columnas de tramos (menor a 35 / 36 a 41 / 42 en adelante)");
  return filas.slice(iCab + 1)
    .filter((f) => String(f[iPlan]).trim())
    .map((f) => ({ plan: String(f[iPlan]).trim(), t1: f[i1], t2: f[i2], t3: f[i3] }));
}

export default function Comisiones() {
  const hoy = new Date();
  const [empresa, setEmpresa] = useState("NOVONET");
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [abierto, setAbierto] = useState(null);
  const [buscar, setBuscar] = useState("");
  const [msgCat, setMsgCat] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const fileRef = useRef(null);
  const token = localStorage.getItem("token");

  const cargar = useCallback(async (forzar = false) => {
    setCargando(true); setError(null);
    try {
      const q = new URLSearchParams({ empresa, anio, mes, ...(forzar ? { refrescar: "1" } : {}) });
      const r = await fetch(`${API}/api/comisiones/calculo?${q}`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Error al calcular comisiones");
      setData(j.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [empresa, anio, mes, token]);

  // Carga inicial + actualización automática cada 10 minutos
  useEffect(() => {
    cargar();
    const id = setInterval(() => cargar(), DIEZ_MIN);
    return () => clearInterval(id);
  }, [cargar]);

  const subirCatalogo = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setSubiendo(true); setMsgCat(null);
    try {
      const wb = XLSX.read(await f.arrayBuffer());
      const planes = leerCatalogoExcel(wb);
      const r = await fetch(`${API}/api/comisiones/catalogo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ empresa, anio, mes, planes }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      setMsgCat({ ok: true, t: `Catálogo de ${MESES[mes - 1]} guardado: ${j.guardados} planes` });
      cargar(true);
    } catch (err) {
      setMsgCat({ ok: false, t: err.message });
    } finally {
      setSubiendo(false);
    }
  };

  const asesores = (data?.asesores || []).filter((a) =>
    !buscar || `${a.asesor} ${a.supervisor || ""} ${a.codigo_asesor || ""}`.toUpperCase().includes(buscar.toUpperCase()));
  const res = data?.resumen;
  const proxima = data ? new Date(new Date(data.calculado_en).getTime() + DIEZ_MIN).toISOString() : null;

  return (
    <div className="p-6 space-y-5">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">💰 Tabla de Comisiones</h1>
          <p className="text-sm text-slate-500">
            Ventas activas del mes · se actualiza cada 10 minutos
            {data && <> · última: <b>{hora(data.calculado_en)}</b> · próxima: <b>{hora(proxima)}</b></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option>NOVONET</option><option>VELSA</option>
          </select>
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="border rounded-lg px-3 py-2 text-sm w-24" />
          <button onClick={() => cargar(true)} disabled={cargando}
            className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50" style={{ background: O }}>
            {cargando ? "Calculando…" : "Actualizar ahora"}
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

      {data?.mes_en_curso && (
        <div className="p-3 rounded-lg text-sm" style={{ background: OP, color: "#9A3412" }}>
          Mes en curso: todos los asesores se calculan con el tramo <b>“Hasta 35”</b>. El tramo real se aplica al cerrar el mes.
        </div>
      )}

      {data && data.planes_catalogo === 0 && (
        <div className="p-3 rounded-lg bg-amber-50 text-amber-800 text-sm">
          No hay catálogo de tarifas cargado para {empresa}. Sube el Excel del catálogo (abajo) para ver los valores.
        </div>
      )}
      {data?.catalogo_periodo && (data.catalogo_periodo.mes !== mes || data.catalogo_periodo.anio !== anio) && (
        <div className="p-3 rounded-lg bg-amber-50 text-amber-800 text-sm">
          Usando el catálogo de {MESES[data.catalogo_periodo.mes - 1]} {data.catalogo_periodo.anio} (no hay uno de {MESES[mes - 1]}).
        </div>
      )}

      {/* KPIs */}
      {res && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ["Asesores", n0(res.asesores)],
            ["Activas totales", n0(res.activas_total)],
            ["Regularizadas", n0(res.regularizadas)],
            ["Valor total", usd(res.valor_total)],
            ["Disponible a pagar", usd(res.valor_disponible)],
          ].map(([t, v], i) => (
            <div key={t} className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500">{t}</div>
              <div className="text-xl font-bold" style={{ color: i === 4 ? "#047857" : "#1E293B" }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabla por asesor */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-3 border-b flex items-center justify-between gap-2">
          <span className="font-semibold text-slate-700">Comisión por asesor</span>
          <input placeholder="Buscar asesor o supervisor…" value={buscar} onChange={(e) => setBuscar(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm w-64" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {["Asesor","Supervisor","Activas","Regularizadas","Por regularizar","Tramo","Valor total","Disponible",""].map((h) =>
                  <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {asesores.map((a) => (
                <Fragment key={a.asesor}>
                  <tr className="border-t hover:bg-slate-50 cursor-pointer" onClick={() => setAbierto(abierto === a.asesor ? null : a.asesor)}>
                    <td className="px-3 py-2 font-medium text-slate-800">{a.asesor}
                      {a.ventas_sin_tarifa > 0 && <span className="ml-2 text-xs text-amber-700">({a.ventas_sin_tarifa} sin tarifa)</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{a.supervisor || "—"}</td>
                    <td className="px-3 py-2">{a.activas_total}</td>
                    <td className="px-3 py-2 text-emerald-700">{a.regularizadas}</td>
                    <td className="px-3 py-2 text-red-600">{a.por_regularizar}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{TRAMO_TXT[a.tramo]}</td>
                    <td className="px-3 py-2 font-semibold">{usd(a.valor_total)}</td>
                    <td className="px-3 py-2 font-semibold text-emerald-700">{usd(a.valor_disponible)}</td>
                    <td className="px-3 py-2 text-slate-400">{abierto === a.asesor ? "▲" : "▼"}</td>
                  </tr>
                  {abierto === a.asesor && (
                    <tr className="bg-slate-50">
                      <td colSpan={9} className="px-3 py-2">
                        <table className="w-full text-xs">
                          <thead className="text-slate-500"><tr>
                            {["ID","Cliente","Plan","Servicios","Activación","Regularización","Valor"].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}
                          </tr></thead>
                          <tbody>
                            {a.detalle.map((d) => (
                              <tr key={d.id} className="border-t border-slate-200">
                                <td className="px-2 py-1">{d.id_bitrix || d.id}</td>
                                <td className="px-2 py-1">{d.cliente}</td>
                                <td className="px-2 py-1">{d.plan}{!d.con_tarifa && <span className="ml-1 text-amber-700">⚠ sin tarifa</span>}</td>
                                <td className="px-2 py-1" title={d.servicios_digitales || ""}>{d.servicios}</td>
                                <td className="px-2 py-1">{d.fecha_activacion ? String(d.fecha_activacion).slice(0, 10) : "—"}</td>
                                <td className={`px-2 py-1 ${d.regularizada ? "text-emerald-700" : "text-red-600"}`}>{d.estado_regularizacion}</td>
                                <td className="px-2 py-1 font-semibold">{usd(d.valor)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!asesores.length && !cargando && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-400">Sin ventas activas en este mes</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Planes sin tarifa */}
      {data?.planes_sin_tarifa?.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl p-4">
          <div className="font-semibold text-amber-800 mb-2">Planes vendidos sin tarifa en el catálogo ({data.planes_sin_tarifa.length})</div>
          <ul className="text-sm text-slate-700 space-y-1 max-h-48 overflow-auto">
            {data.planes_sin_tarifa.map((p) => <li key={p.plan}>{p.plan} — <b>{p.ventas}</b> ventas</li>)}
          </ul>
        </div>
      )}

      {/* Carga del catálogo */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[260px]">
          <div className="font-semibold text-slate-700">Catálogo de tarifas — {MESES[mes - 1]} {anio} ({empresa})</div>
          <div className="text-xs text-slate-500">Excel con columnas: PLAN · MENOR A 35 · DE 36 A 41 · 42 EN ADELANTE. Agrega o actualiza planes, no borra los existentes.</div>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={subirCatalogo} />
        <button onClick={() => fileRef.current?.click()} disabled={subiendo}
          className="px-4 py-2 rounded-lg border text-sm font-semibold disabled:opacity-50" style={{ borderColor: O, color: O }}>
          {subiendo ? "Subiendo…" : "Subir Excel de catálogo"}
        </button>
        {msgCat && <div className={`w-full text-sm ${msgCat.ok ? "text-emerald-700" : "text-red-600"}`}>{msgCat.t}</div>}
      </div>
    </div>
  );
}
