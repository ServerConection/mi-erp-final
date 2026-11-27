const TONOS = {
  indigo: { icono: 'bg-indigo-50 text-indigo-600', linea: '#4f46e5' },
  emerald: { icono: 'bg-emerald-50 text-emerald-600', linea: '#059669' },
  amber: { icono: 'bg-amber-50 text-amber-600', linea: '#d97706' },
  cyan: { icono: 'bg-cyan-50 text-cyan-600', linea: '#0891b2' },
};

function Sparkline({ datos, tono }) {
  const valores = datos?.length > 1 ? datos : [datos?.[0] || 0, datos?.[0] || 0];
  const max = Math.max(...valores, 1);
  const min = Math.min(...valores, 0);
  const rango = Math.max(max - min, 1);
  const puntos = valores.map((v, i) => `${(i / (valores.length - 1)) * 100},${30 - ((v - min) / rango) * 25}`).join(' ');
  const color = (TONOS[tono] || TONOS.indigo).linea;
  return <svg viewBox="0 0 100 34" className="h-10 w-24 shrink-0 overflow-visible" aria-hidden="true"><polyline points={puntos} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function KpiCard({ icono: Icono, etiqueta, valor, sufijo = '', tono = 'indigo', sparkline = false, datos }) {
  const colores = TONOS[tono] || TONOS.indigo;
  return (
    <div className="eva-card min-w-0 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2"><span className={`grid h-9 w-9 place-items-center rounded-xl ${colores.icono}`}><Icono className="h-4 w-4" /></span><p className="truncate text-xs font-semibold text-slate-500">{etiqueta}</p></div>
          <p className="text-2xl font-bold leading-none tabular-nums text-slate-900">{valor}<span className="ml-0.5 text-base font-semibold text-slate-400">{sufijo}</span></p>
        </div>
        {sparkline && <Sparkline datos={datos} tono={tono} />}
      </div>
    </div>
  );
}
