/**
 * Dashboard de cumplimiento. Solo jefaturas y administradores.
 * El alcance de los datos lo decide el backend según el cargo.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, AlertTriangle, Inbox, Clock, Eye } from 'lucide-react';
import { tareasApi } from '../../hooks/useTareas';
import { Cargando, ErrorBox, Vacio, EstadoBadge, Avatar, fmtFechaCorta } from './ui';

const COLOR_ESTADO = {
  PENDIENTE:   '#94a3b8',
  EN_PROCESO:  '#3b82f6',
  EN_REVISION: '#f59e0b',
  COMPLETADA:  '#10b981',
  CANCELADA:   '#cbd5e1',
};

export default function TareasDashboard({ onAbrirTarea }) {
  const [d, setD]           = useState(null);
  const [cargando, setCarg] = useState(true);
  const [error, setError]   = useState(null);
  const [meses, setMeses]   = useState(6);

  const cargar = useCallback(() => {
    setCarg(true);
    return tareasApi.dashboard(meses)
      .then(r => { setD(r.data); setError(null); })
      .catch(setError)
      .finally(() => setCarg(false));
  }, [meses]);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando && !d) return <Cargando texto="Calculando indicadores…" />;
  if (error) return <ErrorBox error={error} onReintentar={cargar} />;
  if (!d) return null;

  const k = d.kpis;
  if (k.total === 0) {
    return <Vacio titulo="Todavía no hay datos"
                  texto="Cuando el equipo empiece a registrar tareas, aquí verás el cumplimiento." />;
  }

  return (
    <div className="space-y-5">

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="inline-flex items-center gap-1.5 text-sm text-slate-500">
          <Eye size={14} /> Alcance: <strong className="text-slate-700">{d.alcance}</strong>
        </p>
        <select value={meses} onChange={e => setMeses(Number(e.target.value))}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm bg-white">
          <option value={3}>Últimos 3 meses</option>
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Últimos 12 meses</option>
        </select>
      </div>

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Cumplimiento a tiempo"
          valor={k.cumplimiento_pct === null ? '—' : `${k.cumplimiento_pct}%`}
          detalle={`${k.a_tiempo} a tiempo · ${k.con_retraso} tarde`}
          icono={TrendingUp}
          tono={k.cumplimiento_pct === null ? 'slate'
              : k.cumplimiento_pct >= 85 ? 'emerald'
              : k.cumplimiento_pct >= 60 ? 'amber' : 'rose'}
        />
        <Kpi label="Tareas abiertas" valor={k.abiertas}
             detalle={`${k.total} en total`} icono={Inbox} tono="blue" />
        <Kpi label="Vencidas" valor={k.vencidas}
             detalle={k.vencidas > 0 ? `${k.promedio_dias_retraso} días de retraso promedio` : 'Ninguna'}
             icono={AlertTriangle} tono={k.vencidas > 0 ? 'rose' : 'emerald'} />
        <Kpi label="Esperando aprobación" valor={k.en_revision}
             detalle="En revisión del solicitante" icono={Clock} tono="amber" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">

        {/* ── Distribución por estado ─────────────────────────────────────── */}
        <Panel titulo="Distribución por estado">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={d.por_estado.filter(e => e.total > 0)} dataKey="total" nameKey="etiqueta"
                   cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2}>
                {d.por_estado.filter(e => e.total > 0).map(e => (
                  <Cell key={e.estado} fill={COLOR_ESTADO[e.estado]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend verticalAlign="bottom" height={36} iconType="circle"
                      wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>

        {/* ── Por área ────────────────────────────────────────────────────── */}
        <Panel titulo="Tareas por área" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={d.por_area} margin={{ top: 5, right: 5, left: -18, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="area" tick={{ fontSize: 11, fill: '#64748b' }} interval={0}
                     angle={-15} textAnchor="end" height={54} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
              <Bar dataKey="pendientes"  name="Pendientes"  stackId="a" fill="#94a3b8" />
              <Bar dataKey="en_proceso"  name="En proceso"  stackId="a" fill="#3b82f6" />
              <Bar dataKey="en_revision" name="En revisión" stackId="a" fill="#f59e0b" />
              <Bar dataKey="completadas" name="Completadas" stackId="a" fill="#10b981"
                   radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* ── Tendencia ─────────────────────────────────────────────────────── */}
      {d.tendencia.length > 1 && (
        <Panel titulo="Cumplimiento mes a mes"
               subtitulo="Porcentaje de tareas entregadas dentro de la fecha límite">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={d.tendencia} margin={{ top: 5, right: 10, left: -18, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
              <Tooltip contentStyle={tooltipStyle}
                       formatter={(v, n) => n === 'cumplimiento_pct' ? [`${v}%`, 'Cumplimiento'] : [v, n]} />
              <Line type="monotone" dataKey="cumplimiento_pct" name="Cumplimiento"
                    stroke="#2563eb" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      )}

      <div className="grid lg:grid-cols-2 gap-4">

        {/* ── Carga por persona ───────────────────────────────────────────── */}
        <Panel titulo="Carga por persona">
          {d.por_persona.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">Sin datos.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {d.por_persona.map(p => {
                const max = Math.max(...d.por_persona.map(x => x.abiertas), 1);
                return (
                  <div key={p.responsable_id} className="flex items-center gap-2.5">
                    <Avatar nombre={p.persona} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-slate-700 truncate">{p.persona}</span>
                        <span className="text-xs text-slate-400 shrink-0">{p.area}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full bg-blue-500"
                               style={{ width: `${(p.abiertas / max) * 100}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-slate-600 w-6 text-right">{p.abiertas}</span>
                        {p.vencidas > 0 && (
                          <span className="text-xs font-semibold text-rose-600 shrink-0">
                            {p.vencidas} vencida{p.vencidas === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/* ── Top vencidas ────────────────────────────────────────────────── */}
        <Panel titulo="Las más atrasadas">
          {d.top_vencidas.length === 0 ? (
            <p className="text-sm text-emerald-600 py-6 text-center font-medium">
              No hay tareas vencidas.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {d.top_vencidas.map(t => (
                <div key={t.id} onClick={() => onAbrirTarea(t.id)}
                  className="rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2 cursor-pointer hover:bg-rose-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{t.titulo}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {t.responsable_nombre} · {t.area_responsable_nombre} · venció {fmtFechaCorta(t.fecha_limite)}
                      </p>
                    </div>
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700 shrink-0">
                      {t.dias_retraso}d
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12,
  boxShadow: '0 4px 16px rgba(15,23,42,.08)',
};

const TONOS = {
  emerald: 'text-emerald-600',
  blue:    'text-blue-600',
  amber:   'text-amber-600',
  rose:    'text-rose-600',
  slate:   'text-slate-500',
};

function Kpi({ label, valor, detalle, icono: Icono, tono }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <Icono size={16} className={TONOS[tono] || TONOS.slate} />
      </div>
      <p className={`text-3xl font-bold mt-1.5 ${TONOS[tono] || 'text-slate-800'}`}>{valor}</p>
      {detalle && <p className="text-xs text-slate-400 mt-1">{detalle}</p>}
    </div>
  );
}

function Panel({ titulo, subtitulo, children, className = '' }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
      <h3 className="text-sm font-bold text-slate-700">{titulo}</h3>
      {subtitulo && <p className="text-xs text-slate-400 mt-0.5 mb-2">{subtitulo}</p>}
      <div className={subtitulo ? '' : 'mt-3'}>{children}</div>
    </div>
  );
}
