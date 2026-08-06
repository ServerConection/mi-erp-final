/**
 * Formulario de nueva tarea / acuerdo / solicitud.
 * También sirve para crear subtareas (pasando tareaPadre).
 */

import { useState, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { tareasApi } from '../../hooks/useTareas';
import { Modal, hoyISO, Avatar, EmpresaBadge } from './ui';

const Campo = ({ label, requerido, children, ayuda }) => (
  <div>
    <label className="block text-sm font-medium text-slate-700 mb-1.5">
      {label} {requerido && <span className="text-rose-500">*</span>}
    </label>
    {children}
    {ayuda && <p className="text-xs text-slate-400 mt-1">{ayuda}</p>}
  </div>
);

const inputCls =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition';

export default function TareaFormModal({ catalogos, tareaPadre = null, onCerrar, onCreada }) {
  const hoy = hoyISO();
  const enUnaSemana = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

  const [f, setF] = useState({
    tipo: 'TAREA',
    titulo: '',
    descripcion: '',
    responsable_id: catalogos?.yo?.id || '',
    prioridad: 'MEDIA',
    fecha_solicitud: hoy,
    fecha_limite: enUnaSemana,
    proyecto_id: '',
    areas_involucradas: [],
    empresa: tareaPadre?.empresa || catalogos?.yo?.empresa || 'NOVONET',
    tarea_padre_id: tareaPadre?.id || null,
  });

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  // Usuarios agrupados por área. Incluye a los de ambas empresas: el personal
  // administrativo trabaja cruzado, así que cualquiera puede asignarle a cualquiera.
  const porArea = useMemo(() => {
    const m = new Map();
    for (const u of catalogos?.usuarios || []) {
      const k = u.area_nombre || 'Sin área';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(u);
    }
    return [...m.entries()];
  }, [catalogos]);

  const responsable = (catalogos?.usuarios || [])
    .find(u => String(u.id) === String(f.responsable_id));

  const retroactiva = f.fecha_limite < hoy;

  async function enviar(e) {
    e.preventDefault();
    setError(null);

    if (!f.titulo.trim())    return setError('Escribe un título');
    if (!f.responsable_id)   return setError('Elige un responsable');
    if (!f.fecha_limite)     return setError('Indica la fecha límite');
    if (f.fecha_limite < f.fecha_solicitud) {
      return setError('La fecha límite no puede ser anterior a la de solicitud. Si es un acuerdo retroactivo, ajusta también la fecha de solicitud.');
    }

    setGuardando(true);
    try {
      const r = await tareasApi.crear({
        ...f,
        responsable_id: Number(f.responsable_id),
        proyecto_id: f.proyecto_id ? Number(f.proyecto_id) : null,
      });
      onCreada(r.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  function toggleArea(id) {
    set('areas_involucradas',
      f.areas_involucradas.includes(id)
        ? f.areas_involucradas.filter(x => x !== id)
        : [...f.areas_involucradas, id]);
  }

  return (
    <Modal
      wide
      title={tareaPadre ? 'Nueva subtarea' : 'Nueva tarea o acuerdo'}
      subtitle={tareaPadre ? `Dentro de: ${tareaPadre.titulo}` : null}
      onClose={onCerrar}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            Se notificará al responsable si no eres tú.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onCerrar}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" form="form-tarea" disabled={guardando}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2">
              {guardando && <Loader2 size={15} className="animate-spin" />}
              Crear
            </button>
          </div>
        </div>
      }
    >
      <form id="form-tarea" onSubmit={enviar} className="space-y-4">

        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        {!tareaPadre && (
          <div className="grid grid-cols-3 gap-2">
            {(catalogos?.tipos || []).map(t => (
              <button key={t.valor} type="button" onClick={() => set('tipo', t.valor)}
                className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition
                  ${f.tipo === t.valor
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                {t.etiqueta}
              </button>
            ))}
          </div>
        )}

        <Campo label="Título" requerido>
          <input className={inputCls} value={f.titulo} maxLength={300} autoFocus
            onChange={e => set('titulo', e.target.value)}
            placeholder="Ej: Enviar conciliación bancaria de julio" />
        </Campo>

        <Campo label="Descripción">
          <textarea className={inputCls} rows={3} value={f.descripcion}
            onChange={e => set('descripcion', e.target.value)}
            placeholder="Detalle de lo que se espera, contexto del acuerdo, entregables…" />
        </Campo>

        <div className="grid sm:grid-cols-2 gap-4">
          <Campo label="Responsable" requerido
                 ayuda="Una sola persona rinde cuentas. Puedes asignar a NOVONET o VELSA.">
            <select className={inputCls} value={f.responsable_id}
              onChange={e => set('responsable_id', e.target.value)}>
              <option value="">Selecciona…</option>
              {porArea.map(([area, usuarios]) => (
                <optgroup key={area} label={area}>
                  {usuarios.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.nombre} · {u.cargo_nombre} · {u.empresa}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Campo>

          <Campo label="Prioridad">
            <div className="grid grid-cols-4 gap-1">
              {(catalogos?.prioridades || []).map(p => (
                <button key={p.valor} type="button" onClick={() => set('prioridad', p.valor)}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium transition
                    ${f.prioridad === p.valor
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                  {p.etiqueta}
                </button>
              ))}
            </div>
          </Campo>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Campo label="Se pide desde" requerido>
            <input type="date" className={inputCls} value={f.fecha_solicitud}
              onChange={e => set('fecha_solicitud', e.target.value)} />
          </Campo>

          <Campo label="Debe entregar hasta" requerido>
            <input type="date" className={inputCls} value={f.fecha_limite}
              min={f.fecha_solicitud}
              onChange={e => set('fecha_limite', e.target.value)} />
          </Campo>
        </div>

        {retroactiva && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            Esta tarea nacerá vencida. Si estás registrando un acuerdo anterior,
            recuerda ajustar también la fecha desde la que se pide.
          </div>
        )}

        {!tareaPadre && (
          <Campo label="¿A qué empresa corresponde?"
                 ayuda="Sirve para filtrar y reportar. No limita a quién puedes asignarle.">
            <div className="grid grid-cols-2 gap-2">
              {(catalogos?.empresas || ['NOVONET', 'VELSA']).map(emp => (
                <button key={emp} type="button" onClick={() => set('empresa', emp)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition
                    ${f.empresa === emp
                      ? (emp === 'VELSA'
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-blue-500 bg-blue-50 text-blue-700')
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  {emp}
                </button>
              ))}
            </div>
          </Campo>
        )}

        {(catalogos?.proyectos || []).length > 0 && !tareaPadre && (
          <Campo label="Proyecto" ayuda="Opcional. Agrupa tareas relacionadas.">
            <select className={inputCls} value={f.proyecto_id}
              onChange={e => set('proyecto_id', e.target.value)}>
              <option value="">Sin proyecto</option>
              {catalogos.proyectos.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </Campo>
        )}

        <Campo label="Áreas involucradas"
               ayuda="Las jefaturas de estas áreas podrán ver la tarea y recibirán aviso.">
          <div className="flex flex-wrap gap-1.5">
            {(catalogos?.areas || []).map(a => {
              const on = f.areas_involucradas.includes(a.id);
              return (
                <button key={a.id} type="button" onClick={() => toggleArea(a.id)}
                  className="rounded-full px-2.5 py-1 text-xs font-medium border transition"
                  style={on
                    ? { backgroundColor: a.color + '20', borderColor: a.color, color: a.color }
                    : { borderColor: '#e2e8f0', color: '#64748b' }}>
                  {a.nombre}
                </button>
              );
            })}
          </div>
        </Campo>

        {responsable && (
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
            <Avatar nombre={responsable.nombre} size={30} />
            <div className="text-sm min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="font-medium text-slate-700">{responsable.nombre}</p>
                <EmpresaBadge empresa={responsable.empresa} />
              </div>
              <p className="text-xs text-slate-500">
                {responsable.area_nombre} · {responsable.cargo_nombre}
              </p>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
