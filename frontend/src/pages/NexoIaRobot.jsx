import { useEffect, useState } from 'react';

/**
 * Indicador de vida de NEXO IA.
 *
 * Estados:
 *  - durmiendo : el worker esta apagado (NEXO_IA_ENABLED) o la empresa no esta
 *                habilitada. El robot duerme con zzz.
 *  - trabajando: hay jobs en cola o generandose. El robot baila.
 *  - activa    : todo encendido y sin cola. El robot esta despierto y respira.
 *  - alerta    : hay jobs atascados (>5 min en cola) o fallas en la ultima hora.
 *  - cargando  : aun no hay respuesta de /salud.
 */

const ATASCO_MS = 5 * 60 * 1000;

const ESTILOS = {
  cargando:   { color: '#94a3b8', fondo: '#f1f5f9', borde: '#e2e8f0', texto: 'Consultando…' },
  durmiendo:  { color: '#64748b', fondo: '#f1f5f9', borde: '#cbd5e1', texto: 'IA dormida' },
  activa:     { color: '#059669', fondo: '#ecfdf5', borde: '#a7f3d0', texto: 'IA activa' },
  trabajando: { color: '#2563eb', fondo: '#eff6ff', borde: '#bfdbfe', texto: 'Generando…' },
  alerta:     { color: '#b45309', fondo: '#fffbeb', borde: '#fde68a', texto: 'IA con problema' },
};

const CSS = `
@keyframes nxr-baile   {0%,100%{transform:rotate(-7deg) translateY(0)}25%{transform:rotate(6deg) translateY(-2px)}50%{transform:rotate(-5deg) translateY(0)}75%{transform:rotate(7deg) translateY(-2px)}}
@keyframes nxr-respira {0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
@keyframes nxr-duerme  {0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(1.5px) rotate(-4deg)}}
@keyframes nxr-tiembla {0%,100%{transform:translateX(0)}20%{transform:translateX(-2px)}40%{transform:translateX(2px)}60%{transform:translateX(-1px)}80%{transform:translateX(1px)}}
@keyframes nxr-brazoI  {0%,100%{transform:rotate(0deg)}50%{transform:rotate(-32deg)}}
@keyframes nxr-brazoD  {0%,100%{transform:rotate(0deg)}50%{transform:rotate(32deg)}}
@keyframes nxr-antena  {0%,100%{transform:translateY(0)}50%{transform:translateY(-2.5px)}}
@keyframes nxr-parpadeo{0%,92%,100%{transform:scaleY(1)}96%{transform:scaleY(.1)}}
@keyframes nxr-zzz     {0%{opacity:0;transform:translate(0,0) scale(.6)}25%{opacity:1}100%{opacity:0;transform:translate(9px,-14px) scale(1.15)}}
@keyframes nxr-pulso   {0%,100%{opacity:.35;transform:scale(1)}50%{opacity:.9;transform:scale(1.35)}}
.nxr-cuerpo{transform-origin:50% 90%}
.nxr-baila .nxr-cuerpo{animation:nxr-baile .7s ease-in-out infinite}
.nxr-viva  .nxr-cuerpo{animation:nxr-respira 2.6s ease-in-out infinite}
.nxr-duerme .nxr-cuerpo{animation:nxr-duerme 3.2s ease-in-out infinite}
.nxr-mal   .nxr-cuerpo{animation:nxr-tiembla 1.6s ease-in-out infinite}
.nxr-brazo-i{transform-origin:14px 30px}
.nxr-brazo-d{transform-origin:38px 30px}
.nxr-baila .nxr-brazo-i{animation:nxr-brazoI .7s ease-in-out infinite}
.nxr-baila .nxr-brazo-d{animation:nxr-brazoD .7s ease-in-out infinite}
.nxr-antena{transform-origin:26px 14px}
.nxr-baila .nxr-antena{animation:nxr-antena .7s ease-in-out infinite}
.nxr-ojo{transform-origin:center}
.nxr-viva .nxr-ojo{animation:nxr-parpadeo 4.5s ease-in-out infinite}
.nxr-z{opacity:0}
.nxr-duerme .nxr-z1{animation:nxr-zzz 2.4s ease-out infinite}
.nxr-duerme .nxr-z2{animation:nxr-zzz 2.4s ease-out .8s infinite}
.nxr-duerme .nxr-z3{animation:nxr-zzz 2.4s ease-out 1.6s infinite}
.nxr-punto{animation:nxr-pulso 1.5s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){
  .nxr-cuerpo,.nxr-brazo-i,.nxr-brazo-d,.nxr-antena,.nxr-ojo,.nxr-z,.nxr-punto{animation:none!important}
  .nxr-z{opacity:.65}
}
`;

