// src/pages/BitrixLive.jsx
// Actividad Bitrix24 en tiempo real — Vista profesional
// Split NOVONET / VELSA · Restricción por perfil · Tarjetas + Tabla + Gráficas
//
// ── Notas de arquitectura (leer antes de tocar) ────────────────────────────────
// 1. REFRESCO SILENCIOSO: la pantalla nunca se vacía. El esqueleto solo aparece
//    en el primerísimo arranque sin caché. Todo refresco posterior (auto cada
//    90 s, manual, cambio de ventana horaria) es "stale-while-revalidate": se
//    mantiene lo que ya está pintado y solo se marca un indicador sutil.
// 2. CACHÉ: el último snapshot vive en localStorage con TTL. Al abrir el módulo
//    se pinta al instante desde caché y se revalida por detrás.
// 3. ESTADOS DE CONTACT-CENTER (En llamada / En chat / En espera / Disponible)
//    NO vienen del backend: se DERIVAN de datos reales — el tipo de la última
//    actividad registrada en Bitrix y los minutos transcurridos. No hay ningún
//    dato inventado. Ver `deriveAsesorCC()` y la constante `CLASE_TIPO`.

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import BitrixSesiones from "./BitrixSesiones";

const API          = import.meta.env.VITE_API_URL || "http://localhost:3050";
const REFRESH_SECS = 90;

// Caché local del último snapshot (para que al abrir se vean datos al instante)
const CACHE_PREFIX  = 'bitrixlive:snapshot:v1:';
const CACHE_TTL_MS  = 30 * 60 * 1000;  // 30 min
const CACHE_MAX_STR = 3_000_000;       // ~3 MB — por encima de esto no se cachea

const cacheKey = (h) => `${CACHE_PREFIX}${h}`;

function readCache(h) {
  try {
    const raw = localStorage.getItem(cacheKey(h));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || !Array.isArray(p.data) || !p.ts) return null;
    if (Date.now() - p.ts > CACHE_TTL_MS) return null;
    return p;
  } catch { return null; }
}

function writeCache(h, data) {
  const snap = { ts: Date.now(), data, horas: h };
  _boot = snap;                               // el siguiente montaje hidrata con esto
  try {
    const str = JSON.stringify(snap);
    if (str.length > CACHE_MAX_STR) return;   // demasiado grande, no vale la pena
    localStorage.setItem(cacheKey(h), str);
  } catch { /* cuota llena o modo privado: la caché es un extra, nunca crítica */ }
}

// Snapshot de arranque: se lee una sola vez por montaje para hidratar el estado
// inicial en el propio `useState`, sin pasar por un efecto (evita el parpadeo
// de un primer render vacío).
let _boot;
function bootSnapshot(h) {
  if (_boot === undefined || _boot === null || _boot.horas !== h) {
    const c = readCache(h);
    _boot = c ? { ...c, horas: h } : null;
  }
  return _boot;
}

// ── Empresa config ─────────────────────────────────────────────────────────────
const EMP = {
  NOVONET: {
    color:  '#2563eb',
    dark:   '#1d4ed8',
    light:  '#eff6ff',
    border: '#bfdbfe',
    grad:   'linear-gradient(135deg,#1d4ed8,#2563eb)',
    label:  'NOVONET',
    icon:   '🔵',
    short:  'NOV',
  },
  VELSA: {
    color:  '#ea580c',
    dark:   '#c2410c',
    light:  '#fff7ed',
    border: '#fed7aa',
    grad:   'linear-gradient(135deg,#c2410c,#ea580c)',
    label:  'VELSA',
    icon:   '🟠',
    short:  'VLS',
  },
};

const ESTADO = {
  activo:   { color: '#10b981', bg: '#ecfdf5', badge: 'bg-emerald-100 text-emerald-700', label: 'Activo',   dot: '#10b981' },
  reciente: { color: '#f59e0b', bg: '#fffbeb', badge: 'bg-amber-100 text-amber-700',     label: 'Reciente', dot: '#f59e0b' },
  inactivo: { color: '#94a3b8', bg: '#f8fafc', badge: 'bg-slate-100 text-slate-500',     label: 'Inactivo', dot: '#cbd5e1' },
};

const TIPO_ICON  = { 'Llamada':'📞','Email':'✉️','Tarea':'📋','Reunion':'🤝','WhatsApp':'💬','Notificacion':'🔔' };
const TIPO_COLOR = { 'Llamada':'#10b981','Email':'#3b82f6','Tarea':'#8b5cf6','Reunion':'#f59e0b','WhatsApp':'#25d366','Notificacion':'#94a3b8' };

// ── Estados de contact-center (derivados, no inventados) ───────────────────────
// Cómo se deriva cada uno:
//   En llamada  → última actividad < 30 min y de tipo Llamada / Reunión
//   En chat     → última actividad < 30 min y de tipo WhatsApp / Email / Notificación
//   En espera   → movimiento en los últimos 120 min sin interacción tipada reciente
//   Disponible  → sin movimiento hace más de 120 min
const CC = {
  llamada:    { key:'llamada',    label:'En llamada', kpi:'En Llamada',  icon:'📞', color:'#10b981', bg:'#ecfdf5', ring:'#a7f3d0', chip:'bg-emerald-50 text-emerald-700 border-emerald-200', metrica:'Llamadas hoy' },
  chat:       { key:'chat',       label:'En chat',    kpi:'En Chat',     icon:'💬', color:'#8b5cf6', bg:'#f5f3ff', ring:'#ddd6fe', chip:'bg-violet-50 text-violet-700 border-violet-200',    metrica:'Chats hoy' },
  espera:     { key:'espera',     label:'En espera',  kpi:'En Espera',   icon:'⏳', color:'#f59e0b', bg:'#fffbeb', ring:'#fde68a', chip:'bg-amber-50 text-amber-700 border-amber-200',       metrica:'Interacciones hoy' },
  disponible: { key:'disponible', label:'Disponible', kpi:'Disponibles', icon:'👤', color:'#64748b', bg:'#f8fafc', ring:'#e2e8f0', chip:'bg-slate-50 text-slate-600 border-slate-200',       metrica:'Interacciones hoy' },
};
const CC_ORDEN = ['llamada','chat','espera','disponible'];

// Agrupa los tipos de actividad de Bitrix en "voz" vs "texto"
const CLASE_TIPO = {
  'Llamada':      'llamada',
  'Reunion':      'llamada',
  'WhatsApp':     'chat',
  'Email':        'chat',
  'Notificacion': 'chat',
  'Tarea':        'otro',
};

// Enlace directo a la negociación dentro de Bitrix24 (por cuenta)
const BITRIX_DEAL_URL = {
  NOVONET: 'https://novonet.bitrix24.es/crm/deal/details/',
  VELSA:   'https://aclopecuador.bitrix24.es/crm/deal/details/',
};

const FAV_KEY = 'bitrixlive:favoritos:v1';

const fmtMonto = (m, moneda) =>
  m > 0 ? `${moneda || '$'} ${Number(m).toLocaleString('es-EC', { maximumFractionDigits: 2 })}` : '—';

const fmtFechaHora = (f) => {
  const d = new Date(f);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-EC', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

// Cronómetro real: tiempo transcurrido desde la última actividad registrada
const fmtCrono = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s >= 86400) return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const tiempoAtras = (min) => {
  if (min < 1)    return 'Ahora';
  if (min < 60)   return `${min}m`;
  if (min < 1440) return `${Math.floor(min/60)}h${min%60?` ${min%60}m`:''}`;
  return `${Math.floor(min/1440)}d`;
};

