// =============================================================================
// SALUD DEL SISTEMA — mapa de estado del ERP
//
// Responde de un vistazo lo que hoy solo se sabe mirando logs: que tuberia de
// datos esta viva y cual se congelo. Importa porque cuando un ETL se cae el ERP
// NO da error: los dashboards siguen pintando numeros, solo que viejos.
//
// Se actualiza SOLO cuando se pulsa "Actualizar" (o al entrar). Sin refresco
// automatico: este mapa se mira cuando se sospecha algo, no todo el rato.
// =============================================================================
import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL;

const COLOR = {
  OK:          { punto: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", texto: "Al día" },
  RETRASO:     { punto: "bg-amber-500",   chip: "bg-amber-50 text-amber-700 border-amber-200",       texto: "Con retraso" },
  CAIDO:       { punto: "bg-red-500",     chip: "bg-red-50 text-red-700 border-red-200",             texto: "Congelado" },
  DESCONOCIDO: { punto: "bg-stone-300",   chip: "bg-stone-50 text-stone-500 border-stone-200",       texto: "Sin dato" },
  SIN_MEDIR:   { punto: "bg-stone-200",   chip: "bg-stone-50 text-stone-400 border-stone-200",       texto: "No se mide" },
};

// El color solo no alcanza: quien no distingue rojo de verde necesita otra
// señal, y una impresión en blanco y negro también.
const MAPA_ESTADO = {
  OK:          { trazo: "#059669", relleno: "#ecfdf5", simbolo: "✓" },
  RETRASO:     { trazo: "#d97706", relleno: "#fffbeb", simbolo: "!" },
  CAIDO:       { trazo: "#dc2626", relleno: "#fef2f2", simbolo: "✕" },
  DESCONOCIDO: { trazo: "#a8a29e", relleno: "#fafaf9", simbolo: "?" },
  SIN_MEDIR:   { trazo: "#d6d3d1", relleno: "#fafaf9", simbolo: "·" },
};

// ── Diagrama de flujo del ERP ────────────────────────────────────────────────
// Una lista dice qué está caído; no dice a quién le importa. Este dibujo pone
// el recorrido completo: de dónde sale cada dato y qué pantallas se quedan sin
// él. Cuando la Maestra Bitrix se congela, se ve la línea roja llegando hasta
// Reporte D-1 y Vista Asesor — que es la pregunta que sigue siempre.
const ANCHO_COL = 250, ALTO_FILA = 76, CAJA_W = 190, CAJA_H = 52, MARGEN_Y = 64;

function MapaModulos({ mapa }) {
  if (!mapa?.capas?.length) return null;

  // Posición de cada nodo: la columna es su capa, la fila su orden dentro.
  const pos = {};
  mapa.capas.forEach((capa, col) => {
    capa.nodos.forEach((n, fila) => {
      pos[n.id] = { x: col * ANCHO_COL + 20, y: fila * ALTO_FILA + MARGEN_Y, nodo: n };
    });
  });

  const filasMax = Math.max(...mapa.capas.map((c) => c.nodos.length));
  const ancho = mapa.capas.length * ANCHO_COL + 20;
  const alto  = filasMax * ALTO_FILA + MARGEN_Y + 20;

  // Las conexiones se dibujan primero para que queden DEBAJO de las cajas.
  const lineas = [];
  for (const capa of mapa.capas) {
    for (const n of capa.nodos) {
      for (const destino of (n.alimenta || [])) {
        const a = pos[n.id], b = pos[destino];
        if (!a || !b) continue;
        const x1 = a.x + CAJA_W, y1 = a.y + CAJA_H / 2;
        const x2 = b.x,          y2 = b.y + CAJA_H / 2;
        const medio = (x1 + x2) / 2;
        // Rojo solo si el problema VIAJA por esta línea: el origen está mal.
        const malo = a.nodo.estado === 'CAIDO' || a.nodo.estado === 'RETRASO';
        lineas.push(
          <path key={`${n.id}-${destino}`}
            d={`M ${x1} ${y1} C ${medio} ${y1}, ${medio} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke={malo ? MAPA_ESTADO[a.nodo.estado].trazo : '#d6d3d1'}
            strokeWidth={malo ? 2 : 1.2}
            strokeDasharray={malo ? '' : '4 3'}
          />
        );
      }
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-stone-100 bg-stone-50">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-stone-600">
          Mapa de módulos · de dónde sale cada dato y quién depende de él
        </h3>
      </div>
      <div className="overflow-x-auto p-4">
        <svg width={ancho} height={alto} style={{ minWidth: ancho }}>
          {/* títulos de capa */}
          {mapa.capas.map((capa, col) => (
            <text key={capa.id} x={col * ANCHO_COL + 20} y={28}
                  fontSize={10} fontWeight={800} fill="#78716c"
                  style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {capa.nombre}
            </text>
          ))}

          {lineas}

          {mapa.capas.map((capa) => capa.nodos.map((n) => {
            const p = pos[n.id];
            const est = MAPA_ESTADO[n.estado] || MAPA_ESTADO.DESCONOCIDO;
            const titulo = [n.detalle, n.medida && `Último: ${n.medida}`, n.causa && `Arrastrado por: ${n.causa}`]
              .filter(Boolean).join('\n');
            return (
              <g key={n.id}>
                <title>{titulo || n.nombre}</title>
                <rect x={p.x} y={p.y} width={CAJA_W} height={CAJA_H} rx={9}
                      fill={est.relleno} stroke={est.trazo} strokeWidth={1.5} />
                <text x={p.x + 12} y={p.y + 21} fontSize={11} fontWeight={700} fill="#292524">
                  {est.simbolo} {n.nombre.length > 24 ? n.nombre.slice(0, 23) + '…' : n.nombre}
                </text>
                <text x={p.x + 12} y={p.y + 38} fontSize={9} fill="#78716c">
                  {n.causa && n.causa !== n.nombre
                    ? `por ${n.causa.length > 22 ? n.causa.slice(0, 21) + '…' : n.causa}`
                    : (n.medida || '')}
                </text>
              </g>
            );
          }))}
        </svg>
      </div>
      <div className="flex flex-wrap gap-4 border-t border-stone-100 px-5 py-2 text-[10px] text-stone-500">
        {Object.entries(MAPA_ESTADO).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: v.relleno, border: `1.5px solid ${v.trazo}` }} />
            {v.simbolo} {COLOR[k]?.texto || k}
          </span>
        ))}
        <span className="ml-auto italic">Pasa el mouse por una caja para ver el detalle.</span>
      </div>
    </div>
  );
}

const fmtHora = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-EC", { timeZone: "America/Guayaquil" }); }
  catch { return String(iso); }
};

export default function SaludSistema() {
  const [data, setData]       = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError]     = useState("");

  const cargar = useCallback(async () => {
    setCargando(true); setError("");
    try {
      const r = await fetch(`${API}/api/salud`);
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "No se pudo consultar el estado");
      setData(d);
    } catch (e) {
      setError(e.message || "No se pudo consultar el estado");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const general = data?.resumen?.estado_general || "DESCONOCIDO";
  const grupos = (data?.componentes || []).reduce((acc, c) => {
    (acc[c.grupo] = acc[c.grupo] || []).push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="bg-[#1A3A6E] text-white p-5 rounded-2xl flex flex-wrap justify-between items-center gap-4 shadow-xl border-b-4 border-[#0f2550]">
        <div>
          <h2 className="text-lg font-black italic tracking-tighter uppercase flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${COLOR[general].punto}`} />
            Salud del sistema
          </h2>
          <p className="text-[9px] font-bold text-blue-300 tracking-[0.2em] uppercase mt-1">
            Qué tubería de datos está viva y cuál se congeló
          </p>
        </div>
        <div className="flex items-center gap-4">
          {data && (
            <div className="text-right text-[10px] text-blue-200 leading-tight">
              <div><b className="text-white">{data.resumen.ok}</b> al día · <b className="text-white">{data.resumen.retraso}</b> con retraso · <b className="text-white">{data.resumen.caido}</b> congelados</div>
              <div className="opacity-70">Consultado: {fmtHora(data.generado_en)}</div>
            </div>
          )}
          <button
            onClick={cargar}
            disabled={cargando}
            className="h-[38px] px-5 rounded-xl text-[10px] font-black uppercase bg-white/10 hover:bg-white/20 border border-white/20 transition-all active:scale-95 disabled:opacity-60"
          >
            {cargando ? "Consultando…" : "🔄 Actualizar"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">
          ⚠️ {error}
        </p>
      )}

      {/* Aviso de alcance: honesto sobre lo que este mapa NO ve */}
      <p className="text-[10px] text-stone-500 bg-stone-50 border border-stone-200 rounded-xl px-4 py-2">
        Este mapa consulta la base de producción (Render). Las tablas de JotForm viven en el
        Postgres local de la oficina y no son visibles desde aquí, por eso no aparecen.
      </p>

      {data?.mapa && <MapaModulos mapa={data.mapa} />}

      {/* Componentes por grupo */}
      {Object.entries(grupos).map(([grupo, items]) => (
        <div key={grupo} className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-stone-100 bg-stone-50">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#1A3A6E]">{grupo}</span>
          </div>
          <div className="divide-y divide-stone-100">
            {items.map((c) => (
              <div key={c.id} className="px-5 py-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[240px] flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${COLOR[c.estado].punto}`} />
                    <span className="text-sm font-bold text-stone-800">{c.nombre}</span>
                    {c.critico && (
                      <span className="text-[8px] font-black uppercase tracking-wider text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                        Crítico
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1 ml-[18px]">{c.detalle}</p>
                  {c.error && (
                    <p className="text-[10px] text-red-500 mt-1 ml-[18px] font-mono">{c.error}</p>
                  )}
                </div>
                <div className="text-right">
                  <span className={`inline-block text-[9px] font-black uppercase tracking-wider border px-2 py-1 rounded-lg ${COLOR[c.estado].chip}`}>
                    {COLOR[c.estado].texto}
                  </span>
                  <div className="text-[11px] font-bold text-stone-700 mt-1">{c.medida}</div>
                  {c.ultimo && (
                    <div className="text-[9px] text-stone-400">último dato: {fmtHora(c.ultimo)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {!cargando && !data && !error && (
        <div className="py-16 text-center text-stone-400 text-sm">Sin datos todavía.</div>
      )}
    </div>
  );
}
