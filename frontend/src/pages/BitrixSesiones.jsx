// src/pages/BitrixSesiones.jsx
// Sesiones Bitrix24 — submódulo de Bitrix Live
//
// Quién está conectado a Bitrix24 ahora, desde hace cuánto, desde qué IP y con
// qué dispositivo. Datos de la API de Bitrix (user.get, im.user.list.get,
// timeman.status), no del ERP.
//
// ── Filtros dinámicos ────────────────────────────────────────────────────────
// Las opciones no están escritas a mano: el backend las deriva de lo que Bitrix
// devolvió, con su conteo. Cada filtro activo es una ficha que se quita con un
// clic, y el estado vacío ofrece limpiar en vez de dejarte atascado.
//
// ── Criterio visual ──────────────────────────────────────────────────────────
// Una escala de grises y un acento; el color solo cuando significa algo (verde
// = jornada abierta, ámbar = pausa). Sin mayúsculas forzadas: la jerarquía se
// hace con peso y tamaño. Transiciones de 150-200 ms en color y sombra, nunca
// en propiedades que recalculan layout. Las clases `ui-*` viven en index.css.

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3050";
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
const REFRESH_SECS = 60;

/* ── Iconos ───────────────────────────────────────────────────────────────────
   SVG de trazo, 1.5 px, heredan currentColor. Un emoji se ve distinto en cada
   sistema operativo y arrastra su propio color: rompe cualquier paleta.       */
