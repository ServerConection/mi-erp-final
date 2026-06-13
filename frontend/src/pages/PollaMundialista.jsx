// =============================================================================
// POLLA MUNDIALISTA 2026 ⚽🏆
// Predicciones del Mundial FIFA 2026 (48 selecciones, 12 grupos A-L).
// - Mi Polla: ordenar 1º-4º cada grupo (tap secuencial) + clasificados por fase
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

const POS_STYLE = {
  1: { badge: "bg-gradient-to-br from-yellow-300 to-amber-500 text-amber-950", ring: "ring-amber-400/60", label: "1º" },
  2: { badge: "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800", ring: "ring-slate-300/50", label: "2º" },
  3: { badge: "bg-gradient-to-br from-orange-300 to-orange-500 text-orange-950", ring: "ring-orange-400/50", label: "3º" },
  4: { badge: "bg-slate-700 text-slate-300", ring: "ring-slate-600/40", label: "4º" },
};

const GRUPO_COLORS = {
  A: "#f59e0b", B: "#3b82f6", C: "#10b981", D: "#ef4444",
  E: "#8b5cf6", F: "#ec4899", G: "#14b8a6", H: "#f97316",
  I: "#6366f1", J: "#06b6d4", K: "#84cc16", L: "#e11d48",
};

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

const Bandera = ({ codigo, nombre, size = 40, className = "" }) => (
  <img
    src={flag(codigo, size)}
    srcSet={flag2x(codigo, size)}
    alt={nombre}
    loading="lazy"
    className={`rounded-[4px] object-cover shadow-md shadow-black/40 ring-1 ring-white/20 ${className}`}
    style={{ width: size, height: Math.round(size * 0.75) }}
  />
);

