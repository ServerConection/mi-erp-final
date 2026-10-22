import { useMemo, useState } from 'react';
import { ClipboardEdit, Image as ImageIcon, Monitor, Plus, UserRound, X } from 'lucide-react';
import PLANO_NOVONET from '../data/planoNovonet';
import PLANO_VELSA from '../data/planoVelsa';

const COLORES = {
  GERENCIA: { fondo: '#EEEDFE', borde: '#AFA9EC', texto: '#3C3489' },
  SUPERVISOR: { fondo: '#E6F1FB', borde: '#85B7EB', texto: '#042C53' },
  ASESOR: { fondo: '#E1F5EE', borde: '#5DCAA5', texto: '#085041' },
  COORDINACION: { fondo: '#FAEEDA', borde: '#EF9F27', texto: '#633806' },
  DESARROLLO: { fondo: '#E0E7FF', borde: '#818CF8', texto: '#3730A3' },
  ANALISTA: { fondo: '#FBEAF0', borde: '#ED93B1', texto: '#72243E' },
  ATC: { fondo: '#CCFBF1', borde: '#2DD4BF', texto: '#115E59' },
  CONSULTOR: { fondo: '#FCE7F3', borde: '#F472B6', texto: '#9D174D' },
  CONTABILIDAD: { fondo: '#FEF3C7', borde: '#F59E0B', texto: '#92400E' },
  OTRO: { fondo: '#E2E8F0', borde: '#94A3B8', texto: '#334155' },
  SIN_ASIGNAR: { fondo: '#F8FAFC', borde: '#CBD5E1', texto: '#64748B' },
  SIN_REGISTRAR: { fondo: '#F8FAFC', borde: '#CBD5E1', texto: '#94A3B8' },
};

const normalizar = (valor) => String(valor || '').trim().replace(/\s+/g, ' ').toUpperCase();

export function categoriaPuesto(activo) {
  if (!activo) return 'SIN_REGISTRAR';
  if (!activo.usuario_asignado_id) return 'SIN_ASIGNAR';
  const cargo = normalizar(activo.usuario_asignado_cargo).replace('SUPEVISOR', 'SUPERVISOR').replace('CONUSLTOR', 'CONSULTOR');
  const perfil = normalizar(activo.usuario_asignado_perfil);
  const detectar = (fuente) => {
    if (/GERENCIA|GERENTE/.test(fuente)) return 'GERENCIA';
    if (/SUPERVISOR/.test(fuente)) return 'SUPERVISOR';
    if (/COORDINADOR/.test(fuente)) return 'COORDINACION';
    if (/DESARROLLO/.test(fuente)) return 'DESARROLLO';
    if (/ANALISTA/.test(fuente)) return 'ANALISTA';
    if (/ASESOR/.test(fuente)) return 'ASESOR';
    if (/ATC/.test(fuente)) return 'ATC';
    if (/CONSULTOR/.test(fuente)) return 'CONSULTOR';
    if (/CONTADOR|CONTABILIDAD/.test(fuente)) return 'CONTABILIDAD';
    return null;
  };
  return detectar(cargo) || detectar(perfil) || 'OTRO';
}

const marcaRenovacion = (activo) => {
  if (activo?.estado === 'DE BAJA') return '#94A3B8';
  return { MANTENER: '#10B981', POTENCIAR: '#F59E0B', REEMPLAZAR: '#EF4444' }[activo?.cambio_reemplazo] || 'transparent';
};

const nombreCorto = (activo) => {
  const nombre = activo?.usuario_asignado_nombre || activo?.usuario_asignado_usuario;
  return nombre ? nombre.trim().split(/\s+/)[0] : activo ? 'SIN ASIGNAR' : 'SIN REGISTRAR';
};

