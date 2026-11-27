import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArchiveRestore, BookOpen, CheckCircle2, Clock3, ImagePlus, LockKeyhole, PlayCircle, Plus, Search, Trash2, Upload, Video, X } from 'lucide-react';
import { evaluacionesApi } from '../../hooks/useEvaluaciones';
import { ErrorBox, SkeletonTarjetas } from './ui';
import KpiCard from './KpiCard';

const API = import.meta.env.VITE_API_URL || '';
const bytes = (n) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGEN_BYTES = 2 * 1024 * 1024;

function useBloqueoScroll() {
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = anterior; };
  }, []);
}

export default function CursosPanel({ puedeGestionar, onEvaluar, notificar }) {
  const [cursos, setCursos] = useState([]);
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [viendo, setViendo] = useState(null);
  const [crear, setCrear] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [c, e] = await Promise.all([evaluacionesApi.cursos(), puedeGestionar ? evaluacionesApi.listar() : Promise.resolve({ data: [] })]);
      setCursos(c.data || []);
      setEvaluaciones((e.data || []).filter((x) => x.activa && Number(x.totalPreguntas) > 0));
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [puedeGestionar]);
  useEffect(() => { cargar(); }, [cargar]);

  const lista = useMemo(() => cursos.filter((c) => `${c.titulo} ${c.descripcion || ''} ${c.empresa || ''}`.toLowerCase().includes(busqueda.toLowerCase())), [cursos, busqueda]);
  const stats = useMemo(() => ({
    total: cursos.filter((c) => c.activo).length,
    videos: cursos.filter((c) => c.videoCompletado).length,
    aprobados: cursos.filter((c) => c.aprobado).length,
  }), [cursos]);

  if (loading) return <SkeletonTarjetas />;
  if (error) return <ErrorBox error={error} onReintentar={cargar} />;
  return <div className="space-y-6">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <KpiCard icono={BookOpen} etiqueta="Cursos disponibles" valor={stats.total} tono="indigo" />
      <KpiCard icono={Video} etiqueta="Videos completados" valor={stats.videos} tono="cyan" />
      <KpiCard icono={CheckCircle2} etiqueta="Cursos aprobados" valor={stats.aprobados} tono="emerald" />
    </div>
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="relative min-w-64 flex-1"><Search className="absolute left-3 top-2.5 text-slate-400" size={17}/><input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cursos" className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400"/></div>
      {puedeGestionar && <button onClick={() => setCrear(true)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700"><Plus size={16}/>Nuevo curso</button>}
    </div>
    {lista.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{lista.map((c) => {
      const progreso = c.aprobado ? 100 : c.videoCompletado ? 70 : 0;
      return <article key={c.id} className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
        <button onClick={() => setViendo(c)} className="relative block aspect-video w-full overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-blue-700 text-white"><span className="absolute inset-0 grid place-items-center"><span className="rounded-full bg-white/15 p-4 backdrop-blur ring-1 ring-white/30 transition group-hover:scale-110"><PlayCircle size={34}/></span></span><span className="absolute bottom-3 left-3 rounded-full bg-black/35 px-2.5 py-1 text-xs font-bold backdrop-blur">{c.empresa || 'Todas las empresas'}</span></button>
        <div className="p-5"><div className="mb-2 flex items-start justify-between gap-3"><h3 className="font-black text-slate-900">{c.titulo}</h3>{c.aprobado && <CheckCircle2 className="shrink-0 text-emerald-500" size={20}/>}</div><p className="line-clamp-2 min-h-10 text-sm text-slate-500">{c.descripcion || 'Curso de capacitación interna.'}</p>
          <div className="mt-4"><div className="mb-1 flex justify-between text-[11px] font-bold text-slate-500"><span>Progreso</span><span>{progreso}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all" style={{ width: `${progreso}%` }}/></div></div>
          <div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span className="inline-flex items-center gap-1"><Clock3 size={13}/>Video · {bytes(c.videoBytes)}</span><span>{c.totalPreguntas} preguntas</span></div>
          <div className="mt-4 flex gap-2"><button onClick={() => setViendo(c)} className="flex-1 rounded-xl bg-slate-950 px-3 py-2.5 text-sm font-bold text-white hover:bg-blue-800">{c.videoCompletado ? 'Volver a ver' : 'Comenzar curso'}</button>{puedeGestionar && <button title={c.activo ? 'Archivar' : 'Activar'} onClick={async () => { await evaluacionesApi.archivarCurso(c.id, !c.activo); await cargar(); }} className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50">{c.activo ? <Archive size={17}/> : <ArchiveRestore size={17}/>}</button>}</div>
        </div>
      </article>;
    })}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-6 text-center"><BookOpen className="mx-auto mb-2 h-8 w-8 text-slate-300"/><p className="text-sm font-semibold text-slate-700">No hay cursos disponibles</p><p className="mt-1 text-xs text-slate-500">Los nuevos cursos aparecerán aquí.</p></div>}

    {viendo && createPortal(<Reproductor curso={viendo} onCerrar={() => setViendo(null)} onCompletado={async () => { await evaluacionesApi.completarVideo(viendo.id); setViendo((v) => ({ ...v, videoCompletado: true })); setCursos((xs) => xs.map((x) => x.id === viendo.id ? { ...x, videoCompletado: true } : x)); }} onEvaluar={onEvaluar}/>, document.body)}
    {crear && createPortal(<CrearCurso evaluaciones={evaluaciones} onCerrar={() => setCrear(false)} onCreado={async () => { setCrear(false); notificar?.('Curso creado correctamente', 'exito'); await cargar(); }}/>, document.body)}
  </div>;
}

function Reproductor({ curso, onCerrar, onCompletado, onEvaluar }) {
  useBloqueoScroll();
  const [guardando, setGuardando] = useState(false);
  const completar = async () => { if (curso.videoCompletado || guardando) return; setGuardando(true); try { await onCompletado(); } finally { setGuardando(false); } };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}><div className="w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-600">Curso en video</p><h2 className="text-lg font-black text-slate-900">{curso.titulo}</h2></div><button onClick={onCerrar} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">Cerrar</button></div><div className="bg-black"><video className="mx-auto aspect-video max-h-[65vh] w-full" controls controlsList="nodownload" src={`${API}${curso.videoUrl}`} onEnded={completar}/></div><div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-slate-800">{curso.videoCompletado ? 'Video completado' : 'Mira el video hasta el final'}</p><p className="text-sm text-slate-500">La evaluación se habilita al terminar.</p></div><button disabled={!curso.videoCompletado || curso.aprobado} onClick={() => onEvaluar(curso.evaluacionId)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">{curso.videoCompletado ? <CheckCircle2 size={17}/> : <LockKeyhole size={17}/>} {curso.aprobado ? `Aprobado · ${curso.nota}%` : 'Rendir evaluación'}</button></div></div></div>;
}

function CrearCurso({ evaluaciones, onCerrar, onCreado }) {
  useBloqueoScroll();
  const [form, setForm] = useState({ titulo: '', descripcion: '', empresa: '', evaluacionId: '', notaMinima: 70 });
  const [preguntas, setPreguntas] = useState(() => [{ texto: '', imagen: null, opciones: ['', '', ''], correcta: 0 }]);
  const [video, setVideo] = useState(null); const [enviando, setEnviando] = useState(false); const [error, setError] = useState('');
  const cambiarPregunta = (indice, cambio) => setPreguntas((lista) => lista.map((p, i) => i === indice ? { ...p, ...cambio } : p));
  const cambiarOpcion = (pi, oi, valor) => setPreguntas((lista) => lista.map((p, i) => i === pi ? { ...p, opciones: p.opciones.map((o, j) => j === oi ? valor : o) } : p));
  const agregarPregunta = () => setPreguntas((lista) => [...lista, { texto: '', imagen: null, opciones: ['', '', ''], correcta: 0 }]);
  const quitarPregunta = (pi) => setPreguntas((lista) => lista.filter((_, i) => i !== pi));
  const agregarOpcion = (pi) => setPreguntas((lista) => lista.map((p, i) => i === pi ? { ...p, opciones: [...p.opciones, ''] } : p));
  const quitarOpcion = (pi, oi) => setPreguntas((lista) => lista.map((p, i) => {
    if (i !== pi || p.opciones.length <= 2) return p;
    const opciones = p.opciones.filter((_, j) => j !== oi);
    const correcta = p.correcta === oi ? 0 : p.correcta > oi ? p.correcta - 1 : p.correcta;
    return { ...p, opciones, correcta };
  }));
  const seleccionarImagen = (pi, archivo) => {
    if (!archivo) return;
    if (!TIPOS_IMAGEN.includes(archivo.type)) { setError('La imagen debe ser JPG, PNG, WebP o GIF'); return; }
    if (archivo.size > MAX_IMAGEN_BYTES) { setError('Cada imagen puede pesar máximo 2 MB'); return; }
    const lector = new FileReader();
    lector.onload = () => { cambiarPregunta(pi, { imagen: lector.result }); setError(''); };
    lector.onerror = () => setError('No se pudo leer la imagen');
    lector.readAsDataURL(archivo);
  };
  const enviar = async (e) => {
    e.preventDefault(); setEnviando(true); setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (!form.evaluacionId) fd.append('preguntas', JSON.stringify(preguntas));
      fd.append('video', video);
      await evaluacionesApi.crearCurso(fd); onCreado();
    } catch (err) { setError(err.message); } finally { setEnviando(false); }
  };
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm"><form onSubmit={enviar} className="mx-auto my-4 w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl"><div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-600">Nuevo contenido</p><h2 className="text-2xl font-black text-slate-900">Crear curso corto</h2><p className="text-sm text-slate-500">Carga el video y crea una evaluación con las preguntas que necesites.</p></div>{error && <div className="mb-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</div>}
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold text-slate-600 sm:col-span-2">Título<input required minLength={3} value={form.titulo} onChange={(e) => setForm({...form,titulo:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-400"/></label><label className="text-sm font-bold text-slate-600 sm:col-span-2">Descripción<textarea value={form.descripcion} onChange={(e) => setForm({...form,descripcion:e.target.value})} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-400"/></label><label className="text-sm font-bold text-slate-600">Empresa<select value={form.empresa} onChange={(e) => setForm({...form,empresa:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"><option value="">NOVONET y VELSA</option><option>NOVONET</option><option>VELSA</option></select></label><label className="text-sm font-bold text-slate-600">Nota mínima<input type="number" min="1" max="100" value={form.notaMinima} onChange={(e) => setForm({...form,notaMinima:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"/></label>
      {evaluaciones.length > 0 && <label className="text-sm font-bold text-slate-600 sm:col-span-2">Usar una evaluación existente (opcional)<select value={form.evaluacionId} onChange={(e) => setForm({...form,evaluacionId:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"><option value="">Crear preguntas aquí</option>{evaluaciones.map((x) => <option key={x.id} value={x.id}>{x.titulo} · {x.totalPreguntas} preguntas</option>)}</select></label>}
      <label className="sm:col-span-2 grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center hover:border-blue-400 hover:bg-blue-50"><Upload className="mb-2 text-blue-600"/><span className="font-bold text-slate-700">{video ? video.name : 'Seleccionar video MP4, WebM o MOV'}</span><span className="text-xs text-slate-500">Máximo 100 MB</span><input required type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(e) => setVideo(e.target.files?.[0] || null)} className="sr-only"/></label>
    </div>
    {!form.evaluacionId && (
      <div className="mt-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div><h3 className="font-black text-slate-900">Evaluación final</h3><p className="text-xs text-slate-500">{preguntas.length} pregunta{preguntas.length === 1 ? '' : 's'}</p></div>
          <button type="button" onClick={agregarPregunta} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"><Plus size={16}/>Agregar pregunta</button>
        </div>
        {preguntas.map((p, pi) => (
          <div key={pi} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex items-center justify-between gap-2"><span className="text-sm font-bold text-slate-700">Pregunta {pi + 1}</span>{preguntas.length > 1 && <button type="button" onClick={() => quitarPregunta(pi)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Eliminar pregunta"><Trash2 size={16}/></button>}</div>
            <input required minLength={3} value={p.texto} onChange={(e) => cambiarPregunta(pi, { texto: e.target.value })} placeholder="Escribe la pregunta" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-blue-400"/>
            <div className="mt-3">
              {p.imagen ? (
                <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <img src={p.imagen} alt={`Imagen de la pregunta ${pi + 1}`} className="max-h-56 w-full object-contain" />
                  <button type="button" onClick={() => cambiarPregunta(pi, { imagen: null })} className="absolute right-2 top-2 rounded-full bg-slate-900/75 p-1.5 text-white hover:bg-rose-600" title="Quitar imagen"><X size={15}/></button>
                </div>
              ) : (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-500 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700">
                  <ImagePlus size={16}/>Agregar imagen <span className="font-normal text-slate-400">JPG, PNG, WebP o GIF · máx. 2 MB</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(e) => { seleccionarImagen(pi, e.target.files?.[0]); e.target.value = ''; }}/>
                </label>
              )}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {p.opciones.map((opcion, oi) => (
                <div key={oi} className={`rounded-xl border p-2 text-xs font-bold ${p.correcta === oi ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}>
                  <div className="mb-1 flex items-center justify-between gap-2"><label className="flex items-center gap-1"><input type="radio" name={`correcta-${pi}`} checked={p.correcta === oi} onChange={() => cambiarPregunta(pi, { correcta: oi })}/>Correcta</label>{p.opciones.length > 2 && <button type="button" onClick={() => quitarOpcion(pi, oi)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Eliminar opción"><Trash2 size={13}/></button>}</div>
                  <input required value={opcion} onChange={(e) => cambiarOpcion(pi, oi, e.target.value)} placeholder={`Opción ${oi + 1}`} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-normal text-slate-800"/>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => agregarOpcion(pi)} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800"><Plus size={14}/>Agregar opción</button>
          </div>
        ))}
      </div>
    )}
    <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onCerrar} className="rounded-xl border border-slate-200 px-4 py-2.5 font-bold text-slate-600">Cancelar</button><button disabled={enviando || !video} className="rounded-xl bg-blue-600 px-5 py-2.5 font-black text-white disabled:opacity-50">{enviando ? 'Subiendo…' : 'Crear curso'}</button></div></form></div>;
}