function Robot({ estado, color }) {
  const clase =
    estado === 'trabajando' ? 'nxr-baila' :
    estado === 'durmiendo'  ? 'nxr-duerme' :
    estado === 'alerta'     ? 'nxr-mal'    : 'nxr-viva';
  const durmiendo = estado === 'durmiendo';
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" className={clase} aria-hidden="true">
      <g className="nxr-cuerpo">
        {/* antena */}
        <g className="nxr-antena">
          <line x1="26" y1="14" x2="26" y2="8" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <circle cx="26" cy="6" r="2.6" fill={color} />
        </g>
        {/* brazos */}
        <rect className="nxr-brazo-i" x="8"  y="27" width="5" height="13" rx="2.5" fill={color} opacity=".75" />
        <rect className="nxr-brazo-d" x="39" y="27" width="5" height="13" rx="2.5" fill={color} opacity=".75" />
        {/* cabeza */}
        <rect x="13" y="14" width="26" height="21" rx="7" fill={color} opacity=".16" stroke={color} strokeWidth="2" />
        {/* ojos */}
        {durmiendo ? (
          <>
            <path d="M18.5 24.5q2.5 2.2 5 0" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
            <path d="M28.5 24.5q2.5 2.2 5 0" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
          </>
        ) : estado === 'alerta' ? (
          <>
            <path d="M18.5 22.5l4.5 4.5M23 22.5l-4.5 4.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
            <path d="M29 22.5l4.5 4.5M33.5 22.5L29 27" stroke={color} strokeWidth="2" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle className="nxr-ojo" cx="21" cy="24" r="2.7" fill={color} />
            <circle className="nxr-ojo" cx="31" cy="24" r="2.7" fill={color} />
          </>
        )}
        {/* boca */}
        {estado === 'trabajando' && <path d="M22 30q4 3 8 0" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />}
        {/* torso */}
        <rect x="16" y="36" width="20" height="11" rx="4" fill={color} opacity=".16" stroke={color} strokeWidth="2" />
        <circle className={estado === 'trabajando' ? 'nxr-punto' : ''} cx="26" cy="41.5" r="2.2" fill={color} />
      </g>
      {/* zzz */}
      {durmiendo && (
        <g fill={color} fontSize="9" fontWeight="700" fontFamily="system-ui, sans-serif">
          <text className="nxr-z nxr-z1" x="37" y="18">z</text>
          <text className="nxr-z nxr-z2" x="39" y="14">z</text>
          <text className="nxr-z nxr-z3" x="41" y="10">z</text>
        </g>
      )}
    </svg>
  );
}

