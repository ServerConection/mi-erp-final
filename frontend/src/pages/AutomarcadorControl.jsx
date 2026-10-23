/**
 * AutomarcadorControl.jsx — Control en vivo para el supervisor.
 * Quién está en llamada, avance de cada asesor hoy y últimas llamadas.
 * Se actualiza cada 10 s leyendo solo la base del ERP (no consulta Bitrix).
 */
import { useState, useEffect, useCallback } from "react";

const API = `${import.meta.env.VITE_API_URL || "http://localhost:3050"}/api/llamadas/bitrix`;
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
const REFRESCO_MS = 10000;

const mmss = (seg) => {
  const s = Math.max(0, Math.floor(seg));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const hora = (iso) => iso ? new Date(iso).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", timeZone: "America/Guayaquil" }) : "—";
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// Estado del asesor a partir de su actividad
function estadoAsesor(a, ahora) {
  if (a.en_llamada_desde) return { txt: "En llamada", dot: "bg-emerald-500 animate-pulse", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  const min = a.ultima_actividad ? (ahora - new Date(a.ultima_actividad).getTime()) / 60000 : Infinity;
  if (min <= 2) return { txt: "Tipificando", dot: "bg-amber-400", chip: "bg-amber-50 text-amber-700 border-amber-200" };
  if (a.pendientes === 0) return { txt: "Sin pendientes", dot: "bg-slate-300", chip: "bg-slate-50 text-slate-500 border-slate-200" };
  return { txt: min < 30 ? "En pausa" : "Inactivo", dot: "bg-rose-400", chip: "bg-rose-50 text-rose-700 border-rose-200" };
}

const ESTADO_LLAMADA = {
  en_llamada: ["En llamada", "bg-emerald-100 text-emerald-700"],
  contestada: ["Contestó", "bg-blue-100 text-blue-700"],
  no_contesta: ["No contestó", "bg-amber-100 text-amber-700"],
  fallida: ["Falló", "bg-rose-100 text-rose-700"],
  omitida: ["Saltada", "bg-slate-100 text-slate-500"],
};

function Kpi({ titulo, valor, nota, tono = "text-slate-800" }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="text-[9px] font-black text-slate-400 uppercase tracking-wide">{titulo}</div>
      <div className={`text-3xl font-black mt-1 ${tono}`}>{valor}</div>
      {nota && <div className="text-[10px] text-slate-400 mt-0.5">{nota}</div>}
    </div>
  );
}

export default function AutomarcadorControl() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [ahora, setAhora] = useState(Date.now());

  const cargar = useCallback(() => {
    fetch(`${API}/control`, { headers: authH() })
      .then(r => r.json())
      .then(j => { if (!j.success) throw new Error(j.error || "No se pudo cargar el control"); setData(j.data); setError(""); })
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, REFRESCO_MS);
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => { clearInterval(id); clearInterval(reloj); };
  }, [cargar]);

  const asesores = data?.asesores || [];
  const t = asesores.reduce((acc, a) => ({
    enLlamada: acc.enLlamada + (a.en_llamada_desde ? 1 : 0),
    llamadas: acc.llamadas + a.llamadas_hoy,
    contestadas: acc.contestadas + a.contestadas_hoy,
    sinTipificar: acc.sinTipificar + a.sin_tipificar_hoy,
    contrata: acc.contrata + a.contrata_hoy,
    pendientes: acc.pendientes + a.pendientes,
  }), { enLlamada: 0, llamadas: 0, contestadas: 0, sinTipificar: 0, contrata: 0, pendientes: 0 });

  return (
    <div className="flex-1 overflow-y-auto p-1 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          En vivo · se actualiza cada 10 s{data?.generado && ` · ${hora(data.generado)}`}
        </div>
        <button onClick={cargar} className="text-[10px] font-black uppercase px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100">↻ Actualizar</button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-[11px] text-red-700 font-bold">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi titulo="En llamada ahora" valor={`${t.enLlamada}/${asesores.length}`} nota="asesores" tono="text-emerald-600" />
        <Kpi titulo="Llamadas hoy" valor={t.llamadas} nota={`${t.pendientes} pendientes en cola`} />
        <Kpi titulo="Contacto hoy" valor={`${pct(t.contestadas, t.llamadas)}%`} nota={`${t.contestadas} contestadas`} tono="text-blue-600" />
        <Kpi titulo="Contrata hoy" valor={t.contrata} tono="text-indigo-600" />
        <Kpi titulo="Sin tipificar" valor={t.sinTipificar} nota="llamadas de hoy" tono={t.sinTipificar ? "text-rose-600" : "text-slate-800"} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Asesores */}
        <div className="lg:col-span-2 space-y-2">
          <p className="text-[11px] font-black text-slate-700">Asesores</p>
          {!asesores.length && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-[11px] text-slate-400">
              No hay campañas Bitrix activas. Créalas en "Cargar base".
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            {asesores.map(a => {
              const e = estadoAsesor(a, ahora);
              const total = a.pendientes + a.llamadas_hoy;
              return (
                <div key={a.usuario_id} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[12px] font-black text-slate-800 truncate">{a.asesor || `Usuario #${a.usuario_id}`}</div>
                      <div className="text-[10px] text-slate-400">Última actividad {hora(a.ultima_actividad)}</div>
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1.5 text-[9px] font-black uppercase px-2 py-1 rounded-full border ${e.chip}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${e.dot}`} />{e.txt}
                    </span>
                  </div>
                  {a.en_llamada_desde && (
                    <div className="flex items-center justify-between bg-emerald-50 rounded-xl px-3 py-2 text-[11px]">
                      <span className="font-bold text-emerald-800 truncate">☎ {a.en_llamada_con || `Negociación #${a.en_llamada_deal || "—"}`}</span>
                      <span className="font-mono font-black text-emerald-700">{mmss((ahora - new Date(a.en_llamada_desde).getTime()) / 1000)}</span>
                    </div>
                  )}
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                      <span>Avance de cola</span><span className="font-bold">{a.llamadas_hoy}/{total}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct(a.llamadas_hoy, total)}%` }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-center">
                    {[["Llamadas", a.llamadas_hoy, "text-slate-800"], ["Contacto", `${pct(a.contestadas_hoy, a.llamadas_hoy)}%`, "text-blue-600"],
                      ["Contrata", a.contrata_hoy, "text-indigo-600"], ["Sin tipif.", a.sin_tipificar_hoy, a.sin_tipificar_hoy ? "text-rose-600" : "text-slate-800"]]
                      .map(([k, v, c]) => (
                        <div key={k} className="bg-slate-50 rounded-lg py-1.5">
                          <div className={`text-[13px] font-black ${c}`}>{v}</div>
                          <div className="text-[8px] font-bold text-slate-400 uppercase">{k}</div>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Últimas llamadas */}
        <div className="space-y-2">
          <p className="text-[11px] font-black text-slate-700">Últimas llamadas de hoy</p>
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
            {!(data?.ultimas || []).length && <div className="p-6 text-center text-[11px] text-slate-400">Aún no hay llamadas hoy.</div>}
            {(data?.ultimas || []).map(l => {
              const [etq, cls] = ESTADO_LLAMADA[l.estado] || [l.estado, "bg-slate-100 text-slate-500"];
              return (
                <div key={l.id} className="px-3 py-2.5 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-700 truncate">{l.nombre_cliente || `Negociación #${l.deal_id || "—"}`}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">{hora(l.ultimo_intento)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${cls}`}>{etq}</span>
                    {l.tipificacion
                      ? <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">{l.tipificacion}</span>
                      : l.estado !== "en_llamada" && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-rose-50 text-rose-600">Sin tipificar</span>}
                    {l.duracion_seg > 0 && <span className="text-[9px] text-slate-400">{mmss(l.duracion_seg)}</span>}
                    <span className="text-[9px] text-slate-400 truncate ml-auto">{l.asesor}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