const Ico = ({ d, size = 15, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    {d}
  </svg>
);
const I = {
  monitor:  <Ico d={<><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></>}/>,
  phone:    <Ico d={<><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></>}/>,
  devices:  <Ico d={<><rect x="2" y="4" width="13" height="10" rx="2"/><rect x="16" y="9" width="6" height="11" rx="1.5"/><path d="M6 18h5"/></>}/>,
  globe:    <Ico d={<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"/></>}/>,
  search:   <Ico d={<><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>}/>,
  download: <Ico d={<><path d="M12 3v12M7 11l5 5 5-5"/><path d="M4 20h16"/></>}/>,
  refresh:  <Ico d={<><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></>}/>,
  pin:      <Ico d={<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>} size={13}/>,
  users:    <Ico d={<><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.9"/></>}/>,
  clock:    <Ico d={<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>}/>,
  pause:    <Ico d={<><rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/></>}/>,
  play:     <Ico d={<><circle cx="12" cy="12" r="9"/><path d="M10.5 9 15 12l-4.5 3z"/></>}/>,
  alert:    <Ico d={<><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 17a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></>}/>,
};

const DISPO = {
  movil:      { label: "Móvil",              icon: I.phone },
  escritorio: { label: "Escritorio",         icon: I.monitor },
  ambos:      { label: "Móvil y escritorio", icon: I.devices },
  web:        { label: "Solo navegador",     icon: I.globe },
};
const dsp = (k) => DISPO[k] || DISPO.web;

const JORNADA = {
  OPENED:  { label: "Abierta",  dot: "ui-dot-ok" },
  PAUSED:  { label: "En pausa", dot: "ui-dot-warn" },
  CLOSED:  { label: "Cerrada",  dot: "" },
  EXPIRED: { label: "Expirada", dot: "" },
};
const jor = (k) => JORNADA[k] || { label: "Sin registro", dot: "" };

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

// ── Piezas ───────────────────────────────────────────────────────────────────

function Selector({ label, valor, onChange, opciones, todosLabel = "Todos", todosValor = "todos" }) {
  if (!opciones?.length) return null;
  return (
    <label className="flex flex-col gap-1.5">
      <span className="ui-label">{label}</span>
      <select value={valor} onChange={e => onChange(e.target.value)} className="ui-input ui-t max-w-[200px]">
        <option value={todosValor}>{todosLabel}</option>
        {opciones.map(o => (
          <option key={o.valor} value={o.valor}>{`${o.label || o.valor} · ${o.total}`}</option>
        ))}
      </select>
    </label>
  );
}

function Metrica({ label, valor, sub, acento }) {
  return (
    <div className="ui-card ui-card-hover ui-t px-4 py-3.5">
      <div className="ui-label">{label}</div>
      <div className="ui-value ui-num mt-1.5" style={acento ? { color: acento } : undefined}>{valor}</div>
      {sub && <div className="ui-meta mt-1">{sub}</div>}
    </div>
  );
}

export default function BitrixSesiones() {
  const [f, setF]             = useState(FILTROS_VACIOS);
  const [buscarVivo, setBV]   = useState("");
  const [res, setRes]         = useState(null);
  const [loading, setLoading] = useState(true);
  const [refrescando, setRef] = useState(false);
  const [error, setError]     = useState(null);
  const [countdown, setCd]    = useState(REFRESH_SECS);
  const [bajando, setBajando] = useState(false);
  const abortRef = useRef(null);

  // El buscador espera 350 ms: no dispara una petición por tecla.
  useEffect(() => {
    const t = setTimeout(() => setF(p => ({ ...p, buscar: buscarVivo })), 350);
    return () => clearTimeout(t);
  }, [buscarVivo]);

  const qs = useCallback(() => {
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => { if (v && v !== "todos" && v !== "TODOS") p.set(k, v); });
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
      setRes(await r.json());
      setError(null);
      setCd(REFRESH_SECS);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message || "No se pudo consultar Bitrix.");
    } finally { setLoading(false); setRef(false); }
  }, [qs]);

  useEffect(() => { cargar(!!res); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cargar]);

  useEffect(() => {
    const id = setInterval(() => {
      setCd(c => { if (c <= 1) { cargar(true); return REFRESH_SECS; } return c - 1; });
    }, 1000);
    return () => clearInterval(id);
  }, [cargar]);

  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }));
  const limpiar = () => { setF(FILTROS_VACIOS); setBV(""); };

  const fichas = useMemo(() => {
    const out = [];
    const et = (res?.opciones?.estados || []).find(e => e.valor === f.estado);
    if (f.cuenta !== "TODOS")      out.push({ t: f.cuenta,                     k: "cuenta",      v: "TODOS" });
    if (f.estado !== "todos")      out.push({ t: et?.label || f.estado,        k: "estado",      v: "todos" });
    if (f.dispositivo !== "todos") out.push({ t: dsp(f.dispositivo).label,     k: "dispositivo", v: "todos" });
    if (f.cargo !== "todos")       out.push({ t: f.cargo,                      k: "cargo",       v: "todos" });
    if (f.ip)                      out.push({ t: `IP ${f.ip}`,                 k: "ip",          v: "" });
    if (f.minHoras)                out.push({ t: `Más de ${f.minHoras} h`,     k: "minHoras",    v: "" });
    if (f.buscar)                  out.push({ t: `“${f.buscar}”`,              k: "buscar",      v: "" });
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

  const k  = res?.resumen || {};
  const op = res?.opciones || {};
  const filas = res?.data || [];

  return (
    <div className="space-y-4">

      {/* ── Cabecera ── */}
      <header className="flex flex-wrap items-center justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="ui-title">Sesiones Bitrix24</h2>
            <span className="ui-chip">
              <span className="ui-dot ui-dot-live"/>
              {refrescando ? "Actualizando" : "En vivo"}
            </span>
          </div>
          <p className="ui-meta mt-1">
            Novonet y Velsa
            {res?.generado && ` · consultado ${new Date(res.generado).toLocaleTimeString("es-EC", { timeStyle: "short" })}`}
            {` · próximo refresco en ${countdown}s`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => cargar(true)} disabled={refrescando} className="ui-btn ui-t">
            {I.refresh} Actualizar
          </button>
          <button onClick={descargar} disabled={bajando || !filas.length} className="ui-btn ui-btn-primary ui-t">
            {I.download} {bajando ? "Generando…" : "Excel"}
          </button>
        </div>
      </header>

      {/* ── Aviso: jornada laboral apagada ── */}
      {res && !res.timemanDisponible && (
        <div className="ui-card ui-in px-4 py-3.5 flex gap-3" style={{ borderColor: "#f0e0c0", background: "#fffcf5" }}>
          <span style={{ color: "var(--ui-warn)" }} className="mt-0.5 shrink-0">{I.alert}</span>
          <div>
            <div className="ui-strong">El registro de jornada no está activo en Bitrix</div>
            <p className="ui-body mt-1 leading-relaxed">
              Sin él, Bitrix no entrega IP de conexión, ubicación ni tiempo conectado: esas columnas van vacías.
              Sí se ve quién está en línea, desde qué dispositivo y su última actividad.
              Se activa en Bitrix24, en <i>Empresa → Registro de jornada laboral</i>.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="ui-card ui-in px-4 py-3.5 ui-body" style={{ borderColor: "#f2d5da", background: "#fffafb", color: "var(--ui-bad)" }}>
          {error}
        </div>
      )}

      {/* ── Métricas ── */}
      {res && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 ui-in">
          <Metrica label="Jornada abierta"    valor={k.jornadaAbierta ?? 0} acento="var(--ui-ok)" sub="Activos ahora"/>
          <Metrica label="En pausa"           valor={k.enPausa ?? 0}        acento={k.enPausa ? "var(--ui-warn)" : undefined}/>
          <Metrica label="En línea"           valor={k.enLinea ?? 0}        sub="Según Bitrix"/>
          <Metrica label="Promedio conectado" valor={hhmm(k.promedioConectadoSeg)} sub="De quienes marcaron"/>
          <Metrica label="Móvil"              valor={k.movil ?? 0}/>
          <Metrica label="Escritorio"         valor={k.escritorio ?? 0}/>
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="ui-card px-4 py-4 space-y-3.5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 flex-1 min-w-[210px]">
            <span className="ui-label">Buscar</span>
            <span className="relative flex items-center">
              <span className="absolute left-3 pointer-events-none" style={{ color: "var(--ui-fg-3)" }}>{I.search}</span>
              <input value={buscarVivo} onChange={e => setBV(e.target.value)}
                placeholder="Nombre, cargo, correo o IP"
                className="ui-input ui-t w-full" style={{ paddingLeft: 34 }}/>
            </span>
          </label>

          <Selector label="Cuenta" valor={f.cuenta} onChange={set("cuenta")} opciones={op.cuentas}
                    todosValor="TODOS" todosLabel="Novonet y Velsa"/>
          <Selector label="Estado" valor={f.estado} onChange={set("estado")} opciones={op.estados}
                    todosLabel="Cualquier estado"/>
          <Selector label="Dispositivo" valor={f.dispositivo} onChange={set("dispositivo")}
                    opciones={(op.dispositivos || []).map(o => ({ ...o, label: dsp(o.valor).label }))}
                    todosLabel="Cualquier dispositivo"/>
          <Selector label="Cargo" valor={f.cargo} onChange={set("cargo")} opciones={op.cargos}
                    todosLabel="Cualquier cargo"/>

          <div className="flex flex-col gap-1.5">
            <span className="ui-label">Conectado más de</span>
            <div className="ui-seg">
              {["", "1", "4", "8"].map(h => (
                <button key={h || "0"} onClick={() => set("minHoras")(h)}
                  data-on={f.minHoras === h ? "1" : "0"} className="ui-seg-item ui-t">
                  {h ? `${h} h` : "Todo"}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="ui-label">IP</span>
            <input value={f.ip} onChange={e => set("ip")(e.target.value)} placeholder="200.10"
              className="ui-input ui-t ui-num w-28"/>
          </label>
        </div>

        {fichas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-3" style={{ borderTop: "1px solid var(--ui-line-2)" }}>
            <span className="ui-label">Filtrando por</span>
            {fichas.map(x => (
              <span key={x.k} className="ui-chip ui-chip-filter ui-in">
                {x.t}
                <button onClick={() => { if (x.k === "buscar") setBV(""); setF(p => ({ ...p, [x.k]: x.v })); }}
                  className="ui-chip-x ui-t" aria-label={`Quitar filtro ${x.t}`}>
                  <svg width="9" height="9" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M1 1l8 8M9 1l-8 8"/>
                  </svg>
                </button>
              </span>
            ))}
            <button onClick={limpiar} className="ui-btn ui-t" style={{ padding: "4px 10px", fontSize: 12 }}>
              Limpiar todo
            </button>
          </div>
        )}

        {res && (
          <div className="ui-meta">
            Mostrando <span className="ui-num" style={{ color: "var(--ui-fg-2)", fontWeight: 550 }}>{k.mostrados}</span> de {k.totalUsuarios} usuarios
            {k.ipsDistintas > 0 && ` · ${k.ipsDistintas} IP distintas`}
          </div>
        )}
      </div>

      {/* ── Tabla ── */}
      <div className="ui-card overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="ui-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Estado</th>
                <th style={{ textAlign: "right" }}>Conectado</th>
                <th>Desde</th>
                <th>Dispositivo</th>
                <th>IP</th>
                <th>Última actividad</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(u => {
                const j = jor(u.jornada);
                return (
                  <tr key={`${u.cuenta}-${u.id}`}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className={`ui-dot ${u.online ? "ui-dot-ok" : ""}`}/>
                        <span>
                          <span className="ui-strong block leading-tight">{u.nombre}</span>
                          <span className="ui-meta">{u.cuenta}{u.cargo ? ` · ${u.cargo}` : ""}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="ui-chip"><span className={`ui-dot ${j.dot}`}/>{j.label}</span>
                    </td>
                    <td className="ui-num" style={{ textAlign: "right", fontWeight: 550, color: "var(--ui-fg)" }}>
                      {reloj(u.conectadoSeg)}
                    </td>
                    <td className="whitespace-nowrap">{fh(u.jornadaInicio)}</td>
                    <td>
                      <span className="ui-chip">
                        <span style={{ color: "var(--ui-fg-3)", display: "inline-flex" }}>{dsp(u.dispositivo).icon}</span>
                        {dsp(u.dispositivo).label}
                      </span>
                    </td>
                    <td className="ui-num">
                      {u.ipInicio || "—"}
                      {u.lat && u.lon && (
                        <a href={`https://www.google.com/maps?q=${u.lat},${u.lon}`} target="_blank" rel="noreferrer"
                           className="ui-t inline-flex align-middle ml-1.5" style={{ color: "var(--ui-accent)" }}
                           title="Ver ubicación de la marcación">{I.pin}</a>
                      )}
                    </td>
                    <td className="whitespace-nowrap">{fh(u.ultimaActividad)}</td>
                  </tr>
                );
              })}

              {!filas.length && !loading && (
                <tr><td colSpan={7} style={{ padding: "56px 16px", textAlign: "center" }}>
                  <div className="ui-body">Ningún usuario coincide con estos filtros.</div>
                  {fichas.length > 0 && (
                    <button onClick={limpiar} className="ui-btn ui-t mt-3">
                      Limpiar {fichas.length === 1 ? "el filtro" : `los ${fichas.length} filtros`}
                    </button>
                  )}
                </td></tr>
              )}
              {loading && !filas.length && (
                <tr><td colSpan={7} style={{ padding: "56px 16px", textAlign: "center" }} className="ui-body">
                  Consultando Bitrix24…
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="ui-meta leading-relaxed px-0.5">
        Datos de la API de Bitrix24: <b style={{ fontWeight: 550 }}>user.get</b> (en línea, último acceso),
        <b style={{ fontWeight: 550 }}> im.user.list.get</b> (móvil o escritorio) y
        <b style={{ fontWeight: 550 }}> timeman.status</b> (jornada, tiempo conectado, IP y ubicación).
        El tiempo conectado cuenta desde la apertura de jornada; el neto sin pausas va en el Excel.
      </p>
    </div>
  );
}
