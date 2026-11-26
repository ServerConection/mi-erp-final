// src/pages/BotAtc.jsx
// Bot ATC (piloto): en los chats nuevos pregunta "ventas o servicio al cliente",
// escucha la conversación y al final la IA recomienda: mover a ATC/SOPORTE o dejar en
// Contacto nuevo. En modo "recomendar" no toca Bitrix; en "aplicar" sí.
// Solo ADMINISTRADOR (el backend lo valida).
import { useCallback, useEffect, useState } from "react";
import { Headset, Save, Loader2, RefreshCw, Smartphone, X, MessagesSquare } from "lucide-react";

const API = import.meta.env.VITE_API_URL;
const BASE = `${API}/api/bot-atc`;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}`, "Content-Type": "application/json" });

async function pedir(url, opciones = {}) {
  const r = await fetch(url, { headers: headers(), ...opciones });
  let j = {};
  try { j = await r.json(); } catch { /* sin JSON */ }
  if (!r.ok || j.success === false) throw new Error(j.error || `Error ${r.status}`);
  return j.data;
}
const fecha = (f) => (f ? new Date(f).toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" }) : "—");

const ESTADOS = {
  ATC: { nombre: "Servicio al cliente", color: "bg-amber-100 text-amber-800" },
  VENTAS: { nombre: "Ventas", color: "bg-green-100 text-green-700" },
  NO_DETECTADO: { nombre: "No detectado", color: "bg-slate-200 text-slate-700" },
  PENDIENTE: { nombre: "Escuchando…", color: "bg-blue-100 text-blue-700" },
  EVALUANDO: { nombre: "Evaluando…", color: "bg-blue-100 text-blue-700" },
  POR_ENVIAR: { nombre: "Por escribir", color: "bg-slate-100 text-slate-600" },
  ERROR: { nombre: "Error", color: "bg-red-100 text-red-700" },
};
const ETAPA_ESTADO = { hecho: "✅ Movido", pendiente: "⏳ Moviendo", sin_deal: "Sin deal", omitido: "No se movió", error: "❌ Error" };

const PESTANAS = [
  { id: "chats", nombre: "Chats filtrados" },
  { id: "mensajes", nombre: "Mensajes y etapas" },
  { id: "lineas", nombre: "Líneas WhatsApp" },
];

export default function BotAtc() {
  const [pestana, setPestana] = useState("chats");
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2">
          <Headset className="w-7 h-7 text-amber-600" /> Bot ATC <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">piloto</span>
        </h1>
        <p className="text-sm text-slate-500">
          En cada chat nuevo pregunta si es ventas o servicio al cliente y escucha la conversación. Al final la IA lee todo lo que dijo el cliente (no solo el 1 o 2) y recomienda si el deal va a ATC/SOPORTE o se queda en Contacto nuevo.
        </p>
      </div>
      <div className="flex gap-1 border-b mb-4">
        {PESTANAS.map((p) => (
          <button key={p.id} onClick={() => setPestana(p.id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${pestana === p.id ? "border-amber-600 text-amber-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {p.nombre}
          </button>
        ))}
      </div>
      {pestana === "chats" && <PestanaChats />}
      {pestana === "mensajes" && <PestanaMensajes />}
      {pestana === "lineas" && <PestanaLineas />}
    </div>
  );
}

// ─── Chats filtrados ─────────────────────────────────────────────────────────
function PestanaChats() {
  const [dias, setDias] = useState(7);
  const [estado, setEstado] = useState("");
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [viendo, setViendo] = useState(null);

  const cargar = useCallback(async () => {
    setError("");
    try { setDatos(await pedir(`${BASE}/sesiones?dias=${dias}${estado ? `&estado=${estado}` : ""}`)); }
    catch (e) { setError(e.message); }
  }, [dias, estado]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { const t = setInterval(cargar, 30000); return () => clearInterval(t); }, [cargar]);

  const r = datos?.resumen || {};
  const pct = (n) => (r.total ? `${Math.round((n / r.total) * 100)}%` : "—");
  return (
    <div className="space-y-4">
      {error && <Mensaje tipo="error" texto={error} />}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi titulo="Chats nuevos" valor={r.total ?? "—"} />
        <Kpi titulo="→ Mover a ATC/SOPORTE" valor={r.ATC ?? "—"} extra={pct(r.ATC || 0)} color="text-amber-700" />
        <Kpi titulo="→ Dejar en Contacto nuevo" valor={r.VENTAS ?? "—"} extra={pct(r.VENTAS || 0)} color="text-green-700" />
        <Kpi titulo="No respondió" valor={r.NO_DETECTADO ?? "—"} extra={pct(r.NO_DETECTADO || 0)} color="text-slate-600" />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="border rounded-lg px-2 py-1">
          {[1, 7, 15, 30].map((d) => <option key={d} value={d}>Últimos {d} día{d > 1 ? "s" : ""}</option>)}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="border rounded-lg px-2 py-1">
          <option value="">Todos</option>
          {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
        </select>
        <button onClick={cargar} className="flex items-center gap-1 px-3 py-1 rounded-lg border hover:bg-slate-50"><RefreshCw className="w-4 h-4" /> Actualizar</button>
      </div>
      {!datos && !error ? <Cargando /> : (
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left py-2 px-3">Fecha</th>
                <th className="text-left py-2 px-3">Cliente</th>
                <th className="text-left py-2 px-3">Línea</th>
                <th className="text-left py-2 px-3">Recomendación</th>
                <th className="text-left py-2 px-3">Lo que dijo el cliente</th>
                <th className="text-left py-2 px-3">Bitrix</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {(datos?.sesiones || []).length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-slate-400">Aún no hay chats en este periodo. Activa el bot en una línea.</td></tr>
              )}
              {(datos?.sesiones || []).map((s) => (
                <tr key={s.id} className="border-t align-top">
                  <td className="py-2 px-3 text-xs text-slate-500 whitespace-nowrap">{fecha(s.inicio)}{s.segundos != null && <div>en {s.segundos} s</div>}</td>
                  <td className="py-2 px-3"><div className="font-medium text-slate-800">{s.cliente || "—"}</div><div className="text-xs text-slate-400">{s.telefono || "sin teléfono"}</div></td>
                  <td className="py-2 px-3 text-xs">{s.linea || "—"}{s.origen === "saliente" && <div className="text-[11px] font-semibold text-amber-700">Contacto nuevo · bot escribió primero</div>}</td>
                  <td className="py-2 px-3">
                    {s.recomendacion ? (
                      <div className={`text-xs font-bold ${s.recomendacion === "ATC/SOPORTE" ? "text-amber-700" : "text-green-700"}`}>
                        {s.recomendacion === "ATC/SOPORTE" ? "Mover a ATC/SOPORTE" : "Dejar en Contacto nuevo"}
                      </div>
                    ) : <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ESTADOS[s.estado]?.color || ""}`}>{ESTADOS[s.estado]?.nombre || s.estado}</span>}
                    {s.estado === "NO_DETECTADO" && <div className="text-[11px] text-slate-500">No respondió</div>}
                    {s.motivo && <div className="text-[11px] text-slate-500 mt-0.5">{s.motivo}</div>}
                    {s.confianza && <div className="text-[11px] text-slate-400">confianza {s.confianza}</div>}
                  </td>
                  <td className="py-2 px-3 text-xs text-slate-600 max-w-xs">{(s.textos || []).map((t, i) => <div key={i}>• {t.texto}</div>)}{!(s.textos || []).length && "—"}</td>
                  <td className="py-2 px-3 text-xs">
                    {s.bitrix_id ? <div className="font-semibold">#{s.bitrix_id}</div> : null}
                    {s.etapa_anterior && <div className="text-slate-500">{s.etapa_anterior}</div>}
                    {ETAPA_ESTADO[s.etapa_estado] && <div title={s.etapa_detalle || ""}>{ETAPA_ESTADO[s.etapa_estado]} {s.etapa_objetivo}</div>}
                    {!s.bitrix_id && s.etapa_detalle && <div className="text-[11px] text-slate-400">{s.etapa_detalle}</div>}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button onClick={() => setViendo(s)} className="text-amber-700 hover:underline text-xs flex items-center gap-1"><MessagesSquare className="w-4 h-4" /> Ver chat</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {viendo && <VerChat sesion={viendo} onCerrar={() => setViendo(null)} />}
    </div>
  );
}