function Casilla({ configuracion, activo, seleccionada, onSeleccionar }) {
  const categoria = categoriaPuesto(activo);
  const color = COLORES[categoria];
  const forma = configuracion.forma === 'OVALO' ? 'rounded-[999px]' : configuracion.forma === 'PEQUENA' ? 'rounded-lg scale-90' : 'rounded-xl';
  return <button
    type="button"
    onClick={onSeleccionar}
    className={`relative flex min-h-[58px] min-w-0 flex-col items-center justify-center overflow-hidden border-2 px-0.5 py-1 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:min-h-[64px] sm:px-1 ${forma} ${seleccionada ? 'ring-4 ring-blue-200' : ''}`}
    style={{
      gridRow: configuracion.centradaEntreFilas ? `${configuracion.fila} / span 2` : configuracion.fila,
      gridColumn: configuracion.centradaEntreColumnas ? `${configuracion.columna} / span 2` : configuracion.columna,
      justifySelf: configuracion.centradaEntreColumnas ? 'center' : undefined,
      width: configuracion.centradaEntreColumnas ? '50%' : undefined,
      alignSelf: configuracion.centradaEntreFilas ? 'center' : undefined,
      height: configuracion.centradaEntreFilas ? '50%' : undefined,
      background: color.fondo,
      borderColor: color.borde,
      color: color.texto,
    }}
  >
    <span className="max-w-full truncate text-[8px] font-black tracking-tight sm:text-[10px]">{configuracion.id}</span>
    <span className="mt-0.5 max-w-full truncate text-[7px] font-bold sm:text-[9px]">{nombreCorto(activo)}</span>
    <span className="max-w-full truncate text-[6px] opacity-70 sm:text-[8px]">{activo?.usuario_asignado_cargo || categoria.replace('_', ' ')}</span>
    <span className="absolute bottom-1 right-1 h-2 w-2 rounded-full border border-white shadow" style={{ background: marcaRenovacion(activo) }} />
  </button>;
}

