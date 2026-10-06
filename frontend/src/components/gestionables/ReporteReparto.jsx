import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { repartoRequest, hoyEc } from './api';

const etiquetaHora = (h) => `${String(h).padStart(2, '0')}:00`;

export default function ReporteReparto() {
  const [fecha, setFecha] = useState(hoyEc);
  const [datos, setDatos] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hora, setHora] = useState(null);        // hora seleccionada en el gráfico
  const [asesor, setAsesor] = useState('');      // asesor seleccionado en la tabla

  const consultar = useCallback(async () => {
    setBusy(true); setError('');
    try { setDatos(await repartoRequest(`/reparto/reporte?fecha=${fecha}`)); setHora(null); setAsesor(''); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }, [fecha]);
  useEffect(() => { consultar(); }, [consultar]);

  const todos = datos?.detalle || [];
  const detalle = todos.filter((d) => d.vigente !== false);          // lo que cuenta en el cupo
  const esHumano = (d) => d.origen === 'humano';

  const porHora = useMemo(() => {
    const sin = new Map((datos?.sin_repartir || []).map((r) => [r.hora, r.total]));
    const horas = [...detalle.map((d) => d.hora), ...sin.keys()];
    if (!horas.length) return [];
    const desde = Math.min(7, ...horas), hasta = Math.max(19, ...horas);
    return Array.from({ length: hasta - desde + 1 }, (_, i) => {
      const h = desde + i;
      return { hora: h, label: etiquetaHora(h), Bot: detalle.filter((d) => d.hora === h && !esHumano(d)).length, Humano: detalle.filter((d) => d.hora === h && esHumano(d)).length, 'A la estación': sin.get(h) || 0 };
    });
  }, [detalle, datos]);

  const porAsesor = useMemo(() => {
    const m = new Map();
    detalle.forEach((d) => {
      const x = m.get(d.asesor_asignado) || { nombre: d.asesor_asignado, total: 0, bot: 0, humano: 0, primero: d.hora_texto, ultimo: d.hora_texto };
      x.total += 1; if (esHumano(d)) x.humano += 1; else x.bot += 1; x.ultimo = d.hora_texto; m.set(d.asesor_asignado, x);
    });
    return [...m.values()].sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'));
  }, [detalle]);

  const filtrados = todos.filter((d) => (hora === null || d.hora === hora) && (!asesor || d.asesor_asignado === asesor));
  const totalSin = (datos?.sin_repartir || []).reduce((a, r) => a + r.total, 0);
  const max = porAsesor[0]?.total || 0, min = porAsesor.length ? porAsesor[porAsesor.length - 1].total : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-slate-700">Fecha <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="ml-2 rounded-lg border p-2" /></label>
        <button onClick={consultar} disabled={busy} className="rounded-lg border px-3 py-2 text-sm">{busy ? 'Consultando…' : 'Actualizar'}</button>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Entregados por el bot', detalle.filter((d) => !esHumano(d)).length],
          ['Entregados por un humano', detalle.filter(esHumano).length],
          ['Diferencia máx. entre asesores', porAsesor.length ? max - min : '—'],
          ['Pasaron por la estación', totalSin],
        ].map(([t, v]) => (
          <div key={t} className="rounded-2xl border bg-white p-4"><p className="text-sm text-slate-500">{t}</p><p className="text-3xl font-bold tabular-nums text-slate-800">{v}</p></div>
        ))}
      </div>
      {porAsesor.length > 0 && <p className="text-sm text-slate-500">Si el reparto está parejo, la diferencia entre el asesor que más recibió y el que menos recibió es 0 o 1 (salvo cupos distintos o quien entró más tarde).</p>}

      <div className="rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-bold text-slate-800">Leads por hora</h2>
        <p className="mb-3 text-sm text-slate-500">Azul: entregados por el bot. Morado: asignados a mano por un humano. Naranja: llegaron y esperaron en la estación. Haz clic en una barra para ver los leads entregados en esa hora.</p>
        {!porHora.length ? <p className="text-slate-500">{busy ? 'Cargando…' : 'No hubo reparto en esta fecha.'}</p> : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porHora} onClick={(e) => { const fila = e?.activeIndex != null ? porHora[Number(e.activeIndex)] : porHora.find((x) => x.label === e?.activeLabel); if (fila) setHora(hora === fila.hora ? null : fila.hora); }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip cursor={{ fill: 'rgba(59,130,246,0.08)' }} />
                <Legend />
                <Bar dataKey="Bot" stackId="a" fill="#3b82f6" cursor="pointer" />
                <Bar dataKey="Humano" stackId="a" fill="#8b5cf6" radius={[4, 4, 0, 0]} cursor="pointer" />
                <Bar dataKey="A la estación" stackId="b" fill="#f59e0b" radius={[4, 4, 0, 0]} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5">
          <h2 className="text-lg font-bold text-slate-800">Por asesor</h2>
          <p className="mb-3 text-sm text-slate-500">Haz clic en un asesor para ver sus leads.</p>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-slate-500"><th className="p-2">Asesor</th><th className="p-2 text-center">Total</th><th className="p-2 text-center">Bot</th><th className="p-2 text-center">Humano</th><th className="p-2">Primero</th><th className="p-2">Último</th></tr></thead>
              <tbody>{porAsesor.map((a) => (
                <tr key={a.nombre} onClick={() => setAsesor(asesor === a.nombre ? '' : a.nombre)} className={`cursor-pointer border-b hover:bg-blue-50 ${asesor === a.nombre ? 'bg-blue-50 font-semibold' : ''}`}>
                  <td className="p-2">{a.nombre}</td><td className="p-2 text-center tabular-nums font-semibold">{a.total}</td><td className="p-2 text-center tabular-nums">{a.bot}</td><td className={`p-2 text-center tabular-nums ${a.humano ? 'text-violet-700 font-semibold' : ''}`}>{a.humano}</td><td className="p-2 tabular-nums">{a.primero}</td><td className="p-2 tabular-nums">{a.ultimo}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-800">Detalle de leads</h2>
            {(hora !== null || asesor) && <button onClick={() => { setHora(null); setAsesor(''); }} className="text-sm font-medium text-blue-700">Quitar filtros</button>}
          </div>
          <p className="mb-2 text-sm text-slate-500">
            {filtrados.length} leads{hora !== null ? ` · ${etiquetaHora(hora)}` : ''}{asesor ? ` · ${asesor}` : ''}
          </p>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-slate-500"><th className="p-2">Hora</th><th className="p-2">Lead</th><th className="p-2">Asignado a</th><th className="p-2 text-center">Su lead n.º</th><th className="p-2">Vía</th></tr></thead>
              <tbody>{filtrados.map((d) => (
                <tr key={`${d.bitrix_deal_id}-${d.origen}-${d.asesor_asignado}`} className={`border-b ${d.vigente === false ? 'text-slate-400 line-through decoration-slate-300' : ''}`}>
                  <td className="p-2 tabular-nums">{d.hora_texto}</td>
                  <td className="p-2 tabular-nums">{d.bitrix_deal_id}</td>
                  <td className="p-2">{d.asesor_asignado}</td>
                  <td className="p-2 text-center tabular-nums">{d.ronda}</td>
                  <td className="p-2">
                    {d.origen === 'humano' ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700">Humano</span>
                      : d.origen === 'cola' ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">Bot · desde estación</span>
                      : 'Bot'}
                    {d.vigente === false && <span className="ml-1 text-xs no-underline">→ reasignado a {d.reasignado_a || 'otro'}</span>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </div>

      {datos?.eventos?.length > 0 && (
        <div className="rounded-2xl border bg-white p-5">
          <h2 className="mb-2 text-lg font-bold text-slate-800">Cambios del día</h2>
          <ul className="space-y-1 text-sm text-slate-600">{datos.eventos.map((e, i) => (
            <li key={i}><span className="tabular-nums">{e.hora_texto}</span> · {e.usuario || 'Alguien'} {e.campo === 'activo' ? (e.valor ? 'encendió' : 'apagó') + ' el reparto' : (e.valor ? 'activó' : 'desactivó') + ' "solo asesores en línea"'}</li>
          ))}</ul>
        </div>
      )}
    </div>
  );
}
