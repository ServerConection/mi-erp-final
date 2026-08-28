import { formatRelative } from '../../utils/contactabilidadAnalytics.js';

const boton = {
  padding: '9px 14px', borderRadius: 9, border: '1px solid #cbd5e1',
  background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#0f172a',
};
const primario = { ...boton, background: '#1d4ed8', borderColor: '#1d4ed8', color: '#fff' };

const INTERVALOS = [
  ['30', '30 s'], ['60', '1 min'], ['300', '5 min'], ['0', 'Apagado'],
];

/**
 * Barra de actualizacion.
 *  - "Actualizar" relee la base con los filtros actuales (instantaneo).
 *  - "Traer de Bitrix" fuerza el ciclo contra el CRM (solo administradores,
 *    con cooldown en el servidor para no romper el limite de la API).
 *  - El auto-refresco se pausa solo cuando la pestaña no esta visible.
 */
export default function ContactabilidadToolbar({
  ultimaCarga, cargando, sincronizando, intervalo, onIntervalo,
  onRefrescar, onForzar, puedeForzar, estado, ahora, mensaje,
}) {
  const pausado = intervalo === '0';
  const frescura = ultimaCarga ? formatRelative(ultimaCarga, ahora) : 'sin cargar';
  const desfase = estado?.frescura?.reduce((max, fila) => {
    const valor = fila.ultimo_mensaje ? new Date(fila.ultimo_mensaje).getTime() : 0;
    return Math.max(max, valor);
  }, 0);

  return <div style={{
    display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
    padding: 12, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, marginTop: 14,
  }}>
    <button type="button" onClick={onRefrescar} disabled={cargando} style={{ ...primario, opacity: cargando ? 0.6 : 1 }}>
      {cargando ? 'Actualizando…' : '⟳ Actualizar'}
    </button>

    {puedeForzar && <button type="button" onClick={onForzar} disabled={sincronizando}
      title="Consulta Bitrix ahora mismo para los chats activos"
      style={{ ...boton, opacity: sincronizando ? 0.6 : 1 }}>
      {sincronizando ? 'Consultando Bitrix…' : '⇅ Traer de Bitrix'}
    </button>}

    <label style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
      Auto
      <select value={intervalo} onChange={(e) => onIntervalo(e.target.value)}
        style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}>
        {INTERVALOS.map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
      </select>
    </label>

    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
      color: pausado ? '#94a3b8' : '#15803d',
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: pausado ? '#cbd5e1' : '#22c55e',
      }} />
      {pausado ? 'Auto-refresco apagado' : 'En vivo'}
    </span>

    <span style={{ fontSize: 12, color: '#64748b' }}>Datos {frescura}</span>

    {desfase > 0 && <span style={{ fontSize: 12, color: '#64748b' }}>
      · último mensaje registrado {formatRelative(desfase, ahora)}
    </span>}

    {estado && <span style={{
      fontSize: 11, padding: '4px 9px', borderRadius: 999,
      background: estado.webhook_activo ? '#dcfce7' : '#fef9c3',
      color: estado.webhook_activo ? '#166534' : '#854d0e', fontWeight: 700,
    }} title={estado.webhook_activo
      ? 'Bitrix está empujando los mensajes en tiempo real'
      : 'Sin eventos de webhook en 24 h: el dato llega por el ciclo programado'}>
      {estado.webhook_activo ? 'Tiempo real activo' : 'Solo ciclo programado'}
    </span>}

    <span style={{ flex: 1 }} />
    {mensaje && <span style={{ fontSize: 12, color: mensaje.tipo === 'error' ? '#b91c1c' : '#15803d' }}>
      {mensaje.texto}
    </span>}
  </div>;
}
