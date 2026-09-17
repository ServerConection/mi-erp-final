import { useCallback, useEffect, useState } from 'react';
const API = import.meta.env.VITE_API_URL || 'http://localhost:3050';
const roles = ['ADMINISTRADOR', 'ANALISTA', 'COORDINADOR', 'GERENCIA', 'SUPERVISOR'];
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
async function request(path = '', options = {}) {
  const response = await fetch(`${API}/api/gestionables-asesores${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` } });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || 'No se pudo completar la operación');
  return result;
}
export default function GestionablesAsesores() {
  const [tab, setTab] = useState('cuotas'), [fecha, setFecha] = useState(hoy);
  const [rows, setRows] = useState([]), [ultimo, setUltimo] = useState(null);
  const [contenido, setContenido] = useState(''), [archivo, setArchivo] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [mensaje, setMensaje] = useState(''), [aviso, setAviso] = useState('');
  const perfil = (JSON.parse(localStorage.getItem('userProfile') || '{}').perfil || '').toUpperCase();
  const permitido = roles.includes(perfil);
  const cambios = rows.filter(r => r.original !== r.gestionables_permitidos);
  const consultar = useCallback(async () => {
    setBusy(true); setError(''); setRows([]);
    try {
      const result = await request(`?fecha=${fecha}`);
      setRows(result.data.map(r => ({ ...r, original: r.gestionables_permitidos })));
      setUltimo(result.ultimo_id); setAviso(result.aviso || '');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }, [fecha]);
  useEffect(() => { if (permitido) consultar(); }, [consultar, permitido]);
  async function cargar(event) {
    const file = event.target.files[0];
    setContenido(''); setArchivo(''); setError(''); setMensaje('');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.txt') || file.size > 500000) { setError('Seleccione un .txt de hasta 500 KB'); return; }
    setContenido(await file.text()); setArchivo(file.name);
  }
  async function guardar(importar) {
    setBusy(true); setError(''); setMensaje('');
    try {
      const result = await request(importar ? '/importar' : '', { method: importar ? 'POST' : 'PUT', body: JSON.stringify(importar ? { contenido } : { fecha, items: cambios }) });
      setMensaje(`${result.total} cuotas guardadas correctamente.`);
      if (importar) { setContenido(''); setArchivo(''); }
      await consultar();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function plantilla() {
    const id = (ultimo || 0) + 1;
    const url = URL.createObjectURL(new Blob([`id;nombre_bitrix_asesor;gestionables_permitidos;fecha_carga\n${id};NOMBRE COMPLETO EN BITRIX;4;${fecha}\n`], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'plantilla-gestionables.txt'; a.click(); URL.revokeObjectURL(url);
  }
  if (!permitido) return <p className="p-6">Acceso restringido a supervisión.</p>;
  return <div className="space-y-5">
    <div><h1 className="text-3xl font-bold text-slate-800">Gestionables por asesor</h1><p className="text-slate-500">Carga y ajuste de cuotas diarias de NOVONET.</p></div>
    <div className="flex gap-2">{[['cuotas', 'Cuotas por fecha'], ['carga', 'Cargar TXT']].map(([key, label]) => <button key={key} disabled={busy} onClick={() => setTab(key)} className={`px-4 py-2 rounded-xl font-bold ${tab === key ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'}`}>{label}</button>)}</div>
    {error && <p role="alert" className="p-3 bg-red-50 text-red-700 rounded-xl">{error}</p>}
    {mensaje && <p role="status" className="p-3 bg-green-50 text-green-700 rounded-xl">{mensaje}</p>}
    <div className="bg-white border rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3"><label>Fecha <input type="date" value={fecha} disabled={busy || cambios.length > 0} onChange={e => { setFecha(e.target.value); setMensaje(''); }} className="border rounded-lg p-2 ml-2" /></label><button disabled={busy} onClick={consultar} className="border rounded-lg px-3 py-2">{busy ? 'Procesando…' : cambios.length ? 'Descartar cambios y consultar' : 'Consultar'}</button><span className="text-slate-500">Último ID cargado: {ultimo ?? '—'}</span></div>
      {tab === 'carga' ? <>
        <p>TXT en UTF-8, separado por punto y coma o tabulaciones. Use el nombre completo exactamente como aparece en Bitrix, un ID manual único, una cantidad entera desde cero y fecha AAAA-MM-DD.</p>
        <pre className="bg-slate-50 p-3 rounded-lg overflow-auto text-sm">id;nombre_bitrix_asesor;gestionables_permitidos;fecha_carga{'\n'}{(ultimo || 0) + 1};NOMBRE COMPLETO EN BITRIX;4;{fecha}</pre>
        <p className="text-sm text-slate-500">Un registro por asesor y fecha. Para corregir una cuota cargada, conserve su ID, nombre y fecha. Todo el archivo se valida antes de guardarse.</p>
        <button onClick={plantilla} disabled={busy || ultimo === null} className="border px-4 py-2 rounded-lg">Descargar plantilla</button>
        <input type="file" accept=".txt,text/plain" disabled={busy} onChange={cargar} className="block" />
        {archivo && <><p>{archivo}</p><pre className="max-h-52 overflow-auto bg-slate-50 p-3 text-sm">{contenido}</pre></>}
        <button disabled={busy || !contenido} onClick={() => guardar(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg disabled:opacity-40">Cargar y actualizar tabla</button>
      </> : <>
        {aviso && <p className="bg-amber-50 text-amber-800 p-3 rounded-lg">{aviso}</p>}
        <p className="text-sm text-slate-500">Consumo: gestionables creados en la fecha seleccionada, según el reporte del ERP. Rojo indica que alcanzó o superó el límite.</p>
        <div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b">{['ID', 'Responsable', 'Gestionables', 'Permitidos', 'Disponibles', 'Estado'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{rows.map(r => {
          const limite = r.gestionables_actuales !== null && r.gestionables_actuales >= r.gestionables_permitidos;
          const cambiar = delta => setRows(prev => prev.map(x => x.id === r.id ? { ...x, gestionables_permitidos: Math.max(0, x.gestionables_permitidos + delta) } : x));
          return <tr key={r.id} className={`border-b ${limite ? 'bg-red-50 text-red-800' : ''}`}><td className="p-3">{r.id}</td><td className="p-3 font-semibold">{r.nombre_bitrix_asesor}</td><td className="p-3">{r.gestionables_actuales ?? '—'}</td><td className="p-3"><div className="flex items-center gap-3"><button aria-label={`Reducir cuota de ${r.nombre_bitrix_asesor}`} disabled={busy || r.gestionables_permitidos === 0} onClick={() => cambiar(-1)} className="border rounded px-3 py-1 disabled:opacity-30">−</button><strong>{r.gestionables_permitidos}</strong><button aria-label={`Aumentar cuota de ${r.nombre_bitrix_asesor}`} disabled={busy || r.gestionables_permitidos >= 2147483647} onClick={() => cambiar(1)} className="border rounded px-3 py-1">+</button></div></td><td className="p-3">{r.gestionables_actuales === null ? '—' : Math.max(0, r.gestionables_permitidos - r.gestionables_actuales)}</td><td className="p-3">{r.original !== r.gestionables_permitidos ? 'Cambio pendiente' : r.gestionables_actuales === null ? 'Sin conteo' : limite ? 'Límite alcanzado' : 'Con cupo'}</td></tr>;
        })}</tbody></table></div>
        {!busy && !rows.length && <p className="text-slate-500">No hay cuotas cargadas para esta fecha.</p>}
        <button disabled={busy || !cambios.length} onClick={() => guardar(false)} className="bg-blue-600 text-white rounded-lg px-5 py-2 disabled:opacity-40">Actualizar {cambios.length ? `(${cambios.length})` : ''}</button>
      </>}
    </div>
  </div>;
}
