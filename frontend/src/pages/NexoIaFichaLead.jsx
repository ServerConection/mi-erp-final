import { useEffect, useMemo, useState } from 'react';

/**
 * Ficha lateral del lead dentro de NEXO IA.
 *
 * El nombre del asesor NO se toma de lead.asesor_nombre (que suele traer el
 * nombre del canal, p.ej. "Novonet Ecuador"), sino del emisor_nombre real de
 * los mensajes escritos por el asesor. Si no hay mensajes de asesor, se cae
 * de vuelta al campo del lead.
 */

const fmtFecha = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '—';
  return d.toLocaleString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const hace = (iso, ahora) => {
  if (!iso || !ahora) return null;
  const s = Math.max(0, Math.round((ahora - new Date(iso)) / 1000));
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} d`;
};

const dur = (seg) => {
  if (seg == null) return '—';
  if (seg < 60) return `${seg} s`;
  if (seg < 3600) return `${Math.round(seg / 60)} min`;
  return `${(seg / 3600).toFixed(1)} h`;
};

const COLORES = {
  CLIENTE: { fondo: '#eff6ff', borde: '#bfdbfe', texto: '#1d4ed8', etiqueta: 'Cliente' },
  ASESOR:  { fondo: '#ecfdf5', borde: '#a7f3d0', texto: '#047857', etiqueta: 'Asesor'  },
  SISTEMA: { fondo: '#f8fafc', borde: '#e2e8f0', texto: '#64748b', etiqueta: 'Sistema' },
};

function Contador({ tipo, n, total }) {
  const c = COLORES[tipo];
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div style={{ background: c.fondo, border: `1px solid ${c.borde}`, borderRadius: 10, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: c.texto, fontWeight: 700 }}>{c.etiqueta}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: c.texto, lineHeight: 1.1 }}>{n}</div>
      <div style={{ fontSize: 10, color: '#64748b' }}>{pct}% del total</div>
    </div>
  );
}

function Dato({ k, v, sub }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: 11, color: '#64748b', flexShrink: 0 }}>{k}</span>
      <span style={{ fontSize: 11.5, fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>
        {v || '—'}
        {sub && <span style={{ display: 'block', fontWeight: 400, color: '#94a3b8', fontSize: 10 }}>{sub}</span>}
      </span>
    </div>
  );
}

export default function NexoIaFichaLead({ lead, mensajes = [] }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const m = useMemo(() => {
    const cuenta = { CLIENTE: 0, ASESOR: 0, SISTEMA: 0 };
    const nombresAsesor = new Map();
    const respuestas = [];
    for (const x of mensajes) {
      if (cuenta[x.emisor_tipo] != null) cuenta[x.emisor_tipo]++;
      if (x.emisor_tipo === 'ASESOR' && x.emisor_nombre) {
        nombresAsesor.set(x.emisor_nombre, (nombresAsesor.get(x.emisor_nombre) || 0) + 1);
      }
      if (typeof x.respuesta_seg === 'number') respuestas.push(x.respuesta_seg);
    }
    const total = cuenta.CLIENTE + cuenta.ASESOR + cuenta.SISTEMA;
    const asesores = [...nombresAsesor.entries()].sort((a, b) => b[1] - a[1]);
    const primero = mensajes[0]?.fecha || null;
    const ultimo = mensajes.at(-1)?.fecha || null;
    return {
      cuenta, total, asesores, primero, ultimo,
      primeraRespuesta: respuestas.length ? respuestas[0] : null,
      promedioRespuesta: respuestas.length ? Math.round(respuestas.reduce((a, b) => a + b, 0) / respuestas.length) : null,
    };
  }, [mensajes]);

  const asesorReal = m.asesores[0]?.[0] || null;
  const canal = lead?.asesor_nombre || null;

  const caja = { background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, marginBottom: 10 };
  const titulo = { margin: '0 0 8px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.08em', color: '#94a3b8', fontWeight: 800 };

  return (
    <aside style={{ fontSize: 12, color: '#0f172a' }}>
      <div style={caja}>
        <h3 style={titulo}>Asesor</h3>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{asesorReal || canal || 'Sin asesor'}</div>
        {asesorReal
          ? <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
              Detectado en la conversacion ({m.asesores[0][1]} mensaje{m.asesores[0][1] === 1 ? '' : 's'})
              {canal && canal !== asesorReal && <><br />Canal en el CRM: {canal}</>}
            </div>
          : <div style={{ fontSize: 10.5, color: '#b45309', marginTop: 2 }}>
              Ningun mensaje escrito por un asesor todavia.
            </div>}
        {m.asesores.length > 1 && (
          <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 4 }}>
            Tambien intervinieron: {m.asesores.slice(1).map(([n, c]) => `${n} (${c})`).join(', ')}
          </div>
        )}
      </div>

      <div style={caja}>
        <h3 style={titulo}>Mensajes</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
          <Contador tipo="CLIENTE" n={m.cuenta.CLIENTE} total={m.total} />
          <Contador tipo="ASESOR"  n={m.cuenta.ASESOR}  total={m.total} />
          <Contador tipo="SISTEMA" n={m.cuenta.SISTEMA} total={m.total} />
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: '#64748b', textAlign: 'center' }}>
          <b style={{ color: '#0f172a' }}>{m.total}</b> mensajes en total
        </div>
      </div>

      <div style={caja}>
        <h3 style={titulo}>Lead</h3>
        <Dato k="Cliente"   v={lead?.nombre_cliente || `Lead ${lead?.id_bitrix}`} />
        <Dato k="ID Bitrix" v={lead?.id_bitrix} />
        <Dato k="Empresa"   v={lead?.empresa} />
        <Dato k="Etapa"     v={lead?.etapa_nombre || lead?.etapa_id} />
        <Dato k="Creado"    v={fmtFecha(lead?.fecha_creacion)} sub={hace(lead?.fecha_creacion, ahora)} />
        <Dato k="Pendiente por" v={lead?.pendiente_por === 'ASESOR' ? 'El asesor debe responder' : lead?.pendiente_por === 'CLIENTE' ? 'Esperamos al cliente' : lead?.pendiente_por} />
      </div>

      <div style={caja}>
        <h3 style={titulo}>Tiempos</h3>
        <Dato k="Primer mensaje"  v={fmtFecha(m.primero)} sub={hace(m.primero, ahora)} />
        <Dato k="Ultimo mensaje"  v={fmtFecha(m.ultimo)}  sub={hace(m.ultimo, ahora)} />
        <Dato k="Ultimo cliente"  v={fmtFecha(lead?.ultimo_mensaje_cliente_at)} sub={hace(lead?.ultimo_mensaje_cliente_at, ahora)} />
        <Dato k="Ultimo asesor"   v={fmtFecha(lead?.ultimo_mensaje_asesor_at)}  sub={hace(lead?.ultimo_mensaje_asesor_at, ahora)} />
        <Dato k="1a respuesta"    v={dur(m.primeraRespuesta)} />
        <Dato k="Respuesta prom." v={dur(m.promedioRespuesta)} />
      </div>
    </aside>
  );
}