const getEmpresaFromUser = (user) => {
  const p = (user.perfil || '').toUpperCase();
  const e = (user.empresa || user.distribuidor || user.cuenta || '').toUpperCase();
  if (e.includes('VELSA')   || p.includes('VELSA'))   return 'VELSA';
  if (e.includes('NOVONET') || p.includes('NOVONET')) return 'NOVONET';
  return 'TODOS'; // admin, gerencia, supervisor cross
};

function countTipos(movs) {
  const c = {};
  for (const m of movs||[]) if (m.actividad) { const t=m.actividad.tipo||'Otro'; c[t]=(c[t]||0)+1; }
  return c;
}

function peakHour(movs, horas) {
  const now=Date.now(), ini=now-horas*3600000, h={};
  for (const m of movs||[]) {
    const idx=Math.floor((new Date(m.fecha).getTime()-ini)/3600000);
    if(idx>=0&&idx<horas){ const l=`${new Date(ini+(idx+.5)*3600000).getHours().toString().padStart(2,'0')}:00`; h[l]=(h[l]||0)+1; }
  }
  let maxL='—',maxC=0;
  for (const [l,c] of Object.entries(h)) if(c>maxC){maxC=c;maxL=l;}
  return {label:maxL,count:maxC};
}

function compHourlyBuckets(asesores, horas) {
  const now=Date.now(),ini=now-horas*3600000;
  const b=Array.from({length:horas},(_,i)=>{
    const t=new Date(ini+(i+.5)*3600000);
    return {label:`${t.getHours().toString().padStart(2,'0')}:00`,leads:0,interacciones:0};
  });
  for (const d of asesores) for (const m of d.movimientos||[]) {
    const idx=Math.floor((new Date(m.fecha).getTime()-ini)/3600000);
    if(idx>=0&&idx<horas){b[idx].leads++;if(m.actividad)b[idx].interacciones++;}
  }
  return b;
}

function compAsesorHourly(movs, horas) {
  const now=Date.now(),ini=now-horas*3600000;
  const b=Array.from({length:horas},(_,i)=>{
    const t=new Date(ini+(i+.5)*3600000);
    return {label:`${t.getHours().toString().padStart(2,'0')}:00`,leads:0,interacciones:0,tipos:{}};
  });
  for (const m of movs||[]) {
    const idx=Math.floor((new Date(m.fecha).getTime()-ini)/3600000);
    if(idx>=0&&idx<horas){b[idx].leads++;if(m.actividad){b[idx].interacciones++;const t=m.actividad.tipo||'Otro';b[idx].tipos[t]=(b[idx].tipos[t]||0)+1;}}
  }
  return b;
}

// ── Derivación del estado de contact-center a partir de datos reales ───────────
function deriveAsesorCC(d, iniHoyTs) {
  const movs   = d.movimientos || [];
  const conAct = movs.filter(m => m.actividad);      // ya vienen ordenados desc por fecha
  const ultima = conAct[0] || null;
  const tipo   = ultima?.actividad?.tipo || null;
  const clase  = CLASE_TIPO[tipo] || null;
  const min    = Number.isFinite(d.minutosAtras) ? d.minutosAtras : 99999;

  let cc;
  if (min < 30 && clase === 'llamada')      cc = 'llamada';
  else if (min < 30 && clase === 'chat')    cc = 'chat';
  else if (min < 120)                       cc = 'espera';
  else                                      cc = 'disponible';

  const hoy = conAct.filter(m => new Date(m.fecha).getTime() >= iniHoyTs);
  const llamadasHoy = hoy.filter(m => CLASE_TIPO[m.actividad.tipo] === 'llamada').length;
  const chatsHoy    = hoy.filter(m => CLASE_TIPO[m.actividad.tipo] === 'chat').length;

  const calidad = movs.length ? Math.round((conAct.length / movs.length) * 100) : null;
  const ultimaTs = new Date(d.ultimaActividad).getTime();

  return {
    ...d,
    cc,
    tipoUltima:        tipo,
    ultimoMovimiento:  ultima || movs[0] || null,
    ultimaTs:          Number.isFinite(ultimaTs) ? ultimaTs : NaN,
    llamadasHoy,
    chatsHoy,
    interaccionesHoy:  hoy.length,
    interaccionesTot:  conAct.length,
    calidad,
  };
}

const metricaPrincipal = (a) =>
  a.cc === 'llamada' ? { label: 'Llamadas hoy', valor: a.llamadasHoy }
  : a.cc === 'chat'  ? { label: 'Chats hoy',    valor: a.chatsHoy }
  :                    { label: 'Interacciones hoy', valor: a.interaccionesHoy };

