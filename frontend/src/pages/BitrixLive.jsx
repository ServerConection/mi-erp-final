import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3050";

const ESTADO_CFG = {
  activo:   { color: '#10b981', bg: '#ecfdf5', label: '🟢 ACTIVO',   ring: '#6ee7b7' },
  reciente: { color: '#f59e0b', bg: '#fffbeb', label: '🟡 RECIENTE', ring: '#fcd34d' },
  inactivo: { color: '#94a3b8', bg: '#f8fafc', label: '⚪ INACTIVO', ring: '#e2e8f0' },
};

const CUENTA_CFG = {
  NOVONET: { grad: 'linear-gradient(135deg,#1d4ed8,#2563eb)', short: 'NOV' },
  VELSA:   { grad: 'linear-gradient(135deg,#ea580c,#c2410c)', short: 'VLS' },
};

function tiempoAtras(min) {
  if (min < 1)   return 'Ahora mismo';
  if (min < 60)  return `Hace ${min} min`;
  if (min < 1440) return `Hace ${Math.floor(min/60)}h ${min%60}m`;
  return `Hace ${Math.floor(min/1440)}d`;
}

function TarjetaAsesor({ d, expandido, onToggle }) {
  const ec = ESTADO_CFG[d.estado] || ESTADO_CFG.inactivo;
  const cc = CUENTA_CFG[d.cuenta] || CUENTA_CFG.NOVONET;
  return (
    <div
      onClick={onToggle}
      className="bg-white rounded-2xl border cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 overflow-hidden"
      style={{ borderColor: expandido ? ec.color : '#e2e8f0', boxShadow: expandido ? `0 0 0 2px ${ec.ring}` : undefined }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[11px] font-black shrink-0 shadow"
          style={{ background: cc.grad }}>
          {(d.asesor || '?').slice(0,2).toUpperCase()}
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-black text-slate-800 uppercase truncate">{d.asesor}</span>
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md text-white shrink-0" style={{ background: cc.grad }}>{cc.short}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] font-bold" style={{ color: ec.color }}>{ec.label}</span>
            <span className="text-[8px] text-slate-400">· {tiempoAtras(d.minutosAtras)}</span>
          </div>
        </div>
        {/* Stats */}
        <div className="text-right shrink-0">
          <div className="text-[18px] font-black text-slate-800 leading-none">{d.totalMovimientos}</div>
          <div className="text-[7px] font-bold text-slate-400 uppercase tracking-wider">movs.</div>
        </div>
      </div>

      {/* Pulse bar */}
      <div className="h-1 w-full" style={{ background: '#f1f5f9' }}>
        <div className="h-1 transition-all duration-700 rounded-r-full"
          style={{
            width: `${Math.min(100, (d.totalMovimientos / 20) * 100)}%`,
            background: ec.color,
          }} />
      </div>

      {/* Expandido */}
      {expandido && (
        <div className="px-4 pb-4 pt-3 space-y-2 animate-in fade-in duration-200">
          <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-2">
            <span>Últimos movimientos</span>
            <span className="text-slate-500">S/ {(d.montoTotal||0).toLocaleString('es-EC', {minimumFractionDigits:0})}</span>
          </div>
          {(d.ultimosMovimientos || []).map((m, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: ec.color }} />
              <div className="flex-1 min-w-0">
                <div className="text-[9px] font-bold text-slate-700 truncate">{m.negocio || '—'}</div>
                <div className="text-[8px] text-slate-400">{m.etapa || '—'}</div>
              </div>
              <div className="text-[8px] font-black text-slate-500 shrink-0">
                {m.monto ? `$${Number(m.monto).toLocaleString()}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BitrixLive() {
  const [data,      setData]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [horas,     setHoras]     = useState(24);
  const [filtro,    setFiltro]    = useState('TODOS');
  const [expandido, setExpandido] = useState(null);
  const [lastSync,  setLastSync]  = useState(null);
  const [cuenta,    setCuenta]    = useState('TODOS');

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const r = await fetch(`${API}/api/bitrix/live-actividad?horas=${horas}`);
      const j = await r.json();
      if (j.success) { setData(j.data || []); setLastSync(new Date()); }
      else setError(j.error);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [horas]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
  useEffect(() => { const t = setInterval(fetchData, 30000); return () => clearInterval(t); }, [fetchData]);

  const filtrado = data.filter(d => {
    if (filtro  !== 'TODOS' && d.estado  !== filtro)  return false;
    if (cuenta  !== 'TODOS' && d.cuenta  !== cuenta)  return false;
    return true;
  });

  const stats = {
    activos:   data.filter(d => d.estado === 'activo').length,
    recientes: data.filter(d => d.estado === 'reciente').length,
    total:     data.length,
    movs:      data.reduce((a,d) => a + d.totalMovimientos, 0),
  };

  const btnCls = (active) =>
    `px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wide transition-all ${active ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2 uppercase tracking-tight">
            <span className="text-white px-2.5 py-1 rounded-lg text-lg font-black shadow-lg"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#5b21b6)' }}>BTX</span>
            Actividad en Tiempo Real
          </h1>
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 ml-0.5">
            Bitrix24 · Novonet + Velsa · Auto-refresh 30s
            {lastSync && <span className="ml-2">· Sync: {lastSync.toLocaleTimeString('es-EC', {timeStyle:'short'})}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Horas selector */}
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
            {[4,8,24,48].map(h => (
              <button key={h} onClick={() => setHoras(h)}
                className={btnCls(horas===h)}
                style={horas===h ? {background:'linear-gradient(135deg,#7c3aed,#5b21b6)'} : {}}>
                {h}h
              </button>
            ))}
          </div>
          <button onClick={() => { setLoading(true); fetchData(); }}
            className="px-4 py-2 rounded-xl text-[9px] font-black uppercase text-white shadow-sm transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#5b21b6)' }}>
            {loading ? '...' : '⟳ Actualizar'}
          </button>
        </div>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label:'Activos ahora',  val: stats.activos,   col:'#10b981', bg:'#ecfdf5' },
          { label:'Recientes',      val: stats.recientes, col:'#f59e0b', bg:'#fffbeb' },
          { label:'Total asesores', val: stats.total,     col:'#7c3aed', bg:'#f5f3ff' },
          { label:'Movimientos',    val: stats.movs,      col:'#2563eb', bg:'#eff6ff' },
        ].map((k,i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-shadow"
            style={{ borderTop:`3px solid ${k.col}` }}>
            <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{k.label}</div>
            <div className="text-3xl font-black leading-none" style={{ color: k.col }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap mb-5 items-center">
        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Estado:</span>
        <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
          {['TODOS','activo','reciente','inactivo'].map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={btnCls(filtro===f)}
              style={filtro===f ? {background: f==='activo'?'#10b981':f==='reciente'?'#f59e0b':f==='inactivo'?'#94a3b8':'linear-gradient(135deg,#7c3aed,#5b21b6)'} : {}}>
              {f==='TODOS'?'Todos':ESTADO_CFG[f]?.label || f}
            </button>
          ))}
        </div>
        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Cuenta:</span>
        <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
          {['TODOS','NOVONET','VELSA'].map(c => (
            <button key={c} onClick={() => setCuenta(c)}
              className={btnCls(cuenta===c)}
              style={cuenta===c ? (c==='NOVONET'?{background:CUENTA_CFG.NOVONET.grad}:c==='VELSA'?{background:CUENTA_CFG.VELSA.grad}:{background:'linear-gradient(135deg,#7c3aed,#5b21b6)'}) : {}}>
              {c==='TODOS'?'Ambas':c}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[8px] text-slate-400 font-bold">{filtrado.length} asesores</span>
      </div>

      {/* Content */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {[...Array(8)].map((_,i) => (
            <div key={i} className="bg-slate-100 rounded-2xl h-24 animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <div className="text-2xl mb-2">⚠️</div>
          <div className="text-[11px] font-black text-red-700 uppercase">{error}</div>
          <div className="text-[9px] text-red-400 mt-1">Verifica que crm_deals y crm_deals_velsa estén sincronizadas</div>
        </div>
      )}

      {!loading && !error && filtrado.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <div className="text-4xl mb-3">🔍</div>
          <div className="text-[11px] font-black uppercase">Sin actividad en las últimas {horas}h</div>
        </div>
      )}

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

      {/* Footer */}
      <div className="mt-8 text-center text-[8px] text-slate-300 font-bold uppercase tracking-widest">
        🟢 Activo = modificado en últimos 30 min · 🟡 Reciente = 30–120 min · ⚪ Inactivo = más de 2h
      </div>
    </div>
  );
}
