// src/pages/RolPagos.jsx
// ============================================================================
// Administración > Rol de Pagos
// Rol de comisiones por asesor y mes, con el mismo formato del Excel
// "FORMATO DE ROL DE COMISIONES": ingresos - descuentos = valor a pagar.
//  - Asegurado, comisión total, asegurado pagado, anticipo 40% y plan celular
//    se calculan solos (desde el módulo Comisiones).
//  - Bono TC, incentivos, chargeback, calidad, adelantos, retención y atrasos
//    se ingresan aquí y se guardan por asesor y mes.
// Abre directo un asesor con ?empresa=NOVONET&mes=2026-10&usuario=lcarlosama
// (así lo llama el botón "Rol de pago" de la Billetera Digital).
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL;
const dinero = (v) => Number(v || 0).toLocaleString('es-EC', { style: 'currency', currency: 'USD' });
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const mesActual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const nombreMes = (mes) => {
  const [y, m] = String(mes).split('-').map(Number);
  if (!y || !m) return '';
  return new Date(y, m - 1, 1).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' }).toUpperCase();
};

function CampoMonto({ concepto, editable, onGuardar }) {
  const [texto, setTexto] = useState(concepto.ajustado ? String(concepto.valor) : '');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { setTexto(concepto.ajustado ? String(concepto.valor) : ''); }, [concepto.valor, concepto.ajustado]);
  const guardar = async () => {
    const original = concepto.ajustado ? String(concepto.valor) : '';
    if (texto.trim() === original) return;
    setGuardando(true);
    await onGuardar(concepto.clave, texto.trim() === '' ? null : texto.trim());
    setGuardando(false);
  };
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-700">{concepto.etiqueta}</div>
        {concepto.automatico && <span className="text-[10px] font-bold uppercase text-blue-600">automático</span>}
        {concepto.auto && concepto.ajustado && <span className="text-[10px] font-bold uppercase text-amber-600">ajustado a mano</span>}
      </div>
      {editable ? (
        <input
          type="number" step="0.01" inputMode="decimal" disabled={guardando}
          value={texto} placeholder={concepto.automatico || !concepto.ajustado ? String(concepto.valor.toFixed(2)) : '0.00'}
          onChange={(e) => setTexto(e.target.value)} onBlur={guardar}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          title={concepto.auto ? 'Vacío = valor automático' : 'Vacío = 0'}
          className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-right text-sm font-bold text-slate-800 placeholder:font-semibold placeholder:text-slate-400 disabled:opacity-50 print:border-0"
        />
      ) : <span className="text-sm font-bold text-slate-800">{dinero(concepto.valor)}</span>}
    </div>
  );
}

function RolAsesor({ rol, mes, editable, onGuardar }) {
  const ingresos = rol.conceptos.filter((c) => c.lado === 'ingreso');
  const descuentos = rol.conceptos.filter((c) => c.lado === 'descuento');
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm print:border-0 print:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-amber-600">Detalle de gestión · {nombreMes(mes)}</p>
          <h2 className="mt-1 text-xl font-black text-slate-900">{rol.nombre_asesor || rol.usuario}</h2>
          <p className="text-xs text-slate-500">Usuario {rol.usuario} · Código {rol.codigo_asesor || '—'}</p>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-bold uppercase text-slate-400">Ventas activas regularizadas</div>
          <div className="text-3xl font-black text-emerald-600">{rol.ventas_activas}</div>
          <div className="text-[11px] text-slate-500">de {rol.activas_totales} activas · tramo {rol.tramo || '—'}{rol.asegurado_aplicado ? ' · con asegurado' : ''}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <div>
          <h3 className="mb-1 text-xs font-black uppercase text-emerald-700">Detalle de pago</h3>
          {ingresos.map((c) => <CampoMonto key={c.clave} concepto={c} editable={editable} onGuardar={onGuardar} />)}
          <div className="mt-2 flex justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800"><span>Total ingresos</span><span>{dinero(rol.total_ingresos)}</span></div>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-black uppercase text-red-700">Descuentos / valores acreditados</h3>
          {descuentos.map((c) => <CampoMonto key={c.clave} concepto={c} editable={editable} onGuardar={onGuardar} />)}
          <div className="mt-2 flex justify-between rounded-lg bg-red-50 px-3 py-2 text-sm font-black text-red-800"><span>Total descuentos</span><span>{dinero(rol.total_descuentos)}</span></div>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between rounded-2xl border-2 border-slate-900 px-5 py-4">
        <span className="text-sm font-black uppercase text-slate-700">Valor a pagar</span>
        <span className={`text-3xl font-black ${rol.valor_a_pagar < 0 ? 'text-red-600' : 'text-slate-900'}`}>{dinero(rol.valor_a_pagar)}</span>
      </div>
      <p className="mt-3 text-[11px] text-slate-500">Comisión total = solo ventas REGULARIZADAS del mes por fecha de activación. Asegurado y asegurado pagado se compensan (el asegurado ya se anticipó). Retención 8%: pendiente de definir con Sergio.</p>
    </div>
  );
}

