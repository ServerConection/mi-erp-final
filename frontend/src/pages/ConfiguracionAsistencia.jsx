import { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, LoaderCircle, Search, UserRoundCheck, Wifi } from 'lucide-react';

const API = import.meta.env.VITE_API_URL;
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export default function ConfiguracionAsistencia() {
  const [usuarios, setUsuarios] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [empresa, setEmpresa] = useState('TODAS');
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/usuarios`, { headers: auth() })
      .then(async (res) => { const body = await res.json(); if (!res.ok) throw new Error(body.error || 'No se pudieron cargar los usuarios'); return body; })
      .then((body) => setUsuarios(body.data || []))
      .catch((error) => setMensaje({ tipo: 'error', texto: error.message }))
      .finally(() => setLoading(false));
  }, []);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return usuarios.filter((u) => (empresa === 'TODAS' || String(u.empresa).toUpperCase() === empresa) && (!q || `${u.nombres} ${u.apellidos} ${u.usuario} ${u.cargo} ${u.perfil}`.toLowerCase().includes(q))).sort((a, b) => `${a.nombres} ${a.apellidos}`.localeCompare(`${b.nombres} ${b.apellidos}`, 'es'));
  }, [usuarios, busqueda, empresa]);
  const activos = visibles.filter((u) => u.activo === 'SI');

  const cambiarModalidad = async (usuario, modalidad) => {
    if (usuario.modalidad_asistencia === modalidad) return;
    setGuardando(usuario.id); setMensaje(null);
    try {
      const res = await fetch(`${API}/api/usuarios/${usuario.id}/modalidad-asistencia`, { method: 'PATCH', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ modalidad_asistencia: modalidad }) });
      const body = await res.json(); if (!res.ok) throw new Error(body.error || 'No se pudo guardar');
      setUsuarios((actuales) => actuales.map((u) => u.id === usuario.id ? { ...u, modalidad_asistencia: modalidad } : u));
      setMensaje({ tipo: 'ok', texto: `${usuario.nombres} ${usuario.apellidos} ahora usa ${modalidad === 'JORNADA' ? 'Jornada administrativa' : 'Conexión a leads'}.` });
    } catch (error) { setMensaje({ tipo: 'error', texto: error.message }); }
    finally { setGuardando(null); }
  };

  return <div className="min-h-full bg-slate-50 p-4 md:p-7"><div className="mx-auto max-w-7xl space-y-5">
    <header><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Administración</p><h1 className="mt-1 flex items-center gap-2 text-2xl font-black text-slate-900"><UserRoundCheck className="h-7 w-7 text-blue-600" />Modalidad de asistencia</h1><p className="mt-1 text-sm text-slate-500">Define qué vista tendrá cada usuario en VELSA/NOVONET ACCESS, sin cambiar sus permisos.</p></header>
    <section className="grid gap-3 sm:grid-cols-3">{[['Usuarios activos', activos.length, 'text-slate-900'], ['Jornada administrativa', activos.filter((u) => u.modalidad_asistencia === 'JORNADA').length, 'text-blue-700'], ['Conexión a leads', activos.filter((u) => u.modalidad_asistencia === 'CONEXION').length, 'text-teal-600']].map(([titulo, valor, color]) => <div key={titulo} className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{titulo}</p><p className={`mt-2 text-2xl font-black ${color}`}>{valor}</p></div>)}</section>
    {mensaje && <div className={`rounded-xl border p-3 text-sm font-bold ${mensaje.tipo === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{mensaje.texto}</div>}
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between"><div className="flex flex-wrap gap-2">{['TODAS', 'NOVONET', 'VELSA', 'SEMILLERO'].map((x) => <button key={x} onClick={() => setEmpresa(x)} className={`rounded-lg px-3 py-2 text-xs font-black ${empresa === x ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{x}</button>)}</div><label className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar usuario, cargo o perfil" className="w-full rounded-xl border py-2 pl-9 pr-3 text-sm md:w-80" /></label></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Colaborador</th><th className="px-5 py-3">Empresa</th><th className="px-5 py-3">Cargo / perfil</th><th className="px-5 py-3">Modalidad que verá</th></tr></thead><tbody className="divide-y">{loading ? <tr><td colSpan="4" className="p-12 text-center"><LoaderCircle className="mx-auto h-6 w-6 animate-spin text-blue-600" /></td></tr> : visibles.map((u) => <tr key={u.id} className={u.activo !== 'SI' ? 'bg-slate-50 opacity-55' : ''}><td className="px-5 py-4"><b>{u.nombres} {u.apellidos}</b><p className="text-xs text-slate-400">{u.usuario} · {u.activo === 'SI' ? 'Activo' : 'Inactivo'}</p></td><td className="px-5 py-4 font-bold text-slate-600">{u.empresa}</td><td className="px-5 py-4"><span>{u.cargo}</span><p className="text-xs text-slate-400">{u.perfil}</p></td><td className="px-5 py-4"><div className="inline-flex rounded-xl border bg-slate-50 p-1"><button disabled={guardando === u.id} onClick={() => cambiarModalidad(u, 'JORNADA')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-black ${u.modalidad_asistencia === 'JORNADA' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-white'}`}><BriefcaseBusiness className="h-4 w-4" />Jornada</button><button disabled={guardando === u.id} onClick={() => cambiarModalidad(u, 'CONEXION')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-black ${u.modalidad_asistencia === 'CONEXION' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:bg-white'}`}><Wifi className="h-4 w-4" />Conexión</button></div></td></tr>)}</tbody></table></div>
    </section>
  </div></div>;
}
