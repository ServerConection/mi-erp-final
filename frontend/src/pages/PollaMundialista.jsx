// =============================================================================
// POLLA MUNDIALISTA 2026 ⚽🏆
// Predicciones del Mundial FIFA 2026 (48 selecciones, 12 grupos A-L).
// - Mi Polla: clasificación 1º-4º por grupo con ARRASTRAR Y SOLTAR + fases
// - Pronósticos: calendario oficial FIFA por fecha (zona Ecuador) con marcadores
// - Ranking: tabla de aciertos y puntos con podio
// - Resultados: vista para todos, edición solo ADMIN
// =============================================================================
import { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_URL || "";

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});
const fetchJson = async (url, opts = {}) => {
  const res = await fetch(`${API}${url}`, { headers: authHeaders(), ...opts });
  return res.json();
};

const flag = (code, size = 40) => `https://flagcdn.com/w${size}/${code}.png`;
const flag2x = (code, size = 40) => `https://flagcdn.com/w${size * 2}/${code}.png 2x`;

const GRUPOS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

const FASES_DEF = [
  { key: "DIECISEISAVOS", label: "Dieciseisavos", corto: "16avos", cupos: 32, emoji: "🎫" },
  { key: "OCTAVOS",       label: "Octavos",       corto: "8vos",   cupos: 16, emoji: "⚔️" },
  { key: "CUARTOS",       label: "Cuartos",       corto: "4tos",   cupos: 8,  emoji: "🔥" },
  { key: "SEMIS",         label: "Semifinales",   corto: "Semis",  cupos: 4,  emoji: "💎" },
  { key: "FINAL",         label: "Finalistas",    corto: "Final",  cupos: 2,  emoji: "🏟️" },
  { key: "CAMPEON",       label: "Campeón",       corto: "Camp.",  cupos: 1,  emoji: "👑" },
];

// Fases del calendario de partidos
const FASE_PARTIDO = {
  GRUPOS:  { label: "Fase de Grupos", emoji: "⚽" },
  R32:     { label: "Dieciseisavos",  emoji: "🎫" },
  R16:     { label: "Octavos",        emoji: "⚔️" },
  CUARTOS: { label: "Cuartos",        emoji: "🔥" },
  SEMIS:   { label: "Semifinales",    emoji: "💎" },
  TERCER:  { label: "Tercer puesto",  emoji: "🥉" },
  FINAL:   { label: "Final",          emoji: "🏆" },
};
const FASE_PARTIDO_ORDEN = ["GRUPOS", "R32", "R16", "CUARTOS", "SEMIS", "TERCER", "FINAL"];

const POS_STYLE = {
  1: { badge: "bg-gradient-to-br from-yellow-300 to-amber-500 text-amber-950", ring: "ring-amber-400/60", label: "1º", medal: "🥇" },
  2: { badge: "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800", ring: "ring-slate-300/50", label: "2º", medal: "🥈" },
  3: { badge: "bg-gradient-to-br from-orange-300 to-orange-500 text-orange-950", ring: "ring-orange-400/50", label: "3º", medal: "🥉" },
  4: { badge: "bg-slate-700 text-slate-300", ring: "ring-slate-600/40", label: "4º", medal: "" },
};

const GRUPO_COLORS = {
  A: "#f59e0b", B: "#3b82f6", C: "#10b981", D: "#ef4444",
  E: "#8b5cf6", F: "#ec4899", G: "#14b8a6", H: "#f97316",
  I: "#6366f1", J: "#06b6d4", K: "#84cc16", L: "#e11d48",
};