export default function RolPagos() {
  const [params, setParams] = useSearchParams();
  const [empresa, setEmpresa] = useState((params.get('empresa') || 'NOVONET').toUpperCase());
  const [mes, setMes] = useState(params.get('mes') || mesActual());
  const [seleccionado, setSeleccionado] = useState(params.get('usuario') || '');
  const [buscar, setBuscar] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true); setError('');
    fetch(`${API}/api/comisiones/rol?${new URLSearchParams({ empresa, mes })}`, { headers: auth(), signal: ctrl.signal })
      .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`); return b; })
      .then((b) => setData(b.data))
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [empresa, mes, recarga]);

  // Mismo refresco que Comisiones y Billetera: cada 10 minutos
  useEffect(() => { const id = setInterval(() => setRecarga((x) => x + 1), 10 * 60 * 1000); return () => clearInterval(id); }, []);

  useEffect(() => {
    const p = { empresa, mes };
    if (seleccionado) p.usuario = seleccionado;
    setParams(p, { replace: true });
  }, [empresa, mes, seleccionado, setParams]);

  const roles = data?.roles || [];
  const lista = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return roles.filter((r) => !q || `${r.nombre_asesor || ''} ${r.usuario} ${r.codigo_asesor || ''}`.toLowerCase().includes(q));
  }, [roles, buscar]);
  const rol = roles.find((r) => r.usuario === seleccionado) || null;

  const guardar = async (concepto, monto) => {
    setAviso('');
    try {
      const r = await fetch(`${API}/api/comisiones/rol/ajuste`, {
        method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa, mes, usuario: seleccionado, concepto, monto }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`);
      setRecarga((x) => x + 1);
    } catch (e) { setAviso(e.message); }
  };

  return (
    <div className="min-h-full bg-slate-50 p-4 md:p-7">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="print:hidden">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-600">Administración</p>
          <h1 className="text-2xl font-black text-slate-900">Rol de Pagos</h1>
          <p className="mt-1 text-sm text-slate-500">Rol de comisiones por asesor: ingresos menos descuentos. Los valores automáticos salen del módulo Comisiones; los demás se ingresan aquí y quedan guardados por mes.</p>
        </header>

        <div className="flex flex-wrap items-end gap-3 print:hidden">
          <div className="inline-flex rounded-xl border bg-white p-1 shadow-sm">
            {['NOVONET', 'VELSA'].map((x) => (
              <button key={x} type="button" onClick={() => { setEmpresa(x); setSeleccionado(''); }}
                className={`rounded-lg px-5 py-2 text-sm font-bold ${empresa === x ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{x}</button>
            ))}
          </div>
          <label className="text-xs font-bold text-slate-600">Mes
            <input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} className="mt-1 block rounded-lg border px-3 py-2 text-sm font-normal" />
          </label>
          {data && <div className="ml-auto rounded-xl border bg-white px-4 py-2 text-right shadow-sm">
            <div className="text-[11px] font-bold uppercase text-slate-400">Total a pagar del mes</div>
            <div className="text-xl font-black text-slate-900">{dinero(data.totales?.valor_a_pagar)}</div>
          </div>}
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
        {aviso && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">{aviso}</div>}
        {data && !data.tabla_ajustes && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 print:hidden">Los valores automáticos ya se ven. Para guardar bono TC, chargeback y demás ajustes falta ejecutar <b>ROL_PAGOS_AJUSTES.sql</b> en la base.</div>}

        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <aside className="rounded-2xl border bg-white p-3 shadow-sm print:hidden">
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar asesor o código…" className="mb-2 w-full rounded-lg border px-3 py-2 text-sm" />
            <div className="max-h-[70vh] space-y-1 overflow-y-auto">
              {loading && !data ? <p className="p-6 text-center text-sm text-slate-500">Cargando…</p>
                : !lista.length ? <p className="p-6 text-center text-sm text-slate-500">Sin asesores con activas en el mes.</p>
                : lista.map((r) => (
                  <button key={r.usuario} type="button" onClick={() => setSeleccionado(r.usuario)}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left ${r.usuario === seleccionado ? 'bg-blue-50 ring-1 ring-blue-300' : 'hover:bg-slate-50'}`}>
                    <span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800">{r.nombre_asesor || r.usuario}</span><span className="text-[11px] text-slate-500">{r.usuario} · {r.ventas_activas} regularizadas</span></span>
                    <span className="shrink-0 text-sm font-black text-slate-900">{dinero(r.valor_a_pagar)}</span>
                  </button>
                ))}
            </div>
          </aside>

          <section>
            {rol ? (
              <>
                <div className="mb-3 flex justify-end print:hidden">
                  <button type="button" onClick={() => window.print()} className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-bold text-white hover:bg-slate-700">Imprimir / PDF</button>
                </div>
                <RolAsesor rol={rol} mes={mes} editable={Boolean(data?.tabla_ajustes)} onGuardar={guardar} />
              </>
            ) : (
              <div className="rounded-2xl border border-dashed bg-white p-14 text-center text-sm text-slate-500">
                {seleccionado && !loading ? `No hay rol de ${seleccionado} en ${nombreMes(mes)} (sin activas en el mes).` : 'Elige un asesor para ver su rol de pago.'}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
