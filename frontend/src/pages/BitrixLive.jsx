import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:3050";
const REFRESH_SECS = 90;

// ── Config ────────────────────────────────────────────────────────────────────
const ESTADO_CFG = {
  activo:   { color: '#10b981', bg: '#ecfdf5', label: '🟢 ACTIVO',   ring: '#6ee7b7' },
  reciente: { color: '#f59e0b', bg: '#fffbeb', label: '🟡 RECIENTE', ring: '#fcd34d' },
  inactivo: { color: '#94a3b8', bg: '#f8fafc', label: '⚪ INACTIVO', ring: '#e2e8f0' },
};

const CUENTA_CFG = {
  NOVONET: { grad: 'linear-gradient(135deg,#1d4ed8,#2563eb)', short: 'NOV' },
  VELSA:   { grad: 'linear-gradient(135deg,#ea580c,#c2410c)', short: 'VLS' },
};

const TIPO_ICON = {
  'Llamada': '📞', 'Email': '✉️', 'Tarea': '📋',
  'Reunion': '🤝', 'WhatsApp': '💬', 'Notificacion': '🔔',
};

const TIPO_COLOR = {
  'Llamada': '#10b981', 'Email': '#3b82f6', 'Tarea': '#8b5cf6',
  'Reunion': '#f59e0b', 'WhatsApp': '#25d366', 'Notificacion': '#94a3b8',
};

const PURPLE = 'linear-gradient(135deg,#7c3aed,#5b21b6)';

// ── Helpers ───────────────────────────────────────────────────────────────────
function tiempoAtras(min) {
  if (min < 1)    return 'Ahora';
  if (min < 60)   return `Hace ${min}m`;
  if (min < 1440) return `Hace ${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}`;
  return `Hace ${Math.floor(min / 1440)}d`;
}

function computeHourlyBuckets(asesores, horas) {
  const now    = Date.now();
  const inicio = now - horas * 3_600_000;
  const buckets = Array.from({ length: horas }, (_, i) => {
    const t = new Date(inicio + (i + 0.5) * 3_600_000);
    return {
      label:         `${t.getHours().toString().padStart(2, '0')}:00`,
      leads:         0,
      interacciones: 0,
    };
  });
  for (const d of asesores) {
    for (const m of d.movimientos || []) {
      const idx = Math.floor((new Date(m.fecha).getTime() - inicio) / 3_600_000);
      if (idx >= 0 && idx < horas) {
        buckets[idx].leads++;
        if (m.actividad) buckets[idx].interacciones++;
      }
    }
  }
  return buckets;
}

function computeAsesorHourly(movimientos, horas) {
  const now    = Date.now();
  const inicio = now - horas * 3_600_000;
  const buckets = Array.from({ length: horas }, (_, i) => {
    const t = new Date(inicio + (i + 0.5) * 3_600_000);
    return {
      label:         `${t.getHours().toString().padStart(2, '0')}:00`,
      leads:         0,
      interacciones: 0,
      tipos:         {},
    };
  });
  for (const m of movimientos || []) {
    const idx = Math.floor((new Date(m.fecha).getTime() - inicio) / 3_600_000);
    if (idx >= 0 && idx < horas) {
      buckets[idx].leads++;
      if (m.actividad) {
        buckets[idx].interacciones++;
        const tipo = m.actividad.tipo || 'Otro';
        buckets[idx].tipos[tipo] = (buckets[idx].tipos[tipo] || 0) + 1;
      }
    }
  }
  return buckets;
}

function countTipos(movimientos) {
  const c = {};
  for (const m of movimientos || []) {
    if (m.actividad) {
      const t = m.actividad.tipo || 'Otro';
      c[t] = (c[t] || 0) + 1;
    }
  }
  return c;
}

function peakHour(movimientos, horas) {
  const now    = Date.now();
  const inicio = now - horas * 3_600_000;
  const byHour = {};
  for (const m of movimientos || []) {
    const idx = Math.floor((new Date(m.fecha).getTime() - inicio) / 3_600_000);
    if (idx >= 0 && idx < horas) {
      const t     = new Date(inicio + (idx + 0.5) * 3_600_000);
      const label = `${t.getHours().toString().padStart(2, '0')}:00`;
      byHour[label] = (byHour[label] || 0) + 1;
    }
  }
  let maxLabel = '—', maxCount = 0;
  for (const [label, count] of Object.entries(byHour)) {
    if (count > maxCount) { maxCount = count; maxLabel = label; }
  }
  return { label: maxLabel, count: maxCount };
}

