import { useEffect, useRef } from 'react';
import { formatDuration, formatRelative } from '../../utils/contactabilidadAnalytics.js';

const hora = (valor) => (valor
  ? new Date(valor).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'short', timeStyle: 'short' })
  : '');

const ESTILO = {
  CLIENTE: { fila: 'flex-start', fondo: '#f1f5f9', color: '#0f172a', borde: '#e2e8f0' },
  ASESOR: { fila: 'flex-end', fondo: '#dbeafe', color: '#0f172a', borde: '#bfdbfe' },
  SISTEMA: { fila: 'center', fondo: '#fef9c3', color: '#713f12', borde: '#fde68a' },
};

/**
 * Conversacion en vivo tal como esta en Bitrix.
 * El texto no se guarda en la base: se pide al abrir y se descarta al cerrar.
 */
export default function ContactabilidadConversacion({
  lead, data, cargando, error, ahora, onCerrar, onRecargar,
}) {
  const fondo = useRef(null);
  const final = useRef(null);

  // Escape cierra, como cualquier modal del sistema.
  useEffect(() => {
    const alTeclear = (evento) => { if (evento.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  // Al cargar se baja al mensaje mas reciente, que es lo que interesa.
  useEffect(() => {
    if (!cargando && data?.mensajes?.length) final.current?.scrollIntoView({ block: 'end' });
  }, [cargando, data]);

  const mensajes = data?.mensajes || [];
  const info = data?.lead || {};

  return <div
    ref={fondo}
    onMouseDown={(evento) => { if (evento.target === fondo.current) onCerrar(); }}
    style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
    <div role="dialog" aria-label="Conversación del lead" style={{
      background: '#fff', borderRadius: 14, width: 'min(720px, 100%)', maxHeight: '90vh',
      display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(15,23,42,.3)',
    }}>

      {/* Cabecera: de quien es esta conversacion */}
      <div style={{ padding: '16px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 12, alignItems: 'start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>
            {info.nombre_cliente || data?.cliente_nombre || 'Cliente sin nombre'}
          </h2>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            {lead?.empresa} · #{lead?.id_bitrix}
            {info.asesor_nombre && <> · Asesor: <strong>{info.asesor_nombre}</strong></>}
            {info.etapa_nombre && <> · {info.etapa_nombre}</>}
            {info.origen_nombre && <> · {info.origen_nombre}</>}
          </div>
        </div>
        <button type="button" onClick={onRecargar} disabled={cargando} title="Volver a leer de Bitrix"
          style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8, padding: '6px 11px', cursor: 'pointer' }}>
          {cargando ? '…' : '⟳'}
        </button>
        <button type="button" onClick={onCerrar} aria-label="Cerrar"
          style={{ border: 0, background: '#e2e8f0', borderRadius: 8, padding: '6px 11px', cursor: 'pointer', fontWeight: 800 }}>
          ✕
        </button>
      </div>

      {/* Si el cliente quedo esperando, se dice de entrada */}
      {data?.esperando_desde && <div style={{
        padding: '9px 18px', background: '#fef2f2', color: '#991b1b', fontSize: 12, fontWeight: 700,
      }}>
        El cliente escribió {formatRelative(data.esperando_desde, ahora)} y nadie ha respondido.
      </div>}

      {/* Conversacion */}
      <div style={{ padding: 18, overflowY: 'auto', flex: 1, background: '#f8fafc', display: 'grid', gap: 10 }}>
        {error && <div role="alert" style={{ padding: 14, borderRadius: 10, background: '#fee2e2', color: '#991b1b' }}>
          {error}
        </div>}

        {cargando && !mensajes.length && <p style={{ textAlign: 'center', color: '#64748b' }}>Cargando conversación…</p>}

        {!cargando && !error && !mensajes.length && <p style={{ textAlign: 'center', color: '#64748b' }}>
          {data?.sin_chat
            ? 'Este lead todavía no tiene un chat abierto en Bitrix.'
            : 'La conversación está vacía.'}
        </p>}

        {data?.truncado && <p style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', margin: 0 }}>
          Mostrando los mensajes más recientes.
        </p>}

        {mensajes.map((mensaje) => {
          const estilo = ESTILO[mensaje.emisor_tipo] || ESTILO.SISTEMA;
          const sistema = mensaje.emisor_tipo === 'SISTEMA';
          return <div key={mensaje.id} style={{ display: 'flex', justifyContent: estilo.fila }}>
            <div style={{
              maxWidth: sistema ? '90%' : '78%', background: estilo.fondo, color: estilo.color,
              border: `1px solid ${estilo.borde}`, borderRadius: 12, padding: '9px 12px',
              fontSize: 13, textAlign: sistema ? 'center' : 'left',
            }}>
              {!sistema && <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', marginBottom: 3 }}>
                {mensaje.emisor_nombre || (mensaje.emisor_tipo === 'CLIENTE' ? 'Cliente' : 'Asesor')}
              </div>}
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{mensaje.texto}</div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 5, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                <span>{hora(mensaje.fecha)}</span>
                {mensaje.respuesta_seg != null && <span style={{
                  fontWeight: 800, color: mensaje.respuesta_seg > 1800 ? '#b91c1c' : '#15803d',
                }}>
                  respondió en {formatDuration(mensaje.respuesta_seg)}
                </span>}
              </div>
            </div>
          </div>;
        })}
        <div ref={final} />
      </div>

      {/* Pie: de donde salio esto y que no se guarda */}
      <div style={{
        padding: '10px 18px', borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#64748b',
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <span>{data?.mensajes_cliente ?? 0} del cliente · {data?.mensajes_asesor ?? 0} del asesor</span>
        <span style={{ flex: 1 }} />
        <span>Leído de Bitrix {data?.desde_cache ? '(hace segundos)' : 'ahora'} · el contenido no se almacena</span>
      </div>
    </div>
  </div>;
}
