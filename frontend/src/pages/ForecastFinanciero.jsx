import TabReporteData from './TabReporteData';

export default function ForecastFinanciero({ empresa = 'novonet' }) {
  const esVelsa = empresa.toLowerCase() === 'velsa';
  const marca = esVelsa ? 'VELSA' : 'NOVONET';
  const ruta = esVelsa ? '/api/redes-velsa/reporte-data' : '/api/redes/reporte-data';

  return (
    <div className="min-h-full bg-slate-50 p-4 md:p-7">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <header>
          <p className="text-xs font-bold uppercase tracking-widest text-violet-600">Administración</p>
          <h1 className="text-2xl font-black text-slate-900">Forecast financiero {marca}</h1>
          <p className="mt-1 text-sm text-slate-500">Proyección financiera de inversión, costos y resultados de Redes {marca}.</p>
        </header>
        <TabReporteData
          key={marca}
          ruta={ruta}
          empresa={empresa.toLowerCase()}
        />
      </div>
    </div>
  );
}
