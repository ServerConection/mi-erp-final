import { useCallback, useEffect, useMemo, useState } from 'react';
import { repartoRequest, horaEc } from './api';

// Misma regla que el backend (shared/repartoGestionables.js): entre los que
// están en línea y tienen cupo, recibe el que menos lleva; si empatan, el que
// lleva más tiempo sin recibir.
function ordenarPorTurno(filas) {
  // Misma regla que el backend: el que lleva más tiempo sin recibir va primero
  // (quien no recibió hoy, primero; entre ellos, el que se conectó antes).
  const ts = (d) => (d ? new Date(d).getTime() : -Infinity);
  const tc = (d) => (d ? new Date(d).getTime() : Infinity);
  return [...filas].sort((a, b) => (ts(a.ultima_asignacion) - ts(b.ultima_asignacion)) || (tc(a.conexion) - tc(b.conexion)));
}

function Interruptor({ encendido, onClick, disabled, etiqueta }) {
  return (
    <button
      role="switch" aria-checked={encendido} aria-label={etiqueta} disabled={disabled} onClick={onClick}
      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 ${encendido ? 'bg-emerald-500' : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${encendido ? 'translate-x-7' : 'translate-x-1'}`} />
    </button>
  );
}

const MOTIVOS_COLA = {
  fuera_de_horario: 'Llegó fuera de horario',
  nadie_en_linea: 'No había asesores en línea',
  todos_al_limite: 'Todos estaban en su límite',
  cola_en_espera: 'Había otros esperando antes',
  en_estacion: 'Ya estaba a nombre de la estación',
  limite_efectividad: 'Los asesores con cupo no alcanzaron su meta de ingresos Jotform',
};

const ESTADOS = {
  linea:      { label: 'En línea',       cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pausa:      { label: 'En pausa',       cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  fuera:      { label: 'Desconectado',   cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  noBitrix:   { label: 'No está en Bitrix', cls: 'bg-red-50 text-red-700 border-red-200' },
  sinAccess:  { label: 'Sin ACCESS',     cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  almuerzo:   { label: 'Almuerzo (ACCESS)', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  salio:      { label: 'Salió (ACCESS)', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  sinDato:    { label: 'Sin dato',       cls: 'bg-slate-50 text-slate-500 border-slate-200' },
};
const estadoDe = (r) => {
  if (r.en_linea === null) return 'sinDato';
  if (!r.encontrado_en_bitrix) return 'noBitrix';
  // En Bitrix sí, pero sin conexión en NOVONET ACCESS / VELSA ACCESS → no recibe
  if (r.en_linea) {
    if (r.access_conectado !== false) return 'linea';
    if (r.access_actividad === 'SALIDA ALMUERZO') return 'almuerzo';
    if (r.access_actividad === 'SALIDA') return 'salio';
    return 'sinAccess';
  }
  return r.jornada === 'PAUSED' ? 'pausa' : 'fuera';
};

export default function RepartoEnVivo({ empresa = 'novonet' }) {
  const [datos, setDatos] = useState(null);
  const [busy, setBusy] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const [ayuda, setAyuda] = useState(false);

  const [actualizado, setActualizado] = useState(null);
  const consultar = useCallback(async (forzar = false) => {
    setBusy(true); setError('');
    try { setDatos(await repartoRequest(`/reparto/estado${forzar ? '?forzar=1' : ''}`, {}, empresa)); setActualizado(new Date()); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }, [empresa]);

  useEffect(() => {
    consultar();
    const t = setInterval(() => consultar(false), 60_000);   // se actualiza solo cada minuto
    return () => clearInterval(t);
  }, [consultar]);

  async function cambiar(campo, valor) {
    setGuardando(true); setError(''); setConfirmarApagar(false);
    try { await repartoRequest('/reparto/config', { method: 'PUT', body: JSON.stringify({ [campo]: valor }) }, empresa); await consultar(); }
    catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  }

  const cfg = datos?.config;
  const filtroLinea = cfg?.solo_en_linea && datos?.en_linea;
  const filas = (datos?.data || []).filter((r) => !r.es_estacion);
  const horario = datos?.horario;
  const estacion = datos?.estacion;

  const { pueden, siguiente, rondaActual, ordenadas } = useMemo(() => {
    const conCupo = filas.filter((r) => r.gestionables < r.gestionables_tope);
    const pueden = ordenarPorTurno(conCupo.filter((r) => (!filtroLinea || (r.en_linea && r.access_conectado !== false)) && !r.bloqueado_efectividad));
    const turnoDe = new Map(pueden.map((r, i) => [r.nombre, i + 1]));
    // Orden de la vista: En línea → En pausa → Desconectado → resto.
    // Dentro de cada grupo: primero los que tienen cupo (por turno), luego los llenos (por nombre).
    const grupo = { linea: 0, almuerzo: 1, sinAccess: 2, pausa: 3, salio: 4, fuera: 4, noBitrix: 5, sinDato: 6 };
    const ordenadas = [...filas].sort((a, b) =>
      (grupo[estadoDe(a)] - grupo[estadoDe(b)])
      || ((a.gestionables < a.gestionables_tope ? 0 : 1) - (b.gestionables < b.gestionables_tope ? 0 : 1))
      || ((turnoDe.get(a.nombre) ?? 999) - (turnoDe.get(b.nombre) ?? 999))
      || (a.nombre.localeCompare(b.nombre, 'es'))
    ).map((r) => ({ r, turno: turnoDe.get(r.nombre) ?? null }));
    return { pueden, siguiente: pueden[0] || null, rondaActual: pueden.length ? pueden[0].asignados + 1 : null, ordenadas };
  }, [filas, filtroLinea]);

  const activo = !!cfg?.activo_efectivo;

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="p-3 bg-red-50 text-red-700 rounded-xl">{error}</p>}

      {activo && horario && !horario.dentro && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-900">
          <p className="font-bold">Fuera de horario de entrega ({horario.inicio.slice(0, 5)} a {horario.fin.slice(0, 5)})</p>
          <p className="text-sm">Los leads que entran ahora esperan a nombre de <strong>{estacion?.nombre}</strong> y se entregan desde las {horario.inicio.slice(0, 5)}, a medida que los asesores se conectan.</p>
        </div>
      )}

      {/* Interruptores */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className={`rounded-2xl border p-5 ${activo ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Reparto automático</p>
              <p className={`text-2xl font-bold ${activo ? 'text-emerald-700' : 'text-slate-700'}`}>{cfg ? (activo ? 'Encendido' : 'Apagado') : '…'}</p>
              <p className="mt-1 text-sm text-slate-600">
                {activo
                  ? 'Cada lead que entra a Contacto nuevo se entrega por turnos a los asesores con cupo.'
                  : 'Los leads se quedan con el responsable con el que llegan. Nadie los reparte.'}
              </p>
            </div>
            <Interruptor
              etiqueta="Encender o apagar el reparto automático"
              encendido={activo}
              disabled={!cfg || guardando || cfg.apagado_por_entorno}
              onClick={() => (activo ? setConfirmarApagar(true) : cambiar('activo', true))}
            />
          </div>
          {cfg?.apagado_por_entorno && <p className="mt-3 text-sm text-red-700">Está apagado desde el servidor (GESTIONABLES_REPARTO=off en Render). Pide a Desarrollo que lo encienda.</p>}
          {confirmarApagar && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-white p-4">
              <p className="font-medium text-slate-800">¿Apagar el reparto?</p>
              <p className="text-sm text-slate-600">Los leads nuevos dejarán de repartirse hasta que lo vuelvas a encender.</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => cambiar('activo', false)} disabled={guardando} className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white">Sí, apagar</button>
                <button onClick={() => setConfirmarApagar(false)} className="rounded-lg border px-4 py-2">Cancelar</button>
              </div>
            </div>
          )}
          {cfg?.actualizado_por && <p className="mt-3 text-xs text-slate-500">Último cambio: {cfg.actualizado_por} · {new Date(cfg.actualizado_en).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}</p>}
        </div>

        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Solo asesores en línea</p>
              <p className="text-2xl font-bold text-slate-800">{cfg ? (cfg.solo_en_linea ? 'Sí' : 'No') : '…'}</p>
              <p className="mt-1 text-sm text-slate-600">
                {datos?.en_linea?.criterio === 'conexion'
                  ? 'Recibe solo quien está conectado a Bitrix en este momento.'
                  : 'Recibe solo quien tiene la jornada abierta en Bitrix. En pausa o con la jornada cerrada no recibe, pero no pierde su turno.'}
              </p>
            </div>
            <Interruptor
              etiqueta="Repartir solo a asesores en línea"
              encendido={!!cfg?.solo_en_linea}
              disabled={!cfg || guardando}
              onClick={() => cambiar('solo_en_linea', !cfg.solo_en_linea)}
            />
          </div>
          {cfg?.solo_en_linea && datos && !datos.en_linea && <p className="mt-3 text-sm text-amber-800">Bitrix no respondió quién está en línea. Mientras tanto se reparte a todos los que tienen cupo.</p>}
          {cfg?.solo_en_linea && datos?.en_linea?.respaldo && <p className="mt-3 text-sm text-amber-800">Bitrix no está respondiendo ({datos.en_linea.motivo_respaldo}). Se usa el último estado conocido de cada asesor hasta que se restablezca.</p>}
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Entregados hoy', datos?.resumen ? (datos.resumen.repartidos || 0) + (datos.resumen.humanos || 0) : '—', datos?.resumen ? `${datos.resumen.repartidos || 0} por el bot · ${datos.resumen.humanos || 0} por un humano` : ''],
          ['Pueden recibir ahora', pueden.length, filtroLinea ? 'En línea y con cupo' : 'Con cupo'],
          ['Ronda actual', rondaActual ?? '—', rondaActual ? `Todos reciben su lead n.º ${rondaActual}` : 'Nadie disponible'],
          ['En la estación', estacion?.pendientes ?? '—', estacion ? `Esperan a nombre de ${estacion.nombre}` : ''],
        ].map(([t, v, s]) => (
          <div key={t} className="rounded-2xl border bg-white p-4">
            <p className="text-sm text-slate-500">{t}</p>
            <p className="text-3xl font-bold tabular-nums text-slate-800">{v}</p>
            <p className="text-xs text-slate-500">{s}</p>
          </div>
        ))}
      </div>

      {activo && siguiente && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-700">El próximo lead irá a</p>
          <p className="text-xl font-bold text-blue-900">{siguiente.nombre}</p>
          <p className="text-sm text-blue-700">Lleva {siguiente.gestionables} de {siguiente.gestionables_tope} gestionables hoy{siguiente.ultima_asignacion ? ` · último a las ${horaEc(siguiente.ultima_asignacion)}` : ' · aún no recibe'}</p>
        </div>
      )}

      {/* Leads esperando en la estación */}
      {estacion?.pendientes > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-white p-5">
          <h2 className="text-lg font-bold text-slate-800">Esperando en la estación ({estacion.pendientes})</h2>
          <p className="mb-3 text-sm text-slate-500">
            Están a nombre de {estacion.nombre}. Se entregan del más antiguo al más nuevo, solo en horario y a asesores en línea con cupo.
            Con 1 o 2 asesores disponibles se entrega 1 cada 5 minutos; con 3 o más, normal por rondas.
          </p>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-slate-500"><th className="p-2">#</th><th className="p-2">Lead</th><th className="p-2">Llegó</th><th className="p-2">Por qué espera</th></tr></thead>
              <tbody>{estacion.lista.map((c, i) => (
                <tr key={c.bitrix_deal_id} className="border-b">
                  <td className="p-2 tabular-nums">{i + 1}</td>
                  <td className="p-2 tabular-nums">{c.bitrix_deal_id}</td>
                  <td className="p-2 tabular-nums">{new Date(c.creado_en).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="p-2">{MOTIVOS_COLA[c.motivo] || c.motivo}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cómo funciona */}
      <div className="rounded-2xl border bg-white">
        <button onClick={() => setAyuda(!ayuda)} aria-expanded={ayuda} className="flex w-full items-center justify-between p-4 text-left font-medium text-slate-700">
          ¿Cómo funciona el reparto? <span>{ayuda ? '−' : '+'}</span>
        </button>
        {ayuda && (
          <ol className="list-decimal space-y-1 px-9 pb-4 text-sm text-slate-600">
            <li>Cuando un lead entra a <strong>Contacto nuevo</strong> (Netlife Nuevo), Bitrix avisa al ERP.</li>
            <li>Se toman los asesores con cupo hoy (pestaña <strong>Cuotas</strong>){cfg?.solo_en_linea ? ' que estén en línea' : ''}.</li>
            <li>Recibe el que <strong>lleva más tiempo sin recibir</strong> (rotación en orden). Quien aún no recibió hoy va primero; entre ellos, el que se conectó antes.</li>
            <li>No se iguala por cantidad: si alguien se conecta tarde, recibe el siguiente lead y luego entra a la fila como los demás. Nadie pasa su cupo.</li>
            <li>Fuera de horario{horario ? ` (después de las ${horario.fin.slice(0, 5)} y antes de las ${horario.inicio.slice(0, 5)})` : ''}, o si nadie puede recibir, el lead espera a nombre de <strong>{estacion?.nombre || 'la estación'}</strong>.</li>
            <li>Los que esperan se entregan primero, a medida que los asesores se conectan, y cuentan en el día en que se entregan.</li>
            <li>El asesor puede mantener como máximo el <strong>{datos?.efectividad?.pct_gestionables_max ?? 45}% de sus leads permitidos como gestionables</strong>. ATC ya no bloquea el reparto.</li>
            <li><strong>Efectividad</strong>: después de {datos?.efectividad?.plazo_horas ?? 8} horas debe haber ingresado hoy en Jotform al menos el <strong>{datos?.efectividad?.pct_ventas_jot_min ?? 50}% de sus gestionables</strong>. Cuentan los registros de envios_ventas ingresados hoy aunque correspondan a leads recibidos en días anteriores.</li>
            <li>Si una persona asigna un lead a mano en Bitrix, el ERP lo detecta (cada 5 min) y lo cuenta como <strong>Humano</strong>. Si continúa gestionable, suma contra el tope del 45%.</li>
            <li>Si una persona mueve un lead de un asesor a otro, cuenta solo para el que lo tiene ahora.</li>
            <li>Si apagas el reparto, todo se detiene: no se reparte ni se entrega la cola.</li>
          </ol>
        )}
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-800">Asesores de hoy</h2>
          <div className="flex flex-wrap items-center gap-2">
            {actualizado && <span className="text-xs text-slate-500">Actualizado {actualizado.toLocaleTimeString('es-EC', { timeZone: 'America/Guayaquil' })} · se refresca solo cada minuto</span>}
            <button onClick={() => consultar(true)} disabled={busy} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Actualizando…' : 'Forzar actualización'}</button>
          </div>
        </div>
        {!filas.length && !busy && <p className="text-slate-500">No hay cuotas cargadas para hoy. Cárgalas en la pestaña Cuotas.</p>}
        {filas.length > 0 && (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-slate-500">
                <th className="p-2">Turno</th><th className="p-2">Asesor</th><th className="p-2">Estado</th>
                <th className="p-2" title="Gestionables actuales / tope del 45% de los permitidos">Cupo gestionable</th><th className="p-2 text-center">Total asignados</th><th className="p-2 text-center">Bot</th><th className="p-2 text-center">Humano</th><th className="p-2 text-center">Gestionables</th><th className="p-2 text-center" title="Informativo; ATC ya no bloquea">ATC</th><th className="p-2 text-center">Vencidos +{datos?.efectividad?.plazo_horas ?? 8}h</th><th className="p-2 text-center" title="Ingresos de hoy en envios_ventas / meta del 50%">Ingresos Jot</th><th className="p-2 text-center">Dup/Reg/Rmk</th><th className="p-2 text-center">Disponibles</th><th className="p-2">Último lead</th>
              </tr></thead>
              <tbody>
                {ordenadas.map(({ r, turno }) => {
                  const e = ESTADOS[estadoDe(r)];
                  const lleno = r.gestionables >= r.gestionables_tope;
                  const pct = r.gestionables_tope ? Math.min(100, (r.gestionables / r.gestionables_tope) * 100) : 100;
                  return (
                    <tr key={r.nombre} className={`border-b ${turno ? '' : 'text-slate-400'}`}>
                      <td className="p-2 font-bold tabular-nums">{turno ?? '—'}</td>
                      <td className="p-2 font-medium text-slate-800">{r.nombre}</td>
                      <td className="p-2">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${e.cls}`} title={estadoDe(r) === 'almuerzo' ? 'Marcó SALIDA ALMUERZO en ACCESS. Vuelve a recibir al marcar INGRESO ALMUERZO.' : estadoDe(r) === 'salio' ? 'Marcó SALIDA en ACCESS. No recibe más leads hoy.' : estadoDe(r) === 'sinAccess' ? 'Hoy no ha marcado INGRESO en ACCESS, o su nombre no coincide con el del ERP. No recibe leads.' : undefined}>{e.label}</span>
                        {r.bloqueado_efectividad && <span className="ml-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700" title={`Tiene ${r.vencidos} gestionable(s) con más de ${datos?.efectividad?.plazo_horas ?? 8} h y lleva ${r.venta_subida} de ${r.meta_venta} ingresos Jotform requeridos hoy.`}>Meta Jot pendiente</span>}
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${lleno ? 'bg-red-400' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} /></div>
                          <span className="tabular-nums">{r.gestionables} / {r.gestionables_tope}</span>
                        </div>
                      </td>
                      <td className="p-2 text-center tabular-nums font-bold text-slate-800">{r.total_asignados ?? r.asignados}{r.sin_conteo > 0 && <span className="ml-1 text-xs font-normal text-slate-500" title="Leads de FB Messenger - Novo: se entregan en orden pero no cuentan en leads, ATC ni gestionables">+{r.sin_conteo} Messenger</span>}</td>
                      <td className="p-2 text-center tabular-nums">{r.asignados_bot ?? '—'}</td>
                      <td className={`p-2 text-center tabular-nums ${r.asignados_humano ? 'font-semibold text-violet-700' : ''}`}>{r.asignados_humano ?? '—'}</td>
                      <td className="p-2 text-center tabular-nums font-semibold text-emerald-700">{r.gestionables ?? '—'}</td>
                      <td className="p-2 text-center tabular-nums" title="ATC informativo; no bloquea el reparto">{r.atc ?? '—'}</td>
                      <td className={`p-2 text-center tabular-nums ${r.bloqueado_efectividad ? 'font-bold text-orange-700' : ''}`}>
                        {r.vencidos ?? '—'}
                      </td>
                      <td className="p-2 text-center tabular-nums font-semibold text-blue-700">{r.venta_subida ?? '—'}{r.meta_venta != null && <span className="ml-1 text-xs font-normal">/ {r.meta_venta}</span>}</td>
                      <td className={`p-2 text-center tabular-nums ${r.dup_reg_rmk ? 'font-semibold text-amber-700' : ''}`}>{r.dup_reg_rmk ?? '—'}</td>
                      <td className="p-2 text-center tabular-nums">{lleno ? 'Cupo lleno' : r.disponibles}</td>
                      <td className="p-2 tabular-nums">{horaEc(r.ultima_asignacion)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">"Cupo gestionable" = gestionables actuales frente al tope del 45% de los leads permitidos. ATC es informativo y no bloquea. "Ingresos Jot" muestra los registros de hoy en envios_ventas frente a la meta del 50%; pueden corresponder a leads recibidos en días anteriores.</p>
          </div>
        )}
      </div>
    </div>
  );
}
