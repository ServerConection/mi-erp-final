import { useMemo, useState } from 'react';
import { SEVERITY_META, hasActiveFilters } from '../../utils/contactabilidadAnalytics.js';

const control = {
  padding: '9px 10px', border: '1px solid #cbd5e1', borderRadius: 8,
  background: '#fff', color: '#0f172a', fontSize: 13,
};
const etiqueta = { fontSize: 12, color: '#475569', display: 'flex', flexDirection: 'column', gap: 4 };
const boton = { ...control, cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' };

const ESPERAS = [
  ['', 'Cualquiera'], ['15', 'Más de 15 min'], ['30', 'Más de 30 min'],
  ['60', 'Más de 1 hora'], ['240', 'Más de 4 horas'], ['1440', 'Más de 1 día'],
];

/**
 * Filtros del tablero.
 * Los catalogos llegan del endpoint /filtros (no de los resultados ya
 * filtrados): asi elegir un asesor no vacia la lista de asesores.
 */
export default function ContactabilidadFilters({
  filters, options = {}, onChange, onReset,
  vistas = [], onGuardarVista, onAplicarVista, onEliminarVista, onCopiarEnlace,
}) {
  const [nombreVista, setNombreVista] = useState('');
  const [compartida, setCompartida] = useState(false);

  const set = (key) => (event) => onChange({ ...filters, [key]: event.target.value });
  const toggle = (key) => (event) => onChange({ ...filters, [key]: event.target.checked ? 'true' : '' });

  const activos = useMemo(() => hasActiveFilters(filters), [filters]);
  const conteo = (item) => (item.leads != null ? ` (${item.leads})` : '');

  const guardar = () => {
    const nombre = nombreVista.trim();
    if (!nombre) return;
    onGuardarVista?.({ nombre, compartida, filtros: filters });
    setNombreVista('');
  };

  return <div style={{ display: 'grid', gap: 12, padding: 14, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, marginTop: 14 }}>

    {/* --- Alcance: sobre que universo de leads miramos ---------------------- */}
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
      <label style={etiqueta}>Desde
        <input style={control} type="date" value={filters.desde} onChange={set('desde')} /></label>
      <label style={etiqueta}>Hasta
        <input style={control} type="date" value={filters.hasta} onChange={set('hasta')} /></label>
      <label style={etiqueta}>Empresa
        <select style={control} value={filters.empresa} onChange={set('empresa')}>
          <option value="">Todas</option>
          {(options.empresas || []).map((v) => <option key={v} value={v}>{v}</option>)}
        </select></label>
      <label style={etiqueta}>Origen
        <select style={{ ...control, minWidth: 180 }} value={filters.origen} onChange={set('origen')}>
          <option value="">Todos</option>
          {(options.origenes || []).map((o) => <option key={o.valor} value={o.valor}>{o.valor}{conteo(o)}</option>)}
        </select></label>
      <label style={etiqueta}>Asesor
        <select style={{ ...control, minWidth: 200 }} value={filters.asesor_id} onChange={set('asesor_id')}>
          <option value="">Todos</option>
          {(options.asesores || []).map((a) => <option key={a.id} value={a.id}>{a.nombre}{conteo(a)}</option>)}
        </select></label>
      <label style={etiqueta}>Etapa
        <select style={{ ...control, minWidth: 190 }} value={filters.etapa} onChange={set('etapa')}>
          <option value="">Todas</option>
          {(options.etapas || []).map((e) => <option key={e.valor} value={e.valor}>{e.valor}{conteo(e)}</option>)}
        </select></label>
      <label style={{ ...etiqueta, flex: '1 1 220px' }}>Buscar cliente, asesor o ID
        <input style={control} type="search" placeholder="Ej. Maria, Diego, 15243"
          value={filters.q} onChange={set('q')} /></label>
    </div>

    {/* --- Operacion: quien espera, hace cuanto y con que gravedad ----------- */}
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', borderTop: '1px dashed #e2e8f0', paddingTop: 12 }}>
      <label style={etiqueta}>Pendiente por
        <select style={control} value={filters.pendiente_por} onChange={set('pendiente_por')}>
          <option value="">Indiferente</option>
          <option value="ASESOR">El asesor debe responder</option>
          <option value="CLIENTE">Esperamos al cliente</option>
        </select></label>
      <label style={etiqueta}>Gravedad
        <select style={{ ...control, minWidth: 160 }} value={filters.severidad} onChange={set('severidad')}>
          <option value="">Todas</option>
          <option value="CRITICO">Solo críticos</option>
          <option value="CRITICO,GRAVE">Críticos y graves</option>
          <option value="CRITICO,GRAVE,ALERTA">Todo lo vencido</option>
          <option value="OK">Solo al día</option>
        </select></label>
      <label style={etiqueta}>Esperando
        <select style={{ ...control, minWidth: 150 }} value={filters.min_espera} onChange={set('min_espera')}>
          {ESPERAS.map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
        </select></label>
      <label style={etiqueta}>Temperatura
        <select style={control} value={filters.temperatura} onChange={set('temperatura')}>
          <option value="">Todas</option>
          {(options.temperaturas || ['CALIENTE', 'TIBIO', 'FRIO']).map((t) =>
            <option key={t} value={t}>{t}</option>)}
        </select></label>
      <label style={{ ...etiqueta, flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 9 }}>
        <input type="checkbox" checked={filters.solo_con_mensajes === 'true'} onChange={toggle('solo_con_mensajes')} />
        Solo con conversación
      </label>

      <button type="button" onClick={onReset} style={{ ...boton, opacity: activos ? 1 : 0.5 }}>Limpiar</button>
      <button type="button" onClick={onCopiarEnlace} style={boton} title="Copia el enlace con estos filtros">
        Copiar enlace
      </button>
    </div>

    {/* --- Vistas guardadas: el equipo comparte los mismos criterios --------- */}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px dashed #e2e8f0', paddingTop: 12 }}>
      <span style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>Vistas</span>
      {vistas.length === 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>Aún no guardas ninguna</span>}
      {vistas.map((vista) => <span key={vista.id}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f1f5f9', borderRadius: 999, padding: '5px 6px 5px 12px' }}>
        <button type="button" onClick={() => onAplicarVista?.(vista)}
          style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>
          {vista.nombre}{vista.compartida ? ' ·  equipo' : ''}
        </button>
        {vista.propia && <button type="button" title="Eliminar vista" onClick={() => onEliminarVista?.(vista)}
          style={{ border: 0, background: '#e2e8f0', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', color: '#475569', lineHeight: 1 }}>×</button>}
      </span>)}
      <span style={{ flex: 1 }} />
      <input style={{ ...control, minWidth: 170 }} placeholder="Nombre de la vista"
        value={nombreVista} onChange={(e) => setNombreVista(e.target.value)} />
      <label style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 5 }}>
        <input type="checkbox" checked={compartida} onChange={(e) => setCompartida(e.target.checked)} />
        Compartir
      </label>
      <button type="button" onClick={guardar} disabled={!nombreVista.trim()}
        style={{ ...boton, opacity: nombreVista.trim() ? 1 : 0.5 }}>Guardar vista</button>
    </div>

    {/* --- Leyenda de gravedad: el mismo lenguaje en todo el tablero --------- */}
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: '#64748b' }}>
      {Object.entries(SEVERITY_META).map(([clave, meta]) => <span key={clave}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: meta.color }} />{meta.label}
      </span>)}
      {options.umbrales && <span>
        · Crítico a los {options.umbrales.critico} min, grave a los {options.umbrales.grave} min,
        alerta a los {options.umbrales.alerta} min sin responder
      </span>}
    </div>
  </div>;
}