function VerChat({ sesion, onCerrar }) {
  const [msgs, setMsgs] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { pedir(`${BASE}/sesiones/${sesion.id}/mensajes`).then(setMsgs).catch((e) => setError(e.message)); }, [sesion.id]);
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3 border-b">
          <div className="font-semibold text-slate-800">{sesion.cliente || sesion.telefono} <span className="text-xs text-slate-400">· {sesion.linea}</span></div>
          <button onClick={onCerrar}><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="p-3 overflow-y-auto space-y-2 bg-slate-50 flex-1">
          {error && <Mensaje tipo="error" texto={error} />}
          {!msgs && !error && <Cargando />}
          {(msgs || []).map((m, i) => (
            <div key={i} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${m.direction === "out" ? (m.bot_atc ? "bg-amber-100" : "bg-green-100") : "bg-white border"}`}>
                {m.content || `[${m.type}]`}
                <div className="text-[10px] text-slate-400 mt-1">{m.direction === "out" ? (m.bot_atc ? "Bot ATC" : m.bot_vendedor ? "Bot vendedor" : "Asesor") : "Cliente"} · {fecha(m.timestamp)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Mensajes y etapas ───────────────────────────────────────────────────────
const CAMPOS = [
  { k: "pregunta", t: "Pregunta en chats que llegan a líneas con el bot ATC encendido", filas: 5 },
  { k: "plantilla", t: "Plantilla de servicio al cliente (canales de ATC)", filas: 14 },
];

function PestanaMensajes() {
  const [cfg, setCfg] = useState(null);
  const [etapas, setEtapas] = useState([]);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [lineas, setLineas] = useState([]);
  useEffect(() => {
    pedir(`${BASE}/config`).then(setCfg).catch((e) => setError(e.message));
    pedir(`${BASE}/etapas`).then(setEtapas).catch(() => setEtapas([]));
    pedir(`${BASE}/lineas`).then((l) => setLineas((l || []).filter((x) => x.status !== "deleted"))).catch(() => {});
  }, []);
  const cambiar = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const guardar = async () => {
    setGuardando(true); setError(""); setAviso("");
    try { await pedir(`${BASE}/config`, { method: "PUT", body: JSON.stringify(cfg) }); setAviso("Guardado. El bot lo usa en menos de 30 segundos."); }
    catch (e) { setError(e.message); }
    setGuardando(false);
  };
  if (!cfg) return error ? <Mensaje tipo="error" texto={error} /> : <Cargando />;

  const SelectEtapa = ({ k, vacio }) => (
    <select value={cfg[k] || ""} onChange={(e) => cambiar(k, e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm w-full">
      <option value="">{vacio}</option>
      {cfg[k] && !etapas.some((e) => e.nombre === cfg[k]) && <option value={cfg[k]}>{cfg[k]} (no encontrada en Bitrix)</option>}
      {etapas.map((e) => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
    </select>
  );
  return (
    <div className="space-y-4">
      {error && <Mensaje tipo="error" texto={error} />}
      {aviso && <Mensaje tipo="ok" texto={aviso} />}
      <div className="bg-white rounded-xl border p-4 grid md:grid-cols-2 gap-4 text-sm">
        <label className="block md:col-span-2"><span className="font-semibold text-slate-700">Modo</span>
          <select value={cfg.modo} onChange={(e) => cambiar("modo", e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm w-full">
            <option value="recomendar">Solo recomendar (no envía plantilla, no mueve etapas, el reparto sigue normal)</option>
            <option value="aplicar">Aplicar (si es ATC: envía la plantilla y mueve el deal; el reparto espera al bot)</option>
          </select></label>
        <label className="block"><span className="font-semibold text-slate-700">Etapa ATC en Bitrix</span>
          <SelectEtapa k="etapa_atc" vacio="No mover el deal" /></label>
        <label className="block"><span className="font-semibold text-slate-700">Segundos que escucha antes de recomendar</span>
          <input type="number" min={30} max={600} value={cfg.segundos} onChange={(e) => cambiar("segundos", e.target.value)} className="border rounded-lg px-2 py-1.5 w-full" /></label>
        <label className="block"><span className="font-semibold text-slate-700">Chat nuevo si estuvo callado (horas)</span>
          <input type="number" min={1} max={720} value={cfg.reinicio_horas} onChange={(e) => cambiar("reinicio_horas", e.target.value)} className="border rounded-lg px-2 py-1.5 w-full" /></label>
        <p className="md:col-span-2 text-xs text-slate-500">Mientras escucha, el bot vendedor o el asesor atienden normal. En modo Aplicar solo se mueven deals de NOVONET de los últimos 3 días que sigan en Contacto nuevo.</p>
      </div>
      <div className="bg-white rounded-xl border-2 border-amber-200 p-4 space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-bold text-slate-800">Atención a Contacto nuevo (el bot escribe primero)</div>
            <div className="text-xs text-slate-500">A cada deal nuevo de NOVONET en Contacto nuevo le escribe desde la línea elegida. La IA analiza lo que responde (no solo 1 o 2): si no es intención de compra le envía la plantilla de ATC; si es venta, le confirma que un asesor lo contacta.</div>
          </div>
          <button onClick={() => cambiar("saliente_activo", cfg.saliente_activo === "true" ? "false" : "true")}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${cfg.saliente_activo === "true" ? "bg-amber-600" : "bg-slate-300"}`}>
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${cfg.saliente_activo === "true" ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>
        {cfg.saliente_estado?.valor && <div className="text-xs bg-slate-50 border rounded-lg px-2 py-1"><b>Estado en WABOT:</b> {cfg.saliente_estado.valor} <span className="text-slate-400">({fecha(cfg.saliente_estado.actualizado_en)})</span></div>}
        <div className="grid md:grid-cols-2 gap-3">
          <label className="block"><span className="font-semibold text-slate-700">Línea desde la que escribe</span>
            <select value={cfg.saliente_linea || ""} onChange={(e) => cambiar("saliente_linea", e.target.value)} className="border rounded-lg px-2 py-1.5 w-full">
              <option value="">Elige una línea…</option>
              {lineas.map((l) => <option key={l.id} value={l.id}>{l.name} {l.phone_number ? `(${l.phone_number})` : ""} {l.status === "connected" ? "" : `· ${l.status}`}</option>)}
            </select></label>
          <label className="block"><span className="font-semibold text-slate-700">Horario</span>
            <div className="flex items-center gap-1">
              <input type="time" value={cfg.saliente_inicio || ""} onChange={(e) => cambiar("saliente_inicio", e.target.value)} className="border rounded-lg px-2 py-1" />
              <span className="text-slate-400">a</span>
              <input type="time" value={cfg.saliente_fin || ""} onChange={(e) => cambiar("saliente_fin", e.target.value)} className="border rounded-lg px-2 py-1" />
            </div></label>
          <label className="block"><span className="font-semibold text-slate-700">Segundos entre mensajes (cuida la línea)</span>
            <input type="number" min={20} max={600} value={cfg.saliente_intervalo || ""} onChange={(e) => cambiar("saliente_intervalo", e.target.value)} className="border rounded-lg px-2 py-1.5 w-full" /></label>
          <label className="block"><span className="font-semibold text-slate-700">Máximo de mensajes por día</span>
            <input type="number" min={1} max={5000} value={cfg.saliente_max || ""} onChange={(e) => cambiar("saliente_max", e.target.value)} className="border rounded-lg px-2 py-1.5 w-full" /></label>
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.saliente_plantilla !== "false"} onChange={(e) => cambiar("saliente_plantilla", e.target.checked ? "true" : "false")} />
          Enviar la plantilla de ATC cuando no sea intención de compra</label>
        <label className="block"><span className="font-semibold text-slate-700">Primer mensaje al cliente</span>
          <textarea rows={3} value={cfg.saliente_pregunta || ""} onChange={(e) => cambiar("saliente_pregunta", e.target.value)} className="w-full border rounded-lg p-2 font-mono" /></label>
        <label className="block"><span className="font-semibold text-slate-700">Respuesta si es venta</span>
          <textarea rows={2} value={cfg.confirmacion_ventas || ""} onChange={(e) => cambiar("confirmacion_ventas", e.target.value)} className="w-full border rounded-lg p-2 font-mono" /></label>
      </div>
      {CAMPOS.map((c) => (
        <div key={c.k} className="bg-white rounded-xl border p-4">
          <div className="font-semibold text-slate-700 text-sm mb-1">{c.t}</div>
          <textarea rows={c.filas} value={cfg[c.k] || ""} onChange={(e) => cambiar(c.k, e.target.value)}
            className="w-full border rounded-lg p-2 text-sm font-mono" />
        </div>
      ))}
      <button onClick={guardar} disabled={guardando}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white font-semibold disabled:opacity-50">
        {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
      </button>
    </div>
  );
}

// ─── Líneas ──────────────────────────────────────────────────────────────────
function PestanaLineas() {
  const [lineas, setLineas] = useState(null);
  const [error, setError] = useState("");
  const [cambiando, setCambiando] = useState(null);

  const cargar = useCallback(async () => {
    setError("");
    try { setLineas(await pedir(`${BASE}/lineas`)); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (l, cambios) => {
    setCambiando(l.id); setError("");
    try {
      await pedir(`${BASE}/lineas/${l.id}`, { method: "PUT", body: JSON.stringify({ activo: l.bot_activo, horario_inicio: l.horario_inicio || "", horario_fin: l.horario_fin || "", ...cambios }) });
      await cargar();
    } catch (e) { setError(e.message); }
    setCambiando(null);
  };
  const alternar = (l) => {
    if (!l.bot_activo && !window.confirm(`¿Activar el bot ATC en "${l.name}"? En cada chat nuevo enviará la pregunta "ventas o servicio al cliente" y luego recomendará la etapa.`)) return;
    guardar(l, { activo: !l.bot_activo });
  };

  return (
    <div className="space-y-4">
      {error && <Mensaje tipo="error" texto={error} />}
      <div className="bg-white rounded-xl border p-4 text-sm text-slate-600">
        Activa el bot ATC en las líneas del piloto. Se aplica en menos de 30 segundos. Solo actúa en <b>chats nuevos</b> (sin mensajes en las últimas horas configuradas); los chats en curso no se tocan.
        Envía la pregunta inicial y luego escucha: el bot vendedor (si la línea lo tiene) o el asesor siguen atendiendo. Horario vacío = todo el día.
      </div>
      {!lineas && !error ? <Cargando /> : (
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left py-2 px-3">Línea</th>
                <th className="text-left py-2 px-3">Estado WhatsApp</th>
                <th className="text-left py-2 px-3">Horario</th>
                <th className="text-left py-2 px-3">Último cambio</th>
                <th className="text-right py-2 px-3">Bot ATC</th>
              </tr>
            </thead>
            <tbody>
              {(lineas || []).map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2 font-medium text-slate-800"><Smartphone className="w-4 h-4 text-green-600 shrink-0" /> {l.name}</div>
                    <div className="text-xs text-slate-400">{l.phone_number || "sin número"}</div>
                  </td>
                  <td className="py-2 px-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${l.status === "connected" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {l.status === "connected" ? "Conectada" : (l.status || "desconectada")}
                    </span>
                  </td>
                  <td className="py-2 px-3"><Horario linea={l} deshabilitado={cambiando === l.id} onGuardar={(ini, fin) => guardar(l, { horario_inicio: ini, horario_fin: fin })} /></td>
                  <td className="py-2 px-3 text-xs text-slate-500">{l.actualizado_por ? `${l.actualizado_por} · ${fecha(l.actualizado_en)}` : "—"}</td>
                  <td className="py-2 px-3 text-right">
                    <button onClick={() => alternar(l)} disabled={cambiando === l.id}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${l.bot_activo ? "bg-amber-600" : "bg-slate-300"} disabled:opacity-50`}
                      title={l.bot_activo ? "Desactivar" : "Activar"}>
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${l.bot_activo ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Horario({ linea, deshabilitado, onGuardar }) {
  const [ini, setIni] = useState(linea.horario_inicio || "");
  const [fin, setFin] = useState(linea.horario_fin || "");
  const cambiado = ini !== (linea.horario_inicio || "") || fin !== (linea.horario_fin || "");
  return (
    <div className="flex items-center gap-1 text-xs">
      <input type="time" value={ini} onChange={(e) => setIni(e.target.value)} className="border rounded px-1 py-0.5" />
      <span className="text-slate-400">a</span>
      <input type="time" value={fin} onChange={(e) => setFin(e.target.value)} className="border rounded px-1 py-0.5" />
      {cambiado && <button disabled={deshabilitado} onClick={() => onGuardar(ini, fin)} className="ml-1 px-2 py-0.5 rounded bg-amber-600 text-white font-semibold disabled:opacity-50">Guardar</button>}
      {!ini && !fin && !cambiado && <span className="text-slate-400 ml-1">todo el día</span>}
    </div>
  );
}

function Kpi({ titulo, valor, extra, color = "text-slate-800" }) {
  return (
    <div className="bg-white rounded-xl border p-3">
      <div className="text-xs text-slate-500">{titulo}</div>
      <div className={`text-2xl font-extrabold ${color}`}>{valor} {extra && <span className="text-sm font-semibold text-slate-400">{extra}</span>}</div>
    </div>
  );
}
function Cargando() {
  return <div className="flex items-center gap-2 text-slate-500 text-sm p-6"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>;
}
function Mensaje({ tipo, texto }) {
  return <div className={`text-sm rounded-lg px-3 py-2 ${tipo === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"}`}>{texto}</div>;
}