// ── Countdown SVG ──────────────────────────────────────────────────────────────
function Countdown({ secs, total }) {
  const r=14, circ=2*Math.PI*r, pct=Math.max(0,secs)/total;
  const col=pct>.3?'#2563eb':'#ef4444';
  return (
    <svg width="38" height="38" viewBox="0 0 38 38">
      <circle cx="19" cy="19" r={r} fill="none" stroke="#e2e8f0" strokeWidth="2.5"/>
      <circle cx="19" cy="19" r={r} fill="none" stroke={col} strokeWidth="2.5"
        strokeDasharray={`${pct*circ} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 19 19)" style={{transition:'stroke-dasharray .9s linear'}}/>
      <text x="19" y="23" textAnchor="middle" fontSize="8" fontWeight="bold" fill={col}>{Math.max(0,secs)}</text>
    </svg>
  );
}

// ── Waveform decorativo (animado solo si el asesor está activo) ────────────────
function Waveform({ activo, color, seed, n = 30 }) {
  // Alturas deterministas por asesor: el mismo nombre siempre dibuja la misma
  // onda, así el refresco de datos no hace "saltar" la gráfica.
  const heights = useMemo(() => {
    let s = 2166136261;
    for (let i = 0; i < seed.length; i++) { s ^= seed.charCodeAt(i); s = Math.imul(s, 16777619) >>> 0; }
    const out = [];
    for (let i = 0; i < n; i++) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      out.push(0.22 + ((s >>> 16) % 78) / 100);
    }
    return out;
  }, [seed, n]);

  return (
    <div className="flex items-center gap-[2px] h-6 flex-1 min-w-0 overflow-hidden" aria-hidden="true">
      {heights.map((h, i) => (
        <span
          key={i}
          className={activo ? 'btx-bar' : ''}
          style={{
            width: 2,
            flex: '0 0 2px',
            borderRadius: 2,
            height: `${Math.round(h * 100)}%`,
            background: activo ? color : '#cbd5e1',
            opacity: activo ? 0.95 : 0.5,
            animationDelay: `${(i % 7) * 90}ms`,
            animationDuration: `${900 + (i % 5) * 140}ms`,
          }}
        />
      ))}
    </div>
  );
}

// ── Estrellas de calidad ───────────────────────────────────────────────────────
function Estrellas({ pct }) {
  if (pct == null) return <span className="text-slate-300 text-[10px] font-bold">—</span>;
  const v = (pct / 100) * 5;
  return (
    <span className="inline-flex items-center gap-0.5" title={`${pct}% de leads con interacción`}>
      {[0,1,2,3,4].map(i => {
        const fill = Math.min(1, Math.max(0, v - i));
        return (
          <span key={i} className="relative text-[12px] leading-none text-slate-200">
            ★
            <span className="absolute left-0 top-0 overflow-hidden text-amber-400"
              style={{ width: `${fill*100}%` }}>★</span>
          </span>
        );
      })}
      <span className="ml-1 text-[10px] font-black text-slate-600">{(v).toFixed(1)}</span>
    </span>
  );
}

// ── Tooltip recharts ───────────────────────────────────────────────────────────
function ChartTip({ active, payload, label }) {
  if(!active||!payload?.length) return null;
  return (
    <div className="bg-white rounded-xl shadow-xl border border-slate-100 p-3 text-[10px]">
      <div className="font-black text-slate-700 mb-1">{label}</div>
      {payload.map(p=>(
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{background:p.color}}/>
          <span className="text-slate-500">{p.name==='leads'?'Leads':'Interacc.'}:</span>
          <span className="font-black" style={{color:p.color}}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon, color, small=false }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col gap-1"
      style={{ borderTop: `3px solid ${color}` }}>
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-tight">{label}</span>
        <span className="text-base">{icon}</span>
      </div>
      <div className={`font-black leading-none ${small?'text-2xl':'text-3xl'}`} style={{color}}>{value}</div>
    </div>
  );
}

// ── Píldora KPI del monitor (estilo contact-center) ────────────────────────────
function PildoraCC({ cfg, valor, activa, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activa}
      className={`flex items-center gap-2.5 rounded-2xl border px-4 py-2 bg-white transition-all
        ${activa ? 'shadow-md ring-2' : 'hover:shadow-sm'}`}
      style={activa ? { borderColor: cfg.color, '--tw-ring-color': cfg.ring } : { borderColor: '#e2e8f0' }}
    >
      <span className="w-8 h-8 rounded-xl flex items-center justify-center text-[14px] shrink-0"
        style={{ background: cfg.bg }}>{cfg.icon}</span>
      <span className="text-left leading-tight">
        <span className="block text-[8px] font-black uppercase tracking-widest" style={{ color: cfg.color }}>{cfg.kpi}</span>
        <span className="block text-[19px] font-black text-slate-800 leading-none">{valor}</span>
      </span>
    </button>
  );
}

// ── Tarjeta de asesor ──────────────────────────────────────────────────────────
function TarjetaAsesor({ a, now, seleccionado, onSelect, fav, onFav, compacta }) {
  const cfg   = CC[a.cc];
  const emp   = EMP[a.cuenta] || EMP.NOVONET;
  const met   = metricaPrincipal(a);
  const vivo  = a.cc === 'llamada' || a.cc === 'chat';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(a)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(a); } }}
      className={`text-left bg-white rounded-2xl border transition-all cursor-pointer hover:shadow-md
        ${compacta ? 'p-3' : 'p-4'} ${seleccionado ? 'shadow-md ring-2' : 'border-slate-200'}`}
      style={seleccionado
        ? { borderColor: cfg.color, '--tw-ring-color': cfg.ring }
        : { borderLeft: `3px solid ${cfg.color}` }}
    >
      {/* Cabecera: avatar + nombre + estado */}
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <div className={`${compacta ? 'w-9 h-9 text-[10px]' : 'w-11 h-11 text-[12px]'} rounded-xl flex items-center justify-center text-white font-black shadow-sm`}
            style={{ background: emp.grad }}>
            {(a.asesor || '?').slice(0, 2).toUpperCase()}
          </div>
          {vivo && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white animate-pulse"
              style={{ background: cfg.color }}/>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className={`font-black text-slate-800 truncate ${compacta ? 'text-[11px]' : 'text-[12px]'}`} title={a.asesor}>
                {a.asesor}
              </div>
              <div className="text-[8px] font-bold uppercase tracking-widest" style={{ color: emp.color }}>
                {emp.label}
              </div>
            </div>
            <span className={`shrink-0 text-[8px] font-black px-2 py-0.5 rounded-full border ${cfg.chip}`}>
              {cfg.icon} {cfg.label}
            </span>
          </div>
        </div>
      </div>

      {/* Cronómetro + waveform */}
      <div className="flex items-center gap-2.5 mt-3">
        <span className="text-[11px] font-black tabular-nums shrink-0" style={{ color: cfg.color }}>
          {cfg.icon === '📞' ? '📞' : cfg.icon === '💬' ? '💬' : '🕐'} {fmtCrono(now - a.ultimaTs)}
        </span>
        {!compacta && <Waveform activo={vivo} color={cfg.color} seed={`${a.asesor}|${a.cuenta}`}/>}
      </div>

      {/* Métricas */}
      <div className="flex items-end gap-4 mt-3 pt-3 border-t border-slate-100">
        <div>
          <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">{met.label}</div>
          <div className="text-[17px] font-black text-slate-800 leading-none mt-0.5">{met.valor}</div>
        </div>
        <div>
          <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Calidad</div>
          <div className="text-[17px] font-black leading-none mt-0.5"
            style={{ color: a.calidad == null ? '#cbd5e1' : a.calidad >= 60 ? '#10b981' : a.calidad >= 30 ? '#f59e0b' : '#94a3b8' }}>
            {a.calidad == null ? '—' : `${a.calidad}%`}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onFav(a); }}
          className="ml-auto text-[16px] leading-none transition-transform active:scale-90"
          title={fav ? 'Quitar de destacados' : 'Marcar como destacado'}
          aria-label={fav ? 'Quitar de destacados' : 'Marcar como destacado'}
        >
          <span className={fav ? 'text-amber-400' : 'text-slate-200'}>★</span>
        </button>
      </div>
    </div>
  );
}

// ── Panel lateral de detalle ───────────────────────────────────────────────────
function PanelDetalle({ a, now, onClose }) {
  const cfg = CC[a.cc];
  const emp = EMP[a.cuenta] || EMP.NOVONET;
  const m   = a.ultimoMovimiento;
  const url = m && BITRIX_DEAL_URL[a.cuenta] ? `${BITRIX_DEAL_URL[a.cuenta]}${m.dealId}/` : null;
  const met = metricaPrincipal(a);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <span className="font-black text-[12px] text-slate-800 truncate flex-1">{a.asesor}</span>
        <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border ${cfg.chip} shrink-0`}>
          {cfg.icon} {cfg.label}
        </span>
        <button onClick={onClose} aria-label="Cerrar detalle"
          className="text-slate-300 hover:text-slate-500 text-[14px] leading-none shrink-0">✕</button>
      </div>

      <div className="p-4 space-y-4">
        {/* Avatar + cronómetro */}
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-[15px] shadow-sm shrink-0"
            style={{ background: emp.grad }}>
            {(a.asesor || '?').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Último movimiento</div>
            <div className="text-[20px] font-black tabular-nums leading-none mt-1" style={{ color: cfg.color }}>
              {fmtCrono(now - a.ultimaTs)}
            </div>
            <div className="text-[8px] font-bold text-slate-400 mt-1">{fmtFechaHora(a.ultimaActividad)}</div>
          </div>
        </div>

        <Waveform activo={a.cc === 'llamada' || a.cc === 'chat'} color={cfg.color} seed={`p|${a.asesor}`} n={46}/>

        {/* Información */}
        <div>
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Información</div>
          <dl className="space-y-1.5 text-[10px]">
            {[
              ['Empresa',        emp.label],
              ['Negocio',        m?.negocio || '—'],
              ['Etapa',          m?.etapa || '—'],
              ['Monto',          m ? fmtMonto(m.monto, m.moneda) : '—'],
              ['Última interacción', a.tipoUltima ? `${TIPO_ICON[a.tipoUltima] || '📌'} ${a.tipoUltima}` : 'Sin actividad registrada'],
              [met.label,        String(met.valor)],
              ['Leads en ventana', String(a.totalMovimientos)],
            ].map(([k, v]) => (
              <div key={k} className="flex items-start gap-2">
                <dt className="text-slate-400 font-bold shrink-0 w-[38%]">{k}:</dt>
                <dd className="text-slate-800 font-black truncate flex-1" title={v}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Calidad */}
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-slate-400 font-bold">Evaluación calidad</span>
          <span className="ml-auto"><Estrellas pct={a.calidad}/></span>
        </div>

        {/* Acción real: abrir en Bitrix24 */}
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="block w-full text-center rounded-xl py-2.5 text-[11px] font-black text-white transition-all active:scale-[.98]"
            style={{ background: emp.grad }}>
            ↗ Abrir negociación en Bitrix24
          </a>
        ) : (
          <div className="w-full text-center rounded-xl py-2.5 text-[10px] font-black text-slate-400 bg-slate-50 border border-slate-100">
            Sin negociación asociada
          </div>
        )}
      </div>
    </div>
  );
}

// ── Vista Monitor de Asesores (tarjetas) ───────────────────────────────────────
function MonitorAsesores({ asesores, now, busqueda, vista, filtroCC, setFiltroCC }) {
  const [sel,  setSel]  = useState(null);
  const [favs, setFavs] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch { return new Set(); }
  });

  const favKey  = (a) => `${a.asesor}||${a.cuenta}`;
  const toggleFav = (a) => {
    setFavs(prev => {
      const n = new Set(prev);
      const k = favKey(a);
      n.has(k) ? n.delete(k) : n.add(k);
      try { localStorage.setItem(FAV_KEY, JSON.stringify([...n])); }
      catch { /* sin localStorage el destacado sigue funcionando en memoria */ }
      return n;
    });
  };

  const conteos = useMemo(() => {
    const c = { llamada:0, chat:0, espera:0, disponible:0 };
    for (const a of asesores) c[a.cc]++;
    return c;
  }, [asesores]);

  const visibles = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    return asesores
      .filter(a => !filtroCC || a.cc === filtroCC)
      .filter(a => !term || a.asesor.toLowerCase().includes(term))
      .sort((a, b) => {
        const fa = favs.has(favKey(a)) ? 0 : 1;
        const fb = favs.has(favKey(b)) ? 0 : 1;
        if (fa !== fb) return fa - fb;
        const oa = CC_ORDEN.indexOf(a.cc), ob = CC_ORDEN.indexOf(b.cc);
        if (oa !== ob) return oa - ob;
        return b.totalMovimientos - a.totalMovimientos;
      });
  }, [asesores, busqueda, filtroCC, favs]);

  // Mantener sincronizado el panel con los datos frescos tras cada refresco
  const selVivo = useMemo(
    () => (sel ? asesores.find(a => a.asesor === sel.asesor && a.cuenta === sel.cuenta) || null : null),
    [sel, asesores]
  );

  const compacta = vista === 'compacta';
  const grid = compacta
    ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5'
    : 'sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div className="space-y-4">
      {/* Píldoras KPI — también sirven de filtro */}
      <div className="flex flex-wrap items-center gap-2.5">
        {CC_ORDEN.map(k => (
          <PildoraCC key={k} cfg={CC[k]} valor={conteos[k]}
            activa={filtroCC === k}
            onClick={() => setFiltroCC(filtroCC === k ? null : k)}/>
        ))}
        {filtroCC && (
          <button onClick={() => setFiltroCC(null)}
            className="text-[9px] font-black text-slate-400 hover:text-slate-600 underline underline-offset-2">
            limpiar filtro
          </button>
        )}
      </div>

      <div className={`grid gap-4 ${selVivo ? 'xl:grid-cols-[minmax(0,1fr)_330px]' : ''}`}>
        <div className={`grid gap-3 ${grid} content-start`}>
          {visibles.length === 0 && (
            <div className="col-span-full text-center py-14 text-slate-400">
              <div className="text-3xl mb-2">🔍</div>
              <div className="text-[11px] font-black uppercase">Sin asesores para este filtro</div>
            </div>
          )}
          {visibles.map(a => (
            <TarjetaAsesor
              key={`${a.asesor}||${a.cuenta}`}
              a={a}
              now={now}
              compacta={compacta}
              seleccionado={selVivo?.asesor === a.asesor && selVivo?.cuenta === a.cuenta}
              onSelect={(x) => setSel(prev =>
                prev && prev.asesor === x.asesor && prev.cuenta === x.cuenta ? null : { asesor: x.asesor, cuenta: x.cuenta })}
              fav={favs.has(favKey(a))}
              onFav={toggleFav}
            />
          ))}
        </div>

        {selVivo && (
          <aside className="xl:sticky xl:top-4 xl:self-start">
            <PanelDetalle a={selVivo} now={now} onClose={() => setSel(null)}/>
          </aside>
        )}
      </div>
    </div>
  );
}