// ── Countdown ring SVG ────────────────────────────────────────────────────────
function CountdownRing({ secs, total }) {
  const r    = 15;
  const circ = 2 * Math.PI * r;
  const pct  = secs / total;
  const col  = pct > 0.3 ? '#7c3aed' : '#ef4444';
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" title={`Proximo refresh en ${secs}s`}>
      <circle cx="21" cy="21" r={r} fill="none" stroke="#e2e8f0" strokeWidth="3" />
      <circle
        cx="21" cy="21" r={r}
        fill="none"
        stroke={col}
        strokeWidth="3"
        strokeDasharray={`${pct * circ} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 21 21)"
        style={{ transition: 'stroke-dasharray 0.9s linear, stroke 0.3s' }}
      />
      <text x="21" y="25" textAnchor="middle" fontSize="9" fontWeight="bold" fill={col}>{secs}s</text>
    </svg>
  );
}

// ── Tarjeta Asesor (mejorada) ─────────────────────────────────────────────────
function TarjetaAsesor({ d, expandido, onToggle }) {
  const ec       = ESTADO_CFG[d.estado] || ESTADO_CFG.inactivo;
  const cc       = CUENTA_CFG[d.cuenta] || CUENTA_CFG.NOVONET;
  const tipos    = useMemo(() => countTipos(d.movimientos), [d.movimientos]);
  const topTipos = Object.entries(tipos).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <div
      className="bg-white rounded-2xl border cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 overflow-hidden"
      style={{
        borderColor: expandido ? ec.color : '#e2e8f0',
        boxShadow:   expandido ? `0 0 0 2px ${ec.ring}` : undefined,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4" onClick={onToggle}>
        {/* Avatar con pulso */}
        <div className="relative shrink-0">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-[11px] font-black shadow"
            style={{ background: cc.grad }}
          >
            {(d.asesor || '?').slice(0, 2).toUpperCase()}
          </div>
          {d.estado === 'activo' && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white animate-pulse" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-black text-slate-800 uppercase truncate">{d.asesor}</span>
            <span
              className="text-[7px] font-black px-1.5 py-0.5 rounded-md text-white shrink-0"
              style={{ background: cc.grad }}
            >
              {cc.short}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] font-bold" style={{ color: ec.color }}>{ec.label}</span>
            <span className="text-[8px] text-slate-400">· {tiempoAtras(d.minutosAtras)}</span>
          </div>
          {/* Badges tipo actividad */}
          {topTipos.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {topTipos.map(([tipo, cnt]) => (
                <span
                  key={tipo}
                  className="text-[7px] font-bold px-1.5 py-0.5 rounded-full text-white"
                  style={{ background: TIPO_COLOR[tipo] || '#64748b' }}
                >
                  {TIPO_ICON[tipo] || '📌'} {cnt}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Counter */}
        <div className="text-right shrink-0">
          <div className="text-[22px] font-black text-slate-800 leading-none">{d.totalMovimientos}</div>
          <div className="text-[7px] font-bold text-slate-400 uppercase tracking-wider">leads</div>
          <div className="text-[8px] text-slate-300 mt-0.5">{expandido ? '▲' : '▼'}</div>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="h-1 bg-slate-100">
        <div
          className="h-1 rounded-r-full transition-all duration-700"
          style={{ width: `${Math.min(100, (d.totalMovimientos / 20) * 100)}%`, background: ec.color }}
        />
      </div>

      {/* Vista 360 expandida */}
      {expandido && (
        <div onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center px-4 py-2 bg-slate-50 border-b border-slate-100">
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">
              Vista 360° · {d.totalMovimientos} lead{d.totalMovimientos !== 1 ? 's' : ''}
            </span>
            <span className="text-[9px] font-black text-slate-700">
              ${(d.montoTotal || 0).toLocaleString('es-EC', { minimumFractionDigits: 0 })}
            </span>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
            {(d.movimientos || []).map((m, i) => (
              <div key={m.dealId || i} className="px-4 py-2.5 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] font-bold text-slate-800 truncate">{m.negocio}</div>
                    <span
                      className="inline-block text-[7px] font-bold px-1.5 py-0.5 rounded-full mt-0.5"
                      style={{ background: ec.bg, color: ec.color }}
                    >
                      {m.etapa}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    {m.monto > 0 && (
                      <div className="text-[8px] font-black text-slate-700">
                        ${Number(m.monto).toLocaleString()}
                      </div>
                    )}
                    <div className="text-[7px] text-slate-400">
                      {tiempoAtras(Math.floor((Date.now() - new Date(m.fecha)) / 60000))}
                    </div>
                  </div>
                </div>
                {m.actividad && (
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <span className="text-[8px]">{TIPO_ICON[m.actividad.tipo] || '📌'}</span>
                    <span className="text-[7px] font-bold text-slate-600">{m.actividad.tipo}</span>
                    {m.actividad.durMinutos && (
                      <span className="text-[7px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.5 rounded-full">
                        ⏱ {m.actividad.durMinutos}
                      </span>
                    )}
                    {m.actividad.asunto && (
                      <span className="text-[7px] text-slate-400 truncate">· {m.actividad.asunto}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tooltip personalizado para recharts ───────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white rounded-xl shadow-xl border border-slate-100 p-3 text-[10px]">
      <div className="font-black text-slate-700 mb-1.5">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name === 'leads' ? 'Leads' : 'Interacciones'}:</span>
          <span className="font-black" style={{ color: p.color }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Panel Reporte por Hora ────────────────────────────────────────────────────
function ReporteHoras({ data, horas }) {
  const [selKey,   setSelKey]   = useState(null);
  const [busqueda, setBusqueda] = useState('');

  const globalBuckets = useMemo(() => {
    const b = computeHourlyBuckets(data, horas);
    return b.filter(x => x.leads > 0);
  }, [data, horas]);

  const selData = useMemo(
    () => data.find(d => `${d.asesor}||${d.cuenta}` === selKey),
    [data, selKey]
  );

  const selHourly = useMemo(() => {
    if (!selData) return [];
    return computeAsesorHourly(selData.movimientos, horas).filter(b => b.leads > 0);
  }, [selData, horas]);

  const sorted = useMemo(
    () => [...data]
      .filter(d => !busqueda || d.asesor.toLowerCase().includes(busqueda.toLowerCase()))
      .sort((a, b) => b.totalMovimientos - a.totalMovimientos),
    [data, busqueda]
  );

  return (
    <div className="space-y-5">

      {/* ── Grafica global por hora ── */}
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wide">
              Actividad Global por Hora
            </h3>
            <p className="text-[9px] text-slate-400 font-bold mt-0.5">
              Todos los asesores · ultimas {horas}h
            </p>
          </div>
          <div className="flex gap-4 text-[8px] font-bold text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#7c3aed' }} />
              Leads modificados
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#10b981' }} />
              Interacciones
            </span>
          </div>
        </div>
        {globalBuckets.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={globalBuckets} barGap={3} barCategoryGap="28%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 8, fontWeight: 'bold', fill: '#94a3b8' }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 8, fill: '#94a3b8' }}
                axisLine={false} tickLine={false} width={20}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="leads" name="leads" fill="#7c3aed" radius={[4, 4, 0, 0]} maxBarSize={34} />
              <Bar dataKey="interacciones" name="interacciones" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={34} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-slate-300 text-[11px] font-black">
            Sin actividad registrada en el periodo
          </div>
        )}
      </div>

      {/* ── Tabla por asesor ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-wrap gap-3">
          <div>
            <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wide">
              Reporte por Asesor · Desglose por Hora
            </h3>
            <p className="text-[9px] text-slate-400 font-bold mt-0.5">
              Haz clic en un asesor para ver su breakdown hora por hora
            </p>
          </div>
          <input
            className="text-[9px] border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-200 w-40"
            placeholder="Buscar asesor..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>

        {/* Encabezados */}
        <div
          className="grid px-5 py-2 bg-slate-50 border-b border-slate-100 text-[8px] font-black text-slate-400 uppercase tracking-widest"
          style={{ gridTemplateColumns: '1fr 68px 80px 76px 130px 22px' }}
        >
          <span>Asesor</span>
          <span className="text-right">Leads</span>
          <span className="text-center">Interacc.</span>
          <span className="text-center">Hora pico</span>
          <span className="text-center">Tipos</span>
          <span />
        </div>

        {/* Filas */}
        <div className="divide-y divide-slate-50 max-h-[520px] overflow-y-auto">
          {sorted.map(d => {
            const key      = `${d.asesor}||${d.cuenta}`;
            const isSel    = selKey === key;
            const cc       = CUENTA_CFG[d.cuenta] || CUENTA_CFG.NOVONET;
            const ec       = ESTADO_CFG[d.estado]  || ESTADO_CFG.inactivo;
            const peak     = peakHour(d.movimientos || [], horas);
            const tipos    = countTipos(d.movimientos || []);
            const topTipos = Object.entries(tipos).sort((a, b) => b[1] - a[1]).slice(0, 2);
            const totalInt = (d.movimientos || []).filter(m => m.actividad).length;
            const pctInt   = d.totalMovimientos > 0
              ? Math.round((totalInt / d.totalMovimientos) * 100)
              : 0;

            return (
              <div key={key}>
                {/* Fila resumen */}
                <div
                  className={`grid px-5 py-3 cursor-pointer items-center transition-colors hover:bg-slate-50 ${isSel ? 'bg-purple-50 hover:bg-purple-50' : ''}`}
                  style={{ gridTemplateColumns: '1fr 68px 80px 76px 130px 22px' }}
                  onClick={() => setSelKey(isSel ? null : key)}
                >
                  {/* Asesor */}
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[9px] font-black shrink-0 shadow-sm"
                      style={{ background: cc.grad }}
                    >
                      {(d.asesor || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-black text-slate-800 truncate">{d.asesor}</div>
                      <div className="flex items-center gap-1">
                        <span
                          className="text-[7px] font-black px-1 py-0.5 rounded text-white"
                          style={{ background: cc.grad }}
                        >{cc.short}</span>
                        <span className="text-[7px] font-bold" style={{ color: ec.color }}>{d.estado}</span>
                      </div>
                    </div>
                  </div>

                  {/* Leads */}
                  <div className="text-right">
                    <div className="text-[16px] font-black text-purple-700">{d.totalMovimientos}</div>
                  </div>

                  {/* Interacciones */}
                  <div className="text-center">
                    <div className="text-[15px] font-black text-emerald-700">{totalInt}</div>
                    <div className="text-[7px] text-slate-400">{pctInt}%</div>
                  </div>

                  {/* Hora pico */}
                  <div className="text-center">
                    <div className="text-[11px] font-black text-slate-700">{peak.label}</div>
                    {peak.count > 0 && (
                      <div className="text-[7px] text-slate-400">{peak.count} leads</div>
                    )}
                  </div>

                  {/* Tipos */}
                  <div className="flex gap-1 justify-center flex-wrap">
                    {topTipos.map(([tipo, cnt]) => (
                      <span
                        key={tipo}
                        className="text-[7px] font-bold px-1.5 py-0.5 rounded-full text-white"
                        style={{ background: TIPO_COLOR[tipo] || '#64748b' }}
                      >
                        {TIPO_ICON[tipo] || '📌'} {cnt}
                      </span>
                    ))}
                    {topTipos.length === 0 && (
                      <span className="text-[7px] text-slate-300 italic">—</span>
                    )}
                  </div>

                  {/* Toggle */}
                  <div className="text-[9px] text-slate-400 text-right">{isSel ? '▲' : '▼'}</div>
                </div>

                {/* Detalle expandido hora por hora */}
                {isSel && (
                  <div className="bg-purple-50 border-t border-purple-100 px-5 py-4">
                    <div className="text-[9px] font-black text-purple-700 uppercase tracking-widest mb-3">
                      Desglose horario · {d.asesor} ({d.cuenta})
                    </div>

                    {selHourly.length > 0 ? (
                      <>
                        {/* Mini grafica del asesor */}
                        <div className="mb-4">
                          <ResponsiveContainer width="100%" height={140}>
                            <BarChart data={selHourly} barGap={2} barCategoryGap="30%">
                              <CartesianGrid strokeDasharray="3 3" stroke="#e9d5ff" vertical={false} />
                              <XAxis
                                dataKey="label"
                                tick={{ fontSize: 8, fill: '#7c3aed', fontWeight: 'bold' }}
                                axisLine={false} tickLine={false}
                              />
                              <YAxis
                                allowDecimals={false}
                                tick={{ fontSize: 8, fill: '#7c3aed' }}
                                axisLine={false} tickLine={false} width={18}
                              />
                              <Tooltip content={<CustomTooltip />} />
                              <Bar dataKey="leads" name="leads" fill="#7c3aed" radius={[3, 3, 0, 0]} maxBarSize={24} />
                              <Bar dataKey="interacciones" name="interacciones" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={24} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Tabla hora por hora */}
                        <div className="rounded-xl overflow-hidden border border-purple-200">
                          <div
                            className="grid px-4 py-2 bg-purple-100 text-[8px] font-black text-purple-700 uppercase tracking-widest"
                            style={{ gridTemplateColumns: '80px 60px 80px 1fr' }}
                          >
                            <span>Hora</span>
                            <span className="text-right">Leads</span>
                            <span className="text-center">Interacc.</span>
                            <span className="pl-4">Tipos de actividad</span>
                          </div>
                          {selHourly.map((b, i) => (
                            <div
                              key={i}
                              className="grid px-4 py-2.5 border-t border-purple-50 bg-white items-center hover:bg-purple-50 transition-colors"
                              style={{ gridTemplateColumns: '80px 60px 80px 1fr' }}
                            >
                              <span className="text-[10px] font-black text-slate-700">{b.label}</span>
                              <span className="text-right text-[13px] font-black text-purple-700">{b.leads}</span>
                              <span className="text-center text-[13px] font-black text-emerald-700">{b.interacciones}</span>
                              <div className="flex gap-1 flex-wrap pl-4">
                                {Object.entries(b.tipos).map(([tipo, cnt]) => (
                                  <span
                                    key={tipo}
                                    className="text-[7px] font-bold px-1.5 py-0.5 rounded-full text-white"
                                    style={{ background: TIPO_COLOR[tipo] || '#64748b' }}
                                  >
                                    {TIPO_ICON[tipo] || '📌'} {cnt}
                                  </span>
                                ))}
                                {Object.keys(b.tipos).length === 0 && (
                                  <span className="text-[7px] text-slate-300 italic">Sin interacciones</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-6 text-slate-400 text-[10px] font-bold">
                        Sin actividad en el periodo seleccionado
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Pagina principal ──────────────────────────────────────────────────────────
export default function BitrixLive() {
  const [data,      setData]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [horas,     setHoras]     = useState(24);
  const [filtro,    setFiltro]    = useState('TODOS');
  const [cuenta,    setCuenta]    = useState('TODOS');
  const [expandido, setExpandido] = useState(null);
  const [lastSync,  setLastSync]  = useState(null);
  const [tab,       setTab]       = useState('live');
  const [countdown, setCountdown] = useState(REFRESH_SECS);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const r = await fetch(`${API}/api/bitrix/live-actividad?horas=${horas}`);
      const j = await r.json();
      if (j.success) { setData(j.data || []); setLastSync(new Date()); }
      else setError(j.error);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [horas]);

  // Carga inicial al cambiar periodo
  useEffect(() => {
    setLoading(true);
    setCountdown(REFRESH_SECS);
    fetchData();
  }, [fetchData]);

  // Cuenta regresiva 90s con auto-refresh
  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          fetchData();
          return REFRESH_SECS;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [fetchData]);

  const filtrado = useMemo(() => data.filter(d => {
    if (filtro !== 'TODOS' && d.estado !== filtro) return false;
    if (cuenta !== 'TODOS' && d.cuenta !== cuenta) return false;
    return true;
  }), [data, filtro, cuenta]);

  const stats = useMemo(() => ({
    activos:   data.filter(d => d.estado === 'activo').length,
    recientes: data.filter(d => d.estado === 'reciente').length,
    total:     data.length,
    movs:      data.reduce((a, d) => a + d.totalMovimientos, 0),
  }), [data]);

  const btnCls = active =>
    `px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wide transition-all ${
      active ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
    }`;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2 uppercase tracking-tight">
            <span
              className="text-white px-2.5 py-1 rounded-lg text-lg font-black shadow-lg"
              style={{ background: PURPLE }}
            >BTX</span>
            Actividad en Tiempo Real
          </h1>
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 ml-0.5">
            Bitrix24 · Novonet + Velsa · Auto-refresh {REFRESH_SECS}s
            {lastSync && (
              <span className="ml-2">
                · Sync: {lastSync.toLocaleTimeString('es-EC', { timeStyle: 'short' })}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Selector de periodo */}
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
            {[4, 8, 24, 48].map(h => (
              <button
                key={h}
                onClick={() => setHoras(h)}
                className={btnCls(horas === h)}
                style={horas === h ? { background: PURPLE } : {}}
              >
                {h}h
              </button>
            ))}
          </div>

          {/* Reloj cuenta regresiva */}
          <CountdownRing secs={countdown} total={REFRESH_SECS} />

          {/* Boton actualizar manual */}
          <button
            onClick={() => { setLoading(true); setCountdown(REFRESH_SECS); fetchData(); }}
            className="px-4 py-2 rounded-xl text-[9px] font-black uppercase text-white shadow-sm transition-all active:scale-95"
            style={{ background: PURPLE }}
          >
            {loading ? '...' : '⟳ Actualizar'}
          </button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Activos ahora',  val: stats.activos,   col: '#10b981', icon: '🟢' },
          { label: 'Recientes',      val: stats.recientes, col: '#f59e0b', icon: '🟡' },
          { label: 'Total asesores', val: stats.total,     col: '#7c3aed', icon: '👥' },
          { label: 'Leads totales',  val: stats.movs,      col: '#2563eb', icon: '📋' },
        ].map((k, i) => (
          <div
            key={i}
            className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-shadow"
            style={{ borderTop: `3px solid ${k.col}` }}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{k.label}</div>
              <span className="text-base">{k.icon}</span>
            </div>
            <div className="text-3xl font-black leading-none" style={{ color: k.col }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-5 bg-slate-100 p-1 rounded-xl w-fit">
        {[
          { key: 'live',    label: '🟢 Tiempo Real' },
          { key: 'reporte', label: '📊 Reporte por Hora' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all ${
              tab === t.key ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'
            }`}
            style={tab === t.key ? { background: PURPLE } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Tiempo Real ── */}
      {tab === 'live' && (
        <>
          {/* Filtros */}
          <div className="flex gap-2 flex-wrap mb-5 items-center">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Estado:</span>
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
              {['TODOS', 'activo', 'reciente', 'inactivo'].map(f => (
                <button
                  key={f}
                  onClick={() => setFiltro(f)}
                  className={btnCls(filtro === f)}
                  style={filtro === f
                    ? {
                        background: f === 'activo' ? '#10b981'
                          : f === 'reciente' ? '#f59e0b'
                          : f === 'inactivo' ? '#94a3b8'
                          : PURPLE,
                      }
                    : {}}
                >
                  {f === 'TODOS' ? 'Todos' : ESTADO_CFG[f]?.label || f}
                </button>
              ))}
            </div>

            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Cuenta:</span>
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
              {['TODOS', 'NOVONET', 'VELSA'].map(c => (
                <button
                  key={c}
                  onClick={() => setCuenta(c)}
                  className={btnCls(cuenta === c)}
                  style={cuenta === c
                    ? c === 'NOVONET' ? { background: CUENTA_CFG.NOVONET.grad }
                      : c === 'VELSA' ? { background: CUENTA_CFG.VELSA.grad }
                      : { background: PURPLE }
                    : {}}
                >
                  {c === 'TODOS' ? 'Ambas' : c}
                </button>
              ))}
            </div>

            <span className="ml-auto text-[8px] text-slate-400 font-bold">{filtrado.length} asesores</span>
          </div>

          {/* Skeletons */}
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-slate-100 rounded-2xl h-24 animate-pulse" />
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
              <div className="text-2xl mb-2">⚠️</div>
              <div className="text-[11px] font-black text-red-700 uppercase">{error}</div>
              <div className="text-[9px] text-red-400 mt-1">Revisa la conexion con las APIs de Bitrix24</div>
            </div>
          )}

          {/* Vacio */}
          {!loading && !error && filtrado.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <div className="text-4xl mb-3">🔍</div>
              <div className="text-[11px] font-black uppercase">Sin actividad en las ultimas {horas}h</div>
            </div>
          )}

          {/* Grid asesores */}
          {!loading && !error && filtrado.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filtrado.map((d, i) => (
                <TarjetaAsesor
                  key={`${d.asesor}-${d.cuenta}`}
                  d={d}
                  expandido={expandido === i}
                  onToggle={() => setExpandido(expandido === i ? null : i)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Tab: Reporte por Hora ── */}
      {tab === 'reporte' && (
        loading ? (
          <div className="space-y-4">
            <div className="bg-slate-100 rounded-2xl h-64 animate-pulse" />
            <div className="bg-slate-100 rounded-2xl h-48 animate-pulse" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <div className="text-2xl mb-2">⚠️</div>
            <div className="text-[11px] font-black text-red-700 uppercase">{error}</div>
          </div>
        ) : (
          <ReporteHoras data={data} horas={horas} />
        )
      )}

      {/* ── Footer ── */}
      <div className="mt-8 text-center text-[8px] text-slate-300 font-bold uppercase tracking-widest">
        🟢 Activo = modificado en ultimos 30 min · 🟡 Reciente = 30–120 min · ⚪ Inactivo = mas de 2h
        · Haz clic en una tarjeta para ver el detalle 360°
      </div>
    </div>
  );
}
