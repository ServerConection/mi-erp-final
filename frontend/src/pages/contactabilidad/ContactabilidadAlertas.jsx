import { SEVERITY_META, severityMeta, formatRelative, waitingMinutes } from '../../utils/contactabilidadAnalytics.js';

const tarjeta = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 };
const th = { padding: 9, textAlign: 'left', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', fontSize: 11, color: '#475569' };
const td = { padding: 9, borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' };

const Chip = ({ severidad, children }) => {
  const meta = severityMeta(severidad);
  return <span style={{
    background: meta.bg, color: meta.color, borderRadius: 999,
    padding: '2px 9px', fontSize: 11, fontWeight: 800,
  }}>{children ?? meta.label}</span>;
};

function TablaDimension({ titulo, filas = [], columna, onFiltrar }) {
  const conCasos = filas.filter((f) => f.critico + f.grave + f.alerta > 0).slice(0, 12);
  return <div style={tarjeta}>
    <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>{titulo}</h3>
    {!conCasos.length
      ? <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Sin casos vencidos. Todo al día.</p>
      : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr>
          <th style={th}>{columna}</th><th style={th}>Crítico</th><th style={th}>Grave</th>
          <th style={th}>Alerta</th><th style={th}>Peor espera</th>
        </tr></thead>
        <tbody>{conCasos.map((fila) => <tr key={fila.etiqueta || fila.asesor_id || fila.asesor_nombre}>
          <td style={{ ...td, fontWeight: 600, cursor: onFiltrar ? 'pointer' : 'default', color: onFiltrar ? '#1d4ed8' : 'inherit' }}
            onClick={() => onFiltrar?.(fila)}>
            {fila.etiqueta || fila.asesor_nombre}
          </td>
          <td style={td}>{fila.critico ? <Chip severidad="CRITICO">{fila.critico}</Chip> : '—'}</td>
          <td style={td}>{fila.grave ? <Chip severidad="GRAVE">{fila.grave}</Chip> : '—'}</td>
          <td style={td}>{fila.alerta ? <Chip severidad="ALERTA">{fila.alerta}</Chip> : '—'}</td>
          <td style={td}>{fila.espera_maxima_min != null ? `${fila.espera_maxima_min} min` : '—'}</td>
        </tr>)}</tbody>
      </table></div>}
  </div>;
}

/**
 * Tablero de alertas: cuantos casos vencidos hay, de quien son y donde ocurren.
 * Al hacer clic en un asesor, etapa u origen se filtra el tablero completo.
 */
export default function ContactabilidadAlertas({
  alertas = {}, umbrales = {}, ahora, onFiltrarAsesor, onFiltrarEtapa, onFiltrarOrigen, onAbrirLead,
}) {
  const resumen = alertas.resumen || {};
  const tarjetas = [
    ['CRITICO', resumen.critico, `Más de ${umbrales.critico ?? 60} min sin responder`],
    ['GRAVE', resumen.grave, `Más de ${umbrales.grave ?? 30} min sin responder`],
    ['ALERTA', resumen.alerta, `Más de ${umbrales.alerta ?? 15} min sin responder`],
    ['OK', resumen.ok, 'Sin deuda de respuesta'],
  ];

  const criticos = (alertas.criticos || []).slice(0, 15);

  return <div style={{ display: 'grid', gap: 14 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
      {tarjetas.map(([clave, valor, ayuda]) => {
        const meta = SEVERITY_META[clave];
        return <div key={clave} style={{ ...tarjeta, borderTop: `3px solid ${meta.color}` }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: .4, color: '#64748b' }}>{meta.label}</div>
          <strong style={{ display: 'block', marginTop: 6, fontSize: 28, color: meta.color }}>{valor ?? 0}</strong>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{ayuda}</span>
        </div>;
      })}
    </div>

    {resumen.espera_maxima_min != null && <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
      El caso más antiguo lleva <strong>{resumen.espera_maxima_min} min</strong> esperando respuesta
      {resumen.espera_mediana_min != null && <> · mediana de espera {Math.round(resumen.espera_mediana_min)} min</>}
    </p>}

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14 }}>
      <TablaDimension titulo="Por asesor" columna="Asesor" filas={alertas.por_asesor} onFiltrar={onFiltrarAsesor} />
      <TablaDimension titulo="Por etapa" columna="Etapa" filas={alertas.por_etapa} onFiltrar={onFiltrarEtapa} />
      <TablaDimension titulo="Por origen" columna="Origen" filas={alertas.por_origen} onFiltrar={onFiltrarOrigen} />
    </div>

    {criticos.length > 0 && <div style={tarjeta}>
      <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>Atender primero</h3>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr>{['Gravedad', 'Esperando', 'Cliente', 'Asesor', 'Etapa', 'Origen', 'Escribió', ''].map((h, i) =>
          <th key={`${h}-${i}`} style={th}>{h}</th>)}</tr></thead>
        <tbody>{criticos.map((fila) => {
          const minutos = waitingMinutes(fila, ahora) ?? fila.minutos_pendiente;
          return <tr key={`${fila.empresa}-${fila.id_bitrix}`}>
            <td style={td}><Chip severidad={fila.severidad} /></td>
            <td style={{ ...td, fontWeight: 800 }}>{minutos != null ? `${minutos} min` : '—'}</td>
            <td style={td}>{fila.nombre_cliente || '—'}</td>
            <td style={td}>{fila.asesor_nombre || 'SIN ASESOR'}</td>
            <td style={td}>{fila.etapa_nombre || '—'}</td>
            <td style={td}>{fila.origen_nombre || '—'}</td>
            <td style={td}>{formatRelative(fila.ultimo_mensaje_cliente_at, ahora)}</td>
            <td style={td}>
              {onAbrirLead && <button type="button" onClick={() => onAbrirLead(fila)}
                title="Ver la conversación en Bitrix"
                style={{
                  border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8',
                  borderRadius: 7, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                }}>💬 Ver</button>}
            </td>
          </tr>;
        })}</tbody>
      </table></div>
    </div>}
  </div>;
}