function DetallePlano({ seleccion, activo, esAdmin, empresaPlano, urlFoto, onCerrar, onRegistrar, onEditar }) {
  if (!seleccion) return <div className="flex min-h-72 flex-col items-center justify-center px-5 text-center text-slate-400"><Monitor size={48} className="mb-4 text-slate-300"/><p className="font-black text-slate-600">Selecciona un equipo</p><p className="mt-1 text-xs">Haz clic en una casilla del plano.</p></div>;
  if (!activo) return <div className="flex min-h-72 flex-col items-center justify-center px-5 text-center"><div className="mb-4 rounded-2xl bg-slate-100 p-4"><Monitor size={38} className="text-slate-400"/></div><p className="text-lg font-black text-slate-800">{seleccion}</p><p className="mt-1 text-sm font-bold text-slate-400">SIN REGISTRAR</p><button type="button" onClick={() => onRegistrar(seleccion, empresaPlano)} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white"><Plus size={17}/> Registrar este equipo</button></div>;

  const datos = [
    ['Usuario', activo.usuario_asignado_nombre || 'SIN ASIGNAR'], ['Cargo', activo.usuario_asignado_cargo || '-'],
    ['Tipo', activo.tipo_dispositivo], ['Marca / modelo', [activo.marca, activo.modelo].filter(Boolean).join(' · ')],
    ['Serie / MAC', activo.numero_serie], ['RAM', activo.ram_gb == null ? '-' : `${activo.ram_gb} GB`],
    ['Disco', [activo.disco_tipo, activo.disco_gb == null ? null : `${activo.disco_gb} GB`].filter(Boolean).join(' · ')],
    ['Area', activo.area], ['Estado', activo.estado], ['Renovacion', activo.cambio_reemplazo || '-'],
  ];
  return <div className="flex min-h-72 flex-col">
    <div className="flex items-start justify-between border-b border-slate-100 p-4"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Equipo</p><h3 className="text-xl font-black text-slate-900">{activo.id}</h3></div><button type="button" onClick={onCerrar} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div>
    {activo.foto ? <img src={urlFoto(activo.foto)} alt={activo.id} className="max-h-52 w-full bg-slate-50 object-contain"/> : <div className="flex h-28 items-center justify-center bg-slate-50 text-slate-300"><ImageIcon size={36}/></div>}
    <div className="divide-y divide-slate-100 px-4">{datos.map(([etiqueta, valor]) => <div key={etiqueta} className="grid grid-cols-[105px_1fr] gap-2 py-2 text-xs"><span className="font-bold text-slate-400">{etiqueta}</span><span className="min-w-0 break-words font-semibold text-slate-700">{valor || '-'}</span></div>)}</div>
    {esAdmin && <div className="mt-auto border-t border-slate-100 p-4"><button type="button" onClick={() => onEditar(activo)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white"><ClipboardEdit size={17}/> Editar</button></div>}
  </div>;
}

function Leyenda({ activos }) {
  const conteos = useMemo(() => activos.reduce((acc, activo) => { const categoria = categoriaPuesto(activo); acc[categoria] = (acc[categoria] || 0) + 1; return acc; }, {}), [activos]);
  return <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">{Object.entries(COLORES).map(([categoria, color]) => <span key={categoria} className="inline-flex items-center gap-1.5 rounded-full border border-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600"><i className="h-2.5 w-2.5 rounded-full" style={{ background: color.borde }}/>{categoria.replace('_', ' ')} {conteos[categoria] ? `(${conteos[categoria]})` : ''}</span>)}</div>;
}

export default function PlanoInventarioActivos({ activos, cargando, esAdmin, urlFoto, onRegistrar, onEditar }) {
  const [empresa, setEmpresa] = useState('NOVONET');
  const [seleccion, setSeleccion] = useState(null);
  const plano = empresa === 'NOVONET' ? PLANO_NOVONET : PLANO_VELSA;
  const porId = useMemo(() => Object.fromEntries(activos.map(a => [a.id, a])), [activos]);
  const activoSeleccionado = seleccion ? porId[seleccion] : null;
  const activosPlano = plano.casillas.map(c => porId[c.id]).filter(Boolean);
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">{['NOVONET', 'VELSA'].map(nombre => <button type="button" key={nombre} onClick={() => { setEmpresa(nombre); setSeleccion(null); }} className={`min-h-11 rounded-xl px-5 py-2 text-sm font-black ${empresa === nombre ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{nombre}</button>)}</div>
    <Leyenda activos={activosPlano}/>
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 text-center text-xs font-black uppercase tracking-[0.16em] text-slate-400">{empresa} · Inventario de puestos</div>
        <div className="w-full p-2 sm:p-4">
          {cargando ? <div className="flex min-h-72 items-center justify-center font-bold text-slate-400">Cargando plano...</div> : <div className="grid w-full gap-1 sm:gap-2" style={{ gridTemplateColumns: `repeat(${plano.columnas}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${plano.filas}, minmax(58px, auto))` }}>{plano.casillas.map(c => <Casilla key={c.id} configuracion={c} activo={porId[c.id]} seleccionada={seleccion === c.id} onSeleccionar={() => setSeleccion(seleccion === c.id ? null : c.id)}/>)}</div>}
        </div>
      </div>
      <aside className="w-full shrink-0 lg:w-80"><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-4"><DetallePlano seleccion={seleccion} activo={activoSeleccionado} esAdmin={esAdmin} empresaPlano={empresa} urlFoto={urlFoto} onCerrar={() => setSeleccion(null)} onRegistrar={onRegistrar} onEditar={onEditar}/></div></aside>
    </div>
    <div className="flex flex-wrap gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-bold text-slate-500"><span>Renovacion:</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500"/>MANTENER</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-amber-500"/>POTENCIAR</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-red-500"/>REEMPLAZAR</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-slate-400"/>DE BAJA</span></div>
  </div>;
}