const hace = (iso, ahora) => {
  if (!iso) return 'nunca';
  if (!ahora) return '—';
  const s = Math.max(0, Math.round((ahora - new Date(iso)) / 1000));
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} d`;
};

export default function NexoIaRobot({ empresa, api, headers, intervalo = 10000 }) {
  const [salud, setSalud] = useState(null);
  const [abierto, setAbierto] = useState(false);
  // Reloj propio: evita llamar Date.now() durante el render (regla de pureza
  // de React) y mantiene frescos los textos de tipo "hace 3 min".
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let vivo = true;
    const consultar = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch(`${api}/${empresa}/salud`, { headers: headers() });
        const j = await r.json();
        if (vivo) setSalud(j.success ? j.data : { error: j.error });
      } catch { if (vivo) setSalud({ error: 'Sin conexion' }); }
    };
    consultar();
    const t = setInterval(consultar, intervalo);
    return () => { vivo = false; clearInterval(t); };
  }, [empresa, api, headers, intervalo]);

  let estado = 'cargando';
  if (salud?.error) estado = 'alerta';
  else if (salud) {
    const atascado = !!salud.pendiente_mas_antiguo && !!ahora &&
      (ahora - new Date(salud.pendiente_mas_antiguo)) > ATASCO_MS;
    if (!salud.worker || !salud.habilitado) estado = 'durmiendo';
    else if (atascado || salud.fallidas_1h > 0) estado = 'alerta';
    else if (salud.generando > 0 || salud.pendientes > 0) estado = 'trabajando';
    else estado = 'activa';
  }
  const st = ESTILOS[estado];

  const motivo = !salud ? 'Consultando el estado del servicio…'
    : salud.error ? salud.error
    : !salud.worker ? 'El worker esta apagado (falta NEXO_IA_ENABLED=true en el servidor).'
    : !salud.habilitado ? `NEXO IA esta deshabilitada para ${empresa}. Actívala en ⚙ Configurar.`
    : estado === 'alerta' ? 'Hay borradores atascados o con error. Revisa el detalle.'
    : estado === 'trabajando' ? 'Generando borradores en este momento.'
    : 'Todo en orden. Lista para generar borradores.';

  return (
    <div style={{ position: 'relative' }}
         onMouseEnter={() => setAbierto(true)}
         onMouseLeave={() => setAbierto(false)}>
      <style>{CSS}</style>
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        title={`${st.texto} — ${motivo}`}
        aria-label={`Estado de NEXO IA: ${st.texto}. ${motivo}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
          padding: '4px 12px 4px 4px', borderRadius: 999,
          background: st.fondo, border: `1.5px solid ${st.borde}`, color: st.color,
        }}>
        <Robot estado={estado} color={st.color} />
        <span style={{ display: 'grid', textAlign: 'left', lineHeight: 1.15 }}>
          <b style={{ fontSize: 12.5 }}>{st.texto}</b>
          <span style={{ fontSize: 10.5, opacity: .8 }}>
            {salud && !salud.error
              ? (salud.pendientes || salud.generando)
                ? `${salud.pendientes + salud.generando} en cola`
                : `ultima ${hace(salud.ultima_sugerencia_at, ahora)}`
              : 'NEXO IA'}
          </span>
        </span>
      </button>

      {abierto && (
        <div role="status" style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 40, width: 280,
          background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12,
          boxShadow: '0 12px 32px rgba(15,23,42,.14)', fontSize: 12, color: '#334155',
        }}>
          <b style={{ color: st.color, fontSize: 13 }}>{st.texto}</b>
          <p style={{ margin: '6px 0 10px' }}>{motivo}</p>
          {salud && !salud.error && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Worker (servidor)', salud.worker ? 'Encendido' : 'APAGADO'],
                  [`Habilitada en ${empresa}`, salud.habilitado ? 'Si' : 'NO'],
                  ['Modelo', salud.modelo || '—'],
                  ['En cola', salud.pendientes],
                  ['Generando', salud.generando],
                  ['Fallidas (1 h)', salud.fallidas_1h],
                  ['Ultima sugerencia', hace(salud.ultima_sugerencia_at, ahora)],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ padding: '3px 0', color: '#64748b' }}>{k}</td>
                    <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: 600 }}>{String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {salud?.ultimo_error && (
            <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: '#fef2f2', color: '#991b1b' }}>
              <b>Ultimo error:</b> {salud.ultimo_error.error_codigo}
              <div style={{ opacity: .85, marginTop: 2 }}>{salud.ultimo_error.detalle}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