// ── Lista de negociaciones individuales (detalle por lead/negocio) ─────────────
function ListaNegociaciones({ movimientos, emp, cfg }) {
  const [q, setQ] = useState('');
  const [soloConActividad, setSoloConActividad] = useState(false);

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (movimientos || []).filter(m => {
      if (soloConActividad && !m.actividad) return false;
      if (!term) return true;
      return (m.negocio || '').toLowerCase().includes(term) || (m.etapa || '').toLowerCase().includes(term);
    });
  }, [movimientos, q, soloConActividad]);

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: cfg.dark }}>
          🗂️ Negociaciones ({filtradas.length}/{movimientos.length})
        </div>
        <input
          value={q} onChange={e=>setQ(e.target.value)}
          placeholder="🔍 Buscar por negocio o etapa..."
          aria-label="Buscar negociación"
          className="ml-auto text-[9px] border rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2"
          style={{ borderColor: cfg.border, width: 180, '--tw-ring-color': cfg.border }}
        />
        <button
          onClick={()=>setSoloConActividad(v=>!v)}
          className="text-[8px] font-bold px-2 py-1 rounded-lg border"
          style={{
            borderColor: soloConActividad ? cfg.color : cfg.border,
            background: soloConActividad ? cfg.color : '#fff',
            color: soloConActividad ? '#fff' : '#64748b',
          }}>
          Con actividad
        </button>
      </div>
      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
        {filtradas.length === 0 && (
          <p className="text-[9px] text-slate-400 font-bold py-2">Sin negociaciones para este filtro.</p>
        )}
        {filtradas.map(m => {
          const url = BITRIX_DEAL_URL[emp] ? `${BITRIX_DEAL_URL[emp]}${m.dealId}/` : null;
          return (
            <div key={m.dealId} className="bg-white rounded-lg border px-3 py-2 text-[9px]" style={{ borderColor: cfg.border }}>
              <div className="flex items-center gap-2">
                <span className="font-black text-slate-800 truncate flex-1" title={m.negocio}>{m.negocio}</span>
                <span className="font-bold px-1.5 py-0.5 rounded-full text-white shrink-0" style={{ background: cfg.color, fontSize: 8 }}>
                  {m.etapa}
                </span>
                {url && (
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="text-[8px] font-bold shrink-0" style={{ color: cfg.dark }}
                    title="Abrir en Bitrix24">↗ Bitrix</a>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-slate-500 font-bold">
                <span>💰 {fmtMonto(m.monto, m.moneda)}</span>
                <span>🕐 {fmtFechaHora(m.fecha)}</span>
                {m.actividad && (
                  <span className="ml-auto flex items-center gap-1 text-white font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: TIPO_COLOR[m.actividad.tipo] || '#64748b', fontSize: 8 }}
                    title={m.actividad.descripcion || ''}>
                    {TIPO_ICON[m.actividad.tipo] || '📌'} {m.actividad.tipo}
                    {m.actividad.direccion ? ` · ${m.actividad.direccion}` : ''}
                    {m.actividad.durMinutos ? ` · ${m.actividad.durMinutos}` : ''}
                  </span>
                )}
              </div>
              {m.actividad?.asunto && (
                <div className="mt-1 text-slate-400 truncate" title={m.actividad.asunto}>📝 {m.actividad.asunto}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Detalle horario del asesor ─────────────────────────────────────────────────
function DetalleHorario({ asesor, emp, horas }) {
  const hourly = useMemo(() => compAsesorHourly(asesor.movimientos, horas).filter(b=>b.leads>0), [asesor, horas]);
  const cfg = EMP[emp] || EMP.NOVONET;
  return (
    <div className="px-4 py-4 border-t" style={{ background: cfg.light, borderColor: cfg.border }}>
      <div className="text-[9px] font-black uppercase tracking-widest mb-3" style={{ color: cfg.dark }}>
        📊 Desglose horario · {asesor.asesor}
      </div>
      {hourly.length === 0
        ? <p className="text-[9px] text-slate-400 font-bold">Sin actividad en el periodo</p>
        : (
        <>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={hourly} barGap={2} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke={cfg.border} vertical={false}/>
              <XAxis dataKey="label" tick={{fontSize:8,fill:cfg.color,fontWeight:'bold'}} axisLine={false} tickLine={false}/>
              <YAxis allowDecimals={false} tick={{fontSize:8,fill:cfg.color}} axisLine={false} tickLine={false} width={16}/>
              <Tooltip content={<ChartTip/>}/>
              <Bar dataKey="leads" name="leads" fill={cfg.color} radius={[3,3,0,0]} maxBarSize={22}/>
              <Bar dataKey="interacciones" name="interacciones" fill="#10b981" radius={[3,3,0,0]} maxBarSize={22}/>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
            {hourly.map((b,i)=>(
              <div key={i} className="flex items-center gap-3 text-[9px] bg-white rounded-lg px-3 py-1.5 border" style={{borderColor:cfg.border}}>
                <span className="font-black w-12" style={{color:cfg.dark}}>{b.label}</span>
                <span className="font-bold text-slate-700">Leads: <b style={{color:cfg.color}}>{b.leads}</b></span>
                <span className="font-bold text-slate-700">Int: <b className="text-emerald-600">{b.interacciones}</b></span>
                <div className="flex gap-1 flex-wrap ml-auto">
                  {Object.entries(b.tipos).map(([t,c])=>(
                    <span key={t} className="text-[7px] font-bold px-1.5 py-0.5 rounded-full text-white"
                      style={{background:TIPO_COLOR[t]||'#64748b'}}>
                      {TIPO_ICON[t]||'📌'} {c}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <ListaNegociaciones movimientos={asesor.movimientos} emp={emp} cfg={cfg} />
    </div>
  );
}

// ── Tabla de empresa ───────────────────────────────────────────────────────────
function TablaEmpresa({ empresa, asesores, horas, busqueda }) {
  const [expandido, setExpandido] = useState(null);
  const cfg = EMP[empresa] || EMP.NOVONET;

  const sorted = useMemo(() =>
    [...asesores]
      .filter(d => !busqueda || d.asesor.toLowerCase().includes(busqueda.toLowerCase()))
      .sort((a,b) => {
        // Activos primero, luego recientes, luego por leads desc
        const ord = {activo:0,reciente:1,inactivo:2};
        const diff = (ord[a.estado]??2)-(ord[b.estado]??2);
        return diff !== 0 ? diff : b.totalMovimientos-a.totalMovimientos;
      }),
  [asesores, busqueda]);

  const stats = useMemo(() => ({
    activos:   asesores.filter(d=>d.estado==='activo').length,
    recientes: asesores.filter(d=>d.estado==='reciente').length,
    leads:     asesores.reduce((a,d)=>a+d.totalMovimientos,0),
    inacts:    asesores.filter(d=>d.estado==='inactivo').length,
  }), [asesores]);

  if (asesores.length === 0) return null;

  return (
    <div className="rounded-2xl overflow-hidden border-2 shadow-sm" style={{ borderColor: cfg.border }}>

      {/* Header empresa */}
      <div className="flex items-center justify-between px-5 py-4" style={{ background: cfg.grad }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white font-black text-[13px]">
            {cfg.short}
          </div>
          <div>
            <h2 className="text-white font-black text-[15px] tracking-wide">{cfg.label}</h2>
            <p className="text-white/70 text-[9px] font-bold">{asesores.length} asesores monitoreados</p>
          </div>
        </div>
        {/* Mini KPIs empresa */}
        <div className="flex gap-3">
          {[
            {label:'Activos',  val:stats.activos,   col:'#6ee7b7'},
            {label:'Recientes',val:stats.recientes, col:'#fcd34d'},
            {label:'Leads',    val:stats.leads,      col:'#fff'},
          ].map(k=>(
            <div key={k.label} className="text-center bg-white/15 rounded-xl px-3 py-1.5">
              <div className="text-[18px] font-black leading-none" style={{color:k.col}}>{k.val}</div>
              <div className="text-[7px] text-white/70 font-bold uppercase">{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Barra de actividad general */}
      <div className="px-5 py-2 flex gap-1 items-center" style={{background:cfg.light}}>
        {sorted.map(d=>(
          <div key={d.asesor} className="flex-1 h-1.5 rounded-full" title={`${d.asesor}: ${d.totalMovimientos} leads`}
            style={{background: d.estado==='activo'?cfg.color: d.estado==='reciente'?'#f59e0b':'#e2e8f0',
              opacity: d.totalMovimientos>0?1:.3}}/>
        ))}
      </div>

      {/* Encabezado tabla */}
      <div className="grid px-5 py-2.5 border-b text-[9px] font-black text-slate-400 uppercase tracking-widest"
        style={{gridTemplateColumns:'2fr 80px 80px 80px 90px 110px 26px', background:'#f8fafc', borderColor: cfg.border}}>
        <span>Asesor</span>
        <span className="text-center">Estado</span>
        <span className="text-center">Leads</span>
        <span className="text-center">Interacc.</span>
        <span className="text-center">Hora Pico</span>
        <span className="text-center">Actividad</span>
        <span/>
      </div>

      {/* Filas */}
      <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
        {sorted.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-[10px] font-bold">
            Sin resultados para "{busqueda}"
          </div>
        )}
        {sorted.map((d) => {
          const ec      = ESTADO[d.estado] || ESTADO.inactivo;
          const key     = `${d.asesor}||${empresa}`;
          const isExp   = expandido === key;
          const tipos   = countTipos(d.movimientos||[]);
          const topT    = Object.entries(tipos).sort((a,b)=>b[1]-a[1]).slice(0,3);
          const totalInt= (d.movimientos||[]).filter(m=>m.actividad).length;
          const peak    = peakHour(d.movimientos||[], horas);
          const isActive= d.estado==='activo';

          return (
            <div key={key}>
              {/* Fila principal */}
              <div
                className={`grid px-5 py-3 items-center cursor-pointer transition-all hover:bg-slate-50 ${isExp?'bg-blue-50/30':''}`}
                style={{gridTemplateColumns:'2fr 80px 80px 80px 90px 110px 26px'}}
                onClick={() => setExpandido(isExp ? null : key)}
              >
                {/* Asesor */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[10px] font-black shadow-sm"
                      style={{background: cfg.grad}}>
                      {(d.asesor||'?').slice(0,2).toUpperCase()}
                    </div>
                    {isActive && (
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white animate-pulse"/>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-black text-slate-800 truncate">{d.asesor}</div>
                    <div className="text-[8px] text-slate-400 font-bold">{tiempoAtras(d.minutosAtras)} atrás</div>
                  </div>
                </div>

                {/* Estado */}
                <div className="text-center">
                  <span className={`text-[8px] font-black px-2 py-1 rounded-lg ${ec.badge}`}>
                    {ec.label}
                  </span>
                </div>

                {/* Leads */}
                <div className="text-center">
                  <span className="text-[20px] font-black leading-none" style={{color:cfg.color}}>
                    {d.totalMovimientos}
                  </span>
                </div>

                {/* Interacciones */}
                <div className="text-center">
                  <div className="text-[18px] font-black text-emerald-600">{totalInt}</div>
                  {d.totalMovimientos > 0 && (
                    <div className="text-[7px] text-slate-400">
                      {Math.round((totalInt/d.totalMovimientos)*100)}%
                    </div>
                  )}
                </div>

                {/* Hora pico */}
                <div className="text-center">
                  <div className="text-[12px] font-black text-slate-700">{peak.label}</div>
                  {peak.count > 0 && <div className="text-[7px] text-slate-400">{peak.count} leads</div>}
                </div>

                {/* Tipos actividad */}
                <div className="flex gap-1 justify-center flex-wrap">
                  {topT.length === 0
                    ? <span className="text-[8px] text-slate-300 italic">—</span>
                    : topT.map(([t,c])=>(
                      <span key={t} className="text-[7px] font-bold px-1.5 py-0.5 rounded-full text-white"
                        style={{background:TIPO_COLOR[t]||'#64748b'}}>
                        {TIPO_ICON[t]||'📌'} {c}
                      </span>
                    ))
                  }
                </div>

                {/* Expand toggle */}
                <div className="text-[9px] text-slate-300 text-right">{isExp?'▲':'▼'}</div>
              </div>

              {/* Detalle expandido */}
              {isExp && (
                <DetalleHorario asesor={d} emp={empresa} horas={horas}/>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Gráfica global por hora ────────────────────────────────────────────────────
function GraficaGlobal({ empresa, asesores, horas }) {
  const cfg     = EMP[empresa] || EMP.NOVONET;
  const buckets = useMemo(() => compHourlyBuckets(asesores, horas).filter(b=>b.leads>0), [asesores, horas]);
  return (
    <div className="rounded-2xl border-2 overflow-hidden shadow-sm" style={{borderColor:cfg.border}}>
      <div className="px-4 py-3 flex items-center gap-2" style={{background:cfg.grad}}>
        <span className="text-white font-black text-[11px] uppercase tracking-wide">{cfg.label} · Actividad por Hora</span>
        <span className="text-white/60 text-[9px] ml-auto">últimas {horas}h</span>
      </div>
      <div className="p-4 bg-white">
        {buckets.length > 0
          ? (
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={buckets} barGap={2} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                <XAxis dataKey="label" tick={{fontSize:8,fontWeight:'bold',fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                <YAxis allowDecimals={false} tick={{fontSize:8,fill:'#94a3b8'}} axisLine={false} tickLine={false} width={18}/>
                <Tooltip content={<ChartTip/>}/>
                <Bar dataKey="leads" name="leads" fill={cfg.color} radius={[4,4,0,0]} maxBarSize={28}/>
                <Bar dataKey="interacciones" name="interacciones" fill="#10b981" radius={[4,4,0,0]} maxBarSize={28}/>
              </BarChart>
            </ResponsiveContainer>
          )
          : <div className="h-[150px] flex items-center justify-center text-slate-300 text-[10px] font-black">Sin actividad</div>
        }
      </div>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────
function ActividadCRM() {
  // Hidratación instantánea: el primer render ya sale con los datos cacheados.
  const HORAS_INI = 48;                               // histórico completo por defecto
  const [data,      setData]      = useState(() => bootSnapshot(HORAS_INI)?.data || []);
  const [loading,   setLoading]   = useState(() => !bootSnapshot(HORAS_INI));  // SOLO primera carga sin caché
  const [lastSync,  setLastSync]  = useState(() => {
    const c = bootSnapshot(HORAS_INI); return c ? new Date(c.ts) : null;
  });
  const [refreshing,setRefreshing]= useState(false);  // refresco de fondo, no bloquea la vista
  const [error,     setError]     = useState(null);   // error duro (sin datos que mostrar)
  const [aviso,     setAviso]     = useState(null);   // fallo de refresco con datos en pantalla
  const [horas,     setHoras]     = useState(HORAS_INI);
  const [busqueda,  setBusqueda]  = useState('');
  const [countdown, setCountdown] = useState(REFRESH_SECS);
  const [tab,       setTab]       = useState('tarjetas');  // vista por defecto: Monitor de Asesores
  const [vista,     setVista]     = useState('tarjetas');  // densidad de las tarjetas
  const [filtroCC,  setFiltroCC]  = useState(null);
  const [empresaFiltro, setEmpresaFiltro] = useState('TODOS');
  const [now,       setNow]       = useState(() => Date.now());
  const [fs,        setFs]        = useState(false);

  const abortRef = useRef(null);
  const dataRef  = useRef(data);
  const wrapRef  = useRef(null);
  const fetchRef = useRef(null);
  const secsRef  = useRef(REFRESH_SECS);

  // Perfil del usuario logueado
  const userRaw = localStorage.getItem("user") || localStorage.getItem("userProfile") || "{}";
  const user    = useMemo(() => { try { return JSON.parse(userRaw); } catch { return {}; } }, [userRaw]);
  const empresaUsuario = getEmpresaFromUser(user);
  const esAdmin = empresaUsuario === 'TODOS';

  // ── Fetch con refresco silencioso ───────────────────────────────────────────
  // silent=true → NUNCA vacía la pantalla ni muestra el esqueleto.
  const fetchData = useCallback(async ({ silent = true } = {}) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const h = horas;

    if (silent) setRefreshing(true); else setLoading(true);

    try {
      const r = await fetch(`${API}/api/bitrix/live-actividad?horas=${h}`, { signal: ctrl.signal });
      const j = await r.json();
      if (ctrl.signal.aborted) return;

      if (j.success) {
        setData(j.data || []);
        setLastSync(new Date());
        setError(null);
        setAviso(null);
        writeCache(h, j.data || []);
      } else if (dataRef.current.length) {
        setAviso(j.error || 'No se pudo actualizar');   // conservamos lo que ya se ve
      } else {
        setError(j.error || 'No se pudo cargar la actividad');
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (dataRef.current.length) setAviso(e.message);  // datos viejos > pantalla en blanco
      else setError(e.message);
    } finally {
      if (!ctrl.signal.aborted) { setLoading(false); setRefreshing(false); }
    }
  }, [horas]);

  // Espejos en refs para que los timers e intervalos siempre usen la versión
  // vigente sin tener que recrearse. Declarados ANTES del efecto que los usa.
  useEffect(() => { fetchRef.current = fetchData; }, [fetchData]);
  useEffect(() => { dataRef.current  = data; },     [data]);

  const reiniciarCuenta = useCallback(() => {
    secsRef.current = REFRESH_SECS;
    setCountdown(REFRESH_SECS);
  }, []);

  // Cambio de ventana horaria: se hidrata desde caché en el propio handler, así
  // el cambio es instantáneo y `data` nunca queda vacío (cero parpadeo).
  const cambiarHoras = useCallback((h) => {
    if (h === horas) return;
    const c = readCache(h);
    if (c) { setData(c.data); setLastSync(new Date(c.ts)); setLoading(false); }
    reiniciarCuenta();
    setHoras(h);        // el efecto de abajo dispara la revalidación silenciosa
  }, [horas, reiniciarCuenta]);

  // Revalidación al montar y en cada cambio de ventana. Siempre silenciosa: el
  // esqueleto solo aparece porque `loading` ya venía en true al no haber caché.
  useEffect(() => { fetchRef.current?.({ silent: true }); }, [horas]);

  // Reloj de 1 s: alimenta cronómetros y countdown. Se pausa si la pestaña no
  // está visible, para no gastar peticiones con el módulo en segundo plano.
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      if (document.hidden) return;
      secsRef.current -= 1;
      if (secsRef.current <= 0) {
        secsRef.current = REFRESH_SECS;
        fetchRef.current?.({ silent: true });   // auto-refresco: nunca vacía la vista
      }
      setCountdown(secsRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Al volver a la pestaña, revalidar en silencio
  useEffect(() => {
    const onVis = () => { if (!document.hidden) fetchData({ silent: true }); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [fetchData]);

  // Cancelar cualquier petición en vuelo al desmontar
  useEffect(() => () => abortRef.current?.abort(), []);

  // Pantalla completa
  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else wrapRef.current?.requestFullscreen?.();
  };

  // ── Derivados ───────────────────────────────────────────────────────────────
  const dataFiltrada = useMemo(() =>
    empresaUsuario === 'TODOS' ? data : data.filter(d => d.cuenta === empresaUsuario),
  [data, empresaUsuario]);

  const novonet = useMemo(() => dataFiltrada.filter(d=>d.cuenta==='NOVONET'), [dataFiltrada]);
  const velsa   = useMemo(() => dataFiltrada.filter(d=>d.cuenta==='VELSA'),   [dataFiltrada]);

  // Un asesor con perfil de una sola empresa siempre ve solo la suya.
  // Un admin (empresaUsuario==='TODOS') puede acotar la vista con el chip de filtro.
  const mostrar = useCallback((emp) =>
    empresaUsuario === emp ||
    (empresaUsuario === 'TODOS' && (empresaFiltro === 'TODOS' || empresaFiltro === emp)),
  [empresaUsuario, empresaFiltro]);

  // Derivación pesada: solo se recalcula al llegar datos nuevos o al cruzar la
  // medianoche. Los cronómetros se refrescan aparte con la prop `now` de cada
  // tarjeta, para no re-derivar todo el árbol cada segundo.
  const iniHoyTs = new Date(now).setHours(0, 0, 0, 0);  // solo cambia a medianoche

  const asesoresCC = useMemo(() =>
    dataFiltrada
      .filter(d => mostrar(d.cuenta))
      .map(d => deriveAsesorCC(d, iniHoyTs)),
  [dataFiltrada, iniHoyTs, mostrar]);

  const statsGlobales = useMemo(() => ({
    activos:   dataFiltrada.filter(d=>d.estado==='activo').length,
    recientes: dataFiltrada.filter(d=>d.estado==='reciente').length,
    total:     dataFiltrada.length,
    leads:     dataFiltrada.reduce((a,d)=>a+d.totalMovimientos,0),
  }), [dataFiltrada]);

  const btnTab = (key) =>
    `px-4 py-2 rounded-lg text-[10px] font-black transition-all ${
      tab===key ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'
    }`;

  const btnH = (h) =>
    `px-3 py-1.5 rounded-lg text-[9px] font-black transition-all ${
      horas===h ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'
    }`;

  const btnEmpresa = (key) =>
    `px-3 py-1.5 rounded-lg text-[10px] font-black transition-all flex items-center gap-1.5 ${
      empresaFiltro===key ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200 bg-white'
    }`;

  // Esqueleto SOLO si nunca hubo datos. Con caché esto no se ve nunca.
  const mostrarEsqueleto = loading && data.length === 0;
  const hayDatos = data.length > 0;

  return (
    <div ref={wrapRef}
      className={`p-4 sm:p-6 max-w-7xl mx-auto space-y-5 ${fs ? 'bg-slate-50 max-w-none min-h-screen overflow-auto' : ''}`}>

      {/* Animaciones locales del monitor */}
      <style>{`
        @keyframes btxWave { 0%,100% { transform: scaleY(.32) } 50% { transform: scaleY(1) } }
        .btx-bar { transform-origin: center; animation-name: btxWave; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
        @keyframes btxFade { from { opacity: 0; transform: translateY(2px) } to { opacity: 1; transform: none } }
        .btx-in { animation: btxFade .22s ease-out both }
        @media (prefers-reduced-motion: reduce) {
          .btx-bar, .btx-in { animation: none !important }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="bg-slate-900 rounded-2xl px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white font-black text-[13px]">
              BTX
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-white font-black text-[19px] uppercase tracking-tight">
                  Monitor de Asesores
                </h1>
                <span className="flex items-center gap-1 bg-emerald-500/15 border border-emerald-400/30 rounded-full px-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
                  <span className="text-emerald-300 text-[8px] font-black uppercase tracking-widest">En vivo</span>
                </span>
                {refreshing && (
                  <span className="text-slate-400 text-[8px] font-black uppercase tracking-widest animate-pulse">
                    · actualizando
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-0.5">
                Bitrix24
                {esAdmin ? ' · Novonet + Velsa' : ` · ${empresaUsuario}`}
                {lastSync && ` · Última sync ${lastSync.toLocaleTimeString('es-EC',{timeStyle:'short'})}`}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Periodo */}
          <div className="flex flex-col items-start gap-1">
            <span className="text-slate-500 text-[8px] font-black uppercase tracking-widest pl-1">Ventana de datos</span>
            <div className="flex bg-white/10 p-1 rounded-xl gap-0.5">
              {[4,8,24,48].map(h=>(
                <button key={h} onClick={()=>cambiarHoras(h)} className={btnH(h)} title={h===48?'Histórico completo (recomendado)':`Últimas ${h} horas`}>
                  {h}h{h===48?' ★':''}
                </button>
              ))}
            </div>
          </div>
          {/* Countdown */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-slate-500 text-[8px] font-black uppercase tracking-widest">Próx. sync</span>
            <Countdown secs={countdown} total={REFRESH_SECS}/>
          </div>
          {/* Refresh (silencioso: no borra lo que hay en pantalla) */}
          <button onClick={()=>{ reiniciarCuenta(); fetchData({ silent:true }); }}
            className="px-3 py-2.5 rounded-xl text-[10px] font-black uppercase text-white bg-white/10 hover:bg-white/20 active:scale-95 transition-all"
            aria-label="Actualizar ahora">
            {refreshing ? '…' : '⟳ Actualizar'}
          </button>
          {/* Pantalla completa */}
          <button onClick={toggleFs}
            className="px-3 py-2.5 rounded-xl text-[12px] text-white bg-white/10 hover:bg-white/20 active:scale-95 transition-all"
            title={fs ? 'Salir de pantalla completa' : 'Pantalla completa'}
            aria-label={fs ? 'Salir de pantalla completa' : 'Pantalla completa'}>
            {fs ? '⤡' : '⛶'}
          </button>
        </div>
      </div>

      {/* Aviso de refresco fallido — la vista sigue mostrando el último dato bueno */}
      {aviso && hayDatos && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-[10px] font-bold text-amber-700">
          <span>⚠️</span>
          <span>No se pudo actualizar ({aviso}). Mostrando el último dato disponible{lastSync ? ` de las ${lastSync.toLocaleTimeString('es-EC',{timeStyle:'short'})}` : ''}.</span>
          <button onClick={()=>fetchData({silent:true})} className="ml-auto underline underline-offset-2">Reintentar</button>
        </div>
      )}

      {/* ── KPIs globales ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Activos ahora"  value={statsGlobales.activos}   icon="🟢" color="#10b981"/>
        <KpiCard label="Recientes"      value={statsGlobales.recientes} icon="🟡" color="#f59e0b"/>
        <KpiCard label="Total asesores" value={statsGlobales.total}     icon="👥" color="#2563eb"/>
        <KpiCard label="Leads totales"  value={statsGlobales.leads}     icon="📋" color="#7c3aed"/>
      </div>

      {/* ── Filtro por empresa (solo admin/cross) ── */}
      {esAdmin && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">🏢 Empresa:</span>
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
            <button onClick={()=>setEmpresaFiltro('TODOS')} className={btnEmpresa('TODOS')}
              style={empresaFiltro==='TODOS'?{background:'#1e293b'}:{}}>
              Todas
            </button>
            <button onClick={()=>setEmpresaFiltro('NOVONET')} className={btnEmpresa('NOVONET')}
              style={empresaFiltro==='NOVONET'?{background:EMP.NOVONET.grad}:{}}>
              {EMP.NOVONET.icon} Novonet
            </button>
            <button onClick={()=>setEmpresaFiltro('VELSA')} className={btnEmpresa('VELSA')}
              style={empresaFiltro==='VELSA'?{background:EMP.VELSA.grad}:{}}>
              {EMP.VELSA.icon} Velsa
            </button>
          </div>
        </div>
      )}

      {/* ── Búsqueda + tabs + densidad ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5">
          <button className={btnTab('tarjetas')} onClick={()=>setTab('tarjetas')}>🃏 Tarjetas</button>
          <button className={btnTab('tabla')}    onClick={()=>setTab('tabla')}>   📊 Tabla</button>
          <button className={btnTab('graficas')} onClick={()=>setTab('graficas')}>📈 Gráficas</button>
        </div>
        <div className="flex items-center gap-2">
          {tab==='tarjetas' && (
            <label className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Vista:
              <select value={vista} onChange={e=>setVista(e.target.value)}
                className="text-[10px] font-black text-slate-700 border border-slate-200 rounded-xl px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 normal-case tracking-normal">
                <option value="tarjetas">Tarjetas</option>
                <option value="compacta">Compacta</option>
              </select>
            </label>
          )}
          <input
            className="text-[11px] border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-200 w-56 bg-white"
            placeholder="🔍 Buscar asesor..."
            value={busqueda}
            onChange={e=>setBusqueda(e.target.value)}
            aria-label="Buscar asesor"
          />
        </div>
      </div>

      {/* ── Esqueleto: SOLO primer arranque sin caché ── */}
      {mostrarEsqueleto && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_,i)=>(
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 animate-pulse" style={{opacity:1-i*.08}}>
                <div className="flex gap-3">
                  <div className="w-11 h-11 rounded-xl bg-slate-200"/>
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-2.5 bg-slate-200 rounded w-2/3"/>
                    <div className="h-2 bg-slate-100 rounded w-1/3"/>
                  </div>
                </div>
                <div className="h-6 bg-slate-100 rounded mt-4"/>
                <div className="h-6 bg-slate-100 rounded mt-3 w-1/2"/>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Error duro: solo si NO hay nada que mostrar ── */}
      {error && !hayDatos && !mostrarEsqueleto && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <div className="text-3xl mb-3">⚠️</div>
          <div className="text-[12px] font-black text-red-700 uppercase mb-1">{error}</div>
          <div className="text-[9px] text-red-400 mb-4">Error al conectar con Bitrix24</div>
          <button onClick={()=>fetchData({silent:false})}
            className="text-[10px] font-black uppercase px-4 py-2 rounded-xl bg-red-600 text-white active:scale-95 transition-all">
            Reintentar
          </button>
        </div>
      )}

      {/* ── Tab: TARJETAS (Monitor de Asesores) ── */}
      {hayDatos && tab==='tarjetas' && (
        <div className="btx-in">
          <MonitorAsesores
            asesores={asesoresCC}
            now={now}
            busqueda={busqueda}
            vista={vista}
            filtroCC={filtroCC}
            setFiltroCC={setFiltroCC}
          />
        </div>
      )}

      {/* ── Tab: TABLA ── */}
      {hayDatos && tab==='tabla' && (
        <div className="space-y-5 btx-in">
          {mostrar('NOVONET') && (
            <TablaEmpresa empresa="NOVONET" asesores={novonet} horas={horas} busqueda={busqueda}/>
          )}
          {mostrar('VELSA') && (
            <TablaEmpresa empresa="VELSA" asesores={velsa} horas={horas} busqueda={busqueda}/>
          )}
        </div>
      )}

      {/* ── Tab: GRÁFICAS ── */}
      {hayDatos && tab==='graficas' && (
        <div className={`grid gap-5 btx-in ${esAdmin?'lg:grid-cols-2':''}`}>
          {mostrar('NOVONET') && novonet.length>0 && (
            <GraficaGlobal empresa="NOVONET" asesores={novonet} horas={horas}/>
          )}
          {mostrar('VELSA') && velsa.length>0 && (
            <GraficaGlobal empresa="VELSA" asesores={velsa} horas={horas}/>
          )}
        </div>
      )}

      {/* ── Vacío real (respuesta OK pero sin actividad) ── */}
      {!hayDatos && !mostrarEsqueleto && !error && (
        <div className="text-center py-16 text-slate-400">
          <div className="text-4xl mb-3">🔍</div>
          <div className="text-[12px] font-black uppercase">Sin actividad en las últimas {horas}h</div>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="text-center text-[9px] text-slate-400 font-bold uppercase tracking-widest pt-2 leading-relaxed">
        📞 En llamada = actividad de voz &lt; 30 min · 💬 En chat = mensaje/correo &lt; 30 min ·
        ⏳ En espera = movimiento &lt; 2 h · 👤 Disponible = sin movimiento hace más de 2 h
        <br/>
        Calidad = % de leads con interacción registrada · Clic en una tarjeta para ver el detalle · Ventana actual: {horas}h
      </div>
    </div>
  );
}

// ── Envoltorio de submódulos ─────────────────────────────────────────────────
// Bitrix Live agrupa dos miradas al MISMO Bitrix24:
//   · Actividad CRM → qué se está trabajando (deals y actividades)
//   · Sesiones      → quién está conectado, desde cuándo, con qué IP y equipo
const SUBMODULOS = [
  { key: "crm",      label: "Actividad CRM", icon: "📊", soloJefatura: false },
  { key: "sesiones", label: "Sesiones",      icon: "🟢", soloJefatura: true  },
];

const TAB_KEY = "bitrixlive:submodulo:v1";

export default function BitrixLive() {
  const userRaw = localStorage.getItem("user") || localStorage.getItem("userProfile") || "{}";
  const perfil  = useMemo(() => {
    try { return (JSON.parse(userRaw).perfil || "").toUpperCase(); } catch { return ""; }
  }, [userRaw]);

  // Quién está conectado y desde qué IP es información de personal: jefatura.
  // El backend lo vuelve a validar — esto solo evita mostrar una pestaña muerta.
  const esJefatura = ["ADMINISTRADOR", "GERENTE", "SUPERVISOR"].includes(perfil);
  const visibles = SUBMODULOS.filter(m => !m.soloJefatura || esJefatura);

  const [sub, setSub] = useState(() => {
    const guardado = localStorage.getItem(TAB_KEY);
    return visibles.some(m => m.key === guardado) ? guardado : "crm";
  });

  const elegir = (kk) => {
    setSub(kk);
    try { localStorage.setItem(TAB_KEY, kk); } catch { /* modo privado: no es crítico */ }
  };

  // Con un solo submódulo visible la barra de pestañas sobra.
  if (visibles.length < 2) return <ActividadCRM/>;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit mb-4">
        {visibles.map(m => (
          <button key={m.key} onClick={() => elegir(m.key)}
            className={`px-4 py-2 rounded-lg text-[12px] font-black uppercase tracking-wider transition ${
              sub === m.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <span className="mr-1.5">{m.icon}</span>{m.label}
          </button>
        ))}
      </div>

      {sub === "crm" ? <ActividadCRM/> : <BitrixSesiones/>}
    </div>
  );
}
