// =============================================================================
// Inteligencia de Contactabilidad
// Tres vistas sobre el mismo universo filtrado:
//   Alertas      -> que esta vencido, de quien es y donde ocurre.
//   Inteligencia -> por que ocurre (origen, asesor, etapa, horario, embudo).
//   Operacion    -> el detalle lead por lead, con refresco puntual.
//
// El dato se mantiene fresco por tres vias independientes:
//   1. Webhook de Bitrix -> el backend registra el mensaje al instante.
//   2. Cron corto        -> red de seguridad si el webhook falla.
//   3. Botones de aqui   -> el usuario nunca queda esperando al reloj.
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ContactabilidadFilters from './contactabilidad/ContactabilidadFilters.jsx';
import ContactabilidadToolbar from './contactabilidad/ContactabilidadToolbar.jsx';
import ContactabilidadAlertas from './contactabilidad/ContactabilidadAlertas.jsx';
import ContactabilidadKpis from './contactabilidad/ContactabilidadKpis.jsx';
import ContactabilidadRankings from './contactabilidad/ContactabilidadRankings.jsx';
import ContactabilidadHeatmap from './contactabilidad/ContactabilidadHeatmap.jsx';
import ContactabilidadFunnel from './contactabilidad/ContactabilidadFunnel.jsx';
import ContactabilidadQuality from './contactabilidad/ContactabilidadQuality.jsx';
import ContactabilidadOperationalTable from './contactabilidad/ContactabilidadOperationalTable.jsx';
import { buildAnalyticsQuery, readFilters } from '../utils/contactabilidadAnalytics.js';

const API = import.meta.env.VITE_API_URL || '';
const BASE = `${API}/api/bot-auditor/contactabilidad`;
const INTERVALO_KEY = 'contactabilidad.autorefresco';
const TICK_MS = 15000; // refresca los cronometros en pantalla sin pedir datos

const EMPTY = {
  resumen: {}, por_origen: [], por_asesor: [], por_etapa: [], por_hora: [],
  embudo: [], operativo: [], calidad_datos: {},
  alertas: { resumen: {}, por_asesor: [], por_etapa: [], por_origen: [] },
  umbrales: { alerta: 15, grave: 30, critico: 60 },
};

const cabeceras = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json',
});

async function pedir(url, opciones = {}) {
  const respuesta = await fetch(url, { headers: cabeceras(), ...opciones });
  const json = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || json.success === false) throw new Error(json.error || `Error ${respuesta.status}`);
  return json;
}

function esAdministrador() {
  try {
    const perfil = JSON.parse(localStorage.getItem('userProfile') || '{}');
    return String(perfil.perfil || '').toUpperCase() === 'ADMINISTRADOR';
  } catch { return false; }
}

const leerIntervalo = () => {
  try { return localStorage.getItem(INTERVALO_KEY) || '60'; } catch { return '60'; }
};

