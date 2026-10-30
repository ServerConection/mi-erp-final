import { useCallback, useEffect, useMemo, useState } from 'react';
import { puedeAccederBolsaLeads } from '../utils/accesoGestionables';

/**
 * BOLSA LEADS — reparte la pauta del pipeline "Bolsa Leads" entre NOVONET y VELSA.
 * Cada lead toma la casilla que toca del ciclo (N = NOVONET, V = VELSA); al
 * terminar el ciclo vuelve a empezar. Luego entra el repartidor de asesores de
 * cada empresa.
 */
const API = import.meta.env.VITE_API_URL || 'http://localhost:3050';
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const hora = (iso) => new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso));
const EMP = {
  novonet: { label: 'NOVONET', letra: 'N', chip: 'bg-blue-600 text-white', suave: 'bg-blue-50 text-blue-700 border-blue-200' },
  velsa: { label: 'VELSA', letra: 'V', chip: 'bg-fuchsia-600 text-white', suave: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200' },
};
const ESTADO = {
  entregado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  omitido: 'bg-slate-100 text-slate-600 border-slate-300',
};

async function api(path, options = {}) {
  const res = await fetch(`${API}/api/bolsa-leads${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || 'No se pudo completar la operación');
  return json;
}

// Mismo cálculo que el backend (shared/bolsaLeadsPatron.js → generarPatron)
function generarPatron(pctNovonet, tamano) {
  const n = Math.max(1, Math.min(50, Math.round(tamano)));
  const cantN = Math.round((n * pctNovonet) / 100), cantV = n - cantN;
  if (!cantV) return 'N'.repeat(n);
  if (!cantN) return 'V'.repeat(n);
  const [menor, mayor, m] = cantV <= cantN ? ['V', 'N', cantV] : ['N', 'V', cantN];
  let out = '';
  for (let i = 1; i <= n; i++) out += Math.floor((i * m) / n + 0.5) > Math.floor(((i - 1) * m) / n + 0.5) ? menor : mayor;
  return out;
}

const Switch = ({ on, onClick, disabled }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${on ? 'bg-emerald-500' : 'bg-slate-300'} disabled:opacity-50`}>
    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${on ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
);

export default function BolsaLeads() {
  const permitido = puedeAccederBolsaLeads();
  const [fecha, setFecha] = useState(hoy);
  const [data, setData] = useState(null);
  const [borrador, setBorrador] = useState('');      // patrón que se está editando
  const [pct, setPct] = useState(60), [tamano, setTamano] = useState(10);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [mensaje, setMensaje] = useState('');
  const [filtro, setFiltro] = useState('todos');

  const cargar = useCallback(async () => {
    try {
      const r = await api(`/estado?fecha=${fecha}`);
      setData(r); setError('');
      setBorrador((b) => b || r.config.patron);
    } catch (e) { setError(e.message); }
  }, [fecha]);
  useEffect(() => { if (permitido) cargar(); }, [cargar, permitido]);
  useEffect(() => {
    if (!permitido) return undefined;
    const t = setInterval(cargar, 30000);
    return () => clearInterval(t);
  }, [cargar, permitido]);

  const guardar = async (body, ok) => {
    setBusy(true); setError(''); setMensaje('');
    try { await api('/config', { method: 'PUT', body: JSON.stringify(body) }); setMensaje(ok); await cargar(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const accion = async (path, body, ok) => {
    setBusy(true); setError(''); setMensaje('');
    try { const r = await api(path, { method: 'POST', body: JSON.stringify(body || {}) }); setMensaje(ok(r.resultado)); await cargar(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const cfg = data?.config;
  const cambioPatron = cfg && borrador !== cfg.patron;
  const resumenBorrador = useMemo(() => {
    const n = [...borrador].filter((c) => c === 'N').length;
    return { n, v: borrador.length - n, pct: borrador.length ? Math.round((n * 100) / borrador.length) : 0 };
  }, [borrador]);
  const res = data?.resumen || { novonet: 0, velsa: 0, errores: 0, omitidos: 0 };
  const total = res.novonet + res.velsa;
  const movimientos = (data?.movimientos || []).filter((m) => filtro === 'todos' || m.estado === filtro || m.empresa === filtro);

  if (!permitido) return <div className="p-8 text-slate-600">Solo el administrador puede usar Bolsa Leads.</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Bolsa Leads</h1>
          <p className="text-sm text-slate-500">Reparte la pauta del pipeline "Bolsa Leads" entre NOVONET y VELSA. Después entra el repartidor de asesores de cada empresa.</p>
        </div>
        {cfg && (
          <div className="flex items-center gap-3 rounded-xl border bg-white px-4 py-2 shadow-sm">
            <span className={`text-sm font-semibold ${cfg.activo ? 'text-emerald-600' : 'text-slate-500'}`}>{cfg.activo ? 'Encendida' : 'Apagada'}</span>
            <Switch on={cfg.activo} disabled={busy}
              onClick={() => guardar({ activo: !cfg.activo }, cfg.activo ? 'Bolsa apagada: los leads se quedan en Bolsa Leads.' : 'Bolsa encendida.')} />
          </div>
        )}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      {mensaje && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{mensaje}</div>}
      {!data && !error && <div className="text-slate-500">Cargando…</div>}

      {cfg && (
        <>
          {/* Modo de entrega */}
          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-semibold text-slate-700">¿A quién se entrega?</h2>
            <div className="flex flex-wrap gap-2">
              {[['proporcion', 'Por proporción (ciclo)'], ['solo_novonet', 'Todo a NOVONET'], ['solo_velsa', 'Todo a VELSA']].map(([k, l]) => (
                <button key={k} type="button" disabled={busy} onClick={() => k !== cfg.modo && guardar({ modo: k }, `Modo cambiado: ${l}.`)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium ${cfg.modo === k ? 'border-slate-800 bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>{l}</button>
              ))}
            </div>
            <label className="mt-4 flex items-center gap-3 text-sm text-slate-700">
              <Switch on={cfg.encadenar_reparto} disabled={busy}
                onClick={() => guardar({ encadenar_reparto: !cfg.encadenar_reparto }, 'Guardado.')} />
              Al entregar, pasar el lead al repartidor de asesores de la empresa
            </label>
          </section>

          {/* Ciclo */}
          <section className={`rounded-2xl border bg-white p-4 shadow-sm ${cfg.modo !== 'proporcion' ? 'opacity-60' : ''}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-700">Ciclo de entrega</h2>
              <span className="text-sm text-slate-500">
                {resumenBorrador.n} NOVONET ({resumenBorrador.pct}%) · {resumenBorrador.v} VELSA ({100 - resumenBorrador.pct}%) · {borrador.length} casillas
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[...borrador].map((c, i) => {
                const e = c === 'N' ? EMP.novonet : EMP.velsa;
                const toca = !cambioPatron && cfg.modo === 'proporcion' && i === cfg.posicion % borrador.length;
                return (
                  <button key={i} type="button" title="Clic para cambiar de empresa"
                    onClick={() => setBorrador(borrador.slice(0, i) + (c === 'N' ? 'V' : 'N') + borrador.slice(i + 1))}
                    className={`flex h-16 w-14 flex-col items-center justify-center rounded-xl text-xs font-semibold ${e.chip} ${toca ? 'ring-4 ring-amber-400 ring-offset-2' : ''}`}>
                    <span className="text-[10px] opacity-80">#{i + 1}</span>
                    <span className="text-lg leading-none">{c}</span>
                    {toca && <span className="mt-0.5 text-[9px]">PRÓXIMO</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-3 text-sm">
              <label className="flex flex-col gap-1">% NOVONET
                <input type="number" min="0" max="100" step="10" value={pct} onChange={(e) => setPct(Number(e.target.value))} className="w-24 rounded-lg border px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">Casillas por ciclo
                <input type="number" min="1" max="50" value={tamano} onChange={(e) => setTamano(Number(e.target.value))} className="w-24 rounded-lg border px-2 py-1.5" />
              </label>
              <button type="button" onClick={() => setBorrador(generarPatron(pct, tamano))} className="rounded-lg border px-3 py-2 hover:bg-slate-50">Generar</button>
              <button type="button" disabled={!cambioPatron || busy} onClick={() => guardar({ patron: borrador }, 'Ciclo guardado. Empieza desde la casilla 1.')}
                className="rounded-lg bg-slate-800 px-4 py-2 font-medium text-white disabled:opacity-40">Guardar ciclo</button>
              {cambioPatron && <button type="button" onClick={() => setBorrador(cfg.patron)} className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-50">Descartar</button>}
              <button type="button" disabled={busy || cambioPatron} onClick={() => guardar({ reiniciar_ciclo: true }, 'Ciclo reiniciado en la casilla 1.')}
                className="rounded-lg border px-3 py-2 hover:bg-slate-50 disabled:opacity-40">Reiniciar ciclo</button>
            </div>
            <p className="mt-2 text-xs text-slate-400">Clic en una casilla para cambiarla entre N y V. Al guardar un ciclo nuevo, empieza desde la casilla 1.</p>
          </section>

          {/* Resumen del día */}
          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-700">Entregas del día</h2>
              <div className="flex items-center gap-2">
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="rounded-lg border px-2 py-1.5 text-sm" />
                <button type="button" onClick={cargar} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50">Actualizar</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ['NOVONET', res.novonet, total ? `${Math.round((res.novonet * 100) / total)}%` : '—', 'text-blue-700'],
                ['VELSA', res.velsa, total ? `${Math.round((res.velsa * 100) / total)}%` : '—', 'text-fuchsia-700'],
                ['Errores', res.errores, 'se pueden reintentar', 'text-red-600'],
                ['Omitidos', res.omitidos, 'bolsa apagada o ya entregados', 'text-slate-600'],
              ].map(([t, v, s, c]) => (
                <div key={t} className="rounded-xl border p-3">
                  <div className="text-xs text-slate-500">{t}</div>
                  <div className={`text-2xl font-bold ${c}`}>{v}</div>
                  <div className="text-xs text-slate-400">{s}</div>
                </div>
              ))}
            </div>
            {data.porHora.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500"><th className="py-1">Hora</th><th>NOVONET</th><th>VELSA</th></tr></thead>
                  <tbody>{data.porHora.map((h) => (
                    <tr key={h.hora} className="border-t"><td className="py-1">{String(h.hora).padStart(2, '0')}:00</td><td>{h.novonet}</td><td>{h.velsa}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <div className="mt-4">
              <button type="button" disabled={busy || !cfg.activo}
                onClick={() => accion('/pendientes', {}, (r) => r.motivo ? r.motivo : `Pendientes entregados: ${r.novonet} NOVONET, ${r.velsa} VELSA${r.errores ? `, ${r.errores} con error` : ''}.`)}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-40">
                Entregar los leads que quedaron en Bolsa Leads
              </button>
              <span className="ml-2 text-xs text-slate-400">(hasta 50 por vez, del más antiguo al más nuevo)</span>
            </div>
          </section>

          {/* Movimientos */}
          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-700">Movimientos</h2>
              <div className="flex flex-wrap gap-1">
                {['todos', 'novonet', 'velsa', 'error', 'omitido'].map((f) => (
                  <button key={f} type="button" onClick={() => setFiltro(f)}
                    className={`rounded-full border px-3 py-1 text-xs capitalize ${filtro === f ? 'border-slate-800 bg-slate-800 text-white' : 'text-slate-600'}`}>{f}</button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-500"><th className="py-1">Hora</th><th>ID Bitrix</th><th>Empresa</th><th>Casilla</th><th>Estado</th><th>Detalle</th><th>Repartidor</th><th /></tr></thead>
                <tbody>
                  {movimientos.map((m) => (
                    <tr key={m.id} className="border-t align-top">
                      <td className="py-1.5 whitespace-nowrap">{hora(m.creado_en)}</td>
                      <td className="font-mono">{m.bitrix_deal_id}</td>
                      <td>{m.empresa ? <span className={`rounded border px-2 py-0.5 text-xs ${EMP[m.empresa].suave}`}>{EMP[m.empresa].label}</span> : '—'}</td>
                      <td>{m.casilla ?? (m.estado === 'entregado' ? 'directo' : '—')}</td>
                      <td><span className={`rounded border px-2 py-0.5 text-xs ${ESTADO[m.estado] || ''}`}>{m.estado}</span></td>
                      <td className="max-w-xs text-xs text-slate-600">{m.detalle}</td>
                      <td className="max-w-xs text-xs text-slate-500">{m.reparto_resultado || '—'}</td>
                      <td>{m.estado === 'error' && (
                        <button type="button" disabled={busy}
                          onClick={() => accion('/reintentar', { deal_id: m.bitrix_deal_id }, (r) => r.estado === 'entregado' ? `Lead ${m.bitrix_deal_id} entregado a ${EMP[r.empresa].label}.` : `Lead ${m.bitrix_deal_id}: ${r.detalle}`)}
                          className="rounded border px-2 py-0.5 text-xs hover:bg-slate-50">Reintentar</button>
                      )}</td>
                    </tr>
                  ))}
                  {!movimientos.length && <tr><td colSpan={8} className="py-6 text-center text-slate-400">Sin movimientos</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {/* Cambios de configuración */}
          {data.eventos.length > 0 && (
            <section className="rounded-2xl border bg-white p-4 text-xs text-slate-500 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-slate-700">Últimos cambios</h2>
              {data.eventos.map((e, i) => (
                <div key={i}>{new Date(e.creado_en).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — {e.usuario}: {e.campo} = {e.valor}</div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