// ─── Formateadores de fecha/hora en zona Ecuador ─────────────────────────────
const TZ = "America/Guayaquil";
const fmtDiaLargo = new Intl.DateTimeFormat("es-EC", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
const fmtHora = new Intl.DateTimeFormat("es-EC", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: TZ });
const fmtFechaKey = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const Toast = ({ toast }) =>
  !toast ? null : (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold backdrop-blur-md border ${
        toast.ok
          ? "bg-emerald-500/90 border-emerald-300/40 text-white"
          : "bg-rose-600/90 border-rose-300/40 text-white"
      }`}
    >
      {toast.msg}
    </div>
  );

const Bandera = ({ codigo, nombre, size = 40, className = "" }) =>
  codigo ? (
    <img
      src={flag(codigo, size)}
      srcSet={flag2x(codigo, size)}
      alt={nombre}
      loading="lazy"
      className={`rounded-[4px] object-cover shadow-md shadow-black/40 ring-1 ring-white/20 ${className}`}
      style={{ width: size, height: Math.round(size * 0.75) }}
    />
  ) : (
    <span
      className={`rounded-[4px] grid place-items-center bg-white/10 ring-1 ring-white/15 text-white/40 ${className}`}
      style={{ width: size, height: Math.round(size * 0.75), fontSize: size * 0.5 }}
    >
      🏳️
    </span>
  );

// ═════════════════════════════════════════════════════════════════════════════
// TABLERO DE GRUPO — Arrastrar y soltar (clasificación 1º-4º)
// slots: array de 4 posiciones (equipo_id | null). disabled = solo lectura.
// ═════════════════════════════════════════════════════════════════════════════
function GrupoBoard({ grupo, equipos, slots, setSlots, disabled, titulo }) {
  const [overSlot, setOverSlot] = useState(null);
  const [overPool, setOverPool] = useState(false);

  const byId = useMemo(() => new Map(equipos.map((e) => [e.id, e])), [equipos]);
  const enSlots = new Set(slots.filter(Boolean));
  const pool = equipos.filter((e) => !enSlots.has(e.id));
  const color = GRUPO_COLORS[grupo] || "#64748b";
  const completo = slots.filter(Boolean).length === 4;

  const setDrag = (e, payload) => {
    e.dataTransfer.setData("text/plain", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
  };
  const getDrag = (e) => {
    try { return JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return null; }
  };

  // Soltar en un slot concreto
  const dropEnSlot = (e, index) => {
    e.preventDefault();
    setOverSlot(null);
    if (disabled) return;
    const src = getDrag(e);
    if (!src) return;
    const next = [...slots];
    if (src.from === "pool") {
      // quitar el equipo de cualquier slot previo y colocarlo aquí
      for (let i = 0; i < 4; i++) if (next[i] === src.id) next[i] = null;
      next[index] = src.id; // si había ocupante, vuelve al pool al perder su slot
    } else if (src.from === "slot") {
      const tmp = next[index];
      next[index] = next[src.index];
      next[src.index] = tmp; // intercambio
    }
    setSlots(next);
  };

  // Soltar de vuelta en el pool (quitar de la clasificación)
  const dropEnPool = (e) => {
    e.preventDefault();
    setOverPool(false);
    if (disabled) return;
    const src = getDrag(e);
    if (!src || src.from !== "slot") return;
    const next = [...slots];
    next[src.index] = null;
    setSlots(next);
  };

  const allow = (e) => { if (!disabled) e.preventDefault(); };

  return (
    <div
      className={`rounded-2xl bg-white/[0.04] backdrop-blur-sm border overflow-hidden ${
        completo ? "border-emerald-400/40 shadow-lg shadow-emerald-500/10" : "border-white/10"
      }`}
    >
      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: `linear-gradient(90deg, ${color}33, transparent)` }}>
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg grid place-items-center text-sm font-black text-white shadow" style={{ background: color }}>{grupo}</span>
          <span className="text-white/90 font-bold text-sm tracking-wide">{titulo || `GRUPO ${grupo}`}</span>
        </div>
        {completo ? <span className="text-emerald-400 text-xs font-bold">✓ Completo</span> : <span className="text-white/40 text-xs">{slots.filter(Boolean).length}/4</span>}
      </div>

      <div className="p-3 space-y-3">
        {/* Slots de clasificación */}
        <div className="space-y-1.5">
          {[0, 1, 2, 3].map((i) => {
            const st = POS_STYLE[i + 1];
            const eq = slots[i] ? byId.get(slots[i]) : null;
            const activo = overSlot === i;
            return (
              <div
                key={i}
                onDragOver={(e) => { allow(e); if (!disabled) setOverSlot(i); }}
                onDragLeave={() => setOverSlot((s) => (s === i ? null : s))}
                onDrop={(e) => dropEnSlot(e, i)}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-all ${
                  eq ? `bg-white/[0.08] ring-1 ${st.ring} border-transparent` : "bg-white/[0.02] border-dashed border-white/15"
                } ${activo ? "border-amber-400/70 bg-amber-400/10 scale-[1.01]" : ""}`}
              >
                <span className={`w-7 h-7 shrink-0 rounded-full grid place-items-center text-xs font-black shadow ${eq ? st.badge : "bg-white/10 text-white/40"}`}>{st.label}</span>
                {eq ? (
                  <div
                    draggable={!disabled}
                    onDragStart={(e) => setDrag(e, { from: "slot", index: i })}
                    className={`flex items-center gap-2 flex-1 ${disabled ? "" : "cursor-grab active:cursor-grabbing"}`}
                  >
                    <Bandera codigo={eq.codigo} nombre={eq.nombre} size={36} />
                    <span className="text-sm font-semibold text-white truncate">{eq.nombre}</span>
                    {st.medal && <span className="ml-auto text-base">{st.medal}</span>}
                  </div>
                ) : (
                  <span className="text-xs text-white/30 italic">{disabled ? "—" : "Arrastra aquí"}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Pool de equipos disponibles */}
        {!disabled && (
          <div
            onDragOver={(e) => { allow(e); setOverPool(true); }}
            onDragLeave={() => setOverPool(false)}
            onDrop={dropEnPool}
            className={`rounded-xl border border-white/10 p-2 min-h-[52px] transition-colors ${overPool ? "bg-rose-400/10 border-rose-300/40" : "bg-black/20"}`}
          >
            <div className="text-[10px] uppercase tracking-wider text-white/35 mb-1.5 px-1">{pool.length > 0 ? "Equipos sin ubicar · arrástralos a una posición" : "Arrastra entre posiciones para reordenar ↕"}</div>
            <div className="flex flex-wrap gap-1.5">
              {pool.map((e) => (
                <div
                  key={e.id}
                  draggable
                  onDragStart={(ev) => setDrag(ev, { from: "pool", id: e.id })}
                  className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full bg-white/[0.06] border border-white/10 text-white/80 text-xs font-semibold cursor-grab active:cursor-grabbing hover:bg-white/12"
                >
                  <Bandera codigo={e.codigo} nombre={e.nombre} size={20} />
                  {e.nombre}
                </div>
              ))}
              {pool.length === 0 && <span className="text-xs text-emerald-300/60 px-1 py-0.5">✓ Los 4 equipos están ubicados — arrastra para cambiar el orden</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Selector de fase (chips con banderas) ───────────────────────────────────
function FaseSelector({ fase, equipos, seleccion, setSeleccion, disabled }) {
  const sel = new Set(seleccion);
  const toggle = (id) => {
    if (disabled) return;
    if (sel.has(id)) setSeleccion(seleccion.filter((x) => x !== id));
    else if (seleccion.length < fase.cupos) setSeleccion([...seleccion, id]);
  };
  const lleno = seleccion.length >= fase.cupos;
  return (
    <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{fase.emoji}</span>
          <h3 className="text-white font-bold">{fase.label}</h3>
        </div>
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${seleccion.length === fase.cupos ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/50"}`}>
          {seleccion.length} / {fase.cupos}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {equipos.map((e) => {
          const on = sel.has(e.id);
          return (
            <button
              key={e.id}
              onClick={() => toggle(e.id)}
              disabled={disabled || (!on && lleno)}
              className={`flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full text-xs font-semibold transition-all duration-150 border ${
                on
                  ? "bg-gradient-to-r from-amber-400/30 to-yellow-500/20 border-amber-400/50 text-amber-100 shadow shadow-amber-500/20"
                  : lleno || disabled
                  ? "bg-white/[0.02] border-white/5 text-white/25"
                  : "bg-white/[0.04] border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
              } ${disabled ? "cursor-default" : "cursor-pointer active:scale-95"}`}
            >
              <Bandera codigo={e.codigo} nombre={e.nombre} size={20} />
              {e.nombre}
              {on && fase.key === "CAMPEON" && <span>👑</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TARJETA DE PARTIDO — pronóstico de marcador (+ marcador real para admin)
// ═════════════════════════════════════════════════════════════════════════════
function Stepper({ value, onChange, disabled, color = "amber" }) {
  const v = value === "" || value == null ? "" : value;
  const set = (n) => onChange(Math.max(0, Math.min(99, n)));
  const ring = color === "emerald" ? "focus:ring-emerald-400/50" : "focus:ring-amber-400/50";
  return (
    <div className="flex items-center gap-1">
      <button type="button" disabled={disabled} onClick={() => set((Number(v) || 0) - 1)}
        className="w-6 h-7 rounded-md bg-white/8 text-white/60 text-sm font-bold disabled:opacity-30 hover:bg-white/15">−</button>
      <input
        type="number" inputMode="numeric" min={0} max={99} value={v} disabled={disabled}
        onChange={(e) => { const n = e.target.value === "" ? "" : Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0)); onChange(n); }}
        className={`w-9 h-7 text-center rounded-md bg-black/30 border border-white/15 text-white font-black text-sm outline-none focus:ring-2 ${ring} disabled:opacity-50`}
      />
      <button type="button" disabled={disabled} onClick={() => set((Number(v) || 0) + 1)}
        className="w-6 h-7 rounded-md bg-white/8 text-white/60 text-sm font-bold disabled:opacity-30 hover:bg-white/15">+</button>
    </div>
  );
}

function PartidoCard({ partido, pred, setPred, real, setReal, esAdmin, abierta, notify }) {
  const ya = new Date(partido.kickoff).getTime() <= Date.now();
  const bloqueado = ya || !abierta;
  const color = GRUPO_COLORS[partido.grupo] || "#64748b";
  const tieneReal = real && real.home_goles != null && real.away_goles != null;

  // Lado equipo (bandera + nombre o placeholder)
  const Lado = ({ cod, nom, label, align }) => (
    <div className={`flex items-center gap-2 min-w-0 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <Bandera codigo={cod} nombre={nom || label} size={34} />
      <span className="text-sm font-semibold text-white/90 truncate">{nom || label}</span>
    </div>
  );

  // ¿Acertó el usuario? (cuando ya hay marcador real y pronóstico)
  let acierto = null;
  if (tieneReal && pred && pred.home !== "" && pred.away !== "" && pred.home != null && pred.away != null) {
    const exact = Number(pred.home) === real.home_goles && Number(pred.away) === real.away_goles;
    const sg = (h, a) => (h > a ? 1 : h < a ? -1 : 0);
    const mismo = sg(Number(pred.home), Number(pred.away)) === sg(real.home_goles, real.away_goles);
    acierto = exact ? "exacto" : mismo ? "resultado" : "fallo";
  }

  return (
    <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: `${color}66` }}>
          #{partido.numero}{partido.grupo ? ` · Grupo ${partido.grupo}` : ""}
        </span>
        <span className="text-[10px] text-white/40 truncate ml-2">{fmtHora.format(new Date(partido.kickoff))} · {partido.ciudad}</span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Lado cod={partido.home_codigo} nom={partido.home_nombre} label={partido.home_label} align="left" />
        <div className="flex flex-col items-center gap-1">
          <Stepper value={pred?.home ?? ""} onChange={(n) => setPred({ ...pred, home: n })} disabled={bloqueado} />
          <span className="text-white/25 text-[10px] font-bold">VS</span>
          <Stepper value={pred?.away ?? ""} onChange={(n) => setPred({ ...pred, away: n })} disabled={bloqueado} />
        </div>
        <Lado cod={partido.away_codigo} nom={partido.away_nombre} label={partido.away_label} align="right" />
      </div>

      {/* Estado */}
      <div className="mt-2 flex items-center justify-center gap-2 text-[11px]">
        {ya && <span className="text-rose-300/80 font-semibold">🔒 Ya comenzó</span>}
        {tieneReal && (
          <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/70 font-bold">
            Real {real.home_goles}–{real.away_goles}
          </span>
        )}
        {acierto === "exacto" && <span className="text-emerald-300 font-bold">🎯 Marcador exacto</span>}
        {acierto === "resultado" && <span className="text-amber-300 font-bold">✓ Resultado</span>}
        {acierto === "fallo" && <span className="text-white/40">✗</span>}
      </div>

      {/* Marcador real — solo admin */}
      {esAdmin && (
        <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-emerald-300/70 font-bold">Real</span>
          <Stepper value={real?.home_goles ?? ""} onChange={(n) => setReal({ ...real, home_goles: n })} color="emerald" />
          <span className="text-white/30 text-xs">–</span>
          <Stepper value={real?.away_goles ?? ""} onChange={(n) => setReal({ ...real, away_goles: n })} color="emerald" />
          <button
            onClick={() => notify(partido)}
            className="ml-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 hover:bg-emerald-500/30"
          >💾</button>
        </div>
      )}
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function PollaMundialista() {
  const [equipos, setEquipos] = useState([]);
  const [config, setConfig] = useState(null);
  const [esAdmin, setEsAdmin] = useState(false);
  const [tab, setTab] = useState("polla"); // polla | pronosticos | ranking | resultados
  const [subTab, setSubTab] = useState("grupos"); // grupos | fases
  const [toast, setToast] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  // Predicciones propias (grupos como 4 slots con null)
  const [predGrupos, setPredGrupos] = useState({});
  const [predFases, setPredFases] = useState({});
  const [abierta, setAbierta] = useState(true);

  // Resultados reales
  const [resGrupos, setResGrupos] = useState({});
  const [resFases, setResFases] = useState({});

  // Partidos / pronósticos
  const [partidos, setPartidos] = useState([]);
  const [pronos, setPronos] = useState({});       // partido_id -> { home, away }
  const [resPartidos, setResPartidos] = useState({}); // partido_id -> { home_goles, away_goles }
  const [partidosCargados, setPartidosCargados] = useState(false);
  const [faseFiltro, setFaseFiltro] = useState("GRUPOS");

  // Ranking
  const [ranking, setRanking] = useState([]);

  const notify = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2800);
  };

  const porGrupo = useMemo(() => {
    const m = {};
    for (const g of GRUPOS) m[g] = [];
    for (const e of equipos) (m[e.grupo] ||= []).push(e);
    return m;
  }, [equipos]);

  const emptySlots = () => [null, null, null, null];

  const cargarTodo = async () => {
    setCargando(true);
    try {
      const [eq, mi, rs] = await Promise.all([
        fetchJson("/api/polla/equipos"),
        fetchJson("/api/polla/mi-polla"),
        fetchJson("/api/polla/resultados"),
      ]);
      if (eq.success) {
        setEquipos(eq.equipos);
        setConfig(eq.config);
        setEsAdmin(eq.esAdmin);
      }
      if (mi.success) {
        // Equipos por grupo en orden de sorteo (para pre-llenar)
        const teamsByGroup = {};
        for (const e of (eq.equipos || [])) (teamsByGroup[e.grupo] ||= []).push(e.id);
        // Posiciones ya guardadas por el usuario
        const saved = {};
        for (const row of mi.grupos) (saved[row.grupo] ||= emptySlots())[row.posicion - 1] = row.equipo_id;
        // Pre-llenar TODOS los grupos: lo guardado se respeta, lo vacío se llena en orden
        const g = {};
        for (const grp of GRUPOS) {
          const slots = saved[grp] ? [...saved[grp]] : emptySlots();
          const usados = new Set(slots.filter(Boolean));
          const resto = (teamsByGroup[grp] || []).filter((id) => !usados.has(id));
          let ri = 0;
          for (let i = 0; i < 4; i++) if (!slots[i]) slots[i] = resto[ri++] ?? null;
          g[grp] = slots;
        }
        setPredGrupos(g);
        const f = {};
        for (const row of mi.fases) (f[row.fase] ||= []).push(row.equipo_id);
        setPredFases(f);
        setAbierta(mi.abierta);
      }
      if (rs.success) {
        const g = {};
        for (const row of rs.grupos) (g[row.grupo] ||= emptySlots())[row.posicion - 1] = row.equipo_id;
        setResGrupos(g);
        const f = {};
        for (const row of rs.fases) (f[row.fase] ||= []).push(row.equipo_id);
        setResFases(f);
      }
    } catch (e) {
      notify("Error cargando la polla", false);
    } finally {
      setCargando(false);
    }
  };

  const cargarPartidos = async () => {
    const r = await fetchJson("/api/polla/partidos");
    if (!r.success) return notify("Error cargando partidos", false);
    setPartidos(r.partidos);
    const p = {};
    for (const x of r.pronosticos) p[x.partido_id] = { home: x.home_goles, away: x.away_goles };
    setPronos(p);
    const rp = {};
    for (const x of r.resultados) rp[x.partido_id] = { home_goles: x.home_goles, away_goles: x.away_goles };
    setResPartidos(rp);
    setPartidosCargados(true);
  };

  const cargarRanking = async () => {
    const r = await fetchJson("/api/polla/ranking");
    if (r.success) setRanking(r.ranking);
  };

  useEffect(() => { cargarTodo(); }, []);
  useEffect(() => {
    if (tab === "ranking") cargarRanking();
    if (tab === "pronosticos" && !partidosCargados) cargarPartidos();
  }, [tab]); // eslint-disable-line

  const slotsCompletos = (s) => Array.isArray(s) && s.filter(Boolean).length === 4;
  const gruposCompletos = GRUPOS.filter((g) => slotsCompletos(predGrupos[g]));

  const guardarGrupos = async () => {
    if (gruposCompletos.length === 0) return notify("Completa al menos un grupo (4 posiciones)", false);
    setGuardando(true);
    const payload = {};
    for (const g of gruposCompletos) payload[g] = predGrupos[g];
    const r = await fetchJson("/api/polla/mi-polla/grupos", { method: "PUT", body: JSON.stringify({ grupos: payload }) });
    setGuardando(false);
    r.success ? notify(`✅ Predicción guardada (${gruposCompletos.length} grupos)`) : notify(r.error || "Error", false);
  };

  const guardarFases = async () => {
    setGuardando(true);
    const r = await fetchJson("/api/polla/mi-polla/fases", { method: "PUT", body: JSON.stringify({ fases: predFases }) });
    setGuardando(false);
    r.success ? notify("✅ Fases guardadas") : notify(r.error || "Error", false);
  };

  // Guardar todos los pronósticos de marcador completos y no comenzados
  const guardarPronosticos = async () => {
    const lista = [];
    for (const p of partidos) {
      const pr = pronos[p.id];
      const ya = new Date(p.kickoff).getTime() <= Date.now();
      if (ya) continue;
      if (pr && pr.home !== "" && pr.away !== "" && pr.home != null && pr.away != null) {
        lista.push({ partido_id: p.id, home_goles: Number(pr.home), away_goles: Number(pr.away) });
      }
    }
    if (lista.length === 0) return notify("Completa al menos un marcador de un partido por jugar", false);
    setGuardando(true);
    const r = await fetchJson("/api/polla/mi-polla/partidos", { method: "PUT", body: JSON.stringify({ pronosticos: lista }) });
    setGuardando(false);
    r.success ? notify(`✅ ${r.guardados} pronóstico(s) guardado(s)`) : notify(r.error || "Error", false);
  };

  // Admin: guardar marcador real de un partido
  const guardarResPartido = async (partido) => {
    const rp = resPartidos[partido.id] || {};
    if (rp.home_goles == null || rp.away_goles == null || rp.home_goles === "" || rp.away_goles === "") {
      return notify("Ingresa ambos goles del marcador real", false);
    }
    const r = await fetchJson("/api/polla/resultados/partidos", {
      method: "PUT",
      body: JSON.stringify({ partido_id: partido.id, home_goles: Number(rp.home_goles), away_goles: Number(rp.away_goles) }),
    });
    r.success ? notify(`✅ Marcador real guardado (#${partido.numero})`) : notify(r.error || "Error", false);
  };

  // Admin: guardar resultado real de grupo (clasificación con DnD)
  const guardarResGrupo = async (g) => {
    const ids = (resGrupos[g] || []).filter(Boolean);
    if (ids.length !== 4) return notify(`Grupo ${g}: asigna las 4 posiciones`, false);
    const r = await fetchJson("/api/polla/resultados/grupos", { method: "PUT", body: JSON.stringify({ grupo: g, posiciones: resGrupos[g] }) });
    r.success ? notify(`✅ Resultado del grupo ${g} guardado`) : notify(r.error || "Error", false);
  };

  const guardarResFase = async (faseKey) => {
    const r = await fetchJson("/api/polla/resultados/fases", { method: "PUT", body: JSON.stringify({ fase: faseKey, equipos: resFases[faseKey] || [] }) });
    r.success ? notify(`✅ ${faseKey} guardado`) : notify(r.error || "Error", false);
  };

  const togglePredicciones = async () => {
    const r = await fetchJson("/api/polla/config", { method: "PUT", body: JSON.stringify({ predicciones_abiertas: !abierta }) });
    if (r.success) {
      setAbierta(r.predicciones_abiertas);
      notify(r.predicciones_abiertas ? "🔓 Predicciones abiertas" : "🔒 Predicciones cerradas");
    }
  };

  const ptsFase = config
    ? { DIECISEISAVOS: config.pts_dieciseisavos, OCTAVOS: config.pts_octavos, CUARTOS: config.pts_cuartos, SEMIS: config.pts_semis, FINAL: config.pts_final, CAMPEON: config.pts_campeon }
    : {};

  // Partidos filtrados por fase, agrupados por fecha (zona Ecuador)
  const partidosPorFecha = useMemo(() => {
    const f = partidos.filter((p) => p.fase === faseFiltro);
    const m = new Map();
    for (const p of f) {
      const key = fmtFechaKey.format(new Date(p.kickoff));
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(p);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [partidos, faseFiltro]);

  const fasesDisponibles = useMemo(() => {
    const set = new Set(partidos.map((p) => p.fase));
    return FASE_PARTIDO_ORDEN.filter((f) => set.has(f));
  }, [partidos]);

  if (cargando) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#0b1120]">
        <div className="text-center">
          <div className="text-6xl animate-bounce">⚽</div>
          <p className="text-white/50 mt-3 font-semibold">Cargando la Polla Mundialista…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen text-white"
      style={{
        background:
          "radial-gradient(1200px 500px at 80% -10%, rgba(34,197,94,.12), transparent), radial-gradient(900px 400px at 10% 0%, rgba(59,130,246,.14), transparent), #0b1120",
      }}
    >
      <Toast toast={toast} />

      {/* ── HERO ── */}
      <div className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 opacity-[0.07] text-[160px] leading-none select-none pointer-events-none font-black tracking-tighter whitespace-nowrap">
          2026 ⚽ 2026 ⚽ 2026
        </div>
        <div className="relative max-w-7xl mx-auto px-4 py-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-4xl">🏆</span>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 bg-clip-text text-transparent">
                  POLLA MUNDIALISTA 2026
                </h1>
              </div>
              <p className="text-white/50 text-sm mt-1 flex items-center gap-2">
                <Bandera codigo="us" nombre="USA" size={20} />
                <Bandera codigo="mx" nombre="México" size={20} />
                <Bandera codigo="ca" nombre="Canadá" size={20} />
                Estados Unidos · México · Canadá — 48 selecciones · horarios en 🇪🇨 Ecuador
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${abierta ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-300" : "bg-rose-500/15 border-rose-400/40 text-rose-300"}`}>
                {abierta ? "🔓 Predicciones abiertas" : "🔒 Predicciones cerradas"}
              </span>
              {esAdmin && (
                <button onClick={togglePredicciones} className="px-3 py-1.5 rounded-full text-xs font-bold bg-white/10 hover:bg-white/20 border border-white/15 transition">
                  {abierta ? "Cerrar" : "Abrir"}
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-2 mt-6">
            {[
              { id: "polla", label: "🎯 Mi Polla" },
              { id: "pronosticos", label: "📅 Pronósticos" },
              { id: "ranking", label: "🏆 Ranking" },
              { id: "resultados", label: esAdmin ? "📋 Resultados (Admin)" : "📋 Resultados" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                  tab === t.id ? "bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-950 shadow-lg shadow-amber-500/25" : "bg-white/[0.06] text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 pb-28">
        {/* ════════════════ MI POLLA ════════════════ */}
        {tab === "polla" && (
          <>
            {!abierta && (
              <div className="mb-5 rounded-2xl bg-rose-500/10 border border-rose-400/30 px-4 py-3 text-rose-200 text-sm font-semibold">
                🔒 Las predicciones están cerradas. Puedes ver tu polla pero ya no editarla.
              </div>
            )}

            <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
              <div className="flex gap-2">
                <button onClick={() => setSubTab("grupos")} className={`px-4 py-2 rounded-lg text-sm font-bold transition ${subTab === "grupos" ? "bg-white/15 text-white" : "bg-white/[0.04] text-white/50 hover:text-white"}`}>
                  Fase de Grupos
                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">{gruposCompletos.length}/12</span>
                </button>
                <button onClick={() => setSubTab("fases")} className={`px-4 py-2 rounded-lg text-sm font-bold transition ${subTab === "fases" ? "bg-white/15 text-white" : "bg-white/[0.04] text-white/50 hover:text-white"}`}>
                  Fases Finales
                </button>
              </div>
              {config && subTab === "grupos" && (
                <span className="text-xs text-white/40">
                  Ya puse los 4 equipos de cada grupo — <b className="text-white/70">arrástralos</b> para ordenar cómo crees que quedarán (1º-4º). Posición exacta = <b className="text-amber-300">{config.pts_posicion_exacta} pts</b>
                </span>
              )}
            </div>

            {subTab === "grupos" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {GRUPOS.map((g) => (
                  <GrupoBoard
                    key={g}
                    grupo={g}
                    equipos={porGrupo[g] || []}
                    slots={predGrupos[g] || emptySlots()}
                    setSlots={(s) => setPredGrupos((prev) => ({ ...prev, [g]: s }))}
                    disabled={!abierta}
                  />
                ))}
              </div>
            )}

            {subTab === "fases" && (
              <div className="space-y-4">
                <div className="rounded-2xl bg-blue-500/10 border border-blue-400/20 px-4 py-3 text-blue-200 text-xs font-semibold">
                  💡 Elige qué selecciones llegarán a cada fase. Puntos por acierto: {FASES_DEF.map((f) => `${f.corto} ${ptsFase[f.key] ?? "-"}pts`).join(" · ")}
                </div>
                {FASES_DEF.map((f) => (
                  <FaseSelector key={f.key} fase={f} equipos={equipos} seleccion={predFases[f.key] || []} setSeleccion={(s) => setPredFases((prev) => ({ ...prev, [f.key]: s }))} disabled={!abierta} />
                ))}
              </div>
            )}

            {abierta && (
              <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-[#0b1120] via-[#0b1120ee] to-transparent pt-8 pb-4">
                <div className="max-w-7xl mx-auto px-4 flex justify-end">
                  <button onClick={subTab === "grupos" ? guardarGrupos : guardarFases} disabled={guardando} className="px-8 py-3 rounded-2xl font-black text-amber-950 bg-gradient-to-r from-amber-300 to-yellow-500 shadow-xl shadow-amber-500/30 hover:scale-[1.03] active:scale-[0.98] transition disabled:opacity-50">
                    {guardando ? "Guardando…" : subTab === "grupos" ? "💾 Guardar Grupos" : "💾 Guardar Fases"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════════════ PRONÓSTICOS (calendario por fecha) ════════════════ */}
        {tab === "pronosticos" && (
          <>
            <div className="mb-4 rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-3 text-sm text-white/60 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>📅 Calendario oficial FIFA — horarios en <b className="text-white/80">zona Ecuador 🇪🇨</b>.</span>
              {config && <span>Marcador exacto = <b className="text-amber-300">{config.pts_marcador_exacto} pts</b> · acertar resultado = <b className="text-amber-300">{config.pts_resultado} pts</b>.</span>}
            </div>

            {!partidosCargados ? (
              <div className="text-center py-16 text-white/40"><div className="text-4xl mb-2 animate-bounce">⚽</div>Cargando calendario…</div>
            ) : (
              <>
                {/* Filtro de fase */}
                <div className="flex flex-wrap gap-1.5 mb-5">
                  {fasesDisponibles.map((f) => (
                    <button key={f} onClick={() => setFaseFiltro(f)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${faseFiltro === f ? "bg-amber-400 text-amber-950" : "bg-white/[0.06] text-white/60 hover:bg-white/12"}`}>
                      {FASE_PARTIDO[f].emoji} {FASE_PARTIDO[f].label}
                    </button>
                  ))}
                </div>

                {partidosPorFecha.length === 0 ? (
                  <div className="text-center py-16 text-white/40">No hay partidos en esta fase.</div>
                ) : (
                  <div className="space-y-6">
                    {partidosPorFecha.map(([fecha, lista]) => (
                      <div key={fecha}>
                        <div className="sticky top-0 z-10 -mx-1 mb-3 px-1 py-1.5 backdrop-blur-sm">
                          <h3 className="text-sm font-black text-white/80 flex items-center gap-2">
                            <span className="w-1.5 h-5 rounded bg-amber-400" />
                            {cap(fmtDiaLargo.format(new Date(lista[0].kickoff)))}
                            <span className="text-white/35 font-semibold">· {lista.length} partido{lista.length > 1 ? "s" : ""}</span>
                          </h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {lista.map((p) => (
                            <PartidoCard
                              key={p.id}
                              partido={p}
                              pred={pronos[p.id] || { home: "", away: "" }}
                              setPred={(v) => setPronos((prev) => ({ ...prev, [p.id]: v }))}
                              real={resPartidos[p.id] || {}}
                              setReal={(v) => setResPartidos((prev) => ({ ...prev, [p.id]: v }))}
                              esAdmin={esAdmin}
                              abierta={abierta}
                              notify={guardarResPartido}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {abierta && (
                  <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-[#0b1120] via-[#0b1120ee] to-transparent pt-8 pb-4">
                    <div className="max-w-7xl mx-auto px-4 flex justify-end">
                      <button onClick={guardarPronosticos} disabled={guardando} className="px-8 py-3 rounded-2xl font-black text-amber-950 bg-gradient-to-r from-amber-300 to-yellow-500 shadow-xl shadow-amber-500/30 hover:scale-[1.03] active:scale-[0.98] transition disabled:opacity-50">
                        {guardando ? "Guardando…" : "💾 Guardar Pronósticos"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ════════════════ RANKING ════════════════ */}
        {tab === "ranking" && (
          <div>
            {ranking.length === 0 ? (
              <div className="text-center py-20 text-white/40">
                <div className="text-5xl mb-3">🎱</div>
                Aún no hay predicciones registradas. ¡Sé el primero en llenar tu polla!
              </div>
            ) : (
              <>
                {ranking.length >= 1 && (
                  <div className="flex items-end justify-center gap-3 mb-8 mt-2">
                    {[1, 0, 2].map((idx) => {
                      const r = ranking[idx];
                      if (!r) return <div key={idx} className="w-36" />;
                      const medallas = ["🥈", "🥇", "🥉"];
                      const colores = [
                        "from-slate-300/30 to-slate-500/10 border-slate-300/30",
                        "from-amber-300/40 to-yellow-600/10 border-amber-300/50",
                        "from-orange-400/30 to-orange-600/10 border-orange-400/30",
                      ];
                      const i = [1, 0, 2].indexOf(idx);
                      return (
                        <div key={r.usuario_id} className="flex flex-col items-center w-36">
                          <span className="text-3xl mb-1">{medallas[i]}</span>
                          <span className="text-sm font-bold text-center truncate w-full">{r.nombre}</span>
                          <span className="text-amber-300 font-black text-xl">{r.puntos} pts</span>
                          <div className={`w-full mt-2 rounded-t-2xl bg-gradient-to-t border ${colores[i]} ${idx === 0 ? "h-36" : idx === 1 ? "h-28" : "h-20"} grid place-items-center`}>
                            <span className="text-4xl font-black text-white/20">{idx + 1}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="rounded-2xl overflow-hidden border border-white/10">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/[0.06] text-white/50 text-xs uppercase tracking-wider">
                        <th className="px-4 py-3 text-left">#</th>
                        <th className="px-4 py-3 text-left">Participante</th>
                        <th className="px-3 py-3 text-center" title="Posiciones exactas en grupos">🎯 Grupos</th>
                        <th className="px-3 py-3 text-center hidden md:table-cell" title="Marcadores exactos">⚽ Marc.</th>
                        <th className="px-4 py-3 text-right">Puntos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.map((r, i) => (
                        <tr key={r.usuario_id} className={`border-t border-white/5 transition ${i === 0 ? "bg-gradient-to-r from-amber-400/15 to-transparent" : i % 2 ? "bg-white/[0.02]" : ""} hover:bg-white/[0.06]`}>
                          <td className="px-4 py-3 font-black text-white/40">{i === 0 ? "👑" : i + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center text-xs font-black shrink-0">
                                {(r.nombre || "?").split(" ").slice(0, 2).map((w) => w[0]).join("")}
                              </span>
                              <div>
                                <div className="font-bold">{r.nombre}</div>
                                {r.empresa && <div className="text-[10px] text-white/35">{r.empresa}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="font-bold text-emerald-300">{r.aciertos_grupos}</span>
                            <span className="text-white/30 text-xs">/{r.pred_grupos}</span>
                          </td>
                          <td className="px-3 py-3 text-center hidden md:table-cell">
                            <span className="font-bold text-amber-300">{r.aciertos_marcador ?? 0}</span>
                            <span className="text-white/30 text-xs"> +{r.aciertos_resultado ?? 0}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-black text-lg bg-gradient-to-r from-amber-300 to-yellow-500 bg-clip-text text-transparent">{r.puntos}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ════════════════ RESULTADOS ════════════════ */}
        {tab === "resultados" && (
          <div>
            <div className="mb-5 rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-3 text-sm text-white/60">
              {esAdmin
                ? "🛠️ Como administrador registra aquí la clasificación real de cada grupo y los clasificados de cada fase. Los marcadores reales de cada partido se cargan en la pestaña 📅 Pronósticos. Cada guardado recalcula el ranking."
                : "📋 Resultados reales del mundial registrados hasta ahora."}
            </div>

            <h2 className="text-lg font-black mb-3 text-white/80">Fase de Grupos — clasificación final</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {GRUPOS.map((g) => (
                <div key={g}>
                  <GrupoBoard
                    grupo={g}
                    equipos={porGrupo[g] || []}
                    slots={resGrupos[g] || emptySlots()}
                    setSlots={(s) => setResGrupos((prev) => ({ ...prev, [g]: s }))}
                    disabled={!esAdmin}
                  />
                  {esAdmin && slotsCompletos(resGrupos[g]) && (
                    <button onClick={() => guardarResGrupo(g)} className="mt-2 w-full py-2 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 hover:bg-emerald-500/30 transition">
                      💾 Guardar resultado grupo {g}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <h2 className="text-lg font-black mt-8 mb-3 text-white/80">Fases Finales — clasificados reales</h2>
            <div className="space-y-4">
              {FASES_DEF.map((f) => (
                <div key={f.key}>
                  <FaseSelector fase={f} equipos={equipos} seleccion={resFases[f.key] || []} setSeleccion={(s) => setResFases((prev) => ({ ...prev, [f.key]: s }))} disabled={!esAdmin} />
                  {esAdmin && (
                    <button onClick={() => guardarResFase(f.key)} className="mt-2 py-2 px-4 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 hover:bg-emerald-500/30 transition">
                      💾 Guardar {f.label}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