export default function Contactabilidad() {
  const [tab, setTab] = useState('alertas');
  const [filters, setFilters] = useState(() => readFilters(window.location.search));
  const [analytics, setAnalytics] = useState(EMPTY);
  const [opciones, setOpciones] = useState({});
  const [vistas, setVistas] = useState([]);
  const [estado, setEstado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const [ultimaCarga, setUltimaCarga] = useState(null);
  const [intervalo, setIntervalo] = useState(leerIntervalo);
  const [ahora, setAhora] = useState(() => Date.now());

  const admin = useMemo(() => esAdministrador(), []);
  const query = useMemo(() => buildAnalyticsQuery(filters), [filters]);
  const peticion = useRef(null);

  const avisar = useCallback((texto, tipo = 'ok') => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 6000);
  }, []);

  // --- Carga de datos -------------------------------------------------------
  const cargar = useCallback(async ({ conSpinner = false } = {}) => {
    peticion.current?.abort();
    const control = new AbortController();
    peticion.current = control;
    if (conSpinner) setLoading(true);
    try {
      const json = await pedir(`${BASE}/analytics?${query}`, { signal: control.signal });
      setAnalytics({ ...EMPTY, ...json.data });
      setUltimaCarga(Date.now());
      setError('');
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      if (conSpinner) setLoading(false);
    }
  }, [query]);

  // Catalogos de filtros: dependen SOLO de empresa y fechas. Si dependieran del
  // resto, elegir un asesor vaciaria la lista de asesores (cascada rota).
  const { empresa, desde, hasta } = filters;
  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries({ empresa, desde, hasta }).forEach(([k, v]) => v && params.set(k, v));
    pedir(`${BASE}/filtros?${params}`)
      .then((json) => setOpciones(json.data || {}))
      .catch(() => {});
  }, [empresa, desde, hasta]);

  useEffect(() => { pedir(`${BASE}/vistas`).then((j) => setVistas(j.data || [])).catch(() => {}); }, []);
  useEffect(() => { pedir(`${BASE}/estado`).then((j) => setEstado(j.data)).catch(() => {}); }, [ultimaCarga]);

  // La URL siempre refleja los filtros: el enlace es compartible tal cual.
  useEffect(() => {
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    const id = setTimeout(() => cargar({ conSpinner: true }), 0);
    return () => { clearTimeout(id); peticion.current?.abort(); };
  }, [query, cargar]);

  // --- Auto-refresco (se pausa si la pestaña no esta visible) ---------------
  useEffect(() => {
    const segundos = Number(intervalo);
    try { localStorage.setItem(INTERVALO_KEY, intervalo); } catch { /* modo privado */ }
    if (!segundos) return undefined;

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') cargar();
    }, segundos * 1000);

    // Al volver a la pestaña, primero se actualiza y luego se sigue el ritmo.
    const alVolver = () => { if (document.visibilityState === 'visible') cargar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', alVolver); };
  }, [intervalo, cargar]);

  // Cronometros en pantalla: avanzan sin pedir nada al servidor.
  useEffect(() => {
    const timer = setInterval(() => setAhora(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // --- Acciones -------------------------------------------------------------
  const forzarSync = async () => {
    setSincronizando(true);
    try {
      const params = filters.empresa ? `?empresa=${encodeURIComponent(filters.empresa)}` : '';
      const json = await pedir(`${BASE}/refrescar${params}`, { method: 'POST' });
      const leads = Object.values(json.data?.empresas || {})
        .reduce((total, r) => total + (r.leads || 0), 0);
      const nuevos = Object.values(json.data?.empresas || {})
        .reduce((total, r) => total + (r.mensajes_nuevos || 0), 0);
      avisar(`Bitrix consultado: ${leads} chat(s) revisados, ${nuevos} mensaje(s) nuevos`);
      await cargar();
    } catch (e) {
      avisar(e.message, 'error');
    } finally {
      setSincronizando(false);
    }
  };

  const refrescarLead = async (fila) => {
    try {
      const json = await pedir(`${BASE}/refrescar/${fila.empresa}/${fila.id_bitrix}`, { method: 'POST' });
      // Se actualiza la fila en el acto y ademas se recarga el agregado.
      setAnalytics((previo) => ({
        ...previo,
        operativo: previo.operativo.map((r) =>
          (r.empresa === fila.empresa && r.id_bitrix === fila.id_bitrix ? { ...r, ...json.data } : r)),
      }));
      avisar(json.data?.mensajes_nuevos
        ? `${json.data.mensajes_nuevos} mensaje(s) nuevos en ${fila.id_bitrix}`
        : `Lead ${fila.id_bitrix} sin novedades`);
      cargar();
    } catch (e) {
      avisar(e.message, 'error');
    }
  };

  // El export es CSV, no JSON: se descarga como blob con el token en la cabecera.
  const exportar = () => {
    const url = `${BASE}/export?${query}`;
    fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then((r) => { if (!r.ok) throw new Error(`Error ${r.status}`); return r.blob(); })
      .then((blob) => {
        const enlace = document.createElement('a');
        enlace.href = URL.createObjectURL(blob);
        enlace.download = `contactabilidad_${new Date().toISOString().slice(0, 10)}.csv`;
        enlace.click();
        URL.revokeObjectURL(enlace.href);
      })
      .catch(() => avisar('No se pudo exportar', 'error'));
  };

  const copiarEnlace = async () => {
    const enlace = `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ''}`;
    try {
      await navigator.clipboard.writeText(enlace);
      avisar('Enlace copiado con los filtros aplicados');
    } catch {
      avisar(enlace, 'ok');
    }
  };

  const guardarVista = async (vista) => {
    try {
      await pedir(`${BASE}/vistas`, { method: 'POST', body: JSON.stringify(vista) });
      const json = await pedir(`${BASE}/vistas`);
      setVistas(json.data || []);
      avisar(`Vista "${vista.nombre}" guardada`);
    } catch (e) { avisar(e.message, 'error'); }
  };

  const eliminarVista = async (vista) => {
    try {
      await pedir(`${BASE}/vistas/${vista.id}`, { method: 'DELETE' });
      setVistas((previas) => previas.filter((v) => v.id !== vista.id));
    } catch (e) { avisar(e.message, 'error'); }
  };

  const aplicarVista = (vista) => setFilters({ ...readFilters(''), ...(vista.filtros || {}) });

  const filtrarPor = (clave) => (fila) => {
    setFilters((previos) => ({
      ...previos,
      [clave]: clave === 'asesor_id' ? String(fila.asesor_id || '') : String(fila.etiqueta || ''),
    }));
    setTab('operacion');
  };

  const tabButton = (valor, etiqueta, insignia) => <button type="button" onClick={() => setTab(valor)}
    style={{
      padding: '10px 18px', border: 0, borderRadius: 9, cursor: 'pointer', fontWeight: 800,
      background: tab === valor ? '#1d4ed8' : '#e2e8f0', color: tab === valor ? '#fff' : '#334155',
      display: 'inline-flex', alignItems: 'center', gap: 7,
    }}>
    {etiqueta}
    {insignia > 0 && <span style={{
      background: tab === valor ? 'rgba(255,255,255,.25)' : '#dc2626',
      color: '#fff', borderRadius: 999, padding: '1px 8px', fontSize: 11,
    }}>{insignia}</span>}
  </button>;

  const vencidos = (analytics.alertas?.resumen?.critico || 0) + (analytics.alertas?.resumen?.grave || 0);

  return <div style={{ padding: 24, background: '#f8fafc', minHeight: '100vh', color: '#0f172a' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
      <div>
        <h1 style={{ margin: 0 }}>📊 Inteligencia de Contactabilidad</h1>
        <p style={{ color: '#64748b', margin: '6px 0 0' }}>
          Quién está esperando respuesta, hace cuánto y de quién es el caso.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {tabButton('alertas', 'Alertas', vencidos)}
        {tabButton('inteligencia', 'Inteligencia')}
        {tabButton('operacion', 'Operación')}
        <button type="button" onClick={exportar} style={{
          padding: '10px 16px', borderRadius: 9, border: '1px solid #cbd5e1',
          background: '#fff', cursor: 'pointer', fontWeight: 700,
        }}>⭳ Exportar</button>
      </div>
    </div>

    <ContactabilidadToolbar
      ultimaCarga={ultimaCarga} cargando={loading} sincronizando={sincronizando}
      intervalo={intervalo} onIntervalo={setIntervalo}
      onRefrescar={() => cargar({ conSpinner: true })} onForzar={forzarSync}
      puedeForzar={admin} estado={estado} ahora={ahora} mensaje={mensaje} />

    <ContactabilidadFilters
      filters={filters} options={opciones} onChange={setFilters}
      onReset={() => setFilters(readFilters(''))}
      vistas={vistas} onGuardarVista={guardarVista} onAplicarVista={aplicarVista}
      onEliminarVista={eliminarVista} onCopiarEnlace={copiarEnlace} />

    <ContactabilidadKpis resumen={analytics.resumen} loading={loading} />

    {error && <div role="alert" style={{ padding: 14, borderRadius: 10, background: '#fee2e2', color: '#991b1b', marginBottom: 14 }}>
      No se pudo actualizar: {error}
    </div>}

    {tab === 'alertas' && <ContactabilidadAlertas
      alertas={analytics.alertas} umbrales={analytics.umbrales} ahora={ahora}
      onFiltrarAsesor={filtrarPor('asesor_id')}
      onFiltrarEtapa={filtrarPor('etapa')}
      onFiltrarOrigen={filtrarPor('origen')} />}

    {tab === 'inteligencia' && <div id="contactabilidad-inteligencia" style={{ display: 'grid', gap: 14 }}>
      <ContactabilidadRankings porOrigen={analytics.por_origen} porAsesor={analytics.por_asesor} porEtapa={analytics.por_etapa} />
      <ContactabilidadHeatmap data={analytics.por_hora} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(330px,1fr))', gap: 14 }}>
        <ContactabilidadFunnel data={analytics.embudo} />
        <ContactabilidadQuality data={analytics.calidad_datos} />
      </div>
    </div>}

    {tab === 'operacion' && <ContactabilidadOperationalTable
      rows={analytics.operativo} loading={loading} umbrales={analytics.umbrales}
      ahora={ahora} onRefrescarLead={refrescarLead} />}
  </div>;
}
