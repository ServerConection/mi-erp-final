// src/pages/BitrixSesiones.jsx
// Sesiones Bitrix24 — submódulo de Bitrix Live
//
// Quién está conectado a Bitrix24 ahora mismo, desde hace cuánto, desde qué IP
// y con qué dispositivo. Datos de la API de Bitrix (user.get, im.user.list.get,
// timeman.status), no del ERP.
//
// ── Filtros dinámicos ────────────────────────────────────────────────────────
// Las opciones de cada filtro NO están escritas a mano: el backend las deriva
// de lo que Bitrix devolvió y las manda con su conteo. Si aparece un cargo o
// una cuenta nueva, el filtro se actualiza solo. Cada filtro activo se ve como
// una ficha que se quita con un clic, y hay "Limpiar todo" siempre a la vista:
// nunca te quedas sin saber por qué la lista está vacía.

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3050";
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
const REFRESH_SECS = 60;

const DISPO = {
  movil:      { icon: "📱", label: "Móvil",              color: "#8b5cf6", chip: "bg-violet-50 text-violet-700 border-violet-200" },
  escritorio: { icon: "🖥️", label: "Escritorio",         color: "#2563eb", chip: "bg-blue-50 text-blue-700 border-blue-200" },
  ambos:      { icon: "🔀", label: "Móvil y escritorio", color: "#0891b2", chip: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  web:        { icon: "🌐", label: "Solo navegador",     color: "#94a3b8", chip: "bg-slate-100 text-slate-600 border-slate-200" },
};
const dsp = (k) => DISPO[k] || DISPO.web;

const JORNADA = {
  OPENED:  { label: "Jornada abierta", color: "#10b981", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "#10b981" },
  PAUSED:  { label: "En pausa",        color: "#f59e0b", chip: "bg-amber-50 text-amber-700 border-amber-200",       dot: "#f59e0b" },
  CLOSED:  { label: "Cerrada",         color: "#94a3b8", chip: "bg-slate-100 text-slate-500 border-slate-200",      dot: "#cbd5e1" },
  EXPIRED: { label: "Expirada",        color: "#94a3b8", chip: "bg-slate-100 text-slate-500 border-slate-200",      dot: "#cbd5e1" },
};
const jor = (k) => JORNADA[k] || { label: "Sin registro", color: "#94a3b8", chip: "bg-slate-100 text-slate-400 border-slate-200", dot: "#e2e8f0" };

const EMP = { NOVONET: "#2563eb", VELSA: "#ea580c" };

const hhmm = (s) => {
  if (s == null) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};
const reloj = (s) => {
  if (s == null) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return [h, m, x].map(n => String(n).padStart(2, "0")).join(":");
};
const fh = (f) => {
  if (!f) return "—";
  const d = new Date(f);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("es-EC", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const FILTROS_VACIOS = {
  cuenta: "TODOS", estado: "todos", dispositivo: "todos",
  cargo: "todos", ip: "", buscar: "", minHoras: "",
};

// ── Selector genérico: se dibuja solo a partir de las opciones del backend ────
function Selector({ label, valor, onChange, opciones, todosLabel = "Todos", todosValor = "todos" }) {
  if (!opciones?.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-slate-500 text-[8px] font-black uppercase tracking-widest">{label}</span>
      <select value={valor} onChange={e => onChange(e.target.value)}
        className="border border-slate-200 rounded-lg px-3 py-1.5 text-[12px] font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 max-w-[190px]">
        <option value={todosValor}>{todosLabel}</option>
        {opciones.map(o => (
          <option key={o.valor} value={o.valor}>
            {(o.label || o.valor) + ` (${o.total})`}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Ficha de filtro activo ───────────────────────────────────────────────────
function Ficha({ texto, onQuitar }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-slate-900 text-white rounded-full pl-3 pr-1.5 py-1 text-[10px] font-black uppercase tracking-wider">
      {texto}
      <button onClick={onQuitar} aria-label={`Quitar filtro ${texto}`}
        className="w-4 h-4 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center leading-none transition">×</button>
    </span>
  );
}

function Tarjeta({ label, valor, sub, color = "#0f172a", icon }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-slate-500 text-[9px] font-black uppercase tracking-widest">{label}</span>
        {icon && <span className="text-[13px]">{icon}</span>}
      </div>
      <div className="text-[24px] font-black leading-tight mt-1" style={{ color }}>{valor}</div>
      {sub && <div className="text-slate-400 text-[10px] font-bold mt-0.5">{sub}</div>}
    </div>
  );
}

export default function BitrixSesiones() {
  const [f, setF]             = useState(FILTROS_VACIOS);
  const [buscarVivo, setBV]   = useState("");          // lo que se teclea, antes del debounce
  const [res, setRes]         = useState(null);
  const [loading, setLoading] = useState(true);
  const [refrescando, setRef] = useState(false);
  const [error, setError]     = useState(null);
  const [countdown, setCd]    = useState(REFRESH_SECS);
  const [bajando, setBajando] = useState(false);
  const abortRef = useRef(null);

  // El buscador no dispara una petición por tecla: espera 350 ms.
  useEffect(() => {
    const t = setTimeout(() => setF(p => ({ ...p, buscar: buscarVivo })), 350);
    return () => clearTimeout(t);
  }, [buscarVivo]);

  const qs = useCallback(() => {
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => {
      if (v && v !== "todos" && v !== "TODOS") p.set(k, v);
    });
    return p.toString();
  }, [f]);

  const cargar = useCallback(async (silencioso = false) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    silencioso ? setRef(true) : setLoading(true);
    try {
      const r = await fetch(`${API}/api/bitrix-sesiones/live?${qs()}`, { headers: authH(), signal: ctrl.signal });
      if (r.status === 403) { setError("No tienes permiso para ver las sesiones de Bitrix."); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setRes(j);
      setError(null);
      setCd(REFRESH_SECS);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message || "No se pudo consultar Bitrix.");
    } finally {
      setLoading(false); setRef(false);
    }
  }, [qs]);

  useEffect(() => { cargar(!!res); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cargar]);

  // Refresco automático: la pantalla nunca se vacía, solo se marca "actualizando".
  useEffect(() => {
    const id = setInterval(() => {
      setCd(c => { if (c <= 1) { cargar(true); return REFRESH_SECS; } return c - 1; });
    }, 1000);
    return () => clearInterval(id);
  }, [cargar]);

  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }));
  const limpiar = () => { setF(FILTROS_VACIOS); setBV(""); };

  // Fichas de lo que está filtrado ahora mismo
  const fichas = useMemo(() => {
    const out = [];
    const et = (res?.opciones?.estados || []).find(e => e.valor === f.estado);
    if (f.cuenta !== "TODOS")      out.push({ t: f.cuenta,                     k: "cuenta",      v: "TODOS" });
    if (f.estado !== "todos")      out.push({ t: et?.label || f.estado,        k: "estado",      v: "todos" });
    if (f.dispositivo !== "todos") out.push({ t: dsp(f.dispositivo).label,     k: "dispositivo", v: "todos" });
    if (f.cargo !== "todos")       out.push({ t: f.cargo,                      k: "cargo",       v: "todos" });
    if (f.ip)                      out.push({ t: `IP ${f.ip}`,                 k: "ip",          v: "" });
    if (f.minHoras)                out.push({ t: `+${f.minHoras} h conectado`, k: "minHoras",    v: "" });
    if (f.buscar)                  out.push({ t: `"${f.buscar}"`,              k: "buscar",      v: "" });
    return out;
  }, [f, res]);

  const descargar = async () => {
    setBajando(true);
    try {
      const r = await fetch(`${API}/api/bitrix-sesiones/export?${qs()}`, { headers: authH() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `sesiones_bitrix_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setError("No se pudo generar la descarga: " + e.message); }
    finally { setBajando(false); }
  };

  const k = res?.resumen || {};
  const op = res?.opciones || {};
  const filas = res?.data || [];

  return (
    <div className="space-y-5">

      {/* ── Cabecera ── */}
      <div className="bg-slate-900 rounded-2xl px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white font-black text-[13px]">SES</div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-white font-black text-[19px] uppercase tracking-tight">Sesiones Bitrix24</h2>
              <span className="flex items-center gap-1 bg-emerald-500/15 border border-emerald-400/30 rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
                <span className="text-emerald-300 text-[8px] font-black uppercase tracking-widest">En vivo</span>
              </span>
              {refrescando && <span className="text-slate-400 text-[8px] font-black uppercase tracking-widest animate-pulse">· actualizando</span>}
            </div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-0.5">
              Novonet + Velsa{res?.generado && ` · Consultado ${new Date(res.generado).toLocaleTimeString("es-EC", { timeStyle: "short" })}`}
              {` · Refresca en ${countdown}s`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => cargar(true)} disabled={refrescando}
            className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-black uppercase tracking-wider disabled:opacity-40">
            ↻ Actualizar
          </button>
          <button onClick={descargar} disabled={bajando || !filas.length}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black uppercase tracking-wider disabled:opacity-40">
            {bajando ? "Generando…" : "⬇ Descargar Excel"}
          </button>
        </div>
      </div>

      {/* ── Aviso: jornada laboral apagada ── */}
      {res && !res.timemanDisponible && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
          <div className="text-amber-900 font-black text-[13px] mb-1">El registro de jornada no está activo en Bitrix</div>
          <p className="text-amber-800 text-[12px] font-semibold leading-relaxed">
            Sin él, Bitrix no entrega <b>IP de conexión, ubicación ni tiempo conectado</b>: esas columnas van vacías.
            Lo que sí se ve es quién está en línea, desde qué dispositivo y su última actividad.
            Se activa en Bitrix24 en <i>Empresa → Registro de jornada laboral</i>, y los asesores deben marcar entrada.
          </p>
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-800 text-[12px] font-bold">{error}</div>}

      {/* ── KPIs ── */}
      {res && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Tarjeta label="Jornada abierta" valor={k.jornadaAbierta ?? 0} color="#059669" icon="🟢" sub="Activos ahora"/>
          <Tarjeta label="En pausa"        valor={k.enPausa ?? 0}        color="#d97706" icon="⏸"/>
          <Tarjeta label="En línea"        valor={k.enLinea ?? 0}        icon="👤" sub="Según Bitrix"/>
          <Tarjeta label="Promedio conectado" valor={hhmm(k.promedioConectadoSeg)} icon="⏱" sub="De los que marcaron"/>
          <Tarjeta label="Móvil"           valor={k.movil ?? 0}          color="#8b5cf6" icon="📱"/>
          <Tarjeta label="Escritorio"      valor={k.escritorio ?? 0}     color="#2563eb" icon="🖥️"/>
        </div>
      )}

      {/* ── Filtros dinámicos ── */}
      <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 space-y-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <span className="text-slate-500 text-[8px] font-black uppercase tracking-widest">Buscar</span>
            <input value={buscarVivo} onChange={e => setBV(e.target.value)}
              placeholder="Nombre, cargo, correo o IP…"
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-[12px] font-semibold w-full focus:outline-none focus:ring-2 focus:ring-slate-300"/>
          </div>

          <Selector label="Cuenta" valor={f.cuenta} onChange={set("cuenta")} opciones={op.cuentas} todosValor="TODOS" todosLabel="Novonet + Velsa"/>
          <Selector label="Estado" valor={f.estado} onChange={set("estado")} opciones={op.estados} todosLabel="Cualquier estado"/>
          <Selector label="Dispositivo" valor={f.dispositivo} onChange={set("dispositivo")}
            opciones={(op.dispositivos || []).map(o => ({ ...o, label: dsp(o.valor).label }))} todosLabel="Cualquier dispositivo"/>
          <Selector label="Cargo" valor={f.cargo} onChange={set("cargo")} opciones={op.cargos} todosLabel="Cualquier cargo"/>

          <div className="flex flex-col gap-1">
            <span className="text-slate-500 text-[8px] font-black uppercase tracking-widest">Conectado más de</span>
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              {["", "1", "4", "8"].map(h => (
                <button key={h || "0"} onClick={() => set("minHoras")(h)}
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-black transition ${
                    f.minHoras === h ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  {h ? `${h}h` : "Todo"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-slate-500 text-[8px] font-black uppercase tracking-widest">IP</span>
            <input value={f.ip} onChange={e => set("ip")(e.target.value)} placeholder="200.10…"
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-[12px] font-semibold w-32 font-mono focus:outline-none focus:ring-2 focus:ring-slate-300"/>
          </div>
        </div>

        {/* Fichas de filtros activos */}
        {fichas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
            <span className="text-slate-400 text-[9px] font-black uppercase tracking-widest">Filtrando por</span>
            {fichas.map(x => (
              <Ficha key={x.k} texto={x.t} onQuitar={() => {
                if (x.k === "buscar") setBV("");
                setF(p => ({ ...p, [x.k]: x.v }));
              }}/>
            ))}
            <button onClick={limpiar}
              className="text-slate-500 hover:text-slate-900 text-[10px] font-black uppercase tracking-wider underline underline-offset-2">
              Limpiar todo
            </button>
          </div>
        )}

        {res && (
          <div className="text-slate-400 text-[10px] font-bold">
            Mostrando <b className="text-slate-700">{k.mostrados}</b> de {k.totalUsuarios} usuarios de Bitrix
            {k.ipsDistintas > 0 && ` · ${k.ipsDistintas} IP(s) distintas`}
          </div>
        )}
      </div>

      {/* ── Tabla ── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 text-slate-500 text-[9px] font-black uppercase tracking-widest sticky top-0 z-10">
              <tr>
                <th className="text-left  px-5 py-2">Usuario</th>
                <th className="text-left  px-3 py-2">Estado</th>
                <th className="text-right px-3 py-2">Conectado</th>
                <th className="text-left  px-3 py-2">Desde</th>
                <th className="text-left  px-3 py-2">Dispositivo</th>
                <th className="text-left  px-3 py-2">IP</th>
                <th className="text-left  px-5 py-2">Última actividad</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(u => {
                const j = jor(u.jornada);
                return (
                  <tr key={`${u.cuenta}-${u.id}`} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-5 py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: u.online ? "#10b981" : "#e2e8f0" }}/>
                        <div>
                          <div className="font-black text-slate-800 leading-tight">{u.nombre}</div>
                          <div className="text-[10px] font-bold" style={{ color: EMP[u.cuenta] || "#94a3b8" }}>
                            {u.cuenta}{u.cargo ? ` · ${u.cargo}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-[10px] font-black ${j.chip}`}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: j.dot }}/>{j.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-black text-slate-800">{reloj(u.conectadoSeg)}</td>
                    <td className="px-3 py-2 text-slate-500 font-semibold whitespace-nowrap">{fh(u.jornadaInicio)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-[10px] font-black ${dsp(u.dispositivo).chip}`}>
                        {dsp(u.dispositivo).icon} {dsp(u.dispositivo).label}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-600">
                      {u.ipInicio || "—"}
                      {u.lat && u.lon && (
                        <a href={`https://www.google.com/maps?q=${u.lat},${u.lon}`} target="_blank" rel="noreferrer"
                           className="ml-1.5 text-blue-600 hover:underline" title="Ver ubicación de la marcación">📍</a>
                      )}
                    </td>
                    <td className="px-5 py-2 text-slate-500 font-semibold whitespace-nowrap">{fh(u.ultimaActividad)}</td>
                  </tr>
                );
              })}
              {!filas.length && !loading && (
                <tr><td colSpan={7} className="px-5 py-12 text-center">
                  <div className="text-slate-400 font-bold mb-2">Ningún usuario coincide con estos filtros.</div>
                  {fichas.length > 0 && (
                    <button onClick={limpiar} className="text-slate-900 text-[11px] font-black uppercase tracking-wider underline underline-offset-2">
                      Limpiar los {fichas.length} filtro(s)
                    </button>
                  )}
                </td></tr>
              )}
              {loading && !filas.length && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400 font-bold">Consultando Bitrix24…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-slate-400 text-[10px] font-bold leading-relaxed px-1">
        Datos de la API de Bitrix24: <b>user.get</b> (en línea, último login), <b>im.user.list.get</b> (móvil vs escritorio)
        y <b>timeman.status</b> (jornada, tiempo conectado, IP y ubicación).
        El "tiempo conectado" es desde la apertura de jornada; el neto sin pausas va en el Excel.
      </div>
    </div>
  );
}
