// src/pages/BitrixLive.jsx
// Actividad Bitrix24 en tiempo real — Vista profesional
// Split NOVONET / VELSA · Restricción por perfil · Tabla + detalle horario

import { useState, useEffect, useCallback, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const API          = import.meta.env.VITE_API_URL || "http://localhost:3050";
const REFRESH_SECS = 90;

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

// ── Countdown SVG ──────────────────────────────────────────────────────────────
function Countdown({ secs, total }) {
  const r=14, circ=2*Math.PI*r, pct=secs/total;
  const col=pct>.3?'#2563eb':'#ef4444';
  return (
    <svg width="38" height="38" viewBox="0 0 38 38">
      <circle cx="19" cy="19" r={r} fill="none" stroke="#e2e8f0" strokeWidth="2.5"/>
      <circle cx="19" cy="19" r={r} fill="none" stroke={col} strokeWidth="2.5"
        strokeDasharray={`${pct*circ} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 19 19)" style={{transition:'stroke-dasharray .9s linear'}}/>
      <text x="19" y="23" textAnchor="middle" fontSize="8" fontWeight="bold" fill={col}>{secs}</text>
    </svg>
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
        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-tight">{label}</span>
        <span className="text-sm">{icon}</span>
      </div>
      <div className={`font-black leading-none ${small?'text-2xl':'text-3xl'}`} style={{color}}>{value}</div>
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
      <div className="grid px-5 py-2.5 border-b text-[8px] font-black text-slate-400 uppercase tracking-widest"
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
        {sorted.map((d, i) => {
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
export default function BitrixLive() {
  const [data,      setData]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [horas,     setHoras]     = useState(8);
  const [busqueda,  setBusqueda]  = useState('');
  const [lastSync,  setLastSync]  = useState(null);
  const [countdown, setCountdown] = useState(REFRESH_SECS);
  const [tab,       setTab]       = useState('tabla');

  // Perfil del usuario logueado
  const userRaw = localStorage.getItem("user") || localStorage.getItem("userProfile") || "{}";
  const user    = (() => { try { return JSON.parse(userRaw); } catch { return {}; } })();
  const empresaUsuario = getEmpresaFromUser(user);
  const esAdmin = empresaUsuario === 'TODOS';

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const r = await fetch(`${API}/api/bitrix/live-actividad?horas=${horas}`);
      const j = await r.json();
      if (j.success) { setData(j.data||[]); setLastSync(new Date()); }
      else setError(j.error);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, [horas]);

  useEffect(() => { setLoading(true); setCountdown(REFRESH_SECS); fetchData(); }, [fetchData]);

  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { fetchData(); return REFRESH_SECS; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [fetchData]);

  // Filtrar por empresa del perfil
  const dataFiltrada = useMemo(() =>
    empresaUsuario === 'TODOS' ? data : data.filter(d => d.cuenta === empresaUsuario),
  [data, empresaUsuario]);

  const novonet = useMemo(() => dataFiltrada.filter(d=>d.cuenta==='NOVONET'), [dataFiltrada]);
  const velsa   = useMemo(() => dataFiltrada.filter(d=>d.cuenta==='VELSA'),   [dataFiltrada]);

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

  const mostrar = (emp) => empresaUsuario==='TODOS' || empresaUsuario===emp;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="bg-slate-900 rounded-2xl px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white font-black text-[13px]">
              BTX
            </div>
            <div>
              <h1 className="text-white font-black text-[18px] uppercase tracking-tight">
                Actividad en Tiempo Real
              </h1>
              <p className="text-slate-400 text-[9px] font-bold uppercase tracking-widest">
                Bitrix24
                {esAdmin ? ' · Novonet + Velsa' : ` · ${empresaUsuario}`}
                {lastSync && ` · Sync ${lastSync.toLocaleTimeString('es-EC',{timeStyle:'short'})}`}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Periodo */}
          <div className="flex bg-white/10 p-1 rounded-xl gap-0.5">
            {[4,8,24,48].map(h=>(
              <button key={h} onClick={()=>setHoras(h)} className={btnH(h)}>{h}h</button>
            ))}
          </div>
          {/* Countdown */}
          <Countdown secs={countdown} total={REFRESH_SECS}/>
          {/* Refresh */}
          <button onClick={()=>{setLoading(true);setCountdown(REFRESH_SECS);fetchData();}}
            className="px-3 py-2 rounded-xl text-[9px] font-black uppercase text-white bg-white/10 hover:bg-white/20 transition-all">
            {loading?'…':'⟳ Refresh'}
          </button>
        </div>
      </div>

      {/* ── KPIs globales ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Activos ahora"  value={statsGlobales.activos}   icon="🟢" color="#10b981"/>
        <KpiCard label="Recientes"      value={statsGlobales.recientes} icon="🟡" color="#f59e0b"/>
        <KpiCard label="Total asesores" value={statsGlobales.total}     icon="👥" color="#2563eb"/>
        <KpiCard label="Leads totales"  value={statsGlobales.leads}     icon="📋" color="#7c3aed"/>
      </div>

      {/* ── Búsqueda + tabs ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5">
          <button className={btnTab('tabla')}   onClick={()=>setTab('tabla')}>   📊 Tabla</button>
          <button className={btnTab('graficas')} onClick={()=>setTab('graficas')}>📈 Gráficas</button>
        </div>
        <input
          className="text-[10px] border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 w-52 bg-white"
          placeholder="🔍 Buscar asesor..."
          value={busqueda}
          onChange={e=>setBusqueda(e.target.value)}
        />
      </div>

      {/* ── Loading / Error ── */}
      {loading && (
        <div className="space-y-3">
          {[1,2].map(i=>(
            <div key={i} className="rounded-2xl overflow-hidden border-2 border-slate-200">
              <div className="h-14 bg-slate-200 animate-pulse"/>
              <div className="divide-y divide-slate-100">
                {[...Array(4)].map((_,j)=>(
                  <div key={j} className="h-14 bg-white animate-pulse" style={{opacity:.6-j*.1}}/>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <div className="text-3xl mb-3">⚠️</div>
          <div className="text-[12px] font-black text-red-700 uppercase mb-1">{error}</div>
          <div className="text-[9px] text-red-400">Error al conectar con Bitrix24</div>
        </div>
      )}

      {/* ── Tab: TABLA ── */}
      {!loading && !error && tab==='tabla' && (
        <div className="space-y-5">
          {mostrar('NOVONET') && (
            <TablaEmpresa empresa="NOVONET" asesores={novonet} horas={horas} busqueda={busqueda}/>
          )}
          {mostrar('VELSA') && (
            <TablaEmpresa empresa="VELSA" asesores={velsa} horas={horas} busqueda={busqueda}/>
          )}
          {dataFiltrada.length===0 && (
            <div className="text-center py-16 text-slate-400">
              <div className="text-4xl mb-3">🔍</div>
              <div className="text-[12px] font-black uppercase">Sin actividad en las últimas {horas}h</div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: GRÁFICAS ── */}
      {!loading && !error && tab==='graficas' && (
        <div className={`grid gap-5 ${esAdmin?'lg:grid-cols-2':''}`}>
          {mostrar('NOVONET') && novonet.length>0 && (
            <GraficaGlobal empresa="NOVONET" asesores={novonet} horas={horas}/>
          )}
          {mostrar('VELSA') && velsa.length>0 && (
            <GraficaGlobal empresa="VELSA" asesores={velsa} horas={horas}/>
          )}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="text-center text-[8px] text-slate-300 font-bold uppercase tracking-widest pt-2">
        🟢 Activo = últimos 30 min · 🟡 Reciente = 30–120 min · ⚪ Inactivo = más de 2h
        · Clic en una fila para ver detalle horario
      </div>
    </div>
  );
}
