import { useState } from 'react';
import {
  severityMeta, rowSeverity, waitingMinutes, formatRelative,
} from '../../utils/contactabilidadAnalytics.js';

const fmt = (valor) => (valor ? new Date(valor).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' }) : '—');
const th = { padding: 10, textAlign: 'left', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', fontSize: 11, color: '#475569' };
const td = { padding: 10, borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' };

const COLUMNAS = ['Gravedad', 'Esperando', 'Empresa', 'ID', 'Cliente', 'Asesor', 'Origen', 'Etapa',
  'Msg. cliente', 'Msg. asesor', 'Últ. cliente', 'Últ. asesor', 'Pendiente', ''];

/**
 * Tabla operativa.
 * Las horas del ultimo mensaje se muestran en absoluto Y en relativo: el
 * relativo se recalcula en el navegador cada segundo, de modo que la antiguedad
 * es correcta aunque el backend no haya vuelto a responder todavia.
 */
export default function ContactabilidadOperationalTable({
  rows = [], loading, umbrales, ahora, onRefrescarLead,
}) {
  const [refrescando, setRefrescando] = useState(null);

  const refrescar = async (fila) => {
    if (!onRefrescarLead) return;
    setRefrescando(`${fila.empresa}-${fila.id_bitrix}`);
    try { await onRefrescarLead(fila); } finally { setRefrescando(null); }
  };

  return <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead><tr>{COLUMNAS.map((h, i) => <th key={`${h}-${i}`} style={th}>{h}</th>)}</tr></thead>
      <tbody>
        {loading && !rows.length
          ? <tr><td colSpan={COLUMNAS.length} style={{ padding: 30, textAlign: 'center' }}>Cargando…</td></tr>
          : !rows.length
            ? <tr><td colSpan={COLUMNAS.length} style={{ padding: 30, textAlign: 'center', color: '#64748b' }}>
              No hay leads para estos filtros. Revisa el rango de fechas o limpia los filtros operativos.
            </td></tr>
            : rows.map((fila) => {
              const clave = `${fila.empresa}-${fila.id_bitrix}`;
              const severidad = rowSeverity(fila, umbrales, ahora);
              const meta = severityMeta(severidad);
              const minutos = waitingMinutes(fila, ahora) ?? fila.minutos_pendiente;
              const enCurso = refrescando === clave;
              return <tr key={clave} style={{ background: severidad === 'CRITICO' ? '#fff5f5' : 'transparent' }}>
                <td style={td}>
                  <span style={{ background: meta.bg, color: meta.color, borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 800 }}>
                    {meta.label}
                  </span>
                </td>
                <td style={{ ...td, fontWeight: severidad === 'OK' ? 400 : 800, color: meta.color }}>
                  {minutos != null ? `${minutos} min` : '—'}
                </td>
                <td style={td}>{fila.empresa}</td>
                <td style={td}>{fila.id_bitrix}</td>
                <td style={td}>{fila.nombre_cliente || '—'}</td>
                <td style={td}>{fila.asesor_nombre || '—'}</td>
                <td style={td}>{fila.origen_nombre || '—'}</td>
                <td style={td}>{fila.etapa_nombre || fila.etapa_id || '—'}</td>
                <td style={td}>{fila.mensajes_cliente_total ?? 0}</td>
                <td style={td}>{fila.mensajes_asesor_total ?? 0}</td>
                <td style={td} title={fmt(fila.ultimo_mensaje_cliente_at)}>
                  {formatRelative(fila.ultimo_mensaje_cliente_at, ahora)}
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{fmt(fila.ultimo_mensaje_cliente_at)}</div>
                </td>
                <td style={td} title={fmt(fila.ultimo_mensaje_asesor_at)}>
                  {formatRelative(fila.ultimo_mensaje_asesor_at, ahora)}
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{fmt(fila.ultimo_mensaje_asesor_at)}</div>
                </td>
                <td style={td}>{fila.pendiente_por || '—'}</td>
                <td style={td}>
                  {onRefrescarLead && <button type="button" onClick={() => refrescar(fila)} disabled={enCurso}
                    title="Traer este chat de Bitrix ahora"
                    style={{
                      border: '1px solid #cbd5e1', background: '#fff', borderRadius: 7,
                      padding: '4px 9px', cursor: enCurso ? 'wait' : 'pointer', fontSize: 12,
                    }}>{enCurso ? '…' : '⟳'}</button>}
                </td>
              </tr>;
            })}
      </tbody>
    </table>
  </div>;
}