// ─── Tarjeta de grupo (predicción o resultados) ──────────────────────────────
function GrupoCard({ grupo, equipos, orden, setOrden, disabled, titulo }) {
  // orden: array de equipo_ids ya asignados (índice = posición-1)
  const posDe = (id) => {
    const i = orden.indexOf(id);
    return i === -1 ? null : i + 1;
  };
  const onTap = (id) => {
    if (disabled) return;
    const i = orden.indexOf(id);
    if (i !== -1) setOrden(orden.slice(0, i)); // deshacer desde esa posición
    else if (orden.length < 4) setOrden([...orden, id]);
  };
  const color = GRUPO_COLORS[grupo] || "#64748b";
  const completo = orden.length === 4;

  return (
    <div
      className={`relative rounded-2xl bg-white/[0.04] backdrop-blur-sm border transition-all duration-300 overflow-hidden ${
        completo ? "border-emerald-400/40 shadow-lg shadow-emerald-500/10" : "border-white/10"
      }`}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ background: `linear-gradient(90deg, ${color}33, transparent)` }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-7 h-7 rounded-lg grid place-items-center text-sm font-black text-white shadow"
            style={{ background: color }}
          >
            {grupo}
          </span>
          <span className="text-white/90 font-bold text-sm tracking-wide">
            {titulo || `GRUPO ${grupo}`}
          </span>
        </div>
        {completo ? (
          <span className="text-emerald-400 text-xs font-bold">✓ Completo</span>
        ) : (
          <span className="text-white/40 text-xs">{orden.length}/4</span>
        )}
      </div>

      <div className="p-2.5 space-y-1.5">
        {equipos.map((e) => {
          const pos = posDe(e.id);
          const st = pos ? POS_STYLE[pos] : null;
          return (
            <button
              key={e.id}
              onClick={() => onTap(e.id)}
              disabled={disabled}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all duration-200 group ${
                pos
                  ? `bg-white/[0.08] ring-1 ${st.ring}`
                  : "bg-white/[0.02] hover:bg-white/[0.07]"
              } ${disabled ? "cursor-default opacity-90" : "cursor-pointer active:scale-[0.98]"}`}
            >
              <span
                className={`w-7 h-7 shrink-0 rounded-full grid place-items-center text-xs font-black shadow ${
                  pos ? st.badge : "bg-white/10 text-white/30 group-hover:text-white/60"
                }`}
              >
                {pos ? st.label : "·"}
              </span>
              <Bandera codigo={e.codigo} nombre={e.nombre} size={40} />
              <span className={`text-sm font-semibold truncate ${pos ? "text-white" : "text-white/70"}`}>
                {e.nombre}
              </span>
              {pos === 1 && <span className="ml-auto text-base">🥇</span>}
              {pos === 2 && <span className="ml-auto text-base">🥈</span>}
            </button>
          );
        })}
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
        <span
          className={`text-xs font-bold px-3 py-1 rounded-full ${
            seleccion.length === fase.cupos
              ? "bg-emerald-500/20 text-emerald-300"
              : "bg-white/10 text-white/50"
          }`}
        >
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

// ─── Página principal ────────────────────────────────────────────────────────
export default function PollaMundialista() {
  const [equipos, setEquipos] = useState([]);
  const [config, setConfig] = useState(null);
  const [esAdmin, setEsAdmin] = useState(false);
  const [tab, setTab] = useState("polla"); // polla | ranking | resultados
  const [subTab, setSubTab] = useState("grupos"); // grupos | fases
  const [toast, setToast] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  // Predicciones propias
  const [predGrupos, setPredGrupos] = useState({});   // { A: [id,id,id,id parcial] }
  const [predFases, setPredFases] = useState({});     // { OCTAVOS: [ids] }
  const [abierta, setAbierta] = useState(true);

  // Resultados reales
  const [resGrupos, setResGrupos] = useState({});
  const [resFases, setResFases] = useState({});

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

  const equipoById = useMemo(() => new Map(equipos.map((e) => [e.id, e])), [equipos]);

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
        const g = {};
        for (const row of mi.grupos) {
          (g[row.grupo] ||= [null, null, null, null])[row.posicion - 1] = row.equipo_id;
        }
        for (const k of Object.keys(g)) g[k] = g[k].filter(Boolean);
        setPredGrupos(g);
        const f = {};
        for (const row of mi.fases) (f[row.fase] ||= []).push(row.equipo_id);
        setPredFases(f);
        setAbierta(mi.abierta);
      }
      if (rs.success) {
        const g = {};
        for (const row of rs.grupos) {
          (g[row.grupo] ||= [null, null, null, null])[row.posicion - 1] = row.equipo_id;
        }
        for (const k of Object.keys(g)) g[k] = g[k].filter(Boolean);
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

  const cargarRanking = async () => {
    const r = await fetchJson("/api/polla/ranking");
    if (r.success) setRanking(r.ranking);
  };

  useEffect(() => {
    cargarTodo();
  }, []);
  useEffect(() => {
    if (tab === "ranking") cargarRanking();
  }, [tab]);

  // ── Guardar predicciones ──
  const gruposCompletos = GRUPOS.filter((g) => (predGrupos[g] || []).length === 4);
  const guardarGrupos = async () => {
    if (gruposCompletos.length === 0) return notify("Completa al menos un grupo (4 posiciones)", false);
    setGuardando(true);
    const payload = {};
    for (const g of gruposCompletos) payload[g] = predGrupos[g];
    const r = await fetchJson("/api/polla/mi-polla/grupos", {
      method: "PUT",
      body: JSON.stringify({ grupos: payload }),
    });
    setGuardando(false);
    r.success ? notify(`✅ Predicción guardada (${gruposCompletos.length} grupos)`) : notify(r.error || "Error", false);
  };

  const guardarFases = async () => {
    setGuardando(true);
    const r = await fetchJson("/api/polla/mi-polla/fases", {
      method: "PUT",
      body: JSON.stringify({ fases: predFases }),
    });
    setGuardando(false);
    r.success ? notify("✅ Fases guardadas") : notify(r.error || "Error", false);
  };

  // ── Admin: guardar resultados ──
  const guardarResGrupo = async (g) => {
    const ids = resGrupos[g] || [];
    if (ids.length !== 4) return notify(`Grupo ${g}: asigna las 4 posiciones`, false);
    const r = await fetchJson("/api/polla/resultados/grupos", {
      method: "PUT",
      body: JSON.stringify({ grupo: g, posiciones: ids }),
    });
    r.success ? notify(`✅ Resultado del grupo ${g} guardado`) : notify(r.error || "Error", false);
  };

  const guardarResFase = async (faseKey) => {
    const r = await fetchJson("/api/polla/resultados/fases", {
      method: "PUT",
      body: JSON.stringify({ fase: faseKey, equipos: resFases[faseKey] || [] }),
    });
    r.success ? notify(`✅ ${faseKey} guardado`) : notify(r.error || "Error", false);
  };

  const togglePredicciones = async () => {
    const r = await fetchJson("/api/polla/config", {
      method: "PUT",
      body: JSON.stringify({ predicciones_abiertas: !abierta }),
    });
    if (r.success) {
      setAbierta(r.predicciones_abiertas);
      notify(r.predicciones_abiertas ? "🔓 Predicciones abiertas" : "🔒 Predicciones cerradas");
    }
  };

  const ptsFase = config
    ? {
        DIECISEISAVOS: config.pts_dieciseisavos,
        OCTAVOS: config.pts_octavos,
        CUARTOS: config.pts_cuartos,
        SEMIS: config.pts_semis,
        FINAL: config.pts_final,
        CAMPEON: config.pts_campeon,
      }
    : {};

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
                Estados Unidos · México · Canadá — 48 selecciones, 12 grupos
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                  abierta
                    ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-300"
                    : "bg-rose-500/15 border-rose-400/40 text-rose-300"
                }`}
              >
                {abierta ? "🔓 Predicciones abiertas" : "🔒 Predicciones cerradas"}
              </span>
              {esAdmin && (
                <button
                  onClick={togglePredicciones}
                  className="px-3 py-1.5 rounded-full text-xs font-bold bg-white/10 hover:bg-white/20 border border-white/15 transition"
                >
                  {abierta ? "Cerrar" : "Abrir"}
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-6">
            {[
              { id: "polla", label: "🎯 Mi Polla" },
              { id: "ranking", label: "🏆 Ranking" },
              { id: "resultados", label: esAdmin ? "📋 Resultados (Admin)" : "📋 Resultados" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                  tab === t.id
                    ? "bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-950 shadow-lg shadow-amber-500/25"
                    : "bg-white/[0.06] text-white/60 hover:bg-white/10 hover:text-white"
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
                <button
                  onClick={() => setSubTab("grupos")}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
                    subTab === "grupos" ? "bg-white/15 text-white" : "bg-white/[0.04] text-white/50 hover:text-white"
                  }`}
                >
                  Fase de Grupos
                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                    {gruposCompletos.length}/12
                  </span>
                </button>
                <button
                  onClick={() => setSubTab("fases")}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
                    subTab === "fases" ? "bg-white/15 text-white" : "bg-white/[0.04] text-white/50 hover:text-white"
                  }`}
                >
                  Fases Finales
                </button>
              </div>
              {config && subTab === "grupos" && (
                <span className="text-xs text-white/40">
                  Cada posición exacta = <b className="text-amber-300">{config.pts_posicion_exacta} pts</b> · Toca los
                  equipos en orden: 1º, 2º, 3º, 4º (toca de nuevo para deshacer)
                </span>
              )}
            </div>

            {subTab === "grupos" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {GRUPOS.map((g) => (
                  <GrupoCard
                    key={g}
                    grupo={g}
                    equipos={porGrupo[g] || []}
                    orden={predGrupos[g] || []}
                    setOrden={(o) => setPredGrupos((prev) => ({ ...prev, [g]: o }))}
                    disabled={!abierta}
                  />
                ))}
              </div>
            )}

            {subTab === "fases" && (
              <div className="space-y-4">
                <div className="rounded-2xl bg-blue-500/10 border border-blue-400/20 px-4 py-3 text-blue-200 text-xs font-semibold">
                  💡 Elige qué selecciones llegarán a cada fase. Puntos por acierto:{" "}
                  {FASES_DEF.map((f) => `${f.corto} ${ptsFase[f.key] ?? "-"}pts`).join(" · ")}
                </div>
                {FASES_DEF.map((f) => (
                  <FaseSelector
                    key={f.key}
                    fase={f}
                    equipos={equipos}
                    seleccion={predFases[f.key] || []}
                    setSeleccion={(s) => setPredFases((prev) => ({ ...prev, [f.key]: s }))}
                    disabled={!abierta}
                  />
                ))}
              </div>
            )}

            {abierta && (
              <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-[#0b1120] via-[#0b1120ee] to-transparent pt-8 pb-4">
                <div className="max-w-7xl mx-auto px-4 flex justify-end">
                  <button
                    onClick={subTab === "grupos" ? guardarGrupos : guardarFases}
                    disabled={guardando}
                    className="px-8 py-3 rounded-2xl font-black text-amber-950 bg-gradient-to-r from-amber-300 to-yellow-500 shadow-xl shadow-amber-500/30 hover:scale-[1.03] active:scale-[0.98] transition disabled:opacity-50"
                  >
                    {guardando ? "Guardando…" : subTab === "grupos" ? "💾 Guardar Grupos" : "💾 Guardar Fases"}
                  </button>
                </div>
              </div>
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
                {/* Podio */}
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
                          <div
                            className={`w-full mt-2 rounded-t-2xl bg-gradient-to-t border ${colores[i]} ${
                              idx === 0 ? "h-36" : idx === 1 ? "h-28" : "h-20"
                            } grid place-items-center`}
                          >
                            <span className="text-4xl font-black text-white/20">{idx + 1}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Tabla */}
                <div className="rounded-2xl overflow-hidden border border-white/10">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/[0.06] text-white/50 text-xs uppercase tracking-wider">
                        <th className="px-4 py-3 text-left">#</th>
                        <th className="px-4 py-3 text-left">Participante</th>
                        <th className="px-3 py-3 text-center" title="Posiciones exactas en grupos">🎯 Grupos</th>
                        {FASES_DEF.map((f) => (
                          <th key={f.key} className="px-2 py-3 text-center hidden md:table-cell" title={f.label}>
                            {f.emoji} {f.corto}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-right">Puntos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.map((r, i) => (
                        <tr
                          key={r.usuario_id}
                          className={`border-t border-white/5 transition ${
                            i === 0
                              ? "bg-gradient-to-r from-amber-400/15 to-transparent"
                              : i % 2
                              ? "bg-white/[0.02]"
                              : ""
                          } hover:bg-white/[0.06]`}
                        >
                          <td className="px-4 py-3 font-black text-white/40">
                            {i === 0 ? "👑" : i + 1}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center text-xs font-black shrink-0">
                                {(r.nombre || "?")
                                  .split(" ")
                                  .slice(0, 2)
                                  .map((w) => w[0])
                                  .join("")}
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
                          {FASES_DEF.map((f) => (
                            <td key={f.key} className="px-2 py-3 text-center hidden md:table-cell text-white/60 font-semibold">
                              {r.aciertos_fases?.[f.key] ?? 0}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-right">
                            <span className="font-black text-lg bg-gradient-to-r from-amber-300 to-yellow-500 bg-clip-text text-transparent">
                              {r.puntos}
                            </span>
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
                ? "🛠️ Como administrador, registra aquí cómo va quedando el mundial real. Cada vez que guardes, el ranking se recalcula."
                : "📋 Resultados reales del mundial registrados hasta ahora."}
            </div>

            <h2 className="text-lg font-black mb-3 text-white/80">Fase de Grupos — clasificación final</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {GRUPOS.map((g) => (
                <div key={g}>
                  <GrupoCard
                    grupo={g}
                    equipos={porGrupo[g] || []}
                    orden={resGrupos[g] || []}
                    setOrden={(o) => setResGrupos((prev) => ({ ...prev, [g]: o }))}
                    disabled={!esAdmin}
                  />
                  {esAdmin && (resGrupos[g] || []).length === 4 && (
                    <button
                      onClick={() => guardarResGrupo(g)}
                      className="mt-2 w-full py-2 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 hover:bg-emerald-500/30 transition"
                    >
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
                  <FaseSelector
                    fase={f}
                    equipos={equipos}
                    seleccion={resFases[f.key] || []}
                    setSeleccion={(s) => setResFases((prev) => ({ ...prev, [f.key]: s }))}
                    disabled={!esAdmin}
                  />
                  {esAdmin && (
                    <button
                      onClick={() => guardarResFase(f.key)}
                      className="mt-2 py-2 px-4 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 hover:bg-emerald-500/30 transition"
                    >
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
